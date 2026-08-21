---
"@memberjunction/ng-conversations": minor
---

Realtime surface tabs: which channels tab up front is now the deployment's choice (#3599)

`ShouldRegisterChannelTabUpFront` returned `IsWhiteboardChannel(channelName) || hasBeenUsed`, so the
whiteboard — and only the whiteboard, matched by name — got a surface tab at session start before
anything had touched it. The reasoning was sound (a user can be the first to draw on a board, whereas
every other channel earns its tab on first use) but it was one deployment's answer compiled in. The
predicate's own comment said detection was by name "so a deployment can't accidentally opt a
non-board channel into the immediate-tab behavior" — which also meant a deployment could not
deliberately opt OUT.

`<mj-realtime-session-overlay>` takes a new `[TabUpFrontChannels]`:

- **`null`** (the default) keeps MJ's answer exactly, so no existing deployment changes.
- **an array** is the complete list of channels that tab up front, REPLACING the default rather than
  adding to it. `[]` therefore means "no surface until something uses one" — the voice-first case,
  where a session opens on the agent talking and a blank board makes the product read as a tool with
  a canvas bolted on rather than as a conversation that can produce one.

A channel the agent has already used always gets its tab, whatever is configured: a surface being
driven with no tab on screen is a hidden surface, not a decluttered strip.

Also removes an accidental duplicate of the whiteboard-name rule — `ShouldRemoveReviewWhiteboardTab`
had its own inline `trim().toLowerCase() === 'whiteboard'` and now shares `IsWhiteboardChannel`, so
the two cannot drift.
