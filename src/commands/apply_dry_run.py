from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console

from ..lib.chrome_cdp import load_cdp_url, with_cdp_page
from ..lib.csv_io import read_urls_csv

console = Console()


def apply_dry_run_command(inp: Path, cli_cdp: str | None, limit: int = 5):
    """Open job URLs and attempt to enter LinkedIn Easy Apply flow.

    Dry-run means:
    - We may click "Easy Apply" and fill common fields.
    - We do NOT click the final "Submit application".
    - We stop at the last step and take a screenshot for the user.
    """

    load_dotenv(override=False)
    full_name = os.getenv("FULL_NAME_EN", "").strip()
    email = os.getenv("EMAIL", "").strip()
    phone = os.getenv("PHONE", "").strip()
    resume_path = os.getenv("RESUME_PATH", "").strip()

    if not resume_path:
        console.print("[yellow]RESUME_PATH is empty in .env. We will still run, but upload will be skipped.[/yellow]")

    cdp_url = load_cdp_url(cli_cdp)
    df = read_urls_csv(inp).head(limit)

    out_dir = Path("runs") / "apply_dry_run"
    out_dir.mkdir(parents=True, exist_ok=True)

    console.print(f"[bold]Input:[/bold] {inp} (rows={len(df)})")
    console.print(f"[bold]Mode:[/bold] dry-run (不会点击最终提交)")
    console.print(f"[bold]CDP:[/bold] {cdp_url}")

    pw, browser, context, page = with_cdp_page(cdp_url)

    try:
        for idx, url in enumerate(df["url"].tolist(), start=1):
            console.print(f"\n[{idx}/{len(df)}] {url}")
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(2000)

            # Find Easy Apply button (locale variants)
            easy_apply = page.locator("button:has-text('Easy Apply')").first
            if easy_apply.count() == 0:
                easy_apply = page.locator("button:has-text('一键申请')").first
            if easy_apply.count() == 0:
                easy_apply = page.locator("button:has-text('快速申请')").first

            if easy_apply.count() == 0:
                console.print("[yellow]Not an Easy Apply job (or button not found). Skipping.[/yellow]")
                continue

            easy_apply.click()
            page.wait_for_timeout(1500)

            # Attempt to fill common fields (best-effort)
            if email:
                page.locator("input[type='email']").first.fill(email)
            if phone:
                page.locator("input[type='tel']").first.fill(phone)

            # Attempt upload resume
            if resume_path and Path(resume_path).exists():
                file_inputs = page.locator("input[type='file']")
                if file_inputs.count() > 0:
                    file_inputs.first.set_input_files(resume_path)
                    page.wait_for_timeout(1000)

            # Try to advance steps until we reach final step (but do not submit)
            for _ in range(6):
                # If final submit button exists, stop.
                submit_btn = page.locator("button:has-text('Submit application')")
                if submit_btn.count() == 0:
                    submit_btn = page.locator("button:has-text('提交申请')")
                if submit_btn.count() > 0:
                    console.print("[cyan]Reached final submit step. Dry-run stops here (不会点击最终提交)。[/cyan]")
                    break

                next_btn = page.locator("button:has-text('Next')")
                if next_btn.count() == 0:
                    next_btn = page.locator("button:has-text('下一步')")
                if next_btn.count() == 0:
                    next_btn = page.locator("button:has-text('Review')")
                if next_btn.count() == 0:
                    next_btn = page.locator("button:has-text('审核')")

                if next_btn.count() == 0:
                    console.print("[yellow]Cannot find Next/Review button; stopping for manual check.[/yellow]")
                    break

                next_btn.first.click()
                page.wait_for_timeout(1200)

            shot = out_dir / f"{idx:02d}_dry_run.png"
            page.screenshot(path=str(shot), full_page=True)
            console.print(f"[green]Screenshot:[/green] {shot}")

    finally:
        try:
            browser.close()
        finally:
            pw.stop()

    console.print("\n[bold]Done.[/bold] Dry-run does not submit applications by design.")
