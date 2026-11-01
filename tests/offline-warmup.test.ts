declare var tjs: any;

async function run(args: string[]): Promise<string> {
  const child = tjs.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.wait()]);
  if (status.exit_status !== 0) throw new Error(stderr || stdout);
  return stdout;
}
const directory = await tjs.makeTempDir('/tmp/wordping-offline-warmup-XXXXXX');
try {
  const bundle = `${directory}/warmup.js`;
  await run([tjs.exePath, 'bundle', `${tjs.cwd}/src/warmup.ts`, bundle]);
  const code = new TextDecoder().decode(await tjs.readFile(bundle));
  await tjs.writeFile(bundle, "let networkCalls = 0; globalThis.fetch = async () => { networkCalls++; throw new Error('mock'); };\n"
    + code + '\nconsole.log(JSON.stringify({networkCalls}));');
  for (const providers of ['oxford', 'youdao']) {
    const output = await run(['/usr/bin/env', `providerOrder=${providers}`, `alfred_workflow_cache=${directory}`,
      tjs.exePath, 'run', bundle]);
    if (Boolean(JSON.parse(output).networkCalls) !== providers.includes('youdao')) {
      throw new Error(`Unexpected background network activity for ${providers}`);
    }
  }
} finally { await tjs.remove(directory, { recursive: true }); }
console.log('Offline provider warmup tests passed');
