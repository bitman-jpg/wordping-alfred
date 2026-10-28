import { Result } from './workflow/workflow';

declare var tjs: any;

export function baiduWordPage(query: string): string {
  return `https://dict.baidu.com/s?wd=${encodeURIComponent(query)}`;
}

export function baiduDictionaryResults(data: any, query: string, from: string, to: string): Result[] {
  if (!((from === 'en' && to === 'zh-CHS') || (from.startsWith('zh') && to === 'en'))
    || /\s/.test(query) || data?.errno !== 0) return [];
  const entry = Array.isArray(data.data) ? data.data.find((item: any) =>
    String(item?.k || '').toLocaleLowerCase() === query.toLocaleLowerCase()) : undefined;
  if (!entry) return [];
  const value = String(entry.v || '').replace(/<[^>]*>/g, '').trim();
  if (!value) return [];
  const meanings = value.split(/\s+(?=(?:n|v|vt|vi|adj|adv|pron|prep|conj|int|num|art|aux|abbr)\.\s)/i)
    .flatMap((part) => {
      const match = part.match(/^((?:n|v|vt|vi|adj|adv|pron|prep|conj|int|num|art|aux|abbr)\.)\s*/i);
      const label = match?.[1] || '';
      return part.slice(match?.[0].length || 0).split(/[;；]\s*/)
        .map((meaning) => ({ title: meaning.trim(), label }));
    }).filter((item) => item.title);
  return meanings.slice(0, 8).map(({ title, label }) => ({
    title, subtitle: `Baidu dictionary · ${label || 'meaning'} · ${from} → ${to}`,
    arg: title, pronounce: query, source: 'Baidu', partOfSpeech: label,
    quicklookurl: baiduWordPage(query),
  }));
}

export async function baiduDictionary(query: string, from: string, to: string): Promise<Result[]> {
  if (!((from === 'en' && to === 'zh-CHS') || (from.startsWith('zh') && to === 'en'))
    || /\s/.test(query)) return [];
  const process = tjs.spawn(['/usr/bin/curl', '--fail', '--silent', '--show-error', '--max-time', '5',
    '--header', 'Content-Type: application/x-www-form-urlencoded',
    '--header', 'Referer: https://fanyi.baidu.com/',
    '--data', new URLSearchParams({ kw: query }).toString(), 'https://fanyi.baidu.com/sug'],
  { stdout: 'pipe', stderr: 'ignore' });
  const output = await process.stdout.text();
  const status = await process.wait();
  if (status.exit_status !== 0) return [];
  try { return baiduDictionaryResults(JSON.parse(output), query, from, to); }
  catch { return []; }
}
