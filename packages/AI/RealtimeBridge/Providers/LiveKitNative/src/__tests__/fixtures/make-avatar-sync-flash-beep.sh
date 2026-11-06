#!/usr/bin/env bash
# Makes avatar-sync-flash-beep.mp4 in this folder, which the avatar pipeline tests read: 4 s of black video with one
# white frame at each whole second (frames 24, 48, 72) and a 40 ms 1 kHz beep at each whole second, as fragmented MP4
# the way a Gemini Live avatar streams it (an init segment, then one sample per moof + mdat).
#
#   H.264 Constrained Baseline 3.1 (avc1.42c01f), 704x1280, 24 fps, a key frame every 12 frames, 90 kHz timescale;
#   AAC-LC 24 kHz mono (mp4a.40.2). ffmpeg writes the AAC priming (1024 samples) into the first video sample's duration,
#   so frames placed by their tfdt line up with the decoded beeps and frames placed by index are 42.7 ms early.
#
# Generated content only (ffmpeg's colour source and a synthesized tone). Made with ffmpeg 9.0.2; run from anywhere.
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=black:s=704x1280:r=24:d=4,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(mod(n\,24)\,0)*gt(n\,0)'" \
  -f lavfi -i "aevalsrc='if(gt(t,0.5)*lt(mod(t,1),0.04),0.8*sin(2*PI*1000*t),0)':s=24000:d=4" \
  -c:v libx264 -profile:v baseline -level:v 3.1 -pix_fmt yuv420p -x264-params keyint=12:min-keyint=12:scenecut=0:bframes=0 \
  -b:v 400k -video_track_timescale 90000 -c:a aac -b:a 64k -ar 24000 -ac 1 -f mp4 "$TMP/plain.mp4"

ffmpeg -hide_banner -loglevel error -y -i "$TMP/plain.mp4" -c copy -frag_duration 41667 \
  -movflags +empty_moov+default_base_moof+separate_moof -f mp4 avatar-sync-flash-beep.mp4
