import md5 from './libs/md5';

declare var tjs: any;

export interface WebTranslation {
  code: number;
  type?: string;
  translateResult?: { tgt?: string; src?: string; tgtPronounce?: string; srcPronounce?: string }[][];
  dictResult?: any;
}

interface WebsiteSession {
  createdAt: number;
  firstSeenAt?: number;
  signingKey: string;
  aesKey: string;
  aesIv: string;
}

interface KeyEvent {
  at: string;
  event: 'scheduled-refresh' | 'possible-expiry' | 'translation-code-50' | 'lookup-recovered' | 'lookup-retry-failed' | 'refresh-failed';
  ageHours: number;
  firstSeenHours: number;
  keysChanged?: boolean;
  failure?: string;
  responseCode?: number;
  source?: 'warmup' | 'daily';
}

const HOME = 'https://fanyi.youdao.com';
const API = 'https://dict.youdao.com/webtranslate';
const WARMUP_MAX_AGE = 24 * 60 * 60 * 1000;

function sameSession(a: WebsiteSession, b: WebsiteSession): boolean {
  return a.createdAt === b.createdAt && sameKeys(a, b);
}

function sameKeys(a: WebsiteSession, b: WebsiteSession): boolean {
  return a.signingKey === b.signingKey && a.aesKey === b.aesKey && a.aesIv === b.aesIv;
}

function failureKind(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (error.name === 'AbortError' || /aborted|timed out/i.test(error.message)) return 'timeout';
  const http = error.message.match(/HTTP (\d{3})/);
  if (http) return `http-${http[1]}`;
  if (error.name === 'OperationError' || /cipher|decrypt|invalid character/i.test(error.message)) return 'decode';
  return error.name || 'error';
}

function bytesFromHex(hex: string): ArrayBuffer {
  const pairs = hex.match(/../g);
  if (!pairs) throw new Error('Invalid translation response key');
  const bytes = new Uint8Array(pairs.length);
  pairs.forEach((pair, index) => { bytes[index] = Number.parseInt(pair, 16); });
  return bytes.buffer;
}

function signedFields(keyId: string, signingKey: string, timestamp: number): Record<string, string> {
  const mysticTime = String(timestamp);
  const sign = md5(`client=fanyideskweb&mysticTime=${mysticTime}&product=webfanyi&key=${signingKey}`);
  return {
    keyid: keyId, mysticTime, sign, client: 'fanyideskweb', product: 'webfanyi',
    appVersion: '12.0.0', vendor: 'web', keyfrom: 'fanyi.web',
    pointParam: 'client,mysticTime,product', yduuid: 'abcdefg',
    mid: '1', screen: '1', model: '1', network: 'wifi', abtest: '0',
  };
}

async function request(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Youdao website returned HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function decrypt(body: string, session: WebsiteSession): Promise<WebTranslation> {
  const encoded = body.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(encoded);
  const cipher = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) cipher[index] = raw.charCodeAt(index);
  const key = await crypto.subtle.importKey('raw', bytesFromHex(md5(session.aesKey)), 'AES-CBC', false, ['decrypt']);
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: bytesFromHex(md5(session.aesIv)) }, key, cipher.buffer,
  );
  return JSON.parse(new TextDecoder().decode(clear));
}

export default class KeylessYoudao {
  private session?: WebsiteSession;

  constructor(private sessionPath: string) {}

  private async logEvent(event: Omit<KeyEvent, 'at' | 'ageHours'>, old: WebsiteSession): Promise<void> {
    const path = this.sessionPath.replace(/\.json$/, '-key-events.json');
    const ageHours = Math.round((Date.now() - old.createdAt) / 36000) / 100;
    const firstSeenHours = Math.round((Date.now() - (old.firstSeenAt || old.createdAt)) / 36000) / 100;
    try {
      let entries: KeyEvent[] = [];
      try {
        const saved = JSON.parse(new TextDecoder().decode(await tjs.readFile(path)));
        if (Array.isArray(saved)) entries = saved;
      } catch { /* The first event starts a new log. */ }
      entries.push({ ...event, at: new Date().toISOString(), ageHours, firstSeenHours });
      await tjs.writeFile(path, JSON.stringify(entries.slice(-200), null, 2));
    } catch { /* Logging must never prevent translation. */ }
    if (event.event === 'possible-expiry' && tjs.env.developerMode === '1') {
      try {
        const message = `Website keys may have expired after ${firstSeenHours} hours; fresh keys restored translation.`;
        await tjs.spawn(['/usr/bin/osascript', '-e',
          `display notification "${message}" with title "WordPing developer mode"`]).wait();
      } catch { /* Notifications must never prevent translation. */ }
    }
  }

  private async load(fromDisk = false): Promise<WebsiteSession | undefined> {
    if (this.session && !fromDisk) return this.session;
    try {
      const bytes = await tjs.readFile(this.sessionPath);
      const saved = JSON.parse(new TextDecoder().decode(bytes)) as WebsiteSession;
      if (saved.signingKey && saved.aesKey && saved.aesIv) {
        this.session = saved;
        return saved;
      }
    } catch { /* A missing session is normal on first use. */ }
    return undefined;
  }

