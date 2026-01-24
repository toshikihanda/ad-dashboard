// Data Processor - Dynamic mapping from Master_Setting

import { SheetData } from './googleSheets';

// --- Master_Setting Types ---
export interface ProjectConfig {
    projectName: string;      // 管理用案件名
    metaKeyword: string;      // Meta名（判定キーワード）
    beyondKeyword: string;    // Beyond名（判定キーワード）
    type: '成果' | '予算' | 'IH';    // 運用タイプ
    unitPrice: number;        // 成果単価
    feeRate: number;          // 手数料率
    metaCvName: string;       // Meta CV名（CVとしてカウントする列名）
    metaAccountNames: string[];   // Meta Account Names（過去データ用）
    parameterType: string;    // パラメーター種別 (utm_creative, utm_source, etc.)
}

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
    if (!dateStr) return new Date();
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, year, month, day] = match;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
}

function formatDateStr(date: Date | any): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Parse Master_Setting sheet into ProjectConfig array
function parseMasterSetting(masterSetting: Record<string, string>[]): ProjectConfig[] {
    const configs: ProjectConfig[] = [];

    for (const row of masterSetting) {
        const projectName = (row['管理用案件名'] || '').trim();
        const metaKeyword = (row['Meta名'] || '').trim();
        const beyondKeyword = (row['Beyond名'] || '').trim();
        const typeRaw = (row['運用タイプ'] || '').trim();
        const unitPriceRaw = row['成果単価'] || '0';
        const feeRateRaw = row['手数料率'] || '0';
        const metaCvName = (row['Meta CV名'] || '').trim();

        // Meta Account Names を読み込み
        const metaAccountNamesRaw = (row['Meta Account Names'] || '').trim();

        // Skip rows without project name
        if (!projectName) continue;

        let type: '成果' | '予算' | 'IH' = '予算';
        if (typeRaw === '成果') type = '成果';
        else if (typeRaw === 'IH') type = 'IH';
        const unitPrice = parseNumber(unitPriceRaw);
        // Handle percentage format (e.g., "20%" -> 0.2)
        let feeRate = parseNumber(feeRateRaw.replace('%', ''));
        if (feeRate > 1) feeRate = feeRate / 100; // Convert percentage to decimal

        // カンマ区切りで分割して配列に変換
        const metaAccountNames = metaAccountNamesRaw
            ? metaAccountNamesRaw.split(',').map(s => s.trim()).filter(s => s)
            : [];

        // パラメーター種別 を読み込み（空ならデフォルト utm_creative）
        const parameterType = (row['パラメーター種別'] || 'utm_creative').trim();

        configs.push({
            projectName,
            metaKeyword,
            beyondKeyword,
            type,
            unitPrice,
            feeRate,
            metaCvName,
            metaAccountNames,
            parameterType,
        });
    }

    return configs;
}

// Find matching project by keyword (partial match, first match wins)
// Supports both new (Ad Name) and legacy (Account Name) formats
function findProjectByMetaKeyword(
    adName: string,
    accountName: string,
    configs: ProjectConfig[]
): ProjectConfig | null {
    if (!adName && !accountName) return null;

    for (const config of configs) {
        // Check new format: Ad Name contains metaKeyword
        if (config.metaKeyword && adName && adName.includes(config.metaKeyword)) {
            return config;
        }

        // Check legacy format: Account Name matches (from Master_Setting)
        if (config.metaAccountNames && config.metaAccountNames.length > 0 && accountName) {
            const matchLegacy = config.metaAccountNames.some(name =>
                accountName.includes(name)
            );
            if (matchLegacy) return config;
        }
    }
    return null;
}

// Find matching project for Beyond data
// Uses beyond_page_name (or folder_name as fallback for Beyond_History)
function findProjectByBeyondKeyword(
    beyondPageName: string,
    configs: ProjectConfig[]
): ProjectConfig | null {
    if (!beyondPageName) return null;

    for (const config of configs) {
        // Check if beyond_page_name contains beyondKeyword
        if (config.beyondKeyword && beyondPageName.includes(config.beyondKeyword)) {
            return config;
        }
    }
    return null;
}

// Extract creative value from Meta's Ad Name
// Matches patterns like "bt054_004_004" in "campaign_SAC_成果_bt054_004_004_v1"
function extractCreativeFromAdName(adName: string): string {
    if (!adName) return '';
    // Look for bt + digits pattern with underscores (e.g., bt054_004_004)
    const match = adName.match(/bt\d{3}(?:_\d{3})+/);
    return match ? match[0] : '';
}

