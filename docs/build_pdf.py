"""Build docs/CardioScope_Documentation.pdf from docs/documentation.md (A4, max 6 pages).

    python docs/build_pdf.py

Needs `pip install markdown playwright` and `playwright install chromium` (build-time only), plus
Ghostscript (`gs`) to shrink the images.
"""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
from pathlib import Path

import markdown
from playwright.async_api import async_playwright

DOCS = Path(__file__).resolve().parent
SRC = DOCS / "documentation.md"
OUT = DOCS / "CardioScope_Documentation.pdf"
MAX_PAGES = 6

CSS = """
@page { size: A4; margin: 13mm 14mm 14mm 14mm; }
body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 9.1pt; line-height: 1.33;
       color: #111827; }
h1 { font-size: 17pt; margin: 0 0 4pt; color: #3b0764; }
h2 { font-size: 12pt; margin: 11pt 0 4pt; padding-bottom: 2pt; border-bottom: 1.5px solid #ddd6fe; color: #3b0764;
     break-after: avoid; }
p { margin: 3.5pt 0; }
ul, ol { margin: 3pt 0; padding-left: 15pt; }
li { margin: 0.5pt 0; }
blockquote { margin: 5pt 0; padding: 5pt 9pt; background: #fffbeb; border-left: 3px solid #d97706; }
blockquote p { margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 5pt 0; font-size: 8.4pt; break-inside: avoid; }
th, td { border: 1px solid #d1d5db; padding: 2.5pt 4pt; text-align: left; }
th { background: #f5f3ff; }
code { font-family: Consolas, Menlo, monospace; font-size: 8.4pt; background: #f3f4f6; padding: 0 2px; border-radius: 2px; }
pre { background: #f3f4f6; padding: 5pt 7pt; font-size: 8pt; border-radius: 4px; break-inside: avoid; }
pre code { background: none; padding: 0; }
figure { margin: 6pt 0; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; }
figcaption { font-size: 8pt; color: #4b5563; margin-top: 2pt; }
img[src*="dashboard"] { width: 100%; border-radius: 4px; }
img[src*="architecture"] { width: 96%; }
img[src*="model_comparison"] { width: 62%; }
img[src*="decision_curves"] { width: 100%; }
"""


LIST_ITEM = re.compile(r"^(\s*)([-*]|\d+\.)\s")


def github_lists(md_text: str) -> str:
    """Adapt GitHub-style lists for Python-Markdown: a blank line before a list that follows a
    paragraph, and sub-list indents of 2 or 3 spaces widened to 4."""
    out: list[str] = []
    in_code = False
    for line in md_text.splitlines():
        if line.startswith("```"):
            in_code = not in_code
        m = None if in_code else LIST_ITEM.match(line)
        if m:
            indent = len(m.group(1))
            if 0 < indent < 4:
                line = "    " + line.lstrip()
            prev = out[-1] if out else ""
            if prev.strip() and not LIST_ITEM.match(prev) and not prev.startswith(" "):
                out.append("")
        out.append(line)
    return "\n".join(out)


def to_html(md_text: str) -> str:
    body = markdown.markdown(github_lists(md_text), extensions=["tables", "fenced_code"])
    # standalone images -> <figure> with the alt text as caption
    body = re.sub(
        r'<p><img alt="([^"]*)" src="([^"]+)" ?/?></p>',
        r'<figure><img alt="\1" src="\2"><figcaption>\1</figcaption></figure>',
        body,
    )
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'


def compress(pdf: Path) -> None:
    """Downsample images to 150 dpi with Ghostscript (if installed). Chromium's PDF embeds the
    full-resolution PNGs (~1.3 MB), which GitHub's PDF viewer refuses to display."""
    gs = shutil.which("gs")
    if not gs:
        print("Ghostscript not found: PDF left uncompressed")
        return
    tmp = pdf.with_suffix(".tmp.pdf")
    subprocess.run(
        [
            gs,
            "-q",
            "-dNOPAUSE",
            "-dBATCH",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.5",
            "-dPDFSETTINGS=/ebook",
            "-dColorImageResolution=150",
            f"-sOutputFile={tmp}",
            str(pdf),
        ],
        check=True,
    )
    tmp.replace(pdf)
    # GitHub's PDF viewer still rejected the Chromium/Ghostscript output; a poppler/cairo re-encode works
    cairo = shutil.which("pdftocairo")
    if cairo:
        subprocess.run([cairo, "-pdf", str(pdf), str(tmp)], check=True)
        tmp.replace(pdf)


def count_pages(pdf: Path) -> int:
    """Page count via poppler's pdfinfo (pages may sit in compressed object streams)."""
    info = shutil.which("pdfinfo")
    if info:
        out = subprocess.run([info, str(pdf)], capture_output=True, text=True, check=True).stdout
        return int(re.search(r"^Pages:\s+(\d+)", out, re.M).group(1))
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf.read_bytes()))


async def main() -> None:
    html_path = DOCS / "_documentation_build.html"
    html_path.write_text(to_html(SRC.read_text(encoding="utf-8")), encoding="utf-8")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.goto(html_path.as_uri(), wait_until="networkidle")
            await page.pdf(
                path=str(OUT),
                format="A4",
                print_background=True,
                display_header_footer=True,
                header_template="<span></span>",
                footer_template='<div style="font-size:7pt;color:#6b7280;width:100%;text-align:center">'
                'CardioScope · page <span class="pageNumber"></span> of '
                '<span class="totalPages"></span></div>',
            )
            await browser.close()
    finally:
        html_path.unlink(missing_ok=True)
    compress(OUT)
    pages = count_pages(OUT)
    print(f"{OUT.name}: {pages} pages")
    if pages > MAX_PAGES:
        raise SystemExit(f"Too long: {pages} pages > {MAX_PAGES}")


if __name__ == "__main__":
    asyncio.run(main())
