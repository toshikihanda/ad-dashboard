import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

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

// --- Types ---
interface AnalysisRequest {
    campaign: string;
    period: string;
    currentMetrics: Record<string, number>;
    baseline: Record<string, { lower: number; upper: number; median: number }>;
}

// --- Prompt Builder ---
function buildPrompt(
    campaign: string,
    period: string,
    currentMetrics: Record<string, number>,
    baseline: Record<string, { lower: number; upper: number; median: number }>
): string {
    return `
あなたは広告運用の専門家AIです。以下のデータを分析し、運用改善の提案をしてください。

## 分析対象
- 商材: ${campaign}
- 分析期間: ${period}

## 基準値（過去の勝ち帯）
${JSON.stringify(baseline, null, 2)}

## 現在の数値（${period}の平均）
${JSON.stringify(currentMetrics, null, 2)}

## 判断ロジック（必ず従ってください）

${ANALYSIS_KNOWLEDGE}

## 出力フォーマット

以下の形式で回答してください：

### 【総評】
CV/CPA/CVRの状況を簡潔に（2〜3文）

### 【確度】High / Medium / Low
確度の理由（母数、ズレ、急変など）

### 【ボトルネック】
最も改善すべき指標とその理由

### 【根拠】
- 基準値との比較
- トレンドの解釈
- 複合的な原因分析

### 【提案】優先度順
1. 【緊急】〇〇
2. 【中期】〇〇
3. 【継続】〇〇

### 【確認事項】
必要に応じて確認すべき項目

---

専門的かつ具体的なアドバイスをお願いします。
`;
}

// --- API Route Handler ---
export async function POST(request: NextRequest) {
    try {
        // Check API key
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'APIキーが設定されていません' },
                { status: 500 }
            );
        }

        // Parse request
        const body: AnalysisRequest = await request.json();
        const { campaign, period, currentMetrics, baseline } = body;

        // Validate data
        if (!campaign || !currentMetrics) {
            return NextResponse.json(
                { error: '選択した期間のデータがありません' },
                { status: 400 }
            );
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

        // Build prompt and generate
        const prompt = buildPrompt(campaign, period, currentMetrics, baseline);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ analysis: text });

    } catch (error) {
        console.error('AI Analysis error:', error);
        return NextResponse.json(
            { error: '分析に失敗しました。再度お試しください' },
            { status: 500 }
        );
    }
}
