#!/bin/sh
set -eu
umask 077

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
probe_dir="$HOME/Library/Application Support/WordPing/idle-expiry"
mkdir -p "$probe_dir"
chmod 700 "$probe_dir"

if [ ! -f "$probe_dir/probe.js" ] || [ "$repo_dir/scripts/idle-key-expiry.ts" -nt "$probe_dir/probe.js" ] || [ "$repo_dir/src/keyless-youdao.ts" -nt "$probe_dir/probe.js" ]; then
  "$repo_dir/runtime/tjs" bundle "$repo_dir/scripts/idle-key-expiry.ts" "$probe_dir/probe.js" >"$probe_dir/build.log" 2>&1
fi

export WORDPING_IDLE_PROBE_DIR="$probe_dir"
export WORDPING_ALFRED_SESSION="$HOME/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping/website-session.json"
exec /usr/bin/lockf -k -s -t 0 "$probe_dir/probe.lock" \
  "$repo_dir/runtime/tjs" run "$probe_dir/probe.js" >>"$probe_dir/probe.log" 2>&1
