---
"@memberjunction/server": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/core-actions": patch
"@memberjunction/doc-utils": patch
"@memberjunction/messaging-adapters": patch
---

Raise the minimum versions of `body-parser` (2.4.0, and 1.20.9 for the copy that Express 4 uses), `ws` (8.22.2), `express-rate-limit` (8.2.2) and `@modelcontextprotocol/sdk` (1.32.2). The root `pnpm.overrides` keeps older copies out of the workspace lock file.

Each WebSocket server that MJAPI creates now sets an explicit message size limit, and closes the socket with code 1009 when a client sends a larger message: 1 MiB on the GraphQL subscriptions socket, 2 MiB on the realtime proxy tunnel (the same limit as the realtime relay), and 64 KiB on the Twilio and Vonage media sockets.

The MCP Server hands `POST /mcp/messages` requests straight to the SDK transport, which refuses a body larger than 4 MB as soon as that much has arrived. Vonage media socket log lines show the claimed call id as printable ASCII, cut to 100 characters.
