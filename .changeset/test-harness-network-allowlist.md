---
"@memberjunction/react-test-harness": minor
---

The test page's network is now an allowlist (minor: default behavior changes).

- Pages opened by `BrowserManager` may reach only the hosts of the core runtime and registered Component Library CDN URLs (`CDNUrl`, `CDNCssUrl`), plus `allowedNetworkHosts`. Other requests are aborted, every WebSocket is closed, and service workers are blocked; a context the harness creates also gets a context-wide route that covers dedicated workers. A reused external context is never routed, only the harness's own pages in it.
- `ComponentExecutionResult.blockedNetworkRequests` lists blocked requests as origin + path (query strings dropped), and each one raises a medium `network-request-blocked` warning (`NETWORK_REQUEST_BLOCKED_RULE`). Warnings do not change `codeExecutionSuccess`.
- `networkAccess: 'unrestricted'` turns the filter off for local debugging. New exports: `NetworkAllowlist`, `NetworkAccessMode`, `HostOfUrl`, `RedactUrl`, `LibraryNetworkUrls`; new `BrowserManager.AllowNetworkUrls()` and `GetBlockedRequests(page)`.
