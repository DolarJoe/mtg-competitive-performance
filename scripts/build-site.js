#!/usr/bin/env node
/*
 * build-site.js — render the decklist JSONL into a self-contained HTML page of
 * card images. No server, no build step, no bundler, no CDN of our own.
 *
 *   node scripts/build-site.js [--file data/pauper-last2Weeks.jsonl]
 *                              [--out docs/last-2-weeks.html]
 *                              [--cache scryfall_api/cache/cards.jsonl] [--per 40]
 *
 * The cards come out as a 4-column grid, 40 per page (4 wide × 10 tall), in the
 * same order the old frequency table used: by occurrences in the selected
 * section, most-played first. Paging is client-side — one HTML file per window,
 * the current page lives in the URL hash (#p=3) so links and Back work. Each
 * tile links to that card's Scryfall page in a new tab.
 *
 * Card images and links are joined from scryfall_api/cache/cards.jsonl, keyed by
 * the card name as mtgtop8 spelled it. That cache is committed; the
 * data/*.enriched.jsonl files it also produces are gitignored, so the build
 * never depends on an untracked file. A card with no cache entry still gets a
 * tile — a name-only placeholder — and the build prints how many were missing.
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
const cacheFile = flag('cache', path.join('scryfall_api', 'cache', 'cards.jsonl'));
const perPage = Math.max(1, Number(flag('per', 40)) || 40);

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

/** Same folding scryfall_api/lib/scryfall.js uses, so the join keys agree. */
const keyOf = (name) => String(name)
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const n = rows.length;

const view = (rows[0] && rows[0].view) || path.basename(file, '.jsonl').replace(/^pauper-/, '');
const label = VIEW_LABELS[view] || view;
const out = flag('out', path.join('docs', `${slugOf(view)}.html`));
if (path.basename(out) === 'index.html') {
    throw new Error(`${out} is reserved for the generated window index (Pages serves it at the site root). Build to docs/${slugOf(view)}.html and the index is rewritten for you.`);
}

/* ---- card images + links, from the scryfall_api cache -------------------
 * Keyed by mtgtop8's spelling. The split-card fallback matters: mtgtop8 posts
 * "Bedeck / Bedazzle", Scryfall names it "Bedeck // Bedazzle", and both spellings
 * have been written to the cache at different times. */
function loadImages(f) {
    if (!fs.existsSync(f)) return { map: new Map(), size: 0 };
    const map = new Map();
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let r;
        try { r = JSON.parse(line); } catch { continue; }
        if (r.key) map.set(r.key, r);
    }
    return { map, size: map.size };
}

const { map: imgMap, size: imgCount } = loadImages(cacheFile);

function lookupImage(name) {
    const k = keyOf(name);
    const variants = [k, k.replace(/\s*\/\/\s*/g, ' / '), k.replace(/\s*\/\s*/g, ' // '), k.split(' // ')[0]];
    for (const v of variants) {
        const hit = imgMap.get(v);
        if (hit && hit.img) return hit;
    }
    return null;
}

/* ---- frequency aggregation (unchanged from the table build) ------------- */
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

let missing = 0;
const cards = [...agg.values()].map((a) => {
    const archList = Object.entries(a.archs).sort((x, y) => y[1] - x[1]);
    const hit = lookupImage(a.name);
    if (!hit) missing += 1;
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
        i: hit ? hit.img : null,
        u: hit ? hit.url : null,
    };
}).sort((x, y) => y.o - x.o);

