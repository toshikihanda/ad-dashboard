import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { loadKnowledgeAndMasters } from '@/lib/googleSheets';
import { buildKnowledgeText, buildCreativeScriptsSummary, buildArticleManuscriptsSummary } from '@/lib/aiContextHelpers';

// --- In-memory cache for analysis results ---
const analysisCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// --- Prompt Builder ---
function buildPrompt(
    campaign: string,
    period: string,
    currentMetrics: Record<string, number>,
    baseline: Record<string, { lower: number; upper: number; median: number }>,
    rankingData: any[],
    trendData: any[],
    knowledgeText: string,
    creativeScriptsSummary: string,
    articleManuscriptsSummary: string
): string {
    return `
あなたは広告運用の専門コンサルタントAIです。
データを分析し、具体的な「次の打ち手」を提案してください。
**必ず以下で渡す「信頼ナレッジ」を参照し、その方針に沿って分析してください。**
**クリエイティブの台本・記事の原稿を踏まえ、「なぜこのクリエイティブ／記事が効いているか」を具体的に考察し、ネクストアクションを示してください。**

## 分析対象
- 商材: ${campaign}
- 分析期間: ${period}

## 信頼ナレッジ（必ず参照し、判断の頭脳として使ってください）
${knowledgeText}

## 該当商材のクリエイティブ台本（参考: なぜこのCRが効いているか考察に利用）
${creativeScriptsSummary}

## 該当商材の記事原稿（参考: 前半=FV詳細分析、以降=本文文字起こし。なぜこの記事が効いているか考察に利用）
${articleManuscriptsSummary}

## 基準値（過去の勝ち帯）
${JSON.stringify(baseline, null, 2)}

## 現在の数値（${period}の平均）
${JSON.stringify(currentMetrics, null, 2)}

## CPAランキング（記事×クリエイティブ別、直近7日）
${JSON.stringify(rankingData, null, 2)}

## トレンドデータ（週次比較）
${JSON.stringify(trendData, null, 2)}

## あなたの役割

1. **勝ちパターンを見つける**: CPAが良い組み合わせを特定し、**台本・原稿の内容を踏まえて**なぜ良いのか仮説を立てる
2. **危険信号を検知する**: CPAが悪化している組み合わせを警告する
3. **具体的な打ち手を提案する**: ナレッジと台本・原稿を反映した「〇〇を△△する」という形で具体的に
4. **継続/撤退/横展開の判断を示す**: 各組み合わせに対してアクションを提示

## 提案のルール

### 勝ちパターンがある場合
- 「この組み合わせを軸に予算を寄せましょう」
- 「この記事を別のクリエイティブでもテストしましょう」
- 「このクリエイティブを別の記事でも展開しましょう」

### CPAが悪化している場合
- 先週比 +30%以上 → 「クリエイティブの摩耗が疑われます。新しい訴求を追加しましょう」
- 先週比 +50%以上 → 「予算を縮小し、新しい組み合わせを優先しましょう」
- 先週比 +100%以上 → 「一旦停止を検討してください」

### CPAが改善している場合
- 先週比 -20%以上 → 「好調です。予算維持または増額を検討してください」
- 先週比 -30%以上 → 「横展開の候補です」

### 判断基準
- ✅ 継続: CPAが基準値内、または改善傾向
- ⚠️ 様子見: CPAが基準値をやや超えているが、CV数が少なく判断しづらい
- 🔴 撤退検討: CPAが基準値の1.5倍以上、かつ悪化傾向
- 🚀 横展開推奨: CPAが基準値以下、かつCV数が安定

## 出力フォーマット

### 【総評】
（2〜3文で現状サマリー）

### 【確度】High / Medium / Low
（理由）

### 【勝ちパターン】🏆
現在最もCPAが良い組み合わせ:
1位: {versionName} × {creative}（CPA X,XXX円、CV X件）
2位: ...
3位: ...
→ この組み合わせを軸に予算を寄せることを推奨

### 【トレンド警告】⚠️
以下の組み合わせでCPAが悪化傾向:
- {versionName} × {creative}: 先週 X,XXX円 → 今週 X,XXX円（+XX%）
  → クリエイティブの摩耗が疑われます

### 【好調トレンド】📈
以下の組み合わせでCPAが改善傾向:
- {versionName} × {creative}: 先週 X,XXX円 → 今週 X,XXX円（-XX%）
  → 引き続き予算を維持・増額を検討

### 【ボトルネック】
最も改善すべき指標とその理由

### 【次の打ち手】💡
1. 【最優先】{具体的なアクション}
   → {理由・期待効果}
2. 【推奨】{具体的なアクション}
   → {理由・期待効果}
3. 【検討】{具体的なアクション}
   → {理由・期待効果}

### 【判断】
- {versionName} × {creative}: ✅ 継続（好調）
- {versionName} × {creative}: ⚠️ 様子見（横ばい）
- {versionName} × {creative}: 🔴 撤退検討（悪化）
- {versionName} × {creative}: 🚀 横展開推奨（勝ちパターン）

---

コンサルタントとして、具体的かつ実行可能なアドバイスをお願いします。
曖昧な表現は避け、「〇〇を△△する」という形で提案してください。
`;
}

