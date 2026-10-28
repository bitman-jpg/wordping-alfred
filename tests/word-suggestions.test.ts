import { suggestionItems } from '../src/word-suggestions';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const typo = suggestionItems('terestrial', '', {
  corrections: ['terrestrial'], completions: [],
});
assert(typo.length === 1 && typo[0].autocomplete === 'terrestrial',
  'a spelling correction should replace the query when Tab is pressed');
assert(typo[0].valid === false, 'a suggestion should not trigger the copy action');

const partial = suggestionItems('terres', 'en>zh ', {
  corrections: ['Teresa'], completions: ['terrestrial', 'terrestrials', 'terrestrial'],
});
assert(partial.length === 2 && partial[0].autocomplete === 'en>zh terrestrial',
  'completion should preserve the manual language direction');
assert(partial[1].autocomplete === 'en>zh terrestrials', 'duplicate completions should be removed');

const exact = suggestionItems('terrestrial', '', {
  correctlySpelled: true,
  corrections: ['terrestrial'], completions: ['terrestrial', 'terrestrials'],
});
assert(exact.length === 0, 'a correctly spelled word should not show other word forms');

console.log('Word suggestion tests passed');
