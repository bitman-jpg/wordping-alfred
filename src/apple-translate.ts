import { Result } from './workflow/workflow';
import { lookupMyMemory } from './mymemory';

declare var tjs: any;

type FallbackProvider = (word: string, from: string, to: string) => Promise<Result[]>;

export async function lookupApple(word: string, from: string, to: string): Promise<Result[]> {
  const helper = decodeURIComponent(new URL('./runtime/apple-translate', import.meta.url).pathname);
  let process: any;
  try {
    process = tjs.spawn([helper, from, to, word], { stdout: 'pipe', stderr: 'pipe' });
  } catch {
    return [];
  }

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try { process.kill(); } catch { /* The process may have finished. */ }
  }, 5000);
  try {
    const [output, , status] = await Promise.all([
      process.stdout.text(), process.stderr.text(), process.wait(),
    ]);
    if (timedOut || status.exit_status !== 0) return [];
    const translation = String(JSON.parse(output).translation || '').trim();
    if (!translation || translation.toLocaleLowerCase() === word.toLocaleLowerCase()) return [];
    return [{ title: translation, subtitle: `Apple Translation · ${from} → ${to}`,
      arg: translation, pronounce: word,
      quicklookurl: `https://www.youdao.com/w/${encodeURIComponent(word)}` }];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupFallback(word: string, from: string, to: string,
  apple: FallbackProvider = lookupApple, memory: FallbackProvider = lookupMyMemory): Promise<Result[]> {
  try {
    const results = await apple(word, from, to);
    if (results.length) return results;
  } catch { /* MyMemory remains available if the local translator fails. */ }
  return memory(word, from, to);
}
