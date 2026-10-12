declare var tjs: any;

import Translator from './translator';

interface WorkflowSettings {
  key: string;
  secret: string;
  nativeLanguage: string;
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
  };
  if (environment.key && environment.secret) {
    return {
      ...environment,
      nativeLanguage: environment.nativeLanguage || 'zh-CHS',
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
  };
}

async function main(): Promise<void> {
  try {
    const { key, secret, nativeLanguage } = await workflowSettings();
    if (!key || !secret) {
      throw new Error('Add your Youdao app key and secret in WordPing configuration');
    }

    const word: string = tjs.args[3];
    if (!word) throw new Error('Type a word or phrase after the wp keyword');

    const translator = new Translator(key, secret, 'Youdao', nativeLanguage);
    console.log(await translator.translate(word));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ items: [{ title: 'WordPing lookup failed', subtitle: message, valid: false }] }));
  }
}

main();
