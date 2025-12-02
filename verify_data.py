import pandas as pd
from data.loader import load_data_from_sheets
from data.processor import process_data

def verify():
    print("--- 1. Loading Data ---")
    raw_data = load_data_from_sheets()
    for sheet, df in raw_data.items():
        print(f"Loaded {sheet}: {len(df)} rows")
        if not df.empty:
            print(f"  Columns: {list(df.columns)}")

    print("\n--- 2. Processing Data ---")
    processed_df = process_data(raw_data)
    
    if processed_df.empty:
        print("!! Processed DataFrame is EMPTY !!")
        return

    print(f"Processed Data: {len(processed_df)} rows")
    print(f"Columns: {list(processed_df.columns)}")
    
    print("\n--- 3. Campaign Check ---")
    campaigns = processed_df["Campaign_Name"].unique()
    print(f"Unique Campaigns: {campaigns}")
    
    expected_campaigns = ['SAC_成果', 'SAC_予算', 'ルーチェ_予算']
    for exp in expected_campaigns:
        if exp in campaigns:
            print(f"  [OK] Found {exp}")
        else:
            print(f"  [MISSING] {exp}")

    print("\n--- 4. Metric Check (Sample) ---")
    # Check totals
    total_cost = processed_df["Cost"].sum()
    total_revenue = processed_df["Revenue"].sum()
    total_cv = processed_df["CV"].sum()
    
    print(f"Total Cost: {total_cost:,.0f}")
    print(f"Total Revenue: {total_revenue:,.0f}")
    print(f"Total CV: {total_cv}")
    
    if total_cost > 0:
        print(f"Overall ROAS: {total_revenue / total_cost * 100:.1f}%")
        print(f"Overall CPA: {total_cost / total_cv:,.0f}" if total_cv > 0 else "Overall CPA: N/A")

    print("\n--- 5. Beyond Specific Check ---")
    beyond_df = processed_df[processed_df["Media"] == "Beyond"]
    print(f"Beyond Rows: {len(beyond_df)}")
    if not beyond_df.empty:
        print("Beyond Columns present:", [c for c in ["FV_Exit", "SV_Exit"] if c in beyond_df.columns])
        print(f"Total FV Exit: {beyond_df['FV_Exit'].sum()}")
        print(f"Total SV Exit: {beyond_df['SV_Exit'].sum()}")

    print("\n--- 6. Data Sample (Head) ---")
    print(processed_df[["Date", "Media", "Campaign_Name", "Cost", "Revenue", "CV"]].head().to_string())

if __name__ == "__main__":
    verify()
