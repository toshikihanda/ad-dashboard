import { google } from 'googleapis';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
];

function formatPrivateKey(key: string | undefined): string {
    if (!key) return '';

    // 1. 文字列の前後にある引用符や空白を削除 (Vercelで貼り付ける際に入り込むことがある)
    let cleanedKey = key.trim();
    if (cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) {
        cleanedKey = cleanedKey.substring(1, cleanedKey.length - 1);
    }

    // 2. エスケープされた改行(\\n)を実際の改行(\n)に変換
    // 既に実際の改行が含まれている場合も考慮し、gフラグで全置換
    return cleanedKey.replace(/\\n/g, '\n');
}

export async function getGoogleAuth() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    const privateKey = formatPrivateKey(rawKey);

    if (!clientEmail || !privateKey) {
        throw new Error(`Google API credentials are missing. email: ${!!clientEmail}, key: ${!!privateKey}`);
    }

    // デバッグ用にキーの形式をログ出力 (秘密鍵そのものは出さない)
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.error('Invalid Private Key: Missing header');
    }

    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: SCOPES,
    });

    return auth;
}

export async function createReportSpreadsheet(title: string) {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.create({
        requestBody: {
            properties: {
                title: `[Report] ${title}`,
            },
        },
    });

    const spreadsheetId = res.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create spreadsheet');

    const drive = google.drive({ version: 'v3', auth });
    await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return spreadsheetId;
}

export async function writeDataToSheet(spreadsheetId: string, sheetName: string, data: any[][]) {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

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

    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:Z50000`,
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: data,
        },
    });
}
