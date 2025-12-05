import streamlit as st
import pandas as pd
from datetime import datetime, timedelta

# Import custom modules
from data.loader import load_data_from_sheets
from data.processor import process_data
from utils.styles import get_custom_css
from components.metrics import display_kpi_metrics
from components.charts import display_charts

# --- Page Config ---
st.set_page_config(
    page_title="運用分析用ダッシュボード",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- SEO: Noindex Setting ---
st.markdown("""
<meta name="robots" content="noindex, nofollow">
""", unsafe_allow_html=True)

# --- Apply Custom Styles ---
st.markdown(get_custom_css(), unsafe_allow_html=True)

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

def main():
    # --- 1. Data Loading ---
    raw_data = load_data_from_sheets()
    df = process_data(raw_data)
    
    if df.empty:
        st.error("データの読み込みに失敗したか、対象データがありません。")
        return

    # --- 2. Header Area (Title, Tabs, Date) ---
    with st.container():
        col_title, col_tabs, col_date = st.columns([1, 2, 1])
        
        with col_title:
            st.markdown('<h1 style="margin-top: 5px;">運用分析用</h1>', unsafe_allow_html=True)
            
        with col_tabs:
            # タブ順序変更: 合計 -> Meta -> Beyond
            selected_tab = st.radio(
                "Media Tab",
                ["合計", "Meta", "Beyond"],
                horizontal=True,
                label_visibility="collapsed",
                key="media_tab"
            )
            
        with col_date:
            # 期間初期値: 当月1日 〜 今日
            today = datetime.now().date()
            first_day_of_month = today.replace(day=1)
            date_range = st.date_input("", value=(first_day_of_month, today), label_visibility="collapsed")

    # --- 3. Data Filtering based on Tab ---
    # ここではタブごとの「表示用データ」を作るのではなく、
    # フィルタリング用のマスタデータとして df を使う。
    # 実際の集計は KPI計算時に Meta/Beyond を使い分ける。
    
    # ただし、フィルタの選択肢はタブに依存する
    if selected_tab == "Meta":
        df_filter_source = df[df["Media"] == "Meta"]
    elif selected_tab == "Beyond":
        df_filter_source = df[df["Media"] == "Beyond"]
    else:
        df_filter_source = df # 合計

    # --- 4. Filter Area ---
    st.markdown('<div style="background-color: #FFFFFF; padding: 16px; border-radius: 8px; margin-top: 0px; margin-bottom: 24px; border: 1px solid #E5E7EB;">', unsafe_allow_html=True)
    
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
        # 要望では「合計」タブのフィルタ挙動は明記ないが、Meta/Beyond両方のデータがあるので
        # 便宜上両方出しておく
        all_articles = ["All"] + list(df[df["Media"]=="Beyond"]["Creative"].dropna().unique())
        all_creatives = ["All"] + list(df[df["Media"]=="Meta"]["Creative"].dropna().unique())

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        selected_campaign = st.selectbox("商品名", all_campaigns)
    with c2:
        selected_article = st.selectbox("記事", all_articles, disabled=(selected_tab=="Meta"))
    with c3:
        selected_creative = st.selectbox("クリエイティブ", all_creatives, disabled=(selected_tab=="Beyond"))
    with c4:
        st.selectbox("お取引先", ["All"])

    st.markdown('</div>', unsafe_allow_html=True)

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
    
    # 共通: 案件ごとの設定
    PROJECT_SETTINGS = {
        'SAC_成果': {'type': '成果', 'unit_price': 90000, 'fee_rate': None},
        'SAC_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2},
        'ルーチェ_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2}
    }
    
    # 売上計算関数
    def calculate_revenue_by_project(df, project_settings):
        total_revenue = 0
        for project_name, settings in project_settings.items():
            project_data = df[df['Campaign_Name'] == project_name]
            project_cv = project_data['CV'].sum()
            project_cost = project_data['Cost'].sum()
            
            if settings['type'] == '成果':
                # 成果型: CV × 単価
                revenue = project_cv * settings['unit_price']
            else:
                # 予算型: Cost × 手数料率
                revenue = project_cost * settings['fee_rate']
            
            total_revenue += revenue
        return total_revenue

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
        # 出稿金額: Beyondを使用
        cost = beyond_cost
        
        # 売上: 案件タイプ別に計算
        revenue = calculate_revenue_by_project(df_beyond, PROJECT_SETTINGS)
        
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
        cost = int(cost)
        revenue = int(revenue)
        profit = int(profit)
        cpm = int(cpm)
        cpc = int(cpc)
        mcpa = int(mcpa)
        cpa = int(cpa)
        
        # 表示
        display_kpi_cards_total(revenue, cost, profit, recovery_rate, beyond_cv, cpa, impressions, meta_clicks, beyond_clicks, ctr, mcvr, cvr, cpm, cpc, mcpa, roas)

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
        cost = int(cost)
        impressions = int(impressions)
        clicks = int(clicks)
        cv = int(cv)
        cpm = int(cpm)
        cpc = int(cpc)
        cpa = int(cpa)
        
        display_kpi_cards_meta(impressions, clicks, cost, cv, ctr, cpm, cpc, cpa)

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
        
        # 売上・粗利（Beyond内で完結）
        revenue = calculate_revenue_by_project(df_beyond, PROJECT_SETTINGS)
        profit = revenue - cost
        recovery_rate = safe_divide(revenue, cost) * 100
        
        # === 小数点の処理 ===
        # パーセント系 → 小数点第1位まで
        cvr = round(cvr, 1)
        mcvr = round(mcvr, 1)
        fv_exit_rate = round(fv_exit_rate, 1)
        sv_exit_rate = round(sv_exit_rate, 1)
        total_exit_rate = round(total_exit_rate, 1)
        recovery_rate = round(recovery_rate, 1)
        
        # 金額系 → 整数（小数点切り捨て）
        cost = int(cost)
        revenue = int(revenue)
        profit = int(profit)
        pv = int(pv)
        clicks = int(clicks)
        cv = int(cv)
        cpa = int(cpa)
        cpc = int(cpc)
        
        display_kpi_cards_beyond(revenue, cost, profit, recovery_rate, cv, cpa, pv, clicks, mcvr, cvr, cpc, fv_exit_rate, sv_exit_rate, total_exit_rate)

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
                
                # 売上計算
                settings = PROJECT_SETTINGS.get(project_name, {})
                if settings.get('type') == '成果':
                    revenue = beyond_cv * settings.get('unit_price', 0)
                else:
                    revenue = beyond_cost * settings.get('fee_rate', 0)
                
                profit = revenue - beyond_cost
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
                    '売上': int(revenue),
                    '出稿金額': int(beyond_cost),
                    '粗利': int(profit),
                    '回収率': f"{recovery_rate:.1f}%",
                    'ROAS': f"{roas:.1f}%",
                    'Imp': int(impressions),
                    'Clicks': int(meta_clicks),
                    'MCV': int(beyond_clicks),
                    'CV': int(beyond_cv),
                    'CTR': f"{ctr:.1f}%",
                    'MCVR': f"{mcvr:.1f}%",
                    'CVR': f"{cvr:.1f}%",
                    'CPM': int(cpm),
                    'CPC': int(cpc),
                    'MCPA': int(mcpa),
                    'CPA': int(cpa),
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
                    '出稿金額': int(cost),
                    'Imp': int(impressions),
                    'Clicks': int(clicks),
                    'CV': int(cv),
                    'CTR': f"{ctr:.1f}%",
                    'CPM': int(cpm),
                    'CPC': int(cpc),
                    'CPA': int(cpa),
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
                
                # 売上計算
                settings = PROJECT_SETTINGS.get(project_name, {})
                if settings.get('type') == '成果':
                    revenue = cv * settings.get('unit_price', 0)
                else:
                    revenue = cost * settings.get('fee_rate', 0)
                
                profit = revenue - cost
                recovery_rate = safe_divide(revenue, cost) * 100
                roas = safe_divide(profit, revenue) * 100
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
                    '売上': int(revenue),
                    '出稿金額': int(cost),
                    '粗利': int(profit),
                    '回収率': f"{recovery_rate:.1f}%",
                    'ROAS': f"{roas:.1f}%",
                    'PV': int(pv),
                    'Clicks': int(clicks),
                    'CV': int(cv),
                    'MCVR': f"{mcvr:.1f}%",
                    'CVR': f"{cvr:.1f}%",
                    'CPC': int(cpc),
                    'CPA': int(cpa),
                    'MCPA': int(mcpa),
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
    
    # 4つの期間テーブル
    c_today, c_yesterday = st.columns(2)
    with c_today:
        display_period_table(get_period_data(df_base, is_today=True), "■案件別数値（当日）", selected_tab)
    with c_yesterday:
        display_period_table(get_period_data(df_base, is_yesterday=True), "■案件別数値（昨日）", selected_tab)
        
    c_3days, c_7days = st.columns(2)
    with c_3days:
        display_period_table(get_period_data(df_base, days_back=2), "■案件別数値（直近3日間）", selected_tab) # 当日含む3日
    with c_7days:
        display_period_table(get_period_data(df_base, days_back=6), "■案件別数値（直近7日間）", selected_tab) # 当日含む7日

    st.markdown("---")
    # 選択期間
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

def display_kpi_cards_total(rev, cost, prof, recovery_rate, cv, cpa, impressions, clicks, mcv, ctr, mcvr, cvr, cpm, cpc, mcpa, roas):
    # 1行目（主要指標）
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    with c1: kpi_card("売上", rev, "円", "text-blue")
    with c2: kpi_card("出稿金額", cost, "円", "text-red")
    with c3: kpi_card("粗利", prof, "円", "text-orange")
    with c4: kpi_card("回収率", recovery_rate, "%", "text-green")
    with c5: kpi_card("CV", cv, "件")
    with c6: kpi_card("CPA", cpa, "円")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 2行目（流入指標）
    c7, c8, c9, c10, c11, c12 = st.columns(6)
    with c7: kpi_card("Impressions", impressions, "")
    with c8: kpi_card("Clicks", clicks, "")
    with c9: kpi_card("MCV", mcv, "件")
    with c10: kpi_card("CTR", ctr, "%", "text-green")
    with c11: kpi_card("MCVR", mcvr, "%", "text-green")
    with c12: kpi_card("CVR", cvr, "%", "text-green")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 3行目（コスト効率）
    c13, c14, c15, c16, c17, c18 = st.columns(6)
    with c13: kpi_card("CPM", cpm, "円")
    with c14: kpi_card("CPC", cpc, "円")
    with c15: kpi_card("MCPA", mcpa, "円")
    with c16: kpi_card("ROAS", roas, "%", "text-green")
    # c17, c18 は空欄

def display_kpi_cards_meta(impressions, clicks, cost, cv, ctr, cpm, cpc, cpa):
    # Metaタブで表示するKPIカード
    c1, c2, c3, c4 = st.columns(4)
    with c1: kpi_card("Impressions", impressions, "")
    with c2: kpi_card("Clicks", clicks, "")
    with c3: kpi_card("Cost", cost, "円", "text-red")
    with c4: kpi_card("CV", cv, "件")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    c5, c6, c7, c8 = st.columns(4)
    with c5: kpi_card("CTR", ctr, "%", "text-green")
    with c6: kpi_card("CPM", cpm, "円")
    with c7: kpi_card("CPC", cpc, "円")
    with c8: kpi_card("CPA", cpa, "円")

def display_kpi_cards_beyond(revenue, cost, profit, recovery_rate, cv, cpa, pv, clicks, mcvr, cvr, cpc, fv_exit_rate, sv_exit_rate, total_exit_rate):
    # Beyondタブで表示するKPIカード
    # 1行目
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    with c1: kpi_card("売上", revenue, "円", "text-blue")
    with c2: kpi_card("出稿金額", cost, "円", "text-red")
    with c3: kpi_card("粗利", profit, "円", "text-orange")
    with c4: kpi_card("回収率", recovery_rate, "%", "text-green")
    with c5: kpi_card("CV", cv, "件")
    with c6: kpi_card("CPA", cpa, "円")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 2行目
    c7, c8, c9, c10, c11, c12 = st.columns(6)
    with c7: kpi_card("PV", pv, "")
    with c8: kpi_card("Clicks", clicks, "件")
    with c9: kpi_card("MCVR", mcvr, "%", "text-green")
    with c10: kpi_card("CVR", cvr, "%", "text-green")
    with c11: kpi_card("CPC", cpc, "円")
    # c12 は空欄
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    # 3行目
    c13, c14, c15 = st.columns(3)
    with c13: kpi_card("FV離脱率", fv_exit_rate, "%")
    with c14: kpi_card("SV離脱率", sv_exit_rate, "%")
    with c15: kpi_card("FV+SV離脱率", total_exit_rate, "%")

# テーブル表示関数 (簡易版)
def display_aggregated_table(dataframe, title):
    if dataframe.empty: return
    st.markdown(f"### {title}")
    # 単純合計で表示 (詳細ロジックは省略)
    st.dataframe(dataframe.head(10)) # デバッグ用

if __name__ == "__main__":
    if check_password():
        main()
