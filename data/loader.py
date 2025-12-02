import pandas as pd
import streamlit as st
from urllib.parse import quote

# Google Sheet ID
SHEET_ID = "14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU"

def load_sheet_data(sheet_name):
    """
    Google Sheetsから指定されたシート名をCSVとして読み込む
    """
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={quote(sheet_name)}"
    try:
        df = pd.read_csv(url)
        return df
    except Exception as e:
        st.error(f"Failed to load {sheet_name}: {e}")
        return pd.DataFrame()

def load_data_from_sheets():
    """
    全シートのデータを読み込んで辞書で返す
    """
    # キャッシュを使って読み込みを高速化（TTL 10分）
    @st.cache_data(ttl=600)
    def _fetch_all():
        return {
            "Meta_Live": load_sheet_data("Meta_Live"),
            "Meta_History": load_sheet_data("Meta_History"),
            "Beyond_Live": load_sheet_data("Beyond_Live"),
            "Beyond_History": load_sheet_data("Beyond_History")
        }
    
    return _fetch_all()

# 後方互換性のため（app.pyの変更が完了するまで）
def generate_mock_data():
    return load_data_from_sheets()
