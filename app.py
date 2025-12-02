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
        
        with st.form("login_form"):
            username = st.text_input("ユーザー名（メールアドレス）", key="login_username")
            password = st.text_input("パスワード", type="password", key="login_password")
            submit = st.form_submit_button("ログイン", use_container_width=True)
            
            if submit:
                if (
                    username == st.secrets.get("auth", {}).get("username", "")
                    and password == st.secrets.get("auth", {}).get("password", "")
                ):
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
    
    def safe_div(n, d): return n / d if d != 0 else 0
    
    # 共通: 案件ごとの設定
    PROJECT_SETTINGS = {
        'SAC_成果': {'type': '成果', 'unit_price': 90000, 'fee_rate': None},
        'SAC_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2},
        'ルーチェ_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2}
    }

    if selected_tab == "合計":
        # --- 合計タブ ロジック ---
        # Meta: Cost, Imp, Click, MCV
        # Beyond: CV
        
        cost = df_meta["Cost"].sum()
        imp = df_meta["Impressions"].sum()
        clicks = df_meta["Clicks"].sum()
        mcv = df_meta["MCV"].sum()
        
        cv = df_beyond["CV"].sum()
        
        # 売上計算 (案件別に計算して合計)
        # フィルタ後のデータに含まれる案件ごとに計算
        revenue = 0
        # 案件リストを取得 (Meta/Beyondどちらかにあれば計算対象)
        campaigns = set(df_meta["Campaign_Name"].unique()) | set(df_beyond["Campaign_Name"].unique())
        
        for camp in campaigns:
            # その案件のCV (Beyond) と Cost (Meta) を取得
            camp_cv = df_beyond[df_beyond["Campaign_Name"] == camp]["CV"].sum()
            camp_cost = df_meta[df_meta["Campaign_Name"] == camp]["Cost"].sum()
            
            conf = PROJECT_SETTINGS.get(camp)
            if conf:
                if conf['type'] == '成果':
                    revenue += camp_cv * conf['unit_price']
                else:
                    revenue += camp_cost * conf['fee_rate']
        
        gross_profit = revenue - cost
        roas = safe_div(revenue, cost) * 100
        
        cpa = safe_div(cost, cv)
        mcpa = safe_div(cost, mcv)
        cpc = safe_div(cost, clicks)
        cpm = safe_div(cost, imp) * 1000
        ctr = safe_div(clicks, imp) * 100
        mcvr = safe_div(mcv, clicks) * 100
        # CVR = CV / Beyond Click (商品LP遷移)
        beyond_clicks = df_beyond["Clicks"].sum()
        cvr = safe_div(cv, beyond_clicks) * 100

        # 表示 (2行)
        display_kpi_cards_total(revenue, cost, gross_profit, roas, cv, cpa, mcpa, cpc, cpm, ctr, mcvr, cvr)

    elif selected_tab == "Meta":
        # --- Metaタブ ロジック ---
        # 売上・粗利・回収率は表示しない
        cost = df_meta["Cost"].sum()
        imp = df_meta["Impressions"].sum()
        clicks = df_meta["Clicks"].sum()
        cv = df_meta["MCV"].sum() # Metaタブでは Results(MCV) を CV として表示
        
        cpa = safe_div(cost, cv)
        cpc = safe_div(cost, clicks)
        cpm = safe_div(cost, imp) * 1000
        ctr = safe_div(clicks, imp) * 100
        
        display_kpi_cards_meta(cost, imp, clicks, cv, cpa, cpc, cpm, ctr)

    elif selected_tab == "Beyond":
        # --- Beyondタブ ロジック ---
        cost = df_beyond["Cost"].sum()
        pv = df_beyond["PV"].sum()
        clicks = df_beyond["Clicks"].sum() # 商品LP遷移
        cv = df_beyond["CV"].sum()
        
        # 売上計算 (Beyond Cost ベース?) -> 要望: "売上 = 各案件の売上を合計"
        # Beyondタブでの売上計算ロジック:
        # 成果型: CV * 単価
        # 予算型: Cost * 手数料率 (Beyond Costを使う)
        revenue = 0
        for camp in df_beyond["Campaign_Name"].unique():
            camp_cv = df_beyond[df_beyond["Campaign_Name"] == camp]["CV"].sum()
            camp_cost = df_beyond[df_beyond["Campaign_Name"] == camp]["Cost"].sum()
            conf = PROJECT_SETTINGS.get(camp)
            if conf:
                if conf['type'] == '成果':
                    revenue += camp_cv * conf['unit_price']
                else:
                    revenue += camp_cost * conf['fee_rate']

        gross_profit = revenue - cost
        roas = safe_div(revenue, cost) * 100
        
        cpa = safe_div(cost, cv)
        cpc = safe_div(cost, clicks)
        cvr = safe_div(cv, clicks) * 100
        
        fv_exit = df_beyond["FV_Exit"].sum()
        sv_exit = df_beyond["SV_Exit"].sum()
        fv_exit_rate = safe_div(fv_exit, pv) * 100
        sv_exit_rate = safe_div(sv_exit, (pv - fv_exit)) * 100
        total_exit_rate = safe_div(fv_exit + sv_exit, pv) * 100
        
        display_kpi_cards_beyond(revenue, cost, gross_profit, roas, cv, cpa, cpc, cvr, fv_exit_rate, sv_exit_rate, total_exit_rate)

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
            st.markdown(f"### {title}")
            st.caption("データなし")
            return

        df_agg = df_period.copy()
        
        # CVR計算用にBeyondのクリック(商品LP遷移)を保持しておく
        df_agg["Beyond_Clicks"] = df_agg.apply(lambda x: x["Clicks"] if x["Media"] == "Beyond" else 0, axis=1)

        if tab_mode == "合計":
            # 合計タブの厳密なロジック適用
            # Cost, Imp, Clicks(Link Click), MCV -> Metaデータのみ
            # CV -> Beyondデータのみ
            # Revenue, Profit -> 両方の合計 (processor.pyで計算済み)
            
            # Beyond行の Cost, Imp, Clicks, MCV を0にする (集計に含めない)
            df_agg.loc[df_agg["Media"] == "Beyond", ["Cost", "Impressions", "Clicks", "MCV"]] = 0
            
            # Meta行の CV を0にする (集計に含めない)
            df_agg.loc[df_agg["Media"] == "Meta", "CV"] = 0
            
        elif tab_mode == "Meta":
            # Metaタブ: Metaデータのみ表示 (フィルタ済み前提だが念のため)
            df_agg = df_agg[df_agg["Media"] == "Meta"]
            
        elif tab_mode == "Beyond":
            # Beyondタブ: Beyondデータのみ表示
            df_agg = df_agg[df_agg["Media"] == "Beyond"]

        # GroupBy
        grouped = df_agg.groupby("Campaign_Name").agg({
            "Cost": "sum",
            "Revenue": "sum",
            "Gross_Profit": "sum",
            "CV": "sum",
            "MCV": "sum",
            "Clicks": "sum", # ここはMetaのClicks(合計タブの場合)
            "Beyond_Clicks": "sum", # CVR計算用
            "Impressions": "sum"
        }).reset_index()
        
        # 計算指標
        # CPA = Cost / CV
        grouped["CPA"] = grouped.apply(lambda x: safe_div(x["Cost"], x["CV"]), axis=1)
        # ROAS = Revenue / Cost
        grouped["ROAS"] = grouped.apply(lambda x: safe_div(x["Revenue"], x["Cost"]) * 100, axis=1)
        # CVR = CV / Beyond_Clicks (合計タブの場合)
        # Metaタブなら CV/Clicks(Link Click) ? いやMetaタブのCVR定義は指定ないが、通常は MCV/Clicks(MCVR) かな？
        # しかし display_kpi_cards_meta には CVR がない (CTRはある)。
        # Beyondタブなら CV/Clicks(商品LP遷移)。
        
        if tab_mode == "合計":
             grouped["CVR"] = grouped.apply(lambda x: safe_div(x["CV"], x["Beyond_Clicks"]) * 100, axis=1)
        elif tab_mode == "Beyond":
             grouped["CVR"] = grouped.apply(lambda x: safe_div(x["CV"], x["Clicks"]) * 100, axis=1)
        
        # 表示用カラム選択
        if tab_mode == "Meta":
            cols = ["Campaign_Name", "Cost", "Impressions", "Clicks", "CV", "CPA"]
            rename = {"CV": "CV(MCV)", "Impressions": "Imp", "Clicks": "Click"}
        elif tab_mode == "Beyond":
            cols = ["Campaign_Name", "Revenue", "Cost", "Gross_Profit", "ROAS", "CV", "CPA", "CVR"]
            rename = {"Gross_Profit": "粗利", "Revenue": "売上", "Cost": "出稿金額", "Clicks": "LP遷移"}
        else: # 合計
            cols = ["Campaign_Name", "Revenue", "Cost", "Gross_Profit", "ROAS", "CV", "CPA", "CVR"]
            rename = {"Gross_Profit": "粗利", "Revenue": "売上", "Cost": "出稿金額"}

        # フォーマット
        disp_df = grouped[cols].rename(columns=rename)
        
        st.markdown(f"##### {title}")
        st.dataframe(disp_df.style.format({
            "Revenue": "{:,.0f}", "売上": "{:,.0f}",
            "Cost": "{:,.0f}", "出稿金額": "{:,.0f}",
            "Gross_Profit": "{:,.0f}", "粗利": "{:,.0f}",
            "ROAS": "{:.1f}%",
            "CPA": "{:,.0f}",
            "CV": "{:,.0f}", "CV(MCV)": "{:,.0f}",
            "Imp": "{:,.0f}", "Impressions": "{:,.0f}",
            "Clicks": "{:,.0f}", "Click": "{:,.0f}",
            "CVR": "{:.1f}%"
        }), use_container_width=True)

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

