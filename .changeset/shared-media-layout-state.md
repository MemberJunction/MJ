---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-livekit-room": patch
---

The realtime call and the meeting room keep and save the user's layout through one shared set of helpers in `@memberjunction/ai-realtime-client/media`: `RecordPlacementMove` and `WithoutStageMoves` keep the moves, `ParsePlacementMoves` / `SerializePlacementMoves` and `ParsePipRects` / `SerializePipRects` give their saved form, and `MediaPipRect` is the saved picture-in-picture box. `ParticipantTileKey`, `ParticipantTileSurface` and `StageParticipantIdentity` let any host show participants as movable tiles, as the meeting room now does through them. Nothing changes on screen.

Removed, since no release shipped them: the call's own copies of these helpers (`ParseSurfacePlacementPref`, `SerializeSurfacePlacementPref`, `RecordSurfaceMove`, `ParseSurfacePipPref`, `SerializeSurfacePipPref`) and the deprecated `mj-realtime-surface-move-menu` / `RealtimeSurfaceMove` from `@memberjunction/ng-conversations`, and `MediaPipRect` from `@memberjunction/ng-realtime-media`. The call's setting keys (`SURFACE_PLACEMENT_PREF_KEY`, `SURFACE_PIP_PREF_KEY`) stay.
