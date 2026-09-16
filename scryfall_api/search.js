#!/usr/bin/env node
'use strict';
/*
 * search.js — the library's search function, on the command line.
 *
 *   node scryfall_api/search.js "Duress"                 name, link, image
 *   node scryfall_api/search.js "lightning" "counters"   one Scryfall query
 *   node scryfall_api/search.js --exact Duress "Lightning Bolt"   batched exact names
 *   node scryfall_api/search.js --json "cmc=1 type:creature"      raw response
 *   node scryfall_api/search.js --limit 5 "pauper tempo"
 *
 * Without --exact the argument is passed straight to Scryfall's syntax, so any
 * valid query works (see https://scryfall.com/docs/syntax). --exact packs the
 * arguments into `!"…"` exact-name terms under the 980-char budget, one
 * request per batch, 600ms apart.
 */

const sf = require('./lib/scryfall');

const argv = process.argv.slice(2);
const limitAt = argv.indexOf('--limit');
const limit = Number(limitAt === -1 ? 20 : argv[limitAt + 1]);
const json = argv.includes('--json');
const exact = argv.includes('--exact');
const terms = argv.filter((a, i) => !a.startsWith('--') && !(limitAt !== -1 && i === limitAt + 1));

if (!terms.length) {
    console.error('usage: search.js [--exact] [--json] [--limit N] <query or names…>');
    process.exit(1);
}

const line = (c) => {
    const { img } = sf.pickImages(c);
    return [
        `${c.name}${c.set ? ` [${c.set.toUpperCase()}]` : ''}`,
        c.scryfall_uri || c.oraclecard_uri,
        img || '(no image)',
    ].join('\n  ');
};

async function main() {
    if (json) {
        const q = exact ? sf.queryOf(terms) : terms.join(' ');
        const res = await sf.search(q, { unique: 'card', limit });
        console.log(JSON.stringify(res, null, 2));
        return;
    }

    if (exact) {
        const { found, missing, requests } = await sf.lookupExact(terms);
        for (const row of found.values()) console.log(`${row.name}\n  ${row.url}\n  ${row.img}`);
        if (missing.length) console.error(`\nnot found: ${missing.map((m) => m.name).join(', ')}`);
        console.error(`\n${requests} request(s)`);
        return;
    }

    const cards = await sf.searchAll(terms.join(' '), { unique: 'card' });
    console.log(`${cards.length} card(s) for: ${terms.join(' ')}\n`);
    for (const c of cards.slice(0, limit)) console.log(line(c) + '\n');
}

if (require.main === module) main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