def display_kpi_cards_total(rev, cost, prof, roas, cv, cpa, mcpa, cpc, cpm, ctr, mcvr, cvr):
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    with c1: kpi_card("売上", rev, "円", "text-blue")
    with c2: kpi_card("出稿金額", cost, "円", "text-red")
    with c3: kpi_card("粗利", prof, "円", "text-orange")
    with c4: kpi_card("回収率", roas, "%", "text-green")
    with c5: kpi_card("CV", cv, "件")
    with c6: kpi_card("CPA", cpa, "円")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    c7, c8, c9, c10, c11, c12 = st.columns(6)
    with c7: kpi_card("MCPA", mcpa, "円")
    with c8: kpi_card("CPC", cpc, "円")
    with c9: kpi_card("CPM", cpm, "円")
    with c10: kpi_card("CTR", ctr, "%", "text-green")
    with c11: kpi_card("MCVR", mcvr, "%", "text-green")
    with c12: kpi_card("CVR", cvr, "%", "text-green")

def display_kpi_cards_meta(cost, imp, clicks, cv, cpa, cpc, cpm, ctr):
    c1, c2, c3, c4 = st.columns(4)
    with c1: kpi_card("出稿金額", cost, "円", "text-red")
    with c2: kpi_card("imp", imp, "")
    with c3: kpi_card("クリック", clicks, "")
    with c4: kpi_card("CV", cv, "件")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    c5, c6, c7, c8 = st.columns(4)
    with c5: kpi_card("CPA", cpa, "円")
    with c6: kpi_card("CPC", cpc, "円")
    with c7: kpi_card("CPM", cpm, "円")
    with c8: kpi_card("CTR", ctr, "%", "text-green")

