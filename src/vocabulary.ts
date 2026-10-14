import { normalizeQuery } from './cache';

declare var tjs: any;

export interface VocabularyEntry {
  query: string;
  language: string;
  output: string;
  savedAt: number;
  reviewStep?: number;
  dueAt?: number;
  lastReviewedAt?: number;
}

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_DAYS = [1, 3, 7, 14, 30, 60];
const OLD_RETRY_DELAY = 10 * 60 * 1000;

function dueTime(entry: VocabularyEntry): number {
  // v0.6.2 postponed missed words by ten minutes. Treat those as due now.
  if (entry.reviewStep === 0 && entry.lastReviewedAt !== undefined
    && entry.dueAt === entry.lastReviewedAt + OLD_RETRY_DELAY) {
    return entry.lastReviewedAt;
  }
  return entry.dueAt ?? entry.savedAt;
}

function restoreResavedReview(entry: VocabularyEntry): VocabularyEntry {
  // Older versions kept a future review date when the user saved a word again.
  if (entry.lastReviewedAt !== undefined && entry.savedAt > entry.lastReviewedAt
    && entry.dueAt !== undefined && entry.dueAt > entry.savedAt) {
    return { ...entry, reviewStep: 0, dueAt: entry.savedAt, lastReviewedAt: undefined };
  }
  return entry;
}

export function isDue(entry: VocabularyEntry, now = Date.now()): boolean {
  return dueTime(entry) <= now;
}

export function nextReviewDays(entry: VocabularyEntry): number {
  return REVIEW_DAYS[Math.min(entry.reviewStep ?? 0, REVIEW_DAYS.length - 1)];
}

export function searchSavedEntries(entries: VocabularyEntry[], search: string): VocabularyEntry[] {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => {
    if (entry.query.toLocaleLowerCase().includes(needle)) return true;
    try {
      const items = JSON.parse(entry.output).items;
      return Array.isArray(items) && items.some((item: any) =>
        typeof item.title === 'string' && item.title.toLocaleLowerCase().includes(needle)
      );
    } catch {
      return false;
    }
  });
}

interface VocabularyFile {
  version: 1;
  entries: VocabularyEntry[];
}

interface VocabularyBackup extends VocabularyFile {
  format: 'wordping-vocabulary';
  exportedAt: string;
}

function validTimestamp(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validEntry(value: any): value is VocabularyEntry {
  return value && typeof value.query === 'string' && value.query.trim().length > 0
    && typeof value.language === 'string' && value.language.trim().length > 0
    && typeof value.output === 'string' && value.output.length > 0
    && validTimestamp(value.savedAt)
    && (value.reviewStep === undefined || (Number.isInteger(value.reviewStep) && value.reviewStep >= 0 && value.reviewStep <= REVIEW_DAYS.length))
    && (value.dueAt === undefined || validTimestamp(value.dueAt))
    && (value.lastReviewedAt === undefined || validTimestamp(value.lastReviewedAt));
}

export default class Vocabulary {
  constructor(private path: string) {}

  async backup(): Promise<string> {
    const data: VocabularyBackup = {
      format: 'wordping-vocabulary', version: 1,
      exportedAt: new Date().toISOString(), entries: await this.read(),
    };
    return JSON.stringify(data, null, 2) + '\n';
  }

  async restore(contents: string): Promise<{ added: number; kept: number }> {
    let parsed: any;
    try { parsed = JSON.parse(contents); } catch { throw new Error('Backup is not valid JSON'); }
    if (parsed?.format !== 'wordping-vocabulary' || parsed.version !== 1
      || !Array.isArray(parsed.entries) || !parsed.entries.every(validEntry)) {
      throw new Error('This is not a supported WordPing vocabulary backup');
    }
    const existing = await this.read();
    const seen = new Set(existing.map((entry) => `${entry.language}\0${normalizeQuery(entry.query)}`));
    let added = 0;
    let kept = 0;
    for (const entry of parsed.entries as VocabularyEntry[]) {
      const key = `${entry.language}\0${normalizeQuery(entry.query)}`;
      if (seen.has(key)) { kept++; continue; }
      seen.add(key);
      existing.push(entry);
      added++;
    }
    if (added) await this.write(existing);
    return { added, kept };
  }

  async save(query: string, language: string, output: string): Promise<void> {
    const key = normalizeQuery(query);
    const now = Date.now();
    const existing = await this.read();
    const entries = existing.filter((entry) =>
      normalizeQuery(entry.query) !== key || entry.language !== language
    );
    entries.unshift({
      query: query.trim(), language, output, savedAt: now,
      reviewStep: 0,
      dueAt: now,
    });
    await this.write(entries);
  }

  async due(language: string, now = Date.now()): Promise<VocabularyEntry[]> {
    return (await this.list(language))
      .filter((entry) => isDue(entry, now))
      .sort((a, b) => dueTime(a) - dueTime(b));
  }

  async nextDue(language: string, now = Date.now(), eligible: (entry: VocabularyEntry) => boolean = () => true): Promise<number | undefined> {
    let next: number | undefined;
    for (const entry of await this.list(language)) {
      if (!eligible(entry)) continue;
      const time = dueTime(entry);
      if (time > now && (next === undefined || time < next)) next = time;
    }
    return next;
  }

  async review(query: string, language: string, remembered: boolean, now = Date.now()): Promise<boolean> {
    const key = normalizeQuery(query);
    const entries = await this.read();
    const entry = entries.find((candidate) => normalizeQuery(candidate.query) === key && candidate.language === language);
    if (!entry) return false;
    const days = nextReviewDays(entry);
    const step = remembered ? Math.min((entry.reviewStep ?? 0) + 1, REVIEW_DAYS.length) : 0;
    entry.reviewStep = step;
    entry.lastReviewedAt = now;
    entry.dueAt = remembered ? now + days * DAY : now;
    await this.write(entries);
    return true;
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
      return parsed.version === 1 && Array.isArray(parsed.entries)
        ? parsed.entries.map(restoreResavedReview) : [];
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
