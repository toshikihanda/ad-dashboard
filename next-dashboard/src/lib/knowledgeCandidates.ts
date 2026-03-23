/**
 * ナレッジ候補生成ロジック
 * version_name × creative_value の組み合わせで集計し、
 * CPA の良化/悪化を検知してナレッジ候補を生成する純関数群。
 */

import { ProcessedRow, safeDivide } from './dataProcessor';

// --- 型定義 ---

export interface AggregatedCombo {
  version_name: string;
  creative_value: string;
  // current (直近7日)
  cost_current: number;
  cv_current: number;
  clicks_current: number;
  cpa_current: number;
  cvr_current: number;
  // baseline (直近30日から直近7日を除いた期間)
  cost_baseline: number;
  cv_baseline: number;
  clicks_baseline: number;
  cpa_baseline: number;
  cvr_baseline: number;
}

export type JudgeType = 'good' | 'bad' | 'hold';
export type Confidence = 'low' | 'normal';

export interface KnowledgeCandidate {
  id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  judge_type: JudgeType;
  confidence: Confidence;
  version_name: string;
  creative: string;
  cpa_current: number;
  cpa_baseline: number;
  cpa_ratio: number;
  cv_current: number;
  cv_baseline: number;
  cvr_current: number;
  cvr_baseline: number;
  summary: string;
  hypothesis_good_points: string;
  hypothesis_bad_points: string;
  next_action: string;
  evidence_script_excerpt: string;
  evidence_article_excerpt: string;
  source_run_id: string;
  review_comment: string;
}

// --- 日付ヘルパー ---

function getJSTNow(): Date {
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + jstOffset);
}

function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBefore(days: number): Date {
  const now = getJSTNow();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - days);
  return now;
}

/** UUID v4 簡易生成 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- 集計ロジック ---

/**
 * ProcessedRow[] を version_name × creative_value で集計し、
 * current (直近7日) と baseline (8〜30日前) に分けて指標を算出する。
 * 対象は Beyond データのみ。
 */
export function aggregateCombinations(data: ProcessedRow[]): AggregatedCombo[] {
  const beyondData = data.filter(row => row.Media === 'Beyond');

  const now = getJSTNow();
  now.setHours(0, 0, 0, 0);

  const current7Start = daysBefore(7);
  const baseline30Start = daysBefore(30);

  // version_name × creative_value でグルーピング
  const groups = new Map<string, { current: ProcessedRow[]; baseline: ProcessedRow[] }>();

  for (const row of beyondData) {
    const vn = (row.version_name || '').trim();
    const cv = (row.creative_value || '').trim();
    if (!vn || !cv) continue;

    const key = `${vn}||${cv}`;
    if (!groups.has(key)) {
      groups.set(key, { current: [], baseline: [] });
    }
    const group = groups.get(key)!;

    const rowDateStr = formatDateStr(row.Date);
    const currentStartStr = formatDateStr(current7Start);
    const baselineStartStr = formatDateStr(baseline30Start);

    if (rowDateStr >= currentStartStr) {
      group.current.push(row);
    } else if (rowDateStr >= baselineStartStr && rowDateStr < currentStartStr) {
      group.baseline.push(row);
    }
  }

  const results: AggregatedCombo[] = [];

  for (const [key, group] of groups) {
    const [vn, cv] = key.split('||');

    const costCurrent = group.current.reduce((s, r) => s + r.Cost, 0);
    const cvCurrent = group.current.reduce((s, r) => s + r.CV, 0);
    const clicksCurrent = group.current.reduce((s, r) => s + r.Clicks, 0);

    const costBaseline = group.baseline.reduce((s, r) => s + r.Cost, 0);
    const cvBaseline = group.baseline.reduce((s, r) => s + r.CV, 0);
    const clicksBaseline = group.baseline.reduce((s, r) => s + r.Clicks, 0);

    results.push({
      version_name: vn,
      creative_value: cv,
      cost_current: costCurrent,
      cv_current: cvCurrent,
      clicks_current: clicksCurrent,
      cpa_current: safeDivide(costCurrent, cvCurrent),
      cvr_current: cvCurrent > 0 && clicksCurrent > 0 ? (cvCurrent / clicksCurrent) * 100 : 0,
      cost_baseline: costBaseline,
      cv_baseline: cvBaseline,
      clicks_baseline: clicksBaseline,
      cpa_baseline: safeDivide(costBaseline, cvBaseline),
      cvr_baseline: cvBaseline > 0 && clicksBaseline > 0 ? (cvBaseline / clicksBaseline) * 100 : 0,
    });
  }

  return results;
}

// --- 判定ロジック ---

