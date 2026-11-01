import KeylessYoudao from './keyless-youdao';
import { providerOrder } from './provider-order';
import { installMissingManagedDictionaries, ManagedDictionaryName } from './managed-dictionaries';

declare var tjs: any;

const directory = tjs.env.alfred_workflow_cache
  || `${tjs.homeDir}/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping`;

const providers = providerOrder(tjs.env.providerOrder);
try {
  if (providers.includes('youdao')) {
    await new KeylessYoudao(`${directory}/website-session.json`).warmup();
  }
} catch { /* The lookup can try again when the user finishes typing. */ }

try {
  const downloadable = providers.filter((name): name is ManagedDictionaryName => name === 'ecdict' || name === 'cedict');
  if (await installMissingManagedDictionaries(downloadable)) {
    try { await tjs.remove(`${directory}/translations.json`); } catch {}
  }
} catch { /* A later warmup or wp :dictionaries can retry. */ }
