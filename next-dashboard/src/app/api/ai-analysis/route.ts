import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

// --- In-memory cache for analysis results ---
const analysisCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// --- Knowledge for Analysis ---
const ANALYSIS_KNOWLEDGE = `
# 広告運用AI：判断ロジック

## 指標の評価方向
- CPM: 低い方が良い
- CTR: 高い方が良い
- CPC: 低い方が良い
- MCVR: 高い方が良い
- MCPA: 低い方が良い
- CVR: 高い方が良い
- CPA: 低い方が良い
- FV離脱率: 低い方が良い
- SV離脱率: 低い方が良い

## ボトルネック特定ルール
1. 各指標のズレ量を計算（現在値と基準値の差）
2. 最もズレが大きい指標をボトルネックとする
3. ただし、上流（Meta）の問題が下流（記事LP）に影響している可能性を考慮

## 確度の判定
- Low: CV < 10、または費用急変（±30%以上）、または整合性ズレ
- High: 母数OK、整合性OK、費用安定、ズレが明確
- それ以外: Medium

## 提案ルール
### CTRが低い場合
- クリエイティブの角度追加（UGC/レビュー）
- 冒頭強化（最初の1秒で結論）
- 型変更（動画↔静止画）

### CPMが高い場合
- ターゲット拡張
- 配置見直し
- クリエイティブ刷新

### MCVRが低い場合
- CTA回数・配置の見直し
- CTA文言の具体化
- 不安解消セクション追加

### CVRが低い場合（Meta・記事が正常な場合）
- 商品LP/オファー/フォームの確認を推奨
- 在庫/ページ速度/計測の確認

## 商材別の特徴
### SAC_成果
- CTR基準が高い（1.48%〜2.45%）
- CPM高騰をCTRでカバーできているかチェック
- CVが多い「爆発日」の条件を参考に

### SAC_予算
- CTR 1.5%以下は「不調」
- CPM 15,000円超えは要注意

### ルーチェ_予算
- 高単価商材、CV頻度が低い
- MCVR 18%以上が目標
- MCPA 4,000円以下なら静観可
`;

// --- Prompt Builder ---
function buildPrompt(
    campaign: string,
    period: string,
    currentMetrics: Record<string, number>,
    baseline: Record<string, { lower: number; upper: number; median: number }>,
    rankingData: any[],
    trendData: any[]
): string {
    return `
あなたは広告運用の専門コンサルタントAIです。
データを分析し、具体的な「次の打ち手」を提案してください。

## 分析対象
- 商材: ${campaign}
- 分析期間: ${period}

## 基準値（過去の勝ち帯）
${JSON.stringify(baseline, null, 2)}

## 現在の数値（${period}の平均）
${JSON.stringify(currentMetrics, null, 2)}

## CPAランキング（記事×クリエイティブ別、直近7日）
${JSON.stringify(rankingData, null, 2)}

## トレンドデータ（週次比較）
${JSON.stringify(trendData, null, 2)}

## 判断ロジック（必ず従ってください）

${ANALYSIS_KNOWLEDGE}

## あなたの役割

1. **勝ちパターンを見つける**: CPAが良い組み合わせを特定し、なぜ良いのか仮説を立てる
2. **危険信号を検知する**: CPAが悪化している組み合わせを警告する
3. **具体的な打ち手を提案する**: 「〇〇を△△する」という形で具体的に
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

        // 4. Prompt Construction & Length Check
        const prompt = buildPrompt(
            campaign,
            period,
            currentMetrics,
            baseline,
            rankingData || [],
            trendData || []
        );
        if (prompt.length > 15000) {
            return NextResponse.json(
                { error: '入力データが多すぎます' },
                { status: 400 }
            );
        }

        // 5. Initialize Gemini with Timeout
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

        // 6. Save to Cache
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
