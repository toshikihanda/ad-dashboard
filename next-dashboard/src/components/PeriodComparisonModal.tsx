'use client';

import { useState, useMemo } from 'react';
import { ProcessedRow, safeDivide, filterByDateRange, filterByCampaign } from '@/lib/dataProcessor';

interface PeriodComparisonModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: ProcessedRow[];
    campaigns: string[];
}

interface MetricData {
    label: string;
    valueA: number;
    valueB: number;
    diff: number;
    changeRate: number;
    unit: string;
    goodIfLower: boolean;
}

function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr: string): string {
    return dateStr.replace(/-/g, '/');
}

function getChangeColor(isGoodIfLower: boolean, changeRate: number): string {
    if (changeRate === 0) return 'text-gray-500';
    if (isGoodIfLower) {
        return changeRate < 0 ? 'text-green-600' : 'text-red-600';
    } else {
        return changeRate > 0 ? 'text-green-600' : 'text-red-600';
    }
}

function formatNumber(value: number, decimals: number = 0): string {
    if (decimals > 0) {
        return value.toFixed(decimals);
    }
    return Math.round(value).toLocaleString();
}

export default function PeriodComparisonModal({ isOpen, onClose, data, campaigns }: PeriodComparisonModalProps) {
    const [selectedCampaign, setSelectedCampaign] = useState('All');
    const [displayMode, setDisplayMode] = useState<'horizontal' | 'vertical'>('horizontal');
    const [showResults, setShowResults] = useState(false);

    // Period A defaults: last month
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Period B defaults: this month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [periodAStart, setPeriodAStart] = useState(formatDateForInput(lastMonthStart));
    const [periodAEnd, setPeriodAEnd] = useState(formatDateForInput(lastMonthEnd));
    const [periodBStart, setPeriodBStart] = useState(formatDateForInput(thisMonthStart));
    const [periodBEnd, setPeriodBEnd] = useState(formatDateForInput(now));

    // Calculate metrics for a given period
    const calculateMetrics = (periodData: ProcessedRow[]) => {
        const metaData = periodData.filter(row => row.Media === 'Meta');
        const beyondData = periodData.filter(row => row.Media === 'Beyond');

        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);
        const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const beyondCV = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const beyondPV = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);
        const revenue = periodData.reduce((sum, row) => sum + row.Revenue, 0);
        const profit = revenue - beyondCost;

        return {
            cost: beyondCost,
            revenue,
            profit,
            impressions,
            metaClicks,
            beyondClicks,
            cv: beyondCV,
            pv: beyondPV,
            fvExit,
            svExit,
            ctr: safeDivide(metaClicks, impressions) * 100,
            mcvr: safeDivide(beyondClicks, beyondPV) * 100,
            cvr: safeDivide(beyondCV, beyondClicks) * 100,
            cpm: safeDivide(metaCost, impressions) * 1000,
            cpc: safeDivide(metaCost, metaClicks),
            mcpa: safeDivide(beyondCost, beyondClicks),
            cpa: safeDivide(beyondCost, beyondCV),
            fvExitRate: safeDivide(fvExit, beyondPV) * 100,
            svExitRate: safeDivide(svExit, beyondPV - fvExit) * 100,
        };
    };

    // Filter and calculate for both periods
    const comparisonData = useMemo(() => {
        let filteredData = data;
        if (selectedCampaign !== 'All') {
            filteredData = filterByCampaign(data, selectedCampaign);
        }

        const periodAData = filterByDateRange(filteredData, new Date(periodAStart), new Date(periodAEnd));
        const periodBData = filterByDateRange(filteredData, new Date(periodBStart), new Date(periodBEnd));

        const metricsA = calculateMetrics(periodAData);
        const metricsB = calculateMetrics(periodBData);

        // Build comparison metrics
        const metrics: MetricData[] = [
            { label: '出稿金額', valueA: metricsA.cost, valueB: metricsB.cost, unit: '円', goodIfLower: false },
            { label: '売上', valueA: metricsA.revenue, valueB: metricsB.revenue, unit: '円', goodIfLower: false },
            { label: '粗利', valueA: metricsA.profit, valueB: metricsB.profit, unit: '円', goodIfLower: false },
            { label: 'IMP', valueA: metricsA.impressions, valueB: metricsB.impressions, unit: '', goodIfLower: false },
            { label: 'CLICK', valueA: metricsA.metaClicks, valueB: metricsB.metaClicks, unit: '', goodIfLower: false },
            { label: '商品LPCLICK', valueA: metricsA.beyondClicks, valueB: metricsB.beyondClicks, unit: '件', goodIfLower: false },
            { label: 'CV', valueA: metricsA.cv, valueB: metricsB.cv, unit: '件', goodIfLower: false },
            { label: 'CTR', valueA: metricsA.ctr, valueB: metricsB.ctr, unit: '%', goodIfLower: false },
            { label: 'MCVR', valueA: metricsA.mcvr, valueB: metricsB.mcvr, unit: '%', goodIfLower: false },
            { label: 'CVR', valueA: metricsA.cvr, valueB: metricsB.cvr, unit: '%', goodIfLower: false },
            { label: 'CPM', valueA: metricsA.cpm, valueB: metricsB.cpm, unit: '円', goodIfLower: true },
            { label: 'CPC', valueA: metricsA.cpc, valueB: metricsB.cpc, unit: '円', goodIfLower: true },
            { label: 'MCPA', valueA: metricsA.mcpa, valueB: metricsB.mcpa, unit: '円', goodIfLower: true },
            { label: 'CPA', valueA: metricsA.cpa, valueB: metricsB.cpa, unit: '円', goodIfLower: true },
            { label: 'FV離脱率', valueA: metricsA.fvExitRate, valueB: metricsB.fvExitRate, unit: '%', goodIfLower: true },
            { label: 'SV離脱率', valueA: metricsA.svExitRate, valueB: metricsB.svExitRate, unit: '%', goodIfLower: true },
        ].map(m => ({
            ...m,
            diff: m.valueB - m.valueA,
            changeRate: m.valueA !== 0 ? ((m.valueB - m.valueA) / m.valueA) * 100 : 0,
        }));

        return metrics;
    }, [data, selectedCampaign, periodAStart, periodAEnd, periodBStart, periodBEnd]);

    // Get improved and worsened metrics
    const improvedMetrics = comparisonData.filter(m => {
        if (m.goodIfLower) return m.changeRate < -5;
        return m.changeRate > 5;
    });

    const worsenedMetrics = comparisonData.filter(m => {
        if (m.goodIfLower) return m.changeRate > 5;
        return m.changeRate < -5;
    });

    const handleCompare = () => {
        setShowResults(true);
    };

    const handleBack = () => {
        setShowResults(false);
    };

    const applyPreset = (preset: 'lastWeekVsThisWeek' | 'lastMonthVsThisMonth') => {
        if (preset === 'lastWeekVsThisWeek') {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const thisWeekStart = new Date(today);
            thisWeekStart.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            const lastWeekStart = new Date(thisWeekStart);
            lastWeekStart.setDate(thisWeekStart.getDate() - 7);
            const lastWeekEnd = new Date(thisWeekStart);
            lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

            setPeriodAStart(formatDateForInput(lastWeekStart));
            setPeriodAEnd(formatDateForInput(lastWeekEnd));
            setPeriodBStart(formatDateForInput(thisWeekStart));
            setPeriodBEnd(formatDateForInput(today));
        } else if (preset === 'lastMonthVsThisMonth') {
            setPeriodAStart(formatDateForInput(lastMonthStart));
            setPeriodAEnd(formatDateForInput(lastMonthEnd));
            setPeriodBStart(formatDateForInput(thisMonthStart));
            setPeriodBEnd(formatDateForInput(now));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">📊</span>
                        <h2 className="text-lg font-bold text-gray-800">
                            {showResults ? `期間比較結果: ${selectedCampaign}` : '期間比較'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors text-2xl"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {!showResults ? (
                        /* Input Form */
                        <div className="space-y-6">
                            {/* Campaign selector */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">商材を選択</label>
                                <select
                                    value={selectedCampaign}
                                    onChange={(e) => setSelectedCampaign(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="All">全商材</option>
                                    {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Presets */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => applyPreset('lastWeekVsThisWeek')}
                                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                                >
                                    先週 vs 今週
                                </button>
                                <button
                                    onClick={() => applyPreset('lastMonthVsThisMonth')}
                                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                                >
                                    先月 vs 今月
                                </button>
                            </div>

                            <hr className="border-gray-200" />

                            {/* Period A */}
                            <div className="bg-blue-50 rounded-lg p-4">
                                <label className="block text-sm font-bold text-blue-700 mb-3">【期間A】</label>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-500 mb-1">開始日</label>
                                        <input
                                            type="date"
                                            value={periodAStart}
                                            onChange={(e) => setPeriodAStart(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                    </div>
                                    <span className="text-gray-400 mt-5">〜</span>
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-500 mb-1">終了日</label>
                                        <input
                                            type="date"
                                            value={periodAEnd}
                                            onChange={(e) => setPeriodAEnd(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Period B */}
                            <div className="bg-orange-50 rounded-lg p-4">
                                <label className="block text-sm font-bold text-orange-700 mb-3">【期間B】</label>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-500 mb-1">開始日</label>
                                        <input
                                            type="date"
                                            value={periodBStart}
                                            onChange={(e) => setPeriodBStart(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                    </div>
                                    <span className="text-gray-400 mt-5">〜</span>
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-500 mb-1">終了日</label>
                                        <input
                                            type="date"
                                            value={periodBEnd}
                                            onChange={(e) => setPeriodBEnd(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-200" />

                            {/* Display mode */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">表示形式</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="displayMode"
                                            checked={displayMode === 'horizontal'}
                                            onChange={() => setDisplayMode('horizontal')}
                                            className="w-4 h-4 text-blue-600"
                                        />
                                        <span className="text-sm text-gray-700">横並び</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="displayMode"
                                            checked={displayMode === 'vertical'}
                                            onChange={() => setDisplayMode('vertical')}
                                            className="w-4 h-4 text-blue-600"
                                        />
                                        <span className="text-sm text-gray-700">縦並び</span>
                                    </label>
                                </div>
                            </div>

                            {/* Compare button */}
                            <div className="flex justify-center pt-4">
                                <button
                                    onClick={handleCompare}
                                    className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
                                >
                                    比較開始
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Results */
                        <div className="space-y-6">
                            {/* Period info */}
                            <div className="flex gap-6 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                                    <span className="font-medium">期間A:</span>
                                    <span>{formatDateDisplay(periodAStart)} 〜 {formatDateDisplay(periodAEnd)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                                    <span className="font-medium">期間B:</span>
                                    <span>{formatDateDisplay(periodBStart)} 〜 {formatDateDisplay(periodBEnd)}</span>
                                </div>
                            </div>

                            {displayMode === 'horizontal' ? (
                                /* Horizontal table */
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="px-4 py-3 text-left font-bold text-gray-700">指標</th>
                                                <th className="px-4 py-3 text-right font-bold text-blue-600">期間A</th>
                                                <th className="px-4 py-3 text-right font-bold text-orange-600">期間B</th>
                                                <th className="px-4 py-3 text-right font-bold text-gray-700">差分</th>
                                                <th className="px-4 py-3 text-right font-bold text-gray-700">変化率</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {comparisonData.map((metric, idx) => {
                                                const isPercentage = metric.unit === '%';
                                                const decimals = isPercentage ? 1 : 0;
                                                const colorClass = getChangeColor(metric.goodIfLower, metric.changeRate);
                                                const isBold = Math.abs(metric.changeRate) > 20;

                                                return (
                                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                        <td className="px-4 py-2 font-medium text-gray-800">{metric.label}</td>
                                                        <td className="px-4 py-2 text-right text-blue-600">
                                                            {formatNumber(metric.valueA, decimals)}{metric.unit}
                                                        </td>
                                                        <td className="px-4 py-2 text-right text-orange-600">
                                                            {formatNumber(metric.valueB, decimals)}{metric.unit}
                                                        </td>
                                                        <td className={`px-4 py-2 text-right ${colorClass} ${isBold ? 'font-bold' : ''}`}>
                                                            {metric.diff >= 0 ? '+' : ''}{formatNumber(metric.diff, decimals)}{metric.unit}
                                                        </td>
                                                        <td className={`px-4 py-2 text-right ${colorClass} ${isBold ? 'font-bold' : ''}`}>
                                                            {metric.changeRate >= 0 ? '+' : ''}{metric.changeRate.toFixed(1)}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                /* Vertical layout */
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Period A */}
                                    <div className="bg-blue-50 rounded-lg p-4">
                                        <h3 className="font-bold text-blue-700 mb-3">【期間A】{formatDateDisplay(periodAStart)} 〜 {formatDateDisplay(periodAEnd)}</h3>
                                        <table className="w-full text-sm">
                                            <tbody>
                                                {comparisonData.map((metric, idx) => (
                                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white/50' : ''}>
                                                        <td className="px-2 py-1 font-medium text-gray-700">{metric.label}</td>
                                                        <td className="px-2 py-1 text-right text-blue-600">
                                                            {formatNumber(metric.valueA, metric.unit === '%' ? 1 : 0)}{metric.unit}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Period B */}
                                    <div className="bg-orange-50 rounded-lg p-4">
                                        <h3 className="font-bold text-orange-700 mb-3">【期間B】{formatDateDisplay(periodBStart)} 〜 {formatDateDisplay(periodBEnd)}</h3>
                                        <table className="w-full text-sm">
                                            <tbody>
                                                {comparisonData.map((metric, idx) => (
                                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white/50' : ''}>
                                                        <td className="px-2 py-1 font-medium text-gray-700">{metric.label}</td>
                                                        <td className="px-2 py-1 text-right text-orange-600">
                                                            {formatNumber(metric.valueB, metric.unit === '%' ? 1 : 0)}{metric.unit}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Diff summary */}
                                    <div className="md:col-span-2 bg-gray-50 rounded-lg p-4">
                                        <h3 className="font-bold text-gray-700 mb-3">【差分】</h3>
                                        <table className="w-full text-sm">
                                            <tbody>
                                                {comparisonData.filter(m => Math.abs(m.changeRate) > 5).map((metric, idx) => {
                                                    const colorClass = getChangeColor(metric.goodIfLower, metric.changeRate);
                                                    return (
                                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white/50' : ''}>
                                                            <td className="px-2 py-1 font-medium text-gray-700">{metric.label}</td>
                                                            <td className={`px-2 py-1 text-right ${colorClass}`}>
                                                                {metric.diff >= 0 ? '+' : ''}{formatNumber(metric.diff, metric.unit === '%' ? 1 : 0)}{metric.unit}
                                                            </td>
                                                            <td className={`px-2 py-1 text-right ${colorClass} font-bold`}>
                                                                {metric.changeRate >= 0 ? '+' : ''}{metric.changeRate.toFixed(1)}%
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Summary */}
                            <div className="flex flex-wrap gap-4 text-sm">
                                {improvedMetrics.length > 0 && (
                                    <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-lg">
                                        <span className="text-green-600">💡 改善:</span>
                                        <span className="text-green-700 font-medium">
                                            {improvedMetrics.map(m => `${m.label} ${m.changeRate >= 0 ? '+' : ''}${m.changeRate.toFixed(0)}%`).join(', ')}
                                        </span>
                                    </div>
                                )}
                                {worsenedMetrics.length > 0 && (
                                    <div className="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-lg">
                                        <span className="text-red-600">⚠️ 悪化:</span>
                                        <span className="text-red-700 font-medium">
                                            {worsenedMetrics.map(m => `${m.label} ${m.changeRate >= 0 ? '+' : ''}${m.changeRate.toFixed(0)}%`).join(', ')}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Back button */}
                            <div className="flex justify-center pt-4">
                                <button
                                    onClick={handleBack}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    ← 条件を変更
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
