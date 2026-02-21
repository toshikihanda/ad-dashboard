'use client';

import { useMemo, useState } from 'react';
import { ProcessedRow, safeDivide } from '@/lib/dataProcessor';

interface VersionMetricsTableProps {
    data: ProcessedRow[];
    title?: string;
}

interface VersionRow {
    id: string;
    version: string;
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
    hasMetaData: boolean;
}

type SortType = keyof VersionRow;

function formatNumber(value: number, decimals = 0): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: decimals });
}

function formatPercent(value: number): string {
    if (isNaN(value) || !isFinite(value)) return '-';
    return `${value.toFixed(1)}%`;
}

function aggregateByVersion(data: ProcessedRow[]): VersionRow[] {
    const grouped = new Map<string, ProcessedRow[]>();

    for (const row of data) {
        // Group by version_name
        const key = row.version_name;
        if (!key) continue;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(row);
    }

    const rows: VersionRow[] = [];

    for (const [key, rowData] of grouped) {
        const metaData = rowData.filter(row => row.Media === 'Meta');
        const beyondData = rowData.filter(row => row.Media === 'Beyond');
        const hasMetaData = metaData.length > 0;

        const metaCost = metaData.reduce((sum, row) => sum + row.Cost, 0);
        const impressions = metaData.reduce((sum, row) => sum + row.Impressions, 0);
        const metaClicks = metaData.reduce((sum, row) => sum + row.Clicks, 0);

        const beyondCost = beyondData.reduce((sum, row) => sum + row.Cost, 0);
        const revenue = beyondData.reduce((sum, row) => sum + row.Revenue, 0);
        const profit = beyondData.reduce((sum, row) => sum + row.Gross_Profit, 0);
        const pv = beyondData.reduce((sum, row) => sum + row.PV, 0);
        const beyondClicks = beyondData.reduce((sum, row) => sum + row.Clicks, 0);
        const cv = beyondData.reduce((sum, row) => sum + row.CV, 0);
        const fvExit = beyondData.reduce((sum, row) => sum + row.FV_Exit, 0);
        const svExit = beyondData.reduce((sum, row) => sum + row.SV_Exit, 0);

        const totalCost = beyondCost > 0 ? beyondCost : metaCost;
        if (totalCost === 0) continue;

        const campaign = rowData[0].Campaign_Name;

        rows.push({
            id: key,
            version: key,
            campaign,
            cost: totalCost,
            revenue,
            profit,
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
            hasMetaData
        });
    }
    return rows;
}

export function VersionMetricsTable({ data, title = '記事別数値' }: VersionMetricsTableProps) {
    const [sortKey, setSortKey] = useState<SortType>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const handleSort = (key: SortType) => {
        if (sortKey === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            const ascMetrics = ['cpa', 'cpc', 'cpm', 'mcpa', 'fvExitRate', 'svExitRate'];
            setSortOrder(ascMetrics.includes(key) ? 'asc' : 'desc');
        }
    };

    const getSortIcon = (key: SortType) => {
        if (sortKey !== key) return '';
        return sortOrder === 'asc' ? ' ▲' : ' ▼';
    };

    const sortedRows = useMemo(() => {
        const rows = aggregateByVersion(data);
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
        version: 'w-[180px]',
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
        svExit: 'w-[50px]'
    };

    const thClass = "px-1.5 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none";
    const tdClass = "px-1.5 py-1 text-right text-[10px] text-gray-700 whitespace-nowrap";

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6 relative">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>

            <div className="overflow-x-auto -mx-4 px-4">
                <div className="max-h-[330px] overflow-y-auto">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: '1200px' }}>
                        <thead className="bg-gray-50 sticky top-0 z-30">
                            <tr>
                                <th className={`px-1 py-1 text-center text-[10px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 ${colW.rank}`}>#</th>
                                <th onClick={() => handleSort('version')} className={`${thClass} text-left sticky left-[24px] bg-gray-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.version}`}>記事名{getSortIcon('version')}</th>
                                <th onClick={() => handleSort('cost')} className={`${thClass} ${colW.cost}`}>出稿金額{getSortIcon('cost')}</th>
                                <th onClick={() => handleSort('revenue')} className={`${thClass} ${colW.revenue}`}>売上{getSortIcon('revenue')}</th>
                                <th onClick={() => handleSort('profit')} className={`${thClass} ${colW.profit}`}>粗利{getSortIcon('profit')}</th>
                                <th onClick={() => handleSort('roas')} className={`${thClass} ${colW.roas}`}>ROAS{getSortIcon('roas')}</th>
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedRows.map((row, idx) => (
                                <tr key={`${row.id}-${idx}`} className="hover:bg-gray-50 bg-inherit group">
                                    <td className={`px-1 py-1 text-center sticky left-0 bg-white group-hover:bg-gray-50 z-10 text-[10px] text-gray-400 ${colW.rank}`}>{idx + 1}</td>
                                    <td className={`px-1.5 py-1 text-left text-[10px] text-gray-600 whitespace-normal break-words sticky left-[24px] bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${colW.version}`} title={row.version}>
                                        <div className="break-words w-full font-medium">{row.version}</div>
                                    </td>
                                    <td className={`${tdClass} ${colW.cost}`}>{formatNumber(row.cost)}円</td>
                                    <td className={`${tdClass} ${colW.revenue}`}>{formatNumber(row.revenue)}円</td>
                                    <td className={`${tdClass} ${colW.profit}`}>{formatNumber(row.profit)}円</td>
                                    <td className={`${tdClass} ${colW.roas}`}>{row.roas}%</td>
                                    <td className={`${tdClass} ${colW.imp}`}>{row.hasMetaData ? formatNumber(row.impressions) : '-'}</td>
                                    <td className={`${tdClass} ${colW.clicks}`}>{row.hasMetaData ? formatNumber(row.clicks) : '-'}</td>
                                    <td className={`${tdClass} ${colW.lpClick}`}>{formatNumber(row.mcv)}</td>
                                    <td className={`${tdClass} ${colW.cv}`}>{formatNumber(row.cv)}</td>
                                    <td className={`${tdClass} ${colW.ctr}`}>{row.hasMetaData ? formatPercent(row.ctr) : '-'}</td>
                                    <td className={`${tdClass} ${colW.mcvr}`}>{formatPercent(row.mcvr)}</td>
                                    <td className={`${tdClass} ${colW.cvr}`}>{formatPercent(row.cvr)}</td>
                                    <td className={`${tdClass} ${colW.cpm}`}>{row.hasMetaData ? formatNumber(row.cpm) + '円' : '-'}</td>
                                    <td className={`${tdClass} ${colW.cpc}`}>{row.hasMetaData ? formatNumber(row.cpc) + '円' : '-'}</td>
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
