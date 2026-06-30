# Public Web Widget — Droppable Customer-Support Surface (Text + Voice)

**Part of:** [Agent Bridges & Public Widget program](./README.md)
**Decisions in force:** D1 (pluggable auth, guest-first), D2 (text+voice), D5 (constrained guest principal + pinned agent)
**Goal:** A single `<script>` tag any customer drops on any website that opens a support conversation — text and voice — with an MJ agent, with **no MJ login**, optionally upgradeable to a verified identity.

---

## Status (updated 2026-06-30)

**Public-safe path implemented (Phases 0–3).** The cross-guest run-entity leak is closed, voice has a
server-authoritative hard cap, channels are wired, and host identity is a proper provider.
⚠️ **One workflow gate:** two new `WidgetInstance` columns (`EnabledChannels`, `HostPublicKey`) are added
by `V202606292320__…Widget_Public_Hardening.sql` — **run `mj migrate` + CodeGen before building MJServer**;
the two TS references to those columns only compile once the entity is regenerated.

| Phase | Status | Notes |
|---|---|---|
| W0 — spike & guardrails | ✅ **Done** | Live test confirmed the unfiltered-agent footgun; pinning + constrained principal required and works. |
| W1 — guest-session backend | ✅ **Done** | `packages/MJServer/src/widget/` — mint/refresh/upgrade routes, `mj_widget_id` claim, config block, pre-auth mount, unit tests. |
| W2 — widget-instance metadata | ✅ **Done** | `MJ: Widget Instances` migration + CodeGen + seed; `Widget Guest` restricted role + entity permissions. |
| W3 — embeddable bundle (text) | ✅ **Done** | `packages/Web/Widget/` shadow-DOM `<mj-support-widget>`, loader, runtime transport reusing `GraphQLDataProvider` + `ConversationsRuntime`. Now **code-split** (thin `embed.ts` entry; transport/voice/runtime in lazy chunks). 71 tests. |
| W4 — voice (client-direct) | ✅ **Done** | Mic → realtime mint → driver. **Server-authoritative hard cap added**: `MaxSessionSeconds` threaded `PrepareClientSession → RealtimeSessionParams`; the resolver stamps an absolute deadline on the session (`Config_.maxSessionDeadlineIso`) and `SessionJanitor.RunMaxDurationSweep` hard-closes past it. |
| W5 — upgrade + host identity | ✅ **Done** | Magic-link upgrade ✅. Host identity is now a `HostIdentityProvider extends BaseAuthProvider` (`@RegisterClass(BaseAuthProvider,'host-identity')`, `@memberjunction/auth-providers`); `host-identity.ts` delegates to it; key read from the new `WidgetInstance.HostPublicKey` column (config map kept as fallback). |
| W6 — hardening & embed polish | ✅ **Mostly done** | Origin allowlist ✅, short-TTL + refresh ✅, **per-instance dynamic rate-limit** ✅, **bot/UA heuristics** ✅, **CSP recipe** ✅ (README), **bundle code-split** ✅ (~2.9 MB → 34 KB entry; voice + runtime load on demand). Remaining: the Express `cors()` middleware is still permissive (mint is fail-closed on origin; tighten CORS before public). |

### Phase 0 — blocker closed
**Text path:** agent execution now runs under a **trusted server principal** (`RunAIAgentFromConversationDetail`
detects a widget guest via `IsMagicLinkAnonymous` + `mj_widget_id`, validates conversation ownership under
the guest, then runs the **authoritative pinned agent** under the system user) — so a text guest writes **no**
run rows. **Voice path:** runs are still written under the guest (the realtime subsystem threads `contextUser`
pervasively), so per the chosen approach the three run entities (`MJ: AI Agent Runs` / `Run Steps` /
`AI Prompt Runs`) are now **RLS-scoped** (read) by the new `Widget Guest: Own Agent Runs` filter
(`ConversationID IN vwConversations WHERE ExternalID = {{ScopeResourceID}}`) — closing the cross-guest read
leak for both paths. (Decision: scope-not-remove for the run grants, because voice legitimately writes them
under the guest; full voice elevation would be a larger refactor of the shared realtime subsystem.)

---

## 0. The one-paragraph thesis

We are **not** building a new chat engine or a new agent runtime. We are building (a) a **public-auth seam** that mints a constrained, short-lived session for an anonymous visitor, and (b) a **self-contained embeddable bundle** that mounts the existing `conversations-runtime` (text) + `@memberjunction/ai-realtime-client` (voice) inside a shadow-DOM web component, talking to MJAPI's GraphQL endpoint with the guest token. Everything downstream — agent dispatch, tools, memory, narration — is the existing unified pathway.

