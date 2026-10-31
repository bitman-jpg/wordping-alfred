import { icibaPreviewHTML, previewCompatibility } from '../src/iciba-preview';
import { previewHandler } from '../src/preview-handler';
import { preparePreviews } from '../src/preview-client';
declare var tjs: any;

function assert(value: boolean, message: string): void { if (!value) throw new Error(message); }

// Exercise the missing-storage environment that actually breaks Quick Look.
const window: any = { fetch: () => Promise.resolve(new Response('ok')) };
const opened: any[] = [];
function XHR() {}
XHR.prototype.open = (...args: any[]) => opened.push(args);
const history = { replaceState: () => {} };
new Function('window', 'history', 'document', 'location', 'XMLHttpRequest', previewCompatibility)(
  window, history, { baseURI: 'https://www.iciba.com/' },
  { pathname: '/token/word', origin: 'http://127.0.0.1:1234' }, XHR);
window.localStorage.setItem('history', 'residue');
assert(window.localStorage.getItem('history') === 'residue' && window.localStorage.length === 1,
  'iCIBA startup and search history must work when Quick Look has no localStorage');
window.localStorage.clear();
assert(window.localStorage.getItem('history') === null, 'storage should implement clear');
const upstreamURL = 'https://service.iciba.com/chat/word/v1?client=6&key=1000006&word=residue&signature=test';
new XHR().open('GET', upstreamURL);
const encodedURL = opened[0][1];
assert(atob(encodedURL.split('/api/')[1].replace(/-/g, '+').replace(/_/g, '/')) === upstreamURL,
  'AI request signatures and all query parameters must survive the local transport');

const html = '<html><head><script src="/_next/main.js" defer></script></head><body>'
  + '<div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>';
const patched = icibaPreviewHTML(html);
assert(patched.indexOf('Object.defineProperty(window') < patched.indexOf('/_next/main.js'),
  'storage fallback must run before iCIBA initializes');
assert(patched.includes('word.collins') && patched.includes('aria-pressed'),
  'preview should retain supplied Collins data with accessible tab controls');

let received = '';
const handle = previewHandler('token', async (input: any) => {
  received = String(input);
  return new Response(received.includes('/word?') ? html : '{"code":0}', { headers: { 'Content-Type': 'application/json' } });
});
const server = tjs.serve({ listenIp: '127.0.0.1', port: 0, fetch: handle });
const base = `http://127.0.0.1:${server.port}`;
try {
  const audioRequest = await fetch(encodedURL.replace('http://127.0.0.1:1234', base));
  assert(audioRequest.ok && received === upstreamURL, 'actual HTTP transport must preserve the signed AI URL');
  assert((await fetch(`${base}/wrong/word?w=residue`)).status === 404, 'service must require its token');
  assert((await fetch(`${base}/token/word?w=residue`, { method: 'POST' })).status === 404,
    'preview must not forward account mutations');
  const denied = btoa('https://example.com/private');
  assert((await fetch(`${base}/token/api/${denied}`)).status === 404, 'proxy must reject other services');
  const page = await (await fetch(`${base}/token/word?w=residue`)).text();
  assert(page.includes('wordping-tabs'), 'actual preview requests must receive the compatibility page');
} finally { await server.close(); }

const unchanged = JSON.stringify({ items: [{ quicklookurl: 'https://www.youdao.com/w/residue' }] });
assert(await preparePreviews(unchanged, '/does-not-exist') === unchanged,
  'Youdao previews must keep their original URL without starting a service');
console.log('iCIBA preview compatibility and HTTP tests passed');
