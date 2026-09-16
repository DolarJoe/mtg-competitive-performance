#!/usr/bin/env node
'use strict';
/*
 * enrich.js — add Scryfall image URLs and card links to the decklist JSONL.
 *
 *   node scryfall_api/enrich.js [--file data/pauper-last2Weeks.jsonl]
 *                               [--out data/pauper-last2Weeks.enriched.jsonl]
 *                               [--cache scryfall_api/cache/cards.jsonl]
 *                               [--dry] [--delay 600] [--budget 980] [--workers N]
 *
 * Every card in every decklist gets two new fields:
 *
 *   img   https://cards.scryfall.io/normal/front/…jpg   (imgBack too, for DFCs)
 *   url   https://scryfall.com/card/<set>/<num>/…       (opens the card)
 *
 * Names are resolved by batched exact-name search (`(!"A" or !"B")`) — about
 * 20 names per request, each query held under 980 encoded characters, requests
 * at least 600ms apart. See lib/scryfall.js. Anything the batch misses is retried one at a time against
 * /cards/named, then again with " / " → " //" for split cards; the residue is
 * listed in the report and in each record's `unresolved` array.
 *
 * Results are cached to cards.jsonl keyed by the mtgtop8 spelling, so re-runs
 * and second windows cost nothing. The input file is never modified — enrich.js
 * writes a new JSONL beside it.
 */

const fs = require('fs');
const path = require('path');
const sf = require('./lib/scryfall');

const argv = process.argv.slice(2);
const has = (n) => argv.includes('--' + n);
const flag = (n, dflt) => {
    const i = argv.indexOf('--' + n);
    return i === -1 ? dflt : argv[i + 1];
};

const file = flag('file', 'data/pauper-last2Weeks.jsonl');
const out = flag('out', file.replace(/\.jsonl$/, '') + '.enriched.jsonl');
const cacheFile = flag('cache', path.join(__dirname, 'cache', 'cards.jsonl'));
const budget = Number(flag('budget', sf.QUERY_CHAR_BUDGET));
const delay = Number(flag('delay', sf.RATE_LIMIT_MS));

const readJsonl = (f) => {
    if (!fs.existsSync(f)) return [];
    return fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l, i) => {
            try {
                return JSON.parse(l);
            } catch (err) {
                throw new Error(`${f}:${i + 1}: ${err.message}`);
            }
        });
};

function loadCache(f) {
    const map = new Map();
    for (const row of readJsonl(f)) if (row.key) map.set(row.key, row);
    return map;
}

function saveCache(f, map) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

async function main() {
    if (!fs.existsSync(file)) {
        console.error(`no such file: ${file}`);
        process.exit(1);
    }
    const rows = readJsonl(file);
    const names = new Set();
    for (const r of rows) for (const c of r.cards || []) if (c.name) names.add(c.name);

    /* ---- --dry: the pack plan, no network ---- */
    if (has('dry')) {
        const batches = sf.packExact([...names], { budget });
        const lens = batches.map((b) => sf.wireLen(sf.queryOf(b))).sort((a, b) => a - b);
        console.log(`${file}: ${rows.length} decklists, ${names.size} unique card names`);
        console.log(`budget ${budget} encoded chars, delay ${delay}ms`);
        console.log(`batches: ${batches.length}  (≈${((batches.length * delay) / 1000).toFixed(0)}s of rate-limit sleeps)`);
        console.log(`query chars  min ${lens[0]}  median ${lens[Math.floor(lens.length / 2)]}  max ${lens[lens.length - 1]}`);
        console.log(`names/batch  min ${batches[0].length}  max ${Math.max(...batches.map((b) => b.length))}`);
        console.log(`\nfirst batch:\n${sf.queryOf(batches[0])}`);
        return;
    }

    const cache = loadCache(cacheFile);
    /* A cached row with no img is a row the old pickImages() misread (transform
     * DFCs, before the card_faces fallback). Re-fetch those rather than
     * propagating the hole forever. */
    const stale = (n) => {
        const hit = cache.get(sf.keyOf(n));
        return !hit || !hit.img;
    };
    const todo = [...names].filter(stale);
    console.log(`${names.size} unique names; ${names.size - todo.length} cached, ${todo.length} to fetch`);

    const t0 = Date.now();
    let result = { found: new Map(), missing: [], requests: 0 };
    if (todo.length) {
        result = await sf.lookupExact(todo, {
            budget,
            delay,
            onProgress: (done, total) => {
                if (done === total || done % 10 === 0) {
                    const s = ((Date.now() - t0) / 1000).toFixed(0);
                    process.stdout.write(`\r  batch ${done}/${total}  ${s}s   `);
                }
            },
        });
        process.stdout.write('\n');
        for (const [key, row] of result.found) {
            cache.set(key, { key, ...row });
        }
        saveCache(cacheFile, cache);
    }

    /* ---- annotate ---- */
    let cardsTouched = 0;
    const missingNames = new Set(result.missing.map((m) => sf.keyOf(m.name)));
    const annotated = rows.map((r) => {
        const unresolved = new Set();
        const cards = (r.cards || []).map((c) => {
            const hit = cache.get(sf.keyOf(c.name));
            if (!hit) {
                unresolved.add(c.name);
                return { ...c, img: null, url: null };
            }
            cardsTouched++;
            const next = { ...c, img: hit.img, url: hit.url };
            if (hit.imgBack) next.imgBack = hit.imgBack;
            return next;
        });
        return { ...r, cards, unresolved: [...unresolved] };
    });

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, annotated.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n${result.requests} HTTP requests in ${secs}s (min ${delay}ms apart)`);
    console.log(`resolved ${result.found.size} names this run; cache now ${cache.size}`);
    console.log(`card lines annotated ${cardsTouched}; unresolved ${missingNames.size} names`);
    console.log(`wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(2)} MB), cache ${cacheFile}`);

    if (result.missing.length) {
        console.log(`\nunresolved (${result.missing.length}):`);
        for (const m of result.missing.slice(0, 25)) console.log(`  ${m.name}  —  ${m.why}`);
        if (result.missing.length > 25) console.log(`  … ${result.missing.length - 25} more`);
    }
}

if (require.main === module) main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
});

module.exports = { readJsonl, loadCache, saveCache };
