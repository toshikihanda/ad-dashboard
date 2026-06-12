import { ProcessedRow, CreativeMasterItem } from './dataProcessor';
import { loadSheetData } from './googleSheets';

export interface CampaignAccess {
    allowedCampaigns: string[];
}

const ALL_CAMPAIGNS = '*';
const ACCESS_CONTROL_SHEET = 'Access_Control';

export function isAllCampaignsAllowed(allowedCampaigns: string[] | undefined): boolean {
    return !allowedCampaigns || allowedCampaigns.length === 0 || allowedCampaigns.includes(ALL_CAMPAIGNS);
}

function parseAccessMap(): Record<string, string[]> {
    const raw = process.env.DASHBOARD_ACCESS_KEYS;
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        const map: Record<string, string[]> = {};
        for (const [key, campaigns] of Object.entries(parsed)) {
            if (typeof key !== 'string' || !key) continue;
            if (!Array.isArray(campaigns)) continue;

            map[key] = campaigns
                .map(campaign => String(campaign || '').trim())
                .filter(Boolean);
        }
        return map;
    } catch {
        return {};
    }
}

export function resolveCampaignAccess(password: string): CampaignAccess | null {
    if (password && password === process.env.LOGIN_KEY) {
        return { allowedCampaigns: [ALL_CAMPAIGNS] };
    }

    const accessMap = parseAccessMap();
    const allowedCampaigns = accessMap[password];
    if (!allowedCampaigns || allowedCampaigns.length === 0) return null;

    return { allowedCampaigns };
}

function getRowValue(row: Record<string, string>, candidates: string[]): string {
    for (const key of candidates) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function parseAllowedCampaigns(value: string): string[] {
    return value
        .split(',')
        .map(campaign => campaign.trim())
        .filter(Boolean);
}

export async function resolveCampaignAccessFromSheet(password: string): Promise<CampaignAccess | null> {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) return null;

    if (trimmedPassword === process.env.LOGIN_KEY) {
        return { allowedCampaigns: [ALL_CAMPAIGNS] };
    }

    const envAccess = resolveCampaignAccess(trimmedPassword);
    if (envAccess) return envAccess;

    const rows = await loadSheetData(ACCESS_CONTROL_SHEET, { cache: 'no-store' });
    for (const row of rows) {
        const key = getRowValue(row, ['key', 'Key', 'login_key', 'ログインキー']);
        if (key !== trimmedPassword) continue;

        const status = getRowValue(row, ['status', 'Status', '状態']).toLowerCase();
        if (status && status !== 'active') return null;

        const allowedProjects = getRowValue(row, ['allowed_projects', 'allowed_campaigns', 'projects', '案件']);
        const allowedCampaigns = parseAllowedCampaigns(allowedProjects);
        if (allowedCampaigns.length === 0) return null;

        return { allowedCampaigns };
    }

    return null;
}

function getBaseCampaignName(campaignName: string): string {
    return campaignName.split('_')[0].trim();
}

export function isCampaignAllowed(campaignName: string, allowedCampaigns: string[] | undefined): boolean {
    if (isAllCampaignsAllowed(allowedCampaigns)) return true;

    const baseCampaignName = getBaseCampaignName(campaignName);
    return allowedCampaigns!.some(allowed => {
        const baseAllowed = getBaseCampaignName(allowed);
        return campaignName === allowed || baseCampaignName === baseAllowed;
    });
}

export function filterProcessedDataByAccess(data: ProcessedRow[], allowedCampaigns: string[] | undefined): ProcessedRow[] {
    if (isAllCampaignsAllowed(allowedCampaigns)) return data;
    return data.filter(row => isCampaignAllowed(row.Campaign_Name, allowedCampaigns));
}

export function filterProjectNamesByAccess(projectNames: string[], allowedCampaigns: string[] | undefined): string[] {
    if (isAllCampaignsAllowed(allowedCampaigns)) return projectNames;
    return projectNames.filter(projectName => isCampaignAllowed(projectName, allowedCampaigns));
}

export function filterCreativeMasterByAccess(items: CreativeMasterItem[], allowedCampaigns: string[] | undefined): CreativeMasterItem[] {
    if (isAllCampaignsAllowed(allowedCampaigns)) return items;
    return items.filter(item => isCampaignAllowed(item.campaign, allowedCampaigns));
}

export function filterArticleMasterByAccess(items: Record<string, string>[], allowedCampaigns: string[] | undefined): Record<string, string>[] {
    if (isAllCampaignsAllowed(allowedCampaigns)) return items;

    return items.filter(item => {
        const campaignName = item['商材名'] || item['Project'] || item['Campaign'] || item['商材'] || '';
        return campaignName ? isCampaignAllowed(campaignName, allowedCampaigns) : false;
    });
}
