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
        cpc: viewMode === 'beyond' ? safeDivide(beyondCost, pv) : safeDivide(metaCost, metaClicks),
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

    // 固定列幅定義（RankingPanelと統一）
    const colW = {
        rank: 'w-[24px]',
        label: 'w-[110px]',
        cost: 'w-[75px]',
        revenue: 'w-[70px]',
        profit: 'w-[70px]',
        recoveryRate: 'w-[55px]',
        roas: 'w-[50px]',
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
        totalExit: 'w-[55px]',
        pv: 'w-[55px]',
    };

    const thClass = "px-1.5 py-1 text-right text-[9px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50";
    const tdClass = "px-1.5 py-1 text-right text-[9px] text-gray-700 whitespace-nowrap";

    // ラベル列のヘッダーを動的に設定
    const hasCombinationFilter = filters && (filters.beyondPageNames.length > 0 || filters.versionNames.length > 0 || filters.creatives.length > 0);
    const labelHeader = hasCombinationFilter ? '組み合わせ' : '商材';

    if (viewMode === 'meta') {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: '700px' }}>
                        <thead className="bg-gray-50">
                            <tr>
                                <th className={`px-1 py-1 text-center text-[9px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{labelHeader}</th>
                                <th className={`${thClass} ${colW.cost}`}>出稿金額</th>
                                <th className={`${thClass} ${colW.imp}`}>Imp</th>
                                <th className={`${thClass} ${colW.clicks}`}>Clicks</th>
                                <th className={`${thClass} ${colW.cv}`}>CV</th>
                                <th className={`${thClass} ${colW.ctr}`}>CTR</th>
                                <th className={`${thClass} ${colW.cpm}`}>CPM</th>
                                <th className={`${thClass} ${colW.cpc}`}>CPC</th>
                                <th className={`${thClass} ${colW.cpa}`}>CPA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, idx) => (
                                <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[9px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[9px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.label}</td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.imp}`}>{formatNumber(row.impressions)}</td>
                                    <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(row.clicks)}</td>
                                    <td className={`${tdClass} ${colW.cv}`}>{formatNumber(row.cv)}</td>
                                    <td className={`${tdClass} ${colW.ctr}`}>{formatPercent(row.ctr)}</td>
                                    <td className={`${tdClass} ${colW.cpm}`}>{formatNumber(row.cpm)}円</td>
                                    <td className={`${tdClass} ${colW.cpc}`}>{formatNumber(row.cpc)}円</td>
                                    <td className={`${tdClass} ${colW.cpa}`}>{formatNumber(row.cpa)}円</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (viewMode === 'beyond') {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: '850px' }}>
                        <thead className="bg-gray-50">
                            <tr>
                                <th className={`px-1 py-1 text-center text-[9px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{labelHeader}</th>
                                <th className={`${thClass} ${colW.cost}`}>出稿金額</th>
                                <th className={`${thClass} ${colW.pv}`}>PV</th>
                                <th className={`${thClass} ${colW.clicks}`}>Clicks</th>
                                <th className={`${thClass} ${colW.cv}`}>CV</th>
                                <th className={`${thClass} ${colW.mcvr}`}>MCVR</th>
                                <th className={`${thClass} ${colW.cvr}`}>CVR</th>
                                <th className={`${thClass} ${colW.cpc}`}>CPC</th>
                                <th className={`${thClass} ${colW.cpa}`}>CPA</th>
                                <th className={`${thClass} ${colW.fvExit}`}>FV離脱</th>
                                <th className={`${thClass} ${colW.svExit}`}>SV離脱</th>
                                <th className={`${thClass} ${colW.totalExit}`}>Total離脱</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, idx) => (
                                <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[9px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[9px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.label}</td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.pv}`}>{formatNumber(row.pv)}</td>
                                    <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(row.clicks)}</td>
                                    <td className={`${tdClass} ${colW.cv}`}>{formatNumber(row.cv)}</td>
                                    <td className={`${tdClass} ${colW.mcvr}`}>{formatPercent(row.mcvr)}</td>
                                    <td className={`${tdClass} ${colW.cvr}`}>{formatPercent(row.cvr)}</td>
                                    <td className={`${tdClass} ${colW.cpc}`}>{formatNumber(row.cpc)}円</td>
                                    <td className={`${tdClass} ${colW.cpa}`}>{formatNumber(row.cpa)}円</td>
                                    <td className={`${tdClass} ${colW.fvExit}`}>{formatPercent(row.fvExitRate)}</td>
                                    <td className={`${tdClass} ${colW.svExit}`}>{formatPercent(row.svExitRate)}</td>
                                    <td className={`${tdClass} ${colW.totalExit}`}>{formatPercent(row.totalExitRate)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // Total view
    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm table-fixed" style={{ minWidth: '1150px' }}>
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={`px-1 py-1 text-center text-[9px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                            <th className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{labelHeader}</th>
                            <th className={`${thClass} ${colW.cost}`}>出稿金額</th>
                            <th className={`${thClass} ${colW.revenue}`}>売上</th>
                            <th className={`${thClass} ${colW.profit}`}>粗利</th>
                            <th className={`${thClass} ${colW.recoveryRate}`}>回収率</th>
                            <th className={`${thClass} ${colW.roas}`}>ROAS</th>
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
                            <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[9px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                <td className={`px-1.5 py-1 text-left text-[9px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.label}</td>
                                <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                <td className={`${tdClass} ${colW.revenue}`}>{formatNumber(row.revenue)}円</td>
                                <td className={`${tdClass} ${colW.profit}`}>{formatNumber(row.profit)}円</td>
                                <td className={`${tdClass} ${colW.recoveryRate}`}>{formatPercent(row.recoveryRate)}</td>
                                <td className={`${tdClass} ${colW.roas}`}>{formatPercent(row.roas)}</td>
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
    );
}


