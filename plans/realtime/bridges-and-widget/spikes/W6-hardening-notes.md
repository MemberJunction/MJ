# W6 — Hardening & embed polish: tracked items

**Status:** PARTIAL. Several W6 controls were built into W1–W5 already (origin allowlist, rate
limiting, enumeration-resistant status codes, short-TTL tokens + refresh, voice abuse ceilings,
fail-closed host-identity). This note records what each W6 checklist item's state is and the
remaining work, so the reviewer can see the security posture in one place.

## W6 checklist status

| Item | State | Where / what remains |
|---|---|---|
| CORS allowlist enforced from `AllowedOrigins` | ✅ at mint | `evaluateWidgetMint` fail-closes on a non-listed/missing Origin (W1, unit-tested). The router mounts `cors()`; **remaining:** drive the Express `cors()` `origin` callback from the per-widget allowlist too (currently mint-time enforced; the CORS preflight is permissive and the mint is the gate). |
| Rate-limit + bot/abuse heuristics on `POST /widget/session` | ◐ partial | IP rate-limiter on the router at the **server-wide** `widget.defaultRateLimitPerMinute` (W1). **Remaining:** per-instance `RateLimitPerMinute` (stored on `WidgetInstance`) needs a dynamic limiter keyed by resolved widget — express-rate-limit `keyGenerator`/`max` fn after a cheap key→limit lookup. Bot heuristics (e.g. proof-of-work, hCaptcha hook) are not built. |
| CSP guidance for host sites + embed snippet docs | ✅ | `packages/Web/RealtimeWidget/README.md` + `examples/blank-host.html` (the snippet). **Remaining:** an explicit CSP recipe (the widget needs `connect-src <MJAPI>`, `script-src` for the bundle, mic `getUserMedia` needs a secure context). Add to README. |
| Graceful degradation (API down, token expired mid-convo, voice unsupported → text) | ◐ partial | Token refresh before expiry (W3) + a failed refresh surfaces an auth error on next send; voice errors fall back with a system message (W4). **Remaining:** explicit "voice unsupported in this browser → hide mic / fall back to text" capability check, and an offline/API-unreachable banner. |
| Accessibility (keyboard, ARIA, focus trap in shadow root) | ◐ partial | ARIA roles (`dialog`/`log`/`aria-live`), labelled controls, Enter-to-send / Esc-to-close, `aria-pressed` on the mic toggle (W3/W4). **Remaining:** a real focus trap within the open panel and focus return to the launcher on close. |
| Package README + hosted examples | ✅ | README + `blank-host.html` + `offline-demo.html` (W3). |

## W5 magic-link upgrade — IMPLEMENTED (initiation + token swap)

The "Verify it's you" upgrade path is now wired end-to-end except the host-page cross-tab handoff:
- **Server:** `POST /widget/upgrade` (public, rate-limited, on the widget router) → `WidgetSessionService.RequestUpgrade`. For a widget whose `AuthStrategy='MagicLinkUpgrade'`, it issues a single-use **email-mode** magic-link invite scoped to the widget's Application via `MagicLinkService.CreateInvite` under the server (Owner) principal. The raw token / redemption URL is **never** echoed to the public caller — it is delivered out-of-band by email, so a widget-key holder cannot mint verified sessions at will.
- **Redeem:** the visitor clicks the emailed link → the existing public `POST /magic-link/redeem` mints a VERIFIED session JWT (the same `AuthProviderFactory` + `buildMagicLinkSessionUser` path — D1 convergence).
- **Token swap:** the widget calls `transport.UpdateToken(verifiedToken)`, which preserves the live `conversationId` (held on the transport), so the conversation continues uninterrupted with elevated permissions.
- **Client:** `WidgetSessionClient.RequestUpgrade(email)` initiates it; unit-tested with a mock fetch.
- **Remaining (host integration, not security-critical):** the verified JWT is redeemed in a NEW browser context (the email link), so the host page must hand that token back to the live widget — e.g. the redeem landing `postMessage`s it to the opener, or the host polls a status endpoint. This is browser plumbing per host; documented for integrators rather than baked into the bundle.

