import { PRESET_TAGS } from '@/constants/knowledgeTags';

const STORAGE_KEY = 'meta-dashboard-knowledge-items-v1';
export const MIN_RATING_FOR_CHAT_STORAGE_KEY = 'meta-dashboard-knowledge-min-rating-v1';

export type KnowledgeItem = {
    id: string;
    summary: string;
    /** 性別タグ */
    genderTags: string[];
    /** 年齢タグ */
    ageTags: string[];
    /** 商材名（マスタから選択 or 手入力） */
    productName: string;
    /** 全商材向けなら true（商材フィルタをスキップ） */
    isAllProducts: boolean;
    /** 星1〜5 */
    rating: number;
    /** プリセットタグ */
    presetTags: string[];
    createdAt: string;
    updatedAt: string;
};

export type KnowledgeFilterForPrompt = {
    /** 選択中の案件名など（商材マッチ用） */
    productHint?: string;
    /** 最低星（この値以上のみ採用）。未指定は全件 */
    minRating?: number;
};

function safeParse(raw: string | null): KnowledgeItem[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isKnowledgeItem);
    } catch {
        return [];
    }
}

function isKnowledgeItem(x: unknown): x is KnowledgeItem {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return (
        typeof o.id === 'string' &&
        typeof o.summary === 'string' &&
        Array.isArray(o.genderTags) &&
        Array.isArray(o.ageTags) &&
        typeof o.productName === 'string' &&
        typeof o.isAllProducts === 'boolean' &&
        typeof o.rating === 'number' &&
        Array.isArray(o.presetTags)
    );
}

export function loadKnowledgeItems(): KnowledgeItem[] {
    if (typeof window === 'undefined') return [];
    return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function saveKnowledgeItems(items: KnowledgeItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function upsertKnowledgeItem(item: KnowledgeItem): void {
    const items = loadKnowledgeItems();
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = item;
    else items.unshift(item);
    saveKnowledgeItems(items);
}

export function deleteKnowledgeItem(id: string): void {
    saveKnowledgeItems(loadKnowledgeItems().filter((i) => i.id !== id));
}

/** 商材名からジャンル名を推定（マスタの先頭一致） */
function genreFromProductName(productName: string, masterProjects: string[]): string | null {
    const t = productName.trim();
    if (!t) return null;
    const hit = masterProjects.find((p) => t.startsWith(p) || p.startsWith(t));
    return hit ?? null;
}

function normalize(s: string): string {
    return s.trim().toLowerCase();
}

/**
 * チャット用にフィルタしたナレッジ本文ブロックを返す。
 */
export function getKnowledgeTextForPrompt(
    masterProjects: string[],
    filter: KnowledgeFilterForPrompt
): string {
    const items = typeof window === 'undefined' ? [] : loadKnowledgeItems();
    if (items.length === 0) return '';

    const productHint = filter.productHint?.trim() ?? '';
    const genreHint = genreFromProductName(productHint, masterProjects);
    const minR = filter.minRating;

    const filtered = items.filter((it) => {
        if (minR != null && it.rating < minR) return false;
        if (it.isAllProducts) return true;
        const pname = it.productName.trim();
        if (!pname) return false;
        if (productHint && normalize(pname) === normalize(productHint)) return true;
        if (genreHint && normalize(pname) === normalize(genreHint)) return true;
        if (productHint && pname.includes(productHint)) return true;
        if (genreHint && pname.includes(genreHint)) return true;
        return false;
    });

    if (filtered.length === 0) return '';

    const lines = filtered.map((it) => {
        const tags = [
            ...it.genderTags,
            ...it.ageTags,
            ...it.presetTags.filter((t) => (PRESET_TAGS as readonly string[]).includes(t)),
        ];
        const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
        const star = '★'.repeat(Math.min(5, Math.max(1, it.rating)));
        const scope = it.isAllProducts ? '全商材' : it.productName || '商材指定';
        return `- (${star}) ${scope}${tagStr}\n  ${it.summary.trim()}`;
    });

    return ['【登録ナレッジ（参考）】', ...lines].join('\n');
}

/** AIチャット用: ナレッジ工房で保存した「最低星」設定（未設定なら undefined） */
export function getChatKnowledgeMinRating(): number | undefined {
    if (typeof window === 'undefined') return undefined;
    const raw = localStorage.getItem(MIN_RATING_FOR_CHAT_STORAGE_KEY);
    if (raw === null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}
