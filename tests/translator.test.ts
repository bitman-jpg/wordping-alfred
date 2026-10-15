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
reply = () => result('击败', 'en2zh-CHS', { ec: { word: { trs: [
  { pos: 'v.', tran: '敲，击，打；击败，战胜' },
  { pos: 'n.', tran: '节拍' },
] } } });
let output = JSON.parse(await translator.translate('beat'));
assert(output.items[0].title === '击败', 'translation should remain the first result');
assert(output.items.some((item: any) => item.title === '敲，击，打'), 'dictionary meanings should be selectable');
assert(output.items.some((item: any) => item.title === '节拍'), 'noun meanings should be included');
assert(output.items[0].mods.ctrl.arg === '~save:beat', 'lookup should keep the save action');
assert(output.items[0].quicklookurl.endsWith('/beat'), 'lookup should keep Shift preview');
assert(calls.join(',') === 'auto>zh-CHS', 'detected English should use the website response directly');

calls = [];
reply = () => result('Hello', 'zh-CHS2en');
output = JSON.parse(await translator.translate('你好'));
assert(output.items[0].title === 'Hello', 'native language should translate to learning language');
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
assert(meanings.length === 2 && meanings[1].title === 'hi', 'Chinese dictionary alternatives should be included without duplicates');

console.log('Keyless translator tests passed');
