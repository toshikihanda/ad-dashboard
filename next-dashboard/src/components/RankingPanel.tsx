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

type LeftPeriodType = 'today' | '7days';
type RightPeriodType = '3days' | '30days' | 'bestday';

const LEFT_PERIODS: { key: LeftPeriodType; label: string }[] = [
    { key: 'today', label: '当日' },
    { key: '7days', label: '直近7日' },
];

const RIGHT_PERIODS: { key: RightPeriodType; label: string }[] = [
    { key: '3days', label: '直近3日' },
    { key: '30days', label: '直近30日' },
    { key: 'bestday', label: 'ベストデイ' },
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

function filterByPeriod(data: ProcessedRow[], period: LeftPeriodType | RightPeriodType): ProcessedRow[] {
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

function calculateRanking(data: ProcessedRow[], period: LeftPeriodType | RightPeriodType): RankingItem[] {
    // Beyondデータのみ使用
    const beyondData = data.filter(row => row.Media === 'Beyond');

    if (period === 'bestday') {
        return calculateBestDayRanking(beyondData);
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

    // CPA が低い順にソート
    const sorted = filtered.sort((a, b) => a.cpa - b.cpa);

    // 上位5件を返す
    return sorted.slice(0, 5);
}

function calculateBestDayRanking(beyondData: ProcessedRow[]): RankingItem[] {
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

    // CPA が低い順にソート
    const sorted = filtered.sort((a, b) => a.cpa - b.cpa);

    // 上位5件を返す
    return sorted.slice(0, 5);
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
            <div className="text-center py-6 text-gray-400 text-sm">
                データがありません
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-10">順位</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">商材/記事×クリエイティブ</th>
                        {showDate && (
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-20">日付</th>
                        )}
                        <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">出稿金額</th>
                        <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-12">CV</th>
                        <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">CPA</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {ranking.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-center">
                                <span className={idx < 3 ? 'text-base' : 'text-sm text-gray-500'}>
                                    {getRankIcon(idx + 1)}
                                </span>
                            </td>
                            <td className="px-2 py-2">
                                <div className="truncate max-w-[180px]" title={`${item.campaignName} / ${item.versionName} × ${item.creative}`}>
                                    <span className="text-blue-600 font-medium">{item.campaignName}</span>
                                    <span className="text-gray-400"> / </span>
                                    <span className="text-gray-700">{item.versionName}</span>
                                    <span className="text-gray-400 mx-0.5">×</span>
                                    <span className="text-gray-500 text-xs">{item.creative}</span>
                                </div>
                            </td>
                            {showDate && (
                                <td className="px-2 py-2 text-gray-600 text-xs">
                                    {item.date ? formatDisplayDate(item.date) : '-'}
                                </td>
                            )}
                            <td className="px-2 py-2 text-right text-gray-700 text-xs">{formatNumber(item.cost)}円</td>
                            <td className="px-2 py-2 text-right text-gray-700">{item.cv}</td>
                            <td className="px-2 py-2 text-right font-bold text-blue-600">{formatNumber(item.cpa)}円</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function RankingPanel({ data, selectedCampaign }: RankingPanelProps) {
    const [leftPeriod, setLeftPeriod] = useState<LeftPeriodType>('today');
    const [rightPeriod, setRightPeriod] = useState<RightPeriodType>('3days');

    // 商材でフィルタリング
    const filteredData = useMemo(() => {
        if (selectedCampaign === 'All') {
            return data;
        }
        return data.filter(row => row.Campaign_Name === selectedCampaign);
    }, [data, selectedCampaign]);

    // 左側ランキング計算
    const leftRanking = useMemo(() => {
        return calculateRanking(filteredData, leftPeriod);
    }, [filteredData, leftPeriod]);

    // 右側ランキング計算
    const rightRanking = useMemo(() => {
        return calculateRanking(filteredData, rightPeriod);
    }, [filteredData, rightPeriod]);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🏆</span>
                <h3 className="text-sm font-bold text-gray-800">CPAランキング（記事 × クリエイティブ）</h3>
                {selectedCampaign !== 'All' && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedCampaign}</span>
                )}
            </div>

            {/* 2 Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 左側 */}
                <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex gap-1 mb-3">
                        {LEFT_PERIODS.map(period => (
                            <button
                                key={period.key}
                                onClick={() => setLeftPeriod(period.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${leftPeriod === period.key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                    }`}
                            >
                                {period.label}
                            </button>
                        ))}
                    </div>
                    <RankingTable ranking={leftRanking} showDate={false} />
                </div>

                {/* 右側 */}
                <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex gap-1 mb-3">
                        {RIGHT_PERIODS.map(period => (
                            <button
                                key={period.key}
                                onClick={() => setRightPeriod(period.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${rightPeriod === period.key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                    }`}
                            >
                                {period.label}
                            </button>
                        ))}
                    </div>
                    <RankingTable ranking={rightRanking} showDate={rightPeriod === 'bestday'} />
                </div>
            </div>
        </div>
    );
}
