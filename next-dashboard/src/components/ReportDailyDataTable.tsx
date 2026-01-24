'use client';

// クライアント共有用日別データテーブル
// 売上・粗利・回収率・ROASは表示しない

import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface ReportDailyDataTableProps {
    data: ProcessedRow[];
    title: string;
    viewMode: 'total' | 'meta' | 'beyond';
}

interface DailyTableRow {
    date: string;
    displayDate: string;
    campaign: string;
    cost: number;
    impressions: number;
    clicks: number;
    mcv: number; // 商品LPクリック
    cv: number;
    ctr: number;
    mcvr: number;
    cvr: number;
    cpm: number;
    cpc: number;
    mcpa: number;
    cpa: number;
    pv: number;
    fvExitRate: number;
    svExitRate: number;
}

function aggregateByDateAndCampaign(data: ProcessedRow[], viewMode: 'total' | 'meta' | 'beyond'): DailyTableRow[] {
    // 日付とキャンペーンでグループ化
    const grouped = new Map<string, ProcessedRow[]>();

    for (const row of data) {
        const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
        const dateStr = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
        const key = `${dateStr}|||${row.Campaign_Name}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(row);
    }

    // 各グループを集計
    const rows: DailyTableRow[] = [];

    for (const [key, rowData] of grouped) {
        const [dateStr, campaign] = key.split('|||');

        const metaData = rowData.filter(row => row.Media === 'Meta');
        const beyondData = rowData.filter(row => row.Media === 'Beyond');

        // Meta集計
        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);

        // Beyond集計
        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

        const displayCost = viewMode === 'meta' ? metaCost : beyondCost;

        // 日付フォーマット
        const [year, month, day] = dateStr.split('-');
        const displayDate = `${year}/${month}/${day}`;

        rows.push({
            date: dateStr,
            displayDate,
            campaign,
            cost: displayCost,
            impressions,
            clicks: viewMode === 'beyond' ? beyondClicks : metaClicks,
            mcv: beyondClicks,
            cv,
            ctr: safeDivide(metaClicks, impressions) * 100,
            mcvr: safeDivide(beyondClicks, pv) * 100,
            cvr: safeDivide(cv, beyondClicks) * 100,
            cpm: safeDivide(metaCost, impressions) * 1000,
            cpc: viewMode === 'beyond' ? safeDivide(beyondCost, pv) : safeDivide(metaCost, metaClicks),
            mcpa: safeDivide(beyondCost, beyondClicks),
            cpa: safeDivide(beyondCost, cv),
            pv,
            fvExitRate: safeDivide(fvExit, pv) * 100,
            svExitRate: safeDivide(svExit, pv - fvExit) * 100,
        });
    }

    // 日付昇順、キャンペーン名順でソート
    return rows.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.campaign.localeCompare(b.campaign);
    });
}

function formatNumber(value: number, decimals = 0): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

export function ReportDailyDataTable({ data, title, viewMode }: ReportDailyDataTableProps) {
    const rows = aggregateByDateAndCampaign(data, viewMode);

    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <p className="text-gray-400 text-sm">データなし</p>
            </div>
        );
    }

    // 固定列幅定義
    const colW = {
        rank: 'w-[24px]',
        date: 'w-[80px]',
        label: 'w-[110px]',
        cost: 'w-[75px]',
        imp: 'w-[50px]',
        clicks: 'w-[50px]',
        lpClick: 'w-[70px]',
        cv: 'w-[35px]',
        ctr: 'w-[45px]',
        mcvr: 'w-[45px]',
        cvr: 'w-[45px]',
        cpm: 'w-[60px]',
        cpc: 'w-[60px]',
        mcpa: 'w-[65px]',
        cpa: 'w-[70px]',
        fvExit: 'w-[50px]',
        svExit: 'w-[50px]',
    };

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <div className="overflow-x-auto -mx-4 px-4">
                <div className="max-h-[330px] overflow-y-auto">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: '1000px' }}>
                        <thead className="bg-gray-50 sticky top-0 z-30">
                            <tr>
                                <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 ${colW.date}`}>日付</th>
                                <th className={`${thClass} text-left sticky left-[104px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>商材</th>
                                <th className={`${thClass} ${colW.cost}`}>出稿金額</th>
                                <th className={`${thClass} ${colW.imp}`}>Imp</th>
                                <th className={`${thClass} ${colW.clicks}`}>Clicks</th>
                                <th className={`${thClass} ${colW.lpClick}`}>商品LPクリック</th>
                                <th className={`${thClass} ${colW.cv}`}>CV</th>
                                <th className={`${thClass} ${colW.ctr}`}>CTR</th>
                                <th className={`${thClass} ${colW.mcvr}`}>MCVR</th>
                                <th className={`${thClass} ${colW.cvr}`}>CVR</th>
                                <th className={`${thClass} ${colW.cpm}`}>CPM</th>
                                <th className={`${thClass} ${colW.cpc}`}>CPC</th>
                                <th className={`${thClass} ${colW.mcpa}`}>MCPA</th>
                                <th className={`${thClass} ${colW.cpa}`}>CPA</th>
                                <th className={`${thClass} ${colW.fvExit}`}>FV離脱</th>
                                <th className={`${thClass} ${colW.svExit}`}>SV離脱</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, idx) => (
                                <tr key={`${row.date}-${row.campaign}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-600 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 ${colW.date}`}>{row.displayDate}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[104px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.campaign}</td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.imp}`}>{formatNumber(row.impressions)}</td>
                                    <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(row.clicks)}</td>
                                    <td className={`${tdClass} ${colW.lpClick}`}>{formatNumber(row.mcv)}</td>
                                    <td className={`${tdClass} ${colW.cv}`}>{formatNumber(row.cv)}</td>
                                    <td className={`${tdClass} ${colW.ctr}`}>{formatPercent(row.ctr)}</td>
                                    <td className={`${tdClass} ${colW.mcvr}`}>{formatPercent(row.mcvr)}</td>
                                    <td className={`${tdClass} ${colW.cvr}`}>{formatPercent(row.cvr)}</td>
                                    <td className={`${tdClass} ${colW.cpm}`}>{formatNumber(row.cpm)}円</td>
                                    <td className={`${tdClass} ${colW.cpc}`}>{formatNumber(row.cpc)}円</td>
                                    <td className={`${tdClass} ${colW.mcpa}`}>{formatNumber(row.mcpa)}円</td>
                                    <td className={`${tdClass} ${colW.cpa}`}>{formatNumber(row.cpa)}円</td>
                                    <td className={`${tdClass} ${colW.fvExit}`}>{formatPercent(row.fvExitRate)}</td>
                                    <td className={`${tdClass} ${colW.svExit}`}>{formatPercent(row.svExitRate)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
