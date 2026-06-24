# Public Web Widget — Droppable Customer-Support Surface (Text + Voice)

**Part of:** [Agent Bridges & Public Widget program](./README.md)
**Decisions in force:** D1 (pluggable auth, guest-first), D2 (text+voice), D5 (constrained guest principal + pinned agent)
**Goal:** A single `<script>` tag any customer drops on any website that opens a support conversation — text and voice — with an MJ agent, with **no MJ login**, optionally upgradeable to a verified identity.

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

### Phase W0 — Spike & guardrails (0.5–1 day)
- [ ] Write a throwaway Node script that calls `ConversationsRuntime.Config(false, undefined, provider)` then `processMessage` with a pinned `explicitAgentId` under a **constrained** test principal. Confirm a guest can complete a text turn and that an *unpinned* call would expose other agents (proves D5 is necessary). Delete after.
- [ ] **Acceptance:** documented confirmation that pinning + constrained principal is required and works.

### Phase W1 — Guest-session backend (foundation)
Reuse magic-link `anonymous-embed`. **New files** under `packages/MJServer/src/widget/`:
- [ ] `WidgetSessionConfig` type + config block in `mj.config.cjs` (`widget: { enabled, signingReuse: 'magic-link', defaultGuestRoleName, sessionTtlMinutes, rateLimit..., allowedOrigins... }`).
- [ ] `WidgetSessionService.MintGuestSession(widgetKey, origin, audit)` — thin wrapper that:
  - validates the **widget key** (a new lightweight metadata entity, see W2) → resolves `ApplicationID`, pinned `AgentID`, guest `RoleID`, allowed origins
  - calls into `MagicLinkService` to create+immediately-redeem an `anonymous-embed` invite (or a new direct-mint helper that skips the invite row for ephemeral guests — prefer reusing `RedeemInvite`'s minting tail)
  - returns `{ token, expiresAt, conversationId }`
- [ ] `WidgetRouter.ts` — `POST /widget/session` (public, mounted BEFORE `createUnifiedAuthMiddleware`), `POST /widget/session/refresh`. Mirror `MagicLinkRouter.ts` structure and rate-limiting.
- [ ] Ensure the guest JWT carries a **widget claim** (`mj_widget_id`) and the pinned agent so the synthesized principal can be locked down. Extend `MagicLinkJWTClaims` minimally (additive only).
- [ ] **Tests:** unit tests for `WidgetSessionService` (valid key, bad key, disallowed origin, rate-limit trip, TTL). Reuse the magic-link test harness style.
- [ ] **Acceptance:** `curl POST /widget/session` with a seeded widget key returns a JWT that the existing auth middleware accepts and resolves to a constrained `UserInfo` with exactly the pinned agent reachable.

### Phase W2 — Widget-instance metadata
- [ ] New migration (`migrations/v5/`, highest folder) creating `MJ: Widget Instances` (or reuse magic-link config if a 1:1 fit — evaluate first). Columns: `Name`, `PublicKey` (the `pk_live_…`), `ApplicationID` (FK), `PinnedAgentID` (FK → AI Agents), `GuestRoleID` (FK → Roles), `AllowedOrigins` (nvarchar, CSV/JSON), `Modality` (`Text`|`Voice`|`Both`), `Status`, `RateLimitPerMinute`. Follow `migrations/CLAUDE.md` (hardcoded UUIDs, `sp_addextendedproperty`, no `__mj_` columns, no FK indexes).
- [ ] Run migration + CodeGen → strongly-typed entity. **Do not** use `.Get()/.Set()`; wait for generated types (CLAUDE rule 2b).
- [ ] Seed one example instance via **mj-sync metadata** (`metadata/widget-instances/`), not SQL.
- [ ] Define the **guest role** as a restricted role (entity permissions: read/write only Conversations + Conversation Details for own session; nothing else). Reuse the magic-link restricted-role recipe from `guides/MAGIC_LINK_GUIDE.md`.
- [ ] **Acceptance:** a widget key resolves through metadata to app+agent+role+origins; the guest role cannot read arbitrary entities (verify with a denied RunView).

### Phase W3 — Embeddable bundle (text MVP)
New package `packages/Web/Widget/` → `@memberjunction/web-widget`:
- [ ] Web component `<mj-support-widget>` (framework choice: a lightweight standalone — Lit or a hand-rolled custom element; **must** render in **shadow DOM** so host CSS can't bleed in/out). Do **not** pull in the Angular Explorer shell.
- [ ] Loader script `mj-widget.js`: reads `data-widget-key` + `data-api-url`, calls `POST /widget/session`, mounts the component.
- [ ] Bootstrap mirrors `conversations-runtime-bootstrap.service.ts`: register `INotificationAdapter` (toast inside shadow DOM), `IActiveTaskTracker` (no-op), inject `--mj-chat-*` tokens **scoped to the shadow root** (not `<head>`).
- [ ] Wire a GraphQL client pointed at MJAPI with the guest JWT in the `Authorization` header. Reuse `@memberjunction/graphql-dataprovider` if it can run outside Angular; otherwise a thin fetch client implementing the minimal `IMetadataProvider` surface the runtime needs. **Evaluate provider reuse before writing a new client** (Transport-Layer guide).
- [ ] Text chat UI: input + message list + streaming progress (subscribe to the runtime's streaming pubsub). Keep it minimal and token-styled.
- [ ] Pin the agent: every `processMessage` call passes `explicitAgentId` from the widget config.
- [ ] **Tests:** component unit tests (vitest + happy-dom) for mount, session mint, send/receive, token refresh. Mock the GraphQL layer.
- [ ] **Acceptance:** load `examples/blank-host.html` (a bare third-party page) → widget mints a guest session and completes a text support turn with the pinned agent; zero CSS bleed in either direction.

### Phase W4 — Voice modality (client-direct)
- [ ] Add a "talk" affordance. On activate: call the existing realtime mint (GraphQL mutation backing `PrepareClientSession`) with the guest token + pinned target agent; receive `ClientConfig`.
- [ ] Resolve the client driver via `ClassFactory.CreateInstance(BaseRealtimeClient, ClientConfig.Provider)`; acquire mic; wire `OnTranscript/OnToolCall/OnUsage`. Reuse `@memberjunction/ai-realtime-client` verbatim — **no new driver**.
- [ ] Relay tool calls through the existing server broker path (same as Explorer voice).
- [ ] Register `ISessionsAdapter` so session lifecycle drives widget UI state.
- [ ] **Voice abuse controls (critical for public):** per-session max minutes, per-IP concurrent-session cap, model-cost ceiling, hard server-side session TTL via `SessionJanitor`. Voice is the biggest cost/abuse surface — gate it harder than text.
- [ ] **Tests:** mock `BaseRealtimeClient` (the package ships fakes/seams); assert mint → connect → transcript → teardown; assert abuse ceilings abort the session.
- [ ] **Acceptance:** a guest holds a voice conversation with the pinned agent end-to-end; exceeding the minute/cost ceiling cleanly terminates with a user-facing message.

### Phase W5 — Magic-link upgrade + host-passed identity (D1 completion)
- [ ] **Upgrade:** "Verify it's you" → email capture → existing `POST /magic-link/create` (email mode) → on redeem, swap the guest JWT for the verified JWT in the live widget session; carry the `conversationId` across so context is preserved.
- [ ] **Host-passed:** define `HostIdentityAuthProvider extends BaseAuthProvider` (`@RegisterClass(BaseAuthProvider, 'host-identity')`); host site registers a public key; `POST /widget/session` accepts a host assertion and exchanges it. Per-widget config selects the strategy.
- [ ] **Tests:** upgrade preserves conversation + elevates permissions exactly to the linked account's scope; host assertion with a bad signature is rejected.
- [ ] **Acceptance:** all three strategies (D1) work and converge on the same `AuthProviderFactory` + `buildMagicLinkSessionUser` path.

### Phase W6 — Hardening & embed polish
- [ ] CORS allowlist enforced from widget-instance `AllowedOrigins`; reject mints from unlisted origins.
- [ ] Rate-limit + bot/abuse heuristics on `POST /widget/session` (reuse magic-link rate-limit config).
- [ ] Content Security Policy guidance for host sites; document the embed snippet.
- [ ] Graceful degradation (API unreachable, token expired mid-conversation, voice unsupported in browser → fall back to text).
- [ ] Accessibility pass (keyboard, ARIA, focus trap within shadow root).
- [ ] Package README + a hosted `examples/` page.

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

- [ ] `examples/blank-host.html` loads the widget via one `<script>` + one mount div; works with no MJ login.
- [ ] Guest text **and** voice conversations complete with the pinned agent under a constrained principal.
- [ ] Magic-link upgrade and host-passed identity both work and preserve the live conversation.
- [ ] Origin allowlist, rate-limits, and voice cost/time ceilings enforced and tested.
- [ ] Shadow-DOM isolation verified (no CSS bleed either direction).
- [ ] New packages build; unit tests pass; package READMEs written.
- [ ] No secrets in code; guest tokens short-lived; no reliance on the unfiltered-agent fallback.