export interface JudgedCombo extends AggregatedCombo {
  cpa_ratio: number;
  judge_type: JudgeType;
  confidence: Confidence;
}

/**
 * 集計済みデータに good/bad/hold 判定を付与する。
 * - good: CPA_ratio <= 0.80 (20%以上改善)
 * - bad:  CPA_ratio >= 1.20 (20%以上悪化)
 * - hold: それ以外 or baseline CPA=0
 * - CV_current >= 2 のみ候補対象
 * - CV_current == 2 は confidence=low
 */
export function judgeCombinations(combos: AggregatedCombo[]): JudgedCombo[] {
  const results: JudgedCombo[] = [];

  for (const combo of combos) {
    // CV_current >= 2 のみ対象
    if (combo.cv_current < 2) continue;

    // baseline CPA が 0 の場合は hold
    if (combo.cpa_baseline <= 0) {
      results.push({
        ...combo,
        cpa_ratio: 0,
        judge_type: 'hold',
        confidence: combo.cv_current === 2 ? 'low' : 'normal',
      });
      continue;
    }

    const cpaRatio = combo.cpa_current / combo.cpa_baseline;

    let judgeType: JudgeType = 'hold';
    if (cpaRatio <= 0.80) {
      judgeType = 'good';
    } else if (cpaRatio >= 1.20) {
      judgeType = 'bad';
    }

    results.push({
      ...combo,
      cpa_ratio: cpaRatio,
      judge_type: judgeType,
      confidence: combo.cv_current === 2 ? 'low' : 'normal',
    });
  }

  return results;
}

/**
 * good/bad の候補を上位N件ずつ抽出する。
 * good: CPA_ratio が小さい順（改善が大きい順）
 * bad:  CPA_ratio が大きい順（悪化が大きい順）
 */
export function selectTopCandidates(
  judged: JudgedCombo[],
  maxPerType: number = 10
): { good: JudgedCombo[]; bad: JudgedCombo[] } {
  const good = judged
    .filter(c => c.judge_type === 'good')
    .sort((a, b) => a.cpa_ratio - b.cpa_ratio)
    .slice(0, maxPerType);

  const bad = judged
    .filter(c => c.judge_type === 'bad')
    .sort((a, b) => b.cpa_ratio - a.cpa_ratio)
    .slice(0, maxPerType);

  return { good, bad };
}

// --- 証拠テキスト取得ヘルパー ---

