import { Result } from './workflow/workflow';

function wordPage(query: string): string {
  return `https://www.iciba.com/word?w=${encodeURIComponent(query)}`;
}

export function icibaDictionaryResults(html: string, query: string, from: string, to: string): Result[] {
  if (!((from === 'en' && to === 'zh-CHS') || (from.startsWith('zh') && to === 'en'))) return [];
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!match) return [];
  let info: any;
  try {
    info = JSON.parse(match[1])?.props?.pageProps?.initialReduxState?.word?.wordInfo?.baesInfo;
  } catch { return []; }
  if (String(info?.word_name || '').toLocaleLowerCase() !== query.toLocaleLowerCase()) return [];
  const rows: Result[] = [];
  for (const symbol of Array.isArray(info.symbols) ? info.symbols : []) {
    for (const part of Array.isArray(symbol.parts) ? symbol.parts : []) {
      for (const meaning of Array.isArray(part.means) ? part.means : []) {
        const title = String(meaning || '').trim();
        if (!title || rows.some((row) => row.title === title)) continue;
        const partOfSpeech = String(part.part || '').trim();
        rows.push({ title, subtitle: `Iciba dictionary · ${partOfSpeech} · ${from} → ${to}`,
          arg: title, pronounce: query, source: 'Iciba', partOfSpeech,
          quicklookurl: wordPage(query) });
        if (rows.length >= 8) return rows;
      }
    }
  }
  return rows;
}

export async function icibaDictionary(query: string, from: string, to: string): Promise<Result[]> {
  if (!((from === 'en' && to === 'zh-CHS') || (from.startsWith('zh') && to === 'en'))) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(wordPage(query), { signal: controller.signal });
    if (!response.ok) return [];
    return icibaDictionaryResults(await response.text(), query, from, to);
  } finally { clearTimeout(timeout); }
}
