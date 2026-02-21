'use client';

// クライアント共有用ランキングパネル
// 売上・粗利・回収率・ROASは表示しない

import { useMemo, useState } from 'react';
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface ReportRankingPanelProps {
    data: ProcessedRow[];
    selectedCampaign: string;
    reportDays?: number; // レポートの期間日数（この日数以下のボタンのみ表示）
    isVersionFilterActive?: boolean;
}

interface RankingItem {
    campaignName: string;
    versionName: string;
    creative: string;
    cost: number;
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
    fvExitRate: number;
    svExitRate: number;
    date?: string;
}

type PeriodType = 'today' | '3days' | '7days' | '30days' | 'bestday';
type SortType = 'cpa' | 'cv';

// 各期間に必要な日数
const PERIOD_DAYS: Record<PeriodType, number> = {
    'today': 1,
    '3days': 3,
    '7days': 7,
    '30days': 30,
    'bestday': 1, // ベストデイは常に表示
};

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

function formatDateStr(date: Date | any): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
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

function aggregateRows(rows: ProcessedRow[], isVersionFilterActive: boolean): RankingItem {
    const totalCost = rows.reduce((sum, row) => sum + row.Cost, 0);
    const totalImpressions = rows.reduce((sum, row) => sum + row.Impressions, 0);
    const totalClicksRaw = rows.reduce((sum, row) => sum + row.Clicks, 0);
    const totalPV = rows.reduce((sum, row) => sum + row.PV, 0);
    const totalCV = rows.reduce((sum, row) => sum + row.CV, 0);
    const fvExit = rows.reduce((sum, row) => sum + row.FV_Exit, 0);
    const svExit = rows.reduce((sum, row) => sum + row.SV_Exit, 0);

    // version_name フィルター時は PV をクリック（入口）として扱う
    const displayEntryClicks = isVersionFilterActive ? totalPV : totalClicksRaw;
    const displayTransitionClicks = totalClicksRaw; // 商品LPクリックは維持

    return {
        campaignName: rows[0]?.Campaign_Name || '(未設定)',
        versionName: rows[0]?.version_name || '(未設定)',
        creative: rows[0]?.creative_value || '(未設定)',
        cost: totalCost,
        impressions: totalImpressions,
        clicks: displayEntryClicks,
        mcv: displayTransitionClicks,
        cv: totalCV,
        ctr: safeDivide(displayEntryClicks, totalImpressions) * 100,
        mcvr: safeDivide(displayTransitionClicks, totalPV) * 100,
        cvr: safeDivide(totalCV, displayTransitionClicks) * 100,
        cpm: safeDivide(totalCost, totalImpressions) * 1000,
        cpc: safeDivide(totalCost, totalPV),
        mcpa: safeDivide(totalCost, displayTransitionClicks),
        cpa: totalCV > 0 ? totalCost / totalCV : Infinity,
        fvExitRate: safeDivide(fvExit, totalPV) * 100,
        svExitRate: safeDivide(svExit, totalPV - fvExit) * 100,
    };
}

function calculateRanking(data: ProcessedRow[], period: PeriodType, sortBy: SortType, isVersionFilterActive: boolean): RankingItem[] {
    const beyondData = data.filter(row => row.Media === 'Beyond');

    if (period === 'bestday') {
        return calculateBestDayRanking(beyondData, sortBy, isVersionFilterActive);
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

    const aggregated: RankingItem[] = Object.values(grouped).map(rows => aggregateRows(rows, isVersionFilterActive));
    const filtered = aggregated.filter(item => item.cv >= 1);

    let sorted;
    if (sortBy === 'cpa') {
        sorted = filtered.sort((a, b) => a.cpa - b.cpa);
    } else {
        sorted = filtered.sort((a, b) => b.cv - a.cv);
    }

    return sorted.slice(0, 10);
}

function calculateBestDayRanking(beyondData: ProcessedRow[], sortBy: SortType, isVersionFilterActive: boolean): RankingItem[] {
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
        const item = aggregateRows(rows, isVersionFilterActive);
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

    // 固定列幅定義
    const colW = {
        rank: 'w-[24px]',
        label: 'w-[110px]',
        date: 'w-[70px]',
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
        <div className="overflow-x-auto -mx-4 px-4 no-scrollbar">
            <table className="w-full text-sm table-fixed" style={{ minWidth: '950px' }}>
                <thead>
                    <tr className="bg-gray-50">
                        <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                        <th className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100 ${colW.label}`}>商材/記事×クリエイティブ</th>
                        {showDate && <th className={`${thClass} text-left ${colW.date}`}>日付</th>}
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
                    {ranking.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 bg-inherit group">
                            <td className={`px-1 py-1 text-center border-r border-gray-100 sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 font-medium ${colW.rank}`}>
                                {getRankIcon(idx + 1)}
                            </td>
                            <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100 ${colW.label}`}>
                                <div className="font-bold truncate text-blue-600 mb-0.5">{item.campaignName}</div>
                                <div className="text-[9px] text-gray-500 truncate">{item.versionName} × {item.creative}</div>
                            </td>
                            {showDate && (
                                <td className={`px-1.5 py-1 text-right text-gray-600 text-[10px] whitespace-nowrap ${colW.date}`}>
                                    {item.date ? formatDisplayDate(item.date) : '-'}
                                </td>
                            )}
                            <td className={`${tdClass} ${colW.cost} font-bold`}>{formatNumber(item.cost)}円</td>
                            <td className={`${tdClass} ${colW.imp}`}>{item.impressions > 0 ? formatNumber(item.impressions) : '-'}</td>
                            <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(item.clicks)}</td>
                            <td className={`${tdClass} ${colW.lpClick}`}>{formatNumber(item.mcv)}</td>
                            <td className={`${tdClass} ${colW.cv} font-bold text-orange-600`}>{item.cv}</td>
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

export function ReportRankingPanel({ data, selectedCampaign, reportDays, isVersionFilterActive = false }: ReportRankingPanelProps) {
    const [sortBy, setSortBy] = useState<SortType>('cpa');
    const [period, setPeriod] = useState<PeriodType>('today');

    const ranking = useMemo(() => {
        return calculateRanking(data, period, sortBy, isVersionFilterActive);
    }, [data, period, sortBy, isVersionFilterActive]);

    const isBestDay = period === 'bestday';

    // reportDaysが指定されている場合、その日数以下のボタンのみ表示する
    const visiblePeriods = useMemo(() => {
        if (!reportDays) return PERIODS;
        return PERIODS.filter(p => PERIOD_DAYS[p.key] <= reportDays);
    }, [reportDays]);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2 mr-auto">
                    <span className="text-lg">🏆</span>
                    <h3 className="text-sm font-bold text-gray-800">ランキング（記事 × クリエイティブ）</h3>
                </div>

                <div className="flex items-center gap-1">
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

                <div className="flex items-center gap-1">
                    {visiblePeriods.map(p => (
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
