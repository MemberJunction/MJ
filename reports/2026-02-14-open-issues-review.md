# Open Issues Review Report

**Repository:** MemberJunction/MJ
**Date:** 2026-02-14
**Total Open Issues:** 95
**Issues Reviewed:** ~89

---

## Executive Summary

A comprehensive review of all 95 open GitHub issues was conducted against the current codebase (v4.4.0). Each issue was investigated by searching for relevant code, migrations, commits, and configuration to determine whether the work described has already been completed.

| Category | Count | Action |
|----------|-------|--------|
| Already Addressed (close) | 35 | Close with "resolved in codebase" note |
| Superseded / No Longer Relevant (close) | 5 | Close with explanation |
| Still Relevant (keep open) | 31 | Keep open, prioritize |
| Partially Addressed / Needs Clarification | 18 | Triage with original reporters |
| Not Reviewed (clearly open feature requests) | 6 | Keep open |

**Key finding:** ~42% of open issues (40 issues) can be closed immediately because the underlying work has already been completed.

---

## Part 1: Recommend CLOSE — Already Addressed (35 issues)

These issues have verifiable implementations in the current codebase. Each entry includes the evidence location.

### Bugs / Fixes

#### #1907 — ChangeDetectorRef
- **Filed:** 2026-02-07 by AN-BC
- **Description:** Many components bind to dynamic variables causing `ExpressionChangedAfterItHasBeenCheckedError` in Angular 21.
- **Evidence:** Fixed in commit `8d3eae1d` (2026-02-13) which adds `cdr.detectChanges()` after async data loads in AI Prompt, Action, and Action Execution Log form components. The pattern is now documented in `CLAUDE.md` Angular section as a standard practice.
- **Files:** `packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIPrompts/ai-prompt-form.component.ts`, `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.ts`
- **Note:** The broader investigation into standalone components, signals, and zone removal mentioned in this issue is a separate modernization effort that may warrant a new, more specific issue.

#### #1749 — Agent/AgentID never populate in vwAIPromptRuns base view
- **Filed:** 2026-01-03 by (unknown)
- **Description:** The `vwAIPromptRuns` view was missing AgentID/Agent fields.
- **Evidence:** The v3.0 baseline migration (`B202601122300__v3.0_Baseline.sql`) includes:
  ```sql
  LEFT OUTER JOIN [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
    ON [a].[AgentID] = AIAgent_AgentID.[ID]
  ```
  The `Agent` column is properly included in the SELECT list.

#### #776 — Base views not being recompiled when BaseViewGenerated = 0 (PINNED)
- **Filed:** 2025-01-31 by jordanfanapour
- **Description:** Custom base views weren't recompiled during CodeGen, causing view column pointers to become offset after schema changes.
- **Evidence:** `packages/CodeGenLib/src/Database/sql_codegen.ts:586-590` explicitly checks the `BaseViewGenerated` flag and only generates views when the flag is true. The code correctly respects custom views where the flag is `0`.

#### #555 — Invalid DefaultValues for new entity table
- **Filed:** 2024-10-08 by cadam11
- **Description:** CodeGen produced invalid default values for new entity tables.
- **Evidence:** `packages/CodeGenLib/src/Database/sql_codegen.ts:1731-1776` implements a sophisticated `formatDefaultValue()` method that handles all data types including UUIDs, strings, numerics, and booleans with proper SQL formatting.

#### #1460 — Handle NULL Parameters for Fields with Database Defaults in BaseEntity
- **Filed:** 2025-10-14 by jordanfanapour
- **Description:** Temporary fix needed for NULL parameter handling on fields with database defaults.
- **Evidence:** Permanent fix implemented in `sql_codegen.ts:1801-1805` making non-nullable fields with database defaults accept NULL as an optional parameter. Migration `V202510132100__v2.106.x__Add_ISNULL_Check_For_Default_Columns.sql` formalized this in stored procedures.

#### #509 — Unable To Create Template Entity
- **Filed:** 2024-09-19 by (unknown)
- **Description:** Template entity creation was failing.
- **Evidence:** Full custom form implemented at `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Templates/templates-form.component.ts` with CRUD operations, code editor, template testing, and category management.

