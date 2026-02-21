'use client';

import { useMemo, useState } from 'react';
import { ProcessedRow, safeDivide, CreativeMasterItem } from '@/lib/dataProcessor';

interface CreativeMetricsTableProps {
    data: ProcessedRow[];
    title?: string;
    creativeMasterData?: CreativeMasterItem[];
    isReport?: boolean;
}

interface CreativeRow {
    id: string;
    creative: string;
    campaign: string;
    cost: number;
    revenue: number;
    profit: number;
    roas: number;
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
    video3SecViews: number;
    video3SecCost: number;
    video3SecRate: number;
}

type SortType = keyof CreativeRow;

function formatNumber(value: number, decimals = 0): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

function aggregateByCreative(data: ProcessedRow[]): CreativeRow[] {
    const grouped = new Map<string, ProcessedRow[]>();

    for (const row of data) {
        const key = row.creative_value || row.Creative;
        if (!key) continue;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(row);
    }

    const rows: CreativeRow[] = [];

    for (const [key, rowData] of grouped) {
        const metaData = rowData.filter(row => row.Media === 'Meta');
        const beyondData = rowData.filter(row => row.Media === 'Beyond');

        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);
        const video3SecViews = metaData.reduce((sum, row) => sum + row.Video_3Sec_Views, 0);

        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const revenue = beyondData.reduce((sum, row) => sum + row.Revenue, 0);
        const profit = beyondData.reduce((sum, row) => sum + row.Gross_Profit, 0);
        const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

        // User request: Cost for Creative Metrics should come from Meta only.
        const totalCost = metaCost;
        if (totalCost === 0 && beyondCost === 0 && revenue === 0 && impressions === 0) continue;

        const campaign = rowData[0].Campaign_Name;
        const video3SecCost = safeDivide(metaCost, video3SecViews);
        const video3SecRate = safeDivide(video3SecViews, impressions) * 100;

        // Recalculate profit if it's based on Revenue - Cost logic
        // If profit matches revenue (IH type), keep it as is.
        // Otherwise (Standard/Performance), recalculate as Revenue - MetaCost
        let adjustedProfit = profit;
        // Check if profit is roughly (Revenue - BeyondCost) (allow small float diff)
        // Profit usually equals Revenue (IH) or Revenue - Cost (Others)
        // For IH: Profit == Revenue. Revenue - BeyondCost != Profit (unless Cost is 0)
        // For Others: Profit == Revenue - BeyondCost.
        if (Math.abs(profit - (revenue - beyondCost)) < 10) {
            adjustedProfit = revenue - totalCost;
        }

        rows.push({
            id: key,
            creative: key,
            campaign,
            cost: totalCost,
            revenue,
            profit: adjustedProfit,
            roas: Math.floor(safeDivide(revenue, totalCost) * 100),
            impressions,
            clicks: metaClicks,
            mcv: beyondClicks,
            cv,
            ctr: safeDivide(metaClicks, impressions) * 100,
            mcvr: safeDivide(beyondClicks, pv) * 100,
            cvr: safeDivide(cv, beyondClicks) * 100,
            cpm: safeDivide(metaCost, impressions) * 1000,
            cpc: safeDivide(totalCost, metaClicks),
            mcpa: safeDivide(totalCost, beyondClicks),
            cpa: safeDivide(totalCost, cv),
            fvExitRate: safeDivide(fvExit, pv) * 100,
            svExitRate: safeDivide(svExit, pv - fvExit) * 100,
            video3SecViews,
            video3SecCost,
            video3SecRate
        });
    }
    return rows;
}

