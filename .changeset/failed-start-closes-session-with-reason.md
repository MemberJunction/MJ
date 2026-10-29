---
"@memberjunction/realtime-runtime": patch
"@memberjunction/server": patch
---

A realtime session whose start fails after the mint is now closed on the server at once, as `CloseReason = Error`, instead of staying `Active` until the janitor's 15-minute staleness sweep (MJ#6013). The runtime's teardown used to take one boolean that meant both "the user ended it" and "close the server row", so a start that failed (a provider refusing the websocket, for example) reported an error to the host and left its row open. Teardown now takes the end reason and always closes a minted session, stamping `Explicit` when the host or user ended the call and `Error` when the runtime ended it over a failure; `SessionEnded$` carries the same reason. The `CloseAgentSession` mutation gains an optional `closeReason` argument (`Explicit` or `Error`; the server's own `Janitor` and `Shutdown` are refused from a client), defaulting to `Explicit` for clients that do not send it. The runtime now sends that argument, so it needs a server from this release or later.
