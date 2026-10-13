import Vocabulary, { isDue, nextReviewDays } from '../src/vocabulary';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const day = 24 * 60 * 60 * 1000;
const now = 1_700_000_000_000;
const directory = await tjs.makeTempDir('/tmp/wordping-review-tests-XXXXXX');
const path = `${directory}/vocabulary.json`;
const vocabulary = new Vocabulary(path);

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

await tjs.remove(directory, { recursive: true });
console.log('Vocabulary review tests passed');
