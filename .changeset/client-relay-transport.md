---
"@memberjunction/ai": patch
"@memberjunction/ai-vertex": patch
"@memberjunction/server": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-widget": patch
---

`ClientRealtimeSessionConfig` gains `Transport` (`'direct'` or `'relay'`; absent means direct) and `RelayUrl`, so a minted session says how the browser reaches its provider. The Gemini Enterprise mint returns a relay session: `Transport: 'relay'`, the relay URL as `RelayUrl` (the ticket is in its path) and an empty `EphemeralToken`. MJAPI's `StartRealtimeClientSession` returns both fields; the realtime runtime and the support widget ask for them and hand them to the client driver, and mint without them against a server that predates them. The `'gemini-enterprise'` client connects to `RelayUrl` and refuses a session that is not a relay session. Every other client driver refuses a relay session in `Connect` (`BaseRealtimeClient.AssertTransportSupported`); a driver that can open one opts in through `SupportsRelayTransport`. The relay URL is never logged.
