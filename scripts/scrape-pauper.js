const pauper = require('../MTG-API/backend/Decks/pauper.js');

const format = process.argv[2] || 'last2Months';

(async () => {
    const decks = await pauper.pauperFormat(format);
    if (typeof decks === 'string') {
        console.error('scraper returned error string:', decks);
        process.exit(1);
    }
    console.log(`format=${format} decks=${decks.length}`);
    decks.slice(0, 5).forEach((d, i) => {
        const cards = Array.isArray(d.cards) ? d.cards : [];
        console.log(`\n[${i}] ${d.deckName}  ${d.deckPercentage || ''}`);
        console.log(`    url:   ${d.url}`);
        console.log(`    image: ${d.deckImage}`);
        console.log(`    cards: ${cards.length} lines -> ${JSON.stringify(cards.slice(0, 4))}`);
    });
})().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
