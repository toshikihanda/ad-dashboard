/**
 * GET /api/knowledge-candidates
 * pending 候補一覧を返す（UI用）。?all=true で全件返す。
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCandidates, loadPendingCandidates } from '@/lib/candidateSheets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get('all') === 'true';

    const candidates = showAll
      ? await loadCandidates()
      : await loadPendingCandidates();

    return NextResponse.json({ candidates });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] 一覧取得エラー:', error.message);
    return NextResponse.json(
      { error: '候補一覧の取得に失敗しました', candidates: [] },
      { status: 500 }
    );
  }
}
