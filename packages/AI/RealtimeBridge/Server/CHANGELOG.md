# @memberjunction/ai-bridge-server

## 5.41.0

### Minor Changes

- 8fd6f59: Realtime Bridges (Phase 0+1): new media-transport layer that connects the one realtime agent engine to external endpoints — meetings (Zoom/Teams/Slack/Meet/Webex/Discord) and telephony (Twilio/Vonage/RingCentral/VOIP). Adds the v5.42 schema (5 entities: AIBridgeProvider with a strongly-typed SupportedFeatures JSON column, AIBridgeAgentIdentity, AIBridgeProviderChannel, AIAgentSessionBridge, AIAgentSessionBridgeParticipant — the bridge is an attachment to the existing AIAgentSession, not a new session). New packages @memberjunction/ai-bridge-base (BaseRealtimeBridge media driver with capability gating, AIBridgeEngineBase cache, pure passive/active/hybrid TurnTakingPolicy) and @memberjunction/ai-bridge-server (AIBridgeEngine completing the deferred server-bridged transport seam — bridge media ↔ IRealtimeSession.SendInput/OnOutput — plus a LoopbackBridge, host affinity and janitor). Five server-side EntityServer validation invariants. Nothing is audio-specific (typed directional audio/video/screen tracks).

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/ai-bridge-base@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0
