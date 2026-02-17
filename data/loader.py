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


def load_knowledge_data():
    """
    Knowledgeシートからナレッジデータを読み込む
    ナレッジは都度更新される可能性があるため、短いTTLでキャッシュ
    """
    @st.cache_data(ttl=300)  # 5分キャッシュ（ナレッジ更新に対応）
    def _fetch_knowledge():
        df = load_sheet_data("Knowledge")
        if df.empty:
            return pd.DataFrame()
        
        # カラム名を正規化（A列=Category, B列=Subcategory, C列=Knowledge）
        expected_columns = ['Category', 'Subcategory', 'Knowledge']
        if len(df.columns) >= 3:
            df.columns = expected_columns[:len(df.columns)] if len(df.columns) <= 3 else list(df.columns)
            # 最初の3列のみ使用
            if len(df.columns) > 3:
                df = df.iloc[:, :3]
                df.columns = expected_columns
        
        # 空行を除去
        df = df.dropna(subset=['Knowledge'])
        
        return df
    
    return _fetch_knowledge()


def get_knowledge_by_category(category=None, subcategory=None):
    """
    カテゴリ/サブカテゴリでフィルタリングしたナレッジを取得
    """
    df = load_knowledge_data()
    if df.empty:
        return df
    
    if category and category != "All":
        df = df[df['Category'] == category]
    
    if subcategory and subcategory != "All":
        df = df[df['Subcategory'] == subcategory]
    
    return df


def get_knowledge_categories():
    """
    ナレッジのカテゴリ一覧を取得
    """
    df = load_knowledge_data()
    if df.empty or 'Category' not in df.columns:
        return []
    return df['Category'].dropna().unique().tolist()


def get_knowledge_subcategories(category=None):
    """
    指定カテゴリのサブカテゴリ一覧を取得
    """
    df = load_knowledge_data()
    if df.empty or 'Subcategory' not in df.columns:
        return []
    
    if category and category != "All":
        df = df[df['Category'] == category]
    
    return df['Subcategory'].dropna().unique().tolist()


def format_knowledge_for_ai(df_knowledge, max_items=50):
    """
    AIに渡すためのナレッジをフォーマット
    トークン数を抑えるため、必要に応じて件数制限
    """
    if df_knowledge.empty:
        return ""
    
    # 件数が多い場合は制限
    if len(df_knowledge) > max_items:
        df_knowledge = df_knowledge.head(max_items)
    
    knowledge_text = []
    for _, row in df_knowledge.iterrows():
        category = row.get('Category', '')
        subcategory = row.get('Subcategory', '')
        knowledge = row.get('Knowledge', '')
        
        if knowledge:
            knowledge_text.append(f"【{category} / {subcategory}】{knowledge}")
    
    return "\n".join(knowledge_text)

# 後方互換性のため（app.pyの変更が完了するまで）
def generate_mock_data():
    return load_data_from_sheets()
