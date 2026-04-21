'use client';

// クライアント共有用期間別サマリーテーブル
// 当日・前日・直近3日・直近7日・選択期間の合計を表示
// 売上・粗利・回収率・ROASは表示しない
// 商材ごとにテーブルを分けて表示

import { useMemo } from 'react';
import { ProcessedRow, safeDivide, calculateExitMetrics, filterByDateRange } from '@/lib/dataProcessor';

interface ReportSummaryTableProps {
    data: ProcessedRow[];
    startDate: string;
    endDate: string;
    viewMode: 'total' | 'meta' | 'beyond';
    allowedCampaigns?: string[]; // URLで指定された商材リスト
    isVersionFilterActive?: boolean;
}

interface SummaryRow {
    period: string;
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
    oar: number;
}

interface CampaignSummary {
    campaign: string;
    rows: SummaryRow[];
}

function getDateRange(periodType: 'today' | 'yesterday' | '3days' | '7days'): { start: Date; end: Date } {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const end = new Date(now);
    let start = new Date(now);

    switch (periodType) {
        case 'today':
            break;
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            break;
        case '3days':
            start.setDate(start.getDate() - 2);
            break;
        case '7days':
            start.setDate(start.getDate() - 6);
            break;
    }

    return { start, end };
}

function aggregateData(data: ProcessedRow[], viewMode: 'total' | 'meta' | 'beyond', isVersionFilterActive: boolean): Omit<SummaryRow, 'period'> {
    const metaData = data.filter(row => row.Media === 'Meta');
    const beyondData = data.filter(row => row.Media === 'Beyond');

    // Meta集計
    const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
    const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
    const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);

    // Beyond集計
    const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
    const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
    const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
    const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
    const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
    const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);
    const oarWeightedSum = beyondData.reduce((sum, row) => sum + (row.OAR * row.PV), 0);
    const exitMetrics = calculateExitMetrics(pv, fvExit, svExit);

    const displayCost = viewMode === 'meta' ? metaCost : beyondCost;

    // version_name フィルター時は PV を入口クリックとして扱う
    const displayMetaEntry = isVersionFilterActive ? pv : metaClicks;
    const displayBeyondTransition = beyondClicks; // 商品LPクリックは常に遷移数

    return {
        cost: displayCost,
        impressions,
        clicks: viewMode === 'beyond' ? displayBeyondTransition : displayMetaEntry,
        mcv: displayBeyondTransition,
        cv,
        ctr: safeDivide(displayMetaEntry, impressions) * 100,
        mcvr: safeDivide(displayBeyondTransition, pv) * 100,
        cvr: safeDivide(cv, displayBeyondTransition) * 100,
        cpm: safeDivide(metaCost, impressions) * 1000,
        cpc: viewMode === 'beyond' ? safeDivide(beyondCost, pv) : safeDivide(metaCost, displayMetaEntry),
        mcpa: safeDivide(beyondCost, displayBeyondTransition),
        cpa: safeDivide(beyondCost, cv),
        fvExitRate: exitMetrics.fvExitRate,
        svExitRate: exitMetrics.svExitRate,
        oar: safeDivide(oarWeightedSum, pv),
    };
}

function formatNumber(value: number, decimals = 0): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

// 単一商材のサマリー行を生成
function generateSummaryRows(
    data: ProcessedRow[],
    startDate: string,
    endDate: string,
    viewMode: 'total' | 'meta' | 'beyond',
    isVersionFilterActive: boolean
): SummaryRow[] {
    const rows: SummaryRow[] = [];

    // 当日
    const todayRange = getDateRange('today');
    const todayData = filterByDateRange(data, todayRange.start, todayRange.end);
    rows.push({ period: '当日', ...aggregateData(todayData, viewMode, isVersionFilterActive) });

    // 前日
    const yesterdayRange = getDateRange('yesterday');
    const yesterdayData = filterByDateRange(data, yesterdayRange.start, yesterdayRange.end);
    rows.push({ period: '前日', ...aggregateData(yesterdayData, viewMode, isVersionFilterActive) });

    // 直近3日
    const threeDaysRange = getDateRange('3days');
    const threeDaysData = filterByDateRange(data, threeDaysRange.start, threeDaysRange.end);
    rows.push({ period: '直近3日', ...aggregateData(threeDaysData, viewMode, isVersionFilterActive) });

    // 直近7日
    const sevenDaysRange = getDateRange('7days');
    const sevenDaysData = filterByDateRange(data, sevenDaysRange.start, sevenDaysRange.end);
    rows.push({ period: '直近7日', ...aggregateData(sevenDaysData, viewMode, isVersionFilterActive) });

    // 選択期間
    if (startDate && endDate) {
        const selectedData = filterByDateRange(data, new Date(startDate), new Date(endDate));
        const start = startDate.replace(/-/g, '/').slice(5);
        const end = endDate.replace(/-/g, '/').slice(5);
        rows.push({ period: `選択期間(${start}〜${end})`, ...aggregateData(selectedData, viewMode, isVersionFilterActive) });
    }

    return rows;
}

