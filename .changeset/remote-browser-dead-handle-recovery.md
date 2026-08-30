---
"@memberjunction/remote-browser-server": minor
"@memberjunction/server": minor
---

Remote Browser: a dead browser handle now heals instead of poisoning the session (#3598)

A surface's browser can disappear without the engine being told — an external Chrome closed, a
backend container recycled, a CDP target lost. `RemoteBrowserEngine` kept the handle in its live map,
so `StartSessionForAgentSession` handed back the corpse and every later call threw
`Browser not launched. Call Launch() before using the adapter.` for the rest of the session. Observed
live: 232 of them in one MJAPI run, with the voice agent saying "the shared browser session isn't
launched right now" indefinitely while the pane sat frozen on its last good frame.

`RecoverDeadAgentSession(agentSessionID, error, opts)` discards the dead mapping, launches one
replacement, and re-attaches the screencast. The caller hands over the error it already caught and
does not decide what "dead" means — that lives in `IsDeadBrowserHandleError`, a closed list of
"the browser or its transport is gone". Anything unrecognised is treated as a real answer from a live
browser and reported exactly as it is today, because the false-positive cost is a healthy browser
losing its cookies, login and scroll position over a bad selector.

Re-attaching the view is half the fix, not a nicety: healing the backend alone is worse than the
original bug, because the client asked for a screencast once at bind time and would keep watching the
discarded session while the agent truthfully narrated a page the person could not see. The engine now
remembers each session's frame sink so the replacement can be re-piped to it — and a screencast the
host deliberately stopped is never resurrected.

Bounded in both directions: concurrent fault reports (the ~700ms snapshot poll and the next agent
action both meet the dead handle) coalesce onto one relaunch rather than each launching their own,
and a surface gets at most `MAX_DEAD_HANDLE_RECOVERIES` (3) before the engine logs that it is giving
up. A browser that dies on arrival should surface as a visible fault, never as a hang plus a stream
of orphaned Chromes.

Both callers that meet a dead handle report it. `RemoteBrowserSnapshot` — the poll that almost always
discovers the fault first — now reports it instead of only degrading around it, and
`ExecuteRemoteBrowserAction` reports it too and re-runs the action against the replacement. The action
path matters on its own: a surface nobody is watching has no poll to discover anything, so wiring only
the poll would leave exactly the agent-driven case in the issue unhealed. Re-running is safe precisely
because the handle was dead — the action never reached a browser, so it cannot run twice — and a
`navigate` therefore heals in place, while a click or a type is told, in words the agent can act on,
that its browser was replaced and is now on a blank page.
