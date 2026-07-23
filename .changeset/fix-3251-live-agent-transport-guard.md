---
"@memberjunction/testing-integration": patch
---

fix(testing): fail loudly when a server-transport integration bundle resolves a rebound client provider, and make the ai-verify persistence poll truthful + tunable (#3251)

- `IntegrationTestDriver` now aborts a `server`-transport bundle with a clear, harness-attributed `Error` if the resolved provider is not a Database provider (i.e. a client-transport bundle rebound the process-global provider earlier in the process), instead of silently running the bundle over the wire. This enforces the previously prose-only suite-ordering invariant.
- `ai-verify.ts`'s `fetchById` bounded poll no longer asserts "fire-and-forget write never landed" (which claimed data loss that did not occur); it states the actual bound it waited and names the new `MJ_IT_FETCH_POLL_MS` env knob (default 12000ms) so loaded boxes can widen the window.
