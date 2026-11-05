import { Result } from './workflow/workflow';

// Text lookup is public API. Dictionary enumeration/name symbols are optional
// system interfaces; an unavailable symbol yields no result.
const coreFoundation = '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation';
const dictionaryServices = '/System/Library/Frameworks/CoreServices.framework/Frameworks/DictionaryServices.framework/DictionaryServices';

export function oxfordDictionaryNames(from: string, to: string): string[] {
  const bilingual = from === 'en' && to.startsWith('zh') || from.startsWith('zh') && to === 'en';
  return [
    ...(bilingual ? ['牛津英汉汉英词典', '牛津英漢漢英詞典'] : []),
    ...(from === 'en' ? ['Oxford Dictionary of English', 'New Oxford American Dictionary'] : []),
  ];
}

function result(title: string, word: string, source: string, from: string, to: string,
  partOfSpeech = '', phonetics = ''): Result {
  return { title, arg: title, pronounce: word, source, partOfSpeech, phonetics,
    subtitle: `${source} · ${from} → ${to}` };
}

function header(value: string): { body: string; phonetics: string } {
  const parts = value.split(/\s*\|\s*/, 3);
  return parts.length === 3 ? { phonetics: parts[1].trim(), body: parts[2].trim() }
    : { phonetics: '', body: value.trim() };
}

function uniqueResults(results: Result[], maximum = 12): Result[] {
  const unique: Result[] = [];
  for (const item of results) {
    item.title = item.title.replace(/\s+/g, ' ').trim().replace(/[;；,，]+$/, '');
    item.arg = item.title;
    if (item.title && !unique.some((candidate) => candidate.title.toLocaleLowerCase()
      === item.title.toLocaleLowerCase())) unique.push(item);
    if (unique.length >= maximum) break;
  }
  return unique;
}

function bilingualEnglish(value: string, word: string, source: string, from: string, to: string): Result[] {
  const { body, phonetics } = header(value);
  const lexicalBody = body.split(/\sPHRASAL VERBS\b/, 1)[0];
  const sections = [...lexicalBody.matchAll(/(?:^|\s)(?:[A-Z]\.\s*)?(transitive verb|intransitive verb|verb|noun|adjective|adverb)(?=\s)/gi)];
  const results: Result[] = [];
  for (let index = 0; index < sections.length; index++) {
    const part = sections[index][1];
    const start = sections[index].index! + sections[index][0].length;
    const end = sections[index + 1]?.index ?? lexicalBody.length;
    const section = lexicalBody.slice(start, end);
    const split = section.split(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/);
    let sectionAdded = 0;
    senseLoop: for (const sense of split.length > 1 ? split.slice(1) : split) {
      const head = sense.split('▸', 1)[0]
        .replace(/[\[［][^\]］]*[\]］]/g, ' ').replace(/（[^）]*）/g, ' ');
      const translations = head.match(/[\u3400-\u9fff]+(?:…[\u3400-\u9fff]+)*/g) || [];
      for (const title of translations) {
        results.push(result(title, word, source, from, to, part, phonetics));
        if (++sectionAdded >= 4) break senseLoop;
      }
    }
  }
  return uniqueResults(results, 20);
}

function bilingualChinese(value: string, word: string, source: string, from: string, to: string): Result[] {
  const sections = [...value.matchAll(/(?:^|\s)(?:[A-Z]\.\s*)?(verb|noun|adjective|adverb)(?=\s)/gi)];
  const phonetics = sections.length
    ? value.slice(word.length, sections[0].index).trim().replace(/[A-Z]\.\s*$/i, '').trim() : '';
  const results: Result[] = [];
  for (let index = 0; index < sections.length; index++) {
    const part = sections[index][1];
    const start = sections[index].index! + sections[index][0].length;
    const end = sections[index + 1]?.index ?? value.length;
    const section = value.slice(start, end);
    const senses = section.split(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/);
    for (const sense of senses) {
      const title = sense.split('▸', 1)[0].split('→', 1)[0]
        .replace(/^[\s（(［\[].*?[）)］\]]\s*/, '').trim();
      if (/[A-Za-z]/.test(title)) results.push(result(title, word, source, from, to, part, phonetics));
    }
  }
  return uniqueResults(results);
}

