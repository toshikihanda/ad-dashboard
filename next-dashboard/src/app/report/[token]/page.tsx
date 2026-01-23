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
        console.error('MASTER_ID not set');
        return [];
    }

    const auth = await getGoogleAuth();
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

        // ヘッダーを使ってオブジェクトに変換
        return dataRows.map(row => {
            const obj: any = {};
            headers.forEach((h: string, i: number) => {
                let val = row[i];
                // 数値っぽいものは数値に変換
                if (val && !isNaN(Number(val)) && h !== 'Date') {
                    val = Number(val);
                }
                // Dateは文字列のまま
                obj[h] = val ?? '';
            });
            return obj;
        }) as ProcessedRow[];
    } catch (e) {
        console.error('Failed to fetch data from report sheet', e);
        return [];
    }
}

export default async function Page({ params }: { params: { token: string } }) {
    const { token } = params;
    const result = await getReportByToken(token);

    if (!result) {
        notFound();
    }

    const { entry, isAdmin } = result;
    const data = await getReportData(entry.sheetName);

    // スプレッドシートURL（管理者のみ使用）
    const spreadsheetUrl = isAdmin ? await getSheetUrl(entry.sheetName) : undefined;

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-6">
            <Suspense fallback={
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="animate-spin text-4xl">📊</div>
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
}
