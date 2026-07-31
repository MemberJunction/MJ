---
"@memberjunction/ai-elevenlabs": patch
---

Carry a per-session **voice** on ElevenLabs realtime sessions: `RealtimeSessionParams.Config.voice` is now sent as the `tts.voice_id` conversation-config override, on both the client-direct mint and the server-bridged initiation frame.

The driver could already carry a per-session system prompt but not a voice, so a consumer modelling a persona could express who the agent *is* but not what they *sound like* — every session on an agent shared one voice, and changing it meant one dashboard-managed agent per persona. `voice` is the driver-neutral key AssemblyAI and Inworld already read, so it reaches the driver unchanged from the effective config as `realtime.voice.providers.elevenlabs.voice`.

Enabling the override on the managed agent is not sufficient on its own: ElevenLabs drops any override the agent has not allowed, and the ensure flow's drift check only tested the *prompt* override — so an agent provisioned by an earlier version matched on tools and was never re-PATCHed, leaving `tts.voiceId` disabled and the voice silently dropped on every existing deployment. The drift check now requires the whole override set, so those agents are repaired on next use. A test drives every override the driver writes and asserts each one, alone, triggers that repair — so adding a future override without teaching the drift check about it fails the build rather than shipping the same silent gap again.

Sessions with no configured voice are byte-for-byte unchanged. Blank and non-string values are ignored rather than sent, since an empty `voice_id` would fail the whole session. Fixes #3374.

Two API notes, both on seams the driver owns end to end: `ElevenLabsRealtimeSession.SendInitiation` now takes the wire-shaped overrides object rather than the system-prompt string, so the client-direct and server-bridged paths build it in one place and cannot drift (the class is documented as driver-constructed and never instantiated by consumers). `ElevenLabsRealtime.PromptOverrideEnabled` is deprecated in favour of `OverridesSatisfied` — it reports on one override and so cannot answer whether an agent is current.
