'use client';

import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { ProcessedRow } from '@/lib/dataProcessor';

interface ChartProps {
    data: ProcessedRow[];
    title: string;
}

// 視認性の高い配色（順番に使用）
const COLOR_PALETTE = [
    '#3b82f6', // Blue
    '#f97316', // Orange
    '#22c55e', // Green
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#6366f1', // Indigo
    '#84cc16', // Lime
    '#a855f7', // Purple
];

// 商材リストに対して順番に色を割り当てる
function getCampaignColorMap(campaigns: string[]): Map<string, string> {
    const colorMap = new Map<string, string>();
    campaigns.forEach((campaign, index) => {
        colorMap.set(campaign, COLOR_PALETTE[index % COLOR_PALETTE.length]);
    });
    return colorMap;
}

function formatYAxis(value: number): string {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toLocaleString('ja-JP');
}

function formatDate(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const [, month, day] = parts;
    return `${month}/${day}`;
}

interface ChartDataPoint {
    date: string;
    [key: string]: number | string;
}

function prepareChartData(data: ProcessedRow[], metricKey: keyof ProcessedRow): ChartDataPoint[] {
    const dateMap = new Map<string, ChartDataPoint>();

    for (const row of data) {
        const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
        const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, { date: dateKey });
        }
        const point = dateMap.get(dateKey)!;
        const campaign = row.Campaign_Name;
        const existingValue = (point[campaign] as number) || 0;
        point[campaign] = existingValue + (row[metricKey] as number);
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function RevenueChart({ data, title }: ChartProps) {
    const chartData = prepareChartData(data, 'Revenue');
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? value.toLocaleString('ja-JP') : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Bar
                            key={campaign}
                            dataKey={campaign}
                            stackId="a"
                            fill={colorMap.get(campaign)}
                            radius={[2, 2, 0, 0]}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export function CostChart({ data, title }: ChartProps) {
    const chartData = prepareChartData(data, 'Cost');
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? value.toLocaleString('ja-JP') : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Bar
                            key={campaign}
                            dataKey={campaign}
                            stackId="a"
                            fill={colorMap.get(campaign)}
                            radius={[2, 2, 0, 0]}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export function CVChart({ data, title }: ChartProps) {
    const chartData = prepareChartData(data, 'CV');
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatYAxis} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? value.toLocaleString('ja-JP') : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Bar
                            key={campaign}
                            dataKey={campaign}
                            stackId="a"
                            fill={colorMap.get(campaign)}
                            radius={[2, 2, 0, 0]}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

interface RateChartProps extends ChartProps {
    numeratorKey: keyof ProcessedRow;
    denominatorKey: keyof ProcessedRow;
    multiplier?: number;
}

export function RateChart({ data, title, numeratorKey, denominatorKey, multiplier = 100 }: RateChartProps) {
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);
    const dateMap = new Map<string, ChartDataPoint>();

    for (const row of data) {
        const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
        const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, { date: dateKey });
        }
    }

    // Calculate rates per campaign per date
    for (const campaign of campaigns) {
        const campaignData = data.filter(row => row.Campaign_Name === campaign);
        const campaignDateAgg = new Map<string, { num: number; den: number }>();

        for (const row of campaignData) {
            const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
            const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
            const existing = campaignDateAgg.get(dateKey) || { num: 0, den: 0 };
            existing.num += row[numeratorKey] as number;
            existing.den += row[denominatorKey] as number;
            campaignDateAgg.set(dateKey, existing);
        }

        for (const [dateKey, agg] of campaignDateAgg) {
            const point = dateMap.get(dateKey)!;
            point[campaign] = agg.den > 0 ? (agg.num / agg.den) * multiplier : 0;
        }
    }

    const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? `${value.toFixed(2)}%` : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Line
                            key={campaign}
                            type="monotone"
                            dataKey={campaign}
                            stroke={colorMap.get(campaign)}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

