/**
 * Knowledge_Candidates シートへの読み書きユーティリティ。
 * 既存の googleAuth.ts / googleSheets.ts を利用する。
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

// --- 候補の読み込み ---

/** Knowledge_Candidates シートから全行を取得 */
export async function loadCandidates(): Promise<KnowledgeCandidate[]> {
  const rows = await loadSheetData(CANDIDATES_SHEET_NAME, { cache: 'no-store' });
  return rows.map(rowToCandidate).filter(c => c.id);
}

/** pending 候補のみ取得 */
export async function loadPendingCandidates(): Promise<KnowledgeCandidate[]> {
  const all = await loadCandidates();
  return all.filter(c => c.status === 'pending');
}

// --- 候補の追記 ---

/** Knowledge_Candidates シートにヘッダー+データを追記する */
export async function appendCandidates(candidates: KnowledgeCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // まず既存データがあるか確認（ヘッダーが存在するか）
  let hasHeader = false;
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: `${CANDIDATES_SHEET_NAME}!A1:A1`,
    });
    hasHeader = !!(existing.data.values && existing.data.values.length > 0);
  } catch {
    // シートが存在しない場合は作成
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: CANDIDATES_SHEET_NAME },
            },
          }],
        },
      });
    } catch (e: any) {
      // 既に存在する場合は無視
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

// --- 候補のステータス更新 ---

/** 指定IDの候補のステータスとコメントを更新する */
export async function updateCandidateStatus(
  candidateId: string,
  status: 'approved' | 'rejected',
  comment: string
): Promise<KnowledgeCandidate | null> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // 全データ取得して該当行を探す
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${CANDIDATES_SHEET_NAME}!A:V`,
  });

  const allRows = res.data.values || [];
  if (allRows.length < 2) return null;

  const headers = allRows[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const commentCol = headers.indexOf('review_comment');

  if (idCol < 0 || statusCol < 0) return null;

  let targetRowIndex = -1;
  for (let i = 1; i < allRows.length; i++) {
    if (allRows[i][idCol] === candidateId) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex < 0) return null;

  // ステータスとコメントを更新
  const rowNum = targetRowIndex + 1; // 1-indexed
  const statusCell = `${CANDIDATES_SHEET_NAME}!${columnLetter(statusCol)}${rowNum}`;
  const commentCell = `${CANDIDATES_SHEET_NAME}!${columnLetter(commentCol)}${rowNum}`;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: MASTER_SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: statusCell, values: [[status]] },
        { range: commentCell, values: [[comment]] },
      ],
    },
  });

  // 更新後の候補を返す
  const updatedRow = allRows[targetRowIndex];
  updatedRow[statusCol] = status;
  if (commentCol >= 0) updatedRow[commentCol] = comment;

  const rowObj: Record<string, string> = {};
  headers.forEach((h: string, i: number) => {
    rowObj[h] = updatedRow[i] || '';
  });
  return rowToCandidate(rowObj);
}

// --- Knowledge シートへの転記 ---

/** approve 時に Knowledge シートへナレッジを追記する */
export async function appendToKnowledge(candidate: KnowledgeCandidate): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Category, Subcategory, Knowledge の3列で追記
  // summary をナレッジ本文として転記
  const category = candidate.judge_type === 'good' ? '良化パターン' : '悪化パターン';
  const subcategory = `${candidate.version_name} × ${candidate.creative}`;
  const knowledgeText = candidate.summary;

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

export async function recordLearningRun(runId: string, targetDate: string, candidateCount: number, goodCount: number, badCount: number, errors: string): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // シート存在確認・作成
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
          requests: [{
            addSheet: {
              properties: { title: LEARNING_RUNS_SHEET_NAME },
            },
          }],
        },
      });
      // ヘッダー追加
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

// --- 重複チェック ---

/** 同日の run が既に存在するか確認 */
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
