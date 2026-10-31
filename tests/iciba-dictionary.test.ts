import { dictionaryItems } from '../src/dictionaries';
import { oneItemPerProvider } from '../src/multi-lookup';
import { icibaDictionaryResults } from '../src/iciba-dictionary';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function page(word: string, meanings: string[]): string {
  const data = { props: { pageProps: { initialReduxState: { word: { wordInfo: { baesInfo: {
    word_name: word, symbols: [{ ph_en: 'rɪˈbjuːk', ph_am: 'rɪˈbjuːk',
      ph_en_mp3: 'http://res.iciba.com/uk.mp3', ph_am_mp3: 'https://res.iciba.com/us.mp3',
      parts: [{ part: 'vt.', means: meanings }] }],
  } } } } } } };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
}

const results = icibaDictionaryResults(page('rebuke', ['非难，指责', '惩戒']),
  'rebuke', 'en', 'zh-CHS');
assert(results.length === 2 && results[0].title === '非难，指责'
  && results[0].partOfSpeech === 'vt.'
  && results[0].phonetics === 'UK /rɪˈbjuːk/ · US /rɪˈbjuːk/'
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

const item = oneItemPerProvider(dictionaryItems(results, 'rebuke'), 'iciba')[0];
assert(item.variables.wordping_source === 'Iciba'
  && item.variables.wordping_audio_uk === 'https://res.iciba.com/uk.mp3'
  && item.variables.wordping_audio_us === 'https://res.iciba.com/us.mp3'
  && item.mods.alt.arg === 'rebuke',
  'The selected iCIBA row must carry its recordings through grouping to Option+Return');
const unsafe = icibaDictionaryResults(page('rebuke', ['test']).replace(
  'http://res.iciba.com/uk.mp3', 'https://res.iciba.com.evil.test/uk.mp3'), 'rebuke', 'en', 'zh-CHS');
assert(!unsafe[0].audioUK, 'Only iCIBA audio hosts should be accepted');
