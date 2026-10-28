export const DEFAULT_PROVIDER_ORDER =
  'youdao,iciba,baidu,wiktionary,apple,mymemory';

export type ProviderName = 'youdao' | 'iciba' | 'baidu' | 'wiktionary' | 'apple' | 'mymemory';

const names: Record<string, ProviderName> = {
  youdao: 'youdao', iciba: 'iciba', baidu: 'baidu', wiktionary: 'wiktionary',
  apple: 'apple', mymemory: 'mymemory',
};

export function providerOrder(value = DEFAULT_PROVIDER_ORDER): ProviderName[] {
  // Alfred may preserve the previous release's default value during an upgrade.
  if (value.trim().toLowerCase() === 'youdao,iciba,baidu,wiktionary,apple') {
    value = DEFAULT_PROVIDER_ORDER;
  }
  const parsed = value.split(/[\s,;>]+/).map((part) => names[part.toLowerCase()])
    .filter((part): part is ProviderName => Boolean(part));
  return [...new Set(parsed.length ? parsed : providerOrder(DEFAULT_PROVIDER_ORDER))];
}

export function providersFor(query: string, order: ProviderName[]): ProviderName[] {
  return /\s/.test(query) ? order.filter((name) => name === 'youdao' || name === 'apple' || name === 'mymemory') : order;
}
