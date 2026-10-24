import KeylessYoudao from '../src/keyless-youdao';

declare var tjs: any;

interface SessionSnapshot {
  createdAt: number;
  signingKey: string;
  aesKey: string;
  aesIv: string;
}

interface ProbeState {
  lastSuccess?: string;
  complete?: boolean;
  conclusion?: string;
}

const sessionPath = tjs.env.WORDPING_PROBE_SESSION;
const statePath = tjs.env.WORDPING_PROBE_STATE;
const intervalMs = Number(tjs.env.WORDPING_PROBE_INTERVAL_MS || 60000);
const maxChecks = Number(tjs.env.WORDPING_PROBE_MAX_CHECKS || 0);
if (!sessionPath || !Number.isFinite(intervalMs) || intervalMs < 1000
  || !Number.isInteger(maxChecks) || maxChecks < 0) {
  throw new Error('Invalid probe configuration');
}

async function snapshot(path: string): Promise<SessionSnapshot> {
  return JSON.parse(new TextDecoder().decode(await tjs.readFile(path)));
}

async function loadState(): Promise<ProbeState> {
  if (!statePath) return {};
  try {
    return JSON.parse(new TextDecoder().decode(await tjs.readFile(statePath)));
  } catch { return {}; }
}

async function saveState(state: ProbeState): Promise<void> {
  if (statePath) await tjs.writeFile(statePath, JSON.stringify(state));
}

function sameKeys(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return a.signingKey === b.signingKey && a.aesKey === b.aesKey && a.aesIv === b.aesIv;
}

async function check(provider: KeylessYoudao): Promise<string | undefined> {
  try {
    const response = await provider.probe('hello', 'auto', 'zh-CHS');
    if (response.code !== 0) return `response code ${response.code}`;
    if (!(response.translateResult || []).flat().some((item) => item.tgt?.trim())) {
      return 'empty translation';
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function transientFailure(reason: string): boolean {
  return /aborted|timed out|network|failed to fetch|HTTP (429|5\d\d)/i.test(reason);
}

async function main(): Promise<void> {
  const state = await loadState();
  if (state.complete) return;

  const original = new KeylessYoudao(sessionPath);
  await original.warmup();
  const first = await snapshot(sessionPath);
  console.log(`Session fetched ${new Date(first.createdAt).toISOString()}; checking every ${intervalMs / 1000} seconds.`);

  const started = Date.now();
  for (let count = 1; maxChecks === 0 || count <= maxChecks; count++) {
    const waitMs = started + (count - 1) * intervalMs - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    const checkedAt = new Date().toISOString();
    const ageMinutes = ((Date.now() - first.createdAt) / 60000).toFixed(1);
    const failure = await check(original);
    if (!failure) {
      state.lastSuccess = checkedAt;
      await saveState(state);
      console.log(`${checkedAt}\tage=${ageMinutes}m\tOK`);
      continue;
    }
    console.log(`${checkedAt}\tage=${ageMinutes}m\tFAILED: ${failure}`);

    const repeated = await check(original);
    if (!repeated) {
      state.lastSuccess = new Date().toISOString();
      await saveState(state);
      console.log('Immediate retry succeeded; treating the failure as transient.');
      continue;
    }
    console.log(`Same keys failed again: ${repeated}`);
    if (transientFailure(failure) || transientFailure(repeated)) {
      console.log('Request or network failure; keeping the original keys for the next check.');
      continue;
    }

    const freshPath = `${sessionPath}.fresh`;
    try {
      try { await tjs.remove(freshPath); } catch { /* No earlier comparison is normal. */ }
      const fresh = new KeylessYoudao(freshPath);
      await fresh.warmup();
      const second = await snapshot(freshPath);
      const freshFailure = await check(fresh);
      const changed = !sameKeys(first, second);
      console.log(`Newly fetched keys: ${changed ? 'different' : 'identical'}; lookup: ${freshFailure || 'OK'}`);
      state.conclusion = changed && !freshFailure
        ? `Old keys likely stopped working between ${state.lastSuccess || 'session creation'} and ${checkedAt}.`
        : 'Inconclusive: the failures do not establish a key expiry time.';
      state.complete = changed && !freshFailure;
    } catch (error) {
      console.log(`Fresh-key check failed: ${error instanceof Error ? error.message : String(error)}`);
      state.conclusion = 'Inconclusive: the failures do not establish a key expiry time.';
    } finally {
      try { await tjs.remove(freshPath); } catch { /* Best effort cleanup. */ }
    }
    await saveState(state);
    console.log(state.conclusion);
    if (state.complete) break;
  }
}

await main();
