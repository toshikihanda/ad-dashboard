import { NextRequest, NextResponse } from 'next/server';
import { createReportSpreadsheet, writeDataToSheet } from '@/lib/googleAuth';
import { addReportToList } from '@/lib/reportStore';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';

export async function POST(req: NextRequest) {
    try {
        const { campaigns, startDate, endDate, datePreset } = await req.json();

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return NextResponse.json({ error: '商材を選択してください' }, { status: 400 });
        }

        // 1. Generate unique token
        const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

        // 2. Fetch and filter data for the report
        // We use the existing data loading logic
        const rawData = await loadDataFromSheets();
        const processed = processData(rawData);

        // デバッグ: 最初のデータの形式を確認
        console.log('[API] Total processed rows:', processed.length);
        if (processed.length > 0) {
            console.log('[API] Sample data keys:', Object.keys(processed[0]));
            console.log('[API] Sample Campaign_Name:', processed[0].Campaign_Name);
            console.log('[API] Sample Date:', processed[0].Date);
        }
        console.log('[API] Requested campaigns:', campaigns);
        console.log('[API] Requested date range:', startDate, '~', endDate);

        // Filter data by campaign and date
        const filteredData = processed.filter(d => {
            const dateMatch = d.Date >= startDate && d.Date <= endDate;
            const campaignMatch = campaigns.includes(d.Campaign_Name);
            return dateMatch && campaignMatch;
        });

        console.log('[API] Filtered data count:', filteredData.length);

        if (filteredData.length === 0) {
            // より詳細なエラーメッセージ
            const availableCampaigns = [...new Set(processed.map(d => d.Campaign_Name))];
            const availableDates = [...new Set(processed.map(d => d.Date))].sort();
            console.log('[API] Available campaigns:', availableCampaigns);
            console.log('[API] Available date range:', availableDates[0], '~', availableDates[availableDates.length - 1]);

            return NextResponse.json({
                error: `対象期間にデータが存在しません。利用可能な商材: ${availableCampaigns.slice(0, 5).join(', ')}...、データ期間: ${availableDates[0]} ~ ${availableDates[availableDates.length - 1]}`
            }, { status: 400 });
        }

        // 3. Create a new Google Spreadsheet
        const campaignDisplay = campaigns.length > 1 ? `${campaigns[0]} 他` : campaigns[0];
        const spreadsheetTitle = `${campaignDisplay} (${startDate}pt - ${endDate})`;

        console.log('[API] Creating spreadsheet...');
        const spreadsheetId = await createReportSpreadsheet(spreadsheetTitle);

        // 4. Transform data for writing to sheet
        const headers = Object.keys(filteredData[0]);
        const rows = filteredData.map(d => headers.map(h => (d as any)[h]));
        const sheetData = [headers, ...rows];

        console.log('[API] Writing data to new sheet...');
        await writeDataToSheet(spreadsheetId, 'ReportData', sheetData);

        // 5. Store metadata in the master list
        const reportUrl = `${new URL(req.url).origin}/report/${token}`;
        const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        console.log('[API] Adding report to master list...');
        await addReportToList({
            token,
            projectName: campaigns.join(', '),
            startDate,
            endDate,
            spreadsheetId,
            createdAt: new Date().toISOString()
        });

        return NextResponse.json({
            success: true,
            reportUrl,
            spreadsheetUrl
        });

    } catch (error: any) {
        console.error('Report generation error:', error);
        // Google APIのエラーメッセージを抽出
        const apiError = error.response?.data?.error?.message;
        const errorMessage = apiError ? `Google API Error: ${apiError}` : (error.message || 'Unknown error');

        return NextResponse.json(
            { error: `エラーが発生しました: ${errorMessage}` },
            { status: 500 }
        );
    }
}
