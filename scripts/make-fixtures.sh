#!/usr/bin/env bash
# Generates photos and videos with distinct, known file sizes for simulator testing.
# Noise compresses poorly, so resolution/duration control the size.
# Usage: scripts/make-fixtures.sh [output-dir]   (default: e2e/fixtures)
set -euo pipefail

OUT="${1:-$(dirname "$0")/../e2e/fixtures}"
mkdir -p "$OUT"

photo() { # name width height
  [ -f "$OUT/$1.jpg" ] || ffmpeg -loglevel error -y -f lavfi -i "color=c=0x3a6ea5:s=$2x$3,noise=alls=60:allf=t" \
    -frames:v 1 -q:v 2 "$OUT/$1.jpg"
}

video() { # name seconds size bitrate
  [ -f "$OUT/$1.mp4" ] || ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=$3:r=30,noise=alls=40:allf=t" \
    -t "$2" -c:v libx264 -pix_fmt yuv420p -b:v "$4" -maxrate "$4" -bufsize "$4" "$OUT/$1.mp4"
}

photo photo_small 800 600
photo photo_medium 2000 1500
photo photo_large 4032 3024
video video_short 2 640x360 20M
video video_long 10 1920x1080 20M

ls -l "$OUT"
