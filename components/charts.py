import plotly.graph_objects as go
import streamlit as st
import pandas as pd

# --- Color Palette ---
METRIC_COLORS = {
    "Revenue": "#3b82f6",       # Blue
    "Cost": "#ef4444",          # Red
    "Gross_Profit": "#f59e0b",  # Orange
    "CV": "#8b5cf6",            # Purple
    "CPA": "#6B7280",           # Gray
    "Recovery_Rate": "#22c55e", # Green
}

CAMPAIGN_COLORS = {
    "SAC_成果": "#3B82F6",      # Blue
    "SAC_予算": "#DC3545",      # Red
    "ルーチェ_予算": "#8B0000", # Dark Red
    "default": "#6B7280"        # Gray
}

def display_charts(df):
    """
    指定されたグラフ群を表示 (3カラムグリッドレイアウト)
    """
    if df.empty:
        st.warning("表示するデータがありません")
        return

    # 日次集計
    # 日次集計
    daily_df = df.groupby("Date").agg({
        "Revenue": "sum",
        "Cost": "sum",
        "Gross_Profit": "sum",
        "CV": "sum",
        "MCV": "sum",
        "Clicks": "sum",
        "Impressions": "sum"
    }).reset_index()
    
    # 計算指標追加
    daily_df["Recovery_Rate"] = (daily_df["Revenue"] / daily_df["Cost"] * 100).fillna(0)
    
    # 共通レイアウト設定
    layout_settings = dict(
        template="plotly_white",
        margin=dict(l=10, r=10, t=30, b=20),
        height=250, # 高さを少し抑える
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1, font=dict(size=10)),
        title=dict(font=dict(size=14))
    )

    def create_chart(metric_col, title, color, unit_format=None, is_bar=False):
        """
        単一指標のグラフを作成 (案件別積み上げ or 折れ線)
        """
        fig = go.Figure()
        
        # 案件ごとにループしてTrace追加
        for campaign in df["Campaign_Name"].unique():
            camp_df = df[df["Campaign_Name"] == campaign].groupby("Date").sum(numeric_only=True).reset_index()
            
            # 指標計算
            val = None
            if metric_col == "CPA": val = camp_df["Cost"] / camp_df["CV"]
            elif metric_col == "MCPA": val = camp_df["Cost"] / camp_df["MCV"]
            elif metric_col == "CPC": val = camp_df["Cost"] / camp_df["Clicks"]
            elif metric_col == "CPM": val = camp_df["Cost"] / camp_df["Impressions"] * 1000
            elif metric_col == "CTR": val = camp_df["Clicks"] / camp_df["Impressions"] * 100
            elif metric_col == "MCVR": val = camp_df["MCV"] / camp_df["Clicks"] * 100
            elif metric_col == "CVR": val = camp_df["CV"] / camp_df["Clicks"] * 100
            elif metric_col == "Recovery_Rate": val = camp_df["Revenue"] / camp_df["Cost"] * 100
            else: val = camp_df[metric_col]
            
            # NaN処理
            val = val.fillna(0)
            
            # グラフタイプ
            if is_bar:
                fig.add_trace(go.Bar(x=camp_df["Date"], y=val, name=campaign))
            else:
                fig.add_trace(go.Scatter(x=camp_df["Date"], y=val, name=campaign, mode='lines+markers'))

        layout = layout_settings.copy()
        layout["title"] = title
        if is_bar: layout["barmode"] = "stack"
        if unit_format: layout["yaxis"] = dict(tickformat=unit_format)
        
        fig.update_layout(**layout)
        return fig

    # --- Row 1: 売上, 出稿金額, 粗利 ---
    c1, c2, c3 = st.columns(3)
    with c1: st.plotly_chart(create_chart("Revenue", "売上", "#3498DB", is_bar=True), use_container_width=True)
    with c2: st.plotly_chart(create_chart("Cost", "出稿金額", "#E74C3C", is_bar=True), use_container_width=True)
    with c3: st.plotly_chart(create_chart("Gross_Profit", "粗利", "#F39C12"), use_container_width=True)

    # --- Row 2: 回収率, CV, CPA ---
    st.markdown("###")
    c4, c5, c6 = st.columns(3)
    with c4: st.plotly_chart(create_chart("Recovery_Rate", "回収率", "#2ECC71", unit_format=".0%"), use_container_width=True)
    with c5: st.plotly_chart(create_chart("CV", "CV数", "#2ECC71", is_bar=True), use_container_width=True)
    with c6: st.plotly_chart(create_chart("CPA", "CPA", "#6B7280"), use_container_width=True)

    # --- Row 3: MCPA, CPC, CPM ---
    st.markdown("###")
    c7, c8, c9 = st.columns(3)
    with c7: st.plotly_chart(create_chart("MCPA", "MCPA", "#9B59B6"), use_container_width=True)
    with c8: st.plotly_chart(create_chart("CPC", "CPC", "#34495E"), use_container_width=True)
    with c9: st.plotly_chart(create_chart("CPM", "CPM", "#95A5A6"), use_container_width=True)

    # --- Row 4: CTR, MCVR, CVR ---
    st.markdown("###")
    c10, c11, c12 = st.columns(3)
    with c10: st.plotly_chart(create_chart("CTR", "CTR", "#1ABC9C", unit_format=".1f%"), use_container_width=True)
    with c11: st.plotly_chart(create_chart("MCVR", "MCVR", "#16A085", unit_format=".1f%"), use_container_width=True)
    with c12: st.plotly_chart(create_chart("CVR", "CVR", "#27AE60", unit_format=".1f%"), use_container_width=True)
