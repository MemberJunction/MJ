---
"@memberjunction/livekit-room-server": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-livekit-native": patch
---

Meeting bot tokens no longer carry `canUpdateOwnMetadata`, so a bot cannot rename itself or rewrite its role metadata. When the bot takes its avatar down (or rejoins after one), the bridge reports it through the new `StartBridgeSessionParams.OnAvatarUnavailable`, and the room coordinator sets `mj.agentAvatar` to audio-only through LiveKit's room service (`LiveKitParticipantService.SetAgentAvatarAudioOnly`). `MintTokenParams.CanUpdateOwnMetadata` and the bot-side `SetAttributes` outlet member are removed.
