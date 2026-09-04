---
"@memberjunction/remote-browser-server": minor
"@memberjunction/server": minor
---

Remote Browser: an agent session can now hold more than one browser, named by `instanceKey` (#3531)

`RemoteBrowserEngine` keyed its agent-session map on the agent session id alone, which made "one
remote browser per agent session" a framework invariant nothing could opt out of. A second surface's
lazy start found the first one's mapping and returned it, so both surfaces drove the same Chrome:
one live view, one screencast, one audio stream, and a `StopScreencast` from either tore down the
other's. Callers had no way to say which browser they meant, because there was only ever one.

`StartSessionForAgentSession`, `GetSessionForAgentSession`, `EndSessionForAgentSession` and
`AchieveGoal` (via `AchieveGoalParams.InstanceKey`) now take an optional `instanceKey` that names a
browser *within* the agent session, and the six `RemoteBrowserActionResolver` mutations that address
a live session — `InterpretRemoteBrowserPage`, `RemoteBrowserSnapshot`, `StopRemoteBrowserScreencast`,
`StopRemoteBrowserAudioStream`, `RelayRemoteBrowserHumanInput`, `GetRemoteBrowserSelection` — accept
and forward it.

**Omitting it is exactly today's behaviour**, and that is load-bearing rather than incidental: the
key is composed as `agentSessionID` alone when no name is given, so every existing caller keeps
resolving the single unnamed instance and the pre-existing agent-session tests pass unchanged. An
empty or whitespace key is the unnamed instance too, so a caller threading an absent value through
as `''` lands where it did before the argument existed. Keys are trimmed and lowercased — the value
is typed by hand into a channel config, and `Primary` versus `primary` being two browsers would be a
spelling trap.

The composite stays scoped to the agent session (`id::name`), so two concurrent sessions that both
name their second surface `resume` get their own browsers rather than colliding. Start coalescing —
the fix that stopped four near-simultaneous callers launching four Chromes — is keyed the same way,
so it still collapses a race on one instance without collapsing two *different* surfaces into one.
