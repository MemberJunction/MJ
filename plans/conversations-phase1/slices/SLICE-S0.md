# SLICE-S0 — Preflight · spec (2026-07-22)

> Reviewed-before-code per IMPLEMENTATION-PLAN §2b. Branch: `s0-preflight` off
> `conversations-shell`, PR back into `conversations-shell`.

## 1. Ledger rows
Carries (CONTRACT): "6 host slots + cancelable before-events — architecture preserved" (adds a
7th slot, additively). Discharges nothing (preflight). Resolves one BASELINE §C1 open question
(composer seam — see §5).

## 2. Mockup references
Companion Rail behavior: `functional-mockup-src/app.js` — `railRunCard` (cancel-run/keep-open),
`companionHtml`, rail-over-studio CSS (template `.chat-wrap.studio .companion`). The slot built
here is the MOUNT seam S6 fills with that design.

## 3. Code: the `rail` slot (the only code in S0)
- `directives/chat-slot.directive.ts`: extend `MJChatSlotName` union with `'rail'`.
- `models/slot-interfaces` module: add `MJChatRailContext` (activeTasks/run state, artifact-open
  flag, collapse callback — final shape drafted in PR, kept minimal).
- `conversation-chat-area.component.html`: outlet inside `.chat-content-area` as a sibling
  after the artifact pane (~line 375 region), rendered ONLY when a consumer projects
  `mjChatSlot="rail"`; **no default component** (absent = nothing renders — today's behavior,
  byte-for-byte, for every existing consumer).
- README slot table + package changeset (minor). Unit test: slot registers + projects.

## 4. State/persistence keys
None in S0.

## 5. Verification results (research, done)
- **Composer seam: RESOLVED — nothing to build.** `mj-conversation-empty-state` already is the
  mountable composer surface (greeting, suggested prompts, mentions/attachments toggles,
  `messageSent {text, attachments}` out; host creates the conversation — the exact
  send-to-create pattern ChatConversationsResource uses today). Front Door (S3) composes it.
  BASELINE §C1's "composer slot possibly mooted by ng-composer" → confirmed moot.
- **Drift check: CLEAN.** `next` +7 commits since branch cut = v5.49.0 release train; zero
  touches on conversations/composer/runtime/explorer-core/app paths.

## 6. Coordination (not code)
- Refresh + post the PR #2953 comment (adds: mockup/ledger/plan now committed at `4864c39028`,
  ADR-1 ratification ask, D-S9 owner ask, ⚖1/⚖2/⚖4 agenda, mega-migration prune) — **needs
  Matt's go to post**.
- ADR-1 (shell in ng-conversations + thin wrapper) — ratify with Amith via that comment.

## 7. Exclusions
No shell components yet (S1). No rail visuals/behavior (S6). No wrapper changes.

## 8. Review checklist
Diff of the three touched files + test run + changeset; no screenshots (no visible change —
that's the point: S0 must be invisible to every existing consumer).
