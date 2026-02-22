'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ProcessedRow, safeDivide, filterByDateRange, filterByCampaign, getUniqueCampaigns, getUniqueCreatives, getUniqueBeyondPageNames, getUniqueVersionNames, getUniqueCreativeValues, CreativeMasterItem } from '@/lib/dataProcessor';
import { BaselineData } from '@/lib/aiAnalysis';

import { KPICard, KPIGrid } from '@/components/KPICard';
import { RevenueChart, CostChart, CVChart, RateChart, CostMetricChart, GenericBarChart, GenericRateChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import { DailyDataTable } from '@/components/DailyDataTable';
import { CreativeMetricsTable } from '@/components/CreativeMetricsTable';
import { VersionMetricsTable } from '@/components/VersionMetricsTable';
import { RankingPanel } from '@/components/RankingPanel';
import AIAnalysisModal from '@/components/AIAnalysisModal';
import PeriodComparisonModal from '@/components/PeriodComparisonModal';
import { MultiSelect } from '@/components/MultiSelect';
import { ChatBot } from '@/components/ChatBot';

interface DashboardClientProps {
    initialData: ProcessedRow[];
    baselineData: BaselineData;
    masterProjects: string[];
    creativeMasterData?: CreativeMasterItem[]; // Add this
    articleMasterData?: Record<string, string>[];
    reportListData?: Record<string, string>[];
    isDemo?: boolean;
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

export default function DashboardClient({ initialData, baselineData, masterProjects, creativeMasterData, articleMasterData, reportListData, isDemo }: DashboardClientProps) {
    const [selectedTab, setSelectedTab] = useState<TabType>('total');
    const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
    // 複数選択対応（配列で管理）
    const [selectedBeyondPageNames, setSelectedBeyondPageNames] = useState<string[]>([]);
    const [selectedVersionNames, setSelectedVersionNames] = useState<string[]>([]);
    const [selectedCreatives, setSelectedCreatives] = useState<string[]>([]);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportCampaigns, setReportCampaigns] = useState<string[]>([]);
    const [reportCopied, setReportCopied] = useState(false);
    const [reportStep, setReportStep] = useState<0 | 1 | 2>(0); // 0: Select, 1: Confirm, 2: Result
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [generatedReportInfo, setGeneratedReportInfo] = useState<{
        adminUrl: string;
        spreadsheetUrl: string;
    } | null>(null);
    // レポート用期間選択
    const [reportPeriodPreset, setReportPeriodPreset] = useState<'7days' | '14days' | '30days' | 'thisMonth' | 'custom' | ''>('');
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');

    // Date state - use fixed initial values to avoid hydration mismatch
    const [datePreset, setDatePreset] = useState<'thisMonth' | 'today' | 'yesterday' | '7days' | 'custom'>('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isClient, setIsClient] = useState(false);
    const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);

    // デモ用データの生成ロジックは削除 (Page側で処理)

    // Initialize dates on client-side only to avoid SSR/hydration mismatch
    useEffect(() => {
        if (!isClient) {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(formatDateForInput(firstOfMonth));
            setEndDate(formatDateForInput(now));
            setIsClient(true);

            // 1. Check for demo mode in URL (Removed)



            // 2. Check if this is a refresh callback
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('refreshed') === 'true') {
                setShowRefreshSuccess(true);
                // Remove the query param from URL (preserving mode=demo if it existed)
                const newParams = new URLSearchParams(window.location.search);
                newParams.delete('refreshed');
                const newSearch = newParams.toString() ? `?${newParams.toString()}` : '';
                window.history.replaceState({}, '', window.location.pathname + newSearch);
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

        // 期間変更時にフィルターを維持

    };

    // Filter data based on selections
    // Filter data based on selections
    const currentBaseData = initialData;

    // 属性フィルター（商材・ページ等）のみを適用したデータ（日付フィルターなし）
    const attributeFilteredData = useMemo(() => {
        let data = currentBaseData;

        // Tab filter
        if (selectedTab === 'meta') {
            data = data.filter(row => row.Media === 'Meta');
        } else if (selectedTab === 'beyond') {
            data = data.filter(row => row.Media === 'Beyond');
        }

        // Campaign filter (商材)
        if (selectedCampaigns.length > 0) {
            data = filterByCampaign(data, selectedCampaigns);
        }

        // beyond_page_name filter
        if (selectedBeyondPageNames.length > 0) {
            data = data.filter(row => {
                if (row.Media === 'Beyond') {
                    return selectedBeyondPageNames.includes(row.beyond_page_name);
                } else {
                    return selectedBeyondPageNames.some(name => row.Creative && row.Creative.includes(name));
                }
            });
        }

        // version_name filter
        if (selectedVersionNames.length > 0) {
            data = data.filter(row => selectedVersionNames.includes(row.version_name));
        }

        // Creative filter
        if (selectedCreatives.length > 0) {
            data = data.filter(row => {
                if (row.Media === 'Beyond') {
                    return selectedCreatives.includes(row.creative_value);
                } else {
                    return selectedCreatives.some(creative => row.Creative && row.Creative.includes(creative));
                }
            });
        }

        return data;
    }, [currentBaseData, selectedTab, selectedCampaigns, selectedBeyondPageNames, selectedVersionNames, selectedCreatives]);

    // さらに日付フィルターを適用したデータ（選択期間・グラフ・KPI用）
    const filteredData = useMemo(() => {
        if (!startDate || !endDate) return attributeFilteredData;
        return filterByDateRange(attributeFilteredData, new Date(startDate), new Date(endDate));
    }, [attributeFilteredData, startDate, endDate]);

    // --- Cascading Filter Logic ---
    // 1. まず期間でデータを絞る
    const dataFilteredByPeriod = useMemo(() => {
        if (!startDate || !endDate) return currentBaseData;
        return filterByDateRange(currentBaseData, new Date(startDate), new Date(endDate));
    }, [currentBaseData, startDate, endDate]);

    // 2. 期間内のデータから商材の選択肢を生成
    const campaigns = useMemo(() => getUniqueCampaigns(dataFilteredByPeriod), [dataFilteredByPeriod]);

    // 3. 期間 + 商材で絞り込んだデータからbeyond_page_nameの選択肢を生成
    const dataForBeyondPageFilter = useMemo(() => {
        return filterByCampaign(dataFilteredByPeriod, selectedCampaigns);
    }, [dataFilteredByPeriod, selectedCampaigns]);
    const beyondPageNames = useMemo(() => getUniqueBeyondPageNames(dataForBeyondPageFilter), [dataForBeyondPageFilter]);

    // 4. 期間 + 商材 + beyond_page_nameで絞り込んだデータからversion_nameの選択肢を生成
    const dataForVersionFilter = useMemo(() => {
        if (selectedBeyondPageNames.length === 0) return dataForBeyondPageFilter;
        return dataForBeyondPageFilter.filter(row =>
            row.Media === 'Beyond' && selectedBeyondPageNames.includes(row.beyond_page_name)
        );
    }, [dataForBeyondPageFilter, selectedBeyondPageNames]);
    const versionNames = useMemo(() => getUniqueVersionNames(dataForVersionFilter), [dataForVersionFilter]);

    // 5. 期間 + 商材 + beyond_page_name + version_nameで絞り込んだデータからクリエイティブの選択肢を生成
    const dataForCreativeFilter = useMemo(() => {
        if (selectedVersionNames.length === 0) return dataForVersionFilter;
        return dataForVersionFilter.filter(row => selectedVersionNames.includes(row.version_name));
    }, [dataForVersionFilter, selectedVersionNames]);
    const creativeValues = useMemo(() => getUniqueCreativeValues(dataForCreativeFilter), [dataForCreativeFilter]);

    // Reset downstream filters when upstream filter changes
    const handleCampaignChange = (values: string[]) => {
        setSelectedCampaigns(values);
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

    // Helper for formatting possibly non-numeric metrics (when version_name filtered)
    const fmtRate = (val: number | string | undefined) => {
        if (typeof val === 'number') return val.toFixed(1);
        if (typeof val === 'string') return val;
        return '-';
    };
    const fmtAmt = (val: number | string | undefined) => {
        if (typeof val === 'number') return Math.round(val).toLocaleString('ja-JP');
        if (typeof val === 'string') return val;
        return '-';
    };

    // Data refresh handler
    // Data refresh handler
    const handleRefreshData = async () => {
        if (isDemo) return;
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

    const isVersionFilterActive = selectedVersionNames.length > 0;

    // --- 固定期間のテーブル用データ抽出 ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    // 属性フィルターのみかかったデータから抽出するので、メインの日付選択に依存しない
    const todayData = useMemo(() => filterByDateRange(attributeFilteredData, today, today), [attributeFilteredData]);
    const yesterdayData = useMemo(() => filterByDateRange(attributeFilteredData, yesterday, yesterday), [attributeFilteredData]);
    const threeDayData = useMemo(() => filterByDateRange(attributeFilteredData, threeDaysAgo, today), [attributeFilteredData]);
    const sevenDayData = useMemo(() => filterByDateRange(attributeFilteredData, sevenDaysAgo, today), [attributeFilteredData]);

    const kpis = useMemo(() => {
        const metaData = filteredData.filter(row => row.Media === 'Meta');
        const beyondData = filteredData.filter(row => row.Media === 'Beyond');

        // Meta aggregations
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicksRaw = metaData.reduce((sum, row) => sum + row.Clicks, 0);
        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);

        // Beyond aggregations
        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const beyondPV = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicksRaw = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const beyondCV = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

        // --- version_name フィルター有効時の切り替え ---
        // フィルター時は PV を Clicks として扱う
        const displayMetaClicks = isVersionFilterActive ? beyondPV : metaClicksRaw;
        const displayBeyondClicks = beyondClicksRaw; // 商品LPクリックは常に本来の遷移数を表示

        // MCV from Meta
        const metaMCV = metaData.reduce((sum, row) => sum + row.MCV, 0);

        // Revenue and Profit
        const revenue = filteredData.reduce((sum, row) => sum + row.Revenue, 0);
        const profit = filteredData.reduce((sum, row) => sum + row.Gross_Profit, 0);

        // CPC は常に Beyond出稿金額 / PV (or Clicks) で計算（ユーザー要望）
        const displayCPC = isVersionFilterActive
            ? safeDivide(beyondCost, beyondPV)
            : (selectedTab === 'beyond' ? safeDivide(beyondCost, beyondPV) : safeDivide(metaCost, displayMetaClicks));

        return {
            cost: selectedTab === 'meta' ? metaCost : beyondCost,
            revenue,
            profit,
            impressions: isVersionFilterActive ? '-' : impressions,
            metaClicks: displayMetaClicks,
            beyondClicks: displayBeyondClicks,
            cv: beyondCV,
            metaMCV,
            pv: beyondPV,
            fvExit: fvExit,
            svExit: svExit,
            ctr: isVersionFilterActive ? '-' : (safeDivide(displayMetaClicks, impressions) * 100),
            mcvr: safeDivide(displayBeyondClicks, beyondPV) * 100,
            cvr: safeDivide(beyondCV, displayBeyondClicks) * 100,
            cpm: isVersionFilterActive ? '-' : (safeDivide(metaCost, impressions) * 1000),
            cpc: displayCPC,
            mcpa: safeDivide(beyondCost, displayBeyondClicks),
            cpa: safeDivide(beyondCost, beyondCV),
            fvExitRate: safeDivide(fvExit, beyondPV) * 100,
            svExitRate: safeDivide(svExit, beyondPV - fvExit) * 100,
            totalExitRate: safeDivide(fvExit + svExit, beyondPV) * 100,
            roas: Math.floor(safeDivide(revenue, selectedTab === 'meta' ? metaCost : beyondCost) * 100),
        };
    }, [filteredData, selectedTab, isVersionFilterActive]);



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
                                    disabled={isRefreshing || isDemo}
                                    className={cn(
                                        "p-1 text-gray-600 rounded-full transition-colors",
                                        isDemo ? "opacity-50 cursor-not-allowed" : "hover:text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                                    )}
                                    title={isDemo ? "デモ版では更新できません" : "更新"}
                                >
                                    <span className={isRefreshing ? 'animate-spin block text-xs' : 'text-xs'}>🔄</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setIsReportModalOpen(true);
                                    }}
                                    className="p-1 text-orange-600 hover:text-orange-800 rounded-full hover:bg-orange-50"
                                    title="レポート作成"
                                >
                                    <span className="text-xs">📋</span>
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
                                disabled={isRefreshing || isDemo}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-bold text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-all",
                                    isDemo ? "bg-gray-400 cursor-not-allowed opacity-80" : "bg-gray-600 hover:bg-gray-700 disabled:opacity-50"
                                )}
                                title={isDemo ? "デモ版では更新できません" : "更新"}
                            >
                                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                                <span>{isRefreshing ? '更新中...' : '更新'}</span>
                            </button>
                            <button
                                onClick={() => {
                                    setIsReportModalOpen(true);
                                }}
                                className="px-3 py-1.5 text-xs font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <span>📋</span>
                                <span>レポート</span>
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
                                {selectedCampaigns.length === 0 ? '全商材' : selectedCampaigns.join(', ')}
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
                            <div className="col-span-2 md:col-span-1">
                                <MultiSelect
                                    label="商材"
                                    options={campaigns}
                                    selectedValues={selectedCampaigns}
                                    onChange={handleCampaignChange}
                                />
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
                                            onChange={(e) => {
                                                setStartDate(e.target.value);
                                                // 日付変更時にフィルターを維持
                                            }}
                                            className="date-input text-base p-2 border rounded-lg"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500">終了日</label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => {
                                                setEndDate(e.target.value);
                                                // 日付変更時にフィルターを維持
                                            }}
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
                            <KPICard label="出稿金額" value={fmtAmt(kpis.cost)} unit="円" colorClass="text-red" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="売上" value={fmtAmt(kpis.revenue)} unit="円" colorClass="text-blue" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="粗利" value={fmtAmt(kpis.profit)} unit="円" colorClass="text-orange" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CPA" value={fmtAmt(kpis.cpa)} unit="円" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CV" value={kpis.cv} unit="件" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="ROAS" value={kpis.roas} unit="%" colorClass="text-blue" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                        </div>

                        {/* Secondary Metrics - Also always visible in compact grid */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <KPICard label="IMP" value={kpis.impressions} source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CLICK" value={kpis.metaClicks} source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="商品LP CLICK" value={kpis.beyondClicks} unit="件" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CTR" value={fmtRate(kpis.ctr)} unit="%" colorClass="text-green" source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="MCVR" value={fmtRate(kpis.mcvr)} unit="%" colorClass="text-green" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CVR" value={fmtRate(kpis.cvr)} unit="%" colorClass="text-green" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CPM" value={fmtAmt(kpis.cpm)} unit="円" source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CPC" value={fmtAmt(kpis.cpc)} unit="円" source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="MCPA" value={fmtAmt(kpis.mcpa)} unit="円" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="FV離脱率" value={fmtRate(kpis.fvExitRate)} unit="%" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="SV離脱率" value={fmtRate(kpis.svExitRate)} unit="%" source={selectedTab === 'total' ? 'Beyond' : undefined} />
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
                                    <KPICard label="出稿金額" value={fmtAmt(kpis.cost)} unit="円" colorClass="text-red" />
                                    <KPICard label="CV" value={kpis.metaMCV} unit="件" />
                                    <KPICard label="CPA" value={fmtAmt(kpis.cpa)} unit="円" />
                                    <KPICard label="CPC" value={fmtAmt(kpis.cpc)} unit="円" />
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
                                                <KPICard label="CTR" value={fmtRate(kpis.ctr)} unit="%" colorClass="text-green" />
                                                <KPICard label="CPM" value={fmtAmt(kpis.cpm)} unit="円" />
                                            </KPIGrid>
                                        </div>
                                    </details>
                                </div>

                                {/* Desktop: Always show secondary KPIs */}
                                <div className="hidden md:block mt-3">
                                    <KPIGrid columns={4}>
                                        <KPICard label="IMP" value={kpis.impressions} />
                                        <KPICard label="CLICK" value={kpis.metaClicks} />
                                        <KPICard label="CTR" value={fmtRate(kpis.ctr)} unit="%" colorClass="text-green" />
                                        <KPICard label="CPM" value={fmtAmt(kpis.cpm)} unit="円" />
                                    </KPIGrid>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Ranking and Data Tables Section */}
                <div className="mt-12 space-y-6">
                    <RankingPanel data={filteredData} selectedCampaign={selectedCampaigns} isVersionFilterActive={isVersionFilterActive} />

                    <CreativeMetricsTable
                        data={filteredData}
                        title={`■クリエイティブ別数値（${startDate.replace(/-/g, '/')}〜${endDate.replace(/-/g, '/')}）`}
                        creativeMasterData={creativeMasterData}
                    />

                    <VersionMetricsTable
                        data={filteredData}
                        title={`■記事別数値（${startDate.replace(/-/g, '/')}〜${endDate.replace(/-/g, '/')}）`}
                    />

                    <DataTable data={todayData} title="■案件別数値（当日）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={yesterdayData} title="■案件別数値（昨日）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={threeDayData} title="■案件別数値（直近3日間）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={sevenDayData} title="■案件別数値（直近7日間）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                    <DataTable data={filteredData} title="■案件別数値（選択期間）" viewMode={selectedTab} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                </div>

                {/* Daily Data Table - placed above Charts */}
                <div className="mt-8">
                    <DailyDataTable data={filteredData} title="■選択期間（日別）" viewMode={selectedTab} isVersionFilterActive={isVersionFilterActive} />
                </div>

                {/* Charts */}
                <div className="mt-8">
                    {selectedTab === 'total' && (
                        <>
                            {/* Row 1: 出稿金額、売上、粗利、CPA、CV、ROAS - same order as KPI cards */}
                            <div className="grid grid-cols-3 gap-4">
                                <CostChart data={filteredData.filter(r => r.Media === 'Beyond')} title="出稿金額" />
                                <RevenueChart data={filteredData.filter(r => r.Media === 'Beyond')} title="売上" />
                                <GenericBarChart data={filteredData} title="粗利" dataKey="Gross_Profit" />
                                <CostMetricChart data={filteredData.filter(r => r.Media === 'Beyond')} title="CPA" costDivisorKey="CV" />
                                <CVChart data={filteredData.filter(r => r.Media === 'Beyond')} title="CV" />
                                <GenericRateChart data={filteredData.filter(r => r.Media === 'Beyond')} title="ROAS" numeratorKey="Revenue" denominatorKey="Cost" multiplier={100} unit="%" />
                            </div>
                            <div className="h-4" />
                            {/* Row 2: IMP、CLICK、商品LP CLICK、CTR、MCVR、CVR */}
                            <div className="grid grid-cols-3 gap-4">
                                <GenericBarChart data={filteredData.filter(r => r.Media === 'Meta')} title="IMP" dataKey="Impressions" />
                                <GenericBarChart data={filteredData.filter(r => r.Media === 'Meta')} title="CLICK" dataKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <GenericBarChart data={filteredData.filter(r => r.Media === 'Beyond')} title="商品LP CLICK" dataKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <GenericRateChart data={filteredData.filter(r => r.Media === 'Meta')} title="CTR" numeratorKey={isVersionFilterActive ? "PV" : "Clicks"} denominatorKey="Impressions" />
                                <GenericRateChart data={filteredData.filter(r => r.Media === 'Beyond')} title="MCVR" numeratorKey={isVersionFilterActive ? "PV" : "Clicks"} denominatorKey="PV" />
                                <GenericRateChart data={filteredData.filter(r => r.Media === 'Beyond')} title="CVR" numeratorKey="CV" denominatorKey={isVersionFilterActive ? "PV" : "Clicks"} />
                            </div>
                            <div className="h-4" />
                            {/* Row 3: CPM、CPC、MCPA、FV離脱率、SV離脱率、回収率 */}
                            <div className="grid grid-cols-3 gap-4">
                                <CostMetricChart data={filteredData.filter(r => r.Media === 'Meta')} title="CPM" costDivisorKey="Impressions" multiplier={1000} />
                                <CostMetricChart data={filteredData.filter(r => r.Media === 'Meta')} title="CPC" costDivisorKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <CostMetricChart data={filteredData.filter(r => r.Media === 'Beyond')} title="MCPA" costDivisorKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <GenericRateChart data={filteredData.filter(r => r.Media === 'Beyond')} title="FV離脱率" numeratorKey="FV_Exit" denominatorKey="PV" />
                                <GenericRateChart data={filteredData.filter(r => r.Media === 'Beyond')} title="SV離脱率" numeratorKey="SV_Exit" denominatorKey="PV" />
                            </div>
                        </>
                    )}

                    {selectedTab === 'meta' && (
                        <>
                            {/* Row 1: 出稿金額、CV、CPA、CPC - same order as KPI cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <CostChart data={filteredData} title="出稿金額" />
                                <GenericBarChart data={filteredData} title="CV" dataKey="MCV" />
                                <CostMetricChart data={filteredData} title="CPA" costDivisorKey="CV" />
                                <CostMetricChart data={filteredData} title="CPC" costDivisorKey={isVersionFilterActive ? "PV" : "Clicks"} />
                            </div>
                            <div className="h-4" />
                            {/* Row 2: IMP、CLICK、CTR、CPM */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <GenericBarChart data={filteredData} title="IMP" dataKey="Impressions" />
                                <GenericBarChart data={filteredData} title="CLICK" dataKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <GenericRateChart data={filteredData} title="CTR" numeratorKey={isVersionFilterActive ? "PV" : "Clicks"} denominatorKey="Impressions" />
                                <CostMetricChart data={filteredData} title="CPM" costDivisorKey="Impressions" multiplier={1000} />
                            </div>
                        </>
                    )}

                    {selectedTab === 'beyond' && (
                        <>
                            {/* Row 1: 出稿金額、売上、粗利、CPA、CV、ROAS */}
                            <div className="grid grid-cols-3 gap-4">
                                <CostChart data={filteredData} title="出稿金額" />
                                <RevenueChart data={filteredData} title="売上" />
                                <GenericBarChart data={filteredData} title="粗利" dataKey="Gross_Profit" />
                                <CostMetricChart data={filteredData} title="CPA" costDivisorKey="CV" />
                                <CVChart data={filteredData} title="CV" />
                                <GenericRateChart data={filteredData} title="ROAS" numeratorKey="Revenue" denominatorKey="Cost" multiplier={1} unit="倍" />
                            </div>
                            <div className="h-4" />
                            {/* Row 2: PV、商品LP CLICK、MCVR、CVR、CPC、MCPA */}
                            <div className="grid grid-cols-3 gap-4">
                                <GenericBarChart data={filteredData} title="PV" dataKey="PV" />
                                <GenericBarChart data={filteredData} title="商品LP CLICK" dataKey="Clicks" />
                                <GenericRateChart data={filteredData} title="MCVR" numeratorKey="Clicks" denominatorKey="PV" />
                                <GenericRateChart data={filteredData} title="CVR" numeratorKey="CV" denominatorKey="Clicks" />
                                <CostMetricChart data={filteredData} title="CPC" costDivisorKey="PV" />
                                <CostMetricChart data={filteredData} title="MCPA" costDivisorKey="Clicks" />
                            </div>
                            <div className="h-4" />
                            {/* Row 3: FV離脱率、SV離脱率、回収率 */}
                            <div className="grid grid-cols-3 gap-4">
                                <GenericRateChart data={filteredData} title="FV離脱率" numeratorKey="FV_Exit" denominatorKey="PV" />
                                <GenericRateChart data={filteredData} title="SV離脱率" numeratorKey="SV_Exit" denominatorKey="PV" />
                                <GenericRateChart data={filteredData} title="回収率" numeratorKey="Revenue" denominatorKey="Cost" />
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

            {/* Report Generation Modal */}
            {isReportModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg flex flex-col gap-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span>📋</span>
                            <span>クライアント共有用レポート作成</span>
                        </h3>

                        {reportStep === 0 && (
                            <>
                                <p className="text-sm text-gray-600">
                                    共有したい商材と期間を選択してください。
                                    <br />
                                    <span className="text-xs text-gray-500">※売上・粗利・ROAS等の内部数値は除外されます</span>
                                </p>

                                {/* 商材選択（複数可） */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500">① 商材を選択（複数可）</label>
                                    <div className="max-h-40 overflow-y-auto border rounded-lg p-2 bg-white space-y-1">
                                        {masterProjects.map(c => (
                                            <label key={c} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={reportCampaigns.includes(c)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setReportCampaigns([...reportCampaigns, c]);
                                                        } else {
                                                            setReportCampaigns(reportCampaigns.filter(x => x !== c));
                                                        }
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded"
                                                />
                                                <span className="text-sm text-gray-700">{c}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {reportCampaigns.length > 0 && (
                                        <div className="text-xs text-blue-600">
                                            {reportCampaigns.length}件選択中
                                        </div>
                                    )}
                                </div>

                                {/* 期間選択 */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500">② 期間を選択</label>
                                    <div className="grid grid-cols-5 gap-1 bg-gray-100 p-1 rounded-lg">
                                        {(['7days', '14days', '30days', 'thisMonth', 'custom'] as const).map((preset) => (
                                            <button
                                                key={preset}
                                                onClick={() => {
                                                    setReportPeriodPreset(preset);
                                                    if (preset !== 'custom') {
                                                        const now = new Date();
                                                        const yesterday = new Date(now);
                                                        yesterday.setDate(yesterday.getDate() - 1);

                                                        let start = new Date(yesterday);
                                                        let end = new Date(yesterday);

                                                        if (preset === '7days') start.setDate(yesterday.getDate() - 6);
                                                        else if (preset === '14days') start.setDate(yesterday.getDate() - 13);
                                                        else if (preset === '30days') start.setDate(yesterday.getDate() - 29);
                                                        else if (preset === 'thisMonth') {
                                                            start = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
                                                        }

                                                        setReportStartDate(formatDateForInput(start));
                                                        setReportEndDate(formatDateForInput(end));
                                                    }
                                                }}
                                                className={`px-2 py-1.5 text-[10px] font-bold rounded transition-all ${reportPeriodPreset === preset
                                                    ? 'bg-blue-600 text-white shadow'
                                                    : 'bg-white text-gray-600 hover:bg-gray-200 shadow-sm border border-gray-100'
                                                    }`}
                                            >
                                                {preset === '7days' ? '7日' : preset === '14days' ? '14日' : preset === '30days' ? '30日' : preset === 'thisMonth' ? '今月' : 'カスタム'}
                                            </button>
                                        ))}
                                    </div>

                                    {reportPeriodPreset === 'custom' && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
                                            <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
                                        </div>
                                    )}

                                    {reportStartDate && reportEndDate && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            選択期間: {reportStartDate.replace(/-/g, '/')} 〜 {reportEndDate.replace(/-/g, '/')}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 mt-4">
                                    <button
                                        onClick={() => setIsReportModalOpen(false)}
                                        className="flex-1 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        disabled={reportCampaigns.length === 0 || !reportStartDate || !reportEndDate}
                                        onClick={() => setReportStep(1)}
                                        className="flex-1 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                                    >
                                        次へ
                                    </button>
                                </div>
                            </>
                        )}

                        {reportStep === 1 && (
                            <div className="flex flex-col gap-4 py-2">
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3">
                                    <div className="flex flex-col gap-1 text-sm">
                                        <span className="text-gray-500">対象商材:</span>
                                        <div className="flex flex-wrap gap-1">
                                            {reportCampaigns.map(c => (
                                                <span key={c} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">対象期間:</span>
                                        <span className="font-bold text-gray-800">{reportStartDate} 〜 {reportEndDate}</span>
                                    </div>
                                    <div className="pt-2 border-t border-blue-200 text-[11px] text-blue-700 leading-relaxed">
                                        <p>✅ 専用のスプレッドシートが自動作成されます</p>
                                        <p>✅ セキュリティ保護されたランダムなURLを発行します</p>
                                        <p>✅ クライアントは指定した商材の数値のみ閲覧可能です</p>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-2">
                                    <button
                                        disabled={isGeneratingReport}
                                        onClick={() => setReportStep(0)}
                                        className="flex-1 py-3 text-sm font-bold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                    >
                                        戻る
                                    </button>
                                    <button
                                        disabled={isGeneratingReport}
                                        onClick={async () => {
                                            setIsGeneratingReport(true);
                                            try {
                                                const res = await fetch('/api/report/generate', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        campaigns: reportCampaigns,
                                                        startDate: reportStartDate,
                                                        endDate: reportEndDate
                                                    })
                                                });
                                                const data = await res.json();
                                                if (data.error) throw new Error(data.error);

                                                setGeneratedReportInfo(data);
                                                setReportStep(2);
                                            } catch (e: any) {
                                                alert(`エラーが発生しました: ${e.message}`);
                                            } finally {
                                                setIsGeneratingReport(false);
                                            }
                                        }}
                                        className="flex-3 py-3 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-lg relative overflow-hidden"
                                    >
                                        {isGeneratingReport ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>スプレッドシート作成中...</span>
                                            </div>
                                        ) : (
                                            <span>レポートを発行する</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {reportStep === 2 && generatedReportInfo && (
                            <div className="flex flex-col gap-4 py-2">
                                <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-center">
                                    <div className="text-3xl mb-2">🎉</div>
                                    <p className="text-sm font-bold text-green-800">レポートが正常に発行されました</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-gray-500">🔗 管理者用URL（元データ確認可能）</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                readOnly
                                                value={`${window.location.origin}${generatedReportInfo.adminUrl}`}
                                                className="flex-1 p-2 border rounded-lg text-xs bg-gray-50 font-mono"
                                            />
                                            <a
                                                href={generatedReportInfo.adminUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm"
                                            >
                                                開く
                                            </a>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}${generatedReportInfo.adminUrl}`);
                                                    setReportCopied(true);
                                                    setTimeout(() => setReportCopied(false), 2000);
                                                }}
                                                className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${reportCopied ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                            >
                                                {reportCopied ? 'コピー済' : 'コピー'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5 pt-2">
                                        <label className="text-xs font-bold text-gray-500">📊 データ元スプレッドシート</label>
                                        <a
                                            href={generatedReportInfo.spreadsheetUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-white hover:border-blue-300 transition-all flex items-center justify-between group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center text-lg">📄</div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-700">スプレッドシートを開く</span>
                                                    <span className="text-[10px] text-gray-500">このシートを編集するとレポートに反映されます</span>
                                                </div>
                                            </div>
                                            <span className="text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all">→</span>
                                        </a>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setIsReportModalOpen(false);
                                        setReportStep(0);
                                        setGeneratedReportInfo(null);
                                        setReportCampaigns([]);
                                    }}
                                    className="w-full py-3 mt-2 text-sm font-bold bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                                >
                                    完了
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <ChatBot
                data={initialData}
                masterProjects={masterProjects}
                articleMasterData={articleMasterData}
                creativeMasterData={creativeMasterData}
                reportListData={reportListData}
            />
        </>
    );
}

