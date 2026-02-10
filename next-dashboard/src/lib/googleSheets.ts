// Google Sheets CSV Loader
// Fetches data from publicly accessible Google Sheets as CSV

const SHEET_ID = "14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU";

export interface SheetData {
  Meta_Live: Record<string, string>[];
  Meta_History: Record<string, string>[];
  Beyond_Live: Record<string, string>[];
  Beyond_History: Record<string, string>[];
  Master_Setting: Record<string, string>[];
  Baseline: Record<string, string>[];
  Creative_Master: Record<string, string>[];
  Article_Master: Record<string, string>[];
  Report_List: Record<string, string>[];
}

// Sheet GID mapping (required for export endpoint which has no row limit)
// To get GID: Open spreadsheet, go to sheet, check URL for #gid=XXXXXXX
const SHEET_GIDS: Record<string, number> = {
  'Meta_Live': 0,           // Usually first sheet is gid=0
  'Meta_History': 0,        // Will be updated with actual GID
  'Beyond_Live': 0,         // Will be updated with actual GID
  'Beyond_History': 0,      // Will be updated with actual GID
  'Master_Setting': 0,      // Will be updated with actual GID
  'Baseline': 0,            // Will be updated with actual GID
  'Creative_Master': 0,     // Will be updated with actual GID
  'Article_Master': 0,      // Will be updated with actual GID
  'Report_List': 0,         // Will be updated with actual GID
};

async function loadSheetData(sheetName: string): Promise<Record<string, string>[]> {
  const encodedName = encodeURIComponent(sheetName);

  // Try export endpoint first (no row limit), fallback to gviz if GID not configured
  // For now, use gviz with higher limit query
  // Note: gviz/tq has a limit, so we use tq parameter to request more rows
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedName}&tq=${encodeURIComponent('SELECT * LIMIT 50000')}`;

  try {
    const response = await fetch(url, { next: { revalidate: 600, tags: ['sheets-data'] } }); // Cache for 10 min, tagged for revalidation
    if (!response.ok) {
      console.error(`Sheet fetch failed: ${response.status}`);
      return [];
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error(`Sheet fetch error reported`);
    return [];
  }
}

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // Parse header (handle quoted values)
  const headers = parseCSVLine(lines[0]);

  // Parse rows
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
        // Escaped quote
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

export async function loadDataFromSheets(): Promise<SheetData> {
  const [metaLive, metaHistory, beyondLive, beyondHistory, masterSetting, baseline, creativeMaster, articleMaster, reportList] = await Promise.all([
    loadSheetData("Meta_Live"),
    loadSheetData("Meta_History"),
    loadSheetData("Beyond_Live"),
    loadSheetData("Beyond_History"),
    loadSheetData("Master_Setting"),
    loadSheetData("Baseline"),
    loadSheetData("Creative_Master"),
    loadSheetData("Article_Master"),
    loadSheetData("Report_List"),
  ]);

  return {
    Meta_Live: metaLive,
    Meta_History: metaHistory,
    Beyond_Live: beyondLive,
    Beyond_History: beyondHistory,
    Master_Setting: masterSetting,
    Baseline: baseline,
    Creative_Master: creativeMaster,
    Article_Master: articleMaster,
    Report_List: reportList, // Map the last result
  };
}
