import { NextResponse } from 'next/server';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData, getProjectConfigs } from '@/lib/dataProcessor';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rawData = await loadDataFromSheets();
        const configs = getProjectConfigs(rawData);
        const processedData = processData(rawData);

        // Server time info
        const serverNow = new Date();
        const serverTodayStr = serverNow.toISOString().split('T')[0];
        const jstNow = new Date(serverNow.getTime() + 9 * 60 * 60 * 1000);
        const jstTodayStr = jstNow.toISOString().split('T')[0];

        // Check Beyond_Live raw dates
        const beyondLiveDates = rawData.Beyond_Live.map(row => row['date_jst']).filter(d => d);
        const uniqueBeyondLiveDates = [...new Set(beyondLiveDates)].sort().reverse().slice(0, 10);

        // Check Meta_Live raw dates
        const metaLiveDates = rawData.Meta_Live.map(row => row['Day']).filter(d => d);
        const uniqueMetaLiveDates = [...new Set(metaLiveDates)].sort().reverse().slice(0, 10);

        // Check Beyond_History raw dates (last 10 unique)
        const beyondHistoryDates = rawData.Beyond_History.map(row => row['date_jst']).filter(d => d);
        const uniqueBeyondHistoryDates = [...new Set(beyondHistoryDates)].sort().reverse().slice(0, 10);

        // Group processed data by date
        const byDate: Record<string, number> = {};
        for (const row of processedData) {
            const dateStr = row.Date.toISOString().split('T')[0];
            byDate[dateStr] = (byDate[dateStr] || 0) + 1;
        }

        // Group by campaign
        const byCampaign: Record<string, number> = {};
        const byMedia: Record<string, number> = {};

        for (const row of processedData) {
            byCampaign[row.Campaign_Name] = (byCampaign[row.Campaign_Name] || 0) + 1;
            byMedia[row.Media] = (byMedia[row.Media] || 0) + 1;
        }

        // Find today's data specifically
        const todayProcessed = processedData.filter(row =>
            row.Date.toISOString().split('T')[0] === jstTodayStr
        );

        // Debug for latest history date: inspect Beyond exit metrics by creative
        const latestHistoryDate = uniqueBeyondHistoryDates[0] || '';
        const latestHistoryRows = processedData.filter(row =>
            row.Media === 'Beyond' && row.Date.toISOString().split('T')[0] === latestHistoryDate.replace(/\//g, '-')
        );
        const exitByCreative: Record<string, { pv: number; fvExit: number; svExit: number }> = {};
        const exitByVersion: Record<string, { pv: number; fvExit: number; svExit: number }> = {};
        for (const row of latestHistoryRows) {
            const key = row.creative_value || row.Creative || '(empty)';
            if (!exitByCreative[key]) exitByCreative[key] = { pv: 0, fvExit: 0, svExit: 0 };
            exitByCreative[key].pv += row.PV;
            exitByCreative[key].fvExit += row.FV_Exit;
            exitByCreative[key].svExit += row.SV_Exit;

            const versionKey = row.version_name || '(empty)';
            if (!exitByVersion[versionKey]) exitByVersion[versionKey] = { pv: 0, fvExit: 0, svExit: 0 };
            exitByVersion[versionKey].pv += row.PV;
            exitByVersion[versionKey].fvExit += row.FV_Exit;
            exitByVersion[versionKey].svExit += row.SV_Exit;
        }
        const latestExitSample = Object.entries(exitByCreative).slice(0, 30).map(([creative, v]) => ({
            creative,
            pv: v.pv,
            fvExit: Math.round(v.fvExit * 100) / 100,
            svExit: Math.round(v.svExit * 100) / 100,
            fvExitRate: v.pv > 0 ? Math.round((v.fvExit / v.pv) * 10000) / 100 : 0,
            svExitRate: v.pv - v.fvExit > 0 ? Math.round((v.svExit / (v.pv - v.fvExit)) * 10000) / 100 : 0,
        }));
        const latestExitByVersion = Object.entries(exitByVersion).slice(0, 30).map(([version, v]) => ({
            version,
            pv: v.pv,
            fvExit: Math.round(v.fvExit * 100) / 100,
            svExit: Math.round(v.svExit * 100) / 100,
            fvExitRate: v.pv > 0 ? Math.round((v.fvExit / v.pv) * 10000) / 100 : 0,
            svExitRate: v.pv - v.fvExit > 0 ? Math.round((v.svExit / (v.pv - v.fvExit)) * 10000) / 100 : 0,
        }));

        // Check for matching issues - sample Beyond_Live rows
        const beyondLiveSample = rawData.Beyond_Live.slice(0, 5).map(row => ({
            date_jst: row['date_jst'],
            beyond_page_name: row['beyond_page_name'],
            folder_name: row['folder_name'],
            parameter: row['parameter'],
        }));

        // Check configs
        const configsSummary = configs.map(c => ({
            projectName: c.projectName,
            metaKeyword: c.metaKeyword,
            beyondKeyword: c.beyondKeyword,
            type: c.type,
            metaAccountNamesCount: c.metaAccountNames.length,
        }));

        return NextResponse.json({
            serverTime: {
                serverNow: serverNow.toISOString(),
                serverTodayStr,
                jstNow: jstNow.toISOString(),
                jstTodayStr,
            },
            rawCounts: {
                Meta_Live: rawData.Meta_Live.length,
                Meta_History: rawData.Meta_History.length,
                Beyond_Live: rawData.Beyond_Live.length,
                Beyond_History: rawData.Beyond_History.length,
            },
            uniqueDates: {
                beyondLive: uniqueBeyondLiveDates,
                metaLive: uniqueMetaLiveDates,
                beyondHistory: uniqueBeyondHistoryDates,
            },
            processedSummary: {
                totalRows: processedData.length,
                byDate: Object.entries(byDate).sort().reverse().slice(0, 10),
                byCampaign,
                byMedia,
                todayRowCount: todayProcessed.length,
            },
            latestHistoryDate,
            latestHistoryBeyondRows: latestHistoryRows.length,
            latestExitSample,
            latestExitByVersion,
            beyondLiveSample,
            configsSummary,
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
