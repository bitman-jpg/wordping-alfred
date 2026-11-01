import { CsvParser, parseCedictLine, lookupManagedDictionary, managedDictionaryStatus } from '../src/managed-dictionaries';
import { providerOrder, providersFor } from '../src/provider-order';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const parser = new CsvParser();
const rows = [
  ...parser.push('word,phonetic,definition,translation\r\nhello,həˈləʊ,"a greeting, or call","你'),
  ...parser.push('好\n问候"\r\nquo'),
  ...parser.push('te,,"say ""hello""",引用\r\n', true),
];
assert(rows.length === 3 && rows[1][2] === 'a greeting, or call' && rows[1][3] === '你好\n问候',
  'ECDICT CSV parser must preserve commas and newlines inside quoted fields');
assert(rows[2][2] === 'say "hello"', 'ECDICT CSV parser must decode escaped quotes across chunks');

const cedict = parseCedictLine('傳統 传统 [chuan2 tong3] /tradition/traditional/');
assert(cedict?.traditional === '傳統' && cedict.simplified === '传统'
  && cedict.pinyin === 'chuan2 tong3' && cedict.definitions === 'tradition/traditional',
  'CC-CEDICT rows must preserve both scripts, pinyin, and definitions');
assert(parseCedictLine('# comment') === undefined && parseCedictLine('broken') === undefined,
  'comments and malformed CC-CEDICT rows must be ignored');

assert(providerOrder('ecdict,cc-cedict,cedict,youdao').join(',') === 'ecdict,cedict,youdao',
  'downloadable providers can be enabled by their documented names');
assert(providerOrder('youdao,iciba,baidu,wiktionary,mymemory,langdao,oxford,apple').join(',')
  === 'oxford,ecdict,cedict,apple,youdao,iciba,baidu,wiktionary,mymemory',
  'upgrades must add the new downloadable providers to the previous default');
assert(providersFor('two words', providerOrder('ecdict,cedict,youdao')).join(',') === 'youdao',
  'downloadable dictionaries only receive single words');

const directory = await tjs.makeTempDir('/tmp/wordping-managed-dictionaries-XXXXXX');
tjs.env.alfred_workflow_data = directory;
await tjs.makeDir(`${directory}/dictionaries`, { recursive: true });
const { Database } = await import('tjs:sqlite');
const ecdictDb = new Database(`${directory}/dictionaries/ecdict.sqlite`);
ecdictDb.exec('CREATE TABLE entries (word TEXT COLLATE NOCASE PRIMARY KEY, phonetic TEXT, definition TEXT, translation TEXT, pos TEXT, exchange TEXT)');
ecdictDb.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?)').run('hello', 'həˈləʊ', 'a greeting', '你好\\n问候', 'int.', '');
ecdictDb.close();
const cedictDb = new Database(`${directory}/dictionaries/cedict.sqlite`);
cedictDb.exec('CREATE TABLE entries (traditional TEXT, simplified TEXT, pinyin TEXT, definitions TEXT)');
cedictDb.prepare('INSERT INTO entries VALUES (?, ?, ?, ?)').run('傳統', '传统', 'chuan2 tong3', 'tradition/traditional');
cedictDb.close();

try {
  const english = await lookupManagedDictionary('ecdict', 'HELLO', 'en', 'zh-CHS');
  assert(english.length === 2 && english[0].title === '你好' && english[0].phonetics === 'həˈləʊ',
    'ECDICT lookup must be case-insensitive and split translations');
  assert(!(await lookupManagedDictionary('ecdict', 'hello', 'zh-CHS', 'en')).length,
    'ECDICT must reject the unsupported direction');
  const chinese = await lookupManagedDictionary('cedict', '传统', 'zh-CHS', 'en');
  assert(chinese.length === 2 && chinese[0].title === 'tradition' && chinese[0].phonetics === 'chuan2 tong3',
    'CC-CEDICT must match simplified headwords and split definitions');
  assert(!(await lookupManagedDictionary('cedict', 'two words', 'zh-CHS', 'en')).length,
    'managed dictionaries must reject phrases');
  assert(Object.keys(await managedDictionaryStatus()).length === 0,
    'database files without completed state must not claim an installed version');
} finally { await tjs.remove(directory, { recursive: true }); }

console.log('Managed dictionary tests passed');
