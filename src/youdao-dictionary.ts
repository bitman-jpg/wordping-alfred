import { Result } from './workflow/workflow';

function exactHeadword(value: any, query: string): boolean {
  const headword = value?.['return-phrase']?.l?.i;
  return typeof headword === 'string' && headword.toLocaleLowerCase() === query.toLocaleLowerCase();
}

function result(query: string, translation: string, partOfSpeech = ''): Result {
  return {
    title: translation, subtitle: `Youdao dictionary · ${partOfSpeech || 'meaning'}`,
    arg: translation, pronounce: query, partOfSpeech, source: 'Youdao',
    quicklookurl: `https://www.youdao.com/w/${encodeURIComponent(query)}`,
  };
}

export function youdaoDictionaryResults(data: any, query: string, from: string, to: string): Result[] {
  if (!((from === 'en' && to.startsWith('zh')) || (from.startsWith('zh') && to === 'en'))) return [];
  const entries = from === 'en' ? data?.ec?.word : data?.ce?.word;
  const word = Array.isArray(entries) ? entries.find((entry) => exactHeadword(entry, query)) : undefined;
  if (!word) return [];
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(word.trs) ? word.trs : []) {
    for (const translation of Array.isArray(entry?.tr) ? entry.tr : []) {
      const values = translation?.l?.i;
      for (const value of Array.isArray(values) ? values : []) {
        const text = typeof value === 'string' ? value.trim() : String(value?.['#text'] || '').trim();
        if (!text) continue;
        const part = from === 'en' ? text.match(/^([a-z]{1,5}\.)\s*/i)?.[1] || '' : '';
        const meaning = part ? text.slice(part.length).trim() : text;
        const key = `${part}\0${meaning.toLocaleLowerCase()}`;
        if (!meaning || seen.has(key)) continue;
        seen.add(key);
        results.push(result(query, meaning, part));
      }
    }
  }
  return results.slice(0, 8);
}

export async function youdaoDictionary(query: string, from: string, to: string): Promise<Result[]> {
  if (/\s/.test(query) || !((from === 'en' && to.startsWith('zh'))
    || (from.startsWith('zh') && to === 'en'))) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(query)}`,
      { signal: controller.signal });
    if (!response.ok) return [];
    return youdaoDictionaryResults(await response.json(), query, from, to);
  } finally {
    clearTimeout(timeout);
  }
}
