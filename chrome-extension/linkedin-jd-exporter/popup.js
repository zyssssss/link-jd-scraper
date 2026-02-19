const msg = (t) => (document.getElementById("msg").textContent = t);

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ").trim();
  if (/"/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  if (/[,\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const headerLine = headers.join(",");
  const lines = rows.map((obj) => headers.map((h) => csvEscape(obj?.[h])).join(","));
  return headerLine + "\n" + lines.join("\n") + "\n";
}

function extractJdFromPage() {
  try {
    const getText = (el) => (el ? el.innerText.trim() : "");
    const pickFirst = (...sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        const t = getText(el);
        if (t) return t;
      }
      return "";
    };

    const url = location.href;

    const job_title = pickFirst(
      "h1",
      "h1.t-24",
      "h1.top-card-layout__title",
      ".job-details-jobs-unified-top-card__job-title h1"
    );

    const company_name = pickFirst(
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      "a.topcard__org-name-link"
    );

    const location = pickFirst(
      ".job-details-jobs-unified-top-card__primary-description-container span.tvm__text",
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__bullet"
    );

    const description_text = pickFirst(
      "#job-details",
      ".jobs-description__content",
      ".jobs-description-content__text",
      ".jobs-box__html-content",
      ".job-details-jobs-unified-top-card__job-description"
    );

    return {
      scraped_at: new Date().toISOString(),
      url,
      job_title,
      company_name,
      location,
      description_text
    };
  } catch (e) {
    // 永不返回 null，避免上层崩溃
    return {
      scraped_at: new Date().toISOString(),
      url: location.href,
      job_title: "",
      company_name: "",
      location: "",
      description_text: ""
    };
  }
}

function extractJobIdsFromListPage() {
  // 兜底：这个函数仅用于 /jobs/view 页面以外的列表页提取 jobId。
  // 注意：在 executeScript(func=...) 场景下，func 必须自包含；本函数在 extension 侧调用时可用。
  const ids = new Set();

  // 1) 最常见：a href 里带 /jobs/view/<id>
  const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/\/jobs\/view\/(\d+)/);
    if (m && m[1]) ids.add(m[1]);
  }

  // 2) 另一常见：卡片上有 data-entity-urn="urn:li:jobPosting:<id>"
  const urnEls = Array.from(document.querySelectorAll('[data-entity-urn*="jobPosting"], [data-urn*="jobPosting"], [data-job-id]'));
  for (const el of urnEls) {
    const urn = (el.getAttribute("data-entity-urn") || el.getAttribute("data-urn") || "").trim();
    const m1 = urn.match(/jobPosting:(\d+)/);
    if (m1 && m1[1]) ids.add(m1[1]);

    const jid = (el.getAttribute("data-job-id") || "").trim();
    if (/^\d+$/.test(jid)) ids.add(jid);
  }

  // 3) URL 参数 currentJobId（至少拿到当前选中的那条）
  try {
    const u = new URL(location.href);
    const cur = u.searchParams.get("currentJobId");
    if (cur && /^\d+$/.test(cur)) ids.add(cur);
  } catch {}

  return { jobIds: Array.from(ids) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await chrome.tabs.get(tabId);
    if (t?.status === "complete") return true;
    await sleep(250);
  }
  return false;
}

function isLinkedInJobViewUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes("linkedin.com") && /\/jobs\/view\//.test(u.pathname);
  } catch {
    return false;
  }
}

function isLinkedInListOrCollectionUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("linkedin.com")) return false;
    return /\/jobs\/(collections|search)\//.test(u.pathname);
  } catch {
    return false;
  }
}

async function scrapeOneJobView(jobViewUrl, { closeTab = true, timeoutMs = 25000 } = {}) {
  const created = await chrome.tabs.create({ url: jobViewUrl, active: false });
  const tabId = created?.id;
  if (!tabId) throw new Error("无法创建新标签页。");

  try {
    const ok = await waitForTabComplete(tabId, timeoutMs);
    if (!ok) throw new Error("打开详情页超时（可能需要登录/人机验证）。");

    // 给 LinkedIn 一点时间把详情内容渲染出来
    await sleep(700);

    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractJdFromPage
    });

    const result = injected?.[0]?.result;
    if (!result || typeof result !== "object") {
      throw new Error("注入抓取失败：未拿到 JD 数据（可能停在验证/空白页）。");
    }
    return result;
  } finally {
    if (closeTab) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // ignore
      }
    }
  }
}

