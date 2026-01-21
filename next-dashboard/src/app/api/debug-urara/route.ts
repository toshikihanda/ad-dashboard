import { NextResponse } from 'next/server';
import { loadDataFromSheets } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sheetsData = await loadDataFromSheets();

        // Get Master_Setting data
        const masterSetting = sheetsData.Master_Setting;

        // Find URARA entry in Master_Setting
        const uraraConfig = masterSetting.find(row =>
            (row['管理用案件名'] || '').includes('URARA') ||
            (row['Beyond名'] || '').includes('URARA')
        );

        // Get Beyond_History sample for URARA
        const beyondHistory = sheetsData.Beyond_History;
        const uraraInBeyond = beyondHistory.filter(row => {
            const beyondPageName = (row['beyond_page_name'] || '').toLowerCase();
            return beyondPageName.includes('urara');
        }).slice(0, 5);

        // Get all project configs from Master_Setting
        const allConfigs = masterSetting
            .filter(row => row['管理用案件名'])
            .map(row => ({
                projectName: row['管理用案件名'],
                metaKeyword: row['Meta名'],
                beyondKeyword: row['Beyond名'],
                type: row['運用タイプ'],
            }));

        return NextResponse.json({
            masterSettingRowCount: masterSetting.length,
            allConfigs,
            uraraConfigFound: uraraConfig || 'NOT FOUND',
            beyondHistoryRowCount: beyondHistory.length,
            uraraInBeyondSample: uraraInBeyond.map(row => ({
                beyond_page_name: row['beyond_page_name'],
                date_jst: row['date_jst'],
                parameter: row['parameter'],
            })),
            debugInfo: {
                masterSettingColumns: masterSetting[0] ? Object.keys(masterSetting[0]) : [],
                beyondHistoryColumns: beyondHistory[0] ? Object.keys(beyondHistory[0]) : [],
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Debug failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
