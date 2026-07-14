---
"@memberjunction/server": patch
---

fix(server): stop logging routine unauthenticated requests as full stack traces. A request presenting no credentials at all (health check, CORS preflight-adjacent probe, or a client mid-auth-handshake) is routine and no longer produces a raw error/stack-trace dump — only genuinely exceptional auth failures (malformed/tampered tokens, invalid API keys, inactive users) still log in full. Also fixes the WebSocket connect path, where an absent `Authorization` param was coerced to the literal string `"undefined"` and mis-logged as `Invalid token payload` instead of taking the quiet missing-token path.
