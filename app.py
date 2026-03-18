import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import google.generativeai as genai
import difflib

# Import custom modules
from data.loader import (
    load_data_from_sheets, 
    load_knowledge_data,
    get_knowledge_by_category,
    get_knowledge_categories,
    get_knowledge_subcategories,
    format_knowledge_for_ai
)
from data.processor import process_data, build_master_rules
from utils.styles import get_custom_css
from components.metrics import display_kpi_metrics
from components.charts import display_charts

# --- Page Config ---
st.set_page_config(
    page_title="運用分析用ダッシュボード",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"  # AI機能へのアクセスを容易に
)

# --- SEO: Noindex Setting ---
st.markdown("""
<meta name="robots" content="noindex, nofollow">
""", unsafe_allow_html=True)

# --- Apply Custom Styles ---
st.markdown(get_custom_css(), unsafe_allow_html=True)

# --- UI調整用CSS ---
st.markdown("""
<style>
    /* 上部の余白を削除 */
    .block-container {
        padding-top: 1rem;
        padding-bottom: 1rem;
    }
    
    /* ヘッダー下の余白を削除 */
    .stRadio > div {
        margin-bottom: 0;
    }
    
    /* セレクトボックスの余白を調整 */
    .stSelectbox {
        margin-bottom: 0.5rem;
    }
    
    .stSelectbox label {
        font-size: 12px;
        font-weight: 500;
        color: #6B7280;
        margin-bottom: 4px;
        line-height: 1.4;
    }
    
    /* セレクトボックスの入力フィールドの高さを取得してボタンに合わせる */
    .stSelectbox > div > div {
        height: 38.4px;
    }
    
    /* 日付入力の余白を調整 */
    .stDateInput {
        margin-bottom: 0.5rem;
    }
    
    .stDateInput label {
        font-size: 12px;
        font-weight: 500;
        color: #6B7280;
        margin-bottom: 4px;
        line-height: 1.4;
    }
    
    /* 日付入力フィールドの高さを調整 */
    .stDateInput > div > div {
        height: 38.4px;
    }
    
    /* ボタンエリアの垂直位置を調整 */
    div[data-testid="column"]:has(button) {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
    }
    
    /* メトリクスカード間の余白を調整 */
    [data-testid="metric-container"] {
        padding: 10px 15px;
    }
    
    /* セクション間の余白を調整 */
    .element-container {
        margin-bottom: 0.5rem;
    }
    
    /* ボタンの間隔を調整 */
    div[data-testid="column"] {
        gap: 4px;
    }
</style>
""", unsafe_allow_html=True)

# --- Authentication ---
def check_password():
    """Returns True if the user has entered the correct password."""
    
    # 認証済みの場合
    if st.session_state.get("password_correct", False):
        return True
    
    # ログインフォーム（中央配置）
    st.markdown("<br>" * 5, unsafe_allow_html=True)
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.markdown("### 🔐 ログイン")
        
        # デバッグ: Secrets読み込み確認（本番環境では削除）
        try:
            expected_user = st.secrets.get("auth", {}).get("username", "")
            expected_pass = st.secrets.get("auth", {}).get("password", "")
            
            if not expected_user or not expected_pass:
                st.warning("⚠️ Streamlit Cloud の「Settings > Secrets」で認証情報を設定してください")
                st.code("""[auth]
username = "info@allattain.co.jp"
password = "Allattain0301@"
""", language="toml")
        except Exception as e:
            st.error(f"Secrets読み込みエラー: {e}")
        
        with st.form("login_form"):
            username = st.text_input("ユーザー名（メールアドレス）", key="login_username")
            password = st.text_input("パスワード", type="password", key="login_password")
            submit = st.form_submit_button("ログイン", use_container_width=True)
            
            if submit:
                expected_user = st.secrets.get("auth", {}).get("username", "")
                expected_pass = st.secrets.get("auth", {}).get("password", "")
                
                if username == expected_user and password == expected_pass:
                    st.session_state["password_correct"] = True
                    st.rerun()
                else:
                    st.error("❌ ユーザー名またはパスワードが正しくありません")
    
    return False

def get_ai_response(user_message, knowledge_text, chat_history):
    """
    Gemini APIを使用してナレッジベースの回答を生成
    """
    try:
        # Gemini APIキーの取得（複数の場所から探す）
        api_key = st.secrets.get("gemini", {}).get("api_key", "")
        if not api_key:
            api_key = st.secrets.get("GEMINI_API_KEY", "")
        if not api_key:
            api_key = st.secrets.get("google", {}).get("api_key", "")
        
        if not api_key:
            return "⚠️ Gemini APIキーが設定されていません。Streamlit CloudのSecretsで設定してください。"
        
        # Gemini クライアントの初期化
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # プロンプトの構築
        system_prompt = f"""あなたはAllattainの広告運用アシスタントです。
以下のナレッジベースを参照して、広告運用に関する質問に回答してください。

ナレッジは実際の運用経験から得られた知見です。回答の際は：
1. ナレッジの内容を元に具体的かつ実践的なアドバイスを提供してください
2. 該当するナレッジがある場合は、そのカテゴリ/サブカテゴリを明示してください
3. ナレッジにない内容については、一般的な広告運用の知識で補完してください
4. 数値や具体例を含めて回答すると分かりやすくなります

【ナレッジベース】
{knowledge_text}

回答は日本語で、簡潔かつ実用的に行ってください。"""

        # チャット履歴をテキスト形式で構築
        history_text = ""
        for msg in chat_history[-10:]:
            role = "ユーザー" if msg["role"] == "user" else "アシスタント"
            history_text += f"{role}: {msg['content']}\n\n"
        
        # 完全なプロンプトを構築
        full_prompt = f"{system_prompt}\n\n【これまでの会話】\n{history_text}\n【新しい質問】\nユーザー: {user_message}\n\nアシスタント:"
        
        # API呼び出し
        response = model.generate_content(full_prompt)
        
        return response.text
    
    except Exception as e:
        return f"⚠️ エラーが発生しました: {str(e)}"


