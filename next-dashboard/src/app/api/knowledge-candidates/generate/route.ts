/**
 * POST /api/knowledge-candidates/generate
 * データロード → 集計 → good/bad判定 → AI候補生成 → Knowledge_Candidates へ追記
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadDataFromSheets, loadSheetData } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';
import {
  aggregateCombinations,
  judgeCombinations,
  selectTopCandidates,
  findScriptForCreative,
  findManuscriptForVersion,
  buildCandidateGenerationPrompt,
  parseAIResponse,
  buildCandidateRows,
  CandidateGenerationInput,
  JudgedCombo,
  SkippedNoEvidenceItem,
} from '@/lib/knowledgeCandidates';
import { appendCandidates, hasRunForDate, recordLearningRun } from '@/lib/candidateSheets';
import { buildKnowledgeText } from '@/lib/aiContextHelpers';

// Cron ジョブ用: Vercel Cron Secret で認証（手動実行も許可）
const CRON_SECRET = process.env.CRON_SECRET || '';

export const maxDuration = 60; // 最大60秒

/** Vercel Cron は GET で呼び出すため、GET ハンドラを用意 */
export async function GET(request: NextRequest) {
  // Cron Secret 認証
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: '認証エラー' }, { status: 401 });
  }
  // POST ハンドラに委譲（force=false でバッチ実行）
  const fakeReq = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ manual: false }),
  });
  return POST(fakeReq);
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック（Cron Secret または手動実行用トークン）
    const authHeader = request.headers.get('authorization');
    const body = await request.json().catch(() => ({}));
    const isAuthorized =
      (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) ||
      body?.manual === true; // 手動実行を許可

    if (CRON_SECRET && !isAuthorized) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    // JST で今日の日付
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(Date.now() + jstOffset);
    const targetDate = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`;

    // 冪等性チェック: Cron（manual でない）のみ同日二重実行を防ぐ。手動は何度でも実行可。
    if (!body?.force && body?.manual !== true) {
      const alreadyRun = await hasRunForDate(targetDate);
      if (alreadyRun) {
        return NextResponse.json({
          message: `${targetDate} のバッチは既に実行済みです`,
          skipped: true,
        });
      }
    }

    const runId = `run_${targetDate}_${Date.now()}`;

    /** false のときは台本・原稿が無くても数値候補を採用（Vercel: KNOWLEDGE_REQUIRE_EVIDENCE=false） */
    const requireEvidence = process.env.KNOWLEDGE_REQUIRE_EVIDENCE !== 'false';

    // 1. データロード
    const rawData = await loadDataFromSheets();
    const processedData = processData(rawData);
    const creativeMaster = rawData.Creative_Master;
    const articleMaster = rawData.Article_Master;
    const knowledge = rawData.Knowledge;

    // 2. 集計（全商材対象）
    const combos = aggregateCombinations(processedData);
    const judged = judgeCombinations(combos);
    const { good, bad } = selectTopCandidates(judged, 10);
    const allCandidates = [...good, ...bad];

    if (allCandidates.length === 0) {
      await recordLearningRun(runId, targetDate, 0, 0, 0, '候補なし');
      return NextResponse.json({
        message:
          '候補となる組み合わせが見つかりませんでした（直近3日でCV≥2かつCPAが良化/悪化した記事×クリが無い可能性があります）',
        candidateCount: 0,
        stage: 'no_numeric',
        numericCandidateCount: 0,
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
      await recordLearningRun(runId, targetDate, 0, 0, 0, '台本・原稿のある候補なし');
      return NextResponse.json({
        message:
          requireEvidence
            ? `数値では好調/悪化の組み合わせが ${allCandidates.length} 件ありましたが、台本・原稿のどちらも Creative_Master / Article_Master で取れなかったため、ナレッジ候補は追加していません。下の一覧を確認するか、マスタの商材名・クリエID・記事名を揃えてください。一時的に KNOWLEDGE_REQUIRE_EVIDENCE=false で数値のみ生成も可能です。`
            : '候補の抽出に失敗しました（内部エラー）',
        candidateCount: 0,
        stage: 'no_evidence',
        numericCandidateCount: allCandidates.length,
        skippedEvidenceCount: allCandidates.length,
        skippedNoEvidenceDetail,
        requireEvidence,
      });
    }

    // 4. AI 候補生成
    const apiKey = process.env.GEMINI_API_KEY;
    let aiResults: ReturnType<typeof parseAIResponse> = [];

    if (apiKey) {
      try {
        const prompt = buildCandidateGenerationPrompt(aiInputs);
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

    // 7. Learning_Runs 記録
    await recordLearningRun(
      runId,
      targetDate,
      candidateRows.length,
      goodCount,
      badCount,
      ''
    );

    return NextResponse.json({
      message: `${candidateRows.length}件の候補を生成しました${
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
    });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] generate エラー:', error.message);
    return NextResponse.json(
      { error: `候補生成に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }
}
