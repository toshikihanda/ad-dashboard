/**
 * POST /api/knowledge-candidates/generate
 * データロード → ユーザー選択期間で集計 → CV≥2 の組み合わせ → AI候補生成 → Knowledge_Candidates へ追記
 * （自動Cronは無効。手動実行のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';
import {
  resolvePeriodRangeJST,
  aggregateCombinationsInPeriod,
  judgeCombinationsForPeriod,
  selectTopCandidatesForPeriod,
  findScriptForCreative,
  findManuscriptForVersion,
  buildCandidateGenerationPrompt,
  parseAIResponse,
  buildCandidateRows,
  CandidateGenerationInput,
  JudgedCombo,
  SkippedNoEvidenceItem,
} from '@/lib/knowledgeCandidates';
import { appendCandidates, recordLearningRun } from '@/lib/candidateSheets';
import { buildKnowledgeText } from '@/lib/aiContextHelpers';

const CRON_SECRET = process.env.CRON_SECRET || '';

const MAX_PERIOD_CANDIDATES = 15;

export const maxDuration = 60; // 最大60秒

/** 自動Cronは廃止。旧Cronが叩いても 410 を返す */
export async function GET() {
  return NextResponse.json(
    {
      message:
        'ナレッジ候補の自動生成（Cron）は無効です。ダッシュボード「ナレッジ候補」タブから期間を選んで手動実行してください。',
      deprecated: true,
    },
    { status: 410 }
  );
}

