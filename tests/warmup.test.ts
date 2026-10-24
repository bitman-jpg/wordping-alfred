import KeylessYoudao from '../src/keyless-youdao';

declare var tjs: any;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const directory = await tjs.makeTempDir('/tmp/wordping-warmup-XXXXXX');
const path = `${directory}/website-session.json`;
const originalFetch = globalThis.fetch;
let requests = 0;
let keyRequests = 0;
let translationRequests = 0;
let coordinateFailures = false;
const pendingFailures: (() => void)[] = [];
globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
  requests++;
  const url = String(input);
  if (url === 'https://fanyi.youdao.com') return new Response(
    '<script src="https://shared.ydstatic.com/dict/translation-website/test/js/app.test.js"></script>',
  );
  if (url.includes('app.test.js')) return new Response('="webfanyi-key-getter-123",foo="public-key"');
  if (url.includes('/webtranslate/key')) {
    keyRequests++;
    return Response.json({
      code: 0, data: { secretKey: `session-key-${keyRequests}`, aesKey: 'aes-key', aesIv: 'aes-iv' },
    });
  }
  if (url === 'https://dict.youdao.com/webtranslate') {
    translationRequests++;
    if (coordinateFailures && translationRequests <= 4) {
      await new Promise<void>((resolve) => {
        pendingFailures.push(resolve);
        if (pendingFailures.length === 2) pendingFailures.forEach((release) => release());
      });
    }
    return new Response('invalid encrypted response');
  }
  throw new Error(`Unexpected warmup request: ${url}`);
};

try {
  await Promise.all([new KeylessYoudao(path).warmup(), new KeylessYoudao(path).warmup()]);
  assert(requests === 3, `concurrent warmups should share one website bootstrap; got ${requests} requests`);
  await new KeylessYoudao(path).warmup();
  assert(requests === 3, 'warmup should reuse a saved website session');

  const saved = JSON.parse(new TextDecoder().decode(await tjs.readFile(path)));
  saved.createdAt -= 23 * 60 * 60 * 1000;
  await tjs.writeFile(path, JSON.stringify(saved));
  await new KeylessYoudao(path).warmup();
  assert(requests === 3, 'warmup should reuse keys less than a day old');
  saved.createdAt -= 2 * 60 * 60 * 1000;
  await tjs.writeFile(path, JSON.stringify(saved));
  await new KeylessYoudao(path).warmup();
  assert(requests === 6 && keyRequests === 2, 'warmup should refresh keys after a day');

  let failed = false;
  try {
    await new KeylessYoudao(path).lookup('beat', 'en', 'zh-CN');
  } catch (error) {
    failed = true;
    assert(error instanceof Error, 'failed lookup should report an error');
  }
  assert(failed, 'invalid response should fail after one retry');
  assert(keyRequests === 3, 'failed lookup should fetch one fresh session');
  assert(translationRequests === 2, 'failed lookup should retry translation only once');
  await new KeylessYoudao(path).warmup();
  assert(requests === 11, 'warmup should reuse the refreshed session');

  coordinateFailures = true;
  const simultaneous = await Promise.allSettled([
    new KeylessYoudao(path).lookup('beat', 'en', 'zh-CN'),
    new KeylessYoudao(path).lookup('shift', 'en', 'zh-CN'),
  ]);
  assert(simultaneous.every((result) => result.status === 'rejected'), 'both invalid lookups should fail');
  assert(keyRequests === 4, 'simultaneous failures should share one fresh session');
  assert(translationRequests === 6, 'each lookup should retry only once');

  try {
    await new KeylessYoudao(path).probe('hello', 'en', 'zh-CN');
  } catch { /* The response is deliberately invalid. */ }
  assert(keyRequests === 4, 'expiry probe must not refresh failed keys');
  assert(translationRequests === 7, 'expiry probe should make exactly one translation request');

  await new KeylessYoudao(path).refresh();
  assert(keyRequests === 5, 'explicit renewal should fetch fresh keys even with a cached session');

  const eventsText = new TextDecoder().decode(await tjs.readFile(`${directory}/website-session-key-events.json`));
  const events = JSON.parse(eventsText);
  assert(events.some((event: any) => event.event === 'scheduled-refresh' && event.ageHours >= 24),
    'scheduled refresh should record the previous key age');
  assert(events.some((event: any) => event.event === 'lookup-retry-failed'),
    'unresolved lookup failures should remain visible in the key log');
  assert(!eventsText.includes('session-key-') && !eventsText.includes('beat'),
    'key log should not contain keys or lookup text');
} finally {
  globalThis.fetch = originalFetch;
  await tjs.remove(directory, { recursive: true });
}

console.log('Website warmup tests passed');
