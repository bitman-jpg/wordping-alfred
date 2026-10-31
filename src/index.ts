declare var tjs: any;

import TranslationCache, { CacheEntry, isEchoedTranslation } from './cache';
import Vocabulary, { VocabularyEntry, nextReviewDays, searchSavedEntries } from './vocabulary';
import { parseLookupInput } from './query';
import ReviewSession, { ReviewMode, ReviewSessionState } from './review-session';
import { lookupAll, lookupDirection, LookupProgress } from './multi-lookup';
import { suggestionItems, wordSuggestions } from './word-suggestions';
import { DEFAULT_PROVIDER_ORDER, providerOrder, providersFor } from './provider-order';
import md5 from './libs/md5';
import { compareVersions, latestRelease, openUpgrade } from './release-update';
import { preparePreviews } from './preview-client';

interface WorkflowSettings {
  nativeLanguage: string;
  learningLanguage: string;
  historyLimit: number;
  providerOrder: string;
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
    providerOrder: tjs.env.providerOrder || '',
  };
  if (environment.nativeLanguage && environment.learningLanguage) {
    return {
      ...environment,
      nativeLanguage: environment.nativeLanguage || 'zh-CHS',
      learningLanguage: environment.learningLanguage || 'en',
      historyLimit: Number.isFinite(environment.historyLimit) ? environment.historyLimit : 100,
      providerOrder: environment.providerOrder || DEFAULT_PROVIDER_ORDER,
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
    providerOrder: environment.providerOrder || saved.providerOrder || legacy.providerOrder || DEFAULT_PROVIDER_ORDER,
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

function lookupStatePath(query: string, language: string): string {
  return `${cachePath().replace(/translations\.json$/, '')}lookup-v2-${md5(`${language}\0${query.toLocaleLowerCase()}`)}.json`;
}

function manualSaveActions(output: string, scope: string): string {
  const data = JSON.parse(output);
  for (const item of data.items || []) {
    const ctrl = item.mods?.ctrl;
    if (!ctrl || typeof ctrl.arg !== 'string' || !ctrl.arg.startsWith('~save:')) continue;
    ctrl.arg += `|${encodeURIComponent(scope)}`;
    if (ctrl.variables?.wordping_command) ctrl.variables.wordping_command = ctrl.arg;
  }
  return JSON.stringify(data);
}

async function readLookupState(path: string): Promise<LookupProgress | undefined> {
  try {
    const data = JSON.parse(new TextDecoder().decode(await tjs.readFile(path)));
    return typeof data.startedAt === 'number' && Array.isArray(data.items) ? data : undefined;
  } catch { return undefined; }
}

function lookupOutput(state: LookupProgress, hints: any[] = []): string {
  const done = state.completed >= state.expected;
  const items = [...state.items];
  if (!done) {
    const returned = (state.providerStatus || []).filter((item) => item.outcome === 'result').length;
    const unavailable = (state.providerStatus || []).filter((item) => item.outcome !== 'result')
      .map((item) => item.name);
    items.push({ title: `Checking providers · ${state.completed}/${state.expected} checked · ${returned} with results`,
      subtitle: unavailable.length ? `No result from: ${unavailable.join(', ')}`
        : 'Results appear as each provider responds', valid: false });
  }
  if (done && !items.length) {
    items.push({ title: 'No dictionary result',
      subtitle: state.errors[0] || 'Try another word or check your connection', valid: false });
  }
  if (done && state.items.length && state.providerStatus?.length) {
    const returned = state.providerStatus.filter((item) => item.outcome === 'result').length;
    if (returned < state.expected) {
      const missing = state.providerStatus.filter((item) => item.outcome !== 'result')
        .map((item) => item.name);
      items.push({ title: `${returned}/${state.expected} providers supplied results`,
        subtitle: `No result from: ${missing.join(', ')}`, valid: false });
    }
  }
  return JSON.stringify({ variables: { wordping_pending_query: done ? '' : state.query },
    ...(done ? {} : { rerun: 0.2 }), items: [...hints, ...items] });
}

function firstItem(output: string, search = ''): any {
  try {
    const items = JSON.parse(output).items || [];
    return (search && items.find((item: any) =>
      typeof item.title === 'string' && item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    )) || items.find((item: any) => item.variables?.wordping_saved_choice === '1')
      || items.find((item: any) => item.variables?.wordping_source === 'Youdao'
        && !String(item.arg || '').startsWith('# WordPing entry: '))
      || items.find((item: any) => item.valid !== false && !String(item.arg || '').startsWith('# WordPing entry: '))
      || items[0] || {};
  } catch {
    return {};
  }
}

const commandIcon = (name: string) => ({ path: `assets/${name}.png` });

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
    icon: commandIcon('saved'),
  });
  return JSON.stringify({ items });
}