  private async bootstrap(stale?: WebsiteSession): Promise<WebsiteSession> {
    const directory = this.sessionPath.slice(0, this.sessionPath.lastIndexOf('/'));
    await tjs.makeDir(directory, { recursive: true });
    const lockPath = `${this.sessionPath}.warming`;
    let ownsLock = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const saved = await this.load(true);
      if (saved && (!stale || !sameSession(saved, stale))) return saved;
      try {
        await tjs.makeDir(lockPath);
        ownsLock = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    try {
      const saved = await this.load(true);
      return saved && (!stale || !sameSession(saved, stale)) ? saved : await this.fetchSession(saved || stale);
    } finally {
      if (ownsLock) await tjs.remove(lockPath);
    }
  }

  async warmup(): Promise<void> {
    const current = await this.load();
    if (current && Date.now() - current.createdAt < WARMUP_MAX_AGE) return;
    const fresh = await this.bootstrap(current);
    if (current && !sameSession(current, fresh)) {
      await this.logEvent({ event: 'scheduled-refresh', source: 'warmup', keysChanged: !sameKeys(current, fresh) }, current);
    }
  }

  async refresh(): Promise<void> {
    const current = await this.load();
    const fresh = await this.bootstrap(current);
    if (current && !sameSession(current, fresh)) {
      await this.logEvent({ event: 'scheduled-refresh', source: 'daily', keysChanged: !sameKeys(current, fresh) }, current);
    }
  }

  private async fetchSession(previous?: WebsiteSession): Promise<WebsiteSession> {
    const html = await (await request(HOME)).text();
    const scriptUrl = html.match(/https:\/\/shared\.ydstatic\.com\/dict\/translation-website\/[^"']+\/js\/app\.[^"']+\.js/)?.[0];
    if (!scriptUrl) throw new Error('Youdao changed its website; cannot find translation script');
    const script = await (await request(scriptUrl)).text();
    const keyId = script.match(/webfanyi-key-getter-\d+/)?.[0];
    const publicKey = keyId && script.match(new RegExp(`="${keyId}",\\w+="([^"]+)"`))?.[1];
    if (!keyId || !publicKey) throw new Error('Youdao changed its website signing key');
    const url = new URL(`${API}/key`);
    url.search = new URLSearchParams(signedFields(keyId, publicKey, Date.now())).toString();
    const answer = await (await request(url.toString())).json();
    if (answer.code !== 0 || !answer.data?.secretKey) throw new Error('Youdao website key request failed');
    const session: WebsiteSession = {
      createdAt: Date.now(), signingKey: answer.data.secretKey,
      aesKey: answer.data.aesKey || script.match(/decodeKey:"([^"]+)"/)?.[1],
      aesIv: answer.data.aesIv || script.match(/decodeIv:"([^"]+)"/)?.[1],
    };
    if (!session.aesKey || !session.aesIv) throw new Error('Youdao changed its response encryption');
    session.firstSeenAt = previous && sameKeys(previous, session)
      ? previous.firstSeenAt || previous.createdAt : session.createdAt;
    this.session = session;
    try {
      await tjs.writeFile(this.sessionPath, JSON.stringify(session));
    } catch { /* Lookups can work without a writable cache. */ }
    return session;
  }

  // Diagnostic use: keep the original session and expose failures without refreshing it.
  async probe(word: string, from: string, to: string): Promise<WebTranslation> {
    const current = await this.load();
    if (!current) throw new Error('No website session to probe');
    return this.translate(word, from, to, current);
  }

  async lookup(word: string, from: string, to: string): Promise<WebTranslation> {
    const current = await this.load() || await this.bootstrap();
    try {
      const response = await this.translate(word, from, to, current);
      if (response.code === 50) {
        await this.logEvent({ event: 'translation-code-50', responseCode: 50 }, current);
      }
      return response;
    } catch (firstError) {
      // A failed request is not proof of expiry. Compare one retry with fresh keys.
      let fresh: WebsiteSession;
      try {
        fresh = await this.bootstrap(current);
      } catch (refreshError) {
        await this.logEvent({ event: 'refresh-failed', failure: failureKind(firstError) }, current);
        throw refreshError;
      }
      const keysChanged = !sameKeys(current, fresh);
      try {
        const response = await this.translate(word, from, to, fresh);
        const failure = failureKind(firstError);
        const event = response.code !== 0 ? 'lookup-retry-failed'
          : keysChanged && failure === 'decode' ? 'possible-expiry' : 'lookup-recovered';
        await this.logEvent({ event, failure,
          keysChanged, responseCode: response.code }, current);
        return response;
      } catch (retryError) {
        await this.logEvent({ event: 'lookup-retry-failed', failure: failureKind(firstError), keysChanged }, current);
        throw retryError;
      }
    }
  }

  private async translate(word: string, from: string, to: string, session: WebsiteSession): Promise<WebTranslation> {
    const body = new URLSearchParams({
      i: word, from, to: from === 'auto' ? '' : to, dictResult: 'true', useTerm: 'false',
      ...signedFields('webfanyi', session.signingKey, Date.now()),
    });
    const response = await request(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${HOME}/` },
      body: body.toString(),
    });
    return decrypt(await response.text(), session);
  }
}
