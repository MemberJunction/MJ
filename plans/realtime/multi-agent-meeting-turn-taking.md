# Multi-Agent Meeting Turn-Taking

**Status:** Design (2026-06-19). Companion to [`realtime-core-host-convergence.md`](realtime-core-host-convergence.md) (this is the meaty part of its Phase 2 / bridged-session runtime).

**The vision.** An MJ agent joins a meeting (LiveKit now; Zoom/Teams/Webex later) like a human participant: it **hears the entire conversation**, **knows when it's being addressed and when it isn't**, **speaks only when appropriate**, and can **talk to other agents** when the moment calls for it. That's the whole point of an agent being *in the meeting* rather than in a 1:1 call.

---

## 1. The reframe (what's actually broken)

Symptoms seen in testing: a newly-added agent "picks up the last conversation," and agents say things from nowhere ("a bottle of whiskey," "I can't move money or self-destruct"). The instinct is "they're hearing each other — isolate them." **That's wrong.** Hearing each other is *desired*. The actual defect:

> Each agent **blindly auto-responds** to any audio it hears. OpenAI/Gemini server-VAD fires a response whenever speech stops, with **zero notion of "was that addressed to me?"** So put N agents in a room and every one answers every utterance — including each other's — and with nothing real to contribute, they free-associate and spiral.

It is a **turn-taking deficit, not an audio-routing problem.** The fix is to give each agent the judgment a human has in a meeting: listen to everything, speak selectively.

---

## 2. Core principle: **hear always, speak selectively**

| | Hearing | Speaking |
|---|---|---|
| **1:1 co-agent call** (today) | the human | **auto-respond** — snappy, always reply |
| **Multi-agent meeting** (this design) | **everyone** (humans + other agents) — full context | **gated** — speak only when addressed or when it's genuinely this agent's turn |

So the meeting strategy is: **keep `autoSubscribe` (full context), DISABLE the model's blind auto-response, and trigger speech deliberately through a turn-taking gate.** The model still *hears and transcribes* everything (context accrues silently); it just doesn't talk on its own.

This is **per-mode**, not a global change — 1:1 calls keep auto-response. The bridge already carries a `TurnMode`; it selects the strategy.

---

## 3. Architecture

```
room audio (all participants) ──▶ session.SendInput   "the agent always HEARS the meeting"
                                        │
                                  (model transcribes, builds context, but create_response = false)
                                        │
                          session.OnTranscript ──▶  TURN GATE  ──(speak?)──▶ RequestSpokenUpdate
                                                       ▲                         (the agent SPEAKS)
                                roster + floor state ──┘
```

1. **Disable blind auto-response** on meeting sessions: `turn_detection.create_response = false` (the lever already noted in the convergence plan — server VAD still segments speech for transcription + barge-in, but doesn't auto-generate replies).
2. **Drive speech from the gate**: when the gate says "speak," call `RequestSpokenUpdate` (the `response.create` path). *(This is the path removed for the 1:1 overlap fix — it's exactly what meetings need; it returns here, gated.)*
3. **Meeting-aware system prompt** (added by the core prep when `TurnMode` is a meeting mode): *"You are in a meeting with [roster]. Stay quiet and keep listening unless you are addressed by name or the conversation clearly needs YOUR expertise. Never talk over others; let humans finish."* Realtime models honor this well **once they're not forced to respond**.

---

## 4. The gate (the interesting part) — pluggable, gets smarter over time

The gate answers one question per detected turn: **"should THIS agent speak now?"** It's an **interface**, so we swap implementations as models improve. This is the "ready for smarter models" lever — the architecture is capability-agnostic; only the gate evolves.

| Level | Decision basis | Ships | Notes |
|---|---|---|---|
| **L0 — Addressed-by-name + floor lock** | regex on transcripts ("Demo Loop, …") + one-speaker-at-a-time + defer-to-human | **MVP / now** | Crude but immediately usable. Reuses `RegexAddressedMatcher`. "Sorta working." |
| **L1 — Contextual relevance** | a lightweight "is this in my lane / should I jump in?" judgment on silence windows (fast LLM call, or a cheap classifier over the rolling transcript) | next | Lets an agent contribute unprompted when the topic is clearly its domain. |
| **L2 — Model-native** | delegate to the realtime model's own multi-party turn-taking as it matures | future | As models get smarter, hand them more of the judgment; the gate thins out. |

L0 alone kills the spiral: agents stay silent unless named, and only one talks at a time. **Agent-to-agent falls out naturally** — if Sage says *"Demo Loop, pull the weather,"* the addressing gate lets Demo Loop respond, on purpose.

---

## 5. Plumbing (mostly already in the codebase)

- **`TurnTakingPolicy` + matchers** (`packages/AI/RealtimeBridge/Base`) — exist (`RegexAddressedMatcher`, `AlwaysAddressedMatcher`); the work is **wiring them to gate the bridge's `RequestSpokenUpdate`** instead of relying on auto-response.
- **Roster awareness** — `LiveKitAgentRoomCoordinator` already tracks which agents + humans are in a room (it starts/stops them). Feed the live roster to (a) the gate (who's a bot vs human) and (b) the meeting-aware system prompt.
- **Floor control** — a shared "who has the floor" across the room's agent sessions (cross-session coordination owned by the coordinator). One speaker at a time; release on utterance-end.
- **Long-lived bridged-session runtime** — the convergence's Phase 2. Policy-driven `RequestSpokenUpdate` + the gate live in the **core** (shared by every host); a host supplies only media + roster.
- **The `create_response` lever** — thread a "meeting mode → disable auto-response" flag through the core prep (the same seam the convergence already uses for tools/voice).

---

## 6. Phasing

- **2a — MVP ("sorta working"):** disable auto-response on meeting sessions + L0 gate (name-addressing + floor lock + defer-to-human) + meeting-aware prompt + roster wiring. Goal: a room of agents that **stay quiet until named** and **take turns** — no more spiral.
- **2b — Contextual contribution:** L1 gate (relevance judgment) so an agent can volunteer when the topic is clearly its domain.
- **2c — Richer dynamics:** graceful interruption/barge-in in multi-party, backchannel ("mm-hm"), agent-to-agent hand-offs, and eventually L2 model-native turn-taking.

---

## 7. Open questions & caveats

- **Current model capability is the real limiter** (not the plumbing). Today's realtime models have weak multi-party awareness, so the MVP leans on **explicit addressing + prompt discipline + an external gate**. That's fine — the point is to have the architecture ready so we mostly swap the gate as models get smarter.
- **Latency**: gating adds a beat vs. instant auto-response. Acceptable in a meeting (humans pause too); tune the floor-release timing.
- **Floor control is cross-session**: each agent is its own bridged session, so "who has the floor" must be coordinated centrally (the coordinator is the natural owner).
- **Barge-in semantics** in multi-party: a human interrupting should always win the floor; agent-interrupts-agent needs a politeness policy.
- **Cost** of an L1 per-turn relevance judgment across several agents — debounce to silence windows, not every utterance.

---

## 8. Relationship to the convergence

This lives in the **core** (one turn-taking layer, shared by every host) — consistent with [`realtime-core-host-convergence.md`](realtime-core-host-convergence.md): hosts provide media transport + roster; identity, precedence, delegation, tracking, **and now turn-taking** are core. It depends on the Phase 2 long-lived bridged-session runtime (policy-driven speech + the `create_response=false` lever), so it's sequenced right after it.
