# Setup

## 1) Install

```bash
pip install -r requirements.txt
playwright install chromium
```

## 2) Use an already-logged-in Chrome (recommended)

Close all Chrome windows, then start Chrome with a remote debugging port:

```bash
"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222
```

Log into LinkedIn in this Chrome.

## 3) Configure .env

Copy `.env.example` to `.env` and fill in values.

**Do not commit** `.env`.
