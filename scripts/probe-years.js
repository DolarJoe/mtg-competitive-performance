/* One-shot probe: is each all20XXDecks view reachable, what count does it print? */
const puppeteer = require('../MTG-API/backend/node_modules/puppeteer');
const VIEWS = {
    all2025Decks: 'format?f=PAU&meta=311&a=',
    all2024Decks: 'format?f=PAU&meta=282&a=',
    all2023Decks: 'format?f=PAU&meta=251&a=',
    all2022Decks: 'format?f=PAU&meta=239&a=',
    all2021Decks: 'format?f=PAU&meta=224&a=',
    all2020Decks: 'format?f=PAU&meta=223&a=',
    all2019Decks: 'format?f=PAU&meta=186&a=',
    all2018Decks: 'format?f=PAU&meta=170&a=',
};
(async () => {
    const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const p = await b.newPage();
    for (const [view, rel] of Object.entries(VIEWS)) {
        try {
            await p.goto('https://www.mtgtop8.com/' + rel.replace(/&a=$/, ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
            const info = await p.evaluate(() => ({
                decks: (document.body.innerText.match(/([\d,]+)\s+decks/) || [])[1] || '?',
                archs: [...document.querySelectorAll('a[href*="a="]')].filter(a => /format\?f=PAU&meta=\d+&a=/.test(a.href)).length,
            }));
            console.log(view, JSON.stringify(info));
        } catch (e) {
            console.log(view, 'ERR', e.message.slice(0, 100));
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    await b.close();
})();
