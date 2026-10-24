#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
release_version=$(node -p "require('./package.json').version")

mkdir -p dist/runtime release
./runtime/tjs bundle --minify src/index.ts dist/index.js
./runtime/tjs bundle --minify src/warmup.ts dist/warmup.js
cp runtime/tjs dist/runtime/tjs
if ! command -v swiftc >/dev/null 2>&1; then
  echo "Swift compiler not found; install the Xcode Command Line Tools to build WordPing" >&2
  exit 1
fi
swiftc -O -parse-as-library -target arm64-apple-macosx26.0 src/apple-translate.swift -o dist/runtime/apple-translate
mkdir -p dist/assets
cp assets/icon.png assets/translate.png assets/translate-say.png dist/assets/
cp workflow/info.plist dist/info.plist
mkdir -p dist/scripts
cp scripts/reminders.sh dist/scripts/reminders.sh
cp LICENSE dist/LICENSE

release_file="release/WordPing-v${release_version}-Apple-Silicon.alfredworkflow"
(cd dist && zip -FS -q -r "../$release_file" .)
echo "Created $release_file"
