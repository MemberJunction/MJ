# Contributing — MJ Mobile App

Conventions for `packages/MobileApp/`, and step-by-step recipes for the three
things you'll add most often: a **screen**, a **hook**, and a **service**. Read
[`ARCHITECTURE.md`](ARCHITECTURE.md) first for the layering this package assumes.

The monorepo-wide rules in the root [`CLAUDE.md`](../../../CLAUDE.md) still apply
(no `any`, strong typing off the generated entity classes, functional
decomposition, `UUIDsEqual` for UUID comparisons, etc.). The notes below are the
mobile-specific deltas.

---

## Conventions

### Naming
Follows MJ's convention, not stock TypeScript:

- **PascalCase for public** class members and exported types/interfaces/components.
- **camelCase for private/protected** members and local variables.
- Service **functions** are camelCase verbs (`loadConversation`, `sendMessage`,
  `runQuery`). React components and hooks follow React norms (`PascalCase`
  components, `useX` hooks).
- Files: components `PascalCase.tsx`; services/hooks/utilities `kebab`/`camel` to
  match the existing files in each folder (`mj-provider.tsx`, `useConversations.ts`,
  `chart-spec.ts`).

### Types
- **No `any`, no lazy `unknown`.** Always type data access off the generated entity
  classes: `RunView<MJConversationEntity>(...)`,
  `GetEntityObject<MJConversationEntity>('MJ: Conversations')`. Derive field types
  from the entity (`Entity['Field']`) rather than hand-copying value-list unions.
- Prefer **union types** over enums.
- Keep UI-shaped view models in `src/data/types.ts` and produce them via
  `src/data/adapt.ts` — components should not know entity field shapes.

### Design tokens
- **No hardcoded colors/spacing in components.** Import from
  [`src/theme/tokens.ts`](../src/theme/tokens.ts): `Colors`, `Spacing`, `Radius`,
  `Type`, `Shadow`, and the `colorForAgent(name)` resolver.
- Use **semantic** tokens (`Colors.ink`, `Colors.brand`, `Colors.surface`), and
  agent-identity tokens for avatars/highlighting.
- Allowed exceptions (mirroring the code that already does this): the immersive
  dark surface in `voice-mode.tsx`, and static shadow neutrals inside `Shadow.*`.
- Phase 1 is **light theme only**; a preference for appearance mode is persisted
  now, but dark-theme *rendering* is a Phase 2 task.

### Functional decomposition
- Keep functions small and single-purpose (~30–40 lines). The existing renderers
  (`MarkdownView`, `html-renderer`) and services model this: a public entry point
  that composes small, well-named helpers. Break out helpers rather than nesting.

### TSDoc expectations
Every exported function, component, hook, and type/interface — and every
non-trivial internal helper — carries a TSDoc block. Match the house style used in
[`chart-spec.ts`](../src/components/charts/chart-spec.ts) and
[`MarkdownView.tsx`](../src/components/markdown/MarkdownView.tsx):

- one or two sentences on **what it does and why it exists**;
- `@param` for each parameter, `@returns` for the return, `@throws` where relevant;
- for **components**: document the props and note key data sources (which MJ
  entity / RunView / hook) and side effects;
- for **screens**: a top-of-file block with **Purpose / Route / Data / Interactions
  / Mockup** (cross-reference the mockup in
  `plans/mobile-app-react-native/html/`);
- for **services**: note the MJ primitive and entity names used (RunView vs
  RunQuery vs GetEntityObject vs the agent runner).

Terse one-liners are fine for obvious helpers; every file gets a module-level block.

### Data-access rules (mobile-specific)
- **Never write raw GraphQL.** Use the object model (`RunView` / `RunViews` /
  `RunQuery` / `GetEntityObject`) or the AI helper
  (`GraphQLDataProvider.Instance.AI.*`).
- Read-only card lists → `ResultType: 'simple'` + a narrowed `Fields` set. Anything
  you'll mutate/inspect → `ResultType: 'entity_object'`.
