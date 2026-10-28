import { wiktionaryResults } from '../src/dictionaries';
import { lookupAll, lookupDirection, oneItemPerProvider } from '../src/multi-lookup';
import { providerOrder, providersFor } from '../src/provider-order';
import { memoryResults, memoryWordPage } from '../src/mymemory';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(lookupDirection('bank', 'en', 'zh-CHS').from === 'en',
  'English input should route to Chinese');
assert(lookupDirection('你好', 'en', 'zh-CHS').from === 'zh-CHS',
  'Chinese input should route to English');
assert(lookupDirection('こんにちは', 'en', 'ja').from === 'ja',
  'Japanese input should route to English');
assert(providerOrder('Iciba, BAIDU, iciba, Youdao, Alibaba, Apple').join(',') === 'iciba,baidu,youdao,apple',
  'unsupported translation-only providers should be ignored');
assert(providerOrder().join(',') === 'youdao,iciba,baidu,wiktionary,apple,mymemory',
  'the default order should include dictionary sources, Apple Translation, and MyMemory');
assert(providerOrder('youdao,iciba,baidu,wiktionary,apple').join(',') === providerOrder().join(','),
  'the previous default should gain MyMemory after upgrading');
assert(providerOrder('youdao,iciba,baidu,wiktionary').join(',') === 'youdao,iciba,baidu,wiktionary',
  'removing Apple from a custom provider list should disable it');
assert(providersFor('two words', providerOrder('wiktionary,iciba,baidu,youdao,apple')).join(',') === 'youdao,apple',
  'dictionary sources should only receive single words while Apple can handle phrases');
assert(providersFor('two words', providerOrder('wiktionary,mymemory,youdao')).join(',') === 'mymemory,youdao',
  'MyMemory can translate phrases in addition to words');

const memory = memoryResults({ responseStatus: 200, responseData: { translatedText: 'unrelated' }, matches: [
  { segment: 'consent in writing', translation: '书面同意' },
  { segment: 'consent', translation: '同意' },
  { segment: 'Consent', translation: '许可' },
] }, 'consent', 'en', 'zh-CHS');
assert(memory.map((item) => item.title).join(',') === '同意,许可'
  && memory.every((item) => item.quicklookurl === memoryWordPage('consent', 'en', 'zh-CHS'))
  && memory[0].quicklookurl?.includes('/English/Chinese-(Simplified)/consent'),
  'MyMemory should prefer exact segments and link Shift to its matching page');
assert(oneItemPerProvider(memory.map((item) => ({ title: item.title, subtitle: item.subtitle,
  quicklookurl: item.quicklookurl })), 'mymemory').length === 1,
  'MyMemory should occupy one Alfred row');
assert(oneItemPerProvider(memory.map((item) => ({ title: item.title, subtitle: item.subtitle })),
  'mymemory')[0].subtitle === 'en→zh',
  'provider icons should leave the subtitle for language direction');
assert(oneItemPerProvider(memory.map((item) => ({ title: item.title, subtitle: item.subtitle })),
  'mymemory')[0].icon.path === 'assets/provider-muted-mymemory.png',
  'MyMemory should use its provider icon');
assert(oneItemPerProvider([{ title: 'translation', subtitle: 'Apple · es → zh-CHT' }],
  'apple')[0].subtitle === 'es→zh-TW',
  'traditional Chinese should remain distinguishable in a short subtitle');
assert(memoryResults({ responseStatus: 200, responseData: { translatedText: 'hello' },
  matches: [{ segment: 'bonjour le monde', translation: 'hello world' }] },
  'bonjour', 'fr', 'en')[0]?.title === 'hello',
  'MyMemory should use its direct translation when no exact segment matches');

const wiki = wiktionaryResults({ entries: [{ partOfSpeech: 'noun', senses: [{
  definition: 'A financial institution.', translations: [
    { language: { code: 'zh' }, word: 'йинхон' },
    { language: { code: 'zh' }, word: '銀行 /银行' },
  ],
}] }] }, 'bank', 'en', 'zh-CHS');
assert(wiki[0].title === '银行' && wiki.length === 1 && wiki[0].arg === '银行'
  && wiki[0].partOfSpeech === 'noun'
  && wiki[0].quicklookurl?.includes('wiktionary.org/wiki/bank'),
  'Wiktionary should return a copyable result with its Shift page');
const mandarin = wiktionaryResults({ entries: [{ partOfSpeech: 'verb', senses: [{
  translations: [
    { language: { code: 'cmn' }, word: '承諾 /承诺' },
    { language: { code: 'cmn' }, word: '同意' },
  ],
}] }] }, 'consent', 'en', 'zh-CHS');
assert(mandarin.map((item) => item.title).join(',') === '承诺,同意',
  'Wiktionary should accept Mandarin translations labeled cmn');
assert(wiktionaryResults({ entries: [{ senses: [{ definition: 'A financial institution.' }] }] },
  'bank', 'en', 'zh-CHS').length === 0,
  'Wiktionary should return no item when it has no translation for the target language');
const compact = oneItemPerProvider([
  { title: '非难，指责', arg: '非难，指责', subtitle: 'Iciba dictionary', quicklookurl: 'https://www.iciba.com/word?w=rebuke',
    text: { copy: '非难，指责' }, mods: { ctrl: { variables: { wordping_choice: '非难，指责' } } } },
  { title: '惩戒', arg: '惩戒', subtitle: 'Iciba dictionary' },
  { title: 'Show full entry', arg: '# WordPing entry: rebuke' },
], 'iciba');
assert(compact.length === 1 && compact[0].title === '非难，指责；惩戒'
  && compact[0].subtitle === ''
  && compact[0].arg === compact[0].title && compact[0].text.copy === compact[0].title
  && compact[0].text.largetype === compact[0].title
  && compact[0].mods.ctrl.variables.wordping_choice === compact[0].title
  && compact[0].quicklookurl?.endsWith('w=rebuke'),
  'a provider should show all meanings in one main line and copy or save what it displays');

