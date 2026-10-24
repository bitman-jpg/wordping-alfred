#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
probe_dir=$(mktemp -d -t wordping-key-expiry)
trap 'rm -rf "$probe_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

./runtime/tjs bundle scripts/probe-key-expiry.ts "$probe_dir/probe.js"
WORDPING_PROBE_SESSION="${WORDPING_PROBE_SESSION:-$probe_dir/session.json}" ./runtime/tjs run "$probe_dir/probe.js"
