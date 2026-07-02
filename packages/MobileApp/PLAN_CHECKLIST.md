# MJ Mobile App — Master Plan Checklist (track to 100%)

Source of truth for the autonomous build. Legend: [x] done+verified · [~] in progress/partial · [ ] todo · (sim) = needs live simulator QA against the mockup.

> KEY DIRECTIVE: complete 100% of `plans/mobile-app-react-native/README.md`, verify each live in the iOS Simulator, don't stop. See WORKING_MEMORY.md top.

## Infra / Foundation (gating)
- [x] Xcode 26.5 + iOS 26.5 sim runtime + cocoapods(portable-ruby+nkf) + pods installed
- [x] Native app builds + runs on simulator (MJ-iPhone)
- [x] Docker + SQL container `sql` up; DB `MJ_5_36_0` migrated
- [~] MJAPI running on :4001 (GRAPHQL_PORT=4001 added to MJAPI/.env; restarting to pick up renamed user)
- [~] Auth: seed Owner user email renamed → da-robot-tester@bluecypress.io; minting Auth0 id_token via PKCE (sub-agent → /tmp/mj-jwt.txt). Inject via Env.devAuthToken in src/config/env.ts (LOCAL ONLY, revert before commit). ROPG disabled → must use auth-code flow.
- [ ] Tap injection for full interactive sim QA (cliclick via curl binary, or deep links). Markdown QA used deep links + screenshots.

## DONE (pre-backend)
- [x] P1.1 Apollo provider removed (vestigial)
- [x] P1.2 markdown-core extraction + ng-markdown refactor + RN MarkdownView (66 unit tests; on-device render verified)
- [x] P1.5 Profile prefs (appearance/voice/push/faceID toggles persist to MMKV; default-agent picker + routing)
- [x] MMKVStorageProvider (ILocalStorageProvider) exists

## Phase 1 — verify each screen live with real data (sim) + close gaps
- [ ] P1.Auth Login screen (sim): Auth0 / Microsoft / dev-JWT; secure-store; silent refresh; sign-out; gates app
- [ ] P1.Nav Drawer nav (conversation-list drawer → Explorer/Profile); swipe-from-edge opens drawer; no bottom tabs
- [ ] P1.Chat.List conversation-list (sim): groups Pinned/Today/Yesterday/Earlier, snippet, artifact-count badge, multi-agent avatar stack, live dot (In-Progress), pull-to-refresh, long-press (Copy/Pin min), tap→thread, +new, Explorer/Profile footers
- [ ] P1.Chat.New new-conversation (sim): composer focus, suggested prompts, agent rail (@mention prefix), send→create conv+detail→thread, mic→voice-mode
- [ ] P1.Chat.Thread chat-thread (sim): load+stream (ConversationStreamingService/WS), top nav avatar stack, recents strip, user/agent message styles, step indicators, @mention highlight, inline artifact card, action chips (SuggestedResponses), dock handle (count+pulse), composer, long-press (Copy/Pin)
- [ ] P1.Chat.Voice voice-mode (sim): Phase-1 visual scaffold (orb breathing/pulse, ripple, waveform, transcript card, keyboard/stop/menu)  [STT pipeline = Phase 2]
- [ ] P1.Chat.Artifacts.Dock artifacts-dock-open (sim): half/full snap, filter row (All/agent/type), card list w/ preview, tap→detail, reanimated spring
- [ ] P1.Chat.Artifact.Detail artifact-detail (sim): tabs Data/Chart/JSON, version selector, summary KPIs, type renderer, sticky bar (Back + Ask Skip)
- [ ] P1.Explorer.Home explorer-home (sim): entity/query/dashboard counts, recently-viewed (MMKV), search, tiles
- [ ] P1.Explorer.Entity entity-records (sim): RunView simple+Fields, cards, stage pills, filters (persist MMKV), FAB Ask Skip, pull-refresh
- [ ] P1.Explorer.Record record-detail (sim): GetEntityObject+Load, hero, sections Key/Owner/Related, read-only, Ask Skip bar
- [ ] P1.Explorer.Query query-run (sim): param chips+edit sheet, re-run, results cards, risk meter, Ask Skip bar
- [~] P1.Explorer.Dashboard dashboard-view (P1.4): CURRENTLY MOCKED. Load real Dashboard + UIConfigDetails; native KPI/chart/list parts; desktop-stub for complex; notice banner; Ask Skip bar (sim)
- [x] P1.Profile profile (P1.5 done; verify sim)
- [ ] P1.Artifacts.* renderers: markdown (done), HTML (react-native-render-html), JSON tree, data table cards, chart (victory-native/svg), code (syntax-highlighter), interactive=stub(P1.3), custom=registry
- [ ] P1.3 Interactive component artifacts: §4.3 investigation (Babel-standalone/Hermes, jsx-runtime, div/span/button→View/Text/Pressable shim, bundle impact) → decide Phase1 stub vs shim; replace stub in app/artifact/[id].tsx
- [ ] P1.CrossCut: Ask-Skip context payload (system Conversation Detail), gestures (edge-swipe drawer, dock swipe up/down), long-press sheets, pull-refresh, empty states, error states ("Couldn't load · Try again")
- [ ] P1.Animations: dock pulse 600ms, sheet rubber-band, voice orb timings, route transitions
- [ ] P1.ExitCriteria: login→see convs→talk to Skip→view record→run query; offline-read cache; 60fps

## Phase 2
- [ ] P2.1 Voice STT (expo-av record → MJAPI Whisper endpoint → Conversation Detail; wire voice-mode)  [needs transcription endpoint/key]
- [ ] P2.2 Voice TTS (expo-speech or ElevenLabs via MJAPI)  [needs key for ElevenLabs]
- [ ] P2.3 Push notifications (expo-notifications client + MJAPI device-token register + send; wire toggle)  [needs APNs cert + device]
- [ ] P2.4 Biometric lock (expo-local-authentication gate; wire toggle)
- [ ] P2.5 Record editing/creation (BaseEntity.Save(); editable detail; validation)

## Phase 3
- [ ] P3.1 Photo/file capture & attachments (expo-image-picker/document-picker → upload)
- [ ] P3.2 Offline mutation queue + sync-on-reconnect (MMKV/SQLite)
- [ ] P3.3 Android verification (Gradle/AVD)

## Closeout
- [ ] Remove DEV markdown-preview route (or keep behind dev flag)
- [ ] Full sim QA pass vs mockups (plans/.../html/*.html)
- [ ] Update PR #2617 description (explicit approval) ; GitHub issue #2665 already filed for ng-markdown AST migration