---

## 1. Current state (verified against code)

### 1a. The runtime is already guest-capable (with one footgun)

`ConversationsRuntime.Config()` and `AgentRunner.processMessage()` do **not** require an authenticated user:

```typescript
// packages/ConversationsRuntime/src/ConversationsRuntime.ts
public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>

// packages/ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts
public async processMessage(input: ProcessMessageInput): Promise<ExecuteAgentResult | null>
export interface ProcessMessageInput {
  conversationId: string;
  message: MJConversationDetailEntity;
  conversationDetailId: string;
  appContext?: Record<string, unknown> | null;
  onProgress?: AgentExecutionProgressCallback;
  explicitAgentId?: string | null;   // ← pin the support agent here (D5)
  applicationId?: string | null;
}
```

> **⚠️ FOOTGUN (D5):** When no user is present, `ConversationAgentRunner` logs a warning and falls back to the **full unfiltered active-agent list**. For a public endpoint that is the *opposite* of safe. The widget MUST pass `explicitAgentId` (pin the support agent) AND run under a constrained principal whose permissions can't reach arbitrary entities. Never rely on the graceful-degradation path for a public surface.

### 1b. The voice path is already shipped (client-direct topology)

```typescript
// Server mint — packages/AI/Agents/src/realtime/realtime-client-session-service.ts
public async PrepareClientSession(input: PrepareClientSessionInput, contextUser: UserInfo, provider: IMetadataProvider): Promise<RealtimeClientSessionPrepResult>
// Returns ClientConfig { Provider: 'openai'|'gemini'|..., SessionConfig } + ephemeral credential

// Browser — packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts
const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, clientConfig.Provider);
```

`contextUser`/`UserID` are optional in the prep input — when omitted, user-scoped memory is simply not loaded. Good for guests.

### 1c. Adapters the widget must register (mirror the Angular bootstrap)

```typescript
// packages/ConversationsRuntime/src/adapters/
interface INotificationAdapter { Notify(level: NotificationLevel, message: string, ttlMs?: number): void }   // default: ConsoleNotificationAdapter
interface IActiveTaskTracker  { RemoveByAgentRunId(agentRunId: string): boolean }                              // default: NoOpActiveTaskTracker
interface ISessionsAdapter    { readonly SessionLifecycle$: Observable<SessionLifecycleEvent> }                // default: NoOpSessionsAdapter
```
Template to mirror: `packages/Angular/Generic/conversations/src/lib/services/conversations-runtime-bootstrap.service.ts` (registers the 3 adapters, injects `--mj-chat-*` CSS tokens into `<head>`).

### 1d. The auth machinery is ~80% present — reuse, don't rebuild

The magic-link subsystem already models anonymous/embedded sessions. **These exist today:**

- `MJMagicLinkInvite.IdentityMode`: `'email' | 'anonymous'`
- `MJMagicLinkInvite.Kind`: `'app-session' | 'resource-share' | 'anonymous-embed'`  ← **already has `anonymous-embed`**
- **Seeded shared Anonymous principal** — UUID `273910DF-28F1-45C1-A8F8-6E9AD8E5F008`, holds **no** roles
- **Per-session role synthesis from JWT claims** — `buildMagicLinkSessionUser()` in `packages/MJServer/src/context.ts` builds a fresh `UserInfo` whose `UserRoles` come from `mj_scopes`/`mj_role` claims, never DB rows; sets `IsMagicLinkAnonymous = true`
- **RS256 mint + JWKS** — `MagicLinkKeyManager.Sign()` / `GetJWKS()` in `packages/MJServer/src/auth/magicLink/MagicLinkKeys.ts`
- **Pluggable provider seam** — `BaseAuthProvider` + `AuthProviderFactory` (`packages/AuthProviders/src/`); `@RegisterClass(BaseAuthProvider, 'magic-link')`
- **Public-route mount pattern** — public routers mount BEFORE `createUnifiedAuthMiddleware` (`packages/MJServer/src/index.ts`)
- **`Access Control Rules.GranteeType`** already includes a **`'Public'`** value (authenticated OR anonymous)

**Implication:** The widget's "anonymous guest" is a thin specialization of the existing `anonymous-embed` magic-link flow — a public mint endpoint that issues a short-lived RS256 session JWT scoped to a widget instance, validated by the same `AuthProviderFactory` path, synthesized into a constrained `UserInfo` by the same `buildMagicLinkSessionUser()`.

---

