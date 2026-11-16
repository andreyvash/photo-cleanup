#!/usr/bin/env bash
# Erases a simulator, then seeds its photo library with the test fixtures and grants photo access.
# Usage: scripts/seed-simulator.sh <simulator-udid>
set -euo pipefail

UDID="${1:?usage: scripts/seed-simulator.sh <simulator-udid>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURES="$DIR/../e2e/fixtures"
BUNDLE_ID="dev.photocleanup.app"

"$DIR/make-fixtures.sh" "$FIXTURES" >/dev/null

xcrun simctl shutdown "$UDID" 2>/dev/null || true
xcrun simctl erase "$UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null

# Pin number formatting ("25.8 MB") so the e2e assertions don't depend on the host's region.
xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string en_US
xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array en

# Added one at a time so creation dates follow this order (oldest first).
for f in photo_small.jpg video_short.mp4 photo_large.jpg photo_medium.jpg video_long.mp4; do
  xcrun simctl addmedia "$UDID" "$FIXTURES/$f"
  sleep 1
done

xcrun simctl privacy "$UDID" grant photos "$BUNDLE_ID" || true
echo "Seeded $(ls "$FIXTURES" | wc -l | tr -d ' ') fixtures into $UDID"
