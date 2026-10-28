declare var tjs: any;

import TranslationCache from './cache';
import { lookupAll, LookupProgress } from './multi-lookup';
import { providerOrder } from './provider-order';

async function main(): Promise<void> {
  const [query, language, native, learning, sessionPath, statePath, cachePath, maximum, orderText, from, to] = tjs.args.slice(3);
  if (!query || !statePath) return;
  const order = providerOrder(orderText);
  const progress = await lookupAll(query, language, native, learning, sessionPath, order, async (state: LookupProgress) => {
    await tjs.writeFile(statePath, JSON.stringify(state));
  }, undefined, from && to ? { from, to } : undefined);
  await tjs.writeFile(statePath, JSON.stringify(progress));
  if (progress.items.length) {
    await new TranslationCache(cachePath, Number(maximum) || 100).put(query, language, JSON.stringify({
      variables: { wordping_provider_order: order.join(','), wordping_subtitle_version: 3,
        wordping_lookup_version: 1 }, items: progress.items }));
  }
}

main().catch((error) => { console.error(error); });
