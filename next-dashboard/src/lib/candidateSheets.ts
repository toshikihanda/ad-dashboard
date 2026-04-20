/**
 * Knowledge_Candidates シートへの読み書きユーティリティ。
 */

import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';
import { loadSheetData } from './googleSheets';
import {
  KnowledgeCandidate,
  CANDIDATE_SHEET_HEADERS,
  candidateToRow,
  rowToCandidate,
} from './knowledgeCandidates';

const MASTER_SHEET_ID = '14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU';
const CANDIDATES_SHEET_NAME = 'Knowledge_Candidates';
const KNOWLEDGE_SHEET_NAME = 'Knowledge';
const LEARNING_RUNS_SHEET_NAME = 'Learning_Runs';
const REVIEW_LOG_SHEET_NAME = 'Review_Reason_Log'; // 改善C

// --- 候補の読み込み ---

export async function loadCandidates(): Promise<KnowledgeCandidate[]> {
  const rows = await loadSheetData(CANDIDATES_SHEET_NAME, { cache: 'no-store' });
  return rows.map(rowToCandidate).filter(c => c.id);
}

export async function loadPendingCandidates(): Promise<KnowledgeCandidate[]> {
  const all = await loadCandidates();
  return all.filter(c => c.status === 'pending');
}

// --- 候補の追記 ---