def render_ai_sidebar():
    """
    サイドバーにAIチャットボット機能を表示
    """
    with st.sidebar:
        st.markdown("### 🤖 AI アシスタント")
        st.caption("広告運用のナレッジを元にアドバイスします")
        
        # ナレッジデータの読み込み
        knowledge_df = load_knowledge_data()
        
        # ナレッジの統計表示
        if not knowledge_df.empty:
            st.info(f"📚 {len(knowledge_df)}件のナレッジを参照中")
        else:
            st.warning("ナレッジデータが読み込めませんでした")
            return
        
        st.markdown("---")
        
        # カテゴリフィルター（オプション）
        categories = ["All"] + get_knowledge_categories()
        selected_category = st.selectbox(
            "カテゴリで絞り込み（オプション）",
            options=categories,
            key="ai_category_filter"
        )
        
        # 絞り込んだナレッジを取得
        if selected_category != "All":
            filtered_knowledge = get_knowledge_by_category(category=selected_category)
            st.caption(f"選択カテゴリ: {len(filtered_knowledge)}件")
        else:
            filtered_knowledge = knowledge_df
        
        # ナレッジをAI用にフォーマット
        knowledge_text = format_knowledge_for_ai(filtered_knowledge, max_items=100)
        
        st.markdown("---")
        
        # チャット履歴の初期化
        if "ai_chat_history" not in st.session_state:
            st.session_state.ai_chat_history = []
        
        # チャット履歴の表示
        st.markdown("#### 💬 チャット")
        
        chat_container = st.container()
        with chat_container:
            for message in st.session_state.ai_chat_history:
                if message["role"] == "user":
                    st.markdown(f"**🧑 あなた:** {message['content']}")
                else:
                    st.markdown(f"**🤖 AI:** {message['content']}")
                st.markdown("---")
        
        # 入力フォーム
        with st.form(key="ai_chat_form", clear_on_submit=True):
            user_input = st.text_area(
                "質問を入力",
                placeholder="例: CTRを改善するにはどうすればいいですか？",
                height=100,
                key="ai_user_input"
            )
            
            col1, col2 = st.columns(2)
            with col1:
                submit_button = st.form_submit_button("📤 送信", use_container_width=True)
            with col2:
                clear_button = st.form_submit_button("🗑️ クリア", use_container_width=True)
        
        if submit_button and user_input.strip():
            # ユーザーメッセージを履歴に追加
            st.session_state.ai_chat_history.append({
                "role": "user",
                "content": user_input.strip()
            })
            
            # AI応答を生成
            with st.spinner("回答を生成中..."):
                ai_response = get_ai_response(
                    user_input.strip(),
                    knowledge_text,
                    st.session_state.ai_chat_history
                )
            
            # AI応答を履歴に追加
            st.session_state.ai_chat_history.append({
                "role": "assistant",
                "content": ai_response
            })
            
            st.rerun()
        
        if clear_button:
            st.session_state.ai_chat_history = []
            st.rerun()
        
        # クイックアクション（AI提案）
        st.markdown("---")
        st.markdown("#### ⚡ クイック提案")
        
        quick_actions = [
            ("📈 CPA改善のヒント", "CPAを改善するためのアドバイスを教えてください。"),
            ("🎨 クリエイティブ改善", "クリエイティブの改善ポイントを教えてください。"),
            ("📊 配信最適化", "Meta広告の配信を最適化するコツを教えてください。"),
            ("🎯 ターゲティング戦略", "効果的なターゲティング戦略について教えてください。"),
        ]
        
        for label, prompt in quick_actions:
            if st.button(label, key=f"quick_{label}", use_container_width=True):
                # クイックアクションを実行
                st.session_state.ai_chat_history.append({
                    "role": "user",
                    "content": prompt
                })
                
                with st.spinner("回答を生成中..."):
                    ai_response = get_ai_response(
                        prompt,
                        knowledge_text,
                        st.session_state.ai_chat_history
                    )
                
                st.session_state.ai_chat_history.append({
                    "role": "assistant",
                    "content": ai_response
                })
                
                st.rerun()


