#!/usr/bin/env node
'use strict';
/*
 * scryfall.js — thin Scryfall client. Plain Node, zero deps (global fetch).
 *
 * Two numbers, both deliberately under the published limits:
 *
 *   QUERY_CHAR_BUDGET = 980    a search query may run to 1000 chars
 *   RATE_LIMIT_MS     = 600    callers may come no closer than 500ms apart
 *
 * Budget is measured on the *encoded* q, since that is the string on the wire:
 * names are full of spaces, and a space costs three characters once encoded.
 * Packing on the encoded length keeps the raw length under 980 for free.
 *
 *   const { lookupExact, search } = require('./lib/scryfall');
 *   const cards = await lookupExact(['Duress', "Bedeck / Bedazzle"]);
 *
 * Nothing here stores anything. See enrich.js for the cache and the JSONL writer.
 */

const BASE = 'https://api.scryfall.com';
const QUERY_CHAR_BUDGET = 980;
const RATE_LIMIT_MS = 600;

/* Scryfall requires both headers; requests without a real User-Agent get refused. */
const HEADERS = {
    'User-Agent': 'competitive_ranking_mtg/1.0 (scryfall_api; github.com/DolarJoe)',
    Accept: 'application/json',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- rate gate ----------------------------------------------------------
 * One module-level timestamp. Every outbound call goes through gate() first, so
 * the 600ms floor holds no matter who calls, in what order, or how many loops
 * are in flight. setDelay() lets --delay retune it. */
let delayMs = RATE_LIMIT_MS;
let lastAt = 0;
let httpCalls = 0;

function setDelay(ms) {
    delayMs = Number(ms) > 0 ? Number(ms) : RATE_LIMIT_MS;
    return delayMs;
}

const httpCallsReset = () => {
    httpCalls = 0;
};

async function gate() {
    const wait = lastAt + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
}

/* ---- transport ---------------------------------------------------------- */

function encode(params) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        usp.set(k, String(v));
    }
    /* URLSearchParams writes spaces as '+'. %20 is unambiguous, so convert —
     * and this is the string the 980-char budget is measured against. */
    return usp.toString().replace(/\+/g, '%20');
}

async function get(pathname, params = {}, { tries = 4 } = {}) {
    const qs = encode(params);
    const url = `${BASE}${pathname}${qs ? `?${qs}` : ''}`;
    let lastErr;
    for (let attempt = 1; attempt <= tries; attempt++) {
        httpCalls++;
        await gate();
        let res;
        try {
            res = await fetch(url, { headers: HEADERS });
        } catch (err) {
            lastErr = err;
            if (attempt === tries) break;
            await sleep(delayMs * attempt * 2);
            continue;
        }
        let body = null;
        const text = await res.text();
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            /* HTML back (a 5xx page, a Cloudflare interstitial): treat as retryable. */
        }

        if (res.ok && body) return body;

        /* 429 carries Retry-After; 5xx and unparseable bodies are retryable too.
         * 400/404 are our fault — no amount of waiting fixes a bad query. */
        const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
        if (!retryable || attempt === tries) {
            const detail = body && (body.details || body.message);
            const err = new Error(`${res.status} ${pathname}${detail ? `: ${detail}` : `: ${text.slice(0, 200)}`}`);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        const hinted = Number(res.headers.get('retry-after')) * 1000;
        await sleep(Math.max(Number.isFinite(hinted) ? hinted : 0, delayMs * attempt * 2));
    }
    throw lastErr;
}

/**
 * search(q, params) — one raw Scryfall search. Returns the parsed response
 * (`{ object, data, has_more, total_cards, ... }`). Nothing is packed here;
 * packExact() below is what keeps q inside the budget.
 */
async function search(q, params = {}) {
    return get('/cards/search', { q, ...params });
}

/** Search every page of a query, following has_more. Page size 175 is the max.
 *
 * A search that matches nothing is a 404 from Scryfall, not an empty 200 — the
 * same status a missing card gives. That is a normal outcome for a filter the
 * metagame doesn't satisfy, so it returns [] here instead of throwing. Bad
 * syntax is still a 400 and still throws; search() and get() propagate both. */
