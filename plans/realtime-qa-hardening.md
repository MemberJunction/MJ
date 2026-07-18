# Realtime Driver Family + Co-Agent Architecture — QA Hardening Plan

**Branch**: `fix/realtime-qa-hardening` · **Source**: adversarial QA audit of PR #3177 (merged 2026-07-18) + the broader realtime co-agent architecture. Three independent adversarial reviews (server diff, client diff, architecture) consolidated; every finding code-verified with file:line evidence at audit time.

**Rules for this work**: every fix ships with extensive unit tests (regression test for the exact failure scenario + related edge cases); PascalCase for public methods/exported functions; no `any`; package README / guide updates where behavior changes; full-repo build + unit tests green before completion; plan moves to `/plans/complete/` when done.

Severity legend: 🔴 fix-critical · 🟠 medium · 🟡 low · ⚪ info/hygiene

---

## A. NEW regressions introduced by PR #3177 (driver layer)

- [ ] **A1 🔴 HF: payload-less provider `error` frame misclassified FATAL**
  `RawRealtimeWebSocketConnection.handleMessage` sets `error.error = undefined` for a bare `{type:'error'}`/`{type:'error', message}` frame → base `handleConnectionError` sees no payload → `Fatal: true` + rejects the readiness gate. Old HF treated ALL provider error frames as recoverable.
  **Fix**: the adapter synthesizes a minimal provider payload for ANY inbound `error` frame (message from `error.message ?? message ?? default`), so downstream always classifies provider frames recoverable; transport failures remain payload-less/fatal.
  **Tests**: bodyless frame → recoverable downstream (drive through a real `OpenAIRealtimeSession`, assert `Fatal:false` AND config-wait not rejected); `{type:'error', message}` variant; transport error still fatal.

- [ ] **A2 🔴 HF falsely advertises `CanReconfigureTurnMode` + contradictory inherited `Reconfigure`**
  HF inherits base `Capabilities` (`CanReconfigureTurnMode: true`) and a `Reconfigure` that sends `transcription:{model:undefined}` + `server_vad`/`create_response` — both unsupported per its own profile.
  **Fix**: base `Reconfigure` becomes profile-aware (skip transcription block when profile model undefined; consult `buildTurnDetection`); add `supportsLiveReconfigure` to the profile; base `Capabilities` reads it; HF profile sets false (Capabilities false + Reconfigure no-ops with diag).
  **Tests**: HF `Capabilities` false + `Reconfigure` sends nothing; OpenAI/xAI unchanged (still true, correct payloads incl. per-profile transcription model).

- [ ] **A3 🔴 Config-bag rest-spread can override `type`/`instructions` (tools already protected)**
  `sendSessionUpdate` builds `{type, instructions, audio?, ...rest}` — a bag with `type` or `instructions` keys overrides the GA discriminator / system prompt. On HF's strict endpoint a clobbered `type` kills the whole `session.update` (prompt AND tools silently dropped). New exposure for HF; pre-existing for xAI/OpenAI.
  **Fix**: scrub `type`, `instructions`, `tools` from `rest` in `ExtractRealtimeFeatures` (protected wire fields — never overridable via the open bag); keep documented `audio` override.
  **Tests**: bag with `type`/`instructions`/`tools` keys → protected values win, keys not present raw; `audio` override still works; `tool_choice`/`output_modalities` passthrough unaffected.

- [ ] **A4 🟡 Deferred-config listener leak when session closes before `session.created`**
  `applyWhenReady` self-removes only when it fires; `Close()`/fatal paths never remove it.
  **Fix**: track the pending deferred listener on the session; remove it in `Close()` and on config-wait failure.
  **Tests**: listener count on the fake connection drops to 0 after `Close()` pre-`session.created`; also after fatal error pre-created.

- [ ] **A5 🟡 Empty-transcript emissions (HF regression; noise family-wide)**
  Base `emitTranscript` forwards empty/whitespace text the old HF driver suppressed.
  **Fix**: base skips empty/whitespace-only transcript text (deltas AND finals) — deliberate family-wide cleanup (empty captions are pure noise on every provider).
  **Tests**: empty + whitespace delta/final/user-completed emit nothing on OpenAI, xAI, HF; non-empty unaffected.

- [ ] **A6 🟠 Client-direct vs server-bridged divergence: `features.rest` not applied to the minted SessionConfig**
  Docstrings claim the topologies are behaviorally identical; residual native keys (`tool_choice`, …) apply server-bridged only.
  **Fix**: `CreateClientSession` applies the (now-hardened per A3) `features.rest` spread to the minted session too — making the invariant TRUE; correct docstrings.
  **Tests**: `tool_choice` in Config appears in the minted SessionConfig; protected keys cannot be injected client-direct either.

