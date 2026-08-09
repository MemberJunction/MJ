---
"@memberjunction/testing-integration": patch
---

Treat a missing `MJ_API_KEY` as a client-tier environment gap, not a test failure.

A client-transport bundle bootstraps in two steps, and either can throw: `LoadClientConfig()` raises `MJ_API_KEY is not set …` before any network call, and `preflightMJAPI()` raises `MJAPI is not reachable …` once a key exists. The driver's skip-as-pass contract matched only the second message, so an environment with no client tier *at all* — no key and no server — failed at the first and never reached the skip.

That is exactly the PR gate's configuration. `integration.yml` provisions a database and runs the suite in-process with no MJAPI and no key, and says so: *"No MJAPI is up, so client-transport members skip on the MJAPI preflight."* The skip never fired, so the Integration Tier reported 40/61 and exited non-zero on every pull request — and on `next` itself — for a condition the workflow deliberately designed around.

Both messages now count as "there is no client tier here". A key that is present but rejected (`MJAPI at … answered HTTP 401`), any non-OK response from a reachable server, and cache-ownership or configuration failures all remain hard errors: those describe an environment that *has* a client tier and is misconfigured, which is precisely what the gate exists to catch.

Adds tests pinning both halves of that boundary, including the case a looser pattern would break — the 401 message also names `MJ_API_KEY`, so the match keys on "is not set" rather than on the variable name.
