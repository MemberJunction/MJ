# Sub-Epic S3 — Structural Audience Mode, Scope-Attributed Search & Invite-Only External User Config

## Overview

Sub-Epic S3 ships four pure TypeScript runtime and configuration seams in `MemberJunction/MJ` targeting branch `next` with **zero SQL DDL migrations** (`migrations/**`, `migrations-pg/**`, `teardown/**`, and `teardown-pg/**` remain untouched):

1. **MJ-1 — Structural Common-Reach Audience Mode** (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/server`)
2. **MJ-2 — `SearchResultItem` Originating Scope Attribution** (`@memberjunction/search-engine`, `@memberjunction/ai-agents`, `@memberjunction/core-actions`)
3. **MJ-5 — Invite-Only External User Config & Enforcement** (`@memberjunction/server`)
4. **Scoped Search Query Unquoting & Normalization** (`@memberjunction/core-actions`)

---

## 1. MJ-1: Structural Common-Reach Audience Mode (`AC-EPIC-1`)

- **Discriminated Union (`packages/AI/CorePlus/src/agent-types.ts`)**: `AgentAudienceMode` adds `'ScopeCommonReach'` alongside `'Caller'` and `'Intersection'`. `AgentRunAudience` is a discriminated union (`AgentCallerAudience | AgentIntersectionAudience | AgentScopeCommonReachAudience`), with `AgentScopeCommonReachAudience` carrying `Mode: 'ScopeCommonReach'` and forbidding enumerated `UserIDs` (`UserIDs?: never`).
- **Helpers & Envelope (`packages/AI/CorePlus/src/agent-types.ts`, `packages/AI/CorePlus/src/task-graph/task-security-envelope.ts`)**: `IsStructuralCommonReachAudience()` and `ValidateAgentRunAudience()` enforce strict shape invariants (rejecting non-empty `UserIDs` on `'ScopeCommonReach'`). `TaskSecurityEnvelope` carries `AudienceMode` alongside `AudienceReaderUserIDs`, ensuring structural mode stays bounded across task-graph sub-steps and intersections (`CombineTaskSecurityEnvelopes`).
- **O(1) Startup & Boundary Enforcement (`packages/AI/Agents/src/agent-audience.ts`, `packages/AI/Agents/src/base-agent.ts`, `packages/MJServer/src/services/TaskGraphActionRunner.ts`, `packages/MJServer/src/services/TaskGraphAgentRunner.ts`)**:
  - `AgentAudienceReaderIDs()` returns `[]` in O(1) time without hydrating reader lists; `AgentAudienceAddsReader()` returns `true` for `'ScopeCommonReach'` so every audience gate remains active.
  - `BaseAgent` skips `UserCache` reader enumeration on `'ScopeCommonReach'` runs while enforcing `checkStructuralAudienceAction()` (only class-based actions declaring `SupportsAudience === true` may execute; runtime actions and non-audience-aware actions fail closed with `AUDIENCE_UNSUPPORTED`), content classification boundaries, and agent user-policy checks identically.

## 2. MJ-5: Invite-Only External User Config & Enforcement (`AC-EPIC-2`)

- **Configuration Schema (`packages/MJServer/src/config.ts`, `packages/MJServer/README.md`)**:
  - `userHandlingInfoSchema` adds `inviteOnly: boolean` (default `false`), `requireVerifiedEmail: boolean` (default `false`), and `verifiedEmailOptionalProviders: string[]` (default `[]`) for IdP tenants (such as enterprise Entra ID configurations) that omit standard OIDC `email_verified` claims.
  - `NormalizeInviteOnlyUserHandling()` forces `autoCreateNewUsers: false`, `requireVerifiedEmail: true`, and `newUserRoles: []` whenever `inviteOnly: true`, overriding inherited defaults (`autoCreateNewUsers: true`, `newUserRoles: ['UI']`).
- **Fail-Closed Auth Pipeline (`packages/MJServer/src/auth/inviteOnlyPolicy.ts`, `packages/MJServer/src/auth/inviteOnlyAuthError.ts`, `packages/MJServer/src/auth/newUsers.ts`, `packages/MJServer/src/context.ts`)**:
  - `EvaluateExternalEmailVerification()` rejects unverified email claims (`email_verified === false` or `xms_edov === false`, or missing verified claims unless explicitly allowlisted via `verifiedEmailOptionalProviders` or MJ magic-link tokens).
  - Uninvited external users (no active pre-provisioned `MJ: Users` record) are rejected with `InviteOnlyAuthError` (`INVITE_ONLY_AUTH_ERROR_PREFIX`) rather than auto-provisioned.
  - `ResolveEffectiveNewUserRoles()` unconditionally returns `[]` when `inviteOnly: true` so external users are never auto-granted the `'UI'` role.

## 3. MJ-2: `SearchResultItem` Originating Scope Attribution (`AC-EPIC-3`)

- **Type Surface (`packages/SearchEngine/src/generic/search.types.ts`)**:
  - Added `SearchResultScopeAttribution` (`{ ScopeID: string; ScopeName?: string }`) and optional properties on `SearchResultItem`: `OriginatingScopeID`, `OriginatingScopeName`, and `OriginatingScopes`.
  - Unscoped searches leave these fields `undefined` for 100% backwards compatibility.
- **Fusion & Deduplication (`packages/SearchEngine/src/generic/SearchFusion.ts`, `packages/SearchEngine/src/generic/SearchEngine.ts`)**:
  - `SearchEngine.executeScopeBundle()` stamps each provider hit with `StampOriginatingScope(r, scope.ID, scope.Name)`. Explicit single global scope searches also stamp the global scope.
  - `SearchFusion.Fuse()` (`applyRRF`), `SearchFusion.CrossScopeFusion()`, and `SearchFusion.Deduplicate()` preserve and combine scope attribution via `MergeScopeAttributions()` using case-insensitive `UUIDsEqual()` deduplication. In `CrossScopeFusion()`, the winning contributor is chosen deterministically by RRF contribution (`weight / (RRF_K + rank)`), breaking ties by item score then input scope order, while retaining all contributing scopes in `OriginatingScopes`.
- **Downstream Source Receipts (`packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`, `packages/AI/Agents/src/agent-pre-execution-rag.ts`)**:
  - `ScopedSearchAction.formatResults()` forwards `OriginatingScopeID`, `OriginatingScopeName`, and `OriginatingScopes` when present.
  - `AgentPreExecutionRAG.BuildArtifactPayload()` maps `scopeID: r.OriginatingScopeID ?? r.ProviderId` alongside optional `scopeName` and `originatingScopes`.

## 4. Scoped Search Query Unquoting (`AC-EPIC-4`)

- **Helper & Integration (`packages/Actions/CoreActions/src/custom/search/search-query.util.ts`, `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`)**:
  - `NormalizeScopedSearchQuery()` deterministically unescapes backslash-escaped quotes (`\"`, `\'`), removes straight/curly double quotes (`"`, `“`, `”`) as space-separated boundaries, strips paired or unbalanced boundary single quotes (`'`, `‘`, `’`) without mangling adjacent tokens, preserves internal apostrophes (`O'Brien's report`, `don't`, `2025's`) and standalone trailing possessives (`James'`, `users'`), reduces empty/quote-only inputs (`""`, `''`, `“”`) to `""`, and collapses whitespace.
  - `ScopedSearchAction.validateInputsAndAgent()` applies `NormalizeScopedSearchQuery()` internally without altering `ActionParam` definitions or result codes; empty results fail cleanly with `MISSING_QUERY`.

## 5. CI Workflow Coverage Verification (`AC-EPIC-5`)

- `.github/workflows/test.yml`: Runs on every `pull_request` targeting `next` (no `paths:` filter on the trigger so required `Run unit tests` always reports). Detects changed packages under `packages/**` via `--filter=...[origin/$PR_BASE_REF]`, builds all affected packages + dependents (`packages/AI/**`, `packages/MJServer`, `packages/SearchEngine`, `packages/Actions/CoreActions`), runs `test:types`, executes sharded `turbo run test`, runs `Source guards` (`UUIDCompliance`, `MultiProviderCompliance`, `FieldSecurityEgressCompliance`, `PlatformStringCompliance`, `PrimaryKeyCompliance`, `check-dynamic-imports`, `check-dynamic-replace`, `check-api-root`, `check-manifest-registrations`), and runs `Native-ESM import guard` (`check-esm-imports.mjs --changed-since`).
- `.github/workflows/ci-standards.yml`: Runs `adopted standards` (`packages/Standards/bin/run.js check`) on every `pull_request` targeting `next` when `packages/**/*.ts` changes.
- `.github/workflows/build.yml`: Full monorepo build verification on push to `next`.
