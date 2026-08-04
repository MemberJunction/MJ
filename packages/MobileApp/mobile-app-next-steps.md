# MJ Mobile — Pick-Up Guide for a Fresh Mac (M4 Max)

**Audience:** a Claude Code session with machine-wide access on a new/air-gapped Mac that does **not** yet have the iOS toolchain installed. This doc gets you from a bare machine to running the MJ Mobile app in the iOS Simulator, then tells you the current state and what's left.

**Branch:** `an-mobile-app-dev` (all mobile work lives here). Mobile app package: `packages/MobileApp/`.

---

## 0. TL;DR sequence

```bash
# 1. Toolchain (details + alternatives in §1)
xcode-select -p                          # confirm full Xcode is active, not just CLT
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
brew install cocoapods watchman          # CocoaPods via brew (NOT system-ruby gem — see §1.3)

# 2. Repo
cd <repo-root>                           # the MJ monorepo
git checkout an-mobile-app-dev
git pull
npm install                              # from REPO ROOT only (workspace install)

# 3. Run
cd packages/MobileApp
npm run ios                              # first run builds native shell (~3-6 min) + Pods

# 4. Auth (one of the two — see §3)
#    a) Add mjmobile://auth to the Auth0 dev tenant callback URLs, then "Continue with Auth0"
#    b) OR use login screen → "Developer options" → paste a JWT from Explorer DevTools
```

The app should boot to a login screen, then (after auth) the conversation list reading from MJAPI.

---

## 1. Install the toolchain (machine-wide; this is the part not yet done)

### 1.1 Full Xcode
The Command Line Tools alone are **not** enough — the iOS Simulator (`simctl`) needs full Xcode.

Options (pick one):
- **Mac App Store** (simplest, no CLI): open the App Store, search "Xcode", install (~12 GB). Free, by Apple.
- **`xcodes` CLI** (scriptable, version-pinnable):
  ```bash
  brew install xcodes
  xcodes install --latest            # prompts for an Apple ID; downloads from Apple
  ```
- **`mas` CLI** (App Store from terminal, must be signed into the App Store):
  ```bash
  brew install mas
  mas install 497799835              # Xcode's App Store ID
  ```

After install, point the toolchain at it and accept the license:
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
xcrun simctl list devices available   # should now print a list of iOS simulators
```

### 1.2 Node + npm
The previous machine used **Node 24 / npm 11** and it worked. Anything Node ≥ 20 should be fine. If you need to install:
```bash
brew install node            # or use nvm / fnm if you prefer version management
node --version && npm --version
```

### 1.3 CocoaPods — install via Homebrew, NOT system-ruby gem
On the prior machine, `gem install cocoapods` against the macOS system Ruby (2.6) **failed**. Homebrew's CocoaPods worked cleanly:
```bash
brew install cocoapods
pod --version                # confirm it's on PATH
```
(Expo's `npm run ios` will try to auto-install CocoaPods if missing, but it falls back to Homebrew anyway — installing it yourself first avoids a slow/failed gem attempt.)

### 1.4 Watchman (recommended)
Speeds up Metro's file watching; avoids occasional ENOSPC/ watch issues.
```bash
brew install watchman
```

---

## 2. Get the repo building

```bash
cd <repo-root>
git checkout an-mobile-app-dev
git pull

# IMPORTANT: install from the repo root only. This is an npm workspaces monorepo.
# Never run `npm install` inside packages/MobileApp.
npm install
```

The root `package.json` on this branch intentionally includes `expo`, `expo-router` (deps) and a workspace-wide `react`/`react-dom` `19.1.0` **override**. Those are load-bearing for the mobile build (see §5 "Gotchas already solved"). Do not remove them while on this branch.

Build + launch the simulator:
```bash
cd packages/MobileApp
npm run ios
```
First run: Expo runs `prebuild` (generates the native `ios/` project), `pod install`, then an Xcode build. Expect 3–6 minutes. Subsequent runs are fast, and JS edits hot-reload via Metro without a rebuild.

If you only want the Metro bundler (e.g., the native app is already installed):
```bash
npx expo start --dev-client --clear
# then press "i" to open iOS, or reload an already-running app with ⌘R in the simulator
```

---

## 3. Auth + MJAPI (required for real data)

The app talks to **MJAPI on `http://localhost:4001/graphql`** (configured in `src/config/env.ts`). Make sure MJAPI is running and reachable. iOS Simulator can hit `localhost` directly.

Sign in via **one** of:

1. **Auth0 (primary).** One-time: in the Auth0 dashboard, open the app with client ID `uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI` (BlueCypress dev tenant) → **Settings → Application URIs** → add `mjmobile://auth` to **Allowed Callback URLs** (and Logout URLs). Then on the login screen tap **Continue with Auth0**.

2. **Dev JWT paste (fastest, no Auth0 change).** On the login screen tap **Developer options → Dev JWT**, paste a JWT. Get one from MJ Explorer in a browser: sign in, open DevTools → Application → Local Storage → copy the MSAL/Auth0 idToken value. Stored in the iOS Keychain via `expo-secure-store`.

3. **MSAL (Azure AD).** Wired and ready, but blocked until `mjmobile://auth` is registered as a "Mobile and desktop applications" redirect URI on the Azure AD app `7e6e6ecf-66ff-4733-9c60-1e6def949897` with "Allow public client flows" enabled. Until then it errors with AADSTS50011 (expected).

