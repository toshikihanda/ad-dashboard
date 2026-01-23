import { NextRequest, NextResponse } from 'next/server';
import { createReportSpreadsheet, writeDataToSheet } from '@/lib/googleAuth';
import { addReportToList } from '@/lib/reportStore';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';

export async function POST(req: NextRequest) {
    try {
        const { campaigns, startDate, endDate } = await req.json();

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return NextResponse.json({ error: '商材を選択してください' }, { status: 400 });
        }

        // 1. Generate unique token
        const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

        // 2. Fetch and filter data for the report
        const rawData = await loadDataFromSheets();
        const processed = processData(rawData);

        // 日付をYYYY-MM-DD形式の文字列に変換するヘルパー
        const toDateString = (d: any): string => {
            if (!d) return '';
            if (typeof d === 'string') return d.split('T')[0];
            if (d instanceof Date) return d.toISOString().split('T')[0];
            return String(d);
        };

        // デバッグログ
        console.log('[API] Total processed rows:', processed.length);
        if (processed.length > 0) {
            console.log('[API] Sample Date (raw):', processed[0].Date, '| type:', typeof processed[0].Date);
            console.log('[API] Sample Date (converted):', toDateString(processed[0].Date));
        }
        console.log('[API] Requested campaigns:', campaigns);
        console.log('[API] Requested date range:', startDate, '~', endDate);

        // Filter data by campaign and date
        const filteredData = processed.filter(d => {
            const dateStr = toDateString(d.Date);
            const dateMatch = dateStr >= startDate && dateStr <= endDate;
            const campaignMatch = campaigns.includes(d.Campaign_Name);
            return dateMatch && campaignMatch;
        });

        console.log('[API] Filtered data count:', filteredData.length);

        if (filteredData.length === 0) {
            const availableCampaigns = [...new Set(processed.map(d => d.Campaign_Name))];
            const availableDates = [...new Set(processed.map(d => toDateString(d.Date)))].filter(Boolean).sort();

            return NextResponse.json({
                error: `対象期間にデータが存在しません。データ期間: ${availableDates[0]} ~ ${availableDates[availableDates.length - 1]}`
            }, { status: 400 });
        }

        // 3. Create a new Google Spreadsheet
        const campaignDisplay = campaigns.length > 1 ? `${campaigns[0]} 他` : campaigns[0];
        const spreadsheetTitle = `${campaignDisplay} (${startDate} - ${endDate})`;

        console.log('[API] Creating spreadsheet...');
        const spreadsheetId = await createReportSpreadsheet(spreadsheetTitle);

        // 4. Transform data for writing to sheet
        const headers = Object.keys(filteredData[0]);
        const rows = filteredData.map(d => headers.map(h => {
            const val = (d as any)[h];
            // Date型は文字列に変換
            if (val instanceof Date) return toDateString(val);
            return val;
        }));
        const sheetData = [headers, ...rows];

        console.log('[API] Writing data to new sheet...');
        await writeDataToSheet(spreadsheetId, 'ReportData', sheetData);

        // 5. Store metadata in the master list
        const reportUrl = `/report/${token}`;
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
        const apiError = error.response?.data?.error?.message;
        const errorMessage = apiError ? `Google API Error: ${apiError}` : (error.message || 'Unknown error');

        return NextResponse.json(
            { error: `エラーが発生しました: ${errorMessage}` },
            { status: 500 }
        );
    }
}
