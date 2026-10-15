import TranslationCache, { limitEntries, normalizeQuery, CacheEntry, isEchoedTranslation } from '../src/cache';
import Workflow from '../src/workflow/workflow';
import Vocabulary from '../src/vocabulary';
import { normalizeInput } from '../src/translator';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(normalizeQuery('  Hello  ') === 'hello', 'queries should be trimmed and case-insensitive');
assert(normalizeInput('  NASA  ') === 'NASA', 'translation input should preserve uppercase acronyms');
assert(normalizeInput('iPhone') === 'iPhone', 'translation input should preserve camel case');
assert(isEchoedTranslation('nasa', 'zh-CHS', '{"items":[{"title":"NASA"}]}'), 'echoed Chinese translations should bypass cache');
assert(isEchoedTranslation('nasa', 'zh-CHS', '{"items":[{"title":"NASA"},{"title":"secondary definition"}]}'), 'an echoed primary translation should bypass cache even with secondary results');
assert(!isEchoedTranslation('nasa', 'zh-CHS', '{"items":[{"title":"美国国家航空航天局"}]}'), 'real Chinese translations should remain cached');

const entries: CacheEntry[] = [
  { query: 'old', language: 'en', output: '{}', updatedAt: 1 },
  { query: 'new', language: 'en', output: '{}', updatedAt: 3 },
  { query: 'middle', language: 'en', output: '{}', updatedAt: 2 },
];
const limited = limitEntries(entries, 2);
assert(limited.length === 2, 'history should respect its configured limit');
assert(limited[0].query === 'new' && limited[1].query === 'middle', 'history should be newest first');

const directory = await tjs.makeTempDir('/tmp/wordping-tests-XXXXXX');
const cache = new TranslationCache(`${directory}/nested/translations.json`, 2);
await cache.put('Hello', 'zh-CHS', '{"items":[{"title":"你好"}]}');
assert(await cache.get(' hello ', 'zh-CHS') !== undefined, 'cache lookup should ignore case and whitespace');
assert((await cache.recent('zh-CHS'))[0].query === 'Hello', 'cached lookup should appear in history');
assert((await cache.recent('fr')).length === 0, 'history should be separated by target language');
await cache.clear();
assert((await cache.recent('zh-CHS')).length === 0, 'clear should remove all cached lookups');
await tjs.remove(directory, { recursive: true });

const vocabularyDirectory = await tjs.makeTempDir('/tmp/wordping-vocabulary-tests-XXXXXX');
const vocabulary = new Vocabulary(`${vocabularyDirectory}/vocabulary.json`);
await vocabulary.save('NASA', 'zh-CHS', '{"items":[{"title":"美国国家航空航天局"}]}');
assert((await vocabulary.list('zh-CHS'))[0].query === 'NASA', 'saved vocabulary should preserve query spelling');
await vocabulary.remove('nasa', 'zh-CHS');
assert((await vocabulary.list('zh-CHS')).length === 0, 'marking a word learned should remove it case-insensitively');
await tjs.remove(vocabularyDirectory, { recursive: true });

const workflow = JSON.parse(new Workflow().compose([{
  title: '你好',
  subtitle: 'hello',
  arg: '你好',
  pronounce: 'hello',
}], 'hello').output());
assert(workflow.items[0].mods.cmd.icon.path === 'assets/translate-say.png', 'Command should show the pronunciation icon');
assert(workflow.items[0].mods.alt.icon.path === 'assets/translate-say.png', 'Option should show the pronunciation icon');
assert(workflow.items[0].icon.path === 'assets/translate.png', 'Normal results should always show the translation icon');
assert(workflow.items[0].mods.ctrl.arg === '~save:hello', 'Control should save the source query');
assert(workflow.items[0].mods.ctrl.variables.wordping_command === '~save:hello', 'Control should pass its command through an Alfred variable');

console.log('Cache tests passed');
