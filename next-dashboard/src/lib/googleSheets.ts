// Google Sheets CSV Loader
// Fetches data from publicly accessible Google Sheets as CSV

const SHEET_ID = "14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU";

export interface SheetData {
  Meta_Live: Record<string, string>[];
  Meta_History: Record<string, string>[];
  Beyond_Live: Record<string, string>[];
  Beyond_History: Record<string, string>[];
}

async function loadSheetData(sheetName: string): Promise<Record<string, string>[]> {
  const encodedName = encodeURIComponent(sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedName}`;
  
  try {
    const response = await fetch(url, { next: { revalidate: 600 } }); // Cache for 10 min
    if (!response.ok) {
      console.error(`Failed to load ${sheetName}: ${response.status}`);
      return [];
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error(`Failed to load ${sheetName}:`, error);
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
  const [metaLive, metaHistory, beyondLive, beyondHistory] = await Promise.all([
    loadSheetData("Meta_Live"),
    loadSheetData("Meta_History"),
    loadSheetData("Beyond_Live"),
    loadSheetData("Beyond_History"),
  ]);

  return {
    Meta_Live: metaLive,
    Meta_History: metaHistory,
    Beyond_Live: beyondLive,
    Beyond_History: beyondHistory,
  };
}
