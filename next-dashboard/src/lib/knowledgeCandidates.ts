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
  campaign_name: string; // 支配的な Campaign_Name（改善B）
  // current (直近3日)
  cost_current: number;
  cv_current: number;
  clicks_current: number;
  cpa_current: number;
  cvr_current: number;
  // baseline (4〜33日前)
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
  campaign_name: string;      // 改善B
  review_reason_code: string; // 改善C
  review_reason_text: string; // 改善C
}

// --- 改善C: 採用/不採用の理由コード定義 ---

export const REVIEW_REASON_CODES = {
  approved: [
    { code: 'accurate_insight', label: '分析が正確' },
    { code: 'actionable', label: '実行可能な提案' },
    { code: 'novel_finding', label: '新しい発見' },
    { code: 'matches_experience', label: '経験と一致' },
  ],
  rejected: [
    { code: 'wrong_matching', label: '商材/台本の紐付けが違う' },
    { code: 'low_data_quality', label: 'データ量・品質が不十分' },
    { code: 'obvious_insight', label: '当たり前の内容' },
    { code: 'not_actionable', label: '実行不可能な提案' },
    { code: 'wrong_analysis', label: '分析が的外れ' },
    { code: 'time_decay', label: '時間経過による自然減' },
  ],
} as const;

export type ReviewReasonCode =
  | typeof REVIEW_REASON_CODES.approved[number]['code']
  | typeof REVIEW_REASON_CODES.rejected[number]['code'];

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

export interface AggregateCombinationsOptions {
  /**
   * 指定時は、Campaign_Name にいずれかの部分文字列が含まれる Beyond 行だけを集計する。
   * 例: ['SAC'] で URARA など SAC 以外の管理用案件名を除外（Vercel: KNOWLEDGE_CANDIDATE_ALLOWED_CAMPAIGNS=SAC）
   */
  allowedCampaignSubstrings?: string[];
}

/**
 * ProcessedRow[] を version_name × creative_value で集計し、
 * current (直近3日) と baseline (4〜33日前) に分けて指標を算出する。
 * 対象は Beyond データのみ。Article_Master / Creative_Master はここでは使わない（数値のみ）。
 */
