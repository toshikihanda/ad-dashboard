import { loadDataFromSheets } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';
import DashboardClient from './DashboardClient';

export const revalidate = 600; // Revalidate every 10 minutes

export default async function Home() {
  const rawData = await loadDataFromSheets();
  const processedData = processData(rawData);

  return (
    <main className="min-h-screen p-6">
      <DashboardClient initialData={processedData} />
    </main>
  );
}
