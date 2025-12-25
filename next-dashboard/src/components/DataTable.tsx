'use client';

import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface DataTableProps {
    data: ProcessedRow[];
    title: string;
    viewMode: 'total' | 'meta' | 'beyond';
}

interface TableRow {
    campaign: string;
    cost: number;
    revenue: number;
    profit: number;
    recoveryRate: number;
    roas: number;
    impressions: number;
    clicks: number;
    mcv: number;
    cv: number;
    ctr: number;
    mcvr: number;
    cvr: number;
    cpm: number;
    cpc: number;
    mcpa: number;
    cpa: number;
    pv: number;
    fvExit: number;
    svExit: number;
    fvExitRate: number;
    svExitRate: number;
    totalExitRate: number;
}

function aggregateByCampaign(data: ProcessedRow[], viewMode: 'total' | 'meta' | 'beyond'): TableRow[] {
    const metaData = data.filter(row => row.Media === 'Meta');
    const beyondData = data.filter(row => row.Media === 'Beyond');

    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];

    return campaigns.map(campaign => {
        const metaCampaign = metaData.filter(row => row.Campaign_Name === campaign);
        const beyondCampaign = beyondData.filter(row => row.Campaign_Name === campaign);

        // Meta aggregations
        const metaCost = metaCampaign.reduce((sum, row) => sum + row.Cost, 0);
        const impressions = metaCampaign.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaCampaign.reduce((sum, row) => sum + row.Clicks, 0);
        const mcv = metaCampaign.reduce((sum, row) => sum + row.MCV, 0);

        // Beyond aggregations
        const beyondCost = beyondCampaign.reduce((sum, row) => sum + row.Cost, 0);
        const pv = beyondCampaign.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicks = beyondCampaign.reduce((sum, row) => sum + row.Clicks, 0);
        const cv = beyondCampaign.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondCampaign.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondCampaign.reduce((sum, row) => sum + row.SV_Exit, 0);

        // Revenue is already calculated in ProcessedRow
        const beyondRevenue = beyondCampaign.reduce((sum, row) => sum + row.Revenue, 0);
        const metaRevenue = metaCampaign.reduce((sum, row) => sum + row.Revenue, 0);
        const revenue = beyondRevenue + metaRevenue;

        const displayCost = viewMode === 'meta' ? metaCost : beyondCost;
        const profit = revenue - displayCost;

        return {
            campaign,
            cost: displayCost,
            revenue,
            profit,
            recoveryRate: safeDivide(revenue, displayCost) * 100,
            roas: safeDivide(profit, revenue) * 100,
            impressions,
            clicks: viewMode === 'beyond' ? beyondClicks : metaClicks,
            mcv: beyondClicks,
            cv,
            ctr: safeDivide(metaClicks, impressions) * 100,
            mcvr: safeDivide(beyondClicks, pv) * 100,
            cvr: safeDivide(cv, beyondClicks) * 100,
            cpm: safeDivide(metaCost, impressions) * 1000,
            cpc: safeDivide(metaCost, metaClicks),
            mcpa: safeDivide(beyondCost, beyondClicks),
            cpa: safeDivide(beyondCost, cv),
            pv,
            fvExit,
            svExit,
            fvExitRate: safeDivide(fvExit, pv) * 100,
            svExitRate: safeDivide(svExit, pv - fvExit) * 100,
            totalExitRate: safeDivide(fvExit + svExit, pv) * 100,
        };
    }).sort((a, b) => a.campaign.localeCompare(b.campaign));
}

function formatNumber(value: number, decimals = 0): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

