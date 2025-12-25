// Data Processor - TypeScript port of Python processor.py

import { SheetData } from './googleSheets';

// --- Settings ---
const ACCOUNT_MAPPING: Record<string, string> = {
    'allattain01': 'SAC_成果',
    'allattain05': 'SAC_予算',
    'allattain04': 'ルーチェ_予算',
};

const BEYOND_NAME_MAPPING: Record<string, string> = {
    '【運用】SAC_成果': 'SAC_成果',
    '【運用】SAC_予算': 'SAC_予算',
    '【運用】ルーチェ_予算': 'ルーチェ_予算',
};

export const PROJECT_SETTINGS: Record<string, { type: '成果' | '予算'; unitPrice?: number; feeRate?: number }> = {
    'SAC_成果': { type: '成果', unitPrice: 90000 },
    'SAC_予算': { type: '予算', feeRate: 0.2 },
    'ルーチェ_予算': { type: '予算', feeRate: 0.2 },
};

export interface ProcessedRow {
    Date: Date;
    Campaign_Name: string;
    Media: 'Meta' | 'Beyond';
    Creative: string;
    Cost: number;
    Impressions: number;
    Clicks: number;
    CV: number;
    MCV: number;
    PV: number;
    FV_Exit: number;
    SV_Exit: number;
    Revenue: number;
    Gross_Profit: number;
    // New fields for filters
    beyond_page_name: string;
    version_name: string;
    creative_value: string; // utm_creative= value only
}

export function safeDivide(numerator: number, denominator: number): number {
    if (denominator === 0 || isNaN(denominator) || denominator === null) {
        return 0;
    }
    return numerator / denominator;
}

