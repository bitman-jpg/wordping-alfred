#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
release_version=$(node -p "require('./package.json').version")

mkdir -p dist/runtime release
./runtime/tjs bundle --minify src/index.ts dist/index.js
cp runtime/tjs dist/runtime/tjs
mkdir -p dist/assets
cp assets/icon.png assets/translate.png assets/translate-say.png dist/assets/
cp workflow/info.plist dist/info.plist
mkdir -p dist/scripts
cp scripts/reminders.sh dist/scripts/reminders.sh
cp LICENSE dist/LICENSE

release_file="release/WordPing-v${release_version}-Apple-Silicon.alfredworkflow"
(cd dist && zip -FS -q -r "../$release_file" .)
echo "Created $release_file"