async function searchAll(q, params = {}, { maxPages = 10 } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
        let res;
        try {
            res = await get('/cards/search', { q, order: 'name', dir: 'auto', unique: 'card', limit: 175, ...params, ...(page > 1 ? { page } : {}) });
        } catch (err) {
            if (err.status === 404) break;
            throw err;
        }
        out.push(...(res.data || []));
        if (!res.has_more) break;
    }
    return out;
}

/* ---- query packing ------------------------------------------------------ */

/**
 * One exact-name term. `!"Name"` is Scryfall's exact-name operator; there is no
 * `exact:` keyword (that name exists only on POST /cards/collection). Inside the
 * quotes Scryfall honours backslash escapes, so both are doubled.
 * Bonus: Scryfall folds the ` / ` vs ` // ` difference itself, so mtgtop8's
 * "Bedeck / Bedazzle" resolves to Scryfall's "Bedeck // Bedazzle".
 */
function term(name) {
    const esc = String(name).trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `!"${esc}"`;
}

/** Lookup key that ignores how a split card's slash was typed. */
function looseKey(name) {
    return keyOf(name).replace(/\s*\/\/\s*/g, ' / ');
}

const wireLen = (s) => encodeURIComponent(s).length;

/** `(!"A" or !"B")` — the whole query for a batch, one name unwrapped. */
function queryOf(names) {
    const list = [...names];
    if (list.length === 1) return term(list[0]);
    return `(${list.map(term).join(' or ')})`;
}

/**
 * packExact(names, {budget}) -> [[name, ...], ...]
 *
 * Greedy first-fit: extend the current batch while its query stays inside
 * budget (default 980 encoded chars). Dedupes case-insensitively, keeps input
 * order. A batch is never emptied to fit one oversized name — that name gets
 * its own batch instead of being dropped.
 */
function packExact(names, { budget = QUERY_CHAR_BUDGET } = {}) {
    const seen = new Set();
    const batches = [];
    let cur = [];

    for (const raw of names) {
        const name = String(raw).trim();
        if (!name) continue;
        const key = keyOf(name);
        if (seen.has(key)) continue;
        seen.add(key);

        const trial = cur.concat([name]);
        if (cur.length && wireLen(queryOf(trial)) > budget) {
            batches.push(cur);
            cur = [name];
        } else {
            cur = trial;
        }
    }
    if (cur.length) batches.push(cur);
    return batches;
}

