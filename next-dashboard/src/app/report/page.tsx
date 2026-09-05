// レポートページ（クライアント共有用）
// 売上・粗利・回収率・ROASなどの内部数値を表示しない
// URLを知っていればアクセス可能（認証なし）

import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData, getProjectNamesFromMasterSetting } from '@/lib/dataProcessor';
import { filterProcessedDataByAccess, filterProjectNamesByAccess, isAllCampaignsAllowed } from '@/lib/accessControl';
import { readSessionPayload } from '@/lib/session';
import ReportClient from './ReportClient';

export const revalidate = 300; // 5分ごとにデータを更新
export const dynamic = 'force-dynamic';

// ローディングコンポーネント
function ReportLoadingFallback() {
    return (
        <div className="min-h-screen p-6 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin text-4xl mb-4">📊</div>
                <p className="text-gray-600 font-medium">レポートを読み込み中...</p>
            </div>
        </div>
    );
}

export default async function ReportPage() {
    const cookieStore = await cookies();
    const authSession = cookieStore.get('auth_session')?.value;
    const access = authSession ? await readSessionPayload(authSession) : null;
    if (!access?.canViewFinancials || !isAllCampaignsAllowed(access.allowedCampaigns)) {
        redirect('/');
    }
    const allowedCampaigns = access?.allowedCampaigns ?? [];

    const rawData = await loadDataFromSheets();
    const processedData = filterProcessedDataByAccess(processData(rawData), allowedCampaigns);
    const masterProjects = filterProjectNamesByAccess(
        getProjectNamesFromMasterSetting(rawData.Master_Setting),
        allowedCampaigns
    );

    return (
        <main className="min-h-screen p-6">
            <Suspense fallback={<ReportLoadingFallback />}>
                <ReportClient
                    initialData={processedData}
                    masterProjects={masterProjects}
                />
            </Suspense>
        </main>
    );
}
