'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ProcessedRow, safeDivide, filterByDateRange, filterByCampaign, getUniqueCampaigns, getUniqueCreatives, getUniqueBeyondPageNames, getUniqueVersionNames, getUniqueCreativeValues } from '@/lib/dataProcessor';
import { BaselineData } from '@/lib/aiAnalysis';
import { KPICard, KPIGrid } from '@/components/KPICard';
import { RevenueChart, CostChart, CVChart, RateChart, CostMetricChart, GenericBarChart, GenericRateChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import AIAnalysisModal from '@/components/AIAnalysisModal';
import PeriodComparisonModal from '@/components/PeriodComparisonModal';
import { MultiSelect } from '@/components/MultiSelect';

interface DashboardClientProps {
    initialData: ProcessedRow[];
    baselineData: BaselineData;
}

type TabType = 'total' | 'meta' | 'beyond';

function getFirstDayOfMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function DashboardClient({ initialData, baselineData }: DashboardClientProps) {
    const [selectedTab, setSelectedTab] = useState<TabType>('total');
    const [selectedCampaign, setSelectedCampaign] = useState('All');
    // 複数選択対応（配列で管理）
    const [selectedBeyondPageNames, setSelectedBeyondPageNames] = useState<string[]>([]);
    const [selectedVersionNames, setSelectedVersionNames] = useState<string[]>([]);
    const [selectedCreatives, setSelectedCreatives] = useState<string[]>([]);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);

    // Date state - use fixed initial values to avoid hydration mismatch
    const [datePreset, setDatePreset] = useState<'thisMonth' | 'today' | 'yesterday' | '7days' | 'custom'>('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isClient, setIsClient] = useState(false);
    const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);

    // Initialize dates on client-side only to avoid SSR/hydration mismatch
    useEffect(() => {
        if (!isClient) {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(formatDateForInput(firstOfMonth));
            setEndDate(formatDateForInput(now));
            setIsClient(true);
        }
    }, [isClient]);

    const handlePresetChange = (preset: 'thisMonth' | 'today' | 'yesterday' | '7days' | 'custom') => {
        setDatePreset(preset);
        const end = new Date();
        let start = new Date();

        if (preset === 'thisMonth') {
            start = new Date(end.getFullYear(), end.getMonth(), 1);
            setIsCustomDatePickerOpen(false);
        } else if (preset === 'today') {
            start = new Date(end);
            setIsCustomDatePickerOpen(false);
        } else if (preset === 'yesterday') {
            start.setDate(end.getDate() - 1);
            end.setDate(end.getDate() - 1);
            setIsCustomDatePickerOpen(false);
        } else if (preset === '7days') {
            start.setDate(end.getDate() - 6);
            setIsCustomDatePickerOpen(false);
        } else {
            // custom - open the date picker
            setIsCustomDatePickerOpen(true);
            return;
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

        // Campaign filter (商材)
        if (selectedCampaign !== 'All') {
            data = filterByCampaign(data, selectedCampaign);
        }

        // beyond_page_name filter (複数選択対応)
        if (selectedBeyondPageNames.length > 0) {
            data = data.filter(row => {
                if (row.Media === 'Beyond') {
                    return selectedBeyondPageNames.includes(row.beyond_page_name);
                } else {
                    // Meta Linking: Check if Ad Name (stored in Creative) includes any selected beyond_page_name
                    return selectedBeyondPageNames.some(name => row.Creative && row.Creative.includes(name));
                }
            });
        }

        // version_name filter (複数選択対応)
        if (selectedVersionNames.length > 0) {
            data = data.filter(row => selectedVersionNames.includes(row.version_name));
        }

        // Creative filter (複数選択対応)
        if (selectedCreatives.length > 0) {
            data = data.filter(row => {
                if (row.Media === 'Beyond') {
                    return selectedCreatives.includes(row.creative_value);
                } else {
                    // Meta Linking: Check if Ad Name (stored in Creative) includes any selected creative value
                    return selectedCreatives.some(creative => row.Creative && row.Creative.includes(creative));
                }
            });
        }

        return data;
    }, [initialData, selectedTab, selectedCampaign, selectedBeyondPageNames, selectedVersionNames, selectedCreatives, startDate, endDate]);

    // --- Cascading Filter Logic ---
    // Step 1: Filter by campaign (商材)
    const campaignFilteredData = useMemo(() => {
        if (selectedCampaign === 'All') {
            return initialData.filter(row => row.Media === 'Beyond');
        }
        return initialData.filter(row => row.Media === 'Beyond' && row.Campaign_Name === selectedCampaign);
    }, [initialData, selectedCampaign]);

    // Step 2: Filter by beyond_page_name (複数選択対応)
    const pageNameFilteredData = useMemo(() => {
        if (selectedBeyondPageNames.length === 0) {
            return campaignFilteredData;
        }
        return campaignFilteredData.filter(row => selectedBeyondPageNames.includes(row.beyond_page_name));
    }, [campaignFilteredData, selectedBeyondPageNames]);

    // Step 3: Filter by version_name (複数選択対応)
    const versionFilteredData = useMemo(() => {
        if (selectedVersionNames.length === 0) {
            return pageNameFilteredData;
        }
        return pageNameFilteredData.filter(row => selectedVersionNames.includes(row.version_name));
    }, [pageNameFilteredData, selectedVersionNames]);

    // Generate filter options (cascading)
    const campaigns = useMemo(() => getUniqueCampaigns(initialData), [initialData]);

    // beyond_page_name options: filtered by campaign
    const beyondPageNames = useMemo(() => {
        const uniqueNames = [...new Set(campaignFilteredData.map(row => row.beyond_page_name).filter(n => n))];
        return uniqueNames.sort();
    }, [campaignFilteredData]);

    // version_name options: filtered by campaign + beyond_page_name
    const versionNames = useMemo(() => {
        const uniqueVersions = [...new Set(pageNameFilteredData.map(row => row.version_name).filter(n => n))];
        return uniqueVersions.sort();
    }, [pageNameFilteredData]);

    // creative options: filtered by campaign + beyond_page_name + version_name
    const creativeValues = useMemo(() => {
        const uniqueCreatives = [...new Set(versionFilteredData.map(row => row.creative_value).filter(v => v))];
        return uniqueCreatives.sort();
    }, [versionFilteredData]);

    // Reset downstream filters when upstream filter changes
    const handleCampaignChange = (value: string) => {
        setSelectedCampaign(value);
        setSelectedBeyondPageNames([]);
        setSelectedVersionNames([]);
        setSelectedCreatives([]);
    };

    const handleBeyondPageNamesChange = (values: string[]) => {
        setSelectedBeyondPageNames(values);
        setSelectedVersionNames([]);
        setSelectedCreatives([]);
    };

    const handleVersionNamesChange = (values: string[]) => {
        setSelectedVersionNames(values);
        setSelectedCreatives([]);
    };

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

        // Revenue is already calculated in ProcessedRow (from Master_Setting)
        const revenue = filteredData.reduce((sum, row) => sum + row.Revenue, 0);

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
        <>
            <div className="max-w-[1920px] mx-auto pb-10">
                {/* Sticky Header + Filters */}
                <div className="sticky top-0 z-50 bg-gray-50 pt-4 pb-4 -mx-6 px-6">
                    {/* Header - Row 1: Title & Tabs */}
                    <div className="flex items-center gap-4 mb-5">
                        <h1 className="text-xl font-bold text-gray-800 whitespace-nowrap">allattain Dashboard</h1>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setSelectedTab('total')}
                                className={`tab-button ${selectedTab === 'total' ? 'active' : ''} px-4 py-1.5 text-xs`}
                            >
                                合計
                            </button>
                            <button
                                onClick={() => setSelectedTab('meta')}
                                className={`tab-button ${selectedTab === 'meta' ? 'active' : ''} px-4 py-1.5 text-xs`}
                            >
                                Meta
                            </button>
                            <button
                                onClick={() => setSelectedTab('beyond')}
                                className={`tab-button ${selectedTab === 'beyond' ? 'active' : ''} px-4 py-1.5 text-xs`}
                            >
                                Beyond
                            </button>
                        </div>
                        {/* AI Analysis Button */}
                        <button
                            onClick={() => setIsAnalysisModalOpen(true)}
                            className="ml-auto px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-1.5"
                        >
                            <span>📊</span>
                            <span>AI分析</span>
                        </button>
                        {/* Period Comparison Button */}
                        <button
                            onClick={() => setIsComparisonModalOpen(true)}
                            className="px-4 py-1.5 text-xs font-bold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all shadow-md flex items-center gap-1.5"
                        >
                            <span>📈</span>
                            <span>期間比較</span>
                        </button>
                    </div>

                    {/* Filter Area: Custom grid layout with wider beyond_page_name */}
                    <div className="grid gap-3 relative" style={{ gridTemplateColumns: '1fr 2fr 1fr 1.5fr 1.5fr' }}>
                        {/* 商材 Column */}
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 tracking-wide">商材</span>
                            <select
                                value={selectedCampaign}
                                onChange={(e) => handleCampaignChange(e.target.value)}
                                className="filter-select text-xs px-2 w-full truncate"
                                title={selectedCampaign}
                            >
                                <option value="All">All</option>
                                {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* beyond_page_name Column */}
                        <MultiSelect
                            label="beyond_page_name"
                            options={beyondPageNames}
                            selectedValues={selectedBeyondPageNames}
                            onChange={handleBeyondPageNamesChange}
                        />

                        {/* version_name Column */}
                        <MultiSelect
                            label="version_name"
                            options={versionNames}
                            selectedValues={selectedVersionNames}
                            onChange={handleVersionNamesChange}
                        />

                        {/* クリエイティブ Column */}
                        <MultiSelect
                            label="クリエイティブ"
                            options={creativeValues}
                            selectedValues={selectedCreatives}
                            onChange={setSelectedCreatives}
                        />

                        {/* 期間 Column */}
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 tracking-wide">期間</span>
                                <div className="flex items-center gap-1 text-[10px]">
                                    <span className="text-blue-500 text-xs">●</span>
                                    <span className="text-gray-500">選択中:</span>
                                    <span className="font-bold text-gray-700">{startDate.replace(/-/g, '/').slice(5)}</span>
                                    <span className="text-gray-400">〜</span>
                                    <span className="font-bold text-gray-700">{endDate.replace(/-/g, '/').slice(5)}</span>
                                </div>
                            </div>
                            <div className="flex bg-white rounded-lg border border-gray-200 shadow-sm h-8">
                                {(['thisMonth', 'today', 'yesterday', '7days', 'custom'] as const).map((preset) => (
                                    <button
                                        key={preset}
                                        onClick={() => handlePresetChange(preset)}
                                        className={cn(
                                            "flex-1 text-[10px] font-bold transition-all first:rounded-l-md last:rounded-r-md",
                                            datePreset === preset
                                                ? "bg-blue-600 text-white"
                                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                        )}
                                    >
                                        {preset === 'thisMonth' ? '今月' :
                                            preset === 'today' ? '今日' :
                                                preset === 'yesterday' ? '昨日' :
                                                    preset === '7days' ? '7日' : 'カスタム'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom date picker popup */}
                        {isCustomDatePickerOpen && (
                            <div className="absolute top-full right-0 mt-2 z-[100] bg-white p-3 rounded-xl border border-gray-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 flex gap-2 items-center">
                                <div className="flex flex-col gap-0.5">
                                    <label className="text-[9px] font-bold text-gray-400 ml-1">開始日</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="date-input text-xs h-8"
                                    />
                                </div>
                                <span className="text-gray-400 mt-4">〜</span>
                                <div className="flex flex-col gap-0.5">
                                    <label className="text-[9px] font-bold text-gray-400 ml-1">終了日</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="date-input text-xs h-8"
                                    />
                                </div>
                                <button
                                    onClick={() => setIsCustomDatePickerOpen(false)}
                                    className="ml-2 mt-4 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    決定
                                </button>
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
                        {filteredData.length === 0 ? (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                                <p className="text-yellow-700 font-medium">この商材は Meta 広告を配信していません</p>
                                <p className="text-yellow-600 text-sm mt-1">Beyond タブまたは合計タブでデータを確認してください</p>
                            </div>
                        ) : (
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
                    </>
                )}

                {/* Data Tables */}
                <div className="mt-8 space-y-4">
                    <DataTable data={todayData} title="■案件別数値（当日）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={yesterdayData} title="■案件別数値（昨日）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={threeDayData} title="■案件別数値（直近3日間）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={sevenDayData} title="■案件別数値（直近7日間）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={filteredData} title="■案件別数値（選択期間）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
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

            {/* AI Analysis Modal */}
            <AIAnalysisModal
                isOpen={isAnalysisModalOpen}
                onClose={() => setIsAnalysisModalOpen(false)}
                data={initialData}
                campaigns={campaigns}
                baselineData={baselineData}
            />

            {/* Period Comparison Modal */}
            <PeriodComparisonModal
                isOpen={isComparisonModalOpen}
                onClose={() => setIsComparisonModalOpen(false)}
                data={initialData}
                campaigns={campaigns}
            />
        </>
    );
}
