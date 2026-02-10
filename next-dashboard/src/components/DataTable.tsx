'use client';

import { useState } from 'react';
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
    roas: number; // 旧回収率
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
// 組み合わせごとの集計
function aggregateByCombination(data: ProcessedRow[], filters: FilterSelection, viewMode: 'total' | 'meta' | 'beyond', isVersionFilterActive: boolean): TableRow[] {
    const combinations = generateCombinations(filters);

    // フィルターがない場合はキャンペーン別表示
    if (combinations.length === 0) {
        return aggregateByCampaign(data, viewMode, isVersionFilterActive);
    }

    return combinations.map(combination => {
        const filteredData = filterByCombination(data, combination);
        return aggregateData(filteredData, combination.label, viewMode, isVersionFilterActive);
    });
}

// データの集計
function aggregateData(data: ProcessedRow[], label: string, viewMode: 'total' | 'meta' | 'beyond', isVersionFilterActive: boolean): TableRow {
    const metaData = data.filter(row => row.Media === 'Meta');
    const beyondData = data.filter(row => row.Media === 'Beyond');

    // Meta aggregations
    const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
    const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
    const metaClicksRaw = metaData.reduce((sum, row) => sum + row.Clicks, 0);
    const mcv = metaData.reduce((sum, row) => sum + row.MCV, 0);

    // Beyond aggregations
    const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
    const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
    const beyondClicksRaw = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
    const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
    const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
    const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

    // Revenue and Profit are already calculated in ProcessedRow
    const beyondRevenue = beyondData.reduce((sum, row) => sum + row.Revenue, 0);
    const metaRevenue = metaData.reduce((sum, row) => sum + row.Revenue, 0);
    const revenue = beyondRevenue + metaRevenue;
    const beyondProfit = beyondData.reduce((sum, row) => sum + row.Gross_Profit, 0);
    const metaProfit = metaData.reduce((sum, row) => sum + row.Gross_Profit, 0);
    const profit = beyondProfit + metaProfit;

    const displayCost = viewMode === 'meta' ? metaCost : beyondCost;

    // version_name フィルター時は PV をクリックとして扱う
    const displayMetaClicks = isVersionFilterActive ? pv : metaClicksRaw;
    const displayBeyondClicks = beyondClicksRaw; // 商品LPクリック（遷移）は維持

    // CPC計算の統一: version_name フィルター時は恒常的に Beyond出稿金額 / PV
    const unifiedCPC = isVersionFilterActive
        ? safeDivide(beyondCost, pv)
        : (viewMode === 'beyond' ? safeDivide(beyondCost, pv) : safeDivide(metaCost, displayMetaClicks));

    return {
        label,
        cost: displayCost,
        revenue,
        profit,
        roas: Math.floor(safeDivide(revenue, displayCost) * 100), // 回収率ベースのROAS
        impressions: isVersionFilterActive ? -1 : impressions,
        clicks: viewMode === 'beyond' ? beyondClicksRaw : displayMetaClicks,
        mcv: displayBeyondClicks,
        cv,
        ctr: isVersionFilterActive ? -1 : (safeDivide(displayMetaClicks, impressions) * 100),
        mcvr: safeDivide(displayBeyondClicks, pv) * 100,
        cvr: safeDivide(cv, displayBeyondClicks) * 100,
        cpm: isVersionFilterActive ? -1 : (safeDivide(metaCost, impressions) * 1000),
        cpc: unifiedCPC,
        mcpa: safeDivide(beyondCost, displayBeyondClicks),
        cpa: safeDivide(beyondCost, cv),
        pv,
        fvExit,
        svExit,
        fvExitRate: safeDivide(fvExit, pv) * 100,
        svExitRate: safeDivide(svExit, pv - fvExit) * 100,
        totalExitRate: safeDivide(fvExit + svExit, pv) * 100,
    };
}

function aggregateByCampaign(data: ProcessedRow[], viewMode: 'total' | 'meta' | 'beyond', isVersionFilterActive: boolean): TableRow[] {
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];

    return campaigns.map(campaign => {
        const campaignData = data.filter(row => row.Campaign_Name === campaign);
        return aggregateData(campaignData, campaign, viewMode, isVersionFilterActive);
    }).sort((a, b) => a.label.localeCompare(b.label));
}

