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
    // New Video Metrics
    Video_3Sec_Views: number;
    Cost_Per_Video_3Sec_View: number;
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
// Extract creative value from Meta's Ad Name
// Matches patterns like "bt054_004_004", "116_004_004", or raw IDs like "120237718661190172"
function extractCreativeFromAdName(adName: string): string {
    if (!adName) return '';

    // 1. btで始まるパターン (bt054_004_004)
    const matchBt = adName.match(/bt\d+(?:_\d+)+/i);
    if (matchBt) return matchBt[0];

    // 2. 英数字混合のアンダースコア区切りパターン (e.g., 2_116_c1, 116_004_004)
    // 数字で始まり、アンダースコア＋英数字が2回以上続く
    const matchMixed = adName.match(/\d+(?:_[a-zA-Z0-9]+){2,}/);
    if (matchMixed) {
        // 日付形式(2025_01_01)を除外
        if (!matchMixed[0].match(/^20\d{2}_\d{2}_\d{2}$/)) {
            return matchMixed[0];
        }
    }

    // 3. アンダースコア区切りの数字 (140_1 など短いものも許容)
    // Modified to allow 1-3 digits to support "140_1"
    const matchUnderscore = adName.match(/\d{2,}(?:_\d{1,3})+/);
    if (matchUnderscore) {
        // Exclude obvious date formats (YYYY_MM_DD) starting with 20xx
        if (!matchUnderscore[0].match(/^20\d{2}_\d{2}_\d{2}$/)) {
            return matchUnderscore[0];
        }
    }

    // 4. 長い数字ID (15桁以上) - MetaのAd IDなどがそのまま使われている場合
    const matchLongId = adName.match(/\d{15,}/);
    if (matchLongId) return matchLongId[0];

    return '';
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

    // Helper to find value with loose matching
    const findColumnValue = (row: Record<string, string>, targets: string[]): string | undefined => {
        // 1. Exact match
        for (const t of targets) {
            if (row[t] !== undefined) return row[t];
        }
        // 2. Case-insensitive & Trimmed match
        const keys = Object.keys(row);
        for (const t of targets) {
            const normalizedTarget = t.trim().toLowerCase();
            for (const k of keys) {
                if (k.trim().toLowerCase() === normalizedTarget) {
                    return row[k];
                }
            }
        }
        return undefined;
    };

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

        // 新規指標: 動画3秒再生数, 単価
        // カラム名の揺らぎ（スペースや大文字小文字）に対応
        // ユーザーから指定された列名: "3-Second Video Views", "Cost per 3-Second Video View"
        const video3SecViewsVal = findColumnValue(row, ['3-Second Video Views', '3-Second Video', '3-Second Video Plays']);
        const video3SecViews = parseNumber(video3SecViewsVal);

        const video3SecCostVal = findColumnValue(row, ['Cost per 3-Second Video View']);
        const video3SecCost = parseNumber(video3SecCostVal);

        results.push({
            Date: parseDate(row['Day']),
            Campaign_Name: config.projectName,
            Media: 'Meta',
            Creative: metaCreativeValue || adName, // Use extracted ID if available
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
            Video_3Sec_Views: video3SecViews,
            Cost_Per_Video_3Sec_View: video3SecCost,
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
            Video_3Sec_Views: 0,
            Cost_Per_Video_3Sec_View: 0,
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
            existing.Video_3Sec_Views += row.Video_3Sec_Views;
            // Cost_Per_Video_3Sec_View is a rate, so we don't sum it.
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

export function filterByCampaign(data: ProcessedRow[], campaignName: string | string[]): ProcessedRow[] {
    if (campaignName === 'All' || (Array.isArray(campaignName) && campaignName.length === 0)) return data;

    if (Array.isArray(campaignName)) {
        return data.filter(row => campaignName.includes(row.Campaign_Name));
    }

    return data.filter(row => row.Campaign_Name === campaignName);
}

export function getUniqueCampaigns(data: ProcessedRow[]): string[] {
    // 実績（コスト、CV、Impression、売上）のいずれかがある案件のみ抽出
    const activeData = data.filter(row => row.Cost > 0 || row.CV > 0 || row.Impressions > 0 || row.Revenue > 0);
    const campaigns = new Set(activeData.map(row => row.Campaign_Name));
    return Array.from(campaigns);
}

export function getUniqueCreatives(data: ProcessedRow[], media?: 'Meta' | 'Beyond'): string[] {
    let filtered = media ? data.filter(row => row.Media === media) : data;
    // 実績があるものに絞る
    filtered = filtered.filter(row => row.Cost > 0 || row.CV > 0 || row.Impressions > 0);
    const creatives = new Set(filtered.map(row => row.Creative).filter(c => c));
    return Array.from(creatives);
}

// New filter helpers
export function getUniqueBeyondPageNames(data: ProcessedRow[]): string[] {
    // 期間内に実績（コストまたはCV）があるページのみ抽出
    const beyondData = data.filter(row => row.Media === 'Beyond' && (row.Cost > 0 || row.CV > 0));
    const pageNames = new Set(beyondData.map(row => row.beyond_page_name).filter(n => n));
    return Array.from(pageNames);
}

export function getUniqueVersionNames(data: ProcessedRow[]): string[] {
    const beyondData = data.filter(row => row.Media === 'Beyond' && (row.Cost > 0 || row.CV > 0));
    const versionNames = new Set(beyondData.map(row => row.version_name).filter(n => n));
    return Array.from(versionNames);
}

export function getUniqueCreativeValues(data: ProcessedRow[]): string[] {
    const beyondData = data.filter(row => row.Media === 'Beyond' && (row.Cost > 0 || row.CV > 0));
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

// --- Creative Master Parsing ---

// Helper for parsing Creative Master
function findVal(row: Record<string, string>, targets: string[]): string | undefined {
    // 1. Exact match
    for (const t of targets) {
        if (row[t] !== undefined) return row[t];
    }
    // 2. Case-insensitive & Trimmed match
    const keys = Object.keys(row);
    for (const t of targets) {
        const normalizedTarget = t.trim().toLowerCase();
        for (const k of keys) {
            if (k.trim().toLowerCase() === normalizedTarget) {
                return row[k];
            }
        }
    }
    return undefined;
}

export interface CreativeMasterItem {
    campaign: string;
    fileName: string;
    creativeId: string;
    url: string;
    thumbnailUrl?: string;
}

export function parseCreativeMaster(rawData: Record<string, string>[]): CreativeMasterItem[] {
    if (!rawData || rawData.length === 0) return [];

    return rawData.map(row => {
        const campaign = findVal(row, ['商材名', 'Project', 'Campaign', '商材']) || '';
        const fileName = findVal(row, ['クリエイティブ名', 'ファイル名', 'Creative Name', 'File Name']) || '';
        const creativeId = findVal(row, ['ダッシュボード名', 'utm_creative', 'Dashboard Name', 'ID']) || '';
        const url = findVal(row, ['URL', 'Link', 'Google Drive URL']) || '';
        const thumbnailUrl = findVal(row, ['サムネイルURL', 'サムネイル', 'Thumbnail', 'Thumbnail URL', 'Image']) || '';

        return {
            campaign: campaign.trim(),
            fileName,
            creativeId: creativeId.trim(),
            url,
            thumbnailUrl: thumbnailUrl || undefined // undefined if empty
        };
    }).filter(item => item.url && (item.creativeId || item.fileName));
}
