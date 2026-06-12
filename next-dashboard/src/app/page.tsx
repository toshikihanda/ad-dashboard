import { loadDataFromSheets } from '@/lib/googleSheets';
import { CreativeMasterItem, ProcessedRow, processData, getProjectNamesFromMasterSetting, parseCreativeMaster } from '@/lib/dataProcessor';
import { parseBaselineData } from '@/lib/aiAnalysis';
import { cookies } from 'next/headers';
import { readSessionPayload } from '@/lib/session';
import {
  filterArticleMasterByAccess,
  filterCreativeMasterByAccess,
  filterProcessedDataByAccess,
  filterProjectNamesByAccess,
  isAllCampaignsAllowed,
} from '@/lib/accessControl';
import DashboardClient from './DashboardClient';

import { generateDemoData, getDemoProjectNames } from '@/lib/demoData';

export const revalidate = 0; // Always fetch latest sheets data
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  // 推測されにくいトークンによる判定に変更
  const isDemo = params?.token === 'd3m0_v1ew_s3cret';

  let processedData: ProcessedRow[];
  let masterProjects: string[];
  let creativeMasterData: CreativeMasterItem[] = [];
  let articleMasterData: Record<string, string>[] = [];
  let reportListData: Record<string, string>[] = [];
  let baselineData = {};
  let canUseGlobalAssistant = true;

  if (isDemo) {
    processedData = generateDemoData();
    masterProjects = getDemoProjectNames();
    // Baseline data for demo can be empty or mocked if needed
  } else {
    const rawData = await loadDataFromSheets();
    const cookieStore = await cookies();
    const authSession = cookieStore.get('auth_session')?.value;
    const sessionPayload = authSession ? await readSessionPayload(authSession) : null;
    const allowedCampaigns = sessionPayload?.allowedCampaigns ?? ['*'];
    canUseGlobalAssistant = isAllCampaignsAllowed(allowedCampaigns);

    processedData = processData(rawData);
    baselineData = parseBaselineData(rawData.Baseline);
    masterProjects = getProjectNamesFromMasterSetting(rawData.Master_Setting);
    creativeMasterData = parseCreativeMaster(rawData.Creative_Master);
    articleMasterData = rawData.Article_Master || [];
    reportListData = rawData.Report_List || [];

    processedData = filterProcessedDataByAccess(processedData, allowedCampaigns);
    masterProjects = filterProjectNamesByAccess(masterProjects, allowedCampaigns);
    creativeMasterData = filterCreativeMasterByAccess(creativeMasterData, allowedCampaigns);
    articleMasterData = filterArticleMasterByAccess(articleMasterData, allowedCampaigns);
  }

  return (
    <main className="min-h-screen p-6">
      <DashboardClient
        initialData={processedData}
        baselineData={baselineData}
        masterProjects={masterProjects}
        creativeMasterData={creativeMasterData}
        articleMasterData={articleMasterData}
        reportListData={reportListData}
        isDemo={isDemo}
        canUseGlobalAssistant={canUseGlobalAssistant}
      />
    </main>
  );
}