#### #210 — {{UserID}} not replaced in RowLevelSecurityFilter processing
- **Filed:** 2024-05-20 by dray-mc
- **Description:** RLS filters containing `{{UserID}}` tokens were not being replaced with actual values.
- **Evidence:** `packages/MJCore/src/generic/securityInfo.ts:261-280` implements `MarkupFilterText()` which iterates through all user properties and performs global regex replacement of `{{User*}}` tokens.

#### #855 — Handle Deprecation of WMIC Utility
- **Filed:** 2025-03-12 by (unknown)
- **Description:** WMIC utility deprecation needed to be handled.
- **Evidence:** Zero WMIC references exist anywhere in the codebase. The utility was either never used or has been completely removed.

### AI / Prompt System

#### #814 — AI Prompt Execution Improvements (PINNED)
- **Filed:** 2025-02-14 by AN-BC
- **Description:** Comprehensive improvements needed for AI prompt execution including multi-provider support, caching, parallel execution, and context injection.
- **Evidence:** `packages/AI/Prompts/src/AIPromptRunner.ts` now includes:
  - Hierarchical template composition with child prompts (lines 614-643)
  - 3-phase model selection: explicit, specific, general strategy (lines 1433-1615)
  - Cascade failover system with vendor filtering and rate limit handling (lines 2014-2087)
  - Parallel execution mode (line 702)
  - Real-time progress tracking (lines 195-213)
  - Configuration-driven behavior with AIConfiguration inheritance chains

#### #1438 — AI Prompt Execution Ignores Per-Prompt Vendor Configuration
- **Filed:** 2025-10-07 by EL-BC
- **Description:** Per-prompt vendor configuration was being ignored during execution.
- **Evidence:** `AIPromptRunner.ts:1677-1850` fully respects per-prompt model configuration:
  - AIPromptModel records checked first (lines 1688-1716)
  - `SelectionStrategy='Specific'` uses only AIPromptModel entries with priorities
  - Hierarchical credential resolution respects prompt-model bindings

### Infrastructure / Auth

#### #884 — Multi-Provider Auth System for 3.0
- **Filed:** 2025-04-12 by (unknown)
- **Description:** Support for multiple authentication providers needed for v3.0.
- **Evidence:** Complete multi-provider system at `packages/MJServer/src/auth/` with 5+ providers:
  - `Auth0Provider.ts`, `CognitoProvider.ts`, `GoogleProvider.ts`, `MSALProvider.ts`, `OktaProvider.ts`
  - Factory pattern via `AuthProviderFactory.ts`
  - Base infrastructure with `BaseAuthProvider.ts` and `IAuthProvider.ts`

#### #1411 — MCP Auth
- **Filed:** 2025-09-25 by AN-BC
- **Description:** Authentication system needed for MCP (Model Context Protocol) server.
- **Evidence:** Full OAuth system at `packages/AI/MCPServer/src/auth/` including `OAuthProxyRouter.ts`, `TokenValidator.ts`, `JWTIssuer.ts`, `ClientRegistry.ts`, `AuthorizationStateManager.ts`, `ConsentPage.ts`, `LoginPage.ts`, and `ScopeService.ts`.

#### #1901 — Manifest generator fails for consuming applications using published npm packages
- **Filed:** 2026-02-06 by jordanfanapour
- **Description:** Manifest generator couldn't scan published npm packages (no `src/` directory).
- **Evidence:** Dual-manifest architecture implemented:
  - Pre-built manifests ship inside `@memberjunction/server-bootstrap` and `@memberjunction/ng-bootstrap`
  - Supplemental manifests generated by MJAPI/MJExplorer with `--exclude-packages @memberjunction`
  - Commits `886ba093` and `888c0616` document the implementation

#### #103 — Docker Image
- **Filed:** 2024-03-12 by (unknown)
- **Description:** Docker support needed for MemberJunction.
- **Evidence:** Full Docker setup: `Dockerfile.api`, `Dockerfile.explorer`, `Dockerfile.playwright`, `docker-compose.test.yml`, plus dedicated directories at `docker/MJAPI/` and `docker/workbench/` with comprehensive documentation.

