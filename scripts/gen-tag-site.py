#!/usr/bin/env python3
"""Generate a static site for the Scryfall tag dump.

Usage: python3 scripts/gen-tag-site.py [in.jsonl.gz] [out_dir]
Defaults: oracle-tags-20260923090037.jsonl.gz -> docs/tags/

Outputs:
  index.html  - searchable/sortable paginated list of all tags
  tree.html   - collapsible hierarchy (parent_ids/child_ids)
"""
import gzip
import json
import sys
from collections import defaultdict
from html import escape as html_escape
from pathlib import Path


def load_tags(in_path):
    opener = gzip.open if str(in_path).endswith(".gz") else open
    with opener(in_path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def build_hierarchy(tags):
    by_id = {t["id"]: t for t in tags}
    children = defaultdict(list)
    parents = defaultdict(list)
    for t in tags:
        for cid in t.get("child_ids", []):
            if cid in by_id:
                children[t["id"]].append(by_id[cid])
                parents[cid].append(t["id"])
    roots = [t for t in tags if not parents[t["id"]]]
    return roots, children, parents


def compute_depths(tags, parents):
    depth = {}
    def get_depth(id_):
        if id_ in depth:
            return depth[id_]
        par = parents.get(id_, [])
        depth[id_] = 0 if not par else max(get_depth(p) for p in par) + 1
        return depth[id_]
    for t in tags:
        t["_depth"] = get_depth(t["id"])


def make_index_html(tags, total):
    rows = []
    for t in sorted(tags, key=lambda x: (x.get("_depth", 0), x.get("slug", ""))):
        rows.append(f'''<tr data-slug="{html_escape(t['slug'])}" data-label="{html_escape(t['label'])}">
<td>{t['_depth']}</td>
<td><a href="#{html_escape(t['slug'])}">{html_escape(t['label'])}</a></td>
<td><code>{html_escape(t['slug'])}</code></td>
<td>{len(t.get('parent_ids', []))}</td>
<td>{len(t.get('child_ids', []))}</td>
<td>{len(t.get('taggings', []))}</td>
<td>{html_escape((t.get('description') or '')[:120])}</td>
</tr>''')
    rows_html = "\n".join(rows)
    return f'''<!doctype html>
<html><head>
<meta charset="utf-8"><title>Scryfall tags</title>
<style>
body {{ font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 1rem; background: #0d1117; color: #c9d1d9; }}
h1 {{ font-size: 1.5rem; }}
.controls {{ display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }}
input, select {{ background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: .4rem .6rem; border-radius: 4px; width: 280px; }}
table {{ border-collapse: collapse; width: 100%; font-size: .85rem; }}
th, td {{ text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #21262d; }}
th {{ cursor: pointer; user-select: none; background: #161b22; position: sticky; top: 0; }}
th:hover {{ color: #f0f6fc; }}
a {{ color: #58a6ff; }}
code {{ font-size: .8rem; }}
#info {{ color: #8b949e; margin-left: auto; }}
.pager {{ display: flex; gap: .5rem; align-items: center; margin-top: 1rem; justify-content: center; }}
.pager button {{ background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: .3rem .8rem; border-radius: 4px; cursor: pointer; }}
.pager button:disabled {{ opacity: .4; cursor: default; }}
.pager button:hover:not(:disabled) {{ background: #30363d; }}
</style></head>
<body>
<h1>Scryfall tags</h1>
<div class="controls">
<input id="q" placeholder="filter by label or slug">
<select id="depth"><option value="">all depths</option><option value="0">depth 0</option><option value="1">depth 1</option><option value="2">depth 2</option></select>
<span id="info">{total} tags</span>
</div>
<table>
<thead><tr>
<th data-sort="0">depth</th>
<th data-sort="1">label</th>
<th data-sort="2">slug</th>
<th data-sort="3">parents</th>
<th data-sort="4">children</th>
<th data-sort="5">taggings</th>
<th>description</th>
</tr></thead>
<tbody id="tbody">{rows_html}</tbody>
</table>
<div class="pager"><button id="prev">← prev</button><span id="pageinfo">page 1</span><button id="next">next →</button></div>
<script>
const ROWS = [...document.querySelectorAll('#tbody tr')];
const PAGE_SIZE = 100;
let page = 0, filtered = ROWS;
function render() {{
  const start = page * PAGE_SIZE;
  document.querySelector('#tbody').innerHTML = filtered.slice(start, start + PAGE_SIZE).map(r => r.outerHTML).join('') ||
    '<tr><td colspan="7" style="text-align:center;color:#8b949e">no matches</td></tr>';
  document.querySelector('#pageinfo').textContent = `page ${{page+1}} of ${{Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}}`;
  document.querySelector('#prev').disabled = page === 0;
  document.querySelector('#next').disabled = start + PAGE_SIZE >= filtered.length;
}}
function applyFilter() {{
  const q = document.getElementById('q').value.toLowerCase();
  const d = document.getElementById('depth').value;
  filtered = ROWS.filter(r => {{
    const label = r.cells[1].innerText.toLowerCase();
    const slug = r.cells[2].innerText.toLowerCase();
    const dep = r.cells[0].textContent;
    return (q ? label.includes(q) || slug.includes(q) : true) && (d ? dep === d : true);
  }});
  page = 0; render();
}}
document.getElementById('q').addEventListener('input', applyFilter);
document.getElementById('depth').addEventListener('change', applyFilter);
document.getElementById('prev').addEventListener('click', () => {{ page--; if (page < 0) page = 0; render(); }});
document.getElementById('next').addEventListener('click', () => {{ page++; render(); }});
document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', function() {{
  const rows = [...document.querySelectorAll('#tbody tr')];
  const idx = this.dataset.sort;
  rows.sort((a, b) => {{
    const av = a.cells[idx].textContent, bv = b.cells[idx].textContent;
    if (idx === '1') return a.dataset.label.localeCompare(b.dataset.label, undefined, {{numeric:true}});
    if (idx === '2') return a.dataset.slug.localeCompare(b.dataset.slug);
    return Number(av) - Number(bv);
  }});
  document.querySelector('#tbody').innerHTML = rows.map(r => r.outerHTML).join('');
}}));
render();
</script>
</body></html>'''


def make_tree_html(tags, roots, children):
    def htmlize(t, depth):
        cid = t["id"]
        kids = children.get(cid, [])
        sub = "".join(htmlize(k, depth + 1) for k in sorted(kids, key=lambda x: x["slug"])) if kids else ""
        return f'''<div class="node">
<details open><summary>{html_escape(t['label'])} <code>{html_escape(t['slug'])}</code> ({len(kids)} kids)</summary>
{sub}</details>
</div>'''
    nodes = "".join(htmlize(r, 0) for r in sorted(roots, key=lambda x: x["slug"]))
    return f'''<!doctype html>
<html><head>
<meta charset="utf-8"><title>Scryfall tag hierarchy</title>
<style>
body {{ font-family: system-ui, sans-serif; max-width: 1000px; margin: 0 auto; padding: 1rem; background: #0d1117; color: #c9d1d9; }}
h1 {{ font-size: 1.5rem; }}
.node {{ margin-left: 1.5rem; }}
details {{ padding: .2rem 0; }}
summary {{ cursor: pointer; }}
code {{ font-size: .85rem; }}
</style></head>
<body>
<h1>Scryfall tag hierarchy</h1>
{nodes}
</body></html>'''


def main():
    in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd() / "oracle-tags-20260923090037.jsonl.gz"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.cwd() / "docs" / "tags"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"loading {in_path}…")
    tags = load_tags(in_path)
    roots, children, parents = build_hierarchy(tags)
    compute_depths(tags, parents)

    print("writing index.html…")
    (out_dir / "index.html").write_text(make_index_html(tags, len(tags)), encoding="utf-8")
    print("writing tree.html…")
    (out_dir / "tree.html").write_text(make_tree_html(tags, roots, children), encoding="utf-8")
    print(f"done: {len(tags)} tags, {len(roots)} roots")


if __name__ == "__main__":
    main()
