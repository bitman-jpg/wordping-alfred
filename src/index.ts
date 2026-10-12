declare var tjs: any;

import Translator from './translator';
import TranslationCache, { CacheEntry } from './cache';

interface WorkflowSettings {
  key: string;
  secret: string;
  nativeLanguage: string;
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
    historyLimit: Number.parseInt(tjs.env.historyLimit || '', 10),
  };
  if (environment.key && environment.secret) {
    return {
      ...environment,
      nativeLanguage: environment.nativeLanguage || 'zh-CHS',
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
    historyLimit: environment.historyLimit || Number.parseInt(saved.historyLimit || legacy.historyLimit || '100', 10) || 100,
  };
}

function cachePath(): string {
  const directory = tjs.env.alfred_workflow_cache
    || `${tjs.homeDir}/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping`;
  return `${directory}/translations.json`;
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
  items.push({
    title: 'Clear recent lookups…',
    subtitle: 'Press Return to delete WordPing’s local history',
    arg: '__wordping_clear__',
    valid: true,
    icon: { path: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/TrashIcon.icns' },
  });
  return JSON.stringify({ items });
}

async function main(): Promise<void> {
  try {
    const { key, secret, nativeLanguage, historyLimit } = await workflowSettings();
    const cache = new TranslationCache(cachePath(), Math.min(500, Math.max(1, historyLimit)));
    const word: string = (tjs.args[3] || '').trim();

    if (!word) {
      console.log(historyOutput(await cache.recent(nativeLanguage)));
      return;
    }
    if (!key || !secret) {
      throw new Error('Add your Youdao app key and secret in WordPing configuration');
    }

    const cached = await cache.get(word, nativeLanguage);
    if (cached) {
      console.log(cached);
      return;
    }

    const translator = new Translator(key, secret, 'Youdao', nativeLanguage);
    const output = await translator.translate(word);
    await cache.put(word, nativeLanguage, output);
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ items: [{ title: 'WordPing lookup failed', subtitle: message, valid: false }] }));
  }
}

main();