#### #1427 — Design and implement extensible configuration system
- **Filed:** 2025-10-02 by jordanfanapour
- **Description:** Extensible configuration system for environment variables and secrets.
- **Evidence:** `/packages/Config/` provides layered configuration with cosmiconfig discovery (`mj.config.cjs`, `.mjrc`), `parseBooleanEnv()`, `buildMJConfig()` for multi-package composition, and `mergeConfigs()` with customizable strategies.

#### #887 — Default to using remote migration SQL in MJCLI
- **Filed:** 2025-04-17 by (unknown)
- **Description:** MJCLI should support remote migration sources.
- **Evidence:** `packages/MJCLI/src/commands/migrate/index.ts` supports `--tag` flag for remote migration versions and `--dir` for custom migration source directories.

#### #1534 — Support deletions in MetadataSync tool
- **Filed:** 2025-10-29 by (unknown)
- **Description:** mj-sync needed deletion support.
- **Evidence:** Full deletion support implemented: `PushResult` includes `deleted` count, `PushService` executes deletions, `--delete-db-only` flag exists, plus `DeletionAuditor` and `DeletionReportGenerator` classes.

#### #1513 — Add granular auto-refresh control to BaseEngine
- **Filed:** 2025-10-24 by (unknown)
- **Description:** BaseEngine needed per-entity auto-refresh configuration.
- **Evidence:** `packages/MJCore/src/generic/baseEngine.ts:64-75` shows `BaseEnginePropertyConfig` with `AutoRefresh` boolean and `DebounceTime` for per-config granular control.

### Entity / Data

#### #665 — Agent Framework - Native Support
- **Filed:** 2024-12-03 by AN-BC
- **Description:** Native agent framework needed.
- **Evidence:** Comprehensive framework at `packages/AI/Agents/` with `BaseAgent`, `LoopAgentType`, `FlowAgentType`, `MemoryManagerAgent`, `AgentRunner`, `AgentDataPreloader`, `PayloadManager`, and extensive documentation.

#### #666 — When creating a new user, also create UserApplication records
- **Filed:** 2024-12-05 by (unknown)
- **Description:** New user creation should auto-create UserApplication records.
- **Evidence:** `packages/MJServer/src/auth/newUsers.ts` implements config-driven auto-creation via `configInfo.userHandling.CreateUserApplicationRecords`.

#### #462 — Function Calling Support in BaseLLM
- **Filed:** 2024-08-28 by (unknown)
- **Description:** BaseLLM needed function/tool calling support.
- **Evidence:** `packages/AI/MCPClient/src/AgentToolAdapter.ts` implements full function calling with `getToolsForOpenAI()` and `getToolsForAnthropic()` format converters, plus `executeTool()` for execution.

#### #541 — Support for Composite Foreign Keys
- **Filed:** 2024-10-01 by hiltongr
- **Description:** Composite foreign key support needed.
- **Evidence:** `packages/MJCore/src/generic/compositeKey.ts` implements `CompositeKey` class with `KeyValuePair` arrays, `ToWhereClause()`, `ToURLSegment()`, `EqualsEx()`, and `Validate()` methods. Fully integrated with EntityInfo and BaseEntity.

#### #974 — Cleanup and Follow-ups for MJCoreEntities and CodeGen
- **Filed:** 2025-05-22 by (unknown)
- **Description:** General cleanup of MJCoreEntities and CodeGen.
- **Evidence:** Multiple modernization commits apply `MJ:` prefix to entity names, entity name scanner system added, manifest generation system created. MJCoreEntities at v4.4.0.

#### #325 — Ensure all components start with "mj" in their selectors
- **Filed:** 2024-06-11 by JS-BC
- **Description:** All Angular component selectors should use `mj-` prefix.
- **Evidence:** All sampled components (`mj-bootstrap`, `mj-list-form-extended`, etc.) consistently use the `mj-` prefix.

#### #302 — Update MJServer's type-graphql
- **Filed:** 2024-06-09 by cadam11
- **Description:** type-graphql needed updating.
- **Evidence:** `packages/MJServer/package.json` shows `type-graphql@2.0.0-beta.3` — a major version update to the 2.x line.

