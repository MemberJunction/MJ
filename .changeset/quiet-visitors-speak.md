---
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

Fix realtime relayed-tool dispatch for scoped anonymous magic-link sessions (#3371): delegated agent runs, co-agent observability writes (creation, transcript/tool-turn appends, usage accumulation, finalize), and recording uploads now execute under the system user once session ownership is proven — gated on MagicLinkScope, excluding public web-widget guests, and failing closed to the caller when no system user is available. Adds the IT68 scoped-anon-elevation deterministic integration bundle proving the permission contract on a live database.
