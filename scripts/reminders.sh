#!/bin/sh
set -eu

agent="$HOME/Library/LaunchAgents/com.bitman.wordping.review.plist"
target="gui/$(id -u)/com.bitman.wordping.review"
command=${1:-}

case "$command" in
  '~remind:off')
    /bin/launchctl bootout "$target" >/dev/null 2>&1 || true
    /bin/rm -f "$agent"
    printf 'Daily review reminder turned off.\n'
    ;;
  '~remind:'*)
    time=${command#~remind:}
    case "$time" in
      [01][0-9]:[0-5][0-9]|2[0-3]:[0-5][0-9]) ;;
      *) printf 'Use a time in HH:MM format.\n' >&2; exit 1 ;;
    esac
    hour=${time%:*}
    minute=${time#*:}
    /bin/mkdir -p "${agent%/*}"
    temp="${agent}.tmp.$$"
    trap '/bin/rm -f "$temp"' EXIT HUP INT TERM
    cat > "$temp" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.bitman.wordping.review</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>alfred://runtrigger/com.bitman.wordping/daily-review/</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
  </dict>
</dict></plist>
EOF
    /usr/bin/plutil -lint "$temp" >/dev/null
    /bin/launchctl bootout "$target" >/dev/null 2>&1 || true
    /bin/mv "$temp" "$agent"
    /bin/launchctl bootstrap "gui/$(id -u)" "$agent"
    printf 'Daily review reminder set for %s.\n' "$time"
    ;;
  *) printf 'Unknown reminder command.\n' >&2; exit 1 ;;
esac
