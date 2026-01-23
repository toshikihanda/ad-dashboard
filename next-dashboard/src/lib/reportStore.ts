import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';

const MASTER_ID = process.env.GOOGLE_SHEETS_MASTER_ID;
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

    if (!MASTER_ID) throw new Error('MASTER_ID not set');

    // シートが存在するか確認
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID });
    const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === LIST_SHEET_NAME);

    if (!sheetExists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: MASTER_ID,
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
            spreadsheetId: MASTER_ID,
            range: `${LIST_SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['adminToken', 'clientToken', 'projectName', 'startDate', 'endDate', 'sheetName', 'createdAt']],
            },
        });
    }

    // データを追加
    await sheets.spreadsheets.values.append({
        spreadsheetId: MASTER_ID,
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
export async function getReportByToken(token: string): Promise<{ entry: ReportEntry; isAdmin: boolean } | null> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!MASTER_ID) throw new Error('MASTER_ID not set');

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_ID,
            range: `${LIST_SHEET_NAME}!A:G`,
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) return null;

        const dataRows = rows.slice(1);

        // adminTokenで検索
        let foundRow = dataRows.find(r => r[0] === token);
        if (foundRow) {
            return {
                entry: {
                    adminToken: foundRow[0],
                    clientToken: foundRow[1] || null,
                    projectName: foundRow[2],
                    startDate: foundRow[3],
                    endDate: foundRow[4],
                    sheetName: foundRow[5],
                    createdAt: foundRow[6]
                },
                isAdmin: true
            };
        }

        // clientTokenで検索
        foundRow = dataRows.find(r => r[1] === token);
        if (foundRow) {
            return {
                entry: {
                    adminToken: foundRow[0],
                    clientToken: foundRow[1] || null,
                    projectName: foundRow[2],
                    startDate: foundRow[3],
                    endDate: foundRow[4],
                    sheetName: foundRow[5],
                    createdAt: foundRow[6]
                },
                isAdmin: false
            };
        }

        return null;
    } catch (e) {
        console.error('Failed to get report by token', e);
        return null;
    }
}

/**
 * クライアントトークンを追加
 */
export async function updateClientToken(adminToken: string, clientToken: string): Promise<boolean> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!MASTER_ID) throw new Error('MASTER_ID not set');

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_ID,
            range: `${LIST_SHEET_NAME}!A:G`,
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) return false;

        // adminTokenの行を探す（1-indexed、ヘッダーは1行目なので+2）
        const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === adminToken);
        if (rowIndex === -1) return false;

        // clientTokenカラム（B列）を更新
        await sheets.spreadsheets.values.update({
            spreadsheetId: MASTER_ID,
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
    return MASTER_ID || '';
}

/**
 * シートのURLを生成
 */
export async function getSheetUrl(sheetName: string): Promise<string> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!MASTER_ID) throw new Error('MASTER_ID not set');

    try {
        const res = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID });
        const sheet = res.data.sheets?.find(s => s.properties?.title === sheetName);
        const sheetId = sheet?.properties?.sheetId || 0;
        return `https://docs.google.com/spreadsheets/d/${MASTER_ID}/edit#gid=${sheetId}`;
    } catch (e) {
        return `https://docs.google.com/spreadsheets/d/${MASTER_ID}/edit`;
    }
}
