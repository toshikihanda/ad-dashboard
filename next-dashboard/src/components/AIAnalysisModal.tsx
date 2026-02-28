'use client';

import { useState, useMemo } from 'react';
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';
import { BaselineData, calculateCurrentMetrics, calculateTrendData, getRankingDataForAI, type PeriodInput } from '@/lib/aiAnalysis';

interface AIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: ProcessedRow[];
    campaigns: string[];
    baselineData: BaselineData;
}

type PeriodOption = 3 | 7 | 14 | 'custom' | 30 | 90 | 180 | 'all';

function toYMD(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export default function AIAnalysisModal({
    isOpen,
    onClose,
    data,
    campaigns,
    baselineData,
}: AIAnalysisModalProps) {
    const [selectedCampaign, setSelectedCampaign] = useState<string>(campaigns[0] || '');
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(7);
    const [customStart, setCustomStart] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return toYMD(d);
    });
    const [customEnd, setCustomEnd] = useState<string>(() => toYMD(new Date()));
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const periodInput: PeriodInput = useMemo(() => {
        if (selectedPeriod === 'custom') return { startDate: customStart, endDate: customEnd };
        if (selectedPeriod === 'all') return 'all';
        return selectedPeriod;
    }, [selectedPeriod, customStart, customEnd]);

    const periodLabel = useMemo(() => {
        if (selectedPeriod === 'all') return '全期間';
        if (selectedPeriod === 'custom') return `${customStart.replace(/-/g, '/')}〜${customEnd.replace(/-/g, '/')}`;
        return `直近${selectedPeriod}日`;
    }, [selectedPeriod, customStart, customEnd]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError(null);
        setAnalysisResult(null);

        try {
            // Calculate current metrics
            const currentMetrics = calculateCurrentMetrics(data, selectedCampaign, periodInput);

            // Get baseline for this campaign
            const campaignBaseline = baselineData[selectedCampaign] || {};

            // Format baseline for API
            const baselineForApi: Record<string, { lower: number; upper: number; median: number }> = {};
            for (const [metric, thresholds] of Object.entries(campaignBaseline)) {
                baselineForApi[metric] = {
                    lower: thresholds.lower,
                    upper: thresholds.upper,
                    median: thresholds.median,
                };
            }

            // Calculate trend data (week-over-week comparison)
            const trendData = calculateTrendData(data, selectedCampaign);

            // Get ranking data (top 10 by CPA)
            const rankingData = getRankingDataForAI(data, selectedCampaign);

            // Call API
            const response = await fetch('/api/ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign: selectedCampaign,
                    period: periodLabel,
                    currentMetrics: {
                        CPM: currentMetrics.CPM,
                        CTR: currentMetrics.CTR,
                        CPC: currentMetrics.CPC,
                        MCVR: currentMetrics.MCVR,
                        CVR: currentMetrics.CVR,
                        CPA: currentMetrics.CPA,
                        CV数: currentMetrics.cvCount,
                    },
                    baseline: baselineForApi,
                    rankingData,
                    trendData,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '分析に失敗しました');
            }

            setAnalysisResult(result.analysis);

        } catch (err) {
            setError(err instanceof Error ? err.message : '分析に失敗しました。再度お試しください');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleClose = () => {
        setAnalysisResult(null);
        setError(null);
        onClose();
    };

    // Simple markdown to HTML converter
    function renderMarkdown(markdown: string): string {
        return markdown
            // Headers
            .replace(/^### 【(.+?)】/gm, '<h3 class="text-lg font-bold text-gray-800 mt-6 mb-3 flex items-center gap-2"><span class="text-blue-600">▶</span> $1</h3>')
            .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-gray-800 mt-6 mb-3">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-gray-800 mt-6 mb-3">$1</h2>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Lists
            .replace(/^- (.+)$/gm, '<li class="ml-4 text-gray-700">• $1</li>')
            .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-gray-700"><span class="font-bold text-blue-600">$1.</span> $2</li>')
            // Horizontal rule
            .replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
            // Line breaks
            .replace(/\n/g, '<br />');
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-blue-600">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>📊</span>
                        <span>AI 分析</span>
                        {analysisResult && (
                            <span className="text-blue-200 font-normal">: {selectedCampaign}</span>
                        )}
                    </h2>
                    <button
                        onClick={handleClose}
                        className="text-white/80 hover:text-white text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {!analysisResult && !isAnalyzing && !error ? (
                        // Input Form
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">商材を選択</label>
                                <select
                                    value={selectedCampaign}
                                    onChange={(e) => setSelectedCampaign(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                >
                                    {campaigns.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">分析期間</label>
                                {/* 上段: 3日間・7日間・14日間・選択期間 */}
                                <div className="grid grid-cols-4 gap-2 mb-2">
                                    {([3, 7, 14, 'custom'] as PeriodOption[]).map(period => (
                                        <button
                                            key={String(period)}
                                            onClick={() => setSelectedPeriod(period)}
                                            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${selectedPeriod === period
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {period === 'custom' ? '選択期間' : `${period}日間`}
                                        </button>
                                    ))}
                                </div>
                                {/* 選択期間のとき: 日付範囲 */}
                                {selectedPeriod === 'custom' && (
                                    <div className="flex flex-wrap items-center gap-3 mb-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <label className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600 font-medium">開始日</span>
                                            <input
                                                type="date"
                                                value={customStart}
                                                onChange={e => setCustomStart(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                            />
                                        </label>
                                        <span className="text-gray-400">〜</span>
                                        <label className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600 font-medium">終了日</span>
                                            <input
                                                type="date"
                                                value={customEnd}
                                                onChange={e => setCustomEnd(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                            />
                                        </label>
                                    </div>
                                )}
                                {/* 下段: 30日・90日・180日・全期間 */}
                                <div className="grid grid-cols-4 gap-2">
                                    {([30, 90, 180, 'all'] as PeriodOption[]).map(period => (
                                        <button
                                            key={String(period)}
                                            onClick={() => setSelectedPeriod(period)}
                                            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${selectedPeriod === period
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {period === 'all' ? '全期間' : `直近${period}日`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleAnalyze}
                                disabled={!selectedCampaign || (selectedPeriod === 'custom' && customStart > customEnd)}
                                className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                            >
                                分析開始
                            </button>
                        </div>
                    ) : isAnalyzing ? (
                        // Loading State
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
                            <p className="text-gray-600 text-lg">分析中...</p>
                            <p className="text-gray-400 text-sm mt-2">（10〜20秒ほどお待ちください）</p>
                        </div>
                    ) : error ? (
                        // Error State
                        <div className="text-center py-16">
                            <div className="text-red-500 text-5xl mb-4">⚠️</div>
                            <p className="text-red-600 font-medium mb-4">{error}</p>
                            <button
                                onClick={() => { setError(null); setAnalysisResult(null); }}
                                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                戻る
                            </button>
                        </div>
                    ) : (
                        // Results Display
                        <div className="space-y-4">
                            {/* Back Button */}
                            <button
                                onClick={() => { setAnalysisResult(null); setError(null); }}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                            >
                                ← 条件を変更
                            </button>

                            {/* Markdown Content */}
                            <div
                                className="prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(analysisResult || '') }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
