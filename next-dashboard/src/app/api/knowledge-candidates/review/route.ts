/**
 * POST /api/knowledge-candidates/review
 * 候補の採用/不採用を処理する。
 * approve 時は Knowledge シートにも転記する。
 * 採用時は要約の上書き・星・商材スコープ・タグを受け取る。
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  updateCandidateStatus,
  appendToKnowledge,
  appendReviewLog,
  loadCandidates,
  type KnowledgeAppendMeta,
} from '@/lib/candidateSheets';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      candidate_id,
      decision,
      comment,
      reason_code,
      reason_text,
      /** 編集後要約（採用時推奨） */
      summary_edited,
      /** 1〜5（採用時必須） */
      rating,
      is_all_products,
      product_scope_name,
      gender_tags,
      age_tags,
      preset_tags,
    } = body;

    if (!candidate_id || !decision) {
      return NextResponse.json(
        { error: 'candidate_id と decision は必須です' },
        { status: 400 }
      );
    }

    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { error: 'decision は approve または reject を指定してください' },
        { status: 400 }
      );
    }

    const status = decision === 'approve' ? 'approved' : 'rejected';

    const summaryOverride =
      typeof summary_edited === 'string' ? summary_edited.trim() : '';

    const all = await loadCandidates();
    const existing = all.find((c) => c.id === candidate_id);
    if (!existing) {
      return NextResponse.json(
        { error: '指定された候補が見つかりません' },
        { status: 404 }
      );
    }

    const finalSummary = summaryOverride || existing.summary;

    if (decision === 'approve') {
      const r = Number(rating);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return NextResponse.json(
          { error: '採用時は rating（1〜5）が必要です' },
          { status: 400 }
        );
      }
      if (!finalSummary) {
        return NextResponse.json({ error: '要約が空です' }, { status: 400 });
      }
    }

    const updated = await updateCandidateStatus(
      candidate_id,
      status,
      typeof comment === 'string' ? comment : '',
      typeof reason_code === 'string' ? reason_code : '',
      typeof reason_text === 'string' ? reason_text : '',
      summaryOverride || undefined
    );

    if (!updated) {
      return NextResponse.json(
        { error: '候補の更新に失敗しました' },
        { status: 500 }
      );
    }

    const logCode =
      typeof reason_code === 'string' && reason_code ? reason_code : 'tag_review';
    const logText =
      typeof reason_text === 'string' && reason_text
        ? reason_text
        : decision === 'reject' && typeof comment === 'string' && comment
          ? comment
          : decision === 'approve'
            ? 'タグ・星レビュー採用'
            : '不採用';

    try {
      await appendReviewLog(updated, status, logCode, logText);
    } catch (e: any) {
      console.error('[KnowledgeCandidates] ReviewLog書き込みエラー:', e.message);
    }

    if (decision === 'approve') {
      const r = Number(rating);
      const meta: KnowledgeAppendMeta = {
        summary: finalSummary,
        rating: Math.min(5, Math.max(1, Math.round(r))),
        isAllProducts: Boolean(is_all_products),
        productScopeName:
          typeof product_scope_name === 'string' ? product_scope_name.trim() : '',
        genderTags: Array.isArray(gender_tags)
          ? gender_tags.filter((x: unknown) => typeof x === 'string')
          : [],
        ageTags: Array.isArray(age_tags)
          ? age_tags.filter((x: unknown) => typeof x === 'string')
          : [],
        presetTags: Array.isArray(preset_tags)
          ? preset_tags.filter((x: unknown) => typeof x === 'string')
          : [],
      };

      try {
        await appendToKnowledge(updated, meta);
      } catch (e: any) {
        console.error('[KnowledgeCandidates] Knowledge転記エラー:', e.message);
        return NextResponse.json({
          message: 'ステータスは更新しましたが、Knowledge への転記に失敗しました',
          candidate: updated,
          knowledgeError: e.message,
        });
      }
    }

    return NextResponse.json({
      message: decision === 'approve' ? '候補を採用し、Knowledgeに追加しました' : '候補を不採用にしました',
      candidate: { ...updated, summary: finalSummary },
    });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] review エラー:', error.message);
    return NextResponse.json(
      { error: `レビュー処理に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }
}
