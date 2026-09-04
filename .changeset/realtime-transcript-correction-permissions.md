---
"@memberjunction/server": patch
---

Realtime transcript: a streamed utterance's corrections are actually persisted

A streaming-transcription provider delivers ONE spoken utterance as a growing series of
corrections, each replacing the last. `replacePreviousTranscriptTurn` found the prior turn with
`RunView({ ResultType: 'entity_object' })` and saved that object — but a RunView-hydrated entity
does not carry the context user the way `GetEntityObject(entity, user)` does, so `Save()` ran with
no principal and returned false with an EMPTY `LatestResult`. Every correction after the first was
dropped, and the stored turn kept only the opening fragment of what was said.

Nothing looked wrong while it happened: the MODEL has the audio and answers coherently, so the
conversation reads normally. The damage lands downstream, where anything scoring the TRANSCRIPT
sees a few words. Measured live on a real interview: a 28-second answer persisted as `I`, and a
114-second answer as `So I think`.

The correction now re-loads the turn through `provider.GetEntityObject(...)` before writing, which
is what the INSERT path beside it has always done — so the two now succeed and fail for the same
reasons. A re-load that cannot find the row logs and returns false instead of silently leaving the
shorter text in place.

The write runs as the CALLER rather than being elevated. Elevating was tried first and is a trap:
`ResolveScopedAnonymousRunUser` falls back to `UserCache.GetSystemUser()`, which on an
unprovisioned deployment resolves to a placeholder user that does not exist — `Save()` then returns
false with a NULL result, indistinguishable from the permission denial it was meant to fix.
Ownership is already proved by `loadOwnedActiveSession` and the lookup is pinned to that session,
so the only row reachable is a turn the caller just spoke.
