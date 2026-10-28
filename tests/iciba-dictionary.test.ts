import { icibaDictionaryResults } from '../src/iciba-dictionary';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function page(word: string, meanings: string[]): string {
  const data = { props: { pageProps: { initialReduxState: { word: { wordInfo: { baesInfo: {
    word_name: word, symbols: [{ parts: [{ part: 'vt.', means: meanings }] }],
  } } } } } } };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
}

const results = icibaDictionaryResults(page('rebuke', ['非难，指责', '惩戒']),
  'rebuke', 'en', 'zh-CHS');
assert(results.length === 2 && results[0].title === '非难，指责'
  && results[0].partOfSpeech === 'vt.'
  && results[0].subtitle.includes('Iciba dictionary')
  && results[0].quicklookurl === 'https://www.iciba.com/word?w=rebuke',
  'Iciba should return dictionary meanings and the exact word page');
assert(icibaDictionaryResults(page('other', ['错误']), 'rebuke', 'en', 'zh-CHS').length === 0,
  'Iciba should reject a page for a different headword');
assert(icibaDictionaryResults(page('rebuke', ['非难']), 'rebuke', 'en', 'zh-CHT').length === 0,
  'Simplified meanings should not be labeled as Traditional Chinese');
assert(icibaDictionaryResults(page('ice cream', ['冰淇淋']), 'ice cream', 'en', 'zh-CHS')[0].quicklookurl
  === 'https://www.iciba.com/word?w=ice%20cream',
  'Shift should encode the queried Iciba headword');

console.log('Iciba dictionary tests passed');
