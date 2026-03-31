/**
 * POST /api/knowledge-candidates/clear
 * Knowledge_Candidates シートのデータ行をすべて削除（ヘッダー行は残す）
 */

import { NextRequest, NextResponse } from 'next/server';
import { clearAllCandidates } from '@/lib/candidateSheets';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json().catch(() => ({}));
    const isAuthorized =
      (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) ||
      body?.manual === true;

    if (CRON_SECRET && !isAuthorized) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    await clearAllCandidates();

    return NextResponse.json({ ok: true, message: 'ナレッジ候補をすべて削除しました' });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] clear エラー:', error.message);
    return NextResponse.json(
      { error: `削除に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }
}
