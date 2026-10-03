---
"@memberjunction/telephony-adapters": patch
"@memberjunction/ai-bridge-twilio": patch
"@memberjunction/ai-bridge-vonage": patch
"@memberjunction/server": patch
---

Telephony safety hardening for the Twilio, Vonage and RingCentral bridges. Inbound calls now run as the user named by the new `telephony.inboundRunAsUserEmail` setting instead of falling back to the System/Owner user; with no usable user the call is rejected (polite TwiML/NCCO, or a declined SIP INVITE) and logged — **inbound calls stop working after upgrading until the setting is configured**. Carrier media websockets are authenticated with a per-call secret token (Twilio `<Parameter name="mjToken">`, Vonage `mj_token`); unknown, mismatched or duplicate sockets are refused and never replace a live one. Every outbound `Place*Call` is gated by the caller's right to run the agent, a destination allow/block-prefix policy and a per-process hourly rate limit (`telephony.outbound`). Vonage outbound calls now carry a correlation id so their media socket can be matched (previously outbound Vonage calls had no audio). Twilio gains signature-verified `/status` and `/amd` callbacks and Vonage terminal `/event` handling so unanswered/failed calls end their session, plus configurable answering-machine handling (`onMachine`). The answer webhooks reply immediately and start the bridge session in the background, buffering early audio (bounded). Twilio audio buffered before the stream starts is re-addressed to the real `streamSid` and capped, and phone sessions are capped at `telephony.maxCallSeconds` (default 1800).
