"""
データ検証スクリプト
スプレッドシートの生データとダッシュボードの表示値を比較
"""
import pandas as pd
from urllib.parse import quote

SHEET_ID = "14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU"
TARGET_DATE = "2025-12-16"

# 案件マッピング
ACCOUNT_MAPPING = {
    'allattain01': 'SAC_成果',
    'allattain05': 'SAC_予算',
    'allattain04': 'ルーチェ_予算'
}

BEYOND_NAME_MAPPING = {
    '【運用】SAC_成果': 'SAC_成果',
    '【運用】SAC_予算': 'SAC_予算',
    '【運用】ルーチェ_予算': 'ルーチェ_予算'
}

PROJECT_SETTINGS = {
    'SAC_成果': {'type': '成果', 'unit_price': 90000},
    'SAC_予算': {'type': '予算', 'fee_rate': 0.2},
    'ルーチェ_予算': {'type': '予算', 'fee_rate': 0.2}
}

def load_sheet(sheet_name):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={quote(sheet_name)}"
    try:
        df = pd.read_csv(url)
        return df
    except Exception as e:
        print(f"Error loading {sheet_name}: {e}")
        return pd.DataFrame()

def get_project_name(account_name):
    if pd.isna(account_name):
        return None
    for prefix, project in ACCOUNT_MAPPING.items():
        if str(account_name).startswith(prefix):
            return project
    return None

def verify_meta_data():
    print("=" * 60)
    print("【1】Metaデータの検証")
    print("=" * 60)
    
    # Meta_History を読み込み
    df_history = load_sheet("Meta_History")
    df_live = load_sheet("Meta_Live")
    
    print(f"\nMeta_History: {len(df_history)} 行")
    print(f"Meta_Live: {len(df_live)} 行")
    
    if df_history.empty and df_live.empty:
        print("データなし")
        return {}
    
    # 結合
    df = pd.concat([df_history, df_live], ignore_index=True)
    print(f"結合後: {len(df)} 行")
    print(f"カラム: {list(df.columns)}")
    
    # 日付フィルタ
    df['Day'] = pd.to_datetime(df['Day']).dt.strftime('%Y-%m-%d')
    df_date = df[df['Day'] == TARGET_DATE]
    print(f"\n{TARGET_DATE} のデータ: {len(df_date)} 行")
    
    # 案件マッピング
    df_date = df_date.copy()
    df_date['Campaign_Name'] = df_date['Account Name'].apply(get_project_name)
    df_filtered = df_date.dropna(subset=['Campaign_Name'])
    print(f"案件マッピング後: {len(df_filtered)} 行")
    
    # 案件別の内訳
    print("\n【案件別内訳】")
    for campaign in df_filtered['Campaign_Name'].unique():
        camp_df = df_filtered[df_filtered['Campaign_Name'] == campaign]
        print(f"  {campaign}: {len(camp_df)} 行")
    
    # 集計
    result = {
        'cost': pd.to_numeric(df_filtered['Amount Spent'], errors='coerce').fillna(0).sum(),
        'impressions': pd.to_numeric(df_filtered['Impressions'], errors='coerce').fillna(0).sum(),
        'clicks': pd.to_numeric(df_filtered['Link Clicks'], errors='coerce').fillna(0).sum(),
        'cv': pd.to_numeric(df_filtered['Results'], errors='coerce').fillna(0).sum(),
    }
    
    print("\n【スプレッドシート集計値】")
    print(f"  出稿金額 (Amount Spent): {result['cost']:,.0f} 円")
    print(f"  Imp (Impressions): {result['impressions']:,.0f}")
    print(f"  Clicks (Link Clicks): {result['clicks']:,.0f}")
    print(f"  CV (Results): {result['cv']:,.0f}")
    
    return result

