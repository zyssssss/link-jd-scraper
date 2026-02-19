from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright


@dataclass
class CdpConfig:
    cdp_url: str


def load_cdp_url(cli_cdp: str | None) -> str:
    load_dotenv(override=False)
    return cli_cdp or os.getenv("PROFILE_CDP", "http://127.0.0.1:9222")


def with_cdp_page(cdp_url: str):
    """Yield (playwright, browser, context, page) connected to an existing Chrome via CDP."""
    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(cdp_url)
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    page = context.pages[0] if context.pages else context.new_page()
    return pw, browser, context, page
