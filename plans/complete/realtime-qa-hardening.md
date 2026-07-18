# Realtime Driver Family + Co-Agent Architecture — QA Hardening Plan

**Branch**: `fix/realtime-qa-hardening` · **Source**: adversarial QA audit of PR #3177 (merged 2026-07-18) + the broader realtime co-agent architecture. Three independent adversarial reviews (server diff, client diff, architecture) consolidated; every finding code-verified with file:line evidence at audit time.

**Rules for this work**: every fix ships with extensive unit tests (regression test for the exact failure scenario + related edge cases); PascalCase for public methods/exported functions; no `any`; package README / guide updates where behavior changes; full-repo build + unit tests green before completion; plan moves to `/plans/complete/` when done.

Severity legend: 🔴 fix-critical · 🟠 medium · 🟡 low · ⚪ info/hygiene

---

## A. NEW regressions introduced by PR #3177 (driver layer)

- [x] **A1 🔴 HF: payload-less provider `error` frame misclassified FATAL**
  `RawRealtimeWebSocketConnection.handleMessage` sets `error.error = undefined` for a bare `{type:'error'}`/`{type:'error', message}` frame → base `handleConnectionError` sees no payload → `Fatal: true` + rejects the readiness gate. Old HF treated ALL provider error frames as recoverable.
  **Fix**: the adapter synthesizes a minimal provider payload for ANY inbound `error` frame (message from `error.message ?? message ?? default`), so downstream always classifies provider frames recoverable; transport failures remain payload-less/fatal.
  **Tests**: bodyless frame → recoverable downstream (drive through a real `OpenAIRealtimeSession`, assert `Fatal:false` AND config-wait not rejected); `{type:'error', message}` variant; transport error still fatal.

- [x] **A2 🔴 HF falsely advertises `CanReconfigureTurnMode` + contradictory inherited `Reconfigure`**
  HF inherits base `Capabilities` (`CanReconfigureTurnMode: true`) and a `Reconfigure` that sends `transcription:{model:undefined}` + `server_vad`/`create_response` — both unsupported per its own profile.
  **Fix**: base `Reconfigure` becomes profile-aware (skip transcription block when profile model undefined; consult `buildTurnDetection`); add `supportsLiveReconfigure` to the profile; base `Capabilities` reads it; HF profile sets false (Capabilities false + Reconfigure no-ops with diag).
  **Tests**: HF `Capabilities` false + `Reconfigure` sends nothing; OpenAI/xAI unchanged (still true, correct payloads incl. per-profile transcription model).

- [x] **A3 🔴 Config-bag rest-spread can override `type`/`instructions` (tools already protected)**
  `sendSessionUpdate` builds `{type, instructions, audio?, ...rest}` — a bag with `type` or `instructions` keys overrides the GA discriminator / system prompt. On HF's strict endpoint a clobbered `type` kills the whole `session.update` (prompt AND tools silently dropped). New exposure for HF; pre-existing for xAI/OpenAI.
  **Fix**: scrub `type`, `instructions`, `tools` from `rest` in `ExtractRealtimeFeatures` (protected wire fields — never overridable via the open bag); keep documented `audio` override.
  **Tests**: bag with `type`/`instructions`/`tools` keys → protected values win, keys not present raw; `audio` override still works; `tool_choice`/`output_modalities` passthrough unaffected.

- [x] **A4 🟡 Deferred-config listener leak when session closes before `session.created`**
  `applyWhenReady` self-removes only when it fires; `Close()`/fatal paths never remove it.
  **Fix**: track the pending deferred listener on the session; remove it in `Close()` and on config-wait failure.
  **Tests**: listener count on the fake connection drops to 0 after `Close()` pre-`session.created`; also after fatal error pre-created.

- [x] **A5 🟡 Empty-transcript emissions (HF regression; noise family-wide)**
  Base `emitTranscript` forwards empty/whitespace text the old HF driver suppressed.
  **Fix**: base skips empty/whitespace-only transcript text (deltas AND finals) — deliberate family-wide cleanup (empty captions are pure noise on every provider).
  **Tests**: empty + whitespace delta/final/user-completed emit nothing on OpenAI, xAI, HF; non-empty unaffected.