## 2. Target architecture

```
Third-party site
  └─ <script src="https://cdn.yourco/mj-widget.js"></script>
     <div id="mj-support" data-widget-key="pk_live_xxx"></div>
        │  (web component, shadow DOM — no CSS/JS bleed)
        ▼
  <mj-support-widget>  (new package: @memberjunction/web-widget)
     ├─ bootstraps ConversationsRuntime (guest adapters + CSS tokens)
     ├─ text:  AgentRunner.processMessage({ explicitAgentId: <pinned> })
     ├─ voice: BaseRealtimeClient (client-direct) via minted ephemeral config
     └─ talks to MJAPI GraphQL with the GUEST SESSION JWT
        │
        ▼
  MJAPI (Express + GraphQL)
     ├─ POST /widget/session   (PUBLIC, before auth mw)  → mints guest JWT
     │     reuses MagicLinkService anonymous-embed path
     ├─ unified auth middleware → AuthProviderFactory → guest UserInfo (constrained)
     └─ GraphQL resolvers (existing): conversation CRUD, RunAgent, realtime mint
        │
        ▼
  Unified agent pathway (UNCHANGED): processMessage / PrepareClientSession / broker
```

### Auth strategy model (D1 — pluggable)

Implement widget auth as a **strategy** resolved per widget-instance config, not a hardcoded path:

| Strategy | When | Mechanism |
|---|---|---|
| `anonymous` (default) | Public marketing/support pages | `POST /widget/session` mints an `anonymous-embed` guest JWT immediately on widget load; scoped to the widget's app+role; rate-limited per IP/origin |
| `magic-link-upgrade` | Visitor wants account-aware help | Capture email → existing `POST /magic-link/create` + redeem → upgraded JWT replaces guest JWT in the live session |
| `host-identity` | Embedded in an authenticated portal | Host site posts a **signed assertion** (its own key, registered as a `BaseAuthProvider`) → exchanged at `POST /widget/session` for an MJ guest JWT carrying the host-provided identity |

All three converge on the **same** `AuthProviderFactory` validation + `buildMagicLinkSessionUser()` synthesis. The widget bundle is auth-strategy-agnostic; it just holds whatever JWT it was given and refreshes before expiry.

---

## 3. Phased task breakdown

### Phase W0 — Spike & guardrails (0.5–1 day) ✅
- [x] Write a throwaway Node script that calls `ConversationsRuntime.Config(false, undefined, provider)` then `processMessage` with a pinned `explicitAgentId` under a **constrained** test principal. Confirm a guest can complete a text turn and that an *unpinned* call would expose other agents (proves D5 is necessary). Delete after. — _`spikes/W0-findings.md`: 17 unfiltered agents exposed to a guest on `MJ_Workbench`._
- [x] **Acceptance:** documented confirmation that pinning + constrained principal is required and works.

### Phase W1 — Guest-session backend (foundation)
Reuse magic-link `anonymous-embed`. **New files** under `packages/MJServer/src/widget/`: ✅ **all done**
- [x] `WidgetSessionConfig` type + config block in `mj.config.cjs` (`widget: { enabled, signingReuse: 'magic-link', defaultGuestRoleName, sessionTtlMinutes, rateLimit..., allowedOrigins... }`).
- [x] `WidgetSessionService.MintGuestSession(widgetKey, origin, audit)` — _`WidgetSessionService.ts`; validates key → resolves app/agent/role/origins, mints via the magic-link tail, returns token + conversation._
- [x] `WidgetRouter.ts` — `POST /widget/session` (public, mounted BEFORE `createUnifiedAuthMiddleware`), `POST /widget/session/refresh`. Mirror `MagicLinkRouter.ts` structure and rate-limiting. — _Plus `/widget/upgrade`._
- [x] Ensure the guest JWT carries a **widget claim** (`mj_widget_id`) and the pinned agent so the synthesized principal can be locked down. Extend `MagicLinkJWTClaims` minimally (additive only). — _`widgetCore.ts`._
- [x] **Tests:** unit tests for `WidgetSessionService` (valid key, bad key, disallowed origin, rate-limit trip, TTL). — _`__tests__/widget.test.ts`._
- [x] **Acceptance:** `curl POST /widget/session` with a seeded widget key returns a JWT that the existing auth middleware accepts and resolves to a constrained `UserInfo` with exactly the pinned agent reachable.

