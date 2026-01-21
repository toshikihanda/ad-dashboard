import { NextResponse } from 'next/server';
import { loadDataFromSheets } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sheetsData = await loadDataFromSheets();

        // Get Master_Setting data
        const masterSetting = sheetsData.Master_Setting;

        // Get all project configs from Master_Setting (same logic as dataProcessor.ts)
        const allConfigs = masterSetting
            .filter(row => {
                const projectName = (row['管理用案件名'] || '').trim();
                return projectName !== '';
            })
            .map(row => ({
                projectName: (row['管理用案件名'] || '').trim(),
                metaKeyword: (row['Meta名'] || '').trim(),
                beyondKeyword: (row['Beyond名'] || '').trim(),
                type: (row['運用タイプ'] || '').trim(),
            }));

        // Get Beyond_History sample for different keywords
        const beyondHistory = sheetsData.Beyond_History;

        // Test matching for each config
        const matchingResults = allConfigs.map(config => {
            const matchingRows = beyondHistory.filter(row => {
                const beyondPageName = (row['beyond_page_name'] || '').trim();
                return config.beyondKeyword && beyondPageName && beyondPageName.includes(config.beyondKeyword);
            });
            return {
                projectName: config.projectName,
                beyondKeyword: config.beyondKeyword,
                matchingRowCount: matchingRows.length,
                sampleBeyondPageNames: [...new Set(matchingRows.slice(0, 5).map(r => r['beyond_page_name']))],
            };
        });

        // Find unique beyond_page_names in Beyond_History
        const uniqueBeyondPageNames = [...new Set(
            beyondHistory.map(row => (row['beyond_page_name'] || '').trim()).filter(n => n)
        )].slice(0, 20);

        // Check Master_Setting raw data
        const masterSettingRaw = masterSetting.slice(0, 10).map(row => ({
            '管理用案件名': row['管理用案件名'],
            'Meta名': row['Meta名'],
            'Beyond名': row['Beyond名'],
            '運用タイプ': row['運用タイプ'],
        }));

        return NextResponse.json({
            masterSettingRowCount: masterSetting.length,
            configsCount: allConfigs.length,
            allConfigs,
            matchingResults,
            beyondHistoryRowCount: beyondHistory.length,
            uniqueBeyondPageNamesSample: uniqueBeyondPageNames,
            masterSettingRawSample: masterSettingRaw,
            debugInfo: {
                masterSettingColumns: masterSetting[0] ? Object.keys(masterSetting[0]) : [],
                beyondHistoryColumns: beyondHistory[0] ? Object.keys(beyondHistory[0]).slice(0, 10) : [],
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Debug failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
