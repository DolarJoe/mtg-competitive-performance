#!/usr/bin/env node
/*
 * build-site.js — render the decklist JSONL into a single self-contained
 * HTML card-frequency table. No server, no build step, no CDN.
 *
 *   node scripts/build-site.js [--file data/pauper-last2Weeks.jsonl] [--out docs/last-2-weeks.html]
 *
 * One page per view, named after the view: data/pauper-last2Weeks.jsonl ->
 * docs/last-2-weeks.html. The view comes from the JSONL's own `view` field, not
 * from the filename, and the heading on the page says which window the data is.
 *
 * Every run also regenerates <dir>/index.html, indexing the window pages sitting
 * beside it. That index is what GitHub Pages serves at the site root (folder
 * /docs publishes at /, not /docs/), so `index.html` is reserved: passing it as
 * --out throws rather than silently replacing the index with one window.
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i === -1 ? dflt : argv[i + 1];
};

const file = flag('file', 'data/pauper-last2Weeks.jsonl');

/* mtgtop8's own label for each view -- these become page headings, so they are
 * taken from what the site prints, not from the submodule's urlMap (which calls
 * meta=299 "last2Months" while the site calls it "Last 2 Weeks"). See AGENTS.md. */
const VIEW_LABELS = {
    last5Days: 'Last 5 Days',
    last2Weeks: 'Last 2 Weeks',
    last2Months: 'Last 2 Months',
    lastMajorEvents: 'Last Major Events (2 Months)',
    last4Months: 'Last 4 Months',
    liveTournaments: 'Live Tournaments, Last 3 Months',
    all2026Decks: 'All 2026 decks',
    all2025Decks: 'All 2025 decks',
    all2024Decks: 'All 2024 decks',
    all2023Decks: 'All 2023 decks',
    all2022Decks: 'All 2022 decks',
    all2021Decks: 'All 2021 decks',
    all2020Decks: 'All 2020 decks',
    all2019Decks: 'All 2019 decks',
    all2018Decks: 'All 2018 decks',
    all2017Decks: 'All 2017 decks',
    all2016Decks: 'All 2016 decks',
    allPauperDecks: 'All Pauper decks',
};

/** last2Weeks -> last-2-weeks, all2026Decks -> all-2026-decks. Split on
 * letter->digit and on digit-or-lowercase->uppercase; one pass misses the
 * digit boundary and produced last2-weeks. */
const slugOf = (k) => String(k)
    .replace(/([a-z])(\d)/g, '$1-$2')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .toLowerCase();

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
    'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
    'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes']);

const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const n = rows.length;

const view = (rows[0] && rows[0].view) || path.basename(file, '.jsonl').replace(/^pauper-/, '');
const label = VIEW_LABELS[view] || view;
const out = flag('out', path.join('docs', `${slugOf(view)}.html`));
if (path.basename(out) === 'index.html') {
    throw new Error(`${out} is reserved for the generated window index (Pages serves it at the site root). Build to docs/${slugOf(view)}.html and the index is rewritten for you.`);
}

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

const payload = JSON.stringify({ rows: cards, n, view, label,
    generated: new Date().toISOString(), source: path.basename(file) });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label} · Pauper card occurrences</title>
<style>
  :root { --bg:#14161a; --fg:#e6e6e6; --dim:#8b93a1; --line:#262a31; --hi:#ffd166; --bar:#2b6cb0; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line);
           padding:14px 18px; z-index:2; }
  h1 { margin:0 0 4px; font-size:15px; letter-spacing:.04em; text-transform:uppercase; }
  h1 .win { color:var(--hi); text-transform:none; letter-spacing:0; }
  .home { color:var(--dim); text-decoration:none; font-size:12px; }
  .home:hover { color:var(--fg); }
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
  <a class="home" href="./">← all windows</a>
  <h1>Pauper card occurrences <span class="win">— ${label}</span></h1>
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
el('meta').textContent = DATA.n + ' decklists from mtgtop8\u2019s \u201c' + DATA.label + '\u201d view \u00b7 '
  + DATA.rows.length + ' distinct cards \u00b7 scraped ' + new Date(DATA.generated).toLocaleString()
  + ' \u00b7 ' + DATA.source;

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
console.log(`${label}: ${cards.length} cards from ${n} decklists -> ${out} (${(html.length / 1024).toFixed(0)} KB)`);
console.log('top 5 by occurrences:', cards.slice(0, 5).map((c) => `${c.n} ${c.o}`).join(', '));

/* Regenerate the Pages root from whatever window pages are on disk, so the
 * index can only ever list pages that actually exist. Reads each page's own
 * DATA payload rather than trusting a manifest that could drift. */
const dir = path.dirname(out);
const windows = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .map((f) => {
        const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/const DATA = (\{.*\});/);
        if (!m) return null;
        try {
            const d = JSON.parse(m[1]);
            return { href: f, label: d.label || d.view || f, n: d.n, cards: d.rows.length, generated: d.generated };
        } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.generated).localeCompare(String(a.generated)));

const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pauper card occurrences</title>
<style>
  :root { --bg:#14161a; --fg:#e6e6e6; --dim:#8b93a1; --line:#262a31; --hi:#ffd166; }
  * { box-sizing:border-box; }
  body { margin:0; padding:30px 20px 60px; background:var(--bg); color:var(--fg);
         font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  main { max-width:52rem; margin:0 auto; }
  h1 { margin:0 0 6px; font-size:15px; letter-spacing:.04em; text-transform:uppercase; }
  .lede { color:var(--dim); margin:0 0 22px; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--dim); font-weight:400; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  a { color:var(--hi); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .when { color:var(--dim); }
  .note { color:var(--dim); margin-top:22px; font-size:12px; }
</style>
</head>
<body>
<main>
  <h1>Pauper card occurrences</h1>
  <p class="lede">Every card in every competitive Pauper decklist mtgtop8 lists, ranked by how often it was played. Pick a time window.</p>
  <table>
    <thead><tr><th>Window</th><th class="num">Distinct cards</th><th class="num">Decklists</th><th>Scraped</th></tr></thead>
    <tbody>
${windows.map((w) => `      <tr><td><a href="${w.href}">${w.label}</a></td><td class="num">${w.cards}</td><td class="num">${w.n}</td><td class="when">${new Date(w.generated).toLocaleDateString()}</td></tr>`).join('\n')}
    </tbody>
  </table>
  <p class="note">Windows are mtgtop8&rsquo;s own rolling views, not calendar ranges &mdash; &ldquo;Last 2 Weeks&rdquo; means the fortnight before the scrape date shown. Source: mtgtop8.com decklists.</p>
</main>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, 'index.html'), index);
console.log(`index (${windows.length} window page${windows.length === 1 ? '' : 's'}): ${windows.map((w) => w.href).join(', ')} -> ${path.join(dir, 'index.html')}`);
