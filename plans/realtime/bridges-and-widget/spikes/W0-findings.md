# W0 — Guest guardrails: findings (D5 confirmation)

**Status:** DONE.
**Date:** 2026-06-24
**Acceptance criterion:** _"documented confirmation that pinning + constrained principal is required and works."_ ✅ met.

## What was tested

The spike bootstraps the live SQL Server provider + `AIEngineBase` against `MJ_Workbench`
and reproduces the **exact** candidate-agent filter from
`packages/ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts:150-160`:

```typescript
const currentUser = this.Provider.CurrentUser;
if (!currentUser) {
    console.warn('[ConversationAgentRunner] No current user available for permission filtering; using unfiltered agent list.');
}
const candidateAgents = AIEngineBase.Instance.Agents.filter(
    (a) => !UUIDsEqual(a.ID, agent.ID) && !a.ParentID && a.Status === 'Active' && a.InvocationMode !== 'Sub-Agent'
);
const availableAgents = currentUser
    ? await this.filterAgentsByPermissions(candidateAgents, currentUser)
    : candidateAgents;   // ← guest path: NO filtering
```

This list is passed to the running agent as `Data.ALL_AVAILABLE_AGENTS` — i.e. the set of
agents the pinned support agent may **hand off to**.

## Empirical result (live `MJ_Workbench`)

```
Total agents in metadata:            43
Active top-level (non-sub) agents:   17
Agents a GUEST session would expose: 17 (UNFILTERED)
```

The 17 exposed handoff targets included **Skip, Database Designer, Codesmith Agent,
Agent Manager, Query Builder, Marketing Agent, Research Agent, Memory Manager** — i.e.
internal/back-office agents that a public support visitor must never be able to reach.

## Conclusion (D5 confirmed — two distinct controls are both required)

1. **Pinning `explicitAgentId`** fixes which agent *runs first*, but does **not** constrain
   the handoff list. For a guest (`currentUser === undefined`), `ALL_AVAILABLE_AGENTS` is the
   full 17-agent set above. So pinning alone is necessary-but-insufficient.
2. **A constrained guest principal** is the real backstop. The synthesized guest `UserInfo`
   must (a) carry a restricted role whose entity permissions cannot reach arbitrary data, and
   (b) — because the routing list is unfiltered for guests — the **pinned support agent's own
   tool/handoff surface must be support-scoped** so a handoff can't escalate.

### Design implications carried into W1/W2

- W1 mints a guest JWT that synthesizes a `UserInfo` with **a present `CurrentUser`** (the
  shared Anonymous principal) carrying a **restricted guest role** — NOT a `null`/absent user.
  This both (a) avoids the unfiltered-fallback warning path and (b) means
  `filterAgentsByPermissions` actually runs. _(Note: the magic-link anonymous path already
  synthesizes such a principal via `buildMagicLinkSessionUser` — the widget reuses it.)_
- W2's guest role is the authorization boundary; it must grant read/write only on the
  visitor's own Conversation + Conversation Details and nothing else.
- The widget **always** passes `explicitAgentId` (the per-instance pinned agent). The
  unfiltered fallback path is never relied upon.

## Note on scope

A full live LLM agent turn was intentionally **not** run here (no model spend, and the
design conclusion does not depend on it — the exposure is a pure metadata/permission fact).
The guest *text-turn* end-to-end path is exercised for real in W3's acceptance against MJAPI
(which is gated on Auth0/MJAPI boot — see journal). The minor non-fatal startup warning about
`MJ_BASE_ENCRYPTION_KEY` not being set does not affect this result (no encrypted fields read).