function processMetaData(
    metaLive: Record<string, string>[],
    metaHistory: Record<string, string>[],
    configs: ProjectConfig[]
): ProcessedRow[] {
    // 日本時間で今日の日付を取得（VercelはUTCで動作するため）
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(Date.now() + jstOffset);
    const today = formatDateStr(jstDate);

    type MetaRowWithDate = Record<string, string> & { dayStr: string };

    const processRows = (rows: Record<string, string>[], isLive: boolean): MetaRowWithDate[] => {
        return rows
            .map((row): MetaRowWithDate => ({
                ...row,
                dayStr: row['Day'] ? formatDateStr(parseDate(row['Day'])) : '',
            }))
            .filter(row => {
                // Liveデータは全件取得（移行タイミングの猶予を考慮）
                if (isLive) return true;
                // Historyは今日より前のみ（重複を避ける）
                return row.dayStr < today;
            });
    };

    const liveFiltered = processRows(metaLive, true);
    const historyFiltered = processRows(metaHistory, false);
    const combined = [...historyFiltered, ...liveFiltered];

    const results: ProcessedRow[] = [];

    for (const row of combined) {
        const adName = row['Ad Name'] || '';
        const accountName = row['Account Name'] || '';
        const config = findProjectByMetaKeyword(adName, accountName, configs);

        // Skip if no matching project found
        if (!config) continue;

        const cost = parseNumber(row['Amount Spent']);

        let revenue = 0;
        let profit = 0;

        if (config.type === '成果') {
            // 成果型: Meta側は売上・粗利ともに0（売上はBeyond側のみで計算）
            revenue = 0;
            profit = 0;
        } else if (config.type === 'IH') {
            // IH -> 売上 = 出稿金額 × 手数料率, 粗利 = 売上と同じ
            revenue = cost * config.feeRate;
            profit = revenue;
        } else {
            // '予算': Meta側は売上・粗利ともに0（売上はBeyond側のみで計算）
            revenue = 0;
            profit = 0;
        }

        // 商材ごとに異なる CV 列を参照（未設定の場合は Results をフォールバック）
        const cvColumnName = config.metaCvName || 'Results';
        const cvValue = parseNumber(row[cvColumnName]);

        // Meta側のcreative_valueはAd Nameから抽出
        const metaCreativeValue = extractCreativeFromAdName(adName);

        results.push({
            Date: parseDate(row['Day']),
            Campaign_Name: config.projectName,
            Media: 'Meta',
            Creative: adName,
            Cost: cost,
            Impressions: parseNumber(row['Impressions']),
            Clicks: parseNumber(row['Link Clicks']),
            CV: cvValue,
            MCV: cvValue,
            PV: 0,
            FV_Exit: 0,
            SV_Exit: 0,
            Revenue: revenue,
            Gross_Profit: profit,
            beyond_page_name: '',
            version_name: '',
            creative_value: metaCreativeValue,
        });
    }

    return results;
}

function processBeyondData(
    beyondLive: Record<string, string>[],
    beyondHistory: Record<string, string>[],
    configs: ProjectConfig[]
): ProcessedRow[] {
    // 日本時間で今日の日付を取得（VercelはUTCで動作するため）
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(Date.now() + jstOffset);
    const today = formatDateStr(jstDate);

    type BeyondRowWithDate = Record<string, string> & { dayStr: string };

    const processRows = (rows: Record<string, string>[], isLive: boolean): BeyondRowWithDate[] => {
        return rows
            .map((row): BeyondRowWithDate => ({
                ...row,
                dayStr: row['date_jst'] ? formatDateStr(parseDate(row['date_jst'])) : '',
            }))
            .filter(row => {
                // Liveデータは全件取得（移行タイミングの猶予を考慮）
                if (isLive) return true;
                // Historyは今日より前のみ（重複を避ける）
                return row.dayStr < today;
            });
    };

    const liveFiltered = processRows(beyondLive, true);
    const historyFiltered = processRows(beyondHistory, false);
    const combined = [...historyFiltered, ...liveFiltered];

    const results: ProcessedRow[] = [];

    for (const row of combined) {
        // Use beyond_page_name, or fallback to folder_name for Beyond_History
        const beyondPageName = (row['beyond_page_name'] || row['folder_name'] || '').trim();
        const config = findProjectByBeyondKeyword(beyondPageName, configs);

        // Skip if no matching project found
        if (!config) continue;

        // Get parameter and filter by project's parameter type
        const parameter = (row['parameter'] || '').trim();
        const pType = config.parameterType || 'utm_creative';

        // パラメーター種別で指定されたキーワードで始まる行のみを取得
        if (!parameter.startsWith(pType + '=')) {
            continue;
        }

        const creativeValue = parameter.replace(pType + '=', '');
        const versionName = (row['version_name'] || '').trim();

        const cost = parseNumber(row['cost']);
        const cv = parseNumber(row['cv']);

        let revenue = 0;
        let profit = 0;

        if (config.type === '成果') {
            revenue = cv * config.unitPrice;
            profit = revenue - cost;
        } else if (config.type === 'IH') {
            // IH -> 売上 = 出稿金額 × 手数料率, 粗利 = 売上と同じ
            revenue = cost * config.feeRate;
            profit = revenue;
        } else {
            // '予算' -> Revenue = Cost * (1 + FeeRate), Profit = Revenue - Cost
            revenue = cost * (1 + config.feeRate);
            profit = revenue - cost;
        }

        results.push({
            Date: parseDate(row['date_jst']),
            Campaign_Name: config.projectName,
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
            beyond_page_name: beyondPageName,
            version_name: versionName,
            creative_value: creativeValue,
        });
    }

    return results;
}

export function processData(data: SheetData): ProcessedRow[] {
    // Parse Master_Setting first
    const configs = parseMasterSetting(data.Master_Setting);

    const metaData = processMetaData(data.Meta_Live, data.Meta_History, configs);
    const beyondData = processBeyondData(data.Beyond_Live, data.Beyond_History, configs);
    return [...metaData, ...beyondData];
}

// Export configs for use in KPI calculations
export function getProjectConfigs(data: SheetData): ProjectConfig[] {
    return parseMasterSetting(data.Master_Setting);
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

// Get project names from Master_Setting for campaign filter
export function getProjectNamesFromMasterSetting(masterSetting: Record<string, string>[]): string[] {
    return masterSetting
        .map(row => (row['管理用案件名'] || '').trim())
        .filter(name => name !== '')
        .sort();
}
