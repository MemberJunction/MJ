---
"@memberjunction/core": minor
"@memberjunction/ai-bridge-base": minor
"@memberjunction/ai-bridge-server": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Realtime Bridges (Phase 0+1): new media-transport layer that connects the one realtime agent engine to external endpoints — meetings (Zoom/Teams/Slack/Meet/Webex/Discord) and telephony (Twilio/Vonage/RingCentral/VOIP). Adds the v5.42 schema (5 entities: AIBridgeProvider with a strongly-typed SupportedFeatures JSON column, AIBridgeAgentIdentity, AIBridgeProviderChannel, AIAgentSessionBridge, AIAgentSessionBridgeParticipant — the bridge is an attachment to the existing AIAgentSession, not a new session). New packages @memberjunction/ai-bridge-base (BaseRealtimeBridge media driver with capability gating, AIBridgeEngineBase cache, pure passive/active/hybrid TurnTakingPolicy) and @memberjunction/ai-bridge-server (AIBridgeEngine completing the deferred server-bridged transport seam — bridge media ↔ IRealtimeSession.SendInput/OnOutput — plus a LoopbackBridge, host affinity and janitor). Five server-side EntityServer validation invariants. Nothing is audio-specific (typed directional audio/video/screen tracks).
