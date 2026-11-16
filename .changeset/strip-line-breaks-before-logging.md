---
"@memberjunction/ai": patch
"@memberjunction/ai-mcp-server": patch
---

Strip line breaks (CR, LF, U+2028, U+2029) from user-supplied values before logging them (MCP OAuth client registration and consent scopes, realtime diagnostics) to prevent log injection (CodeQL js/log-injection, #5569). A non-string `client_name` in a client registration is now logged as text instead of failing the registration.
