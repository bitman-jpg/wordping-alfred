export function parseLookupInput(raw: string): { word: string; commandMode: boolean } {
  const input = raw.trim();
  const commandMode = input.startsWith(':');
  const word = input.replace(/^[:=]/, '').trim();
  return { word, commandMode };
}
