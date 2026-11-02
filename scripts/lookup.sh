#!/bin/sh
# Keep security recovery independent of the bundled JavaScript runtime.
workflow_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
runtime="$workflow_dir/runtime/tjs"

if [ "${1:-}" = "~trust-wordping" ]; then
  failed=0
  for executable in "$runtime" "$workflow_dir/runtime/word-suggestions" "$workflow_dir/runtime/apple-translate"; do
    if [ -f "$executable" ] && /usr/bin/xattr -p com.apple.quarantine "$executable" >/dev/null 2>&1; then
      /usr/bin/xattr -d com.apple.quarantine "$executable" >/dev/null 2>&1 || failed=1
    fi
  done
  if [ "$failed" -ne 0 ]; then
    echo "WordPing couldn't finish setup. Reinstall the workflow and try again."
    exit 1
  fi
  echo "WordPing is ready. Try your lookup again."
  exit 0
fi

quarantined=0
for executable in "$runtime" "$workflow_dir/runtime/word-suggestions" "$workflow_dir/runtime/apple-translate"; do
  if [ -f "$executable" ] && /usr/bin/xattr -p com.apple.quarantine "$executable" >/dev/null 2>&1; then
    quarantined=1
    break
  fi
done
if [ "$quarantined" -eq 1 ]; then
  printf '%s\n' '{"items":[{"uid":"wordping-trust","title":"Finish setting up WordPing","subtitle":"Press Return to continue","arg":"~trust-wordping","valid":true,"icon":{"path":"icon.png"}}]}'
  exit 0
fi

data_dir="${alfred_workflow_data:-$HOME/Library/Application Support/Alfred/Workflow Data/com.bitman.wordping}"
configured_providers=$(printf '%s' "${providerOrder:-ecdict,cedict}" | /usr/bin/tr -d '[:space:]' | /usr/bin/tr '[:upper:]' '[:lower:]')
case "$configured_providers" in
  youdao,iciba,baidu,wiktionary,mymemory,langdao,oxford,apple)
    configured_providers="$configured_providers,ecdict,cedict"
    ;;
esac
need_dictionary_setup=0
case ",$configured_providers," in
  *,ecdict,*) [ -f "$data_dir/dictionaries/ecdict.sqlite" ] || need_dictionary_setup=1 ;;
esac
case ",$configured_providers," in
  *,cedict,*|*,cc-cedict,*) [ -f "$data_dir/dictionaries/cedict.sqlite" ] || need_dictionary_setup=1 ;;
esac

if [ -z "${1:-}" ] || [ "$need_dictionary_setup" -eq 1 ]; then
  /usr/bin/nohup "$runtime" run "$workflow_dir/warmup.js" >/dev/null 2>&1 </dev/null &
fi
exec "$runtime" run "$workflow_dir/index.js" "${1:-}"
