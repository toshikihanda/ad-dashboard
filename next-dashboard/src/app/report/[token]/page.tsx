import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ReportClient from '../ReportClient';
import { getReportByToken } from '@/lib/reportStore';
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

async function getReportData(spreadsheetId: string) {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Data!A:M', // Adjust range if needed
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) return [];

        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Convert back to ProcessedRow format (with Date objects etc)
        return dataRows.map(r => ({
            Date: new Date(r[0]),
            Media: r[1],
            Campaign_Name: r[2],
            Cost: Number(r[3]) || 0,
            Impressions: Number(r[4]) || 0,
            Clicks: Number(r[5]) || 0,
            CV: Number(r[6]) || 0,
            PV: Number(r[7]) || 0,
            FV_Exit: Number(r[8]) || 0,
            SV_Exit: Number(r[9]) || 0,
            beyond_page_name: r[10] || '',
            version_name: r[11] || '',
            creative_value: r[12] || '',
            // Derived fields (optional if UI recalculates them)
            MCV: Number(r[6]) || 0,
        })) as unknown as ProcessedRow[];
    } catch (e) {
        console.error('Failed to fetch data from report spreadsheet', e);
        return [];
    }
}

export default async function Page({ params }: { params: { token: string } }) {
    const { token } = params;
    const report = await getReportByToken(token);

    if (!report) {
        notFound();
    }

    const data = await getReportData(report.spreadsheetId);

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-6">
            <Suspense fallback={
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="animate-spin text-4xl">📊</div>
                </div>
            }>
                <ReportClient
                    initialData={data}
                    masterProjects={[report.projectName]}
                    spreadsheetUrl={`https://docs.google.com/spreadsheets/d/${report.spreadsheetId}`}
                    createdAt={report.createdAt}
                />
            </Suspense>
        </div>
    );
}
