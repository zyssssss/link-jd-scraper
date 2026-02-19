from __future__ import annotations

from pathlib import Path

import pandas as pd
from rich.console import Console

from ..lib.chrome_cdp import load_cdp_url, with_cdp_page
from ..lib.csv_io import read_urls_csv, write_csv_utf8, write_csv_utf8_bom_clean
from ..lib.extract_linkedin import extract_job_fields, now_iso, parse_job_id

console = Console()


def scrape_jd_command(inp: Path, out: Path, cli_cdp: str | None):
    cdp_url = load_cdp_url(cli_cdp)
    df = read_urls_csv(inp)

    console.print(f"[bold]Input:[/bold] {inp} (rows={len(df)})")
    console.print(f"[bold]CDP:[/bold] {cdp_url}")

    pw, browser, context, page = with_cdp_page(cdp_url)

    rows = []
    try:
        for i, url in enumerate(df["url"].tolist(), start=1):
            console.print(f"[{i}/{len(df)}] {url}")
            row = {"url": url, "job_id": parse_job_id(url), "scraped_at": now_iso()}
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(1500)
                page.wait_for_selector("main", timeout=30_000)
                page.wait_for_timeout(800)

                fields = extract_job_fields(page)
                row.update(fields)
                row["status"] = "ok" if (row.get("description_text") and len(row["description_text"]) > 50) else "ok_partial"
            except Exception as e:
                row["status"] = f"error: {e}"
            rows.append(row)
    finally:
        try:
            browser.close()
        finally:
            pw.stop()

    out.parent.mkdir(parents=True, exist_ok=True)
    out_df = pd.DataFrame(rows)

    # stable column order
    cols = [
        "url",
        "job_id",
        "job_title",
        "company_name",
        "company_linkedin",
        "location_text",
        "description_text",
        "scraped_at",
        "status",
        "document_title",
    ]
    for c in cols:
        if c not in out_df.columns:
            out_df[c] = ""
    out_df = out_df[cols]

    write_csv_utf8(out_df, out)

    clean_path = out.with_name(out.stem + "_clean_utf8bom" + out.suffix)
    write_csv_utf8_bom_clean(out_df, clean_path)

    console.print(f"\n[green]Wrote:[/green] {out}")
    console.print(f"[green]Wrote:[/green] {clean_path}")
