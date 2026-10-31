import Translator, { YoudaoResponseError } from './translator';
import { dictionaryItems, wiktionaryDictionary } from './dictionaries';
import { ProviderName, providersFor } from './provider-order';
import { icibaDictionary } from './iciba-dictionary';
import { baiduDictionary } from './baidu-dictionary';
import { lookupApple } from './apple-translate';
import { lookupMyMemory } from './mymemory';
import { youdaoDictionary } from './youdao-dictionary';
import { LanguageDirection } from './query';

export interface LookupProgress {
  query: string;
  language: string;
  startedAt: number;
  completed: number;
  expected: number;
  items: any[];
  errors: string[];
  order?: string;
  providerStatus?: { name: ProviderName; outcome: 'result' | 'empty' | 'error'; count: number }[];
}

export function lookupDirection(query: string, native: string, learning: string): { from: string; to: string } {
  const detected = /[\u3040-\u30ff]/.test(query) ? 'ja'
    : /[\uac00-\ud7af]/.test(query) ? 'ko'
    : /[\u0600-\u06ff]/.test(query) ? 'ar'
    : /[\u0900-\u097f]/.test(query) ? 'hi'
    : /[\u0e00-\u0e7f]/.test(query) ? 'th'
    : /[\u0400-\u04ff]/.test(query) ? 'ru'
    : /[\u3400-\u9fff]/.test(query) ? [native, learning].find((value) => value.startsWith('zh')) : undefined;
  const latin = [native, learning].some((value) => /^(zh|ja|ko|ru|ar|hi|th)/.test(value))
    && /[A-Za-z]/.test(query) && !/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(query)
    ? [native, learning].find((value) => !/^(zh|ja|ko|ru|ar|hi|th)/.test(value)) : undefined;
  const from = detected && [native, learning].includes(detected) ? detected : latin || learning;
  return { from, to: from === native ? learning : native };
}

function displayWidth(value: string): number {
  return [...value].reduce((width, character) => width
    + (/[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60]/.test(character) ? 2 : 1), 0);
}

function preview(value: string, maximum: number): { shown: string; rest: string } {
  let width = 0;
  let end = 0;
  for (const character of value) {
    const next = width + displayWidth(character);
    if (next > maximum) break;
    width = next;
    end += character.length;
  }
  if (end === value.length) return { shown: value, rest: '' };
  const lastSpace = value.slice(0, end).lastIndexOf(' ');
  if (lastSpace > end / 2) end = lastSpace;
  return { shown: value.slice(0, end).trimEnd() + '…', rest: value.slice(end).trimStart() };
}

function partLabel(value: string): string {
  const part = value.trim();
  const labels: Record<string, string> = {
    noun: 'n.', verb: 'v.', 'transitive verb': 'vt.', 'intransitive verb': 'vi.',
    adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.',
    conjunction: 'conj.', interjection: 'int.', determiner: 'det.', numeral: 'num.',
  };
  return labels[part.toLowerCase()] || part;
}

function shortLanguage(code: string): string {
  return code === 'zh-CHS' ? 'zh' : code === 'zh-CHT' ? 'zh-TW' : code;
}

function renderMeanings(meanings: { text: string; parts: string[] }[], separator: string): string {
  let previousPart = '';
  return meanings.map((meaning, index) => {
    const part = meaning.parts.join(', ');
    const samePart = index > 0 && part && part === previousPart;
    previousPart = part;
    return `${index ? samePart ? ' / ' : separator : ''}`
      + `${part && !samePart ? `${part} ` : ''}${meaning.text}`;
  }).join('');
}

