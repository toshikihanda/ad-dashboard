"""
Beyond データのフィルタ条件別調査スクリプト
"""
import pandas as pd
from urllib.parse import quote

SHEET_ID = "14pa730BytKIRONuhqljERM8ag8zm3bEew3zv6lXbMGU"
TARGET_DATE = "2025-12-16"

BEYOND_FOLDERS = [
    '【運用】SAC_成果',
    '【運用】SAC_予算',
    '【運用】ルーチェ_予算'
]

def load_sheet(sheet_name):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={quote(sheet_name)}"
    try:
        df = pd.read_csv(url)
        return df
    except Exception as e:
        print(f"Error loading {sheet_name}: {e}")
        return pd.DataFrame()

def investigate():
    print("=" * 70)
    print(f"Beyond データのフィルタ条件別調査 - 対象日: {TARGET_DATE}")
    print("=" * 70)
    
    # Beyond_History を読み込み
    df_history = load_sheet("Beyond_History")
    df_live = load_sheet("Beyond_Live")
    
    df = pd.concat([df_history, df_live], ignore_index=True)
    print(f"\n読み込み完了: {len(df)} 行")
    print(f"カラム: {list(df.columns)}")
    
    # 日付フィルタ
    df['date_jst'] = pd.to_datetime(df['date_jst']).dt.strftime('%Y-%m-%d')
    df_date = df[df['date_jst'] == TARGET_DATE].copy()
    print(f"\n{TARGET_DATE} のデータ: {len(df_date)} 行")
    
    # folder_name の正規化（全角スペース対応）
    df_date['folder_normalized'] = df_date['folder_name'].astype(str).str.replace('\u3000', ' ').str.strip()
    
    print("\n" + "=" * 70)
    print("【条件1】folder_name フィルタのみ（utm_creative フィルタなし）")
    print("=" * 70)
    
    df_folder = df_date[df_date['folder_normalized'].isin(BEYOND_FOLDERS)].copy()
    
    cost_folder = pd.to_numeric(df_folder['cost'], errors='coerce').fillna(0).sum()
    pv_folder = pd.to_numeric(df_folder['pv'], errors='coerce').fillna(0).sum()
    click_folder = pd.to_numeric(df_folder['click'], errors='coerce').fillna(0).sum()
    cv_folder = pd.to_numeric(df_folder['cv'], errors='coerce').fillna(0).sum()
    
    print(f"総行数: {len(df_folder)} 行")
    print(f"出稿金額 (cost): {cost_folder:,.0f} 円")
    print(f"PV: {pv_folder:,.0f}")
    print(f"Clicks: {click_folder:,.0f}")
    print(f"CV: {cv_folder:,.0f}")
    
    print("\n" + "=" * 70)
    print("【条件2】folder_name + utm_creative フィルタ")
    print("=" * 70)
    
    df_folder['parameter_str'] = df_folder['parameter'].astype(str).str.strip()
    df_utm = df_folder[df_folder['parameter_str'].str.startswith('utm_creative=')]
    
    cost_utm = pd.to_numeric(df_utm['cost'], errors='coerce').fillna(0).sum()
    pv_utm = pd.to_numeric(df_utm['pv'], errors='coerce').fillna(0).sum()
    click_utm = pd.to_numeric(df_utm['click'], errors='coerce').fillna(0).sum()
    cv_utm = pd.to_numeric(df_utm['cv'], errors='coerce').fillna(0).sum()
    
    print(f"総行数: {len(df_utm)} 行")
    print(f"出稿金額 (cost): {cost_utm:,.0f} 円")
    print(f"PV: {pv_utm:,.0f}")
    print(f"Clicks: {click_utm:,.0f}")
    print(f"CV: {cv_utm:,.0f}")
    
    print("\n" + "=" * 70)
    print("【条件3】parameter の内訳（conditions1のデータ）")
    print("=" * 70)
    
    # parameterのプレフィックスでグループ化
    def get_param_prefix(param):
        param = str(param).strip()
        if '=' in param:
            return param.split('=')[0] + '='
        return param[:20] if len(param) > 20 else param
    
    df_folder['param_prefix'] = df_folder['parameter_str'].apply(get_param_prefix)
    
    param_summary = df_folder.groupby('param_prefix').agg({
        'parameter': 'count',
        'cost': lambda x: pd.to_numeric(x, errors='coerce').fillna(0).sum()
    }).rename(columns={'parameter': 'count', 'cost': 'cost_sum'})
    
    param_summary = param_summary.sort_values('cost_sum', ascending=False)
    
    print(f"\n{'パラメータプレフィックス':<30} | {'件数':>6} | {'cost合計':>15}")
    print("-" * 60)
    for prefix, row in param_summary.iterrows():
        print(f"{prefix:<30} | {row['count']:>6} | {row['cost_sum']:>15,.0f} 円")
    
    print("\n" + "=" * 70)
    print("【サマリテーブル】")
    print("=" * 70)
    
    print("\n### フィルタ条件別の比較")
    print(f"| {'フィルタ条件':<25} | {'行数':>8} | {'出稿金額':>12} | {'PV':>8} | {'Clicks':>8} | {'CV':>6} |")
    print(f"|{'-'*27}|{'-'*10}|{'-'*14}|{'-'*10}|{'-'*10}|{'-'*8}|")
    print(f"| {'folder_name のみ':<25} | {len(df_folder):>8} | {cost_folder:>12,.0f} | {pv_folder:>8,.0f} | {click_folder:>8,.0f} | {cv_folder:>6,.0f} |")
    print(f"| {'folder_name + utm_creative':<25} | {len(df_utm):>8} | {cost_utm:>12,.0f} | {pv_utm:>8,.0f} | {click_utm:>8,.0f} | {cv_utm:>6,.0f} |")
    
    print("\n### Metaとの比較")
    meta_cost = 116437  # 前回の検証結果より
    print(f"| {'データソース':<30} | {'出稿金額':>15} |")
    print(f"|{'-'*32}|{'-'*17}|")
    print(f"| {'Meta（2025/12/16）':<30} | {meta_cost:>15,} 円 |")
    print(f"| {'Beyond（folder_nameのみ）':<30} | {cost_folder:>15,.0f} 円 |")
    print(f"| {'Beyond（utm_creative込み）':<30} | {cost_utm:>15,.0f} 円 |")
    
    print("\n" + "=" * 70)
    print("【考察】")
    print("=" * 70)
    
    reduction_pct = (1 - len(df_utm) / len(df_folder)) * 100 if len(df_folder) > 0 else 0
    cost_reduction_pct = (1 - cost_utm / cost_folder) * 100 if cost_folder > 0 else 0
    
    print(f"\n1. utm_creative フィルタによるデータ減少:")
    print(f"   - 行数: {len(df_folder)} → {len(df_utm)} 行 ({reduction_pct:.1f}% 減少)")
    print(f"   - 出稿金額: {cost_folder:,.0f} → {cost_utm:,.0f} 円 ({cost_reduction_pct:.1f}% 減少)")
    
    print(f"\n2. Metaの出稿金額（{meta_cost:,}円）との比較:")
    diff_folder = abs(meta_cost - cost_folder)
    diff_utm = abs(meta_cost - cost_utm)
    print(f"   - folder_nameのみ: 差額 {diff_folder:,.0f} 円")
    print(f"   - utm_creative込み: 差額 {diff_utm:,.0f} 円")
    
    if diff_folder < diff_utm:
        print(f"   → folder_nameのみの方がMetaに近い")
    else:
        print(f"   → utm_creative込みの方がMetaに近い")
    
    print(f"\n3. 提案:")
    if cost_folder > cost_utm * 10:  # フィルタで大幅に減少している場合
        print(f"   utm_creative フィルタによって多くのデータが除外されています。")
        print(f"   フィルタ条件の見直しを検討してください。")
        print(f"   例: utm_creative= だけでなく、utm_source= や utm_campaign= も含める")
    else:
        print(f"   現在のフィルタ条件は適切と思われます。")

if __name__ == "__main__":
    investigate()
