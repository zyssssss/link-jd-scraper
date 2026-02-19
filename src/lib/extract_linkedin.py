from __future__ import annotations

import re
from datetime import datetime, timezone


def parse_job_id(url: str) -> str | None:
    m = re.search(r"/jobs/view/(\d+)", url)
    return m.group(1) if m else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def extract_job_fields(page) -> dict:
    """Heuristic extraction from the currently opened LinkedIn job page.

    Note: LinkedIn DOM varies across locales and experiments.
    We use robust fallbacks (document.title + main.innerText windows).
    """

    # Expand “see more” if possible
    try:
        page.evaluate(
            """() => {
              const btns = Array.from(document.querySelectorAll('button'))
                .filter(b => {
                  const t = (b.innerText || '').trim();
                  const al = (b.getAttribute('aria-label') || '').trim();
                  return /显示全部|展开|查看更多|See more/i.test(t) || /See more/i.test(al);
                });
              for (const b of btns.slice(0, 4)) { try { b.click(); } catch (e) {} }
            }"""
        )
    except Exception:
        pass

    data = page.evaluate(
        """() => {
          const norm = (s) => (s || '').replace(/\u00a0/g, ' ').replace(/\s+$/g, '').trim();
          const text = (el) => el ? norm(el.innerText) : null;

          const titleParts = (document.title || '').split(' | ').map(x => x.trim()).filter(Boolean);
          const titleFromDoc = titleParts.length >= 2 ? titleParts[0] : null;
          const companyFromDoc = titleParts.length >= 2 ? titleParts[1] : null;

          const companyLinks = Array.from(document.querySelectorAll('a[href*="/company/"]'))
            .map(a => ({ href: a.href, text: norm(a.innerText) }))
            .filter(x => x.text);

          let companyName = companyLinks[0]?.text || companyFromDoc;
          if (companyName && companyName.includes('\n')) companyName = companyName.split('\n')[0].trim();
          const companyLinkedin = companyLinks[0]?.href || null;

          const main = document.querySelector('main');
          const mainText = norm(main ? main.innerText : '');
          const lines = mainText.split('\n').map(l => l.trim()).filter(Boolean);

          let jobTitle = null;
          if (companyName) {
            const idx = lines.findIndex(l => l === companyName);
            if (idx >= 0) {
              for (let j = idx + 1; j < Math.min(lines.length, idx + 6); j++) {
                const l = lines[j];
                if (l && !/位关注者|点击了申请|申请|保存|人脉推荐|关于职位|公司简介/.test(l)) {
                  jobTitle = l;
                  break;
                }
              }
            }
          }
          jobTitle = jobTitle || titleFromDoc;

          let locationText = null;
          const locLine = lines.find(l => l.includes('·') && /的时间|ago/i.test(l));
          if (locLine) locationText = locLine.split('·')[0].trim();

          // description block between headings
          let description = null;
          const startRe = /(关于职位|About the job)/i;
          const endRe = /(订阅相似职位|Subscribe to similar jobs|公司简介|About the company|更多职位|More jobs)/i;
          const startIdx = mainText.search(startRe);
          if (startIdx >= 0) {
            let tail = mainText.slice(startIdx).replace(startRe, '').trim();
            const endIdx = tail.search(endRe);
            if (endIdx > 0) tail = tail.slice(0, endIdx).trim();
            if (tail) description = tail;
          }

          return { jobTitle, companyName, companyLinkedin, locationText, description, documentTitle: document.title };
        }"""
    )

    return {
        "job_title": data.get("jobTitle"),
        "company_name": data.get("companyName"),
        "company_linkedin": data.get("companyLinkedin"),
        "location_text": data.get("locationText"),
        "description_text": data.get("description"),
        "document_title": data.get("documentTitle"),
    }
