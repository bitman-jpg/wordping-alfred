declare var tjs: any;

export interface WordSuggestions { correctlySpelled?: boolean; corrections: string[]; completions: string[] }

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(
      current[j - 1] + 1, previous[j] + 1,
      previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
    );
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function suggestionItems(word: string, prefix: string, suggestions: WordSuggestions): any[] {
  if (suggestions.correctlySpelled) return [];
  const seen = new Set([word.toLocaleLowerCase()]);
  const items: any[] = [];
  const add = (candidate: string, kind: 'correction' | 'completion') => {
    if (items.length >= 3 || !/^[a-z]+(?:[-'][a-z]+)*$/i.test(candidate)) return;
    const key = candidate.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ title: `${kind === 'correction' ? 'Did you mean' : 'Complete'} “${candidate}”?`,
      subtitle: 'Press Tab to look up this word', autocomplete: prefix + candidate,
      valid: false, icon: { path: 'assets/translate.png' } });
  };
  const completions = suggestions.completions.filter((candidate) =>
    candidate.toLocaleLowerCase().startsWith(word.toLocaleLowerCase())
      && candidate.toLocaleLowerCase() !== word.toLocaleLowerCase());
  if (word.length >= 5 && !completions.length) {
    const correction = suggestions.corrections.find((candidate) =>
      distance(word.toLocaleLowerCase(), candidate.toLocaleLowerCase()) <= 2);
    if (correction) add(correction, 'correction');
  }
  for (const candidate of completions) add(candidate, 'completion');
  return items;
}

export async function wordSuggestions(word: string, language: string): Promise<WordSuggestions> {
  if (!/^[a-z]{3,24}$/i.test(word) || language !== 'en') return { corrections: [], completions: [] };
  const helper = decodeURIComponent(new URL('./runtime/word-suggestions', import.meta.url).pathname);
  try { await tjs.stat(helper); } catch { return { corrections: [], completions: [] }; }
  let process: any;
  try { process = tjs.spawn([helper, word, language], { stdout: 'pipe', stderr: 'ignore' }); }
  catch { return { corrections: [], completions: [] }; }
  const timeout = setTimeout(() => { try { process.kill(); } catch {} }, 1000);
  try {
    const [output, status] = await Promise.all([process.stdout.text(), process.wait()]);
    if (status.exit_status !== 0) return { corrections: [], completions: [] };
    const parsed = JSON.parse(output);
    return { correctlySpelled: parsed.correctlySpelled === true,
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
      completions: Array.isArray(parsed.completions) ? parsed.completions : [] };
  } catch { return { corrections: [], completions: [] }; }
  finally { clearTimeout(timeout); }
}
