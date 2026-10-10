---
"@memberjunction/ai-vertex": patch
---

`GeminiEnterpriseRealtime`'s bridged sessions now open a moved `LiveUrl` as given, path prefix and API version included (#5449). A subclass that overrides the protected `LiveUrl` already moved the relay's upstream to the whole URL, but bridged sessions took only its scheme, host and port, and `@google/genai` wrote Google's socket path after them with the key's API version. The driver now gives the SDK everything before the socket path (`/ws/google.cloud.aiplatform.<version>.LlmBidiService/BidiGenerateContent`) as its base URL, with the version that path names, so a proxy behind a path prefix or on another API version serves bridged sessions on the same URL as the relay. A moved URL the SDK cannot open as given (no socket path at its end; a user, a query or a fragment; a scheme other than ws, wss, http or https) fails a bridged session with a message that does not quote it. A driver no subclass moves passes the SDK the same options as before.
