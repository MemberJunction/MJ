---
"@memberjunction/ai": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/messaging-adapters": patch
---

Strip line breaks (CR, LF, U+2028, U+2029) from user-supplied values before logging them (MCP OAuth client registration and consent scopes, Slack slash commands and events, realtime diagnostics) to prevent log injection (CodeQL js/log-injection, #5569).
