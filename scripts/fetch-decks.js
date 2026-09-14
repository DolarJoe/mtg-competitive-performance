#!/usr/bin/env node
/*
 * fetch-decks.js — scrape EVERY decklist + its cards for an mtgtop8 format view.
 *
 * Independent of the MTG-API submodule's scraper. It exists because
 * MTG-API/backend/Decks/pauper.js collapses each archetype to one decklist
 * (decksUrl[index][0]), keeping 39 of 377 available Pauper lists. This script
 * keeps them all, and paginates.
 *
 * Output: newline-delimited JSON, one decklist per line, written incrementally
 * so an interrupted run keeps what it fetched.
 *
 *   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/fetch-decks.js
 *   ... node scripts/fetch-decks.js --view allPauperDecks --max-lists 3000
 *
 * Flags
 *   --view NAME          last2Months (default) | liveTournaments | all20XXDecks | allPauperDecks ...
 *   --out PATH           output .jsonl (default data/pauper-<view>.jsonl)
 *   --max-per-arch N     cap decklists per archetype (default: no cap)
 *   --max-pages N        cap archetype pages walked (default 3)
 *   --only NAME          substring filter on archetype name, repeatable
 *   --limit-archetypes N debug: first N archetypes only
 *   --delay MS           polite gap between requests (default 300)
 *   --dry                list archetypes + decklist counts, fetch nothing
 */

const fs = require('fs');
const path = require('path');

// Reuse the submodule's installed puppeteer rather than adding a second copy.
const puppeteer = require('../MTG-API/backend/node_modules/puppeteer');

const BASE = 'https://www.mtgtop8.com/';

// Verified against MTG-API/backend/Decks/pauper.js urlMap.
const VIEWS = {
    last2Months: 'format?f=PAU',
    last4Months: 'format?f=PAU&meta=127&a=',
    liveTournaments: 'format?f=PAU&meta=185&a=',
    all2023Decks: 'format?f=PAU&meta=251&a=',
    all2022Decks: 'format?f=PAU&meta=239&a=',
    all2021Decks: 'format?f=PAU&meta=224&a=',
    all2020Decks: 'format?f=PAU&meta=223&a=',
    all2019Decks: 'format?f=PAU&meta=186&a=',
    all2018Decks: 'format?f=PAU&meta=170&a=',
    all2017Decks: 'format?f=PAU&meta=169&a=',
    all2016Decks: 'format?f=PAU&meta=168&a=',
    allPauperDecks: 'format?f=PAU&meta=110&a=',
};

function parseArgs(argv) {
    const opts = { only: [] };
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i].replace(/^--/, '');
        if (key === 'dry') { opts.dry = true; continue; }
        if (key === 'only') { opts.only.push(argv[++i]); continue; }
        opts[key] = argv[++i];
    }
    opts.view = opts.view || 'last2Months';
    if (!VIEWS[opts.view]) {
        throw new Error(`unknown --view "${opts.view}". known: ${Object.keys(VIEWS).join(', ')}`);
    }
    opts.maxPages = Number(opts.maxPages ?? 3);
    opts.delay = Number(opts.delay ?? 300);
    opts.maxPerArch = opts.maxPerArch === undefined ? Infinity : Number(opts.maxPerArch);
    opts.out = opts.out || path.join('data', `pauper-${opts.view}.jsonl`);
    return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Phase 1 — archetype name + url on the format page. */
async function readArchetypes(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('td:nth-child(1) div.S14 > a').forEach((a) => {
            const name = a.textContent.trim();
            if (name) out.push({ name, url: 'https://www.mtgtop8.com/' + a.getAttribute('href') });
        });
        return out;
    });
}

/* Phase 2 — every decklist link on one page of one archetype. */
async function readDeckLinks(page) {
    return page.evaluate(() => {
        const out = [];
        // Same selector the submodule scraper uses, but nothing is discarded.
        document.querySelectorAll('td:nth-child(2) > form:nth-child(1) > table > tbody td:nth-child(2) > a')
            .forEach((a) => out.push('https://www.mtgtop8.com/' + a.getAttribute('href')));
        return out;
    });
}

/* Phase 3 — one decklist page.
 *
 * mtgtop8 tags each card row with an id prefixed `md` (main deck) or `sb`
 * (sideboard), e.g. id=mdabu170 / id=sbltr118. That is a far more reliable
 * section signal than parsing heading text, so it drives `section`. The
 * `O14` heading divs ("19 LANDS", "15 CREATURES", "SIDEBOARD") precede their
 * cards in DOM order and give a type group.
 */