def main():
    # --- AI Sidebar ---
    render_ai_sidebar()
    
    # --- 1. Data Loading ---
    raw_data = load_data_from_sheets()
    df = process_data(raw_data)
    master_rules = build_master_rules(raw_data.get("Master_Setting", pd.DataFrame()))
    
    if df.empty:
        st.error("データの読み込みに失敗したか、対象データがありません。")
        return

    # --- 2. Header Area ---
    # 期間初期値: 当月1日 〜 今日
    today = datetime.now().date()
    first_day_of_month = today.replace(day=1)
    
    # ヘッダー部分（1行にすべて配置）
    header_col1, header_col2, header_col3, header_col4, header_col5, header_col6 = st.columns([1.2, 1.8, 1.3, 1.3, 1.3, 1.8])
    
    with header_col1:
        st.markdown("### 運用分析用")
    
    with header_col2:
        # タブを1行にまとめる（合計、Meta、Beyondを横並び）
        # ラベルの高さ分だけ下に配置するためのスペーサー
        st.markdown("<div style='height: 24px;'></div>", unsafe_allow_html=True)
        current_tab = st.session_state.get("media_tab", "合計")
        
        # ボタンを横並びに配置（間隔を調整）
        tab_col1, tab_col2, tab_col3 = st.columns([1, 1, 1])
        with tab_col1:
            is_selected = current_tab == "合計"
            button_type = "primary" if is_selected else "secondary"
            if st.button("合計", key="tab_total", use_container_width=True, type=button_type):
                st.session_state.media_tab = "合計"
                st.rerun()
        with tab_col2:
            is_selected = current_tab == "Meta"
            button_type = "primary" if is_selected else "secondary"
            if st.button("Meta", key="tab_meta", use_container_width=True, type=button_type):
                st.session_state.media_tab = "Meta"
                st.rerun()
        with tab_col3:
            is_selected = current_tab == "Beyond"
            button_type = "primary" if is_selected else "secondary"
            if st.button("Beyond", key="tab_beyond", use_container_width=True, type=button_type):
                st.session_state.media_tab = "Beyond"
                st.rerun()
        
        # 現在のタブを取得（セッション状態から）
        selected_tab = st.session_state.get("media_tab", "合計")
    
    # フィルタの選択肢を準備（タブに基づく）
    if selected_tab == "Meta":
        df_filter_source = df[df["Media"] == "Meta"]
    elif selected_tab == "Beyond":
        df_filter_source = df[df["Media"] == "Beyond"]
    else:
        df_filter_source = df # 合計
    
    all_campaigns = ["All"] + list(df_filter_source["Campaign_Name"].unique())
    
    # 記事 / クリエイティブ
    if selected_tab == "Beyond":
        all_articles = ["All"] + list(df_filter_source["Creative"].dropna().unique())
        all_creatives = ["All"]
    elif selected_tab == "Meta":
        all_articles = ["All"]
        all_creatives = ["All"] + list(df_filter_source["Creative"].dropna().unique())
    else:
        # 合計: 両方混ぜるか、あるいはフィルタしないか。
        all_articles = ["All"] + list(df[df["Media"]=="Beyond"]["Creative"].dropna().unique())
        all_creatives = ["All"] + list(df[df["Media"]=="Meta"]["Creative"].dropna().unique())
    
    with header_col3:
        selected_campaign = st.selectbox(
            "商品名",
            options=all_campaigns
        )
    
    with header_col4:
        selected_article = st.selectbox(
            "記事",
            options=all_articles,
            disabled=(selected_tab=="Meta")
        )
    
    with header_col5:
        selected_creative = st.selectbox(
            "クリエイティブ",
            options=all_creatives,
            disabled=(selected_tab=="Beyond")
        )
    
    with header_col6:
        date_range = st.date_input(
            "期間",
            value=(first_day_of_month, today)
        )

    # --- 5. Apply Filters ---
    # フィルタリングは df 全体に対して行う
    mask = pd.Series(True, index=df.index)
    
    # Date Filter
    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_d, end_d = date_range
        mask &= (df["Date"].dt.date >= start_d) & (df["Date"].dt.date <= end_d)
    
    # Campaign Filter
    if selected_campaign != "All":
        mask &= (df["Campaign_Name"] == selected_campaign)
        
    # Article Filter (Beyond Creative)
    if selected_article != "All":
        # Media=Beyond かつ Creative=selected_article の行を残す
        # ただし、Metaデータも残さないと「合計」で消えてしまう？
        # 「記事で絞り込む」ということは、その記事に関連するデータを見たい。
        # Metaデータには記事情報がないので、記事フィルタ時はMetaデータは除外されるべきか？
        # 通常、記事フィルタ＝Beyondの特定記事の成果を見たい、なのでMetaは0になるのが自然。
        mask &= ( (df["Media"] == "Beyond") & (df["Creative"] == selected_article) ) | ( (df["Media"] == "Meta") & (selected_tab == "合計") & (selected_article == "All") )
        # 修正: 上記は複雑。シンプルに:
        # 記事フィルタが選ばれたら、Creativeが一致するものだけ残す。
        # MetaデータはCreative(Ad Name)を持ってるが、記事名とは一致しないはず。
        # よって記事フィルタONならMetaデータは消える。
        mask &= (df["Creative"] == selected_article)

    # Creative Filter (Meta Creative)
    if selected_creative != "All":
        mask &= (df["Creative"] == selected_creative)
        
    df_filtered = df[mask]

    if df_filtered.empty:
        st.warning("データがありません")
        return

    # --- Unmapped 診断 ---
    def _normalize_text(value: object) -> str:
        if value is None or pd.isna(value):
            return ""
        s = str(value).replace("\u3000", " ")
        for ch in ["[", "]", "［", "］", "(", ")", "（", "）", "【", "】"]:
            s = s.replace(ch, "")
        return " ".join(s.split()).strip().lower()

    def _suggest_projects(text: object, tokens: list[tuple[str, str]], limit: int = 5) -> str:
        """
        マッチしなかった文字列に対して、近い Master token を推定表示。
        tokens: [(token_norm, project), ...]
        """
        s = _normalize_text(text)
        if not s or not tokens:
            return ""
        token_list = [t for t, _ in tokens if t]
        close = difflib.get_close_matches(s, token_list, n=limit, cutoff=0.15)
        if not close:
            return ""
        # token -> project の対応（同一tokenが複数案件に紐づくことは想定しない）
        token_to_project = {t: p for t, p in tokens}
        return " / ".join([f"{token_to_project.get(t, '')}({t})" for t in close])

    with st.expander("🧭 Unmapped診断（マスターに紐づかない行）", expanded=False):
        unmapped = df_filtered[df_filtered["Campaign_Name"] == "Unmapped"].copy()
        st.caption("Master_Setting の Meta名/Beyond名 にマッチせず、案件に紐づかなかった行の一覧です。")

        if unmapped.empty:
            st.success("この条件（期間/フィルタ）では Unmapped はありません。")
        else:
            st.warning(f"Unmapped 行数: {len(unmapped)}")

            meta_unmapped = unmapped[unmapped["Media"] == "Meta"].copy()
            beyond_unmapped = unmapped[unmapped["Media"] == "Beyond"].copy()

            meta_tokens = master_rules.get("meta_tokens", [])
            beyond_tokens = master_rules.get("beyond_tokens", [])

            if not meta_unmapped.empty:
                # 近い候補を推定表示
                meta_unmapped["マッチ対象（Campaign Name）"] = meta_unmapped.get("Campaign Name", "")
                meta_unmapped["推定候補（近いMaster）"] = meta_unmapped["マッチ対象（Campaign Name）"].apply(
                    lambda x: _suggest_projects(x, meta_tokens)
                )
                show_cols = [c for c in [
                    "Date", "Account Name", "Campaign Name", "Ad Set Name", "Creative", "Cost", "Impressions", "Clicks", "MCV",
                    "マッチ対象（Campaign Name）", "推定候補（近いMaster）"
                ] if c in meta_unmapped.columns]
                st.markdown("##### Meta Unmapped")
                st.dataframe(meta_unmapped[show_cols].sort_values("Date", ascending=False), use_container_width=True)

            if not beyond_unmapped.empty:
                beyond_unmapped["マッチ対象（beyond_page_name）"] = beyond_unmapped.get("beyond_page_name", "")
                beyond_unmapped["推定候補（近いMaster）"] = beyond_unmapped["マッチ対象（beyond_page_name）"].apply(
                    lambda x: _suggest_projects(x, beyond_tokens)
                )
                show_cols = [c for c in [
                    "Date", "beyond_page_name", "version_name", "Parameter", "Cost", "PV", "Clicks", "CV",
                    "マッチ対象（beyond_page_name）", "推定候補（近いMaster）"
                ] if c in beyond_unmapped.columns]
                st.markdown("##### Beyond Unmapped")
                st.dataframe(beyond_unmapped[show_cols].sort_values("Date", ascending=False), use_container_width=True)

    # --- 6. KPI Calculation & Display ---
    # タブごとのロジック分岐
    
    # データを分離
    df_meta = df_filtered[df_filtered["Media"] == "Meta"]
    df_beyond = df_filtered[df_filtered["Media"] == "Beyond"]
    
    # safe_divide関数をインポート
    from data.processor import safe_divide
    
    # --- デバッグ用: Beyondデータのフィルタ結果確認（開発中のみ） ---
    # コメントアウトを外すと表示されます
    # if True:  # 開発中は True、本番では False に変更
    #     # フィルタ前のBeyondデータを取得
    #     beyond_live = raw_data.get('Beyond_Live', pd.DataFrame())
    #     beyond_history = raw_data.get('Beyond_History', pd.DataFrame())
    #     if not beyond_live.empty or not beyond_history.empty:
    #         beyond_all = pd.concat([beyond_live, beyond_history], ignore_index=True)
    #         # folder_nameでフィルタ
    #         target_beyond_names = ['【運用】SAC_成果', '【運用】SAC_予算', '【運用】ルーチェ_予算']
    #         beyond_filtered_by_folder = beyond_all[beyond_all['folder_name'].isin(target_beyond_names)]
    #         # utm_creativeでフィルタ
    #         if 'parameter' in beyond_filtered_by_folder.columns:
    #             beyond_filtered_by_utm = beyond_filtered_by_folder[beyond_filtered_by_folder['parameter'].str.startswith('utm_creative=', na=False)]
    #         else:
    #             beyond_filtered_by_utm = pd.DataFrame()
    #         
    #         st.write(f"Beyondデータ（フィルタ前）: {len(beyond_all)}件")
    #         st.write(f"Beyondデータ（folder_name フィルタ後）: {len(beyond_filtered_by_folder)}件")
    #         st.write(f"Beyondデータ（utm_creative フィルタ後）: {len(beyond_filtered_by_utm)}件")
    #         st.write(f"Beyondデータ（最終フィルタ後）: {len(df_beyond)}件")
    #         if not beyond_filtered_by_utm.empty:
    #             st.write("フィルタ後のデータサンプル:")
    #             display_cols = ['date_jst', 'folder_name', 'parameter', 'cost', 'click', 'cv']
    #             available_cols = [col for col in display_cols if col in beyond_filtered_by_utm.columns]
    #             st.dataframe(beyond_filtered_by_utm[available_cols].head(10))
    
    # Master_Setting は processor 側で反映済み（Campaign_Name 正規化 / Beyond Revenue 計算 / Meta MCV列選択 など）

    if selected_tab == "合計":
        # --- 合計タブ ロジック ---
        # === Metaデータから取得する指標 ===
        impressions = df_meta["Impressions"].sum()
        meta_clicks = df_meta["Clicks"].sum()  # processor.pyで "Link Clicks" -> "Clicks" にリネーム済み
        meta_cost = df_meta["Cost"].sum()  # processor.pyで "Amount Spent" -> "Cost" にリネーム済み（CPM/CPC計算用）
        
        # === Beyondデータから取得する指標 ===
        # ※ utm_creative でフィルタ済みのデータを使用
        beyond_cost = df_beyond["Cost"].sum()      # ★ 出稿金額はBeyond
        beyond_pv = df_beyond["PV"].sum()          # PV
        beyond_clicks = df_beyond["Clicks"].sum()   # MCV（記事LP遷移）
        beyond_cv = df_beyond["CV"].sum()          # CV（購入）
        
        # === 率系（Rate）===
        # CTR: Metaで計算
        ctr = safe_divide(meta_clicks, impressions) * 100
        
        # MCVR: Beyondで計算（記事LPからの遷移率）
        mcvr = safe_divide(beyond_clicks, beyond_pv) * 100
        
        # CVR: Beyondで計算（購入率）
        cvr = safe_divide(beyond_cv, beyond_clicks) * 100
        
        # === コスト系（Cost）===
        # CPM: Metaで計算（広告効率）
        cpm = safe_divide(meta_cost, impressions) * 1000
        
        # CPC: Metaで計算（広告効率）
        cpc = safe_divide(meta_cost, meta_clicks)
        
        # MCPA: Beyondで計算
        mcpa = safe_divide(beyond_cost, beyond_clicks)
        
        # CPA: Beyondで計算
        cpa = safe_divide(beyond_cost, beyond_cv)
        
        # === 金額系（Revenue）===
        # 出稿金額: Beyondを使用（表示用）
        cost = beyond_cost
        
        # 売上: Beyond側で計算済みの Revenue を集計（Master_Setting に基づく）
        revenue = df_beyond["Revenue"].sum() if "Revenue" in df_beyond.columns else 0
        
        # 粗利
        profit = revenue - cost
        
        # 回収率（従来通り）
        recovery_rate = safe_divide(revenue, cost) * 100
        
        # ROAS（粗利ベース）
        roas = safe_divide(profit, revenue) * 100
        
        # === 小数点の処理 ===
        # パーセント系 → 小数点第1位まで
        ctr = round(ctr, 1)
        mcvr = round(mcvr, 1)
        cvr = round(cvr, 1)
        recovery_rate = round(recovery_rate, 1)
        roas = round(roas, 1)
        
        # 金額系 → 整数（小数点切り捨て）
        # NaNチェックを追加
        cost = int(cost) if not pd.isna(cost) else 0
        revenue = int(revenue) if not pd.isna(revenue) else 0
        profit = int(profit) if not pd.isna(profit) else 0
        cpm = int(cpm) if not pd.isna(cpm) else 0
        cpc = int(cpc) if not pd.isna(cpc) else 0
        mcpa = int(mcpa) if not pd.isna(mcpa) else 0
        cpa = int(cpa) if not pd.isna(cpa) else 0
        
        # 表示（順番を整理）
        display_kpi_cards_total(cost, revenue, profit, impressions, meta_clicks, beyond_clicks, beyond_cv, ctr, mcvr, cvr, cpm, cpc, mcpa, cpa)

    elif selected_tab == "Meta":
        # --- Metaタブ ロジック ---
        # Metaデータのみを使用。売上・粗利は表示しない。
        impressions = df_meta["Impressions"].sum()
        clicks = df_meta["Clicks"].sum()  # processor.pyで "Link Clicks" -> "Clicks" にリネーム済み
        cost = df_meta["Cost"].sum()  # processor.pyで "Amount Spent" -> "Cost" にリネーム済み
        cv = df_meta["MCV"].sum()  # processor.pyで "Results" -> "MCV" にリネーム済み（MetaのCV = MCV相当）
        
        ctr = safe_divide(clicks, impressions) * 100
        cpm = safe_divide(cost, impressions) * 1000
        cpc = safe_divide(cost, clicks)
        cpa = safe_divide(cost, cv)
        
        # === 小数点の処理 ===
        # パーセント系 → 小数点第1位まで
        ctr = round(ctr, 1)
        
        # 金額系 → 整数（小数点切り捨て）
        # NaNチェックを追加
        cost = int(cost) if not pd.isna(cost) else 0
        impressions = int(impressions) if not pd.isna(impressions) else 0
        clicks = int(clicks) if not pd.isna(clicks) else 0
        cv = int(cv) if not pd.isna(cv) else 0
        cpm = int(cpm) if not pd.isna(cpm) else 0
        cpc = int(cpc) if not pd.isna(cpc) else 0
        cpa = int(cpa) if not pd.isna(cpa) else 0
        
        display_kpi_cards_meta(cost, impressions, clicks, cv, ctr, cpm, cpc, cpa)

    elif selected_tab == "Beyond":
        # --- Beyondタブ ロジック ---
        # Beyondデータのみを使用（utm_creative でフィルタ済み）
        cost = df_beyond["Cost"].sum()
        pv = df_beyond["PV"].sum()
        clicks = df_beyond["Clicks"].sum()  # MCV（記事LP遷移）
        cv = df_beyond["CV"].sum()
        fv_exit = df_beyond["FV_Exit"].sum()
        sv_exit = df_beyond["SV_Exit"].sum()
        
        # 率
        cvr = safe_divide(cv, clicks) * 100
        mcvr = safe_divide(clicks, pv) * 100
        
        # コスト
        cpa = safe_divide(cost, cv)
        cpc = safe_divide(cost, clicks)
        
        # 離脱率
        fv_exit_rate = safe_divide(fv_exit, pv) * 100
        sv_exit_rate = safe_divide(sv_exit, (pv - fv_exit)) * 100
        total_exit_rate = safe_divide((fv_exit + sv_exit), pv) * 100
        
        # MCPA
        mcpa = safe_divide(cost, clicks)
        
        # === 小数点の処理 ===
        # パーセント系 → 小数点第1位まで
        cvr = round(cvr, 1)
        mcvr = round(mcvr, 1)
        fv_exit_rate = round(fv_exit_rate, 1)
        sv_exit_rate = round(sv_exit_rate, 1)
        total_exit_rate = round(total_exit_rate, 1)
        
        # 金額系 → 整数（小数点切り捨て）
        # NaNチェックを追加
        cost = int(cost) if not pd.isna(cost) else 0
        pv = int(pv) if not pd.isna(pv) else 0
        clicks = int(clicks) if not pd.isna(clicks) else 0
        cv = int(cv) if not pd.isna(cv) else 0
        cpa = int(cpa) if not pd.isna(cpa) else 0
        cpc = int(cpc) if not pd.isna(cpc) else 0
        mcpa = int(mcpa) if not pd.isna(mcpa) else 0
        
        display_kpi_cards_beyond(cost, pv, clicks, cv, mcvr, cvr, cpc, cpa, mcpa, fv_exit_rate, sv_exit_rate, total_exit_rate)

    # --- 7. Tables & Charts ---
    
    # テーブル表示用ヘルパー
    def get_period_data(base_df, days_back=0, is_today=False, is_yesterday=False):
        today = pd.Timestamp.now().normalize()
        if is_today:
            start_date = today
            end_date = today
        elif is_yesterday:
            start_date = today - timedelta(days=1)
            end_date = today - timedelta(days=1)
        else:
            start_date = today - timedelta(days=days_back)
            end_date = today
            
        mask = (base_df["Date"] >= start_date) & (base_df["Date"] <= end_date)
        return base_df[mask]

    def display_period_table(df_period, title, tab_mode):
        if df_period.empty:
            st.markdown(f"##### {title}")
            st.caption("データなし")
            return

        # データを分離
        df_meta_period = df_period[df_period["Media"] == "Meta"]
        df_beyond_period = df_period[df_period["Media"] == "Beyond"]
        
        # 案件リストを取得
        all_projects = set()
        if not df_meta_period.empty:
            all_projects.update(df_meta_period["Campaign_Name"].unique())
        if not df_beyond_period.empty:
            all_projects.update(df_beyond_period["Campaign_Name"].unique())
        
        if not all_projects:
            st.markdown(f"##### {title}")
            st.caption("データなし")
            return
        
        table_data = []
        
        for project_name in sorted(all_projects):
            if tab_mode == "合計":
                # === 合計タブ ===
                # Metaデータから取得
                meta_project = df_meta_period[df_meta_period["Campaign_Name"] == project_name]
                impressions = meta_project["Impressions"].sum()
                meta_clicks = meta_project["Clicks"].sum()
                meta_cost = meta_project["Cost"].sum()
                
                # Beyondデータから取得
                beyond_project = df_beyond_period[df_beyond_period["Campaign_Name"] == project_name]
                beyond_cost = beyond_project["Cost"].sum()
                beyond_pv = beyond_project["PV"].sum()
                beyond_clicks = beyond_project["Clicks"].sum()  # MCV（記事LP遷移）
                beyond_cv = beyond_project["CV"].sum()
                
                # 売上計算（Master_Settingに基づき processor 側で計算済み）
                revenue = beyond_project["Revenue"].sum() if "Revenue" in beyond_project.columns else 0
                
                # 出稿金額はBeyondを使用（表示用）
                cost_for_display = beyond_cost
                profit = revenue - cost_for_display
                recovery_rate = safe_divide(revenue, beyond_cost) * 100
                roas = safe_divide(profit, revenue) * 100
                
                # 率計算
                ctr = safe_divide(meta_clicks, impressions) * 100
                mcvr = safe_divide(beyond_clicks, beyond_pv) * 100
                cvr = safe_divide(beyond_cv, beyond_clicks) * 100
                
                # コスト計算
                cpm = safe_divide(meta_cost, impressions) * 1000
                cpc = safe_divide(meta_cost, meta_clicks)
                mcpa = safe_divide(beyond_cost, beyond_clicks)
                cpa = safe_divide(beyond_cost, beyond_cv)
                
                table_data.append({
                    '案件名': project_name,
                    '出稿金額': int(cost_for_display) if not pd.isna(cost_for_display) else 0,
                    '売上': int(revenue) if not pd.isna(revenue) else 0,
                    '粗利': int(profit) if not pd.isna(profit) else 0,
                    '回収率': f"{recovery_rate:.1f}%",
                    'ROAS': f"{roas:.1f}%",
                    'Imp': int(impressions) if not pd.isna(impressions) else 0,
                    'Clicks': int(meta_clicks) if not pd.isna(meta_clicks) else 0,
                    '商品LPクリック': int(beyond_clicks) if not pd.isna(beyond_clicks) else 0,
                    'CV': int(beyond_cv) if not pd.isna(beyond_cv) else 0,
                    'CTR': f"{ctr:.1f}%",
                    'MCVR': f"{mcvr:.1f}%",
                    'CVR': f"{cvr:.1f}%",
                    'CPM': int(cpm) if not pd.isna(cpm) else 0,
                    'CPC': int(cpc) if not pd.isna(cpc) else 0,
                    'MCPA': int(mcpa) if not pd.isna(mcpa) else 0,
                    'CPA': int(cpa) if not pd.isna(cpa) else 0,
                })
                
            elif tab_mode == "Meta":
                # === Metaタブ ===
                meta_project = df_meta_period[df_meta_period["Campaign_Name"] == project_name]
                
                cost = meta_project["Cost"].sum()
                impressions = meta_project["Impressions"].sum()
                clicks = meta_project["Clicks"].sum()
                cv = meta_project["MCV"].sum()  # MetaのCV = MCV相当
                
                ctr = safe_divide(clicks, impressions) * 100
                cpm = safe_divide(cost, impressions) * 1000
                cpc = safe_divide(cost, clicks)
                cpa = safe_divide(cost, cv)
                
                table_data.append({
                    '案件名': project_name,
                    '出稿金額': int(cost) if not pd.isna(cost) else 0,
                    'Imp': int(impressions) if not pd.isna(impressions) else 0,
                    'Clicks': int(clicks) if not pd.isna(clicks) else 0,
                    'CV': int(cv) if not pd.isna(cv) else 0,
                    'CTR': f"{ctr:.1f}%",
                    'CPM': int(cpm) if not pd.isna(cpm) else 0,
                    'CPC': int(cpc) if not pd.isna(cpc) else 0,
                    'CPA': int(cpa) if not pd.isna(cpa) else 0,
                })
                
            elif tab_mode == "Beyond":
                # === Beyondタブ ===
                beyond_project = df_beyond_period[df_beyond_period["Campaign_Name"] == project_name]
                
                cost = beyond_project["Cost"].sum()
                pv = beyond_project["PV"].sum()
                clicks = beyond_project["Clicks"].sum()  # MCV（記事LP遷移）
                cv = beyond_project["CV"].sum()
                fv_exit = beyond_project["FV_Exit"].sum()
                sv_exit = beyond_project["SV_Exit"].sum()
                
                # 売上・粗利・回収率・ROASは計算しない（合計タブでのみ表示）
                mcvr = safe_divide(clicks, pv) * 100
                cvr = safe_divide(cv, clicks) * 100
                cpc = safe_divide(cost, clicks)
                cpa = safe_divide(cost, cv)
                mcpa = safe_divide(cost, clicks)
                fv_rate = safe_divide(fv_exit, pv) * 100
                sv_rate = safe_divide(sv_exit, (pv - fv_exit)) * 100
                total_exit_rate = safe_divide((fv_exit + sv_exit), pv) * 100
                
                table_data.append({
                    '案件名': project_name,
                    '出稿金額': int(cost) if not pd.isna(cost) else 0,
                    'PV': int(pv) if not pd.isna(pv) else 0,
                    'Clicks': int(clicks) if not pd.isna(clicks) else 0,
                    'CV': int(cv) if not pd.isna(cv) else 0,
                    'MCVR': f"{mcvr:.1f}%",
                    'CVR': f"{cvr:.1f}%",
                    'CPC': int(cpc) if not pd.isna(cpc) else 0,
                    'CPA': int(cpa) if not pd.isna(cpa) else 0,
                    'MCPA': int(mcpa) if not pd.isna(mcpa) else 0,
                    'FV離脱率': f"{fv_rate:.1f}%",
                    'SV離脱率': f"{sv_rate:.1f}%",
                    'FV+SV離脱率': f"{total_exit_rate:.1f}%",
                })
        
        if not table_data:
            st.markdown(f"##### {title}")
            st.caption("データなし")
            return
        
        # DataFrameに変換
        result_df = pd.DataFrame(table_data)
        
        st.markdown(f"##### {title}")
        st.dataframe(result_df, use_container_width=True)

    # フィルタ用ベースデータ作成 (日付フィルタ以外を適用)
    # 1. Media Filter
    if selected_tab == "Meta":
        df_base = df[df["Media"] == "Meta"]
    elif selected_tab == "Beyond":
        df_base = df[df["Media"] == "Beyond"]
    else:
        df_base = df

    # 2. Campaign/Creative Filter
    mask_base = pd.Series(True, index=df_base.index)
    if selected_campaign != "All":
        mask_base &= (df_base["Campaign_Name"] == selected_campaign)
    if selected_article != "All":
        mask_base &= (df_base["Creative"] == selected_article)
    if selected_creative != "All":
        mask_base &= (df_base["Creative"] == selected_creative)
    
    df_base = df_base[mask_base]

    st.markdown("---")
    
    # すべての期間テーブルを縦1列に配置
    display_period_table(get_period_data(df_base, is_today=True), "■案件別数値（当日）", selected_tab)
    display_period_table(get_period_data(df_base, is_yesterday=True), "■案件別数値（昨日）", selected_tab)
    display_period_table(get_period_data(df_base, days_back=2), "■案件別数値（直近3日間）", selected_tab)  # 当日含む3日
    display_period_table(get_period_data(df_base, days_back=6), "■案件別数値（直近7日間）", selected_tab)  # 当日含む7日
    display_period_table(df_filtered, "■案件別数値（選択期間）", selected_tab)
    
    st.markdown("---")
    display_charts(df_filtered)

