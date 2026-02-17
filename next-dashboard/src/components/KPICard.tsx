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
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-1.5 md:p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-0.5">
                <div className="text-[8px] md:text-xs font-semibold text-gray-500 uppercase tracking-tight truncate pr-1">
                    {label}
                </div>
                {source && (
                    <div className="text-[7px] md:text-[10px] text-gray-400 font-normal whitespace-nowrap">
                        ({source})
                    </div>
                )}
            </div>
            <div className={cn('text-base md:text-2xl font-bold tracking-tighter truncate', colorClass)}>
                {formattedValue}
                {unit && <span className="text-[9px] md:text-sm font-normal text-gray-400 ml-0.5">{unit}</span>}
            </div>
        </div>
    );
}

interface KPIGridProps {
    children: React.ReactNode;
    columns?: number;
}

export function KPIGrid({ children, columns = 6 }: KPIGridProps) {
    // Determine grid columns based on the 'columns' prop but make it responsive
    // Default to 2 on mobile, 3 on tablet, and the requested 'columns' on desktop
    const gridColsClass =
        columns <= 2 ? 'grid-cols-2' :
            columns <= 4 ? 'grid-cols-2 md:grid-cols-4' :
                'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';

    return (
        <div className={cn("grid gap-3 mb-4 md:mb-6", gridColsClass)}>
            {children}
        </div>
    );
}
