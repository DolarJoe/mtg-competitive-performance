#!/usr/bin/env node
/*
 * build-site.js — render the decklist JSONL into a single self-contained
 * HTML card-frequency table. No server, no build step, no CDN: open
 * docs/index.html directly.
 *
 *   node scripts/build-site.js [--file data/pauper-last2Weeks.jsonl] [--out docs/index.html]
 *
 * Default output is docs/index.html because that is what GitHub Pages serves
 * for this repo (Settings → Pages → branch main, folder /docs, published at the
 * site root, NOT at /docs/). Building anywhere else publishes nothing.
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i === -1 ? dflt : argv[i + 1];
};

const file = flag('file', 'data/pauper-last2Weeks.jsonl');
const out = flag('out', 'docs/index.html');

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
    'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
    'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes']);

const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const n = rows.length;

const agg = new Map();
for (const deck of rows) {
    const seen = new Set();
    for (const c of deck.cards) {
        if (!agg.has(c.name)) {
            agg.set(c.name, { name: c.name, mainQty: 0, mainDecks: 0, sideQty: 0, sideDecks: 0,
                basic: BASICS.has(c.name), archs: {} });
        }
        const a = agg.get(c.name);
        const isMain = c.section === 'main';
        if (isMain) a.mainQty += c.count; else a.sideQty += c.count;
        if (!seen.has(c.name + c.section)) {
            seen.add(c.name + c.section);
            if (isMain) a.mainDecks += 1; else a.sideDecks += 1;
            a.archs[deck.archetype] = (a.archs[deck.archetype] || 0) + 1;
        }
    }
}

const cards = [...agg.values()].map((a) => {
    const archList = Object.entries(a.archs).sort((x, y) => y[1] - x[1]);
    return {
        n: a.name,
        mq: a.mainQty,
        md: a.mainDecks,
        sq: a.sideQty,
        sd: a.sideDecks,
        o: a.mainQty + a.sideQty,
        d: Math.max(a.mainDecks, a.sideDecks),
        na: archList.length,
        ar: archList.slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', '),
        b: a.basic ? 1 : 0,
    };
}).sort((x, y) => y.o - x.o);

const payload = JSON.stringify({ rows: cards, n, generated: new Date().toISOString(), source: path.basename(file) });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pauper card occurrences</title>
<style>
  :root { --bg:#14161a; --fg:#e6e6e6; --dim:#8b93a1; --line:#262a31; --hi:#ffd166; --bar:#2b6cb0; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line);
           padding:14px 18px; z-index:2; }
  h1 { margin:0 0 4px; font-size:15px; letter-spacing:.04em; text-transform:uppercase; }
  .sub { color:var(--dim); font-size:12px; }
  .controls { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px; }
  input[type=search] { background:#0e1013; color:var(--fg); border:1px solid var(--line);
           border-radius:4px; padding:6px 9px; font:inherit; min-width:220px; }
  button { background:#0e1013; color:var(--fg); border:1px solid var(--line); border-radius:4px;
           padding:6px 10px; font:inherit; cursor:pointer; }
  button[aria-pressed=true] { border-color:var(--hi); color:var(--hi); }
  .count { color:var(--dim); font-size:12px; margin-left:auto; }
  table { border-collapse:collapse; width:100%; }
  th, td { padding:5px 10px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; }
  th:nth-child(2), td:nth-child(2) { text-align:left; width:40%; }
  th:last-child, td:last-child { text-align:left; color:var(--dim); font-size:12px; }
  th { position:sticky; top:0; background:var(--bg); cursor:pointer; user-select:none;
       font-weight:600; color:var(--dim); border-top:none; }
  th[data-sorted] { color:var(--hi); }
  tbody tr:hover { background:#1a1d23; }
  td.basic { color:var(--dim); }
  .bar { display:inline-block; height:8px; background:var(--bar); vertical-align:middle;
         margin-right:6px; border-radius:2px; }
  .o { font-variant-numeric:tabular-nums; }
</style>
</head>
<body>
<header>
  <h1>Pauper card occurrences</h1>
  <div class="sub" id="meta"></div>
  <div class="controls">
    <input type="search" id="q" placeholder="filter card name…" autocomplete="off">
    <button id="sec" data-sec="main" aria-pressed="true">mainboard only</button>
    <button id="basics" aria-pressed="true">hide basics</button>
    <span class="count" id="count"></span>
  </div>
</header>
<table>
  <thead><tr>
    <th data-k="o">Occurrences</th>
    <th data-k="n">Card</th>
    <th data-k="d">Decks</th>
    <th data-k="p">% decks</th>
    <th data-k="mq">Main qty</th>
    <th data-k="sq">Side qty</th>
    <th data-k="na">Archetypes</th>
    <th data-k="ar">Mostly played in</th>
  </tr></thead>
  <tbody id="tb"></tbody>
</table>
<script>
const DATA = ${payload};
let sortKey = 'o', sortDir = -1, section = 'main', hideBasics = true, query = '';

const el = (id) => document.getElementById(id);
el('meta').textContent = DATA.rows.length + ' cards across ' + DATA.n + ' decklists · '
  + DATA.source + ' · generated ' + new Date(DATA.generated).toLocaleString();

function value(c, k) {
  if (k === 'p') return section === 'main' ? c.md / DATA.n : c.sd / DATA.n;
  if (k === 'n' || k === 'ar') return c[k];
  if (section === 'both') { if (k === 'o') return c.o; if (k === 'd') return c.d; }
  if (section === 'main') { if (k === 'o') return c.mq; if (k === 'd') return c.md; if (k === 'sq') return -1; }
  if (section === 'side') { if (k === 'o') return c.sq; if (k === 'd') return c.sd; if (k === 'mq') return -1; }
  return c[k];
}

function visible() {
  return DATA.rows.filter((c) =>
    (!hideBasics || !c.b) &&
    (value(c, 'o') > 0) &&
    (!query || c.n.toLowerCase().includes(query)));
}

function render() {
  const rows = visible().sort((x, y) => {
    const a = value(x, sortKey), b = value(y, sortKey);
    if (typeof a === 'string') return sortDir * a.localeCompare(b);
    return sortDir * (a - b);
  });
  const max = Math.max(1, ...rows.map((c) => value(c, 'o')));
  el('tb').innerHTML = rows.map((c) => {
    const occ = value(c, 'o'), decks = value(c, 'd');
    const pct = (100 * value(c, 'p')).toFixed(1);
    const w = Math.round(60 * occ / max);
    return '<tr>'
      + '<td class="o"><span class="bar" style="width:' + w + 'px"></span>' + occ.toLocaleString() + '</td>'
      + '<td' + (c.b ? ' class=basic' : '') + '>' + c.n + '</td>'
      + '<td>' + decks + '</td>'
      + '<td>' + pct + '%</td>'
      + '<td>' + (section === 'side' ? '—' : c.mq) + '</td>'
      + '<td>' + (section === 'main' ? '—' : c.sq) + '</td>'
      + '<td>' + c.na + '</td>'
      + '<td>' + c.ar + '</td>'
      + '</tr>';
  }).join('');
  el('count').textContent = rows.length + ' cards';
  document.querySelectorAll('th').forEach((t) => {
    if (t.dataset.k === sortKey) t.dataset.sorted = sortDir < 0 ? 'desc' : 'asc';
    else delete t.dataset.sorted;
  });
}

document.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = (k === 'n' || k === 'ar') ? 1 : -1; }
  render();
}));

el('q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });

el('sec').addEventListener('click', (e) => {
  const next = section === 'main' ? 'side' : section === 'side' ? 'both' : 'main';
  section = next;
  e.target.dataset.sec = next;
  e.target.textContent = next === 'main' ? 'mainboard only' : next === 'side' ? 'sideboard only' : 'main + side';
  render();
});

el('basics').addEventListener('click', (e) => {
  hideBasics = !hideBasics;
  e.target.setAttribute('aria-pressed', String(hideBasics));
  render();
});

render();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${cards.length} cards from ${n} decklists -> ${out} (${(html.length / 1024).toFixed(0)} KB)`);
console.log('top 5 by occurrences:', cards.slice(0, 5).map((c) => `${c.n} ${c.o}`).join(', '));
