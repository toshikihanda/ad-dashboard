'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

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
}

interface KnowledgeCandidatesPanelProps {
  isDemo?: boolean;
}

export function KnowledgeCandidatesPanel({ isDemo }: KnowledgeCandidatesPanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    if (isDemo) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/knowledge-candidates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      });
      const data = await res.json();
      if (data.skipped) {
        setError(data.message);
      } else if (data.error) {
        setError(data.error);
      } else {
        await fetchCandidates();
      }
    } catch {
      setError('候補生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  };

  const handleReview = async (candidateId: string, decision: 'approve' | 'reject') => {
    setReviewingId(candidateId);
    try {
      const res = await fetch('/api/knowledge-candidates/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          decision,
          comment: reviewComments[candidateId] || '',
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        // 一覧を再取得
        await fetchCandidates();
      }
    } catch {
      setError('レビュー処理に失敗しました');
    } finally {
      setReviewingId(null);
    }
  };

  const formatCPA = (v: number) => v > 0 ? `${Math.round(v).toLocaleString()}円` : '-';
  const formatRatio = (v: number) => v > 0 ? `${(v * 100).toFixed(0)}%` : '-';

  const pendingCount = candidates.filter(c => c.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-800">ナレッジ候補</h2>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
              {pendingCount}件 未レビュー
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
            />
            全件表示
          </label>
          <button
            onClick={handleGenerate}
            disabled={generating || isDemo}
            className={cn(
              "px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all",
              isDemo
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            )}
          >
            {generating ? '生成中...' : '手動生成'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="text-xs text-gray-500 text-center py-8">読み込み中...</div>
      ) : candidates.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-8">
          候補がありません。「手動生成」で候補を作成できます。
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map(c => {
            const isExpanded = expandedId === c.id;
            const isReviewing = reviewingId === c.id;
            const ratioPercent = Math.round((c.cpa_ratio - 1) * 100);

            return (
              <div
                key={c.id}
                className={cn(
                  "border rounded-lg overflow-hidden transition-all",
                  c.status === 'approved' && 'border-green-200 bg-green-50/30',
                  c.status === 'rejected' && 'border-gray-200 bg-gray-50/50 opacity-60',
                  c.status === 'pending' && c.judge_type === 'good' && 'border-blue-200',
                  c.status === 'pending' && c.judge_type === 'bad' && 'border-red-200',
                )}
              >
                {/* 候補ヘッダー（クリックで展開） */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50/50 transition-colors"
                >
                  {/* 判定バッジ */}
                  <span className={cn(
                    "shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded",
                    c.judge_type === 'good' && 'bg-blue-100 text-blue-700',
                    c.judge_type === 'bad' && 'bg-red-100 text-red-700',
                    c.judge_type === 'hold' && 'bg-gray-100 text-gray-600',
                  )}>
                    {c.judge_type === 'good' ? '良化' : c.judge_type === 'bad' ? '悪化' : '保留'}
                  </span>

                  {/* ステータスバッジ */}
                  {c.status !== 'pending' && (
                    <span className={cn(
                      "shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded",
                      c.status === 'approved' && 'bg-green-100 text-green-700',
                      c.status === 'rejected' && 'bg-gray-100 text-gray-500',
                    )}>
                      {c.status === 'approved' ? '採用' : '不採用'}
                    </span>
                  )}

                  {/* 確度 */}
                  {c.confidence === 'low' && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-600 rounded">
                      低確度
                    </span>
                  )}

                  {/* キー情報 */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-800 truncate">
                      {c.version_name} × {c.creative}
                    </span>
                  </div>

                  {/* CPA 情報 */}
                  <div className="shrink-0 text-right">
                    <span className="text-[11px] text-gray-600">
                      CPA {formatCPA(c.cpa_current)}
                    </span>
                    <span className={cn(
                      "ml-1 text-[10px] font-medium",
                      ratioPercent <= -20 && 'text-blue-600',
                      ratioPercent >= 20 && 'text-red-600',
                      ratioPercent > -20 && ratioPercent < 20 && 'text-gray-500',
                    )}>
                      ({ratioPercent > 0 ? '+' : ''}{ratioPercent}%)
                    </span>
                  </div>

                  {/* 展開アイコン */}
                  <span className="shrink-0 text-gray-400 text-xs">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {/* 詳細パネル */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-100">
                    {/* 数値グリッド */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3">
                      <MetricCell label="CPA (current)" value={formatCPA(c.cpa_current)} />
                      <MetricCell label="CPA (baseline)" value={formatCPA(c.cpa_baseline)} />
                      <MetricCell label="CV (current)" value={String(c.cv_current)} />
                      <MetricCell label="CV (baseline)" value={String(c.cv_baseline)} />
                      <MetricCell label="CVR (current)" value={`${c.cvr_current}%`} />
                      <MetricCell label="CVR (baseline)" value={`${c.cvr_baseline}%`} />
                      <MetricCell label="CPA ratio" value={formatRatio(c.cpa_ratio)} />
                      <MetricCell label="作成日" value={c.created_at} />
                    </div>

                    {/* 要約 */}
                    {c.summary && (
                      <div>
                        <div className="text-[10px] font-medium text-gray-500 mb-1">要約</div>
                        <div className="text-xs text-gray-700 bg-gray-50 rounded p-2">{c.summary}</div>
                      </div>
                    )}

                    {/* 仮説 */}
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

                    {/* 証拠テキスト（折りたたみ） */}
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

                    {/* レビューUI（pending のみ） */}
                    {c.status === 'pending' && (
                      <div className="flex items-end gap-2 pt-2 border-t border-gray-100">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-500 block mb-1">コメント（任意）</label>
                          <input
                            type="text"
                            value={reviewComments[c.id] || ''}
                            onChange={e => setReviewComments(prev => ({ ...prev, [c.id]: e.target.value }))}
                            placeholder="レビューコメント..."
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300"
                          />
                        </div>
                        <button
                          onClick={() => handleReview(c.id, 'approve')}
                          disabled={isReviewing}
                          className="px-3 py-1.5 text-[11px] font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {isReviewing ? '...' : '採用'}
                        </button>
                        <button
                          onClick={() => handleReview(c.id, 'reject')}
                          disabled={isReviewing}
                          className="px-3 py-1.5 text-[11px] font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                        >
                          {isReviewing ? '...' : '不採用'}
                        </button>
                      </div>
                    )}

                    {/* レビュー済みコメント */}
                    {c.status !== 'pending' && c.review_comment && (
                      <div className="text-[11px] text-gray-500 italic pt-1">
                        コメント: {c.review_comment}
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

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded px-2 py-1.5">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-xs font-medium text-gray-800">{value}</div>
    </div>
  );
}
