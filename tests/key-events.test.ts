import KeylessYoudao from '../src/keyless-youdao';
import md5 from '../src/libs/md5';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function hexBytes(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
  return bytes.buffer;
}

async function encryptedResponse(code = 0): Promise<string> {
  const key = await crypto.subtle.importKey('raw', hexBytes(md5('new-aes')), 'AES-CBC', false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: hexBytes(md5('new-iv')) },
    key,
    new TextEncoder().encode(JSON.stringify({ code, type: 'en2zh-CHS',
      translateResult: [[{ tgt: '节拍' }]] })),
  );
  return btoa(String.fromCharCode(...new Uint8Array(cipher)));
}

const directory = await tjs.makeTempDir('/tmp/wordping-key-events-XXXXXX');
const sessionPath = `${directory}/website-session.json`;
const originalFetch = globalThis.fetch;
let translations = 0;
const goodResponse = await encryptedResponse();
const code50Response = await encryptedResponse(50);
let returnCode50 = false;

globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  if (url === 'https://fanyi.youdao.com') return new Response(
    '<script src="https://shared.ydstatic.com/dict/translation-website/test/js/app.test.js"></script>',
  );
  if (url.includes('app.test.js')) return new Response('="webfanyi-key-getter-123",foo="public-key"');
  if (url.includes('/webtranslate/key')) return Response.json({ code: 0,
    data: { secretKey: 'new-secret', aesKey: 'new-aes', aesIv: 'new-iv' } });
  if (url === 'https://dict.youdao.com/webtranslate') {
    translations++;
    return new Response(returnCode50 ? code50Response : translations === 1 ? btoa('invalid block') : goodResponse);
  }
  throw new Error(`Unexpected request: ${url}`);
};

try {
  await tjs.writeFile(sessionPath, JSON.stringify({ createdAt: Date.now() - 3 * 60 * 60 * 1000,
    signingKey: 'old-secret', aesKey: 'old-aes', aesIv: 'old-iv' }));
  const result = await new KeylessYoudao(sessionPath).lookup('beat', 'auto', 'zh-CHS');
  assert(result.code === 0 && translations === 2, 'fresh keys should recover a failed lookup once');
  const log = new TextDecoder().decode(await tjs.readFile(`${directory}/website-session-key-events.json`));
  const events = JSON.parse(log);
  assert(events.length === 1 && events[0].event === 'possible-expiry', 'possible expiry should be logged');
  assert(events[0].keysChanged && events[0].failure === 'decode' && events[0].responseCode === 0,
    'log should distinguish possible expiry from other failures');
  assert(events[0].ageHours >= 2.9 && events[0].ageHours <= 3.1, 'log should record failed key age');
  assert(events[0].firstSeenHours >= 2.9 && events[0].firstSeenHours <= 3.1,
    'log should record how long the key values have been observed');
  assert(!log.includes('old-secret') && !log.includes('new-secret') && !log.includes('beat'),
    'log should never include keys or query text');

  const saved = JSON.parse(new TextDecoder().decode(await tjs.readFile(sessionPath)));
  saved.firstSeenAt -= 48 * 60 * 60 * 1000;
  await tjs.writeFile(sessionPath, JSON.stringify(saved));
  await new KeylessYoudao(sessionPath).refresh();
  const renewed = JSON.parse(new TextDecoder().decode(await tjs.readFile(sessionPath)));
  assert(renewed.firstSeenAt === saved.firstSeenAt,
    'refetching identical keys must preserve when they were first observed');
  const refreshedLog = JSON.parse(new TextDecoder().decode(
    await tjs.readFile(`${directory}/website-session-key-events.json`)));
  assert(refreshedLog[1].event === 'scheduled-refresh' && !refreshedLog[1].keysChanged,
    'daily refresh should be distinguished from an expiry event');
  assert(refreshedLog[1].firstSeenHours >= 48, 'daily refresh should retain original key age');

  returnCode50 = true;
  const unavailable = await new KeylessYoudao(sessionPath).lookup('NASA', 'auto', 'zh-CHS');
  assert(unavailable.code === 50, 'code 50 should be returned for translation fallback');
  const finalLog = JSON.parse(new TextDecoder().decode(
    await tjs.readFile(`${directory}/website-session-key-events.json`)));
  assert(finalLog[2].event === 'translation-code-50' && finalLog[2].responseCode === 50,
    'code 50 should be recorded without marking key expiry');
} finally {
  globalThis.fetch = originalFetch;
  await tjs.remove(directory, { recursive: true });
}

console.log('Website key event tests passed');
