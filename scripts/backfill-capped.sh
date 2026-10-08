#!/usr/bin/env bash
# Backfill archetypes truncated by the 40-page (800-deck) cap in the first pass.
# NOTE: resume-into-same-file cannot reach the missing decks: the page walk
# breaks when page 1 yields no fresh links, and on resume page 1 is fully seen.
# So: fresh fetch of ONLY the capped archetypes into <out>.part2.jsonl
# (max-pages 200), then merge into the main file deduped by deckUrl.
set -uo pipefail
cd "$(dirname "$0")/.."
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
LOG=log/years

run_year() { # $1=year, rest=archetype names
  y=$1; shift
  out=data/pauper-all${y}Decks.part2.jsonl
  args=()
  for n in "$@"; do args+=(--only "$n"); done
  node scripts/fetch-decks.js --view "all${y}Decks" --max-pages 200 "${args[@]}" --out "$out" >>"$LOG/fetch-$y-part2.log" 2>&1
}

echo "=== backfill scrape $(date)"
run_year 2023 "Red Deck Wins" "Affinity" &
run_year 2024 "Red Deck Wins" "Affinity" "Mono Blue Aggro" "Dimir Control" "Sadistic Glee" &
run_year 2025 "Mono Blue Aggro" "Red Deck Wins" "Affinity" "Jund" "Rakdos Aggro" "Burn" "Dimir Control" &
wait

for y in 2023 2024 2025; do
  part=data/pauper-all${y}Decks.part2.jsonl
  main=data/pauper-all${y}Decks.jsonl
  echo "--- merge $y: main $(wc -l < "$main") + part $(wc -l < "$part")"
  cat "$main" "$part" | node -e '
    const seen = new Set(); const out = [];
    require("readline").createInterface({ input: process.stdin })
      .on("line", (l) => { if (!l.trim()) return; let u; try { u = JSON.parse(l).deckUrl; } catch { return; }
        if (u && !seen.has(u)) { seen.add(u); out.push(l); } })
      .on("close", () => { require("fs").writeFileSync(process.argv[1], out.join("\n") + "\n"); });
  ' "$main" && rm -f "$part"
  echo "merged: $(wc -l < "$main") rows"
done

echo "=== enrich (cache mostly warm) $(date)"
for y in 2023 2024 2025; do
  node scryfall_api/enrich.js --file "data/pauper-all${y}Decks.jsonl" >"$LOG/enrich-$y.log" 2>&1 || echo "ENRICH-FAIL $y"
done

echo "=== rebuild sites $(date)"
for f in data/pauper-all202[3-5]Decks.enriched.jsonl; do
  node scripts/build-site.js --file "$f" >>"$LOG/build.log" 2>&1 || echo "BUILD-FAIL $f"
done

echo "=== publish $(date)"
git add docs data/pauper-all202[3-5]Decks.jsonl scryfall_api/cache/cards.jsonl scripts/backfill-capped.sh
git commit -m "Backfill archetypes truncated by 40-page cap in 2023-2025" && git push && echo PUSHED
echo "=== BACKFILL DONE $(date)"
