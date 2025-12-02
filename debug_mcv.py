import pandas as pd
from data.loader import load_data_from_sheets
from data.processor import process_data

def debug():
    print("Loading data...")
    raw = load_data_from_sheets()
    print("Raw Meta Keys:", raw.get('Meta_Live', pd.DataFrame()).columns.tolist())
    
    df = process_data(raw)
    print("Processed Columns:", df.columns.tolist())
    
    if "MCV" in df.columns:
        print("MCV exists.")
    else:
        print("MCV MISSING!")

if __name__ == "__main__":
    debug()
