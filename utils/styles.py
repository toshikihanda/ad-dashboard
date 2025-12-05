def get_custom_css():
    return """
    <style>
        /* 全体のフォントと背景 */
        .stApp {
            background-color: #FAFAFA; /* オフホワイト */
            color: #1F2937;
            font-family: 'Helvetica Neue', Arial, sans-serif;
        }
        
        /* ヘッダーエリア */
        h1 {
            color: #1F2937 !important;
            font-weight: 700 !important;
            font-size: 18px !important; /* 指定: 18px */
            border-bottom: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        
        h3 {
            color: #1F2937 !important;
            font-size: 16px !important;
            font-weight: 600 !important;
            margin-top: 24px !important;
            margin-bottom: 12px !important;
            padding-left: 8px;
            border-left: 4px solid #1F2937;
        }
        
        /* KPIカードのスタイル */
        .kpi-card {
            background-color: #FFFFFF;
            border-radius: 8px;
            padding: 16px;
            text-align: center;
            border: 1px solid #E5E7EB; /* 指定: #E5E7EB */
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            height: 100%;
        }
        
        .kpi-label {
            color: #6B7280; /* 指定: #6B7280 */
            font-size: 12px;
            margin-bottom: 4px;
            font-weight: 500;
        }
        
        .kpi-value {
            color: #1F2937;
            font-size: 28px;
            font-weight: 700;
            line-height: 1.2;
        }
        
        .kpi-unit {
            font-size: 14px;
            font-weight: 500;
            margin-left: 2px;
            color: #9CA3AF;
        }
        
        /* カラーアクセント */
        .text-blue { color: #3B82F6 !important; }
        .text-red { color: #DC3545 !important; }
        .text-green { color: #84CC16 !important; } /* 指定: ライムグリーン */
        .text-orange { color: #F59E0B !important; }
        
        /* タブ風ボタンのスタイル */
        div[data-testid="column"] button {
            background-color: #FFFFFF;
            color: #1F2937;
            padding: 10px 20px;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            transition: all 0.2s ease;
            cursor: pointer;
            font-weight: 700;
            font-size: 14px;
            white-space: nowrap;
            min-width: 90px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        div[data-testid="column"] button:hover {
            background-color: #F3F4F6;
            border-color: #D1D5DB;
        }
        
        /* プライマリボタン（選択中）のスタイル */
        div[data-testid="column"] button[kind="primary"] {
            background-color: #DC3545 !important;
            color: #FFFFFF !important;
            border-color: #DC3545 !important;
        }
        
        div[data-testid="column"] button[kind="primary"]:hover {
            background-color: #C82333 !important;
            border-color: #C82333 !important;
        }
        
        /* セカンダリボタン（未選択）のスタイル */
        div[data-testid="column"] button[kind="secondary"] {
            background-color: #FFFFFF !important;
            color: #1F2937 !important;
            border-color: #E5E7EB !important;
        }
        
        /* タブ風ラジオボタンのスタイル */
        div[role="radiogroup"] {
            display: flex;
            flex-direction: row;
            justify-content: center;
            gap: 0;
            background-color: transparent;
            border: none;
            padding: 0;
            width: 100%;
            margin: 0;
        }
        
        div[role="radiogroup"] label {
            background-color: #FFFFFF;
            color: #1F2937;
            padding: 8px 24px; /* 指定: 8px 24px */
            border: 1px solid #E5E7EB;
            border-radius: 6px !important; /* 指定: 6px */
            transition: all 0.2s ease;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 1;
            text-align: center;
            font-weight: 700; /* 指定: 太字 */
            font-size: 14px; /* 指定: 14px */
            white-space: nowrap;
            height: 40px;
            margin: 0 2px; /* ボタン間の隙間を少し空けるか、連結するか。要望は「整列」なので連結せず並べる */
        }
        
        /* 選択状態 */
        div[role="radiogroup"] label[aria-checked="true"] {
            background-color: #1F2937 !important; /* 指定: 濃いグレー/黒 */
            color: #FFFFFF !important;
            border-color: #1F2937 !important;
        }
        
        /* ラジオボタンの丸ポチを消す */
        div[role="radiogroup"] label > div:first-child {
            display: none;
        }
        
        div[role="radiogroup"] label p {
            font-size: 14px;
            margin: 0;
            padding: 0;
            line-height: 1;
        }
        
        /* テーブルのスタイル調整 */
        .stDataFrame {
            background-color: #FFFFFF;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
        }
        
        /* コンテナの余白 */
        .block-container {
            padding-top: 4rem; /* 1rem -> 4rem に変更してヘッダー被りを防ぐ */
            padding-bottom: 3rem;
            max-width: 100%;
        }
        
        /* フィルターエリアのスタイル */
        div[data-testid="stHorizontalBlock"] {
            gap: 1rem;
        }
        
        /* セレクトボックス */
        .stSelectbox label {
            font-size: 12px;
            color: #6B7280;
        }
    </style>
    """