function monolingualEnglish(value: string, word: string, source: string, from: string, to: string): Result[] {
  const { body, phonetics } = header(value);
  const sections = [...body.matchAll(/(?:^|[.•]\s+|\)\s+)(exclamation|noun|verb|adjective|adverb|preposition|conjunction|pronoun)(?=\s)/gi)];
  const results: Result[] = [];
  for (let index = 0; index < sections.length; index++) {
    const part = sections[index][1];
    const start = sections[index].index! + sections[index][0].length;
    const end = sections[index + 1]?.index ?? body.search(/\sORIGIN\b/);
    const section = body.slice(start, end < start ? body.length : end);
    for (const sense of section.split(/\s•\s/)) {
      const title = sense.replace(/^\s*(?:\([^)]*\)|\[[^\]]*\])\s*/g, '').split(':', 1)[0].trim();
      if (title) results.push(result(title.slice(0, 180), word, source, from, to, part, phonetics));
    }
  }
  return uniqueResults(results, 8);
}

export function oxfordResults(
  meaning: string, word: string, source: string, from: string, to: string,
): Result[] {
  if (from.startsWith('zh') && to === 'en') return bilingualChinese(meaning, word, source, from, to);
  if (from === 'en' && to.startsWith('zh')) return bilingualEnglish(meaning, word, source, from, to);
  return monolingualEnglish(meaning, word, source, from, to);
}

