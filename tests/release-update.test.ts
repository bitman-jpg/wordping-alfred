import { compareVersions, parseRelease } from '../src/release-update';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const assetName = 'WordPing-v0.13.0-Apple-Silicon.alfredworkflow';
const assetUrl = `https://github.com/bitman-jpg/wordping-alfred/releases/download/v0.13.0/${assetName}`;
const release = { tag_name: 'v0.13.0', assets: [{ name: assetName, state: 'uploaded',
  browser_download_url: assetUrl, digest: `sha256:${'a'.repeat(64)}` }] };

assert(compareVersions('0.13.0', '0.12.8') > 0, 'newer minor release should upgrade');
assert(compareVersions('0.12.8', 'v0.12.8') === 0, 'matching release should not upgrade');
assert(compareVersions('0.12.7', '0.12.8') < 0, 'older release should not upgrade');
assert(parseRelease(release).assetUrl === assetUrl, 'matching release asset should be accepted');
assert(parseRelease(release).digest === 'a'.repeat(64), 'published SHA-256 should be retained');

for (const bad of [
  { ...release, tag_name: 'v0.13.0-rc1' },
  { ...release, assets: [{ ...release.assets[0], browser_download_url: 'https://example.com/fake' }] },
  { ...release, assets: [{ ...release.assets[0], name: 'source.zip' }] },
]) {
  let rejected = false;
  try { parseRelease(bad); } catch { rejected = true; }
  assert(rejected, 'unexpected release metadata should be rejected');
}

console.log('Release update tests passed');
