# MJ Mobile App — Plan Checklist

Tracks [`plans/mobile-app-react-native/`](../../plans/mobile-app-react-native/).

**Legend:** `[x]` verified — run and observed against a live MJAPI, not merely compiled ·
`[~]` partial, with the unverified half named · `[ ]` not done.

The distinction matters. Everything below marked `[x]` was exercised on a simulator, an emulator,
or through a live integration test. Where something cannot be verified on this hardware, it says
so rather than borrowing credit from the code existing.

## Foundation

- [x] MJ **v6.1.0-edge** — pnpm workspace, full monorepo build green
- [x] Clean-room database bootstrapped from migrations + metadata alone (84 migrations, 390 tables,
      388 entities) with **no schema or generated-code drift**
- [x] MJAPI on `:4001`; iOS Simulator (iOS 26.5) and Android emulator (Android 15) both run the app
- [x] Auth — Auth0 PKCE, Microsoft, and a dev-JWT path sourced from `EXPO_PUBLIC_MJ_DEV_JWT`
- [x] Headless token minting for automated QA (authorization-code flow, no human)

## Application hosting

- [x] Reads `MJ: Applications` + `MJ: User Applications` — the same metadata MJ Explorer reads
- [x] `BaseMobileResource` resolved through `MJGlobal.ClassFactory` by the app's existing `DriverClass`
- [x] `/apps` launcher and `/apps/[appId]` shell; neither imports any application's code
- [x] "Opens on desktop" for nav items with no registered mobile surface
- [x] Sample hosted application (`src/sample-app/`) — one file: screen, resource subclass, registration
- [x] Authoring guide: [`guides/MOBILE_APP_HOSTING_GUIDE.md`](../../guides/MOBILE_APP_HOSTING_GUIDE.md)

## Chat & agents

- [x] Runs on `@memberjunction/conversations-runtime` — permission-filtered routing, client tools,
      `planMode` and `requestedSkillIDs` available as parameters
- [x] Live completion over the push WebSocket; the former 2.5 s × 24 polling loop is **deleted**
- [x] Markdown rendering — headings, syntax-highlighted code with copy, tables, SVG charts
- [x] Artifacts: markdown / html / json / json-table / code / chart / interactive
- [x] Profile's default-agent preference is actually applied (it was previously write-only)

## Data & Explorer

- [x] Entities, records, queries, dashboards
- [x] Record editing via `BaseEntity.Save()` with validation
- [x] Offline mutation queue with replay

## Attachments

- [x] Capture from camera, photo library and Files
- [x] Stored as first-class `MJ: Conversation Detail Attachments` with a resolved `ModalityID`,
      so an agent can consume them
- [x] Inline-vs-storage decided by `ConversationUtility.ShouldStoreInline` — the same call the
      server and Explorer make
- [~] Large attachments need a storage-capable host. A stock `UI`-role user cannot write to
      MJStorage, which is why inline is the end-user path

## Voice

- [x] Session lifecycle — mints, resolves a provider, and **declines cleanly** when this build
      cannot carry that provider's audio, closing the session server-side
- [x] WebRTC drivers for OpenAI Realtime and GPT-Live (a two-method subclass; ~800
      lines of wire protocol per provider reused unchanged)
- [ ] **Live audio is unverified.** It needs a WebRTC-capable provider key — this environment has
      Gemini and Cerebras only — and a physical device, since a simulator's microphone is
      host-provided and unsuitable for proving barge-in

## Notifications

- [x] Per-device token storage; registering on a second device no longer unregisters the first
- [x] Legacy single-token values migrated rather than discarded
- [ ] **Delivery is unverified.** Obtaining a token from APNs/FCM and receiving a notification
      need a physical device; a simulator has no APNs

## Testing

- [x] **198 unit tests**
- [x] **25 integration tests** against live MJAPI, each suite seeding and cleaning its own fixtures
- [x] **7 Maestro flows** on iOS: boot, new conversation, interactive component, render showcase,
      app host, explorer + profile, voice fallback
- [x] Android verified: builds, installs, and runs on an Android 15 emulator

## Known gaps

- Dashboard parts render best-effort, with a "desktop-optimized" fallback for complex ones
- The WebSocket + PCM16 realtime providers (Gemini Live, ElevenLabs, AssemblyAI) need a native
  Web Audio plane that does not exist under Hermes; the app declines them by name