// 個別テーブルコンポーネント
function SummaryTable({
    title,
    rows,
    isHighlighted = false
}: {
    title?: string;
    rows: SummaryRow[];
    isHighlighted?: boolean;
}) {
    // 固定列幅定義
    const colW = {
        period: 'w-[120px]',
        cost: 'w-[75px]',
        imp: 'w-[50px]',
        clicks: 'w-[50px]',
        lpClick: 'w-[60px]',
        cv: 'w-[35px]',
        ctr: 'w-[45px]',
        mcvr: 'w-[45px]',
        cvr: 'w-[45px]',
        cpm: 'w-[60px]',
        cpc: 'w-[60px]',
        mcpa: 'w-[60px]',
        cpa: 'w-[70px]',
        fvExit: 'w-[50px]',
        svExit: 'w-[50px]',
        oar: 'w-[50px]',
    };

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

    return (
        <div className={`mb-4 ${isHighlighted ? 'ring-2 ring-blue-200 rounded-lg' : ''}`}>
            {title && (
                <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-2">
                    <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-3 py-1 rounded-md">{title}</span>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed" style={{ minWidth: '1000px' }}>
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={`${thClass} text-left sticky left-0 bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.period}`}>期間</th>
                            <th className={`${thClass} ${colW.cost}`}>出稿金額</th>
                            <th className={`${thClass} ${colW.imp}`}>Imp</th>
                            <th className={`${thClass} ${colW.clicks}`}>Clicks</th>
                            <th className={`${thClass} ${colW.lpClick}`}>商品LP CL</th>
                            <th className={`${thClass} ${colW.cv}`}>CV</th>
                            <th className={`${thClass} ${colW.ctr}`}>CTR</th>
                            <th className={`${thClass} ${colW.mcvr}`}>MCVR</th>
                            <th className={`${thClass} ${colW.cvr}`}>CVR</th>
                            <th className={`${thClass} ${colW.cpm}`}>CPM</th>
                            <th className={`${thClass} ${colW.cpc}`}>CPC</th>
                            <th className={`${thClass} ${colW.mcpa}`}>MCPA</th>
                            <th className={`${thClass} ${colW.cpa}`}>CPA</th>
                            <th className={`${thClass} ${colW.fvExit}`}>FV離脱率</th>
                            <th className={`${thClass} ${colW.svExit}`}>SV離脱率</th>
                            <th className={`${thClass} ${colW.oar}`}>OAR</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row, idx) => (
                            <tr key={row.period} className={`hover:bg-gray-50 ${idx === rows.length - 1 ? 'bg-blue-50 font-medium' : ''}`}>
                                <td className={`px-1.5 py-1.5 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-0 bg-inherit group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${idx === rows.length - 1 ? 'bg-blue-50 text-blue-700 font-semibold' : ''} ${colW.period}`}>
                                    {row.period}
                                </td>
                                <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                <td className={`${tdClass} ${colW.imp}`}>{formatNumber(row.impressions)}</td>
                                <td className={`${tdClass} ${colW.clicks}`}>{formatNumber(row.clicks)}</td>
                                <td className={`${tdClass} ${colW.lpClick}`}>{formatNumber(row.mcv)}</td>
                                <td className={`${tdClass} ${colW.cv}`}>{formatNumber(row.cv)}</td>
                                <td className={`${tdClass} ${colW.ctr}`}>{formatPercent(row.ctr)}</td>
                                <td className={`${tdClass} ${colW.mcvr}`}>{formatPercent(row.mcvr)}</td>
                                <td className={`${tdClass} ${colW.cvr}`}>{formatPercent(row.cvr)}</td>
                                <td className={`${tdClass} ${colW.cpm}`}>{formatNumber(row.cpm)}円</td>
                                <td className={`${tdClass} ${colW.cpc}`}>{formatNumber(row.cpc)}円</td>
                                <td className={`${tdClass} ${colW.mcpa}`}>{formatNumber(row.mcpa)}円</td>
                                <td className={`${tdClass} ${colW.cpa} font-bold ${idx === rows.length - 1 ? 'text-blue-700' : ''}`}>{formatNumber(row.cpa)}円</td>
                                <td className={`${tdClass} ${colW.fvExit}`}>{formatPercent(row.fvExitRate)}</td>
                                <td className={`${tdClass} ${colW.svExit}`}>{formatPercent(row.svExitRate)}</td>
                                <td className={`${tdClass} ${colW.oar}`}>{formatPercent(row.oar)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function ReportSummaryTable({ data, startDate, endDate, viewMode, allowedCampaigns = [], isVersionFilterActive = false }: ReportSummaryTableProps) {
    // 商材ごとにサマリーを生成
    const campaignSummaries = useMemo(() => {
        // データ内のユニークな商材を取得
        const campaignsInData = [...new Set(data.map(row => row.Campaign_Name))];

        // allowedCampaignsが指定されている場合はそれを使う、そうでなければデータ内の商材を使う
        const targetCampaigns = allowedCampaigns.length > 0
            ? allowedCampaigns.filter(c => campaignsInData.includes(c))
            : campaignsInData;

        // 商材が1つだけの場合は商材名を表示しない（従来動作）
        if (targetCampaigns.length <= 1) {
            return [{
                campaign: '',  // タイトル表示なし
                rows: generateSummaryRows(data, startDate, endDate, viewMode, isVersionFilterActive)
            }];
        }

        // 複数商材の場合は商材ごとにテーブルを生成
        const summaries: CampaignSummary[] = targetCampaigns.map(campaign => {
            const campaignData = data.filter(row => row.Campaign_Name === campaign);
            return {
                campaign,
                rows: generateSummaryRows(campaignData, startDate, endDate, viewMode, isVersionFilterActive)
            };
        });

        // 全体合計も追加
        summaries.push({
            campaign: '📊 全体合計',
            rows: generateSummaryRows(data, startDate, endDate, viewMode, isVersionFilterActive)
        });

        return summaries;
    }, [data, startDate, endDate, viewMode, allowedCampaigns, isVersionFilterActive]);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">■期間別サマリー</h3>
            <div className="-mx-4 px-4">
                {campaignSummaries.map((summary, idx) => (
                    <SummaryTable
                        key={summary.campaign || 'single'}
                        title={summary.campaign || undefined}
                        rows={summary.rows}
                        isHighlighted={summary.campaign.includes('全体合計')}
                    />
                ))}
            </div>
        </div>
    );
}
