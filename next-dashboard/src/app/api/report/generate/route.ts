import { NextRequest, NextResponse } from 'next/server';
import { createReportSheet, writeDataToSheet } from '@/lib/googleAuth';
import { addReportToList, getSheetUrl } from '@/lib/reportStore';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';
import { filterProcessedDataByAccess, isCampaignAllowed } from '@/lib/accessControl';
import { readRequestAccess } from '@/lib/requestAccess';

export async function POST(req: NextRequest) {
    const access = await readRequestAccess(req);
    if (!access) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.canViewFinancials) {
        return NextResponse.json({ error: 'このアカウントではレポートを作成できません' }, { status: 403 });
    }

    // 0. 環境変数の事前チェック
    const requiredEnvVars = [
        'GOOGLE_SHEETS_MASTER_ID',
        'GOOGLE_CLIENT_EMAIL',
        'GOOGLE_PRIVATE_KEY'
    ];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        return NextResponse.json({
            error: `サーバー設定（環境変数）が不足しています: ${missingVars.join(', ')}。Vercelの設定を確認してください。`
        }, { status: 500 });
    }

    try {
        const { campaigns, startDate, endDate } = await req.json();

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return NextResponse.json({ error: '商材を選択してください' }, { status: 400 });
        }
        if (campaigns.some(campaign => !isCampaignAllowed(String(campaign), access.allowedCampaigns))) {
            return NextResponse.json({ error: '閲覧権限のない商材が含まれています' }, { status: 403 });
        }

        console.log(`[Phase1] Report generation started: ${campaigns.join(', ')} (${startDate} ~ ${endDate})`);

        // 1. 管理者用トークン生成
        const adminToken = 'a' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

        // 2. データ取得とフィルタリング
        const rawData = await loadDataFromSheets();
        const processed = filterProcessedDataByAccess(processData(rawData), access.allowedCampaigns);

        const toDateString = (d: unknown): string => {
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

        if (filteredData.length === 0) {
            return NextResponse.json({
                error: `対象期間（${startDate}〜${endDate}）に「${campaigns.join(', ')}」のデータが見つかりませんでした。`
            }, { status: 400 });
        }

        // 3. シート名を生成
        const campaignDisplay = campaigns[0].replace(/[^a-zA-Z0-9ぁ-んァ-ン一-龥]/g, '').slice(0, 10);
        const sheetName = `Rpt_${campaignDisplay}_${startDate.replace(/-/g, '').slice(4)}_${adminToken.slice(0, 4)}`;

        // 4. シート作成とデータ書き出し
        console.log(`[Phase1] Creating sheet: ${sheetName}`);
        await createReportSheet(sheetName);

        const headers = Object.keys(filteredData[0]);
        const rows = filteredData.map(d => headers.map(h => {
            const val = (d as unknown as Record<string, unknown>)[h];
            if (val instanceof Date) return toDateString(val);
            return val;
        }));
        const sheetData = [headers, ...rows];

        const reportId = process.env.GOOGLE_SHEETS_REPORT_ID || process.env.GOOGLE_SHEETS_MASTER_ID!;
        await writeDataToSheet(reportId, sheetName, sheetData);

        // 5. Report_Listに登録
        console.log(`[Phase1] Registering report to listing sheet...`);
        await addReportToList({
            adminToken,
            clientToken: null,
            projectName: campaigns.join(', '),
            startDate,
            endDate,
            sheetName,
            createdAt: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
        });

        // 6. スプレッドシートURLとレポートURLを返す
        const spreadsheetUrl = await getSheetUrl(sheetName);

        return NextResponse.json({
            success: true,
            adminUrl: `/report/${adminToken}`,
            spreadsheetUrl
        });

    } catch (error: unknown) {
        console.error('[Phase1] Report generation error:', error);
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { error: `レポート生成中にエラーが発生しました: ${message}` },
            { status: 500 }
        );
    }
}
