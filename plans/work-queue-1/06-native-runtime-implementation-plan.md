# Work Queue — Native Runtime & Server Implementation Plan (Phase 1, plan 06)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run work-queue subscriptions inside MJ servers and operate them — handler binding, the `WorkQueueHost` (long-running and one-shot container-job modes), the sweeper, the eight operator Remote Operations, MJServer wiring, the REST publish Server Extension, `mj queue` CLI commands, bootstrap manifests and the deterministic integration bundle — on top of the core (plan 04) and the Database data layer (plan 05).

**Architecture:** Metadata is split across two tiers (03 §0, §11): `WorkQueueEngineBase` (browser-safe
`@memberjunction/work-queue-base`, plan 05) caches Transports/Topics/Subscriptions and builds bindings and policies for
any tier, and the server `WorkQueueEngine` delegates to it — composition, mirroring `AIEngine`/`AIEngineBase` — while
adding drivers, publishing, the operator and staging. Everything in this plan talks to the **server** engine (directly
or through the `WorkQueueHostEngine` structural subset), so the split changes no call site here; it only adds a package
to the bootstrap manifests and keeps server-only types out of anything a dashboard may import.
`WorkQueueHost` (engine package) plans which subscriptions this instance may run (host type, status, capability gating via `SubscriptionUnsupportedReason`, handler presence), starts one `ConsumerRuntime` per runnable subscription over its transport's consumer, and re-plans on a timer so pausing, adding or changing a subscription takes effect without a restart. A `WorkQueueHostLoopRegistry` lets transport packages attach auxiliary loops (plan 07's SQS stager) keyed by transport `DriverClass`. `WorkQueueSweeper` runs set-based maintenance on the database clock. Operators use Remote Operations (Explorer/GraphQL/CLI); REST is publish-only and lives in the new `@memberjunction/work-queue-server` Server Extension (post-auth). MJServer starts the host after `listen()` when `workQueue.enabled` is set; the host self-registers with `ShutdownRegistry`. The same host also runs **one-shot**: `RunOnce()` claims a bounded number of deliveries, drains and resolves, so `mj queue work --once` is a container-job entrypoint that scales from the `WorkQueue.GetBacklog` metric (02 §4.4a).

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, `@memberjunction/work-queue-core` (plan 04), `@memberjunction/work-queue-base` + `@memberjunction/work-queue-engine` (plan 05), MJ core/global/core-entities/sql-dialect/api-keys, `@memberjunction/server-extensions-core`, Express 5, zod 3 (MJServer config), oclif 3 (MJCLI), MJ CodeGen + mj-sync, `@memberjunction/testing-integration`.