export function CreativeMetricsTable({ data, title = 'クリエイティブ別数値', creativeMasterData, isReport = false }: CreativeMetricsTableProps) {
    const [sortKey, setSortKey] = useState<SortType>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Preview Modal State
    const [previewItem, setPreviewItem] = useState<{ url: string; title: string; isVertical?: boolean } | null>(null);
    // Hover Thumbnail State
    const [hoveredItem, setHoveredItem] = useState<{ url: string; x: number; y: number } | null>(null);

    const handleSort = (key: SortType) => {
        if (sortKey === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            const ascMetrics = ['cpa', 'cpc', 'cpm', 'mcpa', 'fvExitRate', 'svExitRate', 'video3SecCost'];
            setSortOrder(ascMetrics.includes(key) ? 'asc' : 'desc');
        }
    };

    const getSortIcon = (key: SortType) => {
        if (sortKey !== key) return '';
        return sortOrder === 'asc' ? ' ▲' : ' ▼';
    };

    const sortedRows = useMemo(() => {
        const rows = aggregateByCreative(data);
        return rows.sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            const aNum = (typeof aVal === 'number') ? aVal : 0;
            const bNum = (typeof bVal === 'number') ? bVal : 0;
            return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
        });
    }, [data, sortKey, sortOrder]);

    // Preview Logic
    const getPreviewUrl = (campaign: string, creativeId: string) => {
        if (!creativeMasterData) return null;
        // マッチング: 商材名の _以降（運用タイプ）を除去して比較
        const baseCampaign = campaign.split('_')[0];

        // 候補を全て取得してから、最適なものを選択する
        // 1. 商材名が一致するものをフィルタ
        const candidates = creativeMasterData.filter(item => {
            const itemBaseCamp = item.campaign.split('_')[0];
            if (itemBaseCamp !== baseCampaign) return false;

            // 2. マッチング判定
            // A. 完全一致 (最優先)
            if (item.creativeId === creativeId) return true;

            // B. 包含一致 (条件付き)
            if (creativeId.includes(item.creativeId)) {
                // ガード: 誤マッチ防止のため、IDが短い場合(2文字以下)は包含一致を許可しない
                // 例: "1" が "140" にマッチするのを防ぐ
                return item.creativeId.length >= 3;
            }

            return false;
        });

        if (candidates.length === 0) return null;

        // 3. 最長一致優先でソート (例: "140" と "140_1" があれば "140_1" を優先)
        // 完全一致があればそれが最長になるはずだが、包含のみの場合も文字数が長い方を優先する
        candidates.sort((a, b) => b.creativeId.length - a.creativeId.length);

        return candidates[0];
    };

    const handleCreativeClick = (fileName: string, url: string, thumbnailUrl?: string) => {
        // Convert view/open URLs to preview for iframe embedding
        let embedUrl = url;
        if (embedUrl.includes('/view')) {
            embedUrl = embedUrl.replace('/view', '/preview');
        } else if (embedUrl.includes('drive.google.com/file/d/')) {
            // ensure it ends with /preview
            if (!embedUrl.endsWith('/preview')) {
                const parts = embedUrl.split('/');
                // if last part is 'view' or params
                if (parts[parts.length - 1].startsWith('view')) {
                    parts[parts.length - 1] = 'preview';
                    embedUrl = parts.join('/');
                } else {
                    embedUrl = `${embedUrl}/preview`;
                }
            }
        }

        let isVertical = false;
        if (thumbnailUrl) {
            // Try to detect aspect ratio from thumbnail
            const img = new Image();
            img.onload = () => {
                isVertical = img.naturalHeight > img.naturalWidth;
                setPreviewItem({ url: embedUrl, title: fileName, isVertical });
            };
            img.src = thumbnailUrl;
            // Fallback if load is slow/fails, set immediately with default
            // but the onload will update it. 
            // We set default first to show modal immediately.
        }

        setPreviewItem({ url: embedUrl, title: fileName, isVertical });
    };

    if (sortedRows.length === 0) {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <p className="text-gray-400 text-sm">データなし</p>
            </div>
        );
    }

    const colW = {
        rank: 'w-[24px]',
        creative: 'w-[180px]',
        cost: 'w-[75px]',
        revenue: 'w-[70px]',
        profit: 'w-[70px]',
        roas: 'w-[60px]',
        imp: 'w-[50px]',
        clicks: 'w-[50px]',
        lpClick: 'w-[70px]',
        cv: 'w-[35px]',
        ctr: 'w-[45px]',
        mcvr: 'w-[45px]',
        cvr: 'w-[45px]',
        cpm: 'w-[60px]',
        cpc: 'w-[60px]',
        mcpa: 'w-[65px]',
        cpa: 'w-[70px]',
        fvExit: 'w-[50px]',
        svExit: 'w-[50px]',
        vid3: 'w-[60px]',
        vid3Cost: 'w-[60px]',
        vid3Rate: 'w-[60px]'
    };

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6 relative">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>

            <div className="overflow-x-auto -mx-4 px-4">
                <div className="max-h-[330px] overflow-y-auto">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: isReport ? '1200px' : '1400px' }}>
                        <thead className="bg-gray-50 sticky top-0 z-30">
                            <tr>
                                <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th onClick={() => handleSort('creative')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.creative}`}>クリエイティブ{getSortIcon('creative')}</th>
                                <th onClick={() => handleSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                                {!isReport && <th onClick={() => handleSort('revenue')} className={`${thClass} ${colW.revenue}`}>売上{getSortIcon('revenue')}</th>}
                                {!isReport && <th onClick={() => handleSort('profit')} className={`${thClass} ${colW.profit}`}>粗利{getSortIcon('profit')}</th>}
                                {!isReport && <th onClick={() => handleSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>}
                                <th onClick={() => handleSort('impressions')} className={`${thClass} ${colW.imp}`}>IMP{getSortIcon('impressions')}</th>
                                <th onClick={() => handleSort('clicks')} className={`${thClass} ${colW.clicks}`}>Clicks{getSortIcon('clicks')}</th>
                                <th onClick={() => handleSort('mcv')} className={`${thClass} ${colW.lpClick}`}>商品LP Click{getSortIcon('mcv')}</th>
                                <th onClick={() => handleSort('cv')} className={`${thClass} ${colW.cv}`}>CV{getSortIcon('cv')}</th>
                                <th onClick={() => handleSort('ctr')} className={`${thClass} ${colW.ctr}`}>CTR{getSortIcon('ctr')}</th>
                                <th onClick={() => handleSort('mcvr')} className={`${thClass} ${colW.mcvr}`}>MCVR{getSortIcon('mcvr')}</th>
                                <th onClick={() => handleSort('cvr')} className={`${thClass} ${colW.cvr}`}>CVR{getSortIcon('cvr')}</th>
                                <th onClick={() => handleSort('cpm')} className={`${thClass} ${colW.cpm}`}>CPM{getSortIcon('cpm')}</th>
                                <th onClick={() => handleSort('cpc')} className={`${thClass} ${colW.cpc}`}>CPC{getSortIcon('cpc')}</th>
                                <th onClick={() => handleSort('mcpa')} className={`${thClass} ${colW.mcpa}`}>MCPA{getSortIcon('mcpa')}</th>
                                <th onClick={() => handleSort('cpa')} className={`${thClass} ${colW.cpa}`}>CPA{getSortIcon('cpa')}</th>
                                <th onClick={() => handleSort('fvExitRate')} className={`${thClass} ${colW.fvExit}`}>FV離脱{getSortIcon('fvExitRate')}</th>
                                <th onClick={() => handleSort('svExitRate')} className={`${thClass} ${colW.svExit}`}>SV離脱{getSortIcon('svExitRate')}</th>
                                <th onClick={() => handleSort('video3SecViews')} className={`${thClass} ${colW.vid3} bg-blue-50 text-blue-700`}>3秒再生数{getSortIcon('video3SecViews')}</th>
                                <th onClick={() => handleSort('video3SecCost')} className={`${thClass} ${colW.vid3Cost} bg-blue-50 text-blue-700`}>3秒再生単価{getSortIcon('video3SecCost')}</th>
                                <th onClick={() => handleSort('video3SecRate')} className={`${thClass} ${colW.vid3Rate} bg-blue-50 text-blue-700`}>3秒再生率{getSortIcon('video3SecRate')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedRows.map((row, idx) => {
                                const masterItem = getPreviewUrl(row.campaign, row.id);
                                const hasLink = !!masterItem?.url;

                                return (
                                    <tr key={`${row.id}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                        <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                        <td className={`px-1.5 py-1 text-left text-[10px] text-gray-600 whitespace-normal break-words sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.creative}`} title={row.creative}>
                                            <div
                                                className={`break-words w-full ${hasLink ? 'text-blue-600 cursor-pointer hover:underline font-medium' : ''}`}
                                                onClick={() => hasLink && masterItem && handleCreativeClick(masterItem.fileName, masterItem.url, masterItem.thumbnailUrl)}
                                                onMouseEnter={(e) => {
                                                    if (hasLink && masterItem?.thumbnailUrl) {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setHoveredItem({ url: masterItem.thumbnailUrl, x: rect.right + 10, y: rect.top });
                                                    }
                                                }}
                                                onMouseLeave={() => setHoveredItem(null)}
                                            >
                                                {hasLink && <span className="mr-1">▶️</span>}
                                                {row.creative}
                                            </div>
                                        </td>
                                        <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                        {!isReport && <td className={`${tdClass} ${colW.revenue}`}>{formatNumber(row.revenue)}円</td>}
                                        {!isReport && <td className={`${tdClass} ${colW.profit}`}>{formatNumber(row.profit)}円</td>}
                                        {!isReport && <td className={`${tdClass} ${colW.roas}`}>{row.roas}%</td>}
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
                                        <td className={`${tdClass} ${colW.cpa}`}>{formatNumber(row.cpa)}円</td>
                                        <td className={`${tdClass} ${colW.fvExit}`}>{formatPercent(row.fvExitRate)}</td>
                                        <td className={`${tdClass} ${colW.svExit}`}>{formatPercent(row.svExitRate)}</td>
                                        <td className={`${tdClass} ${colW.vid3} bg-blue-50/30`}>{formatNumber(row.video3SecViews)}</td>
                                        <td className={`${tdClass} ${colW.vid3Cost} bg-blue-50/30`}>{formatNumber(row.video3SecCost)}円</td>
                                        <td className={`${tdClass} ${colW.vid3Rate} bg-blue-50/30`}>{formatPercent(row.video3SecRate)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Hover Tooltip - Fixed Position Portal-like behavior */}
            {hoveredItem && (
                <div
                    className="fixed z-50 pointer-events-none rounded shadow-lg overflow-hidden border border-gray-200 bg-black animate-in fade-in duration-200"
                    style={{
                        left: hoveredItem.x,
                        top: hoveredItem.y,
                        width: '150px',
                        height: 'auto'
                    }}
                >
                    {/* Maintain aspect ratio of image or fixed height? Request says 150x200px approx */}
                    <img
                        src={hoveredItem.url}
                        alt="Preview"
                        className="w-full h-auto object-cover max-h-[300px]"
                        onError={(e) => {
                            // Hide on error
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                </div>
            )}

            {/* Preview Modal */}
            {previewItem && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setPreviewItem(null)} // Close on background click
                >
                    <div
                        className={`bg-black rounded-xl p-2 flex flex-col relative shadow-2xl transition-all duration-300 ${previewItem.isVertical
                            ? 'w-[45vh] max-w-[90vw] h-[80vh]' // Vertical Aspect
                            : 'w-[80vw] max-w-5xl h-[80vh] max-h-[80vw]' // Horizontal (Default)
                            }`}
                        onClick={e => e.stopPropagation()} // Prevent close on content click
                    >
                        <div className="flex justify-between items-center p-3 text-white absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent">
                            <h4 className="font-bold truncate text-sm px-2 text-shadow drop-shadow-md">{previewItem.title}</h4>
                            <button
                                onClick={() => setPreviewItem(null)}
                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors backdrop-blur-md"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 bg-black rounded overflow-hidden flex items-center justify-center relative w-full h-full">
                            <iframe
                                src={previewItem.url}
                                className="w-full h-full border-0"
                                allow="autoplay; fullscreen"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