function exportAction(): any {
  return {
    title: 'Export saved words (CSV)…',
    subtitle: 'Current pair for spreadsheets; no review progress',
    arg: '~export',
    valid: true,
    icon: commandIcon('export'),
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
    icon: commandIcon('restore'),
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
    { title: 'Saved words…', subtitle: 'Review, browse, reminders, and files', autocomplete: ':words', valid: false, icon: commandIcon('saved') },
    { title: 'Check for WordPing update', subtitle: 'Install the latest GitHub release', autocomplete: ':update', valid: false, icon: commandIcon('update') },
    clearAction(),
  ] });
}

async function installedVersion(): Promise<string> {
  const path = decodeURIComponent(new URL('./info.plist', import.meta.url).pathname);
  const version = (await readPlist(path)).version;
  if (typeof version !== 'string') throw new Error('Cannot read installed WordPing version');
  return version;
}

async function updateMenu(): Promise<string> {
  const current = await installedVersion();
  const release = await latestRelease();
  const newer = compareVersions(release.version, current) > 0;
  return JSON.stringify({ items: [{
    title: newer ? `Upgrade WordPing ${current} → ${release.version}` : `WordPing ${current} is up to date`,
    subtitle: newer ? 'Press Return to download and open the release in Alfred' : 'Latest GitHub release is already installed',
    arg: newer ? '~update' : undefined, valid: newer, icon: commandIcon('update'),
  }] });
}

function savedWordsMenu(dueCount: number, reverseDueCount: number): string {
  return JSON.stringify({ items: [
    { title: `Review saved words (${dueCount} due)`, subtitle: 'Practice due words in a short session', autocomplete: ':review', valid: false, icon: commandIcon('review') },
    { title: `Review in reverse (${reverseDueCount} due)`, subtitle: 'See the translation; type or recall the saved word', autocomplete: ':reverse', valid: false, icon: commandIcon('reverse') },
    { title: 'Browse saved words', subtitle: 'Search the words you have saved', autocomplete: ':saved', valid: false, icon: commandIcon('browse') },
    { title: 'Daily review reminder', subtitle: 'Get notified when reviews are due', autocomplete: ':remind', valid: false, icon: commandIcon('remind') },
    { title: 'Manage saved words…', subtitle: 'Back up, restore, or export your list', autocomplete: ':files', valid: false, icon: commandIcon('files') },
  ] });
}

