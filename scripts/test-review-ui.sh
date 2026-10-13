#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_dir=$(mktemp -d /tmp/wordping-review-ui-XXXXXX)
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/data"

./runtime/tjs bundle src/index.ts "$test_dir/index.js"
printf '%s' '{"version":1,"entries":[{"query":"mote","language":"zh-CHS","output":"{\"items\":[{\"title\":\"莫特\",\"arg\":\"莫特\"},{\"title\":\"Alternative\",\"arg\":\"Alternative\"}]}","savedAt":1}]}' > "$test_dir/data/vocabulary.json"

due=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
saved=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved')
saved_by_word=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved MOT')
saved_by_translation=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved 莫')
saved_by_alternative=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved native')
saved_no_match=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved absent')
revealed=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review mote')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~again:mote' > /dev/null
due_after_miss=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~remove:mote' > /dev/null
due_after_remove=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
saved_after_remove=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved')

node - "$due" "$saved" "$saved_by_word" "$saved_by_translation" "$saved_by_alternative" "$saved_no_match" "$revealed" "$due_after_miss" "$due_after_remove" "$saved_after_remove" <<'JS'
const assert = require('node:assert/strict');
const due = JSON.parse(process.argv[2]).items;
const saved = JSON.parse(process.argv[3]).items;
const savedByWord = JSON.parse(process.argv[4]).items;
const savedByTranslation = JSON.parse(process.argv[5]).items;
const savedByAlternative = JSON.parse(process.argv[6]).items;
const savedNoMatch = JSON.parse(process.argv[7]).items;
const revealed = JSON.parse(process.argv[8]).items;
const dueAfterMiss = JSON.parse(process.argv[9]).items;
const dueAfterRemove = JSON.parse(process.argv[10]).items;
const savedAfterRemove = JSON.parse(process.argv[11]).items;

assert.equal(due[0].mods.ctrl.arg, '~remove:mote');
assert.equal(due[0].mods.ctrl.variables.wordping_command, '~remove:mote');
assert.equal(due[0].mods.ctrl.variables.wordping_return, 'review');
assert.equal(saved[0].mods.ctrl.variables.wordping_return, 'saved');
assert.equal(savedByWord.length, 1);
assert.equal(savedByWord[0].title, 'mote');
assert.equal(savedByTranslation[0].title, 'mote');
assert.equal(savedByTranslation[0].mods.ctrl.variables.wordping_return, 'saved');
assert.equal(savedByAlternative[0].subtitle, 'Saved translation: Alternative');
assert.equal(savedByAlternative[0].arg, 'Alternative');
assert.match(savedNoMatch[0].title, /No saved words matching/);
assert.equal(savedNoMatch[0].valid, false);
assert.equal(revealed[0].mods.ctrl.arg, '~remove:mote');
assert.equal(revealed[1].arg, '~remember:mote');
assert.equal(revealed[2].arg, '~again:mote');
for (const item of revealed) {
  assert.equal(item.mods.ctrl.arg, '~remove:mote');
  assert.equal(item.mods.ctrl.variables.wordping_command, '~remove:mote');
  assert.equal(item.mods.ctrl.variables.wordping_return, 'review');
}
assert.equal(dueAfterMiss[0].title, 'mote');
assert.equal(dueAfterRemove[0].title, 'No words due');
assert.equal(savedAfterRemove[0].title, 'No saved words');
console.log('Review shortcut tests passed');
JS
