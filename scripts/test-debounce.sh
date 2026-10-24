#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_dir=$(mktemp -d -t wordping-debounce)
trap 'rm -rf "$test_dir"' EXIT
./runtime/tjs bundle src/index.ts "$test_dir/index.js"

python3 - <<'PY'
import plistlib
with open('workflow/info.plist', 'rb') as handle:
    workflow = plistlib.load(handle)
filter_config = next(obj['config'] for obj in workflow['objects']
                     if obj.get('config', {}).get('keyword') == 'wp')
assert filter_config['queuedelaymode'] == 2
assert filter_config['queuedelaycustom'] == 5, 'Alfred stores 500 ms as 5, not 0.5'
PY

WORDPING_DEBOUNCE=1 nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" beat >"$test_dir/first.json"

WORDPING_DEBOUNCE=1 wordping_pending_query=bea nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" beat >"$test_dir/changed.json"

python3 - "$test_dir" <<'PY'
import json, os, sys
root = sys.argv[1]
for name in ('first', 'changed'):
    with open(os.path.join(root, name + '.json')) as handle:
        output = json.load(handle)
    assert output['rerun'] == 0.5, name
    assert output['variables']['wordping_pending_query'] == 'beat', name
    assert output['items'][0]['valid'] is False, name
assert not os.path.exists(os.path.join(root, 'website-session.json'))
with open(os.path.join(root, 'translations.json'), 'w') as handle:
    json.dump({'version': 4, 'entries': [{
        'query': 'beat', 'language': 'zh-CHS',
        'output': json.dumps({'items': [{'title': '击败', 'arg': '击败'}]}),
        'updatedAt': 1,
    }]}, handle)
PY

WORDPING_DEBOUNCE=1 nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" beat >"$test_dir/cached.json"

python3 - "$test_dir/cached.json" <<'PY'
import json,sys
with open(sys.argv[1]) as handle:
    output=json.load(handle)
assert 'rerun' not in output
assert output['items'][0]['title']=='击败'
assert output['variables']['wordping_pending_query']==''
PY

echo 'Debounced lookup and immediate cache tests passed'
