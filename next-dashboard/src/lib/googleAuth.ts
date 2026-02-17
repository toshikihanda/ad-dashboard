import { google } from 'googleapis';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
];

/**
 * Googleの秘密鍵（Private Key）をNode.jsが確実に受理できる形式に整形する
 */
function formatPrivateKey(key: string | undefined): string {
    if (!key) return '';

    let cleaned = key.trim().replace(/^["']|["']$/g, '');
    cleaned = cleaned.replace(/\\n/g, '\n');

    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';

    if (cleaned.includes(header) && cleaned.includes(footer)) {
        let body = cleaned
            .replace(header, '')
            .replace(footer, '')
            .replace(/\s+/g, '');
        return `${header}\n${body}\n${footer}\n`;
    } else {
        const body = cleaned.replace(/\s+/g, '');
        return `${header}\n${body}\n${footer}\n`;
    }
}

export async function getGoogleAuth() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    const privateKey = formatPrivateKey(rawKey);

    if (!clientEmail || !privateKey || privateKey.length < 100) {
        throw new Error(`認証情報エラー: email=${!!clientEmail}, keyLength=${privateKey.length}`);
    }

    try {
        const auth = new google.auth.JWT({
            email: clientEmail,
            key: privateKey,
            scopes: SCOPES,
        });
        return auth;
    } catch (err: any) {
        throw new Error(`JWT初期化失敗: ${err.message}`);
    }
}

/**
 * マスターシート内に新しいシート（タブ）を作成してレポートデータを保存する
 * 新規スプレッドシートの作成権限がない場合のワークアラウンド
 */
export async function createReportSheet(sheetName: string): Promise<void> {
    const reportId = process.env.GOOGLE_SHEETS_REPORT_ID || process.env.GOOGLE_SHEETS_MASTER_ID;
    if (!reportId) {
        throw new Error('GOOGLE_SHEETS_REPORT_ID または GOOGLE_SHEETS_MASTER_ID が設定されていません');
    }

    let auth;
    try {
        auth = await getGoogleAuth();
    } catch (err: any) {
        throw new Error(`[認証失敗] ${err.message}`);
    }

    const sheets = google.sheets({ version: 'v4', auth });

    // マスターシート内に新しいシート（タブ）を作成
    try {
        const res = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: reportId,
            requestBody: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: sheetName,
                        }
                    }
                }]
            }
        });

        const newSheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
        if (newSheetId === undefined) {
            throw new Error('シートIDが取得できませんでした');
        }

        // シート作成成功
    } catch (err: any) {
        const details = err.response?.data?.error?.message || err.message;
        throw new Error(`[シート作成失敗] ${details}`);
    }
}

export async function writeDataToSheet(spreadsheetId: string, sheetName: string, data: any[][]) {
    let auth;
    try {
        auth = await getGoogleAuth();
    } catch (err: any) {
        throw new Error(`[WriteData] 認証失敗: ${err.message}`);
    }

    const sheets = google.sheets({ version: 'v4', auth });

    // データクリア（エラーは無視 - シートが新しい場合データがない）
    try {
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A1:Z50000`,
        });
    } catch (err: any) {
        // 新規シートの場合はクリア不要なのでエラーは無視
    }

    // データ書き込み
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: data,
            },
        });
    } catch (err: any) {
        const details = err.response?.data?.error?.message || err.message;
        throw new Error(`[WriteData] データ書き込み失敗: ${details}`);
    }
}

/**
 * シートのURLを生成（マスターシート内の特定シートへのリンク）
 */
export function getSheetUrl(spreadsheetId: string, sheetId: number): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}
