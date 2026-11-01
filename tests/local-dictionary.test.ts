import { lookupLocalDictionary } from '../src/local-dictionary';
import { lookupOxford, oxfordDictionaryNames, oxfordResults } from '../src/oxford-dictionary';
import { providerOrder, providersFor } from '../src/provider-order';
import { lookupAll } from '../src/multi-lookup';
import { dictionaryItems } from '../src/dictionaries';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(providerOrder('langdao,oxford,youdao,langdao').join(',') === 'oxford,youdao',
  'removed Langdao provider names should be ignored');
assert(providersFor('two words', providerOrder('oxford,youdao')).join(',') === 'youdao',
  'local dictionaries should only receive single words');
assert(oxfordDictionaryNames('en', 'zh-CHS')[0] === '牛津英汉汉英词典'
  && oxfordDictionaryNames('zh-CHS', 'en').length === 2
  && oxfordDictionaryNames('fr', 'zh-CHS').length === 0
  && oxfordDictionaryNames('en', 'en')[0] === 'Oxford Dictionary of English',
  'Oxford should choose only the appropriate bilingual or English dictionaries');

const oxfordEnglish = oxfordResults('beat | BrE biːt, AmE bit | A. transitive verb past tense beat ① (strike) 击打 jīdǎ ‹person›▸ to beat sb 打某人 ② (defeat) 打败 dǎbài ‹team› B. intransitive verb ① Physiology «heart» 跳动 tiàodòng C. noun ① Music (rhythm) 节奏 jiézòu D. adjective predicative informal 筋疲力尽的 jīnpílìjìn de',
  'beat', '牛津英汉汉英词典', 'en', 'zh-CHS');
assert(oxfordEnglish.map((item) => item.title).join(',') === '击打,打败,跳动,节奏,筋疲力尽的'
  && oxfordEnglish[0].partOfSpeech === 'transitive verb'
  && oxfordEnglish[0].phonetics === 'BrE biːt, AmE bit',
  'Oxford English entries should become concise translated senses instead of one raw article');

const oxfordChinese = oxfordResults('拍 pāi A. verb ① （拍打） pat▸ 拍球 bounce a ball ② （摄影） take (a picture)▸ 拍电影 shoot a film B. noun ① （球拍） bat▸ 网球拍 tennis racket ② ［Music］ beat▸ 四分之四拍 four-four time',
  '拍', '牛津英汉汉英词典', 'zh-CHS', 'en');
assert(oxfordChinese.map((item) => item.title).join(',') === 'pat,take (a picture),bat,beat'
  && oxfordChinese[0].phonetics === 'pāi',
  'Oxford Chinese entries should extract English senses and pinyin');

const oxfordMonolingual = oxfordResults('hello | həˈləʊ | (also hallo) exclamation used as a greeting: hello there. • used to attract attention: hello! . noun an utterance of hello: polite hellos. verb [no object] say hello: I helloed.',
  'hello', 'Oxford Dictionary of English', 'en', 'en');
assert(oxfordMonolingual.map((item) => item.title).join('|')
  === 'used as a greeting|used to attract attention|an utterance of hello|say hello',
  'monolingual Oxford fallback should expose short definitions without examples or etymology');

assert(!(await lookupLocalDictionary('oxford', 'two words', 'en', 'zh-CHS')).length,
  'phrases are not sent to local dictionaries');
const entries = [{ title: 'A greeting.', arg: 'A greeting.', pronounce: 'hello',
  subtitle: 'New Oxford American Dictionary · en → en', source: 'New Oxford American Dictionary' }];
const progress = await lookupAll('hello', 'en:zh', 'zh-CHS', 'en', '', ['oxford'],
  undefined, { oxford: async () => dictionaryItems(entries, 'hello') });
assert(progress.completed === 1 && progress.items.length === 1
  && progress.items[0].subtitle === 'en→en'
  && progress.items[0].icon.path.endsWith('oxford.png')
  && progress.items[0].variables.wordping_source === 'New Oxford American Dictionary',
  'an absent bilingual entry must not mislabel an Oxford English definition as Chinese');

const actual = await lookupOxford('hello', 'en', 'zh-CHS');
assert(Array.isArray(actual) && actual.every((item) => Boolean(item.title)
  && (item.source?.includes('牛津') || item.source?.includes('Oxford'))),
  'system Oxford returns local definitions or an empty result');
console.log(actual.length ? `System Oxford FFI lookup passed (${actual[0].source})`
  : 'No installed system Oxford definition; FFI smoke test skipped');
const english = await lookupOxford('hello', 'en', 'en');
assert(english.every((item) => item.subtitle.endsWith('en → en') && item.source?.includes('Oxford')),
  'monolingual Oxford results retain their actual language direction');
assert(!(await lookupOxford('wordpingmissingentryxyz', 'en', 'zh-CHS')).length,
  'absent Oxford headwords return no result');

console.log('Local dictionary tests passed');