# --- KPI Card Helpers ---
def kpi_card(label, value, unit="", color_class=""):
    if isinstance(value, float):
        val_str = f"{value:,.1f}" if unit == "%" else f"{int(value):,}"
    else:
        val_str = f"{value:,}"
    st.markdown(f"""
    <div class="kpi-card">
        <div class="kpi-label">{label}</div>
        <div class="kpi-value {color_class}">{val_str}<span class="kpi-unit">{unit}</span></div>
    </div>
    """, unsafe_allow_html=True)

def display_kpi_cards_total(cost, revenue, profit, impressions, clicks, mcv, cv, ctr, mcvr, cvr, cpm, cpc, mcpa, cpa):
    # 【1行目】7つ
    c1, c2, c3, c4, c5, c6, c7 = st.columns(7)
    with c1: kpi_card("出稿金額", cost, "円", "text-red")
    with c2: kpi_card("売上", revenue, "円", "text-blue")
    with c3: kpi_card("粗利", profit, "円", "text-orange")
    with c4: kpi_card("Imp", impressions, "")
    with c5: kpi_card("Clicks", clicks, "")
    with c6: kpi_card("商品LPクリック", mcv, "件")
    with c7: kpi_card("CV", cv, "件")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 【2行目】7つ
    c8, c9, c10, c11, c12, c13, c14 = st.columns(7)
    with c8: kpi_card("CTR", ctr, "%", "text-green")
    with c9: kpi_card("MCVR", mcvr, "%", "text-green")
    with c10: kpi_card("CVR", cvr, "%", "text-green")
    with c11: kpi_card("CPM", cpm, "円")
    with c12: kpi_card("CPC", cpc, "円")
    with c13: kpi_card("MCPA", mcpa, "円")
    with c14: kpi_card("CPA", cpa, "円")

