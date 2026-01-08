'use client';

import { useMemo, useState } from 'react';
import { ProcessedRow } from '@/lib/dataProcessor';

interface RankingPanelProps {
    data: ProcessedRow[];
    selectedCampaign: string;
}

interface RankingItem {
    campaignName: string;
    versionName: string;
    creative: string;
    cost: number;
    cv: number;
    cpa: number;
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
            return data; // 全期間
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

function calculateRanking(data: ProcessedRow[], period: PeriodType, sortBy: SortType): RankingItem[] {
    // Beyondデータのみ使用
    const beyondData = data.filter(row => row.Media === 'Beyond');

    if (period === 'bestday') {
        return calculateBestDayRanking(beyondData, sortBy);
    }

    // 期間でフィルタリング
    const filteredData = filterByPeriod(beyondData, period);

    // Campaign_Name × version_name × creative_value でグループ化
    const grouped: Record<string, ProcessedRow[]> = {};

    for (const row of filteredData) {
        const key = `${row.Campaign_Name}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    // 各組み合わせの合計を計算
    const aggregated: RankingItem[] = Object.entries(grouped).map(([key, rows]) => {
        const [campaignName, versionName, creative] = key.split('|||');
        const totalCost = rows.reduce((sum, row) => sum + row.Cost, 0);
        const totalCV = rows.reduce((sum, row) => sum + row.CV, 0);
        const cpa = totalCV > 0 ? totalCost / totalCV : Infinity;

        return {
            campaignName: campaignName || '(未設定)',
            versionName: versionName || '(未設定)',
            creative: creative || '(未設定)',
            cost: totalCost,
            cv: totalCV,
            cpa: cpa
        };
    });

    // CV >= 1 のみフィルタリング
    const filtered = aggregated.filter(item => item.cv >= 1);

    // ソート
    let sorted;
    if (sortBy === 'cpa') {
        // CPA が低い順（良い順）
        sorted = filtered.sort((a, b) => a.cpa - b.cpa);
    } else {
        // CV が多い順
        sorted = filtered.sort((a, b) => b.cv - a.cv);
    }

    // 上位10件を返す
    return sorted.slice(0, 10);
}

function calculateBestDayRanking(beyondData: ProcessedRow[], sortBy: SortType): RankingItem[] {
    // 日付 × Campaign_Name × version_name × creative_value でグループ化
    const grouped: Record<string, ProcessedRow[]> = {};

    for (const row of beyondData) {
        const dateStr = formatDateStr(new Date(row.Date));
        const key = `${dateStr}|||${row.Campaign_Name}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    // 各組み合わせの CPA を計算
    const allRecords: RankingItem[] = Object.entries(grouped).map(([key, rows]) => {
        const [date, campaignName, versionName, creative] = key.split('|||');
        const totalCost = rows.reduce((sum, row) => sum + row.Cost, 0);
        const totalCV = rows.reduce((sum, row) => sum + row.CV, 0);
        const cpa = totalCV > 0 ? totalCost / totalCV : Infinity;

        return {
            date,
            campaignName: campaignName || '(未設定)',
            versionName: versionName || '(未設定)',
            creative: creative || '(未設定)',
            cost: totalCost,
            cv: totalCV,
            cpa: cpa
        };
    });

    // CV >= 1 のみフィルタリング
    const filtered = allRecords.filter(item => item.cv >= 1);

    // ソート
    let sorted;
    if (sortBy === 'cpa') {
        sorted = filtered.sort((a, b) => a.cpa - b.cpa);
    } else {
        sorted = filtered.sort((a, b) => b.cv - a.cv);
    }

    // 上位10件を返す
    return sorted.slice(0, 10);
}

function formatNumber(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '-';
    return Math.round(value).toLocaleString('ja-JP');
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

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-12">順位</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">商材/記事×クリエイティブ</th>
                        {showDate && (
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">日付</th>
                        )}
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-24">出稿金額</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-16">CV</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-24">CPA</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {ranking.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-center">
                                <span className={idx < 3 ? 'text-base' : 'text-sm text-gray-500'}>
                                    {getRankIcon(idx + 1)}
                                </span>
                            </td>
                            <td className="px-3 py-2">
                                <div className="truncate max-w-[300px]" title={`${item.campaignName} / ${item.versionName} × ${item.creative}`}>
                                    <span className="text-blue-600 font-medium">{item.campaignName}</span>
                                    <span className="text-gray-400"> / </span>
                                    <span className="text-gray-700">{item.versionName}</span>
                                    <span className="text-gray-400 mx-1">×</span>
                                    <span className="text-gray-500">{item.creative}</span>
                                </div>
                            </td>
                            {showDate && (
                                <td className="px-3 py-2 text-gray-600">
                                    {item.date ? formatDisplayDate(item.date) : '-'}
                                </td>
                            )}
                            <td className="px-3 py-2 text-right text-gray-700">{formatNumber(item.cost)}円</td>
                            <td className="px-3 py-2 text-right text-gray-700 font-medium">{item.cv}</td>
                            <td className="px-3 py-2 text-right font-bold text-blue-600">{formatNumber(item.cpa)}円</td>
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

    // 商材でフィルタリング
    const filteredData = useMemo(() => {
        if (selectedCampaign === 'All') {
            return data;
        }
        return data.filter(row => row.Campaign_Name === selectedCampaign);
    }, [data, selectedCampaign]);

    // ランキング計算
    const ranking = useMemo(() => {
        return calculateRanking(filteredData, period, sortBy);
    }, [filteredData, period, sortBy]);

    const isBestDay = period === 'bestday';

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🏆</span>
                <h3 className="text-sm font-bold text-gray-800">ランキング（記事 × クリエイティブ）</h3>
                {selectedCampaign !== 'All' && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedCampaign}</span>
                )}
            </div>

            {/* Controls */}
            <div className="space-y-3 mb-4">
                {/* Sort */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 w-12">ソート:</span>
                    <div className="flex gap-1">
                        {SORT_OPTIONS.map(option => (
                            <button
                                key={option.key}
                                onClick={() => setSortBy(option.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${sortBy === option.key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Period */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 w-12">期間:</span>
                    <div className="flex gap-1 flex-wrap">
                        {PERIODS.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setPeriod(p.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === p.key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Table */}
            <RankingTable ranking={ranking} showDate={isBestDay} />
        </div>
    );
}
