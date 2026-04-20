'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_AGE_OPTIONS, PRESET_TAGS } from '@/constants/knowledgeTags';
import {
    type KnowledgeItem,
    MIN_RATING_FOR_CHAT_STORAGE_KEY,
    deleteKnowledgeItem,
    loadKnowledgeItems,
    saveKnowledgeItems,
    upsertKnowledgeItem,
} from '@/lib/knowledgeStore';

const GENDER_OPTIONS = ['男性', '女性', 'その他'] as const;

function newId(): string {
    return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyForm(): Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'> {
    return {
        summary: '',
        genderTags: [],
        ageTags: [],
        productName: '',
        isAllProducts: false,
        rating: 3,
        presetTags: [],
    };
}

interface KnowledgeWorkbenchProps {
    masterProjects: string[];
}

export function KnowledgeWorkbench({ masterProjects }: KnowledgeWorkbenchProps) {
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(() => emptyForm());
    const [productInputMode, setProductInputMode] = useState<'select' | 'custom'>('select');
    const [customProduct, setCustomProduct] = useState('');
    const [minRatingForChat, setMinRatingForChat] = useState<number | ''>('');

    useEffect(() => {
        setItems(loadKnowledgeItems());
        if (typeof window !== 'undefined') {
            const raw = localStorage.getItem(MIN_RATING_FOR_CHAT_STORAGE_KEY);
            if (raw === '' || raw === null) setMinRatingForChat('');
            else {
                const n = Number(raw);
                setMinRatingForChat(Number.isFinite(n) ? n : '');
            }
        }
    }, []);

    const persistMinRating = useCallback((v: number | '') => {
        setMinRatingForChat(v);
        if (typeof window !== 'undefined') {
            if (v === '') localStorage.removeItem(MIN_RATING_FOR_CHAT_STORAGE_KEY);
            else localStorage.setItem(MIN_RATING_FOR_CHAT_STORAGE_KEY, String(v));
        }
    }, []);

    const resetForm = useCallback(() => {
        setEditingId(null);
        setForm(emptyForm());
        setProductInputMode('select');
        setCustomProduct('');
    }, []);

    const loadIntoForm = useCallback((it: KnowledgeItem) => {
        setEditingId(it.id);
        setForm({
            summary: it.summary,
            genderTags: [...it.genderTags],
            ageTags: [...it.ageTags],
            productName: it.productName,
            isAllProducts: it.isAllProducts,
            rating: it.rating,
            presetTags: [...it.presetTags],
        });
        const fromMaster = masterProjects.includes(it.productName);
        if (fromMaster) {
            setProductInputMode('select');
            setCustomProduct('');
        } else if (it.productName) {
            setProductInputMode('custom');
            setCustomProduct(it.productName);
        } else {
            setProductInputMode('select');
            setCustomProduct('');
        }
    }, [masterProjects]);

    const resolvedProductName = useMemo(() => {
        if (form.isAllProducts) return '';
        if (productInputMode === 'custom') return customProduct.trim();
        return form.productName.trim();
    }, [form.isAllProducts, form.productName, productInputMode, customProduct]);

    const handleSave = () => {
        const summary = form.summary.trim();
        if (!summary) {
            alert('要約を入力してください。');
            return;
        }
        if (!form.isAllProducts && !resolvedProductName) {
            alert('商材を選ぶか手入力するか、「全商材向け」にチェックを入れてください。');
            return;
        }

        const now = new Date().toISOString();
        const id = editingId ?? newId();
        const prev = items.find((i) => i.id === id);
        const item: KnowledgeItem = {
            id,
            summary,
            genderTags: [...form.genderTags],
            ageTags: [...form.ageTags],
            productName: form.isAllProducts ? '' : resolvedProductName,
            isAllProducts: form.isAllProducts,
            rating: Math.min(5, Math.max(1, Math.round(form.rating))),
            presetTags: [...form.presetTags],
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
        };
        upsertKnowledgeItem(item);
        setItems(loadKnowledgeItems());
        resetForm();
    };

    const handleDelete = (id: string) => {
        if (!confirm('このナレッジを削除しますか？')) return;
        deleteKnowledgeItem(id);
        setItems(loadKnowledgeItems());
        if (editingId === id) resetForm();
    };

    const toggleGender = (g: string) => {
        setForm((f) => ({
            ...f,
            genderTags: f.genderTags.includes(g) ? f.genderTags.filter((x) => x !== g) : [...f.genderTags, g],
        }));
    };

    const toggleAge = (a: string) => {
        setForm((f) => ({
            ...f,
            ageTags: f.ageTags.includes(a) ? f.ageTags.filter((x) => x !== a) : [...f.ageTags, a],
        }));
    };

    const togglePreset = (t: string) => {
        setForm((f) => ({
            ...f,
            presetTags: f.presetTags.includes(t) ? f.presetTags.filter((x) => x !== t) : [...f.presetTags, t],
        }));
    };

    const exportJson = () => {
        const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `knowledge-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const importJson = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result)) as unknown;
                if (!Array.isArray(parsed)) throw new Error('配列ではありません');
                const byId = new Map(loadKnowledgeItems().map((i) => [i.id, i]));
                for (const row of parsed) {
                    if (!row || typeof row !== 'object') continue;
                    const o = row as Record<string, unknown>;
                    if (typeof o.id !== 'string' || typeof o.summary !== 'string') continue;
                    if (!isKnowledgeItemLoose(o)) continue;
                    byId.set(o.id, o as KnowledgeItem);
                }
                saveKnowledgeItems([...byId.values()]);
                setItems(loadKnowledgeItems());
                alert('インポートしました（同一IDは上書きマージ）。');
            } catch {
                alert('JSON の読み込みに失敗しました。');
            }
        };
        reader.readAsText(file);
    };

    function isKnowledgeItemLoose(o: Record<string, unknown>): boolean {
        return (
            Array.isArray(o.genderTags) &&
            Array.isArray(o.ageTags) &&
            typeof o.productName === 'string' &&
            typeof o.isAllProducts === 'boolean' &&
            typeof o.rating === 'number' &&
            Array.isArray(o.presetTags)
        );
    }

    return (
        <div className="space-y-4 pb-8">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
                <p className="font-bold text-amber-900 mb-1">ナレッジ工房</p>
                <p className="text-amber-900/90 leading-relaxed">
                    登録したナレッジはブラウザの localStorage に保存されます。下部の AI チャットでは、ダッシュボードで選んだ商材に合うナレッジが参照用にプロンプトへ含まれます。
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-xs">
                <span className="font-bold text-gray-600">チャットに渡す最低星</span>
                <select
                    value={minRatingForChat === '' ? '' : String(minRatingForChat)}
                    onChange={(e) => {
                        const v = e.target.value;
                        persistMinRating(v === '' ? '' : Number(v));
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                >
                    <option value="">制限なし</option>
                    <option value="3">★3以上</option>
                    <option value="4">★4以上</option>
                    <option value="5">★5のみ</option>
                </select>
                <button
                    type="button"
                    onClick={exportJson}
                    className="ml-auto rounded bg-gray-100 px-2 py-1 font-bold text-gray-700 hover:bg-gray-200"
                >
                    JSON エクスポート
                </button>
                <label className="cursor-pointer rounded bg-gray-100 px-2 py-1 font-bold text-gray-700 hover:bg-gray-200">
                    JSON インポート
                    <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) importJson(f);
                            e.target.value = '';
                        }}
                    />
                </label>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                <h2 className="text-sm font-bold text-gray-800 border-b pb-2">{editingId ? 'ナレッジを編集' : '新規ナレッジ'}</h2>

                <label className="block space-y-1">
                    <span className="text-xs font-bold text-gray-500">要約</span>
                    <textarea
                        value={form.summary}
                        onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                        rows={4}
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="運用メモ・訴求のコツなど"
                    />
                </label>

                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <span className="text-xs font-bold text-gray-500 block mb-1">評価（1〜5）</span>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, rating: n }))}
                                    className={cn(
                                        'text-lg leading-none px-1 rounded transition-colors',
                                        form.rating >= n ? 'text-amber-500' : 'text-gray-300'
                                    )}
                                    aria-label={`星${n}`}
                                >
                                    ★
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.isAllProducts}
                            onChange={(e) => setForm((f) => ({ ...f, isAllProducts: e.target.checked }))}
                        />
                        <span className="font-medium text-gray-700">全商材向け</span>
                    </label>
                </div>

                {!form.isAllProducts && (
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500">商材</span>
                        <div className="flex flex-wrap gap-2 items-center">
                            <select
                                value={productInputMode}
                                onChange={(e) => setProductInputMode(e.target.value as 'select' | 'custom')}
                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                                <option value="select">マスタから選択</option>
                                <option value="custom">手入力</option>
                            </select>
                            {productInputMode === 'select' ? (
                                <select
                                    value={form.productName}
                                    onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                                    className="flex-1 min-w-[200px] rounded border border-gray-300 px-2 py-1 text-sm"
                                >
                                    <option value="">選択してください</option>
                                    {masterProjects.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={customProduct}
                                    onChange={(e) => setCustomProduct(e.target.value)}
                                    className="flex-1 min-w-[200px] rounded border border-gray-300 px-2 py-1 text-sm"
                                    placeholder="商材名"
                                />
                            )}
                        </div>
                    </div>
                )}

                <div>
                    <span className="text-xs font-bold text-gray-500 block mb-2">性別</span>
                    <div className="flex flex-wrap gap-2">
                        {GENDER_OPTIONS.map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => toggleGender(g)}
                                className={cn(
                                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                    form.genderTags.includes(g)
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                )}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <span className="text-xs font-bold text-gray-500 block mb-2">年齢</span>
                    <div className="flex flex-wrap gap-2">
                        {KNOWLEDGE_AGE_OPTIONS.map((a) => (
                            <button
                                key={a}
                                type="button"
                                onClick={() => toggleAge(a)}
                                className={cn(
                                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                    form.ageTags.includes(a)
                                        ? 'bg-teal-600 text-white border-teal-600'
                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                )}
                            >
                                {a}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <span className="text-xs font-bold text-gray-500 block mb-2">プリセットタグ</span>
                    <div className="flex flex-wrap gap-2">
                        {PRESET_TAGS.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => togglePreset(t)}
                                className={cn(
                                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                    form.presetTags.includes(t)
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
                    >
                        保存
                    </button>
                    {editingId && (
                        <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200">
                            キャンセル
                        </button>
                    )}
                </div>
            </div>

            <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">登録一覧（{items.length} 件）</h3>
                <div className="space-y-2">
                    {items.length === 0 && <p className="text-sm text-gray-500">まだ登録がありません。</p>}
                    {items.map((it) => (
                        <div
                            key={it.id}
                            className={cn(
                                'rounded-lg border p-3 text-sm',
                                editingId === it.id ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-white'
                            )}
                        >
                            <div className="flex flex-wrap justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-amber-500">{'★'.repeat(it.rating)}</span>
                                    <span className="text-xs font-bold text-gray-500">
                                        {it.isAllProducts ? '全商材' : it.productName || '—'}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => loadIntoForm(it)} className="text-xs font-bold text-blue-600 hover:underline">
                                        編集
                                    </button>
                                    <button type="button" onClick={() => handleDelete(it.id)} className="text-xs font-bold text-red-600 hover:underline">
                                        削除
                                    </button>
                                </div>
                            </div>
                            <p className="text-gray-800 whitespace-pre-wrap">{it.summary}</p>
                            {(it.genderTags.length > 0 || it.ageTags.length > 0 || it.presetTags.length > 0) && (
                                <p className="text-[10px] text-gray-500 mt-2">
                                    {[...it.genderTags, ...it.ageTags, ...it.presetTags].join(' / ')}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
