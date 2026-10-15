declare var tjs: any;

import Translator from './translator';
import TranslationCache, { CacheEntry, isEchoedTranslation } from './cache';
import Vocabulary, { VocabularyEntry, nextReviewDays, searchSavedEntries } from './vocabulary';
import { parseLookupInput } from './query';
import ReviewSession, { ReviewMode, ReviewSessionState } from './review-session';

interface WorkflowSettings {
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
    nativeLanguage: tjs.env.nativeLanguage || '',
    learningLanguage: tjs.env.learningLanguage || '',
    historyLimit: Number.parseInt(tjs.env.historyLimit || '', 10),
  };
  if (environment.nativeLanguage && environment.learningLanguage) {
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

function removeModifier(query: string, returnTo: 'saved' | 'review' | 'reverse'): any {
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
  return JSON.stringify({ items });
}

function exportAction(): any {
  return {
    title: 'Export saved words (CSV)…',
    subtitle: 'Current pair for spreadsheets; no review progress',
    arg: '~export',
    valid: true,
    icon: { path: 'assets/translate.png' },
  };
}

function backupPath(): string {
  return `${tjs.homeDir}/Downloads/WordPing Vocabulary Backup.json`;
}

function restoreAction(path: string): any {
  return {
    title: `Restore saved words from ${path.split('/').pop() || path}`,
    subtitle: 'Add missing entries; keep existing saved words and progress',
    arg: `~restore:${encodeURIComponent(path)}`,
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

function commandMenu(): string {
  return JSON.stringify({ items: [
    { title: 'Saved words…', subtitle: 'Review, browse, reminders, and files', autocomplete: ':words', valid: false },
    { title: 'Clear recent lookups', subtitle: 'Delete local lookup history', autocomplete: ':clear', valid: false },
  ] });
}

function savedWordsMenu(dueCount: number, reverseDueCount: number): string {
  return JSON.stringify({ items: [
    { title: `Review saved words (${dueCount} due)`, subtitle: 'Practice due words in a short session', autocomplete: ':review', valid: false },
    { title: `Review in reverse (${reverseDueCount} due)`, subtitle: 'See the translation; type or recall the saved word', autocomplete: ':reverse', valid: false },
    { title: 'Browse saved words', subtitle: 'Search the words you have saved', autocomplete: ':saved', valid: false },
    { title: 'Daily review reminder', subtitle: 'Get notified when reviews are due', autocomplete: ':remind', valid: false },
    { title: 'Manage saved words…', subtitle: 'Back up, restore, or export your list', autocomplete: ':files', valid: false },
  ] });
}

function filesMenu(): string {
  return JSON.stringify({ items: [
    { title: 'Back up saved words (JSON)', subtitle: 'All pairs and review progress; can be restored', autocomplete: ':backup', valid: false },
    { title: 'Restore saved words (JSON)', subtitle: 'Merge a backup; keep existing entries', autocomplete: ':restore', valid: false },
    { title: 'Export saved words (CSV)', subtitle: 'Current pair for spreadsheets; no review progress', autocomplete: ':export', valid: false },
  ] });
}

async function reminderTime(): Promise<string | undefined> {
  try {
    const bytes = await tjs.readFile(`${tjs.homeDir}/Library/LaunchAgents/com.bitman.wordping.review.plist`);
    const plist = new TextDecoder().decode(bytes);
    const hour = plist.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/)?.[1];
    const minute = plist.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/)?.[1];
    if (hour === undefined || minute === undefined) return undefined;
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } catch {
    return undefined;
  }
}

function reminderMenu(time?: string, requested = ''): string {
  const items: any[] = [];
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(requested)) items.push({
    title: `Remind me daily at ${requested}`,
    subtitle: 'Notify only when saved words are due',
    arg: `~remind:${requested}`, valid: true,
  });
  else if (requested) items.push({ title: 'Use a time in HH:MM format, such as 09:00', valid: false });
  else items.push({ title: time ? `Reminder set for ${time}` : 'Daily reminder is off',
    subtitle: time ? 'Press Return to refresh the schedule, or type a new time' : 'Type wp :remind HH:MM to set a local time',
    arg: time ? `~remind:${time}` : undefined, valid: Boolean(time) });
  if (time) items.push({ title: 'Turn off daily reminder', arg: '~remind:off', valid: true });
  return JSON.stringify({ items });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function reversePrompt(entry: VocabularyEntry): string | undefined {
  const title = firstItem(entry.output).title;
  return typeof title === 'string' && title.trim() && title.trim().toLocaleLowerCase() !== entry.query.trim().toLocaleLowerCase()
    ? title.trim() : undefined;
}

function matchesReverseAnswer(answer: string, query: string): boolean {
  const normalized = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return normalized(answer) === normalized(query);
}

function reviewPromptOutput(entry: VocabularyEntry, state: ReviewSessionState): string {
  const retry = state.pending[0]?.retry;
  const reverse = state.mode === 'reverse';
  return JSON.stringify({ items: [{
    title: reverse ? reversePrompt(entry) || 'Translation unavailable' : entry.query,
    subtitle: `${state.completed + 1} of ${state.total}${retry ? ' · Second try' : ''} · ${reverse ? 'Type an answer or Return to reveal' : 'Return to reveal · ⌘ Return to pronounce'}`,
    autocomplete: reverse ? ':reverse-reveal' : `:review ${entry.query}`,
    valid: false,
    icon: firstItem(entry.output).icon || { path: 'assets/translate.png' },
    mods: {
      ...(!reverse ? { cmd: {
        subtitle: `Speak locally: ${entry.query}`,
        arg: entry.query,
        valid: true,
        icon: { path: 'assets/translate-say.png' },
      } } : {}),
      ctrl: removeModifier(entry.query, reverse ? 'reverse' : 'review'),
    },
  }] });
}

function nextDueMessage(timestamp?: number): string {
  if (timestamp === undefined) return 'Your next review will appear when a word is due';
  const date = new Date(timestamp);
  const today = new Date();
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];
  const year = date.getFullYear() === today.getFullYear() ? '' : `, ${date.getFullYear()}`;
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  const period = date.getHours() < 12 ? 'AM' : 'PM';
  return `Next word due ${month} ${date.getDate()}${year} at ${hour}:${minute} ${period}`;
}