function filesMenu(): string {
  return JSON.stringify({ items: [
    { title: 'Back up saved words (JSON)', subtitle: 'All pairs and review progress; can be restored', autocomplete: ':backup', valid: false, icon: commandIcon('backup') },
    { title: 'Restore saved words (JSON)', subtitle: 'Merge a backup; keep existing entries', autocomplete: ':restore', valid: false, icon: commandIcon('restore') },
    { title: 'Export saved words (CSV)', subtitle: 'Current pair for spreadsheets; no review progress', autocomplete: ':export', valid: false, icon: commandIcon('export') },
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
    arg: `~remind:${requested}`, valid: true, icon: commandIcon('remind'),
  });
  else if (requested) items.push({ title: 'Use a time in HH:MM format, such as 09:00', valid: false, icon: commandIcon('remind') });
  else items.push({ title: time ? `Reminder set for ${time}` : 'Daily reminder is off',
    subtitle: time ? 'Press Return to refresh the schedule, or type a new time' : 'Type wp :remind HH:MM to set a local time',
    arg: time ? `~remind:${time}` : undefined, valid: Boolean(time), icon: commandIcon('remind') });
  if (time) items.push({ title: 'Turn off daily reminder', arg: '~remind:off', valid: true, icon: commandIcon('remind') });
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
    icon: commandIcon(reverse ? 'reverse' : 'review'),
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
      icon: commandIcon('review'),
    },
    {
      title: dueCount ? `Start another session · ${dueCount} due` : 'All caught up',
      subtitle: dueCount ? 'Review up to 10 more words' : nextDueMessage(nextDue),
      arg: dueCount ? `~next:${state.mode === 'reverse' ? 'reverse' : 'review'}` : undefined,
      valid: dueCount > 0,
      icon: commandIcon(state.mode === 'reverse' ? 'reverse' : 'review'),
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
    icon: commandIcon('reverse'),
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
    if (entry.legacy) return {
      title: entry.query,
      subtitle: 'Previous lookup · Type this word to refresh its dictionary results',
      autocomplete: entry.query,
      valid: false,
      icon: { path: 'assets/translate.png' },
    };
    const first = firstItem(entry.output);
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

function clearPendingLookup(output: string): string {
  const data = JSON.parse(output);
  data.variables = { ...data.variables, wordping_pending_query: '' };
  return JSON.stringify(data);
}

function pendingLookup(word: string, hints: any[] = []): string {
  return JSON.stringify({
    variables: { wordping_pending_query: word },
    rerun: 0.5,
    items: [...hints, { title: `Looking up “${word}”…`, subtitle: 'Translation starts after typing pauses', valid: false }],
  });
}

async function main(): Promise<void> {
  const rawInput = tjs.args[3] || '';
  try {
    const { nativeLanguage, learningLanguage, historyLimit, providerOrder: configuredOrder } = await workflowSettings();
    const order = providerOrder(configuredOrder);
    const orderKey = order.join(',');
    if (nativeLanguage === learningLanguage) throw new Error('Choose different native and learning languages in WordPing configuration');
    const languageScope = learningLanguage === 'en' ? nativeLanguage : `${nativeLanguage}|${learningLanguage}`;
    const cache = new TranslationCache(cachePath(), Math.min(500, Math.max(1, historyLimit)));
    const vocabulary = new Vocabulary(`${dataDirectory()}/vocabulary.json`);
    const reviewSession = new ReviewSession(reviewSessionPath(languageScope));
    const { word, commandMode, direction } = parseLookupInput(rawInput);
    const lookupScope = direction ? `manual:${direction.from}>${direction.to}` : languageScope;
    const internalCommand = rawInput.trim().startsWith('~');

    if (internalCommand && word === '~update') {
      console.log(await openUpgrade(await installedVersion()));
      return;
    }

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
      const [encodedQuery, encodedScope] = word.slice(6).split('|', 2);
      const query = decodeURIComponent(encodedQuery);
      const sourceScope = encodedScope ? decodeURIComponent(encodedScope) : languageScope;
      const current = await readLookupState(lookupStatePath(query, sourceScope));
      const output = await cache.get(query, sourceScope, true)
        || (current?.items.length ? JSON.stringify({ items: current.items }) : undefined);
      if (!output) throw new Error('Look up the word again before saving it');
      const selected = tjs.env.wordping_choice;
      const data = JSON.parse(output);
      if (selected) {
        const item = data.items.find((entry: any) => entry.title === selected && !String(entry.arg || '').startsWith('# WordPing entry: '));
        if (item) item.variables = { ...(item.variables || {}), wordping_saved_choice: '1' };
      }
      await vocabulary.save(query, languageScope, JSON.stringify(data));
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
      if (command === 'update') {
        console.log(await updateMenu());
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
          arg: '~backup', valid: true, icon: commandIcon('backup'),
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
            valid: false, icon: commandIcon('restore'),
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
      if (direction) {
        console.log(JSON.stringify({ items: [{ title: `Type text after ${direction.from}>${direction.to}`,
          subtitle: 'Example: wp es>zh trabajo', valid: false }] }));
        return;
      }
      console.log(await preparePreviews(historyOutput(await cache.recent(languageScope)), cachePath().replace(/translations\.json$/, '')));
      return;
    }
    const sourceLanguage = direction?.from || lookupDirection(word, nativeLanguage, learningLanguage).from;
    const hintPrefix = rawInput.trim().slice(0, -word.length);
    const hints = !commandMode && !internalCommand
      ? suggestionItems(word, hintPrefix, await wordSuggestions(word, sourceLanguage)) : [];
    const cached = await cache.get(word, lookupScope);
    if (cached && JSON.parse(cached).variables?.wordping_provider_order === orderKey
      && JSON.parse(cached).variables?.wordping_subtitle_version === 6
      && JSON.parse(cached).variables?.wordping_lookup_version === 2
      && !isEchoedTranslation(word, nativeLanguage, cached)) {
      try { await tjs.remove(lookupStatePath(word, lookupScope)); } catch {}
      const output = clearPendingLookup(cached);
      const data = JSON.parse(direction ? manualSaveActions(output, lookupScope) : output);
      data.items.unshift(...hints);
      console.log(await preparePreviews(JSON.stringify(data), cachePath().replace(/translations\.json$/, '')));
      return;
    }
    const pendingQuery = direction ? rawInput.trim() : word;
    if (tjs.env.WORDPING_DEBOUNCE === '1' && tjs.env.wordping_pending_query !== pendingQuery) {
      console.log(pendingLookup(pendingQuery, hints));
      return;
    }

    const sessionPath = cachePath().replace(/translations\.json$/, 'website-session.json');
    if (tjs.env.alfred_workflow_bundleid) {
      const path = lookupStatePath(word, lookupScope);
      let state = await readLookupState(path);
      if (!state || !Array.isArray(state.providerStatus)
        || state.order !== orderKey || Date.now() - state.startedAt > 120000) {
        state = { query: word, language: lookupScope, startedAt: Date.now(),
          order: orderKey, completed: 0, expected: providersFor(word, order).length,
          items: [], errors: [], providerStatus: [] };
        await tjs.makeDir(cachePath().slice(0, cachePath().lastIndexOf('/')), { recursive: true });
        await tjs.writeFile(path, JSON.stringify(state));
        const starter = decodeURIComponent(new URL('./scripts/start-lookup.sh', import.meta.url).pathname);
        await tjs.spawn(['/bin/sh', starter, word, lookupScope, nativeLanguage, learningLanguage,
          sessionPath, path, cachePath(), String(Math.min(500, Math.max(1, historyLimit))), orderKey,
          direction?.from || '', direction?.to || ''],
          { stdout: 'ignore', stderr: 'ignore' }).wait();
      }
      const output = lookupOutput(state, hints);
      console.log(await preparePreviews(direction ? manualSaveActions(output, lookupScope) : output, cachePath().replace(/translations\.json$/, '')));
      return;
    }
    const progress = await lookupAll(word, lookupScope, nativeLanguage, learningLanguage, sessionPath, order,
      undefined, undefined, direction);
    const output = lookupOutput(progress, hints);
    if (progress.items.length) await cache.put(word, lookupScope, JSON.stringify({
      variables: { wordping_provider_order: orderKey, wordping_subtitle_version: 6,
        wordping_lookup_version: 2 }, items: progress.items }));
    console.log(await preparePreviews(direction ? manualSaveActions(output, lookupScope) : output, cachePath().replace(/translations\.json$/, '')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (rawInput.trim() === '~update') {
      console.log(`WordPing update failed: ${message}`);
      return;
    }
    console.log(JSON.stringify({ variables: { wordping_pending_query: '' }, items: [{
      title: rawInput.trim() === ':update' ? 'WordPing update check failed' : 'WordPing lookup failed',
      subtitle: message, valid: false,
    }] }));
  }
}

main();