def display_kpi_cards_meta(cost, impressions, clicks, cv, ctr, cpm, cpc, cpa):
    # Metaタブで表示するKPIカード
    # 【1行目】
    c1, c2, c3, c4 = st.columns(4)
    with c1: kpi_card("出稿金額", cost, "円", "text-red")
    with c2: kpi_card("Imp", impressions, "")
    with c3: kpi_card("Clicks", clicks, "")
    with c4: kpi_card("CV", cv, "件")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 【2行目】
    c5, c6, c7, c8 = st.columns(4)
    with c5: kpi_card("CTR", ctr, "%", "text-green")
    with c6: kpi_card("CPM", cpm, "円")
    with c7: kpi_card("CPC", cpc, "円")
    with c8: kpi_card("CPA", cpa, "円")

def display_kpi_cards_beyond(cost, pv, clicks, cv, mcvr, cvr, cpc, cpa, mcpa, fv_exit_rate, sv_exit_rate, total_exit_rate):
    # Beyondタブで表示するKPIカード
    # 【1行目】
    c1, c2, c3, c4 = st.columns(4)
    with c1: kpi_card("出稿金額", cost, "円", "text-red")
    with c2: kpi_card("PV", pv, "")
    with c3: kpi_card("Clicks", clicks, "件")
    with c4: kpi_card("CV", cv, "件")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 【2行目】
    c5, c6, c7, c8, c9, c10, c11, c12 = st.columns(8)
    with c5: kpi_card("MCVR", mcvr, "%", "text-green")
    with c6: kpi_card("CVR", cvr, "%", "text-green")
    with c7: kpi_card("CPC", cpc, "円")
    with c8: kpi_card("CPA", cpa, "円")
    with c9: kpi_card("MCPA", mcpa, "円")
    with c10: kpi_card("FV離脱率", fv_exit_rate, "%")
    with c11: kpi_card("SV離脱率", sv_exit_rate, "%")
    with c12: kpi_card("FV+SV離脱率", total_exit_rate, "%")

# テーブル表示関数 (簡易版)
def display_aggregated_table(dataframe, title):
    if dataframe.empty: return
    st.markdown(f"### {title}")
    # 単純合計で表示 (詳細ロジックは省略)
    st.dataframe(dataframe.head(10)) # デバッグ用

if __name__ == "__main__":
    if check_password():
        main()
