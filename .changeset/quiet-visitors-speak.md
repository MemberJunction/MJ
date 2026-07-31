---
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/integration-test-suite": patch
---

Fix realtime relayed-tool dispatch for scoped anonymous magic-link sessions (#3371): delegated agent runs, co-agent observability writes (creation, transcript/tool-turn appends, usage accumulation, finalize), and recording uploads now execute under the system user once session ownership is proven — gated on MagicLinkScope, excluding public web-widget guests, and failing closed to the caller when no system user is available. The session's `allowedAgents` colleague union is now CanRun-gated against the original caller before dispatch, so elevation cannot widen agent authority, and delegated runs carry the visitor's id as `userId` so run attribution and context-memory scope stay the person's. Adds the IT68 scoped-anon-elevation deterministic integration bundle proving the permission contract on a live database.
