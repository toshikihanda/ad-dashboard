'use client';

import { useMemo, useState } from 'react';
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface RankingPanelProps {
    data: ProcessedRow[];
    selectedCampaign: string | string[];
    isVersionFilterActive?: boolean;
}

interface RankingItem {
    campaignName: string;
    versionName: string;
    creative: string;
    cost: number;
    revenue: number;
    profit: number;
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
    fvExit: number;
    svExit: number;
    fvExitRate: number;
    svExitRate: number;
    date?: string;
}

type PeriodType = 'today' | '3days' | '7days' | '30days' | 'bestday';
type SortType = keyof RankingItem;

const PERIODS: { key: PeriodType; label: string }[] = [
    { key: 'today', label: '当日' },
    { key: '3days', label: '直近3日' },
    { key: '7days', label: '直近7日' },
    { key: '30days', label: '直近30日' },
    { key: 'bestday', label: 'ベストデイ' },
];

const SORT_OPTIONS: { key: SortType; label: string }[] = [
    { key: 'cpa', label: 'CPA順' },
    { key: 'cv', label: 'CV数順' },
];

// デフォルトのソート順序判定（小さい方が良い指標はasc、大きい方が良い指標はdesc）
function getDefaultSortOrder(key: SortType): 'asc' | 'desc' {
    const ascMetrics = ['cpa', 'cpc', 'cpm', 'mcpa', 'fvExitRate', 'svExitRate'];
    return ascMetrics.includes(key) ? 'asc' : 'desc';
}

