import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ReportClient from '../ReportClient';
import { getReportByToken, getSheetUrl, getMasterSpreadsheetId } from '@/lib/reportStore';
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
            headers.forEach((h: string, i: number) => {
                let val = row[i];
                if (val && !isNaN(Number(val)) && h !== 'Date') {
                    val = Number(val);
                }
                obj[h] = val ?? '';
            });
            return obj;
        }) as ProcessedRow[];
    } catch (e: any) {
        const details = e.response?.data?.error?.message || e.message;
        throw new Error(`シート「${sheetName}」からのデータ取得に失敗しました: ${details}`);
    }
}

export default async function Page({ params }: { params: { token: string } }) {
    const { token } = params;

    // マスターIDのチェック
    if (!getMasterSpreadsheetId()) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-red-50 text-red-800">
                <h1 className="text-xl font-bold mb-2">⚠️ 設定エラー</h1>
                <p>GOOGLE_SHEETS_MASTER_ID が設定されていません。</p>
            </div>
        );
    }

    try {
        const result = await getReportByToken(token);

        if (!result) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50 text-slate-800">
                    <h1 className="text-xl font-bold mb-2">📊 レポートが見つかりません</h1>
                    <p className="text-sm opacity-70 mb-4">指定されたトークンが無効か、レポートがまだ作成されていない可能性があります。</p>
                    <a href="/" className="text-blue-600 hover:underline">ダッシュボードへ戻る</a>
                </div>
            );
        }

        const { entry, isAdmin } = result;
        const data = await getReportData(entry.sheetName);
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
                    />
                </Suspense>
            </div>
        );
    } catch (error: any) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-orange-50 text-orange-800">
                <h1 className="text-xl font-bold mb-2">⚠️ データ取得エラー</h1>
                <p className="text-sm mb-4">{error.message}</p>
                <a href="/" className="text-orange-600 hover:underline">ダッシュボードへ戻る</a>
            </div>
        );
    }
}