- [x] **A6 🟠 Client-direct vs server-bridged divergence: `features.rest` not applied to the minted SessionConfig**
  Docstrings claim the topologies are behaviorally identical; residual native keys (`tool_choice`, …) apply server-bridged only.
  **Fix**: `CreateClientSession` applies the (now-hardened per A3) `features.rest` spread to the minted session too — making the invariant TRUE; correct docstrings.
  **Tests**: `tool_choice` in Config appears in the minted SessionConfig; protected keys cannot be injected client-direct either.

- [x] **A7 ⚪ Hygiene: settle-handle + adapter edge cleanup**
  `rejectConfigApplied` not nulled after resolve (harmless double-settle); adapter leaves `pendingSends` unflushed on error-before-open and `opened` never resets on close.
  **Fix**: null both handles on any settle; adapter clears `pendingSends` and guards `send()` after close.
  **Tests**: double-settle path (resolve then fatal) has no rejection leak; error-before-open clears the buffer; send-after-close is a safe no-op.

## B. PRE-EXISTING defects carried forward (client + server robustness)

- [x] **B1 🔴 No connect/readiness timeout + orphaned `Connect` promise (client WS layer + server base)**
  Client: HF `Connect` awaits `session.created` forever if the endpoint opens but stays silent; socket death DURING the created-wait sets error state but never releases the awaited promise; `Disconnect()` doesn't release it either. Server: `WaitForConfigApplied` (awaited by HF `StartSession`) has the same no-timeout gap.
  **Fix**: (client WS layer) a connect-phase deadline (protected `connectTimeoutMs`, default 15s) covering open+created; socket error/close and `Disconnect` during the created-wait reject/release it; `Connect` rejects with a clear fatal error. (server) readiness timeout in the deferred-config path → fails the config wait (drivers that await it get a rejection; OpenAI's non-awaited path is unaffected).
  **Tests** (fake timers): silent-endpoint timeout rejects Connect + emits fatal; error-during-created-wait rejects; close-during-wait rejects; Disconnect-during-wait releases; success path unaffected; server: created-never-arrives rejects `WaitForConfigApplied` after deadline, created-in-time resolves and cancels the timer.

- [x] **B2 🟠 Stale `response.done` (of a cancelled turn) clears `responseActive` for the NEW in-flight response**
  After `SendText` barge-in (cancel → inject → `response.create`), the cancelled turn's trailing `done` clears the busy flag before the new `response.created` arrives → `IsBusy` reads false; narration can collide; queued results can double-fire.
  **Fix**: track locally-initiated in-flight `response.create`s (counter incremented on send, consumed by `response.created`); `response.done` skips the clear+flush when a local create is in flight (usage still emitted).
  **Tests**: SendText-barge-in → stale done → `IsBusy` stays true, narration skipped in the window, queued trigger fires exactly once on the REAL done; normal turns unaffected; counter never goes negative on VAD-initiated responses.

- [x] **B3 🟠 Barge-in floor steal: queued tool-result trigger fires on the cancelled turn's `done`, speaking over the user**
  **Fix (product-decision codified)**: on TRUE user barge-in, clear the queued auto-trigger — the `function_call_output` item is already in the conversation, so the user's next turn (server-VAD response) voices the result contextually instead of stomping the user. Document the invariant change in the brain's docstrings.
  **Tests**: narration + queued result + barge-in → NO response.create on the cancelled done; result item remains delivered; without barge-in the queue still flushes (tool-result-delivery invariant intact).

- [x] **B4 🟡 `remoteStreamHandlers` never cleared on `Disconnect` (OpenAI WebRTC client)**
  **Fix**: clear on Disconnect.
  **Tests**: handler registered in session 1 does not fire for session 2's track on a reused instance.

- [x] **B5 🟡 WS client `canSendEvents()` doesn't check socket-open**
  Pre-open `send()` on a raw CONNECTING WebSocket throws `InvalidStateError`.
  **Fix**: `socketOpen` flag on the WS layer (set when opened resolves, cleared on error/close/Disconnect); `canSendEvents` requires it.
  **Tests**: action invoked between socket-assign and open → clean no-op (no throw, no state pollution); post-open works; post-close no-op.

## C. Architecture gaps (realtime co-agent stack)

- [x] **C1 🔴 New driver features are DARK — no agent-layer producer for `effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`**
  Only `voice` + `disableAutoResponse` reach the Config bag today; `RealtimeCoAgentConfig` has no fields for the new knobs; vendor-row `SupportsEffortLevel` never influences realtime.
  **Fix**: extend `RealtimeCoAgentConfig` (typed optional fields: `EffortLevel`, `ParallelToolCalls`, `McpTools`, `InputTranscriptionModel`); fold into `buildSessionConfigBag` AND the server-bridged mirror exactly where `voice`/`disableAutoResponse` flow, preserving the same override cascade.
  **Tests**: Agents-package effective-config tests — each knob flows config→bag on both topologies; absent knobs add no keys; cascade precedence honored.

- [x] **C2 🔴 Per-modality realtime usage discarded → multi-channel cost attribution wrong**
  Driver reads only total `input_tokens`/`output_tokens`; `input_token_details`/`output_token_details` (audio vs text vs cached) dropped at the edge; runner accumulates two scalars.
  **Fix**: widen `RealtimeUsage` with optional typed `InputTokenDetails`/`OutputTokenDetails` (audio/text/cached counts); OpenAI driver populates from `response.done`; xAI/HF pass through when present; runner accumulates per-modality and persists the detail alongside the totals (existing usage-JSON persistence point). Cost *application* per modality is enabled by the persisted detail; document the calculation path.
  **Tests**: driver surfaces details verbatim; missing-details frames degrade to totals-only; runner accumulation sums per-modality across turns; persistence includes the detail blob.

- [x] **C3 🟠 HF realtime proxy hardening**
  No `Origin` validation; ticket's stored `UserID` never checked at consume; unbounded pre-open frame buffer; no upstream-connect timeout; in-memory registry breaks under multi-instance LB (documented, not silently).
  **Fix**: optional Origin allowlist (env `MJ_REALTIME_PROXY_ALLOWED_ORIGINS`, default off = current behavior); tunnel upstream-open deadline (close + 502 semantics) and bounded pending buffer (cap + drop-oldest with warn); README documents the sticky-routing requirement for HA + the UserID-binding limitation (upgrade requests carry no principal).
  **Tests**: origin allowlist accept/reject; buffer cap enforced; upstream-open timeout closes tunnel; existing single-use/TTL behavior unchanged.

- [x] **C4 🟠 Runner ignores `cancellationToken`; no session wall-clock enforcement**
  The 2h agent timeout is a no-op for realtime sessions; only backstop is the 15-min janitor.
  **Fix**: `RealtimeSessionRunner` observes an abort signal (constructor-injected) → `Stop()` on abort; `StartSession` call wrapped with a connect-phase timeout at the runner too (belt over B1's braces).
  **Tests**: abort mid-session stops + finalizes usage; abort pre-connect rejects cleanly; no-signal behavior unchanged.

- [x] **C5 🟠 MCP approval request = dead air**
  Model blocks awaiting `mcp_approval_response`; driver only logs a recoverable error.
  **Fix**: defensive auto-DENY — driver responds with a `mcp_approval_response` item (`approve:false`) so the model continues and voices the denial, plus the existing recoverable error for observability. Documented as the interim behavior until approval UX exists.
  **Tests**: approval-request frame → deny item sent with correct correlation id + recoverable error emitted; `require_approval:'never'` flows send no denial.

- [x] **C6 🟠 Config bag unvalidated across providers (Gemini blind-spreads foreign keys)**
  **Fix**: Gemini driver warns (diag) on foreign/unconsumed keys before its spread and scrubs the OpenAI-family feature keys (`effortLevel`/`reasoningEffort`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel` + transport keys) so cross-provider co-agent configs are safe; shared scrub-key list exported from Core so producers/drivers agree.
  **Tests**: Gemini session with OpenAI-family keys → keys not in the SDK connect config + diag warned; legit Gemini keys unaffected.

- [x] **C7 🟠 No reconnect/resume on fatal transport drop (server-bridged)**
  **Fix**: bounded reconnect in the session runner — on a Fatal transport error, up to N (default 1) re-`StartSession` attempts with the same params + a context note (\"reconnected after a transport drop\"), preserving accumulated usage; only then finalize. Gated by a runner option so hosts can disable.
  **Tests**: fatal error → one reconnect attempt → success path resumes (tools re-registered, note sent); second consecutive failure finalizes; usage accumulation spans the reconnect; disabled option preserves old behavior.

- [x] **C8 🟡 Transcript gaps: `ReplacesPrevious` missing on the server-bridged contract**
  **Fix**: add optional `ReplacesPrevious` to Core `RealtimeTranscript`; providers that stream growing finals can set it; runner forwards it on the transcript event so persistence can collapse in place. (Full transcript→run linkage remains a tracked follow-up — schema change out of scope for this branch; documented.)
  **Tests**: contract field flows driver→session handler; absent by default.

## Completion checklist

- [x] All A/B/C items checked off with tests
- [x] Package READMEs updated: ai-openai, ai-xai, ai-huggingface (incl. proxy env), ai-realtime-client, Agents (realtime)
- [x] `guides/REALTIME_CO_AGENTS_GUIDE.md` updated (new config knobs, usage detail, reconnect, MCP deny, timeouts, proxy hardening)
- [x] Changesets for all touched packages (`.changeset/realtime-qa-hardening.md`)
- [x] Full repo build green (299/299); full repo unit tests green (594/594)
- [x] Plan moved to `/plans/complete/realtime-qa-hardening.md`

**Completed 2026-07-18** on `fix/realtime-qa-hardening`. Suite totals: ai-openai 147 · ai-realtime-client 391 · ai-agents 1653 · ai-gemini 87 · ai-xai 50 · ai-huggingface 34 · MJServer proxy 8.

---

## Second-pass adversarial re-audit — findings fixed (2026-07-18)

A three-reviewer re-audit of the hardening work itself found holes in several of the fixes (mostly untested edges the fixes introduced). All fixed with regression tests:

- [x] **C1-DARK 🔴 CRIT** — `normalizeConfig` never propagated the new `realtime.session` field, so `GetSessionTuningSettings` always returned null in production → all tuning knobs were inert (C1 still dark). Added `normalizeSession` (typed validation) wired into the effective-config resolver; end-to-end propagation + service-fold + driver-shape tests.
- [x] **S1 🔴 HIGH** — B2 counter (`pendingLocalResponseCreates`) wedged the client forever when a `response.create` was rejected (error frame, no `response.created`) — reachable via the ordinary SendText barge-in. Fix: decrement (floor 0) on an error frame (self-heals to pre-counter behavior). Test: reject-then-done → not stuck busy.
- [x] **SEAM-1 🔴 HIGH** — C7 reconnect racing abort/Stop leaked a live session (no `this.stopped` re-check after the `StartSession` await). Fix: re-check + close the fresh session and bail. Test: gated StartSession + Stop mid-open.
- [x] **SEAM-2 🔴 HIGH** — C7 reconnect relayed a stale `call_id` to the fresh session and didn't reset delegation/narration state. Fix: `AbortInFlight()` + narration reset at reconnect start, AND a session-identity guard on the tool-result relay (`handleToolCall` captures the originating session; `dispatchToolResult` drops if swapped). Test: in-flight delegation across reconnect → stale result not relayed.
- [x] **C4-window 🟠** — an abort firing DURING the `StartSession` await was lost (listener attached post-await on an already-fired signal). Fix: `if (signal.aborted) Stop()` after attach. Test: gated StartSession + abort mid-open.
- [x] **C7 re-entrancy + identity 🟠** — no re-entrancy flag (double reconnect at budget ≥ 2) and no session-identity guard (old session's late fatal killed the fresh one). Fix: `reconnecting` flag + identity-guarded `wireHandlers`. Tests: two-fatals-one-reconnect, late-old-fatal-ignored.
- [x] **S2 🟠** — client connect deadline timer leaked + could reject a later Connect when `openProviderSocket` throws synchronously. Fix: socket build + wiring moved inside the try; `unref()` added.
- [x] **S3 🟠** — reused-instance late `onclose`/`onerror` from the OLD socket corrupted the new session. Fix: reset `socketOpen` at Connect entry + identity-guard every socket handler. Test: old-socket-close-after-reconnect ignored.
- [x] **S5 🟡** — `model` was not a protected wire field (a bag `model` could pin a different model in the client-direct pact). Fix: added `model` to the scrub. Tests: both topologies.
- [x] **C8 🟡** — `persistRealtimeTranscript` ignored `ReplacesPrevious` → latent duplicate turns for future streamed-final server drivers. Fix: keep the in-flight key on a replacing final. Test: two replacing finals → one row.
- [x] **W3 🟡** — `effortLevel: 0`/negative was floored to `'minimal'` instead of dropped (+ a contradictory test name). Fix: drop non-positive numerics; test asserts the corrected behavior.
- [x] **W1/W2/SEAM-4 (test quality)** — strengthened the happy-reconnect usage test (fire before AND after the drop, assert the sum), rewrote the misleading HF "reconnection" reset test to actually prove queued-trigger reset on instance reuse, and added an end-to-end config-tuning-bag → driver-session-payload shape test proving the two halves agree on key names.

**Re-audit verification**: full repo build 299/299, unit tests 594/594. Suite deltas: ai-openai 152 · ai-realtime-client 394 · ai-agents 1668 · ai-gemini 87 · ai-xai 50 · ai-huggingface 34 · MJServer proxy 8.

## Third-pass adversarial re-audit — findings fixed (2026-07-18)

A third pass against the latest `next` (post-#3183 merge) found three residual seams — each an incomplete edge of a prior fix. All fixed with regression tests that provably fail against the pre-fix code:

- [x] **C8-completeness 🟠** — the C8 fix bound the in-flight key ONLY on the interim branch, so a FINALS-ONLY streamed provider (Grok user captions, ElevenLabs corrections) that never emits an interim delta still took the create+finalize branch and minted a duplicate `ConversationDetail` row per corrected final. Fix: bind the in-flight key in the create+finalize branch too when `ReplacesPrevious`. Test: `C8 finals-only` — first replacing final creates + binds, second updates the SAME row.
- [x] **SEAM-2b 🟠** — the C7 reconnect blanket-reset `activeDelegations = 0`; combined with each aborted delegation's self-decrementing `finally` (`AbortInFlight` unwinds them), this double-decrements and can steal a CONCURRENT post-reconnect delegation's narration burst (its progress silently drops). Fix: remove the blanket reset — frames self-unwind. Test: `SEAM-2b` — old delegation unwinds AFTER a new one starts; new one still narrates.
- [x] **W-usage 🟡** — `OnUsage` was identity-gated like every other handler, so a trailing usage frame flushed on the just-dropped socket was discarded. Usage is runner-GLOBAL (cumulative across reconnects), not session-scoped. Fix: un-gate `OnUsage` (every other handler stays guarded). Test: `W-usage` — late usage from the superseded session still sums into `FinalUsage`.
- [x] **S1 bounded-worst-case (characterization)** — added a test pinning the documented bounded degradation: an UNRELATED error while a legitimate local create is outstanding under-protects exactly ONE `response.done` (releases the lock early) but NEVER wedges the session.

**Third-pass verification**: `@memberjunction/ai-agents` build clean; ai-agents 1671 · ai-realtime-client 395 — all passing. Each new test verified to fail against the reverted (buggy) code, then pass with the fix restored.
