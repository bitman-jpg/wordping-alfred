import KeylessYoudao from './keyless-youdao';

declare var tjs: any;

const directory = tjs.env.alfred_workflow_cache
  || `${tjs.homeDir}/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping`;

try {
  await new KeylessYoudao(`${directory}/website-session.json`).warmup();
} catch { /* The lookup can try again when the user finishes typing. */ }
