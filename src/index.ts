declare var tjs: any;

import Translator from './translator';
import TranslationCache, { CacheEntry, isEchoedTranslation } from './cache';
import Vocabulary, { VocabularyEntry, nextReviewDays, searchSavedEntries } from './vocabulary';
import { parseLookupInput } from './query';
import ReviewSession, { ReviewSessionState } from './review-session';

interface WorkflowSettings {
  key: string;
  secret: string;
  nativeLanguage: string;
  learningLanguage: string;
  historyLimit: number;
}

async function readPlist(path: string): Promise<Record<string, any>> {
  const process = tjs.spawn(
    ['/usr/bin/plutil', '-convert', 'json', '-o', '-', path],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const output = await process.stdout.text();
  const status = await process.wait();
  if (status.exit_status !== 0) return {};

  try {
    return JSON.parse(output);
  } catch {
    return {};
  }
}

async function workflowSettings(): Promise<WorkflowSettings> {
  const environment = {
    key: tjs.env.key || '',
    secret: tjs.env.secret || '',
    nativeLanguage: tjs.env.nativeLanguage || '',
    learningLanguage: tjs.env.learningLanguage || '',
    historyLimit: Number.parseInt(tjs.env.historyLimit || '', 10),
  };
  if (environment.key && environment.secret) {
    return {
      ...environment,
      nativeLanguage: environment.nativeLanguage || 'zh-CHS',
      learningLanguage: environment.learningLanguage || 'en',
      historyLimit: Number.isFinite(environment.historyLimit) ? environment.historyLimit : 100,
    };
  }

  // Alfred injects workflow configuration into the environment when it runs
  // the workflow. For direct shell runs, read the user's saved configuration
  // from prefs.plist beside the built script.
  const preferencesPlist = decodeURIComponent(new URL('./prefs.plist', import.meta.url).pathname);
  const saved = await readPlist(preferencesPlist);

  // Keep supporting values embedded by older workflow versions.
  const workflowPlist = decodeURIComponent(new URL('./info.plist', import.meta.url).pathname);
  const workflow = await readPlist(workflowPlist);
  const legacy = workflow.variables || {};

  return {
    key: environment.key || saved.key || legacy.key || '',
    secret: environment.secret || saved.secret || legacy.secret || '',
    nativeLanguage: environment.nativeLanguage || saved.nativeLanguage || legacy.nativeLanguage || 'zh-CHS',
    learningLanguage: environment.learningLanguage || saved.learningLanguage || legacy.learningLanguage || 'en',
    historyLimit: environment.historyLimit || Number.parseInt(saved.historyLimit || legacy.historyLimit || '100', 10) || 100,
  };
}

function cachePath(): string {
  const directory = tjs.env.alfred_workflow_cache
    || `${tjs.homeDir}/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping`;
  return `${directory}/translations.json`;
}

function dataDirectory(): string {
  return tjs.env.alfred_workflow_data
    || `${tjs.homeDir}/Library/Application Support/Alfred/Workflow Data/com.bitman.wordping`;
}

function reviewSessionPath(language: string): string {
  return `${dataDirectory()}/review-session-${encodeURIComponent(language)}.json`;
}

function firstItem(output: string, search = ''): any {
  try {
    const items = JSON.parse(output).items || [];
    return (search && items.find((item: any) =>
      typeof item.title === 'string' && item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    )) || items[0] || {};
  } catch {
    return {};
  }
}

function removeModifier(query: string, returnTo: 'saved' | 'review'): any {
  const command = `~remove:${encodeURIComponent(query)}`;
  return {
    subtitle: 'Remove from saved words',
    arg: command,
    valid: true,
    variables: { wordping_command: command, wordping_return: returnTo },
  };
}

function savedOutput(entries: VocabularyEntry[], search = ''): string {
  const items: any[] = entries.map((entry) => {
    const first = firstItem(entry.output, search);
    return {
      title: entry.query,
      subtitle: `Saved translation: ${first.title || ''}`,
      arg: first.arg || first.title || entry.query,
      autocomplete: entry.query,
      valid: true,
      icon: first.icon || { path: 'assets/translate.png' },
      mods: { ...(first.mods || {}), ctrl: removeModifier(entry.query, 'saved') },
      quicklookurl: first.quicklookurl,
      text: first.text,
    };
  });
  if (entries.length === 0) items.push({
    title: search ? `No saved words matching “${search}”` : 'No saved words',
    subtitle: search ? 'Search a different word or translation' : 'Look up a word and press Control-Return to save it',
    valid: false,
  });
  if (!search && entries.length > 0) items.push(exportAction());
  return JSON.stringify({ items });
}

function exportAction(): any {
  return {
    title: 'Export saved words as CSV…',
    subtitle: 'Save a copy in Downloads for Anki, Quizlet, or a spreadsheet',
    arg: '~export',
    valid: true,
    icon: { path: 'assets/translate.png' },
  };
}

function clearAction(): any {
  return {
    title: 'Clear recent lookups…',
    subtitle: 'Press Return to delete WordPing’s local history',
    arg: '__wordping_clear__',
    valid: true,
    icon: { path: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/TrashIcon.icns' },
  };
}

function commandMenu(dueCount: number): string {
  return JSON.stringify({ items: [
    { title: 'Saved words', subtitle: 'Browse your saved vocabulary', autocomplete: ':saved', valid: false },
    { title: `Review saved words (${dueCount} due)`, subtitle: 'Practice words due now', autocomplete: ':review', valid: false },
    { title: 'Clear recent lookups', subtitle: 'Delete local lookup history', autocomplete: ':clear', valid: false },
    { title: 'Export saved words', subtitle: 'Save vocabulary as CSV in Downloads', autocomplete: ':export', valid: false },
  ] });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function reviewPromptOutput(entry: VocabularyEntry, state: ReviewSessionState): string {
  const retry = state.pending[0]?.retry;
  return JSON.stringify({ items: [{
    title: entry.query,
    subtitle: `${state.completed + 1} of ${state.total}${retry ? ' · Second try' : ''} · Press Return to reveal the translation`,
    autocomplete: `:review ${entry.query}`,
    valid: false,
    icon: firstItem(entry.output).icon || { path: 'assets/translate.png' },
    mods: { ctrl: removeModifier(entry.query, 'review') },
  }] });
}

function reviewSummary(state: ReviewSessionState, dueCount: number): string {
  const remembered = state.total - state.missed;
  return JSON.stringify({ items: [
    {
      title: `Session complete · ${state.total} ${state.total === 1 ? 'word' : 'words'}`,
      subtitle: `${remembered} recalled first try · ${state.recovered} recovered · ${state.unresolved} still due`,
      valid: false,
    },
    {
      title: dueCount ? `Start another session · ${dueCount} due` : 'All caught up',
      subtitle: dueCount ? 'Review up to 10 more words' : 'Your next review will appear when a word is due',
      autocomplete: dueCount ? ':review next' : undefined,
      valid: false,
    },
  ] });
}

function reviewReveal(entry?: VocabularyEntry, state?: ReviewSessionState): string {
  if (!entry) return JSON.stringify({ items: [{ title: 'Saved word not found', valid: false }] });
  const days = nextReviewDays(entry);
  const nextReview = `in ${days} ${days === 1 ? 'day' : 'days'}`;
  const parsed = JSON.parse(entry.output);
  parsed.items = (parsed.items || []).map((item: any) => ({
    ...item,
    subtitle: `${state ? `${state.completed + 1} of ${state.total} · ` : ''}${item.subtitle || ''}`,
    mods: {
      ...(item.mods || {}),
      ctrl: removeModifier(entry.query, 'review'),
    },
  }));
  const query = encodeURIComponent(entry.query);
  parsed.items.splice(1, 0,
    {
      title: `Got it · next review ${nextReview}`,
      subtitle: 'Recalled it; each success lengthens the interval',
      arg: `~remember:${query}`,
      valid: true,
      icon: { path: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ToolbarFavoritesIcon.icns' },
      mods: { ctrl: removeModifier(entry.query, 'review') },
    },
    {
      title: 'Missed it · keep in review',
      subtitle: 'Review again at the end of this session',
      arg: `~again:${query}`,
      valid: true,
      icon: { path: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/Sync.icns' },
      mods: { ctrl: removeModifier(entry.query, 'review') },
    },
  );
  return JSON.stringify(parsed);
}

function historyOutput(entries: CacheEntry[]): string {
  if (entries.length === 0) {
    return JSON.stringify({ items: [{
      title: 'No recent lookups',
      subtitle: 'Type a word or phrase after wp',
      valid: false,
    }] });
  }

  const items: any[] = entries.map((entry) => {
    let first: any = {};
    try {
      first = JSON.parse(entry.output).items?.[0] || {};
    } catch {
      // A malformed entry remains visible but cannot be actioned.
    }
    return {
      title: entry.query,
      subtitle: first.title ? `Recent translation: ${first.title}` : 'Recent lookup',
      arg: first.arg || first.title || '',
      autocomplete: entry.query,
      valid: Boolean(first.arg || first.title),
      icon: first.icon || { path: 'assets/translate.png' },
      mods: first.mods || {},
      quicklookurl: first.quicklookurl,
      text: first.text,
    };
  });
  items.push(clearAction());
  return JSON.stringify({ items });
}

async function main(): Promise<void> {
  try {
    const { key, secret, nativeLanguage, learningLanguage, historyLimit } = await workflowSettings();
    if (nativeLanguage === learningLanguage) throw new Error('Choose different native and learning languages in WordPing configuration');
    const languageScope = learningLanguage === 'en' ? nativeLanguage : `${nativeLanguage}|${learningLanguage}`;
    const cache = new TranslationCache(cachePath(), Math.min(500, Math.max(1, historyLimit)));
    const vocabulary = new Vocabulary(`${dataDirectory()}/vocabulary.json`);
    const reviewSession = new ReviewSession(reviewSessionPath(languageScope));
    const rawInput = tjs.args[3] || '';
    const { word, commandMode } = parseLookupInput(rawInput);
    const internalCommand = rawInput.trim().startsWith('~');

    if (internalCommand && word.startsWith('~save:')) {
      const query = decodeURIComponent(word.slice(6));
      const output = await cache.get(query, languageScope);
      if (!output) throw new Error('Look up the word again before saving it');
      await vocabulary.save(query, languageScope, output);
      console.log(`Saved “${query}” to vocabulary. Ready to review.`);
      return;
    }
    if (internalCommand && word.startsWith('~remove:')) {
      const query = decodeURIComponent(word.slice(8));
      await vocabulary.remove(query, languageScope);
      const session = await reviewSession.load(languageScope);
      if (session) await reviewSession.reconcile(session, await vocabulary.list(languageScope));
      console.log(`Removed “${query}” from saved words.`);
      return;
    }
    if (internalCommand && (word.startsWith('~remember:') || word.startsWith('~again:'))) {
      const remembered = word.startsWith('~remember:');
      const query = decodeURIComponent(word.slice(remembered ? 10 : 7));
      const session = await reviewSession.load(languageScope);
      if (!session || !session.pending[0] || session.pending[0].query.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
        throw new Error('Open the current word in wp :review before grading it');
      }
      if (!await vocabulary.review(query, languageScope, remembered)) throw new Error('Saved word not found');
      await reviewSession.grade(session, query, remembered);
      console.log(remembered ? `Remembered “${query}”. Scheduled for later review.` : `“${query}” stays due for review.`);
      return;
    }
    if (internalCommand && word === '~export') {
      const entries = await vocabulary.list(languageScope);
      const rows = ['Word,Translation,Saved At', ...entries.map((entry) => {
        const translation = firstItem(entry.output).title || '';
        return [entry.query, translation, new Date(entry.savedAt).toISOString()].map(csvCell).join(',');
      })];
      const path = `${tjs.homeDir}/Downloads/WordPing Vocabulary.csv`;
      await tjs.writeFile(path, rows.join('\n') + '\n');
      console.log(`Exported ${entries.length} saved word${entries.length === 1 ? '' : 's'} to Downloads.`);
      return;
    }
    if (commandMode) {
      const command = word.toLocaleLowerCase();
      if (!word) {
        console.log(commandMenu((await vocabulary.due(languageScope)).length));
        return;
      }
      if (command === 'saved') {
        console.log(savedOutput(await vocabulary.list(languageScope)));
        return;
      }
      if (command.startsWith('saved ')) {
        const search = word.slice(6).trim();
        console.log(savedOutput(searchSavedEntries(await vocabulary.list(languageScope), search), search));
        return;
      }
      if (command === 'review' || command === 'review next') {
        const fresh = command === 'review next';
        const due = await vocabulary.due(languageScope);
        let session = fresh ? undefined : await reviewSession.load(languageScope);
        const completedOnEarlierDay = session?.completedAt
          && new Date(session.completedAt).toDateString() !== new Date().toDateString();
        if (!session || (due.length > 0 && (session.total === 0 || completedOnEarlierDay))) {
          session = await reviewSession.start(languageScope, due);
        }
        session = await reviewSession.reconcile(session, await vocabulary.list(languageScope));
        if (session.pending.length) {
          const entry = (await vocabulary.list(languageScope)).find((candidate) =>
            candidate.query.toLocaleLowerCase() === session.pending[0].query.toLocaleLowerCase());
          if (entry) console.log(reviewPromptOutput(entry, session));
          else console.log(JSON.stringify({ items: [{ title: 'Saved word not found', valid: false }] }));
        } else if (session.total) {
          console.log(reviewSummary(session, due.length));
        } else {
          console.log(JSON.stringify({ items: [{ title: 'No words due', subtitle: 'Your next review will appear when a saved word is due', valid: false }] }));
        }
        return;
      }
      if (command === 'clear') {
        console.log(JSON.stringify({ items: [clearAction()] }));
        return;
      }
      if (command === 'export') {
        const entries = await vocabulary.list(languageScope);
        console.log(JSON.stringify({ items: entries.length ? [exportAction()] : [{ title: 'No saved words to export', valid: false }] }));
        return;
      }
      if (command.startsWith('review ')) {
        const query = word.slice(7).trim();
        const session = await reviewSession.load(languageScope);
        const entry = session?.pending[0]?.query.toLocaleLowerCase() === query.toLocaleLowerCase()
          ? (await vocabulary.list(languageScope)).find((candidate) => candidate.query.toLocaleLowerCase() === query.toLocaleLowerCase())
          : undefined;
        if (entry) {
          console.log(reviewReveal(entry, session));
          return;
        }
      }
      // Unrecognized commands are ordinary lookups without the leading colon.
    }

    if (!word) {
      console.log(historyOutput(await cache.recent(languageScope)));
      return;
    }
    if (!key || !secret) {
      throw new Error('Add your Youdao app key and secret in WordPing configuration');
    }

    const cached = await cache.get(word, languageScope);
    if (cached && !isEchoedTranslation(word, nativeLanguage, cached)) {
      console.log(cached);
      return;
    }

    const translator = new Translator(key, secret, 'Youdao', nativeLanguage, learningLanguage);
    const output = await translator.translate(word);
    await cache.put(word, languageScope, output);
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ items: [{ title: 'WordPing lookup failed', subtitle: message, valid: false }] }));
  }
}

main();
