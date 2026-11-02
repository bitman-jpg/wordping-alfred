import { icibaPreviewHTML } from './iciba-preview';

export function previewHandler(
  token: string, upstream: typeof fetch = fetch,
  localPage?: (id: string) => Promise<string | undefined>,
  dictionaryPage?: (name: 'ecdict' | 'cedict', word: string, from: string, to: string) => Promise<string | undefined>,
): (request: Request) => Promise<Response> {
  return async (request) => {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.pathname.startsWith(`/${token}/`)) return new Response('Not found', { status: 404 });
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (url.pathname === `/${token}/health`) return new Response('wordping-preview-v5', { headers });
  try {
    const pageMatch = url.pathname.match(new RegExp(`^/${token}/page/([a-f0-9]{32})$`));
    if (pageMatch && localPage) {
      const content = await localPage(pageMatch[1]);
      return content === undefined ? new Response('Not found', { status: 404, headers })
        : new Response(content, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const dictionaryMatch = url.pathname.match(new RegExp(`^/${token}/dictionary/(ecdict|cedict)$`));
    if (dictionaryMatch && dictionaryPage) {
      const word = url.searchParams.get('word') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      if (!word || word.length > 512 || /[\0]/.test(word)
        || !/^[a-zA-Z-]{2,20}$/.test(from) || !/^[a-zA-Z-]{2,20}$/.test(to)) {
        return new Response('Invalid dictionary entry', { status: 400, headers });
      }
      const content = await dictionaryPage(dictionaryMatch[1] as 'ecdict' | 'cedict', word, from, to);
      return content === undefined ? new Response('Not found', { status: 404, headers })
        : new Response(content, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    let target: URL;
    const page = url.pathname === `/${token}/word`;
    if (page) {
      target = new URL('https://www.iciba.com/word');
      const word = url.searchParams.get('w') || '';
      if (!word || word.length > 200) return new Response('Invalid word', { status: 400 });
      target.searchParams.set('w', word);
    } else if (url.pathname.startsWith(`/${token}/api/`) && url.pathname.length < 8192) {
      const encoded = url.pathname.slice(`/${token}/api/`.length);
      target = new URL(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
      const allowed = target.hostname === 'service.iciba.com'
        ? ['/chat/word/v1', '/chat/word/decipher'].includes(target.pathname)
        : target.hostname === 'dict.iciba.com' && target.pathname === '/dictionary/word/query/web';
      if (!allowed || target.protocol !== 'https:' || target.port || target.username || target.password) return new Response('Not found', { status: 404 });
    } else return new Response('Not found', { status: 404 });
    const response = await upstream(target.href, { signal: AbortSignal.timeout(15000), redirect: 'error',
      headers: { Referer: 'https://www.iciba.com/', 'User-Agent': 'Mozilla/5.0' } });
    const body = await response.text();
    return new Response(page && response.ok ? icibaPreviewHTML(body) : body, {
      status: response.status, headers: { ...headers, 'Content-Type': page ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8' },
    });
  } catch {
    return new Response('Preview unavailable. Close it and try again.', { status: 502, headers });
  }
  };
}
