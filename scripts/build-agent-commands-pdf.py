"""AGENT-COMMANDS.md -> AGENT-COMMANDS.pdf

Renders the command contract to a print PDF via headless Edge/Chrome.
Needs: pip install markdown; Edge or Chrome on PATH-side standard install.

    python scripts/build-agent-commands-pdf.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "AGENT-COMMANDS.md"
OUT = ROOT / "docs" / "AGENT-COMMANDS.pdf"

CSS = """
@page { size: A4; margin: 18mm 14mm; }
* { box-sizing: border-box; }
body {
  font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
  font-size: 9.5pt; line-height: 1.55; color: #1a1a1a; margin: 0;
}
h1 { font-size: 20pt; border-bottom: 3px solid #2c5f8a; padding-bottom: 8px; }
h2 { font-size: 13.5pt; color: #2c5f8a; border-bottom: 1px solid #cdd8e4;
     padding-bottom: 4px; margin-top: 22px; page-break-after: avoid; }
h3 { font-size: 11pt; color: #333; margin-top: 16px; page-break-after: avoid; }
h4 { font-size: 10pt; margin-top: 12px; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 8px 0;
        font-size: 8.5pt; page-break-inside: auto; }
th { background: #2c5f8a; color: #fff; text-align: left;
     padding: 4px 6px; font-weight: 600; }
td { border: 1px solid #b9c6d3; padding: 3px 6px; vertical-align: top; }
tr:nth-child(even) td { background: #f4f7fa; }
tr { page-break-inside: avoid; }
code { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt;
       background: #eef2f6; padding: 0 3px; border-radius: 2px; }
pre { background: #f4f4f4; border: 1px solid #ddd; border-left: 3px solid #2c5f8a;
      padding: 8px 10px; overflow-x: auto; font-size: 8pt;
      page-break-inside: avoid; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #c9a227; background: #fdf6e3;
             margin: 8px 0; padding: 6px 12px; color: #5a4a1a; }
blockquote p { margin: 0; }
ul, ol { margin: 6px 0; padding-left: 22px; }
li { margin: 2px 0; }
hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
a { color: #2c5f8a; text-decoration: none; }
.toc { background: #f4f7fa; border: 1px solid #cdd8e4; padding: 10px 18px;
       margin: 14px 0; font-size: 9pt; }
.toc > ul { list-style: none; padding-left: 0; }
.toc ul ul { padding-left: 16px; }
.toc a::after { content: ""; }
"""

BROWSER_CANDIDATES = [
    Path(r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
    Path(r"C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
    Path(r"C:/Program Files/Google/Chrome/Application/chrome.exe"),
]


def _toc_html(tokens, depth=0) -> str:
    """Render markdown.toc_tokens as nested lists; keep only h1/h2 for the PDF TOC."""
    items = []
    for t in tokens:
        children = _toc_html(t.get("children", []), depth + 1) if depth == 0 else ""
        items.append(
            f'<li><a href="#{t["id"]}">{t["name"]}</a>{children}</li>'
        )
    if not items:
        return ""
    if depth == 0:
        return '<div class="toc"><h2>目录</h2><ul>' + "".join(items) + "</ul></div>"
    return "<ul>" + "".join(items) + "</ul>"


def main() -> int:
    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "sane_lists"],
    )
    html_body = md.convert(SRC.read_text(encoding="utf-8"))
    toc = _toc_html(md.toc_tokens)
    html = (
        "<!doctype html><html lang='zh'><head><meta charset='utf-8'>"
        f"<style>{CSS}</style></head><body>{toc}{html_body}</body></html>"
    )
    browser = next((p for p in BROWSER_CANDIDATES if p.exists()), None)
    if not browser:
        print("no Edge/Chrome found", file=sys.stderr)
        return 1
    with tempfile.NamedTemporaryFile(
        "w", suffix=".html", delete=False, encoding="utf-8"
    ) as f:
        f.write(html)
        tmp = Path(f.name)
    try:
        subprocess.run(
            [
                str(browser), "--headless", "--disable-gpu",
                f"--print-to-pdf={OUT}", "--no-pdf-header-footer",
                tmp.as_uri(),
            ],
            check=True, capture_output=True, timeout=60,
        )
    finally:
        tmp.unlink(missing_ok=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
