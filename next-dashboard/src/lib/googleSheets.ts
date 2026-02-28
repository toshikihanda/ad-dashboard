// Google Sheets CSV Loader
// スプレッドシートのデータを「CSV形式で取得」＝Google の CSV エクスポート URL で
// 各シート（Meta_Live, Beyond_Live, Creative_Master, Article_Master, Knowledge 等）を
// テキストとして取得し、パースしてダッシュボード・AI分析・チャットで利用しています。
// GAS 等で書き込んだ原稿・台本・文字起こしもこの CSV 経由で読み込みます。

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
  Knowledge: Record<string, string>[];
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

/** APIルートからも呼べるよう export。シート名を指定してCSVで取得。 */
export async function loadSheetData(sheetName: string, options?: { cache?: RequestCache }): Promise<Record<string, string>[]> {
  const encodedName = encodeURIComponent(sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedName}&tq=${encodeURIComponent('SELECT * LIMIT 50000')}`;

  try {
    const response = await fetch(url, options?.cache !== undefined ? { cache: options.cache } : { next: { revalidate: 600, tags: ['sheets-data'] } });
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

/** セル内改行を含むCSVを論理行に分割（引用符内の改行は行区切りとみなさない） */
function splitCSVIntoRows(csvText: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') i++;
      if (current.trim()) rows.push(current);
      current = '';
    } else {
      if (char !== '\r') current += char;
    }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = splitCSVIntoRows(csvText);
  if (lines.length === 0) return [];

  // BOM除去（Google Sheets等のCSVで「台本」「原稿」等のヘッダーが一致しないのを防ぐ）
  const headerLine = lines[0].replace(/^\uFEFF/, '').trim();
  const headers = parseCSVLine(headerLine).map(h => h.trim());

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
  const [metaLive, metaHistory, beyondLive, beyondHistory, masterSetting, baseline, creativeMaster, articleMaster, reportList, knowledge] = await Promise.all([
    loadSheetData("Meta_Live"),
    loadSheetData("Meta_History"),
    loadSheetData("Beyond_Live"),
    loadSheetData("Beyond_History"),
    loadSheetData("Master_Setting"),
    loadSheetData("Baseline"),
    loadSheetData("Creative_Master"),
    loadSheetData("Article_Master"),
    loadSheetData("Report_List"),
    loadSheetData("Knowledge"),
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
    Report_List: reportList,
    Knowledge: knowledge,
  };
}

/** AI分析・チャット用: Knowledge / Creative_Master / Article_Master を毎回取得（キャッシュなし） */
export async function loadKnowledgeAndMasters(): Promise<{
  knowledge: Record<string, string>[];
  creativeMaster: Record<string, string>[];
  articleMaster: Record<string, string>[];
}> {
  const [knowledge, creativeMaster, articleMaster] = await Promise.all([
    loadSheetData("Knowledge", { cache: 'no-store' }),
    loadSheetData("Creative_Master", { cache: 'no-store' }),
    loadSheetData("Article_Master", { cache: 'no-store' }),
  ]);
  return { knowledge, creativeMaster, articleMaster };
}