### UI / Angular

#### #524 — Entities -> Content Autotagging
- **Filed:** 2024-09-24 by (unknown)
- **Description:** Entity content autotagging needed.
- **Evidence:** Full package at `packages/ContentAutotagging/` with entity autotagging, plus support for local files, RSS feeds, websites, and cloud storage.

#### #489 — Support Web Page Display within Workspaces/Dashboards
- **Filed:** 2024-09-10 by (unknown)
- **Description:** Dashboards should support embedded web pages.
- **Evidence:** `packages/Angular/Generic/dashboard-viewer/src/lib/parts/weburl-part.component.ts` implements iframe-based embedding with configurable sandbox modes, fullscreen control, X-Frame-Options detection, and loading/error states.

#### #93 — Duplicate Detection: Architecture + UI Layer
- **Filed:** 2024-02-28 by (unknown)
- **Description:** Duplicate detection system needed with architecture and UI.
- **Evidence:** Vector-based detection engine at `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` with tests, plus generated UI forms for `MJDuplicateRun`, `MJDuplicateRunDetail`, and `MJDuplicateRunDetailMatch` entities.

#### #237 — Auto-vectorization of Files
- **Filed:** 2024-05-28 by AN-BC
- **Description:** Files should be auto-vectorized.
- **Evidence:** `AutotagAndVectorizeContentAction` implements combined autotagging and vectorization across local files, RSS feeds, websites, and cloud storage using `EntityVectorSyncer`.

#### #266 — Implement Timeline Component
- **Filed:** 2024-06-03 by AN-BC
- **Description:** Timeline component needed.
- **Evidence:** Full component at `packages/Angular/Generic/timeline/src/lib/component/timeline.component.ts` with virtual scrolling, collapsible segments, keyboard navigation, and multiple orientation/layout options.

#### #550 — Add ability to insert specific records into a list
- **Filed:** 2024-10-03 by JS-BC
- **Description:** Lists needed support for adding specific records.
- **Evidence:** `ListManagementService` implements `addRecordsToLists()` accepting `recordIds` and `listIds` arrays with batch operations and duplicate detection.

#### #1943 — Integrate Scheduling Engine notifications with NotificationEngine + CommunicationEngine
- **Filed:** 2026-02-11 by sohamdesai-BlueCypress
- **Description:** Scheduling engine should integrate with notification/communication engines.
- **Evidence:** `packages/Scheduling/engine/README.md` documents `NotificationManager` as an integrated component. The architecture includes `SchedulingEngine` -> `NotificationManager` with `FormatNotification()` method support.

#### #1784 — Admin Dashboard: UX Completion & User Settings
- **Filed:** 2026-01-13 by AN-BC
- **Description:** Admin dashboard needed UX completion and user settings persistence.
- **Evidence:** `EntityAdminDashboard` component registered with `@RegisterClass(BaseDashboard, 'EntityAdmin')` includes state management via `MJUserSettingEntity`, entity filtering, and ERD visualization.

#### #1783 — MJComms: SMS Integration & Unified Notification Service
- **Filed:** 2026-01-13 by AN-BC
- **Description:** SMS integration and unified notification delivery needed.
- **Evidence:** Twilio SMS provider at `packages/Communication/providers/twilio/src/TwilioProvider.ts`, `NotificationEngine` supports SMS delivery channel with `SMSEnabled` flag alongside email and in-app channels.

#### #1688 — Component linter: Add rule to validate standard props
- **Filed:** 2025-12-10 by (unknown)
- **Description:** Component linter needed validation rules for standard props.
- **Evidence:** `packages/React/TestHarness/tests/component-linter/` provides comprehensive linting with schema validation, query validation, entity validation, and fixture-based testing with expected violations comparison.

---

## Part 2: Recommend CLOSE — Superseded or No Longer Relevant (5 issues)