function parseNumber(value: string | undefined): number {
    if (!value) return 0;
    const num = parseFloat(value.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function parseDate(dateStr: string): Date {
    // Handle YYYY-MM-DD format properly (avoid timezone issues)
    if (!dateStr) return new Date();

    // If it's already in YYYY-MM-DD format, parse as local date
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, year, month, day] = match;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // Fallback to Date parsing
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
}

function getProjectName(accountName: string): string | null {
    if (!accountName) return null;
    for (const [prefix, projectName] of Object.entries(ACCOUNT_MAPPING)) {
        if (accountName.startsWith(prefix)) {
            return projectName;
        }
    }
    return null;
}

function formatDateStr(date: Date): string {
    // Use local date format to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function processMetaData(metaLive: Record<string, string>[], metaHistory: Record<string, string>[]): ProcessedRow[] {
    const today = formatDateStr(new Date());

    // Process dates and filter
    type MetaRowWithDate = Record<string, string> & { dayStr: string };

    const processRows = (rows: Record<string, string>[], isLive: boolean): MetaRowWithDate[] => {
        return rows
            .map((row): MetaRowWithDate => ({
                ...row,
                dayStr: row['Day'] ? formatDateStr(parseDate(row['Day'])) : '',
            }))
            .filter(row => {
                if (isLive) return row.dayStr === today;
                return row.dayStr < today;
            });
    };

    const liveFiltered = processRows(metaLive, true);
    const historyFiltered = processRows(metaHistory, false);
    const combined = [...historyFiltered, ...liveFiltered];

    const results: ProcessedRow[] = [];

    for (const row of combined) {
        const campaignName = getProjectName(row['Account Name'] || '');
        if (!campaignName) continue;

        const cost = parseNumber(row['Amount Spent']);
        const config = PROJECT_SETTINGS[campaignName];

        let revenue = 0;
        let profit = 0;

        if (config) {
            if (config.type === '成果') {
                revenue = 0;
                profit = -cost;
            } else {
                revenue = cost * (config.feeRate || 0);
                profit = revenue;
            }
        }

        results.push({
            Date: parseDate(row['Day']),
            Campaign_Name: campaignName,
            Media: 'Meta',
            Creative: row['Ad Name'] || '',
            Cost: cost,
            Impressions: parseNumber(row['Impressions']),
            Clicks: parseNumber(row['Link Clicks']),
            CV: parseNumber(row['Results']),
            MCV: parseNumber(row['Results']),
            PV: 0,
            FV_Exit: 0,
            SV_Exit: 0,
            Revenue: revenue,
            Gross_Profit: profit,
            // Meta doesn't have these fields
            beyond_page_name: '',
            version_name: '',
            creative_value: '',
        });
    }

    return results;
}

function processBeyondData(beyondLive: Record<string, string>[], beyondHistory: Record<string, string>[]): ProcessedRow[] {
    const today = formatDateStr(new Date());

    type BeyondRowWithDate = Record<string, string> & { dayStr: string; folderNormalized: string };

    const processRows = (rows: Record<string, string>[], isLive: boolean): BeyondRowWithDate[] => {
        return rows
            .map((row): BeyondRowWithDate => ({
                ...row,
                dayStr: row['date_jst'] ? formatDateStr(parseDate(row['date_jst'])) : '',
                folderNormalized: (row['folder_name'] || '').replace(/\u3000/g, ' ').trim(),
            }))
            .filter(row => {
                if (isLive) return row.dayStr === today;
                return row.dayStr < today;
            });
    };

    const liveFiltered = processRows(beyondLive, true);
    const historyFiltered = processRows(beyondHistory, false);
    const combined = [...historyFiltered, ...liveFiltered];

    const results: ProcessedRow[] = [];

    for (const row of combined) {
        // Filter by folder_name
        const campaignName = BEYOND_NAME_MAPPING[row.folderNormalized];
        if (!campaignName) continue;

        // Filter by utm_creative
        const parameter = (row['parameter'] || '').trim();
        if (!parameter.startsWith('utm_creative=')) continue;

        // Extract new fields
        const beyondPageName = (row['beyond_page_name'] || '').trim();
        const versionName = (row['version_name'] || '').trim();
        const creativeValue = parameter.replace('utm_creative=', '');

        const cost = parseNumber(row['cost']);
        const cv = parseNumber(row['cv']);
        const config = PROJECT_SETTINGS[campaignName];

        let revenue = 0;
        let profit = 0;

        if (config) {
            if (config.type === '成果') {
                revenue = cv * (config.unitPrice || 0);
                profit = revenue - cost;
            } else {
                revenue = cost * (config.feeRate || 0);
                profit = revenue;
            }
        }

        results.push({
            Date: parseDate(row['date_jst']),
            Campaign_Name: campaignName,
            Media: 'Beyond',
            Creative: parameter,
            Cost: cost,
            Impressions: 0,
            Clicks: parseNumber(row['click']),
            CV: cv,
            MCV: 0,
            PV: parseNumber(row['pv']),
            FV_Exit: parseNumber(row['fv_exit']),
            SV_Exit: parseNumber(row['sv_exit']),
            Revenue: revenue,
            Gross_Profit: profit,
            // New fields for filters
            beyond_page_name: beyondPageName,
            version_name: versionName,
            creative_value: creativeValue,
        });
    }

    return results;
}

export function processData(data: SheetData): ProcessedRow[] {
    const metaData = processMetaData(data.Meta_Live, data.Meta_History);
    const beyondData = processBeyondData(data.Beyond_Live, data.Beyond_History);
    return [...metaData, ...beyondData];
}

// Aggregation helpers
export function aggregateByDate(data: ProcessedRow[], media?: 'Meta' | 'Beyond'): Map<string, ProcessedRow> {
    const filtered = media ? data.filter(row => row.Media === media) : data;
    const map = new Map<string, ProcessedRow>();

    for (const row of filtered) {
        const dateKey = formatDateStr(row.Date);
        const existing = map.get(dateKey);

        if (existing) {
            existing.Cost += row.Cost;
            existing.Impressions += row.Impressions;
            existing.Clicks += row.Clicks;
            existing.CV += row.CV;
            existing.MCV += row.MCV;
            existing.PV += row.PV;
            existing.FV_Exit += row.FV_Exit;
            existing.SV_Exit += row.SV_Exit;
            existing.Revenue += row.Revenue;
            existing.Gross_Profit += row.Gross_Profit;
        } else {
            map.set(dateKey, { ...row });
        }
    }

    return map;
}

export function filterByDateRange(data: ProcessedRow[], startDate: Date, endDate: Date): ProcessedRow[] {
    // Compare using date strings to avoid timezone/time component issues
    const startStr = formatDateStr(startDate);
    const endStr = formatDateStr(endDate);

    return data.filter(row => {
        const rowDateStr = formatDateStr(row.Date);
        return rowDateStr >= startStr && rowDateStr <= endStr;
    });
}

export function filterByCampaign(data: ProcessedRow[], campaignName: string): ProcessedRow[] {
    if (campaignName === 'All') return data;
    return data.filter(row => row.Campaign_Name === campaignName);
}

export function getUniqueCampaigns(data: ProcessedRow[]): string[] {
    const campaigns = new Set(data.map(row => row.Campaign_Name));
    return Array.from(campaigns);
}

export function getUniqueCreatives(data: ProcessedRow[], media?: 'Meta' | 'Beyond'): string[] {
    const filtered = media ? data.filter(row => row.Media === media) : data;
    const creatives = new Set(filtered.map(row => row.Creative).filter(c => c));
    return Array.from(creatives);
}

// New filter helpers
export function getUniqueBeyondPageNames(data: ProcessedRow[]): string[] {
    const beyondData = data.filter(row => row.Media === 'Beyond');
    const pageNames = new Set(beyondData.map(row => row.beyond_page_name).filter(n => n));
    return Array.from(pageNames);
}

export function getUniqueVersionNames(data: ProcessedRow[]): string[] {
    const beyondData = data.filter(row => row.Media === 'Beyond');
    const versionNames = new Set(beyondData.map(row => row.version_name).filter(n => n));
    return Array.from(versionNames);
}

export function getUniqueCreativeValues(data: ProcessedRow[]): string[] {
    const beyondData = data.filter(row => row.Media === 'Beyond');
    const creativeValues = new Set(beyondData.map(row => row.creative_value).filter(v => v));
    return Array.from(creativeValues);
}
