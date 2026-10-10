---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/mobile-app": patch
"@memberjunction/integration-test-suite": patch
---

A phone call never asks the model for an avatar. A caller hears the agent and sees no video, but a voiced agent whose persona has a face still asked for its avatar on a phone call: on a carrier call (Twilio, Vonage, RingCentral) the Gemini driver refused it as `bridged` and logged that on every call, and on a call that reached a LiveKit room through SIP the room coordinator asked for room delivery whenever its host could publish, so the model rendered avatar video, billed per minute, that the caller never saw. The session prep now decides before the driver: a session marked as a phone call (`PrepareClientSessionInput.PhoneCall`, set from `params.data.realtimePhoneCall`, which `CreateBridgeRealtimeSession` sets from `BridgeRealtimeSessionContext.PhoneCall`) carries no avatar request, keeps the avatar persona's voice so the agent sounds the same as in a call that shows its face, and the default model walk prefers no avatar model for it. The telephony call starter marks every carrier call as a phone call; the room call starter passes its channel to the coordinator (`AgentRoomHostOptions.Channel`), which on `'phone'` skips the native module's avatar probe, passes no room delivery, and marks the session (`RealtimeSessionStartContext.PhoneCall`). Core gains the reason `'phone'` (`RealtimeAvatarUnavailableReason`, read by `ParseRealtimeAvatarStatus` and the bot attribute reader); a phone call's bridged session reports `{ Requested: true, Granted: false, Reason: 'phone' }` as its `AvatarStatus`, so a SIP call's bot joins with `mj.agentAvatar` `audio-only:phone`, and the notice reads "Audio only for {Agent}: the avatar isn't shown on phone calls" (`ng-realtime-media` and the mobile app's copy). The `bridged` reason now covers only a server-side session whose host can't publish video into a room. Integration check RD13 also checks that a phone call in a room that could publish the avatar asks for none and keeps the persona's voice.
