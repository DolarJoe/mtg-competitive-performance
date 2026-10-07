'use strict';
/* Generates docs/tag-tree.html — a layered DAG visualization of the
 * Scryfall tag hierarchy from the tag dump JSONL.
 * Each tag appears once. Parent->child edges are drawn for all relationships.
 * Pure JS + SVG, no deps. Usage: node scripts/gen-tag-tree.js [in] [out]
 */
const fs = require('fs');
const path = require('path');

const inFile = process.argv[2] || 'oracle-tags-20260923090037.jsonl';
const outFile = process.argv[3] || path.join('docs', 'tag-tree.html');

const lines = fs.readFileSync(inFile, 'utf8').trim().split('\n').map(JSON.parse);
const byId = new Map(lines.map(r => [r.id, r]));

// Build adjacency lists
const childrenMap = {};
const parentsMap = {};
for (const r of lines) {
  childrenMap[r.id] = r.child_ids || [];
  if (!parentsMap[r.id]) parentsMap[r.id] = [];
  for (const pid of r.parent_ids) parentsMap[r.id].push(pid);
}

// Compute depth = longest path from any root (root = node with no parents)
const roots = lines.filter(r => !parentsMap[r.id].length);
const depth = {};
function computeDepth(id) {
  if (depth[id] !== undefined) return depth[id];
  if (!parentsMap[id].length) return (depth[id] = 0);
  const maxChild = Math.max(...parentsMap[id].map(pid => computeDepth(pid)));
  return (depth[id] = maxChild + 1);
}
for (const r of roots) computeDepth(r.id);

// All nodes with depth
const all = lines.map(r => ({ ...r, _depth: depth[r.id] }));

// Edges: all original parent->child edges
const edges = [];
for (const r of lines) {
  for (const cid of r.child_ids) edges.push({ s: r.id, t: cid });
}

// Order nodes lexicographically by slug within each depth for stable layout
const byDepth = {};
for (const n of all) {
  if (!byDepth[n._depth]) byDepth[n._depth] = [];
  byDepth[n._depth].push(n);
}
for (const d in byDepth) byDepth[d].sort((a, b) => a.slug.localeCompare(b.slug));

const xIndex = {};
for (const d in byDepth) {
  for (let i = 0; i < byDepth[d].length; i++) xIndex[byDepth[d][i].id] = i;
}