If boot hangs on "Connecting…", a **6-second escape hatch** appears ("Clear tokens & sign in again") — tap it to wipe a stale stored token. Metro's terminal logs `[MJProvider]` lines showing exactly which boot path was taken.

---

## 4. Current state — what's built (Phase 1, code-complete)

Everything reads from MJAPI via the MJ object model (`Metadata`, `RunView`, `RunQuery`, `GraphQLDataProvider.AI`, typed `BaseEntity`). **No mock data anywhere.**

- **Auth:** Auth0 OAuth+PKCE (primary), MSAL (ready), dev-JWT paste (fallback). Login gate, silent refresh, sign-out.
- **Chat read:** conversation list (recency groups, multi-agent avatar stacks); thread (agent attribution, markdown, @mention, pull-to-refresh).
- **Chat write:** composer → creates user `Conversation Detail` + triggers agent via `RunAIAgentFromConversationDetail` with live progress; new-conversation flow.
- **Artifacts:** per-conversation list + single-artifact detail rendered by classified kind (json-table / json / markdown / code / text).
- **Data Explorer:** entities → records → read-only detail; queries → results; dashboards picker. "Ask Skip about this" bridge on each surface.
- **Profile:** identity from `Metadata.CurrentUser`.

### File map (under `packages/MobileApp/`)
- `app/` — Expo Router screens (file-based routing). `index.tsx` is the boot gate.
- `src/auth/` — `auth0.ts`, `msal.ts`, `useAuth0Auth.ts`, `useMsalAuth.ts`
- `src/providers/` — `mj-provider.tsx` (boot + token state machine), `apollo-provider.tsx`, `mmkv-storage-provider.ts`
- `src/data/services/` — `conversations.ts`, `agents.ts`, `explorer.ts`, `artifacts.ts`
- `src/data/adapt.ts` — entity → UI-shape adapters
- `src/hooks/` — `useConversations.ts`, `useAgents.ts`, `useExplorer.ts`
- `src/theme/tokens.ts` — design tokens (mirror plan §4.1)
- Visual spec / mockups: `plans/mobile-app-react-native/index.html` + `README.md`

### Verify after setup
```bash
cd packages/MobileApp && npx tsc --noEmit    # should exit 0
```
Then in the simulator: sign in → send a message to Skip → confirm the agent responds (exercises the most surface area), browse an entity, open an artifact.

---

## 5. Gotchas already solved (do NOT re-litigate)

These were fixed on this branch; if you're tempted to "fix" them, check git log first:

- **expo-router hoisting:** `expo` + `expo-router` are in the **root** `package.json` deps so `babel-preset-expo` can `require.resolve('expo-router')` and inject `EXPO_ROUTER_APP_ROOT`. Without this you get a runtime `require.context` error / blank screen.
- **React version pin:** workspace-wide `overrides: { react: 19.1.0, react-dom: 19.1.0 }`. RN 0.81's renderer requires exactly 19.1.0; `@memberjunction/ng-react` pulls 19.2.x otherwise → "incompatible React versions" crash.
- **babel.config.js:** plain `babel-preset-expo` only. Custom preset options broke the router plugin.
- **react-native-reanimated removed:** not used (voice-mode uses RN's built-in `Animated`). Avoids a worklets peer-dep build failure. Re-add only if you adopt a gesture/bottom-sheet lib, and pair with `react-native-worklets`.
- **metro-runtime** added to MobileApp deps to satisfy Expo CLI's resolver in the monorepo.
- **App icon:** `app.json` has no `icon`/`adaptiveIcon` (the referenced PNGs didn't exist and broke prebuild). Add real assets later.
- **RN lib versions** are pinned to the Expo SDK 54 expected set (`expo install --check`-clean): safe-area-context ~5.6, screens ~4.16, gesture-handler ~2.28, svg 15.12.1.

---

## 6. Deferred to Phase 2 (designed-for, not wired)

- Voice STT/TTS pipeline (the voice-mode screen is a visual scaffold only)
- Push notifications (APNs/FCM + a server endpoint)
- Biometric (Face ID) app lock
- Record editing / creation (Phase 1 is read-only in Explorer)
- Interactive-component artifacts via `@memberjunction/react-runtime` (currently shown as text/markdown/json by classification; a true RN renderer + a `ReactRootManager` adapter is the Phase 2 task — see plan §4.3)
- Shared `@memberjunction/markdown-core` extraction (a lightweight inline markdown renderer stands in for now)
- Real dashboard part rendering (the dashboard viewer is a best-effort placeholder)
- Android (iOS-first; RN code is shared, Android is mostly verification + a Gradle/AVD setup)

---

## 7. Working agreement / conventions (from repo CLAUDE.md)

- Don't commit without explicit approval. Branch is `an-mobile-app-dev`; keep tracking `origin/an-mobile-app-dev`.
- No `any`. Use the MJ object model + typed `BaseEntity` subclasses; never `.Get()/.Set()` as a substitute for typed props (the one legit exception in this app is `explorer.ts`, which does *generic* runtime field access on user-selected entities — there's no compile-time type there).
- Build the affected package and run `npx tsc --noEmit` in `packages/MobileApp` before considering work done.
- Commit at clean boundaries; mirror the existing commit-message style on this branch.
