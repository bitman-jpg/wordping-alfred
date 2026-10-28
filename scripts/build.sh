#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
release_version=$(node -p "require('./package.json').version")

mkdir -p dist/runtime release
./runtime/tjs bundle --minify src/index.ts dist/index.js
./runtime/tjs bundle --minify src/multi-worker.ts dist/multi-worker.js
./runtime/tjs bundle --minify src/warmup.ts dist/warmup.js
cp runtime/tjs dist/runtime/tjs
rm -rf dist/python
if ! command -v swiftc >/dev/null 2>&1; then
  echo "Swift compiler not found; install the Xcode Command Line Tools to build WordPing" >&2
  exit 1
fi
swiftc -O -parse-as-library -target arm64-apple-macosx26.0 src/apple-translate.swift -o dist/runtime/apple-translate
swiftc -O -target arm64-apple-macosx26.0 src/word-suggestions.swift -o dist/runtime/word-suggestions
mkdir -p dist/assets
cp assets/icon.png assets/translate.png assets/translate-say.png dist/assets/
rm -rf dist/assets/dictionaries
cp workflow/info.plist dist/info.plist
mkdir -p dist/scripts
cp scripts/reminders.sh dist/scripts/reminders.sh
cp scripts/start-lookup.sh dist/scripts/start-lookup.sh
rm -f dist/scripts/provider-bridge.py
cp LICENSE dist/LICENSE
cp THIRD_PARTY_DICTIONARIES.md dist/THIRD_PARTY_DICTIONARIES.md
rm -f dist/THIRD_PARTY_SOFTWARE.md

release_file="release/WordPing-v${release_version}-Apple-Silicon.alfredworkflow"
(cd dist && zip -FS -q -r "../$release_file" .)
echo "Created $release_file"
