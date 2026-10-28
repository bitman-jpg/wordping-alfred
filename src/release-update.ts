declare var tjs: any;

const RELEASE_API = 'https://api.github.com/repos/bitman-jpg/wordping-alfred/releases/latest';
const RELEASE_DOWNLOAD = 'https://github.com/bitman-jpg/wordping-alfred/releases/download/';

export interface WorkflowRelease {
  version: string;
  assetUrl: string;
  assetName: string;
  digest?: string;
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] | undefined => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match ? match.slice(1).map(Number) : undefined;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) throw new Error('Cannot compare workflow versions');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function parseRelease(data: any): WorkflowRelease {
  const tag = data?.tag_name;
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error('Latest release has an invalid version');
  }
  const assetName = `WordPing-${tag}-Apple-Silicon.alfredworkflow`;
  const asset = data.assets?.find((entry: any) => entry.name === assetName && entry.state === 'uploaded');
  const assetUrl = `${RELEASE_DOWNLOAD}${tag}/${assetName}`;
  if (!asset || asset.browser_download_url !== assetUrl) {
    throw new Error('Latest release has no Apple silicon workflow download');
  }
  return { version: tag.slice(1), assetUrl, assetName,
    digest: typeof asset.digest === 'string' && /^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)
      ? asset.digest.slice(7).toLowerCase() : undefined };
}

export async function latestRelease(): Promise<WorkflowRelease> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal });
    if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);
    return parseRelease(await response.json());
  } finally { clearTimeout(timeout); }
}

async function run(command: string[]): Promise<string> {
  const process = tjs.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  const [output, errors, status] = await Promise.all([
    process.stdout.text(), process.stderr.text(), process.wait(),
  ]);
  if (status.exit_status !== 0) throw new Error(errors.trim() || `Command failed: ${command[0]}`);
  return output.trim();
}

export async function openUpgrade(currentVersion: string): Promise<string> {
  const release = await latestRelease();
  if (compareVersions(release.version, currentVersion) <= 0) return `WordPing ${currentVersion} is already up to date.`;
  const directory = await tjs.makeTempDir('/tmp/wordping-update-XXXXXX');
  const path = `${directory}/${release.assetName}`;
  try {
    await run(['/usr/bin/curl', '--fail', '--location', '--silent', '--show-error', '--max-time', '120',
      '--output', path, release.assetUrl]);
    if (release.digest) {
      const actual = await run(['/usr/bin/shasum', '-a', '256', path]);
      if (actual.split(/\s+/)[0].toLowerCase() !== release.digest) throw new Error('Release checksum does not match');
    }
    await run(['/usr/bin/unzip', '-tq', path]);
    await run(['/usr/bin/open', path]);
    return `Opened WordPing ${release.version} in Alfred. Complete the installation prompt to upgrade.`;
  } catch (error) {
    await tjs.remove(directory, { recursive: true });
    throw error;
  }
}
