---
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-twilio": patch
"@memberjunction/ai-bridge-vonage": patch
"@memberjunction/ai-bridge-ringcentral": patch
"@memberjunction/ai-agents": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/server": patch
---

Phone calls now get the same agent as the browser path, survive a dropped model connection, and can transfer, send DTMF and hang up.

- **One co-agent resolution for every host.** The MJServer resolver's chain (explicit, the target's `DefaultCoAgentID`, the type default, then the global Realtime Co-Agent) and its `CanRun` filter on delegation agents moved to `ResolveRealtimeCoAgentID` / `FilterAllowedAgentsByCanRun` in `@memberjunction/ai-agents`. Twilio, Vonage and RingCentral use them, and the dialled agent is now the TARGET voiced by the co-agent instead of being used as both.
- **Caller identity extension point.** `BaseCallerIdentityResolver` (register under `TelephonyCallerIdentity`) lets a host say who an inbound caller is. MJ core knows nothing about contacts; the default treats every caller as anonymous, and the model is told the caller ID is unverified.
- **Phone-aware agent.** The model is told it is on a phone call and gets `transfer_call`, `send_dtmf` and `end_call` tools, offered per the carrier's `CallTransfer` / `DTMF` features. A transfer destination goes through the same E.164 and allow/block-list policy as an outbound dial. Keypad presses from the caller reach the model as one note per burst.
- **Transfers go to a configured directory only.** `telephony.transferTargets` (`{ name, number, description? }`) lists where the agent may transfer a call; the tool takes a name, never a number, so an unverified caller cannot get free forwarding to an arbitrary number. Entries are validated against the outbound policy at startup, and with none configured the tool is not offered.
- **Barge-in follows the browser policy.** Talking over the agent drops queued progress narration but does not cancel delegated work; the new `cancel_pending_work` tool is the explicit cancel.
- **Transfer and DTMF no longer end the call.** Twilio sends DTMF as in-band tones instead of replacing the TwiML, and a transferred or goodbyed call is handed to the carrier rather than hung up when the media stream stops. Vonage uses its DTMF API; RingCentral detaches without a BYE.
- **Model-drop recovery.** A lost realtime model session is reopened once with the conversation so far; if that fails the caller hears a carrier-side message (Twilio `<Say>`, Vonage `talk`) and the call ends. No retry loop.
- **Spoken progress.** Delegations narrate progress on bridged calls.
- **Transcript in the call's own conversation**, attributed to the dialled agent, instead of a shared "Meeting Room" conversation.
- **Cleanup.** `ReconcileOrphans` runs at startup and every 10 minutes; ended calls close their `MJ: AI Agent Sessions` row; live calls heartbeat it so the host janitor does not close a long call.
- **`telephony.maxConcurrentCalls` (default 25).** Over the cap an inbound caller hears "all agents are busy" and an outbound request is refused with `at-capacity`. Set it at or below the realtime model plan's concurrent-session limit.
- **RingCentral `HealthCheck`** reports unhealthy when SIP registration failed or has been pending past a minute, with the reason.
- **Audio.** A stateful per-direction resampler with a low-pass filter replaces the stateless one, removing frame-edge clicks and aliasing when 24 kHz model audio is sent at 8 kHz.
- **Fixes.** Inbound bridge rows are stamped `InboundRoute` / `Active` rather than `OnDemand` / `Passive`; the roster no longer swaps the agent's and the caller's numbers; and the Twilio signature URL is the public URL's origin plus the request path, so a public URL ending in `/graphql` no longer double-counts the path.
