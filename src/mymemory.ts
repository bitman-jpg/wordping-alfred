import { Result } from './workflow/workflow';

interface MemoryMatch {
  segment?: string;
  translation?: string;
}

interface MemoryResponse {
  responseStatus?: number;
  responseData?: { translatedText?: string };
  matches?: MemoryMatch[];
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    }[entity] || entity))
    .trim();
}

export function memoryResults(data: MemoryResponse, word: string, from: string, to: string): Result[] {
  if (data.responseStatus !== 200) return [];
  const url = `https://dict.youdao.com/w/${encodeURIComponent(word)}/`;
  const results: Result[] = [];
  const seen = new Set<string>();
  const add = (value?: string) => {
    const title = plainText(value || '');
    if (!title || title.toLocaleLowerCase() === word.toLocaleLowerCase() || seen.has(title.toLocaleLowerCase())) return;
    seen.add(title.toLocaleLowerCase());
    results.push({ title, subtitle: `MyMemory fallback · ${from} → ${to}`, arg: title,
      pronounce: word, quicklookurl: url });
  };
  const exact = (data.matches || []).filter((match) => plainText(match.segment || '') === word);
  const caseVariant = (data.matches || []).filter((match) =>
    plainText(match.segment || '').toLocaleLowerCase() === word.toLocaleLowerCase()
    && plainText(match.segment || '') !== word);
  for (const match of [...exact, ...caseVariant]) add(match.translation);
  add(data.responseData?.translatedText);
  return results;
}

export async function lookupMyMemory(word: string, from: string, to: string): Promise<Result[]> {
  if (new TextEncoder().encode(word).length > 500) return [];
  const url = new URL('https://api.mymemory.translated.net/get');
  url.search = new URLSearchParams({ q: word, langpair: `${from}|${to}` }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return [];
    return memoryResults(await response.json(), word, from, to);
  } finally {
    clearTimeout(timeout);
  }
}
