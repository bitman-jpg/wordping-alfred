#!/bin/sh
set -eu
workflow_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
nohup "$workflow_dir/runtime/tjs" run "$workflow_dir/preview-server.js" "$1" \
  >/dev/null 2>&1 </dev/null &
