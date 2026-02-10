
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';
import { useState } from 'react';

interface DailyDataTableProps {
    data: ProcessedRow[];
    title: string;
    viewMode: 'total' | 'meta' | 'beyond';
    isVersionFilterActive?: boolean;
}

interface DailyTableRow {
    date: string;
    displayDate: string;
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
    pv: number;
    fvExit: number;
    svExit: number;
    fvExitRate: number;
    svExitRate: number;
}

function aggregateByDateAndCampaign(data: ProcessedRow[], viewMode: 'total' | 'meta' | 'beyond', isVersionFilterActive: boolean): DailyTableRow[] {
    // Group by date and campaign
    const grouped = new Map<string, ProcessedRow[]>();

    for (const row of data) {
        const dateStr = row.Date.toISOString().split('T')[0];
        const key = `${dateStr}|||${row.Campaign_Name}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(row);
    }

    // Aggregate each group
    const rows: DailyTableRow[] = [];

    for (const [key, rowData] of grouped) {
        const [dateStr, campaign] = key.split('|||');

        const metaData = rowData.filter(row => row.Media === 'Meta');
        const beyondData = rowData.filter(row => row.Media === 'Beyond');

        // Meta aggregations
        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);

        // Beyond aggregations
        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

        // Revenue and Profit
        const revenue = rowData.reduce((sum, row) => sum + row.Revenue, 0);
        const profit = rowData.reduce((sum, row) => sum + row.Gross_Profit, 0);

        const displayCost = viewMode === 'meta' ? metaCost : beyondCost;

        const displayMetaClicks = isVersionFilterActive ? pv : metaClicks;
        const displayBeyondTransition = beyondClicks;

        // CPC計算の統一: version_name フィルター時は恒常的に Beyond出稿金額 / PV
        const unifiedCPC = isVersionFilterActive
            ? safeDivide(beyondCost, pv)
            : (viewMode === 'beyond' ? safeDivide(beyondCost, pv) : safeDivide(metaCost, displayMetaClicks));

        // Format display date
        const [year, month, day] = dateStr.split('-');
        const displayDate = `${year}/${month}/${day}`;

        rows.push({
            date: dateStr,
            displayDate,
            campaign,
            cost: displayCost,
            revenue,
            profit,
            roas: Math.floor(safeDivide(revenue, displayCost) * 100),
            impressions: isVersionFilterActive ? -1 : impressions,
            clicks: viewMode === 'beyond' ? displayBeyondTransition : displayMetaClicks,
            mcv: displayBeyondTransition,
            cv,
            ctr: isVersionFilterActive ? -1 : (safeDivide(displayMetaClicks, impressions) * 100),
            mcvr: safeDivide(displayBeyondTransition, pv) * 100,
            cvr: safeDivide(cv, displayBeyondTransition) * 100,
            cpm: isVersionFilterActive ? -1 : (safeDivide(metaCost, impressions) * 1000),
            cpc: unifiedCPC,
            mcpa: safeDivide(beyondCost, displayBeyondTransition),
            cpa: safeDivide(beyondCost, cv),
            pv,
            fvExit,
            svExit,
            fvExitRate: safeDivide(fvExit, pv) * 100,
            svExitRate: safeDivide(svExit, pv - fvExit) * 100,
        });
    }

    // Sort by date ascending, then by campaign
    return rows.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.campaign.localeCompare(b.campaign);
    });
}

function formatNumber(value: number, decimals = 0): string {
    if (value === -1 || isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (value === -1 || isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

export function DailyDataTable({ data, title, viewMode, isVersionFilterActive = false }: DailyDataTableProps) {
    const rawRows = aggregateByDateAndCampaign(data, viewMode, isVersionFilterActive);

    // ソート状態: null = デフォルト(日付昇順), 'asc' = 昇順, 'desc' = 降順
    const [sortKey, setSortKey] = useState<keyof DailyTableRow | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

    // ソートヘッダークリックハンドラー
    const handleSort = (key: keyof DailyTableRow) => {
        if (sortKey !== key) {
            // 新しい列をクリック: 昇順から開始（数値は降順の方が良いことが多いが、DataTableに合わせて昇順開始とする、あるいは項目による？）
            // DataTableでは昇順開始なので統一
            setSortKey(key);
            setSortOrder('asc');
        } else if (sortOrder === 'asc') {
            // 昇順 → 降順
            setSortOrder('desc');
        } else if (sortOrder === 'desc') {
            // 降順 → デフォルト（日付順）
            setSortKey(null);
            setSortOrder(null);
        }
    };

    // ソートアイコンを取得
    const getSortIcon = (key: keyof DailyTableRow) => {
        if (sortKey !== key) return '';
        if (sortOrder === 'asc') return ' ▲';
        if (sortOrder === 'desc') return ' ▼';
        return '';
    };

    // ソート適用
    const rows = [...rawRows].sort((a, b) => {
        if (!sortKey || !sortOrder) {
            // デフォルト: 日付昇順 -> 商材昇順
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;
            return a.campaign.localeCompare(b.campaign);
        }

        const aVal = a[sortKey];
        const bVal = b[sortKey];

        // 文字列の場合
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        // 数値の場合
        const aNum = typeof aVal === 'number' ? aVal : 0;
        const bNum = typeof bVal === 'number' ? bVal : 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
    });

    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
                <p className="text-gray-400 text-sm">データなし</p>
            </div>
        );
    }

    // 固定列幅定義（DataTableと統一）
    const colW = {
        rank: 'w-[24px]',
        date: 'w-[80px]',
        label: 'w-[110px]',
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
    };

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

    // Total view
    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <div className="overflow-x-auto -mx-4 px-4">
                <div className="max-h-[330px] overflow-y-auto">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: '1200px' }}>
                        <thead className="bg-gray-50 sticky top-0 z-30">
                            <tr>
                                <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th onClick={() => handleSort('date')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 ${colW.date}`}>日付{getSortIcon('date')}</th>
                                <th onClick={() => handleSort('campaign')} className={`${thClass} text-left sticky left-[104px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>商材{getSortIcon('campaign')}</th>
                                <th onClick={() => handleSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                                <th onClick={() => handleSort('revenue')} className={`${thClass} ${colW.revenue}`}>売上{getSortIcon('revenue')}</th>
                                <th onClick={() => handleSort('profit')} className={`${thClass} ${colW.profit}`}>粗利{getSortIcon('profit')}</th>
                                <th onClick={() => handleSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>
                                <th onClick={() => handleSort('impressions')} className={`${thClass} ${colW.imp}`}>Imp{getSortIcon('impressions')}</th>
                                <th onClick={() => handleSort('clicks')} className={`${thClass} ${colW.clicks}`}>Clicks{getSortIcon('clicks')}</th>
                                <th onClick={() => handleSort('mcv')} className={`${thClass} ${colW.lpClick}`}>商品LPクリック{getSortIcon('mcv')}</th>
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, idx) => (
                                <tr key={`${row.date}-${row.campaign}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-600 whitespace-nowrap sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 ${colW.date}`}>{row.displayDate}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-700 whitespace-nowrap sticky left-[104px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.label}`}>{row.campaign}</td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.revenue}`}>{formatNumber(row.revenue)}円</td>
                                    <td className={`${tdClass} ${colW.profit}`}>{formatNumber(row.profit)}円</td>
                                    <td className={`${tdClass} ${colW.roas}`}>{row.roas}%</td>
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
