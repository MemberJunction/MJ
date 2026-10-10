---
"@memberjunction/ai-vertex": patch
---

`GeminiEnterpriseRealtime` has a protected `LiveUrl(credentials, location)`: the Vertex AI Live websocket a session connects to. A subclass registered at a higher priority can override it to point the driver at another host, such as a mock upstream, a private endpoint or a proxy, without patching the package (#5315). MJAPI's relay opens client-direct sessions on the URL it returns, and bridged sessions' `@google/genai` client connects to its scheme, host and port. By default it returns the URL the driver used before, and a driver no subclass moves builds the same relay session and the same SDK options as before. The credentials are unchanged: the relay and the SDK send the same bearer token or API key, to the host `LiveUrl` returns. The token does not depend on the URL, since both paths ask for the `cloud-platform` scope. This is a seam for code, not a configuration setting.