async function run() {
  msg("正在导出…\n提示：在列表页请先向下滚动，让更多职位加载出来。");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return msg("没找到当前标签页。");

  const url = tab.url || "";
  if (!url.includes("linkedin.com")) {
    return msg("当前不是 LinkedIn 页面。请打开 LinkedIn Jobs 页面再导出。");
  }

  const headers = [
    "scraped_at",
    "url",
    "job_title",
    "company_name",
    "location",
    "description_text",
    "error"
  ];

  // 1) 如果当前就是 jobs/view，按单条导出
  if (isLinkedInJobViewUrl(url)) {
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJdFromPage
    });
    const result = injected?.[0]?.result;
    if (!result || typeof result !== "object") {
      return msg(
        "读取页面失败：没有拿到 JD 数据。\n" +
          "请确认已登录，且页面不是验证/检查页面。"
      );
    }

    const csv = toCsv(headers, [result]);
    return downloadCsv(csv, 1);
  }

  // 2) 如果是列表/集合页：全自动翻页收集 jobIds -> 打开 jobs/view/<id> 抓取
  if (isLinkedInListOrCollectionUrl(url)) {
    // 可调参数：
    const MAX_PAGES = 10; // 最多自动翻页次数
    const MAX_JOBS_TOTAL = 120; // 最多抓取职位数（收集到这么多就停）
    const SCROLL_TIMES_PER_PAGE = 3; // 你说的：每页需要下拉 2-3 次才能显示到 ~15 条
    const SCROLL_DELAY_MS = 700;
    const PAGE_TURN_DELAY_MS = 2200; // 点击“下一页”后等待列表刷新

    const allIds = new Set();
    let clickedNext = true;

    for (let page = 1; page <= MAX_PAGES && clickedNext; page++) {
      msg(`第 ${page}/${MAX_PAGES} 页：滚动加载并收集职位链接…`);

      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async ({ scrollTimes = 3, scrollDelayMs = 700 } = {}) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

          const pickScrollContainer = () => {
            const sels = [
              ".jobs-search-results-list",
              ".jobs-search-results-list__container",
              ".scaffold-layout__list",
              ".scaffold-layout__list-container",
              "main .scaffold-layout__list",
              "#main .scaffold-layout__list",
              "aside .scaffold-layout__list",
              "[role='main'] .scaffold-layout__list"
            ];
            for (const sel of sels) {
              const el = document.querySelector(sel);
              if (el && el.scrollHeight > el.clientHeight) return el;
            }
            return document.scrollingElement || document.documentElement;
          };

          const scroller = pickScrollContainer();

          // LinkedIn 列表常见是“虚拟列表/分段渲染”：直接跳到底部不一定会触发中间批次渲染。
          // 用“逐步滚动 + 触发 scroll 事件”更接近真实鼠标滚动。
          const scrollStep = () => {
            const step = Math.max(300, Math.floor((scroller.clientHeight || 800) * 0.85));
            try {
              scroller.scrollBy({ top: step, left: 0, behavior: "instant" });
            } catch {
              try {
                scroller.scrollTop = (scroller.scrollTop || 0) + step;
              } catch {}
            }
            try {
              scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
            } catch {}
          };

          // 先轻微滚一下，确保懒加载监听器被触发
          scrollStep();
          await sleep(Math.max(200, Math.floor(scrollDelayMs / 2)));

          for (let i = 0; i < scrollTimes; i++) {
            // 每次滚动拆成多小步，模拟连续滚轮
            for (let k = 0; k < 4; k++) {
              scrollStep();
              await sleep(180);
            }
            await sleep(scrollDelayMs);
          }

          // 最后再尝试滚到底部一次作为兜底
          try {
            scroller.scrollTop = scroller.scrollHeight;
            scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
          } catch {}

          // 提取 jobId：href / data-entity-urn / currentJobId
          const ids = new Set();
          const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
          for (const a of anchors) {
            const href = a.getAttribute("href") || "";
            const m = href.match(/\/jobs\/view\/(\d+)/);
            if (m && m[1]) ids.add(m[1]);
          }

          const urnEls = Array.from(
            document.querySelectorAll(
              '[data-entity-urn*="jobPosting"], [data-urn*="jobPosting"], [data-job-id]'
            )
          );
          for (const el of urnEls) {
            const urn = (el.getAttribute("data-entity-urn") || el.getAttribute("data-urn") || "").trim();
            const m1 = urn.match(/jobPosting:(\d+)/);
            if (m1 && m1[1]) ids.add(m1[1]);
            const jid = (el.getAttribute("data-job-id") || "").trim();
            if (/^\d+$/.test(jid)) ids.add(jid);
          }

          try {
            const u = new URL(location.href);
            const cur = u.searchParams.get("currentJobId");
            if (cur && /^\d+$/.test(cur)) ids.add(cur);
          } catch {}

          const jobIds = Array.from(ids);

          const findNextButton = () => {
            // 优先找 aria-label 明确是 Next/下一页 的
            const ariaCandidates = Array.from(
              document.querySelectorAll('button[aria-label], a[aria-label]')
            );
            const txtCandidates = Array.from(document.querySelectorAll("button, a"));
            const candidates = [...ariaCandidates, ...txtCandidates];

            const isNext = (el) => {
              const al = (el.getAttribute("aria-label") || "").trim();
              const txt = (el.innerText || el.textContent || "").trim();
              return (
                /(^Next$|^下一页$)/.test(al) ||
                /\bNext\b/.test(al) ||
                /下一页/.test(al) ||
                /\bNext\b/.test(txt) ||
                /下一页/.test(txt)
              );
            };

            for (const el of candidates) {
              if (!el) continue;
              if (!isNext(el)) continue;
              const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
              if (disabled) continue;
              return el;
            }
            return null;
          };

          const nextBtn = findNextButton();
          let clickedNext = false;
          if (nextBtn) {
            nextBtn.click();
            clickedNext = true;
          }

          return { jobIds, clickedNext };
        },
        args: [{ scrollTimes: SCROLL_TIMES_PER_PAGE, scrollDelayMs: SCROLL_DELAY_MS }]
      });

      const result = injected?.[0]?.result;
      const jobIds = result?.jobIds;
      clickedNext = !!result?.clickedNext;

      if (Array.isArray(jobIds)) {
        for (const id of jobIds) {
          if (allIds.size >= MAX_JOBS_TOTAL) break;
          allIds.add(id);
        }
      }

      msg(`已累计收集 ${allIds.size} 个职位 ID。`);

      if (allIds.size >= MAX_JOBS_TOTAL) {
        clickedNext = false;
        break;
      }

      if (clickedNext) {
        await sleep(PAGE_TURN_DELAY_MS);
      }
    }

    const ids = Array.from(allIds);
    if (ids.length === 0) {
      return msg(
        "没有在列表页找到任何职位链接（/jobs/view/<id>）。\n" +
          "可能原因：页面还没加载出来、或 LinkedIn DOM 结构变了。\n" +
          "建议：先向下滚动一屏，再点导出。"
      );
    }

    msg(`开始抓取详情页（jobs/view）…共 ${ids.length} 条（将逐条打开后台标签页）`);

    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const jobViewUrl = `https://www.linkedin.com/jobs/view/${id}/`;
      msg(`抓取详情 (${i + 1}/${ids.length})：${id}`);
      try {
        const r = await scrapeOneJobView(jobViewUrl, { closeTab: true });
        rows.push({ ...r, error: "" });
      } catch (e) {
        rows.push({
          scraped_at: new Date().toISOString(),
          url: jobViewUrl,
          job_title: "",
          company_name: "",
          location: "",
          description_text: "",
          error: e?.message || String(e)
        });
      }
      await sleep(1300);
    }

    const csv = toCsv(headers, rows);
    return downloadCsv(csv, rows.length);
  }

  return msg(
    "当前页面不是 LinkedIn Job 详情页（/jobs/view/...）也不是列表页（/jobs/search 或 /jobs/collections）。\n" +
      "请打开 Jobs 页面后再导出。"
  );
}

function downloadCsv(csv, nRows) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .replace("T", "_")
    .slice(0, 15);

  const filename = `linkedin_jd_${ts}.csv`;

  chrome.downloads.download({ url: objectUrl, filename, saveAs: false }, () => {
    if (chrome.runtime.lastError) {
      msg("下载失败：" + chrome.runtime.lastError.message);
      URL.revokeObjectURL(objectUrl);
      return;
    }
    msg(`已导出 ${nRows} 条：${filename}\n保存位置：C:\\Users\\<用户名>\\Downloads`);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  });
}

document.getElementById("exportBtn").addEventListener("click", () => {
  run().catch((e) => msg("出错：" + (e?.message || String(e))));
});
