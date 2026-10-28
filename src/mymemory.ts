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

const languageNames: Record<string, string> = {
  en: 'English', 'zh-CHS': 'Chinese (Simplified)', 'zh-CHT': 'Chinese (Traditional)',
  ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
  id: 'Indonesian', nl: 'Dutch', th: 'Thai', vi: 'Vietnamese',
};

function apiLanguage(code: string): string {
  return code === 'zh-CHS' ? 'zh-CN' : code === 'zh-CHT' ? 'zh-TW' : code;
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    }[entity] || entity))
    .trim();
}

export function memoryWordPage(word: string, from: string, to: string): string {
  const segment = (value: string) => encodeURIComponent(value.trim().replace(/\s+/g, '-'));
  return `https://mymemory.translated.net/en/${segment(languageNames[from] || from)}`
    + `/${segment(languageNames[to] || to)}/${segment(word)}`;
}

export function memoryResults(data: MemoryResponse, word: string, from: string, to: string): Result[] {
  if (data.responseStatus !== 200) return [];
  const seen = new Set<string>();
  const translations: string[] = [];
  const add = (value?: string) => {
    const translation = plainText(value || '');
    const key = translation.toLocaleLowerCase();
    if (translation && key !== word.toLocaleLowerCase() && !seen.has(key)) {
      seen.add(key);
      translations.push(translation);
    }
  };
  for (const match of data.matches || []) {
    if (plainText(match.segment || '').toLocaleLowerCase() === word.toLocaleLowerCase()) {
      add(match.translation);
    }
  }
  if (!translations.length) add(data.responseData?.translatedText);
  return translations.slice(0, 4).map((title) => ({
    title, subtitle: `MyMemory · ${from} → ${to}`, arg: title,
    pronounce: word, source: 'MyMemory', quicklookurl: memoryWordPage(word, from, to),
  }));
}

export async function lookupMyMemory(word: string, from: string, to: string): Promise<Result[]> {
  if (new TextEncoder().encode(word).length > 500) return [];
  const url = new URL('https://api.mymemory.translated.net/get');
  url.search = new URLSearchParams({ q: word,
    langpair: `${apiLanguage(from)}|${apiLanguage(to)}` }).toString();
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
