import Vocabulary, { isDue, nextReviewDays, searchSavedEntries } from '../src/vocabulary';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const day = 24 * 60 * 60 * 1000;
const now = 1_700_000_000_000;
const directory = await tjs.makeTempDir('/tmp/wordping-review-tests-XXXXXX');
const path = `${directory}/vocabulary.json`;
const vocabulary = new Vocabulary(path);

const searchable = [
  { query: 'Bonjour', language: 'fr|en', output: '{"items":[{"title":"Hello"},{"title":"Good morning"}]}', savedAt: now },
  { query: 'Salut', language: 'fr|en', output: '{"items":[{"title":"Hi"}]}', savedAt: now },
  { query: 'Broken', language: 'fr|en', output: 'not json', savedAt: now },
];
assert(searchSavedEntries(searchable, 'BON').map((entry) => entry.query).join() === 'Bonjour', 'search should match saved words without case sensitivity');
assert(searchSavedEntries(searchable, 'morning').map((entry) => entry.query).join() === 'Bonjour', 'search should match every translation title');
assert(searchSavedEntries(searchable, 'hi').map((entry) => entry.query).join() === 'Salut', 'search should match translation substrings');
assert(searchSavedEntries(searchable, 'missing').length === 0, 'search should handle malformed saved output');
assert(searchSavedEntries(searchable, '').length === searchable.length, 'empty search should preserve the full list');

// Existing v1 files have no review fields and must remain reviewable.
await tjs.writeFile(path, JSON.stringify({ version: 1, entries: [
  { query: 'Bonjour', language: 'fr|en', output: '{}', savedAt: now - day },
  { query: 'Salut', language: 'fr|en', output: '{}', savedAt: now - day - 1000 },
  { query: 'Hola', language: 'es|en', output: '{}', savedAt: now - day },
] }));
assert((await vocabulary.due('fr|en', now)).length === 2, 'legacy saved words should be due');
assert((await vocabulary.due('es|en', now)).length === 1, 'review should stay within the language pair');
assert(!await vocabulary.review('missing', 'fr|en', true, now), 'missing words should not be reviewed');
assert(isDue({ query: 'old retry', language: 'fr|en', output: '{}', savedAt: now - day,
  reviewStep: 0, lastReviewedAt: now - 1000, dueAt: now - 1000 + 10 * 60 * 1000 }, now),
  'words missed in v0.6.2 should become due immediately');

assert(await vocabulary.review('bonjour', 'fr|en', true, now), 'remembered should match without case sensitivity');
let entry = (await vocabulary.list('fr|en'))[0];
assert(entry.reviewStep === 1 && entry.dueAt === now + day, 'first success should schedule tomorrow');
assert(nextReviewDays(entry) === 3, 'review action should show the next three-day interval');
assert((await vocabulary.due('fr|en', now)).length === 1, 'remembered word should leave the due list');
assert(isDue(entry, now + day), 'word should return when due');
assert(await vocabulary.nextDue('fr|en', now) === now + day, 'next due should find the earliest upcoming review');
assert(await vocabulary.nextDue('es|en', now) === undefined, 'next due should stay within the language pair and skip overdue words');

await vocabulary.review('Bonjour', 'fr|en', true, now + day);
entry = (await vocabulary.list('fr|en'))[0];
assert(entry.reviewStep === 2 && entry.dueAt === now + 4 * day, 'second success should use a three-day interval');
assert(nextReviewDays(entry) === 7, 'review action should advance to seven days');

await vocabulary.save('BONJOUR', 'fr|en', '{"items":[{"title":"hello"}]}');
entry = (await vocabulary.list('fr|en'))[0];
assert(entry.reviewStep === 0 && entry.dueAt === entry.savedAt, 'saving again should restart review immediately');
assert((await vocabulary.due('fr|en')).some((candidate) => candidate.query === 'BONJOUR'), 'saved word should appear in review');

const retryAt = entry.savedAt;
await vocabulary.review('bonjour', 'fr|en', false, retryAt);
entry = (await vocabulary.list('fr|en'))[0];
assert(entry.reviewStep === 0 && entry.dueAt === retryAt, 'missed word should reset progress and remain due');
const dueAfterMiss = await vocabulary.due('fr|en', retryAt);
assert(dueAfterMiss.length === 2 && dueAfterMiss[0].query === 'Salut' && dueAfterMiss[1].query === 'BONJOUR', 'missed word should stay due after older due words');

// A word saved again under v0.6.3 kept its future due date. Restore it on read.
await tjs.writeFile(`${directory}/legacy-resaved.json`, JSON.stringify({ version: 1, entries: [{
  query: 'pastoral', language: 'fr|en', output: '{}',
  savedAt: now + 1000, lastReviewedAt: now, dueAt: now + day, reviewStep: 1,
}] }));
const legacy = new Vocabulary(`${directory}/legacy-resaved.json`);
const restored = (await legacy.due('fr|en', now + 1000))[0];
assert(restored?.query === 'pastoral' && restored.reviewStep === 0 && restored.dueAt === restored.savedAt,
  'previously re-saved words should reappear as due with reset progress');

const source = new Vocabulary(`${directory}/source.json`);
await tjs.writeFile(`${directory}/source.json`, JSON.stringify({ version: 1, entries: [
  { query: 'bonjour', language: 'fr|en', output: '{"items":[{"title":"hello"}]}', savedAt: now,
    reviewStep: 2, dueAt: now + 4 * day, lastReviewedAt: now + day },
  { query: 'hola', language: 'es|en', output: '{"items":[{"title":"hello"}]}', savedAt: now,
    reviewStep: 1, dueAt: now + day },
] }));
const backup = await source.backup();
const parsedBackup = JSON.parse(backup);
assert(parsedBackup.format === 'wordping-vocabulary' && parsedBackup.entries.length === 2,
  'backup should include all language pairs');
const destination = new Vocabulary(`${directory}/destination.json`);
await tjs.writeFile(`${directory}/destination.json`, JSON.stringify({ version: 1, entries: [
  { query: 'BONJOUR', language: 'fr|en', output: '{}', savedAt: now + day, reviewStep: 3, dueAt: now + 8 * day },
] }));
const merged = await destination.restore(backup);
assert(merged.added === 1 && merged.kept === 1, 'restore should merge missing words without duplicating existing words');
assert((await destination.list('fr|en'))[0].reviewStep === 3, 'restore should preserve local progress on duplicate words');
const imported = (await destination.list('es|en'))[0];
assert(imported.query === 'hola' && imported.reviewStep === 1 && imported.dueAt === now + day,
  'restore should preserve imported review progress');
const invalid = JSON.parse(backup);
invalid.entries.unshift({ query: 'new word', language: 'fr|en', output: '{}', savedAt: now });
invalid.entries[1].dueAt = 'tomorrow';
let rejected = false;
try { await destination.restore(JSON.stringify(invalid)); } catch { rejected = true; }
assert(rejected && !(await destination.list('fr|en')).some((candidate) => candidate.query === 'new word'),
  'invalid backups should be rejected without changing saved words');

await tjs.remove(directory, { recursive: true });
console.log('Vocabulary review tests passed');
