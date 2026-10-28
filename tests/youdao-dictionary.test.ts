import { youdaoDictionaryResults } from '../src/youdao-dictionary';
import { oneItemPerProvider } from '../src/multi-lookup';
import { dictionaryItems } from '../src/dictionaries';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const response = { ec: { word: [{ 'return-phrase': { l: { i: 'parthenogenesis' } },
  ukphone: 'ˌpɑːθənəʊˈdʒenɪsɪs', usphone: 'ˌpɑːrθənoʊˈdʒenɪsɪs',
  trs: [{ tr: [{ l: { i: ['n. [植] 单性生殖，[胚] 孤雌生殖'] } }] }] }] } };
const result = youdaoDictionaryResults(response, 'parthenogenesis', 'en', 'zh-CHS');
assert(result.length === 1 && result[0].title === '[植] 单性生殖，[胚] 孤雌生殖'
  && result[0].partOfSpeech === 'n.'
  && result[0].phonetics?.startsWith('UK /ˌpɑːθənəʊˈdʒenɪsɪs/')
  && result[0].quicklookurl?.endsWith('/parthenogenesis'),
  'the Youdao dictionary fallback should recover an exact English headword with its part of speech');
const row = oneItemPerProvider(dictionaryItems(result, 'parthenogenesis'), 'youdao')[0];
assert(row.title === 'n. [植] 单性生殖，[胚] 孤雌生殖' && row.subtitle === ''
  && row.icon.path === 'assets/provider-muted-youdao.png'
  && row.mods.alt.subtitle.startsWith('UK /ˌpɑːθənəʊˈdʒenɪsɪs/'),
  'the fallback should render as one normal Youdao row');
assert(youdaoDictionaryResults(response, 'another', 'en', 'zh-CHS').length === 0,
  'a suggested or unrelated headword must not be displayed as an exact lookup');

console.log('Youdao dictionary fallback tests passed');
