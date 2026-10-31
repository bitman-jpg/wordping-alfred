declare var tjs: any;

async function previewService(directory: string): Promise<string | undefined> {
  const statePath = `${directory}/preview-service.json`;
  async function address(): Promise<string | undefined> {
    try {
      const state = JSON.parse(new TextDecoder().decode(await tjs.readFile(statePath)));
      if (!Number.isInteger(state.port) || state.port < 1 || state.port > 65535
        || !/^[a-f0-9-]{36}$/.test(state.token)) return;
      const base = `http://127.0.0.1:${state.port}/${state.token}`;
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(300) });
      if (response.ok && await response.text() === 'wordping-preview-v1') return base;
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
  const rows = (data.items || []).filter((item: any) => {
    try { return new URL(item.quicklookurl).hostname === 'www.iciba.com'; } catch { return false; }
  });
  if (!rows.length) return output;
  const base = await previewService(directory);
  if (!base) return output;
  for (const item of rows) {
    const query = new URL(item.quicklookurl).searchParams.get('w');
    if (query) item.quicklookurl = `${base}/word?w=${encodeURIComponent(query)}`;
  }
  return JSON.stringify(data);
}
