// Debug API for investigating Meta data matching issues
import { NextResponse } from 'next/server';

const SHEET_ID = "14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU";

async function loadSheetData(sheetName: string): Promise<Record<string, string>[]> {
    const encodedName = encodeURIComponent(sheetName);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedName}`;

    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            return [];
        }
        const csvText = await response.text();
        return parseCSV(csvText);
    } catch {
        return [];
    }
}

function parseCSV(csvText: string): Record<string, string>[] {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]);

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        rows.push(row);
    }

    return rows;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());

    return result;
}

// Legacy mapping from dataProcessor.ts
const LEGACY_PRODUCT_MAPPING: Record<string, {
    accountNames: string[];
    folderNames: string[];
}> = {
    'SAC_成果': {
        accountNames: ['allattain01_SAC成果', 'allattain05_SAC成果（元予算）'],
        folderNames: ['【運用】SAC_成果'],
    },
    'SAC_予算': {
        accountNames: ['allattain05_SAC予算', 'allattain01_SAC予算（元成果）'],
        folderNames: ['【運用】SAC_予算'],
    },
    'ルーチェ_予算': {
        accountNames: ['allattain04_ルーチェ予算'],
        folderNames: ['【運用】ルーチェ_予算'],
    },
};

export async function GET() {
    const [metaLive, metaHistory, masterSetting] = await Promise.all([
        loadSheetData("Meta_Live"),
        loadSheetData("Meta_History"),
        loadSheetData("Master_Setting"),
    ]);

    // Parse Master_Setting
    const configs = masterSetting.map(row => ({
        projectName: (row['管理用案件名'] || '').trim(),
        metaKeyword: (row['Meta名'] || '').trim(),
        beyondKeyword: (row['Beyond名'] || '').trim(),
        type: (row['運用タイプ'] || '').trim(),
    })).filter(c => c.projectName);

    // Analyze Meta data
    const allMetaData = [...metaLive, ...metaHistory];

    // Group by unique Ad Name and Account Name combinations
    const uniqueAdNames = new Set<string>();
    const uniqueAccountNames = new Set<string>();

    allMetaData.forEach(row => {
        if (row['Ad Name']) uniqueAdNames.add(row['Ad Name']);
        if (row['Account Name']) uniqueAccountNames.add(row['Account Name']);
    });

    // Check which SAC_予算 data exists
    const sacYosanLegacy = LEGACY_PRODUCT_MAPPING['SAC_予算'];
    const sacYosanConfig = configs.find(c => c.projectName === 'SAC_予算');

    const matchedBySacYosanLegacy = allMetaData.filter(row => {
        const accountName = row['Account Name'] || '';
        return sacYosanLegacy.accountNames.some(name => accountName.includes(name));
    });

    const matchedBySacYosanNewKeyword = sacYosanConfig?.metaKeyword ?
        allMetaData.filter(row => {
            const adName = row['Ad Name'] || '';
            return adName.includes(sacYosanConfig.metaKeyword);
        }) : [];

    // Check all Ad Names containing "SAC" or "予算"
    const adNamesWithSAC = Array.from(uniqueAdNames).filter(name =>
        name.includes('SAC') || name.includes('予算')
    );

    const accountNamesWithSAC = Array.from(uniqueAccountNames).filter(name =>
        name.includes('SAC') || name.includes('予算') || name.includes('allattain')
    );

    return NextResponse.json({
        summary: {
            totalMetaRows: allMetaData.length,
            metaLiveRows: metaLive.length,
            metaHistoryRows: metaHistory.length,
            uniqueAdNamesCount: uniqueAdNames.size,
            uniqueAccountNamesCount: uniqueAccountNames.size,
        },
        masterSettingConfigs: configs,
        sacYosan: {
            legacyAccountNames: sacYosanLegacy.accountNames,
            newMetaKeyword: sacYosanConfig?.metaKeyword || '(not set)',
            matchedByLegacy: matchedBySacYosanLegacy.length,
            matchedByNewKeyword: matchedBySacYosanNewKeyword.length,
        },
        adNamesContainingSACOrYosan: adNamesWithSAC.slice(0, 20),
        accountNamesContainingSACOrAllattain: accountNamesWithSAC,
        sampleMetaRows: allMetaData.slice(0, 5).map(row => ({
            'Ad Name': row['Ad Name'],
            'Account Name': row['Account Name'],
            'Day': row['Day'],
            'Amount Spent': row['Amount Spent'],
        })),
    });
}
