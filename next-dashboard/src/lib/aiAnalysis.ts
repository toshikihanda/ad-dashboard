// AI Analysis Logic
// Compare current metrics vs baseline values and generate improvement proposals

import { ProcessedRow, safeDivide } from './dataProcessor';

// --- Types ---

export interface BaselineThresholds {
    lower: number;
    upper: number;
    median: number;
    direction: 'low' | 'high'; // 'low' = lower is better, 'high' = higher is better
}

export interface CampaignBaseline {
    [metric: string]: BaselineThresholds;
}

export interface BaselineData {
    [campaign: string]: CampaignBaseline;
}

export type JudgmentResult = 'OK' | 'High' | 'Low' | 'Good';

export interface MetricJudgment {
    metric: string;
    current: number;
    lower: number;
    upper: number;
    median: number;
    judgment: JudgmentResult;
    deviation: number; // How far outside the range (0 if within range)
}

export interface AnalysisResult {
    campaign: string;
    period: string;
    summary: string;
    confidence: 'High' | 'Medium' | 'Low';
    confidenceReason: string;
    bottleneck: string | null;
    bottleneckDetail: {
        baseline: BaselineThresholds;
        current: number;
        deviation: number;
    } | null;
    proposals: string[];
    metrics: MetricJudgment[];
}

// --- Parse Baseline Data ---

export function parseBaselineData(raw: Record<string, string>[]): BaselineData {
    const result: BaselineData = {};

    for (const row of raw) {
        const campaign = (row['商材'] || '').trim();
        const metric = (row['指標'] || '').trim();
        const lower = parseFloat(row['下限'] || '0');
        const upper = parseFloat(row['上限'] || '0');
        const median = parseFloat(row['中央値'] || '0');
        const directionRaw = (row['良い方向'] || '').trim();

        if (!campaign || !metric) continue;

        if (!result[campaign]) {
            result[campaign] = {};
        }

        result[campaign][metric] = {
            lower: isNaN(lower) ? 0 : lower,
            upper: isNaN(upper) ? 0 : upper,
            median: isNaN(median) ? 0 : median,
            direction: directionRaw === '高' ? 'high' : 'low',
        };
    }

    return result;
}

// --- Calculate Current Metrics ---

export interface CurrentMetrics {
    CPM: number;
    CTR: number;
    CPC: number;
    MCVR: number;
    CVR: number;
    CPA: number;
    cvCount: number; // For confidence calculation
}

export function calculateCurrentMetrics(
    data: ProcessedRow[],
    campaign: string,
    periodDays: number | 'all'
): CurrentMetrics {
    // Filter by campaign
    let filtered = data.filter(row => row.Campaign_Name === campaign);

    // Filter by period
    if (periodDays !== 'all') {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - periodDays);
        filtered = filtered.filter(row => row.Date >= cutoffDate);
    }

    // Separate Meta and Beyond data
    const metaData = filtered.filter(row => row.Media === 'Meta');
    const beyondData = filtered.filter(row => row.Media === 'Beyond');

    // Aggregate Meta metrics
    const totalImpressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
    const totalMetaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);
    const totalMetaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);

    // Aggregate Beyond metrics
    const totalBeyondPV = beyondData.reduce((sum, row) => sum + row.PV, 0);
    const totalBeyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
    const totalCV = beyondData.reduce((sum, row) => sum + row.CV, 0);
    const totalBeyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);

    // Use Beyond cost for CPA calculation (primary ad spend)
    const totalCost = totalBeyondCost > 0 ? totalBeyondCost : totalMetaCost;

    return {
        CPM: safeDivide(totalMetaCost, totalImpressions) * 1000,
        CTR: safeDivide(totalMetaClicks, totalImpressions) * 100,
        CPC: safeDivide(totalMetaCost, totalMetaClicks),
        MCVR: safeDivide(totalBeyondClicks, totalBeyondPV) * 100,
        CVR: safeDivide(totalCV, totalBeyondClicks) * 100,
        CPA: safeDivide(totalCost, totalCV),
        cvCount: totalCV,
    };
}

// --- Judge Metric ---

export function judgeMetric(
    metric: string,
    current: number,
    baseline: BaselineThresholds
): MetricJudgment {
    const { lower, upper, median, direction } = baseline;

    let judgment: JudgmentResult = 'OK';
    let deviation = 0;

    if (direction === 'low') {
        // Lower is better (CPM, CPC, CPA)
        if (current > upper) {
            judgment = 'High';
            deviation = (current - upper) / upper;
        } else if (current < lower) {
            judgment = 'Good';
            deviation = 0; // Actually good, no negative deviation
        }
    } else {
        // Higher is better (CTR, MCVR, CVR)
        if (current < lower) {
            judgment = 'Low';
            deviation = (lower - current) / lower;
        } else if (current > upper) {
            judgment = 'Good';
            deviation = 0;
        }
    }

    return {
        metric,
        current,
        lower,
        upper,
        median,
        judgment,
        deviation,
    };
}

// --- Find Bottleneck ---