const NODES = all.map(n => ({
  id: n.id, label: n.label, slug: n.slug, depth: n._depth, x: xIndex[n.id],
  desc: (n.description || '').replace(/"/g, '"').slice(0, 200),
  taggingCount: n.taggings.length,
}));

const EDGE_JSON = JSON.stringify(edges);
const NODE_JSON = JSON.stringify(NODES);

const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Scryfall tag hierarchy (DAG)</title>
<style>
  html, body { margin: 0; background: #0d1117; color: #c9d1d9; font-family: ui-sans-serif, system-ui, sans-serif; overflow: hidden; height: 100%; }
  #top { position: fixed; top: 0; left: 0; right: 0; padding: 10px 14px; background: #161b22; border-bottom: 1px solid #30363d; z-index: 10; font-size: 13px; display: flex; gap: 12px; align-items: center; }
  #top input { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 4px 8px; border-radius: 4px; width: 260px; }
  #info { color: #8b949e; margin-left: auto; }
  svg { cursor: grab; touch-action: none; }
  svg:active { cursor: grabbing; }
  .edge { stroke: #30363d; stroke-width: 0.9; fill: none; }
  .edge.dim { stroke: #21262d; }
  .node circle { stroke: #0d1117; stroke-width: 1.5; cursor: pointer; }
  .node text { fill: #8b949e; font-size: 10px; pointer-events: none; }
  .node.dim circle, .node.dim text { opacity: 0.25; }
  .node text.sel { fill: #f0f6fc; font-weight: 600; }
  .node.sel circle { stroke: #f0f6fc; stroke-width: 2.5; }
  .tooltip { position: fixed; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: 8px 10px; border-radius: 6px; font-size: 12px; max-width: 320px; pointer-events: none; display: none; z-index: 20; }
</style></head>
<body>
<div id="top">
  <span><b>Scryfall tag tree (DAG)</b> · ${lines.length} tags · ${roots.length} roots</span>
  <input id="filter" placeholder="filter by label / slug…">
  <span id="info">scroll: zoom · drag: pan · click: highlight node</span>
</div>
<svg id="svg"></svg>
<div class="tooltip" id="tip"></div>
<script>
const ALL_NODES = ${NODE_JSON};
const EDGES = ${EDGE_JSON};

const SX = 140; // horizontal spacing per depth
const SY = 12;  // vertical spacing per node index
const svg = document.getElementById('svg');
const tip = document.getElementById('tip');
let transform = { x: 40, y: 60, k: 1 };
let selected = null;
const filterEl = document.getElementById('filter');

const kidsOf = {};
const parentsOf = {};
for (const e of EDGES) {
  (kidsOf[e.s] = kidsOf[e.s] || []).push(e.t);
  (parentsOf[e.t] = parentsOf[e.t] || []).push(e.s);
}

function xOf(n) { return n.depth * SX + n.x * SY; }
function yOf(n) { return n._depth * 20 + 120; }

function visibleIds() {
  const keep = new Set();
  const f = filterEl.value.toLowerCase();
  function walk(node, force) {
    const match = !f || node.label.toLowerCase().includes(f) || node.slug.toLowerCase().includes(f);
    if (force || match) keep.add(node.id);
    const kids = kidsOf[node.id] || [];
    for (const kid of kids) {
      const k = ALL_NODES.find(n => n.id === kid);
      if (k) walk(k, false);
    }
  }
  ALL_NODES.filter(n => !parentsOf[n.id]?.length).forEach(r => walk(r, false));
  return keep;
}

function render() {
  const W = window.innerWidth, H = window.innerHeight;
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', \`\${transform.x} \${transform.y} \${W / transform.k} \${H / transform.k}\`);
  svg.innerHTML = '';
  const vis = visibleIds();
  const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(g1); svg.appendChild(g2);

  for (const e of EDGES) {
    if (!vis.has(e.s) || !vis.has(e.t)) continue;
    const s = ALL_NODES.find(n => n.id === e.s);
    const t = ALL_NODES.find(n => n.id === e.t);
    const sx = xOf(s), sy = yOf(s), tx = xOf(t), ty = yOf(t);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('class', 'edge');
    p.setAttribute('d', \`M\${sx},\${sy} L\${tx},\${ty}\`);
    const dim = filterEl.value && !(
      s.label.toLowerCase().includes(filterEl.value.toLowerCase()) ||
      s.slug.toLowerCase().includes(filterEl.value.toLowerCase()) ||
      t.label.toLowerCase().includes(filterEl.value.toLowerCase()) ||
      t.slug.toLowerCase().includes(filterEl.value.toLowerCase())
    );
    if (dim) p.classList.add('dim');
    g1.appendChild(p);
  }

  for (const n of ALL_NODES) {
    if (!vis.has(n.id)) continue;
    const cx = xOf(n), cy = yOf(n);
    const col = n.depth === 0 ? '#f78166' : n.depth === 1 ? '#58a6ff' : n.depth === 2 ? '#8b949e' : '#3fb950';
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.className = 'node';
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 6);
    c.setAttribute('fill', col);
    c.addEventListener('click', ev => { ev.stopPropagation(); selected = selected === n.id ? null : n.id; render(); });
    c.addEventListener('mouseenter', ev => showTip(ev, n));
    c.addEventListener('mouseleave', hideTip);
    g.appendChild(c);
    const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tx.setAttribute('x', cx + 8); tx.setAttribute('y', cy + 3);
    tx.textContent = n.label + (n.taggingCount ? ' (' + n.taggingCount + ')' : '');
    if (selected === n.id) { tx.classList.add('sel'); g.classList.add('sel'); }
    g.appendChild(tx);
    g2.appendChild(g);
  }
}

function showTip(ev, n) {
  tip.style.display = 'block';
  tip.style.left = (ev.clientX + 12) + 'px'; tip.style.top = (ev.clientY + 12) + 'px';
  tip.innerHTML = '<b>' + n.label + '</b> <i>' + n.slug + '</i><br>'
    + 'depth ' + n.depth + ' · taggings ' + n.taggingCount + (n.desc ? '<br><i>' + n.desc + '</i>' : '');
}
function hideTip() { tip.style.display = 'none'; }

let dragging = false, sx0 = 0, sy0 = 0, tx0 = 0, ty0 = 0;
svg.addEventListener('pointerdown', e => {
  if (e.target === svg) {
    dragging = true;
    sx0 = e.clientX; sy0 = e.clientY;
    tx0 = transform.x; ty0 = transform.y;
  }
});
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  transform.x = tx0 + (e.clientX - sx0) / transform.k;
  transform.y = ty0 + (e.clientY - sy0) / transform.k;
  render();
});
window.addEventListener('pointerup', () => dragging = false);
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const k = transform.k * (e.deltaY > 0 ? 0.9 : 1.1);
  transform.k = Math.max(0.05, Math.min(4, k));
  render();
}, { passive: false });

filterEl.addEventListener('input', () => render());
window.addEventListener('resize', () => render());
render();
</script>
</body></html>
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log('wrote', outFile, 'nodes:', NODES.length, 'edges:', edges.length, 'roots:', roots.length);
