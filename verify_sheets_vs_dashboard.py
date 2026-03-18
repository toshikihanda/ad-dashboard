"""
4シート（Meta_Live/Meta_History/Beyond_Live/Beyond_History）の値と、
ダッシュボードで使う processed_df（process_data）を突き合わせて検証するスクリプト。

目的:
- Live/History の分担（今日=Live/過去=History）が想定通りか
- 重複除外の影響で「シート合計」と「ダッシュボード表示（processed）」に差が出ていないか
- Master_Setting（案件判定/Meta CV列選択）適用後の集計が妥当か
"""

from __future__ import annotations

import pandas as pd

from data.loader import load_data_from_sheets
from data.processor import process_data, build_master_rules


def _today_str() -> str:
    return pd.Timestamp.now().strftime("%Y-%m-%d")


def _coerce_date(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce").dt.strftime("%Y-%m-%d")


def _num(df: pd.DataFrame, col: str) -> pd.Series:
    if col not in df.columns:
        return pd.Series([0] * len(df))
    return pd.to_numeric(df[col], errors="coerce").fillna(0)


def _sum(df: pd.DataFrame, col: str) -> float:
    if df.empty or col not in df.columns:
        return 0.0
    return float(_num(df, col).sum())


def _print_kv(title: str, rows: list[tuple[str, object]]) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)
    for k, v in rows:
        print(f"{k:<30} {v}")


def _filter_range(df: pd.DataFrame, date_col: str, start: str, end: str) -> pd.DataFrame:
    if df.empty or date_col not in df.columns:
        return df
    d = pd.to_datetime(df[date_col], errors="coerce")
    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end)
    return df[(d >= start_ts) & (d <= end_ts)].copy()


