import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';

// レポート専用のシートIDがあればそれを使う。なければ従来のMASTER_IDを使う。
const REPORT_ID = process.env.GOOGLE_SHEETS_REPORT_ID || process.env.GOOGLE_SHEETS_MASTER_ID;
const LIST_SHEET_NAME = 'Report_List';

export interface ReportEntry {
    adminToken: string;
    clientToken: string | null;
    projectName: string;
    startDate: string;
    endDate: string;
    sheetName: string;
    createdAt: string;
}

/**
 * Report_Listシートにレポート情報を追加
 */
export async function addReportToList(entry: ReportEntry) {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!REPORT_ID) throw new Error('REPORT_ID not set');

    // シートが存在するか確認
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: REPORT_ID });
    const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === LIST_SHEET_NAME);

    if (!sheetExists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: REPORT_ID,
            requestBody: {
                requests: [{
                    addSheet: {
                        properties: { title: LIST_SHEET_NAME }
                    }
                }]
            }
        });
        // ヘッダー行を追加
        await sheets.spreadsheets.values.update({
            spreadsheetId: REPORT_ID,
            range: `${LIST_SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['adminToken', 'clientToken', 'projectName', 'startDate', 'endDate', 'sheetName', 'createdAt']],
            },
        });
    }

    // データを追加
    await sheets.spreadsheets.values.append({
        spreadsheetId: REPORT_ID,
        range: `${LIST_SHEET_NAME}!A:G`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[
                entry.adminToken,
                entry.clientToken || '',
                entry.projectName,
                entry.startDate,
                entry.endDate,
                entry.sheetName,
                entry.createdAt
            ]],
        },
    });
}

/**
 * トークンからレポート情報を取得
 * adminTokenまたはclientTokenのどちらでも検索可能
 */
export async function findReportByToken(token: string): Promise<{ entry: ReportEntry; isAdmin: boolean } | null> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // 環境変数を関数内で取得し、ログに出力
    const targetId = process.env.GOOGLE_SHEETS_REPORT_ID || process.env.GOOGLE_SHEETS_MASTER_ID;

    if (!targetId) {
        console.error('[reportStore] NO SPREADSHEET ID CONFIGURED (Check GOOGLE_SHEETS_REPORT_ID or MASTER_ID)');
        return null;
    }

    console.log(`[reportStore] === TOKEN SEARCH START ===`);
    console.log(`[reportStore] Target Spreadsheet ID: "${targetId}"`);
    console.log(`[reportStore] Searching for Token: "${token}"`);

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: targetId,
            range: `${LIST_SHEET_NAME}!A:G`,
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log(`[reportStore] RESULT: No data found in "${LIST_SHEET_NAME}" sheet of ID: ${targetId}`);
            return null;
        }

        console.log(`[reportStore] Total rows scanned: ${rows.length}`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const adminToken = row[0];
            const clientToken = row[1];

            if (adminToken === token && adminToken !== 'adminToken') {
                console.log(`[reportStore] MATCH FOUND: Admin role at row ${i + 1}`);
                return {
                    entry: {
                        adminToken: row[0],
                        clientToken: row[1] || null,
                        projectName: row[2],
                        startDate: row[3],
                        endDate: row[4],
                        sheetName: row[5],
                        createdAt: row[6]
                    },
                    isAdmin: true
                };
            }

            if (clientToken === token && clientToken !== 'clientToken') {
                console.log(`[reportStore] MATCH FOUND: Client role at row ${i + 1}`);
                return {
                    entry: {
                        adminToken: row[0],
                        clientToken: row[1] || null,
                        projectName: row[2],
                        startDate: row[3],
                        endDate: row[4],
                        sheetName: row[5],
                        createdAt: row[6]
                    },
                    isAdmin: false
                };
            }
        }

        console.log(`[reportStore] RESULT: No match found for "${token}" in ${rows.length} rows`);
        return null;
    } catch (e: any) {
        const details = e.response?.data?.error?.message || e.message;
        console.error(`[reportStore] API ERROR for ID ${targetId}:`, details);
        return null;
    }
}

// 互換性のためのエイリアス
export const getReportByToken = findReportByToken;

/**
 * クライアントトークンを追加
 */
export async function updateClientToken(adminToken: string, clientToken: string): Promise<boolean> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!REPORT_ID) throw new Error('REPORT_ID not set');

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: REPORT_ID,
            range: `${LIST_SHEET_NAME}!A:G`,
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) return false;

        // adminTokenの行を探す（1-indexed、ヘッダーは1行目なので+2）
        const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === adminToken);
        if (rowIndex === -1) return false;

        // clientTokenカラム（B列）を更新
        await sheets.spreadsheets.values.update({
            spreadsheetId: REPORT_ID,
            range: `${LIST_SHEET_NAME}!B${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[clientToken]],
            },
        });

        return true;
    } catch (e) {
        console.error('Failed to update client token', e);
        return false;
    }
}

/**
 * マスターシートのIDを取得
 */
export function getMasterSpreadsheetId(): string {
    return REPORT_ID || '';
}

/**
 * シートのURLを生成
 */
export async function getSheetUrl(sheetName: string): Promise<string> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!REPORT_ID) throw new Error('REPORT_ID not set');

    try {
        const res = await sheets.spreadsheets.get({ spreadsheetId: REPORT_ID });
        const sheet = res.data.sheets?.find(s => s.properties?.title === sheetName);
        const sheetId = sheet?.properties?.sheetId || 0;
        return `https://docs.google.com/spreadsheets/d/${REPORT_ID}/edit#gid=${sheetId}`;
    } catch (e) {
        return `https://docs.google.com/spreadsheets/d/${REPORT_ID}/edit`;
    }
}
