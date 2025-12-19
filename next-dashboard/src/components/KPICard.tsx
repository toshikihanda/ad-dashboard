'use client';

import { cn } from '@/lib/utils';

interface KPICardProps {
    label: string;
    value: string | number;
    unit?: string;
    colorClass?: string;
    source?: string;
}

export function KPICard({ label, value, unit = '', colorClass = '', source }: KPICardProps) {
    const formattedValue = typeof value === 'number'
        ? value.toLocaleString('ja-JP')
        : value;

    return (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {label}
                </div>
                {source && (
                    <div className="text-[10px] text-gray-400 font-normal">
                        ({source})
                    </div>
                )}
            </div>
            <div className={cn('text-2xl font-bold tracking-tight', colorClass)}>
                {formattedValue}
                {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
            </div>
        </div>
    );
}

interface KPIGridProps {
    children: React.ReactNode;
    columns?: number;
}

export function KPIGrid({ children, columns = 7 }: KPIGridProps) {
    return (
        <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {children}
        </div>
    );
}
