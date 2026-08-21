---
"@memberjunction/ng-conversations": minor
"@memberjunction/server": minor
---

Remote Browser: the agent is told when the page moves, whoever moved it (#3496)

A user takes over the browser and navigates. Asked "what do I have open right now?", the agent
confidently describes the **previous** page and corrects only when told to look again.

`RemoteBrowserChannel` pushed its `[browser] current page:` note from exactly two call sites, both
immediately after a server action the model itself initiated. Nothing observed a page change from any
other origin: human-relayed input drove the page without producing a note, and pushed screencast
frames carried only image bytes. The effective rule was **a surface change the agent did not cause is
invisible to it** — not stale caching, it was never told. Human takeover is on by default for
`Collaborative` providers, so the default configuration was the broken one, and the failure mode was
confident misdescription rather than a visible error.

Every observation now funnels through one `notePageChange(url, cause)`, so "the agent hears about the
page whenever it MOVES" is a property of that method rather than of where callers happen to sit. It
is fed from three places: the agent's own actions and goals (as before), the perception poll (which
already carried the URL — only the surface read it), and pushed screencast frames, which now carry
`currentUrl` because under streaming the poll is stopped and frames were the only thing seeing the
page.

`cause` is the part the agent could never work out for itself. A change it made reads as before; a
change it did not reads *"the page changed to X — you did not navigate here, so someone else is
driving"*, which is the difference between knowing the page moved and knowing it is no longer the one
moving it. The first page of a session is announced plainly: a session opening somewhere is nobody's
takeover. Unchanged URLs are silent, which is a requirement rather than an optimisation — the poll
runs every ~700ms.

`currentUrl` on the frame envelope is optional on the client, so an older MJAPI behaves exactly as it
did rather than reading a missing field as "the page has no URL". `GetCurrentUrl()` is a synchronous
last-known read, so it costs nothing per frame.