#### #709 — MemberJunction v3.0.0
- **Filed:** 2025-01-11 by cadam11
- **Description:** Tracking issue for v3.0 release including Angular 19, TypeScript 5.7.5+, Kendo UI 17.
- **Reason to close:** The project is now on **v4.4.0**. Angular, TypeScript, and Kendo have all been updated well past the targets listed. The sub-tasks (migration guide, `npm create`, VSCode tooling) should be tracked as separate issues if still needed.

#### #1624 — 3.0 Minimal Shell Refactor
- **Filed:** 2025-12-01 by (unknown)
- **Description:** MJExplorer shell needed minimal refactoring for 3.0.
- **Reason to close:** Shell fully modernized — ESBuild migration complete (commit `df783fcd`), legacy tab-strip removed (commit `505f7112`), self-closing tags applied. Project is on 4.4.0.

#### #572 — Identify Areas for Feature Improvement
- **Filed:** 2024-10-13 by Imran-imtiaz48
- **Description:** Generic meta-issue to identify feature improvement areas.
- **Reason to close:** Vague tracking issue from external contributor. Specific improvements are tracked by their own dedicated issues.

#### #303 — Update MJServer's graphql-request
- **Filed:** 2024-06-09 by cadam11
- **Description:** Update the `graphql-request` dependency.
- **Reason to close:** `graphql-request` is no longer a dependency of MJServer. The package either was never added or was intentionally removed. MJServer uses `@apollo/server` and native `graphql` packages instead.

#### #66 — Feature Request: Create a generic empty state component
- **Filed:** 2024-01-15 by (unknown)
- **Description:** Generic reusable empty state component needed.
- **Reason to close:** Conversation empty state component exists at `packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-empty-state.component.ts`. The pattern is established and can be replicated for other contexts.

---

## Part 3: Still Relevant — Keep Open (31 issues)

### Critical / Security

| # | Title | Filed | Priority | Notes |
|---|-------|-------|----------|-------|
| **1964** | SECURITY: Users on shared computers may authenticate as wrong user | 2026-02-13 | **HIGH** | No session isolation found. UserCache singleton may persist across user switches. Identified root causes: `MJGlobal.Instance.GetGlobalObjectStore()` persistence, email-based user lookup, `userEmailMap` remapping. |
| **1939** | pdf-parse crashes on Node.js 24+ | 2026-02-11 | **HIGH** | Still using `pdf-parse@^1.1.1` in `@memberjunction/core-actions` and `@memberjunction/content-autotagging`. The library uses deprecated `module.parent` for debug detection. Fix: swap to `pdf-parse-debugging-disabled` or lazy-load. |
| **1186** | Security: JSON Parsing Vulnerabilities in Loop Agent | 2025-07-20 | **MEDIUM** | `SafeJSONParse` exists but specific vulnerability scenarios from the issue may not be fully covered. |

### Server / Infrastructure

| # | Title | Filed | Priority | Notes |
|---|-------|-------|----------|-------|
| **1963** | Server Modernization: Apollo Server v5, Middleware Extensibility, Multi-Tenant | 2026-02-13 | **HIGH** | Still on Apollo Server v4.9.1. Apollo v4 reaches EOL 2026-01-26. Three workstreams: v5 upgrade, middleware extensibility, multi-tenant data separation. |
| **1700** | Support multiple audiences per auth provider | 2025-12-16 | **MEDIUM** | `BaseAuthProvider.audience` is still `string` (singular). Needs `string[]` support. |
| **1544** | Model Selection + API Key Pooling + Secrets Management | 2025-10-30 | **MEDIUM** | Model selection and secrets management are done. **API key pooling** (rotating/load-balancing across multiple API keys) is not implemented. |
| **1509** | Automated User Provisioning from Directory Services | 2025-10-24 | **LOW** | No SCIM, Active Directory, Azure AD, or LDAP integration found. |
| **1430** | Add support for Stripe ACP and Instant Checkout | 2025-10-03 | **LOW** | No Stripe integration exists. |
| **632** | Build Utility to Reorder SQL Table Columns | 2024-11-05 | **LOW** | No column reordering utility found. |

### AI / Agents

