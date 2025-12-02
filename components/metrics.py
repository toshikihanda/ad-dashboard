import streamlit as st

def display_kpi_metrics(df):
    """
    主要KPIを表示するコンポーネント (2行 x 6列)
    """
    # 集計
    total_revenue = df["Revenue"].sum()
    total_cost = df["Cost"].sum()
    total_profit = df["Gross_Profit"].sum()
    total_cv = df["CV"].sum()
    total_clicks = df["Clicks"].sum()
    total_imps = df["Impressions"].sum()
    total_product_lp = df["ProductLP"].sum()
    
    # 計算 (0除算回避)
    def safe_div(a, b):
        return a / b if b != 0 else 0

    recovery_rate = safe_div(total_revenue, total_cost) * 100
    cpa = safe_div(total_cost, total_cv)
    
    mcpa = safe_div(total_cost, total_product_lp)
    cpc = safe_div(total_cost, total_clicks)
    cpm = safe_div(total_cost, total_imps) * 1000
    
    ctr = safe_div(total_clicks, total_imps) * 100
    mcvr = safe_div(total_product_lp, total_clicks) * 100
    cvr = safe_div(total_cv, total_product_lp) * 100 # 画像定義に基づく

    # Helper function for card HTML
    def kpi_card(label, value, unit="", value_color_class=""):
        return f"""
        <div class="kpi-card">
            <div class="kpi-label">{label}</div>
            <div class="kpi-value {value_color_class}">{value}<span class="kpi-unit">{unit}</span></div>
        </div>
        """

    # --- 1行目 ---
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    
    with c1:
        st.markdown(kpi_card("売上", f"{total_revenue:,.0f}"), unsafe_allow_html=True)
    with c2:
        st.markdown(kpi_card("出稿金額", f"{total_cost:,.0f}"), unsafe_allow_html=True)
    with c3:
        st.markdown(kpi_card("粗利", f"{total_profit:,.0f}"), unsafe_allow_html=True)
    with c4:
        st.markdown(kpi_card("回収率", f"{recovery_rate:.1f}", "%", "text-green"), unsafe_allow_html=True)
    with c5:
        st.markdown(kpi_card("CV", f"{total_cv:,.0f}"), unsafe_allow_html=True)
    with c6:
        st.markdown(kpi_card("CPA", f"{cpa:,.0f}", "円", "text-green"), unsafe_allow_html=True)

    # --- 2行目 ---
    c7, c8, c9, c10, c11, c12 = st.columns(6)
    
    with c7:
        st.markdown(kpi_card("MCPA", f"{mcpa:,.0f}", "円", "text-green"), unsafe_allow_html=True)
    with c8:
        st.markdown(kpi_card("CPC", f"{cpc:,.0f}", "円", "text-green"), unsafe_allow_html=True)
    with c9:
        st.markdown(kpi_card("CPM", f"{cpm:,.0f}", "円", "text-green"), unsafe_allow_html=True)
    with c10:
        st.markdown(kpi_card("CTR", f"{ctr:.1f}", "%", "text-green"), unsafe_allow_html=True)
    with c11:
        st.markdown(kpi_card("MCVR", f"{mcvr:.1f}", "%", "text-green"), unsafe_allow_html=True)
    with c12:
        st.markdown(kpi_card("CVR", f"{cvr:.1f}", "%", "text-green"), unsafe_allow_html=True)
