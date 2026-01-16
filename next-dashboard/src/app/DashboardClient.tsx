'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ProcessedRow, safeDivide, filterByDateRange, filterByCampaign, getUniqueCampaigns, getUniqueCreatives, getUniqueBeyondPageNames, getUniqueVersionNames, getUniqueCreativeValues } from '@/lib/dataProcessor';
import { BaselineData } from '@/lib/aiAnalysis';
import { KPICard, KPIGrid } from '@/components/KPICard';
import { RevenueChart, CostChart, CVChart, RateChart, CostMetricChart, GenericBarChart, GenericRateChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import { RankingPanel } from '@/components/RankingPanel';
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
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);

    // Initialize dates on client-side only to avoid SSR/hydration mismatch
    useEffect(() => {
        if (!isClient) {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(formatDateForInput(firstOfMonth));
            setEndDate(formatDateForInput(now));
            setIsClient(true);

            // Check if this is a refresh callback
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('refreshed') === 'true') {
                setShowRefreshSuccess(true);
                // Remove the query param from URL
                window.history.replaceState({}, '', window.location.pathname);
                // Hide the message after 3 seconds
                setTimeout(() => setShowRefreshSuccess(false), 3000);
            }
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
        // Note: Filters are NOT reset when date changes - user selections are preserved
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
    // Step 0: Filter by date range first
    const dateFilteredData = useMemo(() => {
        if (!startDate || !endDate) {
            return initialData;
        }
        return filterByDateRange(initialData, new Date(startDate), new Date(endDate));
    }, [initialData, startDate, endDate]);

    // Step 1: Filter by campaign (商材)
    const campaignFilteredData = useMemo(() => {
        const beyondData = dateFilteredData.filter(row => row.Media === 'Beyond');
        if (selectedCampaign === 'All') {
            return beyondData;
        }
        return beyondData.filter(row => row.Campaign_Name === selectedCampaign);
    }, [dateFilteredData, selectedCampaign]);

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

    // Generate filter options (cascading, based on date-filtered data)
    const campaigns = useMemo(() => {
        const uniqueCampaigns = [...new Set(dateFilteredData.map(row => row.Campaign_Name).filter(c => c))];
        return uniqueCampaigns.sort();
    }, [dateFilteredData]);

    // beyond_page_name options: filtered by date + campaign
    const beyondPageNames = useMemo(() => {
        const uniqueNames = [...new Set(campaignFilteredData.map(row => row.beyond_page_name).filter(n => n))];
        return uniqueNames.sort();
    }, [campaignFilteredData]);

    // version_name options: filtered by date + campaign + beyond_page_name
    const versionNames = useMemo(() => {
        const uniqueVersions = [...new Set(pageNameFilteredData.map(row => row.version_name).filter(n => n))];
        return uniqueVersions.sort();
    }, [pageNameFilteredData]);

    // creative options: filtered by date + campaign + beyond_page_name + version_name
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

    // Data refresh handler
    const handleRefreshData = async () => {
        setIsRefreshing(true);
        try {
            const response = await fetch('/api/revalidate', { method: 'POST' });
            if (response.ok) {
                // Reload the page with a query param to show success message
                window.location.href = window.location.pathname + '?refreshed=true';
            }
        } catch (error) {
            console.error('Refresh failed:', error);
            setIsRefreshing(false);
        }
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

        // Revenue and Profit are already calculated in ProcessedRow (from Master_Setting)
        const revenue = filteredData.reduce((sum, row) => sum + row.Revenue, 0);
        // IHの場合は粗利=売上となるため、ProcessedRowのGross_Profitを使用
        const profit = filteredData.reduce((sum, row) => sum + row.Gross_Profit, 0);

        const displayCost = selectedTab === 'meta' ? metaCost : beyondCost;

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
            {/* Success Toast */}
            {showRefreshSuccess && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
                    <span>✅</span>
                    <span className="font-bold">データを更新しました</span>
                </div>
            )}
            <div className="max-w-[1920px] mx-auto pb-10">
                {/* Sticky Header + Filters */}
                <div className="sticky top-0 z-50 bg-[#e2e8f0] pt-2 md:pt-4 pb-2 md:pb-4 -mx-4 md:-mx-6 px-4 md:px-6 shadow-sm">
                    {/* Header Row: Title, Tabs, Actions */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-2 md:mb-4">
                        {/* Mobile Top Row: Title + Action Menu */}
                        <div className="flex items-center justify-between md:mr-auto w-full md:w-auto">
                            <h1 className="text-base md:text-xl font-bold text-gray-800 whitespace-nowrap truncate">allattain Dashboard</h1>

                            {/* Mobile Action Menu (Hamburger/More) */}
                            <div className="flex md:hidden gap-2">
                                <button
                                    onClick={handleRefreshData}
                                    disabled={isRefreshing}
                                    className="p-1 text-gray-600 hover:text-gray-800 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
                                    title="更新"
                                >
                                    <span className={isRefreshing ? 'animate-spin block text-xs' : 'text-xs'}>🔄</span>
                                </button>
                                <button
                                    onClick={() => setIsAnalysisModalOpen(true)}
                                    className="p-1 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-50"
                                    title="AI分析"
                                >
                                    <span className="text-xs">📊</span>
                                </button>
                                <button
                                    onClick={() => setIsComparisonModalOpen(true)}
                                    className="p-1 text-teal-600 hover:text-teal-800 rounded-full hover:bg-teal-50"
                                    title="比較"
                                >
                                    <span className="text-xs">📈</span>
                                </button>
                            </div>
                        </div>

                        {/* Tabs: Segmented Control on Mobile, Buttons on Desktop */}
                        <div className="w-full md:w-auto overflow-x-auto no-scrollbar">
                            <div className="flex p-1 bg-gray-200/50 rounded-lg md:bg-transparent md:p-0 w-full md:w-auto gap-1 md:gap-1">
                                <button
                                    onClick={() => setSelectedTab('total')}
                                    className={cn(
                                        "flex-1 md:flex-none px-3 py-1.5 md:py-1 text-[11px] md:text-xs font-medium rounded-md transition-all whitespace-nowrap text-center",
                                        selectedTab === 'total'
                                            ? 'bg-white text-blue-600 shadow-sm md:bg-blue-600 md:text-white md:shadow-none'
                                            : 'text-gray-600 hover:bg-gray-200/50 md:text-gray-600 md:hover:bg-gray-200'
                                    )}
                                >
                                    合計
                                </button>
                                <button
                                    onClick={() => setSelectedTab('meta')}
                                    className={cn(
                                        "flex-1 md:flex-none px-3 py-1.5 md:py-1 text-[11px] md:text-xs font-medium rounded-md transition-all whitespace-nowrap text-center",
                                        selectedTab === 'meta'
                                            ? 'bg-white text-blue-600 shadow-sm md:bg-blue-600 md:text-white md:shadow-none'
                                            : 'text-gray-600 hover:bg-gray-200/50 md:text-gray-600 md:hover:bg-gray-200'
                                    )}
                                >
                                    Meta
                                </button>
                                <button
                                    onClick={() => setSelectedTab('beyond')}
                                    className={cn(
                                        "flex-1 md:flex-none px-3 py-1.5 md:py-1 text-[11px] md:text-xs font-medium rounded-md transition-all whitespace-nowrap text-center",
                                        selectedTab === 'beyond'
                                            ? 'bg-white text-blue-600 shadow-sm md:bg-blue-600 md:text-white md:shadow-none'
                                            : 'text-gray-600 hover:bg-gray-200/50 md:text-gray-600 md:hover:bg-gray-200'
                                    )}
                                >
                                    Beyond
                                </button>
                            </div>
                        </div>

                        {/* Desktop Actions (Hidden on Mobile) */}
                        <div className="hidden md:flex gap-2 ml-auto">
                            <button
                                onClick={handleRefreshData}
                                disabled={isRefreshing}
                                className="px-3 py-1.5 text-xs font-bold bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                                <span>{isRefreshing ? '更新中...' : '更新'}</span>
                            </button>
                            <button
                                onClick={() => setIsAnalysisModalOpen(true)}
                                className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <span>📊</span>
                                <span>AI分析</span>
                            </button>
                            <button
                                onClick={() => setIsComparisonModalOpen(true)}
                                className="px-3 py-1.5 text-xs font-bold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <span>📈</span>
                                <span>比較</span>
                            </button>
                        </div>
                    </div>

                    {/* Filter Area: Collapsible on Mobile */}
                    <details className="group md:block" open>
                        <summary className="flex md:hidden items-center justify-between p-2 mb-2 bg-white rounded-lg border border-gray-200 shadow-sm text-xs font-medium list-none cursor-pointer">
                            <div className="flex items-center gap-2 truncate text-gray-600">
                                <span className="mr-1">🔍 絞り込み:</span>
                                {selectedCampaign === 'All' ? '全商材' : selectedCampaign}
                                <span className="text-gray-300">|</span>
                                {datePreset === 'thisMonth' ? '今月' :
                                    datePreset === 'today' ? '今日' :
                                        datePreset === 'yesterday' ? '昨日' :
                                            startDate === endDate ? startDate.slice(5) : `${startDate.slice(5)}~`}
                            </div>
                            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                        </summary>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 p-2 md:p-0 bg-white md:bg-transparent rounded-lg md:rounded-none border md:border-none border-gray-100 shadow-sm md:shadow-none mb-2 md:mb-0">
                            {/* 商材 Column */}
                            <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
                                <span className="text-[10px] font-bold text-gray-500 tracking-wide md:block hidden">商材</span>
                                <div className="md:hidden text-[10px] font-bold text-gray-500 mb-1">商材を選択</div>
                                <select
                                    value={selectedCampaign}
                                    onChange={(e) => handleCampaignChange(e.target.value)}
                                    className="filter-select text-[10px] md:text-xs px-2 h-7 md:h-auto w-full truncate bg-white border md:border-gray-200 rounded-lg"
                                    title={selectedCampaign}
                                >
                                    <option value="All">All</option>
                                    {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* beyond_page_name Column */}
                            <div className="col-span-2 md:col-span-1">
                                <MultiSelect
                                    label="beyond_page_name"
                                    options={beyondPageNames}
                                    selectedValues={selectedBeyondPageNames}
                                    onChange={handleBeyondPageNamesChange}
                                />
                            </div>

                            {/* version_name Column */}
                            <div className="col-span-2 md:col-span-1">
                                <MultiSelect
                                    label="version_name"
                                    options={versionNames}
                                    selectedValues={selectedVersionNames}
                                    onChange={handleVersionNamesChange}
                                />
                            </div>

                            {/* クリエイティブ Column */}
                            <div className="col-span-2 md:col-span-1">
                                <MultiSelect
                                    label="クリエイティブ"
                                    options={creativeValues}
                                    selectedValues={selectedCreatives}
                                    onChange={setSelectedCreatives}
                                />
                            </div>

                            {/* 期間 Column */}
                            <div className="flex flex-col gap-1 col-span-2 md:col-span-1 lg:col-span-1">
                                <div className="flex items-center justify-between md:block">
                                    <span className="text-[10px] font-bold text-gray-500 tracking-wide hidden md:block">期間</span>
                                    <span className="text-[10px] font-bold text-gray-500 tracking-wide md:hidden mb-1 block">期間を選択</span>
                                    <div className="flex items-center gap-1 text-[9px] truncate md:float-right">
                                        <span className="text-blue-500">●</span>
                                        <span className="font-bold text-gray-700">{startDate.replace(/-/g, '/').slice(5)}〜{endDate.replace(/-/g, '/').slice(5)}</span>
                                    </div>
                                </div>
                                <div className="flex bg-white rounded-lg border border-gray-200 shadow-sm h-10 md:h-8 overflow-hidden">
                                    {(['thisMonth', 'today', 'yesterday', '7days', 'custom'] as const).map((preset) => (
                                        <button
                                            key={preset}
                                            onClick={() => handlePresetChange(preset)}
                                            className={cn(
                                                "flex-1 text-[10px] md:text-[9px] font-bold transition-all border-r last:border-r-0 border-gray-100 active:bg-blue-50",
                                                datePreset === preset
                                                    ? "bg-blue-600 text-white border-blue-600"
                                                    : "text-gray-500 hover:bg-gray-50"
                                            )}
                                        >
                                            {preset === 'thisMonth' ? '今月' :
                                                preset === 'today' ? '今日' :
                                                    preset === 'yesterday' ? '昨日' :
                                                        preset === '7days' ? '7日' : '選択'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </details>

                    {/* Custom date picker popup (Responsive) */}
                    {isCustomDatePickerOpen && (
                        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
                            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm flex flex-col gap-4 animate-in zoom-in-95">
                                <h3 className="text-lg font-bold text-gray-800">期間を指定</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500">開始日</label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="date-input text-base p-2 border rounded-lg"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500">終了日</label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="date-input text-base p-2 border rounded-lg"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-2">
                                    <button
                                        onClick={() => setIsCustomDatePickerOpen(false)}
                                        className="flex-1 py-3 text-sm font-bold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        onClick={() => setIsCustomDatePickerOpen(false)}
                                        className="flex-1 py-3 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200"
                                    >
                                        決定
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* KPI Cards */}
                {(selectedTab === 'total' || selectedTab === 'beyond') && (
                    <div className="space-y-2">
                        {/* Always visible grid on all screens */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <KPICard
                                label="出稿金額"
                                value={Math.round(kpis.cost)}
                                unit="円"
                                colorClass="text-red"
                                source={selectedTab === 'total' ? 'Beyond' : undefined}
                            />
                            <KPICard label="売上" value={Math.round(kpis.revenue)} unit="円" colorClass="text-blue" />
                            <KPICard label="粗利" value={Math.round(kpis.profit)} unit="円" colorClass="text-orange" />
                            <KPICard label="CPA" value={Math.round(kpis.cpa)} unit="円" />
                            <KPICard
                                label="CV"
                                value={kpis.cv}
                                unit="件"
                                source={selectedTab === 'total' ? 'Beyond' : undefined}
                            />
                            <KPICard label="ROAS" value={kpis.roas.toFixed(2)} unit="倍" colorClass="text-blue" />
                        </div>

                        {/* Secondary Metrics - Also always visible in compact grid */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <KPICard label="IMP" value={kpis.impressions} source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CLICK" value={kpis.metaClicks} source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="商品LP CLICK" value={kpis.beyondClicks} unit="件" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CTR" value={kpis.ctr.toFixed(1)} unit="%" colorClass="text-green" />
                            <KPICard label="MCVR" value={kpis.mcvr.toFixed(1)} unit="%" colorClass="text-green" />
                            <KPICard label="CVR" value={kpis.cvr.toFixed(1)} unit="%" colorClass="text-green" />
                            <KPICard label="CPM" value={Math.round(kpis.cpm)} unit="円" />
                            <KPICard label="CPC" value={Math.round(kpis.cpc)} unit="円" />
                            <KPICard label="MCPA" value={Math.round(kpis.mcpa)} unit="円" />
                            <KPICard label="FV離脱率" value={kpis.fvExitRate.toFixed(1)} unit="%" />
                            <KPICard label="SV離脱率" value={kpis.svExitRate.toFixed(1)} unit="%" />
                            <KPICard label="回収率" value={kpis.recoveryRate.toFixed(1)} unit="%" colorClass="text-blue" />
                        </div>
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
                            <div className="space-y-3">
                                {/* Priority KPIs */}
                                <KPIGrid columns={4}>
                                    <KPICard label="出稿金額" value={Math.round(kpis.cost)} unit="円" colorClass="text-red" />
                                    <KPICard label="CV" value={kpis.metaMCV} unit="件" />
                                    <KPICard label="CPA" value={Math.round(kpis.cpa)} unit="円" />
                                    <KPICard label="CPC" value={Math.round(kpis.cpc)} unit="円" />
                                </KPIGrid>

                                {/* Toggle for Secondary */}
                                <div className="md:hidden">
                                    <details className="group">
                                        <summary className="flex items-center justify-center p-2 text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer list-none select-none transition-colors">
                                            <span className="group-open:hidden">▼ 詳細指標を表示</span>
                                            <span className="hidden group-open:inline">▲ 詳細指標を隠す</span>
                                        </summary>

                                        <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <KPIGrid columns={4}>
                                                <KPICard label="IMP" value={kpis.impressions} />
                                                <KPICard label="CLICK" value={kpis.metaClicks} />
                                                <KPICard label="CTR" value={kpis.ctr.toFixed(1)} unit="%" colorClass="text-green" />
                                                <KPICard label="CPM" value={Math.round(kpis.cpm)} unit="円" />
                                            </KPIGrid>
                                        </div>
                                    </details>
                                </div>

                                {/* Desktop: Always show secondary KPIs */}
                                <div className="hidden md:block mt-3">
                                    <KPIGrid columns={4}>
                                        <KPICard label="IMP" value={kpis.impressions} />
                                        <KPICard label="CLICK" value={kpis.metaClicks} />
                                        <KPICard label="CTR" value={kpis.ctr.toFixed(1)} unit="%" colorClass="text-green" />
                                        <KPICard label="CPM" value={Math.round(kpis.cpm)} unit="円" />
                                    </KPIGrid>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* CPA Ranking */}
                <RankingPanel data={filteredData} selectedCampaign={selectedCampaign} />

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
