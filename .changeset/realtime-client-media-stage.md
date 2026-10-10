---
"@memberjunction/ai-realtime-client": patch
---

Adds the media stage to `@memberjunction/ai-realtime-client/media`: `LayoutMediaStage` lays out a session from its participants, placeable surfaces and the user's moves into one stage, a stack of picture-in-picture tiles (newest first), tabs, hidden surfaces, the other participants, and a screen-share split. The surface the user moved to the stage most recently holds it; a displaced surface returns to its default placement. `ResolveSurfacePlacements` and the participant selectors (`SelectSpotlight`, `SelectDisplayParticipants`, `SelectScreenSharer`, `SelectSplitSpeaker`, ported from the LiveKit room) are exported too. New model types: `MediaParticipant`, `MediaSurface`, `MediaPlacement`, `MediaPlacementMove`, `MediaSourceKind`.