// Helper to sanitize log (mask sensitive info)
function sanitizeLog(data: any) {
    const str = JSON.stringify(data);
    return str.replace(/"(projectName|campaign)":"(.+?)"/g, '"$1":"***"');
}

// --- API Route Handler ---
export async function POST(request: NextRequest) {
    try {
        // Parse request
        const body = await request.json();
        const { campaign, period, currentMetrics, baseline, rankingData, trendData } = body;

        // 1. Cache Check
        const cacheKey = `${campaign}-${period}-${JSON.stringify(currentMetrics)}`;
        const cached = analysisCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return NextResponse.json({ analysis: cached.result, cached: true });
        }

        // 2. Data Validation
        if (!campaign || !currentMetrics) {
            return NextResponse.json(
                { error: '選択した期間のデータがありません' },
                { status: 400 }
            );
        }

        // 3. API Key Check
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'APIキーが設定されていません' },
                { status: 500 }
            );
        }

        // ランキング・トレンドに登場するクリエイティブID・バージョン名を抽出（台本・原稿で該当を先頭に含めるため）
        const priorityCreativeIds = new Set<string>();
        const priorityVersionNames = new Set<string>();
        for (const r of rankingData || []) {
            if (r?.creative && r.creative !== '(未設定)') priorityCreativeIds.add(String(r.creative).trim());
            if (r?.versionName && r.versionName !== '(未設定)') priorityVersionNames.add(String(r.versionName).trim());
        }
        for (const t of trendData || []) {
            if (t?.creative && t.creative !== '(未設定)') priorityCreativeIds.add(String(t.creative).trim());
            if (t?.versionName && t.versionName !== '(未設定)') priorityVersionNames.add(String(t.versionName).trim());
        }
        // 文字起こし済みの記事は常に原稿ブロックで先頭に含める（7.63等が抜けないように）
        const manuscriptAvailableVersions = ['2.46', '7.2', '7.63', '10.3', '11.3'];
        manuscriptAvailableVersions.forEach(v => priorityVersionNames.add(v));

        // 4. Load Knowledge + Creative_Master + Article_Master (every request)
        let knowledgeText = '（ナレッジを取得できませんでした）';
        let creativeScriptsSummary = '';
        let articleManuscriptsSummary = '';
        try {
            const { knowledge, creativeMaster, articleMaster } = await loadKnowledgeAndMasters();
            knowledgeText = buildKnowledgeText(knowledge);
            // 分析用は1件あたりの文字数・件数を抑え、プロンプト全体が上限を超えないようにする
            creativeScriptsSummary = buildCreativeScriptsSummary(creativeMaster, {
                campaign,
                priorityCreativeIds: [...priorityCreativeIds],
                maxPerScript: 1500,
                maxItems: 28,
            });
            articleManuscriptsSummary = buildArticleManuscriptsSummary(articleMaster, {
                campaign,
                priorityVersionNames: [...priorityVersionNames],
                maxPerManuscript: 2000,
                maxItems: 18,
            });
        } catch (e) {
            console.error('AI Analysis: loadKnowledgeAndMasters failed', (e as Error).message);
        }

        // 5. Prompt Construction & Length Check
        const prompt = buildPrompt(
            campaign,
            period,
            currentMetrics,
            baseline,
            rankingData || [],
            trendData || [],
            knowledgeText,
            creativeScriptsSummary,
            articleManuscriptsSummary
        );
        const PROMPT_MAX_CHARS = 120000;
        if (prompt.length > PROMPT_MAX_CHARS) {
            return NextResponse.json(
                { error: `入力データが多すぎます（${(prompt.length / 1000).toFixed(0)}k文字）。商材や期間を絞るか、しばらくして再試行してください。` },
                { status: 400 }
            );
        }

        // 6. Initialize Gemini with Timeout
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

        // Gemini timeout wrapper (AbortController might not be fully supported by SDK yet)
        const generateWithTimeout = async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        };

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 25000)
        );

        const text = await Promise.race([generateWithTimeout(), timeoutPromise]) as string;

        // 7. Save to Cache
        analysisCache.set(cacheKey, { result: text, timestamp: Date.now() });

        return NextResponse.json({ analysis: text });

    } catch (error: any) {
        if (error.message === 'TIMEOUT') {
            return NextResponse.json(
                { error: '分析がタイムアウトしました。母数を絞るか再度お試しください' },
                { status: 504 }
            );
        }
        // Do not log sensitive info
        console.error('AI Analysis error (sanitized):', error.message);
        return NextResponse.json(
            { error: '分析に失敗しました。再度お試しください' },
            { status: 500 }
        );
    }
}