def verify_beyond_data():
    print("\n" + "=" * 60)
    print("【2】Beyondデータの検証")
    print("=" * 60)
    
    # Beyond_History を読み込み
    df_history = load_sheet("Beyond_History")
    df_live = load_sheet("Beyond_Live")
    
    print(f"\nBeyond_History: {len(df_history)} 行")
    print(f"Beyond_Live: {len(df_live)} 行")
    
    if df_history.empty and df_live.empty:
        print("データなし")
        return {}
    
    # 結合
    df = pd.concat([df_history, df_live], ignore_index=True)
    print(f"結合後: {len(df)} 行")
    print(f"カラム: {list(df.columns)}")
    
    # 日付フィルタ
    df['date_jst'] = pd.to_datetime(df['date_jst']).dt.strftime('%Y-%m-%d')
    df_date = df[df['date_jst'] == TARGET_DATE]
    print(f"\n{TARGET_DATE} のデータ: {len(df_date)} 行")
    
    # folder_name フィルタ（全角スペース対応）
    df_date = df_date.copy()
    df_date['folder_normalized'] = df_date['folder_name'].astype(str).str.replace('\u3000', ' ').str.strip()
    df_folder = df_date[df_date['folder_normalized'].isin(BEYOND_NAME_MAPPING.keys())]
    print(f"folder_name フィルタ後: {len(df_folder)} 行")
    
    # utm_creative フィルタ
    df_folder = df_folder.copy()
    df_folder['parameter'] = df_folder['parameter'].astype(str).str.strip()
    df_utm = df_folder[df_folder['parameter'].str.startswith('utm_creative=')]
    print(f"utm_creative= フィルタ後: {len(df_utm)} 行")
    
    # 案件マッピング
    df_utm = df_utm.copy()
    df_utm['Campaign_Name'] = df_utm['folder_normalized'].map(BEYOND_NAME_MAPPING)
    
    # 案件別の内訳
    print("\n【案件別内訳】")
    campaign_data = {}
    for campaign in df_utm['Campaign_Name'].unique():
        camp_df = df_utm[df_utm['Campaign_Name'] == campaign]
        cost = pd.to_numeric(camp_df['cost'], errors='coerce').fillna(0).sum()
        cv = pd.to_numeric(camp_df['cv'], errors='coerce').fillna(0).sum()
        print(f"  {campaign}: {len(camp_df)} 行, cost={cost:,.0f}, cv={cv:.0f}")
        campaign_data[campaign] = {'cost': cost, 'cv': cv}
    
    # 集計
    result = {
        'cost': pd.to_numeric(df_utm['cost'], errors='coerce').fillna(0).sum(),
        'pv': pd.to_numeric(df_utm['pv'], errors='coerce').fillna(0).sum(),
        'clicks': pd.to_numeric(df_utm['click'], errors='coerce').fillna(0).sum(),
        'cv': pd.to_numeric(df_utm['cv'], errors='coerce').fillna(0).sum(),
        'campaign_data': campaign_data
    }
    
    print("\n【スプレッドシート集計値】")
    print(f"  出稿金額 (cost): {result['cost']:,.0f} 円")
    print(f"  PV (pv): {result['pv']:,.0f}")
    print(f"  Clicks (click): {result['clicks']:,.0f}")
    print(f"  CV (cv): {result['cv']:,.0f}")
    
    return result

def verify_revenue(beyond_data):
    print("\n" + "=" * 60)
    print("【3】売上計算の検証")
    print("=" * 60)
    
    campaign_data = beyond_data.get('campaign_data', {})
    total_revenue = 0
    
    print("\n【案件別売上計算】")
    for campaign, settings in PROJECT_SETTINGS.items():
        data = campaign_data.get(campaign, {'cost': 0, 'cv': 0})
        
        if settings['type'] == '成果':
            revenue = data['cv'] * settings['unit_price']
            print(f"  {campaign} (成果型): {data['cv']:.0f} CV × {settings['unit_price']:,} = {revenue:,.0f} 円")
        else:
            revenue = data['cost'] * settings['fee_rate']
            print(f"  {campaign} (予算型): {data['cost']:,.0f} × {settings['fee_rate']} = {revenue:,.0f} 円")
        
        total_revenue += revenue
    
    print(f"\n【合計売上】: {total_revenue:,.0f} 円")
    
    return total_revenue

def main():
    print("=" * 60)
    print(f"データ検証スクリプト - 対象日: {TARGET_DATE}")
    print("=" * 60)
    
    meta_data = verify_meta_data()
    beyond_data = verify_beyond_data()
    revenue = verify_revenue(beyond_data)
    
    print("\n" + "=" * 60)
    print("【結果サマリ】")
    print("=" * 60)
    
    print("\n### Metaデータ（スプレッドシート値）")
    print(f"| 指標 | 値 |")
    print(f"|------|-----|")
    print(f"| 出稿金額 | {meta_data.get('cost', 0):,.0f} 円 |")
    print(f"| Imp | {meta_data.get('impressions', 0):,.0f} |")
    print(f"| Clicks | {meta_data.get('clicks', 0):,.0f} |")
    print(f"| CV | {meta_data.get('cv', 0):,.0f} |")
    
    print("\n### Beyondデータ（スプレッドシート値）")
    print(f"| 指標 | 値 |")
    print(f"|------|-----|")
    print(f"| 出稿金額 | {beyond_data.get('cost', 0):,.0f} 円 |")
    print(f"| PV | {beyond_data.get('pv', 0):,.0f} |")
    print(f"| Clicks | {beyond_data.get('clicks', 0):,.0f} |")
    print(f"| CV | {beyond_data.get('cv', 0):,.0f} |")
    
    print(f"\n### 売上（計算値）: {revenue:,.0f} 円")
    
    print("\n" + "-" * 60)
    print("上記の値をダッシュボードの表示と比較してください")
    print("-" * 60)

if __name__ == "__main__":
    main()
