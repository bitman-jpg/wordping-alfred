declare var tjs: any;

export interface CacheEntry {
  query: string;
  language: string;
  output: string;
  updatedAt: number;
  legacy?: boolean;
}

interface CacheFile {
  version: 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;
  entries: CacheEntry[];
}

export function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function isEchoedTranslation(query: string, language: string, output: string): boolean {
  if (!language) return false;
  try {
    const items = JSON.parse(output).items;
    return Array.isArray(items) && items.length > 0
      && String(items[0]?.title || '').trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase();
  } catch {
    return false;
  }
}

export function limitEntries(entries: CacheEntry[], maximum: number): CacheEntry[] {
  return entries
    .filter((entry) => entry && entry.query && entry.language && entry.output)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, maximum));
}

export default class TranslationCache {
  constructor(private path: string, private maximum: number = 100) {}

  async get(query: string, language: string, allowLegacy = false): Promise<string | undefined> {
    const entries = await this.read();
    const key = normalizeQuery(query);
    const entry = entries.find((candidate) =>
      normalizeQuery(candidate.query) === key && candidate.language === language
    );
    if (!entry) return undefined;
    if (entry.legacy && !allowLegacy) return undefined;

    entry.updatedAt = Date.now();
    await this.write(entries);
    return entry.output;
  }

  async put(query: string, language: string, output: string): Promise<void> {
    const entries = await this.read();
    const key = normalizeQuery(query);
    const remaining = entries.filter((entry) =>
      normalizeQuery(entry.query) !== key || entry.language !== language
    );
    remaining.unshift({ query: query.trim(), language, output, updatedAt: Date.now() });
    await this.write(remaining);
  }

  async recent(language: string, includeManual = false): Promise<CacheEntry[]> {
    return (await this.read()).filter((entry) =>
      (entry.language === language || includeManual && entry.language.startsWith('manual:'))
      && !/^[^\s>]+>$/.test(entry.query.trim()));
  }

  async clear(): Promise<void> {
    try {
      await tjs.remove(this.path);
    } catch {
      // Clearing an empty cache is successful.
    }
  }

  private async read(): Promise<CacheEntry[]> {
    try {
      const bytes = await tjs.readFile(this.path);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as CacheFile;
      // Routing changed to use native and learning languages; old results may point the wrong way.
      if (![4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].includes(parsed.version) || !Array.isArray(parsed.entries)) return [];
      return limitEntries(parsed.version !== 21
        ? parsed.entries.map((entry) => ({ ...entry, legacy: true })) : parsed.entries, this.maximum);
    } catch {
      return [];
    }
  }

  private async write(entries: CacheEntry[]): Promise<void> {
    try {
      const slash = this.path.lastIndexOf('/');
      if (slash > 0) await tjs.makeDir(this.path.slice(0, slash), { recursive: true });
      const data: CacheFile = { version: 21, entries: limitEntries(entries, this.maximum) };
      await tjs.writeFile(this.path, JSON.stringify(data));
    } catch {
      // Cache failures must never prevent a lookup.
    }
  }
}
