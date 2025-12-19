'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ProcessedRow, safeDivide, PROJECT_SETTINGS, filterByDateRange, filterByCampaign, getUniqueCampaigns, getUniqueCreatives } from '@/lib/dataProcessor';
import { KPICard, KPIGrid } from '@/components/KPICard';
import { RevenueChart, CostChart, CVChart, RateChart, CostMetricChart, GenericBarChart, GenericRateChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';

interface DashboardClientProps {
    initialData: ProcessedRow[];
}

type TabType = 'total' | 'meta' | 'beyond';

function getFirstDayOfMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
}

export default function DashboardClient({ initialData }: DashboardClientProps) {
    const [selectedTab, setSelectedTab] = useState<TabType>('total');
    const [selectedCampaign, setSelectedCampaign] = useState('All');
    const [selectedArticle, setSelectedArticle] = useState('All');
    const [selectedCreative, setSelectedCreative] = useState('All');

    // Date state
    const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'custom'>('7days');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6); // Last 7 days including today
        return formatDateForInput(d);
    });
    const [endDate, setEndDate] = useState(formatDateForInput(new Date()));

    const handlePresetChange = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'custom') => {
        setDatePreset(preset);
        const end = new Date();
        let start = new Date();

        if (preset === 'today') {
            start = end;
        } else if (preset === 'yesterday') {
            start.setDate(end.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (preset === '7days') {
            start.setDate(end.getDate() - 6);
        } else if (preset === '30days') {
            start.setDate(end.getDate() - 29);
        } else {
            return; // custom handles its own
        }

        setStartDate(formatDateForInput(start));
        setEndDate(formatDateForInput(end));
    };

    // Filter data based on selections
    const filteredData = useMemo(() => {
        let data = initialData;

        // Date filter
        if (startDate && endDate) {
            data = filterByDateRange(data, new Date(startDate), new Date(endDate));
        }

        // Tab filter
        if (selectedTab === 'meta') {
            data = data.filter(row => row.Media === 'Meta');
        } else if (selectedTab === 'beyond') {
            data = data.filter(row => row.Media === 'Beyond');
        }

        // Campaign filter
        if (selectedCampaign !== 'All') {
            data = filterByCampaign(data, selectedCampaign);
        }

        // Article filter (Beyond creative)
        if (selectedArticle !== 'All') {
            data = data.filter(row => row.Creative === selectedArticle);
        }

        // Creative filter (Meta creative)
        if (selectedCreative !== 'All') {
            data = data.filter(row => row.Creative === selectedCreative);
        }

        return data;
    }, [initialData, selectedTab, selectedCampaign, selectedArticle, selectedCreative, startDate, endDate]);

    // Get filter options
    const campaigns = useMemo(() => getUniqueCampaigns(initialData), [initialData]);
    const articles = useMemo(() => getUniqueCreatives(initialData, 'Beyond'), [initialData]);
    const creatives = useMemo(() => getUniqueCreatives(initialData, 'Meta'), [initialData]);

    // Calculate KPIs
    const kpis = useMemo(() => {
        const metaData = filteredData.filter(row => row.Media === 'Meta');
        const beyondData = filteredData.filter(row => row.Media === 'Beyond');

        // Meta aggregations
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);
        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);

        // Beyond aggregations
        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const beyondPV = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const beyondCV = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

        // MCV from Meta
        const metaMCV = metaData.reduce((sum, row) => sum + row.MCV, 0);

        // Calculate revenue based on project settings
        let revenue = 0;
        for (const [projectName, settings] of Object.entries(PROJECT_SETTINGS)) {
            const projectBeyond = beyondData.filter(row => row.Campaign_Name === projectName);
            const projectMeta = metaData.filter(row => row.Campaign_Name === projectName);
            const projectCV = projectBeyond.reduce((sum, row) => sum + row.CV, 0);
            const projectBeyondCost = projectBeyond.reduce((sum, row) => sum + row.Cost, 0);
            const projectMetaCost = projectMeta.reduce((sum, row) => sum + row.Cost, 0);

            if (settings.type === '成果') {
                revenue += projectCV * (settings.unitPrice || 0);
            } else {
                const costForRevenue = projectBeyondCost > 0 ? projectBeyondCost : projectMetaCost;
                revenue += costForRevenue * (settings.feeRate || 0);
            }
        }

        const displayCost = selectedTab === 'meta' ? metaCost : beyondCost;
        const profit = revenue - displayCost;

        return {
            cost: displayCost,
            revenue,
            profit,
            impressions,
            metaClicks,
            beyondClicks,
            cv: beyondCV,
            metaMCV,
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
            totalExitRate: safeDivide(fvExit + svExit, beyondPV) * 100,
            recoveryRate: safeDivide(revenue, displayCost) * 100,
            roas: safeDivide(revenue, displayCost),
        };
    }, [filteredData, selectedTab]);

    // Period data helpers
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const todayData = useMemo(() => filterByDateRange(filteredData, today, today), [filteredData]);
    const yesterdayData = useMemo(() => filterByDateRange(filteredData, yesterday, yesterday), [filteredData]);
    const threeDayData = useMemo(() => filterByDateRange(filteredData, threeDaysAgo, today), [filteredData]);
    const sevenDayData = useMemo(() => filterByDateRange(filteredData, sevenDaysAgo, today), [filteredData]);

    return (
        <div className="max-w-[1600px] mx-auto pb-10">
            {/* Header - Row 1: Title & Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-800">運用分析用ダッシュボード</h1>

                <div className="flex gap-2">
                    <button
                        onClick={() => setSelectedTab('total')}
                        className={`tab-button ${selectedTab === 'total' ? 'active' : ''} px-6`}
                    >
                        合計
                    </button>
                    <button
                        onClick={() => setSelectedTab('meta')}
                        className={`tab-button ${selectedTab === 'meta' ? 'active' : ''} px-6`}
                    >
                        Meta
                    </button>
                    <button
                        onClick={() => setSelectedTab('beyond')}
                        className={`tab-button ${selectedTab === 'beyond' ? 'active' : ''} px-6`}
                    >
                        Beyond
                    </button>
                </div>
            </div>

            {/* Header - Row 2: Filters */}
            <div className="flex flex-wrap items-end gap-3 mb-6">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">商品名</label>
                    <select
                        value={selectedCampaign}
                        onChange={(e) => setSelectedCampaign(e.target.value)}
                        className="filter-select min-w-[180px]"
                    >
                        <option value="All">All</option>
                        {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">記事</label>
                    <select
                        value={selectedArticle}
                        onChange={(e) => setSelectedArticle(e.target.value)}
                        className="filter-select min-w-[180px]"
                        disabled={selectedTab === 'meta'}
                    >
                        <option value="All">All</option>
                        {articles.slice(0, 20).map(a => <option key={a} value={a}>{a.substring(0, 30)}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">クリエイティブ</label>
                    <select
                        value={selectedCreative}
                        onChange={(e) => setSelectedCreative(e.target.value)}
                        className="filter-select min-w-[180px]"
                        disabled={selectedTab === 'beyond'}
                    >
                        <option value="All">All</option>
                        {creatives.slice(0, 20).map(c => <option key={c} value={c}>{c.substring(0, 30)}</option>)}
                    </select>
                </div>
            </div>

            {/* Header - Row 3: Date Filter Section */}
            <div className="mb-8 relative">
                <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">期間:</span>
                        <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                            {(['today', 'yesterday', '7days', '30days', 'custom'] as const).map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => handlePresetChange(preset)}
                                    className={cn(
                                        "w-[80px] py-1.5 text-xs font-bold rounded-md transition-all",
                                        datePreset === preset
                                            ? "bg-blue-600 text-white shadow-sm"
                                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    )}
                                >
                                    {preset === 'today' ? '今日' :
                                        preset === 'yesterday' ? '昨日' :
                                            preset === '7days' ? '7日' :
                                                preset === '30days' ? '30日' : 'カスタム'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold">
                        <span className="text-gray-400">●</span>
                        <span className="text-gray-500 text-xs">選択中:</span>
                        <span className="text-gray-800">{startDate.replace(/-/g, '/')}</span>
                        <span className="text-gray-400 mx-1">〜</span>
                        <span className="text-gray-800">{endDate.replace(/-/g, '/')}</span>
                    </div>

                    {/* Fixed positioning for custom date picker to avoid layout shift */}
                    {datePreset === 'custom' && (
                        <div className="absolute top-full left-14 mt-2 z-[100] bg-white p-4 rounded-xl border border-gray-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 flex gap-3 items-center">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-400 ml-1">開始日</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="date-input"
                                />
                            </div>
                            <span className="text-gray-400 mt-5">〜</span>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-400 ml-1">終了日</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="date-input"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            {(selectedTab === 'total' || selectedTab === 'beyond') && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Row 1 */}
                    <KPICard
                        label="出稿金額"
                        value={Math.round(kpis.cost)}
                        unit="円"
                        colorClass="text-red"
                        source={selectedTab === 'total' ? 'Beyond' : undefined}
                    />
                    <KPICard
                        label="売上"
                        value={Math.round(kpis.revenue)}
                        unit="円"
                        colorClass="text-blue"
                    />
                    <KPICard
                        label="粗利"
                        value={Math.round(kpis.profit)}
                        unit="円"
                        colorClass="text-orange"
                    />
                    <KPICard
                        label="IMP"
                        value={kpis.impressions}
                        source={selectedTab === 'total' ? 'Meta' : undefined}
                    />
                    <KPICard
                        label="CLICK"
                        value={kpis.metaClicks}
                        source={selectedTab === 'total' ? 'Meta' : undefined}
                    />
                    <KPICard
                        label="商品LP CLICK"
                        value={kpis.beyondClicks}
                        unit="件"
                        source={selectedTab === 'total' ? 'Beyond' : undefined}
                    />

                    {/* Row 2 */}
                    <KPICard
                        label="CV"
                        value={kpis.cv}
                        unit="件"
                        source={selectedTab === 'total' ? 'Beyond' : undefined}
                    />
                    <KPICard label="CTR" value={kpis.ctr.toFixed(1)} unit="%" colorClass="text-green" />
                    <KPICard label="MCVR" value={kpis.mcvr.toFixed(1)} unit="%" colorClass="text-green" />
                    <KPICard label="CVR" value={kpis.cvr.toFixed(1)} unit="%" colorClass="text-green" />
                    <KPICard label="CPM" value={Math.round(kpis.cpm)} unit="円" />
                    <KPICard label="CPC" value={Math.round(kpis.cpc)} unit="円" />

                    {/* Row 3 */}
                    <KPICard label="MCPA" value={Math.round(kpis.mcpa)} unit="円" />
                    <KPICard label="CPA" value={Math.round(kpis.cpa)} unit="円" />
                    <KPICard label="FV離脱率" value={kpis.fvExitRate.toFixed(1)} unit="%" />
                    <KPICard label="SV離脱率" value={kpis.svExitRate.toFixed(1)} unit="%" />
                    <KPICard label="回収率" value={kpis.recoveryRate.toFixed(1)} unit="%" colorClass="text-blue" />
                    <KPICard label="ROAS" value={kpis.roas.toFixed(2)} unit="倍" colorClass="text-blue" />
                </div>
            )}

            {selectedTab === 'meta' && (
                <>
                    <KPIGrid columns={4}>
                        <KPICard label="出稿金額" value={Math.round(kpis.cost)} unit="円" colorClass="text-red" />
                        <KPICard label="IMP" value={kpis.impressions} />
                        <KPICard label="CLICK" value={kpis.metaClicks} />
                        <KPICard label="CV" value={kpis.metaMCV} unit="件" />
                    </KPIGrid>
                    <div className="h-4" />
                    <KPIGrid columns={4}>
                        <KPICard label="CTR" value={kpis.ctr.toFixed(1)} unit="%" colorClass="text-green" />
                        <KPICard label="CPM" value={Math.round(kpis.cpm)} unit="円" />
                        <KPICard label="CPC" value={Math.round(kpis.cpc)} unit="円" />
                        <KPICard label="CPA" value={Math.round(kpis.cpa)} unit="円" />
                    </KPIGrid>
                </>
            )}

            {/* Data Tables */}
            <div className="mt-8 space-y-4">
                <DataTable data={todayData} title="■案件別数値（当日）" viewMode={selectedTab} />
                <DataTable data={yesterdayData} title="■案件別数値（昨日）" viewMode={selectedTab} />
                <DataTable data={threeDayData} title="■案件別数値（直近3日間）" viewMode={selectedTab} />
                <DataTable data={sevenDayData} title="■案件別数値（直近7日間）" viewMode={selectedTab} />
                <DataTable data={filteredData} title="■案件別数値（選択期間）" viewMode={selectedTab} />
            </div>

            {/* Charts */}
            <div className="mt-8">
                {selectedTab === 'total' && (
                    <>
                        <div className="grid grid-cols-4 gap-4">
                            <CostChart data={filteredData} title="出稿金額" />
                            <RevenueChart data={filteredData} title="売上" />
                            <GenericBarChart data={filteredData} title="粗利" dataKey="Revenue" />
                            <GenericBarChart data={filteredData} title="IMP" dataKey="Impressions" />
                            <GenericBarChart data={filteredData} title="CLICK" dataKey="Clicks" />
                            <GenericBarChart data={filteredData} title="商品LP CLICK" dataKey="Clicks" />
                            <CVChart data={filteredData} title="CV数" />
                        </div>
                        <div className="h-4" />
                        <div className="grid grid-cols-4 gap-4">
                            <GenericRateChart data={filteredData} title="CTR" numeratorKey="Clicks" denominatorKey="Impressions" />
                            <GenericRateChart data={filteredData} title="MCVR" numeratorKey="Clicks" denominatorKey="PV" />
                            <GenericRateChart data={filteredData} title="CVR" numeratorKey="CV" denominatorKey="Clicks" />
                            <CostMetricChart data={filteredData} title="CPM" costDivisorKey="Impressions" multiplier={1000} />
                            <CostMetricChart data={filteredData} title="CPC" costDivisorKey="Clicks" />
                            <CostMetricChart data={filteredData} title="MCPA" costDivisorKey="Clicks" />
                            <CostMetricChart data={filteredData} title="CPA" costDivisorKey="CV" />
                            <GenericRateChart data={filteredData} title="FV離脱率" numeratorKey="FV_Exit" denominatorKey="PV" />
                            <GenericRateChart data={filteredData} title="SV離脱率" numeratorKey="SV_Exit" denominatorKey="PV" />
                            <GenericRateChart data={filteredData} title="回収率" numeratorKey="Revenue" denominatorKey="Cost" />
                            <GenericRateChart data={filteredData} title="ROAS" numeratorKey="Revenue" denominatorKey="Cost" multiplier={1} />
                        </div>
                    </>
                )}

                {selectedTab === 'meta' && (
                    <>
                        <div className="grid grid-cols-4 gap-4">
                            <CostChart data={filteredData} title="出稿金額" />
                            <GenericBarChart data={filteredData} title="IMP" dataKey="Impressions" />
                            <GenericBarChart data={filteredData} title="CLICK" dataKey="Clicks" />
                            <GenericBarChart data={filteredData} title="CV" dataKey="MCV" />
                        </div>
                        <div className="h-4" />
                        <div className="grid grid-cols-4 gap-4">
                            <GenericRateChart data={filteredData} title="CTR" numeratorKey="Clicks" denominatorKey="Impressions" />
                            <CostMetricChart data={filteredData} title="CPM" costDivisorKey="Impressions" multiplier={1000} />
                            <CostMetricChart data={filteredData} title="CPC" costDivisorKey="Clicks" />
                            <CostMetricChart data={filteredData} title="CPA" costDivisorKey="CV" />
                        </div>
                    </>
                )}

                {selectedTab === 'beyond' && (
                    <>
                        <div className="grid grid-cols-4 gap-4">
                            <CostChart data={filteredData} title="出稿金額" />
                            <RevenueChart data={filteredData} title="売上" />
                            <GenericBarChart data={filteredData} title="粗利" dataKey="Revenue" />
                            <CVChart data={filteredData} title="CV" />
                        </div>
                        <div className="h-4" />
                        <div className="grid grid-cols-4 gap-4">
                            <GenericBarChart data={filteredData} title="PV" dataKey="PV" />
                            <GenericBarChart data={filteredData} title="CLICK" dataKey="Clicks" />
                            <GenericRateChart data={filteredData} title="MCVR" numeratorKey="Clicks" denominatorKey="PV" />
                            <GenericRateChart data={filteredData} title="CVR" numeratorKey="CV" denominatorKey="Clicks" />
                        </div>
                        <div className="h-4" />
                        <div className="grid grid-cols-4 gap-4">
                            <CostMetricChart data={filteredData} title="CPC" costDivisorKey="Clicks" />
                            <CostMetricChart data={filteredData} title="CPA" costDivisorKey="CV" />
                            <GenericRateChart data={filteredData} title="FV離脱率" numeratorKey="FV_Exit" denominatorKey="PV" />
                            <GenericRateChart data={filteredData} title="SV離脱率" numeratorKey="SV_Exit" denominatorKey="PV" />
                            <GenericRateChart data={filteredData} title="回収率" numeratorKey="Revenue" denominatorKey="Cost" />
                            <GenericRateChart data={filteredData} title="ROAS" numeratorKey="Revenue" denominatorKey="Cost" multiplier={1} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
