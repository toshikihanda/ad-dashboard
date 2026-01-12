'use client';

import { useMemo, useState } from 'react';
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';
import { cn } from '@/lib/utils';

interface RankingPanelProps {
    data: ProcessedRow[];
    selectedCampaign: string;
}

interface RankingItem {
    campaignName: string;
    versionName: string;
    creative: string;
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
    fvExit: number;
    svExit: number;
    fvExitRate: number;
    svExitRate: number;
    date?: string;
}

type PeriodType = 'today' | '3days' | '7days' | '30days' | 'bestday';
type SortType = 'cpa' | 'cv';

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

function formatDateStr(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr: string): string {
    return dateStr.replace(/-/g, '/');
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

function aggregateRows(rows: ProcessedRow[]): RankingItem {
    const totalCost = rows.reduce((sum, row) => sum + row.Cost, 0);
    const totalRevenue = rows.reduce((sum, row) => sum + row.Revenue, 0);
    const totalProfit = rows.reduce((sum, row) => sum + row.Gross_Profit, 0);
    const totalPV = rows.reduce((sum, row) => sum + row.PV, 0);
    const totalClicks = rows.reduce((sum, row) => sum + row.Clicks, 0);
    const totalCV = rows.reduce((sum, row) => sum + row.CV, 0);
    const totalImpressions = rows.reduce((sum, row) => sum + row.Impressions, 0);
    const totalFvExit = rows.reduce((sum, row) => sum + row.FV_Exit, 0);
    const totalSvExit = rows.reduce((sum, row) => sum + row.SV_Exit, 0);

    return {
        campaignName: rows[0]?.Campaign_Name || '(未設定)',
        versionName: rows[0]?.version_name || '(未設定)',
        creative: rows[0]?.creative_value || '(未設定)',
        cost: totalCost,
        revenue: totalRevenue,
        profit: totalProfit,
        recoveryRate: safeDivide(totalRevenue, totalCost) * 100,
        roas: safeDivide(totalProfit, totalRevenue) * 100,
        impressions: totalImpressions,
        clicks: totalClicks,
        mcv: totalClicks,
        cv: totalCV,
        ctr: safeDivide(totalClicks, totalImpressions) * 100,
        mcvr: safeDivide(totalClicks, totalPV) * 100,
        cvr: safeDivide(totalCV, totalClicks) * 100,
        cpm: safeDivide(totalCost, totalImpressions) * 1000,
        cpc: safeDivide(totalCost, totalClicks),
        mcpa: safeDivide(totalCost, totalClicks),
        cpa: totalCV > 0 ? totalCost / totalCV : Infinity,
        fvExit: totalFvExit,
        svExit: totalSvExit,
        fvExitRate: safeDivide(totalFvExit, totalPV) * 100,
        svExitRate: safeDivide(totalSvExit, totalPV - totalFvExit) * 100,
    };
}

function calculateRanking(data: ProcessedRow[], period: PeriodType, sortBy: SortType): RankingItem[] {
    const beyondData = data.filter(row => row.Media === 'Beyond');

    if (period === 'bestday') {
        return calculateBestDayRanking(beyondData, sortBy);
    }

    const filteredData = filterByPeriod(beyondData, period);
    const grouped: Record<string, ProcessedRow[]> = {};

    for (const row of filteredData) {
        const key = `${row.Campaign_Name}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    const aggregated: RankingItem[] = Object.values(grouped).map(rows => aggregateRows(rows));
    const filtered = aggregated.filter(item => item.cv >= 1);

    let sorted;
    if (sortBy === 'cpa') {
        sorted = filtered.sort((a, b) => a.cpa - b.cpa);
    } else {
        sorted = filtered.sort((a, b) => b.cv - a.cv);
    }

    return sorted.slice(0, 10);
}

function calculateBestDayRanking(beyondData: ProcessedRow[], sortBy: SortType): RankingItem[] {
    const grouped: Record<string, ProcessedRow[]> = {};

    for (const row of beyondData) {
        const dateStr = formatDateStr(new Date(row.Date));
        const key = `${dateStr}|||${row.Campaign_Name}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    const allRecords: RankingItem[] = Object.entries(grouped).map(([key, rows]) => {
        const [date] = key.split('|||');
        const item = aggregateRows(rows);
        item.date = date;
        return item;
    });

    const filtered = allRecords.filter(item => item.cv >= 1);

    let sorted;
    if (sortBy === 'cpa') {
        sorted = filtered.sort((a, b) => a.cpa - b.cpa);
    } else {
        sorted = filtered.sort((a, b) => b.cv - a.cv);
    }

    return sorted.slice(0, 10);
}

function formatNumber(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '-';
    return Math.round(value).toLocaleString('ja-JP');
}

function formatPercent(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '-';
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
}

function RankingTable({ ranking, showDate }: RankingTableProps) {
    if (ranking.length === 0) {
        return (
            <div className="text-center py-8 text-gray-400 text-sm">
                データがありません
            </div>
        );
    }

    const thClass = "px-2 py-2 text-right text-[10px] md:text-xs font-medium text-gray-500 whitespace-nowrap bg-gray-50";
    const tdClass = "px-2 py-2 text-right text-xs text-gray-700 whitespace-nowrap";
    const stickyColClass = "sticky left-0 bg-inherit z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]";

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-8 sticky left-0 bg-gray-50 z-20">順位</th>
                        <th className={`${thClass} text-left sticky left-8 bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[140px] md:min-w-0`}>商材/記事×クリエイティブ</th>
                        {showDate && <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">日付</th>}
                        <th className={thClass}>出稿金額</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>売上</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>粗利</th>
                        <th className={cn(thClass, "hidden lg:table-cell")}>回収率</th>
                        <th className={cn(thClass, "hidden lg:table-cell")}>ROAS</th>
                        <th className={cn(thClass, "hidden lg:table-cell")}>Imp</th>
                        <th className={cn(thClass, "hidden lg:table-cell")}>Clicks</th>
                        <th className={cn(thClass, "hidden lg:table-cell")}>商品LPクリック</th>
                        <th className={thClass}>CV</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>CTR</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>MCVR</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>CVR</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>CPM</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>CPC</th>
                        <th className={cn(thClass, "hidden md:table-cell")}>MCPA</th>
                        <th className={thClass}>CPA</th>
                        <th className={cn(thClass, "hidden xl:table-cell")}>FV離脱</th>
                        <th className={cn(thClass, "hidden xl:table-cell")}>SV離脱</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {ranking.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 bg-inherit group">
                            <td className="px-2 py-2 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-transparent">
                                <span className={idx < 3 ? 'text-base' : 'text-sm text-gray-500'}>
                                    {getRankIcon(idx + 1)}
                                </span>
                            </td>
                            <td className={`px-2 py-2 text-right text-xs text-gray-700 whitespace-nowrap text-left sticky left-8 bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[140px] md:min-w-0`}>
                                <div className="whitespace-nowrap flex flex-col md:block">
                                    <span className="text-blue-600 font-medium truncate max-w-[120px] md:max-w-none block md:inline">{item.campaignName}</span>
                                    <div className="md:inline">
                                        <span className="text-gray-400 hidden md:inline"> / </span>
                                        <span className="text-gray-700 text-[10px] md:text-sm truncate max-w-[120px] md:max-w-none block md:inline">{item.versionName}</span>
                                    </div>
                                    <div className="md:inline">
                                        <span className="text-gray-400 mx-0.5 hidden md:inline">×</span>
                                        <span className="text-gray-500 text-[10px] md:text-xs truncate max-w-[120px] md:max-w-none block md:inline">{item.creative}</span>
                                    </div>
                                </div>
                            </td>
                            {showDate && (
                                <td className="px-2 py-2 text-gray-600 text-xs whitespace-nowrap">
                                    {item.date ? formatDisplayDate(item.date) : '-'}
                                </td>
                            )}
                            <td className={tdClass}>{formatNumber(item.cost)}円</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatNumber(item.revenue)}円</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatNumber(item.profit)}円</td>
                            <td className={cn(tdClass, "hidden lg:table-cell")}>{formatPercent(item.recoveryRate)}</td>
                            <td className={cn(tdClass, "hidden lg:table-cell")}>{formatPercent(item.roas)}</td>
                            <td className={cn(tdClass, "hidden lg:table-cell")}>{formatNumber(item.impressions)}</td>
                            <td className={cn(tdClass, "hidden lg:table-cell")}>{formatNumber(item.clicks)}</td>
                            <td className={cn(tdClass, "hidden lg:table-cell")}>{formatNumber(item.mcv)}</td>
                            <td className={`${tdClass} font-medium`}>{item.cv}</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatPercent(item.ctr)}</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatPercent(item.mcvr)}</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatPercent(item.cvr)}</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatNumber(item.cpm)}円</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatNumber(item.cpc)}円</td>
                            <td className={cn(tdClass, "hidden md:table-cell")}>{formatNumber(item.mcpa)}円</td>
                            <td className={`${tdClass} font-bold text-blue-600`}>{formatNumber(item.cpa)}円</td>
                            <td className={cn(tdClass, "hidden xl:table-cell")}>{formatPercent(item.fvExitRate)}</td>
                            <td className={cn(tdClass, "hidden xl:table-cell")}>{formatPercent(item.svExitRate)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function RankingPanel({ data, selectedCampaign }: RankingPanelProps) {
    const [sortBy, setSortBy] = useState<SortType>('cpa');
    const [period, setPeriod] = useState<PeriodType>('today');

    const filteredData = useMemo(() => {
        if (selectedCampaign === 'All') {
            return data;
        }
        return data.filter(row => row.Campaign_Name === selectedCampaign);
    }, [data, selectedCampaign]);

    const ranking = useMemo(() => {
        return calculateRanking(filteredData, period, sortBy);
    }, [filteredData, period, sortBy]);

    const isBestDay = period === 'bestday';

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-6">
            {/* Header with controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                {/* Title */}
                <div className="flex items-center gap-2 mr-auto">
                    <span className="text-lg">🏆</span>
                    <h3 className="text-sm font-bold text-gray-800">ランキング（記事 × クリエイティブ）</h3>
                    {selectedCampaign !== 'All' && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedCampaign}</span>
                    )}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-500 mr-1">ソート:</span>
                    {SORT_OPTIONS.map(option => (
                        <button
                            key={option.key}
                            onClick={() => setSortBy(option.key)}
                            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${sortBy === option.key
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {/* Period */}
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-500 mr-1">期間:</span>
                    {PERIODS.map(p => (
                        <button
                            key={p.key}
                            onClick={() => setPeriod(p.key)}
                            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${period === p.key
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <RankingTable ranking={ranking} showDate={isBestDay} />
        </div>
    );
}