**Spec:** [`03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative — §3, §5, §7, §8, §9, §10, §11), [`02-implementation-overview.md`](02-implementation-overview.md), [`README.md`](README.md). Plans [04](04-core-implementation-plan.md) and [05](05-native-data-implementation-plan.md) must be complete. Read 03 before starting.

## Global Constraints

- **Package manager:** pnpm. `pnpm install` at the repository root only — never inside a package, never `npm install`.
- **Per-package commands:** `cd packages/<Path> && pnpm test` and `cd packages/<Path> && pnpm run build`. Do not build single packages with turbo from the root.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the version in `packages/MJCore/package.json` (`6.1.0` when this plan was written).
- **New package shape** (`packages/WorkQueue/server`): `"type": "module"`, build `tsc && tsc-alias -f`, `tsconfig.json` extends `../../../tsconfig.server.json`, `vitest.config.ts` merges `../../../vitest.shared`, tests in `src/__tests__/*.test.ts`, extensionless relative imports (MJServer and MJCLI keep their existing `.js`-suffixed relative imports).
- **Dependency rule (03 §0):** `@memberjunction/work-queue-core` and `@memberjunction/work-queue-aws` gain **no** `@memberjunction/*` dependencies from this plan, and **nothing server-only ever moves into `@memberjunction/work-queue-base`** — no drivers, no SQL executor, no host, no Express, no `@memberjunction/server*`. Base stays importable by Explorer. Everything here lives in `work-queue-engine`, `work-queue-server`, `MJServer`, `MJCLI`, the bootstrap packages and the integration suite.
- **Metadata:** primary keys are the `uuidgen` values written into the tasks; never add `sync` blocks by hand. Push with `pnpm exec mj sync push --dir=metadata --ci`, then regenerate with `pnpm exec mj codegen --skipdb`.
- **One database per agent.** Before `mj sync push` or `mj codegen`, confirm no other session uses the `DB_DATABASE` in your `.env`.
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
| 2 | Host loop registry and subscription planner | `WorkQueueHostLoopRegistry`, `PlanHostedSubscriptions` with capability gating — tested |
| 3 | `WorkQueueHost` | Start, reconcile, kick, health, auxiliary loops, sweeper timer, shutdown — tested |
| 3b | `WorkQueueHost.RunOnce` | Budgeted one-shot mode for container jobs: claim → run → drain → exit — tested |
| 4 | `WorkQueueSweeper` | Sequences plan 05's operator maintenance statements, forwards lease-expiry dead letters to `OnDeadLettered`; overlap guard — tested |
| 5 | Remote-operation metadata | Category, 8 operations, 16 type files; CodeGen bases generated |
| 6 | Operator service and server operations | `WorkQueueOperatorService`, 8 `@RegisterClass` server operations — tested |
| 7 | MJServer configuration and host startup | `workQueue` config section, `StartWorkQueueHost`, provider source, `serve()` wiring — tested |
| 8 | `@memberjunction/work-queue-server` scaffold and request mapping | Package builds; body parsing, settings, response mapping — tested |
| 9 | Publish handler, scope authorizer and Server Extension | `POST {root}/topics/{topic}/messages` mounted post-auth — tested |
| 10 | `mj queue` CLI commands | 10 commands (including the container-job worker) + formatting helpers — tested |
| 11 | Bootstrap dependencies, manifests and full build | Registrations in `ServerBootstrap`/`ServerBootstrapLite`; `pnpm run build` green |
| 12 | Integration bundle `work-queue-runtime` (IT94) | 16 checks (including the Database conformance run) pass against a live database |
| 13 | READMEs and operator runbook | Engine + server READMEs, container-job/KEDA recipe, soak-test runbook |

## Pre-flight

- [ ] You are on `feat/work-queue` and `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] Plans 04 and 05 are merged into the branch: `cd packages/WorkQueue/core && pnpm test`, `cd packages/WorkQueue/base && pnpm test` and `cd packages/WorkQueue/engine && pnpm test` pass; `pnpm-workspace.yaml` lists `packages/WorkQueue/*`.
- [ ] Plan 05's migration, CodeGen and metadata are applied to **your** database: `grep -c "class MJWorkQueueSubscriptionEntity" packages/MJCoreEntities/src/generated/entities/__mj.ts` prints `1`, and `grep -l "workqueue:operate" metadata/api-scopes/.*.json` finds the scope file.
- [ ] The names this plan consumes from plans 04 and 05 exist (see "Consumed surface" below). If any differs, stop and reconcile against 03 before Task 1.
- [ ] `pnpm install` at the root; `cd packages/MJServer && pnpm test` passes (baseline).

### Consumed surface (from plans 04 and 05)

| Package | Names |
| --- | --- |
| `@memberjunction/work-queue-core` | `WorkJson`, `WorkMessage`, `WorkPayloadRef`, `WorkContext`, `WorkHandler`, `WorkOutcome`, `Outcome`, `WorkLogger`, `WorkProgress`, `ConsumerRuntime`, `ConsumerRuntimeOptions`, `SubscriptionPolicy`, `SubscriptionBinding`, `TopicBinding`, `ReceivedDelivery`, `SettleResult`, `ITransportDriver`, `ITransportConsumer`, `ITransportOperator`, `TransportCapabilities`, `SubscriptionUnsupportedReason`, `BindingValidationIssue`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionCondition`, `PartitionStateRecord`, `Page`, `OperatorResult`, `PublishRequest`, `PublishResult`, `PublishError`, `TopologyManifest`, `BindingImport`, `WorkQueueConfigurationError`; subpath `@memberjunction/work-queue-core/testing` (plan 04 Task 8): `ConformanceHarness`, `ConformanceTraits`, `RunConformanceChecks(harness: ConformanceHarness): Promise<ConformanceCheckResult[]>` with `ConformanceCheckResult { Id; Title; Status: 'Passed' \| 'Failed' \| 'Skipped'; Detail: string \| null; DurationMs }` (Vitest-free; used by IT94 WR13). The Vitest wrapper `RunTransportConformanceSuite` lives at `@memberjunction/work-queue-core/testing/vitest` and is not used by this plan |
| `@memberjunction/work-queue-engine` (plan 05) | `WorkQueueSqlExecutor`, `WorkQueueExecutorSource`, `SqlStatement`, `SqlParam` (`src/sql/WorkQueueSqlExecutor.ts`, Task 2); `ExecuteWrite(executor, statement, contextUser): Promise<number>` and `ExecuteRows<T>(executor, statement, contextUser): Promise<T[]>` (`src/sql/sqlExecution.ts`, Task 2); `CreateWorkQueueSqlBuilder(context): WorkQueueSqlBuilder` (Task 6) and `OperatorSqlBuilder` sweeper statements `ExpireLeasesAll()` (**returns `ExpiredDeadLetterRow[]`**, ND14), `FlagGapStalls()`, `DiscardSkippedSequences()`, `PurgeTerminalDeliveries(batchSize)`, `PurgeOrphanMessages(batchSize)` (Task 5); `ExpiredDeadLetterRow { DeliveryID; SubscriptionID; PartitionKey: string \| null }` (`src/sql/rows.ts`, Task 3); `DeduplicationLedger` with `constructor(executor, contextUser)` and `PurgeExpired(batchSize?, maxBatches?)` (Task 7); `TransportDriverDeps { ContextUser; Executor: WorkQueueExecutorSource; Log; InstanceID?; NotifyDeadLettered?: (event: DeadLetteredEvent) => void }` and `DeadLetteredEvent { SubscriptionName; DeliveryID; Reason; PartitionKey: string \| null }` (`src/transports/TransportDriverDeps.ts`, Task 8 — ND15); `DatabaseTransportDriver` including `StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>` (Tasks 9, 12 — plan 07's stager calls it; this plan does not); `BaseTransportDriverFactory`, `DatabaseTransportDriverFactory` (Task 10); `MJWorkLogger` — `constructor(prefix = '[WorkQueue]')`, `src/logging/MJWorkLogger.ts` (Task 10); `ListenerSet<TEvent>` and `PublishListenerSet extends ListenerSet<string>` (`src/engine/PublishListenerSet.ts`, Task 13 — ND15); `WorkQueueEngine` (Task 13) — the 03 §11 surface plus `OnPublished(listener: (topicName: string) => void): () => void` and `GetDatabaseDriver(): Promise<DatabaseTransportDriver>`; `WorkQueuePublishOptions { ContextUser; Provider?; External? }` (Task 13); `CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo, transportID?: string): Promise<DatabaseConformanceHarness>` (Task 14); test fake `RecordingExecutor` (`QueueRows`, `QueueError`, `Calls`) in `src/__tests__/fakes.ts`. **Revision 3 additions** (03 §5.2, §6.5, §7, §11): `WorkQueueEngine.GetBacklog(subscriptionName): Promise<{ Supported; Claimable; InFlight; Total }>`; `WorkQueueEngine.OnDeadLettered(listener): () => void`; `ITransportOperator.Discard(...)` returning `{ Supported: true; Changed: boolean; CancelRequested?: boolean }` — an `InFlight` delivery is cancelled by setting `CancelRequestedAt` and rotating `LeaseToken`; the delivery-state entity save guards (Messages, Deliveries, Partition States, Deduplications reject `Save()`/`Delete()`); and the SELECT-only scaler login script `scripts/work-queue-scaler-login.sql` (flat `scripts/` folder, as plan 05 Task 5 writes it). If any of these is missing when you start, plan 05 has not landed Revision 3 — reconcile against 03 first |
| `@memberjunction/work-queue-base` (plan 05, 03 §0) | `WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase>` — the **browser-safe metadata tier**: `Instance`, `Config`, `Transports`, `Topics`, `Subscriptions`, `GetTopicByName`, `GetSubscriptionByName`, `SubscriptionsForTopic`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `BuildSubscriptionPolicy`, `ParseFilter(subscription, support)`, `IsStagedToDatabase`, `ValidateTopologyRows`. This plan never imports it directly: the server `WorkQueueEngine` proxies every one of these members (03 §11), so host and operator call sites are unchanged. It appears here only because Task 11 must add the package to the bootstrap manifests |
| `@memberjunction/core-entities` | `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity` (CodeGen, plan 05) |
| `metadata/api-scopes` | `workqueue`, `workqueue:publish`, `workqueue:read`, `workqueue:operate` (plan 05) |

## File structure

```
packages/WorkQueue/engine/                                           (plan 05 package)
  src/handlers/BaseWorkHandler.ts · ResolveWorkHandler.ts · BoundWorkHandler.ts   Task 1
  src/host/WorkQueueHostLoopRegistry.ts · HostedSubscriptionPlanner.ts            Task 2
  src/host/WorkQueueHost.ts                                          Task 3
  src/host/WorkQueueSweeper.ts                                       Task 3 (stub), Task 4
  src/operations/WorkQueueOperatorService.ts · WorkQueueOperations.ts             Task 6
  src/index.ts                                                       Tasks 1–4, 6 (appended)
  src/__tests__/runtimeFakes.ts                                      Task 1, extended by Tasks 2–4, 6
  src/__tests__/handlers.test.ts                                     Task 1
  src/__tests__/WorkQueueHostLoopRegistry.test.ts · HostedSubscriptionPlanner.test.ts   Task 2
  src/__tests__/WorkQueueHost.test.ts                                Task 3
  src/__tests__/WorkQueueHostRunOnce.test.ts                         Task 3b
  src/__tests__/WorkQueueSweeper.test.ts                             Task 4
  src/__tests__/WorkQueueOperatorService.test.ts · WorkQueueOperations.test.ts           Task 6
  README.md                                                          Task 13

metadata/remote-operation-categories/.work-queue-category.json       Task 5
metadata/remote-operations/.work-queue-operations.json               Task 5
metadata/remote-operations/types/work-queue-*.ts (16 files)          Task 5
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
  src/__tests__/publishHandler.test.ts · scopeAuthorizer.test.ts · WorkQueueServerExtension.test.ts  Task 9

packages/MJCLI/
  package.json · src/utils/open-app-context.ts · src/lib/domain-profiles.ts       Task 10
  src/lib/work-queue/queue-format.ts · queue-session.ts              Task 10
  src/commands/queue/{index,usage,stats,dead-letters,partitions,replay,discard,skip-sequence,work,export-topology,import-bindings,validate-bindings}.ts   Task 10
  src/__tests__/work-queue-cli.test.ts · work-queue-commands.test.ts Task 10

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

### Task 2: Host loop registry and subscription planner

**Files:**
- Create: `packages/WorkQueue/engine/src/host/WorkQueueHostLoopRegistry.ts`, `src/host/HostedSubscriptionPlanner.ts`
- Modify: `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueHostLoopRegistry.test.ts`, `src/__tests__/HostedSubscriptionPlanner.test.ts`

**Interfaces:**
- Consumes: `ITransportDriver`, `ITransportConsumer`, `ITransportOperator`, `SubscriptionBinding`, `SubscriptionPolicy`, `TransportCapabilities`, `BindingValidationIssue`, `PublishResult`, `ReceivedDelivery`, `SettleResult`, `WorkJson`, `WorkLogger`, `SubscriptionUnsupportedReason` (plan 04); `WorkQueueExecutorSource` (plan 05, `src/sql/WorkQueueSqlExecutor.ts`); `BaseWorkHandler`, `WorkHandlerResolver` (Task 1); `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`; `BaseSingleton`, `UUIDsEqual` (`@memberjunction/global`).
- Produces:
  - `interface IHostLoop { readonly Name: string; Start(): void; Stop(): Promise<void> }`
  - `interface HostLoopContext` — `InstanceID: string`, `Subscription: MJWorkQueueSubscriptionEntity`, `Topic: MJWorkQueueTopicEntity`, `Transport: MJWorkQueueTransportEntity`, `Binding: SubscriptionBinding`, `StagedToDatabase: boolean`, `ContextUser: UserInfo`, `Executor: WorkQueueExecutorSource`, `Log: WorkLogger`, `KickConsumer(): void`
  - `type HostLoopFactory = (context: HostLoopContext) => Promise<IHostLoop[]>`
  - `class WorkQueueHostLoopRegistry extends BaseSingleton` — `static Instance`, `Register(driverClass: string, factory: HostLoopFactory): void`, `Get(driverClass: string): HostLoopFactory | undefined`, `Unregister(driverClass: string): boolean`
  - `type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error'` (03 §11)
  - `interface HostSubscriptionRequest { Name: string; Concurrency: number }`
  - `interface WorkQueueHostEngine` — `Transports`, `Topics`, `Subscriptions`, `GetDriver(transportID)`, `GetDatabaseDriver()`, `BuildSubscriptionBinding(subscription)`, `IsStagedToDatabase(subscription)`, `OnPublished(listener)` (structural subset of plan 05's `WorkQueueEngine`)
  - `interface RunnableSubscriptionPlan`, `interface BlockedSubscriptionPlan`, `type HostedSubscriptionPlan`
  - `ExpandSubscriptionRequests(requests, engine): ExpandedSubscriptionRequest[]`
  - `PlanHostedSubscriptions(requests: HostSubscriptionRequest[], engine: WorkQueueHostEngine, resolveHandler: WorkHandlerResolver): Promise<HostedSubscriptionPlan[]>`
  - Fakes: `DATABASE_CAPABILITIES`, `AWS_CAPABILITIES`, `FakeTransport`, `FakeTopic`, `FakeSubscription`, `FakeTransportDriver`, `InertConsumer`, `FakeHostEngine`, `RecordingWorkHandler`, `TestHandlerResolver`, `BuildHostScenario()`

**Plan 07 seam (normative):** `WorkQueueHostLoopRegistry.Instance.Register(driverClass: string, factory: HostLoopFactory): void` with `type HostLoopFactory = (context: HostLoopContext) => Promise<IHostLoop[]>` and `interface IHostLoop { readonly Name: string; Start(): void; Stop(): Promise<void> }`. Plan 07 registers `'AWS'`; its factory returns `[new SqsStager(...)]` when `context.StagedToDatabase` is true (else `[]`), stages rows through plan 05's `DatabaseTransportDriver.StageDeliveries(...)` using `context.Executor`, and calls `context.KickConsumer()` after each staged batch. The host calls the factory once per started subscription whose topic's transport has that `DriverClass`, starts the loops after the consumer runtime, and stops them with it.

Planning rules, applied per request in this order (the first failing rule decides):

| # | Condition | Plan |
| --- | --- | --- |
| 1 | `'*'` request | Expands to every `MJWorker` subscription (any status) at the wildcard's concurrency; explicit entries override |
| 2 | Named subscription not found | `Blocked` / `Error` — `Subscription '<name>' not found` |
| 3 | `HostType` is not `MJWorker` | `Blocked` / `Unsupported` — `HostType '<type>' subscriptions run outside MJ` |
| 4 | Topic or transport row missing | `Blocked` / `Error` |
| 5 | Subscription, topic or transport not `Active` | `Blocked` / `Paused` — `Subscription status is Paused`, `Topic '<name>' is Disabled`, `Transport '<name>' is Disabled` |
| 6 | `GetDriver` throws | `Blocked` / `Error` — `Transport driver unavailable: <message>` |
| 7 | `SubscriptionUnsupportedReason(binding, topicDriver.Capabilities, staged)` non-null | `Blocked` / `Unsupported` — the core's reason |
| 8 | `HandlerKey` blank or unresolvable | `Blocked` / `HandlerNotRegistered` — `No BaseWorkHandler is registered for HandlerKey '<key or (none)>'` |
| 9 | Staged and `engine.GetDatabaseDriver()` throws (no Active `Database` transport) | `Blocked` / `Error` — `Staged subscription '<name>' requires an Active Database transport` |
| 10 | otherwise | `Runnable`: consumer driver is the Database driver when staged, else the topic's driver; `Signature` = JSON of `[binding, handlerKey, staged, transportID, concurrency, consumerDriver.Name]` |

Plans are returned sorted by subscription name. The host restarts a runtime only when its `Signature` changes.

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, merging the new imports into the top of the file:

```typescript
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    Outcome,
    type BindingValidationIssue, type FilterSupport, type ITransportConsumer, type ITransportDriver,
    type ITransportOperator, type PublishResult, type ReceivedDelivery, type SettleResult, type SubscriptionBinding, type SubscriptionPolicy,
    type TopicBinding, type TransportCapabilities, type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import type { WorkQueueHostEngine } from '../host/HostedSubscriptionPlanner';

/** Mirrors plan 05's DATABASE_TRANSPORT_CAPABILITIES (03 §4.1, §5). Keep both in step. */
const QUEUE_FILTER_SUPPORT: FilterSupport = {
    Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50,
};

export const DATABASE_CAPABILITIES: TransportCapabilities = {
    DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true, SupportsExternalHosts: false,
    CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full', ReplaySingleDeadLetter: true,
    CompletedCounts: true, MaxRetryDelaySeconds: 2147483647, Filters: QUEUE_FILTER_SUPPORT,
};

export const AWS_CAPABILITIES: TransportCapabilities = {
    DetectsMessageIDDuplicates: false, PersistsProgress: false, SupportsOrdered: false, SupportsExternalHosts: true,
    CancelPending: false, CancelInFlight: false, ListPartitions: false, PeekDeadLetters: 'BestEffort', ReplaySingleDeadLetter: true,
    CompletedCounts: false, MaxRetryDelaySeconds: 43200, Filters: QUEUE_FILTER_SUPPORT,
};

export const IDS = {
    DatabaseTransport: '10000000-0000-4000-8000-000000000001',
    AwsTransport: '10000000-0000-4000-8000-000000000002',
    EmailTopic: '20000000-0000-4000-8000-000000000001',
    IntegrationTopic: '20000000-0000-4000-8000-000000000002',
    IntegrationSubscription: '30000000-0000-4000-8000-000000000001',
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
    return { Status: 'Active', OrderingMode: 'PublishOrder', AllowExternalPublish: false, RetentionDays: 7, ...fields } as unknown as MJWorkQueueTopicEntity;
}

export function FakeSubscription(fields: FakeSubscriptionFields): MJWorkQueueSubscriptionEntity {
    return {
        HostType: 'MJWorker', HandlerKey: 'handler.ok', Status: 'Active', PartitionMode: 'None', MaxAttempts: 5,
        BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...fields,
    } as unknown as MJWorkQueueSubscriptionEntity;
}

/** A consumer that never receives anything and settles whatever it is given. */
export class InertConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    public async Receive(): Promise<ReceivedDelivery<TPayload>[]> {
        return [];
    }

    public async ExtendLease(): Promise<'Held' | 'Lost'> {
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

    public async Close(): Promise<void> {}
}

export class FakeTransportDriver implements ITransportDriver {
    public readonly OpenedBindings: SubscriptionBinding[] = [];
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
        return new InertConsumer<TPayload>();
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
    public readonly StagedSubscriptionNames = new Set<string>();
    public GetDriverCalls = 0;
    /** Dead-letter events the host forwarded from the sweeper (03 §11). */
    public readonly DeadLettered: DeadLetteredEvent[] = [];
    private readonly listeners = new Set<(topicName: string) => void>();

    public NotifyDeadLettered = (event: DeadLetteredEvent): void => {
        this.DeadLettered.push(event);
    };

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

    public async GetDatabaseDriver(): Promise<ITransportDriver> {
        const transport = this.Transports.find(t => t.DriverClass === 'Database' && t.Status === 'Active');
        if (!transport) {
            throw new Error('No Active Database transport');
        }
        return this.GetDriver(transport.ID);
    }

    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding {
        const topic = this.Topics.find(t => UUIDsEqual(t.ID, subscription.TopicID));
        const policy: SubscriptionPolicy = {
            SubscriptionName: subscription.Name,
            TopicName: topic?.Name ?? 'unknown',
            OrderingMode: 'PublishOrder',
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

    public IsStagedToDatabase(subscription: MJWorkQueueSubscriptionEntity): boolean {
        return this.StagedSubscriptionNames.has(subscription.Name);
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

/** Completes every delivery and remembers who it was bound to. */
export class RecordingWorkHandler extends BaseWorkHandler {
    public static LastBoundUserID: string | null = null;

    public async Handle(): Promise<WorkOutcome> {
        RecordingWorkHandler.LastBoundUserID = this.ContextUser.ID;
        return Outcome.Complete();
    }
}

export function TestHandlerResolver(handlerKey: string): BaseWorkHandler | null {
    return handlerKey === 'handler.ok' ? new RecordingWorkHandler() : null;
}

export interface HostScenario {
    Engine: FakeHostEngine;
    DatabaseDriver: FakeTransportDriver;
    AwsDriver: FakeTransportDriver;
}

/**
 * Two transports, two topics and six subscriptions covering every planning outcome:
 * email.subscriber-update (AWS, Exclusive, runnable) · email.dashboard (External) ·
 * email.ordered-staged (AWS, Ordered, staged) · integration.apply (Database, Ordered, runnable) ·
 * integration.audit (unregistered handler) · integration.paused (Paused).
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
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000003', Name: 'email.ordered-staged', TopicID: IDS.EmailTopic, PartitionMode: 'Ordered' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000004', Name: 'integration.apply', TopicID: IDS.IntegrationTopic, PartitionMode: 'Ordered' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000005', Name: 'integration.audit', TopicID: IDS.IntegrationTopic, HandlerKey: 'handler.missing' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000006', Name: 'integration.paused', TopicID: IDS.IntegrationTopic, Status: 'Paused' }),
    ];
    engine.Drivers.set(IDS.DatabaseTransport, databaseDriver);
    engine.Drivers.set(IDS.AwsTransport, awsDriver);
    engine.StagedSubscriptionNames.add('email.ordered-staged');
    return { Engine: engine, DatabaseDriver: databaseDriver, AwsDriver: awsDriver };
}
```

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/WorkQueueHostLoopRegistry.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { WorkQueueHostLoopRegistry, type HostLoopFactory } from '../host/WorkQueueHostLoopRegistry';

const noLoops: HostLoopFactory = async () => [];
const otherLoops: HostLoopFactory = async () => [];

afterEach(() => {
    WorkQueueHostLoopRegistry.Instance.Unregister('test-driver');
});

describe('WorkQueueHostLoopRegistry', () => {
    it('is a stable singleton', () => {
        expect(WorkQueueHostLoopRegistry.Instance).toBe(WorkQueueHostLoopRegistry.Instance);
    });

    it('matches driver classes trimmed and case-insensitively, and a later registration replaces an earlier one', () => {
        const registry = WorkQueueHostLoopRegistry.Instance;
        registry.Register('Test-Driver', noLoops);
        expect(registry.Get(' test-driver ')).toBe(noLoops);
        registry.Register('test-driver', otherLoops);
        expect(registry.Get('TEST-DRIVER')).toBe(otherLoops);
    });

    it('unregisters a driver class', () => {
        const registry = WorkQueueHostLoopRegistry.Instance;
        registry.Register('test-driver', noLoops);
        expect(registry.Unregister('TEST-driver')).toBe(true);
        expect(registry.Get('test-driver')).toBeUndefined();
        expect(registry.Unregister('test-driver')).toBe(false);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/HostedSubscriptionPlanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    ExpandSubscriptionRequests, PlanHostedSubscriptions, type HostedSubscriptionPlan, type RunnableSubscriptionPlan,
} from '../host/HostedSubscriptionPlanner';
import { BuildHostScenario, FakeTransport, IDS, TestHandlerResolver } from './runtimeFakes';

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

describe('ExpandSubscriptionRequests', () => {
    it("expands '*' to MJWorker subscriptions, sorted, and lets explicit entries override concurrency", () => {
        const { Engine } = BuildHostScenario();
        const expanded = ExpandSubscriptionRequests([{ Name: '*', Concurrency: 2 }, { Name: 'INTEGRATION.APPLY', Concurrency: 9 }], Engine);
        expect(expanded.map(e => [e.Name, e.Concurrency])).toEqual([
            ['email.ordered-staged', 2], ['email.subscriber-update', 2], ['integration.apply', 9],
            ['integration.audit', 2], ['integration.paused', 2],
        ]);
    });
});

describe('PlanHostedSubscriptions', () => {
    it('reports an unknown named subscription as an error', async () => {
        const { Engine } = BuildHostScenario();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'nope', Concurrency: 1 }], Engine, TestHandlerResolver);
        expect(plan).toEqual({ Kind: 'Blocked', Name: 'nope', State: 'Error', Reason: "Subscription 'nope' not found" });
    });

    it('refuses an External subscription named explicitly', async () => {
        const { Engine } = BuildHostScenario();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.dashboard', Concurrency: 1 }], Engine, TestHandlerResolver);
        expect(plan).toMatchObject({ State: 'Unsupported', Reason: "HostType 'External' subscriptions run outside MJ" });
    });

    it('pauses subscriptions that are not Active and subscriptions whose topic is Disabled', async () => {
        const scenario = BuildHostScenario();
        const plans = await PlanHostedSubscriptions([{ Name: '*', Concurrency: 1 }], scenario.Engine, TestHandlerResolver);
        expect(byName(plans, 'integration.paused')).toMatchObject({ State: 'Paused', Reason: 'Subscription status is Paused' });

        scenario.Engine.Topics = scenario.Engine.Topics.map(t => (t.Name === 'integration.batch-ready' ? Object.assign(t, { Status: 'Disabled' }) : t));
        const again = await PlanHostedSubscriptions([{ Name: 'integration.apply', Concurrency: 1 }], scenario.Engine, TestHandlerResolver);
        expect(again[0]).toMatchObject({ State: 'Paused', Reason: "Topic 'integration.batch-ready' is Disabled" });
    });

    it('reports a transport driver failure as an error', async () => {
        const { Engine } = BuildHostScenario();
        Engine.DriverErrors.set(IDS.AwsTransport, new Error('credentials rejected'));
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 1 }], Engine, TestHandlerResolver);
        expect(plan).toMatchObject({ State: 'Error', Reason: 'Transport driver unavailable: credentials rejected' });
    });

    it('gates Ordered on a cloud transport: unsupported unless staged, and staged runs on the Database driver', async () => {
        const scenario = BuildHostScenario();
        const staged = runnable(await PlanHostedSubscriptions([{ Name: 'email.ordered-staged', Concurrency: 1 }], scenario.Engine, TestHandlerResolver), 'email.ordered-staged');
        expect(staged.StagedToDatabase).toBe(true);
        expect(staged.ConsumerDriver).toBe(scenario.DatabaseDriver);

        scenario.Engine.StagedSubscriptionNames.clear();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.ordered-staged', Concurrency: 1 }], scenario.Engine, TestHandlerResolver);
        expect(plan.Kind).toBe('Blocked');
        expect(plan.Kind === 'Blocked' ? plan.State : '').toBe('Unsupported');
        expect(plan.Kind === 'Blocked' ? plan.Reason.length : 0).toBeGreaterThan(0);
    });

    it('reports a missing or blank handler key', async () => {
        const { Engine } = BuildHostScenario();
        const [missing] = await PlanHostedSubscriptions([{ Name: 'integration.audit', Concurrency: 1 }], Engine, TestHandlerResolver);
        expect(missing).toMatchObject({ State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey 'handler.missing'" });

        Object.assign(Engine.Subscription('integration.audit'), { HandlerKey: null });
        const [blank] = await PlanHostedSubscriptions([{ Name: 'integration.audit', Concurrency: 1 }], Engine, TestHandlerResolver);
        expect(blank).toMatchObject({ State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey '(none)'" });
    });

    it('runs a non-staged subscription on its topic driver with a signature that tracks concurrency', async () => {
        const scenario = BuildHostScenario();
        const first = runnable(await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 1 }], scenario.Engine, TestHandlerResolver), 'email.subscriber-update');
        const second = runnable(await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 3 }], scenario.Engine, TestHandlerResolver), 'email.subscriber-update');
        expect(first.ConsumerDriver).toBe(scenario.AwsDriver);
        expect(first.StagedToDatabase).toBe(false);
        expect(first.HandlerKey).toBe('handler.ok');
        expect(first.Signature).not.toBe(second.Signature);
    });

    it('requires an Active Database transport for a staged subscription', async () => {
        const scenario = BuildHostScenario();
        scenario.Engine.Transports = [
            FakeTransport({ ID: IDS.DatabaseTransport, Name: 'Database', DriverClass: 'Database', Status: 'Disabled' }),
            FakeTransport({ ID: IDS.AwsTransport, Name: 'AWS-test', DriverClass: 'AWS' }),
        ];
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.ordered-staged', Concurrency: 1 }], scenario.Engine, TestHandlerResolver);
        expect(plan).toMatchObject({ State: 'Error', Reason: "Staged subscription 'email.ordered-staged' requires an Active Database transport" });
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHostLoopRegistry HostedSubscriptionPlanner`
Expected: FAIL — unresolved imports `../host/WorkQueueHostLoopRegistry` and `../host/HostedSubscriptionPlanner`.

- [ ] **Step 4: Write `src/host/WorkQueueHostLoopRegistry.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';
import type { SubscriptionBinding, WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';

/** A background loop a transport attaches to a hosted subscription (for example plan 07's SQS stager). */
export interface IHostLoop {
    readonly Name: string;
    Start(): void;
    Stop(): Promise<void>;
}

export interface HostLoopContext {
    InstanceID: string;
    Subscription: MJWorkQueueSubscriptionEntity;
    Topic: MJWorkQueueTopicEntity;
    Transport: MJWorkQueueTransportEntity;
    Binding: SubscriptionBinding;
    StagedToDatabase: boolean;
    ContextUser: UserInfo;
    /** The host's executor; it can mint independent executors for isolated transactions (plan 07's stager). */
    Executor: WorkQueueExecutorSource;
    Log: WorkLogger;
    /** Wakes this subscription's consumer runtime, e.g. right after staging rows it can now claim. */
    KickConsumer(): void;
}

export type HostLoopFactory = (context: HostLoopContext) => Promise<IHostLoop[]>;

/**
 * Transport packages register loop factories by Transport.DriverClass. The host asks for a factory each time
 * it starts a subscription whose topic uses that transport, and stops the loops with the runtime.
 */
export class WorkQueueHostLoopRegistry extends BaseSingleton<WorkQueueHostLoopRegistry> {
    private readonly factories = new Map<string, HostLoopFactory>();

    protected constructor() {
        super();
    }

    public static get Instance(): WorkQueueHostLoopRegistry {
        return super.getInstance<WorkQueueHostLoopRegistry>();
    }

    public Register(driverClass: string, factory: HostLoopFactory): void {
        this.factories.set(normalize(driverClass), factory);
    }

    public Get(driverClass: string): HostLoopFactory | undefined {
        return this.factories.get(normalize(driverClass));
    }

    public Unregister(driverClass: string): boolean {
        return this.factories.delete(normalize(driverClass));
    }
}

function normalize(driverClass: string): string {
    return driverClass.trim().toLowerCase();
}
```

- [ ] **Step 5: Write `src/host/HostedSubscriptionPlanner.ts`**

```typescript
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { SubscriptionUnsupportedReason, type ITransportDriver, type SubscriptionBinding } from '@memberjunction/work-queue-core';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import type { WorkHandlerResolver } from '../handlers/BoundWorkHandler';

export type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error';

export interface HostSubscriptionRequest {
    /** Subscription name, or '*' for every MJWorker subscription. */
    Name: string;
    Concurrency: number;
}

/**
 * The structural subset of the server `WorkQueueEngine` this host needs. `WorkQueueEngine` satisfies it structurally. Every metadata member here is one the
 * server engine proxies from `WorkQueueEngineBase` (03 §11), so the base/engine split is invisible to the host:
 * nothing in this plan imports `@memberjunction/work-queue-base` directly.
 */
export interface WorkQueueHostEngine {
    readonly Transports: MJWorkQueueTransportEntity[];
    readonly Topics: MJWorkQueueTopicEntity[];
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    GetDriver(transportID: string): Promise<ITransportDriver>;
    /** The Database transport's driver (plan 05 Task 13); staged subscriptions consume through it. */
    GetDatabaseDriver(): Promise<ITransportDriver>;
    BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
    IsStagedToDatabase(subscription: MJWorkQueueSubscriptionEntity): boolean;
    OnPublished(listener: (topicName: string) => void): () => void;
    /**
     * Fans a dead-letter event out to the engine's `OnDeadLettered` listeners (03 §11). The sweeper finds
     * lease-expiry dead letters that no driver saw, so the host forwards them here. Optional: an engine built
     * before plan 05 exposed it simply reports nothing (CD16).
     */
    NotifyDeadLettered?: (event: DeadLetteredEvent) => void;
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
    StagedToDatabase: boolean;
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

type DriverLookup = () => Promise<ITransportDriver>;

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
    resolveHandler: WorkHandlerResolver,
): Promise<HostedSubscriptionPlan[]> {
    const databaseDriver = once(() => engine.GetDatabaseDriver());
    const plans: HostedSubscriptionPlan[] = [];
    for (const request of ExpandSubscriptionRequests(requests, engine)) {
        plans.push(await planOne(request, engine, resolveHandler, databaseDriver));
    }
    return plans;
}

async function planOne(
    request: ExpandedSubscriptionRequest,
    engine: WorkQueueHostEngine,
    resolveHandler: WorkHandlerResolver,
    databaseDriver: DriverLookup,
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
    return planActive(request, subscription, topic, transport, { engine, resolveHandler, databaseDriver });
}

interface PlanningServices {
    engine: WorkQueueHostEngine;
    resolveHandler: WorkHandlerResolver;
    databaseDriver: DriverLookup;
}

async function planActive(
    request: ExpandedSubscriptionRequest,
    subscription: MJWorkQueueSubscriptionEntity,
    topic: MJWorkQueueTopicEntity,
    transport: MJWorkQueueTransportEntity,
    services: PlanningServices,
): Promise<HostedSubscriptionPlan> {
    let topicDriver: ITransportDriver;
    try {
        topicDriver = await services.engine.GetDriver(transport.ID);
    } catch (error) {
        return blocked(subscription.Name, 'Error', `Transport driver unavailable: ${describe(error)}`);
    }
    const binding = services.engine.BuildSubscriptionBinding(subscription);
    const staged = services.engine.IsStagedToDatabase(subscription);
    const unsupported = SubscriptionUnsupportedReason(binding, topicDriver.Capabilities, staged);
    if (unsupported) {
        return blocked(subscription.Name, 'Unsupported', unsupported);
    }
    const handlerKey = subscription.HandlerKey?.trim() ?? '';
    if (handlerKey === '' || !services.resolveHandler(handlerKey)) {
        return blocked(subscription.Name, 'HandlerNotRegistered', `No BaseWorkHandler is registered for HandlerKey '${handlerKey || '(none)'}'`);
    }
    const consumerDriver = staged ? await lookupDatabaseDriver(services.databaseDriver) : topicDriver;
    if (!consumerDriver) {
        return blocked(subscription.Name, 'Error', `Staged subscription '${subscription.Name}' requires an Active Database transport`);
    }
    return {
        Kind: 'Runnable', Name: subscription.Name, Concurrency: request.Concurrency, Subscription: subscription, Topic: topic,
        Transport: transport, Binding: binding, StagedToDatabase: staged, ConsumerDriver: consumerDriver, HandlerKey: handlerKey,
        Signature: JSON.stringify([binding, handlerKey, staged, transport.ID, request.Concurrency, consumerDriver.Name]),
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

async function lookupDatabaseDriver(lookup: DriverLookup): Promise<ITransportDriver | null> {
    try {
        return await lookup();
    } catch {
        return null;
    }
}

function once<T>(factory: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | null = null;
    return () => {
        pending ??= factory();
        return pending;
    };
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

- [ ] **Step 6: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './host/WorkQueueHostLoopRegistry';
export * from './host/HostedSubscriptionPlanner';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHostLoopRegistry HostedSubscriptionPlanner`
Expected: PASS — WorkQueueHostLoopRegistry (3), HostedSubscriptionPlanner (9).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds. A type error on `WorkQueueEngine` not satisfying `WorkQueueHostEngine` shows up in Task 7, not here; if plan 05's `OnPublished` signature differs, align it with the "Consumed surface" table now.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): host loop registry and capability-gated subscription planning"
```

---

### Task 3: `WorkQueueHost`

**Files:**
- Create: `packages/WorkQueue/engine/src/host/WorkQueueHost.ts`
- Modify: `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueHost.test.ts`

**Interfaces:**
- Consumes: `ConsumerRuntime`, `ConsumerRuntimeOptions`, `ITransportConsumer`, `SubscriptionPolicy`, `WorkHandler`, `WorkLogger` (plan 04); `WorkQueueExecutorSource`, `DeduplicationLedger`, test fake `RecordingExecutor` (`src/__tests__/fakes.ts`) (plan 05); `BoundWorkHandler`, `ResolveWorkHandler`, `WorkQueueProviderSource`, `WorkHandlerResolver` (Task 1); `PlanHostedSubscriptions`, `HostedSubscriptionPlan`, `RunnableSubscriptionPlan`, `HostedSubscriptionState`, `WorkQueueHostEngine`, `WorkQueueHostLoopRegistry`, `IHostLoop`, `HostLoopFactory` (Task 2); `WorkQueueSweeper`, `WorkQueueSweeperEngine` (Task 4 — imported by name here, implemented next; Step 5 below creates a compile-only stub that Task 4 replaces); `IShutdownable`, `ShutdownRegistry` (`@memberjunction/global`).
- Produces:
  - `interface WorkQueueHostConfig` — 03 §11 fields plus `ReconcileIntervalMs: number` (0 disables periodic re-planning; `SweeperIntervalMs` 0 disables the sweeper)
  - `interface HostRuntime { Start(): void; Stop(): Promise<void>; Kick(): void; readonly InFlightCount: number }` (`ConsumerRuntime` satisfies it)
  - `interface HostRuntimeArgs { Consumer: ITransportConsumer; HandlerFactory: () => WorkHandler; Policy: SubscriptionPolicy; Options: ConsumerRuntimeOptions; Log: WorkLogger }`
  - `interface HostSweeper { RunOnce(): Promise<Record<string, number>> }`
  - `interface WorkQueueHostDependencies { ProviderSource: WorkQueueProviderSource; CreateRuntime?; CreateSweeper?; ResolveHandler?; LoopRegistry?: Pick<WorkQueueHostLoopRegistry, 'Get'> }`
  - `interface WorkQueueHostHealth { InstanceID: string; Subscriptions: { Name: string; State: HostedSubscriptionState; Reason: string | null; InFlight: number }[] }`
  - `class WorkQueueHost implements IShutdownable` — `constructor(config: WorkQueueHostConfig, engine: WorkQueueHostEngine, contextUser: UserInfo, executor: WorkQueueExecutorSource, log: WorkLogger, dependencies: WorkQueueHostDependencies)`, `static get Active(): WorkQueueHost | null`, `ShutdownName`, `IsStarted`, `Start()`, `Reconcile()`, `RunSweeperOnce()`, `Kick(subscriptionName)`, `GetHealth()`, `Shutdown()`
  - Fakes: `FakeRuntime`, `FakeLoop`

Host rules:

| Event | Behavior |
| --- | --- |
| `Start()` | Registers with `ShutdownRegistry`, becomes `WorkQueueHost.Active`, reconciles once, subscribes to `engine.OnPublished`, starts the reconcile and sweeper timers (both `unref`'d). Calling it again is a no-op. |
| `Reconcile()` | Re-plans (Task 2). Runtimes whose subscription is no longer runnable, or whose `Signature` changed, are stopped; new runnable plans are started. Concurrent calls share one pass. A planning failure is logged and keeps the current runtimes. |
| Starting a runnable plan | Open the consumer on `plan.ConsumerDriver`, create the runtime with a `BoundWorkHandler` factory, create auxiliary loops from the registry entry for `plan.Transport.DriverClass`, then start the runtime and the loops. A failure yields state `Error` with the message; other subscriptions still start. |
| `engine.OnPublished(topic)` | Kicks every running runtime whose topic name matches (case-insensitive). |
| `Kick(name)` | Kicks that subscription's runtime, if running. |
| Sweeper tick | `RunSweeperOnce()`: never throws; a failure is logged and returns `{}`. |
| `Shutdown()` | Idempotent. Stops timers, unsubscribes, waits for an in-progress reconcile, stops every runtime and loop in parallel, reports former `Running` states as `Paused` / `Host is shut down`, clears `Active`, unregisters from `ShutdownRegistry`. |

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, merging imports:

```typescript
import type { HostRuntime, HostRuntimeArgs } from '../host/WorkQueueHost';
import type { IHostLoop } from '../host/WorkQueueHostLoopRegistry';

export class FakeRuntime implements HostRuntime {
    public Started = 0;
    public Stopped = 0;
    public Kicks = 0;
    public InFlightCount = 0;

    constructor(public readonly Args: HostRuntimeArgs) {}

    public Start(): void {
        this.Started++;
    }

    public async Stop(): Promise<void> {
        this.Stopped++;
    }

    public Kick(): void {
        this.Kicks++;
    }

    public get SubscriptionName(): string {
        return this.Args.Policy.SubscriptionName;
    }
}

export class FakeLoop implements IHostLoop {
    public Started = 0;
    public Stopped = 0;

    constructor(public readonly Name: string) {}

    public Start(): void {
        this.Started++;
    }

    public async Stop(): Promise<void> {
        this.Stopped++;
    }
}
```

- [ ] **Step 2: Write the failing test**

`packages/WorkQueue/engine/src/__tests__/WorkQueueHost.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { ShutdownRegistry } from '@memberjunction/global';
import type { HostLoopContext, HostLoopFactory } from '../host/WorkQueueHostLoopRegistry';
import { WorkQueueHost, type HostSweeper, type WorkQueueHostConfig, type WorkQueueHostDependencies } from '../host/WorkQueueHost';
import {
    BuildHostScenario, FakeLoop, FakeRuntime, MakeContext, MakeMessage, RecordingWorkHandler, SilentLogger,
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
            LoopRegistry: { Get: () => undefined },
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
            'email.ordered-staged': 'Running', 'email.subscriber-update': 'Running', 'integration.apply': 'Running',
            'integration.audit': 'HandlerNotRegistered', 'integration.paused': 'Paused',
        });
        expect(Runtimes.map(r => [r.SubscriptionName, r.Started]).sort()).toEqual([
            ['email.ordered-staged', 1], ['email.subscriber-update', 1], ['integration.apply', 1],
        ]);
        expect(Host.IsStarted).toBe(true);
        expect(WorkQueueHost.Active).toBe(Host);
        expect(ShutdownRegistry.Instance.List()).toContain(Host);
    });

    it('opens staged subscriptions on the Database driver and passes the runtime options', async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        expect(scenario.DatabaseDriver.OpenedBindings.map(b => b.Policy.SubscriptionName).sort()).toEqual(['email.ordered-staged', 'integration.apply']);
        expect(scenario.AwsDriver.OpenedBindings.map(b => b.Policy.SubscriptionName)).toEqual(['email.subscriber-update']);
        expect(runtimeFor(Runtimes, 'integration.apply').Args.Options).toEqual({
            Concurrency: 2, ReceiveBatchSize: 2, IdlePollMinMs: 100, IdlePollMaxMs: 1000, ShutdownDrainMs: 500,
        });
    });

    it('binds each delivery to the context user and a freshly sourced provider', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes, ProviderCalls } = makeHost(Engine);
        await Host.Start();
        const handler = runtimeFor(Runtimes, 'integration.apply').Args.HandlerFactory();
        expect(await handler.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'Complete' });
        expect(RecordingWorkHandler.LastBoundUserID).toBe(TEST_USER.ID);
        expect(ProviderCalls()).toBe(1);
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
});

describe('WorkQueueHost kicks', () => {
    it('kicks a subscription by name and every runtime of a published topic', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        Host.Kick('EMAIL.SUBSCRIBER-UPDATE');
        Engine.EmitPublished('Email.Events');
        expect(runtimeFor(Runtimes, 'email.subscriber-update').Kicks).toBe(2);
        expect(runtimeFor(Runtimes, 'email.ordered-staged').Kicks).toBe(1);
        expect(runtimeFor(Runtimes, 'integration.apply').Kicks).toBe(0);
    });
});

describe('WorkQueueHost reconcile', () => {
    it('stops paused subscriptions and starts newly active ones', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        Object.assign(Engine.Subscription('integration.apply'), { Status: 'Paused' });
        Object.assign(Engine.Subscription('integration.paused'), { Status: 'Active' });
        await Host.Reconcile();
        expect(runtimeFor(Runtimes, 'integration.apply').Stopped).toBe(1);
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
        expect(Runtimes).toHaveLength(4);
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

describe('WorkQueueHost auxiliary loops', () => {
    it('creates loops from the registry for the topic transport, lets them kick the consumer, and stops them on shutdown', async () => {
        const { Engine } = BuildHostScenario();
        const contexts: HostLoopContext[] = [];
        const loops: FakeLoop[] = [];
        const factory: HostLoopFactory = async context => {
            contexts.push(context);
            const loop = new FakeLoop(`stager:${context.Subscription.Name}`);
            loops.push(loop);
            return [loop];
        };
        const { Host, Runtimes } = makeHost(Engine, {}, { LoopRegistry: { Get: driverClass => (driverClass === 'AWS' ? factory : undefined) } });
        await Host.Start();
        expect(contexts.map(c => [c.Subscription.Name, c.StagedToDatabase]).sort()).toEqual([
            ['email.ordered-staged', true], ['email.subscriber-update', false],
        ]);
        expect(loops.every(l => l.Started === 1)).toBe(true);
        contexts.find(c => c.StagedToDatabase)?.KickConsumer();
        expect(runtimeFor(Runtimes, 'email.ordered-staged').Kicks).toBe(1);
        await Host.Shutdown();
        expect(loops.every(l => l.Stopped === 1)).toBe(true);
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

    it('shuts down once, stops every runtime, clears Active and unregisters', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        await Host.Shutdown();
        await Host.Shutdown();
        expect(Runtimes.every(r => r.Stopped === 1)).toBe(true);
        expect(WorkQueueHost.Active).toBeNull();
        expect(ShutdownRegistry.Instance.List()).not.toContain(Host);
        expect(Engine.ListenerCount).toBe(0);
        expect(Host.IsStarted).toBe(false);
        expect(Host.GetHealth().Subscriptions.find(s => s.Name === 'integration.apply')).toMatchObject({ State: 'Paused', Reason: 'Host is shut down' });
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
import { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import { BoundWorkHandler, type WorkHandlerResolver, type WorkQueueProviderSource } from '../handlers/BoundWorkHandler';
import { ResolveWorkHandler } from '../handlers/ResolveWorkHandler';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import {
    PlanHostedSubscriptions,
    type HostedSubscriptionPlan, type HostedSubscriptionState, type RunnableSubscriptionPlan, type WorkQueueHostEngine,
} from './HostedSubscriptionPlanner';
import { WorkQueueHostLoopRegistry, type IHostLoop } from './WorkQueueHostLoopRegistry';
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
    LoopRegistry?: Pick<WorkQueueHostLoopRegistry, 'Get'>;
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
    Loops: IHostLoop[];
}

type IntervalHandle = ReturnType<typeof setInterval>;

/**
 * Runs this instance's share of work-queue subscriptions. Every claim is atomic against shared state, so any
 * number of hosts may run the same subscription; each host only decides what IT runs.
 */
export class WorkQueueHost implements IShutdownable {
    private static active: WorkQueueHost | null = null;

    private readonly running = new Map<string, RunningSubscription>();
    private readonly createRuntime: (args: HostRuntimeArgs) => HostRuntime;
    private readonly resolveHandler: WorkHandlerResolver;
    private readonly loopRegistry: Pick<WorkQueueHostLoopRegistry, 'Get'>;
    private states: HostedState[] = [];
    private started = false;
    private shuttingDown = false;
    private reconciling: Promise<void> | null = null;
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
        this.loopRegistry = dependencies.LoopRegistry ?? WorkQueueHostLoopRegistry.Instance;
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
        this.shuttingDown = false;
        ShutdownRegistry.Instance.Register(this);
        WorkQueueHost.active = this;
        await this.Reconcile();
        this.unsubscribePublished = this.engine.OnPublished(topicName => this.kickTopic(topicName));
        this.startTimers();
        const runningCount = this.states.filter(s => s.State === 'Running').length;
        this.log.Info(`Host ${this.config.InstanceID} started`, { Running: runningCount, NotRunning: this.states.length - runningCount });
    }

    public Reconcile(): Promise<void> {
        if (!this.started || this.shuttingDown) {
            return Promise.resolve();
        }
        if (!this.reconciling) {
            this.reconciling = this.reconcileNow().finally(() => {
                this.reconciling = null;
            });
        }
        return this.reconciling;
    }

    public async RunSweeperOnce(): Promise<Record<string, number>> {
        try {
            this.sweeper ??= this.newSweeper();
            return await this.sweeper.RunOnce();
        } catch (error) {
            this.log.Error('Sweeper pass failed', asError(error));
            return {};
        }
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

    public async Shutdown(): Promise<void> {
        if (!this.started || this.shuttingDown) {
            return;
        }
        this.shuttingDown = true;
        this.stopTimers();
        this.unsubscribePublished?.();
        this.unsubscribePublished = null;
        if (this.reconciling) {
            await this.reconciling;
        }
        const entries = [...this.running.values()];
        this.running.clear();
        await Promise.all(entries.map(entry => this.stopEntry(entry)));
        this.states = this.states.map(s => (s.State === 'Running' ? { Name: s.Name, State: 'Paused', Reason: 'Host is shut down' } : s));
        this.started = false;
        if (WorkQueueHost.active === this) {
            WorkQueueHost.active = null;
        }
        ShutdownRegistry.Instance.Unregister(this);
    }

    private async reconcileNow(): Promise<void> {
        let plans: HostedSubscriptionPlan[];
        try {
            plans = await PlanHostedSubscriptions(this.config.Subscriptions, this.engine, this.resolveHandler);
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
        const runtime = this.createRuntime({
            Consumer: plan.ConsumerDriver.OpenConsumer(plan.Binding),
            HandlerFactory: () => new BoundWorkHandler(plan.HandlerKey, this.contextUser, this.dependencies.ProviderSource, this.resolveHandler),
            Policy: plan.Binding.Policy,
            Options: {
                Concurrency: plan.Concurrency, ReceiveBatchSize: plan.Concurrency, IdlePollMinMs: this.config.IdlePollMinMs,
                IdlePollMaxMs: this.config.IdlePollMaxMs, ShutdownDrainMs: this.config.ShutdownDrainMs,
            },
            Log: this.log,
        });
        const loops = await this.createLoops(plan, runtime);
        runtime.Start();
        for (const loop of loops) {
            loop.Start();
        }
        return { Plan: plan, Runtime: runtime, Loops: loops };
    }

    private async createLoops(plan: RunnableSubscriptionPlan, runtime: HostRuntime): Promise<IHostLoop[]> {
        const factory = this.loopRegistry.Get(plan.Transport.DriverClass);
        if (!factory) {
            return [];
        }
        return factory({
            InstanceID: this.config.InstanceID, Subscription: plan.Subscription, Topic: plan.Topic, Transport: plan.Transport,
            Binding: plan.Binding, StagedToDatabase: plan.StagedToDatabase, ContextUser: this.contextUser,
            Executor: this.executor, Log: this.log, KickConsumer: () => runtime.Kick(),
        });
    }

    private async stopEntry(entry: RunningSubscription): Promise<void> {
        const stops = [entry.Runtime.Stop(), ...entry.Loops.map(loop => loop.Stop())];
        const results = await Promise.allSettled(stops);
        for (const result of results) {
            if (result.status === 'rejected') {
                this.log.Error(`Stopping subscription '${entry.Plan.Name}' failed`, asError(result.reason));
            }
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
        if (this.dependencies.CreateSweeper) {
            return this.dependencies.CreateSweeper();
        }
        const ledger = new DeduplicationLedger(this.executor, this.contextUser);
        // Lease-expiry dead letters found by the sweeper reach the engine's OnDeadLettered listeners (plan 05, ND14/ND15).
        return new WorkQueueSweeper(this.executor, ledger, this.engine, this.contextUser, this.log, undefined,
            event => this.engine.NotifyDeadLettered?.(event));
    }
}

function key(value: string): string {
    return value.trim().toLowerCase();
}

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
```

`DeduplicationLedger` is imported from `../dedup/DeduplicationLedger` (03 §11 path). If plan 05 placed it elsewhere, fix this import only.

- [ ] **Step 5: Create a compile-only sweeper stub**

Task 4 replaces this file. Write `packages/WorkQueue/engine/src/host/WorkQueueSweeper.ts`:

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import type { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import type { WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';

export interface WorkQueueSweeperEngine {
    readonly Topics: MJWorkQueueTopicEntity[];
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
}

/** Placeholder with the final constructor shape; Task 4 supplies the implementation. */
export class WorkQueueSweeper {
    constructor(
        _executor: WorkQueueSqlExecutor,
        _ledger: Pick<DeduplicationLedger, 'PurgeExpired'>,
        _engine: WorkQueueSweeperEngine,
        _contextUser: UserInfo,
        _log: WorkLogger,
        _options?: { PurgeBatchSize: number; MaxPurgeBatchesPerRun: number },
        _notifyDeadLettered?: (event: DeadLetteredEvent) => void,
    ) {}

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
Expected: PASS — WorkQueueHost (11). The sweeper-failure test logs one `error:Sweeper pass failed` line into the `SilentLogger`; nothing prints.

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: all engine suites pass; builds.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): WorkQueueHost with reconcile, kicks, auxiliary loops and shutdown"
```

---

### Task 3b: `WorkQueueHost.RunOnce` (one-shot container mode)

**Files:**
- Modify: `packages/WorkQueue/engine/src/host/WorkQueueHost.ts`, `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueHostRunOnce.test.ts`

**Interfaces:**
- Consumes: everything Task 3 produces; `ITransportConsumer`, `ReceivedDelivery`, `SettleResult`, `WorkQueueConfigurationError`, `WorkJson` (plan 04).
- Produces:
  - `interface RunOnceOptions { MaxDeliveries?: number; IdleExitMs?: number; MaxDurationMs?: number }`
  - `type RunOnceReason = 'MaxDeliveries' | 'Idle' | 'MaxDuration' | 'Shutdown'`
  - `interface RunOnceResult { Processed: number; Reason: RunOnceReason }`
  - `WorkQueueHost.RunOnce(options?: RunOnceOptions): Promise<RunOnceResult>` (03 §11)
  - `WorkQueueHostDependencies.RunOnceTickMs?: number` (poll interval of the exit loop; default 50 ms)
  - Fakes: `ScriptedConsumer`, `MakeReceivedDelivery(id)`; `FakeTransportDriver.NextConsumer`

A container job claims a bounded amount of work and exits, so the scheduler (KEDA, ACA jobs, Kubernetes) owns
concurrency and scale-to-zero instead of a long-running host (02 §4.4a). Rules:

| Rule | Behavior |
| --- | --- |
| Budget | `MaxDeliveries` is enforced **before** the claim: the host wraps every consumer, and `Receive(max, …)` reserves from the budget and asks the driver for at most the remaining count. When the budget is spent the wrapper returns `[]` without touching the transport, so a job never claims more than it was asked to — even at `Concurrency > 1`. Unused reservations (the driver returned fewer rows than offered) go back to the budget. |
| `Processed` | Deliveries **received** by this host. Counted at claim time, so it is stable even if a handler is still settling when the budget closes. |
| Idle | With nothing in flight and no receive or settle for `IdleExitMs` (default 5,000), `RunOnce` resolves `Idle`. An empty queue therefore exits promptly instead of polling forever. |
| `MaxDurationMs` | A wall-clock cap, checked on every tick. It resolves while work may still be in flight; the drain below still runs. |
| Shutdown | An external `Shutdown()` (SIGTERM handler, `ShutdownRegistry`) resolves `Shutdown`. |
| Drain | `RunOnce` always calls `Shutdown()` in a `finally`, so it never resolves before in-flight handlers settle or hit `ShutdownDrainMs`. Released deliveries stay claimable for the next job. |
| Not re-entrant | Calling `RunOnce` on a started host, or with `MaxDeliveries < 1`, throws `WorkQueueConfigurationError`. |

Set `SweeperIntervalMs: 0` and `ReconcileIntervalMs: 0` for job hosts: a short-lived process should not sweep or
re-plan. Leave sweeping to a long-running host or a scheduled job.

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/engine/src/__tests__/runtimeFakes.ts`, merging imports:

```typescript
/** A consumer the test drives: each Receive hands back the next queued batch. */
export class ScriptedConsumer implements ITransportConsumer {
    public readonly Batches: ReceivedDelivery[][] = [];
    public readonly OfferedMax: number[] = [];
    public Settled = 0;
    public Closed = 0;

    public async Receive(max: number): Promise<ReceivedDelivery[]> {
        this.OfferedMax.push(max);
        return this.Batches.shift() ?? [];
    }

    public async ExtendLease(): Promise<'Held' | 'Lost'> {
        return 'Held';
    }

    public async Complete(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Settled++;
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
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
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
        return (this.NextConsumer as ITransportConsumer<TPayload> | null) ?? new InertConsumer<TPayload>();
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

/** One runnable subscription ('integration.apply' on the Database driver) whose consumer the test drives. */
function makeRunOnceHost(engine: FakeHostEngine, config: Partial<WorkQueueHostConfig> = {}, dependencies: Partial<WorkQueueHostDependencies> = {}): RunOnceHarness {
    const runtimes: FakeRuntime[] = [];
    const consumers: ITransportConsumer[] = [];
    const host = new WorkQueueHost(
        {
            InstanceID: 'job-host', Subscriptions: [{ Name: 'integration.apply', Concurrency: 2 }], IdlePollMinMs: 10,
            IdlePollMaxMs: 20, ShutdownDrainMs: 200, SweeperIntervalMs: 0, ReconcileIntervalMs: 0, ...config,
        },
        engine, TEST_USER, new RecordingExecutor(), new SilentLogger(),
        {
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
        },
    );
    hosts.push(host);
    return { Host: host, Runtimes: runtimes, Consumers: consumers };
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

describe('WorkQueueHost.RunOnce budget', () => {
    it('never claims more than MaxDeliveries and returns them back when the driver has fewer', async () => {
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
        expect(scripted.OfferedMax).toEqual([3, 2]);                    // the unused reservation came back
        expect(await consumer.Receive(10, 0, SIGNAL)).toEqual([]);      // spent: the transport is not touched again
        expect(scripted.OfferedMax).toEqual([3, 2]);

        expect(await run).toEqual({ Processed: 3, Reason: 'MaxDeliveries' });
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
    it('exits Idle on an empty queue without claiming anything', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);
        expect(await Host.RunOnce({ IdleExitMs: 40 })).toEqual({ Processed: 0, Reason: 'Idle' });
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

    it('exits Shutdown when another caller stops the host', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);
        const run = Host.RunOnce({ IdleExitMs: 10000 });
        await waitFor(() => Host.IsStarted, 'the host to start');
        await Host.Shutdown();
        expect(await run).toEqual({ Processed: 0, Reason: 'Shutdown' });
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
    type ConsumerRuntimeOptions, type ITransportConsumer, type ReceivedDelivery, type SettleResult,
    type SubscriptionPolicy, type WorkHandler, type WorkJson, type WorkLogger,
} from '@memberjunction/work-queue-core';
```

After `WorkQueueHostHealth`, add the one-shot types and the budget:

```typescript
export interface RunOnceOptions {
    /** Stop claiming once this many deliveries have been received. Default: unbounded. */
    MaxDeliveries?: number;
    /** Resolve when nothing is in flight and nothing was received or settled for this long. Default 5000. */
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

/** Claim budget for one-shot mode: reserved before the transport is asked, so a job never over-claims. */
class RunBudget {
    private reserved = 0;
    private received = 0;
    private lastActivityAt = Date.now();

    constructor(private readonly max: number) {}

    public Reserve(want: number): number {
        const take = Math.max(0, Math.min(want, this.max - this.reserved));
        this.reserved += take;
        return take;
    }

    public Release(unused: number): void {
        this.reserved -= unused;
    }

    public NoteReceived(count: number): void {
        this.received += count;
        this.lastActivityAt = Date.now();
    }

    public NoteActivity(): void {
        this.lastActivityAt = Date.now();
    }

    public get Received(): number {
        return this.received;
    }

    public get IsSpent(): boolean {
        return this.reserved >= this.max;
    }

    public get IdleMs(): number {
        return Date.now() - this.lastActivityAt;
    }
}

/** Wraps a transport consumer so one-shot mode can cap claims and notice activity. */
class BudgetedConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    constructor(private readonly inner: ITransportConsumer<TPayload>, private readonly budget: RunBudget) {}

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const allowed = this.budget.Reserve(max);
        if (allowed === 0) {
            return [];
        }
        const received = await this.inner.Receive(allowed, waitSeconds, signal);
        this.budget.Release(allowed - received.length);
        if (received.length > 0) {
            this.budget.NoteReceived(received.length);
        }
        return received;
    }

    public ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<'Held' | 'Lost'> {
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

`WorkProgress` joins the type-only core import (`type WorkProgress`).

Add the tick seam to `WorkQueueHostDependencies`:

```typescript
    /** Poll interval of the RunOnce exit loop. Default 50 ms. */
    RunOnceTickMs?: number;
```

Add the budget field beside the other private state:

```typescript
    private budget: RunBudget | null = null;
```

Wrap the consumer in `startEntry` — replace its `Consumer:` line with:

```typescript
            Consumer: this.wrapConsumer(plan.ConsumerDriver.OpenConsumer(plan.Binding)),
```

Add the public method after `Start()`:

```typescript
    /**
     * One-shot mode for container jobs (02 §4.4a): start, claim up to the budget, drain, resolve. The budget is
     * enforced before each claim, so a job never takes more work than the scheduler asked it to.
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
            const reason = await this.waitForRunOnceExit(budget, startedAt, options);
            this.log.Info(`Host ${this.config.InstanceID} finished a one-shot run`, { Processed: budget.Received, Reason: reason });
            return { Processed: budget.Received, Reason: reason };
        } finally {
            this.budget = null;
            await this.Shutdown();
        }
    }
```

And the two private helpers, beside `startEntry`:

```typescript
    private wrapConsumer<TPayload extends WorkJson>(consumer: ITransportConsumer<TPayload>): ITransportConsumer<TPayload> {
        return this.budget ? new BudgetedConsumer<TPayload>(consumer, this.budget) : consumer;
    }

    private async waitForRunOnceExit(budget: RunBudget, startedAt: number, options: RunOnceOptions): Promise<RunOnceReason> {
        const idleExitMs = options.IdleExitMs ?? DEFAULT_IDLE_EXIT_MS;
        const tickMs = this.dependencies.RunOnceTickMs ?? DEFAULT_RUN_ONCE_TICK_MS;
        for (;;) {
            if (!this.started || this.shuttingDown) {
                return 'Shutdown';
            }
            if (options.MaxDurationMs !== undefined && Date.now() - startedAt >= options.MaxDurationMs) {
                return 'MaxDuration';
            }
            const inFlight = this.inFlightCount();
            if (inFlight === 0 && budget.IsSpent) {
                return 'MaxDeliveries';
            }
            if (inFlight === 0 && budget.IdleMs >= idleExitMs) {
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

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueHostRunOnce WorkQueueHost`
Expected: PASS — WorkQueueHostRunOnce (6), WorkQueueHost (11).

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
- Consumes (plan 05): `WorkQueueSqlExecutor` (`src/sql/WorkQueueSqlExecutor.ts`); `CreateWorkQueueSqlBuilder(context): WorkQueueSqlBuilder` (`src/sql/CreateWorkQueueSqlBuilder.ts`) and its `Operator` statements `ExpireLeasesAll()` (**returns `ExpiredDeadLetterRow[]`**), `FlagGapStalls()`, `DiscardSkippedSequences()`, `PurgeTerminalDeliveries(batchSize)`, `PurgeOrphanMessages(batchSize)`; `ExecuteWrite(executor, statement, contextUser): Promise<number>` and `ExecuteRows<T>(executor, statement, contextUser): Promise<T[]>` (`src/sql/sqlExecution.ts`); `ExpiredDeadLetterRow` (`src/sql/rows.ts`); `DeadLetteredEvent` (`src/transports/TransportDriverDeps.ts`); `DeduplicationLedger.PurgeExpired(batchSize?: number, maxBatches?: number): Promise<number>`; test fake `RecordingExecutor` (`src/__tests__/fakes.ts`). From this plan: `WorkLogger` (plan 04); `FakeTopic`, `FakeSubscription`, `SilentLogger`, `TEST_USER`, `IDS` (runtimeFakes).
- Produces:
  - `interface WorkQueueSweeperEngine { readonly Topics: MJWorkQueueTopicEntity[]; readonly Subscriptions: MJWorkQueueSubscriptionEntity[] }`
  - `interface WorkQueueSweeperOptions { PurgeBatchSize: number; MaxPurgeBatchesPerRun: number }`, `DEFAULT_SWEEPER_OPTIONS`
  - `class WorkQueueSweeper` — `constructor(executor: WorkQueueSqlExecutor, ledger: Pick<DeduplicationLedger, 'PurgeExpired'>, engine: WorkQueueSweeperEngine, contextUser: UserInfo, log: WorkLogger, options?: WorkQueueSweeperOptions, notifyDeadLettered?: (event: DeadLetteredEvent) => void)`, `RunOnce(): Promise<Record<string, number>>` (03 §11)

The sweeper owns **scheduling and reporting only**; every statement comes from plan 05's operator builder, so the claim path and the sweeper can never disagree about lease expiry. All statements are set-based on the database clock and safe to run on every instance at once:

| Key | Plan 05 statement | Effect (03 §7) |
| --- | --- | --- |
| `ExpireLeases` | `Operator.ExpireLeasesAll()` | Expired `InFlight` → `Pending` (attempts remain), `DeadLettered` (`LeaseExpired`) or `Discarded` (a cancel was requested — 03 §7) across all subscriptions. The statement **returns the rows it dead-lettered** (ND14), so the sweeper reads rows with `ExecuteRows` rather than counting with `ExecuteWrite`, and forwards each to `notifyDeadLettered` (the engine wires this to `OnDeadLettered`, 03 §11). The reported count is the number of dead-lettered rows |
| `GapStalls` | `Operator.FlagGapStalls()` | `GapStalled = 1` past `SequenceGapAlertSeconds` |
| `SkippedSequences` | `Operator.DiscardSkippedSequences()` | Publishes for already-skipped sequences → `Discarded` |
| `PurgeRetention` | `Operator.PurgeTerminalDeliveries(n)` then `Operator.PurgeOrphanMessages(n)`, each repeated | Terminal deliveries past topic `RetentionDays`, then messages with no delivery left. Skipped when the engine has no topics. A purge repeats while a batch deletes exactly `PurgeBatchSize` rows, at most `MaxPurgeBatchesPerRun` times |
| `PurgeDeduplications` | `ledger.PurgeExpired(PurgeBatchSize, MaxPurgeBatchesPerRun)` | Expired ledger rows |

A step that throws is logged and reported as `-1`; later steps still run. A `RunOnce` that starts while another is running returns `{}`. Partition-state rows are never purged (03 §6.6).

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/engine/src/__tests__/WorkQueueSweeper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { SqlStatement } from '../sql/WorkQueueSqlExecutor';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { WorkQueueSweeper, type WorkQueueSweeperEngine } from '../host/WorkQueueSweeper';
import { RecordingExecutor } from './fakes';
import { FakeSubscription, FakeTopic, IDS, SilentLogger, TEST_USER } from './runtimeFakes';

const SWEEPER_SUBSCRIPTION = FakeSubscription({ ID: IDS.IntegrationSubscription, Name: 'integration.apply', TopicID: IDS.IntegrationTopic });

const ENGINE_WITH_TOPICS: WorkQueueSweeperEngine = {
    Topics: [FakeTopic({ ID: IDS.IntegrationTopic, Name: 'integration.batch-ready', TransportID: IDS.DatabaseTransport })],
    Subscriptions: [SWEEPER_SUBSCRIPTION],
};

const EMPTY_ENGINE: WorkQueueSweeperEngine = { Topics: [], Subscriptions: [SWEEPER_SUBSCRIPTION] };

interface LedgerCall {
    BatchSize: number | undefined;
    MaxBatches: number | undefined;
}

function ledger(result: number | Error, calls: LedgerCall[] = []): { PurgeExpired(batchSize?: number, maxBatches?: number): Promise<number> } {
    return {
        PurgeExpired: async (batchSize?: number, maxBatches?: number) => {
            calls.push({ BatchSize: batchSize, MaxBatches: maxBatches });
            if (result instanceof Error) {
                throw result;
            }
            return result;
        },
    };
}

function counted(executor: RecordingExecutor, statement: SqlStatement): string {
    return executor.Dialect.AffectedRowCountSQL(statement.SQL, 'AffectedRows');
}

describe('WorkQueueSweeper.RunOnce', () => {
    it("runs plan 05's operator statements in order and reports counts", async () => {
        const executor = new RecordingExecutor()
            .QueueRows([
                { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: 'venue-42' },
                { DeliveryID: IDS.DeliveryB, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: null },
            ])
            .QueueRows([{ AffectedRows: 1 }])
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ AffectedRows: 3 }])
            .QueueRows([{ AffectedRows: 4 }]);
        const ledgerCalls: LedgerCall[] = [];
        const events: DeadLetteredEvent[] = [];
        const sweeper = new WorkQueueSweeper(executor, ledger(5, ledgerCalls), ENGINE_WITH_TOPICS, TEST_USER, new SilentLogger(),
            { PurgeBatchSize: 10, MaxPurgeBatchesPerRun: 5 }, event => events.push(event));
        expect(await sweeper.RunOnce()).toEqual({ ExpireLeases: 2, GapStalls: 1, SkippedSequences: 0, PurgeRetention: 7, PurgeDeduplications: 5 });

        const operator = CreateWorkQueueSqlBuilder(executor).Operator;
        expect(executor.Calls.map(call => call.SQL)).toEqual([
            operator.ExpireLeasesAll().SQL,
            counted(executor, operator.FlagGapStalls()),
            counted(executor, operator.DiscardSkippedSequences()),
            counted(executor, operator.PurgeTerminalDeliveries(10)),
            counted(executor, operator.PurgeOrphanMessages(10)),
        ]);
        expect(executor.Calls.every(call => call.Options?.isMutation === true)).toBe(true);
        expect(ledgerCalls).toEqual([{ BatchSize: 10, MaxBatches: 5 }]);
    });

    it('forwards every lease-expiry dead letter to the notifier, with the subscription name resolved', async () => {
        const executor = new RecordingExecutor().QueueRows([
            { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: 'venue-42' },
            { DeliveryID: IDS.DeliveryB, SubscriptionID: IDS.UnknownSubscription, PartitionKey: null },
        ]);
        const events: DeadLetteredEvent[] = [];
        const sweeper = new WorkQueueSweeper(executor, ledger(0), EMPTY_ENGINE, TEST_USER, new SilentLogger(), undefined, event => events.push(event));
        expect((await sweeper.RunOnce()).ExpireLeases).toBe(2);
        expect(events).toEqual([
            { SubscriptionName: 'integration.apply', DeliveryID: IDS.DeliveryA, Reason: 'LeaseExpired', PartitionKey: 'venue-42' },
            { SubscriptionName: IDS.UnknownSubscription, DeliveryID: IDS.DeliveryB, Reason: 'LeaseExpired', PartitionKey: null },
        ]);
    });

    it('still reports the count when no notifier is wired', async () => {
        const executor = new RecordingExecutor().QueueRows([
            { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: null },
        ]);
        const sweeper = new WorkQueueSweeper(executor, ledger(0), EMPTY_ENGINE, TEST_USER, new SilentLogger());
        expect((await sweeper.RunOnce()).ExpireLeases).toBe(1);
    });

    it('repeats a purge while batches come back full, up to the per-run cap', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([])
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ AffectedRows: 10 }])
            .QueueRows([{ AffectedRows: 10 }])
            .QueueRows([{ AffectedRows: 0 }]);
        const sweeper = new WorkQueueSweeper(executor, ledger(0), ENGINE_WITH_TOPICS, TEST_USER, new SilentLogger(), { PurgeBatchSize: 10, MaxPurgeBatchesPerRun: 2 });
        const result = await sweeper.RunOnce();
        expect(result.PurgeRetention).toBe(20);
        expect(executor.Calls).toHaveLength(6);
    });

    it('works on PostgreSQL with the same step order', async () => {
        const executor = new RecordingExecutor('postgresql');
        const sweeper = new WorkQueueSweeper(executor, ledger(0), ENGINE_WITH_TOPICS, TEST_USER, new SilentLogger());
        await sweeper.RunOnce();
        expect(executor.Calls[0].SQL).toBe(CreateWorkQueueSqlBuilder(executor).Operator.ExpireLeasesAll().SQL);
    });

    it('skips retention when the engine has no topics', async () => {
        const executor = new RecordingExecutor();
        const sweeper = new WorkQueueSweeper(executor, ledger(0), EMPTY_ENGINE, TEST_USER, new SilentLogger());
        expect((await sweeper.RunOnce()).PurgeRetention).toBe(0);
        expect(executor.Calls).toHaveLength(3);
    });

    it('reports a failing step as -1 and still runs the rest', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('deadlock victim'));
        const log = new SilentLogger();
        const sweeper = new WorkQueueSweeper(executor, ledger(new Error('ledger down')), EMPTY_ENGINE, TEST_USER, log);
        expect(await sweeper.RunOnce()).toEqual({ ExpireLeases: -1, GapStalls: 0, SkippedSequences: 0, PurgeRetention: 0, PurgeDeduplications: -1 });
        expect(log.Lines.filter(line => line.startsWith('error:'))).toHaveLength(2);
    });

    it('returns an empty result when a pass is already running', async () => {
        let release: () => void = () => {};
        const slowLedger = { PurgeExpired: () => new Promise<number>(resolve => { release = () => resolve(0); }) };
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), slowLedger, EMPTY_ENGINE, TEST_USER, new SilentLogger());
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
Expected: FAIL — the Task 3 stub returns `{}`, so the first assertion reports `expected {} to deeply equal { ExpireLeases: 2, … }`, and `WorkQueueSweeper` takes no notifier argument yet.

- [ ] **Step 3: Replace `src/host/WorkQueueSweeper.ts`**

```typescript
import { UUIDsEqual } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import type { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import type { ExpiredDeadLetterRow } from '../sql/rows';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { ExecuteRows, ExecuteWrite } from '../sql/sqlExecution';
import type { OperatorSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';

export interface WorkQueueSweeperEngine {
    readonly Topics: MJWorkQueueTopicEntity[];
    /** Used only to name a dead-lettered delivery's subscription in the OnDeadLettered event. */
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
}

export interface WorkQueueSweeperOptions {
    PurgeBatchSize: number;
    MaxPurgeBatchesPerRun: number;
}

export const DEFAULT_SWEEPER_OPTIONS: WorkQueueSweeperOptions = { PurgeBatchSize: 1000, MaxPurgeBatchesPerRun: 20 };

/**
 * Idempotent maintenance for the Database transport and staged subscriptions. Statements come from the
 * operator SQL builder (plan 05); this class only sequences them, repeats purges and reports counts.
 */
export class WorkQueueSweeper {
    private running = false;
    private readonly operatorSql: OperatorSqlBuilder;

    constructor(
        private readonly executor: WorkQueueSqlExecutor,
        private readonly ledger: Pick<DeduplicationLedger, 'PurgeExpired'>,
        private readonly engine: WorkQueueSweeperEngine,
        private readonly contextUser: UserInfo,
        private readonly log: WorkLogger,
        private readonly options: WorkQueueSweeperOptions = DEFAULT_SWEEPER_OPTIONS,
        private readonly notifyDeadLettered?: (event: DeadLetteredEvent) => void,
    ) {
        this.operatorSql = CreateWorkQueueSqlBuilder(executor).Operator;
    }

    /** Runs one pass. Returns {} when a pass is already running; a failed step reports -1. */
    public async RunOnce(): Promise<Record<string, number>> {
        if (this.running) {
            return {};
        }
        this.running = true;
        try {
            const result: Record<string, number> = {};
            result.ExpireLeases = await this.step('ExpireLeases', () => this.expireLeases());
            result.GapStalls = await this.step('GapStalls', () => this.write(this.operatorSql.FlagGapStalls()));
            result.SkippedSequences = await this.step('SkippedSequences', () => this.write(this.operatorSql.DiscardSkippedSequences()));
            result.PurgeRetention = this.engine.Topics.length === 0 ? 0 : await this.step('PurgeRetention', () => this.purgeRetention());
            result.PurgeDeduplications = await this.step('PurgeDeduplications', () =>
                this.ledger.PurgeExpired(this.options.PurgeBatchSize, this.options.MaxPurgeBatchesPerRun));
            this.report(result);
            return result;
        } finally {
            this.running = false;
        }
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
     * ExpireLeasesAll returns the deliveries it dead-lettered (plan 05, ND14) rather than a count, so every
     * lease-expiry dead letter reaches OnDeadLettered. The reported number is how many were dead-lettered;
     * rows returned to Pending or settled as Discarded (a cancel was requested) are not counted here.
     */
    private async expireLeases(): Promise<number> {
        const expired = await ExecuteRows<ExpiredDeadLetterRow>(this.executor, this.operatorSql.ExpireLeasesAll(), this.contextUser);
        for (const row of expired) {
            this.notifyDeadLettered?.({
                SubscriptionName: this.subscriptionName(row.SubscriptionID),
                DeliveryID: row.DeliveryID,
                Reason: 'LeaseExpired',
                PartitionKey: row.PartitionKey,
            });
        }
        return expired.length;
    }

    /** Falls back to the ID when metadata has not caught up with a subscription created since the last refresh. */
    private subscriptionName(subscriptionID: string): string {
        return this.engine.Subscriptions.find(s => UUIDsEqual(s.ID, subscriptionID))?.Name ?? subscriptionID;
    }

    private async purgeRetention(): Promise<number> {
        const deliveries = await this.purgeInBatches(size => this.operatorSql.PurgeTerminalDeliveries(size));
        const messages = await this.purgeInBatches(size => this.operatorSql.PurgeOrphanMessages(size));
        return deliveries + messages;
    }

    private async purgeInBatches(build: (batchSize: number) => SqlStatement): Promise<number> {
        let total = 0;
        for (let batch = 0; batch < this.options.MaxPurgeBatchesPerRun; batch++) {
            const deleted = await this.write(build(this.options.PurgeBatchSize));
            total += deleted;
            if (deleted < this.options.PurgeBatchSize) {
                break;
            }
        }
        return total;
    }

    private write(statement: SqlStatement): Promise<number> {
        return ExecuteWrite(this.executor, statement, this.contextUser);
    }

    private report(result: Record<string, number>): void {
        const changed = Object.entries(result).filter(([, count]) => count > 0);
        if (changed.length > 0) {
            this.log.Info('Sweeper pass', Object.fromEntries(changed));
        }
    }
}
```

If plan 05 exported `OperatorSqlBuilder` or `SqlStatement` from a different module than shown, fix only these imports.

- [ ] **Step 4: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueSweeper`
Expected: PASS — WorkQueueSweeper (8).

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: all engine suites pass (including WorkQueueHost (11)); builds.

- [ ] **Step 5: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): sweeper sequencing lease expiry, gap stalls, skipped sequences and retention"
```

---

### Task 5: Remote-operation metadata

**Files:**
- Create: `metadata/remote-operation-categories/.work-queue-category.json`, `metadata/remote-operations/.work-queue-operations.json`
- Create: 16 type files in `metadata/remote-operations/types/`: `work-queue-get-subscription-stats`, `work-queue-list-dead-letters`, `work-queue-list-partitions`, `work-queue-replay-dead-letter`, `work-queue-discard-delivery`, `work-queue-skip-sequence`, `work-queue-get-backlog`, `work-queue-validate-bindings` — each `.input.ts` and `.output.ts`
- Regenerate (CodeGen): `packages/MJCoreEntities/src/generated/remote_operations.ts`

**Interfaces:**
- Consumes: scopes `workqueue:read` and `workqueue:operate` (plan 05 metadata); the `MJ: Remote Operations` / `MJ: Remote Operation Categories` metadata conventions already used by `metadata/remote-operations/.remote-operations.json`.
- Produces (CodeGen, exported from `@memberjunction/core-entities`):
  - Bases: `WorkQueueGetSubscriptionStatsOperation`, `WorkQueueListDeadLettersOperation`, `WorkQueueListPartitionsOperation`, `WorkQueueReplayDeadLetterOperation`, `WorkQueueDiscardDeliveryOperation`, `WorkQueueSkipSequenceOperation`, `WorkQueueGetBacklogOperation`, `WorkQueueValidateBindingsOperation`
  - Types: each `…Input` / `…Output`, plus `WorkQueueSubscriptionStatsRow`, `WorkQueueStatsFailureRow`, `WorkQueuePayloadRefRow`, `WorkQueueDeadLetterMessageRow`, `WorkQueueDeadLetterRow`, `WorkQueuePartitionStateRow`, `WorkQueueBindingIssueRow`

I/O conventions (03 §8): top-level input and output fields are camelCase, matching `RecordProcess.*` operations; row objects mirror the core contract's PascalCase records field for field so the service can copy them without renaming. Dead-letter rows carry `PayloadJSON` (the inline payload serialized) instead of a recursive JSON type — see "Contract deltas".

- [ ] **Step 1: Write the category metadata**

`metadata/remote-operation-categories/.work-queue-category.json`:

```json
[
  {
    "fields": {
      "Name": "Work Queue",
      "Description": "Operator actions over the durable work queue: subscription stats, dead letters, replay and discard, partition conditions, sequence skips and cloud binding validation.",
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
      "Description": "Pages through one subscription's partition keys that are in flight, blocked by a dead-lettered head, awaiting a missing sequence or gap-stalled, optionally filtered to one condition. Implemented by WorkQueueListPartitionsServerOperation in @memberjunction/work-queue-engine.",
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
      "Description": "Resolves one delivery without processing it, with a required reason. A pending or dead-lettered delivery becomes Discarded immediately; discarding a dead-lettered Ordered head unblocks its key. An in-flight delivery is cancelled instead: its lease is revoked so the running handler stops, and it settles as Discarded when the lease expires (cancelRequested = true). Implemented by WorkQueueDiscardDeliveryServerOperation in @memberjunction/work-queue-engine.",
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
      "Description": "Returns the autoscaler metric for one subscription: claimable pending deliveries (partition rules applied) plus in-flight deliveries. Both counts matter — schedulers such as KEDA subtract running executions from the metric, so a pending-only count starves the queue. Implemented by WorkQueueGetBacklogServerOperation in @memberjunction/work-queue-engine.",
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
      "Name": "Skip Work Queue Sequence",
      "OperationKey": "WorkQueue.SkipSequence",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Declares one missing sequence number of an ExplicitSequence partition key permanently absent, with a required reason, so the next sequence can be delivered. Implemented by WorkQueueSkipSequenceServerOperation in @memberjunction/work-queue-engine.",
      "InputTypeName": "WorkQueueSkipSequenceInput",
      "InputTypeDefinition": "@file:types/work-queue-skip-sequence.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueSkipSequenceOutput",
      "OutputTypeDefinition": "@file:types/work-queue-skip-sequence.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:operate",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "18EC57C1-22B9-4727-A9CC-532F31FCE5EF" }
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
    /** Null when unknown (for example AWS without CloudWatch read access). */
    OldestPendingAgeSeconds: number | null;
    /** Null unless the transport keeps completed rows. */
    CompletedLastHour: number | null;
    /** ISO 8601 time the counts were read. */
    AsOf: string;
}

/** A subscription whose stats could not be read. */
export interface WorkQueueStatsFailureRow {
    SubscriptionName: string;
    Error: string;
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
    /** 1–100; default 50. */
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
    Sequence?: number;
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
    /** Database/staged: MJ: Work Queue Deliveries ID. AWS: the envelope MessageID. */
    DeliveryID: string;
    Message: WorkQueueDeadLetterMessageRow;
    PartitionKey: string | null;
    Attempts: number;
    /** Handler reason, MaxAttemptsExceeded, LeaseExpired, HandlerNotRegistered, RedrivePolicy, … */
    Reason: string;
    LastError: string | null;
    DeadLetteredAt: string | null;
    /** True when this delivery is the dead-lettered head of an Ordered key. */
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
    condition?: 'Idle' | 'InFlight' | 'Blocked' | 'AwaitingSequence' | 'GapStalled';
    /** The nextCursor of a previous page. Omit for the first page. */
    cursor?: string;
    /** 1–100; default 50. */
    pageSize?: number;
}
```

```typescript
// metadata/remote-operations/types/work-queue-list-partitions.output.ts
/** One partition key's derived condition. */
export interface WorkQueuePartitionStateRow {
    PartitionKey: string;
    Condition: 'Idle' | 'InFlight' | 'Blocked' | 'AwaitingSequence' | 'GapStalled';
    /** The head delivery: in flight, or dead-lettered when Blocked. */
    HeadDeliveryID: string | null;
    /** ExplicitSequence keys only. */
    LastCompletedSequence: number | null;
    AwaitingSequenceSince: string | null;
    /** Deliveries waiting behind the head. */
    WaitingItems: number;
}

/** Output of `WorkQueue.ListPartitions`. */
export interface WorkQueueListPartitionsOutput {
    /** False when the subscription's transport has no partition state; items is then empty. */
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
    /** Optional operator note stored with the resolution. */
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
    /** A pending or dead-lettered delivery. */
    deliveryID: string;
    /** Why the work is being dropped. Required. */
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
     * True when the delivery was in flight: its lease is revoked, the running handler's next heartbeat resolves
     * false, and the row settles as Discarded once the lease expires (03 §7).
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
    /** False when the subscription's transport cannot report a backlog (for example AWS without staging). */
    supported: boolean;
    /** Pending deliveries that a worker could claim right now (partition rules applied). */
    claimable: number;
    /** Deliveries currently leased by a worker. */
    inFlight: number;
    /** claimable + inFlight — the value a scheduler should scale on. */
    total: number;
}
```

```typescript
// metadata/remote-operations/types/work-queue-skip-sequence.input.ts
/** Input for `WorkQueue.SkipSequence`. */
export interface WorkQueueSkipSequenceInput {
    subscriptionName: string;
    partitionKey: string;
    /** The missing sequence to declare absent: LastCompletedSequence + 1. */
    sequence: number;
    /** Why the sequence will never arrive. Required. */
    reason: string;
}
```

```typescript
// metadata/remote-operations/types/work-queue-skip-sequence.output.ts
/** Output of `WorkQueue.SkipSequence`. */
export interface WorkQueueSkipSequenceOutput {
    /** False when the subscription's transport has no sequence state. */
    supported: boolean;
    /** False when the sequence is not the next expected one, or a live delivery with it exists. */
    skipped: boolean;
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

Run: `pnpm exec mj sync push --dir=metadata --ci --dry-run`
Expected: 1 `MJ: Remote Operation Categories` create and 8 `MJ: Remote Operations` creates; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata --ci`
Run: `pnpm exec mj codegen --skipdb`

Run: `grep -oE "export class WorkQueue[A-Za-z]+Operation " packages/MJCoreEntities/src/generated/remote_operations.ts | sort`
Expected — exactly these eight lines:

```
export class WorkQueueDiscardDeliveryOperation 
export class WorkQueueGetBacklogOperation 
export class WorkQueueGetSubscriptionStatsOperation 
export class WorkQueueListDeadLettersOperation 
export class WorkQueueListPartitionsOperation 
export class WorkQueueReplayDeadLetterOperation 
export class WorkQueueSkipSequenceOperation 
export class WorkQueueValidateBindingsOperation 
```

Run: `grep -cE "export interface WorkQueue(SubscriptionStatsRow|StatsFailureRow|PayloadRefRow|DeadLetterMessageRow|DeadLetterRow|PartitionStateRow|BindingIssueRow) " packages/MJCoreEntities/src/generated/remote_operations.ts`
Expected: `7`.

Run: `cd packages/MJCoreEntities && pnpm run build`
Expected: builds.

- [ ] **Step 5: Commit**

```bash
git add metadata/remote-operation-categories/.work-queue-category.json metadata/remote-operations/.work-queue-operations.json metadata/remote-operations/types/work-queue-*.ts packages/MJCoreEntities/src/generated
git commit -m "feat(metadata): work queue operator remote operations"
```

---

### Task 6: Operator service and server operations

**Files:**
- Create: `packages/WorkQueue/engine/src/operations/WorkQueueOperatorService.ts`, `src/operations/WorkQueueOperations.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/WorkQueueOperatorService.test.ts`, `src/__tests__/WorkQueueOperations.test.ts`

**Interfaces:**
- Consumes: the Task 5 CodeGen bases and types; `ITransportOperator`, `ITransportDriver`, `OperatorResult`, `Page`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionStateRecord`, `PartitionCondition`, `BindingValidationIssue`, `SubscriptionBinding`, `TopicBinding`, `WorkQueueConfigurationError` (plan 04); `WorkQueueEngine` (plan 05); fakes from Tasks 1–3.
- Produces:
  - `interface WorkQueueOperatorEngine` — `Transports`, `Topics`, `Subscriptions`, `GetSubscriptionByName(name)`, `BuildTopicBinding(topic)`, `BuildSubscriptionBinding(subscription)`, `GetOperator(subscription)`, `GetDriver(transportID)`, `GetBacklog(subscriptionName)`, `ValidateTopology()` (structural subset of `WorkQueueEngine`)
  - `OPERATOR_DEFAULT_PAGE_SIZE = 50`, `OPERATOR_MAX_PAGE_SIZE = 100`
  - `class WorkQueueOperatorService` — `constructor(engine: WorkQueueOperatorEngine)`, `GetSubscriptionStats(input)`, `ListDeadLetters(input)`, `ListPartitions(input)`, `ReplayDeadLetter(input, user)`, `DiscardDelivery(input, user)`, `SkipSequence(input, user)`, `GetBacklog(input)`, `ValidateBindings(input)` returning the Task 5 output types
  - Server operations registered with `@RegisterClass(BaseRemotableOperation, '<key>')`: `WorkQueueGetSubscriptionStatsServerOperation`, `WorkQueueListDeadLettersServerOperation`, `WorkQueueListPartitionsServerOperation`, `WorkQueueReplayDeadLetterServerOperation`, `WorkQueueDiscardDeliveryServerOperation`, `WorkQueueSkipSequenceServerOperation`, `WorkQueueGetBacklogServerOperation`, `WorkQueueValidateBindingsServerOperation`; `LoadWorkQueueOperations(): void` tree-shaking anchor

Operation rules:

| Operation | Validation (throws `WorkQueueConfigurationError` before any transport call) | Mapping |
| --- | --- | --- |
| GetSubscriptionStats | `subscriptionName` optional; unknown name throws | Named: one row, failures `[]`, a transport error fails the operation. All: rows sorted by name; a per-subscription failure becomes a `failures` row |
| ListDeadLetters | `subscriptionName` required; `pageSize` integer 1–100 (default 50) | Operator `null` → `supported: false`; payload serialized to `PayloadJSON` |
| ListPartitions | + `condition` one of the five values | Operator `null` → `supported: false` |
| ReplayDeadLetter | `deliveryID` UUID | `{ Supported: false }` → `supported: false, replayed: false`; else `replayed = Changed`. Actor = `user.ID` |
| DiscardDelivery | `deliveryID` UUID; `reason` non-blank | `discarded = Changed`, `cancelRequested = CancelRequested === true`. An in-flight delivery is cancelled, not discarded on the spot (03 §7): both flags are true and the row settles as `Discarded` when its lease expires |
| SkipSequence | `partitionKey` non-blank; `sequence` integer ≥ 1; `reason` non-blank | same, `skipped` |
| GetBacklog | `subscriptionName` required; unknown name throws | `engine.GetBacklog(subscription.Name)` mapped field for field. Never throws for an unsupported transport — it answers `supported: false` with zeros |
| ValidateBindings | `transportName` optional; unknown name throws | None: `engine.ValidateTopology()`. Named: `driver.ValidateBindings(topicBinding, subscriptionBindings)` for each topic on that transport, sorted by topic name |

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
        Sequence: 3, Attributes: { source: 'ddx' }, Payload: { batchId: 7 }, PublishedAt: '2026-09-16T11:00:00.000Z',
    },
    PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'bad row 12',
    DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
};

const PARTITION: PartitionStateRecord = {
    PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY_ID, LastCompletedSequence: 2,
    AwaitingSequenceSince: null, WaitingItems: 3,
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

    public async SkipSequence(_binding: SubscriptionBinding, partitionKey: string, sequence: number, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        this.Calls++;
        this.LastArgs = [partitionKey, sequence, reason, actorUserID];
        return this.Result;
    }
}

class FakeOperatorEngine extends FakeHostEngine implements WorkQueueOperatorEngine {
    public readonly Operators = new Map<string, FakeOperator>();
    public TopologyIssues: BindingValidationIssue[] = [];
    public Backlog = { Supported: true, Claimable: 3, InFlight: 1, Total: 4 };

    public async GetBacklog(_subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number }> {
        return this.Backlog;
    }

    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined {
        return this.Subscriptions.find(s => s.Name.toLowerCase() === name.trim().toLowerCase());
    }

    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding {
        return { TopicName: topic.Name, OrderingMode: 'PublishOrder', IsFifo: false, MaxPayloadBytes: 262144, Config: {} };
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
            'email.dashboard', 'email.ordered-staged', 'email.subscriber-update', 'integration.apply', 'integration.paused',
        ]);
        expect(output.failures).toEqual([{ SubscriptionName: 'integration.audit', Error: 'view missing' }]);
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
                MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', PartitionKey: 'venue-42', Sequence: 3,
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

    it('rejects a page size outside 1–100 without calling the transport', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ListDeadLetters({ subscriptionName: 'integration.apply', pageSize: 101 })).rejects.toThrow(WorkQueueConfigurationError);
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

    it('reports a revoked lease when an in-flight delivery is cancelled', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('integration.apply').Result = { Supported: true, Changed: true, CancelRequested: true };
        expect(await Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: 'operator cancel' }, TEST_USER))
            .toEqual({ supported: true, discarded: true, cancelRequested: true });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([DELIVERY_ID, 'operator cancel', TEST_USER.ID]);
    });

    it('returns the autoscaler backlog and rejects an unknown subscription', async () => {
        const { Engine, Service } = scenario();
        Engine.Backlog = { Supported: true, Claimable: 7, InFlight: 2, Total: 9 };
        expect(await Service.GetBacklog({ subscriptionName: ' integration.apply ' }))
            .toEqual({ supported: true, claimable: 7, inFlight: 2, total: 9 });
        Engine.Backlog = { Supported: false, Claimable: 0, InFlight: 0, Total: 0 };
        expect(await Service.GetBacklog({ subscriptionName: 'integration.apply' }))
            .toEqual({ supported: false, claimable: 0, inFlight: 0, total: 0 });
        await expect(Service.GetBacklog({ subscriptionName: 'nope' })).rejects.toThrow("Unknown work queue subscription 'nope'");
    });

    it('validates a sequence skip and reports an unchanged skip', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.SkipSequence({ subscriptionName: 'integration.apply', partitionKey: 'venue-42', sequence: 2.5, reason: 'lost' }, TEST_USER)).rejects.toThrow('sequence must be an integer >= 1');
        await expect(Service.SkipSequence({ subscriptionName: 'integration.apply', partitionKey: '', sequence: 3, reason: 'lost' }, TEST_USER)).rejects.toThrow('partitionKey is required');
        Engine.OperatorFor('integration.apply').Result = { Supported: true, Changed: false };
        expect(await Service.SkipSequence({ subscriptionName: 'integration.apply', partitionKey: 'venue-42', sequence: 3, reason: 'lost upstream' }, TEST_USER))
            .toEqual({ supported: true, skipped: false });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual(['venue-42', 3, 'lost upstream', TEST_USER.ID]);
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

`packages/WorkQueue/engine/src/__tests__/WorkQueueOperations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    WorkQueueDiscardDeliveryServerOperation, WorkQueueGetBacklogServerOperation, WorkQueueGetSubscriptionStatsServerOperation,
    WorkQueueListDeadLettersServerOperation, WorkQueueListPartitionsServerOperation, WorkQueueReplayDeadLetterServerOperation,
    WorkQueueSkipSequenceServerOperation, WorkQueueValidateBindingsServerOperation,
} from '../operations/WorkQueueOperations';

interface DeclaredOperation {
    OperationKey: string;
    RequiredScope?: string;
    ExecutionMode: string;
}

const OPERATIONS: Array<[string, new () => DeclaredOperation, string]> = [
    ['WorkQueue.GetSubscriptionStats', WorkQueueGetSubscriptionStatsServerOperation, 'workqueue:read'],
    ['WorkQueue.ListDeadLetters', WorkQueueListDeadLettersServerOperation, 'workqueue:read'],
    ['WorkQueue.ListPartitions', WorkQueueListPartitionsServerOperation, 'workqueue:read'],
    ['WorkQueue.ReplayDeadLetter', WorkQueueReplayDeadLetterServerOperation, 'workqueue:operate'],
    ['WorkQueue.DiscardDelivery', WorkQueueDiscardDeliveryServerOperation, 'workqueue:operate'],
    ['WorkQueue.SkipSequence', WorkQueueSkipSequenceServerOperation, 'workqueue:operate'],
    ['WorkQueue.GetBacklog', WorkQueueGetBacklogServerOperation, 'workqueue:read'],
    ['WorkQueue.ValidateBindings', WorkQueueValidateBindingsServerOperation, 'workqueue:read'],
];

describe('work queue remote operations', () => {
    it('register each server implementation under its operation key', () => {
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueOperatorService WorkQueueOperations`
Expected: FAIL — unresolved imports `../operations/WorkQueueOperatorService` and `../operations/WorkQueueOperations`.

- [ ] **Step 3: Write `src/operations/WorkQueueOperatorService.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type {
    MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity,
    WorkQueueBindingIssueRow, WorkQueueDeadLetterRow, WorkQueueDiscardDeliveryInput, WorkQueueDiscardDeliveryOutput,
    WorkQueueGetBacklogInput, WorkQueueGetBacklogOutput,
    WorkQueueGetSubscriptionStatsInput, WorkQueueGetSubscriptionStatsOutput, WorkQueueListDeadLettersInput,
    WorkQueueListDeadLettersOutput, WorkQueueListPartitionsInput, WorkQueueListPartitionsOutput, WorkQueuePartitionStateRow,
    WorkQueueReplayDeadLetterInput, WorkQueueReplayDeadLetterOutput, WorkQueueSkipSequenceInput, WorkQueueSkipSequenceOutput,
    WorkQueueSubscriptionStatsRow, WorkQueueValidateBindingsInput, WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    WorkQueueConfigurationError,
    type BindingValidationIssue, type DeadLetterRecord, type ITransportDriver, type ITransportOperator, type OperatorResult,
    type PartitionCondition, type PartitionStateRecord, type SubscriptionBinding, type SubscriptionStats, type TopicBinding,
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
    /** Autoscaler metric (03 §11): claimable pending + in flight. */
    GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number }>;
    ValidateTopology(): Promise<BindingValidationIssue[]>;
}

export const OPERATOR_DEFAULT_PAGE_SIZE = 50;
export const OPERATOR_MAX_PAGE_SIZE = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTITION_CONDITIONS: readonly PartitionCondition[] = ['Idle', 'InFlight', 'Blocked', 'AwaitingSequence', 'GapStalled'];

/**
 * Validates operator input and maps between the transport contract (03 §5.2) and the Remote Operation I/O
 * types (03 §8). Every validation failure throws before any transport call.
 */
export class WorkQueueOperatorService {
    constructor(private readonly engine: WorkQueueOperatorEngine) {}

    public async GetSubscriptionStats(input: WorkQueueGetSubscriptionStatsInput): Promise<WorkQueueGetSubscriptionStatsOutput> {
        const name = optionalText(input.subscriptionName);
        if (name) {
            return { subscriptions: [toStatsRow(await this.stats(this.requireSubscription(name)))], failures: [] };
        }
        const output: WorkQueueGetSubscriptionStatsOutput = { subscriptions: [], failures: [] };
        for (const subscription of [...this.engine.Subscriptions].sort(byName)) {
            try {
                output.subscriptions.push(toStatsRow(await this.stats(subscription)));
            } catch (error) {
                output.failures.push({ SubscriptionName: subscription.Name, Error: describe(error) });
            }
        }
        return output;
    }

    public async ListDeadLetters(input: WorkQueueListDeadLettersInput): Promise<WorkQueueListDeadLettersOutput> {
        const subscription = this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName'));
        const pageSize = requirePageSize(input.pageSize);
        const operator = await this.engine.GetOperator(subscription);
        const page = await operator.ListDeadLetters(this.binding(subscription), optionalText(input.cursor), pageSize);
        return page
            ? { supported: true, items: page.Items.map(toDeadLetterRow), nextCursor: page.NextCursor }
            : { supported: false, items: [], nextCursor: null };
    }

    public async ListPartitions(input: WorkQueueListPartitionsInput): Promise<WorkQueueListPartitionsOutput> {
        const subscription = this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName'));
        const condition = requireCondition(input.condition);
        const pageSize = requirePageSize(input.pageSize);
        const operator = await this.engine.GetOperator(subscription);
        const page = await operator.ListPartitions(this.binding(subscription), condition, optionalText(input.cursor), pageSize);
        return page
            ? { supported: true, items: page.Items.map(toPartitionRow), nextCursor: page.NextCursor }
            : { supported: false, items: [], nextCursor: null };
    }

    public async ReplayDeadLetter(input: WorkQueueReplayDeadLetterInput, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        const subscription = this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName'));
        const deliveryID = requireUUID(input.deliveryID, 'deliveryID');
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.Replay(this.binding(subscription), deliveryID, user.ID, optionalText(input.note));
        return { supported: result.Supported, replayed: changed(result) };
    }

    public async DiscardDelivery(input: WorkQueueDiscardDeliveryInput, user: UserInfo): Promise<WorkQueueDiscardDeliveryOutput> {
        const subscription = this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName'));
        const deliveryID = requireUUID(input.deliveryID, 'deliveryID');
        const reason = requireText(input.reason, 'reason');
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.Discard(this.binding(subscription), deliveryID, reason, user.ID);
        return { supported: result.Supported, discarded: changed(result), cancelRequested: cancelRequested(result) };
    }

    /**
     * The autoscaler metric. Both numbers matter: schedulers subtract running executions from the metric, so a
     * claimable-only count scales to zero while work is still in flight and starves the queue (02 §4.4a).
     */
    public async GetBacklog(input: WorkQueueGetBacklogInput): Promise<WorkQueueGetBacklogOutput> {
        const subscription = this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName'));
        const backlog = await this.engine.GetBacklog(subscription.Name);
        return { supported: backlog.Supported, claimable: backlog.Claimable, inFlight: backlog.InFlight, total: backlog.Total };
    }

    public async SkipSequence(input: WorkQueueSkipSequenceInput, user: UserInfo): Promise<WorkQueueSkipSequenceOutput> {
        const subscription = this.requireSubscription(requireText(input.subscriptionName, 'subscriptionName'));
        const partitionKey = requireText(input.partitionKey, 'partitionKey');
        const sequence = requireSequence(input.sequence);
        const reason = requireText(input.reason, 'reason');
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.SkipSequence(this.binding(subscription), partitionKey, sequence, reason, user.ID);
        return { supported: result.Supported, skipped: changed(result) };
    }

    public async ValidateBindings(input: WorkQueueValidateBindingsInput): Promise<WorkQueueValidateBindingsOutput> {
        const transportName = optionalText(input.transportName);
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
            MessageID: message.MessageID, Topic: message.Topic, PartitionKey: message.PartitionKey, Sequence: message.Sequence,
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
        LastCompletedSequence: record.LastCompletedSequence, AwaitingSequenceSince: record.AwaitingSequenceSince,
        WaitingItems: record.WaitingItems,
    };
}

function toIssueRow(issue: BindingValidationIssue): WorkQueueBindingIssueRow {
    return { Severity: issue.Severity, Subject: issue.Subject, Message: issue.Message };
}

function changed(result: OperatorResult): boolean {
    return result.Supported ? result.Changed : false;
}

/** True when the operator revoked a running handler's lease instead of settling the row (03 §7). */
function cancelRequested(result: OperatorResult): boolean {
    return result.Supported ? result.CancelRequested === true : false;
}

function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function requireText(value: unknown, field: string): string {
    const text = optionalText(value);
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

function requireSequence(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new WorkQueueConfigurationError('sequence must be an integer >= 1');
    }
    return value;
}

function requireCondition(value: unknown): PartitionCondition | null {
    const text = optionalText(value);
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

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Write `src/operations/WorkQueueOperations.ts`**

```typescript
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueGetSubscriptionStatsOperation,
    WorkQueueListDeadLettersOperation,
    WorkQueueListPartitionsOperation, WorkQueueReplayDeadLetterOperation, WorkQueueSkipSequenceOperation,
    WorkQueueValidateBindingsOperation,
    type WorkQueueGetBacklogInput, type WorkQueueGetBacklogOutput,
    type WorkQueueDiscardDeliveryInput, type WorkQueueDiscardDeliveryOutput, type WorkQueueGetSubscriptionStatsInput,
    type WorkQueueGetSubscriptionStatsOutput, type WorkQueueListDeadLettersInput, type WorkQueueListDeadLettersOutput,
    type WorkQueueListPartitionsInput, type WorkQueueListPartitionsOutput, type WorkQueueReplayDeadLetterInput,
    type WorkQueueReplayDeadLetterOutput, type WorkQueueSkipSequenceInput, type WorkQueueSkipSequenceOutput,
    type WorkQueueValidateBindingsInput, type WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { WorkQueueEngine } from '../WorkQueueEngine';
import { WorkQueueOperatorService } from './WorkQueueOperatorService';

/** An operator service over WorkQueueEngine, configured with the invoking provider and user. */
async function serviceFor(provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueOperatorService> {
    await WorkQueueEngine.Instance.Config(false, user, provider);
    return new WorkQueueOperatorService(WorkQueueEngine.Instance);
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetSubscriptionStats')
export class WorkQueueGetSubscriptionStatsServerOperation extends WorkQueueGetSubscriptionStatsOperation {
    protected async InternalExecute(input: WorkQueueGetSubscriptionStatsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetSubscriptionStatsOutput> {
        return (await serviceFor(provider, user)).GetSubscriptionStats(input ?? {});
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListDeadLetters')
export class WorkQueueListDeadLettersServerOperation extends WorkQueueListDeadLettersOperation {
    protected async InternalExecute(input: WorkQueueListDeadLettersInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListDeadLettersOutput> {
        return (await serviceFor(provider, user)).ListDeadLetters(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListPartitions')
export class WorkQueueListPartitionsServerOperation extends WorkQueueListPartitionsOperation {
    protected async InternalExecute(input: WorkQueueListPartitionsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListPartitionsOutput> {
        return (await serviceFor(provider, user)).ListPartitions(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ReplayDeadLetter')
export class WorkQueueReplayDeadLetterServerOperation extends WorkQueueReplayDeadLetterOperation {
    protected async InternalExecute(input: WorkQueueReplayDeadLetterInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        return (await serviceFor(provider, user)).ReplayDeadLetter(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.DiscardDelivery')
export class WorkQueueDiscardDeliveryServerOperation extends WorkQueueDiscardDeliveryOperation {
    protected async InternalExecute(input: WorkQueueDiscardDeliveryInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueDiscardDeliveryOutput> {
        return (await serviceFor(provider, user)).DiscardDelivery(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.SkipSequence')
export class WorkQueueSkipSequenceServerOperation extends WorkQueueSkipSequenceOperation {
    protected async InternalExecute(input: WorkQueueSkipSequenceInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueSkipSequenceOutput> {
        return (await serviceFor(provider, user)).SkipSequence(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetBacklog')
export class WorkQueueGetBacklogServerOperation extends WorkQueueGetBacklogOperation {
    protected async InternalExecute(input: WorkQueueGetBacklogInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetBacklogOutput> {
        return (await serviceFor(provider, user)).GetBacklog(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ValidateBindings')
export class WorkQueueValidateBindingsServerOperation extends WorkQueueValidateBindingsOperation {
    protected async InternalExecute(input: WorkQueueValidateBindingsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueValidateBindingsOutput> {
        return (await serviceFor(provider, user)).ValidateBindings(input ?? {});
    }
}

/** Tree-shaking anchor for hosts that import the engine without a generated manifest. */
export function LoadWorkQueueOperations(): void {
    // intentionally empty
}
```

- [ ] **Step 5: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './operations/WorkQueueOperatorService';
export * from './operations/WorkQueueOperations';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test WorkQueueOperatorService WorkQueueOperations`
Expected: PASS — WorkQueueOperatorService (13), WorkQueueOperations (2).

Run: `cd packages/WorkQueue/engine && pnpm test && pnpm run build`
Expected: all suites pass; builds. A type error saying `WorkQueueEngine` is not assignable to `WorkQueueOperatorEngine` means plan 05's engine drifted from 03 §11 — fix the engine, not this interface.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): operator service and remote operations for stats, dead letters, partitions and bindings"
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
  systemUserEmail: 'system@memberjunction.org',
  subscriptions: [{ name: '*', concurrency: 4 }],   // '*' = every MJWorker subscription; name entries override
  idlePollMinMs: 250,
  idlePollMaxMs: 5000,
  shutdownDrainMs: 8000,                  // stays under serve()'s 10 s forced exit
  sweeperEnabled: true,
  sweeperIntervalMs: 60000,
  reconcileIntervalMs: 30000,             // 0 = only plan at startup
}
```

Startup rules:

| Condition | Result |
| --- | --- |
| `workQueue.enabled` false | Nothing starts (publishing still works — plan 05 / Task 9) |
| `MJ_DISABLE_WORK_QUEUE_HOST=1` | Logged; nothing starts. Used by integration runs whose bundles drive their own hosts, mirroring `MJ_DISABLE_TASK_GRAPH_DISPATCHER` |
| System user missing | Throws; `serve()` logs `❌ Failed to start the work queue host` and keeps serving |
| Otherwise | `WorkQueueEngine.Instance.Config(false, user, provider)`, then a `WorkQueueHost` with instance ID `<HOSTNAME or os.hostname()>-<pid>-<8 hex>` (unique even when containers share pid 1), started after `listen()`. Per-delivery providers come from `TaskGraphProviderFactory` on SQL Server; PostgreSQL hosts share the server provider until PG per-request providers are lifted out of `context.ts` |

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
import { LogStatus, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
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
        return WorkQueueEngine.Instance;
    },
    CreateHost: (config, engine, user, provider, providerSource) =>
        new WorkQueueHost(config, engine, user, provider, new MJWorkLogger(), { ProviderSource: providerSource }),
};

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
        throw new Error(`[WorkQueue] System user not found with email: ${config.systemUserEmail}`);
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
  // re-plans on a timer, and self-registers with ShutdownRegistry so the drain below stops it.
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
Expected: PASS — WorkQueueHostService (10).

Run: `cd packages/MJServer && pnpm test`
Expected: PASS — no existing suite regresses.

Run: `cd packages/MJServer && pnpm run build`
Expected: builds. An error that `WorkQueueEngine` is not assignable to `WorkQueueHostEngine` means plan 05's `OnPublished` signature differs from the "Consumed surface" table — align the engine.

- [ ] **Step 9: Commit**

```bash
git add packages/MJServer/package.json packages/MJServer/src/config.ts packages/MJServer/src/index.ts packages/MJServer/src/services/workQueueConfig.ts packages/MJServer/src/services/WorkQueueHostService.ts packages/MJServer/src/__tests__/WorkQueueHostService.test.ts pnpm-lock.yaml
git commit -m "feat(server): start the work queue host after listen when workQueue.enabled is set"
```

---

### Task 8: `@memberjunction/work-queue-server` scaffold and request mapping

**Files:**
- Create: `packages/WorkQueue/server/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/publishRequests.ts`
- Test: `packages/WorkQueue/server/src/__tests__/publishRequests.test.ts`

**Interfaces:**
- Consumes: `PublishRequest`, `PublishResult`, `WorkJson`, `WorkPayloadRef` (plan 04).
- Produces:
  - `WORK_QUEUE_PUBLISH_SCOPE = 'workqueue:publish'`, `DEFAULT_WORK_QUEUE_ROOT_PATH = '/work-queue'`, `DEFAULT_MAX_BATCH = 100`, `DEFAULT_BODY_LIMIT = '30mb'`
  - `interface WorkQueueServerSettings { MaxBatch: number; BodyLimit: string }`, `ParseServerSettings(settings: Record<string, unknown>): WorkQueueServerSettings`
  - `type ParsedPublishBody`, `ParsePublishBody(body: unknown, maxBatch: number): ParsedPublishBody`
  - `interface PublishResultJson`, `interface WorkQueuePublishResponseBody`, `interface WorkQueueErrorBody`, `interface WorkQueueHttpResult { Status: number; Body: WorkQueuePublishResponseBody | WorkQueueErrorBody }`
  - `ToPublishResponseBody(results: PublishResult[]): WorkQueuePublishResponseBody`
  - `BodyErrorResult(error: unknown, bodyLimit: string): WorkQueueHttpResult`

Body rules (03 §9) — this module checks JSON **shape** only; semantic envelope rules (size, attribute format, sequence rules, UUIDs) belong to `ValidatePublishRequest` inside `PublishAs` and come back as per-item `rejected` results:

| Input | Result |
| --- | --- |
| Not an object, no `messages` array, or extra top-level keys | 400 |
| `messages` empty or longer than `MaxBatch` | 400 |
| An item with an unknown key, or a known key of the wrong JSON type | 400, naming `messages[i].<key>` |
| `payload` any JSON value; `attributes` object of strings; `payloadRef` object with a string `uri` | mapped to `PublishRequest` (camelCase → PascalCase, `deduplicationTtlSeconds` → `DeduplicationTTLSeconds`) |
| Response | `{ results: [{ messageId, status: 'accepted' \| 'duplicate' \| 'rejected', error?: { code, message, retryable } }] }` |

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
import {
    BodyErrorResult, DEFAULT_BODY_LIMIT, DEFAULT_MAX_BATCH, ParsePublishBody, ParseServerSettings, ToPublishResponseBody,
} from '../publishRequests';

describe('ParsePublishBody', () => {
    it('maps every camelCase field onto a PublishRequest', () => {
        const parsed = ParsePublishBody({
            messages: [{
                messageId: 'BBBBBBBB-2222-4222-8222-000000000001', partitionKey: 'subscriber-9', sequence: 4,
                attributes: { eventType: 'click' }, payload: { url: 'https://x', n: [1, 2] },
                correlationId: 'corr-1', deduplicationKey: 'sg:abc', deduplicationTtlSeconds: 3600,
            }, {
                payloadRef: { uri: 's3://bucket/batch-7.jsonl', contentType: 'application/jsonl', sizeBytes: 1024, checksum: 'sha256:ab' },
            }],
        }, 100);
        expect(parsed).toEqual({
            Success: true,
            Requests: [{
                MessageID: 'BBBBBBBB-2222-4222-8222-000000000001', PartitionKey: 'subscriber-9', Sequence: 4,
                Attributes: { eventType: 'click' }, Payload: { url: 'https://x', n: [1, 2] }, CorrelationID: 'corr-1',
                DeduplicationKey: 'sg:abc', DeduplicationTTLSeconds: 3600,
            }, {
                PayloadRef: { Uri: 's3://bucket/batch-7.jsonl', ContentType: 'application/jsonl', SizeBytes: 1024, Checksum: 'sha256:ab' },
            }],
        });
    });

    it('rejects a body that is not an object with a messages array, or has extra keys', () => {
        expect(ParsePublishBody([], 100)).toEqual({ Success: false, Error: 'Body must be a JSON object with a "messages" array' });
        expect(ParsePublishBody({ messages: [{}], topic: 'x' }, 100)).toEqual({ Success: false, Error: 'Unknown body properties: topic' });
    });

    it('rejects an empty batch and one over the limit', () => {
        expect(ParsePublishBody({ messages: [] }, 3)).toEqual({ Success: false, Error: '"messages" must contain between 1 and 3 items' });
        expect(ParsePublishBody({ messages: [{}, {}, {}, {}] }, 3).Success).toBe(false);
    });

    it('rejects unknown item properties, naming the index', () => {
        expect(ParsePublishBody({ messages: [{}, { payload: 1, topic: 'x' }] }, 100))
            .toEqual({ Success: false, Error: 'messages[1] has unknown properties: topic' });
    });

    it('rejects wrong JSON types for known properties', () => {
        expect(ParsePublishBody({ messages: [{ sequence: '4' }] }, 100)).toEqual({ Success: false, Error: 'messages[0].sequence must be a number' });
        expect(ParsePublishBody({ messages: [{ attributes: { n: 1 } }] }, 100)).toEqual({ Success: false, Error: 'messages[0].attributes must be an object of string values' });
        expect(ParsePublishBody({ messages: [{ payloadRef: { contentType: 'x' } }] }, 100)).toEqual({ Success: false, Error: 'messages[0].payloadRef must be an object with a string "uri"' });
        expect(ParsePublishBody({ messages: [{ correlationId: 7 }] }, 100)).toEqual({ Success: false, Error: 'messages[0].correlationId must be a string' });
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
    it('lowercases statuses and maps errors', () => {
        expect(ToPublishResponseBody([
            { MessageID: 'm-1', Status: 'Accepted' },
            { MessageID: 'm-0', Status: 'Duplicate' },
            { MessageID: 'm-3', Status: 'Rejected', Error: { Code: 'PayloadTooLarge', Message: 'too big', Retryable: false } },
        ])).toEqual({
            results: [
                { messageId: 'm-1', status: 'accepted' },
                { messageId: 'm-0', status: 'duplicate' },
                { messageId: 'm-3', status: 'rejected', error: { code: 'PayloadTooLarge', message: 'too big', retryable: false } },
            ],
        });
    });
});

describe('BodyErrorResult', () => {
    it('reports an oversized body as 413 and anything else as 400', () => {
        expect(BodyErrorResult({ status: 413, type: 'entity.too.large' }, '30mb')).toEqual({ Status: 413, Body: { error: 'Request body exceeds 30mb' } });
        expect(BodyErrorResult(new SyntaxError('Unexpected token'), '30mb')).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/WorkQueue/server && pnpm test`
Expected: FAIL — unresolved import `../publishRequests`.

- [ ] **Step 4: Write `src/publishRequests.ts`**

```typescript
import type { PublishRequest, PublishResult, WorkJson, WorkPayloadRef } from '@memberjunction/work-queue-core';

export const WORK_QUEUE_PUBLISH_SCOPE = 'workqueue:publish';
export const DEFAULT_WORK_QUEUE_ROOT_PATH = '/work-queue';
export const DEFAULT_MAX_BATCH = 100;
export const DEFAULT_BODY_LIMIT = '30mb';

export interface WorkQueueServerSettings {
    MaxBatch: number;
    BodyLimit: string;
}

export type ParsedPublishBody = { Success: true; Requests: PublishRequest[] } | { Success: false; Error: string };

export interface PublishResultJson {
    messageId: string;
    status: 'accepted' | 'duplicate' | 'rejected';
    error?: { code: string; message: string; retryable: boolean };
}

export interface WorkQueuePublishResponseBody {
    results: PublishResultJson[];
}

export interface WorkQueueErrorBody {
    error: string;
}

export interface WorkQueueHttpResult {
    Status: number;
    Body: WorkQueuePublishResponseBody | WorkQueueErrorBody;
}

type JsonRecord = Record<string, unknown>;
type Problem = string | null;

const MESSAGE_KEYS = new Set([
    'messageId', 'partitionKey', 'sequence', 'attributes', 'payload', 'payloadRef', 'correlationId', 'deduplicationKey',
    'deduplicationTtlSeconds',
]);
const PAYLOAD_REF_KEYS = new Set(['uri', 'contentType', 'sizeBytes', 'checksum']);
const MAX_JSON_DEPTH = 64;

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

/** Checks JSON shape only; envelope semantics are validated by PublishAs and returned per item. */
export function ParsePublishBody(body: unknown, maxBatch: number): ParsedPublishBody {
    if (!isRecord(body) || !Array.isArray(body.messages)) {
        return fail('Body must be a JSON object with a "messages" array');
    }
    const extra = Object.keys(body).filter(k => k !== 'messages');
    if (extra.length > 0) {
        return fail(`Unknown body properties: ${extra.join(', ')}`);
    }
    if (body.messages.length === 0 || body.messages.length > maxBatch) {
        return fail(`"messages" must contain between 1 and ${maxBatch} items`);
    }
    const requests: PublishRequest[] = [];
    for (let index = 0; index < body.messages.length; index++) {
        const parsed = parseMessage(body.messages[index], `messages[${index}]`);
        if (typeof parsed === 'string') {
            return fail(parsed);
        }
        requests.push(parsed);
    }
    return { Success: true, Requests: requests };
}

export function ToPublishResponseBody(results: PublishResult[]): WorkQueuePublishResponseBody {
    return {
        results: results.map(result => {
            const json: PublishResultJson = { messageId: result.MessageID, status: toStatus(result.Status) };
            if (result.Error) {
                json.error = { code: result.Error.Code, message: result.Error.Message, retryable: result.Error.Retryable };
            }
            return json;
        }),
    };
}

/** The HTTP answer when the JSON body parser rejects a request. */
export function BodyErrorResult(error: unknown, bodyLimit: string): WorkQueueHttpResult {
    const status = isRecord(error) ? error.status : undefined;
    return status === 413
        ? { Status: 413, Body: { error: `Request body exceeds ${bodyLimit}` } }
        : { Status: 400, Body: { error: 'Request body must be valid JSON' } };
}

function parseMessage(value: unknown, at: string): PublishRequest | string {
    if (!isRecord(value)) {
        return `${at} must be an object`;
    }
    const unknownKeys = Object.keys(value).filter(k => !MESSAGE_KEYS.has(k));
    if (unknownKeys.length > 0) {
        return `${at} has unknown properties: ${unknownKeys.join(', ')}`;
    }
    const request: PublishRequest = {};
    const problem: Problem =
        readString(value, 'messageId', at, v => { request.MessageID = v; })
        ?? readString(value, 'partitionKey', at, v => { request.PartitionKey = v; })
        ?? readNumber(value, 'sequence', at, v => { request.Sequence = v; })
        ?? readAttributes(value, at, v => { request.Attributes = v; })
        ?? readPayload(value, at, v => { request.Payload = v; })
        ?? readPayloadRef(value, at, v => { request.PayloadRef = v; })
        ?? readString(value, 'correlationId', at, v => { request.CorrelationID = v; })
        ?? readString(value, 'deduplicationKey', at, v => { request.DeduplicationKey = v; })
        ?? readNumber(value, 'deduplicationTtlSeconds', at, v => { request.DeduplicationTTLSeconds = v; });
    return problem ?? request;
}

function readString(record: JsonRecord, key: string, at: string, set: (value: string) => void): Problem {
    const value = record[key];
    if (value === undefined) {
        return null;
    }
    if (typeof value !== 'string') {
        return `${at}.${key} must be a string`;
    }
    set(value);
    return null;
}

function readNumber(record: JsonRecord, key: string, at: string, set: (value: number) => void): Problem {
    const value = record[key];
    if (value === undefined) {
        return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${at}.${key} must be a number`;
    }
    set(value);
    return null;
}

function readAttributes(record: JsonRecord, at: string, set: (value: Record<string, string>) => void): Problem {
    const value = record.attributes;
    if (value === undefined) {
        return null;
    }
    if (!isRecord(value) || !Object.values(value).every(v => typeof v === 'string')) {
        return `${at}.attributes must be an object of string values`;
    }
    const attributes: Record<string, string> = {};
    for (const [name, text] of Object.entries(value)) {
        attributes[name] = String(text);
    }
    set(attributes);
    return null;
}

function readPayload(record: JsonRecord, at: string, set: (value: WorkJson) => void): Problem {
    const value = record.payload;
    if (value === undefined) {
        return null;
    }
    if (!isWorkJson(value, 0)) {
        return `${at}.payload must be JSON`;
    }
    set(value);
    return null;
}

function readPayloadRef(record: JsonRecord, at: string, set: (value: WorkPayloadRef) => void): Problem {
    const value = record.payloadRef;
    if (value === undefined) {
        return null;
    }
    const problem = `${at}.payloadRef must be an object with a string "uri"`;
    if (!isRecord(value) || typeof value.uri !== 'string' || value.uri.trim() === '' || !Object.keys(value).every(k => PAYLOAD_REF_KEYS.has(k))) {
        return problem;
    }
    const ref: WorkPayloadRef = { Uri: value.uri };
    if (typeof value.contentType === 'string') {
        ref.ContentType = value.contentType;
    }
    if (typeof value.sizeBytes === 'number') {
        ref.SizeBytes = value.sizeBytes;
    }
    if (typeof value.checksum === 'string') {
        ref.Checksum = value.checksum;
    }
    set(ref);
    return null;
}

function isWorkJson(value: unknown, depth: number): value is WorkJson {
    if (depth > MAX_JSON_DEPTH) {
        return false;
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(item => isWorkJson(item, depth + 1));
    }
    return isRecord(value) && Object.values(value).every(item => isWorkJson(item, depth + 1));
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStatus(status: PublishResult['Status']): PublishResultJson['status'] {
    switch (status) {
        case 'Accepted':
            return 'accepted';
        case 'Duplicate':
            return 'duplicate';
        default:
            return 'rejected';
    }
}

function fail(error: string): ParsedPublishBody {
    return { Success: false, Error: error };
}
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/server && pnpm test`
Expected: PASS — publishRequests (9).

Run: `cd packages/WorkQueue/server && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/server pnpm-lock.yaml
git commit -m "feat(work-queue-server): package scaffold and publish request mapping"
```

---

### Task 9: Publish handler, scope authorizer and Server Extension

**Files:**
- Create: `packages/WorkQueue/server/src/scopeAuthorizer.ts`, `src/publishHandler.ts`, `src/router.ts`, `src/WorkQueueServerExtension.ts`
- Modify: `packages/WorkQueue/server/src/index.ts`
- Test: `packages/WorkQueue/server/src/__tests__/scopeAuthorizer.test.ts`, `src/__tests__/publishHandler.test.ts`, `src/__tests__/WorkQueueServerExtension.test.ts`

**Interfaces:**
- Consumes: Task 8 exports; `WorkQueueEngine`, `WorkQueuePublishOptions`, `MJWorkLogger` (plan 05); `WorkQueueHost` (Task 3); `PublishRequest`, `PublishResult`, `WorkJson`, `WorkLogger` (plan 04); `GetAPIKeyEngine` (`@memberjunction/api-keys` — `Authorize(apiKeyHash, applicationName, scopePath, resource, contextUser, requestContext?) → { Allowed, Reason }`); `BaseServerExtension`, `ServerExtensionConfig`, `ServerExtensionInitContext`, `ServerExtensionPhase`, `ExtensionInitResult`, `ExtensionHealthResult` (`@memberjunction/server-extensions-core`).
- Produces:
  - `interface ScopeDecision { Allowed: boolean; Reason: string }`, `interface WorkQueueScopeAuthorizer`, `WORK_QUEUE_API_APPLICATION = 'MJAPI'`, `class APIKeyScopeAuthorizer implements WorkQueueScopeAuthorizer`
  - `interface WorkQueuePublishTopic { Name: string; AllowExternalPublish: boolean }`, `interface WorkQueuePublishEngine`, `interface WorkQueuePublishHttpRequest`, `interface WorkQueuePublishDependencies`
  - `HandleWorkQueuePublish(request, dependencies): Promise<WorkQueueHttpResult>` — never throws
  - `interface WorkQueueRequestPayload { userRecord?: UserInfo; apiKeyHash?: string }`, `CreateWorkQueuePublishRouter(dependencies): Router`, `CreateDefaultPublishDependencies(settings): WorkQueuePublishDependencies`
  - `@RegisterClass(BaseServerExtension, 'WorkQueueServerExtension') class WorkQueueServerExtension` (phase `post-auth`), `NormalizeRootPath(rootPath: string | undefined): string`

`POST {RootPath}/topics/{topic}/messages` — checks run in this order, so a caller without the scope learns nothing about topics:

| Order | Condition | Response |
| --- | --- | --- |
| 1 | No authenticated user on `req.userPayload` | `401 { error }` |
| 2 | Topic segment blank or longer than 200 characters | `400 { error }` |
| 3 | API key lacks `workqueue:publish` for the topic name (session callers pass — same rule as MJServer's `CheckAPIKeyScope`) | `403 { error }` |
| 4 | Body shape invalid (Task 8) | `400 { error }` |
| 5 | Topic unknown | `404 { error }` |
| 6 | Topic `AllowExternalPublish = 0` | `403 { error }` naming `TopicNotExternallyPublishable` |
| — | Published | `202 { results }` — per-item `rejected` results are still 202 |
| — | Anything thrown | `500 { error: 'Publish failed' }`, logged |

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
import { describe, it, expect, vi } from 'vitest';

const authorize = vi.fn();
vi.mock('@memberjunction/api-keys', () => ({ GetAPIKeyEngine: () => ({ Authorize: authorize }) }));

import type { UserInfo } from '@memberjunction/core';
import { APIKeyScopeAuthorizer } from '../scopeAuthorizer';

const USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001' } as UserInfo;

describe('APIKeyScopeAuthorizer', () => {
    it('allows callers that did not authenticate with an API key, without consulting the engine', async () => {
        const decision = await new APIKeyScopeAuthorizer().Authorize(undefined, 'workqueue:publish', 'email.events', USER, { Endpoint: '/work-queue/topics/email.events/messages', Method: 'POST' });
        expect(decision).toEqual({ Allowed: true, Reason: 'Not authenticated via API key' });
        expect(authorize).not.toHaveBeenCalled();
    });

    it('delegates to the API key engine under the MJAPI application with the request context', async () => {
        authorize.mockResolvedValueOnce({ Allowed: false, Reason: 'no matching rule', EvaluatedRules: [] });
        const decision = await new APIKeyScopeAuthorizer().Authorize('hash-1', 'workqueue:publish', 'email.events', USER, { Endpoint: '/work-queue/topics/email.events/messages', Method: 'POST' });
        expect(decision).toEqual({ Allowed: false, Reason: 'no matching rule' });
        expect(authorize).toHaveBeenCalledWith('hash-1', 'MJAPI', 'workqueue:publish', 'email.events', USER, { endpoint: '/work-queue/topics/email.events/messages', method: 'POST' });
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
    public Calls: Array<[string | undefined, string, string, string]> = [];

    public async Authorize(apiKeyHash: string | undefined, scopePath: string, resource: string, _user: UserInfo, request: { Endpoint: string; Method: string }): Promise<ScopeDecision> {
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
}

function harness(): Harness {
    const authorizer = new FakeAuthorizer();
    const engine = new FakePublishEngine();
    const log = new CapturingLogger();
    let engineRequests = 0;
    return {
        Authorizer: authorizer, Engine: engine, Log: log, EngineRequests: () => engineRequests,
        Dependencies: {
            GetEngine: async () => {
                engineRequests++;
                return engine;
            },
            Authorizer: authorizer,
            Settings: { MaxBatch: 100, BodyLimit: '30mb' },
            Log: log,
        },
    };
}

function request(overrides: Partial<WorkQueuePublishHttpRequest> = {}): WorkQueuePublishHttpRequest {
    return { TopicName: 'email.events', Body: BODY, User: USER, ApiKeyHash: 'hash-1', Path: '/work-queue/topics/email.events/messages', ...overrides };
}

describe('HandleWorkQueuePublish', () => {
    it('requires an authenticated user before checking anything else', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(request({ User: undefined }), h.Dependencies)).toEqual({ Status: 401, Body: { error: 'Authentication required' } });
        expect(h.Authorizer.Calls).toHaveLength(0);
    });

    it('rejects a blank topic segment', async () => {
        const h = harness();
        expect((await HandleWorkQueuePublish(request({ TopicName: '  ' }), h.Dependencies)).Status).toBe(400);
    });

    it('checks the publish scope against the topic name before touching the engine', async () => {
        const h = harness();
        h.Authorizer.Decision = { Allowed: false, Reason: 'no matching rule' };
        const result = await HandleWorkQueuePublish(request(), h.Dependencies);
        expect(result.Status).toBe(403);
        expect(h.Authorizer.Calls).toEqual([['hash-1', 'workqueue:publish', 'email.events', '/work-queue/topics/email.events/messages']]);
        expect(h.EngineRequests()).toBe(0);
    });

    it('rejects an invalid body after the scope passes', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(request({ Body: { messages: [] } }), h.Dependencies))
            .toEqual({ Status: 400, Body: { error: '"messages" must contain between 1 and 100 items' } });
    });

    it('answers 404 for an unknown topic', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(request({ TopicName: 'nope' }), h.Dependencies)).toEqual({ Status: 404, Body: { error: "Unknown topic 'nope'" } });
    });

    it('refuses topics that do not allow external publishing', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(request({ TopicName: 'mj.internal' }), h.Dependencies);
        expect(result.Status).toBe(403);
        expect(JSON.stringify(result.Body)).toContain('TopicNotExternallyPublishable');
        expect(h.Engine.Published).toHaveLength(0);
    });

    it("publishes as an external caller under the topic's canonical name and maps the results", async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(request({ TopicName: 'EMAIL.EVENTS' }), h.Dependencies);
        expect(result).toEqual({ Status: 202, Body: { results: [{ messageId: 'm-0', status: 'accepted' }] } });
        expect(h.Engine.Published).toEqual([{
            Topic: 'email.events',
            Requests: [{ Attributes: { eventType: 'click' }, Payload: { url: 'https://x' } }],
            Options: { ContextUser: USER, External: true },
        }]);
    });

    it('answers 500 and logs when publishing throws', async () => {
        const h = harness();
        h.Engine.Error = new Error('pool exhausted');
        expect(await HandleWorkQueuePublish(request(), h.Dependencies)).toEqual({ Status: 500, Body: { error: 'Publish failed' } });
        expect(h.Log.Errors).toEqual(["REST publish to 'email.events' failed: pool exhausted"]);
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
        expect(NormalizeRootPath('  ')).toBe('/work-queue');
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

Run: `cd packages/WorkQueue/server && pnpm test scopeAuthorizer publishHandler WorkQueueServerExtension`
Expected: FAIL — unresolved imports `../scopeAuthorizer`, `../publishHandler`, `../WorkQueueServerExtension`.

- [ ] **Step 3: Write `src/scopeAuthorizer.ts`**

```typescript
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import type { UserInfo } from '@memberjunction/core';

export interface ScopeDecision {
    Allowed: boolean;
    Reason: string;
}

export interface WorkQueueScopeAuthorizer {
    Authorize(apiKeyHash: string | undefined, scopePath: string, resource: string, user: UserInfo, request: { Endpoint: string; Method: string }): Promise<ScopeDecision>;
}

/** Application whose ceiling applies to REST publishes — the same one MJServer's resolvers check against. */
export const WORK_QUEUE_API_APPLICATION = 'MJAPI';

/**
 * Scope checks through the API key engine. Callers authenticated by session rather than API key are
 * bounded by their user permissions alone, exactly as MJServer's CheckAPIKeyScope treats them.
 */
export class APIKeyScopeAuthorizer implements WorkQueueScopeAuthorizer {
    public async Authorize(apiKeyHash: string | undefined, scopePath: string, resource: string, user: UserInfo, request: { Endpoint: string; Method: string }): Promise<ScopeDecision> {
        if (!apiKeyHash) {
            return { Allowed: true, Reason: 'Not authenticated via API key' };
        }
        const result = await GetAPIKeyEngine().Authorize(apiKeyHash, WORK_QUEUE_API_APPLICATION, scopePath, resource, user, {
            endpoint: request.Endpoint,
            method: request.Method,
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
    ParsePublishBody, ToPublishResponseBody, WORK_QUEUE_PUBLISH_SCOPE,
    type WorkQueueHttpResult, type WorkQueueServerSettings,
} from './publishRequests';
import type { WorkQueueScopeAuthorizer } from './scopeAuthorizer';

const MAX_TOPIC_NAME_LENGTH = 200;

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
    Body: unknown;
    User: UserInfo | undefined;
    ApiKeyHash: string | undefined;
    Path: string;
}

export interface WorkQueuePublishDependencies {
    GetEngine(user: UserInfo): Promise<WorkQueuePublishEngine>;
    Authorizer: WorkQueueScopeAuthorizer;
    Settings: WorkQueueServerSettings;
    Log: WorkLogger;
}

/** Runs one REST publish to completion. Never throws. */
export async function HandleWorkQueuePublish(request: WorkQueuePublishHttpRequest, dependencies: WorkQueuePublishDependencies): Promise<WorkQueueHttpResult> {
    if (!request.User) {
        return { Status: 401, Body: { error: 'Authentication required' } };
    }
    const topicName = request.TopicName.trim();
    if (topicName === '' || topicName.length > MAX_TOPIC_NAME_LENGTH) {
        return { Status: 400, Body: { error: `Topic name must be 1–${MAX_TOPIC_NAME_LENGTH} characters` } };
    }
    try {
        return await publish(request, request.User, topicName, dependencies);
    } catch (error) {
        dependencies.Log.Error(`REST publish to '${topicName}' failed`, error instanceof Error ? error : new Error(String(error)));
        return { Status: 500, Body: { error: 'Publish failed' } };
    }
}

async function publish(request: WorkQueuePublishHttpRequest, user: UserInfo, topicName: string, dependencies: WorkQueuePublishDependencies): Promise<WorkQueueHttpResult> {
    const decision = await dependencies.Authorizer.Authorize(request.ApiKeyHash, WORK_QUEUE_PUBLISH_SCOPE, topicName, user, { Endpoint: request.Path, Method: 'POST' });
    if (!decision.Allowed) {
        return { Status: 403, Body: { error: `API key lacks ${WORK_QUEUE_PUBLISH_SCOPE} for '${topicName}': ${decision.Reason}` } };
    }
    const parsed = ParsePublishBody(request.Body, dependencies.Settings.MaxBatch);
    if (!parsed.Success) {
        return { Status: 400, Body: { error: parsed.Error } };
    }
    const engine = await dependencies.GetEngine(user);
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
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type { UserInfo } from '@memberjunction/core';
import { MJWorkLogger, WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { HandleWorkQueuePublish, type WorkQueuePublishDependencies } from './publishHandler';
import { BodyErrorResult, type WorkQueueServerSettings } from './publishRequests';
import { APIKeyScopeAuthorizer } from './scopeAuthorizer';

/** The fields MJServer's unified auth middleware sets on req.userPayload that this endpoint reads. */
export interface WorkQueueRequestPayload {
    userRecord?: UserInfo;
    apiKeyHash?: string;
}

export function CreateDefaultPublishDependencies(settings: WorkQueueServerSettings): WorkQueuePublishDependencies {
    return {
        GetEngine: async user => {
            await WorkQueueEngine.Instance.Config(false, user);
            return WorkQueueEngine.Instance;
        },
        Authorizer: new APIKeyScopeAuthorizer(),
        Settings: settings,
        Log: new MJWorkLogger('[WorkQueue:REST]'),
    };
}

export function CreateWorkQueuePublishRouter(dependencies: WorkQueuePublishDependencies): Router {
    const router = Router();
    router.post('/topics/:topic/messages', express.json({ limit: dependencies.Settings.BodyLimit }), async (req: Request, res: Response) => {
        const payload = (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload;
        const result = await HandleWorkQueuePublish({
            TopicName: String(req.params.topic ?? ''),
            Body: req.body,
            User: payload?.userRecord,
            ApiKeyHash: payload?.apiKeyHash,
            Path: req.originalUrl,
        }, dependencies);
        res.status(result.Status).json(result.Body);
    });
    // Only the JSON body parser can fail before the handler; answer in JSON rather than Express's HTML page.
    router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        const result = BodyErrorResult(error, dependencies.Settings.BodyLimit);
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
import { DEFAULT_WORK_QUEUE_ROOT_PATH, ParseServerSettings } from './publishRequests';
import { CreateDefaultPublishDependencies, CreateWorkQueuePublishRouter } from './router';

export function NormalizeRootPath(rootPath: string | undefined): string {
    const trimmed = (rootPath ?? '').trim().replace(/\/+$/, '');
    if (trimmed === '') {
        return DEFAULT_WORK_QUEUE_ROOT_PATH;
    }
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
Expected: PASS — publishRequests (9), scopeAuthorizer (2), publishHandler (8), WorkQueueServerExtension (4).

Run: `cd packages/WorkQueue/server && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/server/src
git commit -m "feat(work-queue-server): scoped REST publish endpoint as a post-auth Server Extension"
```

---

### Task 10: `mj queue` CLI commands

**Files:**
- Create: `packages/MJCLI/src/lib/work-queue/queue-format.ts`, `src/lib/work-queue/queue-session.ts`
- Create: `packages/MJCLI/src/commands/queue/index.ts`, `usage.ts`, `stats.ts`, `dead-letters.ts`, `partitions.ts`, `replay.ts`, `discard.ts`, `skip-sequence.ts`, `work.ts`, `export-topology.ts`, `import-bindings.ts`, `validate-bindings.ts`
- Modify: `packages/MJCLI/package.json`, `packages/MJCLI/src/utils/open-app-context.ts`, `packages/MJCLI/src/lib/domain-profiles.ts`
- Test: `packages/MJCLI/src/__tests__/work-queue-cli.test.ts`, `src/__tests__/work-queue-commands.test.ts`

**Interfaces:**
- Consumes: the Task 5 operation classes and row types (`@memberjunction/core-entities`); `WorkQueueEngine` with `ExportManifest(transportName)` and `ImportBindings(bindings, contextUser)` (plan 05, 03 §11); `WorkQueueHost`, `RunOnceResult` (Tasks 3, 3b), `SharedProviderSource` (Task 1), `MJWorkLogger` (plan 05); `BindingImport`, `WorkJson` (plan 04); `RemoteOpResult`, `DatabaseProviderBase`, `UserInfo` (`@memberjunction/core`); `initializeProvider`-backed `ensureProviderInitialized`, `buildContextUser`, `closeConnectionPool` (`src/utils/open-app-context.ts`); `DomainUsageCommand` (`src/lib/domain-usage-command.ts`); oclif `Command`, `Flags`, `Args`.
- Produces:
  - `FormatTable(headers, rows)`, `FormatStatsTable(rows, failures)`, `FormatDeadLetters(output)`, `FormatPartitions(output)`, `FormatBindingIssues(issues)`, `HasBindingErrors(issues)`, `ParseBindingImport(json)`, `RequireOperationOutput(result, operationKey)`, `ToPartitionCondition(value)`, `PARTITION_CONDITION_OPTIONS`
  - `interface WorkQueueCliSession { Provider: DatabaseProviderBase; User: UserInfo; Close(): Promise<void> }`, `OpenWorkQueueSession(): Promise<WorkQueueCliSession>`
  - Commands `mj queue stats | dead-letters | partitions | replay | discard | skip-sequence | work | export-topology | import-bindings | validate-bindings`

Command surface:

| Command | Flags / args | Calls | Exit 1 when |
| --- | --- | --- | --- |
| `stats` | `--subscription`, `--json` | `WorkQueue.GetSubscriptionStats` | the operation fails |
| `dead-letters` | `--subscription` (required), `--cursor`, `--page-size`, `--json` | `WorkQueue.ListDeadLetters` | the operation fails |
| `partitions` | `--subscription` (required), `--condition`, `--cursor`, `--page-size`, `--json` | `WorkQueue.ListPartitions` | the operation fails |
| `replay` | `--subscription`, `--delivery` (required), `--note` | `WorkQueue.ReplayDeadLetter` | unsupported or nothing replayed |
| `discard` | `--subscription`, `--delivery`, `--reason` (required) | `WorkQueue.DiscardDelivery` | unsupported or nothing discarded |
| `skip-sequence` | `--subscription`, `--key`, `--sequence`, `--reason` (required) | `WorkQueue.SkipSequence` | unsupported or nothing skipped |
| `work` | `--subscription` (required), `--once`, `--max`, `--idle-exit-ms`, `--concurrency` | `WorkQueueHost.RunOnce` (with `--once`) or `Start` until SIGINT/SIGTERM | the host cannot start (config, unknown subscription, no handler) — **never** for an empty queue |
| `export-topology` | `--transport` (required), `--output` | `WorkQueueEngine.ExportManifest` → stdout or file | the transport is unknown |
| `import-bindings` | `<file>` (required), `--json` | `WorkQueueEngine.ImportBindings` | the file is invalid or any issue is an `Error` |
| `validate-bindings` | `--transport`, `--json` | `WorkQueue.ValidateBindings` | any issue is an `Error` |

Operations run **in process** through the CLI's database provider — the same authorization gates apply as over GraphQL, with the resolved system user as the actor. None of these commands are light commands: the prerun hook loads `ServerBootstrapLite`, whose manifest registers the server operations (Task 11).

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
    summary: 'Operate the durable work queue — stats, dead letters, replay and discard, sequence gaps, cloud bindings.',
    runtime: { class: 'moderate', typicalSeconds: 15, note: 'dominated by MJ bootstrap; each operation is a few queries or cloud API calls' },
  },
```

- [ ] **Step 2: Write the failing tests**

`packages/MJCLI/src/__tests__/work-queue-cli.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkQueueDeadLetterRow, WorkQueuePartitionStateRow } from '@memberjunction/core-entities';
import {
    FormatBindingIssues, FormatDeadLetters, FormatPartitions, FormatStatsTable, FormatTable, HasBindingErrors, ParseBindingImport,
    RequireOperationOutput, ToPartitionCondition,
} from '../lib/work-queue/queue-format.js';

const DEAD_LETTER: WorkQueueDeadLetterRow = {
    DeliveryID: 'DDDDDDDD-4444-4444-8444-000000000001', PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded',
    LastError: 'bad row 12', DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
    Message: { MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', Attributes: {}, PayloadJSON: null, PublishedAt: '2026-09-16T11:00:00.000Z' },
};

const PARTITION: WorkQueuePartitionStateRow = {
    PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: 'DDDDDDDD-4444-4444-8444-000000000001',
    LastCompletedSequence: null, AwaitingSequenceSince: null, WaitingItems: 3,
};

describe('queue formatting', () => {
    it('pads table columns to the widest cell', () => {
        expect(FormatTable(['A', 'Long header'], [['wide cell', 'x']])).toBe('A          Long header\n---------  -----------\nwide cell  x');
    });

    it('renders stats with dashes for unknown values and lists failures', () => {
        const text = FormatStatsTable([{
            SubscriptionName: 'email.unsubscribe', Pending: 2, InFlight: 0, DeadLettered: 1, BlockedKeys: null,
            OldestPendingAgeSeconds: null, CompletedLastHour: 40, AsOf: '2026-09-16T12:00:00.000Z',
        }], [{ SubscriptionName: 'email.dashboard', Error: 'AccessDenied' }]);
        expect(text).toContain('email.unsubscribe  2        0          1     —             —                   40');
        expect(text).toContain('! email.dashboard: AccessDenied');
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
        expect(text).toContain('venue-42       Blocked    DDDDDDDD-4444-4444-8444-000000000001  —              —               3');
        expect(FormatPartitions({ supported: false, items: [], nextCursor: null })).toBe("This subscription's transport has no partition state.");
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
        expect(() => RequireOperationOutput({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'pageSize must be an integer between 1 and 100' }, 'WorkQueue.ListDeadLetters'))
            .toThrow('WorkQueue.ListDeadLetters failed (EXECUTION_ERROR): pageSize must be an integer between 1 and 100');
    });

    it('narrows a condition flag to the operation union', () => {
        expect(ToPartitionCondition(undefined)).toBeUndefined();
        expect(ToPartitionCondition('AwaitingSequence')).toBe('AwaitingSequence');
        expect(() => ToPartitionCondition('Stuck')).toThrow('--condition must be one of');
    });
});
```

`packages/MJCLI/src/__tests__/work-queue-commands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import QueueDeadLetters from '../commands/queue/dead-letters.js';
import QueueDiscard from '../commands/queue/discard.js';
import QueueExportTopology from '../commands/queue/export-topology.js';
import QueueImportBindings from '../commands/queue/import-bindings.js';
import QueuePartitions from '../commands/queue/partitions.js';
import QueueReplay from '../commands/queue/replay.js';
import QueueSkipSequence from '../commands/queue/skip-sequence.js';
import QueueStats from '../commands/queue/stats.js';
import QueueValidateBindings from '../commands/queue/validate-bindings.js';
import QueueWork from '../commands/queue/work.js';

interface FlagSurface {
    required?: boolean;
}

type CommandSurface = { flags: Record<string, FlagSurface> };

const COMMANDS: Array<[string, CommandSurface, string[], string[]]> = [
    ['stats', QueueStats, ['json', 'subscription'], []],
    ['dead-letters', QueueDeadLetters, ['cursor', 'json', 'page-size', 'subscription'], ['subscription']],
    ['partitions', QueuePartitions, ['condition', 'cursor', 'json', 'page-size', 'subscription'], ['subscription']],
    ['replay', QueueReplay, ['delivery', 'note', 'subscription'], ['delivery', 'subscription']],
    ['discard', QueueDiscard, ['delivery', 'reason', 'subscription'], ['delivery', 'reason', 'subscription']],
    ['skip-sequence', QueueSkipSequence, ['key', 'reason', 'sequence', 'subscription'], ['key', 'reason', 'sequence', 'subscription']],
    ['work', QueueWork, ['concurrency', 'idle-exit-ms', 'max', 'once', 'subscription'], ['subscription']],
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
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/MJCLI && pnpm test work-queue-cli work-queue-commands`
Expected: FAIL — unresolved imports `../lib/work-queue/queue-format.js` and `../commands/queue/*.js`.

- [ ] **Step 4: Write `src/lib/work-queue/queue-format.ts`**

```typescript
import type { RemoteOpResult } from '@memberjunction/core';
import type {
    WorkQueueBindingIssueRow, WorkQueueListDeadLettersOutput, WorkQueueListPartitionsInput, WorkQueueListPartitionsOutput,
    WorkQueueStatsFailureRow, WorkQueueSubscriptionStatsRow,
} from '@memberjunction/core-entities';
import type { BindingImport, WorkJson } from '@memberjunction/work-queue-core';

type PartitionConditionOption = NonNullable<WorkQueueListPartitionsInput['condition']>;

export const PARTITION_CONDITION_OPTIONS: readonly PartitionConditionOption[] = ['Idle', 'InFlight', 'Blocked', 'AwaitingSequence', 'GapStalled'];

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
    const failed = failures.map(failure => `! ${failure.SubscriptionName}: ${failure.Error}`);
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
        return "This subscription's transport has no partition state.";
    }
    if (output.items.length === 0) {
        return 'No partitions match.';
    }
    const table = FormatTable(
        ['Partition key', 'Condition', 'Head delivery', 'Last sequence', 'Awaiting since', 'Waiting'],
        output.items.map(item => [
            item.PartitionKey, item.Condition, item.HeadDeliveryID ?? UNKNOWN, optional(item.LastCompletedSequence),
            item.AwaitingSequenceSince ?? UNKNOWN, String(item.WaitingItems),
        ]),
    );
    return withCursor(table, output.nextCursor);
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
    this.log('  mj queue partitions            - List blocked / awaiting partition keys');
    this.log('  mj queue replay                - Replay one dead letter');
    this.log('  mj queue discard               - Discard a pending or dead-lettered delivery');
    this.log('  mj queue skip-sequence         - Declare a missing sequence absent');
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
    'page-size': Flags.integer({ description: 'Items per page (1–100)', default: 50 }),
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
  static description = "List a work-queue subscription's in-flight, blocked, awaiting or gap-stalled partition keys";

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --condition Blocked'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    condition: Flags.string({ description: 'Only keys in this condition', options: [...PARTITION_CONDITION_OPTIONS] }),
    cursor: Flags.string({ description: 'nextCursor from a previous page' }),
    'page-size': Flags.integer({ description: 'Items per page (1–100)', default: 50 }),
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
  static description = 'Discard one pending or dead-lettered work-queue delivery without processing it';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --delivery <id> --reason "bad batch, re-sent as seq 8"'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    delivery: Flags.string({ char: 'd', description: 'DeliveryID to discard', required: true }),
    reason: Flags.string({ char: 'r', description: 'Why the work is dropped', required: true }),
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
        failure = 'Nothing discarded: the delivery does not exist or is neither pending nor dead-lettered.';
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

`packages/MJCLI/src/commands/queue/work.ts` — the container-job entrypoint (02 §4.4a). It exits 0 whenever the host
ran, including an empty queue, so a scheduler never records a failure for "no work"; a non-zero exit means the host
could not start:

```typescript
import { Command, Flags } from '@oclif/core';
import { MJWorkLogger, SharedProviderSource, WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

const DEFAULT_IDLE_EXIT_MS = 5000;

export default class QueueWork extends Command {
  static description = 'Run work-queue subscriptions in this process: once for a container job, or until stopped';

  static examples = [
    '<%= config.bin %> <%= command.id %> --subscription venue-import --once',
    '<%= config.bin %> <%= command.id %> --subscription venue-import --once --max 5 --concurrency 2',
    '<%= config.bin %> <%= command.id %> --subscription "*"',
  ];

  static flags = {
    subscription: Flags.string({ char: 's', description: "Subscription name, or '*' for every MJWorker subscription", required: true }),
    once: Flags.boolean({ description: 'Claim up to --max deliveries, drain and exit (container-job mode)', default: false }),
    max: Flags.integer({ description: 'With --once: how many deliveries to claim', default: 1, min: 1 }),
    'idle-exit-ms': Flags.integer({ description: 'With --once: exit after this long with nothing to claim', default: DEFAULT_IDLE_EXIT_MS, min: 0 }),
    concurrency: Flags.integer({ description: 'Handlers in flight per subscription', default: 1, min: 1 }),
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
          IdlePollMinMs: 250, IdlePollMaxMs: 2000, ShutdownDrainMs: 30000,
          SweeperIntervalMs: 0, ReconcileIntervalMs: 0,        // a short-lived job neither sweeps nor re-plans
        },
        WorkQueueEngine.Instance, session.User, session.Provider, new MJWorkLogger('[mj queue work]'),
        { ProviderSource: new SharedProviderSource(session.Provider) },
      );
      if (flags.once) {
        const result = await host.RunOnce({ MaxDeliveries: flags.max, IdleExitMs: flags['idle-exit-ms'] });
        this.log(`Processed ${result.Processed} deliver${result.Processed === 1 ? 'y' : 'ies'} (${result.Reason}).`);
      } else {
        await host.Start();
        this.log(`Running ${flags.subscription}; press Ctrl-C to stop.`);
        await waitForStopSignal();
        await host.Shutdown();
      }
      const blocked = host.GetHealth().Subscriptions.filter(s => s.State !== 'Running' && s.State !== 'Paused');
      for (const subscription of blocked) {
        this.warn(`${subscription.Name}: ${subscription.State}${subscription.Reason ? ` — ${subscription.Reason}` : ''}`);
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

/** Resolves on the first SIGINT or SIGTERM; both listeners are removed afterwards. */
function waitForStopSignal(): Promise<void> {
  return new Promise<void>(resolve => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
```

`packages/MJCLI/src/commands/queue/skip-sequence.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { WorkQueueSkipSequenceOperation } from '@memberjunction/core-entities';
import { RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueSkipSequence extends Command {
  static description = 'Declare a missing sequence of an ExplicitSequence partition key permanently absent';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --key <integrationId> --sequence 5 --reason "batch 5 never produced"'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    key: Flags.string({ char: 'k', description: 'Partition key', required: true }),
    sequence: Flags.integer({ description: 'The missing sequence (LastCompletedSequence + 1)', required: true }),
    reason: Flags.string({ char: 'r', description: 'Why the sequence will never arrive', required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueSkipSequence);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, partitionKey: flags.key, sequence: flags.sequence, reason: flags.reason };
      const result = await new WorkQueueSkipSequenceOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.SkipSequence');
      if (!output.supported) {
        failure = "This subscription's transport has no sequence state.";
      } else if (!output.skipped) {
        failure = 'Nothing skipped: the sequence is not the next expected one, or a live delivery with it exists.';
      } else {
        this.log(`Skipped sequence ${flags.sequence} for key ${flags.key}.`);
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

Run: `cd packages/MJCLI && pnpm test work-queue-cli work-queue-commands`
Expected: PASS — work-queue-cli (8), work-queue-commands (2).

Run: `cd packages/MJCLI && pnpm test`
Expected: PASS — including `derived-usage`, which now sees the `queue` domain profile.

Run: `cd packages/MJCLI && pnpm run build`
Expected: builds; `oclif manifest` lists the ten `queue` commands.

- [ ] **Step 8: Smoke-test against your database**

Run: `node packages/MJCLI/bin/run.js queue stats`
Expected: a table (or `No subscriptions.`), exit code 0.

Run: `node packages/MJCLI/bin/run.js queue dead-letters --subscription does.not.exist; echo "exit=$?"`
Expected: `WorkQueue.ListDeadLetters failed (EXECUTION_ERROR): Unknown work queue subscription 'does.not.exist'` and `exit=1`.

- [ ] **Step 9: Commit**

```bash
git add packages/MJCLI/package.json packages/MJCLI/src pnpm-lock.yaml
git commit -m "feat(cli): mj queue commands over work queue remote operations and topology bindings"
```

---

### Task 11: Bootstrap dependencies, manifests and full build

**Files:**
- Modify: `packages/ServerBootstrap/package.json`, `packages/ServerBootstrapLite/package.json`
- Regenerate: `packages/ServerBootstrap/src/generated/mj-class-registrations.ts`, `packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts`

**Interfaces:**
- Consumes: every `@RegisterClass` in `@memberjunction/work-queue-engine` (the eight `…ServerOperation` classes from Task 6, plus plan 05's `DatabaseTransportDriverFactory` and its driver-owned entity server subclasses) and in `@memberjunction/work-queue-server` (`WorkQueueServerExtension`). `@memberjunction/work-queue-base` carries no registrations of its own, but the engine depends on it, so both bootstrap packages resolve it transitively — no manifest entry is expected for it.
- Produces: bootstrap manifests that import those registrations, so a bundled MJAPI resolves the Remote Operations, the Database driver factory and the Server Extension, and `mj queue` (which loads `ServerBootstrapLite`) resolves the Remote Operations.

MJ apps load `@RegisterClass` registrations through generated manifests (`mj codegen manifest`), not side-effect imports. A class missing from a manifest fails only in bundled builds — every unit test still passes. `ServerBootstrapLite` gets the engine only: its manifest command excludes `@memberjunction/server`, and the REST extension belongs to MJAPI.

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
Expected — exactly these ten lines:

```
DatabaseTransportDriverFactory
WorkQueueDiscardDeliveryServerOperation
WorkQueueGetBacklogServerOperation
WorkQueueGetSubscriptionStatsServerOperation
WorkQueueListDeadLettersServerOperation
WorkQueueListPartitionsServerOperation
WorkQueueReplayDeadLetterServerOperation
WorkQueueServerExtension
WorkQueueSkipSequenceServerOperation
WorkQueueValidateBindingsServerOperation
```

Run: `grep -ohE "WorkQueue[A-Za-z]+ServerOperation|WorkQueueServerExtension|DatabaseTransportDriverFactory" packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts | sort -u`
Expected — the same list **without** `WorkQueueServerExtension` (nine lines).

If a list is empty, the generator did not see the dependency: confirm Step 1, confirm `packages/WorkQueue/engine/dist` and `packages/WorkQueue/server/dist` exist, and rerun Step 3.

- [ ] **Step 4: Full build and unit tests**

Run: `pnpm run build`
Expected: the full build and its `postbuild` manifest pass succeed.

Run each and expect PASS:
- `cd packages/WorkQueue/engine && pnpm test`
- `cd packages/WorkQueue/server && pnpm test`
- `cd packages/MJServer && pnpm test`
- `cd packages/MJCLI && pnpm test`

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

Expected: `{"results":[{"messageId":"…","status":"accepted"}]}` with HTTP 202.

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
- Consumes: `WorkQueueEngine`, `WorkQueueHost`, `WorkQueueSweeper`, `DeduplicationLedger`, `BaseWorkHandler`, `SharedProviderSource`, `MJWorkLogger`, `CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo, transportID?: string): Promise<DatabaseConformanceHarness>` (plan 05 Task 14; `Cleanup(): Promise<void>`) (`@memberjunction/work-queue-engine`); `RunConformanceChecks(harness): Promise<ConformanceCheckResult[]>` (`@memberjunction/work-queue-core/testing`, plan 04); `HandleWorkQueuePublish`, `APIKeyScopeAuthorizer` (`@memberjunction/work-queue-server`); `Outcome`, `ITransportConsumer`, `ReceivedDelivery`, `WorkContext`, `WorkMessage`, `WorkOutcome` (`@memberjunction/work-queue-core`); the Task 5 operation classes and `MJWorkQueueDeliveryEntity` (`@memberjunction/core-entities`); `GetAPIKeyEngine` (`@memberjunction/api-keys`); `Assert`, `AssertEqual`, `IntegrationCheckRegistry`, `IntegrationCheckContext`, `NamedCheck` (`@memberjunction/testing-integration`).
- Produces: `WorkQueueRuntimeChecks: NamedCheck[]` (16 checks, ids `work-queue-runtime.WR1`–`WR16`), the `'work-queue-runtime'` lifecycle, and `MJ: Tests` record `IT94 - Work Queue Runtime (native host, operators, REST)`.

Unit tests prove shapes against fakes; this bundle proves the pieces **behave together** on a real database: the host claims and settles, the unique in-flight index enforces single flight across consumers, `Ordered` keys block and unblock through the Remote Operations, sequence gaps wait and skip, the sweeper expires leases and purges, the ledger suppresses duplicates, and the REST handler enforces scope and `AllowExternalPublish` with a real API key.

| Check | Proves |
| --- | --- |
| WR1 | A started host plans fixture subscriptions: registered handler → `Running`, unknown handler → `HandlerNotRegistered` |
| WR2 | Publish → host claims → handler runs → delivery `Completed` |
| WR3 | Fan-out isolation: one publish completes on one subscription, dead-letters on a second, stays `Pending` on a third |
| WR4 | Lease expiry through the sweeper: expired `InFlight` → `Pending` with `LeaseExpired`; the stale lease token is fenced out; the retry claims attempt 2 |
| WR5 | `Exclusive`: two consumers never hold the same key; the second consumer gets the key after the first completes |
| WR6 | `Ordered`: a dead-lettered head blocks its key; `WorkQueue.ListPartitions` reports `Blocked`; `WorkQueue.ReplayDeadLetter` unblocks in order |
| WR7 | `ExplicitSequence`: sequence 3 waits for 2; `WorkQueue.SkipSequence` releases it |
| WR8 | `WorkQueue.DiscardDelivery` discards a pending delivery, which is then never claimed |
| WR9 | A repeated `DeduplicationKey` returns `Duplicate` naming the first message and writes no second message |
| WR10 | REST publish: scoped API key → 202; `AllowExternalPublish = 0` → 403 `TopicNotExternallyPublishable`; key without the scope → 403 |
| WR11 | The sweeper purges a terminal delivery past topic retention |
| WR12 | Host shutdown is idempotent, clears `WorkQueueHost.Active` and unregisters from `ShutdownRegistry` |
| WR13 | Plan 04's transport conformance checks pass against plan 05's Database harness on the live provider (Failed ids fail the check; Skipped ids are logged) |
| WR14 | Delivery rows are driver-owned: `BaseEntity.Save()` on a delivery is rejected and the row is unchanged (03 §6.8) |
| WR15 | Cancelling an **in-flight** delivery revokes the lease (`cancelRequested`), the holder's heartbeat reports `Lost` and its settle is fenced, the `Exclusive` key is held until the lease expires, and the row then settles `Discarded` (03 §7) |
| WR16 | `WorkQueue.GetBacklog` counts claimable pending **plus** in-flight deliveries and returns to its starting value once work settles |

Safety in a shared development database:

- Every topic and subscription is named `mj-it-wq-…`. Setup removes leftovers from an interrupted run first; Teardown removes messages, deliveries, partition states and deduplication rows by SQL, then subscriptions and topics through their entities.
- Hosts in WR1–WR3 and WR12 run **only** the named fixture subscriptions. A running MJAPI host cannot claim them: the fixture handler key is registered only in the test process, so MJAPI plans them `HandlerNotRegistered`.
- WR13's harness writes its own topics and subscriptions and removes them with `Cleanup()` in a `finally`.
- WR4 and WR11 run the real sweeper, whose statements are global. They only expire leases that are already expired and purge rows already past retention — exactly what production does.
- Raw SQL changes rows behind the entity cache, so every read uses `BypassCache: true`.

- [ ] **Step 1: Add the dependencies**

In `packages/TestingFramework/integration-test-suite/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue-core": "6.1.0",
"@memberjunction/work-queue-engine": "6.1.0",
"@memberjunction/work-queue-server": "6.1.0",
```

Run: `pnpm install` (repository root)

- [ ] **Step 2: Pin the bundle in the registry test (failing)**

In `packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts`:

- add `import { WorkQueueRuntimeChecks } from '../checks/work-queue-runtime.checks';` after the other check imports;
- add `['work-queue-runtime', WorkQueueRuntimeChecks, 16],` to the `bundles` table directly after `['user-routines', UserRoutinesChecks, 16],`;
- add `'work-queue-runtime': 16,` to `EXPECTED_BUNDLE_COUNTS` directly after `'view-security': 4,`;
- change `expect(Object.keys(EXPECTED_BUNDLE_COUNTS)).toHaveLength(93);` to `toHaveLength(94)`.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: FAIL — unresolved import `../checks/work-queue-runtime.checks`.

- [ ] **Step 3: Write `src/checks/work-queue-runtime.checks.ts`**

```typescript
/**
 * work-queue-runtime.checks.ts — the 'work-queue-runtime' bundle (WR1–WR13): the durable work queue's MJ runtime
 * against the live database — WorkQueueHost, direct Database consumers, the operator Remote Operations, the
 * sweeper, the deduplication ledger and the REST publish handler. Deterministic, no model calls, server transport;
 * runs on SQL Server and PostgreSQL.
 *
 * Every fixture is named 'mj-it-wq-…'. Setup removes leftovers from an interrupted run before creating fresh
 * fixtures; Teardown removes them again. Checks run in array order; each settles or discards what it creates.
 */
import { DatabaseProviderBase, RunView, type RemoteOpResult, type UserInfo } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueListPartitionsOperation,
    WorkQueueReplayDeadLetterOperation, WorkQueueSkipSequenceOperation,
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
    BaseWorkHandler, CreateDatabaseConformanceHarness, DeduplicationLedger, MJWorkLogger, SharedProviderSource, WorkQueueEngine,
    WorkQueueHost, WorkQueueSweeper,
} from '@memberjunction/work-queue-engine';
import { RunConformanceChecks } from '@memberjunction/work-queue-core/testing';
import { APIKeyScopeAuthorizer, HandleWorkQueuePublish } from '@memberjunction/work-queue-server';

const PREFIX = 'mj-it-wq-';
const DATABASE_TRANSPORT_ID = 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5';
const HANDLER_KEY = 'mj-it-wq.scripted';
const WAIT_TIMEOUT_MS = 20000;

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
    SequencedTopic: `${PREFIX}sequenced`,
    SequencedSub: `${PREFIX}sequenced-sub`,
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

function fx(): RuntimeFixture {
    if (!fixture) {
        throw new Error('work-queue-runtime fixture missing (bundle Setup did not run)');
    }
    return fixture;
}

/** Completes every delivery, except on the reject subscription, which dead-letters. */
class ItScriptedWorkHandler extends BaseWorkHandler {
    public async Handle(_message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        return context.SubscriptionName === NAMES.RejectSub ? Outcome.DeadLetter('it-reject') : Outcome.Complete();
    }
}

// ─── Engine, consumers, publishing ───────────────────────────────────────────────────────────────

function subscription(name: string): MJWorkQueueSubscriptionEntity {
    const found = WorkQueueEngine.Instance.GetSubscriptionByName(name);
    if (!found) {
        throw new Error(`fixture subscription ${name} is not visible to WorkQueueEngine`);
    }
    return found;
}

async function openConsumer(name: string): Promise<ITransportConsumer> {
    const driver = await WorkQueueEngine.Instance.GetDriver(DATABASE_TRANSPORT_ID);
    return driver.OpenConsumer(WorkQueueEngine.Instance.BuildSubscriptionBinding(subscription(name)));
}

function receive(consumer: ITransportConsumer, max = 10): Promise<ReceivedDelivery[]> {
    return consumer.Receive(max, 0, new AbortController().signal);
}

async function publishOne(user: UserInfo, topic: string, request: PublishRequest = {}): Promise<string> {
    const [result] = await WorkQueueEngine.Instance.PublishAs(topic, [{ Attributes: { source: 'it' }, Payload: { at: Date.now() }, ...request }], { ContextUser: user });
    AssertEqual(result.Status, 'Accepted', `publish to ${topic}: ${result.Error?.Message ?? ''}`);
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

async function waitFor<T>(label: string, probe: () => Promise<T | null>): Promise<T> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const value = await probe();
        if (value !== null) {
            return value;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`timed out after ${WAIT_TIMEOUT_MS} ms waiting for ${label}`);
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

function newHost(provider: DatabaseProviderBase, user: UserInfo, instance: string): WorkQueueHost {
    return new WorkQueueHost(
        {
            InstanceID: `${PREFIX}${instance}-${process.pid}`,
            Subscriptions: [NAMES.CompleteSub, NAMES.RejectSub, NAMES.UnregisteredSub].map(Name => ({ Name, Concurrency: 2 })),
            IdlePollMinMs: 50, IdlePollMaxMs: 250, ShutdownDrainMs: 2000, SweeperIntervalMs: 0, ReconcileIntervalMs: 0,
        },
        WorkQueueEngine.Instance, user, provider, new MJWorkLogger('[WorkQueue:IT]'),
        { ProviderSource: new SharedProviderSource(provider) },
    );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────────────────────────

interface TopicSpec { Name: string; OrderingMode: 'PublishOrder' | 'ExplicitSequence'; AllowExternalPublish: boolean }
interface SubscriptionSpec { Name: string; Topic: string; PartitionMode: 'None' | 'Exclusive' | 'Ordered'; HandlerKey: string }

const TOPICS: TopicSpec[] = [
    { Name: NAMES.EventsTopic, OrderingMode: 'PublishOrder', AllowExternalPublish: true },
    { Name: NAMES.InternalTopic, OrderingMode: 'PublishOrder', AllowExternalPublish: false },
    { Name: NAMES.ExclusiveTopic, OrderingMode: 'PublishOrder', AllowExternalPublish: false },
    { Name: NAMES.OrderedTopic, OrderingMode: 'PublishOrder', AllowExternalPublish: false },
    { Name: NAMES.SequencedTopic, OrderingMode: 'ExplicitSequence', AllowExternalPublish: false },
];

const SUBSCRIPTIONS: SubscriptionSpec[] = [
    { Name: NAMES.CompleteSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.RejectSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.UnregisteredSub, Topic: NAMES.EventsTopic, PartitionMode: 'None', HandlerKey: 'mj-it-wq.not-registered' },
    { Name: NAMES.InternalSub, Topic: NAMES.InternalTopic, PartitionMode: 'None', HandlerKey: HANDLER_KEY },
    { Name: NAMES.ExclusiveSub, Topic: NAMES.ExclusiveTopic, PartitionMode: 'Exclusive', HandlerKey: HANDLER_KEY },
    { Name: NAMES.OrderedSub, Topic: NAMES.OrderedTopic, PartitionMode: 'Ordered', HandlerKey: HANDLER_KEY },
    { Name: NAMES.SequencedSub, Topic: NAMES.SequencedTopic, PartitionMode: 'Ordered', HandlerKey: HANDLER_KEY },
];

async function removeFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const id = (name: string): string => provider.QuoteIdentifier(name);
    const namePattern = provider.BuildParameterPlaceholder(0);
    const fixtureSubs = `SELECT s.${id('ID')} FROM ${table(provider, 'WorkQueueSubscription')} s WHERE s.${id('Name')} LIKE ${namePattern}`;
    const fixtureTopics = `SELECT t.${id('ID')} FROM ${table(provider, 'WorkQueueTopic')} t WHERE t.${id('Name')} LIKE ${namePattern}`;
    const statements = [
        `DELETE FROM ${table(provider, 'WorkQueueDelivery')} WHERE ${id('SubscriptionID')} IN (${fixtureSubs})`,
        `DELETE FROM ${table(provider, 'WorkQueuePartitionState')} WHERE ${id('SubscriptionID')} IN (${fixtureSubs})`,
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
}

async function createFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const topicIDs = new Map<string, string>();
    for (const spec of TOPICS) {
        const topic = await provider.GetEntityObject<MJWorkQueueTopicEntity>('MJ: Work Queue Topics', user);
        topic.NewRecord();
        topic.Name = spec.Name;
        topic.Description = 'Integration test fixture (safe to delete)';
        topic.TransportID = DATABASE_TRANSPORT_ID;
        topic.OrderingMode = spec.OrderingMode;
        topic.IsFifo = false;
        topic.AllowExternalPublish = spec.AllowExternalPublish;
        topic.MaxPayloadBytes = 262144;
        topic.DefaultDeduplicationTTLSeconds = 3600;
        topic.RetentionDays = 1;
        topic.Status = 'Active';
        Assert(await topic.Save(), `creating topic ${spec.Name} failed: ${topic.LatestResult?.CompleteMessage}`);
        topicIDs.set(spec.Name, topic.ID);
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
        sub.LeaseSeconds = 30;
        sub.HeartbeatMode = 'Auto';
        sub.HostType = 'MJWorker';
        sub.HandlerKey = spec.HandlerKey;
        sub.Status = 'Active';
        Assert(await sub.Save(), `creating subscription ${spec.Name} failed: ${sub.LatestResult?.CompleteMessage}`);
    }
}

// ─── API keys (WR10) ─────────────────────────────────────────────────────────────────────────────

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

function restPublish(user: UserInfo, topic: string, apiKeyHash: string): ReturnType<typeof HandleWorkQueuePublish> {
    return HandleWorkQueuePublish(
        { TopicName: topic, Body: { messages: [{ attributes: { source: 'it-rest' }, payload: { n: 1 } }] }, User: user, ApiKeyHash: apiKeyHash, Path: `/work-queue/topics/${topic}/messages` },
        {
            GetEngine: async () => WorkQueueEngine.Instance,
            Authorizer: new APIKeyScopeAuthorizer(),
            Settings: { MaxBatch: 100, BodyLimit: '1mb' },
            Log: new MJWorkLogger('[WorkQueue:IT-REST]'),
        },
    );
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const WorkQueueRuntimeChecks: NamedCheck[] = [
    {
        Id: 'work-queue-runtime.WR1',
        Name: 'WR1: a started host plans fixture subscriptions by handler registration',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr1');
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
            const host = newHost(fx().Provider, ctx.User, 'wr2');
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
            const host = newHost(fx().Provider, ctx.User, 'wr3');
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
            const consumer = await openConsumer(NAMES.InternalSub);
            const first = onlyMessage(await receive(consumer), messageID, 'first claim');
            await setDeliveryTimestamp(Provider, ctx.User, first.DeliveryID, 'LeaseExpiresAt', 1);
            const sweeper = new WorkQueueSweeper(Provider, new DeduplicationLedger(Provider, ctx.User), WorkQueueEngine.Instance, ctx.User, new MJWorkLogger('[WorkQueue:IT]'));
            const pass = await sweeper.RunOnce();
            Assert((pass.ExpireLeases ?? 0) >= 1, `sweeper expired no leases: ${JSON.stringify(pass)}`);
            const expired = await delivery(ctx.User, NAMES.InternalSub, messageID);
            AssertEqual(expired.Status, 'Pending', 'status after lease expiry');
            AssertEqual(expired.LastError, 'LeaseExpired', 'last error after lease expiry');
            AssertEqual((await consumer.Complete(first)).Kind, 'LeaseLost', 'settle with the expired lease token');
            const retry = onlyMessage(await receive(consumer), messageID, 'retry claim');
            AssertEqual(retry.Attempt, 2, 'attempt number of the retry');
            await settleAll(consumer, [retry]);
        },
    },
    {
        Id: 'work-queue-runtime.WR5',
        Name: 'WR5: Exclusive — two consumers never hold the same key',
        Fn: async (ctx: IntegrationCheckContext) => {
            const k1First = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k1' });
            const k1Second = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k1' });
            await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'k2' });
            const a = await openConsumer(NAMES.ExclusiveSub);
            const b = await openConsumer(NAMES.ExclusiveSub);
            const heldByA = await receive(a);
            AssertEqual(new Set(heldByA.map(d => d.Message.PartitionKey)).size, heldByA.length, 'consumer A holds at most one delivery per key');
            AssertEqual(heldByA.length, 2, 'consumer A claims one delivery for each of k1 and k2');
            AssertEqual((await receive(b)).length, 0, 'consumer B claims nothing while both keys are in flight');
            await settleAll(a, [onlyMessage(heldByA, k1First, 'k1 head')]);
            const nextForB = await receive(b);
            AssertEqual(onlyMessage(nextForB, k1Second, 'k1 second').Message.PartitionKey, 'k1', 'consumer B receives the next k1 delivery');
            await settleAll(b, nextForB);
            await settleAll(a, heldByA.filter(d => d.Message.PartitionKey === 'k2'));
        },
    },
    {
        Id: 'work-queue-runtime.WR6',
        Name: 'WR6: Ordered — a dead-lettered head blocks its key until ReplayDeadLetter',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const head = await publishOne(ctx.User, NAMES.OrderedTopic, { PartitionKey: 'o1' });
            const next = await publishOne(ctx.User, NAMES.OrderedTopic, { PartitionKey: 'o1' });
            const consumer = await openConsumer(NAMES.OrderedSub);
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
        },
    },
    {
        Id: 'work-queue-runtime.WR7',
        Name: 'WR7: ExplicitSequence — sequence 3 waits for 2 until SkipSequence',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const first = await publishOne(ctx.User, NAMES.SequencedTopic, { PartitionKey: 's1', Sequence: 1 });
            const third = await publishOne(ctx.User, NAMES.SequencedTopic, { PartitionKey: 's1', Sequence: 3 });
            const consumer = await openConsumer(NAMES.SequencedSub);
            await settleAll(consumer, [onlyMessage(await receive(consumer), first, 'sequence 1')]);
            AssertEqual((await receive(consumer)).length, 0, 'sequence 3 is not claimable while 2 is missing');

            const skip = operationOutput(await new WorkQueueSkipSequenceOperation().Execute({ subscriptionName: NAMES.SequencedSub, partitionKey: 's1', sequence: 2, reason: 'it: never produced' }, options), 'WorkQueue.SkipSequence');
            Assert(skip.supported && skip.skipped, `skip result: ${JSON.stringify(skip)}`);
            await settleAll(consumer, [onlyMessage(await receive(consumer), third, 'sequence 3 after skip')]);
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
            Assert(result.supported && result.discarded, `discard result: ${JSON.stringify(result)}`);
            AssertEqual((await delivery(ctx.User, NAMES.InternalSub, messageID)).Status, 'Discarded', 'status after discard');
            const consumer = await openConsumer(NAMES.InternalSub);
            const claimed = await receive(consumer);
            AssertEqual(claimed.filter(d => UUIDsEqual(d.Message.MessageID, messageID)).length, 0, 'a discarded delivery is never claimed');
            await settleAll(consumer, claimed);
        },
    },
    {
        Id: 'work-queue-runtime.WR9',
        Name: 'WR9: a repeated DeduplicationKey returns Duplicate and writes no second message',
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `${PREFIX}dedup-${Date.now()}`;
            const publish = (): Promise<PublishResult[]> => WorkQueueEngine.Instance.PublishAs(NAMES.InternalTopic, [{ DeduplicationKey: key, Payload: { n: 1 } }], { ContextUser: ctx.User });
            const [first] = await publish();
            const [second] = await publish();
            AssertEqual(first.Status, 'Accepted', 'first publish');
            AssertEqual(second.Status, 'Duplicate', 'second publish');
            Assert(UUIDsEqual(second.MessageID, first.MessageID), `duplicate names the owning message: ${second.MessageID} vs ${first.MessageID}`);
            AssertEqual((await deliveriesWhere(ctx.User, `SubscriptionID='${subscription(NAMES.InternalSub).ID}' AND MessageID='${first.MessageID}'`)).length, 1, 'deliveries for the deduplicated message');
            const consumer = await openConsumer(NAMES.InternalSub);
            await settleAll(consumer, await receive(consumer));
        },
    },
    {
        Id: 'work-queue-runtime.WR10',
        Name: 'WR10: REST publish enforces workqueue:publish and AllowExternalPublish',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const cleanup: Array<() => Promise<void>> = [];
            try {
                const scoped = await createApiKey(Provider, ctx.User, true, cleanup);
                const unscoped = await createApiKey(Provider, ctx.User, false, cleanup);
                await GetAPIKeyEngine().Config(true, ctx.User);

                const accepted = await restPublish(ctx.User, NAMES.EventsTopic, scoped.Hash);
                AssertEqual(accepted.Status, 202, `scoped publish: ${JSON.stringify(accepted.Body)}`);
                Assert(JSON.stringify(accepted.Body).includes('"status":"accepted"'), `scoped publish result: ${JSON.stringify(accepted.Body)}`);

                const internal = await restPublish(ctx.User, NAMES.InternalTopic, scoped.Hash);
                AssertEqual(internal.Status, 403, 'publish to a topic that disallows external publishing');
                Assert(JSON.stringify(internal.Body).includes('TopicNotExternallyPublishable'), `internal topic body: ${JSON.stringify(internal.Body)}`);

                AssertEqual((await restPublish(ctx.User, NAMES.EventsTopic, unscoped.Hash)).Status, 403, 'publish with a key lacking workqueue:publish');
            } finally {
                for (const step of cleanup.reverse()) {
                    await step().catch(() => undefined);
                }
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR11',
        Name: 'WR11: the sweeper purges a terminal delivery past topic retention',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider, CompletedDeliveryID } = fx();
            if (!CompletedDeliveryID) {
                throw new Error('WR2 did not record a completed delivery');
            }
            await setDeliveryTimestamp(Provider, ctx.User, CompletedDeliveryID, 'CompletedAt', 48);
            const sweeper = new WorkQueueSweeper(Provider, new DeduplicationLedger(Provider, ctx.User), WorkQueueEngine.Instance, ctx.User, new MJWorkLogger('[WorkQueue:IT]'));
            const pass = await sweeper.RunOnce();
            Assert((pass.PurgeRetention ?? 0) >= 1, `retention purged nothing: ${JSON.stringify(pass)}`);
            AssertEqual((await deliveriesWhere(ctx.User, `ID='${CompletedDeliveryID}'`)).length, 0, 'the backdated delivery was purged');
        },
    },
    {
        Id: 'work-queue-runtime.WR12',
        Name: 'WR12: host shutdown is idempotent and unregisters',
        Fn: async (ctx: IntegrationCheckContext) => {
            const host = newHost(fx().Provider, ctx.User, 'wr12');
            await host.Start();
            Assert(WorkQueueHost.Active === host, 'a started host is Active');
            Assert(ShutdownRegistry.Instance.List().includes(host), 'a started host is in ShutdownRegistry');
            await host.Shutdown();
            await host.Shutdown();
            AssertEqual(host.IsStarted, false, 'IsStarted after shutdown');
            Assert(WorkQueueHost.Active === null, 'Active is cleared');
            Assert(!ShutdownRegistry.Instance.List().includes(host), 'the host left ShutdownRegistry');
        },
    },
    {
        Id: 'work-queue-runtime.WR13',
        Name: "WR13: plan 04's transport conformance checks pass on the Database transport",
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
                console.log(`      → ${passed} conformance checks passed, ${results.length - passed} skipped`);
            } finally {
                await harness.Cleanup();
            }
        },
    },
    {
        Id: 'work-queue-runtime.WR14',
        Name: 'WR14: a work-queue delivery rejects BaseEntity.Save()',
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
            AssertEqual((await delivery(ctx.User, NAMES.InternalSub, messageID)).Status, 'Pending', 'the delivery row is unchanged');
            const cleanup = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                { subscriptionName: NAMES.InternalSub, deliveryID: row.ID, reason: 'it: WR14 cleanup' }, options,
            ), 'WorkQueue.DiscardDelivery');
            Assert(cleanup.discarded, `cleanup discard: ${JSON.stringify(cleanup)}`);
        },
    },
    {
        Id: 'work-queue-runtime.WR15',
        Name: 'WR15: cancelling an in-flight delivery revokes the lease and holds its key until the lease expires',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Provider } = fx();
            const options = { provider: Provider, user: ctx.User };
            const held = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'cancel-1' });
            const queued = await publishOne(ctx.User, NAMES.ExclusiveTopic, { PartitionKey: 'cancel-1' });
            const consumer = await openConsumer(NAMES.ExclusiveSub);
            const batch = await receive(consumer);
            const claimed = onlyMessage(batch.filter(d => d.Message.PartitionKey === 'cancel-1'), held, 'the in-flight delivery');
            await settleAll(consumer, batch.filter(d => d.Message.PartitionKey !== 'cancel-1'));

            const row = await delivery(ctx.User, NAMES.ExclusiveSub, held);
            const cancel = operationOutput(await new WorkQueueDiscardDeliveryOperation().Execute(
                { subscriptionName: NAMES.ExclusiveSub, deliveryID: row.ID, reason: 'it: operator cancel' }, options,
            ), 'WorkQueue.DiscardDelivery');
            Assert(cancel.supported && cancel.discarded && cancel.cancelRequested, `cancel result: ${JSON.stringify(cancel)}`);

            AssertEqual((await delivery(ctx.User, NAMES.ExclusiveSub, held)).Status, 'InFlight', 'a cancelled delivery stays in flight until its lease expires');
            AssertEqual(await consumer.ExtendLease(claimed, 60), 'Lost', "the holder's heartbeat reports the revoked lease");
            AssertEqual((await consumer.Complete(claimed)).Kind, 'LeaseLost', 'the revoked holder cannot settle');
            const whileWindingDown = await receive(consumer);
            AssertEqual(whileWindingDown.filter(d => d.Message.PartitionKey === 'cancel-1').length, 0, 'the key is not handed on while the old handler winds down');
            await settleAll(consumer, whileWindingDown);

            await setDeliveryTimestamp(Provider, ctx.User, row.ID, 'LeaseExpiresAt', 1);
            const sweeper = new WorkQueueSweeper(Provider, new DeduplicationLedger(Provider, ctx.User), WorkQueueEngine.Instance, ctx.User, new MJWorkLogger('[WorkQueue:IT]'));
            await sweeper.RunOnce();
            AssertEqual((await delivery(ctx.User, NAMES.ExclusiveSub, held)).Status, 'Discarded', 'a cancelled delivery settles as Discarded when its lease expires');
            const afterExpiry = await receive(consumer);
            await settleAll(consumer, [onlyMessage(afterExpiry.filter(d => d.Message.PartitionKey === 'cancel-1'), queued, 'the next delivery for the key')]);
            await settleAll(consumer, afterExpiry.filter(d => d.Message.PartitionKey !== 'cancel-1'));
        },
    },
    {
        Id: 'work-queue-runtime.WR16',
        Name: 'WR16: GetBacklog counts claimable pending plus in-flight deliveries',
        Fn: async (ctx: IntegrationCheckContext) => {
            const options = { provider: fx().Provider, user: ctx.User };
            const backlog = async (): Promise<WorkQueueGetBacklogOutput> => operationOutput(
                await new WorkQueueGetBacklogOperation().Execute({ subscriptionName: NAMES.InternalSub }, options), 'WorkQueue.GetBacklog',
            );
            const before = await backlog();
            Assert(before.supported, `GetBacklog must be supported on the Database transport: ${JSON.stringify(before)}`);
            await publishOne(ctx.User, NAMES.InternalTopic);
            await publishOne(ctx.User, NAMES.InternalTopic);
            AssertEqual((await backlog()).claimable, before.claimable + 2, 'two published deliveries are claimable');

            const consumer = await openConsumer(NAMES.InternalSub);
            const claimed = await receive(consumer);
            Assert(claimed.length > 0, 'the consumer claimed nothing');
            const during = await backlog();
            AssertEqual(during.inFlight, before.inFlight + claimed.length, 'claimed deliveries count as in flight, not claimable');
            AssertEqual(during.total, during.claimable + during.inFlight, 'total is claimable + in flight');

            await settleAll(consumer, claimed);
            const rest = await receive(consumer);
            await settleAll(consumer, rest);
            AssertEqual((await backlog()).total, before.total, 'the backlog returns to its starting value once the work is settled');
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
        MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, ItScriptedWorkHandler, HANDLER_KEY);
        await removeFixtures(provider, ctx.User);
        await createFixtures(provider, ctx.User);
        await WorkQueueEngine.Instance.Config(true, ctx.User, provider);
        fixture = { Provider: provider, CompletedDeliveryID: null };
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

- [ ] **Step 4: Export the bundle**

In `packages/TestingFramework/integration-test-suite/src/index.ts`, add after `export * from './checks/queue.checks';`:

```typescript
export * from './checks/work-queue-runtime.checks';
```

- [ ] **Step 5: Run the registry test and build**

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: PASS — the bundle registers 16 checks and the pinned catalog has 94 bundles.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm run build`
Expected: builds.

- [ ] **Step 6: Write the test record**

`metadata-optional/integration-test/tests/integration/.IT94-work-queue-runtime.json`:

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "IT94 - Work Queue Runtime (native host, operators, REST)",
    "Description": "Deterministic end-to-end behavior of the durable work queue's MJ runtime on the Database transport — no LLM calls. WR1: a started WorkQueueHost plans fixture subscriptions (registered handler Running, unknown handler HandlerNotRegistered). WR2: publish → host claim → handler → Completed. WR3: one publish settles independently per subscription (Completed / DeadLettered / untouched Pending). WR4: the sweeper expires a lease, the stale lease token is fenced out, the retry is attempt 2. WR5: Exclusive single flight across two consumers. WR6: an Ordered dead-lettered head blocks its key; WorkQueue.ListPartitions reports Blocked; WorkQueue.ReplayDeadLetter unblocks in order. WR7: ExplicitSequence gap waits; WorkQueue.SkipSequence releases it. WR8: WorkQueue.DiscardDelivery discards a pending delivery. WR9: DeduplicationKey suppression. WR10: REST publish enforces workqueue:publish with a real API key and AllowExternalPublish. WR11: retention purge. WR12: host shutdown contract. WR13: plan 04's transport conformance checks (RunConformanceChecks) pass against plan 05's Database conformance harness. WR14: a delivery row rejects BaseEntity.Save() and is unchanged. WR15: cancelling an in-flight delivery revokes its lease, fences the holder's settle, holds the Exclusive key until the lease expires and then settles Discarded. WR16: WorkQueue.GetBacklog counts claimable pending plus in-flight deliveries. Fixtures are 'mj-it-wq-*' topics and subscriptions on the seeded Database transport, removed in Setup and Teardown.",
    "InputDefinition": {},
    "ExpectedOutcomes": {
      "summary": "The host claims and settles fixture deliveries, partition modes enforce single flight, blocking and sequence gaps, operator Remote Operations repair blocked keys, the sweeper expires leases and purges retention, duplicates are suppressed, and REST publishing honors scope and topic exposure."
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

In `metadata-optional/integration-test/test-suites/.integration-suite.json`, inside the `Integration Tests — Deterministic` suite's `relatedEntities["MJ: Test Suite Tests"]` array, add this entry directly after the `IT93 - Prompt Eval Harness` entry (sequence 48 keeps it among the server-transport members, before every client-transport member):

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
        },
```

- [ ] **Step 8: Push the test metadata and run the bundle**

Run: `pnpm exec mj sync push --dir=metadata-optional/integration-test --ci --dry-run`
Expected: 1 `MJ: Tests` create and 1 `MJ: Test Suite Tests` create; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata-optional/integration-test --ci`

Run: `MJ_INTEGRATION_TEST=1 pnpm mj test run "IT94 - Work Queue Runtime (native host, operators, REST)"`
Expected: 16 passed, 0 failed, 0 skipped. Diagnose any failure before continuing — WR5–WR7 failing usually means plan 05's claim statements disagree with 03 §7, not that this bundle is wrong.

Run the bundle twice more in a row.
Expected: identical results (Setup removes leftovers; WR13's harness cleans up after itself; no state leaks between runs).

Run: `pnpm run test:integration`
Expected: the deterministic tier passes, including IT94. Report pass/fail/skip counts.

- [ ] **Step 9: Commit**

```bash
git add packages/TestingFramework/integration-test-suite/package.json packages/TestingFramework/integration-test-suite/src metadata-optional/integration-test/tests/integration/.IT94-work-queue-runtime.json metadata-optional/integration-test/test-suites/.integration-suite.json pnpm-lock.yaml
git commit -m "test(integration): IT94 work queue runtime bundle — host, partitions, operators, sweeper, REST"
```

---

### Task 13: READMEs and operator runbook

**Files:**
- Create or extend: `packages/WorkQueue/engine/README.md` (plan 05 may have created it — append the sections below, do not replace its data-layer content)
- Create: `packages/WorkQueue/server/README.md`

**Interfaces:**
- Consumes: the names produced by Tasks 1–12.
- Produces: documentation only.

- [ ] **Step 1: Append the runtime sections to `packages/WorkQueue/engine/README.md`**

````markdown
## Running subscriptions inside MJ

Enable the host in `mj.config.cjs` on every instance that should process work:

```javascript
workQueue: {
  enabled: true,
  systemUserEmail: 'system@memberjunction.org',
  subscriptions: [{ name: '*', concurrency: 4 }],   // or name specific subscriptions
  sweeperEnabled: true,
  reconcileIntervalMs: 30000,
}
```

Subscription metadata is cached by `WorkQueueEngineBase` (`@memberjunction/work-queue-base`, browser-safe) and
reached here through the server `WorkQueueEngine`, which proxies it (03 §11) — the same split as
`AIEngineBase`/`AIEngine`, so Explorer can read the topology without pulling in drivers or SQL.

A subscription's `Filter` is MJ `CompositeFilterDescriptor` JSON over envelope attributes, restricted to the
operators every transport can express (`eq`, `neq`, `startswith`, `isnull`/`isnotnull`, AND across fields, OR of `eq`
on one field) and matched **case-sensitively** (03 §4). Richer filters are rejected when the subscription is saved,
not silently ignored, and `mj-filter-builder` is the editor.

Any number of instances may run the same subscription: claims are atomic against the database (or the cloud
queue), leases are fenced, and each instance only decides what **it** runs. `MJ_DISABLE_WORK_QUEUE_HOST=1`
turns the host off for one process without touching configuration.

Every `reconcileIntervalMs` the host re-plans: a subscription set to `Paused`, a changed lease or partition
mode, or a newly added subscription takes effect without a restart. `GET /health/extensions` (with the
`WorkQueueServerExtension` enabled) reports each subscription's state:

| State | Meaning | Fix |
| --- | --- | --- |
| `Running` | A consumer runtime is claiming | — |
| `Paused` | Subscription, topic or transport is not `Active` | Set it `Active` |
| `HandlerNotRegistered` | No `BaseWorkHandler` under `HandlerKey` in this process | Import the handler's package / check the key |
| `Unsupported` | The transport cannot honor the policy (for example `Ordered` on a cloud topic without staging) | See the reason text |
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
            throw new FatalWorkError('batchUri missing');            // dead-letter now, no retry
        }
        for (const chunk of await loadChunks(message.Payload.batchUri, this.Provider, this.ContextUser)) {
            await applyChunk(chunk, this.Provider, this.ContextUser); // idempotent upserts
            if (!(await context.Heartbeat({ Message: `chunk ${chunk.Index}` }))) {
                return Outcome.Retry('lease lost');                  // stop writing; outcome is discarded
            }
        }
        return Outcome.Complete();
    }
}
```

Rules: handlers must be idempotent; use `this.Provider` / `this.ContextUser` for every data call; any other
thrown error retries with backoff.

## Operating

| Task | CLI | Remote Operation |
| --- | --- | --- |
| Counts | `mj queue stats [--subscription s]` | `WorkQueue.GetSubscriptionStats` |
| Dead letters | `mj queue dead-letters --subscription s` | `WorkQueue.ListDeadLetters` |
| Blocked / awaiting keys | `mj queue partitions --subscription s --condition Blocked` | `WorkQueue.ListPartitions` |
| Retry a dead letter | `mj queue replay --subscription s --delivery id` | `WorkQueue.ReplayDeadLetter` |
| Drop work, or cancel a running handler | `mj queue discard --subscription s --delivery id --reason "…"` | `WorkQueue.DiscardDelivery` |
| Backlog for an autoscaler | (scaler SQL below) | `WorkQueue.GetBacklog` |
| Run work in a container job | `mj queue work --subscription s --once` | — |
| Unstick a sequence gap | `mj queue skip-sequence --subscription s --key k --sequence n --reason "…"` | `WorkQueue.SkipSequence` |
| Check bindings | `mj queue validate-bindings [--transport t]` | `WorkQueue.ValidateBindings` |

API-key callers need `workqueue:read` for reads and `workqueue:operate` for replay, discard and skip.

Discarding a **pending** or **dead-lettered** delivery resolves it immediately. Discarding an **in-flight** delivery
cancels it: the lease is revoked, so the running handler's next heartbeat resolves `false` and its `Signal` aborts;
the row keeps its `Exclusive`/`Ordered` key until the lease expires and then settles `Discarded`. The operation
reports this as `cancelRequested: true`, and cancellation is therefore as fast as the handler notices — bounded by
`LeaseSeconds / 3` for `Auto` heartbeats.

To alert on dead letters, subscribe once at startup: `WorkQueueEngine.Instance.OnDeadLettered(event => …)` (Database
and staged subscriptions; AWS uses its DLQ alarms).

### Container-job workers (KEDA, Azure Container Apps jobs, Kubernetes)

Instead of a long-running host, run one-shot jobs that claim a bounded amount of work and exit:

```bash
mj queue work --subscription venue-import --once                  # claim 1, run, drain, exit 0
mj queue work --subscription venue-import --once --max 5 --concurrency 2
```

**Exit codes.** `0` whenever the host ran — including "the queue was empty", so a scheduler never records a failure
for idleness. Non-zero only when the host could not start (bad configuration, unknown subscription, no registered
handler). `RunOnce` always drains: it resolves after in-flight handlers settle or hit `ShutdownDrainMs`.

**Scaler query.** Give the scaler its own SELECT-only login (plan 05 ships
`scripts/work-queue-scaler-login.sql`) and scale on claimable **plus** in-flight deliveries:

```sql
SELECT COUNT(*) AS Backlog
FROM __mj.WorkQueueDelivery d
JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
WHERE s.Name = 'venue-import'
  AND ((d.Status = 'Pending' AND d.VisibleAt <= SYSDATETIMEOFFSET()) OR d.Status = 'InFlight');
```

Counting `InFlight` is load-bearing: schedulers subtract running executions from the metric, so a `Pending`-only
count scales to zero while work is still running and starves the queue (02 §4.4a). On an `Exclusive`/`Ordered`
subscription this query **over-counts** work queued behind a busy key — cap job parallelism, or scale on
`WorkQueue.GetBacklog`, whose `claimable` applies the partition rules.

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
    template:
      spec:
        terminationGracePeriodSeconds: 60      # >= ShutdownDrainMs so a drain is never cut short
        containers:
          - name: worker
            image: <your mj image>
            args: ["queue", "work", "--subscription", "venue-import", "--once"]
  pollingInterval: 10
  maxReplicaCount: 5
  successfulJobsHistoryLimit: 3
  triggers:
    - type: mssql
      metadata:
        targetValue: "1"
        query: <the scaler query above, on one line>
      authenticationRef:
        name: mj-work-queue-scaler-auth       # the SELECT-only login
```

Azure Container Apps event-driven jobs are the same shape: `replicaTimeout` ≥ the longest handler run,
`replicaRetryLimit: 0`, and the same query as the scale rule.

**Sizing.** `LeaseSeconds` must cover the job's worst heartbeat outage (a database failover), not just its runtime —
a lease that expires while the job is healthy causes a second job to claim the same delivery. `ShutdownDrainMs` must
fit inside the platform's termination grace period.

### Runbook: an `Ordered` key is blocked

1. `mj queue partitions --subscription <s> --condition Blocked` — note `HeadDeliveryID` and `WaitingItems`.
2. `mj queue dead-letters --subscription <s>` — read `Reason` and `LastError` for that delivery.
3. Fix the cause (handler bug → deploy; bad data → correct the source).
4. `mj queue replay --subscription <s> --delivery <HeadDeliveryID> --note "<what changed>"` — the head keeps its
   position; the key resumes when it completes. If the work must be dropped instead:
   `mj queue discard … --reason "<why>"`.
5. Re-run step 1 until the key no longer appears.

### Runbook: a key is `AwaitingSequence` or `GapStalled`

1. `mj queue partitions --subscription <s> --condition GapStalled` — `LastCompletedSequence` + 1 is missing.
2. Confirm with the producer that the sequence will never be published.
3. `mj queue skip-sequence --subscription <s> --key <k> --sequence <n> --reason "<why>"`.

### Soak test (manual, before each release that touches the work queue)

1. Development database of your own; two MJAPI instances with `workQueue.enabled` and different `GRAPHQL_PORT`s.
2. A throwaway topic with one `None`, one `Exclusive` and one `Ordered` subscription on a handler that sleeps
   0–200 ms and fails 2 % of the time (`TransientWorkError`).
3. Publish 50,000 messages over 10 minutes (keys drawn from 500 values) through `POST /work-queue/topics/…/messages`.
4. During the run: `kill -9` one instance twice; restart it each time.
5. Pass when: every delivery ends `Completed` or `DeadLettered`; no `Exclusive`/`Ordered` key ever had two
   `InFlight` rows (`SELECT SubscriptionID, PartitionKey, COUNT(*) FROM WorkQueueDelivery WHERE Status = 'InFlight' GROUP BY SubscriptionID, PartitionKey HAVING COUNT(*) > 1` returns nothing throughout);
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

The extension mounts after MJ's unified authentication. A topic accepts REST publishes only when
`AllowExternalPublish = 1`.

## Publish

```bash
curl -X POST https://api.example.com/work-queue/topics/email.events/messages \
  -H "x-api-key: mj_sk_…" -H "Content-Type: application/json" \
  -d '{"messages":[{"messageId":"…","partitionKey":"subscriber@example.com","attributes":{"eventType":"click"},"payload":{"url":"https://…"},"deduplicationKey":"sg:evt-123"}]}'
```

| Status | When |
| --- | --- |
| 202 | Accepted — inspect each `results[i].status` (`accepted`, `duplicate`, `rejected` with `error.code`, `error.retryable`) |
| 400 | Body shape invalid (1–100 messages, known camelCase fields only) |
| 401 | Not authenticated |
| 403 | API key lacks `workqueue:publish` for the topic, or `TopicNotExternallyPublishable` |
| 404 | Unknown topic |
| 413 | Body larger than `BodyLimit` |
| 500 | Unexpected failure (logged) |

Producers retrying after a timeout **must reuse their `messageId`s**. Treat `duplicate` as success; retry only
items whose `error.retryable` is true.
````

- [ ] **Step 3: Commit**

```bash
git add packages/WorkQueue/engine/README.md packages/WorkQueue/server/README.md
git commit -m "docs(work-queue): runtime, operator runbooks and REST publish README"
```

---

## Contract deltas

Where this plan extends or departs from [03](03-interfaces-and-tables.md) or from names other plans assumed. 03 was not edited.

| # | 03 / other plan says | This plan | Why |
| --- | --- | --- | --- |
| CD1 | 03 §11 `WorkQueueHostConfig` has no reconcile setting | Adds `ReconcileIntervalMs: number` (0 = plan only at start) | Pausing or changing a subscription must take effect without a restart |
| CD2 | 03 §11 `WorkQueueHost(config, engine, contextUser, executor: WorkQueueSqlExecutor, log)` | `executor: WorkQueueExecutorSource` (plan 05) and a required 6th argument `dependencies: WorkQueueHostDependencies { ProviderSource; CreateRuntime?; CreateSweeper?; ResolveHandler?; LoopRegistry? }`; adds `static Active`, `IsStarted`, `Reconcile()`, `RunSweeperOnce()`; `Shutdown()` returns `Promise<void>` | Handlers need a per-delivery provider; plan 07's stager needs transactions. **Plan 08 Task 5 (QU9 helper) must pass `ReconcileIntervalMs` and `{ ProviderSource: new SharedProviderSource(provider) }`** |
| CD3 | 03 §11 `HostedSubscriptionState` only | Engine exports the loop seam: `WorkQueueHostLoopRegistry` (`BaseSingleton`) with `Register(driverClass: string, factory: HostLoopFactory): void`, `Get`, `Unregister`; `type HostLoopFactory = (context: HostLoopContext) => Promise<IHostLoop[]>`; `interface IHostLoop { readonly Name: string; Start(): void; Stop(): Promise<void> }`; `HostLoopContext.Executor` is `WorkQueueExecutorSource` | Plan 07 registers `'AWS'` → `SqsStager`. Plan 07 currently types `Executor` as `WorkQueueSqlExecutor` (a supertype — compatible for reading, but its stager should use `WorkQueueExecutorSource` if it opens transactions) |
| CD4 | 03 §11 `WorkQueueSweeper.RunOnce()` keys `ExpireLeases, GapStalls, PurgeRetention, PurgeDeduplications` | Adds key `SkippedSequences` (plan 05's `DiscardSkippedSequences()`) and an optional 6th constructor argument `options: WorkQueueSweeperOptions` | 02 §4.3 lists skipped-sequence auto-discard as a sweeper duty |
| CD5 | 03 §8 dead-letter output mirrors `DeadLetterRecord` (`Message: WorkMessage`) | Remote-operation row `WorkQueueDeadLetterMessageRow` carries `PayloadJSON: string \| null` instead of `Payload` | CodeGen emits operation types from `.ts` definition files; a recursive JSON type in operation I/O is avoided |
| CD6 | Plan 05 Task 14 said plan 06's bundle runs the conformance kit | **Resolved.** IT94 WR13 builds `CreateDatabaseConformanceHarness(provider, user, DATABASE_TRANSPORT_ID)` and runs plan 04's Vitest-free `RunConformanceChecks(harness)` from `@memberjunction/work-queue-core/testing`; Failed ids fail the check, Skipped ids are logged, `harness.Cleanup()` runs in `finally`. The direct behavior checks WR1–WR12 remain | Plan 04 now exports a framework-free runner; the Vitest wrapper moved to `@memberjunction/work-queue-core/testing/vitest` |
| CD7 | 03 §8 `GetSubscriptionStats` output `{ subscriptions }` | Adds `failures: WorkQueueStatsFailureRow[]` | One unreadable subscription (e.g. AWS access denied) must not hide the others |
| CD8 | 03 §9 lists `413` for bodies over 30 MB | `Settings.BodyLimit` (default `'30mb'`) and `Settings.MaxBatch` (≤ 100) are configurable; `401` added for unauthenticated calls | Deployment control |
| CD9 | — | New MJServer config section `workQueue` and env kill switch `MJ_DISABLE_WORK_QUEUE_HOST=1` | Mirrors `MJ_DISABLE_TASK_GRAPH_DISPATCHER` for integration runs |
| CD10 | Host `InstanceID` | Used for logs, health and `ShutdownName` only; lease owners come from the drivers plan 05's engine creates (`TransportDriverDeps.InstanceID` is not set by the host) | The engine owns driver construction; if lease owners should equal the host instance ID, plan 05's `GetDriver` needs an instance-ID input |
| CD12 | 03 §11 `RunOnce({ MaxDeliveries?, IdleExitMs?, MaxDurationMs? })` | Implemented with a claim budget enforced **before** each `Receive` (a wrapper consumer), `Processed` = deliveries received, default `IdleExitMs` 5,000, and `WorkQueueHostDependencies.RunOnceTickMs` (default 50 ms) as the exit-loop poll seam. `RunOnce` throws on a started host or `MaxDeliveries < 1`, and always drains through `Shutdown()` | A job must never over-claim at `Concurrency > 1`, and the loop needs a test seam |
| CD13 | 03 §8 `WorkQueue.GetBacklog` | Added as the eighth operation (metadata, types, server class) and `WorkQueueOperatorService.GetBacklog`, delegating to plan 05's `WorkQueueEngine.GetBacklog`. `WorkQueueOperatorEngine` gains `GetBacklog(subscriptionName)` | The autoscaler metric must be reachable over GraphQL and the CLI |
| CD14 | 03 §8 `DiscardDelivery` output `{ supported; discarded; cancelRequested }` | Implemented; `cancelRequested` comes from `OperatorResult.CancelRequested === true`. An in-flight discard is a **cancel**: the row stays `InFlight` until its lease expires (03 §7), so `discarded: true` here means "the cancel was recorded", not "the row is already `Discarded`" | Callers (and IT94 WR15) need to tell the two paths apart |
| CD15 | Plan 05 had not yet landed Revision 3 when this plan was first revised | **Reconciled.** Plan 05 landed `WorkQueueEngine.GetBacklog`/`OnDeadLettered`, `ITransportOperator.Discard` returning `CancelRequested`, the `CancelRequestedAt` column and its `ExpireLeases` rule, the delivery-state entity save guards (whose `Save()` failure message must contain "transport driver" — IT94 WR14 asserts that), and the scaler login script at **`scripts/work-queue-scaler-login.sql`** (flat `scripts/`, not `scripts/sql/`) | Names verified against plan 05 |
| CD11 | 03 §11 `WorkQueueHostEngine` not defined | Host depends on a structural subset including plan 05's `GetDatabaseDriver()` and `OnPublished()` | Testable without the singleton |
| CD16 | 03 §11 exposes `OnDeadLettered` (subscribe) but no way for a non-driver to **emit** | `WorkQueueHostEngine` gains optional `NotifyDeadLettered?: (event: DeadLetteredEvent) => void`, and the host passes it to `WorkQueueSweeper`. Plan 05's `WorkQueueEngine` must expose that method publicly (it already builds the notifier for `TransportDriverDeps`, ND15); until it does, sweeper-found dead letters raise no event and everything else still works | Lease-expiry dead letters the sweeper finds were never seen by a driver, so they would otherwise never reach `OnDeadLettered` (03 §11) |
| CD17 | 03 §11 `WorkQueueSweeper(executor, ledger, engine, contextUser, log)` | `WorkQueueSweeperEngine` also needs `Subscriptions` (to name a dead-lettered delivery's subscription), and the constructor takes a 7th argument `notifyDeadLettered?`. `ExpireLeases` is now read with `ExecuteRows<ExpiredDeadLetterRow>` and its reported count is **dead-lettered rows**, not all expired rows (plan 05 ND14) | The statement returns rows now; the count changed meaning |
| CD18 | 03 §0/§11 base/server split | No call site in this plan changes: every metadata member the host, operator service, CLI and IT94 use is proxied by the server `WorkQueueEngine`, and nothing here imports `@memberjunction/work-queue-base`. Task 11 documents why it needs no manifest entry | Keeps the split invisible to the server tier while leaving base importable by Explorer (09b) |
| CD19 | 03 §5 `TransportCapabilities` | The fakes in `runtimeFakes.ts` now carry `CancelInFlight` and `Filters: FilterSupport` (03 §4.1), mirroring plan 05's `DATABASE_TRANSPORT_CAPABILITIES` and plan 07's AWS constant | Capability objects must type-check against the current contract |