### Phase W2 — Widget-instance metadata ✅ (with documented debt)
- [x] New migration creating `MJ: Widget Instances`. Columns: `Name`, `PublicKey`, `ApplicationID`, `PinnedAgentID`, `GuestRoleID`, `AllowedOrigins`, `Modality`, `Status`, `RateLimitPerMinute`. — _`V202606270023__…Widget_Instances.sql`._
- [x] Run migration + CodeGen → strongly-typed entity (`MJWidgetInstanceEntity`); no `.Get()/.Set()`.
- [x] Seed one example instance via **mj-sync metadata** (`metadata/widget-instances/`), not SQL.
- [x] Define the **guest role** as a restricted role. — _`Widget Guest` role + entity permissions. ⚠️ **Debt:** Conversations/Details/Sessions/Channels/Agents are RLS-scoped, but `MJ: AI Agent Runs`/`Run Steps`/`AI Prompt Runs` are granted **unscoped** (the public-launch blocker — see Status banner)._
- [x] **Acceptance:** a widget key resolves through metadata to app+agent+role+origins; the guest role cannot read arbitrary entities (verify with a denied RunView). — _Conversation/session isolation verified via RLS (TESTING.md step 5); run-entity scoping is the open debt._

### Phase W3 — Embeddable bundle (text MVP)
New package `packages/Web/Widget/` → `@memberjunction/web-widget`: ✅ **all done**
- [x] Web component `<mj-support-widget>` rendered in **shadow DOM** (`attachShadow` + `all: initial` on `:host`); no Angular Explorer shell.
- [x] Loader script `mj-widget.js`: reads `data-widget-key` + `data-api-url`, calls `POST /widget/session`, mounts the component.
- [x] Bootstrap mirrors `conversations-runtime-bootstrap.service.ts`: adapters registered, `--mj-chat-*` tokens scoped to the shadow root.
- [x] Wire a GraphQL client with the guest JWT. — _Reuses `GraphQLDataProvider` via `RuntimeWidgetTransport` (no new client)._
- [x] Text chat UI: input + message list + streaming progress.
- [x] Pin the agent: every `processMessage` call passes `explicitAgentId` from the widget config.
- [x] **Tests:** component unit tests (vitest + happy-dom). — _43 tests._
- [x] **Acceptance:** `examples/blank-host.html` mints a guest session and completes a text turn with the pinned agent; zero CSS bleed.

### Phase W4 — Voice modality (client-direct) 🟡 works; cost-cap gap
- [x] Add a "talk" affordance. On activate: call the existing realtime mint with the guest token + pinned target agent; receive `ClientConfig`. — _`guest-voice-mint.ts` reuses `StartRealtimeClientSession`._
- [x] Resolve the client driver via `ClassFactory.CreateInstance(BaseRealtimeClient, ...)`; acquire mic; wire callbacks. Reuse `@memberjunction/ai-realtime-client` — no new driver.
- [x] Relay tool calls through the existing server broker path.
- [x] Register `ISessionsAdapter` so session lifecycle drives widget UI state.
- [ ] **Voice abuse controls (critical for public):** per-session max minutes, per-IP concurrent-session cap, model-cost ceiling, hard server-side session TTL via `SessionJanitor`. — 🟡 **Partial.** A mint-time `VoiceMaxSessionMinutes` ceiling bounds the ephemeral token, and a client-side `voice-abuse-guard.ts` exists, but there is **no mid-session server-authoritative hard cap** (needs `maxSessionSeconds` threaded through `PrepareClientSession` + the realtime drivers). Required before high-volume public voice.
- [x] **Tests:** mock `BaseRealtimeClient`; assert mint → connect → transcript → teardown.
- [x] **Acceptance:** a guest holds a voice conversation with the pinned agent end-to-end. — _Works (TESTING.md step 4); the hard cost-ceiling abort is the open item above._

### Phase W5 — Magic-link upgrade + host-passed identity (D1 completion) 🟡 works; host path deviates
- [x] **Upgrade:** email capture → `POST /magic-link/create` → on redeem, swap the guest JWT for the verified JWT in the live session, preserving `conversationId`. — _`RequestUpgrade` + `/widget/upgrade` + client `UpdateToken`._
- [x] **Host-passed:** host assertion exchanged at mint for an MJ guest JWT. — ⚠️ Built as **mint-time verification** (`host-identity.ts`), **not** a `HostIdentityAuthProvider extends BaseAuthProvider` as written; host public key lives in config (`hostPublicKeys`), interim — no `HostPublicKey` column yet.
- [x] **Tests:** upgrade preserves conversation; bad host signature rejected.
- [x] **Acceptance:** all three strategies work. — _Functional; host path diverges from the planned provider-subclass shape (noted above)._

