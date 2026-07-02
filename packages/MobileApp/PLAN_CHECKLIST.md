# MJ Mobile App — Plan Checklist

Tracks `plans/mobile-app-react-native/README.md`. Legend: [x] done + verified in the
iOS Simulator · [~] partial · [ ] deferred.

> **PR #2617 scope:** Phase 1 (foundation + chat + Data Explorer subset), full
> rendering, docs, and the test suites. **Phase 2 & 3 are deferred to a follow-up
> PR** (per maintainer direction — core MJ's new realtime/voice work will be reused
> there; see the updated Phase 2 section of the plan).

## Infra / Foundation
- [x] Xcode 26.5 + iOS 26.5 sim runtime + CocoaPods; native app builds & runs (MJ-iPhone)
- [x] Docker SQL `sql` container; **`MJ_5_44_0`** migrated (52 migrations, 372 entities)
- [x] MJAPI on :4001 (v5.44) against the 5.44 DB
- [x] Auth: Auth0 auth-code + PKCE (`mjmobile://auth` registered & verified), MSAL ready, dev-JWT fallback; auto-refresh; secure-store
- [x] Merge `next` v5.36 → **v5.44** (7 conflicts resolved; RN dep pins)

## Phase 1 — features (all verified live in the simulator)
- [x] P1.1 Vestigial Apollo provider removed
- [x] P1.2 `@memberjunction/markdown-core` extraction + ng-markdown refactor + RN MarkdownView
- [x] P1.Auth Login (Auth0 / Microsoft / dev-JWT), gating, silent refresh, sign-out
- [x] P1.Nav Drawer-first navigation (Conversations → Explorer / Profile)
- [x] P1.Chat.List Conversation list (recency groups, snippet, agent avatar stack, pull-to-refresh)
- [x] P1.Chat.New New-conversation composer + agent rail + first-message flow
- [x] P1.Chat.Thread Chat thread → real **Sage agent run** via `RunAIAgentFromConversationDetail`; reply persisted; live progress + reconciliation
- [x] P1.Chat.Artifact.Detail Artifact detail — type renderers (markdown / html / json / json-table / code / chart / interactive)
- [x] P1.Chat.Artifacts.Dock Artifact dock — All / per-agent / type filters + cards
- [x] P1.Explorer.Home / Entity / Record / Query surfaces (RunView / GetEntityObject / RunQuery)
- [x] P1.4 Dashboard view — real Golden-Layout `UIConfigDetails` parse → KPI/chart/table parts, "Desktop-optimized" fallback
- [x] P1.Profile Identity + persisted MMKV preferences + default-agent picker
- [x] P1.Rendering Code syntax highlighting (prismjs), SVG bar/line/pie charts, HTML→RN renderer
- [x] **P1.3 Interactive-component artifacts** — `@memberjunction/react-runtime` + Babel, on-device Hermes compile, web-primitive→RN shim, "View on desktop" fallback (Maestro-verified interactive)
- [x] P1.Chat.Voice Voice-mode visual scaffold (STT pipeline = Phase 2)

## Testing & docs
- [x] Unit tests — MobileApp 94 · markdown-core 93 · ng-markdown 47 · MJCore `runningOnNode` 3
- [x] Integration tests — 15 against **live MJAPI** (`npm run test:integration`, gated on `MJ_TEST_JWT`)
- [x] UI E2E — 4 Maestro flows (boot, new-conversation, interactive-component, render-showcase)
- [x] Docs — exceptional JSDoc across the package, rewritten README, `docs/` guides (ARCHITECTURE/SCREENS/RENDERING/CONTRIBUTING)
- [x] Shared-package hardening (markdown-core / MJCore / ng-markdown) documented + edge-tested; dead ng-markdown extension removed

## Deferred to the follow-up PR
- [ ] Phase 2 — Voice STT/TTS (reuse core realtime/voice; see updated plan), Push, Biometric lock, Record editing
- [ ] Phase 3 — Photo/file capture, offline mutation queue, Android verification