- [ ] **A7 ⚪ Hygiene: settle-handle + adapter edge cleanup**
  `rejectConfigApplied` not nulled after resolve (harmless double-settle); adapter leaves `pendingSends` unflushed on error-before-open and `opened` never resets on close.
  **Fix**: null both handles on any settle; adapter clears `pendingSends` and guards `send()` after close.
  **Tests**: double-settle path (resolve then fatal) has no rejection leak; error-before-open clears the buffer; send-after-close is a safe no-op.

## B. PRE-EXISTING defects carried forward (client + server robustness)

- [ ] **B1 🔴 No connect/readiness timeout + orphaned `Connect` promise (client WS layer + server base)**
  Client: HF `Connect` awaits `session.created` forever if the endpoint opens but stays silent; socket death DURING the created-wait sets error state but never releases the awaited promise; `Disconnect()` doesn't release it either. Server: `WaitForConfigApplied` (awaited by HF `StartSession`) has the same no-timeout gap.
  **Fix**: (client WS layer) a connect-phase deadline (protected `connectTimeoutMs`, default 15s) covering open+created; socket error/close and `Disconnect` during the created-wait reject/release it; `Connect` rejects with a clear fatal error. (server) readiness timeout in the deferred-config path → fails the config wait (drivers that await it get a rejection; OpenAI's non-awaited path is unaffected).
  **Tests** (fake timers): silent-endpoint timeout rejects Connect + emits fatal; error-during-created-wait rejects; close-during-wait rejects; Disconnect-during-wait releases; success path unaffected; server: created-never-arrives rejects `WaitForConfigApplied` after deadline, created-in-time resolves and cancels the timer.

- [ ] **B2 🟠 Stale `response.done` (of a cancelled turn) clears `responseActive` for the NEW in-flight response**
  After `SendText` barge-in (cancel → inject → `response.create`), the cancelled turn's trailing `done` clears the busy flag before the new `response.created` arrives → `IsBusy` reads false; narration can collide; queued results can double-fire.
  **Fix**: track locally-initiated in-flight `response.create`s (counter incremented on send, consumed by `response.created`); `response.done` skips the clear+flush when a local create is in flight (usage still emitted).
  **Tests**: SendText-barge-in → stale done → `IsBusy` stays true, narration skipped in the window, queued trigger fires exactly once on the REAL done; normal turns unaffected; counter never goes negative on VAD-initiated responses.

- [ ] **B3 🟠 Barge-in floor steal: queued tool-result trigger fires on the cancelled turn's `done`, speaking over the user**
  **Fix (product-decision codified)**: on TRUE user barge-in, clear the queued auto-trigger — the `function_call_output` item is already in the conversation, so the user's next turn (server-VAD response) voices the result contextually instead of stomping the user. Document the invariant change in the brain's docstrings.
  **Tests**: narration + queued result + barge-in → NO response.create on the cancelled done; result item remains delivered; without barge-in the queue still flushes (tool-result-delivery invariant intact).

- [ ] **B4 🟡 `remoteStreamHandlers` never cleared on `Disconnect` (OpenAI WebRTC client)**
  **Fix**: clear on Disconnect.
  **Tests**: handler registered in session 1 does not fire for session 2's track on a reused instance.

- [ ] **B5 🟡 WS client `canSendEvents()` doesn't check socket-open**
  Pre-open `send()` on a raw CONNECTING WebSocket throws `InvalidStateError`.
  **Fix**: `socketOpen` flag on the WS layer (set when opened resolves, cleared on error/close/Disconnect); `canSendEvents` requires it.
  **Tests**: action invoked between socket-assign and open → clean no-op (no throw, no state pollution); post-open works; post-close no-op.

## C. Architecture gaps (realtime co-agent stack)

- [ ] **C1 🔴 New driver features are DARK — no agent-layer producer for `effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`**
  Only `voice` + `disableAutoResponse` reach the Config bag today; `RealtimeCoAgentConfig` has no fields for the new knobs; vendor-row `SupportsEffortLevel` never influences realtime.
  **Fix**: extend `RealtimeCoAgentConfig` (typed optional fields: `EffortLevel`, `ParallelToolCalls`, `McpTools`, `InputTranscriptionModel`); fold into `buildSessionConfigBag` AND the server-bridged mirror exactly where `voice`/`disableAutoResponse` flow, preserving the same override cascade.
  **Tests**: Agents-package effective-config tests — each knob flows config→bag on both topologies; absent knobs add no keys; cascade precedence honored.

- [ ] **C2 🔴 Per-modality realtime usage discarded → multi-channel cost attribution wrong**
  Driver reads only total `input_tokens`/`output_tokens`; `input_token_details`/`output_token_details` (audio vs text vs cached) dropped at the edge; runner accumulates two scalars.
  **Fix**: widen `RealtimeUsage` with optional typed `InputTokenDetails`/`OutputTokenDetails` (audio/text/cached counts); OpenAI driver populates from `response.done`; xAI/HF pass through when present; runner accumulates per-modality and persists the detail alongside the totals (existing usage-JSON persistence point). Cost *application* per modality is enabled by the persisted detail; document the calculation path.
  **Tests**: driver surfaces details verbatim; missing-details frames degrade to totals-only; runner accumulation sums per-modality across turns; persistence includes the detail blob.

- [ ] **C3 🟠 HF realtime proxy hardening**
  No `Origin` validation; ticket's stored `UserID` never checked at consume; unbounded pre-open frame buffer; no upstream-connect timeout; in-memory registry breaks under multi-instance LB (documented, not silently).
  **Fix**: optional Origin allowlist (env `MJ_REALTIME_PROXY_ALLOWED_ORIGINS`, default off = current behavior); tunnel upstream-open deadline (close + 502 semantics) and bounded pending buffer (cap + drop-oldest with warn); README documents the sticky-routing requirement for HA + the UserID-binding limitation (upgrade requests carry no principal).
  **Tests**: origin allowlist accept/reject; buffer cap enforced; upstream-open timeout closes tunnel; existing single-use/TTL behavior unchanged.

- [ ] **C4 🟠 Runner ignores `cancellationToken`; no session wall-clock enforcement**
  The 2h agent timeout is a no-op for realtime sessions; only backstop is the 15-min janitor.
  **Fix**: `RealtimeSessionRunner` observes an abort signal (constructor-injected) → `Stop()` on abort; `StartSession` call wrapped with a connect-phase timeout at the runner too (belt over B1's braces).
  **Tests**: abort mid-session stops + finalizes usage; abort pre-connect rejects cleanly; no-signal behavior unchanged.

- [ ] **C5 🟠 MCP approval request = dead air**
  Model blocks awaiting `mcp_approval_response`; driver only logs a recoverable error.
  **Fix**: defensive auto-DENY — driver responds with a `mcp_approval_response` item (`approve:false`) so the model continues and voices the denial, plus the existing recoverable error for observability. Documented as the interim behavior until approval UX exists.
  **Tests**: approval-request frame → deny item sent with correct correlation id + recoverable error emitted; `require_approval:'never'` flows send no denial.

- [ ] **C6 🟠 Config bag unvalidated across providers (Gemini blind-spreads foreign keys)**
  **Fix**: Gemini driver warns (diag) on foreign/unconsumed keys before its spread and scrubs the OpenAI-family feature keys (`effortLevel`/`reasoningEffort`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel` + transport keys) so cross-provider co-agent configs are safe; shared scrub-key list exported from Core so producers/drivers agree.
  **Tests**: Gemini session with OpenAI-family keys → keys not in the SDK connect config + diag warned; legit Gemini keys unaffected.

- [ ] **C7 🟠 No reconnect/resume on fatal transport drop (server-bridged)**
  **Fix**: bounded reconnect in the session runner — on a Fatal transport error, up to N (default 1) re-`StartSession` attempts with the same params + a context note (\"reconnected after a transport drop\"), preserving accumulated usage; only then finalize. Gated by a runner option so hosts can disable.
  **Tests**: fatal error → one reconnect attempt → success path resumes (tools re-registered, note sent); second consecutive failure finalizes; usage accumulation spans the reconnect; disabled option preserves old behavior.

- [ ] **C8 🟡 Transcript gaps: `ReplacesPrevious` missing on the server-bridged contract**
  **Fix**: add optional `ReplacesPrevious` to Core `RealtimeTranscript`; providers that stream growing finals can set it; runner forwards it on the transcript event so persistence can collapse in place. (Full transcript→run linkage remains a tracked follow-up — schema change out of scope for this branch; documented.)
  **Tests**: contract field flows driver→session handler; absent by default.

## Completion checklist

- [ ] All A/B/C items checked off with tests
- [ ] Package READMEs updated: ai-openai, ai-xai, ai-huggingface, ai-realtime-client, MJServer (proxy), Agents (realtime)
- [ ] `guides/REALTIME_CO_AGENTS_GUIDE.md` updated (new config knobs, usage detail, reconnect, MCP deny, timeouts)
- [ ] Changesets (minor) for all touched packages
- [ ] Full repo build green; full repo unit tests green
- [ ] Plan moved to `/plans/complete/realtime-qa-hardening.md`
