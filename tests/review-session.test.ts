import ReviewSession from '../src/review-session';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const directory = await tjs.makeTempDir('/tmp/wordping-session-tests-XXXXXX');
const store = new ReviewSession(`${directory}/session.json`);
const due = Array.from({ length: 12 }, (_, index) => ({
  query: `word-${index + 1}`, language: 'fr|en', output: '{}', savedAt: index,
}));

let state = await store.start('fr|en', due);
assert(state.total === 10 && state.pending.length === 10, 'session should select at most ten due words');
assert(state.pending[0].query === 'word-1' && state.pending[9].query === 'word-10', 'session should preserve due order');
assert(!(await store.load('es|en')), 'session should stay within its language pair');
assert((await store.load('fr|en'))?.pending.length === 10, 'session should survive a new workflow run');
assert(!await store.grade(state, 'word-2', true), 'only the current prompt can be graded');

await store.grade(state, 'word-1', false);
assert(state.missed === 1 && state.completed === 0, 'first miss should not complete the word');
assert(state.pending[0].query === 'word-2' && state.pending[9].query === 'word-1' && state.pending[9].retry,
  'missed word should move to the end for one retry');
for (let index = 2; index <= 10; index++) await store.grade(state, `word-${index}`, true);
assert(state.completed === 9 && state.pending.length === 1, 'nine successful words should leave the retry');
await store.grade(state, 'word-1', true);
assert(state.completed === 10 && state.recovered === 1 && state.pending.length === 0,
  'successful retry should finish the session');

state = await store.start('fr|en', due.slice(0, 2));
await store.grade(state, 'word-1', false);
await store.grade(state, 'word-2', true);
await store.grade(state, 'word-1', false);
assert(state.completed === 2 && state.unresolved === 1 && state.pending.length === 0,
  'second miss should finish the session while leaving vocabulary due');

state = await store.start('fr|en', due.slice(0, 2));
await store.reconcile(state, due.slice(1));
assert(state.total === 1 && state.pending[0].query === 'word-2', 'removed word should leave the session');
await store.grade(state, 'word-2', false);
await store.reconcile(state, []);
assert(state.total === 0 && state.missed === 0, 'removing a pending retry should update summary counts');

await tjs.remove(directory, { recursive: true });
console.log('Review session tests passed');
