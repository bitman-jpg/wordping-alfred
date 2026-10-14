import { normalizeQuery } from './cache';
import { VocabularyEntry } from './vocabulary';

declare var tjs: any;

export interface ReviewPrompt {
  query: string;
  retry: boolean;
}

export interface ReviewSessionState {
  version: 1;
  language: string;
  total: number;
  completed: number;
  missed: number;
  recovered: number;
  unresolved: number;
  pending: ReviewPrompt[];
  completedAt?: number;
}

export default class ReviewSession {
  constructor(private path: string) {}

  async load(language: string): Promise<ReviewSessionState | undefined> {
    try {
      const bytes = await tjs.readFile(this.path);
      const state = JSON.parse(new TextDecoder().decode(bytes)) as ReviewSessionState;
      if (state.version !== 1 || state.language !== language || !Array.isArray(state.pending)) return undefined;
      return state;
    } catch {
      return undefined;
    }
  }

  async start(language: string, due: VocabularyEntry[]): Promise<ReviewSessionState> {
    const pending = due.slice(0, 10).map((entry) => ({ query: entry.query, retry: false }));
    const state: ReviewSessionState = {
      version: 1, language, total: pending.length, completed: 0,
      missed: 0, recovered: 0, unresolved: 0, pending,
    };
    await this.write(state);
    return state;
  }

  async reconcile(state: ReviewSessionState, entries: VocabularyEntry[]): Promise<ReviewSessionState> {
    const saved = new Set(entries.map((entry) => normalizeQuery(entry.query)));
    const removed = state.pending.filter((prompt) => !saved.has(normalizeQuery(prompt.query)));
    const pending = state.pending.filter((prompt) => saved.has(normalizeQuery(prompt.query)));
    if (removed.length) {
      state.total -= removed.length;
      state.missed -= removed.filter((prompt) => prompt.retry).length;
      state.pending = pending;
      await this.write(state);
    }
    return state;
  }

  async grade(state: ReviewSessionState, query: string, remembered: boolean): Promise<boolean> {
    const prompt = state.pending[0];
    if (!prompt || normalizeQuery(prompt.query) !== normalizeQuery(query)) return false;
    state.pending.shift();
    if (remembered) {
      state.completed++;
      if (prompt.retry) state.recovered++;
    } else if (prompt.retry) {
      state.completed++;
      state.unresolved++;
    } else {
      state.missed++;
      state.pending.push({ query: prompt.query, retry: true });
    }
    if (state.pending.length === 0) state.completedAt = Date.now();
    await this.write(state);
    return true;
  }

  private async write(state: ReviewSessionState): Promise<void> {
    const slash = this.path.lastIndexOf('/');
    if (slash > 0) await tjs.makeDir(this.path.slice(0, slash), { recursive: true });
    await tjs.writeFile(this.path, JSON.stringify(state));
  }
}
