# Live Call Checklist — Twilio

> **Agent parity / reliability pass (PR 2):** rows 13–21 below cover what that pass added — transfer, DTMF in and out,
> `end_call`, model-drop recovery, the concurrency cap, barge-in (which keeps delegated work running) with
> `cancel_pending_work`, the transfer directory and the phone framing. None of it has
> been exercised on a real carrier. Twilio DTMF is sent **in-band** (generated tones on the media stream); whether a
> given IVR accepts those tones is the first thing to confirm in row 15.

**Why this exists:** the last recorded live Twilio call (June 2026) ran against the old MJServer-hosted ingress.
The ingress now lives in `@memberjunction/telephony-adapters` (moved 2026-09-12) and has since gained a configured
inbound run-as user, per-call media-socket tokens, an outbound gate, status callbacks + answering-machine
detection, immediate webhook answers and a call-length cap. **None of that has been exercised against a real
carrier.** Run this checklist on a real Twilio account before relying on it, and record the call SIDs.

Vonage and RingCentral have never been run live; this checklist covers Twilio only.

Setup is in [`DEPLOYMENT.md`](./DEPLOYMENT.md) (§4 config, §6 ngrok + number webhook). Constants and the GraphQL
snippet for outbound are in [`TESTING.md`](./TESTING.md) (Tier 1).

## Before you start

- [ ] `telephony.inboundRunAsUserEmail` names a **dedicated least-privilege** user (not the system user, not an Owner).
- [ ] `MJAPI_PUBLIC_URL`, `TWILIO_STREAM_PUBLIC_URL` and the number's Voice webhook all point at the **current** public host.
- [ ] For the cap test (row 18), set `telephony.maxConcurrentCalls` to `1` **temporarily**.
- [ ] For a short max-duration test, set `telephony.maxCallSeconds` to something small (e.g. `60`) **temporarily**.
- [ ] You have a second phone to call from / receive on, and (for the voicemail test) a number that goes to voicemail.
- [ ] MJAPI log is visible (`[Telephony][Twilio]` lines are the evidence for most items below).

Record, for every row: the **Call SID**, **date/time**, **pass/fail**, and anything surprising. A row with no Call SID has not been run.

## Calls

