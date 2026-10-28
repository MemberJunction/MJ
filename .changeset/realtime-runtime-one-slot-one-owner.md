---
"@memberjunction/realtime-runtime": patch
---

The realtime runtime's one driver slot can no longer be raced or orphaned (MJ#4629). A start issued while the previous call's teardown is still running now waits for that teardown and then goes live, instead of being dropped with a bare `undefined` that hosts had to guess at; a start issued while a call is genuinely live throws `RealtimeSessionAlreadyActiveError` (exported) rather than returning silently, and never replaces the live driver. A fatal error from the current client (the provider's socket dying mid-call) now ends the call the way a failed start does: the connection state goes to `error`, the microphone is released, the server row is closed as `Error`, and `SessionEnded$` reports `error`; a host's own End afterwards is a no-op. Teardown's work runs under a try/finally, so the slot is released even if a step throws, where before `IsActive` could stay set for good and refuse every later start.