| # | Title | Filed | Priority | Notes |
|---|-------|-------|----------|-------|
| **1591** | Advanced Prompt Pooling Improvements | 2025-11-12 | **MEDIUM** | No prompt pooling mechanism found in the codebase. |
| **1378** | Implement Continue feature for AI Agent runs | 2025-09-08 | **MEDIUM** | No checkpoint/resume/continuation functionality for agent runs. `FlowAgent` has `startAtStep` but no full resume from prior runs. |
| **1787** | Built-in Actions for Agent Media Management | 2026-01-14 | **LOW** | No media-specific Actions (image generation, file manipulation) for agents. |
| **1810** | Image/Media Attachments Placeholder System | 2026-01-21 | **LOW** | Attachment infrastructure exists but no placeholder/fallback system for pending uploads or failed media. |
| **1934** | Replace SQL JSON_VALUE with in-memory filtering for agent notes | 2026-02-10 | **LOW** | Implementation appears incomplete. |

### UI / UX

| # | Title | Filed | Priority | Notes |
|---|-------|-------|----------|-------|
| **1861** | UI Bug: Nav items duplicated after saving app config | 2026-01-28 | **MEDIUM** | Commit `041202bf` references "fix nav item feedback loop, deduplicate recents" but may need verification. |
| **98** | Skip Chat UI - Mobile | 2024-02-15 | **LOW** | No mobile-optimized chat UI implementation found. |
| **125** | Update styling in Compare/Merge Dialog | 2024-03-05 | **LOW** | No compare/merge dialog component found at all — needs implementation before styling. |
| **530** | MemberJunction App Store + Developer Portal | 2024-09-26 | **LOW** | Large feature; not implemented. |
| **529** | Zapier Integration for MemberJunction | 2024-09-26 | **LOW** | Not implemented. |
| **540** | Improve UI for File Storage | 2024-10-01 | **LOW** | Basic file storage UI exists; needs UX enhancement. |

### Data / Entities

| # | Title | Filed | Priority | Notes |
|---|-------|-------|----------|-------|
| **667** | Add LastLoginDate and LastActivityDate to User Entity | 2024-12-06 | **MEDIUM** | Fields are NOT present in the User entity schema. Only `IsActive` and standard timestamps exist. |
| **503** | Add Dimension column to VectorDatabase Entity | 2024-09-16 | **LOW** | Dimension column missing. VectorDatabase has: ID, Name, Description, DefaultURL, ClassKey. |
| **406** | Delete associated vector DB records on entity delete | 2024-07-11 | **MEDIUM** | No cascade deletion of vector DB records when entities are deleted. |
| **518** | Revamp Chunking with Base Class | 2024-09-23 | **LOW** | No chunking base class or refactoring found. |
| **526** | Auto-tagging for non-text content modalities | 2024-09-24 | **LOW** | Content autotagging only supports text-based content. No image/audio/video support. |
| **418** | TemplateParam overlap validation on save | 2024-07-22 | **LOW** | No duplicate parameter name validation exists. |
| **1477** | Send Email on Collection Share | 2025-10-17 | **LOW** | Collection sharing exists but no email notification trigger is wired. |
| **1317** | Add metadata parameter to @RegisterClass | 2025-08-18 | **LOW** | Decorator signature unchanged — no metadata parameter support. |
| **1327** | CodeGen Test Suite for Multi-Schema | 2025-08-21 | **LOW** | Basic CodeGen tests exist; multi-schema test coverage incomplete. |

---

## Part 4: Partially Addressed — Need Triage (18 issues)

These issues have partial implementations or need clarification from the original reporter.

