import Translator, { lookupResults } from '../src/translator';
import { WebTranslation } from '../src/keyless-youdao';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function result(text: string, type: string, dictResult?: any): WebTranslation {
  return { code: 0, type, translateResult: [[{ tgt: text }]], dictResult };
}

let calls: string[] = [];
let reply: (source: string, target: string) => WebTranslation;
const lookup = async (_word: string, source: string, target: string) => {
  calls.push(`${source}>${target}`);
  return reply(source, target);
};

let translator = new Translator('zh-CHS', 'en', '', lookup);
reply = () => ({ ...result('击败', 'en2zh-CHS', { ec: { exam_type: ['CET4', 'TOEFL'], word: {
  'return-phrase': 'beat', ukphone: 'biːt', usphone: 'biːt', wfs: [
  { wf: { name: '过去分词', value: 'beaten' } },
], trs: [
  { pos: 'v.', tran: '敲，击，打；击败，战胜' },
  { pos: 'n.', tran: '节拍' },
  { tran: '【名】 （Beat）贝亚特' },
] } }, examples: [{ source: 'The drum beat loudly.', translation: '鼓声很响。' }] }),
  translateResult: [[{ tgt: '击败', src: 'beat', tgtPronounce: 'jībài' }]] });
let output = JSON.parse(await translator.translate('beat'));
assert(output.items[0].title === '击败', 'translation should remain the first result');
assert(output.items[1].title === 'Show full entry for beat', 'single words with meanings should offer a detail view');
assert(output.items[1].arg.includes('## Meanings') && output.items[1].arg.includes('敲，击，打'),
  'detail view should show all meanings');
assert(output.items[1].arg.includes('UK /biːt/') && output.items[1].arg.includes('beaten'),
  'detail view should show pronunciation and forms');
assert(output.items[1].arg.includes('English → Simplified Chinese')
  && output.items[1].arg.includes('CET4 · TOEFL')
  && output.items[1].arg.includes('Translation pinyin:** jībài'),
  'detail view should show direction, exam levels, and translated pinyin');
assert(!output.items[1].arg.includes('Dictionary headword:'), 'matching headword should not be repeated');
assert(output.items[1].arg.includes('The drum beat loudly.') && output.items[1].arg.includes('鼓声很响。'),
  'detail view should show examples when supplied');
assert(output.items[1].arg.includes('### Other\n- 【名】'), 'unlabelled meanings should have their own group');
assert(Object.keys(output.items[1].mods || {}).length === 0,
  'detail action should not copy or pronounce its Markdown argument');
assert(output.items.some((item: any) => item.title === '敲，击，打'), 'dictionary meanings should be selectable');
assert(output.items.some((item: any) => item.title === '节拍'), 'noun meanings should be included');
assert(output.items.find((item: any) => item.title === '节拍').variables.wordping_pos === 'n.',
  'Youdao should retain the meaning’s part of speech');
assert(output.items[0].mods.ctrl.arg === '~save:beat', 'lookup should keep the save action');
assert(output.items[0].quicklookurl.endsWith('/beat'), 'lookup should keep Shift preview');
assert(calls.join(',') === 'auto>zh-CHS', 'detected English should use the website response directly');

calls = [];
reply = () => result('工作', 'es2zh-CHS');
output = JSON.parse(await translator.translate('trabajo', false, { from: 'es', to: 'zh-CHS' }));
assert(output.items[0].title === '工作' && calls.join(',') === 'es>zh-CHS',
  'manual direction should bypass website auto detection');

calls = [];
reply = () => ({ ...result('Hello', 'zh-CHS2en', { ce: { word: {
  phone: 'nǐ hǎo', 'return-phrase': '你好', trs: [{ '#text': 'Hello', '#tran': '你好' }],
} } }), translateResult: [[{ tgt: 'Hello', src: '你好', srcPronounce: 'nĭhăo' }]] });
output = JSON.parse(await translator.translate('你好'));
assert(output.items[0].title === 'Hello', 'native language should translate to learning language');
assert(output.items[1].arg.includes('Simplified Chinese → English')
  && output.items[1].arg.includes('Source pinyin:** nǐ hǎo'),
  'Chinese entries should show their detected direction and source pinyin');
assert(calls.join(',') === 'auto>zh-CHS', 'website auto mode handles Chinese to English');

calls = [];
translator = new Translator('en', 'fr', '', lookup);
reply = (source) => source === 'auto' ? result('你好', 'fr2zh-CHS') : result('hello', 'fr2en');
output = JSON.parse(await translator.translate('bonjour'));
assert(output.items[0].title === 'hello', 'website auto mode must not force Chinese for non-Chinese pairs');
assert(calls.join(',') === 'auto>en,fr>en', 'detected source should be retried with the configured target');

calls = [];
translator = new Translator('zh-CHS', 'en', '', lookup);
reply = (source) => source === 'auto' ? { code: 40 } : result('美国国家航空航天局', 'en2zh-CHS');
output = JSON.parse(await translator.translate('NASA'));
assert(output.items[0].title === '美国国家航空航天局', 'acronyms should retry with an explicit language');
assert(calls.join(',') === 'auto>zh-CHS,en>zh-CHS', 'auto failure should use the learning language');

calls = [];
translator = new Translator('zh-CHT', 'en', '', lookup);
reply = () => result('Hello', 'zh-CHS2en');
output = JSON.parse(await translator.translate('你好'));
assert(output.items[0].title === 'Hello', 'traditional Chinese users should translate Chinese into their learning language');
assert(calls.join(',') === 'auto>zh-CHT', 'website result can be reused when it already targets English');

const meanings = lookupResults(result('Hello', 'zh-CHS2en', { ce: { word: { trs: [
  { '#text': 'hello', '#tran': '你好' }, { '#text': 'hi', '#tran': '你好' },
] } } }), '你好');
assert(meanings.length === 3 && meanings[2].title === 'hi', 'Chinese dictionary alternatives should be included without duplicates');

const inflected = lookupResults(result('击打', 'en2zh-CHS', { ec: { word: {
  'return-phrase': 'beat', trs: [{ pos: 'v.', tran: '击打' }],
} } }), 'beating');
assert(inflected[1].arg.includes('Dictionary headword:** beat'),
  'a normalized dictionary headword should appear when it differs from the lookup');

assert(!lookupResults(result('hello', 'en2zh-CHS', { ec: { word: { trs: [
  { pos: 'n.', tran: '例子' },
] } } }), 'two words').some((item) => item.detail), 'phrases should keep their compact results');

let failedWebsiteCalls = 0;
translator = new Translator('zh-CHS', 'en', '', async () => {
  failedWebsiteCalls++;
  return { code: 50 };
});
let failed = false;
try { await translator.translate('rheumatic'); }
catch { failed = true; }
assert(failed, 'code 50 should not fall back to translation-only services');
assert(failedWebsiteCalls === 1, 'code 50 should skip a website retry known to fail');

console.log('Keyless translator tests passed');
