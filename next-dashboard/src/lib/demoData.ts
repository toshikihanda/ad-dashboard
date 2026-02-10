
import { ProcessedRow, ProjectConfig } from './dataProcessor';

export function generateDemoData(): ProcessedRow[] {
    const campaigns = ['Demo_Campaign_A', 'Demo_Campaign_B', 'Demo_Campaign_C'];
    const data: ProcessedRow[] = [];
    const today = new Date();

    // 過去30日分のデータを生成
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);

        campaigns.forEach(campaign => {
            // Random base metrics
            const impressions = Math.floor(Math.random() * 5000) + 1000;
            const clicks = Math.floor(impressions * (Math.random() * 0.03 + 0.01)); // CTR 1-4%
            const cost = clicks * (Math.floor(Math.random() * 50) + 30); // CPC 30-80円
            const cv = Math.floor(clicks * (Math.random() * 0.05)); // CVR 0-5%

            const revenue = cv * 10000; // 単価10000円
            const profit = revenue - cost;

            // Meta Row
            const video3SecViews = Math.floor(impressions * 0.4);
            const videoCostPerView = video3SecViews > 0 ? Math.floor(cost / video3SecViews) : 0;

            data.push({
                Date: date,
                Campaign_Name: campaign,
                Media: 'Meta',
                Creative: `demo_creative_${Math.floor(Math.random() * 5)}`,
                Cost: cost,
                Impressions: impressions,
                Clicks: clicks,
                CV: cv, // Meta CV (Learning用)
                MCV: cv,
                PV: 0,
                FV_Exit: 0,
                SV_Exit: 0,
                Revenue: 0,
                Gross_Profit: 0,
                Video_3Sec_Views: video3SecViews,
                Cost_Per_Video_3Sec_View: videoCostPerView,
                beyond_page_name: '',
                version_name: '',
                creative_value: `bt00${Math.floor(Math.random() * 5)}_001`
            });

            // Beyond Row (同等の成果データ)
            const pv = Math.floor(clicks * 1.2); // Metaクリック < PV (LP直接流入など含む想定)
            const fvExit = Math.floor(pv * 0.4);
            const svExit = Math.floor((pv - fvExit) * 0.2);

            data.push({
                Date: date,
                Campaign_Name: campaign,
                Media: 'Beyond',
                Creative: `demo_param_bt00${Math.floor(Math.random() * 5)}_001`,
                Cost: cost, // 実際はBeyond行にCostを持たせるかはdataProcessor次第だが、集計ロジック上はMeta/Beyond分かれている
                Impressions: 0,
                Clicks: Math.floor(pv * 0.1), // 商品LP遷移
                CV: cv,
                MCV: 0,
                PV: pv,
                FV_Exit: fvExit,
                SV_Exit: svExit,
                Revenue: revenue,
                Gross_Profit: profit,
                Video_3Sec_Views: 0,
                Cost_Per_Video_3Sec_View: 0,
                beyond_page_name: `${campaign}_LP`,
                version_name: `Ver.${Math.floor(Math.random() * 3) + 1}`,
                creative_value: `bt00${Math.floor(Math.random() * 5)}_001`
            });
        });
    }

    return data.sort((a, b) => b.Date.getTime() - a.Date.getTime());
}

export function getDemoProjectNames(): string[] {
    return ['Demo_Campaign_A', 'Demo_Campaign_B', 'Demo_Campaign_C'];
}