| # | Scenario | Steps | Expected | Call SID | Date | Result | Notes |
|---|---|---|---|---|---|---|---|
| 1 | **Inbound** | Call the agent's Twilio number from your phone. | Webhook answers immediately (no delay before the agent speaks beyond model startup); the agent greets you; you hold a two-way conversation. MJAPI log shows no `refusing media socket`. A bridge row + agent session + co-agent run exist. | | | | |
| 2 | **Inbound, no run-as user** | Blank `inboundRunAsUserEmail`, restart, call the number. | You hear a short apology and the call hangs up. MJAPI log: `rejecting inbound call … inboundRunAsUserEmail is not configured`. No agent session is created. Restore the setting afterwards. | | | | |
| 3 | **Outbound** | Run `PlaceTwilioCall` (see TESTING.md) to your phone as a user who may run the agent; answer. | Phone rings; you hear the agent from the **first word** (no clipped greeting); two-way conversation. | | | | |
| 4 | **Outbound refused** | Run `PlaceTwilioCall` to a destination outside `telephony.outbound.allowedPrefixes` (e.g. `+44…`), then as a user without permission to run the agent. | `Success:false` with a clear `ErrorMessage` both times; no Twilio call is created (no new Call SID in the Twilio console). MJAPI log shows the refusal with the destination masked to its last 4 digits. | n/a | | | |
| 5 | **Outbound, no answer** | `PlaceTwilioCall` to a phone you let ring out (or a number that never answers). | After the carrier gives up, the bridge session ends **on its own**: the bridge row reaches `Disconnected` and no session stays `Connected`. MJAPI log shows the status callback (`no-answer` / `busy` / `failed`). | | | | |
| 6 | **Outbound, voicemail / AMD** | `PlaceTwilioCall` to a number that goes to voicemail; let it answer. | With the default `onMachine: 'hangup'` the call is hung up shortly after the machine answers and the session ends. Repeat with `onMachine: 'continue'`: the call stays up and the verdict is only logged. | | | | |
| 7 | **Hang-up (caller)** | During call 1 or 3, hang up from your phone. | Session ends promptly (bridge row `Disconnected`, agent run finalized). | | | | |
| 8 | **Hang-up (agent / MJ)** | During a call, stop the session from MJ (e.g. stop the bridge session). | The phone call is hung up. | | | | |
| 9 | **Max duration** | With `maxCallSeconds: 60`, stay on a call past 60 s. | At ~60 s the call is hung up and the session ends (log: `ending call … (max-duration)`). No further stop attempts after the call ends. | | | | |
| 10 | **Media-socket rejection** | From a machine that can reach MJAPI, open `wss://<public-host>/telephony/twilio/media` and send a `start` frame naming a real Call SID **without** the token, then with a wrong token. | Socket is closed both times; MJAPI log: `refusing media socket for call … bad-token`. The live call (if any) is **unaffected**. Repeat with a Call SID MJ never saw: `unknown-call`. | n/a | | | |
| 11 | **Duplicate socket** | While call 1 is connected, open a second socket with the correct Call SID and token (you will need the token from the TwiML — easiest to just replay a captured `start` frame). | Second socket is refused (`already-attached`); the original call keeps its audio. | n/a | | | |
| 12 | **Rate limit** | Set `telephony.outbound.maxCallsPerUserPerHour: 2`; place 3 outbound calls in an hour as one user. | Third attempt is refused with a "limit reached" message. Restore the setting. (The limiter is per process.) | | | | |
| 13 | **Transfer (directory)** | Configure `telephony.transferTargets` with one entry pointing at a second phone you hold. On a live call ask the agent to transfer you to it by name. | The agent says a short goodbye, then the call is handed to the second phone within ~3 s; the call is **not** hung up by MJ when the media stream stops (log: no `hangup` after the transfer; bridge row `Disconnected`). | | | | |
| 13b | **Transfer, no free-form number** | On a live call say "transfer me to +1 415 555 0123" (any number you dictate), then ask for a name that is not in the directory. Then empty `transferTargets`, restart and ask again. | The agent cannot transfer to a dictated number or an unknown name (it is told the available names); no carrier transfer call is made. With an empty directory the agent does not offer to transfer at all. | | | | |
| 14 | **Transfer failure** | Point a directory entry at an allowed but unreachable number and ask for it. | The caller is still on the line and the agent apologises and offers another way to help (it is told `[call control] The transfer failed…`). | | | | |
| 15 | **DTMF out** | Call an IVR (or a second phone running a DTMF decoder app) as an outbound call and ask the agent to press `1` then `4021#`. | The far end receives the digits (each tone ~100 ms, 100 ms gap) and the **call stays up** and keeps its audio. This is the in-band-tone check: if the IVR ignores the tones, record it — do not edit the row. | | | | |
| 16 | **DTMF in** | During an inbound call press `1234` on the keypad, pause. | After ~1.5 s the agent acts as though told you pressed `1234` (one note per burst, not one per key). | | | | |
| 17 | **end_call** | Say goodbye and tell the agent to end the call (or let it conclude). | The agent says goodbye, then the call is hung up ~3 s later; session ends; **agent session row is `Closed`** (not left `Active`). | | | | |
| 18 | **Concurrency cap** | With `maxConcurrentCalls: 1`, keep call 1 up and dial the number from a second phone; also try `PlaceTwilioCall`. | The second caller hears "all of our agents are busy" and the call ends; `PlaceTwilioCall` returns `Success:false` with a "busy" message and no Twilio call is created. When call 1 ends, a new call is accepted again (the slot was released). | | | | |
| 19 | **Model drop** | While a call is up, break the realtime model connection (e.g. block outbound to the model vendor for a few seconds, or kill the model socket). | Within a few seconds the model session is reopened **once** and the agent continues knowing what was said earlier. If it cannot be reopened the caller hears the apology (`<Say>`) and the call ends — it is never silent dead air. Log shows the single recovery attempt, no loop. | | | | |
| 20 | **Barge-in keeps work running** | Ask the agent something that makes it delegate (a slow lookup), then talk over it (or say "mm-hm") mid-lookup. | The delegated work is **not** cancelled and its answer is still delivered; only a queued "still working on it" progress line is dropped. While delegated work runs the agent narrates progress aloud. | | | | |
| 21 | **cancel_pending_work** | Start a slow lookup, then say "never mind, stop that". | The agent calls `cancel_pending_work`; log: `agent cancelled N pending run(s) at the caller's request`; the delegated run is aborted and no answer arrives. | | | | |

## Multi-agent rooms (agent test bed)

