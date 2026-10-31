#!/usr/bin/env python3
"""把 charter/index.md 编译成 charter/index.html。

只用标准库，支持本页用到的 Markdown 子集：
标题、段落、引用、分隔线、表格、有序/无序列表、围栏代码块，
以及行内的 **粗体**、*斜体*、`代码`、[链接](url)。
用法：python3 scripts/build.py
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "charter" / "index.md"
DST = ROOT / "charter" / "index.html"

SEP_CELL = re.compile(r"^:?-{3,}:?$")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
ORDERED = re.compile(r"^\d+\.\s+")
UNORDERED = re.compile(r"^[-*+]\s+")


def inline(text: str) -> str:
    stash: list[str] = []

    def keep(fragment: str) -> str:
        stash.append(fragment)
        return f"\x00{len(stash) - 1}\x00"

    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", lambda m: keep(f"<code>{m.group(1)}</code>"), text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>',
        text,
    )
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)


def split_row(line: str) -> list[str]:
    row = line.strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|"):
        row = row[:-1]
    return [cell.strip() for cell in row.split("|")]


def is_separator(line: str) -> bool:
    cells = split_row(line)
    return bool(cells) and all(SEP_CELL.match(cell) for cell in cells)


def alignment(cell: str) -> str:
    cell = cell.strip()
    if cell.startswith(":") and cell.endswith(":"):
        return "center"
    if cell.endswith(":"):
        return "right"
    return "left"


def render_table(header: list[str], aligns: list[str], rows: list[list[str]]) -> str:
    def cells(tag: str, values: list[str]) -> str:
        out = []
        for idx, value in enumerate(values):
            align = aligns[idx] if idx < len(aligns) else "left"
            out.append(f'<{tag} style="text-align:{align}">{inline(value)}</{tag}>')
        return "".join(out)

    head = f"<thead><tr>{cells('th', header)}</tr></thead>"
    body = "".join(f"<tr>{cells('td', row)}</tr>" for row in rows)
    return f"<table>{head}<tbody>{body}</tbody></table>"


def render_list(ordered: bool, items: list[str]) -> str:
    tag = "ol" if ordered else "ul"
    body = "".join(f"<li>{inline(item)}</li>" for item in items)
    return f"<{tag}>{body}</{tag}>"


def convert(markdown: str) -> tuple[str, list[tuple[str, str]]]:
    lines = markdown.splitlines()
    out: list[str] = []
    toc: list[tuple[str, str]] = []
    title_seen = False
    i, n = 0, len(lines)

    while i < n:
        stripped = lines[i].strip()

        if not stripped:
            i += 1
            continue

        if stripped.startswith("```"):
            i += 1
            buf: list[str] = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append(f'<pre><code>{html.escape(chr(10).join(buf))}</code></pre>')
            continue

        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            out.append("<hr>")
            i += 1
            continue

        heading = HEADING.match(stripped)
        if heading:
            level, text = len(heading.group(1)), heading.group(2).strip()
            if level == 1 and not title_seen:
                title_seen = True
                i += 1
                continue
            if level == 2:
                slug = f"sec-{len(toc) + 1}"
                toc.append((slug, text))
                out.append(f'<h2 id="{slug}">{inline(text)}</h2>')
            else:
                out.append(f"<h{level}>{inline(text)}</h{level}>")
            i += 1
            continue

        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            body = "".join(f"<p>{inline(part)}</p>" for part in buf if part)
            out.append(f"<blockquote>{body}</blockquote>")
            continue

        if "|" in stripped and i + 1 < n and is_separator(lines[i + 1]):
            header = split_row(stripped)
            aligns = [alignment(cell) for cell in split_row(lines[i + 1])]
            i += 2
            rows: list[list[str]] = []
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(split_row(lines[i]))
                i += 1
            out.append(render_table(header, aligns, rows))
            continue

        if ORDERED.match(stripped) or UNORDERED.match(stripped):
            ordered = bool(ORDERED.match(stripped))
            pattern = ORDERED if ordered else UNORDERED
            items: list[str] = []
            while i < n and pattern.match(lines[i].strip()):
                items.append(pattern.sub("", lines[i].strip(), count=1))
                i += 1
            out.append(render_list(ordered, items))
            continue

        buf = []
        while i < n:
            current = lines[i]
            if not current.strip():
                break
            if out and (
                HEADING.match(current.strip())
                or current.strip().startswith((">", "```"))
                or ORDERED.match(current.strip())
                or UNORDERED.match(current.strip())
                or re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", current.strip())
            ):
                break
            if "|" in current and i + 1 < n and is_separator(lines[i + 1]):
                break
            buf.append(current.strip())
            i += 1
        if buf:
            out.append(f"<p>{inline(' '.join(buf))}</p>")

    return "\n".join(out), toc


TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · 桂东一中计算机社团</title>
  <meta name="description" content="{title}">
  <link rel="stylesheet" href="../assets/site.css">
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a class="brand" href="../index.html">
        桂东一中计算机社团
      </a>
      <nav class="nav">
        <a href="../index.html">首页</a>
        <a href="../news/index.html">社团动态</a>
        <a href="../services/index.html">一件事方便办</a>
        <a class="active" href="index.html">社团总纲</a>
        <a href="../index.html#departments">部门</a>
        <a href="../index.html#activities">活动</a>
        <a href="../index.html#join">加入我们</a>
      </nav>
    </div>
  </header>

  <main>
    <div class="page-head">
      <div class="wrap">
        <p class="crumbs"><a href="../index.html">首页</a> / 社团总纲</p>
        <h1>{title}</h1>
        <p>社团章程全文 · 经社团讨论、指导老师审核后生效</p>
      </div>
    </div>

    <div class="wrap doc-layout">
      <aside class="toc">
        <strong>目录</strong>
        <ul>
{toc}
        </ul>
      </aside>
      <article class="doc">
{body}
      </article>
    </div>
  </main>

  <footer class="footer">
    <div class="wrap footer-inner">
      <span>规范 · 开放 · 协作 · 进取</span>
      <span>© 2026 桂东一中计算机社团 · <a href="../index.html">返回首页</a> · <a href="../admin/">管理员入口</a></span>
    </div>
  </footer>
</body>
</html>
"""


def main() -> None:
    markdown = SRC.read_text(encoding="utf-8")
    body, toc = convert(markdown)

    match = HEADING.match(markdown.lstrip().splitlines()[0]) if markdown.strip() else None
    title = match.group(2).strip() if match else "社团总纲"

    toc_html = "\n".join(
        f'          <li><a href="#{slug}">{html.escape(text)}</a></li>'
        for slug, text in toc
    )
    DST.write_text(
        TEMPLATE.format(title=html.escape(title), body=body, toc=toc_html),
        encoding="utf-8",
    )
    print(f"built {DST.relative_to(ROOT)}  ({len(toc)} sections, {DST.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
