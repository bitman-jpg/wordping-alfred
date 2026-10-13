import { Adapter } from "./adapters/adapter";
import Adapters from "./adapters";
import redaxios from './libs/redaxios'
import Workflow from './workflow/workflow'
import { Result } from './adapters/adapter';

interface ITranslator {
  adapter: Adapter;
  translate: (word: string) => Promise<any>;
}

export function normalizeInput(query: string): string {
  return query.trim();
}

export function dictionaryResults(data: any, query: string): Result[] {
  const entries = data?.web_trans?.['web-translation'];
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const exact = entries.find((entry: any) =>
    String(entry?.key || '').toLocaleLowerCase() === query.toLocaleLowerCase()
  ) || entries[0];
  const translations = Array.isArray(exact?.trans) ? exact.trans : [];
  return translations
    .map((translation: any) => String(translation?.value || '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((translation: string) => ({
      title: translation,
      subtitle: String(exact.key || query),
      arg: translation,
      pronounce: query,
      quicklookurl: `https://www.youdao.com/w/${encodeURIComponent(query)}`,
    }));
}

export function detectedSource(value: unknown): string {
  return typeof value === 'string' ? value.split('2')[0].trim().toLowerCase() : '';
}

export function isEchoedResult(results: Result[], query: string): boolean {
  return results.length > 0
    && results[0].title.trim().toLocaleLowerCase() === query.toLocaleLowerCase();
}

class Translator implements ITranslator{

  adapter: Adapter;

  constructor(
    key: string,
    secret: string,
    platform: string,
    private nativeLanguage: string = 'zh-CHS',
    private learningLanguage: string = 'en',
  ) {
    this.adapter = new Adapters[platform](key, secret);
  }

  public async translate(query: string): Promise<any> {
    // Preserve the user's spelling. Youdao handles case and word boundaries itself.
    const word = normalizeInput(query);
    const firstResponse = await redaxios.create().get(this.adapter.url(word, this.nativeLanguage));
    const source = detectedSource(firstResponse.data?.l);
    const first = this.adapter.parse(firstResponse.data);
    if (firstResponse.data?.errorCode !== '0') {
      return new Workflow().compose(first, word).output();
    }

    if (source === this.nativeLanguage.toLowerCase()) {
      const reverseResponse = await redaxios.create().get(this.adapter.url(word, this.learningLanguage));
      return new Workflow().compose(this.adapter.parse(reverseResponse.data), word).output();
    }

    if (!source || isEchoedResult(first, word)) {
      const reverseResponse = await redaxios.create().get(this.adapter.url(word, this.learningLanguage));
      const reverse = this.adapter.parse(reverseResponse.data);
      if (reverseResponse.data?.errorCode !== '0') {
        const fallback = await this.dictionaryFallback(first, word);
        return fallback || new Workflow().compose(first, word).output();
      }
      const firstUseful = !isEchoedResult(first, word);
      const reverseUseful = !isEchoedResult(reverse, word);
      if (firstUseful && reverseUseful && !source) {
        const labeled = [
          ...first.map((result) => ({ ...result, subtitle: `${this.nativeLanguage} · ${result.subtitle}` })),
          ...reverse.map((result) => ({ ...result, subtitle: `${this.learningLanguage} · ${result.subtitle}` })),
        ];
        return new Workflow().compose(labeled, word).output();
      }
      if (!firstUseful && reverseUseful) return new Workflow().compose(reverse, word).output();
    }

    const fallback = await this.dictionaryFallback(first, word);
    return fallback || new Workflow().compose(first, word).output();
  }

  private async dictionaryFallback(results: Result[], word: string): Promise<string | undefined> {
    if (!isEchoedResult(results, word) || this.nativeLanguage !== 'zh-CHS') return undefined;

    const dictionaryUrl = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`;
    try {
      const dictionaryResponse = await redaxios.create().get(dictionaryUrl);
      const fallback = dictionaryResults(dictionaryResponse.data, word);
      return fallback.length > 0 ? new Workflow().compose(fallback, word).output() : undefined;
    } catch {
      return undefined;
    }
  }
}

export default Translator;
