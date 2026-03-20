import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { loadKnowledgeAndMasters } from '@/lib/googleSheets';
import { buildKnowledgeText, buildCreativeScriptsSummary, buildArticleManuscriptsSummary } from '@/lib/aiContextHelpers';
import { parseCreativeMaster } from '@/lib/dataProcessor';

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

        // メッセージ/会話履歴からクリエイティブID候補を抽出（例: 212a, 218, bt054）
        const extractCreativeIds = (text: string): string[] => {
            if (!text) return [];
            const matches = text.match(/\b(?:bt\d+|\d{3}[a-z]?)\b/gi) || [];
            return matches.map(s => s.toLowerCase());
        };
        const priorityCreativeIds = new Set<string>();
        extractCreativeIds(String(message || '')).forEach(id => priorityCreativeIds.add(id));
        for (const h of conversationHistory) {
            extractCreativeIds(String(h?.content || '')).forEach(id => priorityCreativeIds.add(id));
        }

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

            // --- 台本質問は Creative_Master 全件から直接検索して即返答 ---
            const msg = String(message || '').trim();
            const wantsScript =
                /台本|script|セリフ|全文|読み上げ/.test(msg) &&
                !/分析|考察|改善|ネクストアクション/.test(msg);
            if (wantsScript) {
                const parsed = parseCreativeMaster(creativeMaster);
                const qNorm = msg.toLowerCase();
                const idMatches = qNorm.match(/\b(?:bt\d+|\d{3}[a-z]?)\b/gi) || [];
                const uniqueIds = [...new Set(idMatches.map(s => s.toLowerCase()))];

                // ID一致優先（creativeId / fileName）
                let matched = parsed.filter(item => {
                    const cid = (item.creativeId || '').toLowerCase();
                    const fname = (item.fileName || '').toLowerCase();
                    return uniqueIds.some(id => cid === id || fname.includes(id) || cid.includes(id));
                });

                // IDが取れない場合は文面包含でゆるく検索
                if (matched.length === 0) {
                    matched = parsed.filter(item => {
                        const cid = (item.creativeId || '').toLowerCase();
                        const fname = (item.fileName || '').toLowerCase();
                        return (cid && qNorm.includes(cid)) || (fname && qNorm.includes(fname));
                    });
                }

                // 台本があるもののみ
                matched = matched.filter(item => item.script && item.script.trim().length > 0);

                if (matched.length > 0) {
                    const top = matched.slice(0, 3); // 応答が長大化しすぎないよう上位3件
                    const blocks = top.map(item => {
                        const label = item.creativeId || item.fileName || '（ID不明）';
                        return `【${label}】\n${item.script}`;
                    });
                    return NextResponse.json({ reply: blocks.join('\n\n') });
                }
            }

            // --- 原稿質問は Article_Master 全件（F列優先）から直接検索して即返答 ---
            const wantsManuscript =
                /原稿|本文|FV|記事/.test(msg) &&
                !/分析|考察|改善|ネクストアクション/.test(msg);
            if (wantsManuscript) {
                // aiContextHelpers.ts と同じロジックで F列優先取得
                const getCol = (row: Record<string, string>, ...names: string[]) => {
                    for (const n of names) {
                        const v = row[n];
                        if (v !== undefined && v !== '') return String(v).trim();
                    }
                    return '';
                };
                const getManuscriptFromRow = (row: Record<string, string>) => {
                    const keys = Object.keys(row);
                    // F列固定優先
                    if (keys.length >= 6) {
                        const fVal = String(row[keys[5]] ?? '').trim();
                        if (fVal) return fVal;
                    }
                    // 互換ヘッダー
                    const exact = getCol(row, '原稿', '現行', 'Manuscript', 'Content', '文字起こし', 'FV詳細分析', '#FV詳細分析');
                    if (exact) return exact;
                    // ゆるいヘッダー探索
                    for (const k of keys) {
                        const kNorm = k.trim().toLowerCase();
                        if (
                            kNorm.includes('原稿') ||
                            kNorm.includes('現行') ||
                            kNorm.includes('manuscript') ||
                            kNorm.includes('fv') ||
                            kNorm.includes('詳細分析') ||
                            kNorm.includes('文字起こし')
                        ) {
                            const v = String(row[k] ?? '').trim();
                            if (v) return v;
                        }
                    }
                    return '';
                };

                // 質問から version 名候補（例: 7.63, 7.2, 2.46）を抽出
                const versionMatches = msg.match(/\b\d+(?:\.\d+)?\b/g) || [];
                const versionSet = new Set(versionMatches.map(v => v.trim()));

                type ArticleHit = { version: string; name: string; manuscript: string };
                let hits: ArticleHit[] = articleMaster
                    .map((row) => {
                        const version = getCol(row, 'ダッシュボード名', 'Dashboard Name', 'ID');
                        const name = getCol(row, '記事名', 'Article Name', 'タイトル');
                        const manuscript = getManuscriptFromRow(row);
                        return { version, name, manuscript };
                    })
                    .filter(x => !!x.manuscript);

                // まず version 一致で絞る
                if (versionSet.size > 0) {
                    const byVersion = hits.filter(x => x.version && [...versionSet].some(v => x.version === v || x.version.includes(v)));
                    if (byVersion.length > 0) hits = byVersion;
                } else {
                    // version が無い質問は、記事名包含で絞る
                    const qNorm = msg.toLowerCase();
                    const byName = hits.filter(x => x.name && qNorm.includes(x.name.toLowerCase()));
                    if (byName.length > 0) hits = byName;
                }

                if (hits.length > 0) {
                    const top = hits.slice(0, 3);
                    const blocks = top.map(x => {
                        const label = x.version || x.name || '（記事不明）';
                        return `【${label}】\n${x.manuscript}`;
                    });
                    return NextResponse.json({ reply: blocks.join('\n\n') });
                }
            }

            // 質問に含まれるクリエイティブIDを優先して台本を先頭に含める
            creativeBlock = buildCreativeScriptsSummary(creativeMaster, {
                maxPerScript: MAX_SCRIPT_CHAT,
                priorityCreativeIds: [...priorityCreativeIds],
                maxItems: 80,
            });
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
