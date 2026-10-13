#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_dir=$(mktemp -d /tmp/wordping-review-ui-XXXXXX)
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/data"

./runtime/tjs bundle src/index.ts "$test_dir/index.js"
printf '%s' '{"version":1,"entries":[{"query":"mote","language":"zh-CHS","output":"{\"items\":[{\"title\":\"莫特\",\"arg\":\"莫特\"}]}","savedAt":1}]}' > "$test_dir/data/vocabulary.json"

due=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
saved=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved')
revealed=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review mote')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~again:mote' > /dev/null
due_after_miss=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~remove:mote' > /dev/null
due_after_remove=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
saved_after_remove=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':saved')

node - "$due" "$saved" "$revealed" "$due_after_miss" "$due_after_remove" "$saved_after_remove" <<'JS'
const assert = require('node:assert/strict');
const due = JSON.parse(process.argv[2]).items;
const saved = JSON.parse(process.argv[3]).items;
const revealed = JSON.parse(process.argv[4]).items;
const dueAfterMiss = JSON.parse(process.argv[5]).items;
const dueAfterRemove = JSON.parse(process.argv[6]).items;
const savedAfterRemove = JSON.parse(process.argv[7]).items;

assert.equal(due[0].mods.ctrl.arg, '~remove:mote');
assert.equal(due[0].mods.ctrl.variables.wordping_command, '~remove:mote');
assert.equal(due[0].mods.ctrl.variables.wordping_return, 'review');
assert.equal(saved[0].mods.ctrl.variables.wordping_return, 'saved');
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
