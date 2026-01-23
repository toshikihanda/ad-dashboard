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

    // 1. 前後の引用符や空白を完全に除去
    let cleaned = key.trim().replace(/^["']|["']$/g, '');

    // 2. 文字列としての "\n" (バックスラッシュ + n) を実際の改行コードに置換
    cleaned = cleaned.replace(/\\n/g, '\n');

    // 3. ヘッダーとフッターに挟まれた「中身」を抽出して整形
    // ユーザーが1行で貼り付けてしまった場合、ヘッダーの直後に改行がないためエラーになる
    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';

    if (cleaned.includes(header) && cleaned.includes(footer)) {
        // ヘッダーとフッターを取り除いて、中身（Base64部分）だけにする
        let body = cleaned
            .replace(header, '')
            .replace(footer, '')
            .replace(/\s+/g, ''); // スペースや改行を一旦すべて削除

        // 正しいPEM形式（ヘッダー + 改行 + 中身 + 改行 + フッター + 改行）に再構築
        return `${header}\n${body}\n${footer}\n`;
    } else {
        // ヘッダーがない場合は、全体を中身として扱い付与する
        const body = cleaned.replace(/\s+/g, '');
        return `${header}\n${body}\n${footer}\n`;
    }
}

export async function getGoogleAuth() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;

    const privateKey = formatPrivateKey(rawKey);

    // デバッグ情報（サーバーログに出力されます）
    console.log(`[GoogleAuth] Using email: ${clientEmail}`);
    console.log(`[GoogleAuth] Key format check: ${privateKey.startsWith('-----BEGIN') && privateKey.endsWith('-----\n') ? 'OK' : 'INVALID'}`);
    console.log(`[GoogleAuth] Key length: ${privateKey.length} chars`);

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
