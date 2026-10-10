---
"@memberjunction/ai": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-vertex": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/server": patch
---

Live-avatar settings that change without a rebuild, and a Google Cloud API key as a Vertex AI credential.

`MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS` sets the `avatarConfig.videoBitrateBps` a Gemini Live avatar session asks for, in bits per second: 2,000,000 when unset, as before, and `0` leaves the field out. A value that is not a whole number is logged once and the default is used. It is read wherever MJ writes the avatar into a session's config, so the browser mint, MJAPI's relay setup and server-side (meeting) sessions all follow it (`ResolveGeminiAvatarVideoBitrateBps`).

`MJ_GEMINI_LIVE_MODEL_ALIASES` gives a model id the Gemini Live profile table does not know the profile of one it does: `<model id>=<known model id>`, comma-separated, such as `gemini-live-3.8-preview=gemini-3.8-live`. Google is still sent the catalog's API name; what the model accepts and renders (the avatar on Gemini Enterprise) comes from the known model's row. An alias matches the whole id and wins over the table. Bad entries are named in one log line, and each alias is logged once when first used.

The Vertex AI key JSON (`VertexAICredentials`) takes two optional Gemini Live fields, which `GeminiEnterpriseRealtime` uses for the relay's upstream and for server-side sessions: `liveApiVersion` (`v1` when unset; for example `v1beta1`) and `liveHost` (a host name with an optional port, bare or after `https://` or `wss://`, with nothing after it). A `liveHost` is honoured only in the platform's environment key, since MJAPI sends the token or API key to that host. Anything else is refused with a `VertexCredentialsError` (`invalid-live-host`, `invalid-live-api-version`, `live-host-not-allowed`) whose message quotes no value.

The key JSON may hold a Google Cloud API key (`apiKey`), never beside another credential (`api-key-with-credentials`; `invalid-api-key` for one a header cannot carry). Alone, it takes Google's global route, as `@google/genai`'s API-key mode does: the global host and the model's short name (`publishers/google/models/<id>`). With a `project` (and a `location`, `us-central1` by default), it takes the regional route: the location's host and the full model name. Either way the relay and server-side sessions send it as `x-goog-api-key` instead of an OAuth bearer, and it never reaches the browser, the session pact, the relay URL or the logs. `VertexGenAIOptions` gives the SDK the key alone, so `VertexLLM` uses the global route with either shape. `BuildGeminiLiveSetup` takes `UsesApiKey`, and `BuildGeminiLiveModelPath` is exported.

An avatar part that opens with an MP4 box (`ftyp`, `moov`, `moof`, `styp`) plays as the avatar whatever MIME type it names, in the browser client and in server-side sessions, which hand it to the meeting room labelled `video/mp4`. A part that is not MP4 and names a type other than video or PCM never plays. `SniffFmp4Piece` reads a `moov` first as an init segment.

MJAPI logs each realtime relay or proxy upgrade it refuses for its Origin (`MJ_REALTIME_PROXY_ALLOWED_ORIGINS`): `[RealtimeRelay] upgrade refused (403): origin "<origin>" is not in MJ_REALTIME_PROXY_ALLOWED_ORIGINS` (`[RealtimeProxy]` on the proxy path), with the origin's printable characters only, and never the ticket or the path.
