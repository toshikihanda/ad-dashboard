/**
 * POST /api/knowledge-candidates/review
 * 候補の採用/不採用を処理する。
 * approve 時は Knowledge シートにも転記する。
 * 改善C: reason_code / reason_text を受け取り Review_Reason_Log に記録する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateCandidateStatus, appendToKnowledge, appendReviewLog } from '@/lib/candidateSheets';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { candidate_id, decision, comment, reason_code, reason_text } = body;

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
    const updated = await updateCandidateStatus(
      candidate_id,
      status,
      comment || '',
      reason_code || '',
      reason_text || ''
    );

    if (!updated) {
      return NextResponse.json(
        { error: '指定された候補が見つかりません' },
        { status: 404 }
      );
    }

    // 改善C: 理由コードがある場合は Review_Reason_Log に記録
    if (reason_code) {
      try {
        await appendReviewLog(updated, status, reason_code, reason_text || '');
      } catch (e: any) {
        console.error('[KnowledgeCandidates] ReviewLog書き込みエラー:', e.message);
      }
    }

    // approve の場合は Knowledge シートに転記
    if (decision === 'approve') {
      try {
        await appendToKnowledge(updated);
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
      candidate: updated,
    });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] review エラー:', error.message);
    return NextResponse.json(
      { error: `レビュー処理に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }
}