export function aggregateCombinations(
  data: ProcessedRow[],
  options?: AggregateCombinationsOptions
): AggregatedCombo[] {
  let beyondData = data.filter(row => row.Media === 'Beyond');

  const allowed = options?.allowedCampaignSubstrings?.map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed?.length) {
    beyondData = beyondData.filter(row => {
      const cn = (row.Campaign_Name || '').trim().toLowerCase();
      if (!cn) return false;
      return allowed.some(tok => cn.includes(tok));
    });
  }

  // 改善A: current=直近3日、baseline=4〜33日前
  const currentStart = daysBefore(3);
  const baselineStart = daysBefore(33);

  // version_name × creative_value でグルーピング（改善B: campaignCounts を追加）
  const groups = new Map<string, {
    current: ProcessedRow[];
    baseline: ProcessedRow[];
    campaignCounts: Map<string, number>;
  }>();

  for (const row of beyondData) {
    const vn = (row.version_name || '').trim();
    const cv = (row.creative_value || '').trim();
    if (!vn || !cv) continue;

    const key = `${vn}||${cv}`;
    if (!groups.has(key)) {
      groups.set(key, { current: [], baseline: [], campaignCounts: new Map() });
    }
    const group = groups.get(key)!;

    // 改善B: Campaign_Name をカウント
    const cn = (row.Campaign_Name || '').trim();
    if (cn) {
      group.campaignCounts.set(cn, (group.campaignCounts.get(cn) || 0) + 1);
    }

    const rowDateStr = formatDateStr(row.Date);
    const currentStartStr = formatDateStr(currentStart);
    const baselineStartStr = formatDateStr(baselineStart);

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

    // 改善B: 最頻の Campaign_Name を取得
    let dominantCampaign = '';
    let maxCount = 0;
    for (const [name, count] of group.campaignCounts) {
      if (count > maxCount) {
        dominantCampaign = name;
        maxCount = count;
      }
    }

    results.push({
      version_name: vn,
      creative_value: cv,
      campaign_name: dominantCampaign,
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

/** カスタム期間の最大日数（不正に長い範囲を防ぐ） */
export const KNOWLEDGE_CUSTOM_PERIOD_MAX_DAYS = 120;

/**
 * JST 基準で集計開始・終了日（YYYY-MM-DD）を解決する。
 * - preset 7d: 今日を含む過去7日
 * - preset 30d: 今日を含む過去30日
 * - custom: startDate / endDate（YYYY-MM-DD）必須
 */
export function resolvePeriodRangeJST(input: {
  preset?: '7d' | '30d' | 'custom';
  startDate?: string;
  endDate?: string;
}): { startStr: string; endStr: string; label: string } {
  const today = formatDateStr(getJSTNow());
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  if (input.preset === 'custom') {
    const s = (input.startDate || '').trim();
    const e = (input.endDate || '').trim();
    if (!iso.test(s) || !iso.test(e)) {
      throw new Error('カスタム期間は startDate / endDate を YYYY-MM-DD で指定してください');
    }
    if (s > e) {
      throw new Error('開始日は終了日以前である必要があります');
    }
    const startMs = Date.parse(s + 'T00:00:00');
    const endMs = Date.parse(e + 'T00:00:00');
    const days = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
    if (days > KNOWLEDGE_CUSTOM_PERIOD_MAX_DAYS) {
      throw new Error(`カスタム期間は最大${KNOWLEDGE_CUSTOM_PERIOD_MAX_DAYS}日までです`);
    }
    return {
      startStr: s,
      endStr: e,
      label: `指定期間（${s}〜${e}）`,
    };
  }

  if (input.preset === '30d') {
    const start = daysBefore(29);
    const startStr = formatDateStr(start);
    return {
      startStr,
      endStr: today,
      label: `直近30日（${startStr}〜${today}）`,
    };
  }

  // デフォルト: 7d（今日を含む7日 = 6日前〜今日）
  const start7 = daysBefore(6);
  const start7Str = formatDateStr(start7);
  return {
    startStr: start7Str,
    endStr: today,
    label: `直近7日（${start7Str}〜${today}）`,
  };
}

/**
 * 指定した日付範囲（YYYY-MM-DD、両端含む）だけを集計する。
 * baseline 系は 0（期間モードでは baseline 比較をしない）。
 */
export function aggregateCombinationsInPeriod(
  data: ProcessedRow[],
  startStr: string,
  endStr: string,
  options?: AggregateCombinationsOptions
): AggregatedCombo[] {
  let beyondData = data.filter(row => row.Media === 'Beyond');

  const allowed = options?.allowedCampaignSubstrings?.map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed?.length) {
    beyondData = beyondData.filter(row => {
      const cn = (row.Campaign_Name || '').trim().toLowerCase();
      if (!cn) return false;
      return allowed.some(tok => cn.includes(tok));
    });
  }

  const groups = new Map<
    string,
    {
      rows: ProcessedRow[];
      campaignCounts: Map<string, number>;
    }
  >();

  for (const row of beyondData) {
    const vn = (row.version_name || '').trim();
    const cv = (row.creative_value || '').trim();
    if (!vn || !cv) continue;

    const rowDateStr = formatDateStr(row.Date);
    if (rowDateStr < startStr || rowDateStr > endStr) continue;

    const key = `${vn}||${cv}`;
    if (!groups.has(key)) {
      groups.set(key, { rows: [], campaignCounts: new Map() });
    }
    const group = groups.get(key)!;

    const cn = (row.Campaign_Name || '').trim();
    if (cn) {
      group.campaignCounts.set(cn, (group.campaignCounts.get(cn) || 0) + 1);
    }
    group.rows.push(row);
  }

  const results: AggregatedCombo[] = [];

  for (const [key, group] of groups) {
    const [vn, cv] = key.split('||');

    const cost = group.rows.reduce((s, r) => s + r.Cost, 0);
    const cvSum = group.rows.reduce((s, r) => s + r.CV, 0);
    const clicks = group.rows.reduce((s, r) => s + r.Clicks, 0);

    let dominantCampaign = '';
    let maxCount = 0;
    for (const [name, count] of group.campaignCounts) {
      if (count > maxCount) {
        dominantCampaign = name;
        maxCount = count;
      }
    }

    results.push({
      version_name: vn,
      creative_value: cv,
      campaign_name: dominantCampaign,
      cost_current: cost,
      cv_current: cvSum,
      clicks_current: clicks,
      cpa_current: safeDivide(cost, cvSum),
      cvr_current: cvSum > 0 && clicks > 0 ? (cvSum / clicks) * 100 : 0,
      cost_baseline: 0,
      cv_baseline: 0,
      clicks_baseline: 0,
      cpa_baseline: 0,
      cvr_baseline: 0,
    });
  }

  return results;
}

/**
 * 期間集計モード: 選択期間内の CV 合計が 2 以上の組み合わせのみ候補とする（複数CV）。
 * baseline が無いため CPA 比較は行わず、ナレッジ生成用に judge_type=good として扱う。
 */
export function judgeCombinationsForPeriod(combos: AggregatedCombo[]): JudgedCombo[] {
  const results: JudgedCombo[] = [];

  for (const combo of combos) {
    if (combo.cv_current < 2) continue;

    results.push({
      ...combo,
      cpa_ratio: 1,
      judge_type: 'good',
      confidence: combo.cv_current === 2 ? 'low' : 'normal',
    });
  }

  return results;
}

/** 期間モード: CV 多い順で上位 N 件（good/bad 分割なし） */
export function selectTopCandidatesForPeriod(
  judged: JudgedCombo[],
  maxTotal: number = 15
): { good: JudgedCombo[]; bad: JudgedCombo[] } {
  const sorted = [...judged].sort((a, b) => b.cv_current - a.cv_current);
  return {
    good: sorted.slice(0, maxTotal),
    bad: [],
  };
}

// --- 判定ロジック ---

export interface JudgedCombo extends AggregatedCombo {
  cpa_ratio: number;
  judge_type: JudgeType;
  confidence: Confidence;
}

/** 証拠不足でスキップした組み合わせ（generate API → UI 表示用） */
export interface SkippedNoEvidenceItem {
  version_name: string;
  creative_value: string;
  campaign_name: string;
  judge_type: JudgeType;
  cpa_ratio: number;
  cpa_current: number;
  cpa_baseline: number;
  cv_current: number;
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
    if (combo.cv_current < 2) continue;

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
 * Master_Setting の同一行から、商材名照合に使う別名を集める。
 * （管理用案件名=SAC_成果 と Creative_Master の 商材名=URARA… のズレを吸収）
 */
export function buildCampaignAliasesFromMaster(
  masterSetting: Record<string, string>[],
  campaignName: string
): string[] {
  const target = (campaignName || '').trim();
  if (!target || !masterSetting?.length) return [];

  const tl = target.toLowerCase();
  const out = new Set<string>();
  out.add(tl);

  const tryRow = (row: Record<string, string>) => {
    const proj = getCol(row, '管理用案件名', 'Project').trim();
    if (proj) out.add(proj.toLowerCase());
    [getCol(row, 'Meta名'), getCol(row, 'Beyond名')].forEach(s => {
      const x = s.trim();
      if (x) out.add(x.toLowerCase());
    });
  };

  for (const row of masterSetting) {
    const proj = getCol(row, '管理用案件名', '').trim();
    if (proj.toLowerCase() === tl) {
      tryRow(row);
      return [...out];
    }
  }
  for (const row of masterSetting) {
    const proj = getCol(row, '管理用案件名', '').trim();
    if (!proj) continue;
    const pl = proj.toLowerCase();
    if (pl === tl || pl.includes(tl) || tl.includes(pl)) {
      tryRow(row);
      return [...out];
    }
  }
  return [...out];
}

/**
 * 部分一致の最短長（「5」など1文字での誤マッチ防止）。
 * 3桁のみのIDは完全一致のみ（上の d===n）で拾う。219g 等は 4 文字以上で includes 可。
 */
const MIN_SUBSTR_LEN = 4;

function creativeMatchScore(dashboardName: string, fileName: string, norm: string): number {
  const d = dashboardName.trim().toLowerCase();
  const f = fileName.trim().toLowerCase();
  const n = norm.trim().toLowerCase();
  if (!n) return 0;

  if (d && d === n) return 100;
  if (f && f === n) return 100;

  if (d && (d.endsWith(n) || n.endsWith(d)) && Math.min(d.length, n.length) >= MIN_SUBSTR_LEN) return 90;

  if (d && d.includes(n) && n.length >= MIN_SUBSTR_LEN) return 80;
  if (n.includes(d) && d.length >= MIN_SUBSTR_LEN) return 75;
  if (f && f.includes(n) && n.length >= MIN_SUBSTR_LEN) return 70;
  if (n.includes(f) && f.length >= MIN_SUBSTR_LEN) return 65;

  return 0;
}

function versionMatchScore(dashboardName: string, articleName: string, norm: string): number {
  const d = dashboardName.trim().toLowerCase();
  const a = articleName.trim().toLowerCase();
  const n = norm.trim().toLowerCase();
  if (!n) return 0;

  if (d && d === n) return 100;
  if (a && a === n) return 100;
  if (d && d.includes(n) && n.length >= 4) return 85;
  if (n.includes(d) && d.length >= 4) return 80;
  if (a && a.includes(n) && n.length >= 4) return 75;
  if (n.includes(a) && a.length >= 4) return 70;
  return 0;
}

function productMatchesCampaign(
  productName: string,
  campNorm: string,
  aliases: string[]
): boolean {
  const pn = (productName || '').trim().toLowerCase();
  if (!pn) return false;
  const checks = [...new Set([campNorm, ...aliases].filter(Boolean).map(x => x.trim().toLowerCase()))];
  for (const c of checks) {
    if (!c) continue;
    if (pn === c || pn.includes(c) || c.includes(pn)) return true;
  }
  return false;
}

/**
 * Creative_Master から台本テキストを取得する。
 * 商材が特定できるときは Master_Setting 別名で商材名と突き合わせ、一致しない行は採用しない（別案件の台本を返さない）。
 */
export function findScriptForCreative(
  creativeMaster: Record<string, string>[],
  creativeValue: string,
  campaignName?: string,
  masterSetting?: Record<string, string>[]
): string {
  if (!creativeValue || !creativeMaster?.length) return '';

  const norm = creativeValue.toLowerCase().trim();
  const campNorm = (campaignName || '').toLowerCase().trim();
  const aliases =
    masterSetting?.length && campNorm ? buildCampaignAliasesFromMaster(masterSetting, campaignName || '') : [];
  const requireCampaign = !!campNorm;

  type Scored = { row: Record<string, string>; score: number; campaignMatch: boolean };
  const scored: Scored[] = [];

  for (const row of creativeMaster) {
    const dashboardName = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID', 'utm_creative');
    const fileName = getCol(row, 'クリエイティブ名', 'Creative Name', 'ファイル名');
    const score = creativeMatchScore(dashboardName, fileName, norm);
    if (score <= 0) continue;

    const productName = getCol(row, '商材名', 'Project', 'Campaign', '商材');
    const campaignMatch =
      !requireCampaign || productMatchesCampaign(productName, campNorm, aliases);

    scored.push({ row, score, campaignMatch });
  }

  if (scored.length === 0) return '';

  let pool = scored;
  if (requireCampaign) {
    const ok = pool.filter(p => p.campaignMatch);
    if (ok.length > 0) pool = ok;
    else return '';
  } else {
    pool = pool.filter(p => p.score >= 80);
    if (pool.length === 0) return '';
  }

  pool.sort((a, b) => b.score - a.score);
  const row = pool[0].row;

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
    const keys = Object.keys(row);
    const longest = keys
      .map(k => ({ k, v: (row[k] ?? '').trim() }))
      .filter(x => x.v && x.v.length >= 30)
      .sort((a, b) => b.v.length - a.v.length)[0];
    script = longest?.v || '';
  }
  return script ? script.slice(0, 2000) : '';
}

/**
 * Article_Master から原稿テキストを取得する（F列優先）。
 */
export function findManuscriptForVersion(
  articleMaster: Record<string, string>[],
  versionName: string,
  campaignName?: string,
  masterSetting?: Record<string, string>[]
): string {
  if (!versionName || !articleMaster?.length) return '';

  const norm = versionName.toLowerCase().trim();
  const campNorm = (campaignName || '').toLowerCase().trim();
  const aliases =
    masterSetting?.length && campNorm ? buildCampaignAliasesFromMaster(masterSetting, campaignName || '') : [];
  const requireCampaign = !!campNorm;

  type Scored = { row: Record<string, string>; score: number; campaignMatch: boolean };
  const scored: Scored[] = [];

  for (const row of articleMaster) {
    const dashboardName = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID');
    const articleName = getCol(row, '記事名', 'Article Name', 'Subject');
    const score = versionMatchScore(dashboardName, articleName, norm);
    if (score <= 0) continue;

    const productName = getCol(row, '商材名', 'Project', 'Campaign', '商材');
    const campaignMatch =
      !requireCampaign || productMatchesCampaign(productName, campNorm, aliases);

    scored.push({ row, score, campaignMatch });
  }

  if (scored.length === 0) return '';

  let pool = scored;
  if (requireCampaign) {
    const ok = pool.filter(p => p.campaignMatch);
    if (ok.length > 0) pool = ok;
    else return '';
  } else {
    pool = pool.filter(p => p.score >= 80);
    if (pool.length === 0) return '';
  }

  pool.sort((a, b) => b.score - a.score);
  const row = pool[0].row;

  const keys = Object.keys(row);
  if (keys.length >= 6) {
    const fVal = (row[keys[5]] ?? '').trim();
    if (fVal) return fVal.slice(0, 2500);
  }
  const exact = getCol(row, '原稿', '現行', 'Manuscript', 'Content', '文字起こし', 'FV詳細分析');
  if (exact) return exact.slice(0, 2500);
  return '';
}

// --- AI 候補生成プロンプト構築 ---

export interface CandidateGenerationInput {
  combo: JudgedCombo;
  scriptExcerpt: string;
  articleExcerpt: string;
  existingKnowledge: string;
}

export interface CandidateGenerationPromptOptions {
  /** 期間集計モード（baseline 比較なし）のときラベルを渡す */
  periodLabel?: string;
}

/**
 * AI に渡すプロンプトを構築する。バグ修正: existingKnowledge をプロンプトに注入。
 */
export function buildCandidateGenerationPrompt(
  inputs: CandidateGenerationInput[],
  promptOptions?: CandidateGenerationPromptOptions
): string {
  // バグ修正: existingKnowledge を全 input で共通なので最初の1つから取得
  const existingKnowledge = inputs[0]?.existingKnowledge || '';
  const periodLabel = promptOptions?.periodLabel;

  const candidateBlocks = inputs.map((input, i) => {
    const { combo, scriptExcerpt, articleExcerpt } = input;

    if (periodLabel) {
      return `
### 候補 ${i + 1}: ${combo.version_name} × ${combo.creative_value}（期間内実績）
- 集計期間: ${periodLabel}
- 出稿金額: ${Math.round(combo.cost_current)}円 / CV（期間合計）: ${combo.cv_current} / 商品LP遷移: ${combo.clicks_current}
- CPA: ${Math.round(combo.cpa_current)}円 / CVR: ${combo.cvr_current.toFixed(2)}%
- 確度: ${combo.confidence}
- 抽出条件: 上記期間において CV が 2 以上の記事×クリエイティブの組み合わせです。台本・原稿と数値を照らし、汎用的なナレッジを生成してください。

台本抜粋:
${scriptExcerpt ? scriptExcerpt.slice(0, 800) : '（台本データなし）'}

原稿抜粋:
${articleExcerpt ? articleExcerpt.slice(0, 800) : '（原稿データなし）'}
`;
    }

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

  const modeNote = periodLabel
    ? `\n## 集計モード\nユーザーが選択した期間内の実績のみを用いています（過去ベースラインとのCPA比較は行っていません）。\n`
    : '';

  return `
あなたは広告運用のナレッジ管理AIです。
以下の記事×クリエイティブ組み合わせについて、数値${periodLabel ? '（期間内）' : '差分'}・台本・原稿を踏まえてナレッジ候補を生成してください。
${modeNote}
## 既存ナレッジ（重複しない新しい知見を生成すること）
${existingKnowledge ? existingKnowledge.slice(0, 3000) : '（まだナレッジがありません）'}

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
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
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

/**
 * 期間集計で商材が空だった場合、同一 version×creative の Beyond 行を全データから走査し、
 * 最初に見つかった Campaign_Name を補完する（スプレッドシートで期間外には商材が入っているケース向け）。
 */
export function inferCampaignNameForCombo(
  versionName: string,
  creativeValue: string,
  data: ProcessedRow[]
): string {
  const vn = versionName.trim();
  const cv = creativeValue.trim();
  for (const row of data) {
    if (row.Media !== 'Beyond') continue;
    if ((row.version_name || '').trim() !== vn) continue;
    if ((row.creative_value || '').trim() !== cv) continue;
    const cn = (row.Campaign_Name || '').trim();
    if (cn) return cn;
  }
  return '';
}

/**
 * Beyond 行の beyond_page_name と Master_Setting の「Beyond名」（部分一致）で突合し、
 * 「管理用案件名」を返す。dataProcessor の findProjectByBeyondKeyword と同じ考え方。
 * 集計で支配 Campaign_Name が空でも、ページ名とマスタが取れていれば商材を復元できる。
 */
export function inferCampaignNameFromMasterSetting(
  versionName: string,
  creativeValue: string,
  data: ProcessedRow[],
  masterSetting: Record<string, string>[]
): string {
  if (!masterSetting?.length) return '';
  const vn = versionName.trim();
  const cv = creativeValue.trim();
  if (!vn || !cv) return '';

  for (const row of data) {
    if (row.Media !== 'Beyond') continue;
    if ((row.version_name || '').trim() !== vn) continue;
    if ((row.creative_value || '').trim() !== cv) continue;
    const bpn = (row.beyond_page_name || '').trim();
    if (!bpn) continue;

    for (const mrow of masterSetting) {
      const proj = getCol(mrow, '管理用案件名', 'Project').trim();
      const beyondKw = getCol(mrow, 'Beyond名').trim();
      if (!proj || !beyondKw) continue;
      if (bpn.includes(beyondKw)) return proj;
    }
  }
  return '';
}

export function buildCandidateRows(
  combos: JudgedCombo[],
  aiResults: AIGeneratedKnowledge[],
  scriptExcerpts: Map<string, string>,
  articleExcerpts: Map<string, string>,
  runId: string,
  processedData: ProcessedRow[],
  masterSetting?: Record<string, string>[]
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
    const campaignResolved =
      (combo.campaign_name && combo.campaign_name.trim()) ||
      inferCampaignNameForCombo(combo.version_name, combo.creative_value, processedData) ||
      inferCampaignNameFromMasterSetting(
        combo.version_name,
        combo.creative_value,
        processedData,
        masterSetting || []
      ) ||
      '';
    return {
      id: generateId(),
      created_at: createdAt,
      status: 'pending' as const,
      judge_type: combo.judge_type,
      confidence: combo.confidence,
      version_name: combo.version_name,
      creative: combo.creative_value,
      campaign_name: campaignResolved,
      cpa_current: Math.round(combo.cpa_current),
      cpa_baseline: Math.round(combo.cpa_baseline),
      cpa_ratio: Math.round(combo.cpa_ratio * 100) / 100,
      cv_current: combo.cv_current,
      cv_baseline: combo.cv_baseline,
      cvr_current: Math.round(combo.cvr_current * 100) / 100,
      cvr_baseline: Math.round(combo.cvr_baseline * 100) / 100,
      summary:
        ai.knowledge_text ||
        (combo.cpa_baseline <= 0 && combo.cv_baseline <= 0
          ? `${combo.version_name} × ${combo.creative_value}: 期間内CV${combo.cv_current}（複数CV）`
          : `${combo.version_name} × ${combo.creative_value}: CPA ${combo.judge_type === 'good' ? '改善' : '悪化'}`),
      hypothesis_good_points: ai.good_points.join(' / '),
      hypothesis_bad_points: ai.bad_points.join(' / '),
      next_action: ai.next_actions.join(' / '),
      evidence_script_excerpt: (scriptExcerpts.get(key) || '').slice(0, 500),
      evidence_article_excerpt: (articleExcerpts.get(key) || '').slice(0, 500),
      source_run_id: runId,
      review_comment: '',
      review_reason_code: '',
      review_reason_text: '',
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
  'campaign_name',        // 改善B（末尾追加で既存データと互換）
  'review_reason_code',   // 改善C
  'review_reason_text',   // 改善C
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
    campaign_name: row['campaign_name'] || '',
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
    review_reason_code: row['review_reason_code'] || '',
    review_reason_text: row['review_reason_text'] || '',
  };
}
