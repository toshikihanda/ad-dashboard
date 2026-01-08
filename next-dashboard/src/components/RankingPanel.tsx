'use client';

import { useMemo, useState } from 'react';
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface RankingPanelProps {
    data: ProcessedRow[];
}

interface RankingItem {
    versionName: string;
    creative: string;
    cost: number;
    cv: number;
    cpa: number;
    date?: string;
}

type PeriodType = 'today' | '3days' | '7days' | '30days' | 'bestday';

const PERIODS: { key: PeriodType; label: string }[] = [
    { key: 'today', label: '当日' },
    { key: '3days', label: '直近3日' },
    { key: '7days', label: '直近7日' },
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

function calculateRanking(data: ProcessedRow[], period: PeriodType): RankingItem[] {
    // Beyondデータのみ使用（version_nameとcreative_valueがあるため）
    const beyondData = data.filter(row => row.Media === 'Beyond');

    if (period === 'bestday') {
        return calculateBestDayRanking(beyondData);
    }

    // 期間でフィルタリング
    const filteredData = filterByPeriod(beyondData, period);

    // version_name × creative_value でグループ化
    const grouped: Record<string, ProcessedRow[]> = {};

    for (const row of filteredData) {
        const key = `${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    // 各組み合わせの合計を計算
    const aggregated: RankingItem[] = Object.entries(grouped).map(([key, rows]) => {
        const [versionName, creative] = key.split('|||');
        const totalCost = rows.reduce((sum, row) => sum + row.Cost, 0);
        const totalCV = rows.reduce((sum, row) => sum + row.CV, 0);
        const cpa = totalCV > 0 ? totalCost / totalCV : Infinity;

        return {
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
    // 日付 × version_name × creative_value でグループ化
    const grouped: Record<string, ProcessedRow[]> = {};

    for (const row of beyondData) {
        const dateStr = formatDateStr(new Date(row.Date));
        const key = `${dateStr}|||${row.version_name}|||${row.creative_value}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    // 各組み合わせの CPA を計算
    const allRecords: RankingItem[] = Object.entries(grouped).map(([key, rows]) => {
        const [date, versionName, creative] = key.split('|||');
        const totalCost = rows.reduce((sum, row) => sum + row.Cost, 0);
        const totalCV = rows.reduce((sum, row) => sum + row.CV, 0);
        const cpa = totalCV > 0 ? totalCost / totalCV : Infinity;

        return {
            date,
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

export function RankingPanel({ data }: RankingPanelProps) {
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('today');

    const ranking = useMemo(() => {
        return calculateRanking(data, selectedPeriod);
    }, [data, selectedPeriod]);

    const isBestDay = selectedPeriod === 'bestday';

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🏆</span>
                <h3 className="text-sm font-bold text-gray-800">CPAランキング（記事 × クリエイティブ）</h3>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-gray-200 pb-2">
                {PERIODS.map(period => (
                    <button
                        key={period.key}
                        onClick={() => setSelectedPeriod(period.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedPeriod === period.key
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        {period.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            {ranking.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                    データがありません
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-12">順位</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">記事 × クリエイティブ</th>
                                {isBestDay && (
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
                                        <span className="font-medium text-gray-800">{item.versionName}</span>
                                        <span className="text-gray-400 mx-1">×</span>
                                        <span className="text-gray-600">{item.creative}</span>
                                    </td>
                                    {isBestDay && (
                                        <td className="px-3 py-2 text-gray-600">
                                            {item.date ? formatDisplayDate(item.date) : '-'}
                                        </td>
                                    )}
                                    <td className="px-3 py-2 text-right text-gray-700">{formatNumber(item.cost)}円</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{item.cv}</td>
                                    <td className="px-3 py-2 text-right font-bold text-blue-600">{formatNumber(item.cpa)}円</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
