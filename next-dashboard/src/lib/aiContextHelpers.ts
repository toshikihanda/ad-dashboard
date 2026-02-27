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

/** Creative_Master: クリエイティブ名・ダッシュボード名と台本。campaign 指定時はその商材のみ、未指定時は全件（長さ制限付き） */
export function buildCreativeScriptsSummary(
    rows: Record<string, string>[],
    options: { campaign?: string; maxPerScript?: number }
): string {
    const { campaign, maxPerScript = MAX_SCRIPT_CHARS } = options;
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
    const lines: string[] = [];
    const limit = campaign ? filtered.length : Math.min(filtered.length, 40);
    for (let i = 0; i < limit; i++) {
        const row = filtered[i];
        const name = getCol(row, 'クリエイティブ名', 'Creative Name', 'ファイル名');
        const id = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID');
        const script = getCol(row, '台本', 'Script');
        const text = (script || '').slice(0, maxPerScript);
        if (text) lines.push(`### ${name || id || '（名前なし）'}\n台本:\n${text}${script.length > maxPerScript ? '\n…（省略）' : ''}`);
    }
    return lines.length ? lines.join('\n\n') : '（台本がありません）';
}

/** Article_Master: 記事名と原稿（F列）。前半=FV詳細分析、以降=本文文字起こし */
export function buildArticleManuscriptsSummary(
    rows: Record<string, string>[],
    options: { campaign?: string; maxPerManuscript?: number }
): string {
    const { campaign, maxPerManuscript = MAX_MANUSCRIPT_CHARS } = options;
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
    const lines: string[] = [];
    const limit = campaign ? filtered.length : Math.min(filtered.length, 25);
    for (let i = 0; i < limit; i++) {
        const row = filtered[i];
        const name = getCol(row, '記事名', 'Article Name', 'Subject');
        const manuscript = getCol(row, '原稿', 'Manuscript', 'Content', '文字起こし');
        const text = (manuscript || '').slice(0, maxPerManuscript);
        if (text) lines.push(`### ${name || '（名前なし）'}\n原稿（前半=FV詳細分析、以降=本文文字起こし）:\n${text}${manuscript.length > maxPerManuscript ? '\n…（省略）' : ''}`);
    }
    return lines.length ? lines.join('\n\n') : '（原稿がありません）';
}