function formatNumber(value: number, decimals = 0): string {
    if (value === -1 || isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (value === -1 || isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

export function DataTable({ data, title, viewMode, filters }: DataTableProps) {
    const defaultFilters: FilterSelection = { beyondPageNames: [], versionNames: [], creatives: [] };
    const isVersionFilterActive = filters && filters.versionNames && filters.versionNames.length > 0;
    const rawRows = aggregateByCombination(data, filters || defaultFilters, viewMode, isVersionFilterActive || false);

    // ゼロ行を除外: 基本的に出稿金額が発生している行のみ表示。金額0でもCVがあれば例外的に表示。
    const filteredRows = rawRows.filter(row => {
        return row.cost > 0 || row.cv > 0;
    });

    // ソート状態: null = デフォルト, 'asc' = 昇順, 'desc' = 降順
    const [sortKey, setSortKey] = useState<keyof TableRow | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

    // ソートヘッダークリックハンドラー
    const handleSort = (key: keyof TableRow) => {
        if (sortKey !== key) {
            // 新しい列をクリック: 昇順から開始
            setSortKey(key);
            setSortOrder('asc');
        } else if (sortOrder === 'asc') {
            // 昇順 → 降順
            setSortOrder('desc');
        } else if (sortOrder === 'desc') {
            // 降順 → デフォルト（ソート解除）
            setSortKey(null);
            setSortOrder(null);
        }
    };

    // ソートアイコンを取得
    const getSortIcon = (key: keyof TableRow) => {
        if (sortKey !== key) return '';
        if (sortOrder === 'asc') return ' ▲';
        if (sortOrder === 'desc') return ' ▼';
        return '';
    };

    // ソート適用
    const rows = [...filteredRows].sort((a, b) => {
        if (!sortKey || !sortOrder) return 0;
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        // 文字列の場合（label）
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        // 数値の場合
        const aNum = typeof aVal === 'number' ? aVal : 0;
        const bNum = typeof bVal === 'number' ? bVal : 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
    });

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
        roas: 'w-[60px]',
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

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

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
                                <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th onClick={() => handleSort('label')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{labelHeader}{getSortIcon('label')}</th>
                                <th onClick={() => handleSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                                <th onClick={() => handleSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>
                                <th onClick={() => handleSort('impressions')} className={`${thClass} ${colW.imp}`}>Imp{getSortIcon('impressions')}</th>
                                <th onClick={() => handleSort('clicks')} className={`${thClass} ${colW.clicks}`}>Clicks{getSortIcon('clicks')}</th>
                                <th onClick={() => handleSort('cv')} className={`${thClass} ${colW.cv}`}>CV{getSortIcon('cv')}</th>
                                <th onClick={() => handleSort('ctr')} className={`${thClass} ${colW.ctr}`}>CTR{getSortIcon('ctr')}</th>
                                <th onClick={() => handleSort('cpm')} className={`${thClass} ${colW.cpm}`}>CPM{getSortIcon('cpm')}</th>
                                <th onClick={() => handleSort('cpc')} className={`${thClass} ${colW.cpc}`}>CPC{getSortIcon('cpc')}</th>
                                <th onClick={() => handleSort('cpa')} className={`${thClass} ${colW.cpa}`}>CPA{getSortIcon('cpa')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, idx) => (
                                <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.label}</td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.roas} font-bold text-blue-600`}>{row.roas}%</td>
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
                                <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th onClick={() => handleSort('label')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{labelHeader}{getSortIcon('label')}</th>
                                <th onClick={() => handleSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                                <th onClick={() => handleSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>
                                <th onClick={() => handleSort('pv')} className={`${thClass} ${colW.pv}`}>PV{getSortIcon('pv')}</th>
                                <th onClick={() => handleSort('clicks')} className={`${thClass} ${colW.clicks}`}>Clicks{getSortIcon('clicks')}</th>
                                <th onClick={() => handleSort('cv')} className={`${thClass} ${colW.cv}`}>CV{getSortIcon('cv')}</th>
                                <th onClick={() => handleSort('mcvr')} className={`${thClass} ${colW.mcvr}`}>MCVR{getSortIcon('mcvr')}</th>
                                <th onClick={() => handleSort('cvr')} className={`${thClass} ${colW.cvr}`}>CVR{getSortIcon('cvr')}</th>
                                <th onClick={() => handleSort('cpc')} className={`${thClass} ${colW.cpc}`}>CPC{getSortIcon('cpc')}</th>
                                <th onClick={() => handleSort('cpa')} className={`${thClass} ${colW.cpa}`}>CPA{getSortIcon('cpa')}</th>
                                <th onClick={() => handleSort('fvExitRate')} className={`${thClass} ${colW.fvExit}`}>FV離脱{getSortIcon('fvExitRate')}</th>
                                <th onClick={() => handleSort('svExitRate')} className={`${thClass} ${colW.svExit}`}>SV離脱{getSortIcon('svExitRate')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, idx) => (
                                <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.label}</td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.roas} font-bold text-blue-600`}>{row.roas}%</td>
                                    <td className={`${tdClass} ${colW.pv}`}>{formatNumber(row.pv)}</td>
                                    <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(row.clicks)}</td>
                                    <td className={`${tdClass} ${colW.cv}`}>{formatNumber(row.cv)}</td>
                                    <td className={`${tdClass} ${colW.mcvr}`}>{formatPercent(row.mcvr)}</td>
                                    <td className={`${tdClass} ${colW.cvr}`}>{formatPercent(row.cvr)}</td>
                                    <td className={`${tdClass} ${colW.cpc}`}>{formatNumber(row.cpc)}円</td>
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

    // Total view
    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm table-fixed" style={{ minWidth: '1150px' }}>
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                            <th onClick={() => handleSort('label')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{labelHeader}{getSortIcon('label')}</th>
                            <th onClick={() => handleSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                            <th onClick={() => handleSort('revenue')} className={`${thClass} ${colW.revenue}`}>売上{getSortIcon('revenue')}</th>
                            <th onClick={() => handleSort('profit')} className={`${thClass} ${colW.profit}`}>粗利{getSortIcon('profit')}</th>
                            <th onClick={() => handleSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>
                            <th onClick={() => handleSort('impressions')} className={`${thClass} ${colW.imp}`}>Imp{getSortIcon('impressions')}</th>
                            <th onClick={() => handleSort('clicks')} className={`${thClass} ${colW.clicks}`}>Clicks{getSortIcon('clicks')}</th>
                            <th onClick={() => handleSort('mcv')} className={`${thClass} ${colW.lpClick}`}>商品LPクリック{getSortIcon('mcv')}</th>
                            <th onClick={() => handleSort('cv')} className={`${thClass} ${colW.cv}`}>CV{getSortIcon('cv')}</th>
                            <th onClick={() => handleSort('ctr')} className={`${thClass} ${colW.ctr}`}>CTR{getSortIcon('ctr')}</th>
                            <th onClick={() => handleSort('mcvr')} className={`${thClass} ${colW.mcvr}`}>MCVR{getSortIcon('mcvr')}</th>
                            <th onClick={() => handleSort('cvr')} className={`${thClass} ${colW.cvr}`}>CVR{getSortIcon('cvr')}</th>
                            <th onClick={() => handleSort('cpm')} className={`${thClass} ${colW.cpm}`}>CPM{getSortIcon('cpm')}</th>
                            <th onClick={() => handleSort('cpc')} className={`${thClass} ${colW.cpc}`}>CPC{getSortIcon('cpc')}</th>
                            <th onClick={() => handleSort('mcpa')} className={`${thClass} ${colW.mcpa}`}>MCPA{getSortIcon('mcpa')}</th>
                            <th onClick={() => handleSort('cpa')} className={`${thClass} ${colW.cpa}`}>CPA{getSortIcon('cpa')}</th>
                            <th onClick={() => handleSort('fvExitRate')} className={`${thClass} ${colW.fvExit}`}>FV離脱{getSortIcon('fvExitRate')}</th>
                            <th onClick={() => handleSort('svExitRate')} className={`${thClass} ${colW.svExit}`}>SV離脱{getSortIcon('svExitRate')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row, idx) => (
                            <tr key={`${row.label}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.label}</td>
                                <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                <td className={`${tdClass} ${colW.revenue}`}>{formatNumber(row.revenue)}円</td>
                                <td className={`${tdClass} ${colW.profit}`}>{formatNumber(row.profit)}円</td>
                                <td className={`${tdClass} ${colW.roas}`}>{row.roas}%</td>
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


