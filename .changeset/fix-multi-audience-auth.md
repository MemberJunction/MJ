---
"@memberjunction/server": patch
"@memberjunction/ai-mcp-server": patch
---

Fix multi-audience support for same-issuer auth providers. When multiple Auth0 apps share the same domain but have different audiences (client IDs), token validation now considers all matching providers instead of only the first one.
