#!/bin/sh
set -eu

query="${1:-}"
[ -n "$query" ] || exit 0
cache_dir="${alfred_workflow_cache:-${TMPDIR:-/tmp}/wordping}/audio"
mkdir -p "$cache_dir"

play_voice() {
  accent="$1"
  if [ "${wordping_source:-}" = Iciba ]; then
    case "$accent" in
      1) url="${wordping_audio_uk:-}" ;;
      *) url="${wordping_audio_us:-}" ;;
    esac
    if [ -z "$url" ]; then
      echo 'iCIBA has no recording for the selected accent.' >&2
      return 1
    fi
    key="$(printf '%s' "$url" | shasum -a 256 | cut -d ' ' -f 1)"
    voice="$cache_dir/iciba-$accent-$key.mp3"
  else
    url='https://dict.youdao.com/dictvoice'
    key="$(printf '%s' "$query" | shasum -a 256 | cut -d ' ' -f 1)"
    voice="$cache_dir/youdao-$accent-$key.mp3"
  fi
  if [ ! -s "$voice" ]; then
    temporary="$(mktemp "$cache_dir/download.XXXXXX")"
    if [ "${wordping_source:-}" = Iciba ]; then
      curl --fail --location --silent --show-error --max-time 15 --output "$temporary" "$url" || {
        rm -f "$temporary"; return 1;
      }
    else
      curl --fail --location --silent --show-error --max-time 15 --get \
        --data-urlencode "audio=$query" --data-urlencode "type=$accent" \
        --output "$temporary" "$url" || { rm -f "$temporary"; return 1; }
    fi
    if [ ! -s "$temporary" ]; then rm -f "$temporary"; return 1; fi
    mv "$temporary" "$voice"
  fi
  afplay "$voice"
}

case "${onlineAccent:-american}" in
  british|British|BRITISH|uk|UK|1) play_voice 1 ;;
  both|Both|BOTH) play_voice 1; play_voice 2 ;;
  *) play_voice 2 ;;
esac
