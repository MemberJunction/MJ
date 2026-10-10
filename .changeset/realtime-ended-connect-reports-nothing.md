---
"@memberjunction/realtime-runtime": patch
---

A call ended while it is still connecting no longer reports a failed start when its connection then fails (#5420). Before, `RealtimeSessionRuntime` set `ConnectionState$` to `'error'` and `LastStartError` after the host had ended the call, and ran a second teardown, which ended a newer call if one had started on the same runtime by then. The runtime now checks whether the start was abandoned before it reports a connection failure, as it already did for the microphone, and unwinds that start quietly. An abandoned start also leaves the server session to a teardown that is still running, so the session is closed once and its end is reported on `SessionEnded$`; before, the start could close it a second time and the end went unreported.
