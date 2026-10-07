---
"@memberjunction/ai": minor
"@memberjunction/livekit-room-server": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
---

MJAPI records a person's choice of whether agents may see their camera and shared screen in a LiveKit room. The new `SetLiveKitAgentVision` mutation works out the participant from the signed-in user (no identity is sent), sets their `mj.agentCanSee` attribute through LiveKit's server SDK with the new `LiveKitParticipantService` (a participant's token can't change its own attributes), and writes an `MJ: Audit Logs` row of the new `Realtime Agent Vision Consent` type whether LiveKit applied the change or refused it. `GraphQLLiveKitClient.SetAgentVision` calls it, and `AgentVisionAttributes` in `@memberjunction/ai` builds the attribute change. Integration test IT101 drives it over the wire. Minor because it adds an audit log type under `metadata/`.
