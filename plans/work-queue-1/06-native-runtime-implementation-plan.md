# Work Queue — Native Runtime & Server Implementation Plan (Phase 1, plan 06)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run work-queue subscriptions inside MJ servers and operate them — handler binding, the `WorkQueueHost` (long-running and one-shot container-job modes), the sweeper, the seven operator Remote Operations, MJServer wiring, the REST publish Server Extension, `mj queue` CLI commands, bootstrap manifests and the deterministic integration bundle — on top of the core (plan 04) and the Database data layer (plan 05). Revision 4 ([11](11-revision-4-review.md)) applies: no explicit sequences, `Ordered` on the Database transport only, cancel acknowledged by the holder (F2), operator authorization (F7), independent executors (F8), no cross-package re-exports (F13).

**Architecture:** Metadata is split across two tiers (03 §0, §11): `WorkQueueEngineBase` (browser-safe
`@memberjunction/work-queue-base`, plan 05) caches Transports/Topics/Subscriptions and builds bindings and policies for
any tier, and the server `WorkQueueEngine` delegates to it — composition, mirroring `AIEngine`/`AIEngineBase` — while
adding drivers, publishing and the operator. Everything in this plan talks to the **server** engine (directly or
through the `WorkQueueHostEngine` structural subset). Neither package re-exports the other's symbols (F13): a file
that needs a base symbol imports `@memberjunction/work-queue-base` itself.
`WorkQueueHost` (engine package) plans which subscriptions this instance may run (host type, status, capability gating via `SubscriptionUnsupportedReason(binding, capabilities)`, handler presence), starts one `ConsumerRuntime` per runnable subscription over its transport's consumer — each consumer owns an independent executor and is closed by the host — and re-plans on a timer so pausing, adding or changing a subscription takes effect without a restart. `Start`, `Reconcile` and `Shutdown` are serialized; `Shutdown()` is one shared promise. `WorkQueueSweeper` runs set-based maintenance on the database clock, one instance at a time under a database application lock, and raises the dead letters it produces through `engine.NotifyDeadLettered`. Operators use Remote Operations (Explorer/GraphQL/CLI), each of which overrides `Authorize` with entity-permission checks; REST is publish-only, API-key-only, and lives in the new `@memberjunction/work-queue-server` Server Extension (post-auth, authorization before body parsing). MJServer starts the host after `listen()` when `workQueue.enabled` is set; the host self-registers with `ShutdownRegistry`. The same host also runs **one-shot**: `RunOnce()` budgets deliveries **received**, exits only when nothing is pending or in flight, drains and resolves, so `mj queue work --once` is a container-job entrypoint that scales from the `WorkQueue.GetBacklog` metric (02 §4.4a).

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, `@memberjunction/work-queue-core` (plan 04), `@memberjunction/work-queue-base` + `@memberjunction/work-queue-engine` (plan 05), MJ core/global/core-entities/sql-dialect/api-keys, `@memberjunction/server-extensions-core`, Express 5, zod 3 (MJServer config), oclif 3 (MJCLI), MJ CodeGen + mj-sync, `@memberjunction/testing-integration`.

**Spec:** [`03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative — §3, §5, §7, §8, §9, §10, §11), [`02-implementation-overview.md`](02-implementation-overview.md), [`README.md`](README.md). Plans [04](04-core-implementation-plan.md) and [05](05-native-data-implementation-plan.md) must be complete. Read 03 before starting.

## Global Constraints

- **Package manager:** pnpm. `pnpm install` at the repository root only — never inside a package, never `npm install`.
- **Per-package commands:** `cd packages/<Path> && pnpm test` and `cd packages/<Path> && pnpm run build`. Do not build single packages with turbo from the root.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the version in `packages/MJCore/package.json` (`6.1.0` when this plan was written).
- **New package shape** (`packages/WorkQueue/server`): `"type": "module"`, build `tsc && tsc-alias -f`, `tsconfig.json` extends `../../../tsconfig.server.json`, `vitest.config.ts` merges `../../../vitest.shared`, tests in `src/__tests__/*.test.ts`, extensionless relative imports (MJServer and MJCLI keep their existing `.js`-suffixed relative imports).
- **Dependency rule (03 §0):** `@memberjunction/work-queue-core` and `@memberjunction/work-queue-aws` gain **no** `@memberjunction/*` dependencies from this plan, and **nothing server-only ever moves into `@memberjunction/work-queue-base`** — no drivers, no SQL executor, no host, no Express, no `@memberjunction/server*`. Base stays importable by Explorer. Everything here lives in `work-queue-engine`, `work-queue-server`, `MJServer`, `MJCLI`, the bootstrap packages and the integration suite.
- **Metadata:** primary keys are the `uuidgen` values written into the tasks; never add `sync` blocks by hand, and **never commit the `sync` stamps `mj sync push` writes back** — after every push, remove the `"sync": { … }` objects it added and restore files whose only diff is a `sync` change (`migrations/CLAUDE.md`). Push only this plan's files with `--include`, then regenerate with `pnpm exec mj codegen --skipdb`.
- **One database per agent.** Before `mj sync push` or `mj codegen`, confirm no other session uses the `DB_DATABASE` in your `.env`.
- **No cross-package re-exports (F13):** `work-queue-engine` does not re-export `work-queue-base` or `work-queue-core` symbols, and `work-queue-server` re-exports neither. Import each symbol from the package that defines it, and declare that package in `package.json`.
- **Queue SQL never rides an ambient transaction (F8):** consumers, the operator and the sweeper each use an independent executor and release it; nothing here passes a request-scoped provider's transaction to the queue.
- **Code rules:** no `any`; `unknown` only at trust boundaries (request bodies, parsed JSON) and narrowed immediately; `as unknown as` only in test fakes; compare UUIDs with `UUIDsEqual`; pass `contextUser` to every data call; static imports only; PascalCase public members; functions around 30–40 lines.
- **SQL rules:** identifiers through `QuoteIdentifier`; guarded/counted DML wrapped by `Dialect.AffectedRowCountSQL(sql, 'AffectedRows')`; database clock only (`SYSDATETIMEOFFSET()` / `now()`); no stored procedures.
- **Commits:** commit steps are executed **only when the user has approved commits for this execution session** (repo rule). Work on branch `feat/work-queue` tracking `origin/feat/work-queue`.
- **Changesets:** use the single bump level plan 05 established for the branch; never add a second `minor`.
- **Definition of Done:** every touched package's `pnpm test` passes **and** `pnpm run test:integration` (deterministic tier) passes, including bundle IT94 from Task 12. Report pass/fail/skip counts.

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | Handler binding | `BaseWorkHandler`, `ResolveWorkHandler`, `BoundWorkHandler`, `WorkQueueProviderSource` — tested |
| 2 | Subscription planner | `PlanHostedSubscriptions` with capability gating, `IsWorkHandlerRegistered` — tested |
| 3 | `WorkQueueHost` | Serialized start/reconcile/shutdown, shared `Shutdown()` promise, consumers closed, kick, health, sweeper timer — tested |
| 3b | `WorkQueueHost.RunOnce` | One-shot mode for container jobs: budget on deliveries **received**, exit only when idle — tested against the real `ConsumerRuntime` |
| 4 | `WorkQueueSweeper` | `ExpireLeases`, `PurgeRetention`, `PurgeDeduplications` under the sweep lock; dead letters raised through `engine.NotifyDeadLettered` — tested |
| 5 | Remote-operation metadata | Category, 7 operations, 14 type files; CodeGen bases generated |
| 6 | Operator service and server operations | `WorkQueueOperatorService`, `AuthorizeWorkQueueOperator`, 7 `@RegisterClass` server operations with `Authorize` overrides and input bounds — tested |
| 7 | MJServer configuration and host startup | `workQueue` config section (documented defaults), `StartWorkQueueHost`, provider source, `serve()` wiring — tested |
| 8 | `@memberjunction/work-queue-server` scaffold and request handling helpers | Package builds; settings, topic-name check, body-error mapping over core's `ParseRestPublishBody`/`ToRestPublishResult` — tested |
| 9 | Publish handler, scope authorizer and Server Extension | `POST {root}/topics/{topic}/messages`: API-key only, resolver-parity scope check, authorization before body parsing — tested |
| 10 | `mj queue` CLI commands | 10 commands (including `backlog` and the container-job worker with signal handling and exit codes) + formatting helpers — tested |
| 11 | Bootstrap dependencies, manifests and full build | Registrations in `ServerBootstrap`/`ServerBootstrapLite`; CLI smoke test; `pnpm run build` green |
| 12 | Integration bundle `work-queue-runtime` (IT94) | 19 checks (Database conformance run, cancel, save guard, `RunOnce`, REST router) pass against a live database |
| 13 | READMEs and operator runbook | Engine + server READMEs, container-job/KEDA recipe, runbooks, soak test |

## Pre-flight

- [ ] You are on `feat/work-queue` and `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] Plans 04 and 05 are merged into the branch: `cd packages/WorkQueue/core && pnpm test`, `cd packages/WorkQueue/base && pnpm test` and `cd packages/WorkQueue/engine && pnpm test` pass; `pnpm-workspace.yaml` lists `packages/WorkQueue/*`.
- [ ] Plan 05's migration, CodeGen and metadata are applied to **your** database: `grep -c "class MJWorkQueueSubscriptionEntity" packages/MJCoreEntities/src/generated/entities/__mj.ts` prints `1`, and `grep -l "workqueue:operate" metadata/api-scopes/.*.json` finds the scope file.
- [ ] The names this plan consumes from plans 04 and 05 exist (see "Consumed surface" below). If any differs, stop and reconcile against 03 before Task 1.
- [ ] `pnpm install` at the root; `cd packages/MJServer && pnpm test` passes (baseline).

### Consumed surface (from plans 04 and 05)

| Package | Names |
| --- | --- |
| `@memberjunction/work-queue-core` (plan 04) | `WorkJson`, `WorkMessage`, `WorkPayloadRef`, `WorkContext`, `WorkAbortReason`, `WorkHandler`, `WorkOutcome`, `Outcome`, `WorkLogger`, `NULL_WORK_LOGGER`, `WorkProgress`, `ConsumerRuntime`, `ConsumerRuntimeOptions`, `SubscriptionPolicy`, `SubscriptionBinding`, `TopicBinding`, `ReceivedDelivery`, `SettleResult`, `LeaseExtension` (`'Held' \| 'Lost' \| 'Cancelled'`), `ITransportDriver`, `ITransportConsumer` (including `AcknowledgeCancel`), `ITransportOperator`, `TransportCapabilities`, `SubscriptionUnsupportedReason(binding, capabilities)`, `BindingValidationIssue`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionCondition` (`'Idle' \| 'InFlight' \| 'Blocked'`), `PartitionStateRecord`, `Page`, `OperatorResult`, `PublishRequest`, `PublishResult`, `PublishError`, `TopologyManifest`, `BindingImport`, `WorkQueueConfigurationError`; the REST mapping `ParseRestPublishBody`, `ToRestPublishResult`, `RestPublishResponseJson` (03 §9 — this plan does not re-implement it); subpath `@memberjunction/work-queue-core/testing` (plan 04 Task 8): `ConformanceHarness`, `ConformanceTraits`, `RunConformanceChecks(harness): Promise<ConformanceCheckResult[]>` with `ConformanceCheckResult { Id; Title; Status: 'Passed' \| 'Failed' \| 'Skipped'; Detail: string \| null; DurationMs }` (Vitest-free; used by IT94 WR14). Plan 04's `ConsumerRuntime.Stop()` does **not** close its consumer — the host does (Task 3) |
| `@memberjunction/work-queue-engine` (plan 05) | `WorkQueueSqlExecutor`, `WorkQueueExecutorSource`, `SqlStatement`, `SqlParam` (`src/sql/WorkQueueSqlExecutor.ts`); `ExecuteWrite` and `ExecuteRows<T>` (`src/sql/sqlExecution.ts`); `CreateWorkQueueSqlBuilder(context)` and the operator's sweeper statements `ExpireLeasesAll()` (**returns only the rows it dead-lettered, on both dialects**), `PurgeTerminalDeliveries(batchSize)`, `PurgeOrphanMessages(batchSize)`; `ExpiredDeadLetterRow { DeliveryID; SubscriptionID; PartitionKey: string \| null }` (`src/sql/rows.ts`); the sweep lock `TryAcquireSweepLock(source, contextUser): Promise<SweepLock \| null>` (`src/sql/sweepLock.ts`, F9); `DeduplicationLedger` with `constructor(executor, contextUser)` and `PurgeExpired(batchSize?, maxBatches?)`; `TransportDriverDeps` and `DeadLetteredEvent { SubscriptionName; DeliveryID; Reason; PartitionKey: string \| null }` (`src/transports/TransportDriverDeps.ts`); `DatabaseTransportDriver` (one instance per engine), `BaseTransportDriverFactory`, `DatabaseTransportDriverFactory`; `MJWorkLogger` — `constructor(prefix = '[WorkQueue]')`; `WorkQueueEngine` — the 03 §11 surface: `Config`, the proxied metadata members, `GetDriver(transportID)`, `PublishAs`, `GetBacklog(subscriptionName): Promise<{ Supported; Claimable; InFlight; Total; Capped }>`, `OnDeadLettered(listener): () => void`, **public** `NotifyDeadLettered(event)` (F13), plus `OnPublished(listener: (topicName: string) => void): () => void`; `WorkQueuePublishOptions { ContextUser; Provider?; External? }`; `ITransportOperator.Discard(...)` returning `{ Supported: true; Changed: boolean; CancelRequested?: boolean }` — an `InFlight` delivery is cancelled by setting `CancelRequestedAt` only (no token rotation, F2); the delivery-state entity save guards (Messages, Deliveries, Deduplications reject `Save()`/`Delete()` with a message containing "transport driver"); `CreateDatabaseConformanceHarness(provider, contextUser, transportID?)`; the SELECT-only scaler login script `scripts/work-queue-scaler-login.sql` and its scaler query; test fake `RecordingExecutor` (`QueueRows`, `QueueError`, `Calls`) in `src/__tests__/fakes.ts`. If any of these is missing when you start, plan 05 has not landed Revision 4 — reconcile against 03 first |
| `@memberjunction/work-queue-base` (plan 05, 03 §0) | `WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase>` — the **browser-safe metadata tier**: `Instance`, `Config`, `Transports`, `Topics`, `Subscriptions`, `GetTopicByName`, `GetSubscriptionByName`, `SubscriptionsForTopic`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `BuildSubscriptionPolicy`, `ParseFilter(subscription, support)`, `ValidateTopologyRows`. The server `WorkQueueEngine` proxies these **members**; it does not re-export base's **types** (F13). Where a file in this plan names a base-only type, it imports `@memberjunction/work-queue-base` directly and the owning package declares the dependency. Task 11 adds the package to the bootstrap manifests |
| `@memberjunction/core` | `BaseRemotableOperation.Authorize(input, user)` (protected; `ExecuteServer` answers `FORBIDDEN` when it returns false), `Metadata.Provider.EntityByName`, `EntityInfo.GetUserPermisions(user)`, `DatabaseProviderBase.CreateIndependentInstance` |
| `@memberjunction/core-entities` | `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`, `MJWorkQueueDeliveryEntity` (CodeGen, plan 05) |
| `@memberjunction/api-keys` | `GetAPIKeyEngine()`, `APIKeyEngine.Authorize(...)` — called as `ResolverBase.CheckAPIKeyScopeAuthorization` calls it (system user, `full_access` fast path, acting context) |
| `metadata/api-scopes` | `workqueue`, `workqueue:publish`, `workqueue:read`, `workqueue:operate` (plan 05) |

## File structure

```
packages/WorkQueue/engine/                                           (plan 05 package)
  src/handlers/BaseWorkHandler.ts · ResolveWorkHandler.ts · BoundWorkHandler.ts   Task 1
  src/host/HostedSubscriptionPlanner.ts                              Task 2
  src/host/WorkQueueHost.ts                                          Task 3, Task 3b (RunBudget, BudgetedConsumer, RunOnce)
  src/host/WorkQueueSweeper.ts                                       Task 3 (stub), Task 4
  src/operations/WorkQueueOperatorService.ts · operatorAuthorization.ts · WorkQueueOperations.ts   Task 6
  src/index.ts                                                       Tasks 1–4, 6 (appended)
  src/__tests__/runtimeFakes.ts                                      Task 1, extended by Tasks 2–4, 6
  src/__tests__/handlers.test.ts                                     Task 1
  src/__tests__/HostedSubscriptionPlanner.test.ts                    Task 2
  src/__tests__/WorkQueueHost.test.ts                                Task 3
  src/__tests__/WorkQueueHostRunOnce.test.ts                         Task 3b
  src/__tests__/WorkQueueSweeper.test.ts                             Task 4
  src/__tests__/WorkQueueOperatorService.test.ts · operatorAuthorization.test.ts · WorkQueueOperations.test.ts   Task 6
  README.md                                                          Task 13

metadata/remote-operation-categories/.work-queue-category.json       Task 5
metadata/remote-operations/.work-queue-operations.json               Task 5
metadata/remote-operations/types/work-queue-*.ts (14 files)          Task 5
packages/MJCoreEntities/src/generated/remote_operations.ts           Task 5 (CodeGen)

packages/MJServer/
  package.json                                                       Task 7
  src/services/workQueueConfig.ts · WorkQueueHostService.ts          Task 7
  src/config.ts · src/index.ts                                       Task 7
  src/__tests__/WorkQueueHostService.test.ts                         Task 7

packages/WorkQueue/server/                                           (new)
  package.json · tsconfig.json · vitest.config.ts · README.md        Tasks 8, 13
  src/index.ts · src/publishRequests.ts                              Task 8
  src/scopeAuthorizer.ts · src/publishHandler.ts · src/router.ts · src/WorkQueueServerExtension.ts   Task 9
  src/__tests__/publishRequests.test.ts                              Task 8
  src/__tests__/publishHandler.test.ts · scopeAuthorizer.test.ts · router.test.ts · WorkQueueServerExtension.test.ts  Task 9

packages/MJCLI/
  package.json · src/utils/open-app-context.ts · src/lib/domain-profiles.ts · src/light-commands.ts   Task 10
  src/lib/work-queue/queue-format.ts · queue-session.ts · queue-worker.ts         Task 10
  src/commands/queue/{index,usage,stats,dead-letters,partitions,replay,discard,backlog,work,export-topology,import-bindings,validate-bindings}.ts   Task 10
  src/__tests__/work-queue-cli.test.ts · work-queue-commands.test.ts · work-queue-worker.test.ts   Task 10

packages/ServerBootstrap/package.json · src/generated/mj-class-registrations.ts           Task 11
packages/ServerBootstrapLite/package.json · src/generated/mj-class-registrations.ts       Task 11

packages/TestingFramework/integration-test-suite/
  package.json · src/index.ts · src/__tests__/check-registry.test.ts Task 12
  src/checks/work-queue-runtime.checks.ts                            Task 12
metadata-optional/integration-test/tests/integration/.IT94-work-queue-runtime.json        Task 12
metadata-optional/integration-test/test-suites/.integration-suite.json                    Task 12
```

---

### Task 1: Handler binding

**Files:**
- Create: `packages/WorkQueue/engine/src/handlers/BaseWorkHandler.ts`, `src/handlers/ResolveWorkHandler.ts`, `src/handlers/BoundWorkHandler.ts`, `src/__tests__/runtimeFakes.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/handlers.test.ts`

**Interfaces:**
- Consumes: `WorkContext`, `WorkHandler`, `WorkJson`, `WorkLogger`, `WorkMessage`, `WorkOutcome`, `Outcome` (plan 04); `UserInfo`, `IMetadataProvider` (`@memberjunction/core`); `MJGlobal` (`@memberjunction/global`).
- Produces:
  - `interface WorkHandlerExecutionContext { ContextUser: UserInfo; Provider: IMetadataProvider }`
  - `abstract class BaseWorkHandler<TPayload extends WorkJson = WorkJson> implements WorkHandler<TPayload>` — `protected ContextUser`, `protected Provider`, `BindExecutionContext(ctx: WorkHandlerExecutionContext): void` (03 §3)
  - `ResolveWorkHandler(handlerKey: string): BaseWorkHandler | null` (03 §3)
  - `interface WorkQueueProviderSource { CreateProvider(): Promise<IMetadataProvider> }`, `class SharedProviderSource implements WorkQueueProviderSource` — `constructor(provider: IMetadataProvider)`
  - `type WorkHandlerResolver = (handlerKey: string) => BaseWorkHandler | null`
  - `class BoundWorkHandler implements WorkHandler` — `constructor(handlerKey: string, contextUser: UserInfo, providers: WorkQueueProviderSource, resolve: WorkHandlerResolver)`
  - Test fakes: `TEST_USER`, `TEST_PROVIDER`, `MakeMessage(overrides?)`, `MakeContext(overrides?)`, `SilentLogger`

Rules:

| Situation | Behavior |
| --- | --- |
| Handler key blank or unregistered | `ResolveWorkHandler` returns `null` — never the abstract base class |
| Key casing / whitespace differs | Resolves (ClassFactory keys match trimmed, case-insensitively) |
| Each call | A **new** handler instance (handlers may keep per-delivery state) |
| `BoundWorkHandler.Handle` | Resolve → mint provider → `BindExecutionContext` → delegate, in that order |
| Key no longer resolves at delivery time | `Outcome.DeadLetter('HandlerNotRegistered')`; no provider is minted |
| Provider source throws | The error propagates; `ConsumerRuntime` treats it as `Retry` (03 §3.2) |

- [ ] **Step 1: Write the test fakes**

`packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`:

```typescript
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { WorkContext, WorkJson, WorkLogger, WorkMessage } from '@memberjunction/work-queue-core';

export const TEST_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', Email: 'system@memberjunction.org' } as UserInfo;
export const TEST_PROVIDER = { Name: 'test-provider' } as unknown as IMetadataProvider;

export function MakeMessage(overrides: Partial<WorkMessage> = {}): WorkMessage {
    return {
        MessageID: 'BBBBBBBB-2222-4222-8222-000000000001',
        Topic: 'test.topic',
        Attributes: {},
        PublishedAt: '2026-09-16T12:00:00.000Z',
        ...overrides,
    };
}

export function MakeContext(overrides: Partial<WorkContext> = {}): WorkContext {
    return {
        SubscriptionName: 'test.subscription',
        DeliveryID: 'CCCCCCCC-3333-4333-8333-000000000001',
        Attempt: 1,
        MaxAttempts: 5,
        IsReplay: false,
        Signal: new AbortController().signal,
        Heartbeat: async () => true,
        Log: new SilentLogger(),
        ...overrides,
    };
}

/** Collects log lines instead of printing them. */
export class SilentLogger implements WorkLogger {
    public readonly Lines: string[] = [];

    public Info(message: string, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`info:${message}`);
    }

    public Warn(message: string, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`warn:${message}`);
    }

    public Error(message: string, error?: Error, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`error:${message}${error ? `:${error.message}` : ''}`);
    }
}
```

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/handlers.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Outcome, type WorkContext, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import { BoundWorkHandler, SharedProviderSource, type WorkQueueProviderSource } from '../handlers/BoundWorkHandler';
import { ResolveWorkHandler } from '../handlers/ResolveWorkHandler';
import { MakeContext, MakeMessage, TEST_PROVIDER, TEST_USER } from './runtimeFakes';

class EchoHandler extends BaseWorkHandler {
    public static LastBound: { UserID: string; Provider: IMetadataProvider } | null = null;

    public async Handle(message: WorkMessage, _context: WorkContext): Promise<WorkOutcome> {
        EchoHandler.LastBound = { UserID: this.ContextUser.ID, Provider: this.Provider };
        return message.Attributes.fail === 'yes' ? Outcome.DeadLetter('asked to fail') : Outcome.Complete();
    }
}

MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, EchoHandler, 'test.echo-handler');

function countingSource(): WorkQueueProviderSource & { Calls: number } {
    const source = {
        Calls: 0,
        CreateProvider: async (): Promise<IMetadataProvider> => {
            source.Calls++;
            return TEST_PROVIDER;
        },
    };
    return source;
}

describe('ResolveWorkHandler', () => {
    it('returns null for a blank key', () => {
        expect(ResolveWorkHandler('   ')).toBeNull();
    });

    it('returns null when nothing is registered under the key', () => {
        expect(ResolveWorkHandler('test.no-such-handler')).toBeNull();
    });

    it('returns a new instance per call, matching keys trimmed and case-insensitively', () => {
        const first = ResolveWorkHandler(' Test.Echo-Handler ');
        expect(first).toBeInstanceOf(EchoHandler);
        expect(ResolveWorkHandler('test.echo-handler')).not.toBe(first);
    });
});

describe('BoundWorkHandler', () => {
    it('binds the context user and a sourced provider, then delegates', async () => {
        const source = countingSource();
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, ResolveWorkHandler);
        expect(await bound.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'Complete' });
        expect(EchoHandler.LastBound).toEqual({ UserID: TEST_USER.ID, Provider: TEST_PROVIDER });
        expect(source.Calls).toBe(1);
    });

    it("returns the handler's own outcome", async () => {
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, countingSource(), ResolveWorkHandler);
        const outcome = await bound.Handle(MakeMessage({ Attributes: { fail: 'yes' } }), MakeContext());
        expect(outcome).toEqual({ Kind: 'DeadLetter', Reason: 'asked to fail' });
    });

    it('dead-letters with HandlerNotRegistered when the key no longer resolves, without minting a provider', async () => {
        const source = countingSource();
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, () => null);
        expect(await bound.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'DeadLetter', Reason: 'HandlerNotRegistered' });
        expect(source.Calls).toBe(0);
    });

    it('lets a provider failure propagate so the runtime retries the delivery', async () => {
        const failing: WorkQueueProviderSource = { CreateProvider: vi.fn(async () => { throw new Error('pool exhausted'); }) };
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, failing, ResolveWorkHandler);
        await expect(bound.Handle(MakeMessage(), MakeContext())).rejects.toThrow('pool exhausted');
    });
});

describe('SharedProviderSource', () => {
    it('returns the same provider on every call', async () => {
        const source = new SharedProviderSource(TEST_PROVIDER);
        expect(await source.CreateProvider()).toBe(TEST_PROVIDER);
        expect(await source.CreateProvider()).toBe(TEST_PROVIDER);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test handlers`
Expected: FAIL — unresolved imports `../handlers/BaseWorkHandler`, `../handlers/BoundWorkHandler`, `../handlers/ResolveWorkHandler`.

- [ ] **Step 4: Write `src/handlers/BaseWorkHandler.ts`**

```typescript
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { WorkContext, WorkHandler, WorkJson, WorkMessage, WorkOutcome } from '@memberjunction/work-queue-core';

export interface WorkHandlerExecutionContext {
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/**
 * Base class for handlers hosted inside MJ. Register with
 * `@RegisterClass(BaseWorkHandler, '<HandlerKey>')`; the host creates a new instance per delivery and binds
 * the system user and a provider before calling Handle.
 *
 * Handlers must be idempotent: a delivery can run again after a crash between the work and the settle.
 * Use `this.Provider` and `this.ContextUser` for every data call — never `new Metadata()`.
 */
export abstract class BaseWorkHandler<TPayload extends WorkJson = WorkJson> implements WorkHandler<TPayload> {
    protected ContextUser!: UserInfo;
    protected Provider!: IMetadataProvider;

    public BindExecutionContext(ctx: WorkHandlerExecutionContext): void {
        this.ContextUser = ctx.ContextUser;
        this.Provider = ctx.Provider;
    }

    public abstract Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}
```

- [ ] **Step 5: Write `src/handlers/ResolveWorkHandler.ts`**

```typescript
import { MJGlobal } from '@memberjunction/global';
import { BaseWorkHandler } from './BaseWorkHandler';

/**
 * A new instance of the handler registered under the key, or null. Uses GetRegistration rather than
 * CreateInstance because CreateInstance silently falls back to the (abstract) base class for unknown keys.
 */
export function ResolveWorkHandler(handlerKey: string): BaseWorkHandler | null {
    const key = handlerKey.trim();
    if (key === '') {
        return null;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseWorkHandler, key);
    if (!registration) {
        return null;
    }
    const handler: BaseWorkHandler = new registration.SubClass();
    return handler;
}
```

- [ ] **Step 6: Write `src/handlers/BoundWorkHandler.ts`**

```typescript
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { Outcome, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import type { BaseWorkHandler } from './BaseWorkHandler';

/** Supplies the provider a delivery's handler uses. A host may mint one per delivery or share one. */
export interface WorkQueueProviderSource {
    CreateProvider(): Promise<IMetadataProvider>;
}

/** Hands every delivery the same provider — tests, CLIs and hosts without a connection pool. */
export class SharedProviderSource implements WorkQueueProviderSource {
    constructor(private readonly provider: IMetadataProvider) {}

    public async CreateProvider(): Promise<IMetadataProvider> {
        return this.provider;
    }
}

export type WorkHandlerResolver = (handlerKey: string) => BaseWorkHandler | null;

/**
 * The WorkHandler a host gives ConsumerRuntime. For each delivery it resolves a fresh BaseWorkHandler,
 * mints a provider, binds the execution context and delegates. The host checks the key resolves before
 * starting a runtime; the dead-letter branch covers a registration removed while the host runs.
 */
export class BoundWorkHandler implements WorkHandler {
    constructor(
        private readonly handlerKey: string,
        private readonly contextUser: UserInfo,
        private readonly providers: WorkQueueProviderSource,
        private readonly resolve: WorkHandlerResolver,
    ) {}

    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        const handler = this.resolve(this.handlerKey);
        if (!handler) {
            return Outcome.DeadLetter('HandlerNotRegistered');
        }
        const provider = await this.providers.CreateProvider();
        handler.BindExecutionContext({ ContextUser: this.contextUser, Provider: provider });
        return handler.Handle(message, context);
    }
}
```

- [ ] **Step 7: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './handlers/BaseWorkHandler';
export * from './handlers/ResolveWorkHandler';
export * from './handlers/BoundWorkHandler';
```

If plan 05 already exported a `BaseWorkHandler` from another path, delete that export and its file so exactly one `BaseWorkHandler` class exists (a second class breaks ClassFactory lookups silently).

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test handlers`
Expected: PASS — handlers (8).

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: every engine suite passes; builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): handler resolution and per-delivery binding"
```

---

### Task 2: Subscription planner

**Files:**
- Create: `packages/WorkQueue/engine/src/host/HostedSubscriptionPlanner.ts`
- Modify: `packages/WorkQueue/engine/src/handlers/ResolveWorkHandler.ts`, `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/HostedSubscriptionPlanner.test.ts`

**Interfaces:**
- Consumes: `ITransportDriver`, `ITransportConsumer`, `ITransportOperator`, `LeaseExtension`, `SubscriptionBinding`, `SubscriptionPolicy`, `TransportCapabilities`, `BindingValidationIssue`, `PublishResult`, `ReceivedDelivery`, `SettleResult`, `WorkJson`, `SubscriptionUnsupportedReason(binding, capabilities)` (plan 04, 03 §5); `BaseWorkHandler` (Task 1); `DeadLetteredEvent` (plan 05, `src/transports/TransportDriverDeps.ts`); `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`; `UUIDsEqual`, `MJGlobal` (`@memberjunction/global`).
- Produces:
  - `IsWorkHandlerRegistered(handlerKey: string): boolean` (added to `ResolveWorkHandler.ts`) and `type WorkHandlerProbe = (handlerKey: string) => boolean` — a registration check that **does not instantiate** the handler
  - `type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error'` (03 §11)
  - `interface HostSubscriptionRequest { Name: string; Concurrency: number }`
  - `interface WorkQueueHostEngine` — `Transports`, `Topics`, `Subscriptions`, `GetDriver(transportID)`, `BuildSubscriptionBinding(subscription)`, `OnPublished(listener)`, `NotifyDeadLettered(event)` (structural subset of plan 05's `WorkQueueEngine`, 03 §11)
  - `interface RunnableSubscriptionPlan`, `interface BlockedSubscriptionPlan`, `type HostedSubscriptionPlan`
  - `ExpandSubscriptionRequests(requests, engine): ExpandedSubscriptionRequest[]`
  - `PlanHostedSubscriptions(requests: HostSubscriptionRequest[], engine: WorkQueueHostEngine, handlerRegistered: WorkHandlerProbe): Promise<HostedSubscriptionPlan[]>`
  - Fakes: `DATABASE_CAPABILITIES`, `AWS_CAPABILITIES`, `FakeTransport`, `FakeTopic`, `FakeSubscription`, `FakeTransportDriver`, `InertConsumer`, `FakeHostEngine`, `RecordingWorkHandler`, `TestHandlerResolver`, `TestHandlerProbe`, `BuildHostScenario()`

Planning rules, applied per request in this order (the first failing rule decides):

| # | Condition | Plan |
| --- | --- | --- |
| 1 | `'*'` request | Expands to every `MJWorker` subscription (any status) at the wildcard's concurrency; explicit entries override |
| 2 | Named subscription not found | `Blocked` / `Error` — `Subscription '<name>' not found` |
| 3 | `HostType` is not `MJWorker` | `Blocked` / `Unsupported` — `HostType '<type>' subscriptions run outside MJ` |
| 4 | Topic or transport row missing | `Blocked` / `Error` |
| 5 | Subscription, topic or transport not `Active` | `Blocked` / `Paused` — `Subscription status is Paused`, `Topic '<name>' is Disabled`, `Transport '<name>' is Disabled` |
| 6 | `GetDriver` throws | `Blocked` / `Error` — `Transport driver unavailable: <message>` |
| 7 | `SubscriptionUnsupportedReason(binding, driver.Capabilities)` non-null | `Blocked` / `Unsupported` — the core's reason (an `Ordered` subscription on a cloud topic lands here: `Ordered` requires the Database transport, 03 §5) |
| 8 | `HandlerKey` blank or not registered | `Blocked` / `HandlerNotRegistered` — `No BaseWorkHandler is registered for HandlerKey '<key or (none)>'` |
| 9 | otherwise | `Runnable`: the consumer driver is the topic's driver; `Signature` = JSON of `[binding, handlerKey, transportID, concurrency, driver.Name]` |

Plans are returned sorted by subscription name. The host restarts a runtime only when its `Signature` changes. Planning runs on every reconcile, so rule 8 asks the ClassFactory whether a registration **exists** — it never constructs a handler (handlers may allocate in their constructors).

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, merging the new imports into the top of the file:

```typescript
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    Outcome,
    type BindingValidationIssue, type FilterSupport, type ITransportConsumer, type ITransportDriver, type ITransportOperator,
    type LeaseExtension, type PublishResult, type ReceivedDelivery, type SettleResult, type SubscriptionBinding,
    type SubscriptionPolicy, type TopicBinding, type TransportCapabilities, type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import type { WorkQueueHostEngine } from '../host/HostedSubscriptionPlanner';

/** Mirrors plan 05's DATABASE_TRANSPORT_CAPABILITIES (03 §4.1, §5). Keep both in step. */
const QUEUE_FILTER_SUPPORT: FilterSupport = {
    Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50,
};

export const DATABASE_CAPABILITIES: TransportCapabilities = {
    Filters: QUEUE_FILTER_SUPPORT, DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true,
    SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true, CompletedCounts: true, MaxRetryDelaySeconds: 2147483647,
};

export const AWS_CAPABILITIES: TransportCapabilities = {
    Filters: QUEUE_FILTER_SUPPORT, DetectsMessageIDDuplicates: false, PersistsProgress: false, SupportsOrdered: false,
    SupportsExternalHosts: true, CancelPending: false, CancelInFlight: false, ListPartitions: false, PeekDeadLetters: 'BestEffort',
    ReplaySingleDeadLetter: true, CompletedCounts: false, MaxRetryDelaySeconds: 43200,
};

export const IDS = {
    DatabaseTransport: '10000000-0000-4000-8000-000000000001',
    AwsTransport: '10000000-0000-4000-8000-000000000002',
    EmailTopic: '20000000-0000-4000-8000-000000000001',
    IntegrationTopic: '20000000-0000-4000-8000-000000000002',
    IntegrationSubscription: '30000000-0000-4000-8000-000000000004',
    UnknownSubscription: '30000000-0000-4000-8000-0000000000ff',
    DeliveryA: '40000000-0000-4000-8000-000000000001',
    DeliveryB: '40000000-0000-4000-8000-000000000002',
} as const;

interface FakeTransportFields { ID: string; Name: string; DriverClass: string; Status?: 'Active' | 'Disabled' }
interface FakeTopicFields { ID: string; Name: string; TransportID: string; Status?: 'Active' | 'Disabled' }
interface FakeSubscriptionFields {
    ID: string;
    Name: string;
    TopicID: string;
    HostType?: 'MJWorker' | 'External';
    HandlerKey?: string | null;
    Status?: 'Active' | 'Paused' | 'Disabled';
    PartitionMode?: 'None' | 'Exclusive' | 'Ordered';
    LeaseSeconds?: number;
}

export function FakeTransport(fields: FakeTransportFields): MJWorkQueueTransportEntity {
    return { Status: 'Active', ...fields } as unknown as MJWorkQueueTransportEntity;
}

export function FakeTopic(fields: FakeTopicFields): MJWorkQueueTopicEntity {
    return { Status: 'Active', AllowExternalPublish: false, RetentionDays: 7, ...fields } as unknown as MJWorkQueueTopicEntity;
}

export function FakeSubscription(fields: FakeSubscriptionFields): MJWorkQueueSubscriptionEntity {
    return {
        HostType: 'MJWorker', HandlerKey: 'handler.ok', Status: 'Active', PartitionMode: 'None', MaxAttempts: 5,
        BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...fields,
    } as unknown as MJWorkQueueSubscriptionEntity;
}

/** A consumer that never receives anything and settles whatever it is given. Counts Close() calls. */
export class InertConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    public Closed = 0;

    public async Receive(): Promise<ReceivedDelivery<TPayload>[]> {
        return [];
    }

    public async ExtendLease(): Promise<LeaseExtension> {
        return 'Held';
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' };
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'DeadLettered' };
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
    }

    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.Closed++;
    }
}

export class FakeTransportDriver implements ITransportDriver {
    public readonly OpenedBindings: SubscriptionBinding[] = [];
    public readonly OpenedConsumers: InertConsumer[] = [];
    public OpenError: Error | null = null;

    constructor(public readonly Name: string, public readonly Capabilities: TransportCapabilities) {}

    public async Publish(): Promise<PublishResult[]> {
        throw new Error('FakeTransportDriver.Publish is not used by host tests');
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        if (this.OpenError) {
            throw this.OpenError;
        }
        this.OpenedBindings.push(subscription);
        const consumer = new InertConsumer<TPayload>();
        this.OpenedConsumers.push(consumer as unknown as InertConsumer);
        return consumer;
    }

    public Operator(): ITransportOperator {
        throw new Error('FakeTransportDriver.Operator is not used by host tests');
    }

    public async ValidateBindings(_topic: TopicBinding, _subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return [];
    }
}

export class FakeHostEngine implements WorkQueueHostEngine {
    public Transports: MJWorkQueueTransportEntity[] = [];
    public Topics: MJWorkQueueTopicEntity[] = [];
    public Subscriptions: MJWorkQueueSubscriptionEntity[] = [];
    public readonly Drivers = new Map<string, ITransportDriver>();
    public readonly DriverErrors = new Map<string, Error>();
    public GetDriverCalls = 0;
    /** Dead-letter events the sweeper raised through the engine (03 §11). */
    public readonly DeadLettered: DeadLetteredEvent[] = [];
    private readonly listeners = new Set<(topicName: string) => void>();

    public NotifyDeadLettered(event: DeadLetteredEvent): void {
        this.DeadLettered.push(event);
    }

    public async GetDriver(transportID: string): Promise<ITransportDriver> {
        this.GetDriverCalls++;
        const error = this.DriverErrors.get(transportID);
        if (error) {
            throw error;
        }
        const driver = this.Drivers.get(transportID);
        if (!driver) {
            throw new Error(`No fake driver for transport ${transportID}`);
        }
        return driver;
    }

    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding {
        const topic = this.Topics.find(t => UUIDsEqual(t.ID, subscription.TopicID));
        const policy: SubscriptionPolicy = {
            SubscriptionName: subscription.Name,
            TopicName: topic?.Name ?? 'unknown',
            PartitionMode: subscription.PartitionMode,
            MaxAttempts: subscription.MaxAttempts,
            BackoffBaseSeconds: subscription.BackoffBaseSeconds,
            BackoffMaxSeconds: subscription.BackoffMaxSeconds,
            LeaseSeconds: subscription.LeaseSeconds,
            HeartbeatMode: subscription.HeartbeatMode,
        };
        // Filter: null matches everything (03 §4). Real bindings carry MJ CompositeFilterDescriptor JSON parsed by
        // WorkQueueEngineBase.ParseFilter; the host never inspects it, so the fakes leave it null.
        return { Policy: policy, Filter: null, HostType: subscription.HostType, Config: {} };
    }

    public OnPublished(listener: (topicName: string) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public EmitPublished(topicName: string): void {
        for (const listener of this.listeners) {
            listener(topicName);
        }
    }

    public get ListenerCount(): number {
        return this.listeners.size;
    }

    public Subscription(name: string): MJWorkQueueSubscriptionEntity {
        const subscription = this.Subscriptions.find(s => s.Name === name);
        if (!subscription) {
            throw new Error(`No fake subscription ${name}`);
        }
        return subscription;
    }
}

/** Completes every delivery and remembers who it was bound to. Counts constructions. */
export class RecordingWorkHandler extends BaseWorkHandler {
    public static LastBoundUserID: string | null = null;
    public static Constructed = 0;

    constructor() {
        super();
        RecordingWorkHandler.Constructed++;
    }

    public async Handle(): Promise<WorkOutcome> {
        RecordingWorkHandler.LastBoundUserID = this.ContextUser.ID;
        return Outcome.Complete();
    }
}

export function TestHandlerResolver(handlerKey: string): BaseWorkHandler | null {
    return handlerKey === 'handler.ok' ? new RecordingWorkHandler() : null;
}

/** Registration probe for planner tests: answers without constructing a handler. */
export function TestHandlerProbe(handlerKey: string): boolean {
    return handlerKey === 'handler.ok';
}

export interface HostScenario {
    Engine: FakeHostEngine;
    DatabaseDriver: FakeTransportDriver;
    AwsDriver: FakeTransportDriver;
}

/**
 * Two transports, two topics and six subscriptions covering every planning outcome:
 * email.subscriber-update (AWS, Exclusive, runnable) · email.dashboard (External) ·
 * email.ordered (AWS, Ordered → Unsupported: Ordered requires the Database transport) ·
 * integration.apply (Database, Ordered, runnable) · integration.audit (unregistered handler) ·
 * integration.paused (Paused).
 */
export function BuildHostScenario(): HostScenario {
    const engine = new FakeHostEngine();
    const databaseDriver = new FakeTransportDriver('Database', DATABASE_CAPABILITIES);
    const awsDriver = new FakeTransportDriver('AWS', AWS_CAPABILITIES);
    engine.Transports = [
        FakeTransport({ ID: IDS.DatabaseTransport, Name: 'Database', DriverClass: 'Database' }),
        FakeTransport({ ID: IDS.AwsTransport, Name: 'AWS-test', DriverClass: 'AWS' }),
    ];
    engine.Topics = [
        FakeTopic({ ID: IDS.EmailTopic, Name: 'email.events', TransportID: IDS.AwsTransport }),
        FakeTopic({ ID: IDS.IntegrationTopic, Name: 'integration.batch-ready', TransportID: IDS.DatabaseTransport }),
    ];
    engine.Subscriptions = [
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000001', Name: 'email.subscriber-update', TopicID: IDS.EmailTopic, PartitionMode: 'Exclusive' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000002', Name: 'email.dashboard', TopicID: IDS.EmailTopic, HostType: 'External', HandlerKey: null }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000003', Name: 'email.ordered', TopicID: IDS.EmailTopic, PartitionMode: 'Ordered' }),
        FakeSubscription({ ID: IDS.IntegrationSubscription, Name: 'integration.apply', TopicID: IDS.IntegrationTopic, PartitionMode: 'Ordered' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000005', Name: 'integration.audit', TopicID: IDS.IntegrationTopic, HandlerKey: 'handler.missing' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000006', Name: 'integration.paused', TopicID: IDS.IntegrationTopic, Status: 'Paused' }),
    ];
    engine.Drivers.set(IDS.DatabaseTransport, databaseDriver);
    engine.Drivers.set(IDS.AwsTransport, awsDriver);
    return { Engine: engine, DatabaseDriver: databaseDriver, AwsDriver: awsDriver };
}
```

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/HostedSubscriptionPlanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import { IsWorkHandlerRegistered } from '../handlers/ResolveWorkHandler';
import {
    ExpandSubscriptionRequests, PlanHostedSubscriptions, type HostedSubscriptionPlan, type RunnableSubscriptionPlan,
} from '../host/HostedSubscriptionPlanner';
import { BuildHostScenario, IDS, RecordingWorkHandler, TestHandlerProbe } from './runtimeFakes';

function byName(plans: HostedSubscriptionPlan[], name: string): HostedSubscriptionPlan {
    const plan = plans.find(p => p.Name === name);
    if (!plan) {
        throw new Error(`no plan for ${name}`);
    }
    return plan;
}

function runnable(plans: HostedSubscriptionPlan[], name: string): RunnableSubscriptionPlan {
    const plan = byName(plans, name);
    if (plan.Kind !== 'Runnable') {
        throw new Error(`${name} is ${plan.State}: ${plan.Reason}`);
    }
    return plan;
}

describe('IsWorkHandlerRegistered', () => {
    it('answers from the ClassFactory without constructing the handler', () => {
        MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, RecordingWorkHandler, 'test.probe-handler');
        const before = RecordingWorkHandler.Constructed;
        expect(IsWorkHandlerRegistered(' Test.Probe-Handler ')).toBe(true);
        expect(IsWorkHandlerRegistered('test.no-such-handler')).toBe(false);
        expect(IsWorkHandlerRegistered('  ')).toBe(false);
        expect(RecordingWorkHandler.Constructed).toBe(before);
    });
});

describe('ExpandSubscriptionRequests', () => {
    it("expands '*' to MJWorker subscriptions, sorted, and lets explicit entries override concurrency", () => {
        const { Engine } = BuildHostScenario();
        const expanded = ExpandSubscriptionRequests([{ Name: '*', Concurrency: 2 }, { Name: 'INTEGRATION.APPLY', Concurrency: 9 }], Engine);
        expect(expanded.map(e => [e.Name, e.Concurrency])).toEqual([
            ['email.ordered', 2], ['email.subscriber-update', 2], ['integration.apply', 9],
            ['integration.audit', 2], ['integration.paused', 2],
        ]);
    });
});

describe('PlanHostedSubscriptions', () => {
    it('reports an unknown named subscription as an error', async () => {
        const { Engine } = BuildHostScenario();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'nope', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(plan).toEqual({ Kind: 'Blocked', Name: 'nope', State: 'Error', Reason: "Subscription 'nope' not found" });
    });

    it('refuses an External subscription named explicitly', async () => {
        const { Engine } = BuildHostScenario();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.dashboard', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(plan).toMatchObject({ State: 'Unsupported', Reason: "HostType 'External' subscriptions run outside MJ" });
    });

    it('pauses subscriptions that are not Active and subscriptions whose topic is Disabled', async () => {
        const scenario = BuildHostScenario();
        const plans = await PlanHostedSubscriptions([{ Name: '*', Concurrency: 1 }], scenario.Engine, TestHandlerProbe);
        expect(byName(plans, 'integration.paused')).toMatchObject({ State: 'Paused', Reason: 'Subscription status is Paused' });

        scenario.Engine.Topics = scenario.Engine.Topics.map(t => (t.Name === 'integration.batch-ready' ? Object.assign(t, { Status: 'Disabled' }) : t));
        const again = await PlanHostedSubscriptions([{ Name: 'integration.apply', Concurrency: 1 }], scenario.Engine, TestHandlerProbe);
        expect(again[0]).toMatchObject({ State: 'Paused', Reason: "Topic 'integration.batch-ready' is Disabled" });
    });

    it('reports a transport driver failure as an error', async () => {
        const { Engine } = BuildHostScenario();
        Engine.DriverErrors.set(IDS.AwsTransport, new Error('credentials rejected'));
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(plan).toMatchObject({ State: 'Error', Reason: 'Transport driver unavailable: credentials rejected' });
    });

    it('refuses Ordered on a cloud transport and runs it on the Database transport', async () => {
        const scenario = BuildHostScenario();
        const [cloud] = await PlanHostedSubscriptions([{ Name: 'email.ordered', Concurrency: 1 }], scenario.Engine, TestHandlerProbe);
        expect(cloud.Kind).toBe('Blocked');
        expect(cloud.Kind === 'Blocked' ? cloud.State : '').toBe('Unsupported');
        expect(cloud.Kind === 'Blocked' ? cloud.Reason : '').toContain('Database transport');

        const database = runnable(await PlanHostedSubscriptions([{ Name: 'integration.apply', Concurrency: 1 }], scenario.Engine, TestHandlerProbe), 'integration.apply');
        expect(database.ConsumerDriver).toBe(scenario.DatabaseDriver);
    });

    it('reports a missing or blank handler key', async () => {
        const { Engine } = BuildHostScenario();
        const [missing] = await PlanHostedSubscriptions([{ Name: 'integration.audit', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(missing).toMatchObject({ State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey 'handler.missing'" });

        Object.assign(Engine.Subscription('integration.audit'), { HandlerKey: null });
        const [blank] = await PlanHostedSubscriptions([{ Name: 'integration.audit', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(blank).toMatchObject({ State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey '(none)'" });
    });

    it('runs a subscription on its topic driver with a signature that tracks concurrency, constructing no handler', async () => {
        const scenario = BuildHostScenario();
        const before = RecordingWorkHandler.Constructed;
        const first = runnable(await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 1 }], scenario.Engine, TestHandlerProbe), 'email.subscriber-update');
        const second = runnable(await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 3 }], scenario.Engine, TestHandlerProbe), 'email.subscriber-update');
        expect(first.ConsumerDriver).toBe(scenario.AwsDriver);
        expect(first.HandlerKey).toBe('handler.ok');
        expect(first.Signature).not.toBe(second.Signature);
        expect(RecordingWorkHandler.Constructed).toBe(before);
    });
});
```

The `Unsupported` reason text for `email.ordered` comes from plan 04's `SubscriptionUnsupportedReason` (03 §5 rule 2: "Ordered requires the Database transport"); the test only asserts that it names the Database transport.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test HostedSubscriptionPlanner`
Expected: FAIL — unresolved import `../host/HostedSubscriptionPlanner`, and `IsWorkHandlerRegistered` is not exported.

- [ ] **Step 4: Add `IsWorkHandlerRegistered` to `src/handlers/ResolveWorkHandler.ts`**

Append:

```typescript
/** Answers "would ResolveWorkHandler return a handler?" without constructing one. */
export type WorkHandlerProbe = (handlerKey: string) => boolean;

/** True when a BaseWorkHandler subclass is registered under the key. Never instantiates the handler. */
export function IsWorkHandlerRegistered(handlerKey: string): boolean {
    const key = handlerKey.trim();
    return key !== '' && MJGlobal.Instance.ClassFactory.GetRegistration(BaseWorkHandler, key) != null;
}
```

- [ ] **Step 5: Write `src/host/HostedSubscriptionPlanner.ts`**

```typescript
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { SubscriptionUnsupportedReason, type ITransportDriver, type SubscriptionBinding } from '@memberjunction/work-queue-core';
import type { WorkHandlerProbe } from '../handlers/ResolveWorkHandler';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error';

export interface HostSubscriptionRequest {
    /** Subscription name, or '*' for every MJWorker subscription. */
    Name: string;
    Concurrency: number;
}

/**
 * The structural subset of the server `WorkQueueEngine` this host needs; `WorkQueueEngine` satisfies it. The metadata
 * members are proxies the server engine forwards to `WorkQueueEngineBase` (03 §11), so the base/engine split is
 * invisible to the host.
 */
export interface WorkQueueHostEngine {
    readonly Transports: MJWorkQueueTransportEntity[];
    readonly Topics: MJWorkQueueTopicEntity[];
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    /** One cached driver instance per transport (03 §11). */
    GetDriver(transportID: string): Promise<ITransportDriver>;
    BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
    OnPublished(listener: (topicName: string) => void): () => void;
    /** Raises a dead-letter event to the engine's OnDeadLettered listeners (03 §11); the sweeper calls it. */
    NotifyDeadLettered(event: DeadLetteredEvent): void;
}

export interface ExpandedSubscriptionRequest {
    Name: string;
    Concurrency: number;
    Subscription: MJWorkQueueSubscriptionEntity | null;
}

export interface RunnableSubscriptionPlan {
    Kind: 'Runnable';
    Name: string;
    Concurrency: number;
    Subscription: MJWorkQueueSubscriptionEntity;
    Topic: MJWorkQueueTopicEntity;
    Transport: MJWorkQueueTransportEntity;
    Binding: SubscriptionBinding;
    ConsumerDriver: ITransportDriver;
    HandlerKey: string;
    /** Changes whenever anything that shapes the runtime changes; the host restarts on a change. */
    Signature: string;
}

export interface BlockedSubscriptionPlan {
    Kind: 'Blocked';
    Name: string;
    State: Exclude<HostedSubscriptionState, 'Running'>;
    Reason: string;
}

export type HostedSubscriptionPlan = RunnableSubscriptionPlan | BlockedSubscriptionPlan;

export function ExpandSubscriptionRequests(requests: HostSubscriptionRequest[], engine: WorkQueueHostEngine): ExpandedSubscriptionRequest[] {
    const byName = new Map<string, ExpandedSubscriptionRequest>();
    const wildcard = requests.find(r => r.Name.trim() === '*');
    if (wildcard) {
        for (const subscription of engine.Subscriptions.filter(s => s.HostType === 'MJWorker')) {
            byName.set(key(subscription.Name), { Name: subscription.Name, Concurrency: wildcard.Concurrency, Subscription: subscription });
        }
    }
    for (const request of requests) {
        const name = request.Name.trim();
        if (name === '*') {
            continue;
        }
        const subscription = engine.Subscriptions.find(s => key(s.Name) === key(name)) ?? null;
        byName.set(key(name), { Name: subscription?.Name ?? name, Concurrency: request.Concurrency, Subscription: subscription });
    }
    return [...byName.values()].sort((a, b) => a.Name.localeCompare(b.Name));
}

export async function PlanHostedSubscriptions(
    requests: HostSubscriptionRequest[],
    engine: WorkQueueHostEngine,
    handlerRegistered: WorkHandlerProbe,
): Promise<HostedSubscriptionPlan[]> {
    const plans: HostedSubscriptionPlan[] = [];
    for (const request of ExpandSubscriptionRequests(requests, engine)) {
        plans.push(await planOne(request, engine, handlerRegistered));
    }
    return plans;
}

async function planOne(
    request: ExpandedSubscriptionRequest,
    engine: WorkQueueHostEngine,
    handlerRegistered: WorkHandlerProbe,
): Promise<HostedSubscriptionPlan> {
    const subscription = request.Subscription;
    if (!subscription) {
        return blocked(request.Name, 'Error', `Subscription '${request.Name}' not found`);
    }
    if (subscription.HostType !== 'MJWorker') {
        return blocked(subscription.Name, 'Unsupported', `HostType '${subscription.HostType}' subscriptions run outside MJ`);
    }
    const topic = engine.Topics.find(t => UUIDsEqual(t.ID, subscription.TopicID));
    if (!topic) {
        return blocked(subscription.Name, 'Error', `Topic ${subscription.TopicID} for subscription '${subscription.Name}' not found`);
    }
    const transport = engine.Transports.find(t => UUIDsEqual(t.ID, topic.TransportID));
    if (!transport) {
        return blocked(subscription.Name, 'Error', `Transport ${topic.TransportID} for topic '${topic.Name}' not found`);
    }
    const paused = pausedBecause(subscription, topic, transport);
    if (paused) {
        return blocked(subscription.Name, 'Paused', paused);
    }
    return planActive(request, subscription, topic, transport, engine, handlerRegistered);
}

async function planActive(
    request: ExpandedSubscriptionRequest,
    subscription: MJWorkQueueSubscriptionEntity,
    topic: MJWorkQueueTopicEntity,
    transport: MJWorkQueueTransportEntity,
    engine: WorkQueueHostEngine,
    handlerRegistered: WorkHandlerProbe,
): Promise<HostedSubscriptionPlan> {
    let driver: ITransportDriver;
    try {
        driver = await engine.GetDriver(transport.ID);
    } catch (error) {
        return blocked(subscription.Name, 'Error', `Transport driver unavailable: ${describe(error)}`);
    }
    const binding = engine.BuildSubscriptionBinding(subscription);
    const unsupported = SubscriptionUnsupportedReason(binding, driver.Capabilities);
    if (unsupported) {
        return blocked(subscription.Name, 'Unsupported', unsupported);
    }
    const handlerKey = subscription.HandlerKey?.trim() ?? '';
    if (handlerKey === '' || !handlerRegistered(handlerKey)) {
        return blocked(subscription.Name, 'HandlerNotRegistered', `No BaseWorkHandler is registered for HandlerKey '${handlerKey || '(none)'}'`);
    }
    return {
        Kind: 'Runnable', Name: subscription.Name, Concurrency: request.Concurrency, Subscription: subscription, Topic: topic,
        Transport: transport, Binding: binding, ConsumerDriver: driver, HandlerKey: handlerKey,
        Signature: JSON.stringify([binding, handlerKey, transport.ID, request.Concurrency, driver.Name]),
    };
}

function pausedBecause(subscription: MJWorkQueueSubscriptionEntity, topic: MJWorkQueueTopicEntity, transport: MJWorkQueueTransportEntity): string | null {
    if (subscription.Status !== 'Active') {
        return `Subscription status is ${subscription.Status}`;
    }
    if (topic.Status !== 'Active') {
        return `Topic '${topic.Name}' is ${topic.Status}`;
    }
    if (transport.Status !== 'Active') {
        return `Transport '${transport.Name}' is ${transport.Status}`;
    }
    return null;
}

function blocked(name: string, state: BlockedSubscriptionPlan['State'], reason: string): BlockedSubscriptionPlan {
    return { Kind: 'Blocked', Name: name, State: state, Reason: reason };
}

function key(value: string): string {
    return value.trim().toLowerCase();
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 6: Export the new module**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './host/HostedSubscriptionPlanner';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test HostedSubscriptionPlanner`
Expected: PASS — HostedSubscriptionPlanner (9).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds. A type error on `WorkQueueEngine` not satisfying `WorkQueueHostEngine` shows up in Task 7, not here; if plan 05's `OnPublished` or `NotifyDeadLettered` signature differs, align it with 03 §11 now.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): capability-gated subscription planning"
```

---

### Task 3: `WorkQueueHost`

**Files:**
- Create: `packages/WorkQueue/engine/src/host/WorkQueueHost.ts`
- Modify: `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueHost.test.ts`

**Interfaces:**
- Consumes: `ConsumerRuntime`, `ConsumerRuntimeOptions`, `ITransportConsumer`, `SubscriptionPolicy`, `WorkHandler`, `WorkLogger` (plan 04); `WorkQueueExecutorSource`, test fake `RecordingExecutor` (`src/__tests__/fakes.ts`) (plan 05); `BoundWorkHandler`, `ResolveWorkHandler`, `IsWorkHandlerRegistered`, `WorkQueueProviderSource`, `WorkHandlerResolver` (Tasks 1–2); `PlanHostedSubscriptions`, `HostedSubscriptionPlan`, `RunnableSubscriptionPlan`, `HostedSubscriptionState`, `WorkQueueHostEngine` (Task 2); `WorkQueueSweeper` (Task 4 — imported by name here, implemented next; Step 5 below creates a compile-only stub that Task 4 replaces); `IShutdownable`, `ShutdownRegistry` (`@memberjunction/global`).
- Produces (03 §11):
  - `interface WorkQueueHostConfig` — `InstanceID`, `Subscriptions`, `IdlePollMinMs`, `IdlePollMaxMs`, `ShutdownDrainMs`, `SweeperIntervalMs` (0 disables the sweeper), `ReconcileIntervalMs` (0 disables periodic re-planning)
  - `interface HostRuntime { Start(): void; Stop(): Promise<void>; Kick(): void; readonly InFlightCount: number }` (`ConsumerRuntime` satisfies it)
  - `interface HostRuntimeArgs { Consumer: ITransportConsumer; HandlerFactory: () => WorkHandler; Policy: SubscriptionPolicy; Options: ConsumerRuntimeOptions; Log: WorkLogger }`
  - `interface HostSweeper { RunOnce(): Promise<Record<string, number>> }`
  - `interface WorkQueueHostDependencies { ProviderSource: WorkQueueProviderSource; CreateRuntime?; CreateSweeper?; ResolveHandler? }`
  - `interface WorkQueueHostHealth { InstanceID: string; Subscriptions: { Name: string; State: HostedSubscriptionState; Reason: string | null; InFlight: number }[] }`
  - `HOST_SHUT_DOWN_REASON = 'Host is shut down'`
  - `class WorkQueueHost implements IShutdownable` — `constructor(config: WorkQueueHostConfig, engine: WorkQueueHostEngine, contextUser: UserInfo, executor: WorkQueueExecutorSource, log: WorkLogger, dependencies: WorkQueueHostDependencies)`, `static get Active(): WorkQueueHost | null`, `ShutdownName`, `IsStarted`, `Start()`, `Reconcile()`, `RunSweeperOnce()`, `Kick(subscriptionName)`, `GetHealth()`, `Shutdown()`
  - Fake: `FakeRuntime`

Host rules:

| Event | Behavior |
| --- | --- |
| `Start()` | Registers with `ShutdownRegistry`, becomes `WorkQueueHost.Active`, reconciles once, then — **only if `Shutdown()` has not begun meanwhile** — subscribes to `engine.OnPublished` and starts the reconcile and sweeper timers (both `unref`'d). Calling it again is a no-op. |
| `Reconcile()` | Re-plans (Task 2) with a registration **probe**, so no handler is constructed per pass. Runtimes whose subscription is no longer runnable, or whose `Signature` changed, are stopped; new runnable plans are started. Concurrent calls share one pass. A planning failure is logged and keeps the current runtimes. |
| Starting a runnable plan | Open the consumer on `plan.ConsumerDriver`, create the runtime with a `BoundWorkHandler` factory, start it. If creating or starting the runtime throws, the opened consumer is **closed** (it owns an independent executor, 03 §11) before the plan is reported as `Error`; other subscriptions still start. |
| Stopping a runtime | `runtime.Stop()` then `consumer.Close()` — `ConsumerRuntime` does not close its consumer. |
| `engine.OnPublished(topic)` | Kicks every running runtime whose topic name matches (case-insensitive). |
| `Kick(name)` | Kicks that subscription's runtime, if running. |
| Sweeper tick | `RunSweeperOnce()`: never throws; a failure is logged and returns `{}`. The host remembers the in-flight pass. |
| `Shutdown()` | **Idempotent and shared (03 §11): every caller — including one that arrives mid-shutdown — receives the same promise, which resolves only when the drain has finished.** Stops timers, unsubscribes, waits for an in-progress reconcile **and an in-flight sweeper pass**, stops every runtime and closes its consumer in parallel, reports former `Running` states as `Paused` / `Host is shut down`, clears `Active`, unregisters from `ShutdownRegistry`. |

The drain can take up to **2 × `ShutdownDrainMs`** per runtime: plan 04's `ConsumerRuntime.Stop()` waits `ShutdownDrainMs` for handlers to finish, aborts the rest with `'Shutdown'`, then waits `ShutdownDrainMs` again for them to release.

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, merging imports:

```typescript
import type { HostRuntime, HostRuntimeArgs } from '../host/WorkQueueHost';

export class FakeRuntime implements HostRuntime {
    public Started = 0;
    public Stopped = 0;
    public Kicks = 0;
    public InFlightCount = 0;
    /** When set, Stop() waits for it — lets a test hold a shutdown open. */
    public StopGate: Promise<void> | null = null;

    constructor(public readonly Args: HostRuntimeArgs) {}

    public Start(): void {
        this.Started++;
    }

    public async Stop(): Promise<void> {
        this.Stopped++;
        if (this.StopGate) {
            await this.StopGate;
        }
    }

    public Kick(): void {
        this.Kicks++;
    }

    public get SubscriptionName(): string {
        return this.Args.Policy.SubscriptionName;
    }
}
```

- [ ] **Step 2: Write the failing test**

`packages/WorkQueue/engine/src/__tests__/WorkQueueHost.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { ShutdownRegistry } from '@memberjunction/global';
import { WorkQueueHost, type HostSweeper, type WorkQueueHostConfig, type WorkQueueHostDependencies } from '../host/WorkQueueHost';
import {
    BuildHostScenario, FakeRuntime, MakeContext, MakeMessage, RecordingWorkHandler, SilentLogger,
    TEST_PROVIDER, TEST_USER, TestHandlerResolver, type FakeHostEngine,
} from './runtimeFakes';
import { RecordingExecutor } from './fakes';

interface HostHarness {
    Host: WorkQueueHost;
    Runtimes: FakeRuntime[];
    ProviderCalls: () => number;
}

const hosts: WorkQueueHost[] = [];

function makeHost(engine: FakeHostEngine, config: Partial<WorkQueueHostConfig> = {}, dependencies: Partial<WorkQueueHostDependencies> = {}): HostHarness {
    const runtimes: FakeRuntime[] = [];
    let providerCalls = 0;
    const host = new WorkQueueHost(
        {
            InstanceID: 'test-host', Subscriptions: [{ Name: '*', Concurrency: 2 }], IdlePollMinMs: 100, IdlePollMaxMs: 1000,
            ShutdownDrainMs: 500, SweeperIntervalMs: 0, ReconcileIntervalMs: 0, ...config,
        },
        engine, TEST_USER, new RecordingExecutor(), new SilentLogger(),
        {
            ProviderSource: {
                CreateProvider: async (): Promise<IMetadataProvider> => {
                    providerCalls++;
                    return TEST_PROVIDER;
                },
            },
            CreateRuntime: args => {
                const runtime = new FakeRuntime(args);
                runtimes.push(runtime);
                return runtime;
            },
            ResolveHandler: TestHandlerResolver,
            ...dependencies,
        },
    );
    hosts.push(host);
    return { Host: host, Runtimes: runtimes, ProviderCalls: () => providerCalls };
}

function runtimeFor(runtimes: FakeRuntime[], name: string): FakeRuntime {
    const matches = runtimes.filter(r => r.SubscriptionName === name);
    const runtime = matches[matches.length - 1];
    if (!runtime) {
        throw new Error(`no runtime for ${name}`);
    }
    return runtime;
}

function states(host: WorkQueueHost): Record<string, string> {
    return Object.fromEntries(host.GetHealth().Subscriptions.map(s => [s.Name, s.State]));
}

afterEach(async () => {
    for (const host of hosts.splice(0)) {
        await host.Shutdown();
    }
    vi.useRealTimers();
});

describe('WorkQueueHost start', () => {
    it('starts a runtime per runnable subscription and reports every state', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        expect(states(Host)).toEqual({
            'email.ordered': 'Unsupported', 'email.subscriber-update': 'Running', 'integration.apply': 'Running',
            'integration.audit': 'HandlerNotRegistered', 'integration.paused': 'Paused',
        });
        expect(Runtimes.map(r => [r.SubscriptionName, r.Started]).sort()).toEqual([
            ['email.subscriber-update', 1], ['integration.apply', 1],
        ]);
        expect(Host.IsStarted).toBe(true);
        expect(WorkQueueHost.Active).toBe(Host);
        expect(ShutdownRegistry.Instance.List()).toContain(Host);
    });

    it("opens each subscription on its topic's driver and passes the runtime options", async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        expect(scenario.DatabaseDriver.OpenedBindings.map(b => b.Policy.SubscriptionName)).toEqual(['integration.apply']);
        expect(scenario.AwsDriver.OpenedBindings.map(b => b.Policy.SubscriptionName)).toEqual(['email.subscriber-update']);
        expect(runtimeFor(Runtimes, 'integration.apply').Args.Options).toEqual({
            Concurrency: 2, ReceiveBatchSize: 2, IdlePollMinMs: 100, IdlePollMaxMs: 1000, ShutdownDrainMs: 500,
        });
    });

    it('binds each delivery to the context user and a freshly sourced provider, constructing handlers only per delivery', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes, ProviderCalls } = makeHost(Engine);
        await Host.Start();
        await Host.Reconcile();
        const constructedByPlanning = RecordingWorkHandler.Constructed;
        const handler = runtimeFor(Runtimes, 'integration.apply').Args.HandlerFactory();
        expect(await handler.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'Complete' });
        expect(RecordingWorkHandler.LastBoundUserID).toBe(TEST_USER.ID);
        expect(ProviderCalls()).toBe(1);
        expect(RecordingWorkHandler.Constructed).toBe(constructedByPlanning + 1);
    });

    it('reports Error for a subscription whose consumer cannot be opened and still starts the others', async () => {
        const scenario = BuildHostScenario();
        scenario.AwsDriver.OpenError = new Error('queue url missing');
        const { Host } = makeHost(scenario.Engine);
        await Host.Start();
        const health = Host.GetHealth().Subscriptions.find(s => s.Name === 'email.subscriber-update');
        expect(health).toMatchObject({ State: 'Error', Reason: 'queue url missing' });
        expect(states(Host)['integration.apply']).toBe('Running');
    });

    it('closes the opened consumer when the runtime cannot be created', async () => {
        const scenario = BuildHostScenario();
        const { Host } = makeHost(scenario.Engine, { Subscriptions: [{ Name: 'integration.apply', Concurrency: 1 }] }, {
            CreateRuntime: () => {
                throw new Error('runtime refused');
            },
        });
        await Host.Start();
        expect(states(Host)['integration.apply']).toBe('Error');
        expect(scenario.DatabaseDriver.OpenedConsumers.map(c => c.Closed)).toEqual([1]);
    });
});

describe('WorkQueueHost kicks', () => {
    it('kicks a subscription by name and every runtime of a published topic', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        Host.Kick('EMAIL.SUBSCRIBER-UPDATE');
        Engine.EmitPublished('Email.Events');
        expect(runtimeFor(Runtimes, 'email.subscriber-update').Kicks).toBe(2);
        expect(runtimeFor(Runtimes, 'integration.apply').Kicks).toBe(0);
    });
});

describe('WorkQueueHost reconcile', () => {
    it('stops paused subscriptions, closes their consumers and starts newly active ones', async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        Object.assign(scenario.Engine.Subscription('integration.apply'), { Status: 'Paused' });
        Object.assign(scenario.Engine.Subscription('integration.paused'), { Status: 'Active' });
        await Host.Reconcile();
        expect(runtimeFor(Runtimes, 'integration.apply').Stopped).toBe(1);
        expect(scenario.DatabaseDriver.OpenedConsumers[0].Closed).toBe(1);
        expect(runtimeFor(Runtimes, 'integration.paused').Started).toBe(1);
        expect(states(Host)).toMatchObject({ 'integration.apply': 'Paused', 'integration.paused': 'Running' });
    });

    it('restarts a runtime whose binding changed and leaves unchanged runtimes alone', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        const original = runtimeFor(Runtimes, 'email.subscriber-update');
        const untouched = runtimeFor(Runtimes, 'integration.apply');
        Object.assign(Engine.Subscription('email.subscriber-update'), { LeaseSeconds: 120 });
        await Host.Reconcile();
        const replacement = runtimeFor(Runtimes, 'email.subscriber-update');
        expect(original.Stopped).toBe(1);
        expect(replacement).not.toBe(original);
        expect(replacement.Started).toBe(1);
        expect(untouched.Stopped).toBe(0);
        expect(Runtimes).toHaveLength(3);
    });

    it('shares one planning pass between concurrent reconcile calls', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeHost(Engine);
        await Host.Start();
        const beforeShared = Engine.GetDriverCalls;
        await Promise.all([Host.Reconcile(), Host.Reconcile()]);
        const shared = Engine.GetDriverCalls - beforeShared;
        const beforeSingle = Engine.GetDriverCalls;
        await Host.Reconcile();
        expect(shared).toBe(Engine.GetDriverCalls - beforeSingle);
    });
});

describe('WorkQueueHost sweeper and shutdown', () => {
    it('runs the sweeper on its interval and survives a failing pass', async () => {
        vi.useFakeTimers();
        const { Engine } = BuildHostScenario();
        const runOnce = vi.fn<HostSweeper['RunOnce']>()
            .mockResolvedValueOnce({ ExpireLeases: 1 })
            .mockRejectedValue(new Error('deadlock victim'));
        const { Host } = makeHost(Engine, { SweeperIntervalMs: 1000 }, { CreateSweeper: () => ({ RunOnce: runOnce }) });
        await Host.Start();
        await vi.advanceTimersByTimeAsync(1000);
        expect(runOnce).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(runOnce).toHaveBeenCalledTimes(2);
        await expect(Host.RunSweeperOnce()).resolves.toEqual({});
    });

    it('shuts down once, stops every runtime, closes every consumer, clears Active and unregisters', async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        await Host.Shutdown();
        await Host.Shutdown();
        expect(Runtimes.every(r => r.Stopped === 1)).toBe(true);
        expect([...scenario.DatabaseDriver.OpenedConsumers, ...scenario.AwsDriver.OpenedConsumers].every(c => c.Closed === 1)).toBe(true);
        expect(WorkQueueHost.Active).toBeNull();
        expect(ShutdownRegistry.Instance.List()).not.toContain(Host);
        expect(scenario.Engine.ListenerCount).toBe(0);
        expect(Host.IsStarted).toBe(false);
        expect(Host.GetHealth().Subscriptions.find(s => s.Name === 'integration.apply')).toMatchObject({ State: 'Paused', Reason: 'Host is shut down' });
    });

    it('gives a caller that arrives mid-shutdown the same promise, which resolves only after the drain', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine, { Subscriptions: [{ Name: 'integration.apply', Concurrency: 1 }] });
        await Host.Start();
        let openGate: () => void = () => undefined;
        runtimeFor(Runtimes, 'integration.apply').StopGate = new Promise<void>(resolve => { openGate = resolve; });
        const first = Host.Shutdown();
        let secondResolved = false;
        const second = Host.Shutdown().then(() => { secondResolved = true; });
        await Promise.resolve();
        await Promise.resolve();
        expect(secondResolved).toBe(false);
        openGate();
        await Promise.all([first, second]);
        expect(secondResolved).toBe(true);
    });

    it('waits for an in-flight sweeper pass before resolving', async () => {
        const { Engine } = BuildHostScenario();
        let finishSweep: () => void = () => undefined;
        let sweepDone = false;
        const runOnce = (): Promise<Record<string, number>> => new Promise(resolve => {
            finishSweep = () => { sweepDone = true; resolve({}); };
        });
        const { Host } = makeHost(Engine, {}, { CreateSweeper: () => ({ RunOnce: runOnce }) });
        await Host.Start();
        const pass = Host.RunSweeperOnce();
        const shutdown = Host.Shutdown().then(() => sweepDone);
        finishSweep();
        expect(await shutdown).toBe(true);
        await pass;
    });

    it('arms no timers and no publish listener when Shutdown arrives while Start is still reconciling', async () => {
        vi.useFakeTimers();
        const { Engine } = BuildHostScenario();
        const runOnce = vi.fn<HostSweeper['RunOnce']>().mockResolvedValue({});
        const { Host } = makeHost(Engine, { SweeperIntervalMs: 1000, ReconcileIntervalMs: 1000 }, { CreateSweeper: () => ({ RunOnce: runOnce }) });
        const starting = Host.Start();
        const stopping = Host.Shutdown();
        await Promise.all([starting, stopping]);
        await vi.advanceTimersByTimeAsync(5000);
        expect(runOnce).not.toHaveBeenCalled();
        expect(Engine.ListenerCount).toBe(0);
        expect(Host.IsStarted).toBe(false);
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHost`
Expected: FAIL — unresolved import `../host/WorkQueueHost`.

- [ ] **Step 4: Write `src/host/WorkQueueHost.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import { ShutdownRegistry, type IShutdownable } from '@memberjunction/global';
import {
    ConsumerRuntime,
    type ConsumerRuntimeOptions, type ITransportConsumer, type SubscriptionPolicy, type WorkHandler, type WorkLogger,
} from '@memberjunction/work-queue-core';
import { BoundWorkHandler, type WorkHandlerResolver, type WorkQueueProviderSource } from '../handlers/BoundWorkHandler';
import { IsWorkHandlerRegistered, ResolveWorkHandler, type WorkHandlerProbe } from '../handlers/ResolveWorkHandler';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import {
    PlanHostedSubscriptions,
    type HostedSubscriptionPlan, type HostedSubscriptionState, type RunnableSubscriptionPlan, type WorkQueueHostEngine,
} from './HostedSubscriptionPlanner';
import { WorkQueueSweeper } from './WorkQueueSweeper';

export type { HostedSubscriptionState } from './HostedSubscriptionPlanner';

export interface WorkQueueHostConfig {
    InstanceID: string;
    /** Name '*' = every MJWorker subscription. */
    Subscriptions: { Name: string; Concurrency: number }[];
    IdlePollMinMs: number;
    IdlePollMaxMs: number;
    ShutdownDrainMs: number;
    /** 0 disables the sweeper on this instance. */
    SweeperIntervalMs: number;
    /** 0 disables periodic re-planning (Reconcile can still be called directly). */
    ReconcileIntervalMs: number;
}

export interface HostRuntime {
    Start(): void;
    Stop(): Promise<void>;
    Kick(): void;
    readonly InFlightCount: number;
}

export interface HostRuntimeArgs {
    Consumer: ITransportConsumer;
    HandlerFactory: () => WorkHandler;
    Policy: SubscriptionPolicy;
    Options: ConsumerRuntimeOptions;
    Log: WorkLogger;
}

export interface HostSweeper {
    RunOnce(): Promise<Record<string, number>>;
}

export interface WorkQueueHostDependencies {
    ProviderSource: WorkQueueProviderSource;
    CreateRuntime?: (args: HostRuntimeArgs) => HostRuntime;
    CreateSweeper?: () => HostSweeper;
    ResolveHandler?: WorkHandlerResolver;
}

export interface WorkQueueHostHealth {
    InstanceID: string;
    Subscriptions: { Name: string; State: HostedSubscriptionState; Reason: string | null; InFlight: number }[];
}

interface HostedState {
    Name: string;
    State: HostedSubscriptionState;
    Reason: string | null;
}

interface RunningSubscription {
    Plan: RunnableSubscriptionPlan;
    Runtime: HostRuntime;
    Consumer: ITransportConsumer;
}

type IntervalHandle = ReturnType<typeof setInterval>;

/** The Reason a subscription that WAS Running reports after Shutdown(); lets a caller tell "ran" from "never could". */
export const HOST_SHUT_DOWN_REASON = 'Host is shut down';

/**
 * Runs this instance's share of work-queue subscriptions. Every claim is atomic against shared state, so any
 * number of hosts may run the same subscription; each host only decides what IT runs.
 */
export class WorkQueueHost implements IShutdownable {
    private static active: WorkQueueHost | null = null;

    private readonly running = new Map<string, RunningSubscription>();
    private readonly createRuntime: (args: HostRuntimeArgs) => HostRuntime;
    private readonly resolveHandler: WorkHandlerResolver;
    private readonly handlerRegistered: WorkHandlerProbe;
    private states: HostedState[] = [];
    private started = false;
    private shutdownPromise: Promise<void> | null = null;
    private reconciling: Promise<void> | null = null;
    private sweeping: Promise<Record<string, number>> | null = null;
    private reconcileTimer: IntervalHandle | null = null;
    private sweeperTimer: IntervalHandle | null = null;
    private sweeper: HostSweeper | null = null;
    private unsubscribePublished: (() => void) | null = null;

    constructor(
        private readonly config: WorkQueueHostConfig,
        private readonly engine: WorkQueueHostEngine,
        private readonly contextUser: UserInfo,
        private readonly executor: WorkQueueExecutorSource,
        private readonly log: WorkLogger,
        private readonly dependencies: WorkQueueHostDependencies,
    ) {
        this.createRuntime = dependencies.CreateRuntime
            ?? (args => new ConsumerRuntime(args.Consumer, args.HandlerFactory, args.Policy, args.Options, args.Log));
        this.resolveHandler = dependencies.ResolveHandler ?? ResolveWorkHandler;
        // Planning runs on every reconcile, so it must not construct handlers. With the default resolver the
        // ClassFactory answers directly; an injected resolver (tests) is probed once per key and remembered.
        this.handlerRegistered = dependencies.ResolveHandler ? memoizedProbe(dependencies.ResolveHandler) : IsWorkHandlerRegistered;
    }

    /** The most recently started host in this process, for health reporting. */
    public static get Active(): WorkQueueHost | null {
        return WorkQueueHost.active;
    }

    public get ShutdownName(): string {
        return `WorkQueueHost:${this.config.InstanceID}`;
    }

    public get IsStarted(): boolean {
        return this.started;
    }

    public async Start(): Promise<void> {
        if (this.started) {
            return;
        }
        this.started = true;
        this.shutdownPromise = null;
        ShutdownRegistry.Instance.Register(this);
        WorkQueueHost.active = this;
        await this.Reconcile();
        if (this.shutdownPromise) {
            return;   // Shutdown() began while we were reconciling: arm nothing on a host that is going away
        }
        this.unsubscribePublished = this.engine.OnPublished(topicName => this.kickTopic(topicName));
        this.startTimers();
        const runningCount = this.states.filter(s => s.State === 'Running').length;
        this.log.Info(`Host ${this.config.InstanceID} started`, { Running: runningCount, NotRunning: this.states.length - runningCount });
    }

    public Reconcile(): Promise<void> {
        if (!this.started || this.shutdownPromise) {
            return Promise.resolve();
        }
        if (!this.reconciling) {
            this.reconciling = this.reconcileNow().finally(() => {
                this.reconciling = null;
            });
        }
        return this.reconciling;
    }

    public RunSweeperOnce(): Promise<Record<string, number>> {
        if (!this.sweeping) {
            this.sweeping = this.sweepNow().finally(() => {
                this.sweeping = null;
            });
        }
        return this.sweeping;
    }

    public Kick(subscriptionName: string): void {
        this.running.get(key(subscriptionName))?.Runtime.Kick();
    }

    public GetHealth(): WorkQueueHostHealth {
        return {
            InstanceID: this.config.InstanceID,
            Subscriptions: this.states.map(s => ({ ...s, InFlight: this.running.get(key(s.Name))?.Runtime.InFlightCount ?? 0 })),
        };
    }

    /** Idempotent: concurrent callers share one promise, which resolves only when the drain has finished (03 §11). */
    public Shutdown(): Promise<void> {
        if (!this.started) {
            return this.shutdownPromise ?? Promise.resolve();
        }
        this.shutdownPromise ??= this.shutdownNow();
        return this.shutdownPromise;
    }

    private async shutdownNow(): Promise<void> {
        this.stopTimers();
        this.unsubscribePublished?.();
        this.unsubscribePublished = null;
        await Promise.allSettled([this.reconciling ?? Promise.resolve(), this.sweeping ?? Promise.resolve()]);
        const entries = [...this.running.values()];
        this.running.clear();
        await Promise.all(entries.map(entry => this.stopEntry(entry)));
        this.states = this.states.map(s => (s.State === 'Running' ? { Name: s.Name, State: 'Paused', Reason: HOST_SHUT_DOWN_REASON } : s));
        this.started = false;
        if (WorkQueueHost.active === this) {
            WorkQueueHost.active = null;
        }
        ShutdownRegistry.Instance.Unregister(this);
    }

    private async sweepNow(): Promise<Record<string, number>> {
        try {
            this.sweeper ??= this.newSweeper();
            return await this.sweeper.RunOnce();
        } catch (error) {
            this.log.Error('Sweeper pass failed', asError(error));
            return {};
        }
    }

    private async reconcileNow(): Promise<void> {
        let plans: HostedSubscriptionPlan[];
        try {
            plans = await PlanHostedSubscriptions(this.config.Subscriptions, this.engine, this.handlerRegistered);
        } catch (error) {
            this.log.Error('Planning hosted subscriptions failed; keeping current runtimes', asError(error));
            return;
        }
        await this.stopObsolete(plans);
        const next: HostedState[] = [];
        for (const plan of plans) {
            next.push(plan.Kind === 'Runnable' ? await this.ensureRunning(plan) : { Name: plan.Name, State: plan.State, Reason: plan.Reason });
        }
        this.states = next;
    }

    private async stopObsolete(plans: HostedSubscriptionPlan[]): Promise<void> {
        const desired = new Map<string, RunnableSubscriptionPlan>();
        for (const plan of plans) {
            if (plan.Kind === 'Runnable') {
                desired.set(key(plan.Name), plan);
            }
        }
        const stopping: Promise<void>[] = [];
        for (const [name, entry] of this.running) {
            if (desired.get(name)?.Signature !== entry.Plan.Signature) {
                this.running.delete(name);
                stopping.push(this.stopEntry(entry));
            }
        }
        await Promise.all(stopping);
    }

    private async ensureRunning(plan: RunnableSubscriptionPlan): Promise<HostedState> {
        if (this.running.has(key(plan.Name))) {
            return { Name: plan.Name, State: 'Running', Reason: null };
        }
        try {
            this.running.set(key(plan.Name), await this.startEntry(plan));
            return { Name: plan.Name, State: 'Running', Reason: null };
        } catch (error) {
            this.log.Error(`Could not start subscription '${plan.Name}'`, asError(error));
            return { Name: plan.Name, State: 'Error', Reason: asError(error).message };
        }
    }

    private async startEntry(plan: RunnableSubscriptionPlan): Promise<RunningSubscription> {
        const consumer = this.openConsumer(plan);
        try {
            const runtime = this.createRuntime({
                Consumer: consumer,
                HandlerFactory: () => new BoundWorkHandler(plan.HandlerKey, this.contextUser, this.dependencies.ProviderSource, this.resolveHandler),
                Policy: plan.Binding.Policy,
                Options: {
                    Concurrency: plan.Concurrency, ReceiveBatchSize: plan.Concurrency, IdlePollMinMs: this.config.IdlePollMinMs,
                    IdlePollMaxMs: this.config.IdlePollMaxMs, ShutdownDrainMs: this.config.ShutdownDrainMs,
                },
                Log: this.log,
            });
            runtime.Start();
            return { Plan: plan, Runtime: runtime, Consumer: consumer };
        } catch (error) {
            await this.closeConsumer(consumer, plan.Name);   // it owns an independent executor (03 §11) — never leak it
            throw error;
        }
    }

    /** Task 3b wraps this consumer in a delivery budget for RunOnce. */
    private openConsumer(plan: RunnableSubscriptionPlan): ITransportConsumer {
        return plan.ConsumerDriver.OpenConsumer(plan.Binding);
    }

    private async stopEntry(entry: RunningSubscription): Promise<void> {
        try {
            await entry.Runtime.Stop();
        } catch (error) {
            this.log.Error(`Stopping subscription '${entry.Plan.Name}' failed`, asError(error));
        }
        await this.closeConsumer(entry.Consumer, entry.Plan.Name);
    }

    private async closeConsumer(consumer: ITransportConsumer, name: string): Promise<void> {
        try {
            await consumer.Close();
        } catch (error) {
            this.log.Error(`Closing the consumer of subscription '${name}' failed`, asError(error));
        }
    }

    private kickTopic(topicName: string): void {
        for (const entry of this.running.values()) {
            if (key(entry.Plan.Topic.Name) === key(topicName)) {
                entry.Runtime.Kick();
            }
        }
    }

    private startTimers(): void {
        if (this.config.ReconcileIntervalMs > 0) {
            this.reconcileTimer = setInterval(() => void this.Reconcile(), this.config.ReconcileIntervalMs);
            this.reconcileTimer.unref();
        }
        if (this.config.SweeperIntervalMs > 0) {
            this.sweeperTimer = setInterval(() => void this.RunSweeperOnce(), this.config.SweeperIntervalMs);
            this.sweeperTimer.unref();
        }
    }

    private stopTimers(): void {
        for (const timer of [this.reconcileTimer, this.sweeperTimer]) {
            if (timer) {
                clearInterval(timer);
            }
        }
        this.reconcileTimer = null;
        this.sweeperTimer = null;
    }

    private newSweeper(): HostSweeper {
        // Lease-expiry dead letters found by the sweeper are raised through engine.NotifyDeadLettered (03 §11).
        return this.dependencies.CreateSweeper?.() ?? new WorkQueueSweeper(this.executor, this.engine, this.contextUser, this.log);
    }
}

function memoizedProbe(resolve: WorkHandlerResolver): WorkHandlerProbe {
    const known = new Map<string, boolean>();
    return handlerKey => {
        const cached = known.get(handlerKey);
        if (cached !== undefined) {
            return cached;
        }
        const registered = resolve(handlerKey) !== null;
        known.set(handlerKey, registered);
        return registered;
    };
}

function key(value: string): string {
    return value.trim().toLowerCase();
}

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
```

- [ ] **Step 5: Create a compile-only sweeper stub**

Task 4 replaces this file. Write `packages/WorkQueue/engine/src/host/WorkQueueSweeper.ts`:

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export interface WorkQueueSweeperEngine {
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    NotifyDeadLettered(event: DeadLetteredEvent): void;
}

/** Placeholder with the final constructor shape (03 §11); Task 4 supplies the implementation. */
export class WorkQueueSweeper {
    constructor(_executor: WorkQueueExecutorSource, _engine: WorkQueueSweeperEngine, _contextUser: UserInfo, _log: WorkLogger) {}

    public async RunOnce(): Promise<Record<string, number>> {
        return {};
    }
}
```

- [ ] **Step 6: Export the new module**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './host/WorkQueueHost';
export * from './host/WorkQueueSweeper';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHost`
Expected: PASS — WorkQueueHost (14). The sweeper-failure test logs one `error:Sweeper pass failed` line into the `SilentLogger`; nothing prints.

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: all engine suites pass; builds.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): WorkQueueHost with reconcile, kicks, shared shutdown and consumer cleanup"
```

---

### Task 3b: `WorkQueueHost.RunOnce` (one-shot container mode)

**Files:**
- Modify: `packages/WorkQueue/engine/src/host/WorkQueueHost.ts`, `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueHostRunOnce.test.ts`

**Interfaces:**
- Consumes: everything Task 3 produces; `ConsumerRuntime`, `ITransportConsumer`, `LeaseExtension`, `ReceivedDelivery`, `SettleResult`, `WorkProgress`, `WorkQueueConfigurationError`, `WorkJson` (plan 04).
- Produces:
  - `interface RunOnceOptions { MaxDeliveries?: number; IdleExitMs?: number; MaxDurationMs?: number }`
  - `type RunOnceReason = 'MaxDeliveries' | 'Idle' | 'MaxDuration' | 'Shutdown'`
  - `interface RunOnceResult { Processed: number; Reason: RunOnceReason }`
  - `WorkQueueHost.RunOnce(options?: RunOnceOptions): Promise<RunOnceResult>` (03 §11)
  - `WorkQueueHostDependencies.RunOnceTickMs?: number` (poll interval of the exit loop; default 50 ms)
  - Fakes: `ScriptedConsumer` (with `ReceiveDelayMs`), `MakeReceivedDelivery(id)`; `FakeTransportDriver.NextConsumer`

A container job claims a bounded amount of work and exits, so the scheduler (KEDA, ACA jobs, Kubernetes) owns
concurrency and scale-to-zero instead of a long-running host (02 §4.4a). Rules (03 §11):

| Rule | Behavior |
| --- | --- |
| Budget | `MaxDeliveries` caps deliveries **received**. The host wraps every consumer: `Receive(max, …)` takes a **reservation** of at most `MaxDeliveries − received − pending`, asks the driver for that many, and when the call returns converts the reservation into `received` (unused reservations simply lapse). With nothing left to reserve the wrapper returns `[]` without touching the transport, so a job never claims more than it was asked to — even at `Concurrency > 1`. |
| `pending` | Reservations whose `Receive` has **not returned yet**. A reservation is a request, not work: the budget is never "spent" while one is pending. |
| Exit `MaxDeliveries` | Only when `received >= MaxDeliveries` **and** `pending === 0` **and** nothing is in flight. (Treating a *requested* claim as spent made the default `--max 1 --concurrency 1` job exit while its only claim was still on the wire, release the delivery that then arrived, and report "Processed 0".) |
| Exit `Idle` | Only when nothing is in flight, **an empty `Receive` has completed since the last activity** (a delivery received or settled), and `IdleExitMs` (default 5,000) has passed since that activity. A job never declares the queue empty before the transport has actually answered "nothing". |
| `MaxDurationMs` | A wall-clock cap, checked on every tick. It resolves while work may still be in flight; the drain below still runs. |
| Shutdown | An external `Shutdown()` (SIGTERM handler, `ShutdownRegistry`) resolves `Shutdown`. |
| `Processed` | Deliveries **received** by this host (counted when `Receive` returns them). |
| Drain | `RunOnce` always awaits `Shutdown()` in a `finally`, and `Shutdown()` is the shared promise from Task 3, so `RunOnce` never resolves before in-flight handlers settle or hit the drain limit — even when another caller started the shutdown. Released deliveries stay claimable for the next job. |
| Nothing runnable | When no requested subscription reached `Running` (unknown name, `HandlerNotRegistered`, `Unsupported`, `Error`, `Paused`), nothing can ever be received, so `RunOnce` resolves `{ Processed: 0, Reason: 'Idle' }` **immediately** instead of waiting for an empty receive that will never come. The caller tells this apart from an empty queue through `GetHealth()` — `mj queue work` exits non-zero for it (Task 10) |
| Not re-entrant | Calling `RunOnce` on a started host, or with `MaxDeliveries < 1`, throws `WorkQueueConfigurationError`. |

Set `SweeperIntervalMs: 0` and `ReconcileIntervalMs: 0` for job hosts: a short-lived process should not sweep or
re-plan. Leave sweeping to a long-running host.

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, merging imports:

```typescript
/** A consumer the test drives: each Receive hands back the next queued batch, optionally after a delay. */
export class ScriptedConsumer implements ITransportConsumer {
    public readonly Batches: ReceivedDelivery[][] = [];
    public readonly OfferedMax: number[] = [];
    public readonly Completed: string[] = [];
    public readonly Released: string[] = [];
    /** Simulates transport latency: Receive resolves after this many ms (real async I/O, not a microtask). */
    public ReceiveDelayMs = 0;
    public Settled = 0;
    public Closed = 0;

    public async Receive(max: number): Promise<ReceivedDelivery[]> {
        this.OfferedMax.push(max);
        if (this.ReceiveDelayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.ReceiveDelayMs));
        }
        return this.Batches.shift() ?? [];
    }

    public async ExtendLease(): Promise<LeaseExtension> {
        return 'Held';
    }

    public async Complete(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Settled++;
        this.Completed.push(delivery.DeliveryID);
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' };
    }

    public async Retry(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Settled++;
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
    }

    public async DeadLetter(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Settled++;
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'DeadLettered' };
    }

    public async Release(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Settled++;
        this.Released.push(delivery.DeliveryID);
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
    }

    public async AcknowledgeCancel(delivery: ReceivedDelivery): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.Closed++;
    }
}

export function MakeReceivedDelivery(id: string): ReceivedDelivery {
    return {
        Message: MakeMessage({ MessageID: id }),
        DeliveryID: id,
        LeaseToken: `token-${id}`,
        Attempt: 1,
        IsReplay: false,
        LeaseExpiresAt: new Date(Date.now() + 60000),
    };
}
```

In the same file, let a test choose the consumer a driver hands out. In `FakeTransportDriver`, add the field and
use it in `OpenConsumer`:

```typescript
    /** When set, OpenConsumer returns this instead of an InertConsumer (used by the RunOnce tests). */
    public NextConsumer: ITransportConsumer | null = null;
```

```typescript
    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        if (this.OpenError) {
            throw this.OpenError;
        }
        this.OpenedBindings.push(subscription);
        if (this.NextConsumer) {
            return this.NextConsumer as ITransportConsumer<TPayload>;
        }
        const consumer = new InertConsumer<TPayload>();
        this.OpenedConsumers.push(consumer as unknown as InertConsumer);
        return consumer;
    }
```

- [ ] **Step 2: Write the failing test**

`packages/WorkQueue/engine/src/__tests__/WorkQueueHostRunOnce.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ITransportConsumer } from '@memberjunction/work-queue-core';
import { WorkQueueHost, type WorkQueueHostConfig, type WorkQueueHostDependencies } from '../host/WorkQueueHost';
import {
    BuildHostScenario, FakeRuntime, MakeReceivedDelivery, ScriptedConsumer, SilentLogger, TEST_PROVIDER, TEST_USER,
    TestHandlerResolver, type FakeHostEngine,
} from './runtimeFakes';
import { RecordingExecutor } from './fakes';

const SIGNAL = new AbortController().signal;
const hosts: WorkQueueHost[] = [];

interface RunOnceHarness {
    Host: WorkQueueHost;
    Runtimes: FakeRuntime[];
    Consumers: ITransportConsumer[];
}

function hostConfig(config: Partial<WorkQueueHostConfig>): WorkQueueHostConfig {
    return {
        InstanceID: 'job-host', Subscriptions: [{ Name: 'integration.apply', Concurrency: 2 }], IdlePollMinMs: 10,
        IdlePollMaxMs: 20, ShutdownDrainMs: 200, SweeperIntervalMs: 0, ReconcileIntervalMs: 0, ...config,
    };
}

/** One runnable subscription ('integration.apply' on the Database driver) whose consumer the test drives. */
function makeRunOnceHost(engine: FakeHostEngine, config: Partial<WorkQueueHostConfig> = {}, dependencies: Partial<WorkQueueHostDependencies> = {}): RunOnceHarness {
    const runtimes: FakeRuntime[] = [];
    const consumers: ITransportConsumer[] = [];
    const host = new WorkQueueHost(hostConfig(config), engine, TEST_USER, new RecordingExecutor(), new SilentLogger(), {
        ProviderSource: { CreateProvider: async (): Promise<IMetadataProvider> => TEST_PROVIDER },
        ResolveHandler: TestHandlerResolver,
        RunOnceTickMs: 5,
        CreateRuntime: args => {
            consumers.push(args.Consumer);
            const runtime = new FakeRuntime(args);
            runtimes.push(runtime);
            return runtime;
        },
        ...dependencies,
    });
    hosts.push(host);
    return { Host: host, Runtimes: runtimes, Consumers: consumers };
}

/** The same host over a REAL ConsumerRuntime (no CreateRuntime seam): the path `mj queue work --once` runs. */
function makeRealRuntimeHost(engine: FakeHostEngine, concurrency: number): WorkQueueHost {
    const host = new WorkQueueHost(
        hostConfig({ Subscriptions: [{ Name: 'integration.apply', Concurrency: concurrency }] }),
        engine, TEST_USER, new RecordingExecutor(), new SilentLogger(),
        { ProviderSource: { CreateProvider: async (): Promise<IMetadataProvider> => TEST_PROVIDER }, ResolveHandler: TestHandlerResolver, RunOnceTickMs: 1 },
    );
    hosts.push(host);
    return host;
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 2000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for ${label}`);
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

afterEach(async () => {
    for (const host of hosts.splice(0)) {
        await host.Shutdown();
    }
});

describe('WorkQueueHost.RunOnce over a real ConsumerRuntime', () => {
    it('processes the one delivery of the default job (--max 1 --concurrency 1) even though the claim is slower than a tick', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.ReceiveDelayMs = 30;                                   // the claim is real I/O; the exit loop ticks every 1 ms
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const host = makeRealRuntimeHost(scenario.Engine, 1);

        expect(await host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 5000 })).toEqual({ Processed: 1, Reason: 'MaxDeliveries' });
        expect(scripted.Completed).toEqual(['d1']);
        expect(scripted.Released).toEqual([]);                          // the delivery ran; it was not handed back
        expect(scripted.Closed).toBe(1);
    });

    it('exits Idle on an empty queue only after the transport has answered', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.ReceiveDelayMs = 40;                                   // longer than IdleExitMs: idle must wait for the answer
        scenario.DatabaseDriver.NextConsumer = scripted;
        const host = makeRealRuntimeHost(scenario.Engine, 1);

        expect(await host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 10 })).toEqual({ Processed: 0, Reason: 'Idle' });
        expect(scripted.OfferedMax.length).toBeGreaterThanOrEqual(1);
    });
});

describe('WorkQueueHost.RunOnce budget', () => {
    it('never claims more than MaxDeliveries and lets unused reservations lapse', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.Batches.push([MakeReceivedDelivery('d1')], [MakeReceivedDelivery('d2'), MakeReceivedDelivery('d3')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ MaxDeliveries: 3, IdleExitMs: 50 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        const consumer = Consumers[0]!;

        expect((await consumer.Receive(10, 0, SIGNAL)).map(d => d.DeliveryID)).toEqual(['d1']);
        expect(scripted.OfferedMax).toEqual([3]);                       // capped to the budget, not the caller's 10
        expect((await consumer.Receive(10, 0, SIGNAL)).map(d => d.DeliveryID)).toEqual(['d2', 'd3']);
        expect(scripted.OfferedMax).toEqual([3, 2]);                    // the unused reservation lapsed
        expect(await consumer.Receive(10, 0, SIGNAL)).toEqual([]);      // nothing left: the transport is not touched again
        expect(scripted.OfferedMax).toEqual([3, 2]);

        expect(await run).toEqual({ Processed: 3, Reason: 'MaxDeliveries' });
    });

    it('does not exit MaxDeliveries while a reservation is still pending', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.ReceiveDelayMs = 60;
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 5000 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        let settled = false;
        void run.then(() => { settled = true; });
        const receiving = Consumers[0]!.Receive(1, 0, SIGNAL);          // reserved, not yet received
        await new Promise(resolve => setTimeout(resolve, 25));          // several exit-loop ticks pass
        expect(settled).toBe(false);
        expect((await receiving).map(d => d.DeliveryID)).toEqual(['d1']);
        expect(await run).toEqual({ Processed: 1, Reason: 'MaxDeliveries' });
    });

    it('waits for in-flight work and drains the runtime before resolving', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers, Runtimes } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 50 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        Runtimes[0]!.InFlightCount = 1;
        await Consumers[0]!.Receive(5, 0, SIGNAL);

        let settled = false;
        void run.then(() => { settled = true; });
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(settled).toBe(false);                                     // still running the handler

        Runtimes[0]!.InFlightCount = 0;
        expect(await run).toEqual({ Processed: 1, Reason: 'MaxDeliveries' });
        expect(Runtimes[0]!.Stopped).toBe(1);                            // drained through Shutdown()
        expect(Host.IsStarted).toBe(false);
    });
});

describe('WorkQueueHost.RunOnce exits', () => {
    it('does not exit Idle before any receive has completed', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);                        // FakeRuntime never calls Receive
        expect(await Host.RunOnce({ IdleExitMs: 10, MaxDurationMs: 80 })).toEqual({ Processed: 0, Reason: 'MaxDuration' });
    });

    it('exits MaxDuration while work is still arriving', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ IdleExitMs: 10000, MaxDurationMs: 60 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        await Consumers[0]!.Receive(5, 0, SIGNAL);
        expect(await run).toEqual({ Processed: 1, Reason: 'MaxDuration' });
    });

    it('exits Shutdown when another caller stops the host, and resolves only after that drain', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);
        const run = Host.RunOnce({ IdleExitMs: 10000 });
        await waitFor(() => Host.IsStarted, 'the host to start');
        await Host.Shutdown();
        expect(await run).toEqual({ Processed: 0, Reason: 'Shutdown' });
        expect(Host.IsStarted).toBe(false);
    });

    it('returns at once when no requested subscription could run, leaving the reason in GetHealth', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine, { Subscriptions: [{ Name: 'integration.audit', Concurrency: 1 }] });
        expect(await Host.RunOnce({ IdleExitMs: 60000 })).toEqual({ Processed: 0, Reason: 'Idle' });
        expect(Host.GetHealth().Subscriptions).toEqual([
            { Name: 'integration.audit', State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey 'handler.missing'", InFlight: 0 },
        ]);
    });

    it('refuses a started host and a budget below one', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);
        await expect(Host.RunOnce({ MaxDeliveries: 0 })).rejects.toThrow('MaxDeliveries must be an integer >= 1');
        await Host.Start();
        await expect(Host.RunOnce({})).rejects.toThrow('RunOnce cannot be called on a started host');
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHostRunOnce`
Expected: FAIL — `Host.RunOnce is not a function`, and `ScriptedConsumer` / `MakeReceivedDelivery` are unresolved
until Step 1's fakes compile.

- [ ] **Step 4: Add the budget, the consumer wrapper and `RunOnce` to `src/host/WorkQueueHost.ts`**

Extend the core import with the names this step needs:

```typescript
import {
    ConsumerRuntime, WorkQueueConfigurationError,
    type ConsumerRuntimeOptions, type ITransportConsumer, type LeaseExtension, type ReceivedDelivery, type SettleResult,
    type SubscriptionPolicy, type WorkHandler, type WorkJson, type WorkLogger, type WorkProgress,
} from '@memberjunction/work-queue-core';
```

After `WorkQueueHostHealth`, add the one-shot types and the budget:

```typescript
export interface RunOnceOptions {
    /** Stop claiming once this many deliveries have been received. Default: unbounded. */
    MaxDeliveries?: number;
    /** Resolve when nothing is in flight, the transport has answered "empty" and nothing happened for this long. Default 5000. */
    IdleExitMs?: number;
    /** Wall-clock cap; in-flight work is still drained. Default: unbounded. */
    MaxDurationMs?: number;
}

export type RunOnceReason = 'MaxDeliveries' | 'Idle' | 'MaxDuration' | 'Shutdown';

export interface RunOnceResult {
    Processed: number;
    Reason: RunOnceReason;
}

const DEFAULT_IDLE_EXIT_MS = 5000;
const DEFAULT_RUN_ONCE_TICK_MS = 50;

/**
 * Claim budget for one-shot mode. `received` counts deliveries the transport actually returned; `pending` counts
 * reservations whose Receive has not returned yet. The budget is spent only when received reaches the maximum AND
 * nothing is pending — a requested claim is not a delivery.
 */
class RunBudget {
    private pending = 0;
    private received = 0;
    private lastActivityAt = Date.now();
    private emptyReceiveSinceActivity = false;

    constructor(private readonly max: number) {}

    /** Reserve up to `want` claims; 0 when the budget (received + pending) has no room. */
    public Reserve(want: number): number {
        const take = Math.max(0, Math.min(want, this.max - this.received - this.pending));
        this.pending += take;
        return take;
    }

    /** A Receive that reserved `reserved` claims returned `receivedCount` deliveries (or failed: 0). */
    public Resolve(reserved: number, receivedCount: number, answered: boolean): void {
        this.pending -= reserved;
        this.received += receivedCount;
        if (receivedCount > 0) {
            this.NoteActivity();
        } else if (answered) {
            this.emptyReceiveSinceActivity = true;
        }
    }

    public NoteActivity(): void {
        this.lastActivityAt = Date.now();
        this.emptyReceiveSinceActivity = false;
    }

    public get Received(): number {
        return this.received;
    }

    public get Pending(): number {
        return this.pending;
    }

    public get IsReceived(): boolean {
        return this.received >= this.max;
    }

    /** True once the transport has answered "nothing" since the last delivery was received or settled. */
    public get SawEmptyReceive(): boolean {
        return this.emptyReceiveSinceActivity;
    }

    public get IdleMs(): number {
        return Date.now() - this.lastActivityAt;
    }
}

/** Wraps a transport consumer so one-shot mode can cap claims and notice activity. */
class BudgetedConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    constructor(private readonly inner: ITransportConsumer<TPayload>, private readonly budget: RunBudget) {}

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const reserved = this.budget.Reserve(max);
        if (reserved === 0) {
            return [];
        }
        let received: ReceivedDelivery<TPayload>[] = [];
        let answered = false;
        try {
            received = await this.inner.Receive(reserved, waitSeconds, signal);
            answered = true;
            return received;
        } finally {
            this.budget.Resolve(reserved, received.length, answered);
        }
    }

    public ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension> {
        return this.inner.ExtendLease(delivery, leaseSeconds, progress);
    }

    public Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(this.inner.Complete(delivery));
    }

    public Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult> {
        return this.settle(this.inner.Retry(delivery, delaySeconds, error));
    }

    public DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        return this.settle(this.inner.DeadLetter(delivery, reason, error));
    }

    public Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(this.inner.Release(delivery));
    }

    public AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(this.inner.AcknowledgeCancel(delivery));
    }

    public Close(): Promise<void> {
        return this.inner.Close();
    }

    private async settle(work: Promise<SettleResult>): Promise<SettleResult> {
        const result = await work;
        this.budget.NoteActivity();
        return result;
    }
}
```

Add the tick seam to `WorkQueueHostDependencies`:

```typescript
    /** Poll interval of the RunOnce exit loop. Default 50 ms. */
    RunOnceTickMs?: number;
```

Add the budget field beside the other private state:

```typescript
    private budget: RunBudget | null = null;
```

Wrap the consumer — replace the body of `openConsumer`:

```typescript
    private openConsumer(plan: RunnableSubscriptionPlan): ITransportConsumer {
        const consumer = plan.ConsumerDriver.OpenConsumer(plan.Binding);
        return this.budget ? new BudgetedConsumer(consumer, this.budget) : consumer;
    }
```

Add the public method after `Start()`:

```typescript
    /**
     * One-shot mode for container jobs (02 §4.4a): start, receive up to the budget, drain, resolve. The budget counts
     * deliveries RECEIVED, never claims requested, and the run ends only when nothing is pending or in flight (03 §11).
     */
    public async RunOnce(options: RunOnceOptions = {}): Promise<RunOnceResult> {
        if (this.started) {
            throw new WorkQueueConfigurationError('RunOnce cannot be called on a started host; use Start() instead');
        }
        const max = options.MaxDeliveries ?? Number.MAX_SAFE_INTEGER;
        if (!Number.isInteger(max) || max < 1) {
            throw new WorkQueueConfigurationError('MaxDeliveries must be an integer >= 1');
        }
        const budget = new RunBudget(max);
        this.budget = budget;
        const startedAt = Date.now();
        try {
            await this.Start();
            const reason = this.running.size === 0 ? 'Idle' : await this.waitForRunOnceExit(budget, startedAt, options);
            this.log.Info(`Host ${this.config.InstanceID} finished a one-shot run`, { Processed: budget.Received, Reason: reason });
            return { Processed: budget.Received, Reason: reason };
        } finally {
            this.budget = null;
            await this.Shutdown();   // the shared promise: also waits for a drain another caller started
        }
    }
```

And the two private helpers, beside `startEntry`:

```typescript
    private async waitForRunOnceExit(budget: RunBudget, startedAt: number, options: RunOnceOptions): Promise<RunOnceReason> {
        const idleExitMs = options.IdleExitMs ?? DEFAULT_IDLE_EXIT_MS;
        const tickMs = this.dependencies.RunOnceTickMs ?? DEFAULT_RUN_ONCE_TICK_MS;
        for (;;) {
            if (!this.started || this.shutdownPromise) {
                return 'Shutdown';
            }
            if (options.MaxDurationMs !== undefined && Date.now() - startedAt >= options.MaxDurationMs) {
                return 'MaxDuration';
            }
            const quiet = this.inFlightCount() === 0;
            if (quiet && budget.IsReceived && budget.Pending === 0) {
                return 'MaxDeliveries';
            }
            if (quiet && budget.SawEmptyReceive && budget.IdleMs >= idleExitMs) {
                return 'Idle';
            }
            await new Promise(resolve => setTimeout(resolve, tickMs));
        }
    }

    private inFlightCount(): number {
        let total = 0;
        for (const entry of this.running.values()) {
            total += entry.Runtime.InFlightCount;
        }
        return total;
    }
```

Why `quiet` is safe to read between "received" and "running": `ConsumerRuntime` registers the executions for a
batch in the same continuation that receives it, and the exit loop only looks on a timer tick (a macrotask), so by
the time it looks, a received delivery is either in flight or already settled.

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHostRunOnce WorkQueueHost`
Expected: PASS — WorkQueueHostRunOnce (10), WorkQueueHost (14).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/engine/src/host/WorkQueueHost.ts packages/WorkQueue/engine/src/__tests__
git commit -m "feat(work-queue): one-shot RunOnce host mode for container jobs"
```

---

### Task 4: `WorkQueueSweeper`

**Files:**
- Replace: `packages/WorkQueue/engine/src/host/WorkQueueSweeper.ts` (the Task 3 stub)
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueSweeper.test.ts`

**Interfaces:**
- Consumes (plan 05): `WorkQueueExecutorSource`, `WorkQueueSqlExecutor`, `SqlStatement` (`src/sql/WorkQueueSqlExecutor.ts`); `CreateWorkQueueSqlBuilder(context): WorkQueueSqlBuilder` and its `Operator` statements `ExpireLeasesAll()` (**returns only the rows it dead-lettered**, identically on both dialects — 03 §7), `PurgeTerminalDeliveries(batchSize)`, `PurgeOrphanMessages(batchSize)`; `ExecuteWrite` / `ExecuteRows<T>` (`src/sql/sqlExecution.ts`); `ExpiredDeadLetterRow { DeliveryID; SubscriptionID; PartitionKey }` (`src/sql/rows.ts`); `DeadLetteredEvent` (`src/transports/TransportDriverDeps.ts`); `DeduplicationLedger` — `constructor(executor, contextUser)`, `PurgeExpired(batchSize?, maxBatches?)`; **the sweep lock** `TryAcquireSweepLock(source: WorkQueueExecutorSource, contextUser: UserInfo): Promise<SweepLock | null>` with `interface SweepLock { Executor: WorkQueueSqlExecutor; Release(): Promise<void> }` (`src/sql/sweepLock.ts`) — it mints an independent executor (03 §11, F8), holds a **transaction-owned** application lock on a private independent executor (`sp_getapplock @LockOwner = 'Transaction'` / `pg_try_advisory_xact_lock` — MJ providers pool connections, so only a transaction pins one) and hands back a second independent executor as `SweepLock.Executor`, returns `null` when another instance holds it, and `Release()` unlocks and releases the executor; test fake `RecordingExecutor` (`src/__tests__/fakes.ts`). From this plan: `WorkLogger` (plan 04); `FakeSubscription`, `SilentLogger`, `TEST_USER`, `IDS` (runtimeFakes).
- Produces (03 §11):
  - `interface WorkQueueSweeperEngine { readonly Subscriptions: MJWorkQueueSubscriptionEntity[]; NotifyDeadLettered(event: DeadLetteredEvent): void }` (the server `WorkQueueEngine` satisfies it)
  - `interface WorkQueueSweeperOptions { PurgeBatchSize: number; MaxPurgeBatchesPerRun: number; AcquireLock?; CreateLedger? }`, `DEFAULT_SWEEPER_OPTIONS`
  - `class WorkQueueSweeper` — `constructor(executor: WorkQueueExecutorSource, engine: WorkQueueSweeperEngine, contextUser: UserInfo, log: WorkLogger, options?: Partial<WorkQueueSweeperOptions>)`, `RunOnce(): Promise<Record<string, number>>`

The sweeper owns **scheduling and reporting only**; every statement comes from plan 05's operator builder, so the claim path and the sweeper can never disagree about lease expiry.

**One sweeper at a time (03 §7, F9).** A pass first takes the sweep lock; when another instance holds it, the pass is **skipped** and `RunOnce` returns `{}`. Every statement of the pass — and the ledger purge — runs on the lock's own executor, never on the shared provider (03 §11, F8: queue SQL must not ride an ambient transaction), and the lock is released in a `finally`.

| Key | Plan 05 statement | Effect (03 §7) |
| --- | --- | --- |
| `ExpireLeases` | `Operator.ExpireLeasesAll()` | Expired `InFlight` → `Pending` (attempts remain), `DeadLettered` (`LeaseExpired`) or `Discarded` (a cancel was requested and the holder never acknowledged it) across all subscriptions. The statement returns **only the rows it dead-lettered**, so the sweeper reads rows with `ExecuteRows`, raises each through `engine.NotifyDeadLettered` (03 §11) and reports **the number of deliveries dead-lettered by the pass** — not the number of leases that expired |
| `PurgeRetention` | `Operator.PurgeTerminalDeliveries(n)` then `Operator.PurgeOrphanMessages(n)`, each repeated | Terminal deliveries past topic `RetentionDays`, then messages with no delivery left. A purge repeats while a batch deletes exactly `PurgeBatchSize` rows, at most `MaxPurgeBatchesPerRun` times |
| `PurgeDeduplications` | `ledger.PurgeExpired(PurgeBatchSize, MaxPurgeBatchesPerRun)` | Expired ledger rows |

A step that throws is logged and reported as `-1`; later steps still run. A `RunOnce` that starts while another is running in this process also returns `{}`. `OnDeadLettered` is **in-process only** (03 §11): a dead letter raised by this pass reaches listeners in **this** process; alert durably from `WorkQueue.GetSubscriptionStats`.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/engine/src/__tests__/WorkQueueSweeper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { SqlStatement } from '../sql/WorkQueueSqlExecutor';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { WorkQueueSweeper, type WorkQueueSweeperEngine, type WorkQueueSweeperOptions } from '../host/WorkQueueSweeper';
import { RecordingExecutor } from './fakes';
import { FakeSubscription, IDS, SilentLogger, TEST_USER } from './runtimeFakes';

const SWEEPER_SUBSCRIPTION = FakeSubscription({ ID: IDS.IntegrationSubscription, Name: 'integration.apply', TopicID: IDS.IntegrationTopic });

function engine(events: DeadLetteredEvent[] = []): WorkQueueSweeperEngine {
    return { Subscriptions: [SWEEPER_SUBSCRIPTION], NotifyDeadLettered: event => { events.push(event); } };
}

interface LedgerCall {
    BatchSize: number | undefined;
    MaxBatches: number | undefined;
}

interface SweepHarness {
    Options: Partial<WorkQueueSweeperOptions>;
    LedgerCalls: LedgerCall[];
    Released: () => number;
}

/** The pass runs on `lockExecutor` — the executor the sweep lock holds — never on the source passed to the constructor. */
function harness(lockExecutor: RecordingExecutor | null, ledgerResult: number | Error = 0, extra: Partial<WorkQueueSweeperOptions> = {}): SweepHarness {
    const ledgerCalls: LedgerCall[] = [];
    let released = 0;
    return {
        LedgerCalls: ledgerCalls,
        Released: () => released,
        Options: {
            AcquireLock: async () => (lockExecutor ? { Executor: lockExecutor, Release: async () => { released++; } } : null),
            CreateLedger: () => ({
                PurgeExpired: async (batchSize?: number, maxBatches?: number) => {
                    ledgerCalls.push({ BatchSize: batchSize, MaxBatches: maxBatches });
                    if (ledgerResult instanceof Error) {
                        throw ledgerResult;
                    }
                    return ledgerResult;
                },
            }),
            ...extra,
        },
    };
}

function counted(executor: RecordingExecutor, statement: SqlStatement): string {
    return executor.Dialect.AffectedRowCountSQL(statement.SQL, 'AffectedRows');
}

describe('WorkQueueSweeper.RunOnce', () => {
    it("runs plan 05's operator statements in order on the lock's executor and reports counts", async () => {
        const source = new RecordingExecutor();
        const locked = new RecordingExecutor()
            .QueueRows([
                { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: 'venue-42' },
                { DeliveryID: IDS.DeliveryB, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: null },
            ])
            .QueueRows([{ AffectedRows: 3 }])
            .QueueRows([{ AffectedRows: 4 }]);
        const h = harness(locked, 5, { PurgeBatchSize: 10, MaxPurgeBatchesPerRun: 5 });
        const sweeper = new WorkQueueSweeper(source, engine(), TEST_USER, new SilentLogger(), h.Options);
        expect(await sweeper.RunOnce()).toEqual({ ExpireLeases: 2, PurgeRetention: 7, PurgeDeduplications: 5 });

        const operator = CreateWorkQueueSqlBuilder(locked).Operator;
        expect(locked.Calls.map(call => call.SQL)).toEqual([
            operator.ExpireLeasesAll().SQL,
            counted(locked, operator.PurgeTerminalDeliveries(10)),
            counted(locked, operator.PurgeOrphanMessages(10)),
        ]);
        expect(locked.Calls.every(call => call.Options?.isMutation === true)).toBe(true);
        expect(source.Calls).toHaveLength(0);                           // nothing rides the shared provider (F8)
        expect(h.LedgerCalls).toEqual([{ BatchSize: 10, MaxBatches: 5 }]);
        expect(h.Released()).toBe(1);
    });

    it('skips the pass when another instance holds the sweep lock', async () => {
        const source = new RecordingExecutor();
        const h = harness(null);
        const sweeper = new WorkQueueSweeper(source, engine(), TEST_USER, new SilentLogger(), h.Options);
        expect(await sweeper.RunOnce()).toEqual({});
        expect(source.Calls).toHaveLength(0);
        expect(h.LedgerCalls).toEqual([]);
    });

    it('raises every lease-expiry dead letter through the engine, with the subscription name resolved', async () => {
        const locked = new RecordingExecutor().QueueRows([
            { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: 'venue-42' },
            { DeliveryID: IDS.DeliveryB, SubscriptionID: IDS.UnknownSubscription, PartitionKey: null },
        ]);
        const events: DeadLetteredEvent[] = [];
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(events), TEST_USER, new SilentLogger(), harness(locked).Options);
        expect((await sweeper.RunOnce()).ExpireLeases).toBe(2);
        expect(events).toEqual([
            { SubscriptionName: 'integration.apply', DeliveryID: IDS.DeliveryA, Reason: 'LeaseExpired', PartitionKey: 'venue-42' },
            { SubscriptionName: IDS.UnknownSubscription, DeliveryID: IDS.DeliveryB, Reason: 'LeaseExpired', PartitionKey: null },
        ]);
    });

    it('reports zero dead letters when expired leases were only retried or discarded', async () => {
        const locked = new RecordingExecutor().QueueRows([]);
        const events: DeadLetteredEvent[] = [];
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(events), TEST_USER, new SilentLogger(), harness(locked).Options);
        expect((await sweeper.RunOnce()).ExpireLeases).toBe(0);
        expect(events).toEqual([]);
    });

    it('repeats a purge while batches come back full, up to the per-run cap', async () => {
        const locked = new RecordingExecutor()
            .QueueRows([])
            .QueueRows([{ AffectedRows: 10 }])
            .QueueRows([{ AffectedRows: 10 }])
            .QueueRows([{ AffectedRows: 0 }]);
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(), TEST_USER, new SilentLogger(),
            harness(locked, 0, { PurgeBatchSize: 10, MaxPurgeBatchesPerRun: 2 }).Options);
        const result = await sweeper.RunOnce();
        expect(result.PurgeRetention).toBe(20);
        expect(locked.Calls).toHaveLength(4);
    });

    it('works on PostgreSQL with the same step order', async () => {
        const locked = new RecordingExecutor('postgresql');
        const sweeper = new WorkQueueSweeper(new RecordingExecutor('postgresql'), engine(), TEST_USER, new SilentLogger(), harness(locked).Options);
        await sweeper.RunOnce();
        expect(locked.Calls[0].SQL).toBe(CreateWorkQueueSqlBuilder(locked).Operator.ExpireLeasesAll().SQL);
    });

    it('reports a failing step as -1, still runs the rest, and releases the lock', async () => {
        const locked = new RecordingExecutor().QueueError(new Error('deadlock victim'));
        const log = new SilentLogger();
        const h = harness(locked, new Error('ledger down'));
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(), TEST_USER, log, h.Options);
        expect(await sweeper.RunOnce()).toEqual({ ExpireLeases: -1, PurgeRetention: 0, PurgeDeduplications: -1 });
        expect(log.Lines.filter(line => line.startsWith('error:'))).toHaveLength(2);
        expect(h.Released()).toBe(1);
    });

    it('returns an empty result when a pass is already running in this process', async () => {
        let release: () => void = () => {};
        const slow: Partial<WorkQueueSweeperOptions> = {
            ...harness(new RecordingExecutor()).Options,
            CreateLedger: () => ({ PurgeExpired: () => new Promise<number>(resolve => { release = () => resolve(0); }) }),
        };
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(), TEST_USER, new SilentLogger(), slow);
        const first = sweeper.RunOnce();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(await sweeper.RunOnce()).toEqual({});
        release();
        expect(await first).toMatchObject({ PurgeDeduplications: 0 });
    });
});
```

`RecordingExecutor` returns `[]` for calls with no queued response, which `ExecuteWrite` reads as `0` rows and
`ExecuteRows` reads as "nothing was dead-lettered".

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueSweeper`
Expected: FAIL — the Task 3 stub returns `{}` and takes no options argument, so the first assertion reports `expected {} to deeply equal { ExpireLeases: 2, … }`.

- [ ] **Step 3: Replace `src/host/WorkQueueSweeper.ts`**

```typescript
import { UUIDsEqual } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { ExpiredDeadLetterRow } from '../sql/rows';
import { ExecuteRows, ExecuteWrite } from '../sql/sqlExecution';
import { TryAcquireSweepLock, type SweepLock } from '../sql/sweepLock';
import type { OperatorSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource, WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export interface WorkQueueSweeperEngine {
    /** Used only to name a dead-lettered delivery's subscription in the event. */
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    /** Public on the server engine (03 §11); fans out to OnDeadLettered listeners in THIS process. */
    NotifyDeadLettered(event: DeadLetteredEvent): void;
}

export interface WorkQueueSweeperOptions {
    PurgeBatchSize: number;
    MaxPurgeBatchesPerRun: number;
    /** Test seam. Default: plan 05's TryAcquireSweepLock — an independent executor guarded by the transaction-owned sweep lock. */
    AcquireLock?: (source: WorkQueueExecutorSource, contextUser: UserInfo) => Promise<SweepLock | null>;
    /** Test seam. Default: a DeduplicationLedger over the lock's executor. */
    CreateLedger?: (executor: WorkQueueSqlExecutor, contextUser: UserInfo) => Pick<DeduplicationLedger, 'PurgeExpired'>;
}

export const DEFAULT_SWEEPER_OPTIONS: WorkQueueSweeperOptions = { PurgeBatchSize: 1000, MaxPurgeBatchesPerRun: 20 };

/**
 * Idempotent maintenance for the Database transport. Statements come from the operator SQL builder (plan 05);
 * this class takes the sweep lock, sequences the statements on the lock's own executor, repeats purges and
 * reports counts. One sweeper runs at a time across all instances (03 §7).
 */
export class WorkQueueSweeper {
    private running = false;
    private readonly options: WorkQueueSweeperOptions;

    constructor(
        private readonly executor: WorkQueueExecutorSource,
        private readonly engine: WorkQueueSweeperEngine,
        private readonly contextUser: UserInfo,
        private readonly log: WorkLogger,
        options: Partial<WorkQueueSweeperOptions> = {},
    ) {
        this.options = { ...DEFAULT_SWEEPER_OPTIONS, ...options };
    }

    /**
     * Runs one pass. Returns {} when a pass is already running here or another instance holds the sweep lock;
     * a failed step reports -1. ExpireLeases is the number of deliveries the pass DEAD-LETTERED.
     */
    public async RunOnce(): Promise<Record<string, number>> {
        if (this.running) {
            return {};
        }
        this.running = true;
        let lock: SweepLock | null = null;
        try {
            lock = await (this.options.AcquireLock ?? TryAcquireSweepLock)(this.executor, this.contextUser);
            if (!lock) {
                return {};
            }
            return await this.sweep(lock.Executor);
        } finally {
            await this.release(lock);
            this.running = false;
        }
    }

    private async sweep(executor: WorkQueueSqlExecutor): Promise<Record<string, number>> {
        const sql = CreateWorkQueueSqlBuilder(executor).Operator;
        const ledger = (this.options.CreateLedger ?? ((e, user) => new DeduplicationLedger(e, user)))(executor, this.contextUser);
        const result: Record<string, number> = {};
        result.ExpireLeases = await this.step('ExpireLeases', () => this.expireLeases(executor, sql));
        result.PurgeRetention = await this.step('PurgeRetention', () => this.purgeRetention(executor, sql));
        result.PurgeDeduplications = await this.step('PurgeDeduplications', () =>
            ledger.PurgeExpired(this.options.PurgeBatchSize, this.options.MaxPurgeBatchesPerRun));
        this.report(result);
        return result;
    }

    private async step(name: string, work: () => Promise<number>): Promise<number> {
        try {
            return await work();
        } catch (error) {
            this.log.Error(`Sweeper step ${name} failed`, error instanceof Error ? error : new Error(String(error)));
            return -1;
        }
    }

    /**
     * ExpireLeasesAll returns only the deliveries it dead-lettered (03 §7), so every lease-expiry dead letter
     * reaches the engine. Rows returned to Pending, or discarded because a cancel was pending, are not returned.
     */
    private async expireLeases(executor: WorkQueueSqlExecutor, sql: OperatorSqlBuilder): Promise<number> {
        const deadLettered = await ExecuteRows<ExpiredDeadLetterRow>(executor, sql.ExpireLeasesAll(), this.contextUser);
        for (const row of deadLettered) {
            this.engine.NotifyDeadLettered({
                SubscriptionName: this.subscriptionName(row.SubscriptionID),
                DeliveryID: row.DeliveryID,
                Reason: 'LeaseExpired',
                PartitionKey: row.PartitionKey,
            });
        }
        return deadLettered.length;
    }

    /** Falls back to the ID when metadata has not caught up with a subscription created since the last refresh. */
    private subscriptionName(subscriptionID: string): string {
        return this.engine.Subscriptions.find(s => UUIDsEqual(s.ID, subscriptionID))?.Name ?? subscriptionID;
    }

    private async purgeRetention(executor: WorkQueueSqlExecutor, sql: OperatorSqlBuilder): Promise<number> {
        const deliveries = await this.purgeInBatches(executor, size => sql.PurgeTerminalDeliveries(size));
        const messages = await this.purgeInBatches(executor, size => sql.PurgeOrphanMessages(size));
        return deliveries + messages;
    }

    private async purgeInBatches(executor: WorkQueueSqlExecutor, build: (batchSize: number) => SqlStatement): Promise<number> {
        let total = 0;
        for (let batch = 0; batch < this.options.MaxPurgeBatchesPerRun; batch++) {
            const deleted = await ExecuteWrite(executor, build(this.options.PurgeBatchSize), this.contextUser);
            total += deleted;
            if (deleted < this.options.PurgeBatchSize) {
                break;
            }
        }
        return total;
    }

    private async release(lock: SweepLock | null): Promise<void> {
        if (!lock) {
            return;
        }
        try {
            await lock.Release();
        } catch (error) {
            this.log.Error('Releasing the sweep lock failed', error instanceof Error ? error : new Error(String(error)));
        }
    }

    private report(result: Record<string, number>): void {
        const changed = Object.entries(result).filter(([, count]) => count > 0);
        if (changed.length > 0) {
            this.log.Info('Sweeper pass', Object.fromEntries(changed.map(([name, count]) => [name === 'ExpireLeases' ? 'DeadLetteredByLeaseExpiry' : name, count])));
        }
    }
}
```

If plan 05 exported `OperatorSqlBuilder`, `SqlStatement` or the sweep lock from a different module than shown, fix only these imports. If plan 05 has **no** `TryAcquireSweepLock` yet, stop: the sweep lock is 03 §7 behavior owned by the SQL layer — add it there (it must hold the lock on the same session it hands back), not here.

- [ ] **Step 4: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueSweeper`
Expected: PASS — WorkQueueSweeper (8).

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: all engine suites pass (including WorkQueueHost (14)); builds.

- [ ] **Step 5: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): single-instance sweeper for lease expiry, retention and ledger purge"
```

---

### Task 5: Remote-operation metadata

**Files:**
- Create: `metadata/remote-operation-categories/.work-queue-category.json`, `metadata/remote-operations/.work-queue-operations.json`
- Create: 14 type files in `metadata/remote-operations/types/`: `work-queue-get-subscription-stats`, `work-queue-list-dead-letters`, `work-queue-list-partitions`, `work-queue-replay-dead-letter`, `work-queue-discard-delivery`, `work-queue-get-backlog`, `work-queue-validate-bindings` — each `.input.ts` and `.output.ts`
- Regenerate (CodeGen): `packages/MJCoreEntities/src/generated/remote_operations.ts`

**Interfaces:**
- Consumes: scopes `workqueue:read` and `workqueue:operate` (plan 05 metadata); the `MJ: Remote Operations` / `MJ: Remote Operation Categories` metadata conventions already used by `metadata/remote-operations/.remote-operations.json`.
- Produces (CodeGen, exported from `@memberjunction/core-entities`):
  - Bases: `WorkQueueGetSubscriptionStatsOperation`, `WorkQueueListDeadLettersOperation`, `WorkQueueListPartitionsOperation`, `WorkQueueReplayDeadLetterOperation`, `WorkQueueDiscardDeliveryOperation`, `WorkQueueGetBacklogOperation`, `WorkQueueValidateBindingsOperation`
  - Types: each `…Input` / `…Output`, plus `WorkQueueSubscriptionStatsRow`, `WorkQueueStatsFailureRow`, `WorkQueuePayloadRefRow`, `WorkQueueDeadLetterMessageRow`, `WorkQueueDeadLetterRow`, `WorkQueuePartitionStateRow`, `WorkQueueBindingIssueRow`

I/O conventions (03 §8): top-level input and output fields are camelCase, matching `RecordProcess.*` operations; row objects mirror the core contract's PascalCase records field for field so the service can copy them without renaming — except `failures`, whose rows are camelCase `{ subscriptionName, error }` exactly as 03 §8 writes them. Dead-letter rows carry `PayloadJSON` (the inline payload serialized) instead of a recursive JSON type (03 §8). The seven operations are 03 §8's complete list; there is no sequence-skip operation (explicit sequences were cut — `11-revision-4-review.md` S1).

`RequiredScope` is enforced only for **API-key** callers — MJ's resolver scope check is a no-op for an interactive session — so every server class in Task 6 also overrides `Authorize` (03 §8, F7). `RequiresSystemUser` stays `false`: operators are ordinary users with the right entity permissions.

- [ ] **Step 1: Write the category metadata**

`metadata/remote-operation-categories/.work-queue-category.json`:

```json
[
  {
    "fields": {
      "Name": "Work Queue",
      "Description": "Operator actions over the durable work queue: subscription stats, dead letters, replay and discard, partition conditions, the autoscaler backlog and cloud binding validation.",
      "ParentID": null
    },
    "primaryKey": { "ID": "826B85CB-BE74-4716-94A3-1126DBED59AD" }
  }
]
```

- [ ] **Step 2: Write the operation metadata**

`metadata/remote-operations/.work-queue-operations.json`:

```json
[
  {
    "fields": {
      "Name": "Get Work Queue Subscription Stats",
      "OperationKey": "WorkQueue.GetSubscriptionStats",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Returns pending, in-flight and dead-lettered counts (plus blocked keys, oldest pending age and recent completions where the transport supports them) for one work-queue subscription or all of them. Implemented by WorkQueueGetSubscriptionStatsServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueGetSubscriptionStatsInput",
      "InputTypeDefinition": "@file:types/work-queue-get-subscription-stats.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueGetSubscriptionStatsOutput",
      "OutputTypeDefinition": "@file:types/work-queue-get-subscription-stats.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:read",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "7C2CDC24-F6B1-4DF1-B3B5-31364753DBC3" }
  },
  {
    "fields": {
      "Name": "List Work Queue Dead Letters",
      "OperationKey": "WorkQueue.ListDeadLetters",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Pages through one subscription's dead-lettered deliveries with their message, attempts, reason, last error and whether each blocks its partition key. Implemented by WorkQueueListDeadLettersServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueListDeadLettersInput",
      "InputTypeDefinition": "@file:types/work-queue-list-dead-letters.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueListDeadLettersOutput",
      "OutputTypeDefinition": "@file:types/work-queue-list-dead-letters.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:read",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "99F03AEC-821C-470A-B068-597DADC9644B" }
  },
  {
    "fields": {
      "Name": "List Work Queue Partitions",
      "OperationKey": "WorkQueue.ListPartitions",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Pages through one subscription's partition keys that are in flight or blocked by a dead-lettered Ordered head, optionally filtered to one condition. Implemented by WorkQueueListPartitionsServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueListPartitionsInput",
      "InputTypeDefinition": "@file:types/work-queue-list-partitions.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueListPartitionsOutput",
      "OutputTypeDefinition": "@file:types/work-queue-list-partitions.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:read",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "95BD197D-C393-4D82-9914-F216FF4611D8" }
  },
  {
    "fields": {
      "Name": "Replay Work Queue Dead Letter",
      "OperationKey": "WorkQueue.ReplayDeadLetter",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Returns one dead-lettered delivery to Pending with its attempts reset; an Ordered head keeps its position, so its key resumes once the replay completes. Implemented by WorkQueueReplayDeadLetterServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueReplayDeadLetterInput",
      "InputTypeDefinition": "@file:types/work-queue-replay-dead-letter.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueReplayDeadLetterOutput",
      "OutputTypeDefinition": "@file:types/work-queue-replay-dead-letter.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:operate",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "234CA630-1C68-4469-82A0-D3F56004BE1A" }
  },
  {
    "fields": {
      "Name": "Discard Work Queue Delivery",
      "OperationKey": "WorkQueue.DiscardDelivery",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Resolves one delivery without processing it, with a required reason. A pending or dead-lettered delivery becomes Discarded immediately; discarding a dead-lettered Ordered head unblocks its key. An in-flight delivery is cancelled instead (cancelRequested = true): the running handler is told to stop within one heartbeat interval (30 s at most) and the delivery becomes Discarded as soon as the handler acknowledges, or at lease expiry if its worker is gone. Implemented by WorkQueueDiscardDeliveryServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueDiscardDeliveryInput",
      "InputTypeDefinition": "@file:types/work-queue-discard-delivery.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueDiscardDeliveryOutput",
      "OutputTypeDefinition": "@file:types/work-queue-discard-delivery.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:operate",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "FACEE516-41BD-4346-BB6F-07F44CF97E2F" }
  },
  {
    "fields": {
      "Name": "Get Work Queue Backlog",
      "OperationKey": "WorkQueue.GetBacklog",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Returns the autoscaler metric for one subscription: claimable pending deliveries (partition rules applied) plus in-flight deliveries. Both counts matter — schedulers such as KEDA subtract running executions from the metric, so a pending-only count starves the queue. Each count is capped at 1000 (capped = true). Implemented by WorkQueueGetBacklogServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueGetBacklogInput",
      "InputTypeDefinition": "@file:types/work-queue-get-backlog.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueGetBacklogOutput",
      "OutputTypeDefinition": "@file:types/work-queue-get-backlog.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:read",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "6CE1A749-455A-4315-B3DA-44F56D1834C0" }
  },
  {
    "fields": {
      "Name": "Validate Work Queue Bindings",
      "OperationKey": "WorkQueue.ValidateBindings",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Validates work-queue topology and cloud resource bindings: with no transport name, the whole topology; with one, every topic and subscription bound to that transport against the resources it names. Implemented by WorkQueueValidateBindingsServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueValidateBindingsInput",
      "InputTypeDefinition": "@file:types/work-queue-validate-bindings.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueValidateBindingsOutput",
      "OutputTypeDefinition": "@file:types/work-queue-validate-bindings.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:read",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "0CBB434E-D678-4B3A-856A-07FCA23EC22A" }
  }
]
```

- [ ] **Step 3: Write the type files**

```typescript
// metadata/remote-operations/types/work-queue-get-subscription-stats.input.ts
/** Input for `WorkQueue.GetSubscriptionStats`. */
export interface WorkQueueGetSubscriptionStatsInput {
    /** One subscription by name (case-insensitive). Omit for every subscription. */
    subscriptionName?: string;
}
```

```typescript
// metadata/remote-operations/types/work-queue-get-subscription-stats.output.ts
/** One subscription's counts, read from its transport. */
export interface WorkQueueSubscriptionStatsRow {
    SubscriptionName: string;
    Pending: number;
    InFlight: number;
    DeadLettered: number;
    /** Null when the transport cannot count blocked keys. */
    BlockedKeys: number | null;
    /** Null when unknown (always null on AWS in Phase 1). */
    OldestPendingAgeSeconds: number | null;
    /** Null unless the transport keeps completed rows. */
    CompletedLastHour: number | null;
    /** ISO 8601 time the counts were read. */
    AsOf: string;
}

/** A subscription whose stats could not be read. camelCase, as 03 §8 writes it. */
export interface WorkQueueStatsFailureRow {
    subscriptionName: string;
    /** A sanitised message — never raw driver or SQL text. */
    error: string;
}

/** Output of `WorkQueue.GetSubscriptionStats`. */
export interface WorkQueueGetSubscriptionStatsOutput {
    subscriptions: WorkQueueSubscriptionStatsRow[];
    /** Populated only when no subscriptionName was given; a named subscription that fails fails the operation. */
    failures: WorkQueueStatsFailureRow[];
}
```

```typescript
// metadata/remote-operations/types/work-queue-list-dead-letters.input.ts
/** Input for `WorkQueue.ListDeadLetters`. */
export interface WorkQueueListDeadLettersInput {
    /** The subscription to read (case-insensitive). */
    subscriptionName: string;
    /** The nextCursor of a previous page. Omit for the first page. */
    cursor?: string;
    /** 1–500; default 50. */
    pageSize?: number;
}
```

```typescript
// metadata/remote-operations/types/work-queue-list-dead-letters.output.ts
/** Reference to data held outside the queue (claim-check). */
export interface WorkQueuePayloadRefRow {
    Uri: string;
    ContentType?: string;
    SizeBytes?: number;
    Checksum?: string;
}

/** The dead-lettered message envelope. */
export interface WorkQueueDeadLetterMessageRow {
    MessageID: string;
    Topic: string;
    PartitionKey?: string;
    Attributes: Record<string, string>;
    /** The inline payload serialized as JSON, or null when the message carries none. */
    PayloadJSON: string | null;
    PayloadRef?: WorkQueuePayloadRefRow;
    CorrelationID?: string;
    /** ISO 8601 publish time. */
    PublishedAt: string;
}

/** One dead-lettered delivery. */
export interface WorkQueueDeadLetterRow {
    /** Database: MJ: Work Queue Deliveries ID. AWS: the envelope MessageID. */
    DeliveryID: string;
    Message: WorkQueueDeadLetterMessageRow;
    PartitionKey: string | null;
    Attempts: number;
    /** Handler reason, MaxAttemptsExceeded, LeaseExpired, HandlerNotRegistered, RedrivePolicy, InvalidEnvelope, … */
    Reason: string;
    LastError: string | null;
    DeadLetteredAt: string | null;
    /** True when this delivery is the dead-lettered head of an Ordered key (Database transport). */
    BlocksKey: boolean;
}

/** Output of `WorkQueue.ListDeadLetters`. */
export interface WorkQueueListDeadLettersOutput {
    /** False when the subscription's transport cannot list dead letters; items is then empty. */
    supported: boolean;
    items: WorkQueueDeadLetterRow[];
    nextCursor: string | null;
}
```

```typescript
// metadata/remote-operations/types/work-queue-list-partitions.input.ts
/** Input for `WorkQueue.ListPartitions`. */
export interface WorkQueueListPartitionsInput {
    /** The subscription to read (case-insensitive). */
    subscriptionName: string;
    /** Only keys in this condition. Omit for every non-idle key. */
    condition?: 'Idle' | 'InFlight' | 'Blocked';
    /** The nextCursor of a previous page. Omit for the first page. */
    cursor?: string;
    /** 1–500; default 50. */
    pageSize?: number;
}
```

```typescript
// metadata/remote-operations/types/work-queue-list-partitions.output.ts
/** One partition key's derived condition. */
export interface WorkQueuePartitionStateRow {
    PartitionKey: string;
    Condition: 'Idle' | 'InFlight' | 'Blocked';
    /** The head delivery: in flight, or dead-lettered when Blocked. */
    HeadDeliveryID: string | null;
    /** Deliveries waiting behind the head. */
    WaitingItems: number;
}

/** Output of `WorkQueue.ListPartitions`. */
export interface WorkQueueListPartitionsOutput {
    /** False when the subscription's transport cannot list partitions (AWS); items is then empty. */
    supported: boolean;
    items: WorkQueuePartitionStateRow[];
    nextCursor: string | null;
}
```

```typescript
// metadata/remote-operations/types/work-queue-replay-dead-letter.input.ts
/** Input for `WorkQueue.ReplayDeadLetter`. */
export interface WorkQueueReplayDeadLetterInput {
    subscriptionName: string;
    /** A DeliveryID from WorkQueue.ListDeadLetters. */
    deliveryID: string;
    /** Optional operator note stored with the resolution; at most 1000 characters. */
    note?: string;
}
```

```typescript
// metadata/remote-operations/types/work-queue-replay-dead-letter.output.ts
/** Output of `WorkQueue.ReplayDeadLetter`. */
export interface WorkQueueReplayDeadLetterOutput {
    /** False when the subscription's transport cannot replay a single dead letter. */
    supported: boolean;
    /** False when the delivery does not exist or is not dead-lettered. */
    replayed: boolean;
}
```

```typescript
// metadata/remote-operations/types/work-queue-discard-delivery.input.ts
/** Input for `WorkQueue.DiscardDelivery`. */
export interface WorkQueueDiscardDeliveryInput {
    subscriptionName: string;
    /** A pending, dead-lettered or in-flight delivery. */
    deliveryID: string;
    /** Why the work is being dropped. Required; at most 1000 characters. */
    reason: string;
}
```

```typescript
// metadata/remote-operations/types/work-queue-discard-delivery.output.ts
/** Output of `WorkQueue.DiscardDelivery`. */
export interface WorkQueueDiscardDeliveryOutput {
    /** False when the transport cannot discard this kind of delivery (for example any SQS message). */
    supported: boolean;
    /** True when the delivery is now Discarded, or (for an in-flight delivery) its cancel was recorded. */
    discarded: boolean;
    /**
     * True when the delivery was in flight: CancelRequestedAt is set, the running handler's next heartbeat (30 s at
     * most) aborts it with reason 'Cancelled', and the row becomes Discarded when the handler acknowledges — or at
     * lease expiry if its worker is gone (03 §7).
     */
    cancelRequested: boolean;
}
```

```typescript
// metadata/remote-operations/types/work-queue-get-backlog.input.ts
/** Input for `WorkQueue.GetBacklog`. */
export interface WorkQueueGetBacklogInput {
    subscriptionName: string;
}
```

```typescript
// metadata/remote-operations/types/work-queue-get-backlog.output.ts
/** Output of `WorkQueue.GetBacklog` — the autoscaler metric for one subscription. */
export interface WorkQueueGetBacklogOutput {
    /** False when the subscription's transport cannot report a backlog (AWS — scale Lambda from the queue's own metrics). */
    supported: boolean;
    /** Pending deliveries that a worker could claim right now (partition rules applied). */
    claimable: number;
    /** Deliveries currently leased by a worker. */
    inFlight: number;
    /** claimable + inFlight — the value a scheduler should scale on. */
    total: number;
    /** True when either count hit its cap of 1000: the real backlog is at least this large. */
    capped: boolean;
}
```

```typescript
// metadata/remote-operations/types/work-queue-validate-bindings.input.ts
/** Input for `WorkQueue.ValidateBindings`. */
export interface WorkQueueValidateBindingsInput {
    /** Validate only this transport's bindings against its resources. Omit to validate the whole topology. */
    transportName?: string;
}
```

```typescript
// metadata/remote-operations/types/work-queue-validate-bindings.output.ts
/** One validation finding. */
export interface WorkQueueBindingIssueRow {
    Severity: 'Error' | 'Warning';
    /** The topic, subscription or resource the finding is about. */
    Subject: string;
    Message: string;
}

/** Output of `WorkQueue.ValidateBindings`. */
export interface WorkQueueValidateBindingsOutput {
    issues: WorkQueueBindingIssueRow[];
}
```

- [ ] **Step 4: Push the metadata and generate the operation bases**

Push **only** the two folders this task touches, so nothing else in `metadata/` is stamped:

Run: `pnpm exec mj sync push --dir=metadata --include="remote-operation-categories,remote-operations" --ci --dry-run`
Expected: 1 `MJ: Remote Operation Categories` create and 7 `MJ: Remote Operations` creates; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata --include="remote-operation-categories,remote-operations" --ci`
Run: `pnpm exec mj codegen --skipdb`

Run: `grep -oE "export class WorkQueue[A-Za-z]+Operation " packages/MJCoreEntities/src/generated/remote_operations.ts | sort`
Expected — exactly these seven lines:

```
export class WorkQueueDiscardDeliveryOperation 
export class WorkQueueGetBacklogOperation 
export class WorkQueueGetSubscriptionStatsOperation 
export class WorkQueueListDeadLettersOperation 
export class WorkQueueListPartitionsOperation 
export class WorkQueueReplayDeadLetterOperation 
export class WorkQueueValidateBindingsOperation 
```

Run: `grep -cE "export interface WorkQueue(SubscriptionStatsRow|StatsFailureRow|PayloadRefRow|DeadLetterMessageRow|DeadLetterRow|PartitionStateRow|BindingIssueRow) " packages/MJCoreEntities/src/generated/remote_operations.ts`
Expected: `7`.

Run: `cd packages/MJCoreEntities && pnpm run build`
Expected: builds.

- [ ] **Step 5: Revert the `sync` write-back, then commit**

`mj sync push` stamps a `sync` block (`lastModified` + `checksum`) into every JSON file it pushed. Those belong to the release-time consolidated sync; a feature branch must not carry them (`migrations/CLAUDE.md` "Revert the `sync` block write-back", `metadata/CLAUDE.md` rule 1).

Run: `grep -l '"sync"' metadata/remote-operation-categories/.work-queue-category.json metadata/remote-operations/.work-queue-operations.json`
Expected after you delete the stamped `"sync": { … }` objects (and the comma before each) from both files: no output. The existing `metadata/remote-operations/.remote-operations.json` is in the pushed folder too — restore it with a targeted edit if `git diff` shows only `sync` changes in it.

Run: `git status --short metadata packages/MJCoreEntities/src/generated`
Expected: only the two new JSON files, the 14 new type files and `remote_operations.ts`. If CodeGen touched any other generated file, that is unrelated drift from your database — leave it out of this commit.

```bash
git add metadata/remote-operation-categories/.work-queue-category.json metadata/remote-operations/.work-queue-operations.json metadata/remote-operations/types/work-queue-*.ts packages/MJCoreEntities/src/generated/remote_operations.ts
git commit -m "feat(metadata): work queue operator remote operations"
```

---

### Task 6: Operator service and server operations

**Files:**
- Create: `packages/WorkQueue/engine/src/operations/WorkQueueOperatorService.ts`, `src/operations/operatorAuthorization.ts`, `src/operations/WorkQueueOperations.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueOperatorService.test.ts`, `src/__tests__/operatorAuthorization.test.ts`, `src/__tests__/WorkQueueOperations.test.ts`

**Interfaces:**
- Consumes: the Task 5 CodeGen bases and types; `ITransportOperator`, `ITransportDriver`, `OperatorResult`, `Page`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionStateRecord`, `PartitionCondition`, `BindingValidationIssue`, `SubscriptionBinding`, `TopicBinding`, `WorkQueueConfigurationError` (plan 04); `WorkQueueEngine` (plan 05); `BaseRemotableOperation.Authorize(input, user)` (`packages/MJCore/src/generic/baseRemotableOperation.ts:151`), `Metadata.Provider`, `EntityInfo.GetUserPermisions(user)` (`@memberjunction/core`); fakes from Tasks 1–3.
- Produces:
  - `interface WorkQueueOperatorEngine` — `Transports`, `Topics`, `Subscriptions`, `GetSubscriptionByName(name)`, `BuildTopicBinding(topic)`, `BuildSubscriptionBinding(subscription)`, `GetOperator(subscription)`, `GetDriver(transportID)`, `GetBacklog(subscriptionName)`, `ValidateTopology()` (structural subset of `WorkQueueEngine`)
  - `OPERATOR_DEFAULT_PAGE_SIZE = 50`, `OPERATOR_MAX_PAGE_SIZE = 500`, `OPERATOR_MAX_NOTE_LENGTH = 1000`, `OPERATOR_MAX_CURSOR_LENGTH = 500`, `OPERATOR_MAX_NAME_LENGTH = 200` (03 §8 input bounds)
  - `class WorkQueueOperatorService` — `constructor(engine: WorkQueueOperatorEngine)`, `GetSubscriptionStats(input)`, `ListDeadLetters(input)`, `ListPartitions(input)`, `ReplayDeadLetter(input, user)`, `DiscardDelivery(input, user)`, `GetBacklog(input)`, `ValidateBindings(input)` returning the Task 5 output types
  - Server operations registered with `@RegisterClass(BaseRemotableOperation, '<key>')`: `WorkQueueGetSubscriptionStatsServerOperation`, `WorkQueueListDeadLettersServerOperation`, `WorkQueueListPartitionsServerOperation`, `WorkQueueReplayDeadLetterServerOperation`, `WorkQueueDiscardDeliveryServerOperation`, `WorkQueueGetBacklogServerOperation`, `WorkQueueValidateBindingsServerOperation`; `LoadWorkQueueOperations(): void` tree-shaking anchor
  - `type OperatorAccess = 'read' | 'operate'`, `type EntityPermissionLookup = (entityName: string, user: UserInfo) => { CanRead: boolean; CanUpdate: boolean } | null`, `AuthorizeWorkQueueOperator(access: OperatorAccess, user: UserInfo, lookup?: EntityPermissionLookup): boolean`, `OPERATOR_READ_ENTITY = 'MJ: Work Queue Deliveries'`, `OPERATOR_OPERATE_ENTITY = 'MJ: Work Queue Subscriptions'`

Operation rules:

| Operation | Validation (throws `WorkQueueConfigurationError` before any transport call) | Mapping |
| --- | --- | --- |
| every operation | `input` must be a non-null object (a null or non-object input is a validation error, never a `TypeError`); `subscriptionName` ≤ 200 characters | — |
| GetSubscriptionStats | `subscriptionName` optional; unknown name throws | Named: one row, failures `[]`, a transport error fails the operation. All: rows sorted by name; a per-subscription failure becomes a `failures` row `{ subscriptionName, error }` whose `error` is a **sanitised** message (`'Stats are unavailable for this subscription'`) — the raw driver text goes to the server log only |
| ListDeadLetters | `subscriptionName` required; `pageSize` integer 1–500 (default 50); `cursor` ≤ 500 characters | Operator `null` → `supported: false`; payload serialized to `PayloadJSON` |
| ListPartitions | + `condition` one of `Idle`, `InFlight`, `Blocked` | Operator `null` → `supported: false` |
| ReplayDeadLetter | `deliveryID` UUID; `note` ≤ 1000 characters | `{ Supported: false }` → `supported: false, replayed: false`; else `replayed = Changed`. Actor = `user.ID` |
| DiscardDelivery | `deliveryID` UUID; `reason` non-blank, ≤ 1000 characters | `discarded = Changed`, `cancelRequested = CancelRequested === true`. An in-flight delivery is **cancelled**, not discarded on the spot (03 §7): both flags are true, the handler is aborted with `'Cancelled'` within one heartbeat interval, and the row becomes `Discarded` when the runtime acknowledges (or at lease expiry if the holder is gone) |
| GetBacklog | `subscriptionName` required; unknown name throws | `engine.GetBacklog(subscription.Name)` mapped field for field, including `capped`. Never throws for an unsupported transport — it answers `supported: false` with zeros |
| ValidateBindings | `transportName` optional, ≤ 200 characters; unknown name throws | None: `engine.ValidateTopology()`. Named: `driver.ValidateBindings(topicBinding, subscriptionBindings)` for each topic on that transport, sorted by topic name |

**Authorization (03 §8, F7).** MJ's resolver enforces `RequiredScope` only for API-key callers (`ResolverBase.CheckAPIKeyScopeAuthorization` returns early without an `apiKeyHash`), so without more an ordinary logged-in user could replay, discard and read dead-letter payloads. Every server operation therefore overrides `Authorize(input, user)`:

| Operations | Required entity permission |
| --- | --- |
| `GetSubscriptionStats`, `ListDeadLetters`, `ListPartitions`, `GetBacklog`, `ValidateBindings` | **Read** on `MJ: Work Queue Deliveries` |
| `ReplayDeadLetter`, `DiscardDelivery` | **Update** on `MJ: Work Queue Subscriptions` |

The check applies to **every** caller. For an API-key session the resolver has already enforced the scope, and the key's user is — as everywhere in MJ — the ceiling the scope can only narrow. `Authorize` receives no provider, so it reads entity metadata from `Metadata.Provider` (entity permissions are global metadata, identical on every provider). A refusal surfaces as `ResultCode: 'FORBIDDEN'`.

Each server operation configures `WorkQueueEngine` with the invoking provider and user, then delegates to a new `WorkQueueOperatorService`. Validation errors surface as `ResultCode: 'EXECUTION_ERROR'` through `BaseRemotableOperation.ExecuteServer`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/WorkQueueOperatorService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import {
    WorkQueueConfigurationError,
    type BindingValidationIssue, type DeadLetterRecord, type ITransportOperator, type OperatorResult, type Page,
    type PartitionCondition, type PartitionStateRecord, type SubscriptionBinding, type SubscriptionStats, type TopicBinding,
} from '@memberjunction/work-queue-core';
import { WorkQueueOperatorService, type WorkQueueOperatorEngine } from '../operations/WorkQueueOperatorService';
import { BuildHostScenario, FakeHostEngine, TEST_USER, type FakeTransportDriver } from './runtimeFakes';

const DELIVERY_ID = 'DDDDDDDD-4444-4444-8444-000000000001';

const STATS: SubscriptionStats = {
    SubscriptionName: 'set-by-fake', Pending: 4, InFlight: 1, DeadLettered: 2, BlockedKeys: 1,
    OldestPendingAgeSeconds: 30, CompletedLastHour: 12, AsOf: '2026-09-16T12:00:00.000Z',
};

const DEAD_LETTER: DeadLetterRecord = {
    DeliveryID: DELIVERY_ID,
    Message: {
        MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', PartitionKey: 'venue-42',
        Attributes: { source: 'ddx' }, Payload: { batchId: 7 }, PublishedAt: '2026-09-16T11:00:00.000Z',
    },
    PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'bad row 12',
    DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
};

const PARTITION: PartitionStateRecord = {
    PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY_ID, WaitingItems: 3,
};

class FakeOperator implements ITransportOperator {
    public Stats: SubscriptionStats | Error = STATS;
    public DeadLetters: Page<DeadLetterRecord> | null = { Items: [DEAD_LETTER], NextCursor: 'cursor-2' };
    public Partitions: Page<PartitionStateRecord> | null = { Items: [PARTITION], NextCursor: null };
    public Result: OperatorResult = { Supported: true, Changed: true };
    public Calls = 0;
    public LastArgs: Array<string | number | null> = [];

    public async GetStats(binding: SubscriptionBinding): Promise<SubscriptionStats> {
        this.Calls++;
        if (this.Stats instanceof Error) {
            throw this.Stats;
        }
        return { ...this.Stats, SubscriptionName: binding.Policy.SubscriptionName };
    }

    public async ListDeadLetters(_binding: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        this.Calls++;
        this.LastArgs = [cursor, pageSize];
        return this.DeadLetters;
    }

    public async ListPartitions(_binding: SubscriptionBinding, condition: PartitionCondition | null, cursor: string | null, pageSize: number): Promise<Page<PartitionStateRecord> | null> {
        this.Calls++;
        this.LastArgs = [condition, cursor, pageSize];
        return this.Partitions;
    }

    public async Replay(_binding: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        this.Calls++;
        this.LastArgs = [deliveryID, actorUserID, note];
        return this.Result;
    }

    public async Discard(_binding: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        this.Calls++;
        this.LastArgs = [deliveryID, reason, actorUserID];
        return this.Result;
    }
}

class FakeOperatorEngine extends FakeHostEngine implements WorkQueueOperatorEngine {
    public readonly Operators = new Map<string, FakeOperator>();
    public TopologyIssues: BindingValidationIssue[] = [];
    public Backlog = { Supported: true, Claimable: 3, InFlight: 1, Total: 4, Capped: false };

    public async GetBacklog(_subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number; Capped: boolean }> {
        return this.Backlog;
    }

    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined {
        return this.Subscriptions.find(s => s.Name.toLowerCase() === name.trim().toLowerCase());
    }

    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding {
        return { TopicName: topic.Name, IsFifo: false, MaxPayloadBytes: 262144, Config: {} };
    }

    public async GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator> {
        return this.OperatorFor(subscription.Name);
    }

    public async ValidateTopology(): Promise<BindingValidationIssue[]> {
        return this.TopologyIssues;
    }

    public OperatorFor(name: string): FakeOperator {
        let operator = this.Operators.get(name);
        if (!operator) {
            operator = new FakeOperator();
            this.Operators.set(name, operator);
        }
        return operator;
    }
}

interface OperatorScenario {
    Engine: FakeOperatorEngine;
    Service: WorkQueueOperatorService;
    DatabaseDriver: FakeTransportDriver;
}

function scenario(): OperatorScenario {
    const base = BuildHostScenario();
    const engine = new FakeOperatorEngine();
    engine.Transports = base.Engine.Transports;
    engine.Topics = base.Engine.Topics;
    engine.Subscriptions = base.Engine.Subscriptions;
    for (const [id, driver] of base.Engine.Drivers) {
        engine.Drivers.set(id, driver);
    }
    return { Engine: engine, Service: new WorkQueueOperatorService(engine), DatabaseDriver: base.DatabaseDriver };
}

describe('WorkQueueOperatorService stats', () => {
    it('reads one named subscription, matching the name case-insensitively', async () => {
        const { Service } = scenario();
        const output = await Service.GetSubscriptionStats({ subscriptionName: ' INTEGRATION.APPLY ' });
        expect(output.failures).toEqual([]);
        expect(output.subscriptions).toEqual([{ ...STATS, SubscriptionName: 'integration.apply' }]);
    });

    it('reads every subscription in name order and reports per-subscription failures', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('integration.audit').Stats = new Error('view missing');
        const output = await Service.GetSubscriptionStats({});
        expect(output.subscriptions.map(s => s.SubscriptionName)).toEqual([
            'email.dashboard', 'email.ordered', 'email.subscriber-update', 'integration.apply', 'integration.paused',
        ]);
        // camelCase rows (03 §8) carrying a sanitised message: raw driver text never leaves the server
        expect(output.failures).toEqual([{ subscriptionName: 'integration.audit', error: 'Stats are unavailable for this subscription' }]);
    });

    it('rejects an unknown subscription', async () => {
        const { Service } = scenario();
        await expect(Service.GetSubscriptionStats({ subscriptionName: 'nope' })).rejects.toThrow("Unknown work queue subscription 'nope'");
    });
});

describe('WorkQueueOperatorService listings', () => {
    it('maps dead letters, serializing the payload, with the default page size', async () => {
        const { Engine, Service } = scenario();
        const output = await Service.ListDeadLetters({ subscriptionName: 'integration.apply' });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([null, 50]);
        expect(output.supported).toBe(true);
        expect(output.nextCursor).toBe('cursor-2');
        expect(output.items[0]).toEqual({
            DeliveryID: DELIVERY_ID, PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'bad row 12',
            DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
            Message: {
                MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', PartitionKey: 'venue-42',
                Attributes: { source: 'ddx' }, PayloadJSON: '{"batchId":7}', PublishedAt: '2026-09-16T11:00:00.000Z',
            },
        });
    });

    it('answers unsupported when the transport cannot list dead letters', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('email.subscriber-update').DeadLetters = null;
        expect(await Service.ListDeadLetters({ subscriptionName: 'email.subscriber-update', cursor: 'abc', pageSize: 10 }))
            .toEqual({ supported: false, items: [], nextCursor: null });
    });

    it('rejects a page size outside 1–500 and an oversized cursor without calling the transport', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ListDeadLetters({ subscriptionName: 'integration.apply', pageSize: 501 })).rejects.toThrow(WorkQueueConfigurationError);
        await expect(Service.ListDeadLetters({ subscriptionName: 'integration.apply', cursor: 'c'.repeat(501) })).rejects.toThrow('cursor must be at most 500 characters');
        expect((await Service.ListDeadLetters({ subscriptionName: 'integration.apply', pageSize: 500 })).supported).toBe(true);
        Engine.OperatorFor('integration.apply').Calls = 0;
        await expect(Service.ListPartitions({ subscriptionName: 'integration.apply', pageSize: 0 })).rejects.toThrow('pageSize');
        expect(Engine.OperatorFor('integration.apply').Calls).toBe(0);
    });

    it('validates the partition condition and passes it through', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ListPartitions({ subscriptionName: 'integration.apply', condition: 'Stuck' as unknown as 'Blocked' })).rejects.toThrow('condition must be one of');
        const output = await Service.ListPartitions({ subscriptionName: 'integration.apply', condition: 'Blocked', cursor: 'c1', pageSize: 25 });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual(['Blocked', 'c1', 25]);
        expect(output).toEqual({ supported: true, items: [PARTITION], nextCursor: null });
    });
});

describe('WorkQueueOperatorService repairs', () => {
    it('replays by UUID with the acting user and note', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ReplayDeadLetter({ subscriptionName: 'integration.apply', deliveryID: "1'; DROP TABLE x" }, TEST_USER)).rejects.toThrow('deliveryID must be a UUID');
        expect(await Service.ReplayDeadLetter({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, note: 'fixed mapping' }, TEST_USER))
            .toEqual({ supported: true, replayed: true });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([DELIVERY_ID, TEST_USER.ID, 'fixed mapping']);
    });

    it('requires a discard reason and maps an unsupported transport', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: '  ' }, TEST_USER)).rejects.toThrow('reason is required');
        Engine.OperatorFor('email.subscriber-update').Result = { Supported: false };
        expect(await Service.DiscardDelivery({ subscriptionName: 'email.subscriber-update', deliveryID: DELIVERY_ID, reason: 'test data' }, TEST_USER))
            .toEqual({ supported: false, discarded: false, cancelRequested: false });
    });

    it('bounds free-text input and rejects a null input instead of throwing a TypeError', async () => {
        const { Engine, Service } = scenario();
        const long = 'x'.repeat(1001);
        await expect(Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: long }, TEST_USER)).rejects.toThrow('reason must be at most 1000 characters');
        await expect(Service.ReplayDeadLetter({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, note: long }, TEST_USER)).rejects.toThrow('note must be at most 1000 characters');
        await expect(Service.GetBacklog({ subscriptionName: 'n'.repeat(201) })).rejects.toThrow('subscriptionName must be at most 200 characters');
        await expect(Service.ListDeadLetters(null as unknown as { subscriptionName: string })).rejects.toThrow('input must be an object');
        await expect(Service.DiscardDelivery('nope' as unknown as { subscriptionName: string; deliveryID: string; reason: string }, TEST_USER)).rejects.toThrow(WorkQueueConfigurationError);
        expect(Engine.OperatorFor('integration.apply').Calls).toBe(0);
    });

    it('reports a requested cancel when an in-flight delivery is discarded', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('integration.apply').Result = { Supported: true, Changed: true, CancelRequested: true };
        expect(await Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: 'operator cancel' }, TEST_USER))
            .toEqual({ supported: true, discarded: true, cancelRequested: true });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([DELIVERY_ID, 'operator cancel', TEST_USER.ID]);
    });

    it('returns the autoscaler backlog and rejects an unknown subscription', async () => {
        const { Engine, Service } = scenario();
        Engine.Backlog = { Supported: true, Claimable: 1000, InFlight: 2, Total: 1002, Capped: true };
        expect(await Service.GetBacklog({ subscriptionName: ' integration.apply ' }))
            .toEqual({ supported: true, claimable: 1000, inFlight: 2, total: 1002, capped: true });
        Engine.Backlog = { Supported: false, Claimable: 0, InFlight: 0, Total: 0, Capped: false };
        expect(await Service.GetBacklog({ subscriptionName: 'integration.apply' }))
            .toEqual({ supported: false, claimable: 0, inFlight: 0, total: 0, capped: false });
        await expect(Service.GetBacklog({ subscriptionName: 'nope' })).rejects.toThrow("Unknown work queue subscription 'nope'");
    });
});

describe('WorkQueueOperatorService bindings', () => {
    it('validates the whole topology, or one transport topic by topic', async () => {
        const { Engine, DatabaseDriver, Service } = scenario();
        Engine.TopologyIssues = [{ Severity: 'Warning', Subject: 'email.events', Message: 'IsFifo should be 1' }];
        expect(await Service.ValidateBindings({})).toEqual({ issues: Engine.TopologyIssues });

        const seen: Array<[string, string[]]> = [];
        DatabaseDriver.ValidateBindings = async (topic: TopicBinding, subscriptions: SubscriptionBinding[]) => {
            seen.push([topic.TopicName, subscriptions.map(s => s.Policy.SubscriptionName)]);
            return [{ Severity: 'Error', Subject: topic.TopicName, Message: 'table missing' }];
        };
        const output = await Service.ValidateBindings({ transportName: 'database' });
        expect(seen).toEqual([['integration.batch-ready', ['integration.apply', 'integration.audit', 'integration.paused']]]);
        expect(output.issues).toEqual([{ Severity: 'Error', Subject: 'integration.batch-ready', Message: 'table missing' }]);
        await expect(Service.ValidateBindings({ transportName: 'nope' })).rejects.toThrow("Unknown work queue transport 'nope'");
    });
});
```

`packages/WorkQueue/engine/src/__tests__/operatorAuthorization.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    AuthorizeWorkQueueOperator, OPERATOR_OPERATE_ENTITY, OPERATOR_READ_ENTITY, type EntityPermissionLookup,
} from '../operations/operatorAuthorization';
import { TEST_USER } from './runtimeFakes';

function lookup(grants: Record<string, { CanRead: boolean; CanUpdate: boolean }>, seen: string[] = []): EntityPermissionLookup {
    return entityName => {
        seen.push(entityName);
        return grants[entityName] ?? null;
    };
}

describe('AuthorizeWorkQueueOperator', () => {
    it('requires Read on the deliveries entity for read operations', () => {
        const seen: string[] = [];
        expect(AuthorizeWorkQueueOperator('read', TEST_USER, lookup({ [OPERATOR_READ_ENTITY]: { CanRead: true, CanUpdate: false } }, seen))).toBe(true);
        expect(AuthorizeWorkQueueOperator('read', TEST_USER, lookup({ [OPERATOR_READ_ENTITY]: { CanRead: false, CanUpdate: true } }))).toBe(false);
        expect(seen).toEqual(['MJ: Work Queue Deliveries']);
    });

    it('requires Update on the subscriptions entity for operate operations', () => {
        const seen: string[] = [];
        expect(AuthorizeWorkQueueOperator('operate', TEST_USER, lookup({ [OPERATOR_OPERATE_ENTITY]: { CanRead: true, CanUpdate: true } }, seen))).toBe(true);
        expect(AuthorizeWorkQueueOperator('operate', TEST_USER, lookup({ [OPERATOR_OPERATE_ENTITY]: { CanRead: true, CanUpdate: false } }))).toBe(false);
        expect(seen).toEqual(['MJ: Work Queue Subscriptions']);
    });

    it('fails closed when the entity is unknown or the lookup throws', () => {
        expect(AuthorizeWorkQueueOperator('read', TEST_USER, lookup({}))).toBe(false);
        expect(AuthorizeWorkQueueOperator('operate', TEST_USER, () => { throw new Error('metadata not loaded'); })).toBe(false);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/WorkQueueOperations.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { SetOperatorPermissionLookupForTests } from '../operations/operatorAuthorization';
import {
    WorkQueueDiscardDeliveryServerOperation, WorkQueueGetBacklogServerOperation, WorkQueueGetSubscriptionStatsServerOperation,
    WorkQueueListDeadLettersServerOperation, WorkQueueListPartitionsServerOperation, WorkQueueReplayDeadLetterServerOperation,
    WorkQueueValidateBindingsServerOperation,
} from '../operations/WorkQueueOperations';
import { TEST_PROVIDER, TEST_USER } from './runtimeFakes';

interface DeclaredOperation {
    OperationKey: string;
    RequiredScope?: string;
    ExecutionMode: string;
    ExecuteServer(input: never, context: RemoteOpServerContext): Promise<{ Success: boolean; ResultCode: string }>;
}

const OPERATIONS: Array<[string, new () => DeclaredOperation, string]> = [
    ['WorkQueue.GetSubscriptionStats', WorkQueueGetSubscriptionStatsServerOperation, 'workqueue:read'],
    ['WorkQueue.ListDeadLetters', WorkQueueListDeadLettersServerOperation, 'workqueue:read'],
    ['WorkQueue.ListPartitions', WorkQueueListPartitionsServerOperation, 'workqueue:read'],
    ['WorkQueue.ReplayDeadLetter', WorkQueueReplayDeadLetterServerOperation, 'workqueue:operate'],
    ['WorkQueue.DiscardDelivery', WorkQueueDiscardDeliveryServerOperation, 'workqueue:operate'],
    ['WorkQueue.GetBacklog', WorkQueueGetBacklogServerOperation, 'workqueue:read'],
    ['WorkQueue.ValidateBindings', WorkQueueValidateBindingsServerOperation, 'workqueue:read'],
];

function context(user: UserInfo, provider: IMetadataProvider): RemoteOpServerContext {
    return { provider, user, emitProgress: () => undefined };
}

afterEach(() => {
    SetOperatorPermissionLookupForTests(null);
});

describe('work queue remote operations', () => {
    it('register each of the seven server implementations under its operation key', () => {
        expect(OPERATIONS).toHaveLength(7);
        for (const [key, serverClass] of OPERATIONS) {
            expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, key)?.SubClass, key).toBe(serverClass);
        }
    });

    it('declare the scope from metadata as synchronous operations', () => {
        for (const [key, serverClass, scope] of OPERATIONS) {
            const operation = new serverClass();
            expect([operation.OperationKey, operation.RequiredScope, operation.ExecutionMode]).toEqual([key, scope, 'Sync']);
        }
    });

    it('refuse a user without the entity permission before touching the engine (FORBIDDEN)', async () => {
        SetOperatorPermissionLookupForTests(() => ({ CanRead: false, CanUpdate: false }));
        for (const [key, serverClass] of OPERATIONS) {
            const result = await new serverClass().ExecuteServer({} as never, context(TEST_USER, TEST_PROVIDER));
            expect([key, result.Success, result.ResultCode]).toEqual([key, false, 'FORBIDDEN']);
        }
    });

    it('lets a read-only user read but not operate', async () => {
        SetOperatorPermissionLookupForTests(() => ({ CanRead: true, CanUpdate: false }));
        const discard = await new WorkQueueDiscardDeliveryServerOperation().ExecuteServer({} as never, context(TEST_USER, TEST_PROVIDER));
        expect(discard.ResultCode).toBe('FORBIDDEN');
        // A read operation passes Authorize; it then fails later (the engine is not configured in this unit test),
        // which proves the refusal above came from Authorize and not from execution.
        const stats = await new WorkQueueGetBacklogServerOperation().ExecuteServer({} as never, context(TEST_USER, TEST_PROVIDER));
        expect(stats.ResultCode).toBe('EXECUTION_ERROR');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueOperatorService operatorAuthorization WorkQueueOperations`
Expected: FAIL — unresolved imports `../operations/WorkQueueOperatorService`, `../operations/operatorAuthorization` and `../operations/WorkQueueOperations`.

- [ ] **Step 3: Write `src/operations/WorkQueueOperatorService.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type {
    MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity,
    WorkQueueBindingIssueRow, WorkQueueDeadLetterRow, WorkQueueDiscardDeliveryInput, WorkQueueDiscardDeliveryOutput,
    WorkQueueGetBacklogInput, WorkQueueGetBacklogOutput,
    WorkQueueGetSubscriptionStatsInput, WorkQueueGetSubscriptionStatsOutput, WorkQueueListDeadLettersInput,
    WorkQueueListDeadLettersOutput, WorkQueueListPartitionsInput, WorkQueueListPartitionsOutput, WorkQueuePartitionStateRow,
    WorkQueueReplayDeadLetterInput, WorkQueueReplayDeadLetterOutput,
    WorkQueueSubscriptionStatsRow, WorkQueueValidateBindingsInput, WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    NULL_WORK_LOGGER, WorkQueueConfigurationError,
    type BindingValidationIssue, type DeadLetterRecord, type ITransportDriver, type ITransportOperator, type OperatorResult,
    type PartitionCondition, type PartitionStateRecord, type SubscriptionBinding, type SubscriptionStats, type TopicBinding,
    type WorkLogger,
} from '@memberjunction/work-queue-core';

/** The part of WorkQueueEngine the operator needs. WorkQueueEngine satisfies it structurally. */
export interface WorkQueueOperatorEngine {
    readonly Transports: MJWorkQueueTransportEntity[];
    readonly Topics: MJWorkQueueTopicEntity[];
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined;
    BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding;
    BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
    GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator>;
    GetDriver(transportID: string): Promise<ITransportDriver>;
    /** Autoscaler metric (03 §11): claimable pending + in flight, each capped at 1000. */
    GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number; Capped: boolean }>;
    ValidateTopology(): Promise<BindingValidationIssue[]>;
}

export const OPERATOR_DEFAULT_PAGE_SIZE = 50;
export const OPERATOR_MAX_PAGE_SIZE = 500;
/** `reason` / `note` end up in ResolutionNote nvarchar(1000) (03 §6.5). */
export const OPERATOR_MAX_NOTE_LENGTH = 1000;
export const OPERATOR_MAX_CURSOR_LENGTH = 500;
export const OPERATOR_MAX_NAME_LENGTH = 200;
/** What a caller sees when one subscription's stats cannot be read; the real error is logged server-side. */
export const STATS_UNAVAILABLE_MESSAGE = 'Stats are unavailable for this subscription';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTITION_CONDITIONS: readonly PartitionCondition[] = ['Idle', 'InFlight', 'Blocked'];

/**
 * Validates operator input and maps between the transport contract (03 §5.2) and the Remote Operation I/O
 * types (03 §8). Every validation failure throws before any transport call.
 */
export class WorkQueueOperatorService {
    constructor(private readonly engine: WorkQueueOperatorEngine, private readonly log: Pick<WorkLogger, 'Error'> = NULL_WORK_LOGGER) {}

    public async GetSubscriptionStats(input: WorkQueueGetSubscriptionStatsInput): Promise<WorkQueueGetSubscriptionStatsOutput> {
        requireInput(input);
        const name = optionalText(input.subscriptionName, 'subscriptionName', OPERATOR_MAX_NAME_LENGTH);
        if (name) {
            return { subscriptions: [toStatsRow(await this.stats(this.requireSubscription(name)))], failures: [] };
        }
        const output: WorkQueueGetSubscriptionStatsOutput = { subscriptions: [], failures: [] };
        for (const subscription of [...this.engine.Subscriptions].sort(byName)) {
            try {
                output.subscriptions.push(toStatsRow(await this.stats(subscription)));
            } catch (error) {
                // Raw driver text (SQL, ARNs, credentials hints) stays in the server log; the caller gets a fixed message.
                this.log.Error(`Reading stats for subscription '${subscription.Name}' failed`, error instanceof Error ? error : new Error(String(error)));
                output.failures.push({ subscriptionName: subscription.Name, error: STATS_UNAVAILABLE_MESSAGE });
            }
        }
        return output;
    }

    public async ListDeadLetters(input: WorkQueueListDeadLettersInput): Promise<WorkQueueListDeadLettersOutput> {
        const subscription = this.subscriptionOf(input);
        const pageSize = requirePageSize(input.pageSize);
        const cursor = optionalText(input.cursor, 'cursor', OPERATOR_MAX_CURSOR_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const page = await operator.ListDeadLetters(this.binding(subscription), cursor, pageSize);
        return page
            ? { supported: true, items: page.Items.map(toDeadLetterRow), nextCursor: page.NextCursor }
            : { supported: false, items: [], nextCursor: null };
    }

    public async ListPartitions(input: WorkQueueListPartitionsInput): Promise<WorkQueueListPartitionsOutput> {
        const subscription = this.subscriptionOf(input);
        const condition = requireCondition(input.condition);
        const pageSize = requirePageSize(input.pageSize);
        const cursor = optionalText(input.cursor, 'cursor', OPERATOR_MAX_CURSOR_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const page = await operator.ListPartitions(this.binding(subscription), condition, cursor, pageSize);
        return page
            ? { supported: true, items: page.Items.map(toPartitionRow), nextCursor: page.NextCursor }
            : { supported: false, items: [], nextCursor: null };
    }

    public async ReplayDeadLetter(input: WorkQueueReplayDeadLetterInput, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        const subscription = this.subscriptionOf(input);
        const deliveryID = requireUUID(input.deliveryID, 'deliveryID');
        const note = optionalText(input.note, 'note', OPERATOR_MAX_NOTE_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.Replay(this.binding(subscription), deliveryID, user.ID, note);
        return { supported: result.Supported, replayed: changed(result) };
    }

    public async DiscardDelivery(input: WorkQueueDiscardDeliveryInput, user: UserInfo): Promise<WorkQueueDiscardDeliveryOutput> {
        const subscription = this.subscriptionOf(input);
        const deliveryID = requireUUID(input.deliveryID, 'deliveryID');
        const reason = requireText(input.reason, 'reason', OPERATOR_MAX_NOTE_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.Discard(this.binding(subscription), deliveryID, reason, user.ID);
        return { supported: result.Supported, discarded: changed(result), cancelRequested: cancelRequested(result) };
    }

    /**
     * The autoscaler metric. Both numbers matter: schedulers subtract running executions from the metric, so a
     * claimable-only count scales to zero while work is still in flight and starves the queue (02 §4.4a).
     */
    public async GetBacklog(input: WorkQueueGetBacklogInput): Promise<WorkQueueGetBacklogOutput> {
        const subscription = this.subscriptionOf(input);
        const backlog = await this.engine.GetBacklog(subscription.Name);
        return { supported: backlog.Supported, claimable: backlog.Claimable, inFlight: backlog.InFlight, total: backlog.Total, capped: backlog.Capped };
    }

    public async ValidateBindings(input: WorkQueueValidateBindingsInput): Promise<WorkQueueValidateBindingsOutput> {
        requireInput(input);
        const transportName = optionalText(input.transportName, 'transportName', OPERATOR_MAX_NAME_LENGTH);
        if (!transportName) {
            return { issues: (await this.engine.ValidateTopology()).map(toIssueRow) };
        }
        const transport = this.engine.Transports.find(t => t.Name.trim().toLowerCase() === transportName.toLowerCase());
        if (!transport) {
            throw new WorkQueueConfigurationError(`Unknown work queue transport '${transportName}'`);
        }
        const driver = await this.engine.GetDriver(transport.ID);
        const issues: BindingValidationIssue[] = [];
        for (const topic of this.engine.Topics.filter(t => UUIDsEqual(t.TransportID, transport.ID)).sort(byName)) {
            const subscriptions = this.engine.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topic.ID)).sort(byName).map(s => this.binding(s));
            issues.push(...(await driver.ValidateBindings(this.engine.BuildTopicBinding(topic), subscriptions)));
        }
        return { issues: issues.map(toIssueRow) };
    }

    private async stats(subscription: MJWorkQueueSubscriptionEntity): Promise<SubscriptionStats> {
        const operator = await this.engine.GetOperator(subscription);
        return operator.GetStats(this.binding(subscription));
    }

    private binding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding {
        return this.engine.BuildSubscriptionBinding(subscription);
    }

    /** Validates the input object and its subscriptionName, then resolves the subscription. */
    private subscriptionOf(input: { subscriptionName: string }): MJWorkQueueSubscriptionEntity {
        requireInput(input);
        return this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName', OPERATOR_MAX_NAME_LENGTH));
    }

    private requireSubscription(name: string): MJWorkQueueSubscriptionEntity {
        const subscription = this.engine.GetSubscriptionByName(name);
        if (!subscription) {
            throw new WorkQueueConfigurationError(`Unknown work queue subscription '${name}'`);
        }
        return subscription;
    }
}

function toStatsRow(stats: SubscriptionStats): WorkQueueSubscriptionStatsRow {
    return {
        SubscriptionName: stats.SubscriptionName, Pending: stats.Pending, InFlight: stats.InFlight, DeadLettered: stats.DeadLettered,
        BlockedKeys: stats.BlockedKeys, OldestPendingAgeSeconds: stats.OldestPendingAgeSeconds,
        CompletedLastHour: stats.CompletedLastHour, AsOf: stats.AsOf,
    };
}

function toDeadLetterRow(record: DeadLetterRecord): WorkQueueDeadLetterRow {
    const message = record.Message;
    return {
        DeliveryID: record.DeliveryID, PartitionKey: record.PartitionKey, Attempts: record.Attempts, Reason: record.Reason,
        LastError: record.LastError, DeadLetteredAt: record.DeadLetteredAt, BlocksKey: record.BlocksKey,
        Message: {
            MessageID: message.MessageID, Topic: message.Topic, PartitionKey: message.PartitionKey,
            Attributes: { ...message.Attributes },
            PayloadJSON: message.Payload === undefined ? null : JSON.stringify(message.Payload),
            PayloadRef: message.PayloadRef ? { ...message.PayloadRef } : undefined,
            CorrelationID: message.CorrelationID, PublishedAt: message.PublishedAt,
        },
    };
}

function toPartitionRow(record: PartitionStateRecord): WorkQueuePartitionStateRow {
    return {
        PartitionKey: record.PartitionKey, Condition: record.Condition, HeadDeliveryID: record.HeadDeliveryID,
        WaitingItems: record.WaitingItems,
    };
}

function toIssueRow(issue: BindingValidationIssue): WorkQueueBindingIssueRow {
    return { Severity: issue.Severity, Subject: issue.Subject, Message: issue.Message };
}

function changed(result: OperatorResult): boolean {
    return result.Supported ? result.Changed : false;
}

/** True when the operator asked a running handler to stop (CancelRequestedAt set) instead of settling the row (03 §7). */
function cancelRequested(result: OperatorResult): boolean {
    return result.Supported ? result.CancelRequested === true : false;
}

/** A null or non-object input is a validation error (03 §8), never a TypeError from a property read. */
function requireInput(input: unknown): void {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new WorkQueueConfigurationError('input must be an object');
    }
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    const text = value.trim();
    if (text.length > maxLength) {
        throw new WorkQueueConfigurationError(`${field} must be at most ${maxLength} characters`);
    }
    return text;
}

function requireText(value: unknown, field: string, maxLength: number): string {
    const text = optionalText(value, field, maxLength);
    if (text === null) {
        throw new WorkQueueConfigurationError(`${field} is required`);
    }
    return text;
}

function requireUUID(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
        throw new WorkQueueConfigurationError(`${field} must be a UUID`);
    }
    return value.trim();
}

function requirePageSize(value: unknown): number {
    if (value === undefined || value === null) {
        return OPERATOR_DEFAULT_PAGE_SIZE;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > OPERATOR_MAX_PAGE_SIZE) {
        throw new WorkQueueConfigurationError(`pageSize must be an integer between 1 and ${OPERATOR_MAX_PAGE_SIZE}`);
    }
    return value;
}

function requireCondition(value: unknown): PartitionCondition | null {
    const text = optionalText(value, 'condition', OPERATOR_MAX_NAME_LENGTH);
    if (text === null) {
        return null;
    }
    const condition = PARTITION_CONDITIONS.find(c => c === text);
    if (!condition) {
        throw new WorkQueueConfigurationError(`condition must be one of ${PARTITION_CONDITIONS.join(', ')}`);
    }
    return condition;
}

function byName(a: { Name: string }, b: { Name: string }): number {
    return a.Name.localeCompare(b.Name);
}
```

- [ ] **Step 4: Write `src/operations/operatorAuthorization.ts`**

```typescript
import { Metadata, type UserInfo } from '@memberjunction/core';

export type OperatorAccess = 'read' | 'operate';

/** Read operations expose delivery rows (payloads may hold PII), so they require Read on the deliveries entity. */
export const OPERATOR_READ_ENTITY = 'MJ: Work Queue Deliveries';
/** Replay and discard change what a subscription processes, so they require Update on the subscriptions entity. */
export const OPERATOR_OPERATE_ENTITY = 'MJ: Work Queue Subscriptions';

export type EntityPermissionLookup = (entityName: string, user: UserInfo) => { CanRead: boolean; CanUpdate: boolean } | null;

/**
 * BaseRemotableOperation.Authorize receives no provider, so entity metadata comes from Metadata.Provider. Entity
 * permissions are global metadata — identical on every provider of the process — so this is not a multi-provider hazard.
 */
const metadataLookup: EntityPermissionLookup = (entityName, user) => {
    const entity = Metadata.Provider.EntityByName(entityName);
    return entity ? entity.GetUserPermisions(user) : null;
};

let testLookup: EntityPermissionLookup | null = null;

/** Unit tests only: replace the metadata lookup (pass null to restore it). */
export function SetOperatorPermissionLookupForTests(lookup: EntityPermissionLookup | null): void {
    testLookup = lookup;
}

/**
 * 03 §8 (F7): MJ's resolver checks RequiredScope only for API-key callers, so every work-queue operation also
 * requires an entity permission of the acting user. Fails closed: an unknown entity or a lookup error refuses.
 */
export function AuthorizeWorkQueueOperator(access: OperatorAccess, user: UserInfo, lookup: EntityPermissionLookup = testLookup ?? metadataLookup): boolean {
    try {
        const permissions = lookup(access === 'read' ? OPERATOR_READ_ENTITY : OPERATOR_OPERATE_ENTITY, user);
        if (!permissions) {
            return false;
        }
        return access === 'read' ? permissions.CanRead === true : permissions.CanUpdate === true;
    } catch {
        return false;
    }
}
```

- [ ] **Step 4b: Write `src/operations/WorkQueueOperations.ts`**

```typescript
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueGetSubscriptionStatsOperation,
    WorkQueueListDeadLettersOperation, WorkQueueListPartitionsOperation, WorkQueueReplayDeadLetterOperation,
    WorkQueueValidateBindingsOperation,
    type WorkQueueGetBacklogInput, type WorkQueueGetBacklogOutput,
    type WorkQueueDiscardDeliveryInput, type WorkQueueDiscardDeliveryOutput, type WorkQueueGetSubscriptionStatsInput,
    type WorkQueueGetSubscriptionStatsOutput, type WorkQueueListDeadLettersInput, type WorkQueueListDeadLettersOutput,
    type WorkQueueListPartitionsInput, type WorkQueueListPartitionsOutput, type WorkQueueReplayDeadLetterInput,
    type WorkQueueReplayDeadLetterOutput, type WorkQueueValidateBindingsInput, type WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { WorkQueueEngine } from '../WorkQueueEngine';
import { AuthorizeWorkQueueOperator } from './operatorAuthorization';
import { WorkQueueOperatorService } from './WorkQueueOperatorService';

const OPERATIONS_LOG = new MJWorkLogger('[WorkQueue:Operations]');

/**
 * An operator service over WorkQueueEngine. The engine keeps the identity it was configured with (the host's system
 * user); `user` here only loads metadata when nothing has configured the engine yet, and is the ACTOR recorded on
 * replay/discard.
 */
async function serviceFor(provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueOperatorService> {
    await WorkQueueEngine.Instance.Config(false, user, provider);
    return new WorkQueueOperatorService(WorkQueueEngine.Instance, OPERATIONS_LOG);
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetSubscriptionStats')
export class WorkQueueGetSubscriptionStatsServerOperation extends WorkQueueGetSubscriptionStatsOperation {
    protected override async Authorize(_input: WorkQueueGetSubscriptionStatsInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected async InternalExecute(input: WorkQueueGetSubscriptionStatsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetSubscriptionStatsOutput> {
        return (await serviceFor(provider, user)).GetSubscriptionStats(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListDeadLetters')
export class WorkQueueListDeadLettersServerOperation extends WorkQueueListDeadLettersOperation {
    protected override async Authorize(_input: WorkQueueListDeadLettersInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected async InternalExecute(input: WorkQueueListDeadLettersInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListDeadLettersOutput> {
        return (await serviceFor(provider, user)).ListDeadLetters(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListPartitions')
export class WorkQueueListPartitionsServerOperation extends WorkQueueListPartitionsOperation {
    protected override async Authorize(_input: WorkQueueListPartitionsInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected async InternalExecute(input: WorkQueueListPartitionsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListPartitionsOutput> {
        return (await serviceFor(provider, user)).ListPartitions(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ReplayDeadLetter')
export class WorkQueueReplayDeadLetterServerOperation extends WorkQueueReplayDeadLetterOperation {
    protected override async Authorize(_input: WorkQueueReplayDeadLetterInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('operate', user);
    }

    protected async InternalExecute(input: WorkQueueReplayDeadLetterInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        return (await serviceFor(provider, user)).ReplayDeadLetter(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.DiscardDelivery')
export class WorkQueueDiscardDeliveryServerOperation extends WorkQueueDiscardDeliveryOperation {
    protected override async Authorize(_input: WorkQueueDiscardDeliveryInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('operate', user);
    }

    protected async InternalExecute(input: WorkQueueDiscardDeliveryInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueDiscardDeliveryOutput> {
        return (await serviceFor(provider, user)).DiscardDelivery(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetBacklog')
export class WorkQueueGetBacklogServerOperation extends WorkQueueGetBacklogOperation {
    protected override async Authorize(_input: WorkQueueGetBacklogInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected async InternalExecute(input: WorkQueueGetBacklogInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetBacklogOutput> {
        return (await serviceFor(provider, user)).GetBacklog(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ValidateBindings')
export class WorkQueueValidateBindingsServerOperation extends WorkQueueValidateBindingsOperation {
    protected override async Authorize(_input: WorkQueueValidateBindingsInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected async InternalExecute(input: WorkQueueValidateBindingsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueValidateBindingsOutput> {
        return (await serviceFor(provider, user)).ValidateBindings(input);
    }
}

/** Tree-shaking anchor for hosts that import the engine without a generated manifest. */
export function LoadWorkQueueOperations(): void {
    // intentionally empty
}
```

Null inputs are not defaulted to `{}` here: the service rejects a non-object input itself (03 §8), so every operation answers a missing body the same way. `MJWorkLogger` is plan 05's (`src/logging/MJWorkLogger.ts`).

- [ ] **Step 5: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './operations/WorkQueueOperatorService';
export * from './operations/operatorAuthorization';
export * from './operations/WorkQueueOperations';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueOperatorService operatorAuthorization WorkQueueOperations`
Expected: PASS — WorkQueueOperatorService (13), operatorAuthorization (3), WorkQueueOperations (4).

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: all suites pass; builds. A type error saying `WorkQueueEngine` is not assignable to `WorkQueueOperatorEngine` means plan 05's engine drifted from 03 §11 — fix the engine, not this interface.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): operator service and authorized remote operations"
```

---

### Task 7: MJServer configuration and host startup

**Files:**
- Create: `packages/MJServer/src/services/workQueueConfig.ts`, `packages/MJServer/src/services/WorkQueueHostService.ts`
- Modify: `packages/MJServer/package.json`, `packages/MJServer/src/config.ts`, `packages/MJServer/src/index.ts`
- Test: `packages/MJServer/src/__tests__/WorkQueueHostService.test.ts`

**Interfaces:**
- Consumes: `WorkQueueHost`, `WorkQueueHostConfig`, `WorkQueueProviderSource` (Tasks 1–3); `WorkQueueEngine`, `MJWorkLogger` (plan 05); `TaskGraphProviderFactory` (`packages/MJServer/src/services/TaskGraphProviderFactory.ts` — mints a `SQLServerDataProvider` over the shared pool); `UserCache` (`@memberjunction/generic-database-provider`); `ShutdownRegistry` drain in `serve()`'s `gracefulShutdown` (already present).
- Produces:
  - `workQueueSchema`, `workQueueSubscriptionEntrySchema`, `type WorkQueueConfig`, `DEFAULT_WORK_QUEUE_CONFIG` (`services/workQueueConfig.ts`); `configInfo.workQueue`; `export type { WorkQueueConfig }` from `config.ts`
  - `WORK_QUEUE_DISABLE_ENV = 'MJ_DISABLE_WORK_QUEUE_HOST'`, `IsWorkQueueHostDisabledByEnv(env)`, `CreateWorkQueueInstanceID(env?)`, `BuildWorkQueueHostConfig(config, instanceID): WorkQueueHostConfig`
  - `class MJServerWorkQueueProviderSource implements WorkQueueProviderSource` — `constructor(pool: sql.ConnectionPool | null, fallback: IMetadataProvider)`
  - `interface StartableWorkQueueHost { Start(): Promise<void> }`, `interface WorkQueueHostStartDependencies`, `DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES`
  - `StartWorkQueueHost(config, provider: DatabaseProviderBase, providerSource, dependencies?): Promise<StartableWorkQueueHost | null>`

Configuration (`mj.config.cjs`):

```javascript
workQueue: {
  enabled: false,                         // run a WorkQueueHost in this process
  systemUserEmail: 'system@example.org',  // REQUIRED when enabled — see "System user" below
  subscriptions: [{ name: '*', concurrency: 4 }],   // '*' = every MJWorker subscription; name entries override
  idlePollMinMs: 250,
  idlePollMaxMs: 5000,
  shutdownDrainMs: 8000,                  // per-runtime drain; the host can take up to 2× this — see "Shutdown" below
  sweeperEnabled: true,
  sweeperIntervalMs: 60000,
  reconcileIntervalMs: 30000,             // 0 = only plan at startup
}
```

**System user.** Handlers run as this user (03 §3, F7), and the REST extension configures the engine with it. Like `scheduledJobs` and `integrationSyncWorker`, the section's **effective** default is `not.set@nowhere.com`: `DEFAULT_SERVER_CONFIG` is the merge base (`config.ts` `mergeConfigs(DEFAULT_SERVER_CONFIG, …)`), so the zod default `system@memberjunction.org` only applies when the whole section is absent from the merged object. Set `systemUserEmail` explicitly; with the placeholder, `StartWorkQueueHost` fails fast with a message that says so.

**Shutdown.** `serve()`'s `gracefulShutdown` **awaits** `ShutdownRegistry.Instance.ShutdownAll()` and only afterwards closes the HTTP server and arms its 10-second forced exit (`packages/MJServer/src/index.ts`, the block after `ShutdownAll()`), so the forced exit does **not** bound the host's drain. The host's drain is bounded by itself: up to `2 × shutdownDrainMs` per runtime (drain, abort with `'Shutdown'`, drain again — Task 3), all runtimes in parallel. Two consequences to plan for: the process supervisor's termination grace period must exceed `2 × shutdownDrainMs` plus the other registered services, and **HTTP keeps accepting publishes while the host drains** — that is safe (a publish is durable once accepted; another instance or the next start consumes it).

Startup rules:

| Condition | Result |
| --- | --- |
| `workQueue.enabled` false | Nothing starts (publishing still works — plan 05 / Task 9) |
| `MJ_DISABLE_WORK_QUEUE_HOST=1` | Logged; nothing starts. Used by integration runs whose bundles drive their own hosts, mirroring `MJ_DISABLE_TASK_GRAPH_DISPATCHER` |
| System user missing (including the `not.set@nowhere.com` placeholder) | Throws `System user not found with email: … — set workQueue.systemUserEmail`; `serve()` logs `❌ Failed to start the work queue host` and keeps serving |
| Otherwise | `WorkQueueEngine.Instance.Config(false, user, provider)`, then `engine.ValidateTopology()` with every `Error`-severity issue logged (it includes the SQL Server `READ_COMMITTED_SNAPSHOT` prerequisite — 03 §7, F9), then a `WorkQueueHost` with instance ID `<HOSTNAME or os.hostname()>-<pid>-<8 hex>` (unique even when containers share pid 1), started after `listen()`. Per-delivery providers come from `TaskGraphProviderFactory` on SQL Server; PostgreSQL hosts share the server provider until PG per-request providers are lifted out of `context.ts` |

- [ ] **Step 1: Add the dependency**

In `packages/MJServer/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue-engine": "6.1.0",
```

Run: `pnpm install` (repository root)
Expected: installs; `packages/MJServer/node_modules/@memberjunction/work-queue-engine` links to the workspace package.

- [ ] **Step 2: Write `packages/MJServer/src/services/workQueueConfig.ts`**

```typescript
/**
 * @fileoverview The `workQueue` configuration section. Kept out of config.ts so it can be tested without
 * config.ts's module-load database validation.
 * @module MJServer/services
 */
import { z } from 'zod';

export const workQueueSubscriptionEntrySchema = z.object({
  /** A subscription name, or '*' for every MJWorker subscription. */
  name: z.string().min(1),
  /** Deliveries this instance processes concurrently for the subscription. */
  concurrency: z.number().int().positive().optional().default(4),
});

/**
 * Durable work-queue host. When enabled, this process runs its share of MJWorker subscriptions. Every
 * claim is atomic against shared state, so any number of instances may enable it against one database.
 */
export const workQueueSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    systemUserEmail: z.string().optional().default('system@memberjunction.org'),
    subscriptions: z.array(workQueueSubscriptionEntrySchema).optional().default([{ name: '*', concurrency: 4 }]),
    idlePollMinMs: z.number().int().positive().optional().default(250),
    idlePollMaxMs: z.number().int().positive().optional().default(5000),
    shutdownDrainMs: z.number().int().nonnegative().optional().default(8000),
    sweeperEnabled: z.boolean().optional().default(true),
    sweeperIntervalMs: z.number().int().positive().optional().default(60000),
    reconcileIntervalMs: z.number().int().nonnegative().optional().default(30000),
  })
  .refine(config => config.idlePollMaxMs >= config.idlePollMinMs, {
    message: 'workQueue.idlePollMaxMs must be >= workQueue.idlePollMinMs',
    path: ['idlePollMaxMs'],
  });

export type WorkQueueConfig = z.infer<typeof workQueueSchema>;

export const DEFAULT_WORK_QUEUE_CONFIG: WorkQueueConfig = {
  enabled: false,
  systemUserEmail: 'not.set@nowhere.com',
  subscriptions: [{ name: '*', concurrency: 4 }],
  idlePollMinMs: 250,
  idlePollMaxMs: 5000,
  shutdownDrainMs: 8000,
  sweeperEnabled: true,
  sweeperIntervalMs: 60000,
  reconcileIntervalMs: 30000,
};
```

- [ ] **Step 3: Wire the section into `config.ts`**

In `packages/MJServer/src/config.ts`:

- add `import { DEFAULT_WORK_QUEUE_CONFIG, workQueueSchema } from './services/workQueueConfig.js';` below `import { z } from 'zod';`
- in `configInfoSchema`, after `integrationSyncWorker: integrationSyncWorkerSchema.optional().default({}),`, add `workQueue: workQueueSchema.optional().default({}),`
- after `export type IntegrationSyncWorkerConfig = …`, add `export type { WorkQueueConfig } from './services/workQueueConfig.js';`
- in `DEFAULT_SERVER_CONFIG`, after the `integrationSyncWorker: { … },` block, add:

```typescript
  // Work queue host defaults (off until an instance opts in)
  workQueue: DEFAULT_WORK_QUEUE_CONFIG,
```

- [ ] **Step 4: Write the failing test**

`packages/MJServer/src/__tests__/WorkQueueHostService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// TaskGraphProviderFactory imports config.ts (which validates DB env at module load); UserCache needs a live
// provider. Both are replaced; the tests pass explicit dependencies.
vi.mock('../config.js', () => ({ configInfo: {}, mj_core_schema: '__mj' }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { get Users() { return []; } } }));

import type { DatabaseProviderBase, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { WorkQueueEngine, WorkQueueHostConfig, WorkQueueProviderSource } from '@memberjunction/work-queue-engine';
import { workQueueSchema, type WorkQueueConfig } from '../services/workQueueConfig.js';
import {
    BuildWorkQueueHostConfig, CreateWorkQueueInstanceID, IsWorkQueueHostDisabledByEnv, MJServerWorkQueueProviderSource,
    StartWorkQueueHost, WORK_QUEUE_DISABLE_ENV, type WorkQueueHostStartDependencies,
} from '../services/WorkQueueHostService.js';

const PROVIDER = { Name: 'server-provider' } as unknown as DatabaseProviderBase;
const SYSTEM_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', Email: 'system@memberjunction.org' } as UserInfo;
const ENGINE = { Name: 'engine' } as unknown as WorkQueueEngine;
const PROVIDER_SOURCE: WorkQueueProviderSource = { CreateProvider: async (): Promise<IMetadataProvider> => PROVIDER };

interface Recorder {
    Dependencies: WorkQueueHostStartDependencies;
    Started: WorkQueueHostConfig[];
    EngineCalls: number;
}

function recorder(users: UserInfo[] = [SYSTEM_USER], env: Record<string, string | undefined> = {}): Recorder {
    const result: Recorder = {
        Started: [],
        EngineCalls: 0,
        Dependencies: {
            Env: env,
            FindUserByEmail: email => users.find(user => user.Email === email),
            ConfigureEngine: async (user, provider) => {
                expect(user).toBe(SYSTEM_USER);
                expect(provider).toBe(PROVIDER);
                result.EngineCalls++;
                return ENGINE;
            },
            CreateHost: (config, engine, user, provider, source) => {
                expect([engine, user, provider, source]).toEqual([ENGINE, SYSTEM_USER, PROVIDER, PROVIDER_SOURCE]);
                return { Start: async () => { result.Started.push(config); } };
            },
        },
    };
    return result;
}

function enabled(overrides: Partial<WorkQueueConfig> = {}): WorkQueueConfig {
    return { ...workQueueSchema.parse({ enabled: true }), ...overrides };
}

describe('workQueue configuration', () => {
    it('defaults to disabled, running every MJWorker subscription once enabled', () => {
        expect(workQueueSchema.parse({})).toEqual({
            enabled: false, systemUserEmail: 'system@memberjunction.org', subscriptions: [{ name: '*', concurrency: 4 }],
            idlePollMinMs: 250, idlePollMaxMs: 5000, shutdownDrainMs: 8000, sweeperEnabled: true, sweeperIntervalMs: 60000,
            reconcileIntervalMs: 30000,
        });
    });

    it('rejects an idle poll maximum below the minimum', () => {
        expect(workQueueSchema.safeParse({ idlePollMinMs: 1000, idlePollMaxMs: 500 }).success).toBe(false);
    });
});

describe('host configuration helpers', () => {
    it('maps the section to a host config and disables the sweeper when asked', () => {
        const config = enabled({ subscriptions: [{ name: 'email.unsubscribe', concurrency: 8 }], sweeperEnabled: false });
        expect(BuildWorkQueueHostConfig(config, 'api-1')).toEqual({
            InstanceID: 'api-1', Subscriptions: [{ Name: 'email.unsubscribe', Concurrency: 8 }], IdlePollMinMs: 250,
            IdlePollMaxMs: 5000, ShutdownDrainMs: 8000, SweeperIntervalMs: 0, ReconcileIntervalMs: 30000,
        });
    });

    it('builds a unique instance ID from host, pid and random entropy', () => {
        const first = CreateWorkQueueInstanceID({ HOSTNAME: 'api-7' });
        expect(first).toMatch(new RegExp(`^api-7-${process.pid}-[0-9a-f]{8}$`));
        expect(CreateWorkQueueInstanceID({ HOSTNAME: 'api-7' })).not.toBe(first);
    });

    it(`treats only ${WORK_QUEUE_DISABLE_ENV}=1 as the kill switch`, () => {
        expect(IsWorkQueueHostDisabledByEnv({ [WORK_QUEUE_DISABLE_ENV]: '1' })).toBe(true);
        expect(IsWorkQueueHostDisabledByEnv({ [WORK_QUEUE_DISABLE_ENV]: 'true' })).toBe(false);
        expect(IsWorkQueueHostDisabledByEnv({})).toBe(false);
    });
});

describe('StartWorkQueueHost', () => {
    it('starts nothing when the section is disabled', async () => {
        const rec = recorder();
        expect(await StartWorkQueueHost(workQueueSchema.parse({}), PROVIDER, PROVIDER_SOURCE, rec.Dependencies)).toBeNull();
        expect(rec.EngineCalls).toBe(0);
    });

    it('starts nothing when the kill switch is set', async () => {
        const rec = recorder([SYSTEM_USER], { [WORK_QUEUE_DISABLE_ENV]: '1' });
        expect(await StartWorkQueueHost(enabled(), PROVIDER, PROVIDER_SOURCE, rec.Dependencies)).toBeNull();
        expect(rec.EngineCalls).toBe(0);
    });

    it('refuses to start without the system user', async () => {
        const rec = recorder([]);
        await expect(StartWorkQueueHost(enabled(), PROVIDER, PROVIDER_SOURCE, rec.Dependencies)).rejects.toThrow('System user not found with email: system@memberjunction.org');
    });

    it('names the setting to fix when the placeholder email from DEFAULT_SERVER_CONFIG is still in effect', async () => {
        const rec = recorder();
        await expect(StartWorkQueueHost(enabled({ systemUserEmail: 'not.set@nowhere.com' }), PROVIDER, PROVIDER_SOURCE, rec.Dependencies))
            .rejects.toThrow('set workQueue.systemUserEmail');
    });

    it('configures the engine, then creates and starts the host', async () => {
        const rec = recorder();
        const host = await StartWorkQueueHost(enabled(), PROVIDER, PROVIDER_SOURCE, rec.Dependencies);
        expect(host).not.toBeNull();
        expect(rec.EngineCalls).toBe(1);
        expect(rec.Started).toHaveLength(1);
        expect(rec.Started[0]).toMatchObject({ Subscriptions: [{ Name: '*', Concurrency: 4 }], SweeperIntervalMs: 60000 });
    });
});

describe('MJServerWorkQueueProviderSource', () => {
    it('falls back to the shared server provider when there is no SQL Server pool', async () => {
        const source = new MJServerWorkQueueProviderSource(null, PROVIDER);
        expect(await source.CreateProvider()).toBe(PROVIDER);
    });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd packages/WorkQueue/engine && pnpm run build` (MJServer consumes the built package)
Run: `cd packages/MJServer && pnpm test WorkQueueHostService`
Expected: FAIL — unresolved import `../services/WorkQueueHostService.js`.

- [ ] **Step 6: Write `packages/MJServer/src/services/WorkQueueHostService.ts`**

```typescript
/**
 * @fileoverview Starts the durable work-queue host inside MJServer when `workQueue.enabled` is set.
 * @module MJServer/services
 */
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import sql from 'mssql';
import { LogError, LogStatus, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    MJWorkLogger, WorkQueueEngine, WorkQueueHost,
    type WorkQueueHostConfig, type WorkQueueProviderSource,
} from '@memberjunction/work-queue-engine';
import { TaskGraphProviderFactory } from './TaskGraphProviderFactory.js';
import type { WorkQueueConfig } from './workQueueConfig.js';

export const WORK_QUEUE_DISABLE_ENV = 'MJ_DISABLE_WORK_QUEUE_HOST';

/** Matches the width of WorkQueueDelivery.LeaseOwner. */
const MAX_INSTANCE_ID_LENGTH = 200;

type EnvironmentVariables = Record<string, string | undefined>;

export interface StartableWorkQueueHost {
    Start(): Promise<void>;
}

/** Seams for tests; production uses DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES. */
export interface WorkQueueHostStartDependencies {
    Env: EnvironmentVariables;
    FindUserByEmail(email: string): UserInfo | undefined;
    ConfigureEngine(user: UserInfo, provider: DatabaseProviderBase): Promise<WorkQueueEngine>;
    CreateHost(config: WorkQueueHostConfig, engine: WorkQueueEngine, user: UserInfo, provider: DatabaseProviderBase, providerSource: WorkQueueProviderSource): StartableWorkQueueHost;
}

export const DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES: WorkQueueHostStartDependencies = {
    Env: process.env,
    FindUserByEmail: email => UserCache.Users.find(user => user.Email?.trim().toLowerCase() === email.trim().toLowerCase()),
    ConfigureEngine: async (user, provider) => {
        await WorkQueueEngine.Instance.Config(false, user, provider);
        await reportTopologyIssues(WorkQueueEngine.Instance);
        return WorkQueueEngine.Instance;
    },
    CreateHost: (config, engine, user, provider, providerSource) =>
        new WorkQueueHost(config, engine, user, provider, new MJWorkLogger(), { ProviderSource: providerSource }),
};

/**
 * Topology rows, capability gating, driver bindings and database prerequisites (03 §11) — including SQL Server's
 * READ_COMMITTED_SNAPSHOT requirement (03 §7). Problems are logged, never thrown: the planner still gates each
 * subscription, and an operator can read the same list from WorkQueue.ValidateBindings.
 */
async function reportTopologyIssues(engine: WorkQueueEngine): Promise<void> {
    try {
        for (const issue of await engine.ValidateTopology()) {
            const line = `[WorkQueue] ${issue.Severity}: ${issue.Subject} — ${issue.Message}`;
            if (issue.Severity === 'Error') {
                LogError(line);
            } else {
                LogStatus(line);
            }
        }
    } catch (error) {
        LogError(`[WorkQueue] Topology validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function IsWorkQueueHostDisabledByEnv(env: EnvironmentVariables): boolean {
    return env[WORK_QUEUE_DISABLE_ENV] === '1';
}

/**
 * Host and pid for humans reading logs; the random suffix for uniqueness — containers routinely share pid 1
 * and HOSTNAME is not always exported. A restart is a new instance, so a dead process's leases simply expire.
 */
export function CreateWorkQueueInstanceID(env: EnvironmentVariables = process.env): string {
    const host = env.HOSTNAME ?? hostname();
    return `${host}-${process.pid}-${randomBytes(4).toString('hex')}`.slice(0, MAX_INSTANCE_ID_LENGTH);
}

export function BuildWorkQueueHostConfig(config: WorkQueueConfig, instanceID: string): WorkQueueHostConfig {
    return {
        InstanceID: instanceID,
        Subscriptions: config.subscriptions.map(entry => ({ Name: entry.name, Concurrency: entry.concurrency })),
        IdlePollMinMs: config.idlePollMinMs,
        IdlePollMaxMs: config.idlePollMaxMs,
        ShutdownDrainMs: config.shutdownDrainMs,
        SweeperIntervalMs: config.sweeperEnabled ? config.sweeperIntervalMs : 0,
        ReconcileIntervalMs: config.reconcileIntervalMs,
    };
}

/** A fresh SQL Server provider per delivery over the shared pool; the server provider otherwise. */
export class MJServerWorkQueueProviderSource implements WorkQueueProviderSource {
    private readonly factory: TaskGraphProviderFactory | null;

    constructor(pool: sql.ConnectionPool | null, private readonly fallback: IMetadataProvider) {
        this.factory = pool ? new TaskGraphProviderFactory(pool) : null;
    }

    public CreateProvider(): Promise<IMetadataProvider> {
        return this.factory ? this.factory.CreateProvider() : Promise.resolve(this.fallback);
    }
}

/** Returns the started host, or null when this instance runs no subscriptions. */
export async function StartWorkQueueHost(
    config: WorkQueueConfig,
    provider: DatabaseProviderBase,
    providerSource: WorkQueueProviderSource,
    dependencies: WorkQueueHostStartDependencies = DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES,
): Promise<StartableWorkQueueHost | null> {
    if (!config.enabled) {
        return null;
    }
    if (IsWorkQueueHostDisabledByEnv(dependencies.Env)) {
        LogStatus(`[WorkQueue] Host disabled by ${WORK_QUEUE_DISABLE_ENV}=1 — this process publishes but runs no subscriptions.`);
        return null;
    }
    const user = dependencies.FindUserByEmail(config.systemUserEmail);
    if (!user) {
        throw new Error(`[WorkQueue] System user not found with email: ${config.systemUserEmail} — set workQueue.systemUserEmail in mj.config.cjs`);
    }
    const engine = await dependencies.ConfigureEngine(user, provider);
    const hostConfig = BuildWorkQueueHostConfig(config, CreateWorkQueueInstanceID(dependencies.Env));
    const host = dependencies.CreateHost(hostConfig, engine, user, provider, providerSource);
    await host.Start();
    LogStatus(`🔄 Work Queue host ${hostConfig.InstanceID}: ${hostConfig.Subscriptions.map(s => `${s.Name}×${s.Concurrency}`).join(', ')}`);
    return host;
}
```

- [ ] **Step 7: Start the host from `serve()`**

In `packages/MJServer/src/index.ts`, add beside the other service imports:

```typescript
import { MJServerWorkQueueProviderSource, StartWorkQueueHost } from './services/WorkQueueHostService.js';
```

Directly after the task-graph dispatcher block (the `if (taskGraphDispatcherDisabled) { … } else if (resumeUser && taskGraphPool instanceof sql.ConnectionPool) { … }` block) and before `const gracefulShutdown = …`, add:

```typescript
  // Start the durable work-queue host where enabled. It plans which subscriptions this instance runs,
  // re-plans on a timer, and self-registers with ShutdownRegistry, so gracefulShutdown's awaited
  // ShutdownAll() drains it (up to 2 × shutdownDrainMs) before the HTTP server closes.
  // Not awaited: a slow engine load must not delay readiness, and a failure never stops the API.
  const workQueueProvider = Metadata.Provider; // global-provider-ok: server startup — the work-queue host runs on the server's own provider
  if (configInfo.workQueue?.enabled && workQueueProvider instanceof DatabaseProviderBase) {
    const workQueuePool = dataSources[0]?.dataSource;
    const providerSource = new MJServerWorkQueueProviderSource(workQueuePool instanceof sql.ConnectionPool ? workQueuePool : null, workQueueProvider);
    StartWorkQueueHost(configInfo.workQueue, workQueueProvider, providerSource)
      .catch(error => console.error('❌ Failed to start the work queue host:', error));
  }
```

`Metadata`, `DatabaseProviderBase`, `sql` and `dataSources` are already in scope in `serve()`.

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/MJServer && pnpm test WorkQueueHostService`
Expected: PASS — WorkQueueHostService (11).

Run: `cd packages/MJServer && pnpm test`
Expected: PASS — no existing suite regresses.

Run: `cd packages/MJServer && pnpm run build`
Expected: builds. An error that `WorkQueueEngine` is not assignable to `WorkQueueHostEngine` means plan 05's engine drifted from 03 §11 (`OnPublished`, `NotifyDeadLettered`, `GetDriver`, `BuildSubscriptionBinding`) — align the engine.

- [ ] **Step 9: Commit**

```bash
git add packages/MJServer/package.json packages/MJServer/src/config.ts packages/MJServer/src/index.ts packages/MJServer/src/services/workQueueConfig.ts packages/MJServer/src/services/WorkQueueHostService.ts packages/MJServer/src/__tests__/WorkQueueHostService.test.ts pnpm-lock.yaml
git commit -m "feat(server): start the work queue host after listen when workQueue.enabled is set"
```

---

### Task 8: `@memberjunction/work-queue-server` scaffold and request handling helpers

**Files:**
- Create: `packages/WorkQueue/server/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/publishRequests.ts`
- Test: `packages/WorkQueue/server/src/__tests__/publishRequests.test.ts`

**Interfaces:**
- Consumes (plan 04, 03 §9 — **the single JSON mapping shared by client and server**): `ParseRestPublishBody(value: unknown): RestPublishBodyParseResult` (`{ Kind: 'Parsed'; Requests: PublishRequest[] } | { Kind: 'Invalid'; Error: string }`), `ToRestPublishResult(result: PublishResult): RestPublishResultJson`, `RestPublishResponseJson`, `PublishRequest`, `PublishResult`.
- Produces:
  - `WORK_QUEUE_PUBLISH_SCOPE = 'workqueue:publish'`, `DEFAULT_WORK_QUEUE_ROOT_PATH = '/work-queue'`, `DEFAULT_MAX_BATCH = 100`, `DEFAULT_BODY_LIMIT = '30mb'`
  - `interface WorkQueueServerSettings { MaxBatch: number; BodyLimit: string }`, `ParseServerSettings(settings: Record<string, unknown>): WorkQueueServerSettings`
  - `TOPIC_NAME_PATTERN`, `IsValidTopicName(name: string): boolean`
  - `type ParsedPublishBody = { Success: true; Requests: PublishRequest[] } | { Success: false; Error: string }`, `ParsePublishBody(body: unknown, maxBatch: number): ParsedPublishBody`
  - `interface WorkQueueErrorBody { error: string }`, `interface WorkQueueHttpResult { Status: number; Body: RestPublishResponseJson | WorkQueueErrorBody }`
  - `ToPublishResponseBody(results: PublishResult[]): RestPublishResponseJson`
  - `BodyErrorResult(error: unknown, bodyLimit: string): WorkQueueHttpResult`

**This package defines no JSON mapping of its own (03 §9).** Field names, `payloadRef` casing and the `status` values `Accepted` / `Duplicate` / `Rejected` all come from core's `ParseRestPublishBody` / `ToRestPublishResult`, the same functions `WorkQueueApiPublisher` uses, so client and server cannot drift. This module only adds what is server-side policy:

| Concern | Rule |
| --- | --- |
| Batch size | Core accepts 1–100 messages; the extension's `MaxBatch` setting may lower that. A longer batch → 400 |
| Envelope semantics | Not checked here. Size, attribute format and UUID rules belong to `ValidatePublishRequest` inside `PublishAs` and come back as per-item `Rejected` results |
| Topic name | `{topic}` must match `TOPIC_NAME_PATTERN` **before it is logged or looked up** (03 §9) — no control characters or path tricks reach a log line |
| Body errors | The JSON parser's failures are told apart: too large → 413; malformed JSON → 400 `Request body must be valid JSON`; anything else (bad charset, aborted stream) → 400 `Request body could not be read` |

- [ ] **Step 1: Scaffold the package**

`packages/WorkQueue/server/package.json`:

```json
{
  "name": "@memberjunction/work-queue-server",
  "version": "6.1.0",
  "description": "MemberJunction: Work Queue REST publish endpoint, delivered as an MJServer Server Extension",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "files": [
    "/dist"
  ],
  "scripts": {
    "build": "tsc && tsc-alias -f",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "MemberJunction.com",
  "license": "BUSL-1.1",
  "dependencies": {
    "@memberjunction/api-keys": "6.1.0",
    "@memberjunction/core": "6.1.0",
    "@memberjunction/generic-database-provider": "6.1.0",
    "@memberjunction/global": "6.1.0",
    "@memberjunction/server-extensions-core": "6.1.0",
    "@memberjunction/work-queue-core": "6.1.0",
    "@memberjunction/work-queue-engine": "6.1.0",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "typescript": "^5.9.3",
    "vite-tsconfig-paths": "^5.1.4",
    "vitest": "^3.1.1"
  }
}
```

`@memberjunction/generic-database-provider` supplies `UserCache` (the system user — Task 9). pnpm resolves only declared dependencies, so every import in this package must appear above.

`packages/WorkQueue/server/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/__tests__", "vitest.config.ts"]
}
```

`packages/WorkQueue/server/vitest.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';
export default mergeConfig(sharedConfig, defineProject({ test: { environment: 'node' } }));
```

`packages/WorkQueue/server/src/index.ts`:

```typescript
export * from './publishRequests';
```

Run: `pnpm install` (repository root)
Expected: `@memberjunction/work-queue-server` joins the workspace (the `packages/WorkQueue/*` glob from plan 04 covers it).

- [ ] **Step 2: Write the failing test**

`packages/WorkQueue/server/src/__tests__/publishRequests.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ToRestPublishResult } from '@memberjunction/work-queue-core';
import {
    BodyErrorResult, DEFAULT_BODY_LIMIT, DEFAULT_MAX_BATCH, IsValidTopicName, ParsePublishBody, ParseServerSettings, ToPublishResponseBody,
} from '../publishRequests';

describe('ParsePublishBody', () => {
    it("maps every camelCase field onto a PublishRequest through core's shared mapping", () => {
        const parsed = ParsePublishBody({
            messages: [{
                messageId: 'BBBBBBBB-2222-4222-8222-000000000001', partitionKey: 'subscriber-9',
                attributes: { eventType: 'click' }, payload: { url: 'https://x', n: [1, 2] },
                correlationId: 'corr-1', deduplicationKey: 'sg:abc', deduplicationTtlSeconds: 3600,
            }, {
                payloadRef: { uri: 's3://bucket/batch-7.jsonl', contentType: 'application/jsonl', sizeBytes: 1024, checksum: 'sha256:ab' },
            }],
        }, 100);
        expect(parsed).toEqual({
            Success: true,
            Requests: [{
                MessageID: 'BBBBBBBB-2222-4222-8222-000000000001', PartitionKey: 'subscriber-9',
                Attributes: { eventType: 'click' }, Payload: { url: 'https://x', n: [1, 2] }, CorrelationID: 'corr-1',
                DeduplicationKey: 'sg:abc', DeduplicationTTLSeconds: 3600,
            }, {
                PayloadRef: { Uri: 's3://bucket/batch-7.jsonl', ContentType: 'application/jsonl', SizeBytes: 1024, Checksum: 'sha256:ab' },
            }],
        });
    });

    it('rejects a body that is not an object with a messages array', () => {
        expect(ParsePublishBody([], 100).Success).toBe(false);
        expect(ParsePublishBody({ topic: 'x' }, 100).Success).toBe(false);
        expect(ParsePublishBody(null, 100).Success).toBe(false);
    });

    it("applies the extension's MaxBatch on top of core's 1–100", () => {
        expect(ParsePublishBody({ messages: [] }, 3).Success).toBe(false);
        expect(ParsePublishBody({ messages: [{}, {}, {}] }, 3).Success).toBe(true);
        expect(ParsePublishBody({ messages: [{}, {}, {}, {}] }, 3)).toEqual({ Success: false, Error: '"messages" must contain between 1 and 3 items' });
    });

    it('reports the offending item when a property has the wrong JSON type', () => {
        const parsed = ParsePublishBody({ messages: [{}, { correlationId: 7 }] }, 100);
        expect(parsed.Success).toBe(false);
        expect(parsed.Success ? '' : parsed.Error).toContain('messages[1]');
    });
});

describe('IsValidTopicName', () => {
    it('accepts dotted names and refuses anything that could break a log line or a path', () => {
        expect(IsValidTopicName('email.events')).toBe(true);
        expect(IsValidTopicName('Integration_Batch-Ready.v2')).toBe(true);
        expect(IsValidTopicName('')).toBe(false);
        expect(IsValidTopicName('email.events\nFAKE LOG LINE')).toBe(false);
        expect(IsValidTopicName('../admin')).toBe(false);
        expect(IsValidTopicName('a b')).toBe(false);
        expect(IsValidTopicName('x'.repeat(201))).toBe(false);
    });
});

describe('ParseServerSettings', () => {
    it('defaults the batch size and body limit', () => {
        expect(ParseServerSettings({})).toEqual({ MaxBatch: DEFAULT_MAX_BATCH, BodyLimit: DEFAULT_BODY_LIMIT });
    });

    it('accepts overrides and rejects an invalid batch size', () => {
        expect(ParseServerSettings({ MaxBatch: 25, BodyLimit: ' 5mb ' })).toEqual({ MaxBatch: 25, BodyLimit: '5mb' });
        expect(() => ParseServerSettings({ MaxBatch: 500 })).toThrow('Settings.MaxBatch must be an integer between 1 and 100');
    });
});

describe('ToPublishResponseBody', () => {
    it("is core's ToRestPublishResult per item — PascalCase status values, camelCase fields (03 §9)", () => {
        const results = [
            { MessageID: 'm-1', Status: 'Accepted' as const },
            { MessageID: 'm-0', Status: 'Duplicate' as const },
            { MessageID: 'm-3', Status: 'Rejected' as const, Error: { Code: 'PayloadTooLarge', Message: 'too big', Retryable: false } },
        ];
        const body = ToPublishResponseBody(results);
        expect(body).toEqual({ results: results.map(ToRestPublishResult) });
        expect(body.results.map(r => r.status)).toEqual(['Accepted', 'Duplicate', 'Rejected']);
        expect(body.results[2].error).toEqual({ code: 'PayloadTooLarge', message: 'too big', retryable: false });
    });
});

describe('BodyErrorResult', () => {
    it('tells an oversized body, malformed JSON and an unreadable body apart', () => {
        expect(BodyErrorResult({ status: 413, type: 'entity.too.large' }, '30mb')).toEqual({ Status: 413, Body: { error: 'Request body exceeds 30mb' } });
        expect(BodyErrorResult({ status: 400, type: 'entity.parse.failed' }, '30mb')).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
        expect(BodyErrorResult(new SyntaxError('Unexpected token'), '30mb')).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
        expect(BodyErrorResult({ status: 415, type: 'charset.unsupported' }, '30mb')).toEqual({ Status: 400, Body: { error: 'Request body could not be read' } });
        expect(BodyErrorResult(new Error('request aborted'), '30mb')).toEqual({ Status: 400, Body: { error: 'Request body could not be read' } });
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/WorkQueue/server && pnpm test`
Expected: FAIL — unresolved import `../publishRequests`.

- [ ] **Step 4: Write `src/publishRequests.ts`**

```typescript
import {
    ParseRestPublishBody, ToRestPublishResult,
    type PublishRequest, type PublishResult, type RestPublishResponseJson,
} from '@memberjunction/work-queue-core';

export const WORK_QUEUE_PUBLISH_SCOPE = 'workqueue:publish';
export const DEFAULT_WORK_QUEUE_ROOT_PATH = '/work-queue';
export const DEFAULT_MAX_BATCH = 100;
export const DEFAULT_BODY_LIMIT = '30mb';

/**
 * What a `{topic}` path segment may look like before it is logged or looked up (03 §9): letters, digits, dot,
 * underscore and hyphen, 1–200 characters, starting with a letter or digit. Topic names are dotted identifiers
 * (03 §6.2); this is deliberately no looser than that.
 */
export const TOPIC_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export function IsValidTopicName(name: string): boolean {
    return TOPIC_NAME_PATTERN.test(name) && !name.includes('..');
}

export interface WorkQueueServerSettings {
    MaxBatch: number;
    BodyLimit: string;
}

export type ParsedPublishBody = { Success: true; Requests: PublishRequest[] } | { Success: false; Error: string };

export interface WorkQueueErrorBody {
    error: string;
}

export interface WorkQueueHttpResult {
    Status: number;
    Body: RestPublishResponseJson | WorkQueueErrorBody;
}

type JsonRecord = Record<string, unknown>;

export function ParseServerSettings(settings: JsonRecord): WorkQueueServerSettings {
    const maxBatch = settings.MaxBatch ?? DEFAULT_MAX_BATCH;
    if (typeof maxBatch !== 'number' || !Number.isInteger(maxBatch) || maxBatch < 1 || maxBatch > DEFAULT_MAX_BATCH) {
        throw new Error(`WorkQueueServerExtension Settings.MaxBatch must be an integer between 1 and ${DEFAULT_MAX_BATCH}`);
    }
    const bodyLimit = settings.BodyLimit ?? DEFAULT_BODY_LIMIT;
    if (typeof bodyLimit !== 'string' || bodyLimit.trim() === '') {
        throw new Error('WorkQueueServerExtension Settings.BodyLimit must be a size string such as "30mb"');
    }
    return { MaxBatch: maxBatch, BodyLimit: bodyLimit.trim() };
}

/**
 * JSON shape comes from core's ParseRestPublishBody — the mapping WorkQueueApiPublisher also uses (03 §9). This
 * wrapper only applies the extension's own MaxBatch. Envelope semantics are validated by PublishAs, per item.
 */
export function ParsePublishBody(body: unknown, maxBatch: number): ParsedPublishBody {
    const parsed = ParseRestPublishBody(body);
    if (parsed.Kind === 'Invalid') {
        return { Success: false, Error: parsed.Error };
    }
    if (parsed.Requests.length > maxBatch) {
        return { Success: false, Error: `"messages" must contain between 1 and ${maxBatch} items` };
    }
    return { Success: true, Requests: parsed.Requests };
}

export function ToPublishResponseBody(results: PublishResult[]): RestPublishResponseJson {
    return { results: results.map(ToRestPublishResult) };
}

/** The HTTP answer when the JSON body parser rejects a request. body-parser tags its errors with `type`. */
export function BodyErrorResult(error: unknown, bodyLimit: string): WorkQueueHttpResult {
    const status = isRecord(error) ? error.status : undefined;
    const type = isRecord(error) ? error.type : undefined;
    if (status === 413 || type === 'entity.too.large') {
        return { Status: 413, Body: { error: `Request body exceeds ${bodyLimit}` } };
    }
    if (type === 'entity.parse.failed' || error instanceof SyntaxError) {
        return { Status: 400, Body: { error: 'Request body must be valid JSON' } };
    }
    return { Status: 400, Body: { error: 'Request body could not be read' } };
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

If plan 04 exported the REST mapping under different names than shown, fix only this import — do **not** add a second mapping here.

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/server && pnpm test`
Expected: PASS — publishRequests (9).

Run: `cd packages/WorkQueue/server && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/server pnpm-lock.yaml
git commit -m "feat(work-queue-server): package scaffold and publish request helpers over core's REST mapping"
```

---

### Task 9: Publish handler, scope authorizer and Server Extension

**Files:**
- Create: `packages/WorkQueue/server/src/scopeAuthorizer.ts`, `src/publishHandler.ts`, `src/router.ts`, `src/WorkQueueServerExtension.ts`
- Modify: `packages/WorkQueue/server/src/index.ts`
- Test: `packages/WorkQueue/server/src/__tests__/scopeAuthorizer.test.ts`, `src/__tests__/publishHandler.test.ts`, `src/__tests__/router.test.ts`, `src/__tests__/WorkQueueServerExtension.test.ts`

**Interfaces:**
- Consumes: Task 8 exports; `WorkQueueEngine`, `WorkQueuePublishOptions`, `MJWorkLogger` (plan 05); `WorkQueueHost` (Task 3); `PublishRequest`, `PublishResult`, `WorkJson`, `WorkLogger` (plan 04); `GetAPIKeyEngine` (`@memberjunction/api-keys` — `Authorize(apiKeyHash, applicationName, scopePath, resource, contextUser, requestContext?, options?: { skipLogging?; actingContext? }) → { Allowed, Reason }`, `packages/APIKeys/Engine/src/APIKeyEngine.ts`); `UserCache.Instance.GetSystemUser()` (`@memberjunction/generic-database-provider`); `UserInfo.APIKeyActingContext` (`@memberjunction/core`); `BaseServerExtension`, `ServerExtensionConfig`, `ServerExtensionInitContext`, `ServerExtensionPhase`, `ExtensionInitResult`, `ExtensionHealthResult` (`@memberjunction/server-extensions-core`).
- Produces:
  - `interface ScopeDecision { Allowed: boolean; Reason: string }`, `interface ScopeRequestContext { Endpoint: string; Method: string }`, `interface WorkQueueScopeAuthorizer`, `WORK_QUEUE_API_APPLICATION = 'MJAPI'`, `class APIKeyScopeAuthorizer implements WorkQueueScopeAuthorizer` — `constructor(getSystemUser?: () => UserInfo | null)`
  - `interface WorkQueuePublishTopic { Name: string; AllowExternalPublish: boolean }`, `interface WorkQueuePublishEngine`, `interface WorkQueuePublishHttpRequest` (with `ReadBody(): Promise<unknown>`), `interface WorkQueuePublishDependencies`
  - `HandleWorkQueuePublish(request, dependencies): Promise<WorkQueueHttpResult>` — never throws
  - `interface WorkQueueRequestPayload { userRecord?: UserInfo; apiKeyHash?: string }`, `CreateWorkQueuePublishRouter(dependencies): Router`, `CreateDefaultPublishDependencies(settings): WorkQueuePublishDependencies`
  - `@RegisterClass(BaseServerExtension, 'WorkQueueServerExtension') class WorkQueueServerExtension` (phase `post-auth`), `NormalizeRootPath(rootPath: string | undefined): string`

`POST {RootPath}/topics/{topic}/messages` (03 §9). Checks run in this order. **Steps 1–4 run before the request body is read**, so a caller without an API key or without the scope can neither make the server parse 30 MB nor learn which topics exist:

| Order | Condition | Response |
| --- | --- | --- |
| 1 | No authenticated user on `req.userPayload` | `401 { error }` |
| 2 | Authenticated **without an API key** (bearer/JWT, magic-link and widget sessions) | `403 { error }` — REST publishing is for external producers; code inside MJ calls `PublishAs` |
| 3 | `{topic}` does not match `TOPIC_NAME_PATTERN` (Task 8) | `400 { error }` — the raw segment is never echoed or logged |
| 4 | API key lacks `workqueue:publish` for the topic name | `403 { error }` |
| 5 | Body cannot be read or is not the expected shape (Task 8) | `413` / `400 { error }` |
| 6 | Topic unknown | `404 { error }` |
| 7 | Topic `AllowExternalPublish = 0` | `403 { error }` naming `TopicNotExternallyPublishable` |
| — | Published | `202 { results }` — per-item `Rejected` results are still 202 |
| — | Anything thrown | `500 { error: 'Publish failed' }`, logged |

**Scope check parity (03 §9, F7).** `APIKeyScopeAuthorizer` mirrors `ResolverBase.CheckAPIKeyScopeAuthorization` (`packages/MJServer/src/generic/ResolverBase.ts`) step for step — it is copied rather than imported because that method is `protected` on the resolver base:

| Resolver behavior | Here |
| --- | --- |
| Evaluation and usage logging run as the **system user** (`UserCache.Instance.GetSystemUser()`), not the API key's clone user — the clone user may lack permission to write usage logs | same; a missing system user throws |
| `full_access` fast path: `Authorize(hash, 'MJAPI', 'full_access', '*', systemUser, ctx, { skipLogging: true })`; when allowed, the specific check is skipped | same |
| Specific check passes `{ actingContext: sessionUser.APIKeyActingContext }` so filtered rules with `{{Acting*}}` tokens do not fail closed | same, from the request's session user |

**Engine identity.** The extension configures `WorkQueueEngine` as the **system user**, never as whichever caller happens to arrive first (03 §9): with the host disabled the first REST request would otherwise become the engine's context user for the life of the process. The API key's user is only the **publisher** (`PublishAs({ ContextUser })`, recorded as `PublishedByUserID`).

Server Extension configuration (host `mj.config.cjs`):

```javascript
serverExtensions: [
  {
    Enabled: true,
    DriverClass: 'WorkQueueServerExtension',
    RootPath: '/work-queue',
    Phase: 'post-auth',
    Settings: { MaxBatch: 100, BodyLimit: '30mb' },
  },
],
```

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/server/src/__tests__/scopeAuthorizer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authorize = vi.fn();
vi.mock('@memberjunction/api-keys', () => ({ GetAPIKeyEngine: () => ({ Authorize: authorize }) }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => null } } }));

import type { APIKeyActingContext, UserInfo } from '@memberjunction/core';
import { APIKeyScopeAuthorizer } from '../scopeAuthorizer';

const SYSTEM_USER = { ID: 'AAAAAAAA-1111-4111-8111-0000000000ff', Email: 'system@example.org' } as UserInfo;
const ACTING = { ActingUserID: 'AAAAAAAA-1111-4111-8111-000000000009' } as unknown as APIKeyActingContext;
const SESSION_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', APIKeyActingContext: ACTING } as unknown as UserInfo;
const REQUEST = { Endpoint: '/work-queue/topics/email.events/messages', Method: 'POST' };
const HTTP = { endpoint: REQUEST.Endpoint, method: 'POST' };

beforeEach(() => {
    authorize.mockReset();
});

describe('APIKeyScopeAuthorizer', () => {
    it('takes the full_access fast path without logging and skips the specific check', async () => {
        authorize.mockResolvedValueOnce({ Allowed: true, Reason: 'full access' });
        const decision = await new APIKeyScopeAuthorizer(() => SYSTEM_USER).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST);
        expect(decision).toEqual({ Allowed: true, Reason: 'full_access' });
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(authorize).toHaveBeenCalledWith('hash-1', 'MJAPI', 'full_access', '*', SYSTEM_USER, HTTP, { skipLogging: true });
    });

    it('checks the specific scope as the system user, with the session acting context', async () => {
        authorize
            .mockResolvedValueOnce({ Allowed: false, Reason: 'no full access' })
            .mockResolvedValueOnce({ Allowed: false, Reason: 'no matching rule' });
        const decision = await new APIKeyScopeAuthorizer(() => SYSTEM_USER).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST);
        expect(decision).toEqual({ Allowed: false, Reason: 'no matching rule' });
        expect(authorize).toHaveBeenLastCalledWith('hash-1', 'MJAPI', 'workqueue:publish', 'email.events', SYSTEM_USER, HTTP, { actingContext: ACTING });
    });

    it('allows when the specific scope is granted', async () => {
        authorize
            .mockResolvedValueOnce({ Allowed: false, Reason: 'no full access' })
            .mockResolvedValueOnce({ Allowed: true, Reason: 'rule 7' });
        expect(await new APIKeyScopeAuthorizer(() => SYSTEM_USER).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST))
            .toEqual({ Allowed: true, Reason: 'rule 7' });
    });

    it('throws when there is no system user to evaluate as', async () => {
        await expect(new APIKeyScopeAuthorizer(() => null).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST))
            .rejects.toThrow('System user not found');
        expect(authorize).not.toHaveBeenCalled();
    });
});
```

`packages/WorkQueue/server/src/__tests__/publishHandler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { PublishRequest, PublishResult, WorkJson, WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueuePublishOptions } from '@memberjunction/work-queue-engine';
import {
    HandleWorkQueuePublish,
    type WorkQueuePublishDependencies, type WorkQueuePublishEngine, type WorkQueuePublishHttpRequest, type WorkQueuePublishTopic,
} from '../publishHandler';
import type { ScopeDecision, WorkQueueScopeAuthorizer } from '../scopeAuthorizer';

const USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001' } as UserInfo;
const BODY = { messages: [{ attributes: { eventType: 'click' }, payload: { url: 'https://x' } }] };

class FakeAuthorizer implements WorkQueueScopeAuthorizer {
    public Decision: ScopeDecision = { Allowed: true, Reason: 'allowed' };
    public Calls: Array<[string, string, string, string]> = [];

    public async Authorize(apiKeyHash: string, scopePath: string, resource: string, _user: UserInfo, request: { Endpoint: string; Method: string }): Promise<ScopeDecision> {
        this.Calls.push([apiKeyHash, scopePath, resource, request.Endpoint]);
        return this.Decision;
    }
}

class FakePublishEngine implements WorkQueuePublishEngine {
    public Topics: WorkQueuePublishTopic[] = [{ Name: 'email.events', AllowExternalPublish: true }, { Name: 'mj.internal', AllowExternalPublish: false }];
    public Published: Array<{ Topic: string; Requests: PublishRequest[]; Options: WorkQueuePublishOptions }> = [];
    public Error: Error | null = null;

    public GetTopicByName(name: string): WorkQueuePublishTopic | undefined {
        return this.Topics.find(t => t.Name.toLowerCase() === name.trim().toLowerCase());
    }

    public async PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]> {
        if (this.Error) {
            throw this.Error;
        }
        this.Published.push({ Topic: topic, Requests: requests, Options: options });
        return requests.map((_r, i) => ({ MessageID: `m-${i}`, Status: 'Accepted' }));
    }
}

class CapturingLogger implements WorkLogger {
    public Errors: string[] = [];
    public Info(): void {}
    public Warn(): void {}
    public Error(message: string, error?: Error): void {
        this.Errors.push(`${message}: ${error?.message ?? ''}`);
    }
}

interface Harness {
    Dependencies: WorkQueuePublishDependencies;
    Authorizer: FakeAuthorizer;
    Engine: FakePublishEngine;
    Log: CapturingLogger;
    EngineRequests: () => number;
    BodyReads: () => number;
    Request(overrides?: Partial<WorkQueuePublishHttpRequest>): WorkQueuePublishHttpRequest;
}

function harness(): Harness {
    const authorizer = new FakeAuthorizer();
    const engine = new FakePublishEngine();
    const log = new CapturingLogger();
    let engineRequests = 0;
    let bodyReads = 0;
    return {
        Authorizer: authorizer, Engine: engine, Log: log, EngineRequests: () => engineRequests, BodyReads: () => bodyReads,
        Dependencies: {
            GetEngine: async () => {
                engineRequests++;
                return engine;
            },
            Authorizer: authorizer,
            Settings: { MaxBatch: 100, BodyLimit: '30mb' },
            Log: log,
        },
        Request: (overrides = {}) => ({
            TopicName: 'email.events', User: USER, ApiKeyHash: 'hash-1', Path: '/work-queue/topics/email.events/messages',
            ReadBody: async () => {
                bodyReads++;
                return BODY;
            },
            ...overrides,
        }),
    };
}

describe('HandleWorkQueuePublish — before the body is read', () => {
    it('requires an authenticated user before checking anything else', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(h.Request({ User: undefined }), h.Dependencies)).toEqual({ Status: 401, Body: { error: 'Authentication required' } });
        expect([h.Authorizer.Calls.length, h.BodyReads()]).toEqual([0, 0]);
    });

    it('refuses a session without an API key (JWT, magic link, widget) with 403', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ ApiKeyHash: undefined }), h.Dependencies);
        expect(result).toEqual({ Status: 403, Body: { error: 'REST publishing requires an API key with the workqueue:publish scope' } });
        expect([h.Authorizer.Calls.length, h.BodyReads(), h.EngineRequests()]).toEqual([0, 0, 0]);
    });

    it('rejects a topic segment outside the topic-name charset without echoing or logging it', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ TopicName: 'email.events\nFAKE LOG LINE' }), h.Dependencies);
        expect(result).toEqual({ Status: 400, Body: { error: 'Invalid topic name' } });
        expect([h.Authorizer.Calls.length, h.BodyReads(), h.Log.Errors.length]).toEqual([0, 0, 0]);
    });

    it('checks the publish scope against the topic name before reading the body or touching the engine', async () => {
        const h = harness();
        h.Authorizer.Decision = { Allowed: false, Reason: 'no matching rule' };
        const result = await HandleWorkQueuePublish(h.Request(), h.Dependencies);
        expect(result.Status).toBe(403);
        expect(h.Authorizer.Calls).toEqual([['hash-1', 'workqueue:publish', 'email.events', '/work-queue/topics/email.events/messages']]);
        expect([h.BodyReads(), h.EngineRequests()]).toEqual([0, 0]);
    });
});

describe('HandleWorkQueuePublish — after authorization', () => {
    it('maps a body the parser refused (too large, malformed, unreadable)', async () => {
        const h = harness();
        const tooLarge = h.Request({ ReadBody: async () => { throw Object.assign(new Error('too large'), { status: 413, type: 'entity.too.large' }); } });
        expect(await HandleWorkQueuePublish(tooLarge, h.Dependencies)).toEqual({ Status: 413, Body: { error: 'Request body exceeds 30mb' } });
        const malformed = h.Request({ ReadBody: async () => { throw Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' }); } });
        expect(await HandleWorkQueuePublish(malformed, h.Dependencies)).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
        expect(h.Log.Errors).toEqual([]);
    });

    it('rejects an invalid body shape', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ ReadBody: async () => ({ messages: [] }) }), h.Dependencies);
        expect(result.Status).toBe(400);
        expect(h.EngineRequests()).toBe(0);
    });

    it('answers 404 for an unknown topic', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(h.Request({ TopicName: 'nope' }), h.Dependencies)).toEqual({ Status: 404, Body: { error: "Unknown topic 'nope'" } });
    });

    it('refuses topics that do not allow external publishing', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ TopicName: 'mj.internal' }), h.Dependencies);
        expect(result.Status).toBe(403);
        expect(JSON.stringify(result.Body)).toContain('TopicNotExternallyPublishable');
        expect(h.Engine.Published).toHaveLength(0);
    });

    it("publishes as an external caller under the topic's canonical name and returns core's result JSON", async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ TopicName: 'EMAIL.EVENTS' }), h.Dependencies);
        expect(result).toEqual({ Status: 202, Body: { results: [{ messageId: 'm-0', status: 'Accepted' }] } });
        expect(h.Engine.Published).toEqual([{
            Topic: 'email.events',
            Requests: [{ Attributes: { eventType: 'click' }, Payload: { url: 'https://x' } }],
            Options: { ContextUser: USER, External: true },
        }]);
    });

    it('answers 500 and logs when publishing throws', async () => {
        const h = harness();
        h.Engine.Error = new Error('pool exhausted');
        expect(await HandleWorkQueuePublish(h.Request(), h.Dependencies)).toEqual({ Status: 500, Body: { error: 'Publish failed' } });
        expect(h.Log.Errors).toEqual(["REST publish to 'email.events' failed: pool exhausted"]);
    });
});
```

`packages/WorkQueue/server/src/__tests__/router.test.ts` — drives the real Express router over HTTP, so the `req.userPayload` wiring and the "auth before body parsing" order are proven end to end:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { UserInfo } from '@memberjunction/core';
import type { PublishResult } from '@memberjunction/work-queue-core';
import { CreateWorkQueuePublishRouter, type WorkQueueRequestPayload } from '../router';
import type { WorkQueuePublishDependencies } from '../publishHandler';

const USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001' } as UserInfo;
const servers: Server[] = [];

interface Started {
    Url: string;
    Published: string[];
    ScopeChecks: string[];
}

/** An app that fakes MJServer's unified auth by setting req.userPayload, then mounts the real router. */
async function start(payload: WorkQueueRequestPayload | undefined, allowScope = true, bodyLimit = '1kb'): Promise<Started> {
    const published: string[] = [];
    const scopeChecks: string[] = [];
    const dependencies: WorkQueuePublishDependencies = {
        GetEngine: async () => ({
            GetTopicByName: name => (name === 'email.events' ? { Name: 'email.events', AllowExternalPublish: true } : undefined),
            PublishAs: async (topic, requests): Promise<PublishResult[]> => {
                published.push(topic);
                return requests.map((_r, i) => ({ MessageID: `m-${i}`, Status: 'Accepted' as const }));
            },
        }),
        Authorizer: {
            Authorize: async (_hash, _scope, resource) => {
                scopeChecks.push(resource);
                return { Allowed: allowScope, Reason: allowScope ? 'ok' : 'no matching rule' };
            },
        },
        Settings: { MaxBatch: 100, BodyLimit: bodyLimit },
        Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined },
    };
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload = payload;
        next();
    });
    app.use('/work-queue', CreateWorkQueuePublishRouter(dependencies));
    const server = await new Promise<Server>(resolve => {
        const s = app.listen(0, () => resolve(s));
    });
    servers.push(server);
    return { Url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/work-queue/topics/email.events/messages`, Published: published, ScopeChecks: scopeChecks };
}

function post(url: string, body: string): Promise<globalThis.Response> {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('work queue publish router', () => {
    it('reads the user and API key hash from req.userPayload and publishes', async () => {
        const app = await start({ userRecord: USER, apiKeyHash: 'hash-1' });
        const response = await post(app.Url, JSON.stringify({ messages: [{ payload: { n: 1 } }] }));
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ results: [{ messageId: 'm-0', status: 'Accepted' }] });
        expect([app.ScopeChecks, app.Published]).toEqual([['email.events'], ['email.events']]);
    });

    it('answers 401 without a user and 403 for a session that has no API key', async () => {
        expect((await post((await start(undefined)).Url, '{}')).status).toBe(401);
        expect((await post((await start({ userRecord: USER })).Url, '{}')).status).toBe(403);
    });

    it('refuses an unauthorized caller BEFORE parsing the body: an oversized body still gets 403, not 413', async () => {
        const app = await start({ userRecord: USER, apiKeyHash: 'hash-1' }, false);
        const response = await post(app.Url, JSON.stringify({ messages: [{ payload: { blob: 'x'.repeat(5000) } }] }));
        expect(response.status).toBe(403);
    });

    it('answers 413 for an oversized body and 400 for malformed JSON once the caller is authorized, as JSON', async () => {
        const app = await start({ userRecord: USER, apiKeyHash: 'hash-1' });
        const large = await post(app.Url, JSON.stringify({ messages: [{ payload: { blob: 'x'.repeat(5000) } }] }));
        expect([large.status, await large.json()]).toEqual([413, { error: 'Request body exceeds 1kb' }]);
        const malformed = await post(app.Url, '{ not json');
        expect([malformed.status, await malformed.json()]).toEqual([400, { error: 'Request body must be valid JSON' }]);
        expect(app.Published).toEqual([]);
    });
});
```

`packages/WorkQueue/server/src/__tests__/WorkQueueServerExtension.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Application } from 'express';
import { MJGlobal } from '@memberjunction/global';
import { BaseServerExtension, type ServerExtensionConfig, type ServerExtensionInitContext } from '@memberjunction/server-extensions-core';
import { NormalizeRootPath, WorkQueueServerExtension } from '../WorkQueueServerExtension';

interface FakeApp {
    App: Application;
    Uses: string[];
}

function fakeApp(): FakeApp {
    const uses: string[] = [];
    const app = Object.assign(function fakeExpressApp(): void {}, {
        use: (path: string) => {
            uses.push(path);
            return app;
        },
    });
    return { App: app as unknown as Application, Uses: uses };
}

function config(overrides: Partial<ServerExtensionConfig> = {}): ServerExtensionConfig {
    return { Enabled: true, DriverClass: 'WorkQueueServerExtension', RootPath: '/work-queue', Phase: 'post-auth', Settings: {}, ...overrides };
}

describe('WorkQueueServerExtension', () => {
    it('registers under its driver class and mounts after authentication', () => {
        expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseServerExtension, 'WorkQueueServerExtension')?.SubClass).toBe(WorkQueueServerExtension);
        expect(new WorkQueueServerExtension().DefaultPhase).toBe('post-auth');
    });

    it('mounts the router at the normalized root path (legacy signature) and reports the route', async () => {
        const { App, Uses } = fakeApp();
        const result = await new WorkQueueServerExtension().Initialize(App, config({ RootPath: 'queues/' }));
        expect(Uses).toEqual(['/queues']);
        expect(result).toMatchObject({ Success: true, RegisteredRoutes: ['POST /queues/topics/:topic/messages'] });
        expect(NormalizeRootPath('queues/')).toBe('/queues');
    });

    it('accepts the context signature and reports invalid settings without mounting', async () => {
        const { App, Uses } = fakeApp();
        const context = { app: App, config: config({ Settings: { MaxBatch: 0 } }), phase: 'post-auth' } as unknown as ServerExtensionInitContext;
        const result = await new WorkQueueServerExtension().Initialize(context);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('Settings.MaxBatch');
        expect(Uses).toEqual([]);
    });

    it('reports healthy with no host running in this process', async () => {
        const health = await new WorkQueueServerExtension().HealthCheck();
        expect(health).toEqual({ Healthy: true, Name: 'WorkQueueServerExtension', Details: { Routes: [], Host: null } });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/server && pnpm test scopeAuthorizer publishHandler router WorkQueueServerExtension`
Expected: FAIL — unresolved imports `../scopeAuthorizer`, `../publishHandler`, `../router`, `../WorkQueueServerExtension`.

- [ ] **Step 3: Write `src/scopeAuthorizer.ts`**

```typescript
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

export interface ScopeDecision {
    Allowed: boolean;
    Reason: string;
}

export interface ScopeRequestContext {
    Endpoint: string;
    Method: string;
}

export interface WorkQueueScopeAuthorizer {
    /** `sessionUser` is the authenticated API-key user; its APIKeyActingContext rides along for filtered rules. */
    Authorize(apiKeyHash: string, scopePath: string, resource: string, sessionUser: UserInfo, request: ScopeRequestContext): Promise<ScopeDecision>;
}

/** Application whose ceiling applies to REST publishes — the same one MJServer's resolvers check against. */
export const WORK_QUEUE_API_APPLICATION = 'MJAPI';

/**
 * Mirrors ResolverBase.CheckAPIKeyScopeAuthorization (packages/MJServer/src/generic/ResolverBase.ts), which is
 * protected on the resolver base and so cannot be called from an Express route:
 *  1. rules are evaluated and usage is logged as the SYSTEM user — the API key's user may not be able to read scope
 *     rules or write usage logs;
 *  2. the `full_access` scope short-circuits the specific check (evaluated with skipLogging: it is a fast path,
 *     not the authorization decision);
 *  3. the session user's acting context is passed so filtered rules with {{Acting*}} tokens do not fail closed.
 * Callers without an API key never reach this class: the handler refuses them first (03 §9).
 */
export class APIKeyScopeAuthorizer implements WorkQueueScopeAuthorizer {
    constructor(private readonly getSystemUser: () => UserInfo | null = () => UserCache.Instance.GetSystemUser() ?? null) {}

    public async Authorize(apiKeyHash: string, scopePath: string, resource: string, sessionUser: UserInfo, request: ScopeRequestContext): Promise<ScopeDecision> {
        const systemUser = this.getSystemUser();
        if (!systemUser) {
            throw new Error('System user not found');
        }
        const engine = GetAPIKeyEngine();
        const http = { endpoint: request.Endpoint, method: request.Method };
        const fullAccess = await engine.Authorize(apiKeyHash, WORK_QUEUE_API_APPLICATION, 'full_access', '*', systemUser, http, { skipLogging: true });
        if (fullAccess.Allowed) {
            return { Allowed: true, Reason: 'full_access' };
        }
        const result = await engine.Authorize(apiKeyHash, WORK_QUEUE_API_APPLICATION, scopePath, resource, systemUser, http, {
            actingContext: sessionUser.APIKeyActingContext,
        });
        return { Allowed: result.Allowed, Reason: result.Reason };
    }
}
```

- [ ] **Step 4: Write `src/publishHandler.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { PublishRequest, PublishResult, WorkJson, WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueuePublishOptions } from '@memberjunction/work-queue-engine';
import {
    BodyErrorResult, IsValidTopicName, ParsePublishBody, ToPublishResponseBody, WORK_QUEUE_PUBLISH_SCOPE,
    type WorkQueueHttpResult, type WorkQueueServerSettings,
} from './publishRequests';
import type { WorkQueueScopeAuthorizer } from './scopeAuthorizer';

export interface WorkQueuePublishTopic {
    Name: string;
    AllowExternalPublish: boolean;
}

/** The part of WorkQueueEngine the endpoint needs. WorkQueueEngine satisfies it structurally. */
export interface WorkQueuePublishEngine {
    GetTopicByName(name: string): WorkQueuePublishTopic | undefined;
    PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]>;
}

export interface WorkQueuePublishHttpRequest {
    TopicName: string;
    User: UserInfo | undefined;
    ApiKeyHash: string | undefined;
    Path: string;
    /** Reads and JSON-parses the request body. Called only AFTER authentication and the scope check pass (03 §9). */
    ReadBody(): Promise<unknown>;
}

export interface WorkQueuePublishDependencies {
    /** The engine, configured as the SYSTEM user — never as the caller (03 §9). */
    GetEngine(): Promise<WorkQueuePublishEngine>;
    Authorizer: WorkQueueScopeAuthorizer;
    Settings: WorkQueueServerSettings;
    Log: WorkLogger;
}

/** Runs one REST publish to completion. Never throws. */
export async function HandleWorkQueuePublish(request: WorkQueuePublishHttpRequest, dependencies: WorkQueuePublishDependencies): Promise<WorkQueueHttpResult> {
    if (!request.User) {
        return { Status: 401, Body: { error: 'Authentication required' } };
    }
    if (!request.ApiKeyHash) {
        return { Status: 403, Body: { error: `REST publishing requires an API key with the ${WORK_QUEUE_PUBLISH_SCOPE} scope` } };
    }
    const topicName = request.TopicName.trim();
    if (!IsValidTopicName(topicName)) {
        return { Status: 400, Body: { error: 'Invalid topic name' } };   // the raw segment is neither echoed nor logged
    }
    try {
        return await publish(request, request.User, request.ApiKeyHash, topicName, dependencies);
    } catch (error) {
        dependencies.Log.Error(`REST publish to '${topicName}' failed`, error instanceof Error ? error : new Error(String(error)));
        return { Status: 500, Body: { error: 'Publish failed' } };
    }
}

async function publish(
    request: WorkQueuePublishHttpRequest, user: UserInfo, apiKeyHash: string, topicName: string, dependencies: WorkQueuePublishDependencies,
): Promise<WorkQueueHttpResult> {
    const decision = await dependencies.Authorizer.Authorize(apiKeyHash, WORK_QUEUE_PUBLISH_SCOPE, topicName, user, { Endpoint: request.Path, Method: 'POST' });
    if (!decision.Allowed) {
        return { Status: 403, Body: { error: `API key lacks ${WORK_QUEUE_PUBLISH_SCOPE} for '${topicName}': ${decision.Reason}` } };
    }
    let body: unknown;
    try {
        body = await request.ReadBody();
    } catch (error) {
        return BodyErrorResult(error, dependencies.Settings.BodyLimit);
    }
    const parsed = ParsePublishBody(body, dependencies.Settings.MaxBatch);
    if (!parsed.Success) {
        return { Status: 400, Body: { error: parsed.Error } };
    }
    const engine = await dependencies.GetEngine();
    const topic = engine.GetTopicByName(topicName);
    if (!topic) {
        return { Status: 404, Body: { error: `Unknown topic '${topicName}'` } };
    }
    if (!topic.AllowExternalPublish) {
        return { Status: 403, Body: { error: `Topic '${topic.Name}' does not accept external publishes (TopicNotExternallyPublishable)` } };
    }
    const results = await engine.PublishAs(topic.Name, parsed.Requests, { ContextUser: user, External: true });
    return { Status: 202, Body: ToPublishResponseBody(results) };
}
```

- [ ] **Step 5: Write `src/router.ts`**

```typescript
import express, { Router, type Request, type Response } from 'express';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJWorkLogger, WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { HandleWorkQueuePublish, type WorkQueuePublishDependencies } from './publishHandler';
import type { WorkQueueServerSettings } from './publishRequests';
import { APIKeyScopeAuthorizer } from './scopeAuthorizer';

/** The fields MJServer's unified auth middleware sets on req.userPayload that this endpoint reads. */
export interface WorkQueueRequestPayload {
    userRecord?: UserInfo;
    apiKeyHash?: string;
}

export function CreateDefaultPublishDependencies(settings: WorkQueueServerSettings): WorkQueuePublishDependencies {
    return {
        GetEngine: async () => {
            // Configure as the SYSTEM user. Config is first-caller-wins for the engine's identity, so configuring
            // with the request's user would make an arbitrary API-key user the engine's context user whenever the
            // host is disabled in this process (03 §9).
            const systemUser = UserCache.Instance.GetSystemUser();
            if (!systemUser) {
                throw new Error('System user not found');
            }
            await WorkQueueEngine.Instance.Config(false, systemUser);
            return WorkQueueEngine.Instance;
        },
        Authorizer: new APIKeyScopeAuthorizer(),
        Settings: settings,
        Log: new MJWorkLogger('[WorkQueue:REST]'),
    };
}

export function CreateWorkQueuePublishRouter(dependencies: WorkQueuePublishDependencies): Router {
    const router = Router();
    const parseJson = express.json({ limit: dependencies.Settings.BodyLimit });
    // No body-parsing middleware on the route: the handler pulls the body through ReadBody only after
    // authentication and the scope check, so an unauthorized caller cannot make the server parse 30 MB (03 §9).
    router.post('/topics/:topic/messages', async (req: Request, res: Response) => {
        const payload = (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload;
        const result = await HandleWorkQueuePublish({
            TopicName: String(req.params.topic ?? ''),
            User: payload?.userRecord,
            ApiKeyHash: payload?.apiKeyHash,
            Path: req.originalUrl,
            ReadBody: () => new Promise<unknown>((resolve, reject) => {
                parseJson(req, res, (error?: unknown) => (error ? reject(error) : resolve(req.body)));
            }),
        }, dependencies);
        res.status(result.Status).json(result.Body);
    });
    return router;
}
```

- [ ] **Step 6: Write `src/WorkQueueServerExtension.ts`**

```typescript
import type { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    type ExtensionHealthResult, type ExtensionInitResult, type ServerExtensionConfig, type ServerExtensionInitContext,
    type ServerExtensionPhase,
} from '@memberjunction/server-extensions-core';
import { WorkQueueHost } from '@memberjunction/work-queue-engine';
import { ParseServerSettings } from './publishRequests';
import { CreateDefaultPublishDependencies, CreateWorkQueuePublishRouter } from './router';

/** Adds a leading slash and drops trailing ones. The loader always supplies a non-blank RootPath. */
export function NormalizeRootPath(rootPath: string | undefined): string {
    const trimmed = (rootPath ?? '').trim().replace(/\/+$/, '');
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Mounts `POST {RootPath}/topics/{topic}/messages` after MJServer's unified authentication. Its health
 * check also reports this process's WorkQueueHost, when one is running.
 */
@RegisterClass(BaseServerExtension, 'WorkQueueServerExtension')
export class WorkQueueServerExtension extends BaseServerExtension {
    private routes: string[] = [];

    public override get DefaultPhase(): ServerExtensionPhase {
        return 'post-auth';
    }

    public async Initialize(contextOrApp: ServerExtensionInitContext | Application, config?: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            const { App, Config } = resolveInit(contextOrApp, config);
            const rootPath = NormalizeRootPath(Config.RootPath);
            const settings = ParseServerSettings(Config.Settings ?? {});
            App.use(rootPath, CreateWorkQueuePublishRouter(CreateDefaultPublishDependencies(settings)));
            this.routes = [`POST ${rootPath}/topics/:topic/messages`];
            return { Success: true, Message: `Work queue publish endpoint mounted at ${rootPath}`, RegisteredRoutes: [...this.routes] };
        } catch (error) {
            return { Success: false, Message: error instanceof Error ? error.message : String(error) };
        }
    }

    public async Shutdown(): Promise<void> {
        // Stateless: in-flight requests finish with the HTTP server; the host shuts down through ShutdownRegistry.
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        const host = WorkQueueHost.Active?.GetHealth() ?? null;
        return {
            Healthy: host === null || host.Subscriptions.every(s => s.State !== 'Error'),
            Name: 'WorkQueueServerExtension',
            Details: { Routes: [...this.routes], Host: host },
        };
    }
}

function resolveInit(contextOrApp: ServerExtensionInitContext | Application, config?: ServerExtensionConfig): { App: Application; Config: ServerExtensionConfig } {
    if (typeof contextOrApp === 'function') {
        if (!config) {
            throw new Error('WorkQueueServerExtension.Initialize(app, config) requires a config');
        }
        return { App: contextOrApp, Config: config };
    }
    return { App: contextOrApp.app, Config: contextOrApp.config };
}
```

- [ ] **Step 7: Export the new modules**

Replace `packages/WorkQueue/server/src/index.ts` with:

```typescript
export * from './publishRequests';
export * from './scopeAuthorizer';
export * from './publishHandler';
export * from './router';
export * from './WorkQueueServerExtension';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/server && pnpm test`
Expected: PASS — publishRequests (9), scopeAuthorizer (4), publishHandler (10), router (4), WorkQueueServerExtension (4).

Run: `cd packages/WorkQueue/server && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/server/src
git commit -m "feat(work-queue-server): API-key-only REST publish endpoint with resolver-parity scope checks"
```

---

### Task 10: `mj queue` CLI commands

**Files:**
- Create: `packages/MJCLI/src/lib/work-queue/queue-format.ts`, `src/lib/work-queue/queue-session.ts`, `src/lib/work-queue/queue-worker.ts`
- Create: `packages/MJCLI/src/commands/queue/index.ts`, `usage.ts`, `stats.ts`, `dead-letters.ts`, `partitions.ts`, `replay.ts`, `discard.ts`, `backlog.ts`, `work.ts`, `export-topology.ts`, `import-bindings.ts`, `validate-bindings.ts`
- Modify: `packages/MJCLI/package.json`, `packages/MJCLI/src/utils/open-app-context.ts`, `packages/MJCLI/src/lib/domain-profiles.ts`, `packages/MJCLI/src/light-commands.ts`
- Test: `packages/MJCLI/src/__tests__/work-queue-cli.test.ts`, `src/__tests__/work-queue-commands.test.ts`, `src/__tests__/work-queue-worker.test.ts`

**Interfaces:**
- Consumes: the Task 5 operation classes and row types (`@memberjunction/core-entities`); `WorkQueueEngine` with `ExportManifest(transportName)` and `ImportBindings(bindings, contextUser)` (plan 05, 03 §11); `WorkQueueHost`, `RunOnceResult` (Tasks 3, 3b), `SharedProviderSource` (Task 1), `MJWorkLogger` (plan 05); `BindingImport`, `WorkJson` (plan 04); `RemoteOpResult`, `DatabaseProviderBase`, `UserInfo` (`@memberjunction/core`); `initializeProvider`-backed `ensureProviderInitialized`, `buildContextUser`, `closeConnectionPool` (`src/utils/open-app-context.ts`); `DomainUsageCommand` (`src/lib/domain-usage-command.ts`); oclif `Command`, `Flags`, `Args`.
- Produces:
  - `FormatTable(headers, rows)`, `FormatStatsTable(rows, failures)`, `FormatDeadLetters(output)`, `FormatPartitions(output)`, `FormatBindingIssues(issues)`, `HasBindingErrors(issues)`, `ParseBindingImport(json)`, `RequireOperationOutput(result, operationKey)`, `ToPartitionCondition(value)`, `PARTITION_CONDITION_OPTIONS`, `FormatBacklog(output)`
  - `WorkerStartFailure(health, requested): string | null`, `RunUntilStopped(host, signals?): Promise<'Signal' | 'Finished'>`, `interface StoppableWorkHost` (`src/lib/work-queue/queue-worker.ts`)
  - `interface WorkQueueCliSession { Provider: DatabaseProviderBase; User: UserInfo; Close(): Promise<void> }`, `OpenWorkQueueSession(): Promise<WorkQueueCliSession>`
  - Commands `mj queue stats | dead-letters | partitions | replay | discard | backlog | work | export-topology | import-bindings | validate-bindings` (03 §8)

Command surface:

| Command | Flags / args | Calls | Exit 1 when |
| --- | --- | --- | --- |
| `stats` | `--subscription`, `--json` | `WorkQueue.GetSubscriptionStats` | the operation fails |
| `dead-letters` | `--subscription` (required), `--cursor`, `--page-size`, `--json` | `WorkQueue.ListDeadLetters` | the operation fails |
| `partitions` | `--subscription` (required), `--condition`, `--cursor`, `--page-size`, `--json` | `WorkQueue.ListPartitions` | the operation fails |
| `replay` | `--subscription`, `--delivery` (required), `--note` | `WorkQueue.ReplayDeadLetter` | unsupported or nothing replayed |
| `discard` | `--subscription`, `--delivery`, `--reason` (required) | `WorkQueue.DiscardDelivery` | unsupported or nothing discarded. An in-flight delivery prints `Cancel requested` and exits 0 |
| `backlog` | `--subscription` (required), `--json` | `WorkQueue.GetBacklog` | the operation fails (an unsupported transport prints so and exits 0) |
| `work` | `--subscription` (required), `--once`, `--max`, `--idle-exit-ms`, `--max-duration-ms` (these three `dependsOn: ['once']`), `--concurrency`, `--shutdown-drain-ms` | `WorkQueueHost.RunOnce` (with `--once`) or `Start` until SIGINT/SIGTERM | **no requested subscription reached `Running`** because of an unknown name, `HandlerNotRegistered`, `Unsupported` or `Error`, or boot/config failed. **Exit 0** for an empty queue, a spent budget, `MaxDuration`, a signal, or a subscription an operator paused (03 §11) |
| `export-topology` | `--transport` (required), `--output` | `WorkQueueEngine.ExportManifest` → stdout or file | the transport is unknown |
| `import-bindings` | `<file>` (required), `--json` | `WorkQueueEngine.ImportBindings` | the file is invalid or any issue is an `Error` |
| `validate-bindings` | `--transport`, `--json` | `WorkQueue.ValidateBindings` | any issue is an `Error` |

Operations run **in process** through the CLI's database provider — the same `Authorize` gate applies as over GraphQL (Task 6), so the CLI's context user needs Read on `MJ: Work Queue Deliveries` and, for `replay`/`discard`, Update on `MJ: Work Queue Subscriptions`.

**Worker exit contract (`work`).** A scheduler treats exit 0 as "this job did what it could". A job that *cannot* run — the subscription does not exist, its handler is not in the image, the transport does not support it — must therefore exit **non-zero**, or a misconfigured image churns "successful" jobs forever. `SIGTERM`/`SIGINT` are handled in **both** modes: the handler calls `host.Shutdown()` (the shared promise), the run ends with reason `Shutdown`, and the process exits 0 only after the drain. The command's heavy lifting lives in `queue-worker.ts` so it is unit-testable without oclif. None of these commands are light commands: the prerun hook loads `ServerBootstrapLite`, whose manifest registers the server operations (Task 11).

- [ ] **Step 1: Add dependencies and expose the provider bootstrap**

In `packages/MJCLI/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue-core": "6.1.0",
"@memberjunction/work-queue-engine": "6.1.0",
```

Run: `pnpm install` (repository root)

In `packages/MJCLI/src/utils/open-app-context.ts`, change `async function ensureProviderInitialized(): Promise<DatabaseProviderBase> {` to `export async function ensureProviderInitialized(): Promise<DatabaseProviderBase> {`. Nothing else changes.

In `packages/MJCLI/src/lib/domain-profiles.ts`, add to `DOMAIN_PROFILES` (after the `ai` entry):

```typescript
  queue: {
    summary: 'Operate the durable work queue — stats, backlog, dead letters, replay and discard, container-job workers, cloud bindings.',
    runtime: { class: 'moderate', typicalSeconds: 15, note: 'dominated by MJ bootstrap; each operation is a few queries or cloud API calls' },
  },
```

In `packages/MJCLI/src/light-commands.ts`, add to `LIGHT_COMMANDS` beside the other domains' usage entries (the index page only prints text, and the usage page composes static metadata — neither needs the MJ bootstrap):

```typescript
  'queue',
  'queue usage',
  'queue:usage',
```

Every other `queue` command stays **out** of the set: the prerun hook must load `ServerBootstrapLite`, whose manifest registers the server operations and handlers (Task 11).

- [ ] **Step 2: Write the failing tests**

`packages/MJCLI/src/__tests__/work-queue-cli.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkQueueDeadLetterRow, WorkQueuePartitionStateRow } from '@memberjunction/core-entities';
import {
    FormatBacklog, FormatBindingIssues, FormatDeadLetters, FormatPartitions, FormatStatsTable, FormatTable, HasBindingErrors, ParseBindingImport,
    RequireOperationOutput, ToPartitionCondition,
} from '../lib/work-queue/queue-format.js';

const DEAD_LETTER: WorkQueueDeadLetterRow = {
    DeliveryID: 'DDDDDDDD-4444-4444-8444-000000000001', PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded',
    LastError: 'bad row 12', DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
    Message: { MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', Attributes: {}, PayloadJSON: null, PublishedAt: '2026-09-16T11:00:00.000Z' },
};

const PARTITION: WorkQueuePartitionStateRow = {
    PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: 'DDDDDDDD-4444-4444-8444-000000000001', WaitingItems: 3,
};

describe('queue formatting', () => {
    it('pads table columns to the widest cell', () => {
        expect(FormatTable(['A', 'Long header'], [['wide cell', 'x']])).toBe('A          Long header\n---------  -----------\nwide cell  x');
    });

    it('renders stats with dashes for unknown values and lists failures', () => {
        const text = FormatStatsTable([{
            SubscriptionName: 'email.unsubscribe', Pending: 2, InFlight: 0, DeadLettered: 1, BlockedKeys: null,
            OldestPendingAgeSeconds: null, CompletedLastHour: 40, AsOf: '2026-09-16T12:00:00.000Z',
        }], [{ subscriptionName: 'email.dashboard', error: 'Stats are unavailable for this subscription' }]);
        expect(text).toContain('email.unsubscribe  2        0          1     —             —                   40');
        expect(text).toContain('! email.dashboard: Stats are unavailable for this subscription');
        expect(FormatStatsTable([], [])).toBe('No subscriptions.');
    });

    it('renders dead letters, empty pages and unsupported transports', () => {
        expect(FormatDeadLetters({ supported: false, items: [], nextCursor: null })).toBe("This subscription's transport cannot list dead letters.");
        expect(FormatDeadLetters({ supported: true, items: [], nextCursor: null })).toBe('No dead letters.');
        const text = FormatDeadLetters({ supported: true, items: [DEAD_LETTER], nextCursor: 'cursor-2' });
        expect(text).toContain('DDDDDDDD-4444-4444-8444-000000000001  venue-42       5         MaxAttemptsExceeded  yes');
        expect(text.endsWith('More: --cursor cursor-2')).toBe(true);
    });

    it('renders partitions', () => {
        const text = FormatPartitions({ supported: true, items: [PARTITION], nextCursor: null });
        expect(text).toContain('venue-42       Blocked    DDDDDDDD-4444-4444-8444-000000000001  3');
        expect(FormatPartitions({ supported: false, items: [], nextCursor: null })).toBe("This subscription's transport cannot list partitions.");
    });

    it('renders the backlog, marking capped counts', () => {
        expect(FormatBacklog({ supported: true, claimable: 7, inFlight: 2, total: 9, capped: false })).toBe('claimable 7 · in flight 2 · total 9');
        expect(FormatBacklog({ supported: true, claimable: 1000, inFlight: 2, total: 1002, capped: true })).toBe('claimable 1000 · in flight 2 · total 1002 (capped at 1000 — the real backlog is at least this large)');
        expect(FormatBacklog({ supported: false, claimable: 0, inFlight: 0, total: 0, capped: false })).toBe("This subscription's transport reports no backlog; scale from the transport's own metrics.");
    });

    it('renders binding issues and detects errors', () => {
        const issues = [
            { Severity: 'Warning' as const, Subject: 'email.events', Message: 'IsFifo should be 1' },
            { Severity: 'Error' as const, Subject: 'email.unsubscribe', Message: 'queue not found' },
        ];
        expect(FormatBindingIssues(issues)).toBe('⚠ Warning email.events: IsFifo should be 1\n✖ Error email.unsubscribe: queue not found');
        expect(HasBindingErrors(issues)).toBe(true);
        expect(HasBindingErrors(issues.slice(0, 1))).toBe(false);
        expect(FormatBindingIssues([])).toBe('No binding issues.');
    });
});

describe('queue input helpers', () => {
    it('parses a binding import and rejects malformed files', () => {
        const json = JSON.stringify({
            ManifestVersion: 1,
            Topics: [{ Name: 'email.events', BindingConfig: { SnsTopicArn: 'arn:aws:sns:us-east-1:1:mj-email-events.fifo' } }],
            Subscriptions: [{ Name: 'email.unsubscribe', BindingConfig: { QueueUrl: 'https://sqs/x', IsFifo: true } }],
        });
        expect(ParseBindingImport(json).Subscriptions[0]).toEqual({ Name: 'email.unsubscribe', BindingConfig: { QueueUrl: 'https://sqs/x', IsFifo: true } });
        expect(() => ParseBindingImport('{')).toThrow('not valid JSON');
        expect(() => ParseBindingImport('{"ManifestVersion":2,"Topics":[],"Subscriptions":[]}')).toThrow('ManifestVersion');
        expect(() => ParseBindingImport('{"ManifestVersion":1,"Topics":[{"Name":"x"}],"Subscriptions":[]}')).toThrow('Topics[0] must have a string Name and an object BindingConfig');
    });

    it('returns operation output or throws with the result code', () => {
        expect(RequireOperationOutput({ Success: true, Output: { n: 1 } }, 'WorkQueue.X')).toEqual({ n: 1 });
        expect(() => RequireOperationOutput({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'pageSize must be an integer between 1 and 500' }, 'WorkQueue.ListDeadLetters'))
            .toThrow('WorkQueue.ListDeadLetters failed (EXECUTION_ERROR): pageSize must be an integer between 1 and 500');
    });

    it('narrows a condition flag to the operation union', () => {
        expect(ToPartitionCondition(undefined)).toBeUndefined();
        expect(ToPartitionCondition('Blocked')).toBe('Blocked');
        expect(() => ToPartitionCondition('Stuck')).toThrow('--condition must be one of Idle, InFlight, Blocked');
    });
});
```

`packages/MJCLI/src/__tests__/work-queue-commands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import QueueBacklog from '../commands/queue/backlog.js';
import QueueDeadLetters from '../commands/queue/dead-letters.js';
import QueueDiscard from '../commands/queue/discard.js';
import QueueExportTopology from '../commands/queue/export-topology.js';
import QueueImportBindings from '../commands/queue/import-bindings.js';
import QueuePartitions from '../commands/queue/partitions.js';
import QueueReplay from '../commands/queue/replay.js';
import QueueStats from '../commands/queue/stats.js';
import QueueValidateBindings from '../commands/queue/validate-bindings.js';
import QueueWork from '../commands/queue/work.js';

interface FlagSurface {
    required?: boolean;
    dependsOn?: string[];
}

type CommandSurface = { flags: Record<string, FlagSurface> };

const COMMANDS: Array<[string, CommandSurface, string[], string[]]> = [
    ['stats', QueueStats, ['json', 'subscription'], []],
    ['dead-letters', QueueDeadLetters, ['cursor', 'json', 'page-size', 'subscription'], ['subscription']],
    ['partitions', QueuePartitions, ['condition', 'cursor', 'json', 'page-size', 'subscription'], ['subscription']],
    ['replay', QueueReplay, ['delivery', 'note', 'subscription'], ['delivery', 'subscription']],
    ['discard', QueueDiscard, ['delivery', 'reason', 'subscription'], ['delivery', 'reason', 'subscription']],
    ['backlog', QueueBacklog, ['json', 'subscription'], ['subscription']],
    ['work', QueueWork, ['concurrency', 'idle-exit-ms', 'max', 'max-duration-ms', 'once', 'shutdown-drain-ms', 'subscription'], ['subscription']],
    ['export-topology', QueueExportTopology, ['output', 'transport'], ['transport']],
    ['import-bindings', QueueImportBindings, ['json'], []],
    ['validate-bindings', QueueValidateBindings, ['json', 'transport'], []],
];

describe('mj queue command surface', () => {
    it('declares exactly the documented flags', () => {
        for (const [name, command, flags] of COMMANDS) {
            expect(Object.keys(command.flags).sort(), name).toEqual(flags);
        }
    });

    it('marks the documented flags and arguments required', () => {
        for (const [name, command, , required] of COMMANDS) {
            const actual = Object.entries(command.flags).filter(([, flag]) => flag.required === true).map(([flag]) => flag).sort();
            expect(actual, name).toEqual(required);
        }
        expect(QueueImportBindings.args.file.required).toBe(true);
    });

    it('ties the one-shot flags to --once', () => {
        const flags: Record<string, FlagSurface> = QueueWork.flags;
        for (const name of ['max', 'idle-exit-ms', 'max-duration-ms']) {
            expect(flags[name].dependsOn, name).toEqual(['once']);
        }
    });

    it('keeps only the text-only pages light', async () => {
        const { LIGHT_COMMANDS } = await import('../light-commands.js');
        expect(['queue', 'queue usage', 'queue:usage'].every(id => LIGHT_COMMANDS.has(id))).toBe(true);
        expect(['queue stats', 'queue work', 'queue backlog'].some(id => LIGHT_COMMANDS.has(id))).toBe(false);
    });
});
```

`packages/MJCLI/src/__tests__/work-queue-worker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { RunUntilStopped, WorkerStartFailure, type StoppableWorkHost } from '../lib/work-queue/queue-worker.js';

function health(states: Array<[string, 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error', string | null]>) {
    return { InstanceID: 'job', Subscriptions: states.map(([Name, State, Reason]) => ({ Name, State, Reason, InFlight: 0 })) };
}

describe('WorkerStartFailure', () => {
    it('is null when at least one requested subscription is Running', () => {
        expect(WorkerStartFailure(health([['a', 'Running', null], ['b', 'Paused', 'Subscription status is Paused']]), '*')).toBeNull();
    });

    it('counts a subscription that ran and was then shut down (the state RunOnce leaves behind)', () => {
        expect(WorkerStartFailure(health([['a', 'Paused', 'Host is shut down']]), 'a')).toBeNull();
    });

    it('names every reason when nothing could run', () => {
        expect(WorkerStartFailure(health([['venue-import', 'HandlerNotRegistered', "No BaseWorkHandler is registered for HandlerKey 'venue.import'"]]), 'venue-import'))
            .toBe("No subscription is running for 'venue-import': venue-import is HandlerNotRegistered (No BaseWorkHandler is registered for HandlerKey 'venue.import')");
        expect(WorkerStartFailure(health([['nope', 'Error', "Subscription 'nope' not found"]]), 'nope')).toContain("nope is Error (Subscription 'nope' not found)");
        expect(WorkerStartFailure(health([['email.ordered', 'Unsupported', 'Ordered requires the Database transport']]), 'email.ordered')).toContain('Unsupported');
    });

    it('does not fail for a subscription an operator paused, but fails when nothing matched at all', () => {
        expect(WorkerStartFailure(health([['a', 'Paused', 'Subscription status is Paused']]), 'a')).toBeNull();
        expect(WorkerStartFailure(health([]), '*')).toBe("No subscription is running for '*': no MJWorker subscriptions matched");
    });
});

describe('RunUntilStopped', () => {
    function host(): StoppableWorkHost & { Shutdowns: number } {
        const h = { Shutdowns: 0, Shutdown: async (): Promise<void> => { h.Shutdowns++; } };
        return h;
    }

    it('shuts the host down on SIGTERM and removes its listeners', async () => {
        const signals = new EventEmitter();
        const h = host();
        const run = RunUntilStopped(h, new Promise<void>(() => undefined), signals);
        signals.emit('SIGTERM');
        expect(await run).toBe('Signal');
        expect(h.Shutdowns).toBe(1);
        expect(signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT')).toBe(0);
    });

    it('returns Finished when the work ends first, still removing its listeners', async () => {
        const signals = new EventEmitter();
        const h = host();
        expect(await RunUntilStopped(h, Promise.resolve(), signals)).toBe('Finished');
        expect(h.Shutdowns).toBe(0);
        expect(signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT')).toBe(0);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/MJCLI && pnpm test work-queue-cli work-queue-commands work-queue-worker`
Expected: FAIL — unresolved imports `../lib/work-queue/queue-format.js`, `../lib/work-queue/queue-worker.js` and `../commands/queue/*.js`.

- [ ] **Step 4: Write `src/lib/work-queue/queue-format.ts`**

```typescript
import type { RemoteOpResult } from '@memberjunction/core';
import type {
    WorkQueueBindingIssueRow, WorkQueueGetBacklogOutput, WorkQueueListDeadLettersOutput, WorkQueueListPartitionsInput,
    WorkQueueListPartitionsOutput, WorkQueueStatsFailureRow, WorkQueueSubscriptionStatsRow,
} from '@memberjunction/core-entities';
import type { BindingImport, WorkJson } from '@memberjunction/work-queue-core';

type PartitionConditionOption = NonNullable<WorkQueueListPartitionsInput['condition']>;

export const PARTITION_CONDITION_OPTIONS: readonly PartitionConditionOption[] = ['Idle', 'InFlight', 'Blocked'];

const UNKNOWN = '—';
const MAX_ERROR_WIDTH = 60;

export function FormatTable(headers: string[], rows: string[][]): string {
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => (row[index] ?? '').length)));
    const line = (cells: string[]): string => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
    return [line(headers), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

export function FormatStatsTable(rows: WorkQueueSubscriptionStatsRow[], failures: WorkQueueStatsFailureRow[]): string {
    if (rows.length === 0 && failures.length === 0) {
        return 'No subscriptions.';
    }
    const table = rows.length === 0 ? '' : FormatTable(
        ['Subscription', 'Pending', 'In flight', 'Dead', 'Blocked keys', 'Oldest pending (s)', 'Done/hour'],
        rows.map(row => [
            row.SubscriptionName, String(row.Pending), String(row.InFlight), String(row.DeadLettered), optional(row.BlockedKeys),
            optional(row.OldestPendingAgeSeconds), optional(row.CompletedLastHour),
        ]),
    );
    const failed = failures.map(failure => `! ${failure.subscriptionName}: ${failure.error}`);
    return [table, ...failed].filter(part => part !== '').join('\n');
}

export function FormatDeadLetters(output: WorkQueueListDeadLettersOutput): string {
    if (!output.supported) {
        return "This subscription's transport cannot list dead letters.";
    }
    if (output.items.length === 0) {
        return 'No dead letters.';
    }
    const table = FormatTable(
        ['Delivery', 'Partition key', 'Attempts', 'Reason', 'Blocks key', 'Dead-lettered at', 'Last error'],
        output.items.map(item => [
            item.DeliveryID, item.PartitionKey ?? UNKNOWN, String(item.Attempts), item.Reason, item.BlocksKey ? 'yes' : 'no',
            item.DeadLetteredAt ?? UNKNOWN, truncate(item.LastError ?? '', MAX_ERROR_WIDTH),
        ]),
    );
    return withCursor(table, output.nextCursor);
}

export function FormatPartitions(output: WorkQueueListPartitionsOutput): string {
    if (!output.supported) {
        return "This subscription's transport cannot list partitions.";
    }
    if (output.items.length === 0) {
        return 'No partitions match.';
    }
    const table = FormatTable(
        ['Partition key', 'Condition', 'Head delivery', 'Waiting'],
        output.items.map(item => [item.PartitionKey, item.Condition, item.HeadDeliveryID ?? UNKNOWN, String(item.WaitingItems)]),
    );
    return withCursor(table, output.nextCursor);
}

export function FormatBacklog(output: WorkQueueGetBacklogOutput): string {
    if (!output.supported) {
        return "This subscription's transport reports no backlog; scale from the transport's own metrics.";
    }
    const line = `claimable ${output.claimable} · in flight ${output.inFlight} · total ${output.total}`;
    return output.capped ? `${line} (capped at 1000 — the real backlog is at least this large)` : line;
}

export function FormatBindingIssues(issues: WorkQueueBindingIssueRow[]): string {
    if (issues.length === 0) {
        return 'No binding issues.';
    }
    return issues.map(issue => `${issue.Severity === 'Error' ? '✖' : '⚠'} ${issue.Severity} ${issue.Subject}: ${issue.Message}`).join('\n');
}

export function HasBindingErrors(issues: WorkQueueBindingIssueRow[]): boolean {
    return issues.some(issue => issue.Severity === 'Error');
}

export function ParseBindingImport(json: string): BindingImport {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error('Binding import file is not valid JSON');
    }
    if (!isRecord(parsed) || parsed.ManifestVersion !== 1 || !Array.isArray(parsed.Topics) || !Array.isArray(parsed.Subscriptions)) {
        throw new Error('Binding import must be { "ManifestVersion": 1, "Topics": [...], "Subscriptions": [...] }');
    }
    return {
        ManifestVersion: 1,
        Topics: parsed.Topics.map((entry, index) => bindingEntry(entry, `Topics[${index}]`)),
        Subscriptions: parsed.Subscriptions.map((entry, index) => bindingEntry(entry, `Subscriptions[${index}]`)),
    };
}

export function RequireOperationOutput<T>(result: RemoteOpResult<T>, operationKey: string): T {
    if (!result.Success || result.Output === undefined) {
        throw new Error(`${operationKey} failed (${result.ResultCode ?? 'UNKNOWN'}): ${result.ErrorMessage ?? 'no output'}`);
    }
    return result.Output;
}

export function ToPartitionCondition(value: string | undefined): PartitionConditionOption | undefined {
    if (value === undefined) {
        return undefined;
    }
    const condition = PARTITION_CONDITION_OPTIONS.find(option => option === value);
    if (!condition) {
        throw new Error(`--condition must be one of ${PARTITION_CONDITION_OPTIONS.join(', ')}`);
    }
    return condition;
}

function bindingEntry(value: unknown, at: string): { Name: string; BindingConfig: Record<string, WorkJson> } {
    if (!isRecord(value) || typeof value.Name !== 'string' || !isJsonObject(value.BindingConfig)) {
        throw new Error(`${at} must have a string Name and an object BindingConfig`);
    }
    return { Name: value.Name, BindingConfig: value.BindingConfig };
}

function isJsonObject(value: unknown): value is Record<string, WorkJson> {
    return isRecord(value) && Object.values(value).every(isWorkJson);
}

function isWorkJson(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(isWorkJson);
    }
    return isJsonObject(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optional(value: number | null): string {
    return value === null ? UNKNOWN : String(value);
}

function truncate(text: string, width: number): string {
    return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

function withCursor(table: string, nextCursor: string | null): string {
    return nextCursor ? `${table}\nMore: --cursor ${nextCursor}` : table;
}
```

- [ ] **Step 5: Write `src/lib/work-queue/queue-session.ts`**

```typescript
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { buildContextUser, closeConnectionPool, ensureProviderInitialized } from '../../utils/open-app-context.js';

export interface WorkQueueCliSession {
    Provider: DatabaseProviderBase;
    User: UserInfo;
    Close(): Promise<void>;
}

/** The CLI's shared provider (SQL Server or PostgreSQL per config) and the system user. */
export async function OpenWorkQueueSession(): Promise<WorkQueueCliSession> {
    const provider = await ensureProviderInitialized();
    const user = await buildContextUser();
    return { Provider: provider, User: user, Close: closeConnectionPool };
}
```

- [ ] **Step 6: Write the commands**

Every command follows the same shape: do the work inside `try`, record a failure message instead of throwing, always close the session, and only then call `this.error(message, { exit: 1 })` — so an oclif exit is never swallowed or reported twice by a `catch`.

`packages/MJCLI/src/commands/queue/index.ts`:

```typescript
import { Command } from '@oclif/core';

export default class Queue extends Command {
  static description = 'Operate the durable work queue';

  static examples = [
    '<%= config.bin %> <%= command.id %> stats',
    '<%= config.bin %> <%= command.id %> dead-letters --subscription email.unsubscribe',
  ];

  async run(): Promise<void> {
    this.log('MemberJunction Work Queue\n');
    this.log('  mj queue stats                 - Counts per subscription');
    this.log("  mj queue dead-letters          - List a subscription's dead letters");
    this.log('  mj queue partitions            - List in-flight / blocked partition keys');
    this.log('  mj queue replay                - Replay one dead letter');
    this.log('  mj queue discard               - Discard a pending or dead-lettered delivery, or cancel one in flight');
    this.log('  mj queue backlog               - The autoscaler metric for one subscription');
    this.log('  mj queue work                  - Run subscriptions here: --once for a container job, or until stopped');
    this.log('  mj queue export-topology       - Write the topology manifest for Terraform');
    this.log('  mj queue import-bindings       - Record cloud resource bindings from Terraform output');
    this.log('  mj queue validate-bindings     - Check topology and cloud bindings');
    this.log('\nRun "mj queue COMMAND --help" for details.');
  }
}
```

`packages/MJCLI/src/commands/queue/usage.ts`:

```typescript
import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `queue` domain (`mj queue usage`). */
export default class QueueUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj queue` command.';
  protected Domain = 'queue';
}
```

`packages/MJCLI/src/commands/queue/stats.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueGetSubscriptionStatsOperation } from '@memberjunction/core-entities';
import { FormatStatsTable, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueStats extends Command {
  static description = 'Show pending, in-flight and dead-lettered counts for work-queue subscriptions';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --subscription email.unsubscribe --json',
  ];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name; omit for every subscription' }),
    json: Flags.boolean({ description: 'Print JSON instead of a table', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueStats);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const result = await new WorkQueueGetSubscriptionStatsOperation().Execute({ subscriptionName: flags.subscription }, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.GetSubscriptionStats');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatStatsTable(output.subscriptions, output.failures));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/dead-letters.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueListDeadLettersOperation } from '@memberjunction/core-entities';
import { FormatDeadLetters, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueDeadLetters extends Command {
  static description = "List a work-queue subscription's dead-lettered deliveries";

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --page-size 20'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    cursor: Flags.string({ description: 'nextCursor from a previous page' }),
    'page-size': Flags.integer({ description: 'Items per page (1–500)', default: 50 }),
    json: Flags.boolean({ description: 'Print JSON instead of a table', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueDeadLetters);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, cursor: flags.cursor, pageSize: flags['page-size'] };
      const result = await new WorkQueueListDeadLettersOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ListDeadLetters');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatDeadLetters(output));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/partitions.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueListPartitionsOperation } from '@memberjunction/core-entities';
import { FormatPartitions, PARTITION_CONDITION_OPTIONS, RequireOperationOutput, ToPartitionCondition } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueuePartitions extends Command {
  static description = "List a work-queue subscription's in-flight or blocked partition keys";

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --condition Blocked'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    condition: Flags.string({ description: 'Only keys in this condition', options: [...PARTITION_CONDITION_OPTIONS] }),
    cursor: Flags.string({ description: 'nextCursor from a previous page' }),
    'page-size': Flags.integer({ description: 'Items per page (1–500)', default: 50 }),
    json: Flags.boolean({ description: 'Print JSON instead of a table', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuePartitions);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, condition: ToPartitionCondition(flags.condition), cursor: flags.cursor, pageSize: flags['page-size'] };
      const result = await new WorkQueueListPartitionsOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ListPartitions');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatPartitions(output));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/replay.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueReplayDeadLetterOperation } from '@memberjunction/core-entities';
import { RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueReplay extends Command {
  static description = 'Replay one dead-lettered work-queue delivery';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --delivery <id> --note "mapping fixed"'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    delivery: Flags.string({ char: 'd', description: 'DeliveryID from `mj queue dead-letters`', required: true }),
    note: Flags.string({ description: 'Operator note stored with the resolution' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueReplay);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, deliveryID: flags.delivery, note: flags.note };
      const result = await new WorkQueueReplayDeadLetterOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ReplayDeadLetter');
      if (!output.supported) {
        failure = "This subscription's transport cannot replay a single dead letter.";
      } else if (!output.replayed) {
        failure = 'Nothing replayed: the delivery does not exist or is not dead-lettered.';
      } else {
        this.log(`Replayed ${flags.delivery}.`);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/discard.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueDiscardDeliveryOperation } from '@memberjunction/core-entities';
import { RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueDiscard extends Command {
  static description = 'Discard one pending or dead-lettered work-queue delivery, or cancel one that is in flight';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --delivery <id> --reason "bad batch, republished"'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    delivery: Flags.string({ char: 'd', description: 'DeliveryID to discard', required: true }),
    reason: Flags.string({ char: 'r', description: 'Why the work is dropped (at most 1000 characters)', required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueDiscard);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, deliveryID: flags.delivery, reason: flags.reason };
      const result = await new WorkQueueDiscardDeliveryOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.DiscardDelivery');
      if (!output.supported) {
        failure = "This subscription's transport cannot discard this delivery.";
      } else if (!output.discarded) {
        failure = 'Nothing discarded: the delivery does not exist or is already finished.';
      } else if (output.cancelRequested) {
        this.log(`Cancel requested for ${flags.delivery}: its handler is told to stop within 30 seconds, and the delivery becomes Discarded once it does.`);
      } else {
        this.log(`Discarded ${flags.delivery}.`);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/backlog.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueGetBacklogOperation } from '@memberjunction/core-entities';
import { FormatBacklog, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueBacklog extends Command {
  static description = 'Show the autoscaler metric for one subscription: claimable pending plus in-flight deliveries';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription venue-import', '<%= config.bin %> <%= command.id %> --subscription venue-import --json'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    json: Flags.boolean({ description: 'Print JSON instead of text', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueBacklog);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const result = await new WorkQueueGetBacklogOperation().Execute({ subscriptionName: flags.subscription }, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.GetBacklog');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatBacklog(output));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/lib/work-queue/queue-worker.ts` — the parts of `work` worth unit-testing, free of oclif:

```typescript
import { HOST_SHUT_DOWN_REASON, type WorkQueueHostHealth } from '@memberjunction/work-queue-engine';

export interface StoppableWorkHost {
  Shutdown(): Promise<void>;
}

/** The slice of `process` RunUntilStopped needs; an EventEmitter satisfies it in tests. */
export interface SignalSource {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

/**
 * Why this worker must exit non-zero, or null (03 §11). A scheduler reads exit 0 as "the job did what it could", so a
 * job that CANNOT run — unknown subscription, handler missing from the image, unsupported transport — has to fail
 * loudly instead of churning "successful" jobs. A subscription an operator PAUSED is not a failure: pausing is
 * deliberate, and the scaler query already stops spawning jobs for it.
 */
export function WorkerStartFailure(health: WorkQueueHostHealth, requested: string): string | null {
  // After Shutdown() a subscription that WAS running reports Paused / HOST_SHUT_DOWN_REASON — that one ran.
  if (health.Subscriptions.some(s => s.State === 'Running' || s.Reason === HOST_SHUT_DOWN_REASON)) {
    return null;
  }
  if (health.Subscriptions.length === 0) {
    return `No subscription is running for '${requested}': no MJWorker subscriptions matched`;
  }
  const broken = health.Subscriptions.filter(s => s.State !== 'Paused');
  if (broken.length === 0) {
    return null;
  }
  return `No subscription is running for '${requested}': ${broken.map(s => `${s.Name} is ${s.State}${s.Reason ? ` (${s.Reason})` : ''}`).join('; ')}`;
}

/**
 * Waits for `work` to finish, or for SIGINT/SIGTERM — whichever comes first. On a signal it awaits
 * host.Shutdown() (the shared drain promise) before resolving, so the caller never closes the connection pool
 * under in-flight handlers. Listeners are always removed.
 */
export async function RunUntilStopped(host: StoppableWorkHost, work: Promise<unknown>, signals: SignalSource = process): Promise<'Signal' | 'Finished'> {
  let onSignal: () => void = () => undefined;
  const signalled = new Promise<'Signal'>(resolve => {
    onSignal = () => resolve('Signal');
  });
  signals.once('SIGINT', onSignal);
  signals.once('SIGTERM', onSignal);
  try {
    const outcome = await Promise.race([signalled, work.then(() => 'Finished' as const)]);
    if (outcome === 'Signal') {
      await host.Shutdown();
      await work.catch(() => undefined);   // RunOnce resolves 'Shutdown' once the drain is done
    }
    return outcome;
  } finally {
    signals.off('SIGINT', onSignal);
    signals.off('SIGTERM', onSignal);
  }
}
```

`packages/MJCLI/src/commands/queue/work.ts` — the container-job entrypoint (02 §4.4a):

```typescript
import { Command, Flags } from '@oclif/core';
import { MJWorkLogger, SharedProviderSource, WorkQueueEngine, WorkQueueHost, type RunOnceResult } from '@memberjunction/work-queue-engine';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';
import { RunUntilStopped, WorkerStartFailure } from '../../lib/work-queue/queue-worker.js';

const DEFAULT_IDLE_EXIT_MS = 5000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 30000;

export default class QueueWork extends Command {
  static description = 'Run work-queue subscriptions in this process: once for a container job, or until stopped';

  static examples = [
    '<%= config.bin %> <%= command.id %> --subscription venue-import --once',
    '<%= config.bin %> <%= command.id %> --subscription venue-import --once --max 5 --concurrency 2 --max-duration-ms 3300000',
    '<%= config.bin %> <%= command.id %> --subscription "*"',
  ];

  static flags = {
    subscription: Flags.string({ char: 's', description: "Subscription name, or '*' for every MJWorker subscription", required: true }),
    once: Flags.boolean({ description: 'Receive up to --max deliveries, drain and exit (container-job mode)', default: false }),
    max: Flags.integer({ description: 'With --once: how many deliveries to receive', default: 1, min: 1, dependsOn: ['once'] }),
    'idle-exit-ms': Flags.integer({ description: 'With --once: exit after this long with an empty queue', default: DEFAULT_IDLE_EXIT_MS, min: 0, dependsOn: ['once'] }),
    'max-duration-ms': Flags.integer({ description: 'With --once: stop claiming after this long and drain (keep it below the scheduler\'s job deadline)', min: 1000, dependsOn: ['once'] }),
    concurrency: Flags.integer({ description: 'Handlers in flight per subscription', default: 1, min: 1 }),
    'shutdown-drain-ms': Flags.integer({ description: 'How long in-flight handlers get to finish on exit; the drain can take twice this', default: DEFAULT_SHUTDOWN_DRAIN_MS, min: 0 }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueWork);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const host = new WorkQueueHost(
        {
          InstanceID: `mj-queue-work-${process.pid}`,
          Subscriptions: [{ Name: flags.subscription, Concurrency: flags.concurrency }],
          IdlePollMinMs: 250, IdlePollMaxMs: 2000, ShutdownDrainMs: flags['shutdown-drain-ms'],
          SweeperIntervalMs: 0, ReconcileIntervalMs: 0,        // a short-lived job neither sweeps nor re-plans
        },
        WorkQueueEngine.Instance, session.User, session.Provider, new MJWorkLogger('[mj queue work]'),
        { ProviderSource: new SharedProviderSource(session.Provider) },
      );
      failure = flags.once ? await this.runOnce(host, flags) : await this.runUntilSignal(host, flags.subscription);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();   // only after the drain: RunUntilStopped awaits host.Shutdown() first
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }

  /** One-shot mode. Exit 0 for an empty queue, a spent budget, MaxDuration or a signal; non-zero when nothing could run. */
  private async runOnce(host: WorkQueueHost, flags: { subscription: string; max: number; 'idle-exit-ms': number; 'max-duration-ms'?: number }): Promise<string | null> {
    let result: RunOnceResult = { Processed: 0, Reason: 'Shutdown' };
    const work = host
      .RunOnce({ MaxDeliveries: flags.max, IdleExitMs: flags['idle-exit-ms'], MaxDurationMs: flags['max-duration-ms'] })
      .then(r => { result = r; });
    await RunUntilStopped(host, work);
    // RunOnce returns at once when nothing could run (Task 3b); the health says why. The host is shut down by now,
    // so a subscription that did run reports HOST_SHUT_DOWN_REASON.
    const startFailure = WorkerStartFailure(host.GetHealth(), flags.subscription);
    if (startFailure) {
      return startFailure;
    }
    this.log(`Processed ${result.Processed} deliver${result.Processed === 1 ? 'y' : 'ies'} (${result.Reason}).`);
    return null;
  }

  private async runUntilSignal(host: WorkQueueHost, requested: string): Promise<string | null> {
    await host.Start();
    const startFailure = WorkerStartFailure(host.GetHealth(), requested);
    if (startFailure) {
      await host.Shutdown();
      return startFailure;
    }
    this.log(`Running ${requested}; send SIGINT or SIGTERM to stop.`);
    await RunUntilStopped(host, new Promise<void>(() => undefined));
    return null;
  }
}
```

`packages/MJCLI/src/commands/queue/export-topology.ts`:

```typescript
import { writeFile } from 'node:fs/promises';
import { Command, Flags } from '@oclif/core';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueExportTopology extends Command {
  static description = 'Write the topology manifest for one transport (input to the Terraform module)';

  static examples = ['<%= config.bin %> <%= command.id %> --transport AWS-prod --output infrastructure/work-queue/manifest.json'];

  static flags = {
    transport: Flags.string({ char: 't', description: 'Transport name', required: true }),
    output: Flags.string({ char: 'o', description: 'File to write; stdout when omitted' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueExportTopology);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const manifest = JSON.stringify(WorkQueueEngine.Instance.ExportManifest(flags.transport), null, 2);
      if (flags.output) {
        await writeFile(flags.output, `${manifest}\n`, 'utf8');
        this.log(`Wrote ${flags.output}`);
      } else {
        this.log(manifest);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/import-bindings.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { Args, Command, Flags } from '@oclif/core';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { FormatBindingIssues, HasBindingErrors, ParseBindingImport } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueImportBindings extends Command {
  static description = 'Record cloud resource bindings (Terraform output) on work-queue topics and subscriptions';

  static examples = ['terraform output -json mj_work_queue_bindings > bindings.json && <%= config.bin %> <%= command.id %> bindings.json'];

  static args = {
    file: Args.string({ description: 'BindingImport JSON file', required: true }),
  };

  static flags = {
    json: Flags.boolean({ description: 'Print issues as JSON', default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(QueueImportBindings);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const bindings = ParseBindingImport(await readFile(args.file, 'utf8'));
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const issues = await WorkQueueEngine.Instance.ImportBindings(bindings, session.User);
      this.log(flags.json ? JSON.stringify(issues, null, 2) : FormatBindingIssues(issues));
      if (HasBindingErrors(issues)) {
        failure = 'Binding import reported errors.';
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

`packages/MJCLI/src/commands/queue/validate-bindings.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueValidateBindingsOperation } from '@memberjunction/core-entities';
import { FormatBindingIssues, HasBindingErrors, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueValidateBindings extends Command {
  static description = 'Validate work-queue topology and cloud bindings; exits 1 on any error';

  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --transport AWS-prod'];

  static flags = {
    transport: Flags.string({ char: 't', description: "Validate one transport's bindings against its resources" }),
    json: Flags.boolean({ description: 'Print issues as JSON', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueValidateBindings);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const result = await new WorkQueueValidateBindingsOperation().Execute({ transportName: flags.transport }, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ValidateBindings');
      this.log(flags.json ? JSON.stringify(output.issues, null, 2) : FormatBindingIssues(output.issues));
      if (HasBindingErrors(output.issues)) {
        failure = 'Binding validation reported errors.';
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/MJCLI && pnpm test work-queue-cli work-queue-commands work-queue-worker`
Expected: PASS — work-queue-cli (9), work-queue-commands (4), work-queue-worker (6).

Run: `cd packages/MJCLI && pnpm test`
Expected: PASS — including `derived-usage`, which now sees the `queue` domain profile.

Run: `cd packages/MJCLI && pnpm run build`
Expected: builds; `oclif manifest` lists the ten `queue` commands plus `queue` and `queue usage`.

- [ ] **Step 8: Commit**

```bash
git add packages/MJCLI/package.json packages/MJCLI/src pnpm-lock.yaml
git commit -m "feat(cli): mj queue commands over work queue remote operations and topology bindings"
```

The CLI smoke test runs in **Task 11 Step 4**, after the bootstrap manifests are regenerated: until `ServerBootstrapLite`'s manifest lists the server operations, `mj queue stats` would fail with an unregistered-operation error that has nothing to do with this task.

---

### Task 11: Bootstrap dependencies, manifests and full build

**Files:**
- Modify: `packages/ServerBootstrap/package.json`, `packages/ServerBootstrapLite/package.json`
- Regenerate: `packages/ServerBootstrap/src/generated/mj-class-registrations.ts`, `packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts`

**Interfaces:**
- Consumes: every `@RegisterClass` in `@memberjunction/work-queue-engine` (the seven `…ServerOperation` classes from Task 6, plus plan 05's `DatabaseTransportDriverFactory` and its driver-owned entity server subclasses) and in `@memberjunction/work-queue-server` (`WorkQueueServerExtension`). `@memberjunction/work-queue-base` carries no registrations of its own, but the engine depends on it, so both bootstrap packages resolve it transitively — no manifest entry is expected for it.
- Produces: bootstrap manifests that import those registrations, so a bundled MJAPI resolves the Remote Operations, the Database driver factory and the Server Extension, and `mj queue` (which loads `ServerBootstrapLite`) resolves the Remote Operations.

MJ apps load `@RegisterClass` registrations through generated manifests (`mj codegen manifest`), not side-effect imports. A class missing from a manifest fails only in bundled builds — every unit test still passes. `ServerBootstrapLite` gets the engine only: its manifest command excludes `@memberjunction/server`, and the REST extension belongs to MJAPI.

**The AWS driver factory is not registered here (03 §0, F12).** The engine's main entry never imports `@memberjunction/work-queue-aws`; the `'AWS'` factory registers from the subpath `@memberjunction/work-queue-engine/aws`, which plan 07 adds to the **server** bootstrap only. After this task a manifest grep for `AWSTransportDriverFactory` must find nothing, and `ServerBootstrapLite` (CLI, CodeGen, MetadataSync) must never gain it.

- [ ] **Step 1: Add the dependencies**

In `packages/ServerBootstrap/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue-engine": "6.1.0",
"@memberjunction/work-queue-server": "6.1.0",
```

In `packages/ServerBootstrapLite/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue-engine": "6.1.0",
```

`@memberjunction/work-queue-base` is **not** listed in either file: the engine depends on it, so pnpm resolves it
transitively and the manifest generator walks it. Add it explicitly only if a package imports `WorkQueueEngineBase`
directly — an Explorer dashboard would (09b), no server package here does.

Run: `pnpm install` (repository root)
Expected: installs with no peer-dependency warnings for the work-queue packages.

- [ ] **Step 2: Build the chain**

Run: `pnpm exec turbo run build --filter=@memberjunction/work-queue-server --filter=@memberjunction/server --filter=@memberjunction/cli`
Expected: builds `work-queue-core`, `work-queue-base`, `work-queue-engine`, `work-queue-server`, `@memberjunction/server` and `@memberjunction/cli` with no errors.

- [ ] **Step 3: Regenerate the manifests**

Run: `pnpm run mj:manifest:server-bootstrap`
Run: `pnpm run mj:manifest:server-bootstrap-lite`

Run: `grep -ohE "WorkQueue[A-Za-z]+ServerOperation|WorkQueueServerExtension|DatabaseTransportDriverFactory" packages/ServerBootstrap/src/generated/mj-class-registrations.ts | sort -u`
Expected — exactly these nine lines:

```
DatabaseTransportDriverFactory
WorkQueueDiscardDeliveryServerOperation
WorkQueueGetBacklogServerOperation
WorkQueueGetSubscriptionStatsServerOperation
WorkQueueListDeadLettersServerOperation
WorkQueueListPartitionsServerOperation
WorkQueueReplayDeadLetterServerOperation
WorkQueueServerExtension
WorkQueueValidateBindingsServerOperation
```

Run: `grep -ohE "WorkQueue[A-Za-z]+ServerOperation|WorkQueueServerExtension|DatabaseTransportDriverFactory" packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts | sort -u`
Expected — the same list **without** `WorkQueueServerExtension` (eight lines).

Run: `grep -c "AWSTransportDriverFactory" packages/ServerBootstrap/src/generated/mj-class-registrations.ts packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts`
Expected: `0` for both files.

If a list is empty, the generator did not see the dependency: confirm Step 1, confirm `packages/WorkQueue/engine/dist` and `packages/WorkQueue/server/dist` exist, and rerun Step 3.

- [ ] **Step 4: Full build and unit tests**

Run: `pnpm run build`
Expected: the full build and its `postbuild` manifest pass succeed.

Run each and expect PASS:
- `cd packages/WorkQueue/engine && pnpm test`
- `cd packages/WorkQueue/server && pnpm test`
- `cd packages/MJServer && pnpm test`
- `cd packages/MJCLI && pnpm test`

Smoke-test the CLI now that `ServerBootstrapLite`'s manifest registers the server operations (this step was deliberately not part of Task 10):

Run: `node packages/MJCLI/bin/run.js queue stats`
Expected: a table (or `No subscriptions.`), exit code 0. A `FORBIDDEN` result means the CLI's context user lacks Read on `MJ: Work Queue Deliveries` (Task 6) — grant it through plan 05's entity permissions, do not weaken `Authorize`.

Run: `node packages/MJCLI/bin/run.js queue dead-letters --subscription does.not.exist; echo "exit=$?"`
Expected: `WorkQueue.ListDeadLetters failed (EXECUTION_ERROR): Unknown work queue subscription 'does.not.exist'` and `exit=1`.

Run: `node packages/MJCLI/bin/run.js queue work --subscription does.not.exist --once; echo "exit=$?"`
Expected: `No subscription is running for 'does.not.exist': does.not.exist is Error (Subscription 'does.not.exist' not found)` and `exit=1` — a misconfigured job must not look successful.

- [ ] **Step 5: Smoke-test MJAPI**

Seed a disposable topic and subscription with the SQL below (development database only; names start `mj-smoke-`). `@TransportID` is the seeded `Database` transport (`D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5`, plan 05 Task 1).

```sql
DECLARE @TransportID UNIQUEIDENTIFIER = 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5';
DECLARE @TopicID UNIQUEIDENTIFIER = NEWID();
INSERT INTO __mj.WorkQueueTopic (ID, Name, TransportID, AllowExternalPublish) VALUES (@TopicID, 'mj-smoke.topic', @TransportID, 1);
INSERT INTO __mj.WorkQueueSubscription (ID, TopicID, Name, HostType, HandlerKey) VALUES (NEWID(), @TopicID, 'mj-smoke.subscription', 'MJWorker', 'mj-smoke.unregistered');
```

In `mj.config.cjs` add:

```javascript
workQueue: { enabled: true, systemUserEmail: '<an existing user email>', subscriptions: [{ name: '*', concurrency: 2 }] },
serverExtensions: [{ Enabled: true, DriverClass: 'WorkQueueServerExtension', RootPath: '/work-queue', Phase: 'post-auth', Settings: {} }],
```

Start MJAPI with `pnpm start` from `packages/MJAPI`.
Expected: `🔄 Work Queue host <host>-<pid>-<hex>: *×2` and a `[WorkQueue] Host … started` line; `/health/extensions` reports `WorkQueueServerExtension` with `Host.Subscriptions` containing `{ "Name": "mj-smoke.subscription", "State": "HandlerNotRegistered" }`.

Publish with an API key holding `workqueue:publish`:

```bash
curl -s -X POST http://localhost:4000/work-queue/topics/mj-smoke.topic/messages \
  -H "x-api-key: <key>" -H "Content-Type: application/json" \
  -d '{"messages":[{"attributes":{"kind":"smoke"},"payload":{"hello":"queue"}}]}'
```

Expected: `{"results":[{"messageId":"…","status":"Accepted"}]}` with HTTP 202. The same request with a bearer token instead of an API key answers `403` (REST publishing is API-key only, 03 §9).

Run: `node packages/MJCLI/bin/run.js queue stats --subscription mj-smoke.subscription`
Expected: `Pending` = 1 (no handler is registered, so nothing claims it).

Clean up: stop MJAPI, remove the two config entries, then:

```sql
DELETE d FROM __mj.WorkQueueDelivery d INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID WHERE s.Name = 'mj-smoke.subscription';
DELETE m FROM __mj.WorkQueueMessage m INNER JOIN __mj.WorkQueueTopic t ON t.ID = m.TopicID WHERE t.Name = 'mj-smoke.topic';
DELETE FROM __mj.WorkQueueSubscription WHERE Name = 'mj-smoke.subscription';
DELETE FROM __mj.WorkQueueTopic WHERE Name = 'mj-smoke.topic';
```

(Replace `__mj` with your core schema if different. This is manual smoke data, not a migration.)

- [ ] **Step 6: Commit**

```bash
git add packages/ServerBootstrap/package.json packages/ServerBootstrap/src/generated/mj-class-registrations.ts packages/ServerBootstrapLite/package.json packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts pnpm-lock.yaml
git commit -m "build(bootstrap): register work queue operations, driver factory and publish extension in manifests"
```

---

### Task 12: Integration bundle `work-queue-runtime` (IT94)

**Files:**
- Create: `packages/TestingFramework/integration-test-suite/src/checks/work-queue-runtime.checks.ts`
- Modify: `packages/TestingFramework/integration-test-suite/package.json`, `src/index.ts`, `src/__tests__/check-registry.test.ts`
- Create: `metadata-optional/integration-test/tests/integration/.IT94-work-queue-runtime.json`
- Modify: `metadata-optional/integration-test/test-suites/.integration-suite.json`

**Interfaces:**
- Consumes: `WorkQueueEngine` (incl. `OnDeadLettered`), `WorkQueueHost`, `WorkQueueSweeper`, `BaseWorkHandler`, `SharedProviderSource`, `MJWorkLogger`, `CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo, transportID?: string): Promise<DatabaseConformanceHarness>` (plan 05; `Cleanup(): Promise<void>`) (`@memberjunction/work-queue-engine`); `RunConformanceChecks(harness): Promise<ConformanceCheckResult[]>` (`@memberjunction/work-queue-core/testing`, plan 04); `HandleWorkQueuePublish`, `CreateWorkQueuePublishRouter`, `APIKeyScopeAuthorizer` (`@memberjunction/work-queue-server`); `Outcome`, `ITransportConsumer`, `ReceivedDelivery`, `WorkAbortReason`, `WorkContext`, `WorkMessage`, `WorkOutcome` (`@memberjunction/work-queue-core`); the Task 5 operation classes and `MJWorkQueueDeliveryEntity` (`@memberjunction/core-entities`); `GetAPIKeyEngine` (`@memberjunction/api-keys`); `express`; `Assert`, `AssertEqual`, `IntegrationCheckRegistry`, `IntegrationCheckContext`, `NamedCheck` (`@memberjunction/testing-integration`).
- Produces: `WorkQueueRuntimeChecks: NamedCheck[]` (19 checks, ids `work-queue-runtime.WR1`–`WR19`), the `'work-queue-runtime'` lifecycle, and `MJ: Tests` record `IT94 - Work Queue Runtime (native host, operators, REST)`.

Unit tests prove shapes against fakes; this bundle proves the pieces **behave together** on a real database: the host claims and settles, the unique in-flight index enforces single flight across **concurrent** consumers, `Ordered` keys block and unblock through the Remote Operations, the sweeper expires leases, dead-letters the final attempt and purges, the ledger suppresses duplicates, cancel stops a running handler and frees its key at once, the one-shot host really processes its one delivery, and the REST endpoint enforces the API key, the scope and `AllowExternalPublish` through the real Express router.

| Check | Proves |
| --- | --- |
| WR1 | A started host plans fixture subscriptions: registered handler → `Running`, unknown handler → `HandlerNotRegistered` |
| WR2 | Publish → host claims → handler runs → delivery `Completed` |
| WR3 | Fan-out isolation: one publish completes on one subscription, dead-letters on a second, stays `Pending` on a third |
| WR4 | Lease expiry through the sweeper: expired `InFlight` with attempts left → `Pending` with `LeaseExpired`; the stale lease token is fenced out; the retry claims attempt 2 |
| WR5 | `Exclusive`: two consumers claiming **concurrently** never hold the same key (the unique in-flight index, 03 §7); the key's next delivery is claimable only after the first completes |
| WR6 | `Ordered`: a dead-lettered head blocks its key; `WorkQueue.ListPartitions` reports `Blocked`; `WorkQueue.ReplayDeadLetter` unblocks in order |
| WR7 | A lease that expires on the **final** attempt is dead-lettered by the sweeper (`LeaseExpired`), the pass reports it, and `WorkQueueEngine.OnDeadLettered` fires for it |
| WR8 | `WorkQueue.DiscardDelivery` discards a pending delivery, which is then never claimed |
| WR9 | A repeated `DeduplicationKey` returns `Duplicate` naming the first message, and the topic gains exactly **one message row** |
| WR10 | REST publish: scoped API key → 202 `Accepted`; `AllowExternalPublish = 0` → 403 `TopicNotExternallyPublishable`; key without the scope → 403; **no API key → 403** |
| WR11 | The real Express router: `req.userPayload` (`userRecord`, `apiKeyHash`) reaches the handler over HTTP and a scoped key publishes (202) |
| WR12 | The sweeper purges a terminal delivery past topic retention |
| WR13 | Host shutdown is idempotent, clears `WorkQueueHost.Active` and unregisters from `ShutdownRegistry` |
| WR14 | Plan 04's transport conformance checks pass against plan 05's Database harness on the live provider. **Fails when any case Failed, and when every case was Skipped** (a harness that gates everything off proves nothing) |
| WR15 | Delivery rows are driver-owned: `BaseEntity.Save()` on a delivery is rejected and the row is unchanged (03 §6.8) |
| WR16 | Cancelling an **in-flight** delivery under a live host: the handler's `Signal` aborts with reason `'Cancelled'` within the heartbeat interval, the runtime acknowledges, the row becomes `Discarded` **well before its lease would expire**, and the `Exclusive` key's next delivery runs immediately (03 §7, F2) |
| WR17 | Cancel with a **dead holder**: `ExtendLease` → `Cancelled`, the holder's settle is refused, the key is not handed on, and the sweeper discards the row when the lease expires |
| WR18 | `WorkQueue.GetBacklog` counts claimable pending **plus** in-flight deliveries and returns to its starting value once work settles |
| WR19 | `WorkQueueHost.RunOnce({ MaxDeliveries: 1 })` end to end — the default container job: exactly one delivery is received **and completed**, the result is `{ Processed: 1, Reason: 'MaxDeliveries' }`, and a second queued delivery is left `Pending` for the next job |

Safety in a shared development database:

- Every topic and subscription is named `mj-it-wq-…`, every API key is labelled `mj-it-wq-rest-…`. **Setup assigns the fixture handle first, then removes leftovers from an interrupted run** (deliveries, messages and deduplication rows by SQL — they are driver-owned and reject `Delete()`, 03 §6.8 — then subscriptions, topics and leftover API keys through their entities), so a Setup that fails halfway is still cleaned by Teardown.
- The fixture handler is registered **once per process** under a key only this bundle uses. `ClassFactory` has no unregister API; a namespaced key that nothing else resolves is the cleanup.
- Hosts run **only** the named fixture subscriptions. A running MJAPI host cannot claim them: the fixture handler key is registered only in the test process, so MJAPI plans them `HandlerNotRegistered`.
- WR14's harness writes its own topics and subscriptions and removes them with `Cleanup()` in a `finally`.
- WR4, WR7, WR12 and WR17 run the real sweeper, whose statements are global. They only expire leases that are already expired and purge rows already past retention — exactly what production does. When another instance holds the sweep lock the pass returns `{}`; those checks retry the pass until it runs.
- Raw SQL changes rows behind the entity cache, so every read uses `BypassCache: true`.
- WR7–WR19 do not depend on state recorded by other checks, except WR12, which purges the delivery WR2 completed and says so in its failure message.

- [ ] **Step 1: Add the dependencies**

In `packages/TestingFramework/integration-test-suite/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue-core": "6.1.0",
"@memberjunction/work-queue-engine": "6.1.0",
"@memberjunction/work-queue-server": "6.1.0",
"express": "^5.2.1",
```

and to `devDependencies`: `"@types/express": "^5.0.6"`. (Skip any line the file already has.)

Run: `pnpm install` (repository root)

- [ ] **Step 2: Pin the bundle in the registry test (failing)**

In `packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts`:

- add `import { WorkQueueRuntimeChecks } from '../checks/work-queue-runtime.checks';` after the other check imports;
- add `['work-queue-runtime', WorkQueueRuntimeChecks, 19],` to the `bundles` table directly after `['user-routines', UserRoutinesChecks, 16],`;
- add `'work-queue-runtime': 19,` to `EXPECTED_BUNDLE_COUNTS` directly after `'view-security': 4,`;
- change `expect(Object.keys(EXPECTED_BUNDLE_COUNTS)).toHaveLength(93);` to `toHaveLength(94)`.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: FAIL — unresolved import `../checks/work-queue-runtime.checks`.

- [ ] **Step 3: Write `src/checks/work-queue-runtime.checks.ts`**

```typescript
/**
 * work-queue-runtime.checks.ts — the 'work-queue-runtime' bundle (WR1–WR19): the durable work queue's MJ runtime
 * against the live database — WorkQueueHost (long-running and one-shot), direct Database consumers, the operator
 * Remote Operations, the sweeper, the deduplication ledger, cancel, and the REST publish endpoint. Deterministic,
 * no model calls, server transport; runs on SQL Server and PostgreSQL.
 *
 * Every fixture is named 'mj-it-wq-…'. Setup removes leftovers from an interrupted run before creating fresh
 * fixtures; Teardown removes them again. Checks run in array order; each settles or discards what it creates.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseProviderBase, RunView, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueListPartitionsOperation,
    WorkQueueReplayDeadLetterOperation,
    type MJAPIKeyEntity, type MJAPIKeyScopeEntity, type MJAPIKeyUsageLogEntity, type MJWorkQueueDeliveryEntity,
    type MJWorkQueueSubscriptionEntity, type MJWorkQueueTopicEntity, type WorkQueueGetBacklogOutput,
} from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { MJGlobal, ShutdownRegistry, UUIDsEqual } from '@memberjunction/global';
import {
    Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    Outcome,
    type ITransportConsumer, type PublishRequest, type PublishResult, type ReceivedDelivery, type WorkContext,
    type WorkMessage, type WorkOutcome,
} from '@memberjunction/work-queue-core';
import {
    BaseWorkHandler, CreateDatabaseConformanceHarness, MJWorkLogger, SharedProviderSource, WorkQueueEngine,
    WorkQueueHost, WorkQueueSweeper, type DeadLetteredEvent,
} from '@memberjunction/work-queue-engine';
import { RunConformanceChecks } from '@memberjunction/work-queue-core/testing';
import {
    APIKeyScopeAuthorizer, CreateWorkQueuePublishRouter, HandleWorkQueuePublish,
    type WorkQueuePublishDependencies, type WorkQueueRequestPayload,
} from '@memberjunction/work-queue-server';

const PREFIX = 'mj-it-wq-';
const DATABASE_TRANSPORT_ID = 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5';
const HANDLER_KEY = 'mj-it-wq.scripted';
const WAIT_TIMEOUT_MS = 20000;
/** WR16's subscription: heartbeat interval = min(15 / 3, 30) = 5 s, so a cancel is noticed within ~5 s. */
const CANCEL_LEASE_SECONDS = 15;
/** WR16: the cancelled row must be Discarded well before its 15 s lease could have expired. */
const CANCEL_DISCARDED_WITHIN_MS = 12000;

const NAMES = {
    EventsTopic: `${PREFIX}events`,
    CompleteSub: `${PREFIX}complete`,
    RejectSub: `${PREFIX}reject`,
    UnregisteredSub: `${PREFIX}unregistered`,
    InternalTopic: `${PREFIX}internal`,
    InternalSub: `${PREFIX}internal-sub`,
    ExclusiveTopic: `${PREFIX}exclusive`,
    ExclusiveSub: `${PREFIX}exclusive-sub`,
    OrderedTopic: `${PREFIX}ordered`,
    OrderedSub: `${PREFIX}ordered-sub`,
    CancelTopic: `${PREFIX}cancel`,
    CancelSub: `${PREFIX}cancel-sub`,
    RunOnceTopic: `${PREFIX}runonce`,
    RunOnceSub: `${PREFIX}runonce-sub`,
} as const;

interface RuntimeFixture {
    Provider: DatabaseProviderBase;
    CompletedDeliveryID: string | null;
}

interface DeliveryRow {
    ID: string;
    MessageID: string;
    SubscriptionID: string;
    Status: string;
    AttemptCount: number;
    IsReplay: boolean;
    LastError: string | null;
    DeadLetterReason: string | null;
}

let fixture: RuntimeFixture | undefined;
let handlerRegistered = false;

function fx(): RuntimeFixture {
    if (!fixture) {
        throw new Error('work-queue-runtime fixture missing (bundle Setup did not run)');
    }
    return fixture;
}

/** What the scripted handler observed, for WR16. Reset by the check that reads it. */
const observed: { HeldStarted: boolean; AbortReason: string | null } = { HeldStarted: false, AbortReason: null };

/**
 * Completes every delivery, except: the reject subscription dead-letters, and a `{ hold: true }` payload on the
 * cancel subscription runs until its Signal aborts (then records the abort reason — its outcome is discarded).
 */
class ItScriptedWorkHandler extends BaseWorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        if (context.SubscriptionName === NAMES.RejectSub) {
            return Outcome.DeadLetter('it-reject');
        }
        if (context.SubscriptionName === NAMES.CancelSub && isHoldPayload(message.Payload)) {
            observed.HeldStarted = true;
            await new Promise<void>(resolve => {
                if (context.Signal.aborted) {
                    resolve();
                } else {
                    context.Signal.addEventListener('abort', () => resolve(), { once: true });
                }
            });
            observed.AbortReason = String(context.Signal.reason);
        }
        return Outcome.Complete();
    }
}

function isHoldPayload(payload: WorkMessage['Payload']): boolean {
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && payload.hold === true;
}

// ─── Engine, consumers, publishing ───────────────────────────────────────────────────────────────

function subscription(name: string): MJWorkQueueSubscriptionEntity {
    const found = WorkQueueEngine.Instance.GetSubscriptionByName(name);
    if (!found) {
        throw new Error(`fixture subscription ${name} is not visible to WorkQueueEngine`);
    }
    return found;
}

function topic(name: string): MJWorkQueueTopicEntity {
    const found = WorkQueueEngine.Instance.GetTopicByName(name);
    if (!found) {
        throw new Error(`fixture topic ${name} is not visible to WorkQueueEngine`);
    }
    return found;
}

/** Each consumer owns an independent executor (03 §11), so two of them really do claim concurrently. Always Close(). */
async function withConsumers<T>(names: string[], work: (consumers: ITransportConsumer[]) => Promise<T>): Promise<T> {
    const driver = await WorkQueueEngine.Instance.GetDriver(DATABASE_TRANSPORT_ID);
    const consumers = names.map(name => driver.OpenConsumer(WorkQueueEngine.Instance.BuildSubscriptionBinding(subscription(name))));
    try {
        return await work(consumers);
    } finally {
        for (const consumer of consumers) {
            await consumer.Close().catch(() => undefined);
        }
    }
}

function receive(consumer: ITransportConsumer, max = 10): Promise<ReceivedDelivery[]> {
    return consumer.Receive(max, 0, new AbortController().signal);
}

async function publishOne(user: UserInfo, topicName: string, request: PublishRequest = {}): Promise<string> {
    const [result] = await WorkQueueEngine.Instance.PublishAs(topicName, [{ Attributes: { source: 'it' }, Payload: { at: Date.now() }, ...request }], { ContextUser: user });
    AssertEqual(result.Status, 'Accepted', `publish to ${topicName}: ${result.Error?.Message ?? ''}`);
    return result.MessageID;
}

async function settleAll(consumer: ITransportConsumer, deliveries: ReceivedDelivery[]): Promise<void> {
    for (const delivery of deliveries) {
        const settled = await consumer.Complete(delivery);
        AssertEqual(settled.Kind, 'Settled', `completing ${delivery.DeliveryID}`);
    }
}

function onlyMessage(deliveries: ReceivedDelivery[], messageID: string, label: string): ReceivedDelivery {
    const matches = deliveries.filter(d => UUIDsEqual(d.Message.MessageID, messageID));
    AssertEqual(matches.length, 1, `${label}: deliveries for message ${messageID}`);
    return matches[0];
}

function operationOutput<T>(result: RemoteOpResult<T>, key: string): T {
    if (!result.Success || result.Output === undefined) {
        throw new Error(`${key} failed (${result.ResultCode}): ${result.ErrorMessage}`);
    }
    return result.Output;
}

// ─── Reads and fixture SQL ───────────────────────────────────────────────────────────────────────

async function deliveriesWhere(user: UserInfo, filter: string): Promise<DeliveryRow[]> {
    const result = await new RunView().RunView<DeliveryRow>({
        EntityName: 'MJ: Work Queue Deliveries',
        ExtraFilter: filter,
        Fields: ['ID', 'MessageID', 'SubscriptionID', 'Status', 'AttemptCount', 'IsReplay', 'LastError', 'DeadLetterReason'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(result.Success, `reading deliveries failed: ${result.ErrorMessage}`);
    return result.Results;
}

async function delivery(user: UserInfo, subscriptionName: string, messageID: string): Promise<DeliveryRow> {
    const rows = await deliveriesWhere(user, `SubscriptionID='${subscription(subscriptionName).ID}' AND MessageID='${messageID}'`);
    AssertEqual(rows.length, 1, `delivery rows for ${subscriptionName}/${messageID}`);
    return rows[0];
}

async function messageCount(user: UserInfo, topicName: string): Promise<number> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Work Queue Messages', ExtraFilter: `TopicID='${topic(topicName).ID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `reading messages failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = WAIT_TIMEOUT_MS): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await probe();
        if (value !== null) {
            return value;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
}

function table(provider: DatabaseProviderBase, name: string): string {
    return `${provider.QuoteIdentifier(provider.MJCoreSchemaName)}.${provider.QuoteIdentifier(name)}`;
}

function uuidParam(provider: DatabaseProviderBase, index: number): string {
    const placeholder = provider.BuildParameterPlaceholder(index);
    return provider.PlatformKey === 'postgresql' ? `${placeholder}::uuid` : placeholder;
}

function hoursAgo(provider: DatabaseProviderBase, hours: number): string {
    const h = Math.trunc(hours);
    return provider.PlatformKey === 'postgresql' ? `now() - interval '${h} hours'` : `DATEADD(HOUR, -${h}, SYSDATETIMEOFFSET())`;
}

async function setDeliveryTimestamp(provider: DatabaseProviderBase, user: UserInfo, deliveryID: string, column: 'LeaseExpiresAt' | 'CompletedAt', hours: number): Promise<void> {
    const sql = `UPDATE ${table(provider, 'WorkQueueDelivery')} SET ${provider.QuoteIdentifier(column)} = ${hoursAgo(provider, hours)} WHERE ${provider.QuoteIdentifier('ID')} = ${uuidParam(provider, 0)}`;
    await provider.ExecuteSQL(sql, [deliveryID], { isMutation: true }, user);
}

/** One sweeper pass that actually ran. Another instance may hold the sweep lock (the pass then returns {}); retry. */
async function sweepOnce(provider: DatabaseProviderBase, user: UserInfo): Promise<Record<string, number>> {
    const sweeper = new WorkQueueSweeper(provider, WorkQueueEngine.Instance, user, new MJWorkLogger('[WorkQueue:IT]'));
    return waitFor('a sweeper pass to get the sweep lock', async () => {
        const pass = await sweeper.RunOnce();
        return Object.keys(pass).length > 0 ? pass : null;
    });
}

function newHost(provider: DatabaseProviderBase, user: UserInfo, instance: string, subscriptions: string[], concurrency = 2): WorkQueueHost {
    return new WorkQueueHost(
        {
            InstanceID: `${PREFIX}${instance}-${process.pid}`,
            Subscriptions: subscriptions.map(Name => ({ Name, Concurrency: concurrency })),
            IdlePollMinMs: 50, IdlePollMaxMs: 250, ShutdownDrainMs: 2000, SweeperIntervalMs: 0, ReconcileIntervalMs: 0,
        },
        WorkQueueEngine.Instance, user, provider, new MJWorkLogger('[WorkQueue:IT]'),
        { ProviderSource: new SharedProviderSource(provider) },
    );
}

const HOSTED = [NAMES.CompleteSub, NAMES.RejectSub, NAMES.UnregisteredSub];

// ─── Fixtures ────────────────────────────────────────────────────────────────────────────────────

interface TopicSpec { Name: string; AllowExternalPublish: boolean }
interface SubscriptionSpec { Name: string; Topic: string; PartitionMode: 'None' | 'Exclusive' | 'Ordered'; HandlerKey: string; LeaseSeconds?: number }

const TOPICS: TopicSpec[] = [
    { Name: NAMES.EventsTopic, AllowExternalPublish: true },
    { Name: NAMES.InternalTopic, AllowExternalPublish: false },
    { Name: NAMES.ExclusiveTopic, AllowExternalPublish: false },
    { Name: NAMES.OrderedTopic, AllowExternalPublish: false },
    { Name: NAMES.CancelTopic, AllowExternalPublish: false },
    { Name: NAMES.RunOnceTopic, AllowExternalPublish: false },
];

const SUBSCRIPTIONS: SubscriptionSpec[] = [
    { Name: NAMES.CompleteSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.RejectSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.UnregisteredSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: 'mj-it-wq.not-registered' },
    { Name: NAMES.InternalSub, Topic: NAMES.InternalTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.ExclusiveSub, Topic: NAMES.ExclusiveTopic, PartitionMode: 'Exclusive', HandlerKey: HANDLER_KEY },
    { Name: NAMES.OrderedSub, Topic: NAMES.OrderedTopic, PartitionMode: 'Ordered', HandlerKey: HANDLER_KEY },
    { Name: NAMES.CancelSub, Topic: NAMES.CancelTopic, PartitionMode: 'Exclusive', HandlerKey: HANDLER_KEY, LeaseSeconds: CANCEL_LEASE_SECONDS },
    { Name: NAMES.RunOnceSub, Topic: NAMES.RunOnceTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
];

/**
 * Delivery-state rows are driver-owned — their entities refuse Delete() (03 §6.8) — so they go by SQL, children
 * first. Topology rows and API keys go through their entities.
 */
async function removeFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const id = (name: string): string => provider.QuoteIdentifier(name);
    const namePattern = provider.BuildParameterPlaceholder(0);
    const fixtureSubs = `SELECT s.${id('ID')} FROM ${table(provider, 'WorkQueueSubscription')} s WHERE s.${id('Name')} LIKE ${namePattern}`;
    const fixtureTopics = `SELECT t.${id('ID')} FROM ${table(provider, 'WorkQueueTopic')} t WHERE t.${id('Name')} LIKE ${namePattern}`;
    const statements = [
        `DELETE FROM ${table(provider, 'WorkQueueDelivery')} WHERE ${id('SubscriptionID')} IN (${fixtureSubs})`,
        `DELETE FROM ${table(provider, 'WorkQueueMessage')} WHERE ${id('TopicID')} IN (${fixtureTopics})`,
        `DELETE FROM ${table(provider, 'WorkQueueDeduplication')} WHERE ${id('TopicID')} IN (${fixtureTopics})`,
    ];
    for (const sql of statements) {
        await provider.ExecuteSQL(sql, [`${PREFIX}%`], { isMutation: true }, user);
    }
    const rv = new RunView();
    const byName = { ExtraFilter: `Name LIKE '${PREFIX}%'`, ResultType: 'entity_object' as const, BypassCache: true };
    const subs = await rv.RunView<MJWorkQueueSubscriptionEntity>({ EntityName: 'MJ: Work Queue Subscriptions', ...byName }, user);
    const topics = await rv.RunView<MJWorkQueueTopicEntity>({ EntityName: 'MJ: Work Queue Topics', ...byName }, user);
    Assert(subs.Success && topics.Success, `finding leftover fixtures failed: ${subs.ErrorMessage ?? topics.ErrorMessage}`);
    for (const record of [...subs.Results, ...topics.Results]) {
        Assert(await record.Delete(), `removing fixture ${record.Name} failed: ${record.LatestResult?.CompleteMessage}`);
    }
    const keys = await rv.RunView<MJAPIKeyEntity>({ EntityName: 'MJ: API Keys', ExtraFilter: `Label LIKE '${PREFIX}rest-%'`, ResultType: 'entity_object', BypassCache: true }, user);
    for (const key of keys.Results ?? []) {
        await deleteApiKey(provider, user, key.ID);
    }
}

async function createFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const topicIDs = new Map<string, string>();
    for (const spec of TOPICS) {
        const record = await provider.GetEntityObject<MJWorkQueueTopicEntity>('MJ: Work Queue Topics', user);
        record.NewRecord();
        record.Name = spec.Name;
        record.Description = 'Integration test fixture (safe to delete)';
        record.TransportID = DATABASE_TRANSPORT_ID;
        record.IsFifo = false;
        record.AllowExternalPublish = spec.AllowExternalPublish;
        record.MaxPayloadBytes = 262144;
        record.DefaultDeduplicationTTLSeconds = 3600;
        record.RetentionDays = 1;
        record.Status = 'Active';
        Assert(await record.Save(), `creating topic ${spec.Name} failed: ${record.LatestResult?.CompleteMessage}`);
        topicIDs.set(spec.Name, record.ID);
    }
    for (const spec of SUBSCRIPTIONS) {
        const sub = await provider.GetEntityObject<MJWorkQueueSubscriptionEntity>('MJ: Work Queue Subscriptions', user);
        sub.NewRecord();
        sub.Name = spec.Name;
        sub.Description = 'Integration test fixture (safe to delete)';
        sub.TopicID = topicIDs.get(spec.Topic) ?? '';
        sub.PartitionMode = spec.PartitionMode;
        sub.MaxAttempts = 3;
        sub.BackoffBaseSeconds = 0;
        sub.BackoffMaxSeconds = 0;
        sub.LeaseSeconds = spec.LeaseSeconds ?? 30;
        sub.HeartbeatMode = 'Auto';
        sub.HostType = 'MJWorker';
        sub.HandlerKey = spec.HandlerKey;
        sub.Status = 'Active';
        Assert(await sub.Save(), `creating subscription ${spec.Name} failed: ${sub.LatestResult?.CompleteMessage}`);
    }
}

// ─── API keys and REST (WR10, WR11) ──────────────────────────────────────────────────────────────

interface CreatedKey { ID: string; Hash: string }

async function createApiKey(provider: DatabaseProviderBase, user: UserInfo, grantPublish: boolean, cleanup: Array<() => Promise<void>>): Promise<CreatedKey> {
    const engine = GetAPIKeyEngine();
    const created = await engine.CreateAPIKey({ UserId: user.ID, Label: `${PREFIX}rest-${grantPublish ? 'scoped' : 'unscoped'}` }, user);
    if (!created.Success || !created.RawKey || !created.APIKeyId) {
        throw new Error(`CreateAPIKey failed: ${created.Error}`);
    }
    const keyID = created.APIKeyId;
    const rawKey = created.RawKey;
    cleanup.push(() => deleteApiKey(provider, user, keyID));
    if (grantPublish) {
        const scope = engine.Scopes.find(s => s.FullPath === 'workqueue:publish');
        if (!scope) {
            throw new Error('workqueue:publish scope not found (plan 05 metadata not pushed?)');
        }
        const rule = await provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', user);
        rule.NewRecord();
        rule.APIKeyID = keyID;
        rule.ScopeID = scope.ID;
        rule.ResourcePattern = '*';
        rule.PatternType = 'Include';
        rule.IsDeny = false;
        rule.Priority = 0;
        Assert(await rule.Save(), `saving the key scope failed: ${rule.LatestResult?.CompleteMessage}`);
    }
    return { ID: keyID, Hash: engine.HashAPIKey(rawKey) };
}

async function deleteApiKey(provider: DatabaseProviderBase, user: UserInfo, keyID: string): Promise<void> {
    const rv = new RunView();
    const filter = `APIKeyID='${keyID}'`;
    const logs = await rv.RunView<MJAPIKeyUsageLogEntity>({ EntityName: 'MJ: API Key Usage Logs', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true }, user);
    const rules = await rv.RunView<MJAPIKeyScopeEntity>({ EntityName: 'MJ: API Key Scopes', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true }, user);
    for (const record of [...(logs.Results ?? []), ...(rules.Results ?? [])]) {
        await record.Delete().catch(() => false);
    }
    const key = await provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', user);
    if (await key.Load(keyID)) {
        await key.Delete().catch(() => false);
    }
}

function restDependencies(): WorkQueuePublishDependencies {
    return {
        GetEngine: async () => WorkQueueEngine.Instance,
        Authorizer: new APIKeyScopeAuthorizer(),
        Settings: { MaxBatch: 100, BodyLimit: '1mb' },
        Log: new MJWorkLogger('[WorkQueue:IT-REST]'),
    };
}

function restPublish(user: UserInfo, topicName: string, apiKeyHash: string | undefined): ReturnType<typeof HandleWorkQueuePublish> {
    return HandleWorkQueuePublish({
        TopicName: topicName, User: user, ApiKeyHash: apiKeyHash, Path: `/work-queue/topics/${topicName}/messages`,
        ReadBody: async () => ({ messages: [{ attributes: { source: 'it-rest' }, payload: { n: 1 } }] }),
    }, restDependencies());
}

/** The real router behind a stand-in for MJServer's unified auth, which is what sets req.userPayload. */
async function withRestServer<T>(payload: WorkQueueRequestPayload, work: (baseUrl: string) => Promise<T>): Promise<T> {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload = payload;
        next();
    });
    app.use('/work-queue', CreateWorkQueuePublishRouter(restDependencies()));
    const server = await new Promise<Server>(resolve => {
        const listening = app.listen(0, () => resolve(listening));
    });
    try {
        return await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}/work-queue`);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const WorkQueueRuntimeChecks: NamedCheck[] = [
    {
        Id: 'work-queue-runtime.WR1',
        Name: 'WR1: a started host plans fixture subscriptions by handler registration',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr1', HOSTED);
            try {
                await host.Start();
                const states = Object.fromEntries(host.GetHealth().Subscriptions.map(s => [s.Name, s.State]));
                AssertEqual(states[NAMES.CompleteSub], 'Running', 'complete subscription state');
                AssertEqual(states[NAMES.RejectSub], 'Running', 'reject subscription state');
                AssertEqual(states[NAMES.UnregisteredSub], 'HandlerNotRegistered', 'unregistered subscription state');
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR2',
        Name: 'WR2: publish → host claims → handler completes the delivery',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr2', HOSTED);
            try {
                await host.Start();
                const messageID = await publishOne(ctx.User, NAMES.EventsTopic);
                const done = await waitFor('the complete-subscription delivery to complete', async () => {
                    const row = await delivery(ctx.User, NAMES.CompleteSub, messageID);
                    return row.Status === 'Completed' ? row : null;
                });
                AssertEqual(done.AttemptCount, 1, 'attempts for a first-time success');
                fx().CompletedDeliveryID = done.ID;
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR3',
        Name: 'WR3: one publish settles independently per subscription',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr3', HOSTED);
            try {
                await host.Start();
                const messageID = await publishOne(ctx.User, NAMES.EventsTopic);
                await waitFor('both hosted deliveries to settle', async () => {
                    const complete = await delivery(ctx.User, NAMES.CompleteSub, messageID);
                    const reject = await delivery(ctx.User, NAMES.RejectSub, messageID);
                    return complete.Status === 'Completed' && reject.Status === 'DeadLettered' ? true : null;
                });
                AssertEqual((await delivery(ctx.User, NAMES.RejectSub, messageID)).DeadLetterReason, 'it-reject', 'reject reason');
                AssertEqual((await delivery(ctx.User, NAMES.UnregisteredSub, messageID)).Status, 'Pending', 'unregistered subscription delivery is untouched');
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR4',
        Name: 'WR4: the sweeper expires a lease; the stale token is fenced out; the retry is attempt 2',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
            await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                const first = onlyMessage(await receive(consumer), messageID, 'first claim');
                await setDeliveryTimestamp(Provider, ctx.User, first.DeliveryID, 'LeaseExpiresAt', 1);
                // The pass's ExpireLeases key counts deliveries it DEAD-LETTERED (Task 4). This one has attempts left,
                // so it is retried, not dead-lettered — the row itself is the proof, not the count.
                await sweepOnce(Provider, ctx.User);
                const expired = await delivery(ctx.User, NAMES.InternalSub, messageID);
                AssertEqual(expired.Status, 'Pending', 'status after lease expiry with attempts left');
                AssertEqual(expired.LastError, 'LeaseExpired', 'last error after lease expiry');
                AssertEqual((await consumer.Complete(first)).Kind, 'LeaseLost', 'settle with the expired lease token');
                const retry = onlyMessage(await receive(consumer), messageID, 'retry claim');
                AssertEqual(retry.Attempt, 2, 'attempt number of the retry');
                await settleAll(consumer, [retry]);
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR5',
        Name: 'WR5: Exclusive — two consumers claiming concurrently never hold the same key',
        Fn: async (ctx: IntegrationCheckContext) => {
            const k1First = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k1' });
            const k1Second = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k1' });
            await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k2' });
            await withConsumers([NAMES.ExclusiveSub, NAMES.ExclusiveSub], async ([a, b]) => {
                // Both claims are issued together, on independent executors: the unique in-flight index is what
                // keeps them from both taking k1.
                const [heldByA, heldByB] = await Promise.all([receive(a), receive(b)]);
                const held = [...heldByA, ...heldByB];
                const keys = held.map(d => d.Message.PartitionKey);
                AssertEqual(new Set(keys).size, keys.length, `no key is held twice across concurrent consumers: ${JSON.stringify(keys)}`);
                AssertEqual(keys.slice().sort().join(','), 'k1,k2', 'exactly one delivery per key is in flight');
                const k1Holder = heldByA.some(d => d.Message.PartitionKey === 'k1') ? a : b;
                const other = k1Holder === a ? b : a;
                AssertEqual((await receive(other)).length, 0, 'nothing more is claimable while both keys are in flight');
                await settleAll(k1Holder, [onlyMessage(held, k1First, 'k1 head')]);
                const next = await receive(other);
                AssertEqual(onlyMessage(next, k1Second, 'k1 second').Message.PartitionKey, 'k1', 'the next k1 delivery is claimable once the first completed');
                await settleAll(other, next);
                for (const [consumer, deliveries] of [[a, heldByA], [b, heldByB]] as const) {
                    await settleAll(consumer, deliveries.filter(d => d.Message.PartitionKey === 'k2'));
                }
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR6',
        Name: 'WR6: Ordered — a dead-lettered head blocks its key until ReplayDeadLetter',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const head = await publishOne(ctx.User, NAMES.OrderedTopic, { PartitionKey: 'o1' });
            const next = await publishOne(ctx.User, NAMES.OrderedTopic, { PartitionKey: 'o1' });
            await withConsumers([NAMES.OrderedSub], async ([consumer]) => {
                const claimed = onlyMessage(await receive(consumer), head, 'head claim');
                AssertEqual((await consumer.DeadLetter(claimed, 'it-poison', 'bad record')).Kind, 'Settled', 'dead-letter the head');
                AssertEqual((await receive(consumer)).length, 0, 'nothing is claimable behind a dead-lettered head');

                const partitions = operationOutput(await new WorkQueueListPartitionsOperation().Execute({ subscriptionName: NAMES.OrderedSub, condition: 'Blocked' }, options), 'WorkQueue.ListPartitions');
                const blocked = partitions.items.find(item => item.PartitionKey === 'o1');
                Assert(!!blocked && UUIDsEqual(blocked.HeadDeliveryID ?? '', claimed.DeliveryID), `o1 should be Blocked by ${claimed.DeliveryID}: ${JSON.stringify(partitions.items)}`);

                const replay = operationOutput(await new WorkQueueReplayDeadLetterOperation().Execute({ subscriptionName: NAMES.OrderedSub, deliveryID: claimed.DeliveryID, note: 'it replay' }, options), 'WorkQueue.ReplayDeadLetter');
                Assert(replay.supported && replay.replayed, `replay result: ${JSON.stringify(replay)}`);
                const replayed = onlyMessage(await receive(consumer), head, 'replayed head');
                Assert(replayed.IsReplay, 'the replayed delivery is marked IsReplay');
                await settleAll(consumer, [replayed]);
                await settleAll(consumer, [onlyMessage(await receive(consumer), next, 'next after replay')]);
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR7',
        Name: 'WR7: a lease expiring on the final attempt is dead-lettered by the sweeper and raised through OnDeadLettered',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const events: DeadLetteredEvent[] = [];
            const unsubscribe = WorkQueueEngine.Instance.OnDeadLettered(event => events.push(event));
            try {
                const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
                await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                    // MaxAttempts is 3 and backoff is 0: two retries put the third claim on the final attempt.
                    for (const attempt of [1, 2]) {
                        const claimed = onlyMessage(await receive(consumer), messageID, `claim ${attempt}`);
                        AssertEqual((await consumer.Retry(claimed, 0, 'it: retry')).Kind, 'Settled', `retry ${attempt}`);
                    }
                    const last = onlyMessage(await receive(consumer), messageID, 'final claim');
                    AssertEqual(last.Attempt, 3, 'the final claim is attempt 3 of 3');
                    await setDeliveryTimestamp(Provider, ctx.User, last.DeliveryID, 'LeaseExpiresAt', 1);

                    const pass = await sweepOnce(Provider, ctx.User);
                    Assert((pass.ExpireLeases ?? 0) >= 1, `the pass should report the delivery it dead-lettered: ${JSON.stringify(pass)}`);
                    const row = await delivery(ctx.User, NAMES.InternalSub, messageID);
                    AssertEqual(row.Status, 'DeadLettered', 'an expired lease on the final attempt dead-letters');
                    AssertEqual(row.DeadLetterReason, 'LeaseExpired', 'dead-letter reason');
                    const event = events.find(e => UUIDsEqual(e.DeliveryID, last.DeliveryID));
                    Assert(!!event, `OnDeadLettered did not fire for ${last.DeliveryID}: ${JSON.stringify(events)}`);
                    AssertEqual(event?.SubscriptionName, NAMES.InternalSub, 'event subscription name');
                    AssertEqual(event?.Reason, 'LeaseExpired', 'event reason');
                });
            } finally {
                unsubscribe();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR8',
        Name: 'WR8: DiscardDelivery discards a pending delivery, which is never claimed',
        Fn: async (ctx: IntegrationCheckContext) => {
            const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
            const pending = await delivery(ctx.User, NAMES.InternalSub, messageID);
            const result = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                { subscriptionName: NAMES.InternalSub, deliveryID: pending.ID, reason: 'it: withdrawn' },
                { provider: fx().Provider, user: ctx.User },
            ), 'WorkQueue.DiscardDelivery');
            Assert(result.supported && result.discarded && !result.cancelRequested, `discard result: ${JSON.stringify(result)}`);
            AssertEqual((await delivery(ctx.User, NAMES.InternalSub, messageID)).Status, 'Discarded', 'status after discard');
            await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                const claimed = await receive(consumer);
                AssertEqual(claimed.filter(d => UUIDsEqual(d.Message.MessageID, messageID)).length, 0, 'a discarded delivery is never claimed');
                await settleAll(consumer, claimed);
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR9',
        Name: 'WR9: a repeated DeduplicationKey returns Duplicate and the topic gains exactly one message row',
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `${PREFIX}dedup-${Date.now()}`;
            const publish = (): Promise<PublishResult[]> => WorkQueueEngine.Instance.PublishAs(NAMES.InternalTopic, [{ DeduplicationKey: key, Payload: { n: 1 } }], { ContextUser: ctx.User });
            const before = await messageCount(ctx.User, NAMES.InternalTopic);
            const [first] = await publish();
            const [second] = await publish();
            AssertEqual(first.Status, 'Accepted', 'first publish');
            AssertEqual(second.Status, 'Duplicate', 'second publish');
            Assert(UUIDsEqual(second.MessageID, first.MessageID), `duplicate names the owning message: ${second.MessageID} vs ${first.MessageID}`);
            AssertEqual(await messageCount(ctx.User, NAMES.InternalTopic), before + 1, 'message rows written by two publishes with one DeduplicationKey');
            await withConsumers([NAMES.InternalSub], async ([consumer]) => settleAll(consumer, await receive(consumer)));
        },
    },
    {
        Id: 'work-queue-runtime.WR10',
        Name: 'WR10: REST publish requires an API key with workqueue:publish and honours AllowExternalPublish',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const cleanup: Array<() => Promise<void>> = [];
            try {
                const scoped = await createApiKey(Provider, ctx.User, true, cleanup);
                const unscoped = await createApiKey(Provider, ctx.User, false, cleanup);
                await GetAPIKeyEngine().Config(true, ctx.User);

                const accepted = await restPublish(ctx.User, NAMES.EventsTopic, scoped.Hash);
                AssertEqual(accepted.Status, 202, `scoped publish: ${JSON.stringify(accepted.Body)}`);
                Assert(JSON.stringify(accepted.Body).includes('"status":"Accepted"'), `scoped publish result: ${JSON.stringify(accepted.Body)}`);

                const internal = await restPublish(ctx.User, NAMES.InternalTopic, scoped.Hash);
                AssertEqual(internal.Status, 403, 'publish to a topic that disallows external publishing');
                Assert(JSON.stringify(internal.Body).includes('TopicNotExternallyPublishable'), `internal topic body: ${JSON.stringify(internal.Body)}`);

                AssertEqual((await restPublish(ctx.User, NAMES.EventsTopic, unscoped.Hash)).Status, 403, 'publish with a key lacking workqueue:publish');
                AssertEqual((await restPublish(ctx.User, NAMES.EventsTopic, undefined)).Status, 403, 'publish from a session that has no API key');
            } finally {
                for (const step of cleanup.reverse()) {
                    await step().catch(() => undefined);
                }
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR11',
        Name: 'WR11: the Express router reads req.userPayload and publishes over HTTP',
        Fn: async (ctx: IntegrationCheckContext) => {
            const cleanup: Array<() => Promise<void>> = [];
            try {
                const scoped = await createApiKey(fx().Provider, ctx.User, true, cleanup);
                await GetAPIKeyEngine().Config(true, ctx.User);
                const post = (baseUrl: string): Promise<globalThis.Response> => fetch(`${baseUrl}/topics/${NAMES.EventsTopic}/messages`, {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ messages: [{ attributes: { source: 'it-http' }, payload: { n: 2 } }] }),
                });
                const published = await withRestServer({ userRecord: ctx.User, apiKeyHash: scoped.Hash }, post);
                AssertEqual(published.status, 202, 'HTTP publish with a scoped API key');
                const body: { results?: Array<{ status?: string }> } = await published.json();
                AssertEqual(body.results?.[0]?.status, 'Accepted', `HTTP publish result: ${JSON.stringify(body)}`);
                AssertEqual((await withRestServer({ userRecord: ctx.User }, post)).status, 403, 'HTTP publish from a session without an API key');
            } finally {
                for (const step of cleanup.reverse()) {
                    await step().catch(() => undefined);
                }
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR12',
        Name: 'WR12: the sweeper purges a terminal delivery past topic retention',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider, CompletedDeliveryID } = fx();
            if (!CompletedDeliveryID) {
                throw new Error('WR12 purges the delivery WR2 completed, and WR2 did not record one — fix WR2 first');
            }
            await setDeliveryTimestamp(Provider, ctx.User, CompletedDeliveryID, 'CompletedAt', 48);
            const pass = await sweepOnce(Provider, ctx.User);
            Assert((pass.PurgeRetention ?? 0) >= 1, `retention purged nothing: ${JSON.stringify(pass)}`);
            AssertEqual((await deliveriesWhere(ctx.User, `ID='${CompletedDeliveryID}'`)).length, 0, 'the backdated delivery was purged');
        },
    },
    {
        Id: 'work-queue-runtime.WR13',
        Name: 'WR13: host shutdown is idempotent and unregisters',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr13', HOSTED);
            await host.Start();
            Assert(WorkQueueHost.Active === host, 'a started host is Active');
            Assert(ShutdownRegistry.Instance.List().includes(host), 'a started host is in ShutdownRegistry');
            await Promise.all([host.Shutdown(), host.Shutdown()]);
            await host.Shutdown();
            AssertEqual(host.IsStarted, false, 'IsStarted after shutdown');
            Assert(WorkQueueHost.Active === null, 'Active is cleared');
            Assert(!ShutdownRegistry.Instance.List().includes(host), 'the host left ShutdownRegistry');
        },
    },
    {
        Id: 'work-queue-runtime.WR14',
        Name: "WR14: plan 04's transport conformance checks pass on the Database transport",
        Fn: async (ctx: IntegrationCheckContext) => {
            const harness = await CreateDatabaseConformanceHarness(fx().Provider, ctx.User, DATABASE_TRANSPORT_ID);
            try {
                const results = await RunConformanceChecks(harness);
                Assert(results.length > 0, 'RunConformanceChecks returned no results');
                for (const skipped of results.filter(r => r.Status === 'Skipped')) {
                    console.log(`      ↷ skipped ${skipped.Id}: ${skipped.Detail ?? skipped.Title}`);
                }
                const failed = results.filter(r => r.Status === 'Failed');
                Assert(failed.length === 0, `conformance failures:\n${failed.map(r => `  ${r.Id} (${r.Title}): ${r.Detail ?? 'no detail'}`).join('\n')}`);
                const passed = results.filter(r => r.Status === 'Passed').length;
                // The Database transport supports every capability, so nearly every case should run. A harness that
                // gates everything off would otherwise "pass" having proven nothing.
                Assert(passed > 0, `every conformance case was skipped (${results.length}); the Database harness must run them`);
                Assert(passed >= results.length / 2, `only ${passed} of ${results.length} conformance cases ran on the Database transport`);
                console.log(`      → ${passed} conformance checks passed, ${results.length - passed} skipped`);
            } finally {
                await harness.Cleanup();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR15',
        Name: 'WR15: a work-queue delivery rejects BaseEntity.Save()',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const messageID = await publishOne(ctx.User, NAMES.InternalTopic);
            const row = await delivery(ctx.User, NAMES.InternalSub, messageID);
            const entity = await fx().Provider.GetEntityObject<MJWorkQueueDeliveryEntity>('MJ: Work Queue Deliveries', ctx.User);
            Assert(await entity.Load(row.ID), 'loading the delivery entity');
            entity.Status = 'Completed';
            AssertEqual(await entity.Save(), false, 'Save() on a work-queue delivery must be rejected');
            const message = entity.LatestResult?.CompleteMessage ?? '';
            Assert(message.toLowerCase().includes('transport driver'), `guard message should name the driver: '${message}'`);
            AssertEqual(await entity.Delete(), false, 'Delete() on a work-queue delivery must be rejected');
            AssertEqual((await delivery(ctx.User, NAMES.InternalSub, messageID)).Status, 'Pending', 'the delivery row is unchanged');
            const cleanup = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                { subscriptionName: NAMES.InternalSub, deliveryID: row.ID, reason: 'it: WR15 cleanup' }, options,
            ), 'WorkQueue.DiscardDelivery');
            Assert(cleanup.discarded, `cleanup discard: ${JSON.stringify(cleanup)}`);
        },
    },
    {
        Id: 'work-queue-runtime.WR16',
        Name: "WR16: cancelling in-flight work aborts the handler with 'Cancelled', discards the row at once and frees the Exclusive key",
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            observed.HeldStarted = false;
            observed.AbortReason = null;
            const held = await publishOne(ctx.User, NAMES.CancelTopic, { PartitionKey: 'c1', Payload: { hold: true } });
            const queued = await publishOne(ctx.User, NAMES.CancelTopic, { PartitionKey: 'c1', Payload: { hold: false } });
            const host = newHost(fx().Provider, ctx.User, 'wr16', [NAMES.CancelSub], 2);
            try {
                await host.Start();
                await waitFor('the held handler to start', async () => (observed.HeldStarted ? true : null));
                AssertEqual((await delivery(ctx.User, NAMES.CancelSub, queued)).Status, 'Pending', 'the key is single-flight: the second delivery waits');

                const row = await delivery(ctx.User, NAMES.CancelSub, held);
                const cancelledAt = Date.now();
                const cancel = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                    { subscriptionName: NAMES.CancelSub, deliveryID: row.ID, reason: 'it: operator cancel' }, options,
                ), 'WorkQueue.DiscardDelivery');
                Assert(cancel.supported && cancel.discarded && cancel.cancelRequested, `cancel result: ${JSON.stringify(cancel)}`);

                await waitFor("the handler's Signal to abort", async () => (observed.AbortReason !== null ? true : null));
                AssertEqual(observed.AbortReason, 'Cancelled', 'the abort reason a cancelled handler sees');
                await waitFor('the cancelled delivery to become Discarded', async () =>
                    ((await delivery(ctx.User, NAMES.CancelSub, held)).Status === 'Discarded' ? true : null));
                const elapsed = Date.now() - cancelledAt;
                Assert(elapsed < CANCEL_DISCARDED_WITHIN_MS,
                    `Discarded after ${elapsed} ms — the runtime must acknowledge the cancel, not wait out the ${CANCEL_LEASE_SECONDS} s lease`);
                await waitFor('the next delivery of the key to run', async () =>
                    ((await delivery(ctx.User, NAMES.CancelSub, queued)).Status === 'Completed' ? true : null));
            } finally {
                await host.Shutdown();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR17',
        Name: 'WR17: a cancel whose holder is gone is settled by lease expiry, and the key is held until then',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const options = { provider: Provider, user: ctx.User };
            const held = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'cancel-1' });
            const queued = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'cancel-1' });
            await withConsumers([NAMES.ExclusiveSub], async ([consumer]) => {
                const batch = await receive(consumer);
                const claimed = onlyMessage(batch.filter(d => d.Message.PartitionKey === 'cancel-1'), held, 'the in-flight delivery');
                await settleAll(consumer, batch.filter(d => d.Message.PartitionKey !== 'cancel-1'));

                const row = await delivery(ctx.User, NAMES.ExclusiveSub, held);
                const cancel = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                    { subscriptionName: NAMES.ExclusiveSub, deliveryID: row.ID, reason: 'it: operator cancel' }, options,
                ), 'WorkQueue.DiscardDelivery');
                Assert(cancel.supported && cancel.discarded && cancel.cancelRequested, `cancel result: ${JSON.stringify(cancel)}`);

                AssertEqual((await delivery(ctx.User, NAMES.ExclusiveSub, held)).Status, 'InFlight', 'a cancelled delivery stays in flight until acknowledged or expired');
                AssertEqual(await consumer.ExtendLease(claimed, 60), 'Cancelled', "the holder's heartbeat reports the cancel");
                AssertEqual((await consumer.Complete(claimed)).Kind, 'LeaseLost', 'a cancelled holder cannot settle its outcome');
                const whileHeld = await receive(consumer);
                AssertEqual(whileHeld.filter(d => d.Message.PartitionKey === 'cancel-1').length, 0, 'the key is not handed on while the cancelled holder has not acknowledged');
                await settleAll(consumer, whileHeld);

                // The holder "dies" here: it never calls AcknowledgeCancel. Lease expiry settles the row instead.
                await setDeliveryTimestamp(Provider, ctx.User, row.ID, 'LeaseExpiresAt', 1);
                await sweepOnce(Provider, ctx.User);
                AssertEqual((await delivery(ctx.User, NAMES.ExclusiveSub, held)).Status, 'Discarded', 'an expired cancelled delivery is Discarded, never retried');
                const afterExpiry = await receive(consumer);
                await settleAll(consumer, [onlyMessage(afterExpiry.filter(d => d.Message.PartitionKey === 'cancel-1'), queued, 'the next delivery for the key')]);
                await settleAll(consumer, afterExpiry.filter(d => d.Message.PartitionKey !== 'cancel-1'));
            });
        },
    },
    {
        Id: 'work-queue-runtime.WR18',
        Name: 'WR18: GetBacklog counts claimable pending plus in-flight deliveries',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const backlog = async (): Promise<WorkQueueGetBacklogOutput> => operationOutput(
                await new WorkQueueGetBacklogOperation().Execute({ subscriptionName: NAMES.InternalSub }, options), 'WorkQueue.GetBacklog',
            );
            const before = await backlog();
            Assert(before.supported && !before.capped, `GetBacklog must be supported and uncapped on a small fixture: ${JSON.stringify(before)}`);
            await publishOne(ctx.User, NAMES.InternalTopic);
            await publishOne(ctx.User, NAMES.InternalTopic);
            AssertEqual((await backlog()).claimable, before.claimable + 2, 'two published deliveries are claimable');

            await withConsumers([NAMES.InternalSub], async ([consumer]) => {
                const claimed = await receive(consumer);
                Assert(claimed.length > 0, 'the consumer claimed nothing');
                const during = await backlog();
                AssertEqual(during.inFlight, before.inFlight + claimed.length, 'claimed deliveries count as in flight, not claimable');
                AssertEqual(during.total, during.claimable + during.inFlight, 'total is claimable + in flight');
                await settleAll(consumer, claimed);
                await settleAll(consumer, await receive(consumer));
            });
            AssertEqual((await backlog()).total, before.total, 'the backlog returns to its starting value once the work is settled');
        },
    },
    {
        Id: 'work-queue-runtime.WR19',
        Name: 'WR19: RunOnce({ MaxDeliveries: 1 }) processes exactly one delivery and leaves the next for another job',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const first = await publishOne(ctx.User, NAMES.RunOnceTopic);
            const second = await publishOne(ctx.User, NAMES.RunOnceTopic);
            // The default container job: --max 1 --concurrency 1. It must RUN its delivery, not hand it back.
            const host = newHost(fx().Provider, ctx.User, 'wr19', [NAMES.RunOnceSub], 1);
            const result = await host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 5000, MaxDurationMs: WAIT_TIMEOUT_MS });
            AssertEqual(JSON.stringify(result), JSON.stringify({ Processed: 1, Reason: 'MaxDeliveries' }), 'one-shot result');
            AssertEqual(host.IsStarted, false, 'RunOnce drains and shuts the host down before resolving');
            const rows = [await delivery(ctx.User, NAMES.RunOnceSub, first), await delivery(ctx.User, NAMES.RunOnceSub, second)];
            AssertEqual(rows.filter(r => r.Status === 'Completed').length, 1, `exactly one delivery completed: ${JSON.stringify(rows.map(r => r.Status))}`);
            AssertEqual(rows.filter(r => r.Status === 'Pending').length, 1, 'the other delivery is still Pending for the next job');
            const pending = rows.find(r => r.Status === 'Pending');
            if (pending) {
                const cleanup = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                    { subscriptionName: NAMES.RunOnceSub, deliveryID: pending.ID, reason: 'it: WR19 cleanup' }, options,
                ), 'WorkQueue.DiscardDelivery');
                Assert(cleanup.discarded, `cleanup discard: ${JSON.stringify(cleanup)}`);
            }
        },
    },
];

for (const check of WorkQueueRuntimeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('work-queue-runtime', {
    Setup: async (ctx: IntegrationCheckContext) => {
        if (!(ctx.Provider instanceof DatabaseProviderBase)) {
            throw new Error('work-queue-runtime needs a server DatabaseProviderBase');
        }
        const provider = ctx.Provider;
        // Assign the fixture handle FIRST: if anything below throws, Teardown still has a provider to clean with.
        fixture = { Provider: provider, CompletedDeliveryID: null };
        if (!handlerRegistered) {
            // ClassFactory has no unregister API. One registration per process, under a key only this bundle uses.
            MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, ItScriptedWorkHandler, HANDLER_KEY);
            handlerRegistered = true;
        }
        await removeFixtures(provider, ctx.User);      // leftovers of an interrupted run, including API keys
        await createFixtures(provider, ctx.User);
        await WorkQueueEngine.Instance.Config(true, ctx.User, provider);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        try {
            await WorkQueueHost.Active?.Shutdown();
            await removeFixtures(fixture.Provider, ctx.User);
            await WorkQueueEngine.Instance.Config(true, ctx.User, fixture.Provider);
        } catch (error) {
            console.warn(`      ⚠ work-queue-runtime teardown: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            fixture = undefined;
        }
    },
});
```

`DeadLetteredEvent` is exported by plan 05's engine (`src/transports/TransportDriverDeps.ts`). If the engine's index does not re-export the type yet, add `export type { DeadLetteredEvent } from './transports/TransportDriverDeps';` there — it is the engine's own type, not a cross-package re-export.

- [ ] **Step 4: Export the bundle**

In `packages/TestingFramework/integration-test-suite/src/index.ts`, add after `export * from './checks/queue.checks';`:

```typescript
export * from './checks/work-queue-runtime.checks';
```

- [ ] **Step 5: Run the registry test and build**

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: PASS — the bundle registers 19 checks and the pinned catalog has 94 bundles.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm run build`
Expected: builds.

- [ ] **Step 6: Write the test record**

`metadata-optional/integration-test/tests/integration/.IT94-work-queue-runtime.json`:

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "IT94 - Work Queue Runtime (native host, operators, REST)",
    "Description": "Deterministic end-to-end behavior of the durable work queue's MJ runtime on the Database transport — no LLM calls. WR1: a started WorkQueueHost plans fixture subscriptions (registered handler Running, unknown handler HandlerNotRegistered). WR2: publish → host claim → handler → Completed. WR3: one publish settles independently per subscription (Completed / DeadLettered / untouched Pending). WR4: the sweeper expires a lease with attempts left, the stale lease token is fenced out, the retry is attempt 2. WR5: Exclusive single flight across two consumers claiming concurrently. WR6: an Ordered dead-lettered head blocks its key; WorkQueue.ListPartitions reports Blocked; WorkQueue.ReplayDeadLetter unblocks in order. WR7: a lease expiring on the final attempt is dead-lettered by the sweeper and raised through OnDeadLettered. WR8: WorkQueue.DiscardDelivery discards a pending delivery. WR9: DeduplicationKey suppression writes exactly one message row. WR10: REST publish requires an API key with workqueue:publish and honours AllowExternalPublish; a session without an API key is refused. WR11: the Express router reads req.userPayload and publishes over HTTP. WR12: retention purge. WR13: host shutdown contract. WR14: plan 04's transport conformance checks (RunConformanceChecks) pass against plan 05's Database conformance harness and are not all skipped. WR15: a delivery row rejects BaseEntity.Save() and Delete() and is unchanged. WR16: cancelling in-flight work aborts the handler with reason Cancelled, the runtime acknowledges, the row is Discarded well before its lease and the Exclusive key's next delivery runs. WR17: a cancel whose holder is gone reports Cancelled on heartbeat, fences the settle, holds the key and is Discarded at lease expiry. WR18: WorkQueue.GetBacklog counts claimable pending plus in-flight deliveries. WR19: WorkQueueHost.RunOnce with MaxDeliveries 1 completes exactly one delivery and leaves the next Pending. Fixtures are 'mj-it-wq-*' topics, subscriptions and API keys on the seeded Database transport, removed in Setup and Teardown.",
    "InputDefinition": {},
    "ExpectedOutcomes": {
      "summary": "The host claims and settles fixture deliveries in long-running and one-shot modes, partition modes enforce single flight and blocking under concurrent claims, operator Remote Operations repair blocked keys and cancel running work, the sweeper expires leases, dead-letters the final attempt and purges retention, duplicates are suppressed, and REST publishing requires an API key, the scope and topic exposure."
    },
    "Configuration": {
      "tier": "deterministic",
      "transport": "server",
      "checks": [
        {
          "type": "work-queue-runtime"
        }
      ]
    },
    "Status": "Active"
  },
  "primaryKey": {
    "ID": "0E518741-C6B5-44AE-866F-2D3F353318EB"
  }
}
```

- [ ] **Step 7: Add the test to the deterministic suite**

In `metadata-optional/integration-test/test-suites/.integration-suite.json`, find the `Integration Tests — Deterministic` suite's `relatedEntities["MJ: Test Suite Tests"]` array. The `IT93 - Prompt Eval Harness` entry is currently its **last element** — it ends with `}` and no comma, followed by the array's closing `]`. Make two edits:

1. add a comma after the IT93 entry's closing brace (`}` → `},`);
2. insert the entry below directly after it, **with no trailing comma** (it is now the last element). Sequence 48 keeps it among the server-transport members, before every client-transport member.

```json
        {
          "fields": {
            "SuiteID": "@parent:ID",
            "TestID": "@lookup:MJ: Tests.Name=IT94 - Work Queue Runtime (native host, operators, REST)",
            "Sequence": 48,
            "Status": "Active"
          },
          "primaryKey": {
            "ID": "B88AFB7E-06E4-47D4-BC45-8DDE8FF215A8"
          }
        }
```

If another branch has appended entries after IT93 since this plan was written, apply the same rule to whatever is last: every element but the last ends in `},`, and the last ends in `}`.

Run: `node -e "JSON.parse(require('fs').readFileSync('metadata-optional/integration-test/test-suites/.integration-suite.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`. (`suite-sequencing.test.ts` parses this file too; invalid JSON fails it.)

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test suite-sequencing`
Expected: PASS.

- [ ] **Step 8: Push the test metadata and run the bundle**

Run: `pnpm exec mj sync push --dir=metadata-optional/integration-test --ci --dry-run`
Expected: 1 `MJ: Tests` create and 1 `MJ: Test Suite Tests` create; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata-optional/integration-test --ci`

`mj sync push` stamps `sync` blocks into the files it pushed. Remove the `"sync": { … }` object it added to `.IT94-work-queue-runtime.json` and to the new IT94 suite entry, and restore any other file whose `git diff` shows only `sync` changes (`migrations/CLAUDE.md` "Revert the `sync` block write-back").

Run: `MJ_INTEGRATION_TEST=1 pnpm mj test run "IT94 - Work Queue Runtime (native host, operators, REST)"`
Expected: 19 passed, 0 failed, 0 skipped. Diagnose any failure before continuing — WR5, WR6 or WR17 failing usually means plan 05's claim or cancel statements disagree with 03 §7, and WR16/WR19 failing means plan 04's runtime or Task 3b does, not that this bundle is wrong.

Run the bundle twice more in a row.
Expected: identical results (Setup removes leftovers; WR14's harness cleans up after itself; no state leaks between runs).

Run: `pnpm run test:integration`
Expected: the deterministic tier passes, including IT94. Report pass/fail/skip counts.

- [ ] **Step 9: Commit**

Run: `git status --short metadata-optional` and confirm no `sync`-only changes remain.

```bash
git add packages/TestingFramework/integration-test-suite/package.json packages/TestingFramework/integration-test-suite/src metadata-optional/integration-test/tests/integration/.IT94-work-queue-runtime.json metadata-optional/integration-test/test-suites/.integration-suite.json pnpm-lock.yaml
git commit -m "test(integration): IT94 work queue runtime bundle — host, RunOnce, partitions, cancel, operators, sweeper, REST"
```

---

### Task 13: READMEs and operator runbook

**Files:**
- Create or extend: `packages/WorkQueue/engine/README.md` (plan 05 may have created it — append the sections below, do not replace its data-layer content)
- Create: `packages/WorkQueue/server/README.md`

**Interfaces:**
- Consumes: the names produced by Tasks 1–12.
- Produces: documentation only. Handler and producer guidance lives in [10-consumer-guide.md](10-consumer-guide.md); the READMEs link to it rather than repeat it.

- [ ] **Step 1: Append the runtime sections to `packages/WorkQueue/engine/README.md`**

````markdown
## Running subscriptions inside MJ

Enable the host in `mj.config.cjs` on every instance that should process work:

```javascript
workQueue: {
  enabled: true,
  systemUserEmail: 'system@example.org',            // REQUIRED: an existing MJ user; handlers run as this user
  subscriptions: [{ name: '*', concurrency: 4 }],   // or name specific subscriptions
  idlePollMinMs: 250,
  idlePollMaxMs: 5000,
  shutdownDrainMs: 8000,
  sweeperEnabled: true,
  sweeperIntervalMs: 60000,
  reconcileIntervalMs: 30000,
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Start the host in this process |
| `systemUserEmail` | none that works — set it | The user handlers, the sweeper and the REST extension's engine run as. The shipped placeholder (`not.set@nowhere.com`) fails start-up with a message that says so |
| `subscriptions` | `[{ name: '*', concurrency: 4 }]` | Which subscriptions this instance runs, and how many deliveries of each at once |
| `idlePollMinMs` / `idlePollMaxMs` | 250 / 5000 | Poll back-off while a Database subscription is empty |
| `shutdownDrainMs` | 8000 | How long running handlers get to finish on shutdown. The host can take up to **2×** this (drain, abort with `'Shutdown'`, drain again), so the process supervisor's grace period must exceed it |
| `sweeperEnabled` / `sweeperIntervalMs` | `true` / 60000 | Lease expiry and retention purge. Any number of instances may enable it: a database application lock lets one pass run at a time |
| `reconcileIntervalMs` | 30000 | How often the host re-plans. `0` plans only at start |

`MJ_DISABLE_WORK_QUEUE_HOST=1` turns the host off for one process without touching configuration.

Any number of instances may run the same subscription: claims are atomic against the database (or the cloud queue),
leases are fenced, and each instance only decides what **it** runs. **SQL Server databases need
`READ_COMMITTED_SNAPSHOT ON`**; the engine checks at start and refuses to run without it.

Subscription metadata is cached by `WorkQueueEngineBase` (`@memberjunction/work-queue-base`, browser-safe). The server
`WorkQueueEngine` delegates to it, the same split as `AIEngineBase`/`AIEngine`. Import base symbols from
`@memberjunction/work-queue-base` directly — the engine package does not re-export them.

Every `reconcileIntervalMs` the host re-plans: a subscription set to `Paused`, a changed lease, or a newly added
subscription takes effect without a restart. `GET /health/extensions` (with `WorkQueueServerExtension` enabled)
reports each subscription's state:

| State | Meaning | Fix |
| --- | --- | --- |
| `Running` | A consumer runtime is claiming | — |
| `Paused` | Subscription, topic or transport is not `Active` | Set it `Active` |
| `HandlerNotRegistered` | No `BaseWorkHandler` under `HandlerKey` in this process | Import the handler's package / check the key |
| `Unsupported` | The transport cannot honor the policy — for example `Ordered` on a cloud topic (`Ordered` needs a Database topic) | See the reason text |
| `Error` | Driver or consumer could not start | See the reason text and server log |

## Writing a handler

```typescript
import { RegisterClass } from '@memberjunction/global';
import { Outcome, FatalWorkError, type WorkContext, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';

interface BatchReady { batchUri: string; records: number }

@RegisterClass(BaseWorkHandler, 'integration.apply-batch')
export class ApplyBatchHandler extends BaseWorkHandler<BatchReady> {
    public async Handle(message: WorkMessage<BatchReady>, context: WorkContext): Promise<WorkOutcome> {
        if (!message.Payload?.batchUri) {
            throw new FatalWorkError('batchUri missing');                      // dead-letter now, no retry
        }
        await applyBatch(message.Payload.batchUri, this.Provider, this.ContextUser, context.Signal);   // idempotent upserts
        return Outcome.Complete();
    }
}
```

Rules: handlers must be idempotent; use `this.Provider` / `this.ContextUser` (the host's system user) for every data
call; honor `context.Signal` and stop when it aborts; any other thrown error retries with backoff. With the default
`HeartbeatMode = 'Auto'` the runtime renews the lease itself, every `min(LeaseSeconds / 3, 30 s)`. The full guidance
— idempotency keys, long-running work, abort reasons, publishing in order, filters — is in the
[consumer guide](../../../plans/work-queue-1/10-consumer-guide.md).

## Operating

| Task | CLI | Remote Operation |
| --- | --- | --- |
| Counts | `mj queue stats [--subscription s]` | `WorkQueue.GetSubscriptionStats` |
| Dead letters | `mj queue dead-letters --subscription s` | `WorkQueue.ListDeadLetters` |
| Blocked keys | `mj queue partitions --subscription s --condition Blocked` | `WorkQueue.ListPartitions` |
| Retry a dead letter | `mj queue replay --subscription s --delivery id` | `WorkQueue.ReplayDeadLetter` |
| Drop work, or cancel a running handler | `mj queue discard --subscription s --delivery id --reason "…"` | `WorkQueue.DiscardDelivery` |
| Backlog for an autoscaler | `mj queue backlog --subscription s` | `WorkQueue.GetBacklog` |
| Check bindings | `mj queue validate-bindings [--transport t]` | `WorkQueue.ValidateBindings` |
| Run work in a container job | `mj queue work --subscription s --once` | — |

**Who may call the operations.** Every caller needs entity permissions: **Read** on `MJ: Work Queue Deliveries` for
the read operations (stats, dead letters, partitions, backlog, validate-bindings) and **Update** on
`MJ: Work Queue Subscriptions` for replay and discard. API-key callers additionally need the `workqueue:read` or
`workqueue:operate` scope. Messages and deliveries are readable by administrative roles only: payloads may hold
personal data.

**Discard and cancel.** Discarding a **pending** or **dead-lettered** delivery resolves it immediately. Discarding an
**in-flight** delivery is a cancel (`cancelRequested: true`): the row is flagged, the holder's next heartbeat — at
most 30 seconds away — reports `Cancelled`, the runtime aborts the handler with `Signal.reason === 'Cancelled'` and
acknowledges, and the row becomes `Discarded` as soon as the handler returns, freeing its `Exclusive`/`Ordered` key.
A handler that ignores its signal holds the key until its lease runs out; if the holder has died, lease expiry
discards the row. A cancelled delivery is never retried.

**Alerting on dead letters.** `WorkQueueEngine.Instance.OnDeadLettered(event => …)` is **in-process only**: it fires
in the process that dead-lettered the item. A dead letter produced by another instance's sweeper, or inside a one-shot
container job, reaches no listener elsewhere. Alert from `WorkQueue.GetSubscriptionStats` (`DeadLettered > 0`) on the
Database transport and from the DLQ alarms on AWS.

### Container-job workers (KEDA, Azure Container Apps jobs, Kubernetes)

Instead of a long-running host, run one-shot jobs that claim a bounded amount of work and exit:

```bash
mj queue work --subscription venue-import --once                  # claim 1, run, drain, exit 0
mj queue work --subscription venue-import --once --max 5 --concurrency 2 --max-duration-ms 3300000
```

`--max` bounds deliveries **received**, so a job never claims work it will not run. `--max-duration-ms` stops claiming
after that long and drains; keep it below the scheduler's job deadline. `SIGTERM` and `SIGINT` drain the host in both
`--once` and long-running modes.

**Exit codes.** `0` when the host ran — including "the queue was empty", a spent budget, `--max-duration-ms`, a
signal, or a subscription an operator paused — so a scheduler never records a failure for idleness. **Non-zero** when
the requested subscription could not run at all: unknown name, `HandlerNotRegistered`, `Unsupported`, `Error`, or a
boot/configuration failure. A mis-deployed image therefore fails loudly instead of "succeeding" forever.

**Scaler query.** Give the scaler its own SELECT-only login (`scripts/work-queue-scaler-login.sql`) and use the
scaler query that ships beside it in the engine package's data-layer section of this README (plan 05 Task 5). It
counts claimable `Pending` **plus** `InFlight`, applies single flight per key, and caps each count at 1000.
Counting `InFlight` is load-bearing: schedulers subtract running executions from the metric, so a `Pending`-only
count scales to zero while work is still running and starves the queue. On an `Ordered` subscription the standalone
query can over-count a blocked key by one; the cost is a job that starts, claims nothing and exits 0.
`mj queue backlog` / `WorkQueue.GetBacklog` is exact — prefer it where the scaler can call an API.

**KEDA `ScaledJob`** (one delivery per job, scale to zero, at most 5 at a time):

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledJob
metadata:
  name: mj-work-queue-venue-import
spec:
  jobTargetRef:
    parallelism: 1
    completions: 1
    backoffLimit: 0                     # the queue owns retries; never let the scheduler re-run a job
    activeDeadlineSeconds: 3600         # hard stop; --max-duration-ms below is the graceful one
    template:
      spec:
        restartPolicy: Never            # required for Jobs; with backoffLimit 0 a failed pod is not restarted
        terminationGracePeriodSeconds: 30      # > 2 × --shutdown-drain-ms, so a drain is never cut short
        containers:
          - name: worker
            image: <your mj image>
            args: ["queue", "work", "--subscription", "venue-import", "--once",
                   "--max-duration-ms", "3300000", "--shutdown-drain-ms", "10000"]
  pollingInterval: 10
  maxReplicaCount: 5
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  scalingStrategy:
    strategy: accurate                  # the query already includes in-flight work
  triggers:
    - type: mssql
      metadata:
        targetValue: "1"
        query: <plan 05's scaler query, on one line, with the subscription name inlined>
      authenticationRef:
        name: mj-work-queue-scaler-auth       # the SELECT-only login
```

Azure Container Apps event-driven jobs are the same shape: `replicaTimeout` above `--max-duration-ms` plus the drain,
`replicaRetryLimit: 0`, and the same query as the scale rule.

**Sizing.** `LeaseSeconds` must cover the job's worst heartbeat outage (a database failover), not just its runtime —
a lease that expires while the job is healthy lets a second job claim the same delivery. `2 × --shutdown-drain-ms`
must fit inside the platform's termination grace period.

### Runbook: an `Ordered` key is blocked

1. `mj queue partitions --subscription <s> --condition Blocked` — note `HeadDeliveryID` and `WaitingItems`.
2. `mj queue dead-letters --subscription <s>` — read `Reason` and `LastError` for that delivery.
3. Fix the cause (handler bug → deploy; bad data → correct the source).
4. `mj queue replay --subscription <s> --delivery <HeadDeliveryID> --note "<what changed>"` — the head keeps its
   position; the key resumes when it completes. If the work must be dropped instead:
   `mj queue discard … --reason "<why>"`.
5. Re-run step 1 until the key no longer appears.

### Runbook: a delivery is stuck `InFlight`

1. `mj queue stats --subscription <s>` — `InFlight` that never falls.
2. If the handler is alive and hung, cancel it: `mj queue discard --subscription <s> --delivery <id> --reason "<why>"`.
   Expect `cancelRequested: true`; the row is `Discarded` within ~30 seconds if the handler honors its signal.
3. If the holder is dead, do nothing: the sweeper expires the lease within `LeaseSeconds` + `sweeperIntervalMs` and
   the delivery retries (or dead-letters on its final attempt). Check that some instance has `sweeperEnabled: true`.

### Soak test (manual, before each release that touches the work queue)

1. Development database of your own; two MJAPI instances with `workQueue.enabled` and different `GRAPHQL_PORT`s.
2. A throwaway topic with one `None`, one `Exclusive` and one `Ordered` subscription on a handler that sleeps
   0–200 ms and fails 2 % of the time (`TransientWorkError`).
3. Publish 50,000 messages over 10 minutes (keys drawn from 500 values; one producer per key, awaiting each
   acceptance) through `POST /work-queue/topics/…/messages`.
4. During the run: `kill -9` one instance twice, restart it each time; cancel ten in-flight deliveries.
5. Pass when: every delivery ends `Completed`, `DeadLettered` or `Discarded`; no `Exclusive`/`Ordered` key ever had two
   `InFlight` rows (`SELECT SubscriptionID, PartitionKey, COUNT(*) FROM WorkQueueDelivery WHERE Status = 'InFlight' AND PartitionKey IS NOT NULL GROUP BY SubscriptionID, PartitionKey HAVING COUNT(*) > 1` returns nothing throughout);
   `Ordered` completion order per key equals `OrderKey` order; `mj queue stats` shows no stuck `InFlight` after the run.
````

- [ ] **Step 2: Write `packages/WorkQueue/server/README.md`**

````markdown
# @memberjunction/work-queue-server

REST publish endpoint for the MemberJunction work queue, delivered as an MJServer Server Extension. Operators
use Remote Operations and `mj queue`; this package only accepts publishes from producers outside MJ.

## Enable

```javascript
// mj.config.cjs
serverExtensions: [
  { Enabled: true, DriverClass: 'WorkQueueServerExtension', RootPath: '/work-queue', Phase: 'post-auth',
    Settings: { MaxBatch: 100, BodyLimit: '30mb' } },
],
```

The extension mounts after MJ's unified authentication and needs `workQueue.systemUserEmail` set (it configures the
engine as that user). A topic accepts REST publishes only when `AllowExternalPublish = 1`.

## Publish

REST publishing is **API-key only**. A browser or JWT session is refused with 403 even when the user is an
administrator; interactive callers publish through MJ code instead. The key needs the `workqueue:publish` scope; the
check is the same one GraphQL resolvers use (`full_access` keys pass, the key's acting context applies).

```bash
curl -X POST https://api.example.com/work-queue/topics/email.events/messages \
  -H "x-api-key: mj_sk_…" -H "Content-Type: application/json" \
  -d '{"messages":[{"messageId":"…","partitionKey":"subscriber@example.com","attributes":{"eventType":"click"},"payload":{"url":"https://…"},"deduplicationKey":"sg:evt-123"}]}'
```

Request fields are camelCase. Result **values** are the contract's PascalCase strings:

```json
{ "results": [ { "messageId": "…", "status": "Accepted" },
               { "messageId": "…", "status": "Rejected", "error": { "code": "PayloadTooLarge", "message": "…", "retryable": false } } ] }
```

| Status | When |
| --- | --- |
| 202 | The batch was processed — inspect each `results[i].status`: `Accepted`, `Duplicate`, or `Rejected` with `error.code` and `error.retryable` |
| 400 | Invalid topic name, body is not valid JSON, body could not be read, or body shape invalid (1–`MaxBatch` messages, known camelCase fields only) |
| 401 | Not authenticated |
| 403 | No API key, the key lacks `workqueue:publish`, or the topic is `TopicNotExternallyPublishable` |
| 404 | Unknown topic |
| 413 | Body larger than `BodyLimit` |
| 500 | Unexpected failure (logged) |

Authentication and the scope check run **before** the body is read, so an unauthorized caller cannot make the server
parse a 30 MB body.

Producers retrying after a timeout **must reuse their `messageId`s**. Treat `Duplicate` as success; retry only
items whose `error.retryable` is true (`DeduplicationPending` is one: another publish holds that key's reservation).
````

- [ ] **Step 3: Commit**

```bash
git add packages/WorkQueue/engine/README.md packages/WorkQueue/server/README.md
git commit -m "docs(work-queue): runtime, operator runbooks and REST publish README"
```

---

## Contract deltas

Open differences between this plan and [03](03-interfaces-and-tables.md) (Revision 4) or a sibling plan. Everything
else in this plan uses 03's names exactly. 03 was not edited.

| # | 03 / other plan says | This plan | Needed to close it |
| --- | --- | --- | --- |
| CD1 | 03 §8: an **API-key** caller is authorized by the scope "with the subscription name as resource" | `BaseRemotableOperation.Authorize(input, user)` receives no API-key hash, and MJ's resolver (`ResolverBase.CheckAPIKeyScopeAuthorization`) evaluates `RequiredScope` with the **operation key** as the resource. So Task 6's `Authorize` applies the entity-permission rule to **every** caller (API-key users included), and the scope is enforced by the resolver at operation granularity. A key cannot be limited to one subscription | Either MJ core passes the API-key context into `Authorize` (then Task 6 evaluates `workqueue:read`/`operate` against `input.subscriptionName`), or 03 §8 restates the resource as the operation key |
| CD2 | 03 §11 `WorkQueueHost` surface | Adds `static get Active()`, `IsStarted`, `ShutdownName`, `RunSweeperOnce()`, and the test seam `WorkQueueHostDependencies.RunOnceTickMs?` (default 50 ms). Plan 08's QU9 helper and MJServer use `Active`/`IsStarted` | Add to 03 §11, or accept as plan-local additions |
| CD3 | 03 §11 `WorkQueueSweeper(executor, engine: WorkQueueEngine, contextUser, log)` | Same four arguments in the same order; `engine` is typed by the structural subset `WorkQueueSweeperEngine { Subscriptions; NotifyDeadLettered }` (the real engine satisfies it), and an optional fifth argument `options: WorkQueueSweeperOptions { PurgeBatchSize; MaxPurgeBatchesPerRun; AcquireLock?; CreateLedger? }` carries tuning and test seams. Likewise the host takes `WorkQueueHostEngine`, a subset of `WorkQueueEngine` | None required — callers written against 03 compile unchanged |
| CD4 | 03 §7 describes the sweep lock; plan 05 owns the SQL | Task 4 consumes `TryAcquireSweepLock(source, contextUser): Promise<SweepLock \| null>` with `SweepLock { Executor; Release() }` from plan 05's `src/sql/sweepLock.ts` — the lock must be held on the session of the executor it returns. The name and module are this plan's assumption | Plan 05 must export exactly this (Task 4 stops with instructions if it does not) |
| CD5 | 03 §11 sweeper key `ExpireLeases` | Kept, per 03. It counts deliveries the pass **dead-lettered**, not leases expired, so a pass that only returned deliveries to `Pending` reports 0. Task 4 logs it as `DeadLetteredByLeaseExpiry`; IT94 WR4 asserts the row, WR7 asserts the count | Optional: rename the key in 03 |
| CD6 | 03 §11 `TransportDriverDeps.InstanceID?` | The host's `InstanceID` names logs, health and `ShutdownName` only. Lease owners come from the drivers the engine builds; the host has no way to hand its instance ID to `GetDriver` | If lease owners should equal the host instance ID, plan 05's engine needs an instance-ID input at `Config` |
| CD7 | — | MJServer `workQueue` config section and the env kill switch `MJ_DISABLE_WORK_QUEUE_HOST=1` (mirrors `MJ_DISABLE_TASK_GRAPH_DISPATCHER`); REST answers `401` for an unauthenticated request in addition to 03 §9's statuses | None — deployment surface owned by this plan |
