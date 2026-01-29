---
"@memberjunction/ai-mcp-server": minor
---

Add OAuth 2.1 proxy with scope-based authorization

- OAuth 2.1 authorization server with dynamic client registration (RFC 7591)
- Scope-based access control with hierarchical matching (parent scope grants all children)
- New API scopes: action:read, agent:read, query:read, prompt:read, communication:read
- Proxy-signed JWTs with consistent format across all upstream providers
