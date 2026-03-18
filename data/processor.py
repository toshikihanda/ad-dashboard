import pandas as pd
import numpy as np
import re

# --- Master (Master_Setting) ---
MASTER_REQUIRED_COLS = [
    "管理用案件名",
    "Meta名",
    "Beyond名",
    "運用タイプ",
    "成果単価",
    "手数料率",
    "Meta CV名",
]

def _normalize_text(value: object) -> str:
    """
    マッチング用の文字列正規化。
    - 全角/半角カッコ類を除去
    - 全角スペース→半角
    - 連続空白を1つに
    - lower
    """
    if value is None or pd.isna(value):
        return ""
    s = str(value)
    s = s.replace("\u3000", " ")
    s = re.sub(r"[\[\]［］\(\)（）【】]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.lower()

def _to_float(value: object) -> float:
    if value is None or pd.isna(value):
        return 0.0
    try:
        return float(value)
    except Exception:
        return float(pd.to_numeric(pd.Series([value]), errors="coerce").fillna(0).iloc[0])

def build_master_rules(df_master: pd.DataFrame) -> dict:
    """
    Master_Setting から案件判定/売上計算に必要なルールを構築。
    戻り値:
      {
        "projects": {管理用案件名: {type, unit_price, fee_rate, meta_cv_name}},
        "meta_tokens": [(token_norm, 管理用案件名), ...]  # 長い順
        "beyond_tokens": [(token_norm, 管理用案件名), ...]  # 長い順
      }
    """
    if df_master is None or df_master.empty:
        return {"projects": {}, "meta_tokens": [], "beyond_tokens": []}

    # 列名を揃える（余計な空白対策）
    df = df_master.copy()
    df.columns = [str(c).strip() for c in df.columns]

    # 必須列がない場合でもできる範囲で続行（列欠けは空扱い）
    for col in MASTER_REQUIRED_COLS:
        if col not in df.columns:
            df[col] = None

    # 空行を除去（管理用案件名が空は無効）
    df = df.dropna(subset=["管理用案件名"])
    if df.empty:
        return {"projects": {}, "meta_tokens": [], "beyond_tokens": []}

    projects = {}
    meta_tokens = []
    beyond_tokens = []

    for _, row in df.iterrows():
        project = str(row.get("管理用案件名", "")).strip()
        if not project:
            continue

        op_type = str(row.get("運用タイプ", "")).strip()  # 成果/予算/IH など
        unit_price = _to_float(row.get("成果単価"))
        fee_rate = _to_float(row.get("手数料率"))
        meta_cv_name = str(row.get("Meta CV名", "")).strip()

        projects[project] = {
            "type": op_type,
            "unit_price": unit_price,
            "fee_rate": fee_rate,
            "meta_cv_name": meta_cv_name,
        }

        meta_name = row.get("Meta名")
        beyond_name = row.get("Beyond名")

        meta_token = _normalize_text(meta_name)
        beyond_token = _normalize_text(beyond_name)

        if meta_token:
            meta_tokens.append((meta_token, project))
        if beyond_token:
            beyond_tokens.append((beyond_token, project))

    # 長いトークン優先（部分一致の誤マッチ対策）
    meta_tokens.sort(key=lambda x: len(x[0]), reverse=True)
    beyond_tokens.sort(key=lambda x: len(x[0]), reverse=True)

    return {"projects": projects, "meta_tokens": meta_tokens, "beyond_tokens": beyond_tokens}

def safe_divide(numerator, denominator):
    """0除算を防ぐ関数"""
    if denominator == 0 or pd.isna(denominator) or denominator is None:
        return 0
    return numerator / denominator

def _match_project(text: object, tokens: list[tuple[str, str]]) -> str | None:
    """
    tokens: [(token_norm, project), ...]
    text に token が含まれれば project を返す（長いtoken優先）
    """
    s = _normalize_text(text)
    if not s:
        return None
    for token, project in tokens:
        if token and token in s:
            return project
    return None

def calculate_revenue_profit(row, project_settings):
    """
    売上・粗利計算 (行レベル)
    ※ 合計タブの集計ロジックとは別。Beyondタブやデータフレーム作成時に使用。
    """
    project = row.get('Campaign_Name')
    if project not in project_settings:
        return 0, 0
    
    config = project_settings[project]
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

def process_meta_data(df_live, df_history, master_rules: dict | None = None):
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

    rules = master_rules or {"projects": {}, "meta_tokens": [], "beyond_tokens": []}
    project_settings = rules.get("projects", {})
    meta_tokens = rules.get("meta_tokens", [])

    # 2. Map Campaign Name -> Campaign_Name (管理用案件名)
    # Account Nameによる縛りは廃止し、Campaign Nameに含まれるワードで判定する。
    # Campaign Name が無い場合は fallback として Ad Name / Ad Set Name を試す。
    campaign_col_candidates = ["Campaign Name", "Campaign", "campaign_name"]
    campaign_col = next((c for c in campaign_col_candidates if c in combined.columns), None)

    if campaign_col is None:
        # 極端なケース: Campaign Name列が無ければ、できるだけ落とさずに見える化する
        combined["Campaign_Name"] = "Unmapped"
    else:
        combined["Campaign_Name"] = combined[campaign_col].apply(lambda x: _match_project(x, meta_tokens) or "Unmapped")

    # 3. Rename Columns
    # Metaデータ: Amount Spent -> Cost, Impressions -> Impressions, Link Clicks -> Clicks
    rename_map = {
        'Day': 'Date',
        'Ad Name': 'Creative',
        'Amount Spent': 'Cost',
        'Impressions': 'Impressions',
        'Link Clicks': 'Clicks',
    }
    combined.rename(columns=rename_map, inplace=True)
    combined['Date'] = pd.to_datetime(combined['Date'])
    
    # 4. Meta CV列の決定（案件別に Master_Setting["Meta CV名"] を優先）
    # - 指定列が存在すればそれを使用
    # - 無ければ Results を使用
    # - どちらも無ければ 0
    combined["MCV"] = 0
    has_results = "Results" in combined.columns

    if project_settings:
        for project, conf in project_settings.items():
            cv_col = str(conf.get("meta_cv_name", "")).strip()
            mask = combined["Campaign_Name"] == project
            if not mask.any():
                continue
            if cv_col and cv_col in combined.columns:
                combined.loc[mask, "MCV"] = pd.to_numeric(combined.loc[mask, cv_col], errors="coerce").fillna(0)
            elif has_results:
                combined.loc[mask, "MCV"] = pd.to_numeric(combined.loc[mask, "Results"], errors="coerce").fillna(0)
            else:
                combined.loc[mask, "MCV"] = 0
    else:
        if has_results:
            combined["MCV"] = pd.to_numeric(combined["Results"], errors="coerce").fillna(0)

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

    # 重複除外（ユーザー指定キー）
    # 日付×Account Name×Campaign Name×Ad Set Name×Ad Name が一致する行は同一扱い
    dedupe_cols = ["Date", "Account Name", "Campaign Name", "Ad Set Name", "Ad Name"]
    dedupe_cols = [c for c in dedupe_cols if c in combined.columns]
    if len(dedupe_cols) >= 2:
        combined = combined.drop_duplicates(subset=dedupe_cols, keep="last").copy()

    # 売上・粗利（行レベル）はここでは0にしておく（合計タブで案件単位で再計算した方が安全）
    # ただし予算/IHの案件は Meta Cost から手数料売上を算出できるので、参考値として入れる
    combined["Revenue"] = 0.0
    combined["Gross_Profit"] = 0.0
    if project_settings:
        for project, conf in project_settings.items():
            if str(conf.get("type", "")).strip() in ("予算", "IH"):
                fee = float(conf.get("fee_rate", 0) or 0)
                mask = combined["Campaign_Name"] == project
                if mask.any():
                    combined.loc[mask, "Revenue"] = combined.loc[mask, "Cost"] * fee
                    combined.loc[mask, "Gross_Profit"] = combined.loc[mask, "Revenue"]

    return combined

def process_beyond_data(df_live, df_history, master_rules: dict | None = None):
    rules = master_rules or {"projects": {}, "meta_tokens": [], "beyond_tokens": []}
    project_settings = rules.get("projects", {})
    beyond_tokens = rules.get("beyond_tokens", [])

    # 0. 必須カラムのチェック（date_jst/parameterは必須、PageName/Verは候補から推測）
    required_cols = ['date_jst', 'parameter']
    
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

    # 2. PageName/Ver.Name の列推測（Master_Setting の Beyond名 は PageName に含まれる想定）
    page_candidates = [
        "Beyond PageName",
        "Beyond Pagename",
        "beyond_page_name",
        "PageName",
        "Pagename",
        "page_name",
        "pageName",
        "page",
        "folder_name",  # fallback
    ]
    ver_candidates = [
        "Ver.Name",
        "Ver Name",
        "ver_name",
        "verName",
        "version_name",
        "version",
        "version_name",
    ]

    page_col = next((c for c in page_candidates if c in combined.columns), None)
    ver_col = next((c for c in ver_candidates if c in combined.columns), None)

    if page_col is None:
        print("[WARNING] Beyond: PageName列が見つかりません（案件判定が Unmapped になります）")
        combined["_page_for_match"] = ""
    else:
        combined["_page_for_match"] = combined[page_col]

    # 3. 案件判定（Beyond名 token が PageName に含まれるかで管理用案件名に正規化）
    combined["Campaign_Name"] = combined["_page_for_match"].apply(lambda x: _match_project(x, beyond_tokens) or "Unmapped")

    # 4. 重複除外（ユーザー指定キー）
    # 日付×Beyond PageName×Ver.Name×Parameter が一致する行は同一扱い
    dedupe_cols = ["date_jst"]
    if page_col:
        dedupe_cols.append(page_col)
    if ver_col:
        dedupe_cols.append(ver_col)
    dedupe_cols.append("parameter")
    dedupe_cols = [c for c in dedupe_cols if c in combined.columns]
    if len(dedupe_cols) >= 2:
        combined = combined.drop_duplicates(subset=dedupe_cols, keep="last").copy()
    
    # 5. Rename
    # Beyondデータ:
    #  - cost -> Cost
    #  - pv -> PV
    #  - click -> Clicks(商品LP遷移)
    #  - cv -> CV
    #  - PageName を Creative として扱う（ダッシュボードの「記事」フィルタで使えるように）
    rename_map = {
        'date_jst': 'Date',
        'parameter': 'Parameter',
        'cost': 'Cost',
        'pv': 'PV',
        'click': 'Clicks', # 商品LP遷移
        'cv': 'CV',
        'fv_exit': 'FV_Exit',
        'sv_exit': 'SV_Exit'
    }
    combined.rename(columns=rename_map, inplace=True)
    combined['Date'] = pd.to_datetime(combined['Date'])

    # Creative（記事用表示）を作成
    if page_col and page_col in combined.columns:
        combined["Creative"] = combined[page_col].astype(str)
    else:
        combined["Creative"] = ""
    
    # 数値変換
    cols = ['Cost', 'PV', 'Clicks', 'CV', 'FV_Exit', 'SV_Exit']
    for col in cols:
        if col in combined.columns:
            combined[col] = pd.to_numeric(combined[col], errors='coerce').fillna(0)
            
    combined['Media'] = 'Beyond'

    # 売上・粗利計算 (Beyondデータ用, マスタベース)
    combined["Revenue"] = 0.0
    combined["Gross_Profit"] = 0.0
    if project_settings:
        def calc_beyond_row(row):
            project = row.get("Campaign_Name")
            conf = project_settings.get(project)
            if not conf:
                return 0, 0
            t = str(conf.get("type", "")).strip()
            cost = row.get("Cost", 0)
            cv = row.get("CV", 0)
            if t == "成果":
                revenue = cv * float(conf.get("unit_price", 0) or 0)
                profit = revenue - cost
            else:
                fee = float(conf.get("fee_rate", 0) or 0)
                revenue = cost * fee
                profit = revenue
            return revenue, profit

        rev_prof = combined.apply(calc_beyond_row, axis=1, result_type="expand")
        combined["Revenue"] = rev_prof[0]
        combined["Gross_Profit"] = rev_prof[1]

    return combined

def process_data(data_dict):
    """
    データ処理メイン関数
    """
    master_rules = build_master_rules(data_dict.get("Master_Setting", pd.DataFrame()))

    df_meta = process_meta_data(
        data_dict.get('Meta_Live', pd.DataFrame()),
        data_dict.get('Meta_History', pd.DataFrame()),
        master_rules=master_rules
    )
    
    df_beyond = process_beyond_data(
        data_dict.get('Beyond_Live', pd.DataFrame()),
        data_dict.get('Beyond_History', pd.DataFrame()),
        master_rules=master_rules
    )
    
    # 結合して返す (Mediaカラムで区別)
    # 共通カラム: Date, Campaign_Name, Media, Cost, Creative
    # Meta固有: Impressions, MCV
    # Beyond固有: PV, FV_Exit, SV_Exit, Revenue, Gross_Profit
    # 共通だが意味が違う: Clicks (Meta=Link Click, Beyond=商品LP遷移)
    # CV (Meta=Results, Beyond=CV)
    
    df_all = pd.concat([df_meta, df_beyond], ignore_index=True)
    return df_all