/** Lookup key for a card name: case- and whitespace-folded, curly quotes straightened. */
function keyOf(name) {
    return String(name)
        .replace(/[\u2018\u2019\u02bc]/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/** mtgtop8 writes split cards with one slash; Scryfall names them with two. */
function slashVariant(name) {
    if (name.includes('//')) return null;
    const alt = name.replace(/\s\/\s/g, ' // ');
    return alt === name ? null : alt;
}

/**
 * Lookup keys a returned card answers to. More than one, because Scryfall's
 * canonical name for a double-faced card is both halves joined ("Delver of
 * Secrets // Insectile Aberration") while mtgtop8 posts the front half alone
 * ("Delver of Secrets"). Indexing the full name, the front half, and each face
 * name means either spelling resolves in the batch pass instead of falling
 * through to a one-at-a-time retry.
 */
function cardKeys(card) {
    const keys = new Set([looseKey(card.name)]);
    const head = String(card.name).split('//')[0];
    if (head !== card.name) keys.add(looseKey(head));
    for (const f of card.card_faces || []) if (f.name) keys.add(looseKey(f.name));
    return [...keys];
}

/* ---- image picking ------------------------------------------------------ */

const CDN = 'https://cards.scryfall.io/';

/**
 * The cards.scryfall.io images worth keeping: front, and the back where a
 * transform / modal-DFC card has one.
 *
 * The wrinkle worth remembering: `transform` and `modal_dfc` cards have NO
 * image_uris on the card object at all — both pictures live on card_faces[].
 * Reading only card.image_uris silently yields null for Delver of Secrets,
 * which is how 108 card lines in the first run came back imageless. Split cards
 * ("Bedeck // Bedazzle") are the opposite: one composite image on the parent,
 * nothing to add. So: trust the parent when it has one, fall back to faces.
 */
function pickImages(card) {
    const faces = (card.card_faces || [])
        .map((f) => f.image_uris && f.image_uris.normal)
        .filter(Boolean);
    const onCdn = (u) => (u && u.startsWith(CDN) ? u : null);
    const front = (card.image_uris && card.image_uris.normal) || faces[0] || null;
    const back = card.image_uris ? null : faces[1] || null;
    return { img: onCdn(front), imgBack: onCdn(back) };
}

/**
 * Collapse a Scryfall card object to the fields this project keeps. `url` is
 * scryfall_uri verbatim, tracking param and all — Scryfall asks that
 * ?utm_source=api stay on links back to them. oraclecard_uri is not returned by
 * /cards/search, so it is only ever a fallback for single-card endpoints.
 */
function project(card) {
    const { img, imgBack } = pickImages(card);
    const row = {
        name: card.name,
        url: card.scryfall_uri || card.oraclecard_uri,
        img,
    };
    if (imgBack) row.imgBack = imgBack;
    return row;
}

/* ---- the workhorse ------------------------------------------------------ */

/**
 * lookupExact(names, opts) -> { found: Map<key, row>, missing: [{name, why}], requests }
 *
 * Three passes, cheapest first:
 *   1. Batched exact-name search (`(!"A" or !"B")`), one request per packed
 *      batch (~20 names each). English printings win; a Japanese printing can't
 *      shadow the English one. Results come back under Scryfall's spelling, so
 *      they are matched back to the requested spelling by looseKey().
 *   2. Individual GET /cards/named?exact= for anything still missing.
 *   3. Same, with ` / ` rewritten to ` // ` for split cards.
 *
 * opts: { budget, delay, onProgress(done, totalBatches, names) }
 */
async function lookupExact(names, opts = {}) {
    const { budget = QUERY_CHAR_BUDGET, delay, onProgress } = opts;
    if (delay) setDelay(delay);

    const found = new Map();
    /* looseKey -> the spelling we were asked for, so a card that comes back
     * under Scryfall's own spelling still lands on the right cache key. */
    const want = new Map();
    for (const n of names) {
        const k = looseKey(n);
        if (!want.has(k)) want.set(k, String(n).trim());
    }
    const mark = (row, key) => found.set(key, row);

    const batches = packExact(names, { budget });
    for (let i = 0; i < batches.length; i++) {
        const q = queryOf(batches[i]);
        const cards = await searchAll(q);
        if (onProgress) onProgress(i + 1, batches.length, batches[i]);

        /* English first so a Japanese printing can't shadow the English one. */
        const ordered = [...cards].sort((a, b) => (a.lang === 'en' ? 0 : 1) - (b.lang === 'en' ? 0 : 1));
        for (const card of ordered) {
            for (const key of cardKeys(card)) {
                const asked = want.get(key);
                if (asked === undefined) continue;
                const cacheKey = keyOf(asked);
                if (found.has(cacheKey)) continue;
                mark(project(card), cacheKey);
            }
        }
    }

    const missing = [];
    for (const name of new Set(names.map((n) => String(n).trim()))) {
        if (found.has(keyOf(name))) continue;
        let why = 'no exact match';
        for (const candidate of [name, slashVariant(name)].filter(Boolean)) {
            try {
                const card = await get('/cards/named', { exact: candidate });
                if (card && card.object === 'card') {
                    mark(project(card), keyOf(name));
                    why = null;
                    break;
                }
            } catch (err) {
                why = err.message;
            }
        }
        if (why) missing.push({ name, why });
    }

    return { found, missing, requests: httpCalls };
}

module.exports = {
    BASE,
    QUERY_CHAR_BUDGET,
    RATE_LIMIT_MS,
    setDelay,
    getDelay: () => delayMs,
    httpCalls: () => httpCalls,
    resetStats: httpCallsReset,
    get,
    search,
    searchAll,
    packExact,
    queryOf,
    lookupExact,
    pickImages,
    project,
    cardKeys,
    looseKey,
    keyOf,
    slashVariant,
    term,
    wireLen,
};
