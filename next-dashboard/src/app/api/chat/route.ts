import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { loadKnowledgeAndMasters } from '@/lib/googleSheets';
import { buildKnowledgeText, buildCreativeScriptsSummary, buildArticleManuscriptsSummary } from '@/lib/aiContextHelpers';

const MAX_SCRIPT_CHAT = 1500;
const MAX_MANUSCRIPT_CHAT = 2500;

// --- System Prompt (context blocks injected below) ---
const SYSTEM_PROMPT_BASE = `
あなたは広告運用ダッシュボードのAIアシスタントです。
以下のデータと、信頼ナレッジ・クリエイティブの台本・記事の原稿を参照し、**ユーザーの質問にだけ**日本語で回答してください。

## 重要: 回答の仕方
- **質問に答える**: ユーザーが聞いたこと（例: 「7.63のファーストビューを教えて」「この記事のFVは？」）には、その内容だけを簡潔に答えてください。不要な考察・ネクストアクションは書かないでください。
- **分析・考察・ネクストアクション**: 「分析して」「考察して」「ネクストアクションを出して」などと**言われたときだけ**、台本・原稿とナレッジを踏まえて考察やネクストアクションを述べてください。
- **会話の続き**: 「会話履歴」に前のやりとりがあります。「なんでこの記事がいいの？」「その続きを教えて」などは、直前に話していた記事・クリエイティブ（例: 7.63）の文脈で答えてください。

## データの説明
提供されるデータは、Meta広告およびBeyond（LP）の実績データのサマリーです。
- 指標: Cost, Revenue, CV, CPA, ROAS など
- 信頼ナレッジ・台本・原稿は参照用に提供されます。質問されたときや「分析して」と言われたときに利用してください。

## その他のルール
- 数値はカンマ区切り（例: 1,234,567円）。データにない情報は「データに含まれていないため分かりません」と答える。
- 丁寧かつ簡潔に。聞かれたことに答えることを最優先にしてください。
`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, dataContext, history } = body;
        const conversationHistory = Array.isArray(history) ? history.slice(-12) : [];

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
            articleBlock = buildArticleManuscriptsSummary(articleMaster, {
                maxPerManuscript: MAX_MANUSCRIPT_CHAT,
                priorityVersionNames: ['2.46', '7.2', '7.63', '10.3', '11.3'],
            });
        } catch (e) {
            console.error('[Chat API] loadKnowledgeAndMasters failed', (e as Error).message);
        }

        const historyBlock = conversationHistory.length > 0
            ? conversationHistory.map((m: { role?: string; content?: string }) => {
                const role = m.role === 'user' ? 'ユーザー' : 'アシスタント';
                return `${role}: ${(m.content || '').trim()}`;
            }).join('\n\n')
            : '（なし）';

        // Construct Prompt
        const prompt = `
${SYSTEM_PROMPT_BASE}

## 信頼ナレッジ
${knowledgeBlock}

## クリエイティブ台本
${creativeBlock}

## 記事原稿（前半=FV詳細分析、以降=本文）
${articleBlock}

## 参照データ（数値サマリー）
${dataContext}

## 会話履歴（前のやりとり。続きの質問はこの文脈で答えること）
${historyBlock}

## 現在のユーザーの質問
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
