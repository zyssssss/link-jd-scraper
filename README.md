# link JD爬取者

LinkedIn 职位 URL → 抓取 JD（公司/地点/职位详情）→（可选）进入 Easy Apply 申请流程并 **dry-run 自动填表**（不点击最终提交）。

> 设计目标：**可展示、可复现、可即插即用**。
>
> - ✅ 支持使用“你已登录的 Chrome 会话”抓取（通过 CDP 连接）
> - ✅ 输出干净版 CSV（解决 Excel/IM 预览把换行当多行、以及中文乱码问题）
> - ✅ 申请流程仅提供 **dry-run**：自动打开、自动填、自动到达提交前一步，然后停止
>
## 为什么默认不点最终提交（dry-run）？

LinkedIn 与多数招聘系统（ATS）对自动化投递非常敏感。

- 自动点击最终提交更容易触发风控（验证码/限流/账号限制）
- 最终提交往往伴随不可逆操作（同意条款、授权、法律声明），需要人工确认
- 不同岗位问题差异很大（签证/薪资/测评/自定义问答），全自动提交很容易填错

因此本项目默认只做到“**提交前最后一步**”，把“最终提交”留给你在浏览器里手动确认。

---

## 1. 环境准备

- Windows / macOS / Linux
- Python 3.10+
- Chrome（已登录 LinkedIn）

安装依赖：

```bash
pip install -r requirements.txt
playwright install chromium
```

> 如果你希望复用“已登录 Chrome”的会话（推荐），需要启动 Chrome 远程调试端口：
>
> **方式 A（推荐）**：关闭所有 Chrome，然后用下面命令启动：
>
> ```bash
> "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222
> ```
>
> 然后在这个 Chrome 里登录 LinkedIn。

---

## 2. 输入格式

CSV 至少包含一列：`url`

示例：见 `examples/input_urls.csv`

---

## 3. 抓取 JD

```bash
python -m src.cli scrape-jd \
  --in examples/input_urls.csv \
  --out out/filled.csv
```

会同时生成：
- `out/filled.csv`：保留真实换行（description 里会有很多换行）
- `out/filled_clean_utf8bom.csv`：把换行转义成 `\\n` + UTF-8 BOM（Excel/飞书预览友好）

---

## 4. Chrome 插件（抓 jobId / 导出 JD CSV）

本仓库附带一个 Chrome 插件，可以在 LinkedIn 的职位详情页/列表页导出 CSV。

使用说明：见 `docs/04-chrome-extension.md`

---

## 5. 申请（dry-run）

```bash
python -m src.cli apply-dry-run \
  --in examples/input_urls.csv \
  --profile-cdp http://127.0.0.1:9222
```

它会：
- 打开职位页
- 如果是 Easy Apply：进入申请流程，自动填表/上传（从 `.env` 读取）
- 到达最终提交前一步停止，并截图/记录日志

---

## 5. 配置（本地，不上传 GitHub）

复制 `.env.example` → `.env`，填入个人信息与简历路径：

```bash
cp .env.example .env
```

---

## 免责声明

本项目仅用于个人求职效率工具与学习研究。
使用者需遵守 LinkedIn 与相关网站的服务条款与当地法律法规，并自行承担风险。
