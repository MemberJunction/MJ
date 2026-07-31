---
"@memberjunction/ai-elevenlabs": patch
---

Carry a per-session **voice** on ElevenLabs realtime sessions: `RealtimeSessionParams.Config.voice` is now sent as the `tts.voice_id` conversation-config override, on both the client-direct mint and the server-bridged initiation frame.

The driver could already carry a per-session system prompt but not a voice, so a consumer modelling a persona could express who the agent *is* but not what they *sound like* — every session on an agent shared one voice, and changing it meant one dashboard-managed agent per persona. `voice` is the driver-neutral key AssemblyAI and Inworld already read, so it reaches the driver unchanged from the effective config as `realtime.voice.providers.elevenlabs.voice`.

Enabling the override on the managed agent is not sufficient on its own: ElevenLabs drops any override the agent has not allowed, and the ensure flow's drift check only tested the *prompt* override — so an agent provisioned by an earlier version matched on tools and was never re-PATCHed, leaving `tts.voiceId` disabled and the voice silently dropped on every existing deployment. The drift check now requires the whole override set, so those agents are repaired on next use. A test drives every override the driver writes and asserts each one, alone, triggers that repair — so adding a future override without teaching the drift check about it fails the build rather than shipping the same silent gap again.

Sessions with no configured voice are byte-for-byte unchanged. Blank and non-string values are ignored rather than sent, since an empty `voice_id` would fail the whole session. Fixes #3374.

Smoke-testing the above against a live ElevenLabs account surfaced two further defects in the managed-agent ensure flow, both pre-existing and both fixed here:

**The tool-set fingerprint never matched the remote, so every session re-PATCHed the agent.** `ToolSetFingerprint` compared a raw `JSON.stringify`, but the platform returns schema keys in its own order *and* materializes its own defaults into the stored form (`dynamic_variable: ""`, `is_omitted: false`, `required: []`, `isSystemProvided: false`, `constantValue: ""`), making the stored schema a superset of what was sent. The fingerprint now sorts object keys and drops empty/default entries on both sides. Arrays keep their order, since an `enum` or `required` list is data rather than a set. Deliberate, documented loss of sensitivity: a field flipping between `false`/`""`/`[]` and absent no longer counts as drift; any meaningful value change still does.

**Find-by-name could fork a duplicate managed agent.** ElevenLabs' agent search is eventually consistent, so an agent created moments earlier — by this process or a concurrent one — is briefly invisible. A single miss made the ensure flow conclude the agent did not exist and create a second one competing for the same name forever (observed live, twice). Lookups are now retried up to a bounded `MAX_AGENT_LOOKUP_ATTEMPTS`, and when duplicates *do* already exist the oldest is adopted deterministically so every process and session converges on the same agent instead of PATCHing them alternately.

Two API notes, both on seams the driver owns end to end: `ElevenLabsRealtimeSession.SendInitiation` now takes the wire-shaped overrides object rather than the system-prompt string, so the client-direct and server-bridged paths build it in one place and cannot drift (the class is documented as driver-constructed and never instantiated by consumers). `ElevenLabsRealtime.PromptOverrideEnabled` is deprecated in favour of `OverridesSatisfied` — it reports on one override and so cannot answer whether an agent is current.
