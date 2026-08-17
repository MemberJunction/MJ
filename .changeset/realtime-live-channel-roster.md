---
"@memberjunction/ng-conversations": minor
---

Realtime: the agent can finally see its own surfaces (#3497)

The agent could not answer questions about its own channels — how many are open, which ones, or what
each holds. At connect the model is told its **tool vocabulary** and nothing else, so it inferred
capability from the tools it was given ("I have `browser_*`, so there must be a browser") and then
answered from that inference, confidently. With one surface the guess is usually right; with three,
"let me check the board" versus "let me check the browser" is a coin flip.

The state existed all along — every plugin has `SerializeState()`, already persisted for resume.
Nothing composed it into something a model could read, and nothing told the model when the set
changed. Same root cause as #3496: state lives on the client, and the model is only ever told about
the parts it caused itself.

`RealtimeSessionService.ChannelRoster` / `DescribeChannelRoster()` compose the live set — name, tab
title, whether the channel has a visible surface, which one owns the screen, and a short
channel-supplied summary. The roster is pushed to the model at connect and whenever that answer
changes, deduped on the composed line.

**Pushed rather than offered as a read tool, deliberately.** The failure being fixed is a model that
does not know it should ask; a tool it never calls leaves the guess in place. The public getter is
there so a host — or a session-level tool once #3536 lands — can take the same read on demand.

New optional `BaseRealtimeChannelClient.DescribeState(): string | null`. It is **not**
`SerializeState` in prose: that payload is a machine format written for a future instance of the same
channel, while this is written for a model about to speak. Both shipped channels implement it — the
whiteboard reports what is on the board, the Remote Browser reports which page it is showing, which
is the part the agent could not infer from having the tools. A channel that throws while describing
itself is omitted rather than taking the roster down with it.
