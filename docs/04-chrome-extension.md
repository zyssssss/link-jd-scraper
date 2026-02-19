# Chrome 插件：LinkedIn JD Exporter（抓 jobId / 导出 JD CSV）

本项目附带一个简单的 Chrome Extension（Manifest V3），用于：

1) 在 **LinkedIn 职位详情页**（`/jobs/view/<id>/`）一键导出当前 JD 到 CSV
2) 在 **LinkedIn Jobs 列表页**（`/jobs/search/` 或 `/jobs/collections/`）批量收集 jobId，并自动打开每个 `/jobs/view/<id>/` 抓取 JD，最后导出 CSV

插件源码路径：

- `chrome-extension/linkedin-jd-exporter/`

> 注意：LinkedIn 页面经常 A/B 测试，DOM 结构可能变化；插件使用了多套 selector + 兜底逻辑，但仍可能需要维护。

---

## 1) 安装（开发者模式加载）

1. 打开 Chrome
2. 访问：`chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序（Load unpacked）**
5. 选择本项目目录下：`chrome-extension/linkedin-jd-exporter/`

安装完成后，工具栏会出现扩展按钮。

---

## 2) 使用方法

### A. 导出单条 JD（职位详情页）

1. 打开任意职位详情页，例如：
   `https://www.linkedin.com/jobs/view/4361171901/`
2. 点击扩展按钮
3. 点击 “Export”
4. 会自动下载 `linkedin_jd_YYYYMMDD_HHMM.csv` 到你的 Downloads 文件夹

输出列：
- scraped_at
- url
- job_title
- company_name
- location
- description_text

### B. 列表页批量导出（Jobs Search / Collections）

1. 打开 LinkedIn Jobs 列表页（搜索结果页 / 收藏集合页）
2. **先向下滚动 2-3 次**，让更多职位加载出来
3. 点击扩展按钮 → Export
4. 插件会：
   - 解析当前页面可见的 jobId（`/jobs/view/<id>`、`data-entity-urn` 等）
   - 自动翻页（最多 10 页，可在 `popup.js` 调参）
   - 后台打开每个 job 详情页抓取 JD
   - 汇总导出 CSV

---

## 3) 常见问题

- 导出数量远超预期：
  - 你在列表页可能滚动/翻页较多；插件默认最多抓 `MAX_JOBS_TOTAL=120`，可以在 `popup.js` 里调小。
- 乱码：
  - CSV 建议用 Excel 以 UTF-8 BOM 打开，或用 VSCode 打开；
  - 本仓库 Python 抓取器也会输出 `*_clean_utf8bom.csv`。
- 卡住/超时：
  - 通常是 LinkedIn 要求验证、或网络慢；先确认已登录且无验证码。
