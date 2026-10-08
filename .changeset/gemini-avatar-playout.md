---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
---

The Gemini browser client plays a granted avatar. When the minted session config carries an `avatar` block and the host shows the agent's video, the client hands a `VideoPlayout` to the host at connect and plays the avatar's fragmented MP4 parts through it; the first init segment decides whether the video or separate PCM carries the voice, PCM never doubles a voice the video already carries, and generation ends, barge-ins, cancels and resumes apply to the video. A page-level `MediaElementAudioRouter` connects each element to Web Audio once and hands its audio to every call's PCM playback as a stream, so the call's speakers, meter and recording carry the avatar's voice, and an element shown in an earlier call works again in the next. A host that shows no avatar gets an audio-only session. Core gains a pure fragmented MP4 reader (`ReadFmp4Init`, `SniffFmp4Piece`). Sessions without an avatar grant behave as before.
