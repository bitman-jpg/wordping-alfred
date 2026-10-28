import Workflow, { Result } from './workflow/workflow';

declare var tjs: any;

function singleWord(word: string): boolean {
  return Boolean(word) && !/\s/.test(word);
}

function row(title: string, source: string, query: string, from: string, to: string,
  partOfSpeech = ''): Result {
  return {
    title, subtitle: `${source} · ${from} → ${to}`, arg: title,
    pronounce: query, source, partOfSpeech,
  };
}

function targetCode(language: string): string {
  return language.startsWith('zh') ? 'zh' : language;
}

export function wiktionaryResults(data: any, query: string, from: string, to: string): Result[] {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const target = targetCode(to);
  const translations: { value: string; partOfSpeech: string }[] = [];
  const definitions: { value: string; partOfSpeech: string }[] = [];
  for (const entry of entries) {
    const partOfSpeech = String(entry?.partOfSpeech || '').trim();
    for (const sense of Array.isArray(entry?.senses) ? entry.senses : []) {
      const definition = String(sense?.definition || '').trim();
      if (definition && !definitions.some((item) => item.value === definition
        && item.partOfSpeech === partOfSpeech) && definitions.length < 8) {
        definitions.push({ value: definition, partOfSpeech });
      }
      for (const translation of Array.isArray(sense?.translations) ? sense.translations : []) {
        let value = String(translation?.word || '').trim();
        if (target === 'zh' && value.includes(' /')) {
          const variants = value.split(/\s*\/\s*/);
          value = (to === 'zh-CHT' ? variants[0] : variants[variants.length - 1]).trim();
        }
        if (target === 'zh' && !/[\u3400-\u9fff]/.test(value)) continue;
        const languageCode = translation?.language?.code;
        const matchesTarget = target === 'zh' ? languageCode === 'zh' || languageCode === 'cmn'
          : languageCode === target;
        if (matchesTarget && value
          && !translations.some((item) => item.value === value && item.partOfSpeech === partOfSpeech)
          && translations.length < 4) {
          translations.push({ value, partOfSpeech });
        }
      }
    }
  }
  const results = translations.map((item) => row(item.value, 'Wiktionary via FreeDictionaryAPI.com',
    query, from, to, item.partOfSpeech));
  if (from.startsWith('zh') && to === 'en' && !results.length) {
    for (const definition of definitions.slice(0, 3)) results.push(row(definition.value,
      'Wiktionary via FreeDictionaryAPI.com', query, from, to, definition.partOfSpeech));
  }
  for (const result of results) result.quicklookurl = `https://en.wiktionary.org/wiki/${encodeURIComponent(query)}`;
  return results;
}

export async function wiktionaryDictionary(query: string, from: string, to: string): Promise<Result[]> {
  if (!singleWord(query)) return [];
  const url = `https://freedictionaryapi.com/api/v1/entries/${encodeURIComponent(targetCode(from))}/${encodeURIComponent(query)}?translations=true`;
  const process = tjs.spawn(['/usr/bin/curl', '--fail', '--silent', '--show-error',
    '--max-time', '7', url], { stdout: 'pipe', stderr: 'ignore' });
  const output = await process.stdout.text();
  const status = await process.wait();
  if (status.exit_status !== 0) return [];
  try { return wiktionaryResults(JSON.parse(output), query, from, to); }
  catch { return []; }
}

export function dictionaryItems(results: Result[], query: string): any[] {
  return JSON.parse(new Workflow().compose(results, query).output()).items;
}
