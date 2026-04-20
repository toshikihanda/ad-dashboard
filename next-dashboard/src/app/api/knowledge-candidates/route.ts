/**
 * GET /api/knowledge-candidates
 * pending 候補一覧を返す（UI用）。?all=true で全件返す。
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCandidates, loadPendingCandidates } from '@/lib/candidateSheets';
import { loadDataFromSheets, loadSheetData } from '@/lib/googleSheets';
import { processData } from '@/lib/dataProcessor';
import {
  findScriptForCreative,
  findManuscriptForVersion,
  inferCampaignNameForCombo,
  inferCampaignNameFromMasterSetting,
} from '@/lib/knowledgeCandidates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get('all') === 'true';

    const candidates = showAll
      ? await loadCandidates()
      : await loadPendingCandidates();

    const [masterSetting, creativeMaster, articleMaster, rawData] = await Promise.all([
      loadSheetData('Master_Setting'),
      loadSheetData('Creative_Master'),
      loadSheetData('Article_Master'),
      loadDataFromSheets(),
    ]);
    const processedData = processData(rawData);

    const enriched = candidates.map(c => {
      const resolvedCampaign =
        (c.campaign_name || '').trim() ||
        inferCampaignNameForCombo(c.version_name || '', c.creative || '', processedData) ||
        inferCampaignNameFromMasterSetting(
          c.version_name || '',
          c.creative || '',
          processedData,
          masterSetting
        ) ||
        '';
      const script = findScriptForCreative(
        creativeMaster,
        c.creative || '',
        resolvedCampaign,
        masterSetting
      );
      const article = findManuscriptForVersion(
        articleMaster,
        c.version_name || '',
        resolvedCampaign,
        masterSetting
      );
      return {
        ...c,
        campaign_name: resolvedCampaign,
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
