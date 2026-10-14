#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_dir=$(mktemp -d /tmp/wordping-backup-ui-XXXXXX)
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/home/Downloads" "$test_dir/data"
./runtime/tjs bundle src/index.ts "$test_dir/index.js"

printf '%s' '{"version":1,"entries":[{"query":"bonjour","language":"fr|en","output":"{\"items\":[{\"title\":\"hello\"}]}","savedAt":1700000000000,"reviewStep":2,"dueAt":1700345600000}]}' > "$test_dir/data/vocabulary.json"

run_workflow() {
  HOME="$test_dir/home" alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" "$1"
}

command_menu=$(run_workflow ':')
node - "$command_menu" <<'JS'
const assert = require('node:assert/strict');
const items = JSON.parse(process.argv[2]).items;
assert.deepEqual(items.map((item) => item.autocomplete),
  [':review', ':reverse', ':saved', ':remind', ':backup', ':restore', ':export', ':clear']);
assert.equal(items[1].title, 'Review in reverse (0 due)');
assert.equal(items[2].title, 'Browse vocabulary');
assert.equal(items[4].title, 'Back up vocabulary (JSON)');
assert.match(items[4].subtitle, /All pairs and review progress/);
assert.equal(items[6].title, 'Export vocabulary (CSV)');
assert.match(items[6].subtitle, /no review progress/);
JS

missing=$(run_workflow ':restore')
node - "$missing" <<'JS'
const assert = require('node:assert/strict');
const item = JSON.parse(process.argv[2]).items[0];
assert.equal(item.title, 'Backup file not found');
assert.equal(item.valid, false);
JS

backup_menu=$(run_workflow ':backup')
backup_result=$(run_workflow '~backup')
backup_file="$test_dir/home/Downloads/WordPing Vocabulary Backup.json"
restore_menu=$(run_workflow ':restore')
custom_restore_menu=$(run_workflow ":restore $backup_file")
node - "$backup_menu" "$backup_result" "$backup_file" "$restore_menu" "$custom_restore_menu" <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [menu, result, file, restore, customRestore] = process.argv.slice(2);
assert.equal(JSON.parse(menu).items[0].arg, '~backup');
assert.match(result, /Saved vocabulary backup/);
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(backup.format, 'wordping-vocabulary');
assert.equal(backup.entries[0].reviewStep, 2);
assert.equal(backup.entries[0].dueAt, 1700345600000);
assert.equal(JSON.parse(restore).items[0].arg, `~restore:${encodeURIComponent(file)}`);
assert.equal(JSON.parse(customRestore).items[0].arg, `~restore:${encodeURIComponent(file)}`);
JS

printf '%s' '{"version":1,"entries":[]}' > "$test_dir/data/vocabulary.json"
restored=$(run_workflow "~restore:$(node -p 'encodeURIComponent(process.argv[1])' "$backup_file")")
node - "$restored" "$test_dir/data/vocabulary.json" <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.match(process.argv[2], /Restored 1 word/);
const entries = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).entries;
assert.equal(entries[0].query, 'bonjour');
assert.equal(entries[0].reviewStep, 2);
JS

printf '%s' '{"format":"wordping-vocabulary","version":1,"entries":[{"query":"bad","language":"fr|en","output":"{}","savedAt":"yesterday"}]}' > "$test_dir/home/Downloads/invalid.json"
invalid_result=$(run_workflow "~restore:$(node -p 'encodeURIComponent(process.argv[1])' "$test_dir/home/Downloads/invalid.json")")
node - "$invalid_result" "$test_dir/data/vocabulary.json" <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.match(JSON.parse(process.argv[2]).items[0].subtitle, /not a supported WordPing vocabulary backup/);
assert.equal(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).entries.length, 1);
console.log('Vocabulary backup workflow tests passed');
JS
