#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
for source in assets/provider-icons/*.svg; do
  name=${source##*/}
  name=${name%.svg}
  sips -s format png "$source" --out "assets/provider-muted-$name.png" >/dev/null
done
