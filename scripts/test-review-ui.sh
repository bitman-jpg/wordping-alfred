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
assert.equal(due[0].mods.cmd.arg, 'mote');
assert.equal(due[0].mods.cmd.valid, true);
assert.equal(due[0].mods.cmd.icon.path, 'assets/translate-say.png');
assert.match(due[0].subtitle, /⌘ Return to pronounce/);
assert.equal(due[0].mods.ctrl.variables.wordping_command, '~remove:mote');
assert.equal(due[0].mods.ctrl.variables.wordping_return, 'review');
assert.equal(saved[0].mods.ctrl.variables.wordping_return, 'saved');
assert.equal(saved[saved.length - 1].title, 'Export vocabulary (CSV)…');
assert.equal(savedByWord.length, 1);
assert.equal(savedByWord[0].title, 'mote');
assert.equal(savedByTranslation[0].title, 'mote');
assert.equal(savedByTranslation[0].mods.ctrl.variables.wordping_return, 'saved');
assert.equal(savedByAlternative[0].subtitle, 'Saved translation: Alternative');
assert.equal(savedByAlternative[0].arg, 'Alternative');
assert.match(savedNoMatch[0].title, /No vocabulary entries matching/);
assert.equal(savedNoMatch[0].valid, false);
assert.equal(revealed[0].arg, '~remember:mote');
assert.equal(revealed[0].valid, true);
assert.equal(revealed[1].arg, '~again:mote');
assert.equal(revealed[1].valid, true);
assert.equal(revealed[2].title, '莫特');
assert.equal(revealed[2].arg, '莫特');
for (const item of revealed) {
  assert.equal(item.mods.ctrl.arg, '~remove:mote');
  assert.equal(item.mods.ctrl.variables.wordping_command, '~remove:mote');
  assert.equal(item.mods.ctrl.variables.wordping_return, 'review');
}
assert.equal(dueAfterMiss[0].title, 'mote');
assert.equal(dueAfterRemove[0].title, 'No words due');
assert.equal(savedAfterRemove[0].title, 'No vocabulary entries');
console.log('Review shortcut tests passed');
JS

node - "$test_dir/data/vocabulary.json" <<'JS'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({ version: 1, entries: [
  { query: 'mote', language: 'zh-CHS', output: JSON.stringify({ items: [{ title: '莫特', arg: '莫特' }] }), savedAt: 1 },
  { query: 'untranslated', language: 'zh-CHS', output: '{}', savedAt: 2 },
] }));
JS
reverse_prompt=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':reverse')
reverse_reveal=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':reverse mote')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~remember:mote' > /dev/null
reverse_summary=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':reverse')
forward_after_reverse=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
node - "$reverse_prompt" "$reverse_reveal" "$reverse_summary" "$forward_after_reverse" <<'JS'
const assert = require('node:assert/strict');
const [prompt, reveal, summary, forward] = process.argv.slice(2).map((value) => JSON.parse(value).items);
assert.equal(prompt[0].title, '莫特');
assert.equal(prompt[0].autocomplete, ':reverse mote');
assert.equal(prompt[0].mods.cmd, undefined, 'pronunciation must not reveal the answer');
assert.equal(prompt[0].mods.ctrl.variables.wordping_return, 'reverse');
assert.equal(reveal[0].arg, '~remember:mote');
assert.equal(reveal[0].variables.wordping_return, 'reverse');
assert.equal(reveal[1].arg, '~again:mote');
assert.equal(reveal[1].variables.wordping_return, 'reverse');
assert.equal(reveal[2].title, 'mote');
assert.equal(reveal[2].mods.cmd.arg, 'mote');
assert.equal(reveal[2].mods.ctrl.variables.wordping_return, 'reverse');
assert.match(summary[0].title, /Session complete · 1 word/);
assert.equal(forward[0].title, 'untranslated');
console.log('Reverse review workflow tests passed');
JS

