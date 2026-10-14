#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
for test_file in tests/*.test.ts; do
  test_bundle="$(mktemp -t wordping-tests).js"
  ./runtime/tjs bundle "$test_file" "$test_bundle"
  ./runtime/tjs run "$test_bundle"
  rm -f "$test_bundle"
done

sh scripts/test-review-ui.sh
sh scripts/test-reminders.sh
