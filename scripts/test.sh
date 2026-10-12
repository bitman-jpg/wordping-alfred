#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_bundle="$(mktemp -t wordping-tests).js"
trap 'rm -f "$test_bundle"' EXIT
./runtime/tjs bundle tests/cache.test.ts "$test_bundle"
./runtime/tjs run "$test_bundle"
