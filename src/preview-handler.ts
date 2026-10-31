import { icibaPreviewHTML } from './iciba-preview';

export function previewHandler(token: string, upstream: typeof fetch = fetch): (request: Request) => Promise<Response> {
  return async (request) => {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.pathname.startsWith(`/${token}/`)) return new Response('Not found', { status: 404 });
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (url.pathname === `/${token}/health`) return new Response('wordping-preview-v1', { headers });
  try {
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
    return new Response('iCIBA is unavailable. Close the preview and try again.', { status: 502, headers });
  }
  };
}