def display_kpi_cards_beyond(rev, cost, prof, roas, cv, cpa, cpc, cvr, fv_exit, sv_exit, total_exit):
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    with c1: kpi_card("売上", rev, "円", "text-blue")
    with c2: kpi_card("出稿金額", cost, "円", "text-red")
    with c3: kpi_card("粗利", prof, "円", "text-orange")
    with c4: kpi_card("回収率", roas, "%", "text-green")
    with c5: kpi_card("CV", cv, "件")
    with c6: kpi_card("CPA", cpa, "円")
    
    st.markdown("<div style='margin-top: 16px;'></div>", unsafe_allow_html=True)
    c7, c8, c9, c10, c11 = st.columns(5)
    with c7: kpi_card("CPC", cpc, "円")
    with c8: kpi_card("CVR", cvr, "%", "text-green")
    with c9: kpi_card("FV離脱率", fv_exit, "%")
    with c10: kpi_card("SV離脱率", sv_exit, "%")
    with c11: kpi_card("FV+SV離脱率", total_exit, "%")

# テーブル表示関数 (簡易版)
def display_aggregated_table(dataframe, title):
    if dataframe.empty: return
    st.markdown(f"### {title}")
    # 単純合計で表示 (詳細ロジックは省略)
    st.dataframe(dataframe.head(10)) # デバッグ用

if __name__ == "__main__":
    if check_password():
        main()
