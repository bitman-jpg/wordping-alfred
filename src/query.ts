export interface LanguageDirection { from: string; to: string }

const languageCodes = new Set([
  'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'ar', 'hi', 'id', 'nl', 'th', 'vi',
  'zh-CHS', 'zh-CHT',
]);

function languageCode(value: string): string | undefined {
  const code = value.toLowerCase();
  if (['zh', 'cn', 'zh-cn', 'zh-hans', 'zh-chs'].includes(code)) return 'zh-CHS';
  if (['tw', 'zh-tw', 'zh-hant', 'zh-cht'].includes(code)) return 'zh-CHT';
  return languageCodes.has(code) ? code : undefined;
}

export function parseLookupInput(raw: string): { word: string; commandMode: boolean; direction?: LanguageDirection } {
  const input = raw.trim();
  const commandMode = input.startsWith(':');
  const word = input.replace(/^[:=]/, '').trim();
  if (!commandMode && !input.startsWith('=') && !input.startsWith('~')) {
    if (/^[^\s>]+>$/.test(word)) throw new Error('Type a destination language and text, for example en>ko hello');
    const match = word.match(/^([^\s>]+)>([^\s>]+)(?:\s+(.*))?$/s);
    if (match) {
      const from = languageCode(match[1]);
      const to = languageCode(match[2]);
      if (!from || !to) throw new Error('Unknown language code. Try es>zh trabajo (zh or cn = Simplified Chinese)');
      if (from === to) throw new Error('Choose different source and destination languages');
      return { word: (match[3] || '').trim(), commandMode, direction: { from, to } };
    }
  }
  return { word, commandMode };
}
