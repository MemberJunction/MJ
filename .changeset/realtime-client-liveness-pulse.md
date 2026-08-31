---
"@memberjunction/ng-conversations": patch
---

The realtime client says it is alive, so the janitor stops reaping live calls.

`SessionJanitor` force-closed sessions people were actively talking to — three consecutive sessions with conversation throughout, each closed roughly 15 minutes after the last *server-side* event. This is topology rather than a janitor defect: in the client-direct realtime path audio goes browser → provider over WebRTC, so the server sees the mint, a few early channel actions, then nothing. `RecordActivity` is only reached by server-side events, so `LastActiveAt` freezes about 45 seconds in and never moves again, and an active call is indistinguishable from an abandoned one. A session whose channels are all client-side goes quiet from the server's point of view almost immediately.

The server half already existed and was simply never connected: `SessionManager.Heartbeat` (coalesced writes, reactivates `Idle → Active`, refuses a `Closed` session) and the `AgentSessionHeartbeat` mutation with its ownership check. A grep for that mutation across the tree returned exactly one hit — its own definition. This change is the missing caller, not new plumbing: a pulse in `RealtimeSessionService`, started where `SessionStarted$` is emitted (the point at which the session is connected *and* `agentSessionId` is set) and stopped first thing in teardown.

Three details worth knowing. The 60s interval is chosen against both neighbours — comfortably under the 15-minute close threshold, so several beats must be missed in a row before a live session is reaped, and well above the server's write-coalescing window, so the database sees a trickle rather than a stream. The session id is read at fire time rather than captured at start, so a beat landing during teardown finds `null` and does nothing instead of resurrecting a row that was just closed. And the pulse is stopped *before* anything else in teardown, so a beat racing the close cannot re-stamp `LastActiveAt` on a session being deliberately ended.
