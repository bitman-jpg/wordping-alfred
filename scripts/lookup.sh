#!/bin/sh
# Keep security recovery independent of the bundled JavaScript runtime.
workflow_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
runtime="$workflow_dir/runtime/tjs"

if /usr/bin/xattr -p com.apple.quarantine "$runtime" >/dev/null 2>&1; then
  # Probe before starting warmup so only one blocked launch occurs.
  "$runtime" --version >/dev/null 2>&1
  status=$?
  case "$status" in
    126|137)
      assessment=$(/usr/sbin/spctl --assess --type execute --verbose "$runtime" 2>&1)
      case "$assessment" in
        *rejected*)
          cache_dir="${alfred_workflow_cache:-$HOME/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.bitman.wordping}"
          fingerprint=$(/usr/bin/cksum < "$runtime" | /usr/bin/tr ' ' '-')
          # mkdir is atomic: concurrent Alfred queries must not open many windows.
          if mkdir -p "$cache_dir" && mkdir "$cache_dir/security-opened-$fingerprint" 2>/dev/null; then
            if ! /usr/bin/open "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension"; then
              rmdir "$cache_dir/security-opened-$fingerprint"
            fi
          fi
          printf '%s\n' '{"items":[{"title":"Allow tjs in Privacy & Security","subtitle":"Dismiss the warning, scroll to Security, click Open Anyway, then retry. Reopen System Settings > Privacy & Security if needed.","valid":false}]}'
          exit 0
          ;;
      esac
      ;;
  esac
  # Ordinary failures retain their exit status; they must not open Settings.
  if [ "$status" -ne 0 ]; then
    exit "$status"
  fi
fi

if [ -z "${1:-}" ]; then
  /usr/bin/nohup "$runtime" run "$workflow_dir/warmup.js" >/dev/null 2>&1 </dev/null &
fi
exec "$runtime" run "$workflow_dir/index.js" "${1:-}"