const consent = oneItemPerProvider([
  { title: '同意', arg: '同意', subtitle: 'Youdao · consent',
    text: { copy: '同意' }, mods: { ctrl: { variables: { wordping_choice: '同意' } } } },
  ...['许可，允许', '同意，赞同', '正式批准文件，批文', '赞同，准许，同意',
    '【名】 （Consent）（美、法、荷）孔桑（人名）'].map((title, index) => ({ title,
      variables: { wordping_pos: index < 3 ? 'n.' : 'v.' } })),
], 'youdao')[0];
assert(consent.subtitle.startsWith('⌘L to read full translation · v. 赞同，准许，同意')
  && !consent.subtitle.includes('consent') && !consent.subtitle.includes('meanings')
  && consent.title.startsWith('n. 许可，允许 / 同意，赞同')
  && consent.arg.includes('v. 赞同，准许，同意')
  && consent.arg.includes('孔桑') && consent.text.copy === consent.arg
  && consent.text.largetype === consent.arg
  && consent.mods.ctrl.variables.wordping_choice === consent.arg,
  'Youdao should group matching parts of speech and show overflow without repeated metadata');

const longTranslation = 'This is a longer translation that should remain readable even when Alfred cannot fit the entire sentence into a single result line. It continues with enough context to require a wrapped view.';
const longRows = oneItemPerProvider([{
  title: longTranslation, subtitle: 'Apple · en → fr', arg: longTranslation,
  text: { copy: longTranslation },
}], 'apple');
assert(longRows.length === 1 && longRows[0].title.endsWith('…')
  && longRows[0].subtitle.includes('⌘L to read full translation')
  && longRows[0].arg === longTranslation && longRows[0].text.copy === longTranslation
  && longRows[0].text.largetype === longTranslation,
  'long translations should stay in one row with a Large Type hint and complete copy text');

const calls: string[] = [];
const updates: string[][] = [];
let finishYoudao: (items: any[]) => void = () => {};
let finishIciba: (items: any[]) => void = () => {};
let finishWiki: (items: any[]) => void = () => {};
const result = lookupAll('bank', 'zh-CHS', 'zh-CHS', 'en', '',
  providerOrder('youdao,iciba,wiktionary,baidu').filter((name) => name !== 'baidu'), async (state) => {
    updates.push(state.items.map((item) => item.title));
  }, {
    youdao: () => { calls.push('youdao'); return new Promise((resolve) => { finishYoudao = resolve; }); },
    iciba: (from, to) => { calls.push(`iciba:${from}>${to}`); return new Promise((resolve) => { finishIciba = resolve; }); },
    wiktionary: () => { calls.push('wiktionary'); return new Promise((resolve) => { finishWiki = resolve; }); },
  });
finishWiki([{ title: 'Wiktionary result' }]);
await new Promise((resolve) => setTimeout(resolve, 0));
finishIciba([{ title: 'Iciba result' }, { title: 'Another meaning' }]);
await new Promise((resolve) => setTimeout(resolve, 0));
finishYoudao([{ title: 'Youdao result' }]);
const completed = await result;
assert(calls.join(',') === 'youdao,iciba:en>zh-CHS,wiktionary',
  'all configured providers should start');
assert(completed.items.map((item) => item.title).join(',')
  === 'Wiktionary result,Iciba result; Another meaning,Youdao result'
  && completed.completed === completed.expected && updates.length === 3,
  'all provider results should remain in response order');
assert(completed.providerStatus?.length === 3
  && completed.providerStatus.every((status) => status.outcome === 'result'),
  'progress should count providers with results separately from completed checks');
assert(completed.items.length === 3 && completed.items[1].title.includes('Another meaning'),
  'multiple meanings from one provider should be prominent in one row');

const reverse: string[] = [];
const reverseResult = await lookupAll('hello', 'en|fr', 'en', 'fr', '',
  providerOrder('iciba'), async () => {}, {
    iciba: async (from, to) => {
      reverse.push(`${from}>${to}`);
      return from === 'en' ? [{ title: 'bonjour' }] : [];
    },
  });
assert(reverse.join(',') === 'fr>en,en>fr' && reverseResult.items[0].title === 'bonjour',
  'ambiguous Latin words should try the other configured direction before moving on');

const forced: string[] = [];
await lookupAll('trabajo', 'manual:es>zh-CHS', 'en', 'fr', '',
  providerOrder('mymemory'), async () => {}, {
    mymemory: async (from, to) => { forced.push(`${from}>${to}`); return []; },
  }, { from: 'es', to: 'zh-CHS' });
assert(forced.join(',') === 'es>zh-CHS', 'manual direction should never retry the reverse pair');

const appleResult = await lookupAll('hello', 'zh-CHS', 'zh-CHS', 'en', '',
  providerOrder('apple'), async () => {}, {
    apple: async (from, to) => [{ title: '你好', subtitle: `Apple Translation · ${from} → ${to}`,
      arg: '你好', variables: { wordping_source: 'Apple Translation' } }],
  });
assert(appleResult.items.length === 1 && appleResult.items[0].title === '你好'
  && appleResult.items[0].subtitle === 'en→zh'
  && appleResult.providerStatus?.[0]?.outcome === 'result',
  'Apple should provide a direct Alfred result alongside dictionary providers');

console.log('Ordered provider tests passed');
