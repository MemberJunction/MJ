---
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-livekit": patch
---

`BridgeMediaFrame` gains optional `Width`, `Height` and `KeyFrame`, so a bridge frame can say how large its video is and whether a decoder can start at it. The LiveKit bridge fills them on the camera and screen frames it hands the engine (the encoded JPEG's size; every JPEG is a key frame). The engine fills them on the avatar pieces it sends a bridge: the size the stream's init segment gives its video track, and for a fragment with video, whether its first frame is a key frame. Consumers that don't read them behave as before, and every field stays optional.
