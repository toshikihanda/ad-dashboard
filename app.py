import streamlit as st
import pandas as pd
from datetime import datetime, timedelta

# Import custom modules
from data.loader import load_data_from_sheets
from data.processor import process_data
# from utils.styles import get_custom_css # CSS is now injected directly
from components.charts import display_charts

# --- Page Config ---
st.set_page_config(
    page_title="運用分析用ダッシュボード",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- 1. Global CSS Injection ---
st.markdown("""
<style>
    /* 全体の背景色 */
    .stApp {
        background-color: #f3f4f6;
    }
    
    /* メインコンテンツエリア */
    .main .block-container {
        padding-top: 2rem;
        padding-bottom: 2rem;
        max-width: 1400px;
    }
    
    /* メトリクスカード（KPIカード）のスタイル */
    [data-testid="metric-container"] {
        background-color: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    
    /* メトリクスのラベル */
    [data-testid="stMetricLabel"] {
        font-size: 12px;
        color: #6b7280;
    }
    
    /* メトリクスの値 */
    [data-testid="stMetricValue"] {
        font-size: 24px;
        font-weight: 600;
        color: #1f2937;
    }
    
    /* ヘッダーエリア */
    .header-container {
        background-color: white;
        padding: 16px 24px;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 24px;
        border-radius: 8px;
    }
    
    /* タブボタンのスタイル */
    .stRadio > div {
        display: flex;
        gap: 8px;
    }
    
    .stRadio > div > label {
        background-color: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px 24px;
        cursor: pointer;
        font-weight: 500;
    }
    
    /* 選択されたタブ - 合計（Blue） */
    .stRadio > div > label[data-selected="true"] {
        background-color: #2563eb;
        color: white;
        border-color: #2563eb;
    }
    
    /* データフレーム（テーブル）のスタイル */
    .stDataFrame {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    
    /* セクションタイトル */
    .section-title {
        font-size: 16px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 16px;
        padding-left: 8px;
        border-left: 4px solid #2563eb;
    }
    
    /* フィルターエリア */
    .stSelectbox {
        background-color: #f9fafb;
    }
    
    /* ポジティブな数値（緑色） */
    .positive-value {
        color: #16a34a;
    }
    
    /* ネガティブな数値（赤色） */
    .negative-value {
        color: #dc2626;
    }
</style>
""", unsafe_allow_html=True)

def section_title(title):
    st.markdown(f'<div class="section-title">■ {title}</div>', unsafe_allow_html=True)

def main():
    # --- Data Loading ---
    raw_data = load_data_from_sheets()
    df = process_data(raw_data)
    
    if df.empty:
        st.error("データの読み込みに失敗したか、対象データがありません。")
        return

    # --- 2. View Mode (Header) ---
    today = datetime.now().date()
    start_of_month = today.replace(day=1)

    st.markdown('<div class="header-container">', unsafe_allow_html=True)
    col1, col2, col3 = st.columns([2, 3, 2])

    with col1:
        st.markdown("### 運用分析用")

    with col2:
        view_mode = st.radio(
            label="表示モード",
            options=["合計", "Meta", "Beyond"],
            horizontal=True,
            label_visibility="collapsed"
        )

    with col3:
        date_range = st.date_input(
            "期間",
            value=(start_of_month, today),
            label_visibility="collapsed"
        )
    st.markdown('</div>', unsafe_allow_html=True)

    # --- 3. Theme Colors ---
    THEME_COLORS = {
        "合計": {"primary": "#2563eb", "secondary": "#3b82f6", "light": "#eff6ff"},
        "Meta": {"primary": "#16a34a", "secondary": "#22c55e", "light": "#f0fdf4"},
        "Beyond": {"primary": "#9333ea", "secondary": "#a855f7", "light": "#faf5ff"}
    }
    current_theme = THEME_COLORS[view_mode]

    # --- Filter Logic ---
    if view_mode == "Meta":
        df_filter_source = df[df["Media"] == "Meta"]
    elif view_mode == "Beyond":
        df_filter_source = df[df["Media"] == "Beyond"]
    else:
        df_filter_source = df

    # Filter UI
    st.markdown('<div style="background-color: white; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e5e7eb;">', unsafe_allow_html=True)
    
    all_campaigns = ["All"] + list(df_filter_source["Campaign_Name"].unique())
    
    if view_mode == "Beyond":
        all_articles = ["All"] + list(df_filter_source["Creative"].dropna().unique())
        all_creatives = ["All"]
    elif view_mode == "Meta":
        all_articles = ["All"]
        all_creatives = ["All"] + list(df_filter_source["Creative"].dropna().unique())
    else:
        all_articles = ["All"] + list(df[df["Media"]=="Beyond"]["Creative"].dropna().unique())
        all_creatives = ["All"] + list(df[df["Media"]=="Meta"]["Creative"].dropna().unique())

    c1, c2, c3, c4 = st.columns(4)
    with c1: selected_campaign = st.selectbox("商品名", all_campaigns)
    with c2: selected_article = st.selectbox("記事", all_articles, disabled=(view_mode=="Meta"))
    with c3: selected_creative = st.selectbox("クリエイティブ", all_creatives, disabled=(view_mode=="Beyond"))
    with c4: st.selectbox("お取引先", ["All"])
    st.markdown('</div>', unsafe_allow_html=True)

    # Apply Filters
    mask = pd.Series(True, index=df.index)
    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_d, end_d = date_range
        mask &= (df["Date"].dt.date >= start_d) & (df["Date"].dt.date <= end_d)
    if selected_campaign != "All":
        mask &= (df["Campaign_Name"] == selected_campaign)
    if selected_article != "All":
        mask &= (df["Creative"] == selected_article)
    if selected_creative != "All":
        mask &= (df["Creative"] == selected_creative)
        
    df_filtered = df[mask]
    if df_filtered.empty:
        st.warning("データがありません")
        return

    # --- 4. KPI Calculation & Display ---
    df_meta = df_filtered[df_filtered["Media"] == "Meta"]
    df_beyond = df_filtered[df_filtered["Media"] == "Beyond"]
    
    def safe_div(n, d): return n / d if d != 0 else 0
    
    # Project Settings for Revenue Calc
    PROJECT_SETTINGS = {
        'SAC_成果': {'type': '成果', 'unit_price': 90000, 'fee_rate': None},
        'SAC_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2},
        'ルーチェ_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2}
    }

    # Initialize metrics
    revenue = cost = profit = cv = mcv = clicks = imp = 0
    
    if view_mode == "合計":
        cost = df_meta["Cost"].sum()
        imp = df_meta["Impressions"].sum()
        clicks = df_meta["Clicks"].sum()
        mcv = df_meta["MCV"].sum()
        cv = df_beyond["CV"].sum()
        
        # Revenue Calc
        campaigns = set(df_meta["Campaign_Name"].unique()) | set(df_beyond["Campaign_Name"].unique())
        for camp in campaigns:
            camp_cv = df_beyond[df_beyond["Campaign_Name"] == camp]["CV"].sum()
            camp_cost = df_meta[df_meta["Campaign_Name"] == camp]["Cost"].sum()
            conf = PROJECT_SETTINGS.get(camp)
            if conf:
                if conf['type'] == '成果': revenue += camp_cv * conf['unit_price']
                else: revenue += camp_cost * conf['fee_rate']
        
        profit = revenue - cost
        
    elif view_mode == "Meta":
        cost = df_meta["Cost"].sum()
        imp = df_meta["Impressions"].sum()
        clicks = df_meta["Clicks"].sum()
        cv = df_meta["MCV"].sum() # Meta CV = MCV
        # Revenue/Profit not shown for Meta tab usually, but if needed:
        # revenue = df_meta["Revenue"].sum() # From processor
        # profit = df_meta["Gross_Profit"].sum()

    elif view_mode == "Beyond":
        cost = df_beyond["Cost"].sum()
        cv = df_beyond["CV"].sum()
        clicks = df_beyond["Clicks"].sum()
        # Revenue Calc
        for camp in df_beyond["Campaign_Name"].unique():
            camp_cv = df_beyond[df_beyond["Campaign_Name"] == camp]["CV"].sum()
            camp_cost = df_beyond[df_beyond["Campaign_Name"] == camp]["Cost"].sum()
            conf = PROJECT_SETTINGS.get(camp)
            if conf:
                if conf['type'] == '成果': revenue += camp_cv * conf['unit_price']
                else: revenue += camp_cost * conf['fee_rate']
        profit = revenue - cost

    # Derived Metrics
    recovery_rate = safe_div(revenue, cost) * 100
    cpa = safe_div(cost, cv)
    
    # Display KPI Cards
    if view_mode == "合計":
        mcpa = safe_div(cost, mcv)
        cpc = safe_div(cost, clicks)
        cpm = safe_div(cost, imp) * 1000
        ctr = safe_div(clicks, imp) * 100
        mcvr = safe_div(mcv, clicks) * 100
        beyond_clicks = df_beyond["Clicks"].sum()
        cvr = safe_div(cv, beyond_clicks) * 100

        col1, col2, col3, col4, col5, col6 = st.columns(6)
        col1.metric("売上", f"{int(revenue):,}")
        col2.metric("出稿金額", f"{int(cost):,}")
        col3.metric("粗利", f"{int(profit):,}")
        col4.metric("回収率", f"{recovery_rate:.1f}%")
        col5.metric("CV", f"{int(cv):,}")
        col6.metric("CPA", f"{int(cpa):,}")
        
        st.markdown("###")
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        col1.metric("MCPA", f"{int(mcpa):,}")
        col2.metric("CPC", f"{int(cpc):,}")
        col3.metric("CPM", f"{int(cpm):,}")
        col4.metric("CTR", f"{ctr:.1f}%")
        col5.metric("MCVR", f"{mcvr:.1f}%")
        col6.metric("CVR", f"{cvr:.1f}%")

    elif view_mode == "Meta":
        cpc = safe_div(cost, clicks)
        cpm = safe_div(cost, imp) * 1000
        ctr = safe_div(clicks, imp) * 100
        
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("出稿金額", f"{int(cost):,}")
        col2.metric("imp", f"{int(imp):,}")
        col3.metric("クリック", f"{int(clicks):,}")
        col4.metric("CV", f"{int(cv):,}")
        
        st.markdown("###")
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("CPA", f"{int(cpa):,}")
        col2.metric("CPC", f"{int(cpc):,}")
        col3.metric("CPM", f"{int(cpm):,}")
        col4.metric("CTR", f"{ctr:.1f}%")

    elif view_mode == "Beyond":
        cpc = safe_div(cost, clicks)
        cvr = safe_div(cv, clicks) * 100
        pv = df_beyond["PV"].sum()
        fv_exit = df_beyond["FV_Exit"].sum()
        sv_exit = df_beyond["SV_Exit"].sum()
        fv_exit_rate = safe_div(fv_exit, pv) * 100
        sv_exit_rate = safe_div(sv_exit, (pv - fv_exit)) * 100
        total_exit_rate = safe_div(fv_exit + sv_exit, pv) * 100

        col1, col2, col3, col4, col5, col6 = st.columns(6)
        col1.metric("売上", f"{int(revenue):,}")
        col2.metric("出稿金額", f"{int(cost):,}")
        col3.metric("粗利", f"{int(profit):,}")
        col4.metric("回収率", f"{recovery_rate:.1f}%")
        col5.metric("CV", f"{int(cv):,}")
        col6.metric("CPA", f"{int(cpa):,}")
        
        st.markdown("###")
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("CPC", f"{int(cpc):,}")
        col2.metric("CVR", f"{cvr:.1f}%")
        col3.metric("FV離脱率", f"{fv_exit_rate:.1f}%")
        col4.metric("SV離脱率", f"{sv_exit_rate:.1f}%")
        col5.metric("FV+SV離脱率", f"{total_exit_rate:.1f}%")

    # --- 5. Tables & Charts ---
    st.markdown("---")
    
    # Helper for period tables
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

    def display_period_table(df_period, title):
        section_title(title)
        if df_period.empty:
            st.caption("データなし")
            return

        df_agg = df_period.copy()
        df_agg["Beyond_Clicks"] = df_agg.apply(lambda x: x["Clicks"] if x["Media"] == "Beyond" else 0, axis=1)

        if view_mode == "合計":
            df_agg.loc[df_agg["Media"] == "Beyond", ["Cost", "Impressions", "Clicks", "MCV"]] = 0
            df_agg.loc[df_agg["Media"] == "Meta", "CV"] = 0
        elif view_mode == "Meta":
            df_agg = df_agg[df_agg["Media"] == "Meta"]
        elif view_mode == "Beyond":
            df_agg = df_agg[df_agg["Media"] == "Beyond"]

        grouped = df_agg.groupby("Campaign_Name").agg({
            "Cost": "sum", "Revenue": "sum", "Gross_Profit": "sum",
            "CV": "sum", "MCV": "sum", "Clicks": "sum", "Beyond_Clicks": "sum", "Impressions": "sum"
        }).reset_index()
        
        grouped["CPA"] = grouped.apply(lambda x: safe_div(x["Cost"], x["CV"]), axis=1)
        grouped["ROAS"] = grouped.apply(lambda x: safe_div(x["Revenue"], x["Cost"]) * 100, axis=1)
        
        if view_mode == "合計":
             grouped["CVR"] = grouped.apply(lambda x: safe_div(x["CV"], x["Beyond_Clicks"]) * 100, axis=1)
        elif view_mode == "Beyond":
             grouped["CVR"] = grouped.apply(lambda x: safe_div(x["CV"], x["Clicks"]) * 100, axis=1)
        
        if view_mode == "Meta":
            cols = ["Campaign_Name", "Cost", "Impressions", "Clicks", "CV", "CPA"]
            rename = {"CV": "CV(MCV)", "Impressions": "Imp", "Clicks": "Click"}
        elif view_mode == "Beyond":
            cols = ["Campaign_Name", "Revenue", "Cost", "Gross_Profit", "ROAS", "CV", "CPA", "CVR"]
            rename = {"Gross_Profit": "粗利", "Revenue": "売上", "Cost": "出稿金額", "Clicks": "LP遷移"}
        else:
            cols = ["Campaign_Name", "Revenue", "Cost", "Gross_Profit", "ROAS", "CV", "CPA", "CVR"]
            rename = {"Gross_Profit": "粗利", "Revenue": "売上", "Cost": "出稿金額"}

        st.dataframe(grouped[cols].rename(columns=rename).style.format({
            "Revenue": "{:,.0f}", "売上": "{:,.0f}",
            "Cost": "{:,.0f}", "出稿金額": "{:,.0f}",
            "Gross_Profit": "{:,.0f}", "粗利": "{:,.0f}",
            "ROAS": "{:.1f}%", "CPA": "{:,.0f}",
            "CV": "{:,.0f}", "CV(MCV)": "{:,.0f}",
            "Imp": "{:,.0f}", "Impressions": "{:,.0f}",
            "Clicks": "{:,.0f}", "Click": "{:,.0f}",
            "CVR": "{:.1f}%"
        }), use_container_width=True)

    # Base DF for Period Tables (ignoring date filter)
    if view_mode == "Meta": df_base = df[df["Media"] == "Meta"]
    elif view_mode == "Beyond": df_base = df[df["Media"] == "Beyond"]
    else: df_base = df
    
    mask_base = pd.Series(True, index=df_base.index)
    if selected_campaign != "All": mask_base &= (df_base["Campaign_Name"] == selected_campaign)
    if selected_article != "All": mask_base &= (df_base["Creative"] == selected_article)
    if selected_creative != "All": mask_base &= (df_base["Creative"] == selected_creative)
    df_base = df_base[mask_base]

    c_today, c_yesterday = st.columns(2)
    with c_today: display_period_table(get_period_data(df_base, is_today=True), "案件別数値（当日）")
    with c_yesterday: display_period_table(get_period_data(df_base, is_yesterday=True), "案件別数値（昨日）")
        
    c_3days, c_7days = st.columns(2)
    with c_3days: display_period_table(get_period_data(df_base, days_back=2), "案件別数値（直近3日間）")
    with c_7days: display_period_table(get_period_data(df_base, days_back=6), "案件別数値（直近7日間）")

    st.markdown("---")
    display_period_table(df_filtered, "案件別数値（選択期間）")
    
    st.markdown("---")
    display_charts(df_filtered)

if __name__ == "__main__":
    main()
