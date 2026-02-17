// 共通テーブル列幅定義（RankingPanel と DataTable で統一）
export const columnWidths = {
    rank: 'w-[24px]',      // #列
    label: 'w-[110px]',    // 商材/記事×クリエイティブ
    date: 'w-[70px]',      // 日付（ベストデイのみ）
    cost: 'w-[75px]',      // 出稿金額
    revenue: 'w-[70px]',   // 売上
    profit: 'w-[70px]',    // 粗利
    recoveryRate: 'w-[55px]', // 回収率
    roas: 'w-[50px]',      // ROAS
    imp: 'w-[50px]',       // Imp
    clicks: 'w-[50px]',    // Clicks
    lpClick: 'w-[70px]',   // 商品LPクリック
    cv: 'w-[35px]',        // CV
    ctr: 'w-[45px]',       // CTR
    mcvr: 'w-[45px]',      // MCVR
    cvr: 'w-[45px]',       // CVR
    cpm: 'w-[60px]',       // CPM
    cpc: 'w-[60px]',       // CPC
    mcpa: 'w-[65px]',      // MCPA
    cpa: 'w-[70px]',       // CPA
    fvExit: 'w-[50px]',    // FV離脱
    svExit: 'w-[50px]',    // SV離脱
    totalExit: 'w-[55px]', // Total離脱
    pv: 'w-[55px]',        // PV
};

// 共通スタイルクラス
export const tableStyles = {
    thClass: "px-1.5 py-1 text-right text-[9px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50",
    tdClass: "px-1.5 py-1 text-right text-[9px] text-gray-700 whitespace-nowrap",
    rankThClass: "px-1 py-1 text-center text-[9px] font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20",
    rankTdClass: "px-1 py-1 text-center sticky left-0 bg-white z-10 text-[9px] text-gray-400",
    labelThClass: "px-1.5 py-1 text-left text-[9px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 sticky left-[24px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
    labelTdClass: "px-1.5 py-1 text-left text-[9px] text-gray-700 whitespace-nowrap sticky left-[24px] bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
};
