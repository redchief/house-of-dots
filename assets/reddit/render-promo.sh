#!/usr/bin/env bash
# Renders the Reddit app-directory assets from promo.html.
# Needs Google Chrome and ffmpeg. Usage: ./render-promo.sh
set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PAGE="file://$PWD/promo.html"
FRAMES_TOTAL=324   # START + moves*FPM + END_HOLD in promo.html
FALLBACK_FRAME=198 # a mid-game moment with boxes claimed and lines open
FPS=30

shot() { # out w h query
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size="$2,$3" --screenshot="$1" "$PAGE?$4" >/dev/null 2>&1 || true  # Chrome may exit non-zero after a good screenshot
}
export -f shot
export CHROME PAGE

cp avatar.png promo-icon.png
shot "$PWD/tile.png" 560 256 "mode=tile"
shot "$PWD/fallback.png" 1500 1000 "mode=video&f=$FALLBACK_FRAME"

FRAMES=$(mktemp -d)
seq 0 $((FRAMES_TOTAL - 1)) | xargs -P 8 -I{} bash -c \
  'shot "'"$FRAMES"'/$(printf %04d {}).png" 1500 1000 "mode=video&f={}"'
ffmpeg -y -loglevel error -framerate $FPS -i "$FRAMES/%04d.png" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow -movflags +faststart featuring.mp4
rm -rf "$FRAMES"

ls -la promo-icon.png tile.png fallback.png featuring.mp4
