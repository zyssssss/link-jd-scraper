import argparse
from pathlib import Path

from rich.console import Console

from .commands.scrape_jd import scrape_jd_command
from .commands.apply_dry_run import apply_dry_run_command

console = Console()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="link JD爬取者")
    sub = p.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("scrape-jd", help="抓取 LinkedIn 职位 JD 信息到 CSV")
    p1.add_argument("--in", dest="inp", required=True, help="输入 CSV（至少包含 url 列）")
    p1.add_argument("--out", dest="out", required=True, help="输出 CSV 路径")
    p1.add_argument("--profile-cdp", dest="cdp", default=None, help="Chrome CDP 地址，如 http://127.0.0.1:9222")

    p2 = sub.add_parser("apply-dry-run", help="进入 Easy Apply 申请流程并自动填表（不最终提交）")
    p2.add_argument("--in", dest="inp", required=True, help="输入 CSV（至少包含 url 列）")
    p2.add_argument("--profile-cdp", dest="cdp", default=None, help="Chrome CDP 地址，如 http://127.0.0.1:9222")
    p2.add_argument("--limit", dest="limit", type=int, default=5, help="最多处理前 N 条（默认 5）")

    return p


def main():
    args = build_parser().parse_args()

    if args.cmd == "scrape-jd":
        scrape_jd_command(Path(args.inp), Path(args.out), args.cdp)
    elif args.cmd == "apply-dry-run":
        apply_dry_run_command(Path(args.inp), args.cdp, args.limit)
    else:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
