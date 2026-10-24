#!/bin/sh
set -eu
umask 077

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
probe_dir="$HOME/Library/Application Support/WordPing/key-expiry"
mkdir -p "$probe_dir"
chmod 700 "$probe_dir"

export WORDPING_PROBE_SESSION="$probe_dir/session.json"
export WORDPING_PROBE_STATE="$probe_dir/state.json"
export WORDPING_PROBE_MAX_CHECKS=1

exec /usr/bin/lockf -k -s -t 0 "$probe_dir/probe.lock" \
  /bin/sh "$repo_dir/scripts/probe-key-expiry.sh" >>"$probe_dir/probe.log" 2>&1
