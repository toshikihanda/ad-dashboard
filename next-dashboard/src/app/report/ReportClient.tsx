'use client';

// クライアント共有用レポートページ
// 内部数値（売上・粗利・回収率・ROAS）は表示しない
// 更新・AI分析・比較ボタンは非表示

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ProcessedRow, safeDivide, filterByDateRange, filterByCampaign } from '@/lib/dataProcessor';
import { KPICard, KPIGrid } from '@/components/KPICard';
import { CostChart, CVChart, CostMetricChart, GenericBarChart, GenericRateChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import { ReportDailyDataTable } from '@/components/ReportDailyDataTable';
import { CreativeMetricsTable } from '@/components/CreativeMetricsTable';
import { VersionMetricsTable } from '@/components/VersionMetricsTable';
import { ReportRankingPanel } from '@/components/ReportRankingPanel';
import { MultiSelect } from '@/components/MultiSelect';

interface ReportClientProps {
    initialData: ProcessedRow[];
    masterProjects: string[];
    spreadsheetUrl?: string;
    createdAt?: string;
    isAdmin?: boolean;
    adminToken?: string;
    existingClientToken?: string;
    defaultStartDate?: string;
    defaultEndDate?: string;
    isShareMode?: boolean;
}

function ClientUrlButton({ adminToken }: { adminToken?: string }) {
    const [copied, setCopied] = useState(false);

    if (!adminToken) return null;

    // 現在のホスト名を取得してURLを生成
    const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/report/${adminToken}/share`
        : '';

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-2">
            <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
                <span>🔗</span>
                <span>{copied ? 'コピーしました！' : 'シェア用（閲覧専用）URLを取得'}</span>
            </button>
        </div>
    );
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

/** 案件別数値タイトル用: 日付を MM/DD で表示（レポートはデータ範囲基準で表示） */
function formatDateForTitle(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

export default function ReportClient({
    initialData,
    masterProjects,
    spreadsheetUrl,
    createdAt,
    isAdmin = false,
    adminToken,
    existingClientToken,
    defaultStartDate,
    defaultEndDate,
    isShareMode = false
}: ReportClientProps) {
    const searchParams = useSearchParams();

    const [selectedTab, setSelectedTab] = useState<TabType>('total');
    // allowedCampaigns: URLパラメータで指定された商材（空なら全商材）
    const [allowedCampaigns, setAllowedCampaigns] = useState<string[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState('All');
    // 複数選択対応（配列で管理）
    const [selectedBeyondPageNames, setSelectedBeyondPageNames] = useState<string[]>([]);
    const [selectedVersionNames, setSelectedVersionNames] = useState<string[]>([]);
    const [selectedCreatives, setSelectedCreatives] = useState<string[]>([]);

    // 日付状態
    const [datePreset, setDatePreset] = useState<'thisMonth' | 'today' | 'yesterday' | '7days' | 'custom'>('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isClient, setIsClient] = useState(false);
    const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);

    // クライアントサイドで日付を初期化（SSR/ハイドレーション不一致を回避）
    // URLパラメータから商材・期間をプリセット
    useEffect(() => {
        if (!isClient) {
            // URLパラメータから期間を取得
            const startParam = searchParams.get('start');
            const endParam = searchParams.get('end');

            if (startParam && endParam) {
                // URLで期間が指定されている場合
                setStartDate(startParam);
                setEndDate(endParam);
                setDatePreset('custom');
            } else if (defaultStartDate && defaultEndDate) {
                // レポート保存時の設定がある場合（優先）
                setStartDate(defaultStartDate);
                setEndDate(defaultEndDate);
                setDatePreset('custom');
            } else {
                // デフォルトは今月
                const now = new Date();
                const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                setStartDate(formatDateForInput(firstOfMonth));
                setEndDate(formatDateForInput(now));
            }

            // URLパラメータから商材を取得（複数対応: campaigns=A,B,C）
            const campaignsParam = searchParams.get('campaigns');
            // 単一商材の旧パラメータもサポート
            const singleCampaignParam = searchParams.get('campaign');

            let allowedList: string[] = [];

            if (campaignsParam) {
                // カンマ区切りで分割し、有効な商材のみフィルタリング
                allowedList = campaignsParam.split(',')
                    .map(c => c.trim())
                    .filter(c => masterProjects.includes(c));
            } else if (singleCampaignParam && masterProjects.includes(singleCampaignParam)) {
                allowedList = [singleCampaignParam];
            }

            if (allowedList.length > 0) {
                setAllowedCampaigns(allowedList);
                // 商材が1つだけなら自動選択
                if (allowedList.length === 1) {
                    setSelectedCampaign(allowedList[0]);
                }
            }

            setIsClient(true);
        }
    }, [isClient, searchParams, masterProjects]);



    const handlePresetChange = (preset: 'thisMonth' | 'today' | 'yesterday' | '7days' | 'custom') => {
        const end = new Date();
        let start = new Date();

        if (preset === 'thisMonth') {
            start = new Date(end.getFullYear(), end.getMonth(), 1);
        } else if (preset === 'today') {
            start = new Date(end);
        } else if (preset === 'yesterday') {
            start.setDate(end.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (preset === '7days') {
            start.setDate(end.getDate() - 6);
        } else {
            setIsCustomDatePickerOpen(true);
            return;
        }

        const sStr = formatDateForInput(start);
        const eStr = formatDateForInput(end);

        // 制限チェック (initialDataの範囲内か)
        if (initialData.length > 0) {
            const dataDates = initialData.map(r => {
                const d = r.Date instanceof Date ? r.Date : new Date(r.Date);
                return isNaN(d.getTime()) ? 0 : d.getTime();
            }).filter(t => t > 0);

            if (dataDates.length === 0) return;

            const minDate = Math.min(...dataDates);
            const maxDate = Math.max(...dataDates);

            // プリセットの期間がデータの範囲と全く重ならない場合は無視、あるいは範囲内に補正
            // 今回はボタン自体の非表示でガードするが、念のため
            if (start.getTime() > maxDate || end.getTime() < minDate) {
                return;
            }
        }

        setDatePreset(preset);
        setStartDate(sStr);
        setEndDate(eStr);
        setIsCustomDatePickerOpen(false);
    };

    // 期間ボタンの有効性判定
    const availablePresets = useMemo(() => {
        if (initialData.length === 0) return ['custom'];

        const dataDates = initialData.map(r => {
            const d = r.Date instanceof Date ? r.Date : new Date(r.Date);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        }).filter(t => t > 0);

        if (dataDates.length === 0) return ['custom'];

        const minDate = Math.min(...dataDates);
        const maxDate = Math.max(...dataDates);

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - 86400000;
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startOf7DaysAgo = startOfToday - 6 * 86400000;

        const presets: string[] = ['custom'];

        // 今日が範囲内か
        if (startOfToday >= minDate && startOfToday <= maxDate) presets.push('today');
        // 昨日が範囲内か
        if (startOfYesterday >= minDate && startOfYesterday <= maxDate) presets.push('yesterday');
        // 今月（の開始日）が範囲内か
        if (startOfThisMonth >= minDate && startOfThisMonth <= maxDate) presets.push('thisMonth');
        // 7日間（の開始日）が範囲内か
        if (startOf7DaysAgo >= minDate && startOf7DaysAgo <= maxDate) presets.push('7days');

        return presets;
    }, [initialData]);

    const dataRange = useMemo(() => {
        if (initialData.length === 0) return { min: '', max: '' };
        const dataDates = initialData.map(r => {
            const d = r.Date instanceof Date ? r.Date : new Date(r.Date);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        }).filter(t => t > 0);

        if (dataDates.length === 0) return { min: '', max: '' };

        const minDate = new Date(Math.min(...dataDates));
        const maxDate = new Date(Math.max(...dataDates));
        return {
            min: formatDateForInput(minDate),
            max: formatDateForInput(maxDate)
        };
    }, [initialData]);

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

    // 属性フィルター（商材・タブ等）のみを適用したデータ（日付フィルターなし）
    const attributeFilteredData = useMemo(() => {
        let data = initialData;

        // ★ allowedCampaignsによる強制フィルター（URLで指定された商材のみ表示）
        if (allowedCampaigns.length > 0) {
            data = data.filter(row => allowedCampaigns.includes(row.Campaign_Name));
        }

        // タブフィルター
        if (selectedTab === 'meta') {
            data = data.filter(row => row.Media === 'Meta');
        } else if (selectedTab === 'beyond') {
            data = data.filter(row => row.Media === 'Beyond');
        }

        // キャンペーンフィルター（商材）- allowedCampaigns内で更に絞り込み
        if (selectedCampaign !== 'All') {
            data = filterByCampaign(data, selectedCampaign);
        }

        // beyond_page_nameフィルター
        if (selectedBeyondPageNames.length > 0) {
            data = data.filter(row => {
                if (row.Media === 'Beyond') {
                    return selectedBeyondPageNames.includes(row.beyond_page_name);
                } else {
                    return selectedBeyondPageNames.some(name => row.Creative && row.Creative.includes(name));
                }
            });
        }

        // version_nameフィルター
        if (selectedVersionNames.length > 0) {
            data = data.filter(row => selectedVersionNames.includes(row.version_name));
        }

        // クリエイティブフィルター
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
    }, [initialData, selectedTab, selectedCampaign, selectedBeyondPageNames, selectedVersionNames, selectedCreatives, allowedCampaigns]);

    // 選択に基づいてデータをフィルタリング
    const filteredData = useMemo(() => {
        if (!startDate || !endDate) return attributeFilteredData;
        return filterByDateRange(attributeFilteredData, new Date(startDate), new Date(endDate));
    }, [attributeFilteredData, startDate, endDate]);

    // --- カスケードフィルターロジック ---
    // Step 0: 日付範囲でフィルター
    const dateFilteredData = useMemo(() => {
        if (!startDate || !endDate) {
            return initialData;
        }
        return filterByDateRange(initialData, new Date(startDate), new Date(endDate));
    }, [initialData, startDate, endDate]);

    // Step 1: キャンペーン（商材）でフィルター
    const campaignFilteredData = useMemo(() => {
        const beyondData = dateFilteredData.filter(row => row.Media === 'Beyond');
        if (selectedCampaign === 'All') {
            return beyondData;
        }
        return beyondData.filter(row => row.Campaign_Name === selectedCampaign);
    }, [dateFilteredData, selectedCampaign]);

    // Step 2: beyond_page_nameでフィルター
    const pageNameFilteredData = useMemo(() => {
        if (selectedBeyondPageNames.length === 0) {
            return campaignFilteredData;
        }
        return campaignFilteredData.filter(row => selectedBeyondPageNames.includes(row.beyond_page_name));
    }, [campaignFilteredData, selectedBeyondPageNames]);

    // Step 3: version_nameでフィルター
    const versionFilteredData = useMemo(() => {
        if (selectedVersionNames.length === 0) {
            return pageNameFilteredData;
        }
        return pageNameFilteredData.filter(row => selectedVersionNames.includes(row.version_name));
    }, [pageNameFilteredData, selectedVersionNames]);

    // フィルターオプションを生成（allowedCampaignsで制限）
    const campaigns = useMemo(() => {
        // allowedCampaignsが設定されている場合はその商材のみ
        if (allowedCampaigns.length > 0) {
            return allowedCampaigns;
        }
        return masterProjects;
    }, [masterProjects, allowedCampaigns]);

    // beyond_page_nameオプション
    const beyondPageNames = useMemo(() => {
        const uniqueNames = [...new Set(campaignFilteredData.map(row => row.beyond_page_name).filter(n => n))];
        return uniqueNames.sort();
    }, [campaignFilteredData]);

    // version_nameオプション
    const versionNames = useMemo(() => {
        const uniqueVersions = [...new Set(pageNameFilteredData.map(row => row.version_name).filter(n => n))];
        return uniqueVersions.sort();
    }, [pageNameFilteredData]);

    // クリエイティブオプション
    const creativeValues = useMemo(() => {
        const uniqueCreatives = [...new Set(versionFilteredData.map(row => row.creative_value).filter(v => v))];
        return uniqueCreatives.sort();
    }, [versionFilteredData]);

    // 上位フィルターが変更されたら下位フィルターをリセット
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

    const isVersionFilterActive = selectedVersionNames.length > 0;

    // --- レポート用: データ範囲（startDate〜endDate）基準で「昨日」「直近3日間」「直近7日間」を算出（閲覧日ではなくシートの日付で表示） ---
    const reportPeriodDates = useMemo(() => {
        if (!startDate || !endDate) return null;
        const reportStart = new Date(startDate);
        reportStart.setHours(0, 0, 0, 0);
        const reportEnd = new Date(endDate);
        reportEnd.setHours(0, 0, 0, 0);
        const yesterdayInReport = new Date(reportEnd);
        yesterdayInReport.setDate(yesterdayInReport.getDate() - 1);
        const threeDayStart = new Date(reportEnd);
        threeDayStart.setDate(threeDayStart.getDate() - 2);
        if (threeDayStart.getTime() < reportStart.getTime()) threeDayStart.setTime(reportStart.getTime());
        const sevenDayStart = new Date(reportEnd);
        sevenDayStart.setDate(sevenDayStart.getDate() - 6);
        if (sevenDayStart.getTime() < reportStart.getTime()) sevenDayStart.setTime(reportStart.getTime());
        return { reportStart, reportEnd, yesterdayInReport, threeDayStart, sevenDayStart };
    }, [startDate, endDate]);

    const yesterdayData = useMemo(() => {
        if (!reportPeriodDates) return [];
        return filterByDateRange(attributeFilteredData, reportPeriodDates.yesterdayInReport, reportPeriodDates.yesterdayInReport);
    }, [attributeFilteredData, reportPeriodDates]);
    const threeDayData = useMemo(() => {
        if (!reportPeriodDates) return [];
        return filterByDateRange(attributeFilteredData, reportPeriodDates.threeDayStart, reportPeriodDates.reportEnd);
    }, [attributeFilteredData, reportPeriodDates]);
    const sevenDayData = useMemo(() => {
        if (!reportPeriodDates) return [];
        return filterByDateRange(attributeFilteredData, reportPeriodDates.sevenDayStart, reportPeriodDates.reportEnd);
    }, [attributeFilteredData, reportPeriodDates]);

    // KPIを計算
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

        // CPC は常に Beyond出稿金額 / PV (or Clicks) で計算
        const displayCPC = isVersionFilterActive
            ? safeDivide(beyondCost, beyondPV)
            : (selectedTab === 'beyond' ? safeDivide(beyondCost, beyondPV) : safeDivide(metaCost, displayMetaClicks));

        return {
            cost: selectedTab === 'meta' ? metaCost : beyondCost,
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
        };
    }, [filteredData, selectedTab, isVersionFilterActive]);

    // データが準備できるまでローディング表示（一瞬他の商材データが見えないようにする）
    if (!isClient) {
        return (
            <div className="max-w-[1920px] mx-auto pb-10 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">📊</div>
                    <p className="text-gray-600 font-medium">レポートを読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="max-w-[1920px] mx-auto pb-10">
                {/* スティッキーヘッダー + フィルター */}
                <div className="sticky top-0 z-50 bg-[#e2e8f0] pt-2 md:pt-4 pb-2 md:pb-4 -mx-4 md:-mx-6 px-4 md:px-6 shadow-sm">
                    {/* ヘッダー行: タイトル、タブ */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-2 md:mb-4">
                        {/* タイトル + 商材タグ */}
                        <div className="flex items-center gap-2 md:mr-auto w-full md:w-auto flex-wrap">
                            <h1 className="text-base md:text-xl font-bold text-gray-800 whitespace-nowrap">📊 広告レポート</h1>
                            {allowedCampaigns.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {allowedCampaigns.map(c => (
                                        <span key={c} className="text-sm md:text-base bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-1 rounded-lg font-semibold shadow-sm">{c}</span>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-col ml-2">
                                {createdAt && (
                                    <span className="text-[10px] text-gray-500 font-medium">最終更新: {createdAt}</span>
                                )}
                                {startDate && endDate && (
                                    <span className="text-[10px] text-blue-600 font-bold">{startDate.replace(/-/g, '/')} 〜 {endDate.replace(/-/g, '/')} のデータ</span>
                                )}
                            </div>
                        </div>

                        {/* 編集中ラベル（編集可能なレポートのみ・シェア用URLを送るべきでないことを明示） */}
                        {!isShareMode && (
                            <>
                                <div className="flex-1 hidden md:flex items-center justify-center min-w-0 px-2">
                                    <span className="text-red-600 font-bold text-xl md:text-2xl lg:text-3xl whitespace-nowrap" aria-hidden>編集中</span>
                                </div>
                                <div className="md:hidden w-full text-center py-1">
                                    <span className="text-red-600 font-bold text-lg" aria-hidden>編集中</span>
                                </div>
                            </>
                        )}

                        {/* 管理者用ボタンエリア */}
                        {isAdmin && (
                            <div className="order-first md:order-last w-full md:w-auto flex flex-col md:flex-row gap-4 items-start md:items-center">
                                {/* データ元確認ボタン */}
                                {spreadsheetUrl && !isShareMode && (
                                    <a
                                        href={spreadsheetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                                    >
                                        <span>📄</span>
                                        <span>スプレッドシートを開く</span>
                                    </a>
                                )}
                                {/* クライアント用URL発行ボタン */}
                                {!isShareMode && adminToken && (
                                    <ClientUrlButton adminToken={adminToken} />
                                )}
                            </div>
                        )}

                        {/* タブ: モバイルではセグメントコントロール、デスクトップではボタン */}
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
                    </div>

                    {/* フィルターエリア */}
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
                            {/* 商材 Column - allowedCampaignsが1つなら固定表示、複数なら選択可能 */}
                            <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
                                <span className="text-[10px] font-bold text-gray-500 tracking-wide md:block hidden">商材</span>
                                <div className="md:hidden text-[10px] font-bold text-gray-500 mb-1">商材</div>
                                {allowedCampaigns.length === 1 ? (
                                    // 1商材のみ - 固定表示（他のフィルターと高さを合わせる）
                                    <div className="filter-select text-xs px-3 w-full bg-blue-50/50 border-blue-200 flex items-center shadow-sm">
                                        <span className="text-blue-700 font-semibold truncate">{allowedCampaigns[0]}</span>
                                    </div>
                                ) : allowedCampaigns.length > 1 ? (
                                    // 複数商材 - 制限付き選択
                                    <select
                                        value={selectedCampaign}
                                        onChange={(e) => handleCampaignChange(e.target.value)}
                                        className="filter-select text-xs w-full truncate bg-white border md:border-gray-200 rounded-lg"
                                        title={selectedCampaign}
                                    >
                                        <option value="All">全て ({allowedCampaigns.length}商材)</option>
                                        {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                ) : (
                                    // 制限なし - 全商材から選択
                                    <select
                                        value={selectedCampaign}
                                        onChange={(e) => handleCampaignChange(e.target.value)}
                                        className="filter-select text-xs w-full truncate bg-white border md:border-gray-200 rounded-lg"
                                        title={selectedCampaign}
                                    >
                                        <option value="All">All</option>
                                        {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
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
                                    <span className="text-[10px] font-bold text-gray-500 tracking-wide md:hidden mb-1 block">期間</span>
                                    <div className="flex items-center gap-1 text-[9px] truncate md:float-right mt-1">
                                        <span className="text-blue-500">●</span>
                                        <span className="font-bold text-gray-700">{startDate.replace(/-/g, '/').slice(5)}〜{endDate.replace(/-/g, '/').slice(5)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </details>

                    {/* カスタム日付ピッカーポップアップ */}
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
                                            min={dataRange.min}
                                            max={dataRange.max}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="date-input text-base p-2 border rounded-lg"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500">終了日</label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            min={dataRange.min}
                                            max={dataRange.max}
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
                            <KPICard label="出稿金額" value={fmtAmt(kpis.cost)} unit="円" colorClass="text-red" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="IMP" value={kpis.impressions} source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CLICK" value={kpis.metaClicks} source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CTR" value={fmtRate(kpis.ctr)} unit="%" colorClass="text-green" source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CV" value={kpis.cv} unit="件" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CVR" value={fmtRate(kpis.cvr)} unit="%" colorClass="text-green" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                        </div>

                        {/* Secondary Metrics - Also always visible in compact grid */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <KPICard label="CPA" value={fmtAmt(kpis.cpa)} unit="円" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="CPM" value={fmtAmt(kpis.cpm)} unit="円" source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="CPC" value={fmtAmt(kpis.cpc)} unit="円" source={selectedTab === 'total' ? 'Meta' : undefined} />
                            <KPICard label="商品LP CLICK" value={kpis.beyondClicks} unit="件" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="MCVR" value={fmtRate(kpis.mcvr)} unit="%" colorClass="text-green" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                            <KPICard label="MCPA" value={fmtAmt(kpis.mcpa)} unit="円" source={selectedTab === 'total' ? 'Beyond' : undefined} />
                        </div>

                        {/* 離脱率KPI - 左寄せで2カラムのみ使用 */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
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
                    {(() => {
                        let reportDays = 365;
                        if (startDate && endDate) {
                            const start = new Date(startDate);
                            const end = new Date(endDate);
                            reportDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                        }
                        return <ReportRankingPanel data={filteredData} selectedCampaign={selectedCampaign} reportDays={reportDays} isVersionFilterActive={isVersionFilterActive} />;
                    })()}

                    <CreativeMetricsTable
                        data={filteredData}
                        title={`■クリエイティブ別数値（${startDate.replace(/-/g, '/')}〜${endDate.replace(/-/g, '/')}）`}
                        isReport={true}
                    />

                    <VersionMetricsTable
                        data={filteredData}
                        title={`■記事別数値（${startDate.replace(/-/g, '/')}〜${endDate.replace(/-/g, '/')}）`}
                        isReport={true}
                    />

                    {reportPeriodDates && (
                        <>
                            <DataTable data={yesterdayData} title={`■案件別数値（${formatDateForTitle(reportPeriodDates.yesterdayInReport)}）`} viewMode={selectedTab} isReport={true} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                            <DataTable data={threeDayData} title={`■案件別数値（${formatDateForTitle(reportPeriodDates.threeDayStart)}〜${formatDateForTitle(reportPeriodDates.reportEnd)}）`} viewMode={selectedTab} isReport={true} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                            <DataTable data={sevenDayData} title={`■案件別数値（${formatDateForTitle(reportPeriodDates.sevenDayStart)}〜${formatDateForTitle(reportPeriodDates.reportEnd)}）`} viewMode={selectedTab} isReport={true} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                        </>
                    )}
                    <DataTable data={filteredData} title={startDate && endDate ? `■案件別数値（${formatDateForTitle(new Date(startDate))}〜${formatDateForTitle(new Date(endDate))}）` : '■案件別数値（選択期間）'} viewMode={selectedTab} isReport={true} filters={{ beyondPageNames: selectedBeyondPageNames, versionNames: selectedVersionNames, creatives: selectedCreatives }} />
                </div>

                {/* Daily Data Table - placed above Charts */}
                <div className="mt-8">
                    <ReportDailyDataTable data={filteredData} title="■選択期間（日別）" viewMode={selectedTab} isVersionFilterActive={isVersionFilterActive} />
                </div>

                {/* Charts */}
                <div className="mt-8">
                    {selectedTab === 'total' && (
                        <>
                            {/* Row 1: 出稿金額、CV、CPA */}
                            <div className="grid grid-cols-3 gap-4">
                                <CostChart data={filteredData.filter(r => r.Media === 'Beyond')} title="出稿金額" />
                                <CVChart data={filteredData.filter(r => r.Media === 'Beyond')} title="CV" />
                                <CostMetricChart data={filteredData.filter(r => r.Media === 'Beyond')} title="CPA" costDivisorKey="CV" />
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
                            {/* Row 3: CPM、CPC、MCPA、FV離脱率、SV離脱率 */}
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
                            {/* Row 1: 出稿金額、CV、CPA */}
                            <div className="grid grid-cols-3 gap-4">
                                <CostChart data={filteredData} title="出稿金額" />
                                <CVChart data={filteredData} title="CV" />
                                <CostMetricChart data={filteredData} title="CPA" costDivisorKey="CV" />
                            </div>
                            <div className="h-4" />
                            {/* Row 2: PV、商品LP CLICK、MCVR、CVR、CPC、MCPA */}
                            <div className="grid grid-cols-3 gap-4">
                                <GenericBarChart data={filteredData} title="PV" dataKey="PV" />
                                <GenericBarChart data={filteredData} title="商品LP CLICK" dataKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <GenericRateChart data={filteredData} title="MCVR" numeratorKey="Clicks" denominatorKey="PV" />
                                <GenericRateChart data={filteredData} title="CVR" numeratorKey="CV" denominatorKey="Clicks" />
                                <CostMetricChart data={filteredData} title="CPC" costDivisorKey={isVersionFilterActive ? "PV" : "Clicks"} />
                                <CostMetricChart data={filteredData} title="MCPA" costDivisorKey={isVersionFilterActive ? "PV" : "Clicks"} />
                            </div>
                            <div className="h-4" />
                            {/* Row 3: FV離脱率、SV離脱率 */}
                            <div className="grid grid-cols-2 gap-4">
                                <GenericRateChart data={filteredData} title="FV離脱率" numeratorKey="FV_Exit" denominatorKey="PV" />
                                <GenericRateChart data={filteredData} title="SV離脱率" numeratorKey="SV_Exit" denominatorKey="PV" />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
