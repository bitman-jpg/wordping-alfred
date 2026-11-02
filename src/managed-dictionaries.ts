declare var tjs: any;

import { Result } from './workflow/workflow';

export type ManagedDictionaryName = 'ecdict' | 'cedict';

export interface ManagedDictionaryState {
  version: string;
  installedAt: string;
  entries: number;
  bytes: number;
  formatVersion?: number;
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
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE entries (word TEXT COLLATE NOCASE PRIMARY KEY, phonetic TEXT, definition TEXT, translation TEXT, pos TEXT, collins TEXT, oxford TEXT, tag TEXT, bnc TEXT, frq TEXT, exchange TEXT, detail TEXT, audio TEXT)');
  const insert = db.prepare('INSERT OR REPLACE INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const appendDefinition = db.prepare('UPDATE entries SET definition = definition || ? WHERE word = ? COLLATE NOCASE');
  const appendTranslation = db.prepare('UPDATE entries SET translation = translation || ? WHERE word = ? COLLATE NOCASE');
  const appendDetail = db.prepare('UPDATE entries SET detail = detail || ? WHERE word = ? COLLATE NOCASE');
  const parser = new CsvParser();
  const decoder = new TextDecoder();
  const file = await tjs.open(csvPath, 'r');
  let count = 0;
  let first = true;
  const clean = (value = '') => value.replace(/\0/g, '');
  const chunks = (value = '', maximum = 8000) => {
    const cleaned = clean(value);
    const values: string[] = [];
    for (let start = 0; start < cleaned.length; start += maximum) values.push(cleaned.slice(start, start + maximum));
    return values.length ? values : [''];
  };
  const add = (row: string[]) => {
    const word = clean(row[0]).slice(0, 512);
    const definition = chunks(row[2]);
    const translation = chunks(row[3]);
    const detail = chunks(row[11]);
    insert.run(word, clean(row[1]).slice(0, 512), definition[0], translation[0],
      clean(row[4]).slice(0, 512), clean(row[5]).slice(0, 128), clean(row[6]).slice(0, 128),
      clean(row[7]).slice(0, 1000), clean(row[8]).slice(0, 128), clean(row[9]).slice(0, 128),
      clean(row[10]).slice(0, 2000), detail[0], clean(row[12]).slice(0, 4000));
    for (const value of definition.slice(1)) appendDefinition.run(value, word);
    for (const value of translation.slice(1)) appendTranslation.run(value, word);
    for (const value of detail.slice(1)) appendDetail.run(value, word);
  };
  db.exec('BEGIN');
  try {
    for await (const chunk of file.readable) {
      for (const row of parser.push(decoder.decode(chunk, { stream: true }))) {
        if (first) { first = false; continue; }
        if (!row[0]) continue;
        try { add(row); }
        catch (error) { throw new Error(`Cannot index ECDICT row ${count + 2} (${row[0]}): ${error instanceof Error ? error.message : String(error)}`); }
        count++;
      }
    }
    for (const row of parser.push(decoder.decode(), true)) {
      if (!row[0]) continue;
      try { add(row); }
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
  if (state.ecdict?.version === source.sha && state.ecdict.formatVersion === 2) {
    return `ECDICT is already up to date (${state.ecdict.entries.toLocaleString()} entries).`;
  }
  await tjs.makeDir(managedDictionaryDirectory(), { recursive: true });
  const csv = `${managedDictionaryDirectory()}/ecdict-download.csv`;
  const staged = `${databasePath('ecdict')}.new`;
  try {
    const bytes = await download(source.download_url, csv, 90_000_000);
    if (await exists(staged)) await tjs.remove(staged);
    const entries = await importEcdict(csv, staged);
    if (entries < 500_000) throw new Error('ECDICT import is incomplete');
    await replaceDatabase(staged, 'ecdict');
    state.ecdict = { version: source.sha, installedAt: new Date().toISOString(), entries, bytes, formatVersion: 2 };
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
    state.cedict = { version, installedAt: new Date().toISOString(), entries, bytes, formatVersion: 1 };
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
  const missing = [...new Set(names)].filter((name) => !state[name]
    || name === 'ecdict' && state.ecdict?.formatVersion !== 2);
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

function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

function displayText(value: unknown): string {
  return String(value ?? '').replace(/\\n/g, '\n').trim();
}

function contentCard(label: string, value: unknown, className = ''): string {
  const content = displayText(value);
  return content ? `<section class="content-section ${className}"><h2>${escapeHTML(label)}</h2><div class="content">${escapeHTML(content)}</div></section>` : '';
}

function sidebarFact(label: string, value: unknown): string {
  const content = displayText(value);
  return content ? `<div class="side-fact"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(content)}</dd></div>` : '';
}

function exchangeSection(exchange: unknown): string {
  const values = new Map<string, string>();
  for (const part of String(exchange ?? '').split('/')) {
    const separator = part.indexOf(':');
    if (separator > 0 && separator < part.length - 1) {
      values.set(part.slice(0, separator), part.slice(separator + 1));
    }
  }
  const labels: Record<string, string> = {
    '0': 'Base form', '1': 'Form type', p: 'Past tense', d: 'Past participle',
    i: 'Present participle', '3': 'Third-person singular', s: 'Plural',
    r: 'Comparative', t: 'Superlative', b: 'Comparative', z: 'Superlative', f: 'Plural',
  };
  const formLabels: Record<string, string> = {
    p: 'past tense', d: 'past participle', i: 'present participle',
    '3': 'third-person singular', s: 'plural', r: 'comparative', t: 'superlative',
    b: 'comparative', z: 'superlative', f: 'plural',
  };
  const order = ['0', '1', 'p', 'd', 'i', '3', 's', 'f', 'r', 'b', 't', 'z'];
  const rendered: Array<[string, string]> = [];
  const seenLabels = new Set<string>();
  for (const code of order) {
    const value = values.get(code);
    const label = labels[code];
    if (!value || !label || seenLabels.has(label)) continue;
    const decoded = code === '1'
      ? [...value].map((type) => formLabels[type] || type).join(' + ') : value;
    rendered.push([label, decoded]);
    seenLabels.add(label);
    values.delete(code);
  }
  for (const [code, value] of values) rendered.push([`Word form (${code})`, value]);
  if (!rendered.length) return '';
  const forms = rendered.map(([label, value]) => `<div class="form"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
  return `<section class="content-section forms"><h2>Word forms</h2><dl class="forms-grid">${forms}</dl></section>`;
}

function dictionaryPage(
  source: string, word: string, from: string, to: string, body: string, phonetic = '', sidebar = '',
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHTML(word)} · ${escapeHTML(source)}</title><style>
:root{color-scheme:light dark;--bg:#edf0f4;--panel:#fff;--sidebar:#202637;--sidebar-text:#f7f8fc;--text:#202533;--muted:#697182;--line:#dfe3ea;--accent:#2f65d9;--shadow:0 20px 52px rgba(31,42,63,.14)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.62 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{width:min(1040px,calc(100% - 48px));margin:0 auto;padding:46px 0 64px}.shell{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:620px;overflow:hidden;border-radius:26px;background:var(--panel);box-shadow:var(--shadow)}
.sidebar{padding:37px 31px;background:var(--sidebar);color:var(--sidebar-text)}.source{margin:0 0 25px;font-size:12px;font-weight:700;letter-spacing:.14em;opacity:.66;text-transform:uppercase}.sidebar h1{margin:0 0 9px;font-size:clamp(34px,5vw,44px);line-height:1.05;letter-spacing:-.045em;overflow-wrap:anywhere}.phonetic{margin:0 0 29px;opacity:.78;overflow-wrap:anywhere}.direction{display:inline-block;margin-bottom:30px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:13px;font-weight:650}
.side-fact{padding:14px 0;border-top:1px solid rgba(255,255,255,.17)}.side-fact dt{margin-bottom:3px;font-size:11px;font-weight:700;letter-spacing:.09em;opacity:.58;text-transform:uppercase}.side-fact dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.reading{padding:43px 47px 58px}.reading-title{margin:0 0 32px;color:var(--accent);font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.content-section+.content-section,.entry+.entry{margin-top:34px;padding-top:30px;border-top:1px solid var(--line)}.content-section h2{margin:0 0 12px;color:var(--muted);font-size:12px;letter-spacing:.11em;text-transform:uppercase}.content{font-size:18px;white-space:pre-wrap;overflow-wrap:anywhere}.primary .content{font-size:24px;line-height:1.42;letter-spacing:-.012em}
.forms-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:0}.form{min-width:0;padding:12px 14px;border-radius:12px;background:var(--bg)}.form dt{margin-bottom:3px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.form dd{margin:0;font-size:15px;font-weight:650;white-space:pre-wrap;overflow-wrap:anywhere}
.entry{padding-bottom:3px}.entry-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:16px}.entry h2{margin:0;font-size:30px;line-height:1.2;letter-spacing:-.025em}.pinyin{color:var(--accent);font-size:15px;font-weight:650}.definitions{margin:0;padding-left:1.3em}.definitions li+li{margin-top:8px}.index{display:block;margin-bottom:3px;color:var(--muted);font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}
@media(max-width:700px){.wrap{width:min(100% - 24px,1040px);padding:18px 0 36px}.shell{grid-template-columns:1fr;border-radius:20px}.sidebar{padding:27px 24px}.sidebar h1{font-size:38px}.direction{margin-bottom:22px}.side-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0 18px}.reading{padding:31px 24px 42px}.entry-head{display:block}.pinyin{display:block;margin-top:5px}}
@media(prefers-color-scheme:dark){:root{--bg:#10141b;--panel:#1a202a;--sidebar:#d6e0f3;--sidebar-text:#111722;--text:#edf1f8;--muted:#9aa6b8;--line:#303846;--accent:#8db1ff;--shadow:0 22px 54px rgba(0,0,0,.32)}.direction{background:rgba(17,23,34,.1)}.side-fact{border-top-color:rgba(17,23,34,.19)}}
</style></head><body><main class="wrap"><article class="shell"><aside class="sidebar"><p class="source">${escapeHTML(source)}</p><h1>${escapeHTML(word)}</h1>${phonetic ? `<p class="phonetic">${escapeHTML(phonetic)}</p>` : ''}<span class="direction">${escapeHTML(from)} → ${escapeHTML(to)}</span><dl class="side-facts">${sidebar}</dl></aside><section class="reading"><p class="reading-title">Complete entry</p>${body}</section></article></main></body></html>`;
}

export async function managedDictionaryPreviewHTML(
  name: ManagedDictionaryName, word: string, from: string, to: string,
): Promise<string | undefined> {
  if (!word || word.length > 512 || /[\0]/.test(word) || !await exists(databasePath(name))) return;
  const { Database } = await import('tjs:sqlite');
  const db = new Database(databasePath(name));
  try {
    if (name === 'ecdict') {
      const row = db.prepare('SELECT * FROM entries WHERE word = ? COLLATE NOCASE LIMIT 1').all(word)[0] as any;
      if (!row) return;
      const facts = [sidebarFact('Part of speech', row.pos),
        sidebarFact('Tags', row.tag), sidebarFact('Collins level', row.collins), sidebarFact('Oxford', row.oxford),
        sidebarFact('BNC rank', row.bnc), sidebarFact('Frequency rank', row.frq)].filter(Boolean).join('');
      const body = [contentCard('Translation', row.translation, 'primary'),
        contentCard('English definition', row.definition), exchangeSection(row.exchange), contentCard('Detail', row.detail),
        contentCard('Audio reference', row.audio)].filter(Boolean).join('');
      return dictionaryPage('ECDICT', row.word || word, from, to, body, row.phonetic || '', facts);
    }
    const rows = db.prepare('SELECT traditional, simplified, pinyin, definitions FROM entries WHERE traditional = ? OR simplified = ?').all(word, word) as any[];
    if (!rows.length) return;
    const body = rows.map((row, index) => {
      const headword = row.traditional === row.simplified ? row.simplified : `${row.traditional} · ${row.simplified}`;
      const definitions = String(row.definitions || '').split('/').filter(Boolean)
        .map((definition) => `<li>${escapeHTML(definition)}</li>`).join('');
      return `<article class="entry"><div class="entry-head"><div><span class="index">Entry ${index + 1}</span><h2>${escapeHTML(headword)}</h2></div><span class="pinyin">${escapeHTML(row.pinyin)}</span></div><ol class="definitions">${definitions}</ol></article>`;
    }).join('');
    return dictionaryPage('CC-CEDICT', word, from, to, body, rows[0].pinyin || '',
      sidebarFact('Matching entries', rows.length));
  } finally { db.close(); }
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
      const row = db.prepare('SELECT * FROM entries WHERE word = ? COLLATE NOCASE LIMIT 1').all(word)[0] as any;
      if (!row) return [];
      const meanings = splitMeanings(row.translation || row.definition || '');
      return meanings.map((title, index) => ({ title, subtitle: `ECDICT · ${from} → ${to}`, arg: title,
        pronounce: word, source: 'ECDICT', partOfSpeech: row.pos || '', phonetics: row.phonetic || '',
        ...(index === 0 ? { previewDictionary: JSON.stringify({ name, word, from, to }) } : {}) }));
    }
    const rows = db.prepare('SELECT traditional, simplified, pinyin, definitions FROM entries WHERE traditional = ? OR simplified = ?').all(word, word) as any[];
    const results: Result[] = [];
    for (const row of rows) for (const title of String(row.definitions || '').split('/').filter(Boolean).slice(0, 8)) {
      if (!results.some((result) => result.title === title)) results.push({ title,
        subtitle: `CC-CEDICT · ${from} → ${to}`, arg: title, pronounce: word,
        source: 'CC-CEDICT', phonetics: row.pinyin || '' });
    }
    if (results.length) results[0].previewDictionary = JSON.stringify({ name, word, from, to });
    return results.slice(0, 12);
  } finally { db.close(); }
}
