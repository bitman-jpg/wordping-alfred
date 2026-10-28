import { Result } from './workflow/workflow';

declare var tjs: any;

export async function lookupApple(word: string, from: string, to: string): Promise<Result[]> {
  const helper = decodeURIComponent(new URL('./runtime/apple-translate', import.meta.url).pathname);
  let process: any;
  try {
    process = tjs.spawn([helper, from, to, word], { stdout: 'pipe', stderr: 'ignore' });
  } catch { return []; }

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try { process.kill(); } catch {}
  }, 5000);
  try {
    const [output, status] = await Promise.all([process.stdout.text(), process.wait()]);
    if (timedOut || status.exit_status !== 0) return [];
    const translation = String(JSON.parse(output).translation || '').trim();
    if (!translation || translation.toLocaleLowerCase() === word.toLocaleLowerCase()) return [];
    return [{ title: translation, subtitle: `Apple · ${from} → ${to}`,
      arg: translation, pronounce: word, source: 'Apple Translation' }];
  } catch { return []; }
  finally { clearTimeout(timeout); }
}
