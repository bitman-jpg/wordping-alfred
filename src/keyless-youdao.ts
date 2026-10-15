import md5 from './libs/md5';

declare var tjs: any;

export interface WebTranslation {
  code: number;
  type?: string;
  translateResult?: { tgt?: string; src?: string }[][];
  dictResult?: any;
}

interface WebsiteSession {
  createdAt: number;
  signingKey: string;
  aesKey: string;
  aesIv: string;
}

const HOME = 'https://fanyi.youdao.com';
const API = 'https://dict.youdao.com/webtranslate';
const SESSION_AGE = 20 * 60 * 1000;

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

  private async load(): Promise<WebsiteSession | undefined> {
    if (this.session && Date.now() - this.session.createdAt < SESSION_AGE) return this.session;
    try {
      const bytes = await tjs.readFile(this.sessionPath);
      const saved = JSON.parse(new TextDecoder().decode(bytes)) as WebsiteSession;
      if (saved.signingKey && saved.aesKey && saved.aesIv && Date.now() - saved.createdAt < SESSION_AGE) {
        this.session = saved;
        return saved;
      }
    } catch { /* A missing session is normal on first use. */ }
    return undefined;
  }

  private async bootstrap(): Promise<WebsiteSession> {
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
    this.session = session;
    try {
      await tjs.makeDir(this.sessionPath.slice(0, this.sessionPath.lastIndexOf('/')), { recursive: true });
      await tjs.writeFile(this.sessionPath, JSON.stringify(session));
    } catch { /* Lookups can work without a writable cache. */ }
    return session;
  }

  async lookup(word: string, from: string, to: string): Promise<WebTranslation> {
    const current = await this.load() || await this.bootstrap();
    try {
      const first = await this.translate(word, from, to, current);
      return first.code === 50 ? this.translate(word, from, to, current) : first;
    } catch {
      // Website keys rotate. One refresh is enough before reporting the error.
      return this.translate(word, from, to, await this.bootstrap());
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
