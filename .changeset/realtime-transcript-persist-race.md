---
"@memberjunction/ai-agents": patch
---

Fix a concurrency race that could persist a realtime transcript turn twice.

The session runner dispatches provider transcript frames fire-and-forget (`void this.handleTranscript(t)`), so frames for the same role are processed concurrently. `persistRealtimeTranscript` did a check-then-act on the in-flight turn map that spanned `await`s (GetEntityObject / Load / Save), so two captions arriving a few milliseconds apart could both observe "no tracked row yet", both take the create branch, and write the turn twice.

Observed live against a streamed Grok session: one user utterance produced two byte-identical `ConversationDetail` rows, the duplicate created 17ms *before* the first row's final update. Streamed-caption providers (Grok) are the most exposed since they emit many finals per turn, but the interim-racing-its-own-final variant applies to any provider.

Transcript persistence is now serialized per role through a promise chain, making the read-modify-write atomic with respect to other frames of the same role. Roles remain independent and are not serialized against each other. A frame that fails no longer strands the rest of its role's queue.

Adds regression coverage for concurrent (non-awaited) frames — overlapping streamed captions, an interim racing its final, cross-role independence, and failure isolation. This class of bug was invisible to the existing suite, which drove every persist call sequentially.
