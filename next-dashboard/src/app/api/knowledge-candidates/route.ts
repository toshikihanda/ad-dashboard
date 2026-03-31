/**
 * GET /api/knowledge-candidates
 * pending 候補一覧を返す（UI用）。?all=true で全件返す。
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCandidates, loadPendingCandidates } from '@/lib/candidateSheets';
import { loadSheetData } from '@/lib/googleSheets';
import { findScriptForCreative, findManuscriptForVersion } from '@/lib/knowledgeCandidates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get('all') === 'true';

    const candidates = showAll
      ? await loadCandidates()
      : await loadPendingCandidates();

    const [masterSetting, creativeMaster, articleMaster] = await Promise.all([
      loadSheetData('Master_Setting'),
      loadSheetData('Creative_Master'),
      loadSheetData('Article_Master'),
    ]);

    const enriched = candidates.map(c => {
      const script = findScriptForCreative(
        creativeMaster,
        c.creative || '',
        c.campaign_name,
        masterSetting
      );
      const article = findManuscriptForVersion(
        articleMaster,
        c.version_name || '',
        c.campaign_name,
        masterSetting
      );
      return {
        ...c,
        evidence_script_excerpt: script.slice(0, 500),
        evidence_article_excerpt: article.slice(0, 500),
      };
    });

    return NextResponse.json({ candidates: enriched });
  } catch (error: any) {
    console.error('[KnowledgeCandidates] 一覧取得エラー:', error.message);
    return NextResponse.json(
      { error: '候補一覧の取得に失敗しました', candidates: [] },
      { status: 500 }
    );
  }
}
