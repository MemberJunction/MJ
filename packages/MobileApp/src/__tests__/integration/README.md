# Mobile App — Live Integration Test Suite

These tests exercise the mobile app's **real** data/service layer
(`src/data/services/*`) against a **live MJAPI** (GraphQL at
`http://localhost:4001/graphql`). Unlike the unit suite (`src/__tests__/*.test.ts`),
which mocks `@memberjunction/core`, these boot the actual
`GraphQLDataProvider` and hit the backend + database.

## How it's gated (safe for CI)

The entire suite is **skipped gracefully** when `MJ_TEST_JWT` is unset. Every
`describe` block uses `describe.skipIf(!hasToken())`, and `initLiveProvider()`
returns `false` (no boot attempted) when there is no token. So:

- **No token / no backend** → all tests skip; the run is green. Safe for CI.
- **Token present** → the provider boots against MJAPI; if the backend is
  unreachable or rejects the token, `initLiveProvider()` throws and the suite
  fails (that's a real, surfacing failure — not a silent skip).

## Running

1. Ensure MJAPI is running locally (GraphQL on `localhost:4001`) against a
   freshly-migrated 5.44 DB with seed data.
2. Mint a JWT for the test user (`da-robot-tester@bluecypress.io`).
3. Run:

   ```bash
   MJ_TEST_JWT='<jwt>' npm run test:integration
   ```

   (from `packages/MobileApp/`). The script is
   `vitest run --config vitest.integration.config.ts`.

## What's covered

Test files use the `*.itest.ts` suffix (not `*.test.ts`) so the unit config's
`**/*.test.ts` include never collects them — only `vitest.integration.config.ts`
(whose include is `**/*.itest.ts`) runs them.

| File | Intent |
|------|--------|
| `provider.itest.ts` | `initLiveProvider()` boots; `Metadata.Provider` is set; `Metadata.CurrentUser` is `da-robot-tester@bluecypress.io`. |
| `explorer.itest.ts` | `loadEntities()` (incl. "Users", "AI Agents"), `entityCount()`, `loadEntityRecords()`, `loadRecordDetail()`. |
| `queries.itest.ts` | `loadQueries()` returns approved queries; `runQuery()` on the first returns a clean success/empty result. |
| `agents.itest.ts` | `loadAgents()` includes "Sage"/"Skip"; `resolveTargetAgent('@sage hi')` resolves to Sage. |
| `conversations.itest.ts` | `loadConversations()` finds the seeded "Markdown demo" conversations; `loadConversation()` returns a user+AI thread and artifacts. |
| `agent-send.itest.ts` | **OPTIONAL / SLOW — `.skip` by default.** Real `createConversation` + `sendMessage` + poll for a persisted Sage reply. See the file header to enable. |

## Notes

- `setup-live.ts` owns `initLiveProvider()` (memoized boot) + `hasToken()`.
- The config aliases `react-native` → the unit suite's `rn-stub.ts` so any
  service that transitively imports react-native still loads under Node.
- Integration files run serially (`fileParallelism: false`) since provider
  setup mutates process-global singletons.
