---
"@memberjunction/integration-test-suite": patch
---

IT56 PG4 delegates to a seeded `IT: Payload Empty-Grant Child` (PayloadUpstreamPaths=[]) instead of overriding `IT: Payload Child` at run time. A run-time save reaches the server's cached agent only after its debounced engine refresh, so the run merged with the child's seeded grant and PG4 failed on cache timing rather than on the payload guard.