const payload = JSON.stringify({ rows: cards, n, view, label, per: perPage,
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
  .controls { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px; }
  input[type=search] { background:#0e1013; color:var(--fg); border:1px solid var(--line);
           border-radius:4px; padding:6px 9px; font:inherit; min-width:200px; }
  button { background:#0e1013; color:var(--fg); border:1px solid var(--line); border-radius:4px;
           padding:6px 10px; font:inherit; cursor:pointer; }
  button[aria-pressed=true] { border-color:var(--hi); color:var(--hi); }
  .group { display:flex; gap:4px; align-items:center; }
  .group .lbl { color:var(--dim); font-size:12px; margin-right:2px; }
  .count { color:var(--dim); font-size:12px; margin-left:auto; }

  /* Header, grid and pager share one centred measure, so the title lines up
   * with the tiles instead of floating at the viewport edge. */
  .wrap { max-width:1000px; margin:0 auto; }

  /* 4 tiles across, 10 rows per page, ~232px of art each: width-capped and
   * centred, not stretched — at full viewport width the tiles ran 341px and the
   * page read as four towering columns. Reflow to fewer columns rather than
   * shrink the art below ~200px; either way the page still holds 40 cards. */
  .grid { display:grid; gap:12px; padding:16px 18px 0; align-content:start;
          grid-template-columns:repeat(4, minmax(0,1fr)); max-width:1000px;
          margin:0 auto; }
  @media (max-width:860px)  { .grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media (max-width:640px)  { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:430px)  { .grid { grid-template-columns:repeat(1,minmax(0,1fr)); } }

  .tile { position:relative; display:flex; flex-direction:column; color:var(--fg);
          border:1px solid var(--line); border-radius:12px; background:#0e1013;
          text-decoration:none; overflow:hidden; }
  .tile:hover { border-color:var(--hi); }
  /* The tile carries no padding — the art is flush with the border and the
   * caption owns its spacing via margin — so overflow:hidden is what rounds the
   * top corners. The image's own 12px squares off its bottom corners, where
   * nothing clips them. No background behind the art: the cream plate only ever
   * showed through the rounded corners and during the load. */
  .tile img { display:block; width:100%; height:auto; border-radius:12px; }
  .cap { margin:8px 8px 6px; }
  .nm { font-size:13px; line-height:1.25; display:-webkit-box; -webkit-line-clamp:2;
        -webkit-box-orient:vertical; overflow:hidden; min-height:2.5em; }
  .stat { color:var(--dim); font-size:11px; margin-top:3px; font-variant-numeric:tabular-nums; }
  .meter { height:3px; background:var(--bar); margin-top:6px; border-radius:2px; }
  .tile.basic .nm { color:var(--dim); }
  .noimg { display:flex; align-items:center; justify-content:center; text-align:center;
           aspect-ratio:450/630; padding:14px; color:var(--dim); background:#171a1f;
           font-size:12px; }

  .pager { display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:18px;
           max-width:1000px; margin:0 auto; justify-content:center; }
  .pager a, .pager span.cur { border:1px solid var(--line); border-radius:4px; padding:5px 9px;
           color:var(--fg); text-decoration:none; font-size:12px; font-variant-numeric:tabular-nums; }
  .pager span.cur { border-color:var(--hi); color:var(--hi); }
  .pager .gap { border:none; color:var(--dim); padding:5px 2px; }
  .pager a:hover { border-color:var(--hi); }
  .pager .disabled { color:var(--dim); border-color:var(--line); opacity:.45; pointer-events:none; }
</style>
</head>
<body>
<header>
 <div class="wrap">
  <a class="home" href="./">← all windows</a>
  <h1>Pauper card occurrences <span class="win">— ${label}</span></h1>
  <div class="sub" id="meta"></div>
  <div class="controls">
    <input type="search" id="q" placeholder="filter card name…" autocomplete="off">
    <button id="sec" aria-pressed="true">mainboard only</button>
    <button id="basics" aria-pressed="true">hide basics</button>
    <span class="group"><span class="lbl">sort</span><span id="sorts"></span></span>
    <span class="count" id="count"></span>
  </div>
 </div>
</header>
<div class="grid" id="grid"></div>
<nav class="pager" id="pager"></nav>
<script>
const DATA = ${payload};
/* Default sort is the old table's: occurrences, descending. */
let sortKey = 'o', sortDir = -1, section = 'main', hideBasics = true, query = '';
const SORTS = [['o','occurrences'],['d','decks'],['p','% decks'],['mq','main qty'],['sq','side qty'],['na','archetypes'],['n','name']];

function el(id) { return document.getElementById(id); }

el('meta').textContent = DATA.n + ' decklists from mtgtop8\u2019s \u201c' + DATA.label + '\u201d view \u00b7 '
  + DATA.rows.length + ' distinct cards \u00b7 ' + DATA.per + ' per page \u00b7 scraped '
  + new Date(DATA.generated).toLocaleString() + ' \u00b7 ' + DATA.source;

function value(c, k) {
  if (k === 'p') return section === 'main' ? c.md / DATA.n : c.sd / DATA.n;
  if (k === 'n' || k === 'ar') return c[k];
  if (section === 'both') { if (k === 'o') return c.o; if (k === 'd') return c.d; }
  if (section === 'main') { if (k === 'o') return c.mq; if (k === 'd') return c.md; if (k === 'sq') return -1; }
  if (section === 'side') { if (k === 'o') return c.sq; if (k === 'd') return c.sd; if (k === 'mq') return -1; }
  return c[k];
}

function visible() {
  return DATA.rows.filter(function (c) {
    return (!hideBasics || !c.b) && value(c, 'o') > 0 && (!query || c.n.toLowerCase().indexOf(query) !== -1);
  }).sort(function (x, y) {
    var a = value(x, sortKey), b = value(y, sortKey);
    if (typeof a === 'string') return sortDir * a.localeCompare(b);
    return sortDir * (a - b);
  });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}

/* Only the 40 cards on this page reach the DOM, so at most 40 images are ever
 * requested; loading=lazy trims that to the ones actually scrolled into view. */
function tile(c, max) {
  var occ = value(c, 'o');
  var pct = (100 * value(c, 'p')).toFixed(1);
  var w = Math.max(2, Math.round(100 * occ / max));
  var qty = section === 'side' ? c.sq + ' in ' + c.sd + ' sideboards'
          : section === 'main' ? c.mq + ' in ' + c.md + ' decks'
          : c.mq + ' main / ' + c.sq + ' side';
  var inner = c.i
    ? '<img src="' + esc(c.i) + '" alt="' + esc(c.n) + '" loading="lazy" decoding="async">'
    : '<div class="noimg">' + esc(c.n) + '<br><span style="font-size:11px">no image cached</span></div>';
  /* No rank or count badge over the art — the caption already carries both. */
  var body = inner
    + '<div class="cap"><div class="nm">' + esc(c.n) + '</div>'
    + '<div class="stat">' + pct + '% \u00b7 ' + esc(qty) + ' \u00b7 ' + c.na + ' archetypes</div>'
    + '<div class="meter" style="width:' + w + '%"></div></div>';
  var cls = 'tile' + (c.b ? ' basic' : '');
  return c.u
    ? '<a class="' + cls + '" href="' + esc(c.u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(c.n) + ' \u2014 open on Scryfall">' + body + '</a>'
    : '<div class="' + cls + '">' + body + '</div>';
}

/* [0-9], not \d: this whole page is emitted from a JS template literal in
 * build-site.js, and a template literal eats the backslash — the regex that
 * shipped first read /[#&]p=(d+)/ and so never matched a page number. Anything
 * in here with a backslash needs doubling, or a character class like this. */
function pageFromHash() {
  var m = /[#&]p=([0-9]+)/.exec(location.hash || '');
  return m ? parseInt(m[1], 10) : 1;
}

/* Only the page number goes in the hash, so a page link never fights the
 * section/sort state held in JS. #p=3 is all a link has to get right. */
function setHash(p) {
  var h = '#p=' + p;
  if (location.hash !== h) location.hash = h;
}

function pageHref(p) {
  return '#p=' + p;
}

function renderPager(pages, page) {
  if (pages <= 1) { el('pager').innerHTML = ''; return; }
  var out = [];
  out.push('<a class="' + (page === 1 ? 'disabled' : '') + '" href="' + pageHref(page - 1) + '">\u00ab prev</a>');
  /* Always 1, always the last, and a window around the current page. */
  var want = {};
  want[1] = want[pages] = 1;
  for (var k = page - 2; k <= page + 2; k++) if (k >= 1 && k <= pages) want[k] = 1;
  var keys = Object.keys(want).map(Number).sort(function (a, b) { return a - b; });
  var prev = 0;
  keys.forEach(function (p) {
    if (p !== prev + 1) out.push('<span class="gap">\u2026</span>');
    out.push(p === page ? '<span class="cur">' + p + '</span>' : '<a href="' + pageHref(p) + '">' + p + '</a>');
    prev = p;
  });
  out.push('<a class="' + (page === pages ? 'disabled' : '') + '" href="' + pageHref(page + 1) + '">next \u00bb</a>');
  el('pager').innerHTML = out.join('');
}

function render() {
  var rows = visible();
  var pages = Math.max(1, Math.ceil(rows.length / DATA.per));
  var page = Math.min(Math.max(1, pageFromHash()), pages);
  var max = Math.max(1, ...rows.map(function (c) { return value(c, 'o'); }));
  var from = (page - 1) * DATA.per, slice = rows.slice(from, from + DATA.per);
  el('grid').innerHTML = slice.map(function (c) { return tile(c, max); }).join('');
  renderPager(pages, page);
  el('count').textContent = rows.length.toLocaleString() + ' cards \u00b7 page ' + page + ' of ' + pages
    + ' \u00b7 showing ' + (rows.length ? from + 1 : 0) + '\u2013' + (from + slice.length);
  document.querySelectorAll('#sorts button').forEach(function (b) {
    var on = b.dataset.k === sortKey;
    if (on) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
    b.textContent = b.dataset.label + (on ? (sortDir < 0 ? ' \u2193' : ' \u2191') : '');
  });
  if (pageFromHash() !== page) setHash(page);
}

function renderSorts() {
  el('sorts').innerHTML = SORTS.map(function (s) {
    return '<button data-k="' + s[0] + '" data-label="' + s[1] + '">' + s[1] + '</button>';
  }).join(' ');
  document.querySelectorAll('#sorts button').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.k;
      if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = (k === 'n') ? 1 : -1; }
      setHash(1); render();
    });
  });
}