interface CostMetricChartProps extends ChartProps {
    costDivisorKey: keyof ProcessedRow;
    multiplier?: number;
}

export function CostMetricChart({ data, title, costDivisorKey, multiplier = 1 }: CostMetricChartProps) {
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);
    const dateMap = new Map<string, ChartDataPoint>();

    for (const row of data) {
        const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
        const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, { date: dateKey });
        }
    }

    for (const campaign of campaigns) {
        const campaignData = data.filter(row => row.Campaign_Name === campaign);
        const campaignDateAgg = new Map<string, { cost: number; divisor: number }>();

        for (const row of campaignData) {
            const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
            const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
            const existing = campaignDateAgg.get(dateKey) || { cost: 0, divisor: 0 };
            existing.cost += row.Cost;
            existing.divisor += row[costDivisorKey] as number;
            campaignDateAgg.set(dateKey, existing);
        }

        for (const [dateKey, agg] of campaignDateAgg) {
            const point = dateMap.get(dateKey)!;
            point[campaign] = agg.divisor > 0 ? (agg.cost / agg.divisor) * multiplier : 0;
        }
    }

    const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? value.toLocaleString('ja-JP', { maximumFractionDigits: 0 }) : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Line
                            key={campaign}
                            type="monotone"
                            dataKey={campaign}
                            stroke={colorMap.get(campaign)}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

interface GenericChartProps extends ChartProps {
    dataKey: keyof ProcessedRow;
    unit?: string;
}

export function GenericBarChart({ data, title, dataKey, unit = '' }: GenericChartProps) {
    const chartData = prepareChartData(data, dataKey);
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={unit === '%' ? (v) => `${v}%` : formatYAxis} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? `${value.toLocaleString('ja-JP', { maximumFractionDigits: unit === '%' ? 1 : 0 })}${unit}` : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Bar
                            key={campaign}
                            dataKey={campaign}
                            stackId="a"
                            fill={colorMap.get(campaign)}
                            radius={[2, 2, 0, 0]}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

interface GenericRateChartProps extends ChartProps {
    numeratorKey: keyof ProcessedRow;
    denominatorKey: keyof ProcessedRow;
    multiplier?: number;
    unit?: string;
}

export function GenericRateChart({ data, title, numeratorKey, denominatorKey, multiplier = 100, unit = '%' }: GenericRateChartProps) {
    const campaigns = [...new Set(data.map(row => row.Campaign_Name))];
    const colorMap = getCampaignColorMap(campaigns);
    const dateMap = new Map<string, ChartDataPoint>();

    for (const row of data) {
        const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
        const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, { date: dateKey });
        }
    }

    // Calculate rates per campaign per date
    for (const campaign of campaigns) {
        const campaignData = data.filter(row => row.Campaign_Name === campaign);
        const campaignDateAgg = new Map<string, { num: number; den: number }>();

        for (const row of campaignData) {
            const d = row.Date instanceof Date ? row.Date : new Date(row.Date);
            const dateKey = isNaN(d.getTime()) ? 'unknown' : d.toISOString().split('T')[0];
            const existing = campaignDateAgg.get(dateKey) || { num: 0, den: 0 };
            existing.num += row[numeratorKey] as number;
            existing.den += row[denominatorKey] as number;
            campaignDateAgg.set(dateKey, existing);
        }

        for (const [dateKey, agg] of campaignDateAgg) {
            const point = dateMap.get(dateKey)!;
            point[campaign] = agg.den > 0 ? (agg.num / agg.den) * multiplier : 0;
        }
    }

    const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(1)}${unit}`} tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined) =>
                            value !== undefined ? `${value.toFixed(2)}${unit}` : ''
                        }
                        labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: '8px' }}
                        iconSize={10}
                        layout="horizontal"
                        align="center"
                    />
                    {campaigns.map((campaign) => (
                        <Line
                            key={campaign}
                            type="monotone"
                            dataKey={campaign}
                            stroke={colorMap.get(campaign)}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
