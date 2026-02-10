import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

// --- System Prompt ---
const SYSTEM_PROMPT = `
あなたは広告運用ダッシュボードのAIアシスタントです。
以下のデータを参照し、ユーザーの質問に日本語で回答してください。

## データの説明
提供されるデータは、Meta広告およびBeyond（LP）の実績データのサマリーです。
- 期間: 月次、または直近7日間など
- 指標: Cost(消化金額), Revenue(売上), Profit(粗利), CV(獲得数), CPA(獲得単価), ROAS(費用対効果)
- キャンペーン名: 商材名

## 回答のルール
1. **データに基づく**: 提供されたデータ数値に基づいて正確に回答してください。推測で数値を答えないでください。
2. **フォーマット**: 数値は読みやすくカンマ区切り（例: 1,234,567円）にし、必要に応じて単位（円、件、%）をつけてください。
3. **スタイル**: 丁寧かつ簡潔に。箇条書きを活用して見やすくしてください。
4. **分析**: 「なぜ良かったのか」「改善点は」などの質問には、データ傾向（CPAが低い、CVRが高い等）から論理的に考察を述べてください。定性的な情報（クリエイティブの内容など）が含まれている場合はそれも加味してください。
5. **知らないこと**: データにない情報は「データに含まれていないため分かりません」と答えてください。

## ユーザーからの質問に対して
- 「今月のSACの売上は？」 → 該当する月とキャンペーンのRevenueを回答。
- 「ROASが高い記事は？」 → 記事別データのTopランキングを参照して回答。

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

        // Construct Prompt
        // dataContext is expected to be a string or JSON string representing the summarized data
        const prompt = `
${SYSTEM_PROMPT}

## 参照データ
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
