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
objects = {obj['uid']: obj for obj in workflow['objects']}
detail_filter = '93F217A1-23B7-42CF-8144-18E3C6E17711'
detail_view = '1D41F916-C2D6-4F5A-B070-784E7D701D86'
assert objects[detail_filter]['config']['matchstring'] == '^# WordPing entry: '
assert objects[detail_view]['type'] == 'alfred.workflow.userinterface.text'
assert objects[detail_view]['config']['inputtype'] == 0
assert objects[detail_view]['config']['outputmode'] == 1
assert any(link['destinationuid'] == detail_view for link in workflow['connections'][detail_filter])
normal_filter = objects['A78568B3-C360-4A35-A46A-0D91172F86EF']['config']['matchstring']
assert '# WordPing entry: ' in normal_filter, 'detail entries must bypass the copy action'
PY

WORDPING_DEBOUNCE=1 nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" beat >"$test_dir/first.json"

WORDPING_DEBOUNCE=1 wordping_pending_query=bea nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" beat >"$test_dir/changed.json"

WORDPING_DEBOUNCE=1 nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" 'es>cn trabajo' >"$test_dir/manual-pending.json"

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
with open(os.path.join(root, 'manual-pending.json')) as handle:
    manual = json.load(handle)
assert manual['variables']['wordping_pending_query'] == 'es>cn trabajo'
with open(os.path.join(root, 'translations.json'), 'w') as handle:
    json.dump({'version': 21, 'entries': [{
        'query': 'beat', 'language': 'zh-CHS',
        'output': json.dumps({'variables': {'wordping_provider_order':
            'youdao,iciba,baidu,wiktionary,apple,mymemory',
            'wordping_subtitle_version': 6,
            'wordping_lookup_version': 1},
            'items': [{'title': '击败', 'arg': '击败'}]}),
        'updatedAt': 1,
    }, {
        'query': 'trabajo', 'language': 'manual:es>zh-CHS',
        'output': json.dumps({'variables': {'wordping_provider_order':
            'youdao,iciba,baidu,wiktionary,apple,mymemory',
            'wordping_subtitle_version': 6, 'wordping_lookup_version': 1},
            'items': [{'title': '工作', 'arg': '工作', 'mods': {'ctrl': {
                'arg': '~save:trabajo', 'variables': {'wordping_command': '~save:trabajo'}}}}]}),
        'updatedAt': 2,
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

WORDPING_DEBOUNCE=1 nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" 'es>cn trabajo' >"$test_dir/manual-cached.json"

python3 - "$test_dir/manual-cached.json" <<'PY'
import json,sys
with open(sys.argv[1]) as handle:
    output=json.load(handle)
assert output['items'][0]['title']=='工作'
command=output['items'][0]['mods']['ctrl']['arg']
assert command=='~save:trabajo|manual%3Aes%3Ezh-CHS'
assert output['items'][0]['mods']['ctrl']['variables']['wordping_command']==command
PY

nativeLanguage=zh-CHS learningLanguage=en \
  alfred_workflow_cache="$test_dir" alfred_workflow_data="$test_dir" \
  ./runtime/tjs run "$test_dir/index.js" '~save:trabajo|manual%3Aes%3Ezh-CHS' >"$test_dir/manual-saved.json"

python3 - "$test_dir/manual-saved.json" "$test_dir/vocabulary.json" <<'PY'
import json,sys
with open(sys.argv[1]) as handle:
    output=handle.read()
assert 'Saved' in output
with open(sys.argv[2]) as handle:
    saved=json.load(handle)
assert 'trabajo' in json.dumps(saved, ensure_ascii=False)
PY

echo 'Debounced lookup and immediate cache tests passed'