export function DataTable({ data, title, viewMode }: DataTableProps) {
    const rows = aggregateByCampaign(data, viewMode);

    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <p className="text-gray-400 text-sm">データなし</p>
            </div>
        );
    }

    const thClass = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
    const tdClass = "px-3 py-2 text-sm text-gray-700 whitespace-nowrap";

    if (viewMode === 'meta') {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={thClass}>案件名</th>
                            <th className={thClass}>出稿金額</th>
                            <th className={thClass}>Imp</th>
                            <th className={thClass}>Clicks</th>
                            <th className={thClass}>CV</th>
                            <th className={thClass}>CTR</th>
                            <th className={thClass}>CPM</th>
                            <th className={thClass}>CPC</th>
                            <th className={thClass}>CPA</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row) => (
                            <tr key={row.campaign} className="hover:bg-gray-50">
                                <td className={tdClass}>{row.campaign}</td>
                                <td className={tdClass}>{formatNumber(row.cost)}</td>
                                <td className={tdClass}>{formatNumber(row.impressions)}</td>
                                <td className={tdClass}>{formatNumber(row.clicks)}</td>
                                <td className={tdClass}>{formatNumber(row.cv)}</td>
                                <td className={tdClass}>{formatPercent(row.ctr)}</td>
                                <td className={tdClass}>{formatNumber(row.cpm)}</td>
                                <td className={tdClass}>{formatNumber(row.cpc)}</td>
                                <td className={tdClass}>{formatNumber(row.cpa)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    if (viewMode === 'beyond') {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={thClass}>案件名</th>
                            <th className={thClass}>出稿金額</th>
                            <th className={thClass}>PV</th>
                            <th className={thClass}>Clicks</th>
                            <th className={thClass}>CV</th>
                            <th className={thClass}>MCVR</th>
                            <th className={thClass}>CVR</th>
                            <th className={thClass}>CPC</th>
                            <th className={thClass}>CPA</th>
                            <th className={thClass}>FV離脱</th>
                            <th className={thClass}>SV離脱</th>
                            <th className={thClass}>Total離脱</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row) => (
                            <tr key={row.campaign} className="hover:bg-gray-50">
                                <td className={tdClass}>{row.campaign}</td>
                                <td className={tdClass}>{formatNumber(row.cost)}</td>
                                <td className={tdClass}>{formatNumber(row.pv)}</td>
                                <td className={tdClass}>{formatNumber(row.clicks)}</td>
                                <td className={tdClass}>{formatNumber(row.cv)}</td>
                                <td className={tdClass}>{formatPercent(row.mcvr)}</td>
                                <td className={tdClass}>{formatPercent(row.cvr)}</td>
                                <td className={tdClass}>{formatNumber(row.cpc)}</td>
                                <td className={tdClass}>{formatNumber(row.cpa)}</td>
                                <td className={tdClass}>{formatPercent(row.fvExitRate)}</td>
                                <td className={tdClass}>{formatPercent(row.svExitRate)}</td>
                                <td className={tdClass}>{formatPercent(row.totalExitRate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // Total view
    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className={thClass}>案件名</th>
                        <th className={thClass}>出稿金額</th>
                        <th className={thClass}>売上</th>
                        <th className={thClass}>粗利</th>
                        <th className={thClass}>回収率</th>
                        <th className={thClass}>ROAS</th>
                        <th className={thClass}>Imp</th>
                        <th className={thClass}>Clicks</th>
                        <th className={thClass}>商品LPクリック</th>
                        <th className={thClass}>CV</th>
                        <th className={thClass}>CTR</th>
                        <th className={thClass}>MCVR</th>
                        <th className={thClass}>CVR</th>
                        <th className={thClass}>CPM</th>
                        <th className={thClass}>CPC</th>
                        <th className={thClass}>MCPA</th>
                        <th className={thClass}>CPA</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                        <tr key={row.campaign} className="hover:bg-gray-50">
                            <td className={tdClass}>{row.campaign}</td>
                            <td className={tdClass}>{formatNumber(row.cost)}</td>
                            <td className={tdClass}>{formatNumber(row.revenue)}</td>
                            <td className={tdClass}>{formatNumber(row.profit)}</td>
                            <td className={tdClass}>{formatPercent(row.recoveryRate)}</td>
                            <td className={tdClass}>{formatPercent(row.roas)}</td>
                            <td className={tdClass}>{formatNumber(row.impressions)}</td>
                            <td className={tdClass}>{formatNumber(row.clicks)}</td>
                            <td className={tdClass}>{formatNumber(row.mcv)}</td>
                            <td className={tdClass}>{formatNumber(row.cv)}</td>
                            <td className={tdClass}>{formatPercent(row.ctr)}</td>
                            <td className={tdClass}>{formatPercent(row.mcvr)}</td>
                            <td className={tdClass}>{formatPercent(row.cvr)}</td>
                            <td className={tdClass}>{formatNumber(row.cpm)}</td>
                            <td className={tdClass}>{formatNumber(row.cpc)}</td>
                            <td className={tdClass}>{formatNumber(row.mcpa)}</td>
                            <td className={tdClass}>{formatNumber(row.cpa)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