el('q').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); setHash(1); render(); });

el('sec').addEventListener('click', function (e) {
  var next = section === 'main' ? 'side' : section === 'side' ? 'both' : 'main';
  section = next;
  e.target.textContent = next === 'main' ? 'mainboard only' : next === 'side' ? 'sideboard only' : 'main + side';
  setHash(1); render();
});

el('basics').addEventListener('click', function (e) {
  hideBasics = !hideBasics;
  e.target.setAttribute('aria-pressed', String(hideBasics));
  setHash(1); render();
});

window.addEventListener('hashchange', render);

renderSorts();
render();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

const noImage = cards.filter((c) => !c.i).sort((a, b) => b.o - a.o);
console.log(`${label}: ${cards.length} cards from ${n} decklists -> ${out} (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`images: ${cards.length - noImage.length}/${cards.length} from ${cacheFile} (${imgCount} cached names)`);
if (!imgCount) console.log('  WARNING: no scryfall cache found — run `node scryfall_api/enrich.js` for this window');
else if (noImage.length) console.log(`  ${noImage.length} without image: ${noImage.slice(0, 8).map((c) => `${c.n} (${c.o})`).join(', ')}${noImage.length > 8 ? ', …' : ''}`);
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
  <p class="lede">Every card in every competitive Pauper decklist mtgtop8 lists, ranked by how often it was played and shown as card images, 40 to a page. Pick a time window.</p>
  <table>
    <thead><tr><th>Window</th><th class="num">Distinct cards</th><th class="num">Decklists</th><th>Scraped</th></tr></thead>
    <tbody>
${windows.map((w) => `      <tr><td><a href="${w.href}">${w.label}</a></td><td class="num">${w.cards}</td><td class="num">${w.n}</td><td class="when">${new Date(w.generated).toLocaleDateString()}</td></tr>`).join('\n')}
    </tbody>
  </table>
  <p class="note">Windows are mtgtop8&rsquo;s own rolling views, not calendar ranges &mdash; &ldquo;Last 2 Weeks&rdquo; means the fortnight before the scrape date shown. Card images are served by cards.scryfall.io; each tile links to that card&rsquo;s Scryfall page. Source: mtgtop8.com decklists.</p>
</main>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, 'index.html'), index);
console.log(`index (${windows.length} window page${windows.length === 1 ? '' : 's'}): ${windows.map((w) => w.href).join(', ')} -> ${path.join(dir, 'index.html')}`);
