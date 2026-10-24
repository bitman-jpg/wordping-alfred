import KeylessYoudao, { WebTranslation } from './keyless-youdao';
import Workflow, { Result } from './workflow/workflow';
import { lookupMyMemory } from './mymemory';

export class YoudaoResponseError extends Error {
  constructor(public code: number) {
    super(`Youdao website could not translate this lookup (code ${code})`);
  }
}

export function normalizeInput(query: string): string {
  return query.trim();
}

function direction(response: WebTranslation): { source: string; target: string } | undefined {
  const pair = response.type?.split('2');
  return pair?.length === 2 ? { source: pair[0], target: pair[1] } : undefined;
}

function sameLanguage(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function sourceIsNative(source: string, native: string, learning: string): boolean {
  if (sameLanguage(source, native)) return true;
  if (sameLanguage(source, learning)) return false;
  return source.toLocaleLowerCase().startsWith('zh-')
    && native.toLocaleLowerCase().startsWith('zh-')
    && !learning.toLocaleLowerCase().startsWith('zh-');
}

export function lookupResults(data: WebTranslation, query: string): Result[] {
  if (data.code !== 0) throw new YoudaoResponseError(data.code);
  const translation = (data.translateResult || []).flat().map((item) => item.tgt || '').join('').trim();
  if (!translation) throw new Error('Youdao website returned no translation');
  const url = `https://www.youdao.com/w/${encodeURIComponent(query)}`;
  const results: Result[] = [];
  const seen = new Set<string>();
  const add = (title: string, subtitle: string) => {
    const clean = title.trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    results.push({ title: clean, subtitle, arg: clean, pronounce: query, quicklookurl: url });
  };
  add(translation, query);

  // Dictionary detail is normally included for English↔Chinese words. Keep
  // every distinct meaning as a selectable Alfred result when it is present.
  for (const entry of data.dictResult?.ec?.word?.trs || []) {
    for (const meaning of String(entry.tran || '').split(/[；;]\s*/)) {
      add(meaning, `${entry.pos || 'Meaning'} · ${query}`);
    }
  }
  for (const entry of data.dictResult?.ce?.word?.trs || []) {
    add(String(entry['#text'] || ''), `${query} · ${entry['#tran'] || 'Dictionary meaning'}`);
  }
  return results;
}

type Lookup = (word: string, from: string, to: string) => Promise<WebTranslation>;
type FallbackLookup = (word: string, from: string, to: string) => Promise<Result[]>;

function englishChinesePair(native: string, learning: string, word: string): { from: string; to: string } | undefined {
  const chinese = [native, learning].find((language) => language === 'zh-CHS' || language === 'zh-CHT');
  if (!chinese || (native !== 'en' && learning !== 'en')) return undefined;
  const from = /[\u3400-\u9fff]/.test(word) ? (chinese === 'zh-CHT' ? 'zh-TW' : 'zh-CN') : 'en';
  return { from, to: from === 'en' ? (chinese === 'zh-CHT' ? 'zh-TW' : 'zh-CN') : 'en' };
}

export default class Translator {
  private lookup: Lookup;

  constructor(
    private nativeLanguage: string = 'zh-CHS',
    private learningLanguage: string = 'en',
    sessionPath = '',
    lookup?: Lookup,
    private fallbackLookup: FallbackLookup = lookupMyMemory,
  ) {
    const provider = new KeylessYoudao(sessionPath);
    this.lookup = lookup || provider.lookup.bind(provider);
  }

  async translate(query: string): Promise<string> {
    const word = normalizeInput(query);
    try {
      const detected = await this.lookup(word, 'auto', this.nativeLanguage);
      const pair = detected.code === 0 ? direction(detected) : undefined;
      const source = pair?.source || this.learningLanguage;
      const target = sourceIsNative(source, this.nativeLanguage, this.learningLanguage)
        ? this.learningLanguage : this.nativeLanguage;
      let response = pair && sameLanguage(pair.target, target)
        ? detected : await this.lookup(word, source, target);
      const translated = (response.translateResult || []).flat().map((item) => item.tgt || '').join('').trim();
      if (response === detected && sameLanguage(translated, word)) {
        const explicit = await this.lookup(word, source, target);
        if (explicit.code === 0) response = explicit;
      }
      return new Workflow().compose(lookupResults(response, word), word).output();
    } catch (error) {
      if (!(error instanceof YoudaoResponseError) || error.code !== 50) throw error;
      const pair = englishChinesePair(this.nativeLanguage, this.learningLanguage, word);
      if (!pair) throw error;
      try {
        const results = await this.fallbackLookup(word, pair.from, pair.to);
        if (results.length) return new Workflow().compose(results, word).output();
      } catch { /* The dictionary page remains available if MyMemory fails. */ }
      throw error;
    }
  }
}