export async function POST(request: NextRequest) {
  let targetDate = '';
  const learnLabel = '[manual]';

  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json().catch(() => ({}));

    if (body?.manual !== true) {
      return NextResponse.json(
        {
          error:
            'ナレッジ候補生成は手動のみです。ダッシュボード「ナレッジ候補」タブで期間を選び、手動生成を実行してください。',
        },
        { status: 400 }
      );
    }

    const isAuthorized =
      (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) || body?.manual === true;

    if (CRON_SECRET && !isAuthorized) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(Date.now() + jstOffset);
    targetDate = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`;

    const runId = `run_${targetDate}_${Date.now()}`;

    /** false のときは台本・原稿が無くても数値候補を採用（Vercel: KNOWLEDGE_REQUIRE_EVIDENCE=false） */
    const requireEvidence = process.env.KNOWLEDGE_REQUIRE_EVIDENCE !== 'false';

    const preset = (body?.preset as '7d' | '30d' | 'custom' | undefined) || '7d';
    let periodRange: { startStr: string; endStr: string; label: string };
    try {
      if (preset === 'custom') {
        periodRange = resolvePeriodRangeJST({
          preset: 'custom',
          startDate: body?.startDate,
          endDate: body?.endDate,
        });
      } else if (preset === '30d') {
        periodRange = resolvePeriodRangeJST({ preset: '30d' });
      } else {
        periodRange = resolvePeriodRangeJST({ preset: '7d' });
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
    }

    const allowedRaw = process.env.KNOWLEDGE_CANDIDATE_ALLOWED_CAMPAIGNS || '';
    const allowedSubstrings = allowedRaw
      .split(/[,，]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    const aggOpts = allowedSubstrings.length ? { allowedCampaignSubstrings: allowedSubstrings } : undefined;

    // 1. データロード
    const rawData = await loadDataFromSheets();
    const processedData = processData(rawData);
    const creativeMaster = rawData.Creative_Master;
    const articleMaster = rawData.Article_Master;
    const knowledge = rawData.Knowledge;

    // 2. 選択期間で集計し、期間内 CV 合計が 2 以上の記事×クリのみ対象
    const combos = aggregateCombinationsInPeriod(
      processedData,
      periodRange.startStr,
      periodRange.endStr,
      aggOpts
    );
    const judged = judgeCombinationsForPeriod(combos);
    const { good, bad } = selectTopCandidatesForPeriod(judged, MAX_PERIOD_CANDIDATES);
    const allCandidates = [...good, ...bad];

    if (allCandidates.length === 0) {
      await recordLearningRun(
        runId,
        targetDate,
        0,
        0,
        0,
        `${learnLabel} 候補なし（${periodRange.label}・CV合計≥2の記事×クリは0件）`
      );
      return NextResponse.json({
        message: `候補となる組み合わせが見つかりませんでした（${periodRange.label}において、記事×クリエイティブでCV合計が2以上のデータがありません）。`,
        candidateCount: 0,
        stage: 'no_numeric',
        numericCandidateCount: 0,
        period: periodRange,
      });
    }

    // 3. 証拠テキスト取得 → requireEvidence 時のみ台本も原稿も無い候補を除外
    const scriptExcerpts = new Map<string, string>();
    const articleExcerpts = new Map<string, string>();
    const aiInputs: CandidateGenerationInput[] = [];
    const qualifiedCandidates: JudgedCombo[] = [];
    const skippedNoEvidenceDetail: SkippedNoEvidenceItem[] = [];

    const existingKnowledge = buildKnowledgeText(knowledge);

    for (const combo of allCandidates) {
      const key = `${combo.version_name}||${combo.creative_value}`;
      const script = findScriptForCreative(
        creativeMaster,
        combo.creative_value,
        combo.campaign_name,
        rawData.Master_Setting
      );
      const article = findManuscriptForVersion(
        articleMaster,
        combo.version_name,
        combo.campaign_name,
        rawData.Master_Setting
      );

      if (requireEvidence && !script && !article) {
        console.log(`[KnowledgeCandidates] 台本・原稿ともに無し → スキップ: ${combo.campaign_name} / ${combo.version_name} × ${combo.creative_value}`);
        skippedNoEvidenceDetail.push({
          version_name: combo.version_name,
          creative_value: combo.creative_value,
          campaign_name: combo.campaign_name,
          judge_type: combo.judge_type,
          cpa_ratio: combo.cpa_ratio,
          cpa_current: combo.cpa_current,
          cpa_baseline: combo.cpa_baseline,
          cv_current: combo.cv_current,
        });
        continue;
      }

      scriptExcerpts.set(key, script);
      articleExcerpts.set(key, article);
      qualifiedCandidates.push(combo);

      aiInputs.push({
        combo,
        scriptExcerpt: script,
        articleExcerpt: article,
        existingKnowledge,
      });
    }

    if (qualifiedCandidates.length === 0) {
      await recordLearningRun(
        runId,
        targetDate,
        0,
        0,
        0,
        requireEvidence
          ? `${learnLabel} ${periodRange.label} ナレッジ候補0件（台本・原稿が Creative_Master / Article_Master で取得できず。CV≥2の数値候補は ${allCandidates.length} 件あったが証拠必須のためスキップ）`
          : `${learnLabel} 候補抽出失敗（内部エラー: requireEvidence=false かつ qualified=0）`
      );
      return NextResponse.json({
        message:
          requireEvidence
            ? `${periodRange.label}において、CV合計が2以上の組み合わせは ${allCandidates.length} 件ありましたが、台本・原稿のどちらも Creative_Master / Article_Master で取れなかったため、ナレッジ候補は追加していません。マスタの商材名・クリエID・記事名を揃えてください。一時的に KNOWLEDGE_REQUIRE_EVIDENCE=false で数値のみ生成も可能です。`
            : '候補の抽出に失敗しました（内部エラー）',
        candidateCount: 0,
        stage: 'no_evidence',
        numericCandidateCount: allCandidates.length,
        skippedEvidenceCount: allCandidates.length,
        skippedNoEvidenceDetail,
        requireEvidence,
        period: periodRange,
      });
    }

    // 4. AI 候補生成
    const apiKey = process.env.GEMINI_API_KEY;
    let aiResults: ReturnType<typeof parseAIResponse> = [];

    if (apiKey) {
      try {
        const prompt = buildCandidateGenerationPrompt(aiInputs, { periodLabel: periodRange.label });
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        aiResults = parseAIResponse(text);
      } catch (e) {
        console.error('[KnowledgeCandidates] AI生成エラー:', (e as Error).message);
      }
    }

    // 5. 候補オブジェクト構築（台本・原稿のある候補のみ）
    const candidateRows = buildCandidateRows(
      qualifiedCandidates,
      aiResults,
      scriptExcerpts,
      articleExcerpts,
      runId
    );

    // 6. シートに追記
    await appendCandidates(candidateRows);

    const goodCount = qualifiedCandidates.filter(c => c.judge_type === 'good').length;
    const badCount = qualifiedCandidates.filter(c => c.judge_type === 'bad').length;

    // 7. Learning_Runs 記録（証拠なしで一部スキップした場合は errors に注記）
    const skippedN = requireEvidence ? allCandidates.length - qualifiedCandidates.length : 0;
    const runNote = `${learnLabel} ${periodRange.label} 候補を追加${
      skippedN > 0 ? `（証拠なしで ${skippedN} 件はスキップ）` : ''
    }`;
    await recordLearningRun(runId, targetDate, candidateRows.length, goodCount, badCount, runNote);

    return NextResponse.json({
      message: `${candidateRows.length}件の候補を生成しました（${periodRange.label}）${
        requireEvidence && allCandidates.length > qualifiedCandidates.length
          ? `（台本・原稿が無い${allCandidates.length - qualifiedCandidates.length}件はスキップ）`
          : ''
      }`,
      runId,
      candidateCount: candidateRows.length,
      goodCount,
      badCount,
      skippedNoEvidence: requireEvidence ? allCandidates.length - qualifiedCandidates.length : 0,
      skippedNoEvidenceDetail:
        requireEvidence && skippedNoEvidenceDetail.length > 0 ? skippedNoEvidenceDetail : undefined,
      stage: 'ok',
      numericCandidateCount: allCandidates.length,
      qualifiedCount: qualifiedCandidates.length,
      requireEvidence,
      period: periodRange,
    });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] generate エラー:', error.message);
    try {
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstNow = new Date(Date.now() + jstOffset);
      const td =
        targetDate ||
        `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`;
      const label = '[manual]';
      const msg = String(error?.message ?? error).slice(0, 450);
      await recordLearningRun(
        `run_err_${td}_${Date.now()}`,
        td,
        0,
        0,
        0,
        `${label} エラーで中断（${msg}）`
      );
    } catch (e) {
      console.error('[KnowledgeCandidates] Learning_Runs 記録も失敗:', (e as Error).message);
    }
    return NextResponse.json(
      { error: `候補生成に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }
}