function formatDateStr(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function filterByPeriod(data: ProcessedRow[], period: PeriodType): ProcessedRow[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateStr(today);

    let startDate: Date;

    switch (period) {
        case 'today':
            startDate = today;
            break;
        case '3days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 2);
            break;
        case '7days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            break;
        case '30days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            break;
        case 'bestday':
            return data;
        default:
            startDate = today;
    }

    const startDateStr = formatDateStr(startDate);

    return data.filter(row => {
        const rowDate = new Date(row.Date);
        rowDate.setHours(0, 0, 0, 0);
        const rowDateStr = formatDateStr(rowDate);
        return rowDateStr >= startDateStr && rowDateStr <= todayStr;
    });
}

// 広告名からクリエイティブID(bt...)を抽出
// function extractCreativeId(adName: string | undefined): string | null { ... } // Removed in favor of dataProcessor's logic

function aggregateRows(rows: ProcessedRow[], isVersionFilterActive: boolean): RankingItem {
    const metaRows = rows.filter(r => r.Media === 'Meta');
    const beyondRows = rows.filter(r => r.Media === 'Beyond');

    // Meta集計
    const totalImpressions = metaRows.reduce((sum, row) => sum + row.Impressions, 0);
    const metaClicks = metaRows.reduce((sum, row) => sum + row.Clicks, 0);
    const metaCost = metaRows.reduce((sum, row) => sum + row.Cost, 0);

    // Beyond集計
    const beyondCost = beyondRows.reduce((sum, row) => sum + row.Cost, 0);
    const totalRevenue = beyondRows.reduce((sum, row) => sum + row.Revenue, 0);
    const totalProfit = beyondRows.reduce((sum, row) => sum + row.Gross_Profit, 0);
    const totalPV = beyondRows.reduce((sum, row) => sum + row.PV, 0);
    const beyondClicks = beyondRows.reduce((sum, row) => sum + row.Clicks, 0);
    const totalCV = beyondRows.reduce((sum, row) => sum + row.CV, 0);
    const totalFvExit = beyondRows.reduce((sum, row) => sum + row.FV_Exit, 0);
    const totalSvExit = beyondRows.reduce((sum, row) => sum + row.SV_Exit, 0);

    // 表示用項目: 出稿金額はBeyond、売上はBeyond、MetaからはImpとClicksを持ってくる
    const firstBeyond = beyondRows[0];
    const displayCost = beyondCost > 0 ? beyondCost : metaCost;

    return {
        campaignName: firstBeyond?.Campaign_Name || metaRows[0]?.Campaign_Name || '(未設定)',
        versionName: firstBeyond?.version_name || '-',
        creative: firstBeyond?.creative_value || metaRows[0]?.creative_value || '-',
        cost: displayCost,
        revenue: totalRevenue,
        profit: totalProfit,
        roas: Math.floor(safeDivide(totalRevenue, displayCost) * 100),
        impressions: isVersionFilterActive ? -1 : totalImpressions,
        clicks: isVersionFilterActive ? totalPV : metaClicks, // Clicks = Meta Link Clicks
        mcv: beyondClicks, // 商品LP CLICK = Beyond click
        cv: totalCV,
        ctr: isVersionFilterActive ? -1 : (safeDivide(metaClicks, totalImpressions) * 100),
        mcvr: safeDivide(beyondClicks, totalPV) * 100,
        cvr: safeDivide(totalCV, beyondClicks) * 100,
        cpm: isVersionFilterActive ? -1 : (safeDivide(metaCost, totalImpressions) * 1000),
        cpc: safeDivide(displayCost, isVersionFilterActive ? totalPV : metaClicks),
        mcpa: safeDivide(displayCost, beyondClicks),
        cpa: totalCV > 0 ? displayCost / totalCV : Infinity,
        fvExit: totalFvExit,
        svExit: totalSvExit,
        fvExitRate: safeDivide(totalFvExit, totalPV) * 100,
        svExitRate: safeDivide(totalSvExit, totalPV - totalFvExit) * 100,
    };
}

function calculateBestDayRanking(allData: ProcessedRow[], sortBy: SortType, sortOrder: 'asc' | 'desc', isVersionFilterActive: boolean): RankingItem[] {
    const grouped: Record<string, ProcessedRow[]> = {};

    // 1. 日付 × 組み合わせ(Beyond基準) でグループ化
    const beyondData = allData.filter(r => r.Media === 'Beyond');
    for (const row of beyondData) {
        const dateStr = formatDateStr(new Date(row.Date));
        const key = `${dateStr}|||${row.Campaign_Name}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
    }

    // 2. Metaデータを紐付け
    const metaData = allData.filter(r => r.Media === 'Meta');
    for (const row of metaData) {
        const dateStr = formatDateStr(new Date(row.Date));
        // Use pre-processed creative_value from dataProcessor
        const creativeId = row.creative_value;
        if (!creativeId) continue;

        for (const [key, rows] of Object.entries(grouped)) {
            const [dateInKey, campInKey, , creativeInKey] = key.split('|||');
            if (dateInKey === dateStr && campInKey === row.Campaign_Name && creativeInKey === creativeId) {
                rows.push(row);
            }
        }
    }

    const allRecords = Object.entries(grouped).map(([key, rows]) => {
        const date = key.split('|||')[0];
        const item = aggregateRows(rows, isVersionFilterActive);
        item.date = date;
        return item;
    });

    const filtered = allRecords.filter(item => item.cv >= 1 && item.cost > 0);

    const sorted = filtered.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        const aNum = (typeof aVal === 'number') ? aVal : 0;
        const bNum = (typeof bVal === 'number') ? bVal : 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return sorted.slice(0, 10);
}

function calculateRanking(data: ProcessedRow[], period: PeriodType, sortBy: SortType, sortOrder: 'asc' | 'desc', isVersionFilterActive: boolean): RankingItem[] {
    const filteredData = period === 'bestday' ? data : filterByPeriod(data, period);

    if (period === 'bestday') {
        return calculateBestDayRanking(filteredData, sortBy, sortOrder, isVersionFilterActive);
    }

    const grouped: Record<string, ProcessedRow[]> = {};

    const beyondData = filteredData.filter(r => r.Media === 'Beyond');
    for (const row of beyondData) {
        // 商材とバージョンの組み合わせをキーにする (Creativeは一旦無視で集約することになるが、要件次第)
        // 元のコードでは creative_value もキーに含めているのでそれに従う
        const key = `${row.Campaign_Name}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
    }

    const metaData = filteredData.filter(r => r.Media === 'Meta');
    for (const row of metaData) {
        // Use pre-processed creative_value from dataProcessor
        const creativeId = row.creative_value;
        if (!creativeId) continue;

        for (const [key, rows] of Object.entries(grouped)) {
            const [campInKey, , creativeInKey] = key.split('|||');
            if (creativeInKey === creativeId && campInKey === row.Campaign_Name) {
                rows.push(row);
            }
        }
    }

    const aggregated = Object.values(grouped).map(rows => aggregateRows(rows, isVersionFilterActive));
    const filtered = aggregated.filter(item => item.cv >= 1 && item.cost > 0);

    const sorted = filtered.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        const aNum = (typeof aVal === 'number') ? aVal : 0;
        const bNum = (typeof bVal === 'number') ? bVal : 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return sorted.slice(0, 10);
}

function formatNumber(value: number): string {
    if (value === -1 || !isFinite(value) || isNaN(value)) return '-';
    return Math.round(value).toLocaleString('ja-JP');
}

function formatPercent(value: number): string {
    if (value === -1 || !isFinite(value) || isNaN(value)) return '-';
    return value.toFixed(1) + '%';
}

function getRankIcon(rank: number): string {
    switch (rank) {
        case 1: return '🥇';
        case 2: return '🥈';
        case 3: return '🥉';
        default: return String(rank);
    }
}

interface RankingTableProps {
    ranking: RankingItem[];
    showDate: boolean;
    sortKey: SortType;
    sortOrder: 'asc' | 'desc';
    onSort: (key: SortType) => void;
}

function RankingTable({ ranking, showDate, sortKey, sortOrder, onSort }: RankingTableProps) {
    const getSortIcon = (key: SortType) => {
        if (sortKey !== key) return '';
        return sortOrder === 'asc' ? ' ▲' : ' ▼';
    };

    if (ranking.length === 0) {
        return (
            <div className="text-center py-8 text-gray-400 text-sm">
                データがありません
            </div>
        );
    }

    const colW = {
        rank: 'w-[24px]',
        label: 'w-[110px]',
        date: 'w-[70px]',
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
    };

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

    return (
        <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm table-fixed" style={{ minWidth: '1150px' }}>
                <thead>
                    <tr className="bg-gray-50">
                        <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                        <th onClick={() => onSort('creative')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>商材/記事×クリエイティブ{getSortIcon('creative')}</th>
                        {showDate && <th onClick={() => onSort('date')} className={`${thClass} text-left ${colW.date}`}>日付{getSortIcon('date')}</th>}
                        <th onClick={() => onSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                        <th onClick={() => onSort('revenue')} className={`${thClass} ${colW.revenue}`}>売上{getSortIcon('revenue')}</th>
                        <th onClick={() => onSort('profit')} className={`${thClass} ${colW.profit}`}>粗利{getSortIcon('profit')}</th>
                        <th onClick={() => onSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>
                        <th onClick={() => onSort('impressions')} className={`${thClass} ${colW.imp}`}>Imp{getSortIcon('impressions')}</th>
                        <th onClick={() => onSort('clicks')} className={`${thClass} ${colW.clicks}`}>Clicks{getSortIcon('clicks')}</th>
                        <th onClick={() => onSort('mcv')} className={`${thClass} ${colW.lpClick}`}>商品LPクリック{getSortIcon('mcv')}</th>
                        <th onClick={() => onSort('cv')} className={`${thClass} ${colW.cv}`}>CV{getSortIcon('cv')}</th>
                        <th onClick={() => onSort('ctr')} className={`${thClass} ${colW.ctr}`}>CTR{getSortIcon('ctr')}</th>
                        <th onClick={() => onSort('mcvr')} className={`${thClass} ${colW.mcvr}`}>MCVR{getSortIcon('mcvr')}</th>
                        <th onClick={() => onSort('cvr')} className={`${thClass} ${colW.cvr}`}>CVR{getSortIcon('cvr')}</th>
                        <th onClick={() => onSort('cpm')} className={`${thClass} ${colW.cpm}`}>CPM{getSortIcon('cpm')}</th>
                        <th onClick={() => onSort('cpc')} className={`${thClass} ${colW.cpc}`}>CPC{getSortIcon('cpc')}</th>
                        <th onClick={() => onSort('mcpa')} className={`${thClass} ${colW.mcpa}`}>MCPA{getSortIcon('mcpa')}</th>
                        <th onClick={() => onSort('cpa')} className={`${thClass} ${colW.cpa}`}>CPA{getSortIcon('cpa')}</th>
                        <th onClick={() => onSort('fvExitRate')} className={`${thClass} ${colW.fvExit}`}>FV離脱{getSortIcon('fvExitRate')}</th>
                        <th onClick={() => onSort('svExitRate')} className={`${thClass} ${colW.svExit}`}>SV離脱{getSortIcon('svExitRate')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {ranking.map((item, idx) => (
                        <tr key={`${item.campaignName}-${item.creative}-${item.date || idx}`} className="hover:bg-gray-50 group">
                            <td className={`px-1 py-1 text-center border-r border-gray-100 sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 font-medium ${colW.rank}`}>
                                {getRankIcon(idx + 1)}
                            </td>
                            <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100 ${colW.label}`}>
                                <div className="font-bold truncate text-blue-600 mb-0.5">{item.campaignName}</div>
                                <div className="text-[9px] text-gray-500 truncate">{item.versionName} × {item.creative}</div>
                            </td>
                            {showDate && <td className={`${tdClass} text-left ${colW.date}`}>{item.date?.replace(/-/g, '/')}</td>}
                            <td className={`${tdClass} ${colW.cost} font-bold`}>{formatNumber(item.cost)}円</td>
                            <td className={`${tdClass} ${colW.revenue}`}>{formatNumber(item.revenue)}円</td>
                            <td className={`${tdClass} ${colW.profit}`}>{formatNumber(item.profit)}円</td>
                            <td className={`${tdClass} ${colW.roas}`}>{item.roas}%</td>
                            <td className={`${tdClass} ${colW.imp}`}>{formatNumber(item.impressions)}</td>
                            <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(item.clicks)}</td>
                            <td className={`${tdClass} ${colW.lpClick}`}>{formatNumber(item.mcv)}</td>
                            <td className={`${tdClass} ${colW.cv} font-bold text-orange-600`}>{formatNumber(item.cv)}</td>
                            <td className={`${tdClass} ${colW.ctr}`}>{formatPercent(item.ctr)}</td>
                            <td className={`${tdClass} ${colW.mcvr}`}>{formatPercent(item.mcvr)}</td>
                            <td className={`${tdClass} ${colW.cvr}`}>{formatPercent(item.cvr)}</td>
                            <td className={`${tdClass} ${colW.cpm}`}>{formatNumber(item.cpm)}円</td>
                            <td className={`${tdClass} ${colW.cpc}`}>{formatNumber(item.cpc)}円</td>
                            <td className={`${tdClass} ${colW.mcpa}`}>{formatNumber(item.mcpa)}円</td>
                            <td className={`${tdClass} ${colW.cpa} font-bold text-orange-600`}>{formatNumber(item.cpa)}円</td>
                            <td className={`${tdClass} ${colW.fvExit}`}>{formatPercent(item.fvExitRate)}</td>
                            <td className={`${tdClass} ${colW.svExit}`}>{formatPercent(item.svExitRate)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function RankingPanel({ data, selectedCampaign, isVersionFilterActive = false }: RankingPanelProps) {
    const [period, setPeriod] = useState<PeriodType>('today');
    const [sortBy, setSortBy] = useState<SortType>('cpa');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleSort = (key: SortType) => {
        if (sortBy !== key) {
            setSortBy(key);
            setSortOrder(getDefaultSortOrder(key));
        } else {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        }
    };

    const handleButtonClick = (key: SortType) => {
        setSortBy(key);
        setSortOrder(getDefaultSortOrder(key));
    };

    const rankingData = useMemo(() => {
        // Data passed is already filtered by campaign in parent
        return calculateRanking(data, period, sortBy, sortOrder, isVersionFilterActive);
    }, [data, period, sortBy, sortOrder, isVersionFilterActive]);

    const displayCampaignName = Array.isArray(selectedCampaign)
        ? (selectedCampaign.length === 0 ? 'All' : (selectedCampaign.length > 1 ? `${selectedCampaign.length}件選択中` : selectedCampaign[0]))
        : selectedCampaign;

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <h2 className="text-base md:text-lg font-bold text-gray-800">ランキング（記事 × クリエイティブ）</h2>
                    {displayCampaignName !== 'All' && (
                        <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full font-medium truncate max-w-[150px]" title={Array.isArray(selectedCampaign) ? selectedCampaign.join(', ') : selectedCampaign}>
                            {displayCampaignName}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-gray-50 p-1 rounded-lg border border-gray-200">
                        <span className="text-[10px] text-gray-400 px-2 font-bold uppercase tracking-wider">ソート:</span>
                        <div className="flex gap-1">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => handleButtonClick(opt.key)}
                                    className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${sortBy === opt.key
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-500 hover:bg-white hover:text-gray-700'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center bg-gray-50 p-1 rounded-lg border border-gray-200 overflow-x-auto no-scrollbar max-w-full">
                        <span className="text-[10px] text-gray-400 px-2 font-bold uppercase tracking-wider">期間:</span>
                        <div className="flex gap-1 whitespace-nowrap">
                            {PERIODS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setPeriod(p.key)}
                                    className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${period === p.key
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-500 hover:bg-white hover:text-gray-700'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <RankingTable ranking={rankingData} showDate={period === 'bestday'} sortKey={sortBy} sortOrder={sortOrder} onSort={handleSort} />
        </div>
    );
}