- Batch independent reads with `RunViews` (plural) — one round trip.
- **Check `Success`** on `RunView`/`RunQuery` (they don't throw); check the boolean
  return of `Save()`/`Delete()` and read `LatestResult?.CompleteMessage` on failure.
- Persist **UI preferences** in MMKV (`src/data/preferences.ts`), not the MJ data
  cache. (The mobile app is device-local for prefs by design; the root-CLAUDE
  `UserInfoEngine` rule targets the web client.)

---

## Recipe: add a screen

1. **Create the route file** under `app/` — the path is the route
   (`app/explorer/thing/[id].tsx` → `/explorer/thing/:id`). Dynamic segments use
   `[param]`; read them with `useLocalSearchParams()`.
2. **Default-export a component** named for the screen (`ThingScreen`). Read data
   via a hook (below), not by calling services directly.
3. **Gate on provider status.** Consume `useMJ()` if you need `status` for empty
   states; data hooks already gate internally and return `null` until `ready`.
4. **Style with tokens**; compose small presentational sub-components.
5. **Add the top-of-file TSDoc block** (Purpose / Route / Data / Interactions /
   Mockup).
6. **Navigate** with `router.push('/route')` / `router.replace(...)` from
   `expo-router`; `typedRoutes` is on, so routes are type-checked.
7. Add a section to [`SCREENS.md`](SCREENS.md).

## Recipe: add a hook

1. Create `src/hooks/useThing.ts` (or add to an existing grouped hook file).
2. Follow the standard contract: `{ data, loading, error, refresh }` (or the
   `{ thing, loading, error }` shape used by the read-only hooks).
3. **Gate on `useMJ().status === 'ready'`** — return `null`/idle before that.
4. Use a **cancellation flag** in `useEffect` so a late fetch can't set state after
   the deps change or the component unmounts (see `useArtifact` for the pattern).
5. Call a service function; never call the object model directly from a hook if a
   service function belongs in between.
6. Export the state type and TSDoc the hook (what it wraps, what state it exposes).

## Recipe: add a service

1. Add a function to the right file in `src/data/services/` (or a new file):
   `conversations.ts`, `artifacts.ts`, `agents.ts`, `explorer.ts`.
2. Use the object model with strong generics; accept an optional
   `contextUser?: UserInfo` last param and default it to `Metadata.CurrentUser`.
3. Return **service-shaped** data (raw entities or a small typed struct). Put UI
   massaging (colors, relative times, buckets) in `src/data/adapt.ts`, not here.
4. Check `Success` / `Save()` return values; throw a descriptive `Error` on hard
   failure so the hook can surface it.
5. TSDoc it: name the MJ primitive and the entity names it touches.

---

## Run & verify locally

```bash
# from the monorepo root (workspace install)
npm install

# from packages/MobileApp/
npm run typecheck          # tsc --noEmit — MUST pass before you're done
npm run lint               # expo lint
npm test                   # Vitest unit tests (do not edit tests as doc work)
npm run start              # Metro bundler
npm run ios                # build + run on the iOS Simulator (needs Xcode + MJAPI :4001)
```

To exercise UI without a live conversation, deep-link the dev-harness routes:

```
mjmobile://markdown-preview     # render markdown/charts/HTML fixtures
mjmobile://devchat              # automated end-to-end send (needs ready provider)
```

Before opening a PR, confirm: `typecheck` clean, `lint` clean, tests green, and any
new screen/hook/service documented (TSDoc + the relevant `docs/` file updated).

---

## Do not touch (ownership / stability)

- **`src/config/env.ts`** — endpoints + auth config. Never commit a real
  `devAuthToken` / refresh token.
- **Test files** (`*.test.ts(x)`, `src/__tests__/`) and `vitest.config.ts` — owned
  by the test suite.
- Build/config files (`package.json`, `metro.config.js`, `tsconfig.json`,
  `app.json`, `eas.json`) — change only with intent; a workspace-wide
  `react@19.1.0` override and the Metro workspace config are load-bearing.
</content>
