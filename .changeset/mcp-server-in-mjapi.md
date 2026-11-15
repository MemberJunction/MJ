---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/server": patch
---

The MCP server can now run inside MJAPI. List `@memberjunction/ai-mcp-server` in `dynamicPackages.server[]` (with `Processes: ['mjapi']`) and MJAPI mounts the new `MCPServerExtension` at `/mcp` under `MJAPI_BASE_PATH` (so `/api/mcp` when MJExplorer owns `/`). It uses MJAPI's database connection, builds its OAuth resource URL from `MJAPI_PUBLIC_URL`, and keeps every MCP route, OAuth discovery document and OAuth proxy route under the mount. The standalone server is unchanged and still supported.

- MJAPI no longer gzips `text/event-stream` responses, which held back streamed MCP replies until they finished.
- The OAuth proxy parses request bodies only under `/oauth`, so with the proxy enabled it no longer swallows legacy SSE `/mcp/messages` bodies.
- Inside MJAPI, the extension refuses to mount with `mcpServerSettings.auth.mode: 'none'` or with MJAPI multi-tenancy on, accepts API keys only in headers, and warns when `systemApiKey` is still the stock placeholder, when `auth.resourceIdentifier` overrides the served URL, and when `trustProxy` (which has no effect there) is set. It also serves the OAuth discovery documents at the path-insertion URLs the MCP SDK requests (`/.well-known/<doc>/mcp`), and follows MJAPI's `cors.allowedOrigins`.
- MCP API keys now carry their row-filter bindings and acting context, as they do on MJAPI's GraphQL: a key restricted to certain rows was unrestricted through MCP. The system key is compared in constant time, and the boot log no longer prints part of `MJ_API_KEY`.
- Streamable HTTP sessions: every request is authenticated and must come from the session's owner (a revoked key stops working at once), an unknown session gets the spec's 404, sessions are registered before the initialize response goes out, and idle sessions close after 30 minutes instead of leaking. CORS allows `DELETE` and the MCP headers. A 401 no longer advertises `resource_metadata` while OAuth is off.
- The OAuth consent form posts to the proxy's base URL instead of a hardcoded `/oauth/consent`. With the OAuth proxy and MJExplorer at the host root, one web-server rewrite is needed for login-server discovery; the package README gives it.
