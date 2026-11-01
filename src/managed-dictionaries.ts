declare var tjs: any;

import { Result } from './workflow/workflow';

export type ManagedDictionaryName = 'ecdict' | 'cedict';

export interface ManagedDictionaryState {
  version: string;
  installedAt: string;
  entries: number;
  bytes: number;
}

type DictionaryState = Partial<Record<ManagedDictionaryName, ManagedDictionaryState>>;

const ECDICT_API = 'https://api.github.com/repos/skywind3000/ECDICT/contents/ecdict.csv?ref=master';
const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';

export function managedDictionaryDirectory(): string {
  const root = tjs.env.alfred_workflow_data
    || `${tjs.homeDir}/Library/Application Support/Alfred/Workflow Data/com.bitman.wordping`;
  return `${root}/dictionaries`;
}

function statePath(): string { return `${managedDictionaryDirectory()}/state.json`; }
function databasePath(name: ManagedDictionaryName): string { return `${managedDictionaryDirectory()}/${name}.sqlite`; }

async function exists(path: string): Promise<boolean> {
  try { return Boolean((await tjs.stat(path)).isFile); } catch { return false; }
}

async function readState(): Promise<DictionaryState> {
  try { return JSON.parse(new TextDecoder().decode(await tjs.readFile(statePath()))); }
  catch { return {}; }
}

async function writeState(state: DictionaryState): Promise<void> {
  await tjs.makeDir(managedDictionaryDirectory(), { recursive: true });
  const staged = `${statePath()}.new`;
  await tjs.writeFile(staged, JSON.stringify(state, null, 2) + '\n');
  await tjs.rename(staged, statePath());
}

export async function managedDictionaryStatus(): Promise<DictionaryState> {
  const state = await readState();
  for (const name of ['ecdict', 'cedict'] as ManagedDictionaryName[]) {
    if (!await exists(databasePath(name))) delete state[name];
  }
  return state;
}

async function curl(arguments_: string[], output: 'pipe' | 'ignore' = 'pipe'): Promise<string> {
  const process = tjs.spawn(['/usr/bin/curl', '--fail', '--location', '--silent', '--show-error',
    '--max-time', '180', '--user-agent', 'WordPing Alfred workflow', ...arguments_],
  { stdout: output, stderr: 'pipe' });
  const stdout = output === 'pipe' ? await process.stdout.text() : '';
  const stderr = await process.stderr.text();
  const status = await process.wait();
  if (status.exit_status !== 0) throw new Error(stderr.trim() || `Download failed (${status.exit_status})`);
  return stdout;
}

async function download(url: string, path: string, maximum: number): Promise<number> {
  await curl(['--max-filesize', String(maximum), '--output', path, url], 'ignore');
  const bytes = (await tjs.stat(path)).size;
  if (bytes <= 0 || bytes > maximum) throw new Error('Dictionary download is unexpectedly large');
  return bytes;
}

export class CsvParser {
  private row: string[] = [];
  private field = '';
  private quoted = false;
  private quotePending = false;

  push(chunk: string, final = false): string[][] {
    const rows: string[][] = [];
    for (let index = 0; index < chunk.length; index++) {
      const character = chunk[index];
      if (this.quoted) {
        if (this.quotePending) {
          if (character === '"') { this.field += '"'; this.quotePending = false; continue; }
          this.quoted = false;
          this.quotePending = false;
        } else if (character === '"') { this.quotePending = true; continue; }
        else { this.field += character; continue; }
      }
      if (character === '"' && !this.field) this.quoted = true;
      else if (character === ',') { this.row.push(this.field); this.field = ''; }
      else if (character === '\n') {
        this.row.push(this.field.replace(/\r$/, '')); this.field = '';
        rows.push(this.row); this.row = [];
      } else this.field += character;
    }
    if (final) {
      if (this.quotePending) { this.quoted = false; this.quotePending = false; }
      if (this.field || this.row.length) { this.row.push(this.field.replace(/\r$/, '')); rows.push(this.row); }
      this.field = ''; this.row = [];
    }
    return rows;
  }
}

export interface CedictEntry { traditional: string; simplified: string; pinyin: string; definitions: string }

export function parseCedictLine(line: string): CedictEntry | undefined {
  if (!line || line.startsWith('#')) return undefined;
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/$/);
  if (!match) return undefined;
  return { traditional: match[1], simplified: match[2], pinyin: match[3], definitions: match[4] };
}