export function oneItemPerProvider(items: any[], provider?: ProviderName): any[] {
  const usable = items.filter((item) => item?.valid !== false
    && typeof item?.title === 'string' && item.title.trim()
    && !String(item.arg || '').startsWith('# WordPing entry: '));
  if (!usable.length) return [];
  const first = { ...usable[0] };
  const meanings: { text: string; parts: string[] }[] = [];
  for (const item of usable) {
    const value = String(item.title).trim();
    const part = partLabel(String(item.variables?.wordping_pos || ''));
    let meaning = meanings.find((candidate) => candidate.text === value);
    if (!meaning) {
      meaning = { text: value, parts: [] };
      meanings.push(meaning);
    }
    if (part && !meaning.parts.includes(part)) meaning.parts.push(part);
  }
  // Youdao puts a general translation before its dictionary senses. Do not
  // count it twice when a sense already includes the same term.
  if (provider === 'youdao' && meanings.length > 1 && !meanings[0].parts.length
    && !/[，,；;、/]/.test(meanings[0].text)
    && meanings.slice(1).some((meaning) => meaning.text.split(/[，,；;、/]/)
      .some((part) => part.trim() === meanings[0].text))) meanings.shift();
  const separator = meanings.some((meaning) => /[\u3400-\u9fff]/.test(meaning.text)) ? '；' : '; ';
  const combined = renderMeanings(meanings, separator);
  const prominent: typeof meanings = [];
  for (const meaning of meanings) {
    const candidate = renderMeanings([...prominent, meaning], separator);
    if (prominent.length && displayWidth(candidate) > 64) break;
    prominent.push(meaning);
  }
  const overflow = renderMeanings(meanings.slice(prominent.length), separator);
  const main = renderMeanings(prominent, separator);
  const mainPreview = preview(main, 64);
  first.title = mainPreview.shown;
  first.arg = combined;
  first.text = { ...(first.text || {}), copy: combined, largetype: combined };
  if (first.mods?.ctrl?.variables?.wordping_choice) {
    first.mods = { ...first.mods, ctrl: { ...first.mods.ctrl,
      variables: { ...first.mods.ctrl.variables, wordping_choice: combined } } };
  }
  const direction = String(first.subtitle || '').match(/([a-zA-Z-]+)\s*→\s*([a-zA-Z-]+)/);
  const pair = direction ? `${shortLanguage(direction[1])}→${shortLanguage(direction[2])}` : '';
  if (provider) first.icon = { path: `assets/provider-muted-${provider}.png` };
  if (provider === 'apple') first.quicklookurl = '';
  const providerInfo = provider ? pair : String(first.subtitle || '');
  const remaining = [mainPreview.rest, overflow].filter(Boolean).join(separator);
  const needsLargeTypeHint = Boolean(remaining) && displayWidth(combined) > 100;
  const subtitlePreview = preview(remaining, needsLargeTypeHint ? 48 : 100);
  first.subtitle = [providerInfo, needsLargeTypeHint ? '⌘L to read full translation' : '',
    remaining ? subtitlePreview.shown : ''].filter(Boolean).join(' · ');
  return [first];
}

export async function lookupAll(
  query: string, language: string, native: string, learning: string, sessionPath: string,
  order: ProviderName[],
  onUpdate: (progress: LookupProgress) => Promise<void> = async () => {},
  overrides?: Partial<Record<ProviderName, (from: string, to: string) => Promise<any[]>>>,
  direction?: LanguageDirection,
): Promise<LookupProgress> {
  const pair = direction || lookupDirection(query, native, learning);
  const names = providersFor(query, order);
  const run = async (name: ProviderName, from: string, to: string): Promise<any[]> => {
    if (overrides?.[name]) return overrides[name]!(from, to);
    if (name === 'youdao') {
      let output: string;
      try { output = await new Translator(native, learning, sessionPath).translate(query, false, direction); }
      catch (error) {
        if (!(error instanceof YoudaoResponseError) || error.code !== 50) throw error;
        return dictionaryItems(await youdaoDictionary(query, from, to), query);
      }
      const items = JSON.parse(output).items || [];
      if (!items.some((item: any) => item.valid !== false
        && !String(item.arg || '').startsWith('# WordPing entry: ')
        && String(item.title || '').trim().toLocaleLowerCase() !== query.trim().toLocaleLowerCase())) return [];
      return items.map((item: any) => {
        return {
          ...item,
          subtitle: item.arg?.startsWith('# WordPing entry: ')
            ? item.subtitle : `Youdao · ${item.subtitle || query}`,
          variables: { ...(item.variables || {}), wordping_source: 'Youdao' },
        };
      });
    }
    if (name === 'wiktionary') return dictionaryItems(await wiktionaryDictionary(query, from, to), query);
    if (name === 'iciba') return dictionaryItems(await icibaDictionary(query, from, to), query);
    if (name === 'baidu') return dictionaryItems(await baiduDictionary(query, from, to), query);
    if (name === 'mymemory') return dictionaryItems(await lookupMyMemory(query, from, to), query);
    return dictionaryItems(await lookupApple(query, from, to), query);
  };
  const progress: LookupProgress = {
    query, language, startedAt: Date.now(), completed: 0,
    expected: names.length, items: [], errors: [], order: order.join(','), providerStatus: [],
  };
  const providerItems = new Map<ProviderName, any[]>();
  let write = Promise.resolve();
  await Promise.all(names.map(async (name) => {
    let items: any[] = [];
    let triedReverse = false;
    let failed = false;
    try {
      try { items = await run(name, pair.from, pair.to); }
      catch (error) {
        if (name === 'youdao') throw error;
        if (direction) throw error;
        triedReverse = true;
        items = await run(name, pair.to, pair.from);
      }
      if (!items.length && name !== 'youdao' && !triedReverse && !direction) items = await run(name, pair.to, pair.from);
    } catch (error) {
      failed = true;
      progress.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    items = oneItemPerProvider(items, name);
    providerItems.set(name, items);
    progress.items = names.flatMap((provider) => providerItems.get(provider) || []);
    progress.providerStatus!.push({ name, outcome: items.length ? 'result' : failed ? 'error' : 'empty', count: items.length });
    progress.completed++;
    const snapshot = { ...progress, items: [...progress.items], errors: [...progress.errors],
      providerStatus: [...progress.providerStatus!] };
    write = write.then(() => onUpdate(snapshot));
    await write;
  }));
  return progress;
}
