'use client';

import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface FilterSelection {
    beyondPageNames: string[];
    versionNames: string[];
    creatives: string[];
}

interface DataTableProps {
    data: ProcessedRow[];
    title: string;
    viewMode: 'total' | 'meta' | 'beyond';
    filters?: FilterSelection;
}

interface TableRow {
    label: string; // 組み合わせラベル or キャンペーン名
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

// 組み合わせを生成
function generateCombinations(filters: FilterSelection): Array<{
    beyondPageName: string | null;
    versionName: string | null;
    creative: string | null;
    label: string;
}> {
    const { beyondPageNames, versionNames, creatives } = filters;

    // 何も選択されていない場合は空（キャンペーン別表示を使用）
    if (beyondPageNames.length === 0 && versionNames.length === 0 && creatives.length === 0) {
        return [];
    }

    const pages = beyondPageNames.length > 0 ? beyondPageNames : [null];
    const versions = versionNames.length > 0 ? versionNames : [null];
    const creativesArr = creatives.length > 0 ? creatives : [null];

    const combinations: Array<{
        beyondPageName: string | null;
        versionName: string | null;
        creative: string | null;
        label: string;
    }> = [];

    for (const page of pages) {
        for (const version of versions) {
            for (const creative of creativesArr) {
                const parts = [page, version, creative].filter(Boolean);
                combinations.push({
                    beyondPageName: page,
                    versionName: version,
                    creative: creative,
                    label: parts.join(' × ') || '合計'
                });
            }
        }
    }

    return combinations;
}

// 組み合わせでデータをフィルタリング
function filterByCombination(
    data: ProcessedRow[],
    combination: { beyondPageName: string | null; versionName: string | null; creative: string | null }
): ProcessedRow[] {
    return data.filter(row => {
        if (combination.beyondPageName) {
            if (row.Media === 'Beyond' && row.beyond_page_name !== combination.beyondPageName) return false;
            if (row.Media === 'Meta' && !row.Creative.includes(combination.beyondPageName)) return false;
        }
        if (combination.versionName && row.version_name !== combination.versionName) return false;
        if (combination.creative) {
            if (row.Media === 'Beyond' && row.creative_value !== combination.creative) return false;
            if (row.Media === 'Meta' && !row.Creative.includes(combination.creative)) return false;
        }
        return true;
    });
}

// 組み合わせごとの集計
function aggregateByCombination(data: ProcessedRow[], filters: FilterSelection, viewMode: 'total' | 'meta' | 'beyond'): TableRow[] {
    const combinations = generateCombinations(filters);

    // フィルターがない場合はキャンペーン別表示
    if (combinations.length === 0) {
        return aggregateByCampaign(data, viewMode);
    }

    return combinations.map(combination => {
        const filteredData = filterByCombination(data, combination);
        return aggregateData(filteredData, combination.label, viewMode);
    });
}

// データの集計
function aggregateData(data: ProcessedRow[], label: string, viewMode: 'total' | 'meta' | 'beyond'): TableRow {
    const metaData = data.filter(row => row.Media === 'Meta');
    const beyondData = data.filter(row => row.Media === 'Beyond');

    // Meta aggregations
    const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
    const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
    const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);
    const mcv = metaData.reduce((sum, row) => sum + row.MCV, 0);

    // Beyond aggregations
    const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
    const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
    const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
    const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
    const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
    const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

    // Revenue and Profit are already calculated in ProcessedRow
    const beyondRevenue = beyondData.reduce((sum, row) => sum + row.Revenue, 0);
    const metaRevenue = metaData.reduce((sum, row) => sum + row.Revenue, 0);
    const revenue = beyondRevenue + metaRevenue;
    // IHの場合は粗利=売上となるため、ProcessedRowのGross_Profitを使用
    const beyondProfit = beyondData.reduce((sum, row) => sum + row.Gross_Profit, 0);
    const metaProfit = metaData.reduce((sum, row) => sum + row.Gross_Profit, 0);
    const profit = beyondProfit + metaProfit;

    const displayCost = viewMode === 'meta' ? metaCost : beyondCost;

    return {
        label,
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
}

function aggregateByCampaign(data: ProcessedRow[], viewMode: 'total' | 'meta' | 'beyond'): TableRow[] {
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];

    return campaigns.map(campaign => {
        const campaignData = data.filter(row => row.Campaign_Name === campaign);
        return aggregateData(campaignData, campaign, viewMode);
    }).sort((a, b) => a.label.localeCompare(b.label));
}

function formatNumber(value: number, decimals = 0): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

export function DataTable({ data, title, viewMode, filters }: DataTableProps) {
    const defaultFilters: FilterSelection = { beyondPageNames: [], versionNames: [], creatives: [] };
    const rows = aggregateByCombination(data, filters || defaultFilters, viewMode);

    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <p className="text-gray-400 text-sm">データなし</p>
            </div>
        );
    }

    const thClass = "px-3 py-2 text-left text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50";
    const tdClass = "px-3 py-2 text-xs md:text-sm text-gray-700 whitespace-nowrap";
    const stickyColClass = "sticky left-0 bg-inherit z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]";

    // ラベル列のヘッダーを動的に設定
    const hasCombinationFilter = filters && (filters.beyondPageNames.length > 0 || filters.versionNames.length > 0 || filters.creatives.length > 0);
    const labelHeader = hasCombinationFilter ? '組み合わせ' : '案件名';

    if (viewMode === 'meta') {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={`${thClass} ${stickyColClass}`}>{labelHeader}</th>
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
                        {rows.map((row, idx) => (
                            <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit">
                                <td className={`${tdClass} ${stickyColClass}`}>{row.label}</td>
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
                            <th className={`${thClass} ${stickyColClass}`}>{labelHeader}</th>
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
                        {rows.map((row, idx) => (
                            <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit">
                                <td className={`${tdClass} ${stickyColClass}`}>{row.label}</td>
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
                        <th className={`${thClass} ${stickyColClass}`}>{labelHeader}</th>
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
                        <th className={thClass}>FV離脱</th>
                        <th className={thClass}>SV離脱</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((row, idx) => (
                        <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit">
                            <td className={`${tdClass} ${stickyColClass}`}>{row.label}</td>
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
                            <td className={tdClass}>{formatPercent(row.fvExitRate)}</td>
                            <td className={tdClass}>{formatPercent(row.svExitRate)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
