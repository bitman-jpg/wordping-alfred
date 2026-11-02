declare var tjs: any;
import md5 from './libs/md5';

async function previewService(directory: string): Promise<string | undefined> {
  const statePath = `${directory}/preview-service.json`;
  async function address(): Promise<string | undefined> {
    try {
      const state = JSON.parse(new TextDecoder().decode(await tjs.readFile(statePath)));
      if (!Number.isInteger(state.port) || state.port < 1 || state.port > 65535
        || !/^[a-f0-9-]{36}$/.test(state.token)) return;
      const base = `http://127.0.0.1:${state.port}/${state.token}`;
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(300) });
      if (response.ok && await response.text() === 'wordping-preview-v5') return base;
    } catch {}
  }
  const running = await address();
  if (running) return running;
  try {
    await tjs.makeDir(directory, { recursive: true });
    const starter = decodeURIComponent(new URL('./scripts/start-preview.sh', import.meta.url).pathname);
    await tjs.spawn(['/bin/sh', starter, statePath], { stdout: 'ignore', stderr: 'ignore' }).wait();
    for (let attempt = 0; attempt < 20; attempt++) {
      const base = await address();
      if (base) return base;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } catch {}
}

export async function preparePreviews(output: string, directory: string): Promise<string> {
  const data = JSON.parse(output);
  const remoteRows = (data.items || []).filter((item: any) => {
    try { return new URL(item.quicklookurl).hostname === 'www.iciba.com'; } catch { return false; }
  });
  const htmlRows = (data.items || []).filter((item: any) =>
    typeof item.variables?.wordping_preview_html === 'string');
  const dictionaryRows = (data.items || []).filter((item: any) =>
    typeof item.variables?.wordping_preview_dictionary === 'string');
  if (!remoteRows.length && !htmlRows.length && !dictionaryRows.length) return output;
  const base = await previewService(directory);
  if (!base) return output;
  for (const item of remoteRows) {
    const query = new URL(item.quicklookurl).searchParams.get('w');
    if (query) item.quicklookurl = `${base}/word?w=${encodeURIComponent(query)}`;
  }
  for (const item of dictionaryRows) {
    try {
      const preview = JSON.parse(item.variables.wordping_preview_dictionary);
      if (!['ecdict', 'cedict'].includes(preview.name) || typeof preview.word !== 'string'
        || typeof preview.from !== 'string' || typeof preview.to !== 'string') continue;
      item.quicklookurl = `${base}/dictionary/${preview.name}?word=${encodeURIComponent(preview.word)}`
        + `&from=${encodeURIComponent(preview.from)}&to=${encodeURIComponent(preview.to)}`;
      delete item.variables.wordping_preview_dictionary;
    } catch {}
  }
  if (htmlRows.length) await tjs.makeDir(`${directory}/preview-pages`, { recursive: true });
  for (const item of htmlRows) {
    const content = item.variables.wordping_preview_html;
    const id = md5(content);
    await tjs.writeFile(`${directory}/preview-pages/${id}.html`, content);
    item.quicklookurl = `${base}/page/${id}`;
    delete item.variables.wordping_preview_html;
  }
  return JSON.stringify(data);
}