function reviewSummary(state: ReviewSessionState, dueCount: number, nextDue?: number): string {
  const remembered = state.total - state.missed;
  return JSON.stringify({ items: [
    {
      title: `Session complete · ${state.total} ${state.total === 1 ? 'word' : 'words'}`,
      subtitle: `${remembered} recalled first try · ${state.recovered} recovered · ${state.unresolved} still due`,
      valid: false,
    },
    {
      title: dueCount ? `Start another session · ${dueCount} due` : 'All caught up',
      subtitle: dueCount ? 'Review up to 10 more words' : nextDueMessage(nextDue),
      arg: dueCount ? `~next:${state.mode === 'reverse' ? 'reverse' : 'review'}` : undefined,
      valid: dueCount > 0,
    },
  ] });
}

function reviewReveal(entry?: VocabularyEntry, state?: ReviewSessionState, attempt?: string): string {
  if (!entry) return JSON.stringify({ items: [{ title: 'Saved word not found', valid: false }] });
  const days = nextReviewDays(entry);
  const nextReview = `in ${days} ${days === 1 ? 'day' : 'days'}`;
  const reverse = state?.mode === 'reverse';
  const returnTo = reverse ? 'reverse' : 'review';
  const checked = reverse && attempt !== undefined;
  const correct = checked && matchesReverseAnswer(attempt, entry.query);
  const parsed = JSON.parse(entry.output);
  parsed.items = reverse ? [{
    title: entry.query,
    subtitle: `${state ? `${state.completed + 1} of ${state.total} · ` : ''}Saved word · ⌘ Return to pronounce`,
    arg: entry.query,
    valid: true,
    icon: firstItem(entry.output).icon || { path: 'assets/translate.png' },
    mods: {
      cmd: { subtitle: `Speak locally: ${entry.query}`, arg: entry.query, valid: true,
        icon: { path: 'assets/translate-say.png' } },
      ctrl: removeModifier(entry.query, returnTo),
    },
  }] : (parsed.items || []).map((item: any) => ({
    ...item,
    subtitle: `${state ? `${state.completed + 1} of ${state.total} · ` : ''}${item.subtitle || ''}`,
    mods: {
      ...(item.mods || {}),
      ctrl: removeModifier(entry.query, returnTo),
    },
  }));
  const query = encodeURIComponent(entry.query);
  const gotIt = {
      title: `Got it · next review ${nextReview}`,
      subtitle: checked && correct ? `Correct: “${attempt}” matches · Return to grade` : 'Recalled it; each success lengthens the interval',
      arg: `~remember:${query}`,
      valid: true,
      variables: { wordping_return: returnTo },
      icon: { path: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ToolbarFavoritesIcon.icns' },
      mods: { ctrl: removeModifier(entry.query, returnTo) },
    };
  const missedIt = {
      title: checked && !correct ? 'Not quite · mark missed' : 'Missed it · keep in review',
      subtitle: checked && !correct ? `Your answer: “${attempt}” · Saved word: “${entry.query}”` : 'Review again at the end of this session',
      arg: `~again:${query}`,
      valid: true,
      variables: { wordping_return: returnTo },
      icon: { path: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/Sync.icns' },
      mods: { ctrl: removeModifier(entry.query, returnTo) },
    };
  parsed.items.unshift(...(checked && !correct ? [missedIt, gotIt] : [gotIt, missedIt]));
  return JSON.stringify(parsed);
}

function reverseAnswerOutput(answer: string, entry: VocabularyEntry): string {
  return JSON.stringify({ items: [{
    title: `Check “${answer}”`,
    subtitle: 'Return to compare with the saved word',
    autocomplete: `:reverse-check:${encodeURIComponent(answer)}`,
    valid: false,
    mods: { ctrl: removeModifier(entry.query, 'reverse') },
  }] });
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
    const { nativeLanguage, learningLanguage, historyLimit } = await workflowSettings();
    if (nativeLanguage === learningLanguage) throw new Error('Choose different native and learning languages in WordPing configuration');
    const languageScope = learningLanguage === 'en' ? nativeLanguage : `${nativeLanguage}|${learningLanguage}`;
    const cache = new TranslationCache(cachePath(), Math.min(500, Math.max(1, historyLimit)));
    const vocabulary = new Vocabulary(`${dataDirectory()}/vocabulary.json`);
    const reviewSession = new ReviewSession(reviewSessionPath(languageScope));
    const rawInput = tjs.args[3] || '';
    const { word, commandMode } = parseLookupInput(rawInput);
    const internalCommand = rawInput.trim().startsWith('~');

    if (internalCommand && word === '~reminder-check') {
      const count = (await vocabulary.due(languageScope)).length;
      if (count) {
        const stampPath = `${dataDirectory()}/reminder-last-shown-${encodeURIComponent(languageScope)}.txt`;
        const now = new Date();
        const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}|${await reminderTime() || 'unscheduled'}`;
        let lastShown = '';
        try { lastShown = new TextDecoder().decode(await tjs.readFile(stampPath)); } catch {}
        if (lastShown !== today) {
          await tjs.makeDir(dataDirectory(), { recursive: true });
          await tjs.writeFile(stampPath, today);
          console.log(`${count} saved ${count === 1 ? 'word is' : 'words are'} due · Open Alfred and type wp :review`);
        }
      }
      return;
    }

    if (internalCommand && word.startsWith('~save:')) {
      const query = decodeURIComponent(word.slice(6));
      const output = await cache.get(query, languageScope);
      if (!output) throw new Error('Look up the word again before saving it');
      await vocabulary.save(query, languageScope, output);
      console.log(`Saved “${query}” for review.`);
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
    if (internalCommand && (word === '~next:review' || word === '~next:reverse')) {
      const mode: ReviewMode = word === '~next:reverse' ? 'reverse' : 'forward';
      const session = await reviewSession.load(languageScope);
      if (!session || session.pending.length || (session.mode || 'forward') !== mode) {
        throw new Error('Finish the current review session first');
      }
      const due = (await vocabulary.due(languageScope)).filter((entry) => mode === 'forward' || reversePrompt(entry));
      if (!due.length) throw new Error('No words due for another session');
      await reviewSession.start(languageScope, due, mode);
      console.log(`Started another ${mode === 'reverse' ? 'reverse ' : ''}review session.`);
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
    if (internalCommand && word === '~backup') {
      const path = backupPath();
      await tjs.writeFile(path, await vocabulary.backup());
      console.log(`Saved word backup to ${path}`);
      return;
    }
    if (internalCommand && word.startsWith('~restore:')) {
      const path = decodeURIComponent(word.slice(9));
      let contents: string;
      try { contents = new TextDecoder().decode(await tjs.readFile(path)); }
      catch { throw new Error(`Cannot read backup at ${path}`); }
      const result = await vocabulary.restore(contents);
      console.log(`Restored ${result.added} word${result.added === 1 ? '' : 's'}; kept ${result.kept} already saved.`);
      return;
    }
    if (commandMode) {
      const command = word.toLocaleLowerCase();
      if (!word) {
        console.log(commandMenu());
        return;
      }
      if (command === 'words') {
        const due = await vocabulary.due(languageScope);
        console.log(savedWordsMenu(due.length, due.filter(reversePrompt).length));
        return;
      }
      if (command === 'files') {
        console.log(filesMenu());
        return;
      }
      if (command === 'saved') {
        console.log(savedOutput(await vocabulary.list(languageScope)));
        return;
      }
      if (command === 'remind' || command.startsWith('remind ')) {
        console.log(reminderMenu(await reminderTime(), word.slice(6).trim()));
        return;
      }
      if (command.startsWith('saved ')) {
        const search = word.slice(6).trim();
        console.log(savedOutput(searchSavedEntries(await vocabulary.list(languageScope), search), search));
        return;
      }
      if (command === 'review' || command === 'review next' || command === 'reverse' || command === 'reverse-next') {
        const mode: ReviewMode = command.startsWith('reverse') ? 'reverse' : 'forward';
        const fresh = command === 'review next' || command === 'reverse-next';
        const due = (await vocabulary.due(languageScope)).filter((entry) => mode === 'forward' || reversePrompt(entry));
        const nextDue = due.length ? undefined : await vocabulary.nextDue(languageScope, Date.now(),
          (entry) => mode === 'forward' || Boolean(reversePrompt(entry)));
        let session = fresh ? undefined : await reviewSession.load(languageScope);
        if (session && (session.mode || 'forward') !== mode) session = undefined;
        const completedOnEarlierDay = session?.completedAt
          && new Date(session.completedAt).toDateString() !== new Date().toDateString();
        if (!session || (due.length > 0 && (session.total === 0 || completedOnEarlierDay))) {
          session = await reviewSession.start(languageScope, due, mode);
        }
        session = await reviewSession.reconcile(session, await vocabulary.list(languageScope));
        if (session.pending.length) {
          const entry = (await vocabulary.list(languageScope)).find((candidate) =>
            candidate.query.toLocaleLowerCase() === session.pending[0].query.toLocaleLowerCase());
          if (entry) console.log(reviewPromptOutput(entry, session));
          else console.log(JSON.stringify({ items: [{ title: 'Saved word not found', valid: false }] }));
        } else if (session.total) {
          console.log(reviewSummary(session, due.length, nextDue));
        } else {
          console.log(JSON.stringify({ items: [{ title: 'No words due',
            subtitle: mode === 'reverse' && nextDue === undefined
              ? 'Save a word with a translation to review in reverse' : nextDueMessage(nextDue), valid: false }] }));
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
      if (command === 'backup') {
        console.log(JSON.stringify({ items: [{
          title: 'Back up saved words (JSON) to Downloads',
          subtitle: 'All language pairs and progress; replaces the previous backup',
          arg: '~backup', valid: true,
        }] }));
        return;
      }
      if (command === 'restore' || command.startsWith('restore ')) {
        const supplied = word.slice(7).trim();
        const unquoted = supplied.replace(/^(['"])(.*)\1$/, '$2');
        const path = unquoted ? unquoted.replace(/^~(?=\/)/, tjs.homeDir) : backupPath();
        try {
          await tjs.readFile(path);
          console.log(JSON.stringify({ items: [restoreAction(path)] }));
        } catch {
          console.log(JSON.stringify({ items: [{
            title: 'Backup file not found',
            subtitle: supplied ? 'Check the path after wp :restore' : 'Place WordPing Vocabulary Backup.json in Downloads',
            valid: false,
          }] }));
        }
        return;
      }
      if (command.startsWith('review ')) {
        const query = word.slice(7).trim();
        const session = await reviewSession.load(languageScope);
        const entry = session?.mode !== 'reverse' && session?.pending[0]?.query.toLocaleLowerCase() === query.toLocaleLowerCase()
          ? (await vocabulary.list(languageScope)).find((candidate) => candidate.query.toLocaleLowerCase() === query.toLocaleLowerCase())
          : undefined;
        if (entry) {
          console.log(reviewReveal(entry, session));
          return;
        }
      }
      if (command === 'reverse-reveal' || command.startsWith('reverse-check:') || command.startsWith('reverse ')) {
        const session = await reviewSession.load(languageScope);
        const query = session?.mode === 'reverse' ? session.pending[0]?.query : undefined;
        const entry = query
          ? (await vocabulary.list(languageScope)).find((candidate) => candidate.query.toLocaleLowerCase() === query.toLocaleLowerCase())
          : undefined;
        if (entry) {
          if (command === 'reverse-reveal') console.log(reviewReveal(entry, session));
          else if (command.startsWith('reverse-check:')) {
            console.log(reviewReveal(entry, session, decodeURIComponent(word.slice('reverse-check:'.length))));
          } else console.log(reverseAnswerOutput(word.slice(8).trim(), entry));
          return;
        }
        console.log(JSON.stringify({ items: [{ title: 'No active reverse review',
          subtitle: 'Type wp :reverse to start a session', valid: false }] }));
        return;
      }
      // Unrecognized commands are ordinary lookups without the leading colon.
    }

    if (!word) {
      console.log(historyOutput(await cache.recent(languageScope)));
      return;
    }
    const cached = await cache.get(word, languageScope);
    if (cached && !isEchoedTranslation(word, nativeLanguage, cached)) {
      console.log(cached);
      return;
    }

    const translator = new Translator(nativeLanguage, learningLanguage, cachePath().replace(/translations\.json$/, 'website-session.json'));
    const output = await translator.translate(word);
    await cache.put(word, languageScope, output);
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ items: [{ title: 'WordPing lookup failed', subtitle: message, valid: false }] }));
  }
}

main();
