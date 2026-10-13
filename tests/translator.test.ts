import Translator from '../src/translator';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
let calls: string[] = [];
let responseFor: (url: URL) => any;
(globalThis as any).fetch = async (input: string) => {
  const url = new URL(input);
  calls.push(url.hostname === 'dict.youdao.com' ? 'dictionary' : url.searchParams.get('to') || '');
  return { ok: true, status: 200, text: async () => JSON.stringify(responseFor(url)) };
};

function api(translation: string, detected?: string): any {
  return { errorCode: '0', translation: [translation], ...(detected ? { l: detected } : {}) };
}

try {
  const translator = new Translator('test-key', 'test-secret', 'Youdao', 'zh-CHS', 'en');

  calls = [];
  responseFor = () => api('美国国家航空航天局（NASA）', 'en2zh-CHS');
  let output = JSON.parse(await translator.translate('nasa'));
  assert(output.items[0].title === '美国国家航空航天局（NASA）', 'English acronyms should translate to native language');
  assert(calls.join(',') === 'zh-CHS', 'learning-language input should request native language directly');

  calls = [];
  responseFor = (url) => api(url.searchParams.get('to') === 'en' ? 'hello' : '你好', 'zh-CHS2en');
  output = JSON.parse(await translator.translate('你好'));
  assert(output.items[0].title === 'hello', 'native-language input should translate to learning language');
  assert(calls.join(',') === 'zh-CHS,en', 'native-language input should request the learning language');

  calls = [];
  responseFor = () => api('你好', 'fr2zh-CHS');
  output = JSON.parse(await translator.translate('bonjour'));
  assert(output.items[0].title === '你好', 'third-language input should translate to native language');
  assert(calls.join(',') === 'zh-CHS', 'detected third-language input needs one request');

  calls = [];
  responseFor = (url) => api(url.searchParams.get('to') === 'en' ? 'bank' : '银行');
  output = JSON.parse(await translator.translate('banco'));
  assert(output.items.length === 2, 'uncertain input should show both useful directions');
  assert(output.items[0].subtitle.startsWith('zh-CHS ·'), 'uncertain results should label the native direction');
  assert(output.items[1].subtitle.startsWith('en ·'), 'uncertain results should label the learning direction');

  calls = [];
  responseFor = (url) => url.hostname === 'dict.youdao.com'
    ? { web_trans: { 'web-translation': [{ key: 'NASA', trans: [{ value: '美国国家航空航天局' }] }] } }
    : api('NASA', 'en2zh-CHS');
  output = JSON.parse(await translator.translate('NASA'));
  assert(output.items[0].title === '美国国家航空航天局', 'echoed translations should use dictionary fallback');
  assert(calls.join(',') === 'zh-CHS,en,dictionary', 'dictionary lookup should follow echoed translations');
} finally {
  (globalThis as any).fetch = originalFetch;
}

console.log('Translator routing tests passed');
