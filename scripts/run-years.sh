#!/usr/bin/env bash
# Scrape all2018..all2025 in parallel, enrich once, rebuild all window pages, commit+push.
# Resumable: fetch-decks appends to an existing JSONL and skips seen decks.
set -uo pipefail
cd "$(dirname "$0")/.."
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
LOG=log/years
mkdir -p "$LOG"
YEARS="2018 2019 2020"

echo "=== phase 1: scrape (parallel, 8 browsers) $(date)"
pids=()
for y in $YEARS; do
  node scripts/fetch-decks.js --view "all${y}Decks" >"$LOG/fetch-$y.log" 2>&1 &
  pids+=($!)
done
wait
echo "=== phase 1 done $(date)"
for y in $YEARS; do
  echo "fetch $y: $(tail -1 "$LOG/fetch-$y.log" | tr -d '\n') | rows=$(wc -l < "data/pauper-all${y}Decks.jsonl" 2>/dev/null || echo 0)"
done

echo "=== phase 2: enrich (serial, shared cache) $(date)"
for y in $YEARS; do
  echo "--- enrich $y"
  node scryfall_api/enrich.js --file "data/pauper-all${y}Decks.jsonl" >"$LOG/enrich-$y.log" 2>&1 || echo "ENRICH-FAIL $y"
done

echo "=== phase 3: build sites $(date)"
for f in data/pauper-*.enriched.jsonl; do
  echo "--- build $f"
  node scripts/build-site.js --file "$f" >>"$LOG/build.log" 2>&1 || echo "BUILD-FAIL $f"
done

echo "=== phase 4: publish $(date)"
git add scripts/fetch-decks.js AGENTS.md docs data/pauper-all*.jsonl 2>>"$LOG/git.log"
git commit -m "Add 2018-2025 windows: scrapes, per-year sites, 20x request delay" >>"$LOG/git.log" 2>&1
git push origin HEAD >>"$LOG/git.log" 2>&1 && echo "PUSHED" || echo "PUSH-FAIL (see $LOG/git.log)"
echo "=== ALL DONE $(date)"