function getCol(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/**
 * Creative_Master から台本テキストを取得する
 */
export function findScriptForCreative(
  creativeMaster: Record<string, string>[],
  creativeValue: string
): string {
  if (!creativeValue || !creativeMaster?.length) return '';

  const norm = creativeValue.toLowerCase().trim();

  for (const row of creativeMaster) {
    const dashboardName = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID', 'utm_creative').trim().toLowerCase();
    const fileName = getCol(row, 'クリエイティブ名', 'Creative Name', 'ファイル名').trim().toLowerCase();

    if ((dashboardName && (dashboardName === norm || dashboardName.includes(norm) || norm.includes(dashboardName))) ||
        (fileName && (fileName === norm || fileName.includes(norm) || norm.includes(fileName)))) {
      // 台本取得
      let script = getCol(row, '台本', 'Script');
      if (!script) {
        const keys = Object.keys(row);
        for (const k of keys) {
          const kNorm = k.trim().toLowerCase();
          if (kNorm.includes('台本') || kNorm.includes('script')) {
            script = (row[k] ?? '').trim();
            break;
          }
        }
      }
      if (!script) {
        // 長文列をフォールバック
        const keys = Object.keys(row);
        const longest = keys
          .map(k => ({ k, v: (row[k] ?? '').trim() }))
          .filter(x => x.v && x.v.length >= 30)
          .sort((a, b) => b.v.length - a.v.length)[0];
        script = longest?.v || '';
      }
      if (script) return script.slice(0, 2000);
    }
  }
  return '';
}

/**
 * Article_Master から原稿テキストを取得する（F列優先）
 */
export function findManuscriptForVersion(
  articleMaster: Record<string, string>[],
  versionName: string
): string {
  if (!versionName || !articleMaster?.length) return '';

  const norm = versionName.toLowerCase().trim();

  for (const row of articleMaster) {
    const dashboardName = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID').trim().toLowerCase();
    const articleName = getCol(row, '記事名', 'Article Name', 'Subject').trim().toLowerCase();

    if ((dashboardName && (dashboardName === norm || dashboardName.includes(norm) || norm.includes(dashboardName))) ||
        (articleName && (articleName === norm || articleName.includes(norm) || norm.includes(articleName)))) {
      // F列優先で原稿取得
      const keys = Object.keys(row);
      if (keys.length >= 6) {
        const fVal = (row[keys[5]] ?? '').trim();
        if (fVal) return fVal.slice(0, 2500);
      }
      const exact = getCol(row, '原稿', '現行', 'Manuscript', 'Content', '文字起こし', 'FV詳細分析');
      if (exact) return exact.slice(0, 2500);
    }
  }
  return '';
}

// --- AI 候補生成プロンプト構築 ---

export interface CandidateGenerationInput {
  combo: JudgedCombo;
  scriptExcerpt: string;
  articleExcerpt: string;
  existingKnowledge: string;
}

/**
 * AI に渡すプロンプトを構築する。
 * good/bad 両方の候補を一括で処理する。
 */
export function buildCandidateGenerationPrompt(
  inputs: CandidateGenerationInput[]
): string {
  const candidateBlocks = inputs.map((input, i) => {
    const { combo, scriptExcerpt, articleExcerpt } = input;
    const ratioPercent = Math.round((combo.cpa_ratio - 1) * 100);
    const direction = combo.judge_type === 'good' ? '改善' : '悪化';

    return `
### 候補 ${i + 1}: ${combo.version_name} × ${combo.creative_value} (${combo.judge_type})
- CPA current: ${Math.round(combo.cpa_current)}円 / baseline: ${Math.round(combo.cpa_baseline)}円 (${ratioPercent > 0 ? '+' : ''}${ratioPercent}% ${direction})
- CV current: ${combo.cv_current} / baseline: ${combo.cv_baseline}
- CVR current: ${combo.cvr_current.toFixed(2)}% / baseline: ${combo.cvr_baseline.toFixed(2)}%
- 確度: ${combo.confidence}

台本抜粋:
${scriptExcerpt ? scriptExcerpt.slice(0, 800) : '（台本データなし）'}

原稿抜粋:
${articleExcerpt ? articleExcerpt.slice(0, 800) : '（原稿データなし）'}
`;
  }).join('\n---\n');

  return `
あなたは広告運用のナレッジ管理AIです。
以下の記事×クリエイティブ組み合わせについて、数値差分・台本・原稿を踏まえてナレッジ候補を生成してください。

## 候補一覧
${candidateBlocks}

## 最重要ルール: ナレッジの抽象化
knowledge_text（ナレッジ本文）は **他の案件・商材にもそのまま応用できる汎用的な法則** として書いてください。
具体的な商材名・企業名・記事名・クリエイティブ名は書かず、「どんな構造・手法が効いているか」を抽象化してください。

### 悪い例（具体的すぎて他案件に使えない）
- 「アートネイチャーとの提携による信頼性の提示がCVR改善に効果的」
- 「Ver.3_61の記事でフック『努力がムダだった』が刺さっている」

### 良い例（抽象化されていて他案件にも応用可能）
- 「負の感情を揺さぶるフック + 権威性（大手提携・専門家監修等）の組み合わせはCVR改善に有効」
- 「ユーザーの過去の努力を否定するフックは共感を生みやすく、クリック率・CVRともに向上する傾向がある」

good_points / bad_points / next_actions も同様に、具体名は避けて構造・パターンとして記述してください。

## 出力ルール
- 必ず以下のJSON配列を返してください。Markdownコードブロックは不要です。
- 各候補に対して1つのオブジェクトを出力してください。
- good の場合は good_points を充実させ、bad の場合は bad_points を充実させてください。

## 出力形式（JSON配列）
[
  {
    "index": 1,
    "category": "カテゴリ名（例: クリエイティブ訴求、記事構成、ターゲティング等）",
    "subcategory": "サブカテゴリ名",
    "knowledge_text": "ナレッジ本文（他案件にも応用可能な汎用法則として1〜2文で）",
    "good_points": ["良い点1（構造・パターンとして）", "良い点2"],
    "bad_points": ["悪い点1（構造・パターンとして）", "悪い点2"],
    "next_actions": ["次のアクション1", "次のアクション2"],
    "confidence_reason": "確度の理由"
  }
]
`;
}

// --- AI応答パース ---

export interface AIGeneratedKnowledge {
  index: number;
  category: string;
  subcategory: string;
  knowledge_text: string;
  good_points: string[];
  bad_points: string[];
  next_actions: string[];
  confidence_reason: string;
}

export function parseAIResponse(text: string): AIGeneratedKnowledge[] {
  // JSON部分を抽出（```json ... ``` でラップされている場合にも対応）
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  // 配列の開始位置を探す
  const arrayStart = jsonStr.indexOf('[');
  const arrayEnd = jsonStr.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => ({
      index: item.index ?? 0,
      category: String(item.category || ''),
      subcategory: String(item.subcategory || ''),
      knowledge_text: String(item.knowledge_text || ''),
      good_points: Array.isArray(item.good_points) ? item.good_points.map(String) : [],
      bad_points: Array.isArray(item.bad_points) ? item.bad_points.map(String) : [],
      next_actions: Array.isArray(item.next_actions) ? item.next_actions.map(String) : [],
      confidence_reason: String(item.confidence_reason || ''),
    }));
  } catch {
    console.error('[KnowledgeCandidates] AI応答のJSONパースに失敗');
    return [];
  }
}

