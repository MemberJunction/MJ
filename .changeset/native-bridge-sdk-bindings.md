---
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-zoom": patch
"@memberjunction/ai-bridge-teams": patch
"@memberjunction/ai-bridge-googlemeet": patch
"@memberjunction/ai-bridge-webex": patch
"@memberjunction/ai-bridge-slack": patch
"@memberjunction/ai-bridge-discord": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-twilio": patch
"@memberjunction/ai-bridge-vonage": patch
"@memberjunction/ai-bridge-ringcentral": patch
---

Add native two-way SDK bindings for all realtime-bridge providers. Each provider package gains a native send-capable SDK binding (the adapter that drives bidirectional audio + host/call controls over a real platform SDK, behind an injectable native-module loader and tested against fake modules). Adds a `BridgeNativeSdkRegistry` (in ai-bridge-base) keyed by `DriverClass` so the engine auto-binds the correct native factory at `StartBridgeSession`, with a per-session `BindSdk` override for choosing a non-default binding (e.g. Zoom RTMS receive-only) or injecting a fake. This is the MJ-side adapter + wiring layer; the platform-specific native media client (e.g. Teams ACS media streaming) and the session-start harness are the remaining work.
