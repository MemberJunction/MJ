---
"@memberjunction/ai-agents": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server-bootstrap-lite": minor
---

**A skill can stay active for a conversation, not just a run.**

A skill activates for one run: `requestedSkillIDs` is a per-call input and the activated set dies
with the run. That is right for a one-shot capability and wrong for a skill that behaves as a
mode — a persona, or an assistant whose reply carries a menu that is pressed on the NEXT turn, when
nothing would re-activate it. Every conversational agent with a mode was re-implementing a
(conversation, skill) table and merging it into the request by hand.

Two additive, opt-in pieces (migration `V202609031400__v6.1.x__Conversation_Scoped_Skill_Activation`):

- `AISkill.ActivationScope` — `Run` (default, today's behaviour) or `Conversation`.
- `MJ: Conversation Skills` — one row per (conversation, skill), `Active` or `Ended`, with the run
  that activated it as provenance.

`BaseAgent` does the rest. At the start of every root run that has a `conversationId`, the
conversation's Active skills join `requestedSkillIDs` (every availability gate still applies on
every run). When a `Conversation`-scoped skill activates — by request or by the agent's own choice —
its row is written or re-activated. A persisted skill that a gate refuses this turn is simply not
activated and gets no note (the user never mentioned it); its row stays Active, because a gate miss
can be transient and ending the row would be silent, permanent loss of a mode. Retiring a mode is an
explicit act. An explicitly requested skill that is refused still gets the system note.
`BaseAgent.EndConversationSkill(conversationId, skillId, user)` is the app's "leave the mode"
gesture. All three steps are protected/public and fail soft: losing a persisted skill means the user
re-invokes it, never that the turn fails.

Precedent: `UserRoutine.RequestedSkillIDs` (v5.45) persists a pre-selection on the owning record and
threads it per run; this is the same idea keyed on the conversation. First-adopter feedback (Betty).
A composer chip that shows the conversation's active skills and ends one on removal is the natural
UI follow-up; the server side works for every client and bridge without it.

Also: `mj sync pull` now round-trips a skill's `MJ: AI Skill Search Scopes` rows (under
`metadata/ai-skills`) and an agent's `MJ: AI Agent Skills` grants (under `metadata/agents`, for the
agents that directory pulls) — pull-config additions only; push already accepted both.
