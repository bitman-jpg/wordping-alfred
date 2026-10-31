#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
for test_file in tests/*.test.ts; do
  test_bundle="$(mktemp -t wordping-tests).js"
  ./runtime/tjs bundle "$test_file" "$test_bundle"
  ./runtime/tjs run "$test_bundle"
  rm -f "$test_bundle"
done

python3 tests/security-setup.test.py
python3 tests/online-audio.test.py

sh scripts/test-review-ui.sh
sh scripts/test-debounce.sh
sh scripts/test-reminders.sh
sh scripts/test-backup-ui.sh