// --- 最終候補オブジェクト構築 ---

export function buildCandidateRows(
  combos: JudgedCombo[],
  aiResults: AIGeneratedKnowledge[],
  scriptExcerpts: Map<string, string>,
  articleExcerpts: Map<string, string>,
  runId: string
): KnowledgeCandidate[] {
  const now = getJSTNow();
  const createdAt = `${formatDateStr(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return combos.map((combo, i) => {
    const ai = aiResults[i] || {
      category: '',
      subcategory: '',
      knowledge_text: '',
      good_points: [],
      bad_points: [],
      next_actions: [],
      confidence_reason: '',
    };

    const key = `${combo.version_name}||${combo.creative_value}`;
    return {
      id: generateId(),
      created_at: createdAt,
      status: 'pending' as const,
      judge_type: combo.judge_type,
      confidence: combo.confidence,
      version_name: combo.version_name,
      creative: combo.creative_value,
      cpa_current: Math.round(combo.cpa_current),
      cpa_baseline: Math.round(combo.cpa_baseline),
      cpa_ratio: Math.round(combo.cpa_ratio * 100) / 100,
      cv_current: combo.cv_current,
      cv_baseline: combo.cv_baseline,
      cvr_current: Math.round(combo.cvr_current * 100) / 100,
      cvr_baseline: Math.round(combo.cvr_baseline * 100) / 100,
      summary: ai.knowledge_text || `${combo.version_name} × ${combo.creative_value}: CPA ${combo.judge_type === 'good' ? '改善' : '悪化'}`,
      hypothesis_good_points: ai.good_points.join(' / '),
      hypothesis_bad_points: ai.bad_points.join(' / '),
      next_action: ai.next_actions.join(' / '),
      evidence_script_excerpt: (scriptExcerpts.get(key) || '').slice(0, 500),
      evidence_article_excerpt: (articleExcerpts.get(key) || '').slice(0, 500),
      source_run_id: runId,
      review_comment: '',
    };
  });
}

// --- シート用ヘッダーとデータ変換 ---

export const CANDIDATE_SHEET_HEADERS = [
  'id', 'created_at', 'status', 'judge_type', 'confidence',
  'version_name', 'creative', 'cpa_current', 'cpa_baseline', 'cpa_ratio',
  'cv_current', 'cv_baseline', 'cvr_current', 'cvr_baseline',
  'summary', 'hypothesis_good_points', 'hypothesis_bad_points',
  'next_action', 'evidence_script_excerpt', 'evidence_article_excerpt',
  'source_run_id', 'review_comment',
];

export function candidateToRow(c: KnowledgeCandidate): string[] {
  return CANDIDATE_SHEET_HEADERS.map(h => String((c as any)[h] ?? ''));
}

export function rowToCandidate(row: Record<string, string>): KnowledgeCandidate {
  return {
    id: row['id'] || '',
    created_at: row['created_at'] || '',
    status: (row['status'] as any) || 'pending',
    judge_type: (row['judge_type'] as any) || 'hold',
    confidence: (row['confidence'] as any) || 'normal',
    version_name: row['version_name'] || '',
    creative: row['creative'] || '',
    cpa_current: parseFloat(row['cpa_current'] || '0'),
    cpa_baseline: parseFloat(row['cpa_baseline'] || '0'),
    cpa_ratio: parseFloat(row['cpa_ratio'] || '0'),
    cv_current: parseInt(row['cv_current'] || '0'),
    cv_baseline: parseInt(row['cv_baseline'] || '0'),
    cvr_current: parseFloat(row['cvr_current'] || '0'),
    cvr_baseline: parseFloat(row['cvr_baseline'] || '0'),
    summary: row['summary'] || '',
    hypothesis_good_points: row['hypothesis_good_points'] || '',
    hypothesis_bad_points: row['hypothesis_bad_points'] || '',
    next_action: row['next_action'] || '',
    evidence_script_excerpt: row['evidence_script_excerpt'] || '',
    evidence_article_excerpt: row['evidence_article_excerpt'] || '',
    source_run_id: row['source_run_id'] || '',
    review_comment: row['review_comment'] || '',
  };
}
