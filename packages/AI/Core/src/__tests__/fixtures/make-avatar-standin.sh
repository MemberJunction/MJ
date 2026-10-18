#!/usr/bin/env bash
# Makes the two stand-in avatar MP4s in this folder, which the fragmented MP4 reader tests read: fragmented MP4 the way a
# Gemini Live avatar streams it, an init segment (ftyp + moov) and then about one frame per moof + mdat fragment.
#
#   avatar-standin-muxed.mp4       H.264 Constrained Baseline 3.1 (avc1.42c01f), 704x1280, 24 fps, 2 s, with an
#                                  AAC-LC 24 kHz mono track (mp4a.40.2): the video carries the voice.
#   avatar-standin-video-only.mp4  The same video without audio: the voice would come as separate PCM parts.
#
# Generated content only (ffmpeg's test pattern and a 440 Hz tone). Made with ffmpeg 9.0.2; run from anywhere.
set -euo pipefail
cd "$(dirname "$0")"

ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=704x1280:rate=24" -f lavfi -i "sine=frequency=440:sample_rate=24000" \
  -t 2 -c:v libx264 -profile:v baseline -level:v 3.1 -pix_fmt yuv420p -g 24 -bf 0 -b:v 400k \
  -c:a aac -b:a 64k -ar 24000 -ac 1 \
  -movflags +empty_moov+default_base_moof+frag_keyframe -frag_duration 41667 \
  -f mp4 avatar-standin-muxed.mp4

ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=704x1280:rate=24" -t 2 \
  -c:v libx264 -profile:v baseline -level:v 3.1 -pix_fmt yuv420p -g 24 -bf 0 -b:v 400k \
  -movflags +empty_moov+default_base_moof+frag_keyframe -frag_duration 41667 \
  -f mp4 avatar-standin-video-only.mp4