### Phase W6 — Hardening & embed polish 🟡 partial
- [x] CORS allowlist enforced from widget-instance `AllowedOrigins`; reject mints from unlisted origins. — _Fail-closed at mint (`evaluateWidgetMint`); CORS middleware itself is still permissive `cors()` — tighten before public._
- [ ] Rate-limit + bot/abuse heuristics on `POST /widget/session`. — 🟡 Server-wide rate limit only; the stored per-instance `RateLimitPerMinute` isn't consulted by a dynamic limiter; no bot heuristics.
- [ ] Content Security Policy guidance for host sites; document the embed snippet. — _Embed snippet documented; **CSP recipe not in the README** yet._
- [x] Graceful degradation (API unreachable, token expired mid-conversation, voice unsupported → fall back to text).
- [x] Accessibility pass (keyboard, ARIA, focus trap within shadow root). — _Focus trap present; partial._
- [x] Package README + a hosted `examples/` page.

---

## 4. Security model (read before W1)

| Threat | Control |
|---|---|
| Public endpoint exposes all agents | **Pin `explicitAgentId`** + constrained guest role (D5). Never use the unfiltered fallback. |
| Token replay / theft | Short TTL (minutes, not hours) + refresh endpoint; bind token to `mj_widget_id` + origin. |
| Cost-bombing via voice | Per-session minute cap, per-IP concurrency cap, model-cost ceiling, janitor TTL (W4). |
| Cross-origin embedding abuse | `AllowedOrigins` allowlist enforced at mint + CORS. |
| Scope accretion across guests | Reuse the shared Anonymous principal pattern — roles ride per-session claims, never DB rows (already how magic-link anon works). |
| Data exfiltration via agent tools | Guest role's entity permissions are the backstop; the pinned agent's tool set should be support-scoped. |
| Prompt-injection from visitor | Standard agent guardrails apply; nothing widget-specific, but document that the support agent runs with least privilege. |

---

## 5. What NOT to build (anti-drift checklist)

- ❌ A new chat engine — use `ConversationsRuntime`.
- ❌ A new realtime/voice driver — use `@memberjunction/ai-realtime-client`.
- ❌ A new auth subsystem — extend magic-link `anonymous-embed` + `AuthProviderFactory`.
- ❌ A second agent-dispatch path — call `AgentRunner.processMessage` / `PrepareClientSession`.
- ❌ A new GraphQL client with inline `gql` if `@memberjunction/graphql-dataprovider` can be reused outside Angular (verify first).
- ❌ `localStorage` for any user preference (CLAUDE rule 9) — though an *ephemeral guest token* in memory/sessionStorage is acceptable (it's auth state, not a preference).

---

## 6. Open questions for the tech fellow (resolve during W1/W2)

1. **Ephemeral vs. persisted guest invites:** Does each guest session create a `MagicLinkInvite` row (audit-rich, more writes) or use a direct-mint helper that skips the row (lighter, less forensics)? Recommend: direct-mint for anonymous, with a `MagicLinkRedemption`-style audit row for forensics.
2. **Provider reuse outside Angular:** Can `GraphQLDataProvider` run in a plain web component, or do we need a slimmer provider implementing just the runtime's required `IMetadataProvider` surface? Spike in W3.
3. **Widget metadata: new entity vs. magic-link config reuse:** Confirm in W2 whether `MJ: Widget Instances` is warranted or whether magic-link's existing config + a `Kind='anonymous-embed'` template row suffices.
4. **Bundle framework:** Lit vs. vanilla custom element. Optimize for small gzipped size and zero global leakage.

---

## 7. Definition of done

- [x] `examples/blank-host.html` loads the widget via one `<script>` + one mount div; works with no MJ login.
- [x] Guest text **and** voice conversations complete with the pinned agent under a constrained principal.
- [x] Magic-link upgrade and host-passed identity both work and preserve the live conversation. — _Host path is mint-time, not the planned provider subclass._
- [ ] Origin allowlist, rate-limits, and voice cost/time ceilings enforced and tested. — _Origin allowlist ✅; per-instance rate-limit and mid-session voice cost/time hard-cap are partial (see W4/W6)._
- [x] Shadow-DOM isolation verified (no CSS bleed either direction).
- [x] New packages build; unit tests pass; package READMEs written.
- [ ] No secrets in code; guest tokens short-lived; no reliance on the unfiltered-agent fallback. — _Secrets ✅, short-lived tokens ✅, agent pinned ✅. **But the unscoped guest run-entity grants make this demo-grade, not public-safe** (Status banner)._