async function readDeck(page) {
    return page.evaluate(() => {
        const flat = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : null);
        const one = (sel) => flat(document.querySelector(sel));

        const cards = [];
        let typeGroup = null;
        document.querySelectorAll('.deck_title_line, .O14, .deck_line').forEach((n) => {
            const line = flat(n);
            if (!line) return;
            if (n.classList.contains('O14')) {
                typeGroup = line.replace(/^\d+\s+/, '');
                return;
            }
            if (n.classList.contains('deck_title_line')) return;
            const m = line.match(/^(\d+)\s+(.+)$/);
            if (!m) return;
            const id = n.id || '';
            const section = /^sb/i.test(id) ? 'side' : /^md/i.test(id) ? 'main' : 'unknown';
            cards.push({ count: Number(m[1]), name: m[2].trim(), section, typeGroup });
        });

        // '#Name Variant - Player @ mtgtop8.com'
        const heading = one('#deck_name') || one('.S18') || document.title;
        const deckName = heading.replace(/\s*@\s*mtgtop8\.com\s*$/i, '').trim();
        const player = one('a.player_big');

        // First .event_title is the tournament, a later one is '#place <deck> - '
        const eventTitles = [...document.querySelectorAll('.event_title')]
            .map(flat).filter(Boolean);
        let placing = null;
        for (const t of eventTitles) {
            const m = t.match(/^#(\d+)/);
            if (m) { placing = Number(m[1]); break; }
        }
        const event = eventTitles.find((t) => !t.startsWith('#')) || null;

        return { deckName, player, event, placing, cards };
    });
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(path.dirname(opts.out))) fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, '');
    const stream = fs.createWriteStream(opts.out, { flags: 'a' });

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const seen = new Set();
    const summary = [];
    const started = Date.now();

    try {
        let archetypes = await readArchetypes(page, BASE + VIEWS[opts.view]);
        if (opts.only.length) archetypes = archetypes.filter((a) => opts.only.some((o) => a.name.includes(o)));
        if (opts.limitArchetypes) archetypes = archetypes.slice(0, Number(opts.limitArchetypes));
        console.log(`view=${opts.view} archetypes=${archetypes.length}`);

        let done = 0;
        for (const arch of archetypes) {
            const links = [];
            for (let p = 1; p <= opts.maxPages; p++) {
                const url = p === 1 ? arch.url : arch.url.replace(/([?&])page=\d+/, '$1') + `&page=${p}`;
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await sleep(opts.delay);
                const found = await readDeckLinks(page);
                const fresh = found.filter((u) => !seen.has(u) && !links.includes(u));
                if (!fresh.length) break;
                found.forEach((u) => seen.add(u));
                links.push(...fresh);
                if (links.length >= opts.maxPerArch || found.length < 20) break;
            }
            const keep = links.slice(0, opts.maxPerArch);
            summary.push({ archetype: arch.name, lists: keep.length });
            if (opts.dry) continue;

            for (const deckUrl of keep) {
                try {
                    await page.goto(deckUrl, { waitUntil: 'domcontentloaded' });
                    const deck = await readDeck(page);
                    const sum = (sec) => deck.cards.filter((c) => c.section === sec).reduce((n, c) => n + c.count, 0);
                    const eventId = (deckUrl.match(/[?&]e=(\d+)/) || [])[1] || null;
                    stream.write(JSON.stringify({
                        view: opts.view,
                        archetype: arch.name,
                        deckUrl,
                        deckName: deck.deckName,
                        player: deck.player,
                        event: deck.event,
                        eventId,
                        placing: deck.placing,
                        cards: deck.cards,
                        mainboardCount: sum('main'),
                        sideboardCount: sum('side'),
                        uniqueCards: new Set(deck.cards.map((c) => c.name)).size,
                        scrapedAt: new Date().toISOString(),
                    }) + '\n');
                    await sleep(opts.delay);
                } catch (err) {
                    console.error(`  ! ${arch.name} ${deckUrl}: ${err.message}`);
                }
            }
            console.log(`[${++done}/${archetypes.length}] ${arch.name}: ${keep.length} lists`);
        }

        const total = summary.reduce((n, r) => n + r.lists, 0);
        console.log(`\ndry=${!!opts.dry} archetypes=${archetypes.length} decklists=${total} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
        if (opts.dry) summary.sort((a, b) => b.lists - a.lists).forEach((r) => console.log(`  ${String(r.lists).padStart(4)}  ${r.archetype}`));
        else console.log(`wrote ${opts.out}`);
    } finally {
        stream.end();
        await browser.close();
    }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
