'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { SkippedNoEvidenceItem } from '@/lib/knowledgeCandidates';
import { KNOWLEDGE_AGE_OPTIONS, PRESET_TAGS } from '@/constants/knowledgeTags';
import { upsertKnowledgeItem, type KnowledgeItem } from '@/lib/knowledgeStore';

const GENDER_OPTIONS = ['男性', '女性', 'その他'] as const;

interface Candidate {
  id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  judge_type: 'good' | 'bad' | 'hold';
  confidence: 'low' | 'normal';
  version_name: string;
  creative: string;
  cpa_current: number;
  cpa_baseline: number;
  cpa_ratio: number;
  cv_current: number;
  cv_baseline: number;
  cvr_current: number;
  cvr_baseline: number;
  summary: string;
  hypothesis_good_points: string;
  hypothesis_bad_points: string;
  next_action: string;
  evidence_script_excerpt: string;
  evidence_article_excerpt: string;
  source_run_id: string;
  review_comment: string;
  campaign_name?: string;
  review_reason_code?: string;
  review_reason_text?: string;
}

interface KnowledgeCandidatesPanelProps {
  isDemo?: boolean;
  /** 商材マスタ（スコープ選択・チャット連携用） */
  masterProjects: string[];
}

function formatCreatedAt(raw: string): string {
  if (!raw) return '';
  const n = Number(raw);
  if (Number.isFinite(n) && n > 20000 && n < 80000 && String(raw).includes('.')) {
    const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
    if (!Number.isNaN(utc.getTime())) {
      return utc.toLocaleDateString('ja-JP');
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.replace('T', ' ').slice(0, 16);
  return raw;
}

export function KnowledgeCandidatesPanel({ isDemo, masterProjects }: KnowledgeCandidatesPanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [generateInfo, setGenerateInfo] = useState('');
  const [generateSkippedNoEvidence, setGenerateSkippedNoEvidence] = useState<
    SkippedNoEvidenceItem[] | null
  >(null);

  const [periodPreset, setPeriodPreset] = useState<'7d' | '30d' | 'custom'>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  /** 要約（編集可） */
  const [editedSummary, setEditedSummary] = useState<Record<string, string>>({});
  /** 星1〜5 */
  const [ratingById, setRatingById] = useState<Record<string, number>>({});
  /** 全商材向け */
  const [allProductsById, setAllProductsById] = useState<Record<string, boolean>>({});
  /** 商材スコープ（マスタ選択 or 手入力用の文字列） */
  const [productScopeById, setProductScopeById] = useState<Record<string, string>>({});
  const [productModeById, setProductModeById] = useState<Record<string, 'select' | 'custom'>>({});
  const [genderById, setGenderById] = useState<Record<string, string[]>>({});
  const [ageById, setAgeById] = useState<Record<string, string[]>>({});
  const [presetById, setPresetById] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setCustomStart(fmt(start));
    setCustomEnd(fmt(end));
  }, []);

  const ensureDraftFor = useCallback(
    (c: Candidate) => {
      setEditedSummary((prev) =>
        prev[c.id] !== undefined ? prev : { ...prev, [c.id]: c.summary || '' }
      );
      setRatingById((prev) => (prev[c.id] != null ? prev : { ...prev, [c.id]: 3 }));
      setAllProductsById((prev) =>
        prev[c.id] !== undefined ? prev : { ...prev, [c.id]: false }
      );
      const cn = (c.campaign_name || '').trim();
      setProductScopeById((prev) =>
        prev[c.id] !== undefined ? prev : { ...prev, [c.id]: cn }
      );
      setProductModeById((prev) => {
        if (prev[c.id]) return prev;
        const fromMaster = cn && masterProjects.includes(cn);
        return { ...prev, [c.id]: fromMaster ? 'select' : 'custom' };
      });
      setGenderById((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: [] }));
      setAgeById((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: [] }));
      setPresetById((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: [] }));
    },
    [masterProjects]
  );

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/knowledge-candidates?all=${showAll}`);
      const data = await res.json();
      if (data.candidates) {
        setCandidates(data.candidates);
      } else {
        setError(data.error || '取得に失敗しました');
      }
    } catch {
      setError('候補の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleClearAll = async () => {
    if (isDemo) return;
    if (!window.confirm('ナレッジ候補をすべて削除します。よろしいですか？')) return;
    setClearing(true);
    setError('');
    try {
      const res = await fetch('/api/knowledge-candidates/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        await fetchCandidates();
      }
    } catch {
      setError('削除に失敗しました');
    } finally {
      setClearing(false);
    }
  };

  const handleGenerate = async () => {
    if (isDemo) return;
    if (periodPreset === 'custom') {
      if (!customStart || !customEnd) {
        setError('カスタム期間では開始日・終了日を指定してください');
        return;
      }
      if (customStart > customEnd) {
        setError('開始日は終了日以前にしてください');
        return;
      }
    }
    setGenerating(true);
    setError('');
    setGenerateInfo('');
    setGenerateSkippedNoEvidence(null);
    try {
      const body: Record<string, unknown> = { manual: true };
      if (periodPreset === 'custom') {
        body.preset = 'custom';
        body.startDate = customStart;
        body.endDate = customEnd;
      } else {
        body.preset = periodPreset;
      }
      const res = await fetch('/api/knowledge-candidates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.skipped) {
        setError(data.message || 'スキップされました');
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      await fetchCandidates();
      if (data.message) {
        setGenerateInfo(data.message);
      }
      const skipped = data.skippedNoEvidenceDetail;
      if (Array.isArray(skipped) && skipped.length > 0) {
        setGenerateSkippedNoEvidence(skipped as SkippedNoEvidenceItem[]);
      }
    } catch {
      setError('候補生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  };

  const buildReviewReasonText = (
    r: number,
    allP: boolean,
    product: string,
    g: string[],
    a: string[],
    p: string[]
  ) => {
    const parts = [`星${r}`, allP ? '全商材' : `商材:${product || '—'}`];
    if (g.length) parts.push(`性別:${g.join('/')}`);
    if (a.length) parts.push(`年齢:${a.join('/')}`);
    if (p.length) parts.push(`タグ:${p.join('/')}`);
    return parts.join(' | ');
  };

  const handleReview = async (c: Candidate, decision: 'approve' | 'reject') => {
    if (decision === 'approve') {
      const sum = (editedSummary[c.id] ?? c.summary ?? '').trim();
      const r = ratingById[c.id] ?? 3;
      const allP = allProductsById[c.id] ?? false;
      let product =
        (productScopeById[c.id] ?? c.campaign_name ?? '').trim();
      if (!allP && !product) {
        setError('「この商材のみ」の場合は商材名を入力または選択してください。');
        return;
      }
      if (!sum) {
        setError('要約を入力してください。');
        return;
      }
      if (r < 1 || r > 5) {
        setError('星は1〜5で選んでください。');
        return;
      }
    }

    setReviewingId(c.id);
    setError('');
    try {
      const g = genderById[c.id] ?? [];
      const ag = ageById[c.id] ?? [];
      const pr = presetById[c.id] ?? [];
      const allP = allProductsById[c.id] ?? false;
      const product = (productScopeById[c.id] ?? c.campaign_name ?? '').trim();
      const r = ratingById[c.id] ?? 3;
      const sum = (editedSummary[c.id] ?? c.summary ?? '').trim();

      const res = await fetch('/api/knowledge-candidates/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: c.id,
          decision,
          comment: reviewComments[c.id] || '',
          reason_code: decision === 'approve' ? 'tag_review' : 'reject_manual',
          reason_text:
            decision === 'approve'
              ? buildReviewReasonText(r, allP, product, g, ag, pr)
              : reviewComments[c.id] || '不採用',
          summary_edited: sum,
          rating: decision === 'approve' ? r : undefined,
          is_all_products: decision === 'approve' ? allP : undefined,
          product_scope_name: decision === 'approve' && !allP ? product : '',
          gender_tags: decision === 'approve' ? g : [],
          age_tags: decision === 'approve' ? ag : [],
          preset_tags: decision === 'approve' ? pr : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || '処理に失敗しました');
        return;
      }

      if (decision === 'approve') {
        const item: KnowledgeItem = {
          id: `kc-${c.id}`,
          summary: sum,
          genderTags: [...g],
          ageTags: [...ag],
          productName: allP ? '' : product,
          isAllProducts: allP,
          rating: r,
          presetTags: [...pr],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        upsertKnowledgeItem(item);
      }

      await fetchCandidates();
    } catch {
      setError('レビュー処理に失敗しました');
    } finally {
      setReviewingId(null);
    }
  };

  const formatCPA = (v: number) => (v > 0 ? `${Math.round(v).toLocaleString()}円` : '-');
  const formatRatio = (v: number) => (v > 0 ? `${(v * 100).toFixed(0)}%` : '-');

  const pendingCount = candidates.filter((c) => c.status === 'pending').length;

  const toggleStr = (id: string, key: 'gender' | 'age' | 'preset', value: string) => {
    const map =
      key === 'gender' ? genderById : key === 'age' ? ageById : presetById;
    const setMap =
      key === 'gender' ? setGenderById : key === 'age' ? setAgeById : setPresetById;
    const cur = map[id] || [];
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    setMap((prev) => ({ ...prev, [id]: next }));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-3 text-[11px] text-gray-700 space-y-2">
        <p className="font-semibold text-gray-800">集計期間（手動生成のみ）</p>
        <p className="text-gray-500 leading-relaxed">
          自動でのナレッジ生成は行いません。下の期間で Beyond を集計し、
          <strong className="text-gray-700"> 記事（version）×クリエイティブ</strong> ごとに{' '}
          <strong className="text-gray-700">期間中のCV合計が2以上</strong>
          の組み合わせから候補を抽出し、台本・原稿とあわせてAIが提案します（上位最大15件）。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-500 shrink-0">プリセット:</span>
          {(['7d', '30d', 'custom'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodPreset(p)}
              className={cn(
                'px-2.5 py-1 rounded border text-[11px] font-medium transition-colors',
                periodPreset === p
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              )}
            >
              {p === '7d' ? '過去7日（今日含む）' : p === '30d' ? '過去30日（今日含む）' : '日付を指定'}
            </button>
          ))}
        </div>
        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-gray-600">
              開始
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-[11px]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-gray-600">
              終了
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-[11px]"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-800">ナレッジ候補</h2>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
              {pendingCount}件 未レビュー
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
            />
            全件表示
          </label>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing || generating || isDemo}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all border border-red-200',
              isDemo
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-red-600 hover:bg-red-50 disabled:opacity-50'
            )}
          >
            {clearing ? '削除中...' : '候補を全削除'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || clearing || isDemo}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all',
              isDemo
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
            )}
          >
            {generating ? '生成中...' : '手動生成'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
      )}
      {generateInfo && !error && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg space-y-2">
          <p className="whitespace-pre-wrap leading-relaxed">{generateInfo}</p>
          {generateSkippedNoEvidence && generateSkippedNoEvidence.length > 0 && (
            <div className="border-t border-amber-200/80 pt-2 mt-1">
              <p className="font-semibold text-amber-900 mb-1.5">
                数値では検出されたが、台本・原稿が無くナレッジに追加できなかった組み合わせ
              </p>
              <ul className="space-y-1.5">
                {generateSkippedNoEvidence.map((row, i) => (
                  <li
                    key={`${row.version_name}-${row.creative_value}-${i}`}
                    className="bg-white/60 rounded px-2 py-1.5 border border-amber-100/80"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        className={cn(
                          'shrink-0 px-1 py-0.5 text-[10px] font-bold rounded',
                          row.judge_type === 'good' && 'bg-blue-100 text-blue-800',
                          row.judge_type === 'bad' && 'bg-red-100 text-red-800',
                          row.judge_type === 'hold' && 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {row.judge_type === 'good' ? '良化' : row.judge_type === 'bad' ? '悪化' : '保留'}
                      </span>
                      <span className="font-medium text-gray-900">
                        {row.version_name} × {row.creative_value}
                      </span>
                      {row.campaign_name && (
                        <span className="text-[10px] text-gray-500">[{row.campaign_name}]</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5 pl-0.5">
                      CPA {row.cpa_current > 0 ? `${Math.round(row.cpa_current).toLocaleString()}円` : '-'}
                      <span className="ml-2">
                        変化{' '}
                        {row.cpa_baseline > 0
                          ? `${Math.round((row.cpa_ratio - 1) * 100) > 0 ? '+' : ''}${Math.round((row.cpa_ratio - 1) * 100)}%`
                          : '-'}
                      </span>
                      <span className="ml-2">直近CV {row.cv_current}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-gray-500 text-center py-8">読み込み中...</div>
      ) : candidates.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-8">
          候補がありません。「手動生成」で候補を作成できます。
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => {
            const isExpanded = expandedId === c.id;
            const isReviewing = reviewingId === c.id;
            const ratioPercent = Math.round((c.cpa_ratio - 1) * 100);

            return (
              <div
                key={c.id}
                className={cn(
                  'border rounded-lg overflow-hidden transition-all',
                  c.status === 'approved' && 'border-green-200 bg-green-50/30',
                  c.status === 'rejected' && 'border-gray-200 bg-gray-50/50 opacity-60',
                  c.status === 'pending' && c.judge_type === 'good' && 'border-blue-200',
                  c.status === 'pending' && c.judge_type === 'bad' && 'border-red-200'
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = isExpanded ? null : c.id;
                    setExpandedId(next);
                    if (next) ensureDraftFor(c);
                  }}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <span
                    className={cn(
                      'shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded',
                      c.judge_type === 'good' && 'bg-blue-100 text-blue-700',
                      c.judge_type === 'bad' && 'bg-red-100 text-red-700',
                      c.judge_type === 'hold' && 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {c.judge_type === 'good' ? '良化' : c.judge_type === 'bad' ? '悪化' : '保留'}
                  </span>

                  {c.status !== 'pending' && (
                    <span
                      className={cn(
                        'shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded',
                        c.status === 'approved' && 'bg-green-100 text-green-700',
                        c.status === 'rejected' && 'bg-gray-100 text-gray-500'
                      )}
                    >
                      {c.status === 'approved' ? '採用' : '不採用'}
                    </span>
                  )}

                  {c.confidence === 'low' && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-600 rounded">
                      低確度
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-amber-900 truncate">
                      商材: {c.campaign_name || '（データ上 商材名なし）'}
                    </div>
                    <span className="text-xs font-medium text-gray-800 truncate">
                      {c.version_name} × {c.creative}
                    </span>
                    {c.created_at && (
                      <span className="ml-1.5 text-[10px] text-gray-400">
                        {formatCreatedAt(c.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="text-[11px] text-gray-600">CPA {formatCPA(c.cpa_current)}</span>
                    <span
                      className={cn(
                        'ml-1 text-[10px] font-medium',
                        ratioPercent <= -20 && 'text-blue-600',
                        ratioPercent >= 20 && 'text-red-600',
                        ratioPercent > -20 && ratioPercent < 20 && 'text-gray-500'
                      )}
                    >
                      ({ratioPercent > 0 ? '+' : ''}
                      {ratioPercent}%)
                    </span>
                  </div>

                  <span className="shrink-0 text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-100">
                    <div className="pt-3 rounded-lg bg-amber-50/50 border border-amber-100 px-2 py-2 text-[11px] text-amber-950">
                      <span className="font-bold">商材名: </span>
                      {c.campaign_name || '—（スコープ欄で指定してください）'}
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-gray-600 block mb-1">要約（編集可）</label>
                      <textarea
                        value={editedSummary[c.id] ?? c.summary}
                        onChange={(e) =>
                          setEditedSummary((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        disabled={c.status !== 'pending'}
                        rows={4}
                        className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50"
                      />
                    </div>

                    {c.hypothesis_good_points && (
                      <div>
                        <div className="text-[10px] font-medium text-blue-600 mb-1">良い点</div>
                        <div className="text-xs text-gray-700 bg-blue-50/50 rounded p-2">{c.hypothesis_good_points}</div>
                      </div>
                    )}
                    {c.hypothesis_bad_points && (
                      <div>
                        <div className="text-[10px] font-medium text-red-600 mb-1">悪い点</div>
                        <div className="text-xs text-gray-700 bg-red-50/50 rounded p-2">{c.hypothesis_bad_points}</div>
                      </div>
                    )}
                    {c.next_action && (
                      <div>
                        <div className="text-[10px] font-medium text-green-600 mb-1">ネクストアクション</div>
                        <div className="text-xs text-gray-700 bg-green-50/50 rounded p-2">{c.next_action}</div>
                      </div>
                    )}

                    {(c.evidence_script_excerpt || c.evidence_article_excerpt) && (
                      <details className="group">
                        <summary className="text-[10px] font-medium text-gray-500 cursor-pointer hover:text-gray-700">
                          証拠テキストを表示
                        </summary>
                        <div className="mt-1 space-y-2">
                          {c.evidence_script_excerpt && (
                            <div>
                              <div className="text-[10px] text-gray-400">台本抜粋</div>
                              <div className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 max-h-24 overflow-y-auto">
                                {c.evidence_script_excerpt}
                              </div>
                            </div>
                          )}
                          {c.evidence_article_excerpt && (
                            <div>
                              <div className="text-[10px] text-gray-400">原稿抜粋</div>
                              <div className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 max-h-24 overflow-y-auto">
                                {c.evidence_article_excerpt}
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    {c.status === 'pending' && (
                      <div className="pt-2 border-t border-gray-100 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[10px] font-medium text-gray-600">評価（1〜5）</span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setRatingById((prev) => ({ ...prev, [c.id]: n }))}
                                className={cn(
                                  'text-lg leading-none px-0.5 rounded transition-colors',
                                  (ratingById[c.id] ?? 3) >= n ? 'text-amber-500' : 'text-gray-200'
                                )}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allProductsById[c.id] ?? false}
                            onChange={(e) =>
                              setAllProductsById((prev) => ({ ...prev, [c.id]: e.target.checked }))
                            }
                          />
                          <span className="font-medium text-gray-700">全商材で使える内容</span>
                        </label>

                        {!(allProductsById[c.id] ?? false) && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-medium text-gray-500">この商材のみ（スコープ）</span>
                            <div className="flex flex-wrap gap-2 items-center">
                              <select
                                value={productModeById[c.id] ?? 'select'}
                                onChange={(e) =>
                                  setProductModeById((prev) => ({
                                    ...prev,
                                    [c.id]: e.target.value as 'select' | 'custom',
                                  }))
                                }
                                className="text-[11px] border rounded px-2 py-1"
                              >
                                <option value="select">マスタから選択</option>
                                <option value="custom">手入力</option>
                              </select>
                              {(productModeById[c.id] ?? 'select') === 'select' ? (
                                <select
                                  value={productScopeById[c.id] ?? ''}
                                  onChange={(e) =>
                                    setProductScopeById((prev) => ({ ...prev, [c.id]: e.target.value }))
                                  }
                                  className="flex-1 min-w-[180px] text-[11px] border rounded px-2 py-1"
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
                                  value={productScopeById[c.id] ?? ''}
                                  onChange={(e) =>
                                    setProductScopeById((prev) => ({ ...prev, [c.id]: e.target.value }))
                                  }
                                  placeholder="商材名"
                                  className="flex-1 min-w-[180px] text-[11px] border rounded px-2 py-1"
                                />
                              )}
                            </div>
                          </div>
                        )}

                        <div>
                          <span className="text-[10px] font-medium text-gray-500 block mb-1">性別</span>
                          <div className="flex flex-wrap gap-1">
                            {GENDER_OPTIONS.map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => toggleStr(c.id, 'gender', g)}
                                className={cn(
                                  'px-2 py-0.5 text-[10px] rounded-full border',
                                  (genderById[c.id] || []).includes(g)
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white border-gray-200 text-gray-600'
                                )}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-medium text-gray-500 block mb-1">年齢</span>
                          <div className="flex flex-wrap gap-1">
                            {KNOWLEDGE_AGE_OPTIONS.map((a) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => toggleStr(c.id, 'age', a)}
                                className={cn(
                                  'px-2 py-0.5 text-[10px] rounded-full border',
                                  (ageById[c.id] || []).includes(a)
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-white border-gray-200 text-gray-600'
                                )}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-medium text-gray-500 block mb-1">タグ</span>
                          <div className="flex flex-wrap gap-1">
                            {PRESET_TAGS.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => toggleStr(c.id, 'preset', t)}
                                className={cn(
                                  'px-2 py-0.5 text-[10px] rounded-full border',
                                  (presetById[c.id] || []).includes(t)
                                    ? 'bg-violet-600 text-white border-violet-600'
                                    : 'bg-white border-gray-200 text-gray-600'
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-gray-500 block mb-1">コメント（任意）</label>
                          <input
                            type="text"
                            value={reviewComments[c.id] || ''}
                            onChange={(e) =>
                              setReviewComments((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            placeholder="レビューコメント..."
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReview(c, 'approve')}
                            disabled={isReviewing}
                            className="flex-1 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {isReviewing ? '...' : '採用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(c, 'reject')}
                            disabled={isReviewing}
                            className="flex-1 py-2 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                          >
                            {isReviewing ? '...' : '不採用'}
                          </button>
                        </div>
                      </div>
                    )}

                    {c.status !== 'pending' && (
                      <div className="text-[11px] text-gray-500 pt-1 space-y-0.5">
                        {c.review_reason_text && (
                          <div>
                            <span className="text-gray-400">記録: </span>
                            <span className="font-medium text-gray-700">{c.review_reason_text}</span>
                          </div>
                        )}
                        {c.review_comment && <div className="italic">コメント: {c.review_comment}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
