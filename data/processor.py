import pandas as pd
import numpy as np

# --- Settings ---
# Account Name Mapping (Prefix based)
ACCOUNT_MAPPING = {
    'allattain01': 'SAC_成果',
    'allattain05': 'SAC_予算',
    'allattain04': 'ルーチェ_予算'
}

# Beyond Folder Name Mapping
BEYOND_NAME_MAPPING = {
    '【運用】SAC_成果': 'SAC_成果',
    '【運用】SAC_予算': 'SAC_予算',
    '【運用】ルーチェ_予算': 'ルーチェ_予算'
}

PROJECT_SETTINGS = {
    'SAC_成果': {'type': '成果', 'unit_price': 90000, 'fee_rate': None},
    'SAC_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2},
    'ルーチェ_予算': {'type': '予算', 'unit_price': None, 'fee_rate': 0.2}
}

def safe_divide(numerator, denominator):
    if denominator == 0 or pd.isna(denominator):
        return 0
    return numerator / denominator

def get_project_name(account_name):
    """
    アカウント名の先頭一致で案件名を判定
    """
    if pd.isna(account_name): return None
    str_name = str(account_name)
    for key, value in ACCOUNT_MAPPING.items():
        if str_name.startswith(key):
            return value
    return None

def calculate_revenue_profit(row):
    """
    売上・粗利計算 (行レベル)
    ※ 合計タブの集計ロジックとは別。Beyondタブやデータフレーム作成時に使用。
    """
    project = row.get('Campaign_Name')
    if project not in PROJECT_SETTINGS:
        return 0, 0
    
    config = PROJECT_SETTINGS[project]
    cost = row.get('Cost', 0)
    cv = row.get('CV', 0)
    
    if config['type'] == '成果':
        # 成果型: CV * 単価
        revenue = cv * config['unit_price']
        # 粗利 = 売上 - コスト
        profit = revenue - cost
    else:
        # 予算型: コスト * 手数料率
        revenue = cost * config['fee_rate']
        # 粗利 = 売上 (手数料がそのまま粗利)
        profit = revenue
    
    return revenue, profit

def process_meta_data(df_live, df_history):
    # 1. Combine Live & History
    if not df_live.empty:
        df_live['Day'] = pd.to_datetime(df_live['Day']).dt.strftime('%Y-%m-%d')
    if not df_history.empty:
        df_history['Day'] = pd.to_datetime(df_history['Day']).dt.strftime('%Y-%m-%d')

    today = pd.Timestamp.now().strftime('%Y-%m-%d')
    history_filtered = df_history[df_history['Day'] < today] if not df_history.empty else pd.DataFrame()
    live_filtered = df_live[df_live['Day'] == today] if not df_live.empty else pd.DataFrame()
    
    combined = pd.concat([history_filtered, live_filtered], ignore_index=True)
    if combined.empty: return pd.DataFrame()

    # 2. Map Account Name -> Campaign_Name
    combined['Campaign_Name'] = combined['Account Name'].apply(get_project_name)
    combined = combined.dropna(subset=['Campaign_Name']) # マッピング対象外は除外

    # 3. Rename Columns
    # Metaデータ: Amount Spent -> Cost, Impressions -> Impressions, Link Clicks -> Clicks, Results -> MCV (Meta CV)
    rename_map = {
        'Day': 'Date',
        'Ad Name': 'Creative',
        'Amount Spent': 'Cost',
        'Impressions': 'Impressions',
        'Link Clicks': 'Clicks',
        'Results': 'MCV' # MetaのCVは「MCV」として扱う
    }
    combined.rename(columns=rename_map, inplace=True)
    combined['Date'] = pd.to_datetime(combined['Date'])
    
    # Ensure MCV exists (if Results column was missing)
    if 'MCV' not in combined.columns:
        combined['MCV'] = 0

    # 数値型変換
    for col in ['Cost', 'Impressions', 'Clicks', 'MCV']:
        if col in combined.columns:
            combined[col] = pd.to_numeric(combined[col], errors='coerce').fillna(0)

    combined['Media'] = 'Meta'
    
    # Metaデータには「本CV」はないとする（合計タブではBeyondのCVを使うため）
    # ただしMetaタブ単体で見るときは Results = CV とみなす場合もあるが、
    # 今回の要件では「MetaタブのKPI: CV = meta_data['Results']」となっているため、
    # 便宜上 CV カラムも作っておく（中身はMCVと同じ）
    combined['CV'] = combined['MCV'] 

    # 売上・粗利計算 (Metaデータ用)
    # 予算型: Cost * fee_rate
    # 成果型: Metaデータからは売上発生せず(Beyond CVで計上)。粗利は -Cost。
    def calc_meta_rev_prof(row):
        project = row.get('Campaign_Name')
        if project not in PROJECT_SETTINGS:
            return 0, 0
        
        config = PROJECT_SETTINGS[project]
        cost = row.get('Cost', 0)
        
        if config['type'] == '成果':
            # 成果型: Meta側は売上0, 粗利 = -Cost
            revenue = 0
            profit = -cost
        else:
            # 予算型: 売上 = Cost * fee, 粗利 = 売上
            revenue = cost * config['fee_rate']
            profit = revenue
        return revenue, profit

    rev_prof = combined.apply(calc_meta_rev_prof, axis=1, result_type='expand')
    combined['Revenue'] = rev_prof[0]
    combined['Gross_Profit'] = rev_prof[1]

    return combined

