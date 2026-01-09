import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';
import { parseBaselineData } from '@/lib/aiAnalysis';
import DashboardClient from './DashboardClient';

export const revalidate = 300; // Revalidate every 5 minutes

export default async function Home() {
  const rawData = await loadDataFromSheets();
  const processedData = processData(rawData);
  const baselineData = parseBaselineData(rawData.Baseline);

  return (
    <main className="min-h-screen p-6">
      <DashboardClient initialData={processedData} baselineData={baselineData} />
    </main>
  );
}
