import { google } from 'googleapis';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
];

/**
 * Googleの秘密鍵（Private Key）をNode.jsが受理できる形式に整形する
 */
function formatPrivateKey(key: string | undefined): string {
    if (!key) return '';

    // 1. 前後の引用符や空白を完全に除去
    let cleaned = key.trim().replace(/^["']|["']$/g, '');

    // 2. 複数のバリエーションの改行エスケープを実際の改行に変換
    //    (\\n や \n 文字列を 本物の改行コードに置換)
    cleaned = cleaned.replace(/\\n/g, '\n');

    // 3. もし鍵の本体部分だけでヘッダーがない場合、または改行が壊れている場合を考慮
    // PEM形式は -----BEGIN PRIVATE KEY----- で始まる必要がある
    if (!cleaned.includes('-----BEGIN PRIVATE KEY-----')) {
        // 鍵の本体と思われる部分を整形（スペースをすべて除去して64文字ごとに改行を入れるのが本来のPEMだが、Nodeは1行でも読める場合がある）
        // ここでは最低限、ヘッダーとフッターを付与してみる
        cleaned = `-----BEGIN PRIVATE KEY-----\n${cleaned}\n-----END PRIVATE KEY-----\n`;
    }

    return cleaned;
}

export async function getGoogleAuth() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;

    const privateKey = formatPrivateKey(rawKey);

    // デバッグ情報（秘密鍵自体は出さない）
    console.log(`[GoogleAuth] Email: ${clientEmail ? 'Set' : 'Missing'}`);
    console.log(`[GoogleAuth] Key length: ${privateKey.length} chars`);
    console.log(`[GoogleAuth] Key starts with: ${privateKey.substring(0, 30)}...`);

    if (!clientEmail || !privateKey || privateKey.length < 100) {
        throw new Error('Google API credentials are not valid or missing.');
    }

    try {
        const auth = new google.auth.JWT({
            email: clientEmail,
            key: privateKey,
            scopes: SCOPES,
        });
        return auth;
    } catch (err: any) {
        console.error('[GoogleAuth] Failed to initialize JWT:', err.message);
        throw err;
    }
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
