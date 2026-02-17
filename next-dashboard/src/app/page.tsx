import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData, getProjectNamesFromMasterSetting, parseCreativeMaster } from '@/lib/dataProcessor';
import { parseBaselineData } from '@/lib/aiAnalysis';
import DashboardClient from './DashboardClient';

import { generateDemoData, getDemoProjectNames } from '@/lib/demoData';

export const revalidate = 300; // Revalidate every 5 minutes
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  // 推測されにくいトークンによる判定に変更
  const isDemo = params?.token === 'd3m0_v1ew_s3cret';

  let processedData;
  let masterProjects;
  let creativeMasterData: any[] = [];
  let articleMasterData: any[] = [];
  let reportListData: any[] = [];
  let baselineData = {};

  if (isDemo) {
    processedData = generateDemoData();
    masterProjects = getDemoProjectNames();
    // Baseline data for demo can be empty or mocked if needed
  } else {
    const rawData = await loadDataFromSheets();
    processedData = processData(rawData);
    baselineData = parseBaselineData(rawData.Baseline);
    masterProjects = getProjectNamesFromMasterSetting(rawData.Master_Setting);
    creativeMasterData = parseCreativeMaster(rawData.Creative_Master);
    articleMasterData = rawData.Article_Master || [];
    reportListData = rawData.Report_List || [];
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
      />
    </main>
  );
}
