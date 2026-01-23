import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';

const MASTER_ID = process.env.GOOGLE_SHEETS_MASTER_ID;
const LIST_SHEET_NAME = 'Report_List';

export interface ReportEntry {
    token: string;
    projectName: string;
    startDate: string;
    endDate: string;
    spreadsheetId: string;
    createdAt: string;
}

export async function addReportToList(entry: ReportEntry) {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!MASTER_ID) throw new Error('MASTER_ID not set');

    // Ensure sheet exists
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
        // Initial header
        await sheets.spreadsheets.values.update({
            spreadsheetId: MASTER_ID,
            range: `${LIST_SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['token', 'projectName', 'startDate', 'endDate', 'spreadsheetId', 'createdAt']],
            },
        });
    }

    // Append entry
    await sheets.spreadsheets.values.append({
        spreadsheetId: MASTER_ID,
        range: `${LIST_SHEET_NAME}!A:F`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[
                entry.token,
                entry.projectName,
                entry.startDate,
                entry.endDate,
                entry.spreadsheetId,
                entry.createdAt
            ]],
        },
    });
}

export async function getReportByToken(token: string): Promise<ReportEntry | null> {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (!MASTER_ID) throw new Error('MASTER_ID not set');

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_ID,
            range: `${LIST_SHEET_NAME}!A:F`,
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) return null;

        const headers = rows[0];
        const dataRows = rows.slice(1);

        const foundRow = dataRows.find(r => r[0] === token);
        if (!foundRow) return null;

        return {
            token: foundRow[0],
            projectName: foundRow[1],
            startDate: foundRow[2],
            endDate: foundRow[3],
            spreadsheetId: foundRow[4],
            createdAt: foundRow[5]
        };
    } catch (e) {
        console.error('Failed to get report by token', e);
        return null;
    }
}
