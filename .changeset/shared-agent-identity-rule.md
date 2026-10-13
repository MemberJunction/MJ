---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/livekit-room-server": patch
---

The rule that tells an agent's bot from a person in a meeting room now lives in one place, `@memberjunction/ai`: `AgentParticipantIdentity(agentSessionId)` gives a bot its participant identity (`agent-<agent session id>`), and `IsAgentParticipantIdentity(identity)` reads one back (any identity starting with `agent-`, in any case). The LiveKit room coordinator mints the bot's identity with it; the LiveKit bridge, the bot's video watcher and the bridge engine read identities with it, where the engine had three inline copies of the check. `IsAgentParticipantIdentity` in `@memberjunction/ai-bridge-livekit` is deprecated and calls the shared one, and the package now depends on `@memberjunction/ai`. The engine's verbose first-frame log says what arrived: "The agent can SEE your camera." or "...your screen." for video (it said "The agent is HEARING you." for every track); the line for audio is unchanged. Nothing else behaves differently.
