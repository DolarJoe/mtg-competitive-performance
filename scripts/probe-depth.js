// How many decklists does mtgtop8 actually expose for Pauper?
// Replicates phase 1 + 2 of Decks/pauper.js, but keeps the FULL decklist
// array per archetype instead of collapsing it with decksUrl[i][0].
const puppeteer = require('../MTG-API/backend/node_modules/puppeteer');

const URLS = {
    last2Months: 'https://www.mtgtop8.com/format?f=PAU',
    liveTournaments: 'https://www.mtgtop8.com/format?f=PAU&meta=185&a=',
    allPauperDecks: 'https://www.mtgtop8.com/format?f=PAU&meta=110&a=',
};

const fmt = process.argv[2] || 'last2Months';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URLS[fmt]);

    const archetypes = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('td:nth-child(1) div.S14 > a').forEach((a) => {
            out.push({ name: a.textContent, url: 'https://www.mtgtop8.com/' + a.getAttribute('href') });
        });
        return out;
    });

    let total = 0;
    const rows = [];
    for (const a of archetypes) {
        await page.goto(a.url);
        const n = await page.evaluate(() => {
            const links = document.querySelectorAll('td:nth-child(2) > form:nth-child(1) > table > tbody td:nth-child(2) > a');
            // the archetype page lists top-N decks; also count pagination if present
            const pages = [...document.querySelectorAll('a[href*="page="]')].map((x) => x.getAttribute('href'));
            const maxPage = pages.reduce((m, h) => Math.max(m, parseInt((h.match(/page=(\d+)/) || [0, 1])[1], 10)), 1);
            return { firstPage: links.length, maxPage };
        });
        rows.push({ name: a.name.trim(), firstPage: n.firstPage, maxPage: n.maxPage });
        total += n.firstPage;
    }

    await browser.close();

    rows.sort((x, y) => y.firstPage - x.firstPage);
    console.log(`view=${fmt}  archetypes=${rows.length}`);
    console.log(`decklists on first page of each archetype = ${total}`);
    console.log(`\ntop 8 by lists shown:`);
    rows.slice(0, 8).forEach((r) => console.log(`  ${String(r.firstPage).padStart(3)}  (pages:${r.maxPage})  ${r.name}`));
    console.log(`\nbottom 5:`);
    rows.slice(-5).forEach((r) => console.log(`  ${String(r.firstPage).padStart(3)}  (pages:${r.maxPage})  ${r.name}`));
    const one = rows.filter((r) => r.firstPage <= 1).length;
    console.log(`\narchetypes with <=1 list on page 1: ${one}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
