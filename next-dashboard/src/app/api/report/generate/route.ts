import { NextRequest, NextResponse } from 'next/server';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData, filterByCampaign, filterByDateRange } from '@/lib/dataProcessor';
import { createReportSpreadsheet, writeDataToSheet } from '@/lib/googleAuth';
import { addReportToList } from '@/lib/reportStore';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectName, startDate, endDate } = body;

        if (!projectName || !startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // 1. Generate Token
        const token = crypto.randomBytes(8).toString('hex'); // 16 characters random string

        // 2. Fetch and Filter Data
        const rawData = await loadDataFromSheets();
        const processedData = processData(rawData);

        // Filter by campaign and date
        const campaignData = filterByCampaign(processedData, projectName);
        const filteredData = filterByDateRange(campaignData, new Date(startDate), new Date(endDate));

        if (filteredData.length === 0) {
            return NextResponse.json({ error: 'No data found for the selected criteria' }, { status: 404 });
        }

        // 3. Create Spreadsheet
        const title = `${projectName} (${startDate}〜${endDate})`;
        const spreadsheetId = await createReportSpreadsheet(title);

        // 4. Prepare Data for Writing (CSV-like 2D array)
        // Headers: Date, Media, Campaign_Name, Cost, Impressions, Clicks, CV, PV, FV_Exit, SV_Exit, beyond_page_name, version_name, creative_value
        const headers = [
            'Date', 'Media', 'Campaign_Name', 'Cost', 'Impressions', 'Clicks',
            'CV', 'PV', 'FV_Exit', 'SV_Exit', 'beyond_page_name', 'version_name', 'creative_value'
        ];

        const dataRows = filteredData.map(row => [
            row.Date.toISOString().split('T')[0],
            row.Media,
            row.Campaign_Name,
            row.Cost,
            row.Impressions,
            row.Clicks,
            row.CV,
            row.PV,
            row.FV_Exit,
            row.SV_Exit,
            row.beyond_page_name,
            row.version_name,
            row.creative_value
        ]);

        const fullData = [headers, ...dataRows];

        // 5. Write Data
        await writeDataToSheet(spreadsheetId, 'Data', fullData);

        // 6. Save to Master List
        const createdAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        await addReportToList({
            token,
            projectName,
            startDate,
            endDate,
            spreadsheetId,
            createdAt
        });

        const reportUrl = `/report/${token}`;
        const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

        return NextResponse.json({
            success: true,
            token,
            reportUrl,
            spreadsheetUrl,
            projectName,
            startDate,
            endDate
        });

    } catch (error: any) {
        console.error('Report Generation Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