def _meta_combine(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    live = raw.get("Meta_Live", pd.DataFrame()).copy()
    hist = raw.get("Meta_History", pd.DataFrame()).copy()
    if not live.empty and "Day" in live.columns:
        live["Day"] = _coerce_date(live["Day"])
    if not hist.empty and "Day" in hist.columns:
        hist["Day"] = _coerce_date(hist["Day"])
    today = _today_str()
    hist_f = hist[hist.get("Day", "") < today] if not hist.empty else pd.DataFrame()
    live_f = live[live.get("Day", "") == today] if not live.empty else pd.DataFrame()
    return pd.concat([hist_f, live_f], ignore_index=True)


def _beyond_combine(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    live = raw.get("Beyond_Live", pd.DataFrame()).copy()
    hist = raw.get("Beyond_History", pd.DataFrame()).copy()
    if not live.empty and "date_jst" in live.columns:
        live["date_jst"] = _coerce_date(live["date_jst"])
    if not hist.empty and "date_jst" in hist.columns:
        hist["date_jst"] = _coerce_date(hist["date_jst"])
    today = _today_str()
    hist_f = hist[hist.get("date_jst", "") < today] if not hist.empty else pd.DataFrame()
    live_f = live[live.get("date_jst", "") == today] if not live.empty else pd.DataFrame()
    return pd.concat([hist_f, live_f], ignore_index=True)


def _apply_meta_dedupe(df: pd.DataFrame) -> pd.DataFrame:
    # 日付×Account Name×Campaign Name×Ad Set Name×Ad Name
    cols = ["Day", "Account Name", "Campaign Name", "Ad Set Name", "Ad Name"]
    cols = [c for c in cols if c in df.columns]
    if len(cols) < 2:
        return df
    return df.drop_duplicates(subset=cols, keep="last").copy()


def _apply_beyond_dedupe(df: pd.DataFrame) -> pd.DataFrame:
    # 日付×beyond_page_name×version_name×parameter
    cols = ["date_jst", "beyond_page_name", "version_name", "parameter"]
    cols = [c for c in cols if c in df.columns]
    if len(cols) < 2:
        return df
    return df.drop_duplicates(subset=cols, keep="last").copy()


def main() -> None:
    raw = load_data_from_sheets()
    processed = process_data(raw)
    rules = build_master_rules(raw.get("Master_Setting", pd.DataFrame()))

    today = pd.Timestamp.now().normalize()
    start_7d = (today - pd.Timedelta(days=6)).strftime("%Y-%m-%d")
    end_today = today.strftime("%Y-%m-%d")
    start_y = (today - pd.Timedelta(days=1)).strftime("%Y-%m-%d")

    meta_raw = _meta_combine(raw)
    beyond_raw = _beyond_combine(raw)

    _print_kv(
        "ロード状況（行数）",
        [
            ("Meta_Live rows", len(raw.get("Meta_Live", pd.DataFrame()))),
            ("Meta_History rows", len(raw.get("Meta_History", pd.DataFrame()))),
            ("Beyond_Live rows", len(raw.get("Beyond_Live", pd.DataFrame()))),
            ("Beyond_History rows", len(raw.get("Beyond_History", pd.DataFrame()))),
            ("Master_Setting rows", len(raw.get("Master_Setting", pd.DataFrame()))),
            ("Meta combined rows", len(meta_raw)),
            ("Beyond combined rows", len(beyond_raw)),
            ("Processed rows", len(processed)),
        ],
    )

    # まず dedupe 前後をチェック（差が出るなら重複が入っている）
    meta_raw_dd = _apply_meta_dedupe(meta_raw)
    beyond_raw_dd = _apply_beyond_dedupe(beyond_raw)
    _print_kv(
        "重複除外（raw）前後の差分",
        [
            ("Meta combined -> deduped", f"{len(meta_raw)} -> {len(meta_raw_dd)}"),
            ("Beyond combined -> deduped", f"{len(beyond_raw)} -> {len(beyond_raw_dd)}"),
        ],
    )

    # 期間別に raw(deduped) vs processed を比較
    ranges = [
        ("当日", end_today, end_today),
        ("昨日", start_y, start_y),
        ("直近7日", start_7d, end_today),
    ]

    meta_cv_cols = []
    for _, conf in (rules.get("projects", {}) or {}).items():
        c = str(conf.get("meta_cv_name", "")).strip()
        if c:
            meta_cv_cols.append(c)
    meta_cv_cols = sorted(set(meta_cv_cols))

    for label, start, end in ranges:
        meta_raw_r = _filter_range(meta_raw_dd, "Day", start, end)
        beyond_raw_r = _filter_range(beyond_raw_dd, "date_jst", start, end)

        proc_r = _filter_range(processed, "Date", start, end)
        proc_meta = proc_r[proc_r.get("Media") == "Meta"].copy()
        proc_beyond = proc_r[proc_r.get("Media") == "Beyond"].copy()

        # Meta raw totals
        raw_meta_cost = _sum(meta_raw_r, "Amount Spent")
        raw_meta_imp = _sum(meta_raw_r, "Impressions")
        raw_meta_click = _sum(meta_raw_r, "Link Clicks")
        raw_meta_results = _sum(meta_raw_r, "Results")
        raw_meta_cv_named = {c: _sum(meta_raw_r, c) for c in meta_cv_cols}

        # Beyond raw totals
        raw_b_cost = _sum(beyond_raw_r, "cost")
        raw_b_pv = _sum(beyond_raw_r, "pv")
        raw_b_click = _sum(beyond_raw_r, "click")
        raw_b_cv = _sum(beyond_raw_r, "cv")

        # Processed totals
        proc_meta_cost = _sum(proc_meta, "Cost")
        proc_meta_imp = _sum(proc_meta, "Impressions")
        proc_meta_click = _sum(proc_meta, "Clicks")
        proc_meta_mcv = _sum(proc_meta, "MCV")

        proc_b_cost = _sum(proc_beyond, "Cost")
        proc_b_pv = _sum(proc_beyond, "PV")
        proc_b_click = _sum(proc_beyond, "Clicks")
        proc_b_cv = _sum(proc_beyond, "CV")
        proc_b_rev = _sum(proc_beyond, "Revenue")

        # Unmapped counts (processed)
        unmapped_total = int((proc_r.get("Campaign_Name") == "Unmapped").sum()) if "Campaign_Name" in proc_r.columns else 0
        unmapped_meta = int(((proc_meta.get("Campaign_Name") == "Unmapped")).sum()) if "Campaign_Name" in proc_meta.columns else 0
        unmapped_beyond = int(((proc_beyond.get("Campaign_Name") == "Unmapped")).sum()) if "Campaign_Name" in proc_beyond.columns else 0

        rows = [
            (f"[{label}] 期間", f"{start} 〜 {end}"),
            ("RAW Meta Cost", f"{raw_meta_cost:,.0f}"),
            ("PROC Meta Cost", f"{proc_meta_cost:,.0f}"),
            ("RAW Meta Imp", f"{raw_meta_imp:,.0f}"),
            ("PROC Meta Imp", f"{proc_meta_imp:,.0f}"),
            ("RAW Meta Clicks", f"{raw_meta_click:,.0f}"),
            ("PROC Meta Clicks", f"{proc_meta_click:,.0f}"),
            ("RAW Meta Results", f"{raw_meta_results:,.0f}"),
            ("PROC Meta MCV", f"{proc_meta_mcv:,.0f}"),
        ]
        for c in meta_cv_cols:
            rows.append((f"RAW Meta '{c}'", f"{raw_meta_cv_named[c]:,.0f}"))
        rows += [
            ("RAW Beyond Cost", f"{raw_b_cost:,.0f}"),
            ("PROC Beyond Cost", f"{proc_b_cost:,.0f}"),
            ("RAW Beyond PV", f"{raw_b_pv:,.0f}"),
            ("PROC Beyond PV", f"{proc_b_pv:,.0f}"),
            ("RAW Beyond Clicks", f"{raw_b_click:,.0f}"),
            ("PROC Beyond Clicks", f"{proc_b_click:,.0f}"),
            ("RAW Beyond CV", f"{raw_b_cv:,.0f}"),
            ("PROC Beyond CV", f"{proc_b_cv:,.0f}"),
            ("PROC Beyond Revenue", f"{proc_b_rev:,.0f}"),
            ("Unmapped rows (total)", unmapped_total),
            ("Unmapped rows (Meta)", unmapped_meta),
            ("Unmapped rows (Beyond)", unmapped_beyond),
        ]
        _print_kv(f"RAW(deduped) vs Processed 比較 - {label}", rows)

    # 案件別（processed）をざっくり確認（直近7日）
    proc_7d = _filter_range(processed, "Date", start_7d, end_today)
    if not proc_7d.empty and "Campaign_Name" in proc_7d.columns:
        by_proj = (
            proc_7d.groupby(["Media", "Campaign_Name"], dropna=False)
            .agg(
                Cost=("Cost", "sum"),
                Revenue=("Revenue", "sum"),
                CV=("CV", "sum"),
                MCV=("MCV", "sum"),
                Rows=("Campaign_Name", "count"),
            )
            .reset_index()
            .sort_values(["Media", "Cost"], ascending=[True, False])
        )
        _print_kv(
            "直近7日（processed）案件別サマリ（上位20）",
            [("rows", len(by_proj))],
        )
        print(by_proj.head(20).to_string(index=False))


if __name__ == "__main__":
    main()

