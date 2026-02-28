/**
 * AI分析・チャット用: ナレッジ・台本・原稿のテキスト化
 */

const MAX_SCRIPT_CHARS = 2500;
const MAX_MANUSCRIPT_CHARS = 3500;
const MAX_SCRIPT_CHARS_CHAT = 1500;
const MAX_MANUSCRIPT_CHARS_CHAT = 2500;

export function getCol(row: Record<string, string>, ...names: string[]): string {
    for (const n of names) {
        const v = row[n];
        if (v !== undefined && v !== '') return v;
    }
    return '';
}

/**
 * Creative_Master 列: 商材名, クリエイティブ名, ダッシュボード名, URL, サムネイル, フォルダ, 作成日, 台本（H列）
 */
function getScriptFromRow(row: Record<string, string>): string {
    const exact = getCol(row, '台本', 'Script');
    if (exact) return exact;
    const keys = Object.keys(row);
    for (const k of keys) {
        const kNorm = k.trim().toLowerCase();
        if (kNorm.includes('台本') || kNorm.includes('script')) return (row[k] ?? '').trim();
    }
    if (keys.length >= 8) {
        const hVal = (row[keys[7]] ?? '').trim();
        if (hVal) return hVal;
    }
    return '';
}

/**
 * Article_Master: 商材名, 記事名, ダッシュボード名, URL, PDF, 原稿（F列）。
 * 原稿はF列で固定取得。ヘッダーが音声入力で「現行」になっている場合も列名で対応。
 */
function getManuscriptFromRow(row: Record<string, string>): string {
    const keys = Object.keys(row);
    if (keys.length >= 6) {
        const fVal = (row[keys[5]] ?? '').trim();
        if (fVal) return fVal;
    }
    const exact = getCol(row, '原稿', '現行', 'Manuscript', 'Content', '文字起こし', 'FV詳細分析', '#FV詳細分析');
    if (exact) return exact;
    for (const k of keys) {
        const kNorm = k.trim().toLowerCase();
        if (kNorm.includes('原稿') || kNorm.includes('現行') || kNorm.includes('manuscript') || kNorm.includes('fv') || kNorm.includes('詳細分析') || kNorm.includes('文字起こし')) return (row[k] ?? '').trim();
    }
    if (keys.length >= 7) {
        const gVal = (row[keys[6]] ?? '').trim();
        if (gVal) return gVal;
    }
    if (keys.length >= 5) {
        const eVal = (row[keys[4]] ?? '').trim();
        if (eVal) return eVal;
    }
    return '';
}

/** Knowledgeシート: A=Category, B=Subcategory, C=具体的なナレッジ → テキスト化 */
export function buildKnowledgeText(rows: Record<string, string>[]): string {
    if (!rows?.length) return '（ナレッジシートにデータがありません）';
    const lines: string[] = [];
    for (const row of rows) {
        const cat = getCol(row, 'Category', 'カテゴリ', 'A');
        const sub = getCol(row, 'Subcategory', 'サブカテゴリ', 'B');
        const body = getCol(row, 'Knowledge', 'ナレッジ', 'C');
        if (!body) continue;
        if (cat || sub) lines.push(`## ${cat}${sub ? ' / ' + sub : ''}\n${body}`);
        else lines.push(body);
    }
    return lines.length ? lines.join('\n\n') : '（ナレッジシートに本文がありません）';
}

