'use client';

import { useState, useMemo } from 'react';
import { ProcessedRow } from '@/lib/dataProcessor';
import { BaselineData, runAnalysis, AnalysisResult, MetricJudgment } from '@/lib/aiAnalysis';

interface AIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: ProcessedRow[];
    campaigns: string[];
    baselineData: BaselineData;
}

type PeriodOption = 30 | 90 | 180 | 'all';

function formatNumber(value: number, metric: string): string {
    if (metric === 'CTR' || metric === 'MCVR' || metric === 'CVR') {
        return value.toFixed(2) + '%';
    }
    return Math.round(value).toLocaleString();
}

function getJudgmentStyle(judgment: MetricJudgment['judgment']): { text: string; color: string; bg: string } {
    switch (judgment) {
        case 'OK':
            return { text: '✅ OK', color: 'text-green-600', bg: 'bg-green-50' };
        case 'High':
            return { text: '⚠️ 高い', color: 'text-orange-600', bg: 'bg-orange-50' };
        case 'Low':
            return { text: '⚠️ 低い', color: 'text-orange-600', bg: 'bg-orange-50' };
        case 'Good':
            return { text: '✨ 良好', color: 'text-blue-600', bg: 'bg-blue-50' };
        default:
            return { text: '-', color: 'text-gray-600', bg: '' };
    }
}

export default function AIAnalysisModal({
    isOpen,
    onClose,
    data,
    campaigns,
    baselineData,
}: AIAnalysisModalProps) {
    const [selectedCampaign, setSelectedCampaign] = useState<string>(campaigns[0] || '');
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(90);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAnalyze = () => {
        setIsAnalyzing(true);
        // Simulate slight delay for UX
        setTimeout(() => {
            const result = runAnalysis(data, selectedCampaign, selectedPeriod, baselineData);
            setAnalysisResult(result);
            setIsAnalyzing(false);
        }, 500);
    };

    const handleClose = () => {
        setAnalysisResult(null);
        onClose();
    };

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
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>🔍</span>
                        <span>AI 分析</span>
                        {analysisResult && (
                            <span className="text-blue-200 font-normal">: {analysisResult.campaign}</span>
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
                    {!analysisResult ? (
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
                                <div className="grid grid-cols-4 gap-2">
                                    {([30, 90, 180, 'all'] as PeriodOption[]).map(period => (
                                        <button
                                            key={period}
                                            onClick={() => setSelectedPeriod(period)}
                                            className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${selectedPeriod === period
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
                                disabled={isAnalyzing || !selectedCampaign}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                            >
                                {isAnalyzing ? '分析中...' : '分析開始'}
                            </button>
                        </div>
                    ) : (
                        // Results Display
                        <div className="space-y-6">
                            {/* Back Button */}
                            <button
                                onClick={() => setAnalysisResult(null)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                            >
                                ← 条件を変更
                            </button>

                            {/* Summary */}
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                <h3 className="font-bold text-gray-800 mb-2">【総評】</h3>
                                <p className="text-gray-700">{analysisResult.summary}</p>
                            </div>

                            {/* Confidence */}
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-800">【確度】</span>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${analysisResult.confidence === 'High' ? 'bg-green-100 text-green-700' :
                                        analysisResult.confidence === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                    }`}>
                                    {analysisResult.confidence}
                                </span>
                                <span className="text-gray-500 text-sm">
                                    （{analysisResult.confidenceReason}）
                                </span>
                            </div>

                            {/* Bottleneck */}
                            {analysisResult.bottleneck && analysisResult.bottleneckDetail && (
                                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                                    <h3 className="font-bold text-gray-800 mb-3">【ボトルネック】{analysisResult.bottleneck}</h3>
                                    <div className="bg-white rounded-lg p-3 text-sm space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">基準値:</span>
                                            <span className="font-medium">
                                                {formatNumber(analysisResult.bottleneckDetail.baseline.lower, analysisResult.bottleneck)} 〜 {formatNumber(analysisResult.bottleneckDetail.baseline.upper, analysisResult.bottleneck)}
                                                （中央値: {formatNumber(analysisResult.bottleneckDetail.baseline.median, analysisResult.bottleneck)}）
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">現在値:</span>
                                            <span className="font-bold text-orange-600">
                                                {formatNumber(analysisResult.bottleneckDetail.current, analysisResult.bottleneck)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">ズレ:</span>
                                            <span className="text-orange-600">
                                                {Math.round(analysisResult.bottleneckDetail.deviation * 100)}%（基準値を外れています）
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Proposals */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-3">【提案】</h3>
                                <ol className="space-y-2">
                                    {analysisResult.proposals.map((proposal, i) => (
                                        <li key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                                            <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                {i + 1}
                                            </span>
                                            <span className="text-gray-700 text-sm">{proposal}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>

                            {/* Metrics Table */}
                            {analysisResult.metrics.length > 0 && (
                                <div>
                                    <h3 className="font-bold text-gray-800 mb-3">【指標サマリー】</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="py-2 px-3 text-left font-bold text-gray-700">指標</th>
                                                    <th className="py-2 px-3 text-right font-bold text-gray-700">基準下限</th>
                                                    <th className="py-2 px-3 text-right font-bold text-gray-700">基準上限</th>
                                                    <th className="py-2 px-3 text-right font-bold text-gray-700">現在値</th>
                                                    <th className="py-2 px-3 text-center font-bold text-gray-700">判定</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analysisResult.metrics.map(metric => {
                                                    const style = getJudgmentStyle(metric.judgment);
                                                    return (
                                                        <tr key={metric.metric} className={`border-b border-gray-100 ${style.bg}`}>
                                                            <td className="py-2 px-3 font-medium text-gray-800">{metric.metric}</td>
                                                            <td className="py-2 px-3 text-right text-gray-600">
                                                                {formatNumber(metric.lower, metric.metric)}
                                                            </td>
                                                            <td className="py-2 px-3 text-right text-gray-600">
                                                                {formatNumber(metric.upper, metric.metric)}
                                                            </td>
                                                            <td className="py-2 px-3 text-right font-bold text-gray-800">
                                                                {formatNumber(metric.current, metric.metric)}
                                                            </td>
                                                            <td className={`py-2 px-3 text-center font-medium ${style.color}`}>
                                                                {style.text}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