These rows cover turn-taking between two or more agents in one LiveKit room, run from the Meet app's **Live Room**
(start a call, then add agents in the room's **Agents** panel and open the **Turns** panel). Nothing here needs a phone
number. None of it has been run against a live model: the host tools (`i_am_addressed`, `yield_turn`), the
full-duplex capability flag and the floor gate are tested against fakes only, and the first thing to learn is how
often each vendor's model actually calls `i_am_addressed` before it speaks (rows M2, M3). Record the **room name**,
the two models used, the date and pass/fail for every row; a row with no room name has not been run.

Setup: two agents on **different** realtime models if you can (one GPT-Live, one Gemini 3.8 Live), and a second person
or a second browser tab for the human who talks over them. Leave **Turns** open for the whole run; each expected
outcome below is something the panel should show.

| # | Scenario | Steps | Expected | Room | Date | Result | Notes |
|---|---|---|---|---|---|---|---|
| M1 | **Seat two agents** | Start a call with agent A (Turn-taking: Passive, Addressing: Auto). In the Agents panel add agent B with the same settings. | Both appear in the roster with a `Passive · Model-side` (full-duplex model) or `Passive · Name match` badge; the Turns panel lists both seats and shows "The floor is free". The pill reads "Turns" until someone speaks. | | | | |
| M2 | **Model-side addressing** | Say, without either name, "what does the room think about this?" then "A, what do you think?". | The first is judged by the models themselves: at most one agent answers, never both. The panel shows one "took the floor" and, for a non-addressed agent, a "held back" row at most. Note which agent answered and whether it called `i_am_addressed` first (MJAPI log). | | | | |
| M3 | **Name match fallback** | Re-add an agent with Addressing: **Name match**. Say "B, are you there?" then something addressed to nobody. | Only B answers the first; nobody answers the second. The badge reads `Name match`. | | | | |
| M4 | **No overlap** | Address both agents in one sentence ("A and B, introduce yourselves"). | They speak one after the other, never over each other; the panel shows one `Floor held` at a time and the second agent is held back until the first releases. | | | | |
| M5 | **Backchannels** | While agent A is explaining something, say "mm-hm", "right", "go on". | A keeps talking uninterrupted; the panel's backchannel counter rises and no floor change appears. Then ask a real short question ("what time is it?"): that **is** a turn. | | | | |
| M6 | **Human preempts** | While an agent is speaking, talk over it. | The agent stops within about a second ("A person cut in on ..." in the feed), the floor is free, and any delegated lookup it started still delivers its answer. | | | | |
| M7 | **Explicit hand-off** | Ask A to "pass this to B". | A says a short handover, the panel shows "A handed the floor to B" and "Floor reserved for B", B then speaks. A third agent (add one) does not jump in. If B does not speak within about 5 s the reservation lapses on its own. | | | | |
| M8 | **Hand-off to nobody** | Ask A to "hand over to Zed" (no such agent). | A is told there is no such agent and the floor returns to the room; nothing is reserved. | | | | |
| M9 | **Loop cap** | Set both agents to **Active** and let them talk to each other without speaking yourself. | After 8 consecutive agent turns the meter reaches its end, the panel reads "Agents paused until a person speaks" and neither agent speaks again until you do; then the counter resets. | | | | |
| M10 | **Human joins and speaks** | In a second browser tab, join the same room by name (Join existing) and speak. | The joined tab can open the **Turns** panel; the person is heard and preempts exactly as in M6. | | | | |
| M11 | **Late second agent** | Start with agent A alone and hold a one-to-one conversation, then add B mid-call. | Before B joins, A answers everything with no turn-taking behaviour. After B joins A is told once how to take turns (log: a single framing note) and the panel starts showing both seats. | | | | |
| M12 | **Turn-based model in the mix** | Add an agent whose model is not full-duplex. | It shows `... · Name match`, is triggered by the engine rather than speaking on its own, and still never overlaps the full-duplex agent. | | | | |

## After the run

- [ ] Restore any settings you changed for the test (`maxConcurrentCalls`, `maxCallSeconds`, `onMachine`, `maxCallsPerUserPerHour`, `inboundRunAsUserEmail`).
- [ ] Update the **Status** banners in `TESTING.md` and `telephony-vendor-bindings.md` with the date and the Call SIDs above.
- [ ] File anything surprising as an issue; do not edit the rows to hide a failure.

## Things only a live call can tell you (open questions from the code review)

These carrier-side parameters were written from documentation and could not be exercised offline; confirm them on the
first real calls:

- [ ] Twilio accepts `statusCallbackEvent` (initiated / ringing / answered / completed), `machineDetection: 'Enable'`,
      `asyncAmd: 'true'` and `asyncAmdStatusCallback` on `calls.create`, and POSTs the verdict (`AnsweredBy`, `CallSid`)
      to `/telephony/twilio/amd`.
- [ ] Twilio echoes the TwiML `<Parameter name="mjToken">` back as `start.customParameters.mjToken` on the
      Media-Streams `start` frame.
- [ ] The URL Twilio signs for `/voice`, `/status` and `/amd` equals the **origin** of `MJAPI_PUBLIC_URL` plus the
      request path. (Earlier builds appended the request path to the whole public URL, which double-counted a path such
      as `/graphql` and failed every signature check; if your public URL has a path **and** your reverse proxy adds a
      matching prefix, confirm the signature still verifies.)
- [ ] Twilio plays the `<Say>` + `<Hangup/>` TwiML the engine posts through `UpdateCall` for the model-loss goodbye,
      and a REST `UpdateCall` for a transfer (`<Dial>`) does end the Media-Streams leg cleanly without MJ then
      hanging the transferred call up.
- [ ] Vonage: the NCCO `talk` goodbye through the transfer endpoint, and the DTMF REST call, behave as written
      (carried over from documentation only).
- [ ] RingCentral: SIP REFER transfer completes and the softphone detaches without sending a BYE to the transferred
      call.
- [ ] Hanging up an already-ended call (the session stop after a terminal status) logs a harmless Twilio error rather than
      anything that stalls teardown.
