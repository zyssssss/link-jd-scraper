from __future__ import annotations

from pathlib import Path

import pandas as pd


def read_urls_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "url" not in df.columns:
        raise ValueError("Input CSV must contain a 'url' column")
    df["url"] = df["url"].astype(str).str.strip()
    df = df[df["url"].str.len() > 0].copy()
    return df


def write_csv_utf8(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8")


def write_csv_utf8_bom_clean(df: pd.DataFrame, path: Path) -> None:
    """Excel/IM friendly: UTF-8 BOM + escape newlines in description_text."""
    df2 = df.copy()
    if "description_text" in df2.columns:
        df2["description_text"] = (
            df2["description_text"].fillna("")
            .astype(str)
            .str.replace("\r\n", "\n", regex=False)
            .str.replace("\r", "\n", regex=False)
            .str.replace("\n", "\\n", regex=False)
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    df2.to_csv(path, index=False, encoding="utf-8-sig")