/** Creative_Master: クリエイティブ名・ダッシュボード名と台本。priorityCreativeIds 指定時は該当行を先頭に必ず含める */
export function buildCreativeScriptsSummary(
    rows: Record<string, string>[],
    options: { campaign?: string; maxPerScript?: number; priorityCreativeIds?: string[] }
): string {
    const { campaign, maxPerScript = MAX_SCRIPT_CHARS, priorityCreativeIds = [] } = options;
    if (!rows?.length) return '（クリエイティブマスターにデータがありません）';
    let filtered = rows;
    if (campaign?.trim()) {
        const campaignNorm = campaign.trim();
        filtered = rows.filter(row => {
            const c = getCol(row, '商材名', 'Project', 'Campaign', '商材').trim();
            return c === campaignNorm || c.includes(campaignNorm) || campaignNorm.includes(c);
        });
    }
    if (!filtered.length) return campaign ? `（商材「${campaign}」に紐づくクリエイティブがありません）` : '（台本データがありません）';

    const prioritySet = new Set(priorityCreativeIds.map(s => (s || '').trim()).filter(Boolean));
    const keyForRow = (row: Record<string, string>) =>
        getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID').trim() ||
        getCol(row, 'クリエイティブ名', 'Creative Name', 'ファイル名').trim();
    const isPriority = (row: Record<string, string>) => {
        const id = keyForRow(row);
        return id && (prioritySet.has(id) || [...prioritySet].some(p => id.includes(p) || p.includes(id)));
    };
    const priorityRows = filtered.filter(isPriority);
    const restRows = filtered.filter(row => !isPriority(row));
    const ordered = [...priorityRows, ...restRows];

    const lines: string[] = [];
    const limit = campaign ? ordered.length : Math.min(ordered.length, 40);
    for (let i = 0; i < limit; i++) {
        const row = ordered[i];
        const name = getCol(row, 'クリエイティブ名', 'Creative Name', 'ファイル名');
        const id = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID');
        const script = getScriptFromRow(row);
        const text = (script || '').slice(0, maxPerScript);
        const label = name || id || '（名前なし）';
        if (text) {
            lines.push(`### ${label}\n台本:\n${text}${script.length > maxPerScript ? '\n…（省略）' : ''}`);
        } else {
            lines.push(`### ${label}\n台本: （データに含まれていません）`);
        }
    }
    return lines.length ? lines.join('\n\n') : '（クリエイティブがありません）';
}

/** Article_Master: 記事名と原稿（F列）。priorityVersionNames 指定時は該当行を先頭に必ず含める（versionName＝ダッシュボード名） */
export function buildArticleManuscriptsSummary(
    rows: Record<string, string>[],
    options: { campaign?: string; maxPerManuscript?: number; priorityVersionNames?: string[] }
): string {
    const { campaign, maxPerManuscript = MAX_MANUSCRIPT_CHARS, priorityVersionNames = [] } = options;
    if (!rows?.length) return '（記事マスターにデータがありません）';
    let filtered = rows;
    if (campaign?.trim()) {
        const campaignNorm = campaign.trim();
        filtered = rows.filter(row => {
            const c = getCol(row, '商材名', 'Project', 'Campaign', '商材').trim();
            return c === campaignNorm || c.includes(campaignNorm) || campaignNorm.includes(c);
        });
    }
    if (!filtered.length) return campaign ? `（商材「${campaign}」に紐づく記事がありません）` : '（原稿データがありません）';

    const prioritySet = new Set(priorityVersionNames.map(s => (s || '').trim()).filter(Boolean));
    const keyForRow = (row: Record<string, string>) =>
        getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID').trim() ||
        getCol(row, '記事名', 'Article Name', 'Subject').trim();
    const isPriority = (row: Record<string, string>) => {
        const id = keyForRow(row);
        return id && (prioritySet.has(id) || [...prioritySet].some(p => id.includes(p) || p.includes(id)));
    };
    const priorityRows = filtered.filter(isPriority);
    const restRows = filtered.filter(row => !isPriority(row));
    const ordered = [...priorityRows, ...restRows];

    const lines: string[] = [];
    const limit = campaign ? ordered.length : Math.min(ordered.length, 25);
    for (let i = 0; i < limit; i++) {
        const row = ordered[i];
        const name = getCol(row, '記事名', 'Article Name', 'Subject');
        const manuscript = getManuscriptFromRow(row);
        const text = (manuscript || '').slice(0, maxPerManuscript);
        if (text) lines.push(`### ${name || '（名前なし）'}\n原稿（前半=FV詳細分析、以降=本文文字起こし）:\n${text}${manuscript.length > maxPerManuscript ? '\n…（省略）' : ''}`);
        else lines.push(`### ${name || '（名前なし）'}\n原稿: （データに含まれていません）`);
    }
    return lines.length ? lines.join('\n\n') : '（原稿がありません）';
}