async function importEcdict(csvPath: string, outputPath: string): Promise<number> {
  const { Database } = await import('tjs:sqlite');
  const db = new Database(outputPath);
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE entries (word TEXT COLLATE NOCASE PRIMARY KEY, phonetic TEXT, definition TEXT, translation TEXT, pos TEXT, exchange TEXT)');
  const insert = db.prepare('INSERT OR REPLACE INTO entries VALUES (?, ?, ?, ?, ?, ?)');
  const parser = new CsvParser();
  const decoder = new TextDecoder();
  const file = await tjs.open(csvPath, 'r');
  let count = 0;
  let first = true;
  const field = (value = '', maximum = 8000) => value.replace(/\0/g, '').slice(0, maximum);
  db.exec('BEGIN');
  try {
    for await (const chunk of file.readable) {
      for (const row of parser.push(decoder.decode(chunk, { stream: true }))) {
        if (first) { first = false; continue; }
        if (!row[0]) continue;
        try { insert.run(field(row[0], 512), field(row[1], 512), field(row[2]), field(row[3]), field(row[4], 512), field(row[10], 2000)); }
        catch (error) { throw new Error(`Cannot index ECDICT row ${count + 2} (${row[0]}): ${error instanceof Error ? error.message : String(error)}`); }
        count++;
      }
    }
    for (const row of parser.push(decoder.decode(), true)) {
      if (!row[0]) continue;
      try { insert.run(field(row[0], 512), field(row[1], 512), field(row[2]), field(row[3]), field(row[4], 512), field(row[10], 2000)); }
      catch (error) { throw new Error(`Cannot index ECDICT row ${count + 2} (${row[0]}): ${error instanceof Error ? error.message : String(error)}`); }
      count++;
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { try { await file.close(); } catch {} db.close(); }
  return count;
}

async function importCedict(gzipPath: string, outputPath: string): Promise<number> {
  const { Database } = await import('tjs:sqlite');
  const db = new Database(outputPath);
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE entries (traditional TEXT, simplified TEXT, pinyin TEXT, definitions TEXT); CREATE INDEX traditional_index ON entries(traditional); CREATE INDEX simplified_index ON entries(simplified)');
  const insert = db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?)');
  const file = await tjs.open(gzipPath, 'r');
  const decoder = new TextDecoder();
  let remainder = '';
  let count = 0;
  db.exec('BEGIN');
  try {
    const stream = file.readable.pipeThrough(new DecompressionStream('gzip'));
    for await (const chunk of stream) {
      const text = remainder + decoder.decode(chunk, { stream: true });
      const lines = text.split('\n');
      remainder = lines.pop() || '';
      for (const line of lines) {
        const entry = parseCedictLine(line.replace(/\r$/, ''));
        if (!entry) continue;
        insert.run(entry.traditional, entry.simplified, entry.pinyin, entry.definitions);
        count++;
      }
    }
    const entry = parseCedictLine((remainder + decoder.decode()).replace(/\r$/, ''));
    if (entry) { insert.run(entry.traditional, entry.simplified, entry.pinyin, entry.definitions); count++; }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { try { await file.close(); } catch {} db.close(); }
  return count;
}

async function replaceDatabase(staged: string, name: ManagedDictionaryName): Promise<void> {
  const destination = databasePath(name);
  await tjs.rename(staged, destination);
}

async function updateEcdict(): Promise<string> {
  const source = JSON.parse(await curl(['--header', 'Accept: application/vnd.github+json', ECDICT_API])) as any;
  if (!source.sha || !source.download_url || source.size > 90_000_000) throw new Error('ECDICT metadata is invalid');
  const sourceUrl = new URL(source.download_url);
  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'raw.githubusercontent.com'
    || !sourceUrl.pathname.startsWith('/skywind3000/ECDICT/')) throw new Error('ECDICT download location is invalid');
  const state = await managedDictionaryStatus();
  if (state.ecdict?.version === source.sha) return `ECDICT is already up to date (${state.ecdict.entries.toLocaleString()} entries).`;
  await tjs.makeDir(managedDictionaryDirectory(), { recursive: true });
  const csv = `${managedDictionaryDirectory()}/ecdict-download.csv`;
  const staged = `${databasePath('ecdict')}.new`;
  try {
    const bytes = await download(source.download_url, csv, 90_000_000);
    if (await exists(staged)) await tjs.remove(staged);
    const entries = await importEcdict(csv, staged);
    if (entries < 500_000) throw new Error('ECDICT import is incomplete');
    await replaceDatabase(staged, 'ecdict');
    state.ecdict = { version: source.sha, installedAt: new Date().toISOString(), entries, bytes };
    await writeState(state);
    return `Installed ECDICT ${entries.toLocaleString()} entries. It is ready for local lookups.`;
  } finally {
    if (await exists(csv)) await tjs.remove(csv);
    if (await exists(staged)) await tjs.remove(staged);
  }
}

async function sha256(path: string): Promise<string> {
  const bytes = await tjs.readFile(path);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function updateCedict(): Promise<string> {
  await tjs.makeDir(managedDictionaryDirectory(), { recursive: true });
  const gzip = `${managedDictionaryDirectory()}/cedict-download.txt.gz`;
  const staged = `${databasePath('cedict')}.new`;
  try {
    const bytes = await download(CEDICT_URL, gzip, 15_000_000);
    const version = await sha256(gzip);
    const state = await managedDictionaryStatus();
    if (state.cedict?.version === version) return `CC-CEDICT is already up to date (${state.cedict.entries.toLocaleString()} entries).`;
    if (await exists(staged)) await tjs.remove(staged);
    const entries = await importCedict(gzip, staged);
    if (entries < 100_000) throw new Error('CC-CEDICT import is incomplete');
    await replaceDatabase(staged, 'cedict');
    state.cedict = { version, installedAt: new Date().toISOString(), entries, bytes };
    await writeState(state);
    return `Installed CC-CEDICT ${entries.toLocaleString()} entries. It is ready for local lookups.`;
  } finally {
    if (await exists(gzip)) await tjs.remove(gzip);
    if (await exists(staged)) await tjs.remove(staged);
  }
}

export async function updateManagedDictionary(name: ManagedDictionaryName): Promise<string> {
  return withInstallationLock(() => name === 'ecdict' ? updateEcdict() : updateCedict());
}

async function withInstallationLock<T>(action: () => Promise<T>): Promise<T> {
  await tjs.makeDir(managedDictionaryDirectory(), { recursive: true });
  const path = `${managedDictionaryDirectory()}/installation.lock`;
  try {
    const stat = await tjs.stat(path);
    if (Date.now() - stat.mtim.getTime() > 30 * 60 * 1000) await tjs.remove(path);
  } catch {}
  let lock: any;
  try { lock = await tjs.open(path, 'wx'); }
  catch { throw new Error('Another dictionary installation is already running'); }
  try { return await action(); }
  finally { await lock.close(); try { await tjs.remove(path); } catch {} }
}

export async function installMissingManagedDictionaries(names: ManagedDictionaryName[]): Promise<boolean> {
  const state = await managedDictionaryStatus();
  const missing = [...new Set(names)].filter((name) => !state[name]);
  if (!missing.length) return false;
  try {
    await withInstallationLock(async () => {
      for (const name of missing) await (name === 'ecdict' ? updateEcdict() : updateCedict());
    });
    return true;
  } catch { return false; /* A later warmup or wp :dictionaries can retry. */ }
}

function splitMeanings(value: string): string[] {
  return value.split(/\r?\n|\\n/).map((part) => part.trim()).filter(Boolean).slice(0, 8);
}

export async function lookupManagedDictionary(
  name: ManagedDictionaryName, word: string, from: string, to: string,
): Promise<Result[]> {
  if (!word || /[\s\0]/.test(word) || !await exists(databasePath(name))) return [];
  if (name === 'ecdict' && (from !== 'en' || !to.startsWith('zh'))) return [];
  if (name === 'cedict' && (!from.startsWith('zh') || to !== 'en')) return [];
  const { Database } = await import('tjs:sqlite');
  const db = new Database(databasePath(name));
  try {
    if (name === 'ecdict') {
      const row = db.prepare('SELECT phonetic, definition, translation, pos FROM entries WHERE word = ? COLLATE NOCASE LIMIT 1').all(word)[0] as any;
      if (!row) return [];
      const meanings = splitMeanings(row.translation || row.definition || '');
      return meanings.map((title) => ({ title, subtitle: `ECDICT · ${from} → ${to}`, arg: title,
        pronounce: word, source: 'ECDICT', partOfSpeech: row.pos || '', phonetics: row.phonetic || '' }));
    }
    const rows = db.prepare('SELECT pinyin, definitions FROM entries WHERE traditional = ? OR simplified = ? LIMIT 8').all(word, word) as any[];
    const results: Result[] = [];
    for (const row of rows) for (const title of String(row.definitions || '').split('/').filter(Boolean).slice(0, 8)) {
      if (!results.some((result) => result.title === title)) results.push({ title,
        subtitle: `CC-CEDICT · ${from} → ${to}`, arg: title, pronounce: word,
        source: 'CC-CEDICT', phonetics: row.pinyin || '' });
    }
    return results.slice(0, 12);
  } finally { db.close(); }
}