## Cross-cutting hardening surfaced during W1–W5 (for the human)

1. **✅ Cross-guest conversation isolation (most important) — IMPLEMENTED.** All anonymous guests share
   the seeded Anonymous principal (same `UserID`), so a per-`UserID` RLS filter does NOT isolate one
   guest's Conversation/Conversation Details from another's. **Fix shipped:** the guest mint now carries
   a per-session **resource scope** (`resourceType='Widget Session'`, `resourceId`=the opaque session
   id) which `buildMagicLinkSessionUser` lifts into `MagicLinkScope.ResourceID`. Two RLS filters
   (seeded by migration `V202606271200__v5.44.x__Widget_Guest_RLS.sql`, linked to the Widget Guest
   role's read+update permissions via the entity-permissions metadata) key on the `{{ScopeResourceID}}`
   token:
   - **Conversations** → `ExternalID = '{{ScopeResourceID}}'`. The widget stamps `Conversation.ExternalID`
     with the session id at create time.
   - **Conversation Details** → scoped by the PARENT conversation's `ExternalID`
     (`ConversationID IN (SELECT ID FROM vwConversations WHERE ExternalID = '{{ScopeResourceID}}')`), so
     the agent's own AI-reply details (which carry no `ExternalID`) stay visible to the owning session
     while remaining hidden from other guests.

   The discriminator rides the **signed** token, so a guest cannot forge another session's scope to read
   its rows. The session id is base64url (`[A-Za-z0-9_-]`), so its substitution into the filter literal
   is injection-safe; an absent scope resolves to `''` (fail-closed). **Residual (low severity):** a
   tampered client could stamp a *different* `ExternalID` at create, which only hides its own rows from
   itself (self-DoS) or donates a conversation into another session's view — neither exfiltrates data.
   Server-side stamping of `ExternalID` would close even that; tracked as a minor follow-on.
2. **Host public key per instance.** W5 reads host keys from `widget.hostPublicKeys` config (interim).
   Production wants a `HostPublicKey` column on `WidgetInstance` (a migration — deferred, DB was down)
   + key rotation support.
3. **Bundle size.** The esbuild bundle is self-contained but ~2.9 MB minified (full runtime + GraphQL
   provider). Reduce via tree-shaking, code-splitting the voice path (only loaded when the user starts
   voice), and externalizing/CDN-ing shared deps. Pure packaging; no behavior change.
4. **Audit entity.** Widget mints currently emit a structured **log line** (W1). A dedicated
   `MJ: Widget Session` audit entity (mirroring `MJ: Magic Link Redemptions`) would give queryable
   forensics — a migration + a thin write in `WidgetSessionService.audited`.
5. **Voice cost ceiling — per-widget limit now applied client-side; authoritative server cap remains.**
   `VoiceMaxSessionMinutes` is now surfaced on the mint result + the `WidgetSession`, and the default
   voice controller derives the `VoiceAbuseGuard` ceiling from it (per-widget, not a hardcoded 10-min
   default). **Remaining (authoritative):** for the **client-direct** voice topology the browser holds
   the provider socket directly, so the only server-authoritative control is the **ephemeral token's
   TTL** minted inside `RealtimeClientSessionService.PrepareClientSession` (reaping the server-side
   `AIAgentSession` row does NOT tear down the browser↔provider socket). Enforcing a hard cap therefore
   requires threading a `maxSessionSeconds` (= `min(default, VoiceMaxSessionMinutes·60)` for widget
   guests, resolved from the `mj_widget_id` claim) through `PrepareClientSession` **and each realtime
   provider driver's ephemeral-mint** so the provider closes the session at expiry. That touches the
   shared realtime path for ALL callers (not just widgets) and warrants its own review — tracked as the
   remaining hard requirement before a high-volume public voice deployment. The client ceiling is
   defense-in-depth until then.
