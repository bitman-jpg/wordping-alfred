#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_dir=$(mktemp -d /tmp/wordping-reminders-XXXXXX)
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/data"
mkdir -p "$test_dir/Library/LaunchAgents"
./runtime/tjs bundle src/index.ts "$test_dir/index.js" >/dev/null

run_workflow() {
  HOME="$test_dir" alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" \
    ./runtime/tjs run "$test_dir/index.js" "$1"
}

agent="$test_dir/Library/LaunchAgents/com.bitman.wordping.review.plist"
printf '%s' '<key>Hour</key><integer>22</integer><key>Minute</key><integer>0</integer>' > "$agent"

menu=$(run_workflow ':remind 09:30')
invalid=$(run_workflow ':remind 25:00')
empty=$(run_workflow '~reminder-check')

printf '%s' '{"version":1,"entries":[{"query":"mote","language":"zh-CHS","output":"{\"items\":[{\"title\":\"translation\"}]}","savedAt":1}]}' > "$test_dir/data/vocabulary.json"
first=$(run_workflow '~reminder-check')
second=$(run_workflow '~reminder-check')
printf '%s' '<key>Hour</key><integer>22</integer><key>Minute</key><integer>8</integer>' > "$agent"
after_time_change=$(run_workflow '~reminder-check')
after_duplicate=$(run_workflow '~reminder-check')

node - "$menu" "$invalid" "$empty" "$first" "$second" "$after_time_change" "$after_duplicate" <<'JS'
const assert = require('node:assert/strict');
const menu = JSON.parse(process.argv[2]).items;
const invalid = JSON.parse(process.argv[3]).items;
assert.equal(menu[0].arg, '~remind:09:30');
assert.equal(invalid[0].valid, false);
assert.equal(process.argv[4], '');
assert.match(process.argv[5], /1 saved word is due/);
assert.equal(process.argv[6], '');
assert.match(process.argv[7], /1 saved word is due/);
assert.equal(process.argv[8], '');
console.log('Daily reminder workflow tests passed');
JS
