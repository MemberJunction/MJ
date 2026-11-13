---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/server": patch
---

The MCP server can now run inside MJAPI. List `@memberjunction/ai-mcp-server` in `dynamicPackages.server[]` (with `Processes: ['mjapi']`) and MJAPI mounts the new `MCPServerExtension` at `/mcp` under `MJAPI_BASE_PATH` (so `/api/mcp` when MJExplorer owns `/`). It uses MJAPI's database connection, builds its OAuth resource URL from `MJAPI_PUBLIC_URL`, and keeps every MCP route, OAuth discovery document and OAuth proxy route under the mount. The standalone server is unchanged and still supported.

- MJAPI no longer gzips `text/event-stream` responses, which held back streamed MCP replies until they finished.
- Standalone: the MCP transport routes now mount ahead of the OAuth proxy. The proxy's JSON body parser no longer swallows legacy SSE `/mcp/messages` bodies, and MCP traffic no longer counts against the proxy's per-IP rate limit.
- The OAuth consent form posts to the proxy's base URL instead of a hardcoded `/oauth/consent`. With the OAuth proxy and MJExplorer at the host root, one web-server rewrite is needed for login-server discovery; the package README gives it.
