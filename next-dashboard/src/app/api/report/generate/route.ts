import { NextRequest, NextResponse } from 'next/server';
import { createReportSheet, writeDataToSheet } from '@/lib/googleAuth';
import { addReportToList, getSheetUrl } from '@/lib/reportStore';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';

export async function POST(req: NextRequest) {
    try {
        const { campaigns, startDate, endDate } = await req.json();

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return NextResponse.json({ error: '商材を選択してください' }, { status: 400 });
        }

        // 1. 管理者用トークン生成
        const adminToken = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

        // 2. データ取得とフィルタリング
        const rawData = await loadDataFromSheets();

        // デバッグ: 各シートから取得した行数
        console.log('[Report] Raw data counts:');
        console.log('  - Meta_Live:', rawData.Meta_Live.length);
        console.log('  - Meta_History:', rawData.Meta_History.length);
        console.log('  - Beyond_Live:', rawData.Beyond_Live.length);
        console.log('  - Beyond_History:', rawData.Beyond_History.length);

        const processed = processData(rawData);

        // デバッグ: 処理後のMedia別内訳
        const metaCount = processed.filter(d => d.Media === 'Meta').length;
        const beyondCount = processed.filter(d => d.Media === 'Beyond').length;
        console.log('[Report] Processed data:');
        console.log('  - Total:', processed.length);
        console.log('  - Meta:', metaCount);
        console.log('  - Beyond:', beyondCount);

        const toDateString = (d: any): string => {
            if (!d) return '';
            if (typeof d === 'string') return d.split('T')[0];
            if (d instanceof Date) return d.toISOString().split('T')[0];
            return String(d);
        };

        const filteredData = processed.filter(d => {
            const dateStr = toDateString(d.Date);
            const dateMatch = dateStr >= startDate && dateStr <= endDate;
            const campaignMatch = campaigns.includes(d.Campaign_Name);
            return dateMatch && campaignMatch;
        });

        // デバッグ: フィルタリング後のMedia別内訳
        const filteredMetaCount = filteredData.filter(d => d.Media === 'Meta').length;
        const filteredBeyondCount = filteredData.filter(d => d.Media === 'Beyond').length;
        console.log('[Report] Filtered data:');
        console.log('  - Total:', filteredData.length);
        console.log('  - Meta:', filteredMetaCount);
        console.log('  - Beyond:', filteredBeyondCount);

        if (filteredData.length === 0) {
            const availableDates = [...new Set(processed.map(d => toDateString(d.Date)))].filter(Boolean).sort();
            return NextResponse.json({
                error: `対象期間にデータが存在しません。データ期間: ${availableDates[0]} ~ ${availableDates[availableDates.length - 1]}`
            }, { status: 400 });
        }

        // 3. シート名を生成（商材名_開始日_終了日_トークン）
        const campaignDisplay = campaigns.length > 1
            ? campaigns[0].replace(/[^a-zA-Z0-9ぁ-んァ-ン一-龥]/g, '')
            : campaigns[0].replace(/[^a-zA-Z0-9ぁ-んァ-ン一-龥]/g, '');
        const sheetName = `Rpt_${campaignDisplay}_${startDate.replace(/-/g, '').slice(4)}_${adminToken.slice(0, 6)}`;

        // 4. マスターシート内に新しいシート（タブ）を作成
        await createReportSheet(sheetName);

        // 5. データ書き込み
        const headers = Object.keys(filteredData[0]);
        const rows = filteredData.map(d => headers.map(h => {
            const val = (d as any)[h];
            if (val instanceof Date) return toDateString(val);
            return val;
        }));
        const sheetData = [headers, ...rows];

        const masterId = process.env.GOOGLE_SHEETS_MASTER_ID!;
        await writeDataToSheet(masterId, sheetName, sheetData);

        // 6. Report_Listに登録
        await addReportToList({
            adminToken,
            clientToken: null,
            projectName: campaigns.join(', '),
            startDate,
            endDate,
            sheetName,
            createdAt: new Date().toISOString()
        });

        // 7. スプレッドシートURL取得
        const spreadsheetUrl = await getSheetUrl(sheetName);

        return NextResponse.json({
            success: true,
            adminUrl: `/report/${adminToken}`,
            spreadsheetUrl
        });

    } catch (error: any) {
        console.error('Report generation error:', error);
        return NextResponse.json(
            { error: error.message || 'Unknown error' },
            { status: 500 }
        );
    }
}
