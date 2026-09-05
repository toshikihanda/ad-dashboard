import type { ProcessedRow } from './dataProcessor';

const HIDDEN_VALUES = new Set(['false', '0', 'no', 'off', 'hidden', '非表示', '不可']);

export function parseFinancialVisibility(value: string | undefined): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    return !HIDDEN_VALUES.has(normalized);
}

export function redactFinancialData(data: ProcessedRow[]): ProcessedRow[] {
    return data.map(row => ({
        ...row,
        Revenue: 0,
        Gross_Profit: 0,
    }));
}
