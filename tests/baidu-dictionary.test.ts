import { baiduDictionaryResults, baiduWordPage } from '../src/baidu-dictionary';
import { oneItemPerProvider } from '../src/multi-lookup';
import { dictionaryItems } from '../src/dictionaries';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const data = { errno: 0, data: [
  { k: 'rebuke', v: 'vt. 非难，指责; 制止，阻止; 惩戒 n. 责备；斥责，训斥' },
  { k: 'rebuked', v: 'v. 责备' },
] };
const results = baiduDictionaryResults(data, 'rebuke', 'en', 'zh-CHS');
assert(results[0].title === '非难，指责' && results.length === 5,
  'Baidu should extract meanings for the exact headword');
assert(results[0].partOfSpeech === 'vt.' && results[4].partOfSpeech === 'n.',
  'Baidu should retain each meaning’s part of speech');
assert(results[0].quicklookurl === baiduWordPage('rebuke')
  && results[0].quicklookurl === 'https://dict.baidu.com/s?wd=rebuke',
  'Shift should open Baidu’s headword page');
assert(baiduWordPage('你好') === 'https://dict.baidu.com/s?wd=%E4%BD%A0%E5%A5%BD',
  'Chinese Shift URLs should include the encoded headword');
const compact = oneItemPerProvider(dictionaryItems(results, 'rebuke'), 'baidu');
assert(compact.length === 1 && compact[0].title.includes('制止，阻止')
  && compact[0].arg.includes('n. 责备 / 斥责，训斥')
  && compact[0].subtitle.startsWith('Baidu · en→zh')
  && !compact[0].subtitle.includes('meanings'),
  'Baidu meanings should occupy the main line of one Alfred row');
const sameWordAcrossParts = oneItemPerProvider(dictionaryItems(baiduDictionaryResults({ errno: 0,
  data: [{ k: 'consent', v: 'n. 同意; 准许 vi. 同意; 允许' }] },
  'consent', 'en', 'zh-CHS'), 'consent'), 'baidu')[0];
assert(sameWordAcrossParts.title.includes('n., vi. 同意')
  && !sameWordAcrossParts.subtitle.includes('meanings'),
  'a meaning with multiple parts of speech should appear once with both labels');
assert(baiduDictionaryResults(data, 'rebuked', 'en', 'zh-CHS')[0].title === '责备'
  && baiduDictionaryResults(data, 'rebute', 'en', 'zh-CHS').length === 0,
  'Baidu should not show a suggestion for a different headword');
assert(baiduDictionaryResults(data, 'rebuke', 'en', 'zh-CHT').length === 0,
  'Simplified Chinese meanings should not be labeled Traditional Chinese');
assert(baiduDictionaryResults({ errno: 0, data: [{ k: '你好', v: 'hello; hi' }] },
  '你好', 'zh-CHS', 'en')[0].title === 'hello',
  'Chinese headwords should return English dictionary meanings');

console.log('Baidu dictionary tests passed');