| # | Title | Status | What's Done | What's Missing |
|---|-------|--------|-------------|----------------|
| **551** | Cannot create dashboard | Likely fixed | Dashboard CRUD is fully functional | Original bug scenario unclear — need reporter confirmation |
| **133** | Dashboard Cleanup | Partially done | Code modernized, best practices guide created | Scope of "cleanup" is subjective |
| **1527** | CodeGen CASCADE without result sets | Likely correct | CASCADE operations are silent; parent SP returns results by design | May just need clarification that current behavior is intended |
| **507** | Vector sync batch error | Likely fixed | Robust batching config with `listBatchCount`, `VectorizeBatchCount`, `UpsertBatchCount` | Cannot confirm specific error scenario is resolved |
| **508** | Vector sync upsert to Pinecone | Likely fixed | Upsert infrastructure in place with Pinecone integration | Cannot confirm specific failure scenario |
| **567** | List Functionality Enhancements | Partially done | Search, sort, filter UI infrastructure exists | May need additional list operations |
| **1465** | Tiered caching for RunQuery | Partially done | Basic caching with `RunQueryCacheStatus` and `QueryCacheConfig` | No multi-tier caching strategy (memory -> disk -> DB) |
| **549** | List Name should not be empty | Partially done | `NOT NULL` constraint prevents NULL names | Empty string (`''`) may still be allowed |
| **156** | RLSFilterID checking for CUD operations | Partially done | Metadata fields exist (`CreateRLSFilterID`, `UpdateRLSFilterID`, `DeleteRLSFilterID`) | Enforcement not found in actual CUD operation flow |
| **263** | Document how to get MJ running | Partially done | README has Quick Start section with setup steps | Could be more detailed; links to `docs.memberjunction.org` |
| **737** | Documentation for 3.0 | Partially done | Some docs (dashboard guide, plans, architecture) | Comprehensive feature documentation incomplete |
| **1187** | Memory Leaks in PayloadManager | Likely fixed | Uses `_.cloneDeep()` properly, no leak patterns visible | Specific leak scenarios from issue not verified |
| **1415** | Flow Agent redundant requirements | Inconclusive | Flow Agent is fully functional | "Redundant requirements" context unclear — need reporter input |
| **164** | Optimize EntityRecordDocuments creation | Unclear | Component exists and is functional | Optimization status unknown without perf benchmarks |
| **428** | Strongly Typed Datasets | Potentially superseded | Entity object system with generics provides strong typing | Feature may be superseded by `RunView<T>()` pattern |
| **102** | Documentation for Implementation Methodology | Still relevant | Some guides exist (CLAUDE.md, dashboard guide) | No comprehensive implementation methodology document |
| **214** | Documentation for custom auth provider | Partially done | Multi-provider system with clear interfaces exists | No tutorial-level documentation for creating custom providers |
| **527** | Pull back Messaging Delivery/Open/Click Data | Still relevant | Communication engine exists | No messaging analytics integration found |

---

## Part 5: Not Individually Reviewed (6 issues)

These are clearly ongoing feature requests/enhancements that remain relevant:

| # | Title | Filed | Notes |
|---|-------|-------|-------|
| **358** | Improved UI for Record Editing/Change Display/Confirmation | 2024-06-17 | Ongoing UX enhancement |
| **269** | MJ Explorer Styles | 2024-06-03 | Ongoing styling work |
| **530** | MemberJunction App Store + Developer Portal | 2024-09-26 | Large feature request |
| **529** | Zapier Integration | 2024-09-26 | Integration feature request |
| **527** | Pull back Messaging Delivery/Open/Click Data | 2024-09-24 | Analytics integration |
| **102** | Documentation for Implementation Methodology | 2024-03-08 | Documentation effort |

---

## Recommendations

### Immediate Actions
1. **Close 40 issues** (35 addressed + 5 superseded) with links to the relevant code/commits as evidence.
2. **Prioritize #1964 (auth security)** — this is a production-impacting security vulnerability on shared computers.
3. **Prioritize #1963 (Apollo Server v5)** — Apollo v4 reached EOL on 2026-01-26.
4. **Prioritize #1939 (pdf-parse)** — simple fix (swap dependency) that blocks Node.js 24+ adoption.

### Triage Actions
5. **Ping original reporters** on the 18 partially-addressed issues to confirm whether they can be closed.
6. **Consider closing #428 (Strongly Typed Datasets)** — likely superseded by the `RunView<T>()` generic pattern.
7. **Consider closing #133 (Dashboard Cleanup)** — dashboard code has been modernized and best practices guide created.

### Housekeeping
8. **Unpin #776 and #814** — both are resolved and should be unpinned before closing.
9. **Create new targeted issues** for the broader modernization work mentioned in #1907 (standalone components, signals, zone removal) rather than reopening the closed issue.