export async function appendCandidates(candidates: KnowledgeCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  let hasHeader = false;
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: `${CANDIDATES_SHEET_NAME}!A1:A1`,
    });
    hasHeader = !!(existing.data.values && existing.data.values.length > 0);
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: CANDIDATES_SHEET_NAME } } }],
        },
      });
    } catch (e: any) {
      if (!e.message?.includes('already exists')) throw e;
    }
  }

  const rows: string[][] = [];
  if (!hasHeader) {
    rows.push(CANDIDATE_SHEET_HEADERS);
  }
  for (const c of candidates) {
    rows.push(candidateToRow(c));
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${CANDIDATES_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// --- 候補のステータス更新（改善C: reasonCode/reasonText 追加） ---

export async function updateCandidateStatus(
  candidateId: string,
  status: 'approved' | 'rejected',
  comment: string,
  reasonCode?: string,
  reasonText?: string,
  /** レビュー時に要約を上書き（採用前の編集内容を保存） */
  summaryOverride?: string
): Promise<KnowledgeCandidate | null> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${CANDIDATES_SHEET_NAME}!A:Z`,
  });

  const allRows = res.data.values || [];
  if (allRows.length < 2) return null;

  const headers = allRows[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const commentCol = headers.indexOf('review_comment');
  const reasonCodeCol = headers.indexOf('review_reason_code');
  const reasonTextCol = headers.indexOf('review_reason_text');
  const summaryCol = headers.indexOf('summary');

  if (idCol < 0 || statusCol < 0) return null;

  let targetRowIndex = -1;
  for (let i = 1; i < allRows.length; i++) {
    if (allRows[i][idCol] === candidateId) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex < 0) return null;

  const rowNum = targetRowIndex + 1;
  const statusCell = `${CANDIDATES_SHEET_NAME}!${columnLetter(statusCol)}${rowNum}`;
  const commentCell = `${CANDIDATES_SHEET_NAME}!${columnLetter(commentCol)}${rowNum}`;

  const data: any[] = [
    { range: statusCell, values: [[status]] },
    { range: commentCell, values: [[comment]] },
  ];

  // 改善C: reason 列が存在する場合のみ更新
  if (reasonCodeCol >= 0 && reasonCode) {
    data.push({
      range: `${CANDIDATES_SHEET_NAME}!${columnLetter(reasonCodeCol)}${rowNum}`,
      values: [[reasonCode]],
    });
  }
  if (reasonTextCol >= 0 && reasonText) {
    data.push({
      range: `${CANDIDATES_SHEET_NAME}!${columnLetter(reasonTextCol)}${rowNum}`,
      values: [[reasonText]],
    });
  }
  if (summaryCol >= 0 && summaryOverride != null && summaryOverride !== '') {
    data.push({
      range: `${CANDIDATES_SHEET_NAME}!${columnLetter(summaryCol)}${rowNum}`,
      values: [[summaryOverride]],
    });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: MASTER_SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  const updatedRow = allRows[targetRowIndex];
  updatedRow[statusCol] = status;
  if (commentCol >= 0) updatedRow[commentCol] = comment;
  if (reasonCodeCol >= 0 && reasonCode) updatedRow[reasonCodeCol] = reasonCode;
  if (reasonTextCol >= 0 && reasonText) updatedRow[reasonTextCol] = reasonText;
  if (summaryCol >= 0 && summaryOverride != null && summaryOverride !== '') {
    updatedRow[summaryCol] = summaryOverride;
  }

  const rowObj: Record<string, string> = {};
  headers.forEach((h: string, i: number) => {
    rowObj[h] = updatedRow[i] || '';
  });
  return rowToCandidate(rowObj);
}

// --- 改善C: レビュー理由ログの書き込み ---

const REVIEW_LOG_HEADERS = [
  'id', 'created_at', 'candidate_id', 'decision',
  'reason_code', 'reason_text',
  'category', 'subcategory',
  'creative', 'version_name', 'campaign_name',
  'cpa_ratio', 'cv_current', 'confidence',
];

export async function appendReviewLog(
  candidate: KnowledgeCandidate,
  decision: 'approved' | 'rejected',
  reasonCode: string,
  reasonText: string
): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  let hasHeader = false;
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: `${REVIEW_LOG_SHEET_NAME}!A1:A1`,
    });
    hasHeader = !!(existing.data.values && existing.data.values.length > 0);
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: REVIEW_LOG_SHEET_NAME } } }],
        },
      });
    } catch (e: any) {
      if (!e.message?.includes('already exists')) throw e;
    }
  }

  const jstOffset = 9 * 60 * 60 * 1000;
  const now = new Date(Date.now() + jstOffset);
  const createdAt = now.toISOString().replace('T', ' ').slice(0, 19);
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const category = candidate.judge_type === 'good' ? '良化パターン' : '悪化パターン';
  const subcategory = `${candidate.version_name} × ${candidate.creative}`;

  const rows: string[][] = [];
  if (!hasHeader) {
    rows.push(REVIEW_LOG_HEADERS);
  }
  rows.push([
    logId,
    createdAt,
    candidate.id,
    decision,
    reasonCode,
    reasonText,
    category,
    subcategory,
    candidate.creative,
    candidate.version_name,
    candidate.campaign_name || '',
    String(candidate.cpa_ratio),
    String(candidate.cv_current),
    candidate.confidence,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${REVIEW_LOG_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/** 採用時に Knowledge シートへ書くメタ（チャット・人間向けに整形） */
export type KnowledgeAppendMeta = {
  summary: string;
  rating: number;
  isAllProducts: boolean;
  /** 商材限定のときの商材名（全商材のときは空でも可） */
  productScopeName: string;
  genderTags: string[];
  ageTags: string[];
  presetTags: string[];
};

function buildKnowledgeSheetBody(candidate: KnowledgeCandidate, meta: KnowledgeAppendMeta): string {
  const lines: string[] = [];
  lines.push(
    `[メタ] 星${meta.rating}/5 | ${meta.isAllProducts ? '全商材' : `商材:${meta.productScopeName || candidate.campaign_name || '—'}`} | 性別:${meta.genderTags.join(',') || '—'} | 年齢:${meta.ageTags.join(',') || '—'} | ジャンル:${meta.presetTags.join(',') || '—'} [/メタ]`
  );
  lines.push('');
  lines.push(meta.summary);
  return lines.join('\n');
}

// --- Knowledge シートへの転記 ---

export async function appendToKnowledge(
  candidate: KnowledgeCandidate,
  meta?: KnowledgeAppendMeta
): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const m = meta;
  const productLabel = m?.isAllProducts
    ? '全商材'
    : m?.productScopeName || candidate.campaign_name || '商材未設定';
  const category = `${candidate.judge_type === 'good' ? '良化パターン' : '悪化パターン'}｜${productLabel}${m ? `｜★${m.rating}` : ''}`;
  const subcategory = `${candidate.version_name} × ${candidate.creative}`;
  const knowledgeText = m ? buildKnowledgeSheetBody(candidate, m) : candidate.summary;

  await sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${KNOWLEDGE_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[category, subcategory, knowledgeText]],
    },
  });
}

// --- Learning_Runs 記録 ---

export async function recordLearningRun(
  runId: string,
  targetDate: string,
  candidateCount: number,
  goodCount: number,
  badCount: number,
  errors: string
): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: `${LEARNING_RUNS_SHEET_NAME}!A1:A1`,
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: LEARNING_RUNS_SHEET_NAME } } }],
        },
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: MASTER_SHEET_ID,
        range: `${LEARNING_RUNS_SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [['run_id', 'run_at', 'target_date', 'candidate_count', 'good_count', 'bad_count', 'errors']],
        },
      });
    } catch (e: any) {
      if (!e.message?.includes('already exists')) throw e;
    }
  }

  const jstOffset = 9 * 60 * 60 * 1000;
  const now = new Date(Date.now() + jstOffset);
  const runAt = now.toISOString().replace('T', ' ').slice(0, 19);

  await sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${LEARNING_RUNS_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[runId, runAt, targetDate, candidateCount, goodCount, badCount, errors]],
    },
  });
}

/** Knowledge_Candidates シートのデータ行をすべて削除（1行目のヘッダーは残す） */
export async function clearAllCandidates(): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: MASTER_SHEET_ID,
      range: `${CANDIDATES_SHEET_NAME}!A2:ZZ50000`,
    });
  } catch (e: any) {
    if (e?.code === 400 || e?.message?.includes('Unable to parse')) {
      return;
    }
    throw e;
  }
}

// --- 重複チェック ---

export async function hasRunForDate(targetDate: string): Promise<boolean> {
  try {
    const rows = await loadSheetData(LEARNING_RUNS_SHEET_NAME, { cache: 'no-store' });
    return rows.some(r => r['target_date'] === targetDate);
  } catch {
    return false;
  }
}

// --- ヘルパー ---

function columnLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}
