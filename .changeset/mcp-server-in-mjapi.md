---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/server": patch
---

The MCP server can now run inside MJAPI. List `@memberjunction/ai-mcp-server` in `dynamicPackages.server[]` (with `Processes: ['mjapi']`) and MJAPI mounts the new `MCPServerExtension` at `/mcp` under `MJAPI_BASE_PATH` (so `/api/mcp` when MJExplorer owns `/`). It uses MJAPI's database connection, builds its OAuth resource URL from `MJAPI_PUBLIC_URL`, and keeps every MCP route, OAuth discovery document and OAuth proxy route under the mount. The standalone server is unchanged and still supported.

- MJAPI no longer gzips `text/event-stream` responses, which held back streamed MCP replies until they finished.
- The OAuth proxy parses request bodies only under `/oauth`, so with the proxy enabled it no longer swallows legacy SSE `/mcp/messages` bodies.
- Inside MJAPI, the extension refuses to mount with `mcpServerSettings.auth.mode: 'none'`, and warns when `systemApiKey` is still the stock placeholder, when `auth.resourceIdentifier` overrides the served URL, and when `trustProxy` (which has no effect there) is set.
- The OAuth consent form posts to the proxy's base URL instead of a hardcoded `/oauth/consent`. With the OAuth proxy and MJExplorer at the host root, one web-server rewrite is needed for login-server discovery; the package README gives it.