def process_beyond_data(df_live, df_history):
    # 0. 必須カラムのチェック
    required_cols = ['date_jst', 'folder_name', 'parameter']
    
    # 1. Combine
    if not df_live.empty and 'date_jst' in df_live.columns:
        df_live['date_jst'] = pd.to_datetime(df_live['date_jst']).dt.strftime('%Y-%m-%d')
    elif not df_live.empty:
        print(f"[WARNING] Beyond_Live: 必須カラムがありません。存在するカラム: {list(df_live.columns)}")
        df_live = pd.DataFrame()
        
    if not df_history.empty and 'date_jst' in df_history.columns:
        df_history['date_jst'] = pd.to_datetime(df_history['date_jst']).dt.strftime('%Y-%m-%d')
    elif not df_history.empty:
        print(f"[WARNING] Beyond_History: 必須カラムがありません。存在するカラム: {list(df_history.columns)}")
        df_history = pd.DataFrame()
        
    today = pd.Timestamp.now().strftime('%Y-%m-%d')
    history_filtered = df_history[df_history['date_jst'] < today] if not df_history.empty else pd.DataFrame()
    live_filtered = df_live[df_live['date_jst'] == today] if not df_live.empty else pd.DataFrame()
    
    combined = pd.concat([history_filtered, live_filtered], ignore_index=True)
    if combined.empty: return pd.DataFrame()
    
    # 必須カラムの最終チェック
    for col in required_cols:
        if col not in combined.columns:
            print(f"[ERROR] Beyond: 必須カラム '{col}' が見つかりません")
            return pd.DataFrame()

    # 2. Filter & Map (表記ゆれ対策: 全角スペース→半角、前後空白除去)
    combined['folder_name'] = (
        combined['folder_name'].astype(str).str.replace('\u3000', ' ').str.strip()
    )
    combined = combined[combined['folder_name'].isin(BEYOND_NAME_MAPPING.keys())].copy()
    
    if combined.empty:
        print("[WARNING] Beyond: 対象案件(folder_name)に該当するデータがありません")
        return pd.DataFrame()
    
    # 3. utm_creative= で始まる行のみ採用（必須フィルタ）
    combined['parameter'] = combined['parameter'].astype(str).str.strip()
    combined = combined[combined['parameter'].str.startswith('utm_creative=')]
    
    if combined.empty:
        print("[WARNING] Beyond: utm_creative= に該当する行が0件です")
        return pd.DataFrame()
    
    # 4. 監査ログ: 日付×案件別の取り込み行数を出力
    audit_log = combined.groupby(['date_jst', 'folder_name']).size().reset_index(name='row_count')
    print("\n[AUDIT LOG] Beyond取り込み行数 (日付×案件):")
    for _, row in audit_log.iterrows():
        status = "⚠️ 警告: 0行" if row['row_count'] == 0 else f"✓ {row['row_count']}行"
        print(f"  {row['date_jst']} | {row['folder_name']} | {status}")
    
    # 欠落検知: 各日付で全案件のデータがあるかチェック
    all_dates = audit_log['date_jst'].unique()
    expected_folders = list(BEYOND_NAME_MAPPING.keys())
    for date in all_dates:
        date_data = audit_log[audit_log['date_jst'] == date]
        existing_folders = date_data['folder_name'].tolist()
        missing_folders = [f for f in expected_folders if f not in existing_folders]
        if missing_folders:
            print(f"[WARNING] {date}: 以下の案件データが欠落しています: {missing_folders}")
    
    combined['Campaign_Name'] = combined['folder_name'].map(BEYOND_NAME_MAPPING)
    
    # 3. Rename
    # Beyondデータ: cost -> Cost, pv -> PV, click -> Clicks(商品LP遷移), cv -> CV
    rename_map = {
        'date_jst': 'Date',
        'parameter': 'Creative',
        'cost': 'Cost',
        'pv': 'PV',
        'click': 'Clicks', # 商品LP遷移
        'cv': 'CV',
        'fv_exit': 'FV_Exit',
        'sv_exit': 'SV_Exit'
    }
    combined.rename(columns=rename_map, inplace=True)
    combined['Date'] = pd.to_datetime(combined['Date'])
    
    # 数値変換
    cols = ['Cost', 'PV', 'Clicks', 'CV', 'FV_Exit', 'SV_Exit']
    for col in cols:
        if col in combined.columns:
            combined[col] = pd.to_numeric(combined[col], errors='coerce').fillna(0)
            
    combined['Media'] = 'Beyond'
    
    # 売上・粗利計算 (Beyondデータ用)
    rev_prof = combined.apply(calculate_revenue_profit, axis=1, result_type='expand')
    combined['Revenue'] = rev_prof[0]
    combined['Gross_Profit'] = rev_prof[1]

    return combined

def process_data(data_dict):
    """
    データ処理メイン関数
    """
    df_meta = process_meta_data(data_dict.get('Meta_Live', pd.DataFrame()), 
                                data_dict.get('Meta_History', pd.DataFrame()))
    
    df_beyond = process_beyond_data(data_dict.get('Beyond_Live', pd.DataFrame()), 
                                    data_dict.get('Beyond_History', pd.DataFrame()))
    
    # 結合して返す (Mediaカラムで区別)
    # 共通カラム: Date, Campaign_Name, Media, Cost, Creative
    # Meta固有: Impressions, MCV
    # Beyond固有: PV, FV_Exit, SV_Exit, Revenue, Gross_Profit
    # 共通だが意味が違う: Clicks (Meta=Link Click, Beyond=商品LP遷移)
    # CV (Meta=Results, Beyond=CV)
    
    df_all = pd.concat([df_meta, df_beyond], ignore_index=True)
    return df_all