node - "$test_dir/data/vocabulary.json" <<'JS'
const fs = require('node:fs');
const entries = Array.from({ length: 11 }, (_, index) => ({
  query: `word-${index + 1}`, language: 'zh-CHS',
  output: JSON.stringify({ items: [{ title: `translation-${index + 1}`, arg: `translation-${index + 1}` }] }),
  savedAt: index + 1,
}));
fs.writeFileSync(process.argv[2], JSON.stringify({ version: 1, entries }));
JS

session_start=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review next')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~again:word-1' > /dev/null
retry_later=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
for index in 2 3 4 5 6 7 8 9 10; do
  alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" "~remember:word-$index" > /dev/null
done
retry_prompt=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~again:word-1' > /dev/null
summary=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
node - "$test_dir/data/review-session-zh-CHS.json" <<'JS'
const fs = require('node:fs');
const path = process.argv[2];
const session = JSON.parse(fs.readFileSync(path, 'utf8'));
session.completedAt = Date.now() - 48 * 60 * 60 * 1000;
fs.writeFileSync(path, JSON.stringify(session));
JS
next_session=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')

node - "$session_start" "$retry_later" "$retry_prompt" "$summary" "$next_session" <<'JS'
const assert = require('node:assert/strict');
const [start, later, retry, summary, next] = process.argv.slice(2).map((value) => JSON.parse(value).items);
assert.equal(start[0].title, 'word-1');
assert.match(start[0].subtitle, /1 of 10/);
assert.equal(later[0].title, 'word-2');
assert.equal(retry[0].title, 'word-1');
assert.match(retry[0].subtitle, /Second try/);
assert.match(summary[0].title, /Session complete · 10 words/);
assert.match(summary[0].subtitle, /9 recalled first try · 0 recovered · 1 still due/);
assert.match(summary[1].title, /2 due/);
assert.equal(summary[1].autocomplete, ':review next');
assert.equal(next[0].title, 'word-11');
console.log('Review session workflow tests passed');
JS

node - "$test_dir/data/vocabulary.json" <<'JS'
const fs = require('node:fs');
const now = Date.now();
const future = now + 2 * 24 * 60 * 60 * 1000;
const entries = [
  { query: 'later', language: 'zh-CHS', output: '{}', savedAt: now, dueAt: future + 24 * 60 * 60 * 1000 },
  { query: 'sooner', language: 'zh-CHS', output: '{}', savedAt: now, dueAt: future },
];
fs.writeFileSync(process.argv[2], JSON.stringify({ version: 1, entries }));
JS
rm "$test_dir/data/review-session-zh-CHS.json"
no_due=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
node - "$no_due" <<'JS'
const assert = require('node:assert/strict');
const item = JSON.parse(process.argv[2]).items[0];
assert.equal(item.title, 'No words due');
assert.match(item.subtitle, /^Next word due [A-Z][a-z]{2} \d{1,2}.* at \d{1,2}:\d{2} [AP]M$/);
console.log('Upcoming review display test passed');
JS

node - "$test_dir/data/vocabulary.json" <<'JS'
const fs = require('node:fs');
const path = process.argv[2];
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
data.entries.push({ query: 'due-now', language: 'zh-CHS', output: '{}', savedAt: Date.now() - 1000 });
fs.writeFileSync(path, JSON.stringify(data));
JS
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review' > /dev/null
alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" '~remember:due-now' > /dev/null
completed_with_future=$(alfred_workflow_data="$test_dir/data" alfred_workflow_cache="$test_dir" ./runtime/tjs run "$test_dir/index.js" ':review')
node - "$completed_with_future" <<'JS'
const assert = require('node:assert/strict');
const items = JSON.parse(process.argv[2]).items;
assert.match(items[0].title, /Session complete/);
assert.equal(items[1].title, 'All caught up');
assert.match(items[1].subtitle, /^Next word due /);
console.log('Completed review schedule display test passed');
JS
