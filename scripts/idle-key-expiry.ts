import KeylessYoudao from '../src/keyless-youdao';

declare var tjs: any;

interface SessionSnapshot {
  createdAt: number;
  signingKey: string;
  aesKey: string;
  aesIv: string;
}

interface ExperimentState {
  phase: 'waiting' | 'daily' | 'complete';
  idleHours: number;
  lowerHours: number;
  upperHours?: number;
  idleSince: number;
  dueAt: number;
  result?: string;
}

const directory = tjs.env.WORDPING_IDLE_PROBE_DIR;
if (!directory) throw new Error('WORDPING_IDLE_PROBE_DIR is required');
const alfredSessionPath = tjs.env.WORDPING_ALFRED_SESSION;
const sessionPath = `${directory}/session.json`;
const statePath = `${directory}/state.json`;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await tjs.readFile(path))) as T;
}

async function save(state: ExperimentState): Promise<void> {
  await tjs.writeFile(statePath, JSON.stringify(state));
}

async function check(provider: KeylessYoudao): Promise<string | undefined> {
  try {
    const response = await provider.probe('hello', 'auto', 'zh-CHS');
    if (response.code !== 0) return `response code ${response.code}`;
    if (!(response.translateResult || []).flat().some((item) => item.tgt?.trim())) return 'empty translation';
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function nextHours(state: ExperimentState): number | undefined {
  if (state.upperHours === undefined) return undefined;
  if (state.upperHours - state.lowerHours <= 1) return undefined;
  return (state.lowerHours + state.upperHours) / 2;
}

async function schedule(state: ExperimentState, hours: number, now: number): Promise<void> {
  state.idleHours = hours;
  state.idleSince = now;
  state.dueAt = now + hours * 60 * 60 * 1000;
  await save(state);
  console.log(`Next idle check: ${hours}h at ${new Date(state.dueAt).toISOString()}`);
}

async function renewDaily(state: ExperimentState): Promise<void> {
  if (!alfredSessionPath) throw new Error('WORDPING_ALFRED_SESSION is required for daily renewal');
  try {
    await new KeylessYoudao(alfredSessionPath).refresh();
    state.dueAt = Date.now() + 24 * 60 * 60 * 1000;
    console.log(`WordPing keys refreshed; next renewal ${new Date(state.dueAt).toISOString()}`);
  } catch (error) {
    state.dueAt = Date.now() + 60 * 60 * 1000;
    console.log(`Daily refresh failed; retrying in one hour: ${error instanceof Error ? error.message : String(error)}`);
  }
  await save(state);
}

const state = await readJson<ExperimentState>(statePath);
if (state.phase === 'daily' && Date.now() >= state.dueAt) await renewDaily(state);
if (state.phase === 'waiting' && Date.now() >= state.dueAt) {
  const checkedAt = new Date().toISOString();
  const actualHours = ((Date.now() - state.idleSince) / 3600000).toFixed(2);
  const original = new KeylessYoudao(sessionPath);
  let failure = await check(original);
  if (!failure) {
    console.log(`${checkedAt}: original keys VALID after ${actualHours}h idle`);
    state.lowerHours = Math.max(state.lowerHours, state.idleHours);
    const next = nextHours(state);
    if (next === undefined) {
      if (state.upperHours === undefined) {
        state.phase = 'daily';
        state.result = `Keys survived ${state.idleHours}h idle; refreshing WordPing keys daily.`;
        await save(state);
        console.log(state.result);
        await renewDaily(state);
      } else {
        state.phase = 'complete';
        state.result = `Idle failure bracket: ${state.lowerHours}–${state.upperHours}h.`;
        await save(state);
        console.log(state.result);
      }
    } else {
      await schedule(state, next, Date.now());
    }
  } else {
    console.log(`${checkedAt}: original keys failed after ${actualHours}h idle: ${failure}`);
    const repeated = await check(original);
    if (!repeated) {
      console.log('Immediate retry succeeded; the first failure was transient.');
      await schedule(state, state.idleHours, Date.now());
    } else {
      console.log(`Original keys failed again: ${repeated}`);
      const freshPath = `${directory}/fresh-session.json`;
      try {
        try { await tjs.remove(freshPath); } catch { /* No prior comparison is normal. */ }
        const fresh = new KeylessYoudao(freshPath);
        await fresh.warmup();
        const freshFailure = await check(fresh);
        const oldSession = await readJson<SessionSnapshot>(sessionPath);
        const newSession = await readJson<SessionSnapshot>(freshPath);
        const changed = oldSession.signingKey !== newSession.signingKey
          || oldSession.aesKey !== newSession.aesKey || oldSession.aesIv !== newSession.aesIv;
        console.log(`Fresh keys ${changed ? 'differ' : 'match'}; lookup ${freshFailure || 'OK'}`);
        if (changed && !freshFailure) {
          state.upperHours = Math.min(state.upperHours ?? Infinity, state.idleHours);
          const next = nextHours(state);
          if (next === undefined) {
            state.phase = 'complete';
            state.result = `Idle failure bracket: ${state.lowerHours}–${state.upperHours}h.`;
            await save(state);
            console.log(state.result);
          } else {
            await tjs.writeFile(sessionPath, JSON.stringify(newSession));
            await schedule(state, next, Date.now());
          }
        } else {
          state.dueAt = Date.now() + 15 * 60 * 1000;
          await save(state);
          console.log('Inconclusive; retrying the original keys in 15 minutes.');
        }
      } catch (error) {
        state.dueAt = Date.now() + 15 * 60 * 1000;
        await save(state);
        console.log(`Fresh-key check inconclusive: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        try { await tjs.remove(freshPath); } catch { /* Best effort cleanup. */ }
      }
    }
  }
}
