---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/livekit-room-core": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-mj-livekit-room": patch
---

The meeting room shows an agent's avatar. The room core maps the camera track an agent's bot publishes the avatar on (`REALTIME_AGENT_AVATAR_TRACK_NAME`, `agent-avatar`, now shared by the bot's publisher) to the participant's avatar instead of a camera, so its tile carries the "AI-generated video" label, and reads the bot's `mj.agentAvatar` attribute (`ReadAgentAvatarAttribute`) into `LiveKitParticipantView.AvatarAudioOnly`. `mj-media-tile` now shows an avatar whole, the full portrait with bars, in every tile: meeting tiles, and the call's avatar on the stage and in picture-in-picture. Its new `AvatarVideoFit` (default `'contain'`) lets a host fill the tile with `'cover'` instead; other video still fills its tile. When an agent's bot says audio only, the MJ room shows everyone one info notice per agent per join ("Audio only for Sage: the avatar can't be shown in this meeting"), dismissible and hiding itself after 10 seconds; `AvatarNoticeLabels` lets a host word it. Its words come from `ng-realtime-media`'s `AvatarNoticeText`, which gains an options argument (`{ NameAgent: true }` names the agent on a call's lines, for meetings; calls are unchanged) and takes `null` for a reason it doesn't know, giving the new `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`.