function escapeHTML(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function oxfordPreviewHTML(
  meaning: string, word: string, source: string, from: string, to: string,
): string {
  const parsed = header(meaning);
  const article = parsed.body
    .replace(/\s+(PHRASAL VERBS)\s+/g, '\n\nPHRASAL VERBS\n')
    .replace(/\s+([A-Z]\.\s+(?:transitive verb|intransitive verb|verb|noun|adjective|adverb))\b/g,
      '\n\n$1\n')
    .replace(/\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/g, '\n\n$1 ')
    .replace(/\s*▸\s*/g, '\n  • ')
    .replace(/\s*→\s*/g, '\n\nSee also: ')
    .replace(/\n{3,}/g, '\n\n').trim();
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
:root{color-scheme:dark;--ink:#fff;--muted:#b8dce8;--rule:rgba(127,218,239,.42)}
*{box-sizing:border-box}
body{min-height:100vh;margin:0;color:var(--ink);font:17px/1.7 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;
background:#001a4d;
background-image:radial-gradient(ellipse at 63% 18%,rgba(0,174,213,.78) 0,rgba(0,94,150,.62) 29%,transparent 58%),radial-gradient(ellipse at -8% 48%,#006ea2 0,#003d79 37%,transparent 61%),linear-gradient(155deg,#00113f 0%,#002c67 50%,#007ca7 82%,#6cbf36 82.4%,#3ca83d 86%,#ed3131 86.4%,#b81224 100%)}
body:before{content:"";position:fixed;inset:-18vh 43% 40vh -26%;border-radius:50%;background:rgba(0,7,57,.8);transform:rotate(25deg);filter:blur(2px);pointer-events:none}
main{position:relative;z-index:1;width:min(1050px,calc(100% - 48px));margin:0 auto;padding:48px 0 108px}
.masthead{padding:0 10px 30px;border-bottom:1px solid var(--rule)}
.brand{margin-bottom:24px;color:#bdeaf2;font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase}
h1{max-width:900px;margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(48px,8vw,84px);font-weight:400;line-height:.96;letter-spacing:-.035em;text-shadow:0 3px 18px rgba(0,12,55,.3)}
.meta{margin-top:20px;color:var(--muted);font-size:14px;letter-spacing:.025em}
article{margin-top:34px;padding:36px 40px 42px;border:1px solid rgba(147,222,239,.32);border-radius:3px;background:linear-gradient(135deg,rgba(0,19,67,.76),rgba(0,62,104,.58));box-shadow:0 22px 60px rgba(0,9,43,.32);font-family:Georgia,"Songti SC","STSong",serif;font-size:18px;white-space:pre-wrap;overflow-wrap:anywhere;backdrop-filter:blur(12px)}
@media(max-width:650px){main{width:min(100% - 32px,1050px);padding:30px 0 82px}.masthead{padding:0 4px 24px}.brand{margin-bottom:18px}h1{font-size:48px}.meta{line-height:1.5}article{margin-top:24px;padding:25px 22px 30px;font-size:17px}}
@media(prefers-reduced-transparency:reduce){article{background:#003865;backdrop-filter:none}}
</style></head><body><main><header class="masthead"><div class="brand">Oxford Dictionary</div><h1>${escapeHTML(word)}</h1>
<div class="meta">${escapeHTML(source)} · ${escapeHTML(from)} → ${escapeHTML(to)}${parsed.phonetics ? ` · ${escapeHTML(parsed.phonetics)}` : ''}</div></header>
<article>${escapeHTML(article || meaning)}</article></main></body></html>`;
}

export async function lookupOxford(word: string, from: string, to: string): Promise<Result[]> {
  const names = oxfordDictionaryNames(from, to);
  if (!word || /[\s\0]/.test(word) || !names.length
    || (navigator as any).userAgentData?.platform !== 'macOS') return [];
  // Load the runtime's FFI module only when this optional provider is enabled.
  const moduleName = 'tjs:ffi';
  let cf: any;
  let ds: any;
  let collection: any;
  let query: any;
  let release: ((value: any) => void) | undefined;
  try {
    const ffi = await import(moduleName);
    const { Lib, CFunction, StructType, types } = ffi;
    cf = new Lib(coreFoundation);
    ds = new Lib(dictionaryServices);
    const bind = (lib: any, name: string, result: any, args: any[] = []) => {
      const fn = new CFunction(lib.symbol(name), result, args);
      return (...values: any[]) => fn.call(...values);
    };
    const pointer = types.pointer;
    const long = types.slong;
    const typeID = bind(cf, 'CFGetTypeID', types.ulong, [pointer]);
    const setTypeID = bind(cf, 'CFSetGetTypeID', types.ulong);
    const arrayTypeID = bind(cf, 'CFArrayGetTypeID', types.ulong);
    const free = bind(cf, 'CFRelease', types.void, [pointer]);
    release = (value) => { if (value) free(value); };
    const length = bind(cf, 'CFStringGetLength', long, [pointer]);
    const getCString = bind(cf, 'CFStringGetCString', types.uint8,
      [pointer, types.buffer, long, types.uint32]);
    const text = (value: any): string => {
      if (!value) return '';
      const bytes = new Uint8Array(Number(length(value)) * 4 + 1);
      if (!getCString(value, bytes, bytes.length, 0x08000100)) return '';
      return new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0)));
    };
    const available = bind(ds, 'DCSCopyAvailableDictionaries', pointer);
    const dictionaryName = bind(ds, 'DCSDictionaryGetName', pointer, [pointer]);
    const range = new StructType([['location', long], ['length', long]], 'CFRange');
    const definition = bind(ds, 'DCSCopyTextDefinition', pointer, [pointer, pointer, range]);
    const createString = bind(cf, 'CFStringCreateWithCString', pointer,
      [pointer, types.string, types.uint32]);
    collection = available();
    if (!collection) return [];
    const dictionaries = new Map<string, any>();
    // Check the actual collection type: treating a CFSet as a CFArray can abort
    // the process in Objective-C. macOS versions can return either type.
    const collectionType = typeID(collection);
    if (collectionType === setTypeID()) {
      const count = Number(bind(cf, 'CFSetGetCount', long, [pointer])(collection));
      const values = new Uint8Array(count * pointer.size);
      bind(cf, 'CFSetGetValues', types.void, [pointer, types.buffer])(collection, values);
      for (let i = 0; i < count; i++) {
        const value = pointer.fromBuffer(values.subarray(i * pointer.size, (i + 1) * pointer.size));
        dictionaries.set(text(dictionaryName(value)), value);
      }
    } else if (collectionType === arrayTypeID()) {
      const count = Number(bind(cf, 'CFArrayGetCount', long, [pointer])(collection));
      const get = bind(cf, 'CFArrayGetValueAtIndex', pointer, [pointer, long]);
      for (let i = 0; i < count; i++) {
        const value = get(collection, i);
        dictionaries.set(text(dictionaryName(value)), value);
      }
    } else return [];
    query = createString(null, word, 0x08000100);
    if (!query) return [];
    for (const name of names) {
      const dictionary = dictionaries.get(name);
      if (!dictionary) continue;
      // CFRange counts UTF-16 code units, just like JavaScript string.length.
      const value = definition(dictionary, query, { location: 0, length: word.length });
      try {
        const meaning = text(value).trim();
        if (meaning) {
          const actualTo = name.startsWith('牛津') ? to : 'en';
          const formatted = oxfordResults(meaning, word, name, from, actualTo);
          if (formatted.length) {
            formatted[0].previewHTML = oxfordPreviewHTML(meaning, word, name, from, actualTo);
            return formatted;
          }
        }
      } finally { release(value); }
    }
    return [];
  } catch { return []; }
  finally {
    release?.(query);
    release?.(collection);
    ds?.close();
    cf?.close();
  }
}
