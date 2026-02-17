import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ReportClient from '../ReportClient';
import { findReportByToken, getSheetUrl, getMasterSpreadsheetId } from '@/lib/reportStore';
import { getGoogleAuth } from '@/lib/googleAuth';
import { google } from 'googleapis';
import { ProcessedRow } from '@/lib/dataProcessor';

export const metadata: Metadata = {
    title: '広告レポート',
    robots: {
        index: false,
        follow: false,
    },
};

/**
 * マスターシート内の指定されたシートからデータを取得
 */
async function getReportData(sheetName: string) {
    const masterId = getMasterSpreadsheetId();
    if (!masterId) {
        throw new Error('GOOGLE_SHEETS_MASTER_ID が設定されていません。Vercelの設定を確認してください。');
    }

    let auth;
    try {
        auth = await getGoogleAuth();
    } catch (e: any) {
        throw new Error(`認証に失敗しました: ${e.message}`);
    }

    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: masterId,
            range: `${sheetName}!A:Z`,
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) return [];

        const headers = rows[0];
        const dataRows = rows.slice(1);

        return dataRows.map(row => {
            const obj: any = {};
            // 数値に変換すべき列名のリスト（これ以外は文字列または日付として扱う）
            const numericHeaders = ['Cost', 'Impressions', 'Clicks', 'CV', 'MCV', 'PV', 'FV_Exit', 'SV_Exit', 'Revenue', 'Gross_Profit', 'cost', 'click', 'pv', 'cv', 'fv_exit', 'sv_exit'];

            headers.forEach((h: string, i: number) => {
                let val = row[i];
                if (h === 'Date' && val) {
                    const parsedDate = new Date(val);
                    obj[h] = isNaN(parsedDate.getTime()) ? val : parsedDate;
                } else if (numericHeaders.includes(h.toLowerCase()) || numericHeaders.includes(h)) {
                    // 数値列なら数値に変換
                    if (val && !isNaN(Number(val))) {
                        obj[h] = Number(val);
                    } else {
                        obj[h] = 0;
                    }
                } else {
                    // それ以外（version_name etc.）は文字列として維持
                    obj[h] = val ?? '';
                }
            });
            return obj;
        }) as ProcessedRow[];
    } catch (e: any) {
        const details = e.response?.data?.error?.message || e.message;
        throw new Error(`シート「${sheetName}」からのデータ取得に失敗しました: ${details}`);
    }
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const masterId = getMasterSpreadsheetId();

    console.log(`[ReportPage] Rendering for token: "${token}"`);
    console.log(`[ReportPage] Target Spreadsheet ID (from store): "${masterId}"`);

    // マスターIDのチェック
    if (!masterId) {
        console.error('[ReportPage] ERROR: No Master Spreadsheet ID configured');
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-red-50 text-red-800">
                <h1 className="text-xl font-bold mb-2">⚠️ 設定エラー</h1>
                <p>GOOGLE_SHEETS_MASTER_ID または REPORT_ID が設定されていません。</p>
            </div>
        );
    }

    try {
        console.log(`[ReportPage] Calling findReportByToken("${token}")...`);
        const result = await findReportByToken(token);

        if (!result) {
            console.warn(`[ReportPage] RESULT: No report found for token "${token}"`);
            return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50 text-slate-800">
                    <h1 className="text-xl font-bold mb-2">📊 レポートが見つかりません</h1>
                    <p className="text-sm opacity-70 mb-4">指定されたトークンが無効か、レポートがまだ作成されていない可能性があります。</p>
                    <p className="text-[10px] text-slate-400 mb-4">(Token: {token})</p>
                    <a href="/" className="text-blue-600 hover:underline">ダッシュボードへ戻る</a>
                </div>
            );
        }

        const { entry, isAdmin } = result;
        console.log(`[ReportPage] RESULT: SUCCESS! Admin=${isAdmin}, SheetName=${entry.sheetName}`);

        const data = await getReportData(entry.sheetName);
        console.log(`[ReportPage] Data fetched: ${data.length} rows`);

        const spreadsheetUrl = isAdmin ? await getSheetUrl(entry.sheetName) : undefined;

        return (
            <div className="min-h-screen bg-slate-100 p-4 md:p-6">
                <Suspense fallback={
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <div className="animate-spin text-4xl text-blue-600">📊</div>
                    </div>
                }>
                    <ReportClient
                        initialData={data}
                        masterProjects={entry.projectName.split(', ')}
                        spreadsheetUrl={spreadsheetUrl}
                        createdAt={entry.createdAt}
                        isAdmin={isAdmin}
                        adminToken={isAdmin ? entry.adminToken : undefined}
                        existingClientToken={entry.clientToken || undefined}
                        defaultStartDate={entry.startDate}
                        defaultEndDate={entry.endDate}
                    />
                </Suspense>
            </div>
        );
    } catch (error: any) {
        console.error('[ReportPage] UNEXPECTED ERROR:', error.message);
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-orange-50 text-orange-800">
                <h1 className="text-xl font-bold mb-2">⚠️ データ取得エラー</h1>
                <p className="text-sm mb-4">{error.message}</p>
                <a href="/" className="text-orange-600 hover:underline">ダッシュボードへ戻る</a>
            </div>
        );
    }
}

