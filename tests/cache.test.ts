import TranslationCache, { limitEntries, normalizeQuery, CacheEntry } from '../src/cache';
import Workflow from '../src/workflow/workflow';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(normalizeQuery('  Hello  ') === 'hello', 'queries should be trimmed and case-insensitive');

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

const workflow = JSON.parse(new Workflow().compose([{
  title: '你好',
  subtitle: 'hello',
  arg: '你好',
  pronounce: 'hello',
}]).output());
assert(workflow.items[0].mods.cmd.icon.path === 'assets/translate-say.png', 'Command should show the pronunciation icon');
assert(workflow.items[0].mods.alt.icon.path === 'assets/translate-say.png', 'Option should show the pronunciation icon');
assert(workflow.items[0].icon.path === 'assets/translate.png', 'Normal results should always show the translation icon');

console.log('Cache tests passed');
