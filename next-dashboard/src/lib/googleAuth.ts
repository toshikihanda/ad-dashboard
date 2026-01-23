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

export async function createReportSpreadsheet(title: string): Promise<string> {
    // Step 0: 認証
    let auth;
    try {
        auth = await getGoogleAuth();
    } catch (err: any) {
        throw new Error(`[Step0] 認証失敗: ${err.message}`);
    }

    const sheets = google.sheets({ version: 'v4', auth });
    let spreadsheetId: string;

    // Step 1: スプレッドシート新規作成
    try {
        const res = await sheets.spreadsheets.create({
            requestBody: {
                properties: {
                    title: `[Report] ${title}`,
                },
            },
        });
        spreadsheetId = res.data.spreadsheetId!;
        if (!spreadsheetId) {
            throw new Error('spreadsheetId is null');
        }
    } catch (err: any) {
        // Google APIのエラー詳細を抽出
        const details = err.response?.data?.error?.message || err.message;
        throw new Error(`[Step1] Sheets API新規作成失敗: ${details}`);
    }

    // Step 2: 共有設定（失敗しても続行）
    try {
        const drive = google.drive({ version: 'v3', auth });
        await drive.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });
    } catch (err: any) {
        const details = err.response?.data?.error?.message || err.message;
        console.error(`[Step2] 共有設定失敗 (続行): ${details}`);
        // 共有設定が失敗しても、スプレッドシートは作成できているので続行
    }

    return spreadsheetId;
}

export async function writeDataToSheet(spreadsheetId: string, sheetName: string, data: any[][]) {
    let auth;
    try {
        auth = await getGoogleAuth();
    } catch (err: any) {
        throw new Error(`[WriteData] 認証失敗: ${err.message}`);
    }

    const sheets = google.sheets({ version: 'v4', auth });

    // シートが存在するか確認
    try {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === sheetName);

        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: { title: sheetName }
                        }
                    }]
                }
            });
        }
    } catch (err: any) {
        const details = err.response?.data?.error?.message || err.message;
        throw new Error(`[WriteData] シート確認/作成失敗: ${details}`);
    }

    // データクリア
    try {
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A1:Z50000`,
        });
    } catch (err: any) {
        const details = err.response?.data?.error?.message || err.message;
        throw new Error(`[WriteData] データクリア失敗: ${details}`);
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
