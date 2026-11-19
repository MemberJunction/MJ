---
"@memberjunction/react-test-harness": patch
---

The test page's network is now an allowlist.

- Pages opened by `BrowserManager` may reach only the origins (scheme, host and port) of the core runtime CDN URLs and their fallbacks, and of registered Component Library CDN URLs (`CDNUrl`, `CDNCssUrl`), plus `allowedNetworkHosts`. A bare host name in `allowedNetworkHosts` allows that host on any port. Other requests are aborted, every WebSocket is closed, service workers are blocked, and WebRTC is removed from the page. A browser the harness launches also has DNS prefetching turned off. A context the harness creates also gets a context-wide route; a reused external context is never routed, only the harness's own pages in it.
- `NavigateTo(url)` lets the page it opens reach that URL's origin, and only that page. New `BrowserManager.AllowNetworkUrlsForPage(page, urls)` does the same for any page, and `ClosePage(page)` removes a page's routes before closing it.
- `ComponentExecutionResult.blockedNetworkRequests` lists blocked requests as origin + path (query strings dropped), and each one raises a medium `network-request-blocked` warning (`NETWORK_REQUEST_BLOCKED_RULE`). Warnings do not change `codeExecutionSuccess`.
- `networkAccess: 'unrestricted'` turns the filter off for local debugging. New exports: `NetworkAllowlist`, `NetworkAccessMode`, `HostOfUrl`, `RedactUrl`, `LibraryNetworkUrls`, `CoreRuntimeNetworkUrls`, `BROWSER_LAUNCH_ARGS`, `DISABLE_WEBRTC_SCRIPT`; new `BrowserManager.AllowNetworkUrls()` and `GetBlockedRequests(page)`.