export function findBottleneck(metrics: MetricJudgment[]): MetricJudgment | null {
    // Find the metric with the highest negative deviation (worst performer)
    const problematic = metrics.filter(m => m.judgment === 'High' || m.judgment === 'Low');

    if (problematic.length === 0) return null;

    return problematic.reduce((worst, current) =>
        current.deviation > worst.deviation ? current : worst
    );
}

// --- Get Proposals ---

const PROPOSALS: Record<string, string[]> = {
    CTR: [
        'クリエイティブの角度を追加（UGC/レビュー実績）',
        '冒頭強化（最初の1秒/1行で結論先出し）',
        '型変更（動画↔UGC↔静止画）',
    ],
    CPM: [
        'ターゲット拡張（狭すぎ→広げる、除外整理）',
        '配置見直し（高騰面の抑制、成果面へ寄せる）',
        'クリエイティブ刷新（品質改善でCPM低下を狙う）',
    ],
    CPC: [
        'CTRを改善してCPCを下げる',
        'クリエイティブの訴求力を強化',
        '低CPMの配置を活用',
    ],
    MCVR: [
        'CTA回数・配置（序盤/中盤/終盤の3点設置）',
        'CTA文言を具体化（価格/成分/保証など）',
        '不安解消セクションの追加（FAQ/比較/根拠）',
    ],
    CVR: [
        '商品LP/オファー/フォームの確認を推奨',
        '在庫/ページ速度/計測の確認',
        '記事LPのCTA導線を強化',
    ],
    CPA: [
        '最大ズレの上流指標を優先的に改善',
        'ボトルネックがCTRならクリエイティブ改善',
        'ボトルネックがCVRなら商品LP確認',
    ],
};

export function getProposals(bottleneck: string): string[] {
    return PROPOSALS[bottleneck] || ['データを確認して改善点を特定してください'];
}

// --- Run Full Analysis ---

export function runAnalysis(
    data: ProcessedRow[],
    campaign: string,
    periodDays: number | 'all',
    baselineData: BaselineData
): AnalysisResult {
    const periodLabel = periodDays === 'all' ? '全期間' : `直近${periodDays}日`;

    // Get baseline for this campaign
    const campaignBaseline = baselineData[campaign];
    if (!campaignBaseline) {
        return {
            campaign,
            period: periodLabel,
            summary: `「${campaign}」の基準値がBaselineシートに設定されていません。`,
            confidence: 'Low',
            confidenceReason: '基準値なし',
            bottleneck: null,
            bottleneckDetail: null,
            proposals: ['Baselineシートに基準値を設定してください'],
            metrics: [],
        };
    }

    // Calculate current metrics
    const current = calculateCurrentMetrics(data, campaign, periodDays);

    // Determine confidence based on CV count
    let confidence: 'High' | 'Medium' | 'Low';
    let confidenceReason: string;
    if (current.cvCount >= 100) {
        confidence = 'High';
        confidenceReason = `CV数${current.cvCount}件で統計的に信頼性が高い`;
    } else if (current.cvCount >= 30) {
        confidence = 'Medium';
        confidenceReason = `CV数が${current.cvCount}件のため、断定は控えめにしています`;
    } else {
        confidence = 'Low';
        confidenceReason = `CV数が${current.cvCount}件と少ないため、参考値としてください`;
    }

    // Judge each metric
    const metricNames = ['CPM', 'CTR', 'CPC', 'MCVR', 'CVR', 'CPA'] as const;
    const metrics: MetricJudgment[] = [];

    for (const metricName of metricNames) {
        const baseline = campaignBaseline[metricName];
        if (baseline) {
            const value = current[metricName];
            metrics.push(judgeMetric(metricName, value, baseline));
        }
    }

    // Find bottleneck
    const bottleneckMetric = findBottleneck(metrics);
    const bottleneck = bottleneckMetric?.metric || null;

    let bottleneckDetail = null;
    if (bottleneckMetric && campaignBaseline[bottleneckMetric.metric]) {
        bottleneckDetail = {
            baseline: campaignBaseline[bottleneckMetric.metric],
            current: bottleneckMetric.current,
            deviation: bottleneckMetric.deviation,
        };
    }

    // Get proposals
    const proposals = bottleneck ? getProposals(bottleneck) : ['すべての指標が基準値内です。現状維持を推奨します。'];

    // Generate summary
    const problemMetrics = metrics.filter(m => m.judgment === 'High' || m.judgment === 'Low');
    let summary: string;
    if (problemMetrics.length === 0) {
        summary = `${periodLabel}の全指標が基準値内で安定しています。`;
    } else {
        const cpaMetric = metrics.find(m => m.metric === 'CPA');
        if (cpaMetric && cpaMetric.judgment === 'High') {
            const deviation = Math.round(cpaMetric.deviation * 100);
            summary = `${periodLabel}のCPAは基準値より +${deviation}% 高い状態です。`;
        } else {
            summary = `${periodLabel}で${problemMetrics.map(m => m.metric).join('、')}に改善の余地があります。`;
        }
    }

    return {
        campaign,
        period: periodLabel,
        summary,
        confidence,
        confidenceReason,
        bottleneck,
        bottleneckDetail,
        proposals,
        metrics,
    };
}
