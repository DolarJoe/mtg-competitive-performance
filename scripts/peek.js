#!/usr/bin/env node
/*
 * peek.js — read-only views over the decklist JSONL.
 *
 *   node scripts/peek.js archetypes            archetype | lists | events | avg placing
 *   node scripts/peek.js cards [--arch BURN]   most-played mainboard cards
 *   node scripts/peek.js deck <n|name>         one decklist, printed
 *   node scripts/peek.js events                tournaments in the sample
 *   node scripts/peek.js raw <n|name>          one record as JSON
 *
 *   --file PATH   jsonl to read (default data/pauper-last2Months.jsonl)
 *   --top N       rows to show (default 20)
 */

const fs = require('fs');

function args(argv) {
    const a = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i];
        else a._.push(argv[i]);
    }
    a.file = a.file || 'data/pauper-last2Months.jsonl';
    a.top = Number(a.top ?? 20);
    return a;
}

const load = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const main = (d) => d.cards.filter((c) => c.section === 'main');
const side = (d) => d.cards.filter((c) => c.section === 'side');

function find(rows, key) {
    const byIndex = /^\d+$/.test(key) ? rows[Number(key) < 0 ? rows.length + Number(key) : Number(key)] : null;
    if (byIndex) return byIndex;
    const q = key.toLowerCase();
    const hit = rows.find((r) => r.deckName.toLowerCase().includes(q) || r.player.toLowerCase().includes(q));
    if (!hit) throw new Error(`no decklist matching "${key}"`);
    return hit;
}

function printDeck(d) {
    console.log(`${d.deckName}`);
    console.log(`  ${d.archetype} | ${d.event} #${d.placing} | ${d.mainboardCount} main / ${d.sideboardCount} side`);
    console.log(`  ${d.deckUrl}`);
    for (const [label, list] of [['MAIN', main(d)], ['SIDE', side(d)]]) {
        console.log(`\n  ${label}`);
        let group = null;
        list.forEach((c) => {
            if (c.typeGroup && c.typeGroup !== group && label === 'MAIN') {
                group = c.typeGroup;
                console.log(`    -- ${group}`);
            }
            console.log(`    ${lpad(c.count, 2)}x  ${c.name}`);
        });
    }
}

function cardTable(rows) {
    const n = rows.length;
    const agg = new Map();
    rows.forEach((d) => main(d).forEach((c) => {
        const a = agg.get(c.name) || { name: c.name, qty: 0, decks: 0 };
        a.qty += c.count;
        a.decks += 1;
        agg.set(c.name, a);
    }));
    return [...agg.values()]
        .map((a) => ({ ...a, pct: (100 * a.decks) / n }))
        .sort((x, y) => y.decks - x.decks || y.qty - x.qty);
}

const o = args(process.argv.slice(2));
const rows = load(o.file);
const view = o._[0] || 'archetypes';

if (view === 'archetypes') {
    const by = new Map();
    rows.forEach((r) => { if (!by.has(r.archetype)) by.set(r.archetype, []); by.get(r.archetype).push(r); });
    const t = [...by.entries()].map(([name, d]) => ({
        name,
        lists: d.length,
        events: new Set(d.map((x) => x.event)).size,
        avgPlace: (d.reduce((s, x) => s + (x.placing ?? 0), 0) / d.length).toFixed(1),
        best: Math.min(...d.map((x) => x.placing ?? 999)),
        variants: new Set(d.map((x) => x.deckName.replace(/ - .*$/, ''))).size,
    })).sort((a, b) => b.lists - a.lists);
    console.log(pad('ARCHETYPE', 24), lpad('LISTS', 6), lpad('VARPTS', 7), lpad('EVENTS', 7), lpad('BEST', 5), lpad('AVG#', 6));
    t.forEach((r) => console.log(pad(r.name, 24), lpad(r.lists, 6), lpad(r.variants, 7), lpad(r.events, 7), lpad(r.best, 5), lpad(r.avgPlace, 6)));
    console.log(`\n${rows.length} decklists, ${t.length} archetypes`);
} else if (view === 'cards') {
    let sel = rows;
    if (o.arch) {
        const q = o.arch.toLowerCase();
        sel = rows.filter((r) => r.archetype.toLowerCase().includes(q));
        if (!sel.length) throw new Error(`no archetype matching "${o.arch}"`);
    }
    const t = cardTable(sel).slice(0, o.top);
    console.log(sel === rows ? 'ALL ARCHETYPES' : `ARCHETYPE: ${sel[0].archetype}`);
    console.log(pad('CARD', 32), lpad('DECKS', 6), lpad('%', 6), lpad('QTY', 5));
    t.forEach((c) => console.log(pad(c.name, 32), lpad(c.decks, 6), lpad(c.pct.toFixed(0) + '%', 6), lpad(c.qty, 5)));
    console.log(`\n${sel.length} decklists, ${new Set(sel.flatMap(main).map((c) => c.name)).size} distinct mainboard cards`);
} else if (view === 'deck' || view === 'raw') {
    if (!o._[1]) throw new Error(`usage: peek.js ${view} <n|name>`);
    const d = find(rows, o._[1]);
    if (view === 'raw') console.log(JSON.stringify(d, null, 2));
    else printDeck(d);
} else if (view === 'events') {
    const by = new Map();
    rows.forEach((r) => { by.set(r.event, (by.get(r.event) || 0) + 1); });
    console.log(pad('EVENT', 30), lpad('LISTS', 6));
    [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.top).forEach(([e, n]) => console.log(pad(e, 30), lpad(n, 6)));
} else {
    throw new Error(`unknown view "${view}" (archetypes|cards|deck|raw|events)`);
}
