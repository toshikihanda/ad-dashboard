import { google } from 'googleapis';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
];

export async function getGoogleAuth() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        throw new Error('Google API credentials are not set in environment variables.');
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

    // Create new spreadsheet
    const res = await sheets.spreadsheets.create({
        requestBody: {
            properties: {
                title: `[Report] ${title}`,
            },
        },
    });

    const spreadsheetId = res.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create spreadsheet');

    // Make spreadsheet publicly readable but not searchable (anyone with link)
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

    // 1. Ensure sheet exists (or create it)
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

    // 2. Clear existing data
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:Z50000`,
    });

    // 3. Write new data
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: data,
        },
    });
}
