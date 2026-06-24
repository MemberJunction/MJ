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
| CSP guidance for host sites + embed snippet docs | ✅ | `packages/Web/Widget/README.md` + `examples/blank-host.html` (the snippet). **Remaining:** an explicit CSP recipe (the widget needs `connect-src <MJAPI>`, `script-src` for the bundle, mic `getUserMedia` needs a secure context). Add to README. |
| Graceful degradation (API down, token expired mid-convo, voice unsupported → text) | ◐ partial | Token refresh before expiry (W3) + a failed refresh surfaces an auth error on next send; voice errors fall back with a system message (W4). **Remaining:** explicit "voice unsupported in this browser → hide mic / fall back to text" capability check, and an offline/API-unreachable banner. |
| Accessibility (keyboard, ARIA, focus trap in shadow root) | ◐ partial | ARIA roles (`dialog`/`log`/`aria-live`), labelled controls, Enter-to-send / Esc-to-close, `aria-pressed` on the mic toggle (W3/W4). **Remaining:** a real focus trap within the open panel and focus return to the launcher on close. |
| Package README + hosted examples | ✅ | README + `blank-host.html` + `offline-demo.html` (W3). |

## Cross-cutting hardening surfaced during W1–W5 (for the human)

1. **🔴 Cross-guest conversation isolation (most important).** All anonymous guests share the seeded
   Anonymous principal (same `UserID`), so a per-`UserID` RLS filter does NOT isolate one guest's
   Conversation/Conversation Details from another's. The Widget Guest role satisfies "can't read
   arbitrary entities," but NOT "can't read another guest's conversation." **Fix:** an RLS filter on
   Conversations/Conversation Details keyed on the per-session id (`mj_sid`) or on conversation
   ownership established at create-time — needs design + a metadata RLS filter + likely a
   `SessionID`/owner column the guest can't forge. Track as a hard requirement before any real
   public deployment.
2. **Host public key per instance.** W5 reads host keys from `widget.hostPublicKeys` config (interim).
   Production wants a `HostPublicKey` column on `WidgetInstance` (a migration — deferred, DB was down)
   + key rotation support.
3. **Bundle size.** The esbuild bundle is self-contained but ~2.9 MB minified (full runtime + GraphQL
   provider). Reduce via tree-shaking, code-splitting the voice path (only loaded when the user starts
   voice), and externalizing/CDN-ing shared deps. Pure packaging; no behavior change.
4. **Audit entity.** Widget mints currently emit a structured **log line** (W1). A dedicated
   `MJ: Widget Session` audit entity (mirroring `MJ: Magic Link Redemptions`) would give queryable
   forensics — a migration + a thin write in `WidgetSessionService.audited`.
5. **Voice cost ceiling server-side.** The client `VoiceAbuseGuard` is defense-in-depth; the
   authoritative ceilings (max minutes, model cost) must also be enforced by the `SessionJanitor` +
   the realtime mint using the instance's `VoiceMaxSessionMinutes` (which the mint result does not yet
   surface to the client). Wire `VoiceMaxSessionMinutes` through `StartRealtimeClientSession`.
