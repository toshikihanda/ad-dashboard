import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { loadKnowledgeAndMasters } from '@/lib/googleSheets';
import { buildKnowledgeText, buildCreativeScriptsSummary, buildArticleManuscriptsSummary } from '@/lib/aiContextHelpers';

const MAX_SCRIPT_CHAT = 1500;
const MAX_MANUSCRIPT_CHAT = 2500;

// --- System Prompt (context blocks injected below) ---
const SYSTEM_PROMPT_BASE = `
あなたは広告運用ダッシュボードのAIアシスタントです。
以下のデータと、信頼ナレッジ・クリエイティブの台本・記事の原稿を参照し、ユーザーの質問に日本語で回答してください。

## データの説明
提供されるデータは、Meta広告およびBeyond（LP）の実績データのサマリーです。
- 期間: 月次、または直近7日間など
- 指標: Cost(消化金額), Revenue(売上), Profit(粗利), CV(獲得数), CPA(獲得単価), ROAS(費用対効果)
- キャンペーン名: 商材名

## 回答のルール
1. **データに基づく**: 提供されたデータ数値に基づいて正確に回答してください。推測で数値を答えないでください。
2. **ナレッジ・台本・原稿を参照**: 信頼ナレッジを判断の頭脳として使い、「なぜこの記事が成果が出ているか」「なぜこのクリエイティブが効いているか」は台本・原稿の内容を踏まえて具体的に考察し、ネクストアクションを示してください。
3. **フォーマット**: 数値は読みやすくカンマ区切り（例: 1,234,567円）にし、必要に応じて単位（円、件、%）をつけてください。
4. **スタイル**: 丁寧かつ簡潔に。箇条書きを活用して見やすくしてください。
5. **知らないこと**: データにない情報は「データに含まれていないため分かりません」と答えてください。

## ユーザーからの質問に対して
- 「今月のSACの売上は？」 → 該当する月とキャンペーンのRevenueを回答。
- 「ROASが高い記事は？」 → 記事別データのTopランキングを参照し、原稿の内容も踏まえて考察。
- 「この記事の成果は？」「なぜこのクリエイティブが伸びている？」 → 数値に加え、台本・原稿を参照して具体的な考察とネクストアクションを述べる。
`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, dataContext } = body;

        // API Key Check
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'APIキーが設定されていません' },
                { status: 500 }
            );
        }

        // 毎回ナレッジ・台本・原稿を取得（キャッシュなし）
        let knowledgeBlock = '（ナレッジを取得できませんでした）';
        let creativeBlock = '';
        let articleBlock = '';
        try {
            const { knowledge, creativeMaster, articleMaster } = await loadKnowledgeAndMasters();
            knowledgeBlock = buildKnowledgeText(knowledge);
            creativeBlock = buildCreativeScriptsSummary(creativeMaster, { maxPerScript: MAX_SCRIPT_CHAT });
            articleBlock = buildArticleManuscriptsSummary(articleMaster, { maxPerManuscript: MAX_MANUSCRIPT_CHAT });
        } catch (e) {
            console.error('[Chat API] loadKnowledgeAndMasters failed', (e as Error).message);
        }

        // Construct Prompt
        const prompt = `
${SYSTEM_PROMPT_BASE}

## 信頼ナレッジ（判断の頭脳として必ず参照）
${knowledgeBlock}

## クリエイティブ台本（参考: なぜこのCRが効いているか考察に利用）
${creativeBlock}

## 記事原稿（参考: 前半=FV詳細分析、以降=本文文字起こし。なぜこの記事が効いているか考察に利用）
${articleBlock}

## 参照データ（数値サマリー）
${dataContext}

## ユーザーの質問
${message}
`;

        // Length Check
        console.log(`[Chat API] Prompt length: ${prompt.length} chars`);

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ reply: text });

    } catch (error: any) {
        console.error('Chat API Error Detail:', error);
        const errorMessage = error.message || 'AIからの応答取得に失敗しました。';
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
