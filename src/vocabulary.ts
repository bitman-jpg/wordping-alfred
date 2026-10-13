import { normalizeQuery } from './cache';

declare var tjs: any;

export interface VocabularyEntry {
  query: string;
  language: string;
  output: string;
  savedAt: number;
}

interface VocabularyFile {
  version: 1;
  entries: VocabularyEntry[];
}

export default class Vocabulary {
  constructor(private path: string) {}

  async save(query: string, language: string, output: string): Promise<void> {
    const key = normalizeQuery(query);
    const entries = (await this.read()).filter((entry) =>
      normalizeQuery(entry.query) !== key || entry.language !== language
    );
    entries.unshift({ query: query.trim(), language, output, savedAt: Date.now() });
    await this.write(entries);
  }

  async remove(query: string, language: string): Promise<void> {
    const key = normalizeQuery(query);
    await this.write((await this.read()).filter((entry) =>
      normalizeQuery(entry.query) !== key || entry.language !== language
    ));
  }

  async list(language: string): Promise<VocabularyEntry[]> {
    return (await this.read())
      .filter((entry) => entry.language === language)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  private async read(): Promise<VocabularyEntry[]> {
    try {
      const bytes = await tjs.readFile(this.path);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as VocabularyFile;
      return parsed.version === 1 && Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  }

  private async write(entries: VocabularyEntry[]): Promise<void> {
    const slash = this.path.lastIndexOf('/');
    if (slash > 0) await tjs.makeDir(this.path.slice(0, slash), { recursive: true });
    const data: VocabularyFile = { version: 1, entries };
    await tjs.writeFile(this.path, JSON.stringify(data));
  }
}
