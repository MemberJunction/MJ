# Work Queue — Core Implementation Plan (`@memberjunction/work-queue-core`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@memberjunction/work-queue-core` — the transport-neutral contracts, publish validation, filters, backoff, consumer runtime, in-memory reference transport, transport conformance kit and REST publisher client — with **zero** `@memberjunction/*` dependencies, so Lambda consumers stay lightweight.

**Architecture:** Every other work-queue package builds on this one. Contract types mirror spec 03 §1–§5 and §10 exactly. Pure helpers (`ValidatePublishRequest`, `MatchesFilter`, `ComputeBackoffSeconds`, `SubscriptionUnsupportedReason`) are shared by every publish and consume path. `ConsumerRuntime` drives any `ITransportConsumer`: it receives deliveries, runs handlers through `DeliveryExecution` (lease heartbeats, processing caps, abort signals, outcome mapping) and settles them. `InMemoryTransport` implements the full Database-transport semantics in memory and is the reference the conformance kit (`@memberjunction/work-queue-core/testing`) is proven against. `WorkQueueApiPublisher` is the `fetch`-based client for the REST publish endpoint.

**Tech Stack:** TypeScript 5.9 (ESM, `strict`), Vitest 4, Node 22 globals (`fetch`, `AbortController`, `crypto.randomUUID`, `structuredClone`, `TextEncoder`). No runtime dependencies.

**Spec:** [`plans/work-queue-1/03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative contract) and [`plans/work-queue-1/02-implementation-overview.md`](02-implementation-overview.md). Read both before starting. Where this plan and 03 disagree, 03 wins — except the items listed in [Contract deltas](#contract-deltas), which must be folded into 03.

## Global Constraints

- **Package manager:** pnpm only. Run `pnpm install` at the repository root only; never inside a package; never `npm install`.
- **Per-package commands:** `cd packages/WorkQueue/core && pnpm test` and `cd packages/WorkQueue/core && pnpm run build`. Do not build single packages with turbo from the root.
- **New package shape** (verified against `packages/TaskGraph` and `packages/Scheduling/*`): `"type": "module"`; build script `tsc && tsc-alias -f`; `tsconfig.json` extends `../../../tsconfig.server.json`; `vitest.config.ts` merges `../../../vitest.shared`; tests in `src/__tests__/*.test.ts`; **extensionless** relative imports (`tsc-alias -f` adds `.js` for native ESM).
- **Versions:** the package version equals `packages/MJCore/package.json` `version` (`6.1.0` when this plan was written). Dev dependencies: `@types/node` `24.10.11`, `typescript` `^5.9.3`, `vitest` `^4.0.18` (the root's version).
- **Zero MJ dependencies:** no `@memberjunction/*` in any dependency field and no `@memberjunction/*` import anywhere under `src/`. No runtime `dependencies` at all. Enforced by `src/__tests__/dependencyGuard.test.ts` (Task 1).
- **Code rules:** no `any`; `unknown` only at trust boundaries (parsed JSON, thrown values, `fetch` bodies) and narrowed immediately; PascalCase public members, camelCase private; static imports only; functions around 30–40 lines.
- **Branch:** work on `feat/work-queue`, created from `origin/next` **without** tracking `next`, and pushed so it tracks the same-named remote (see Pre-flight). Verify with `git branch -vv` before every push.
- **Commit steps:** run them only when the user has approved commits for this execution session (repo rule: no commits without explicit approval). Otherwise stage the files and report.
- **Changeset:** this plan changes no database or metadata, so its changeset is `patch` (Task 10).

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | Scaffold, workspace glob, dependency guard, contract types, errors, outcomes | Package builds; guard, error and outcome tests pass |
| 2 | Publish validation and envelope building | `ValidatePublishRequest`, `BuildWorkMessage`, `SerializedEnvelopeBytes` tested |
| 3 | Filters (`CompositeFilterDescriptor`, restricted) | `ParseSubscriptionFilter`, `MatchesFilter`, `FilterFields` tested |
| 4 | Backoff and subscription compatibility | `ComputeBackoffSeconds`, `SubscriptionUnsupportedReason` tested |
| 5 | Outcome mapping and `DeliveryExecution` | Handler outcomes, heartbeat retry, caps, lease loss and cancel tested with fake timers |
| 6 | `ConsumerRuntime` | Receive loop, concurrency, idle polling, `Kick`, `Stop`, `ProcessBatch` tested |
| 7 | `InMemoryTransport` | Full Database-like semantics in memory, including in-flight cancel, tested |
| 8 | Conformance kit (`./testing`, `./testing/vitest`) | 27 runner-agnostic cases pass against `InMemoryTransport` via `RunConformanceChecks` and the vitest wrapper |
| 9 | REST contract mapping and `WorkQueueApiPublisher` | Mapping and HTTP client tested with a fake `fetch` |
| 10 | Exports, README, changeset, full verification | Build, tests, ESM guard and changeset check green |

## Pre-flight

- [ ] Create the branch without tracking `next`, then publish it so it tracks its own name:

```bash
git fetch origin
git switch --no-track -c feat/work-queue origin/next
git push -u origin feat/work-queue
git branch -vv   # expect: * feat/work-queue … [origin/feat/work-queue]
```

  If `feat/work-queue` already exists (another plan in this set started it), `git switch feat/work-queue && git pull` instead, and still confirm `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] `pnpm install` at the repository root succeeds.
- [ ] `cd packages/MJGlobal && pnpm test` passes (baseline toolchain health check).

## File structure

```
pnpm-workspace.yaml                                           Task 1 (add 'packages/WorkQueue/*')
package.json                                                  Task 1 (add "packages/WorkQueue/*" to workspaces)
.changeset/work-queue-core-package.md                         Task 10

packages/WorkQueue/core/
  package.json · tsconfig.json · vitest.config.ts             Task 1 (exports extended in Task 8)
  README.md                                                   Task 10
  src/index.ts                                                Task 1, extended by Tasks 2–7, 9
  src/envelope.ts · src/publishing.ts · src/policy.ts         Task 1
  src/filterTypes.ts · src/handler.ts · src/errors.ts         Task 1
  src/transport.ts · src/operator.ts · src/manifest.ts        Task 1
  src/validation.ts                                           Task 2
  src/filter.ts                                               Task 3
  src/backoff.ts · src/compatibility.ts                       Task 4
  src/runtime/types.ts · src/runtime/outcomes.ts              Task 5
  src/runtime/DeliveryExecution.ts                            Task 5
  src/runtime/ConsumerRuntime.ts                              Task 6
  src/memory/InMemoryStore.ts · src/memory/InMemoryConsumer.ts
  src/memory/InMemoryOperator.ts · src/memory/InMemoryTransport.ts   Task 7
  src/testing/fixtures.ts                                     Task 7
  src/testing/assertions.ts · src/testing/ConformanceHarness.ts · src/testing/ConformanceScenario.ts   Task 8
  src/testing/conformanceCases.ts · src/testing/RunConformanceChecks.ts · src/testing/index.ts        Task 8
  src/testing/vitest.ts (only vitest import in the package)   Task 8
  src/api/restContract.ts · src/api/WorkQueueApiPublisher.ts  Task 9
  src/__tests__/dependencyGuard.test.ts · errors.test.ts · publishing.test.ts   Task 1
  src/__tests__/validation.test.ts                            Task 2
  src/__tests__/filter.test.ts                                Task 3
  src/__tests__/backoff.test.ts · compatibility.test.ts       Task 4
  src/__tests__/fakes.ts                                      Task 5
  src/__tests__/outcomes.test.ts · DeliveryExecution.test.ts  Task 5
  src/__tests__/ConsumerRuntime.test.ts                       Task 6
  src/__tests__/InMemoryTransport.test.ts                     Task 7
  src/__tests__/conformanceAssertions.test.ts · RunConformanceChecks.test.ts · conformance.test.ts   Task 8
  src/__tests__/restContract.test.ts · WorkQueueApiPublisher.test.ts   Task 9
```

---

### Task 1: Scaffold, workspace glob, dependency guard, contract types, errors and outcomes

**Files:**
- Modify: `pnpm-workspace.yaml` (append `'packages/WorkQueue/*'` after `'packages/eSignature/Providers/*'`), `package.json` (append `"packages/WorkQueue/*"` after `"packages/eSignature/Providers/*"` in `workspaces`)
- Create: `packages/WorkQueue/core/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/WorkQueue/core/src/envelope.ts`, `publishing.ts`, `policy.ts`, `filterTypes.ts`, `handler.ts`, `errors.ts`, `transport.ts`, `operator.ts`, `manifest.ts`, `index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/dependencyGuard.test.ts`, `errors.test.ts`, `publishing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `@memberjunction/work-queue-core`):
  - Spec 03 §1: `WorkJson`, `WorkPayloadRef`, `WorkMessage<TPayload>`
  - Spec 03 §2: `PublishRequest<TPayload>`, `PublishStatus`, `PublishError`, `PublishResult`, `IWorkPublisher`; plus `PublishErrorCodes` (const object of every code string), `PublishErrorCode`, `IsRetryablePublishErrorCode(code: string): boolean`, `CreatePublishError(code: string, message: string): PublishError`, `RejectedPublishResult(messageID: string, code: string, message: string): PublishResult`
  - Spec 03 §3: `WorkProgress`, `WorkLogger`, `WorkContext`, `WorkOutcome`, `Outcome`, `WorkHandler<TPayload>`, `FatalWorkError`, `TransientWorkError`, `WorkQueueConfigurationError`; plus `NULL_WORK_LOGGER: WorkLogger`
  - Spec 03 §3.1: `PartitionMode`, `OrderingMode`, `HeartbeatMode`, `HostType`, `DeliveryStatus`, `SubscriptionPolicy`; plus `SUBSCRIPTION_POLICY_DEFAULTS`
  - Spec 03 §4 types: `FilterOperator`, `FilterRule`, `FilterGroup`, `SubscriptionFilter`, `FilterSupport`
  - Spec 03 §5: `TopicBinding`, `SubscriptionBinding`, `ReceivedDelivery<TPayload>`, `SettleResult`, `TransportCapabilities`, `ITransportDriver`, `DatabasePublishOptions`, `ITransportConsumer<TPayload>`, `BindingValidationIssue`
  - Spec 03 §5.2: `SubscriptionStats`, `DeadLetterRecord`, `PartitionCondition`, `PartitionStateRecord`, `Page<T>`, `OperatorResult`, `ITransportOperator`
  - Spec 03 §10: `TopologyManifest`, `ManifestTopic`, `ManifestSubscription`, `BindingImport`

- [ ] **Step 1: Add the workspace glob**

In `pnpm-workspace.yaml`, under `packages:`, add a line after `  - 'packages/eSignature/Providers/*'`:

```yaml
  - 'packages/WorkQueue/*'
```

In the root `package.json` `workspaces` array, add after `"packages/eSignature/Providers/*"` (add a comma to the previous line):

```json
    "packages/WorkQueue/*"
```

The comment at the top of `pnpm-workspace.yaml` requires the two lists to stay in sync.

- [ ] **Step 2: Create the package files**

`packages/WorkQueue/core/package.json`:

```json
{
  "name": "@memberjunction/work-queue-core",
  "type": "module",
  "version": "6.1.0",
  "description": "MemberJunction: durable work queue contracts, consumer runtime, in-memory transport and conformance kit. No MemberJunction runtime dependencies.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "/dist"
  ],
  "scripts": {
    "build": "tsc && tsc-alias -f",
    "watch": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "MemberJunction.com",
  "license": "BUSL-1.1",
  "devDependencies": {
    "@types/node": "24.10.11",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/MemberJunction/MJ"
  }
}
```

`packages/WorkQueue/core/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitReturns": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/__tests__/**", "src/**/*.test.ts"]
}
```

`packages/WorkQueue/core/vitest.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
    sharedConfig,
    defineProject({
        test: {
            environment: 'node',
        },
    }),
);
```

Run: `pnpm install` (repository root)
Expected: succeeds; `pnpm ls -r --depth -1 | grep work-queue-core` lists `@memberjunction/work-queue-core@6.1.0`.

- [ ] **Step 3: Write the failing tests**

`packages/WorkQueue/core/src/__tests__/dependencyGuard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const INTERNAL_SCOPE = '@memberjunction/';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const INTERNAL_IMPORT_PATTERNS = [
    /from\s+['"]@memberjunction\//,
    /import\s*\(\s*['"]@memberjunction\//,
    /require\s*\(\s*['"]@memberjunction\//,
];

function readManifest(): object {
    const parsed: unknown = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('package.json is not a JSON object');
    }
    return parsed;
}

function dependencyNames(manifest: object, field: string): string[] {
    const value: unknown = Reflect.get(manifest, field);
    if (typeof value !== 'object' || value === null) {
        return [];
    }
    return Object.keys(value);
}

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return listSourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('work-queue-core dependency guard', () => {
    it('declares no @memberjunction package in any dependency field', () => {
        const manifest = readManifest();
        const internal = DEPENDENCY_FIELDS.flatMap((field) =>
            dependencyNames(manifest, field).filter((name) => name.startsWith(INTERNAL_SCOPE)),
        );
        expect(internal).toEqual([]);
    });

    it('declares no runtime dependencies, so Lambda bundles stay minimal', () => {
        expect(dependencyNames(readManifest(), 'dependencies')).toEqual([]);
    });

    it('imports no @memberjunction module anywhere under src', () => {
        const offenders = listSourceFiles(join(PACKAGE_ROOT, 'src')).filter((file) => {
            const text = readFileSync(file, 'utf8');
            return INTERNAL_IMPORT_PATTERNS.some((pattern) => pattern.test(text));
        });
        expect(offenders).toEqual([]);
    });
});
```

`packages/WorkQueue/core/src/__tests__/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FatalWorkError, TransientWorkError, WorkQueueConfigurationError } from '../errors';
import { Outcome } from '../handler';

describe('work-queue errors', () => {
    it('FatalWorkError is an Error with its own name', () => {
        const error = new FatalWorkError('payload is malformed');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(FatalWorkError);
        expect(error.name).toBe('FatalWorkError');
        expect(error.message).toBe('payload is malformed');
    });

    it('TransientWorkError carries an optional retry-after', () => {
        expect(new TransientWorkError('busy', 45).RetryAfterSeconds).toBe(45);
        expect(new TransientWorkError('busy').RetryAfterSeconds).toBeUndefined();
        expect(new TransientWorkError('busy').name).toBe('TransientWorkError');
    });

    it('WorkQueueConfigurationError is distinguishable from handler errors', () => {
        const error = new WorkQueueConfigurationError('unknown topic');
        expect(error.name).toBe('WorkQueueConfigurationError');
        expect(error).not.toBeInstanceOf(FatalWorkError);
    });
});

describe('Outcome helpers', () => {
    it('builds Complete', () => {
        expect(Outcome.Complete()).toEqual({ Kind: 'Complete' });
    });

    it('builds Retry without undefined properties', () => {
        expect(Outcome.Retry()).toEqual({ Kind: 'Retry' });
        expect(Object.keys(Outcome.Retry())).toEqual(['Kind']);
        expect(Outcome.Retry('rate limited', 30)).toEqual({ Kind: 'Retry', Reason: 'rate limited', DelaySeconds: 30 });
    });

    it('builds DeadLetter', () => {
        expect(Outcome.DeadLetter('poison')).toEqual({ Kind: 'DeadLetter', Reason: 'poison' });
    });
});
```

`packages/WorkQueue/core/src/__tests__/publishing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreatePublishError, IsRetryablePublishErrorCode, PublishErrorCodes, RejectedPublishResult } from '../publishing';

describe('publish error helpers', () => {
    it('marks only transient transport codes as retryable', () => {
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.TopicUnbound)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.TransportUnavailable)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.InvalidResponse)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.PayloadTooLarge)).toBe(false);
        expect(IsRetryablePublishErrorCode('SomethingElse')).toBe(false);
    });

    it('builds errors and rejected results with the retryable flag derived from the code', () => {
        expect(CreatePublishError('TransportUnavailable', 'down')).toEqual({ Code: 'TransportUnavailable', Message: 'down', Retryable: true });
        expect(RejectedPublishResult('m-1', 'InvalidAttributes', 'bad')).toEqual({
            MessageID: 'm-1',
            Status: 'Rejected',
            Error: { Code: 'InvalidAttributes', Message: 'bad', Retryable: false },
        });
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: FAIL — `dependencyGuard` passes (3), but `errors.test.ts` and `publishing.test.ts` fail with unresolved imports `../errors`, `../handler`, `../publishing`.

- [ ] **Step 5: Write `src/envelope.ts`**

```typescript
/** JSON-safe value used for inline payloads and progress checkpoints. */
export type WorkJson =
    | string
    | number
    | boolean
    | null
    | WorkJson[]
    | { [key: string]: WorkJson };

/** Reference to data held outside the queue (claim-check). The queue never dereferences it. */
export interface WorkPayloadRef {
    /** e.g. s3://bucket/key, https://…, mjstorage://{FileStorageAccountID}/{objectKey} */
    Uri: string;
    ContentType?: string;
    SizeBytes?: number;
    /** e.g. "sha256:…" */
    Checksum?: string;
}

/** The message as delivered to a handler. Identical on every transport. */
export interface WorkMessage<TPayload extends WorkJson = WorkJson> {
    /** UUID. Stable across redeliveries and replays. Producer-supplied or generated at publish. */
    MessageID: string;
    Topic: string;
    PartitionKey?: string;
    /** Present only on ExplicitSequence topics. Starts at 1 per PartitionKey. */
    Sequence?: number;
    /**
     * ≤ 10 entries; keys 1–64 chars [A-Za-z0-9_-] (no dots: a dotted name is MJ's `source.field` filter form,
     * which filters reject, so a dotted attribute would be unfilterable); values ≤ 256 chars.
     * The only fields filters see.
     */
    Attributes: Record<string, string>;
    Payload?: TPayload;
    PayloadRef?: WorkPayloadRef;
    CorrelationID?: string;
    /** ISO-8601 UTC, assigned by the publisher (MJ), not the producer. */
    PublishedAt: string;
}
```

- [ ] **Step 6: Write `src/publishing.ts`**

```typescript
import type { WorkJson, WorkPayloadRef } from './envelope';

export interface PublishRequest<TPayload extends WorkJson = WorkJson> {
    MessageID?: string;
    PartitionKey?: string;
    Sequence?: number;
    Attributes?: Record<string, string>;
    Payload?: TPayload;
    PayloadRef?: WorkPayloadRef;
    CorrelationID?: string;
    /** Suppresses a second publish with the same key to the same topic inside the TTL window. */
    DeduplicationKey?: string;
    /** Default: topic DefaultDeduplicationTTLSeconds. */
    DeduplicationTTLSeconds?: number;
}

export type PublishStatus = 'Accepted' | 'Duplicate' | 'Rejected';

export interface PublishError {
    Code: string;
    Message: string;
    Retryable: boolean;
}

export interface PublishResult {
    /** For Duplicate: the MessageID of the publish that owns the key (or the existing MessageID). */
    MessageID: string;
    Status: PublishStatus;
    Error?: PublishError;
}

export interface IWorkPublisher {
    /** Batch publish. Results are positionally aligned with requests. Partial success is possible. */
    Publish<TPayload extends WorkJson>(topic: string, requests: PublishRequest<TPayload>[]): Promise<PublishResult[]>;
}

/**
 * Every publish error code used anywhere in the work queue (spec 03 §1.1). Core produces the
 * envelope codes; the engine, drivers, REST extension and API client produce the rest.
 */
export const PublishErrorCodes = {
    PayloadTooLarge: 'PayloadTooLarge',
    InvalidAttributes: 'InvalidAttributes',
    InvalidPayload: 'InvalidPayload',
    InvalidPartitionKey: 'InvalidPartitionKey',
    SequenceRequired: 'SequenceRequired',
    InvalidSequence: 'InvalidSequence',
    SequenceNotAllowed: 'SequenceNotAllowed',
    InvalidMessageID: 'InvalidMessageID',
    InvalidDeduplication: 'InvalidDeduplication',
    TopicNotFound: 'TopicNotFound',
    TopicDisabled: 'TopicDisabled',
    TopicNotExternallyPublishable: 'TopicNotExternallyPublishable',
    Forbidden: 'Forbidden',
    TopicUnbound: 'TopicUnbound',
    MessageIDConflict: 'MessageIDConflict',
    DuplicateSequence: 'DuplicateSequence',
    TransportUnavailable: 'TransportUnavailable',
    BadRequest: 'BadRequest',
    Unauthorized: 'Unauthorized',
    InvalidResponse: 'InvalidResponse',
} as const;

export type PublishErrorCode = (typeof PublishErrorCodes)[keyof typeof PublishErrorCodes];

const RETRYABLE_PUBLISH_ERROR_CODES: ReadonlySet<string> = new Set<string>([
    PublishErrorCodes.TopicUnbound,
    PublishErrorCodes.TransportUnavailable,
    PublishErrorCodes.InvalidResponse,
]);

export function IsRetryablePublishErrorCode(code: string): boolean {
    return RETRYABLE_PUBLISH_ERROR_CODES.has(code);
}

export function CreatePublishError(code: string, message: string): PublishError {
    return { Code: code, Message: message, Retryable: IsRetryablePublishErrorCode(code) };
}

export function RejectedPublishResult(messageID: string, code: string, message: string): PublishResult {
    return { MessageID: messageID, Status: 'Rejected', Error: CreatePublishError(code, message) };
}
```

- [ ] **Step 7: Write `src/policy.ts` and `src/filterTypes.ts`**

`src/policy.ts`:

```typescript
export type PartitionMode = 'None' | 'Exclusive' | 'Ordered';
export type OrderingMode = 'PublishOrder' | 'ExplicitSequence';
export type HeartbeatMode = 'Auto' | 'Manual';
export type HostType = 'MJWorker' | 'External';
export type DeliveryStatus = 'Pending' | 'InFlight' | 'Completed' | 'DeadLettered' | 'Discarded';

export interface SubscriptionPolicy {
    SubscriptionName: string;
    TopicName: string;
    OrderingMode: OrderingMode;
    PartitionMode: PartitionMode;
    /** default 5 */
    MaxAttempts: number;
    /** default 10 */
    BackoffBaseSeconds: number;
    /** default 900 */
    BackoffMaxSeconds: number;
    /** default 60 */
    LeaseSeconds: number;
    /** default 'Auto' */
    HeartbeatMode: HeartbeatMode;
    MaxProcessingSeconds?: number;
    SequenceGapAlertSeconds?: number;
}

/** Column defaults from spec 03 §6.3, for callers that build policies outside the database. */
export const SUBSCRIPTION_POLICY_DEFAULTS: Readonly<
    Pick<SubscriptionPolicy, 'PartitionMode' | 'MaxAttempts' | 'BackoffBaseSeconds' | 'BackoffMaxSeconds' | 'LeaseSeconds' | 'HeartbeatMode'>
> = {
    PartitionMode: 'None',
    MaxAttempts: 5,
    BackoffBaseSeconds: 10,
    BackoffMaxSeconds: 900,
    LeaseSeconds: 60,
    HeartbeatMode: 'Auto',
};
```

`src/filterTypes.ts`:

```typescript
/**
 * Subscription filters are MJ's `CompositeFilterDescriptor` JSON (the shape `mj-filter-builder` edits and user views
 * persist), restricted to what every transport can express — spec 03 §4. `field` is an envelope attribute name.
 */
export type FilterOperator = 'eq' | 'neq' | 'startswith' | 'isnull' | 'isnotnull';

export interface FilterRule {
    field: string;
    operator: FilterOperator;
    /** Normalised to a string when parsed; absent for isnull/isnotnull. */
    value?: string | number | boolean | null;
}

export interface FilterGroup {
    logic: 'and' | 'or';
    filters: (FilterRule | FilterGroup)[];
}

export type SubscriptionFilter = FilterGroup;

/** What one transport accepts; drivers publish this as `TransportCapabilities.Filters` (spec 03 §4.1). */
export interface FilterSupport {
    Operators: FilterOperator[];
    /** A nested group may only be a single-field OR of `eq`. */
    SingleFieldOrGroups: boolean;
    MaxFields: number;
    MaxValues: number;
}
```

- [ ] **Step 8: Write `src/handler.ts` and `src/errors.ts`**

`src/handler.ts`:

```typescript
import type { WorkJson, WorkMessage } from './envelope';

export interface WorkProgress {
    /** 0..100 */
    Percent?: number;
    /** ≤ 500 chars */
    Message?: string;
    /** Small; persisted by the Database transport only. */
    Checkpoint?: WorkJson;
}

export interface WorkLogger {
    Info(message: string, data?: Record<string, WorkJson>): void;
    Warn(message: string, data?: Record<string, WorkJson>): void;
    Error(message: string, error?: Error, data?: Record<string, WorkJson>): void;
}

export interface WorkContext {
    readonly SubscriptionName: string;
    /** Database/staged: WorkQueueDelivery.ID; SQS: SQS MessageId */
    readonly DeliveryID: string;
    /** 1-based */
    readonly Attempt: number;
    readonly MaxAttempts: number;
    readonly IsReplay: boolean;
    /** Aborted on lease loss (including operator cancel), MaxProcessingSeconds, or host shutdown. */
    readonly Signal: AbortSignal;
    /**
     * Renews the lease and records progress. Resolves false once the lease is lost — either taken over after
     * expiry, or revoked by an operator cancel (spec 03 §7) — and the handler must stop. A transient transport
     * failure does not resolve false: it is retried on the next tick while the lease is still valid.
     */
    Heartbeat(progress?: WorkProgress): Promise<boolean>;
    readonly Log: WorkLogger;
}

export type WorkOutcome =
    | { Kind: 'Complete' }
    | { Kind: 'Retry'; DelaySeconds?: number; Reason?: string }
    | { Kind: 'DeadLetter'; Reason: string };

export const Outcome = {
    Complete(): WorkOutcome {
        return { Kind: 'Complete' };
    },
    Retry(reason?: string, delaySeconds?: number): WorkOutcome {
        const outcome: { Kind: 'Retry'; DelaySeconds?: number; Reason?: string } = { Kind: 'Retry' };
        if (reason !== undefined) {
            outcome.Reason = reason;
        }
        if (delaySeconds !== undefined) {
            outcome.DelaySeconds = delaySeconds;
        }
        return outcome;
    },
    DeadLetter(reason: string): WorkOutcome {
        return { Kind: 'DeadLetter', Reason: reason };
    },
};

/** Core handler interface — external (e.g. Lambda) handlers implement this directly. */
export interface WorkHandler<TPayload extends WorkJson = WorkJson> {
    Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}

/** Logger that discards everything; the default where no logger is supplied. */
export const NULL_WORK_LOGGER: WorkLogger = {
    Info: () => undefined,
    Warn: () => undefined,
    Error: () => undefined,
};
```

`src/errors.ts`:

```typescript
/** Thrown by a handler to dead-letter immediately (equivalent to returning Outcome.DeadLetter). */
export class FatalWorkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalWorkError';
    }
}

/** Thrown by a handler to retry, optionally after a delay (equivalent to Outcome.Retry). */
export class TransientWorkError extends Error {
    public readonly RetryAfterSeconds?: number;

    constructor(message: string, retryAfterSeconds?: number) {
        super(message);
        this.name = 'TransientWorkError';
        this.RetryAfterSeconds = retryAfterSeconds;
    }
}

/** Configuration problems (unknown topic, unsupported policy on a transport, invalid filter). */
export class WorkQueueConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkQueueConfigurationError';
    }
}
```

- [ ] **Step 9: Write `src/transport.ts`, `src/operator.ts` and `src/manifest.ts`**

`src/transport.ts`:

```typescript
import type { WorkJson, WorkMessage } from './envelope';
import type { FilterSupport, SubscriptionFilter } from './filterTypes';
import type { WorkProgress } from './handler';
import type { ITransportOperator } from './operator';
import type { DeliveryStatus, HostType, OrderingMode, SubscriptionPolicy } from './policy';
import type { PublishResult } from './publishing';

export interface TopicBinding {
    TopicName: string;
    OrderingMode: OrderingMode;
    IsFifo: boolean;
    MaxPayloadBytes: number;
    /** e.g. { SnsTopicArn } */
    Config: Record<string, WorkJson>;
}

export interface SubscriptionBinding {
    Policy: SubscriptionPolicy;
    Filter: SubscriptionFilter | null;
    HostType: HostType;
    /** e.g. { Region, QueueUrl, QueueArn, DeadLetterQueueUrl, DeadLetterQueueArn, IsFifo } */
    Config: Record<string, WorkJson>;
}

export interface ReceivedDelivery<TPayload extends WorkJson = WorkJson> {
    Message: WorkMessage<TPayload>;
    DeliveryID: string;
    /** Database: per-claim UUID; SQS: receipt handle */
    LeaseToken: string;
    Attempt: number;
    IsReplay: boolean;
    LeaseExpiresAt: Date;
}

export type SettleResult =
    | { Kind: 'Settled'; DeliveryID: string; Status: DeliveryStatus }
    | { Kind: 'LeaseLost'; DeliveryID: string }
    | { Kind: 'Failed'; DeliveryID: string; Error: string };

export interface TransportCapabilities {
    /** Filter operators and structure this transport accepts (spec 03 §4.1). */
    Filters: FilterSupport;
    /** Database true; AWS false */
    DetectsMessageIDDuplicates: boolean;
    /** Database true; AWS false */
    PersistsProgress: boolean;
    /** Database true; AWS false (engine stages Ordered — spec 03 §5.1) */
    SupportsOrdered: boolean;
    /** Database false; AWS true */
    SupportsExternalHosts: boolean;
    /** Database true; AWS false */
    CancelPending: boolean;
    /** Cancel an InFlight delivery by revoking its lease (spec 03 §7). Database true; AWS false. */
    CancelInFlight: boolean;
    /** Database true; AWS false */
    ListPartitions: boolean;
    /** Database Full; AWS BestEffort (≤ 100 scanned) */
    PeekDeadLetters: 'Full' | 'BestEffort';
    /** Database true; AWS true (scan-based) */
    ReplaySingleDeadLetter: boolean;
    /** Database true; AWS false */
    CompletedCounts: boolean;
    /** Database 2147483647; AWS 43200 */
    MaxRetryDelaySeconds: number;
}

/** Opaque to core; the Database driver narrows it (transaction enlistment, PublishedByUserID). Cloud drivers ignore it. */
export interface DatabasePublishOptions {
    readonly Kind: 'Database';
}

export interface ITransportDriver {
    readonly Name: string;
    readonly Capabilities: TransportCapabilities;
    Publish(
        topic: TopicBinding,
        messages: WorkMessage[],
        subscriptions: SubscriptionBinding[],
        opts?: DatabasePublishOptions,
    ): Promise<PublishResult[]>;
    OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload>;
    Operator(): ITransportOperator;
    ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]>;
}

export interface ITransportConsumer<TPayload extends WorkJson = WorkJson> {
    Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]>;
    ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<'Held' | 'Lost'>;
    Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
    Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult>;
    DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult>;
    /** Database: no attempt consumed. SQS: receive already counted; absorbed by the MaxAttempts + 2 redrive margin. */
    Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
    Close(): Promise<void>;
}

export interface BindingValidationIssue {
    Severity: 'Error' | 'Warning';
    Subject: string;
    Message: string;
}
```

`src/operator.ts`:

```typescript
import type { WorkMessage } from './envelope';
import type { SubscriptionBinding } from './transport';

export interface SubscriptionStats {
    SubscriptionName: string;
    Pending: number;
    InFlight: number;
    DeadLettered: number;
    /** null when not applicable/unsupported */
    BlockedKeys: number | null;
    /** AWS: requires cloudwatch:GetMetricData, else null */
    OldestPendingAgeSeconds: number | null;
    /** null unless CompletedCounts */
    CompletedLastHour: number | null;
    AsOf: string;
}

export interface DeadLetterRecord {
    /** Database/staged: Delivery.ID; AWS: envelope MessageID */
    DeliveryID: string;
    Message: WorkMessage;
    PartitionKey: string | null;
    Attempts: number;
    /** handler reason, 'MaxAttemptsExceeded', 'LeaseExpired', 'HandlerNotRegistered', 'RedrivePolicy', … */
    Reason: string;
    LastError: string | null;
    DeadLetteredAt: string | null;
    BlocksKey: boolean;
}

export type PartitionCondition = 'Idle' | 'InFlight' | 'Blocked' | 'AwaitingSequence' | 'GapStalled';

export interface PartitionStateRecord {
    PartitionKey: string;
    Condition: PartitionCondition;
    HeadDeliveryID: string | null;
    LastCompletedSequence: number | null;
    AwaitingSequenceSince: string | null;
    WaitingItems: number;
}

export interface Page<T> {
    Items: T[];
    NextCursor: string | null;
}

export type OperatorResult =
    | { Supported: false }
    /** CancelRequested: an InFlight delivery was revoked (lease token rotated); it settles as Discarded when its lease expires. */
    | { Supported: true; Changed: boolean; CancelRequested?: boolean };

export interface ITransportOperator {
    GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats>;
    ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null>;
    /** condition null = all non-Idle keys. Returns null when !ListPartitions. */
    ListPartitions(
        subscription: SubscriptionBinding,
        condition: PartitionCondition | null,
        cursor: string | null,
        pageSize: number,
    ): Promise<Page<PartitionStateRecord> | null>;
    Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult>;
    /** Pending (requires CancelPending) or DeadLettered → Discarded immediately.
     *  InFlight (requires CancelInFlight) → lease revoked, `CancelRequested: true` (spec 03 §7). */
    Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult>;
    SkipSequence(
        subscription: SubscriptionBinding,
        partitionKey: string,
        sequence: number,
        reason: string,
        actorUserID: string | null,
    ): Promise<OperatorResult>;
}
```

`src/manifest.ts`:

```typescript
import type { WorkJson } from './envelope';
import type { SubscriptionFilter } from './filterTypes';
import type { HostType, OrderingMode, SubscriptionPolicy } from './policy';

export interface TopologyManifest {
    ManifestVersion: 1;
    GeneratedAt: string;
    Transport: { Name: string; DriverClass: string; Configuration: Record<string, WorkJson> };
    Topics: ManifestTopic[];
}

export interface ManifestTopic {
    Name: string;
    OrderingMode: OrderingMode;
    IsFifo: boolean;
    MaxPayloadBytes: number;
    Subscriptions: ManifestSubscription[];
}

export interface ManifestSubscription {
    Name: string;
    Filter: SubscriptionFilter | null;
    Policy: SubscriptionPolicy;
    HostType: HostType;
    StagedToDatabase: boolean;
    ExternalRef: string | null;
    Aws?: { SnsFilterPolicy: string | null };
}

export interface BindingImport {
    ManifestVersion: 1;
    Topics: { Name: string; BindingConfig: Record<string, WorkJson> }[];
    Subscriptions: { Name: string; BindingConfig: Record<string, WorkJson> }[];
}
```

- [ ] **Step 10: Write `src/index.ts`**

```typescript
export * from './envelope';
export * from './publishing';
export * from './policy';
export * from './filterTypes';
export * from './handler';
export * from './errors';
export * from './transport';
export * from './operator';
export * from './manifest';
```

- [ ] **Step 11: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — dependencyGuard (3), errors (6), publishing (2): **11 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds with no errors; `dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 12: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml packages/WorkQueue/core
git commit -m "feat(work-queue-core): scaffold package with dependency guard and contract types"
```

---
### Task 2: Publish validation and envelope building

**Files:**
- Create: `packages/WorkQueue/core/src/validation.ts`
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/validation.test.ts`

**Interfaces:**
- Consumes: `WorkJson`, `WorkMessage` (envelope.ts); `PublishRequest`, `PublishError`, `PublishErrorCodes`, `CreatePublishError` (publishing.ts); `TopicBinding` (transport.ts) — all Task 1.
- Produces:
  - Constants `MAX_ENVELOPE_BYTES = 262144`, `MAX_ATTRIBUTES = 10`, `MAX_ATTRIBUTE_KEY_LENGTH = 64`, `MAX_ATTRIBUTE_VALUE_LENGTH = 256`, `MAX_PARTITION_KEY_LENGTH = 200`, `MAX_DEDUPLICATION_KEY_LENGTH = 200`, `MIN_DEDUPLICATION_TTL_SECONDS = 60`, `MAX_DEDUPLICATION_TTL_SECONDS = 2592000`
  - `IsWorkQueueUuid(value: string): boolean`
  - `IsReservedAttributeKey(key: string): boolean`
  - `ValidatePublishRequest(topic: TopicBinding, request: PublishRequest): PublishError | null`
  - `BuildWorkMessage<TPayload extends WorkJson = WorkJson>(topicName: string, request: PublishRequest<TPayload>, publishedAt: Date, newId: () => string): WorkMessage<TPayload>`
  - `SerializedEnvelopeBytes(message: WorkMessage): number`

Rules (spec 03 §1.1). Core checks every rule that needs no MJ state, in this order, returning the first failure:

| Order | Rule | Code |
| --- | --- | --- |
| 1 | `MessageID`, if supplied, is a UUID (any case) | `InvalidMessageID` |
| 2 | ≤ 10 attributes; key matches `^[A-Za-z0-9_-]{1,64}$` (no dots — spec 03 §1.1); key does not start with `mj` followed by `.` or `_` (case-insensitive); value is a string ≤ 256 chars | `InvalidAttributes` |
| 3 | Not both `Payload` and `PayloadRef`; `PayloadRef.Uri` non-empty | `InvalidPayload` |
| 4 | `PartitionKey`, if supplied, is 1–200 chars | `InvalidPartitionKey` |
| 5 | `PublishOrder` topic: no `Sequence` | `SequenceNotAllowed` |
| 5 | `ExplicitSequence` topic: `PartitionKey` without `Sequence` | `SequenceRequired` |
| 5 | `ExplicitSequence` topic: `Sequence` without `PartitionKey`, or not a safe integer ≥ 1 | `InvalidSequence` |
| 6 | `DeduplicationKey` 1–200 chars; `DeduplicationTTLSeconds` an integer 60–2,592,000 and only with a key | `InvalidDeduplication` |
| 7 | Serialized envelope ≤ `min(topic.MaxPayloadBytes, 262144)` UTF-8 bytes; payload serializable | `PayloadTooLarge` / `InvalidPayload` |

Codes **not** produced by core: `TopicNotFound`, `TopicDisabled`, `TopicNotExternallyPublishable`, `Forbidden` (engine and REST extension, plans 05–06); `TopicUnbound` (engine, plan 07); `MessageIDConflict`, `DuplicateSequence` (Database driver, plan 05; `InMemoryTransport`, Task 7); `TransportUnavailable` (drivers, `WorkQueueApiPublisher`).

Size is measured on a provisional message that uses a 36-character placeholder `MessageID` (when none is supplied) and a fixed placeholder `PublishedAt`, so the byte count equals the real envelope's.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/core/src/__tests__/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    BuildWorkMessage,
    IsReservedAttributeKey,
    IsWorkQueueUuid,
    SerializedEnvelopeBytes,
    ValidatePublishRequest,
} from '../validation';
import type { TopicBinding } from '../transport';
import type { PublishRequest } from '../publishing';
import type { WorkJson } from '../envelope';

const UUID = '6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60';

function topic(overrides: Partial<TopicBinding> = {}): TopicBinding {
    return { TopicName: 'email.events', OrderingMode: 'PublishOrder', IsFifo: false, MaxPayloadBytes: 262144, Config: {}, ...overrides };
}

function codeOf(binding: TopicBinding, request: PublishRequest): string | null {
    return ValidatePublishRequest(binding, request)?.Code ?? null;
}

describe('ValidatePublishRequest', () => {
    it('accepts a minimal request and a typical one', () => {
        expect(ValidatePublishRequest(topic(), {})).toBeNull();
        expect(ValidatePublishRequest(topic(), {
            MessageID: UUID,
            Attributes: { eventType: 'click', 'tenant.id': 'acme-1' },
            Payload: { url: 'https://example.com', count: 2 },
            CorrelationID: 'corr-1',
            DeduplicationKey: 'sg:abc',
            DeduplicationTTLSeconds: 3600,
        })).toBeNull();
    });

    it('rejects a MessageID that is not a UUID', () => {
        expect(codeOf(topic(), { MessageID: 'not-a-uuid' })).toBe('InvalidMessageID');
    });

    it('accepts an upper-case UUID MessageID', () => {
        expect(codeOf(topic(), { MessageID: UUID.toUpperCase() })).toBeNull();
    });

    it('rejects more than 10 attributes', () => {
        const attributes: Record<string, string> = {};
        for (let i = 0; i < 11; i++) {
            attributes[`a${i}`] = 'v';
        }
        expect(codeOf(topic(), { Attributes: attributes })).toBe('InvalidAttributes');
    });

    it('rejects attribute keys outside the allowed pattern, including dotted names', () => {
        expect(codeOf(topic(), { Attributes: { 'bad key': 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { ['k'.repeat(65)]: 'v' } })).toBe('InvalidAttributes');
        // A dot would make the attribute unfilterable: filters read 'a.b' as the source.field form (spec 03 §1.1).
        expect(codeOf(topic(), { Attributes: { 'a.b': 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { 'a-b_C9': 'v' } })).toBeNull();
    });

    it('rejects reserved attribute prefixes regardless of case', () => {
        expect(codeOf(topic(), { Attributes: { 'mj.partition': 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { MJ_Sequence: 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { mjolnir: 'v' } })).toBeNull();
    });

    it('rejects attribute values longer than 256 characters', () => {
        expect(codeOf(topic(), { Attributes: { k: 'v'.repeat(257) } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { k: 'v'.repeat(256) } })).toBeNull();
    });

    it('rejects Payload and PayloadRef together, and an empty PayloadRef Uri', () => {
        expect(codeOf(topic(), { Payload: { a: 1 }, PayloadRef: { Uri: 's3://b/k' } })).toBe('InvalidPayload');
        expect(codeOf(topic(), { PayloadRef: { Uri: '' } })).toBe('InvalidPayload');
        expect(codeOf(topic(), { PayloadRef: { Uri: 's3://bucket/batch-7.jsonl', SizeBytes: 1024 } })).toBeNull();
    });

    it('rejects empty and over-long partition keys', () => {
        expect(codeOf(topic(), { PartitionKey: '' })).toBe('InvalidPartitionKey');
        expect(codeOf(topic(), { PartitionKey: 'p'.repeat(201) })).toBe('InvalidPartitionKey');
        expect(codeOf(topic(), { PartitionKey: 'p'.repeat(200) })).toBeNull();
    });

    it('rejects Sequence on a PublishOrder topic', () => {
        expect(codeOf(topic(), { PartitionKey: 'k', Sequence: 1 })).toBe('SequenceNotAllowed');
    });

    it('requires Sequence with a PartitionKey on an ExplicitSequence topic', () => {
        expect(codeOf(topic({ OrderingMode: 'ExplicitSequence' }), { PartitionKey: 'k' })).toBe('SequenceRequired');
    });

    it('rejects Sequence without a PartitionKey on an ExplicitSequence topic', () => {
        expect(codeOf(topic({ OrderingMode: 'ExplicitSequence' }), { Sequence: 1 })).toBe('InvalidSequence');
    });

    it('rejects non-positive and non-integer sequences', () => {
        const explicit = topic({ OrderingMode: 'ExplicitSequence' });
        expect(codeOf(explicit, { PartitionKey: 'k', Sequence: 0 })).toBe('InvalidSequence');
        expect(codeOf(explicit, { PartitionKey: 'k', Sequence: 1.5 })).toBe('InvalidSequence');
        expect(codeOf(explicit, { PartitionKey: 'k', Sequence: Number.MAX_SAFE_INTEGER + 1 })).toBe('InvalidSequence');
    });

    it('accepts a key and sequence on an ExplicitSequence topic, and no key at all', () => {
        const explicit = topic({ OrderingMode: 'ExplicitSequence' });
        expect(codeOf(explicit, { PartitionKey: 'integration-42', Sequence: 7 })).toBeNull();
        expect(codeOf(explicit, {})).toBeNull();
    });

    it('rejects empty and over-long deduplication keys', () => {
        expect(codeOf(topic(), { DeduplicationKey: '' })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationKey: 'd'.repeat(201) })).toBe('InvalidDeduplication');
    });

    it('rejects deduplication TTLs out of range, fractional, or without a key', () => {
        expect(codeOf(topic(), { DeduplicationKey: 'k', DeduplicationTTLSeconds: 59 })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationKey: 'k', DeduplicationTTLSeconds: 2592001 })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationKey: 'k', DeduplicationTTLSeconds: 90.5 })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationTTLSeconds: 3600 })).toBe('InvalidDeduplication');
    });

    it('rejects an envelope larger than the topic limit', () => {
        expect(codeOf(topic({ MaxPayloadBytes: 1000 }), { Payload: 'x'.repeat(2000) })).toBe('PayloadTooLarge');
        expect(codeOf(topic({ MaxPayloadBytes: 1000 }), { Payload: 'x'.repeat(100) })).toBeNull();
    });

    it('never allows more than 262144 bytes even when the topic limit is higher', () => {
        expect(codeOf(topic({ MaxPayloadBytes: 999999 }), { Payload: 'x'.repeat(300000) })).toBe('PayloadTooLarge');
    });

    it('rejects a payload that cannot be serialized', () => {
        const cyclic: { [key: string]: WorkJson } = {};
        Reflect.set(cyclic, 'self', cyclic);
        expect(codeOf(topic(), { Payload: cyclic })).toBe('InvalidPayload');
    });

    it('marks every validation error as not retryable', () => {
        expect(ValidatePublishRequest(topic(), { MessageID: 'nope' })?.Retryable).toBe(false);
    });
});

describe('BuildWorkMessage', () => {
    const publishedAt = new Date('2026-09-16T12:00:00.000Z');

    it('uses a supplied MessageID, otherwise the generator', () => {
        expect(BuildWorkMessage('t', { MessageID: UUID }, publishedAt, () => 'generated').MessageID).toBe(UUID);
        expect(BuildWorkMessage('t', {}, publishedAt, () => 'generated').MessageID).toBe('generated');
    });

    it('omits undefined optional fields and copies attributes', () => {
        const attributes = { eventType: 'open' };
        const message = BuildWorkMessage('email.events', { Attributes: attributes }, publishedAt, () => UUID);
        expect(message).toEqual({ MessageID: UUID, Topic: 'email.events', Attributes: { eventType: 'open' }, PublishedAt: '2026-09-16T12:00:00.000Z' });
        expect(Object.keys(message)).toEqual(['MessageID', 'Topic', 'Attributes', 'PublishedAt']);
        attributes.eventType = 'changed';
        expect(message.Attributes.eventType).toBe('open');
    });

    it('carries every supplied field', () => {
        const message = BuildWorkMessage('integration.batch-ready', {
            PartitionKey: 'integration-42',
            Sequence: 3,
            Attributes: {},
            PayloadRef: { Uri: 's3://b/k' },
            CorrelationID: 'c-1',
        }, publishedAt, () => UUID);
        expect(message.PartitionKey).toBe('integration-42');
        expect(message.Sequence).toBe(3);
        expect(message.PayloadRef).toEqual({ Uri: 's3://b/k' });
        expect(message.CorrelationID).toBe('c-1');
        expect(message.Payload).toBeUndefined();
    });
});

describe('SerializedEnvelopeBytes and helpers', () => {
    it('counts UTF-8 bytes, not characters', () => {
        const at = new Date('2026-09-16T12:00:00.000Z');
        const plain = BuildWorkMessage('t', { Payload: 'e' }, at, () => UUID);
        const accented = BuildWorkMessage('t', { Payload: 'é' }, at, () => UUID);
        expect(SerializedEnvelopeBytes(accented) - SerializedEnvelopeBytes(plain)).toBe(1);
    });

    it('recognises UUIDs and reserved keys', () => {
        expect(IsWorkQueueUuid(UUID)).toBe(true);
        expect(IsWorkQueueUuid('1234')).toBe(false);
        expect(IsReservedAttributeKey('Mj.Anything')).toBe(true);
        expect(IsReservedAttributeKey('major')).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/core && pnpm test validation`
Expected: FAIL — unresolved import `../validation`.

- [ ] **Step 3: Write `src/validation.ts`**

```typescript
import type { WorkJson, WorkMessage } from './envelope';
import type { PublishError, PublishRequest } from './publishing';
import { CreatePublishError, PublishErrorCodes } from './publishing';
import type { TopicBinding } from './transport';

export const MAX_ENVELOPE_BYTES = 262144;
export const MAX_ATTRIBUTES = 10;
export const MAX_ATTRIBUTE_KEY_LENGTH = 64;
export const MAX_ATTRIBUTE_VALUE_LENGTH = 256;
export const MAX_PARTITION_KEY_LENGTH = 200;
export const MAX_DEDUPLICATION_KEY_LENGTH = 200;
export const MIN_DEDUPLICATION_TTL_SECONDS = 60;
export const MAX_DEDUPLICATION_TTL_SECONDS = 2592000;

/** No dot: a dotted name is MJ's `source.field` filter form, so a dotted attribute key could never be filtered. */
const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const RESERVED_ATTRIBUTE_PREFIXES = ['mj.', 'mj_'];
const SIZE_PLACEHOLDER_MESSAGE_ID = '00000000-0000-0000-0000-000000000000';
const SIZE_PLACEHOLDER_PUBLISHED_AT = new Date(Date.UTC(2000, 0, 1));
const utf8 = new TextEncoder();

export function IsWorkQueueUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

export function IsReservedAttributeKey(key: string): boolean {
    const lower = key.toLowerCase();
    return RESERVED_ATTRIBUTE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** First failing envelope rule (spec 03 §1.1) that core can check without MJ state, or null. */
export function ValidatePublishRequest(topic: TopicBinding, request: PublishRequest): PublishError | null {
    return (
        validateMessageID(request) ??
        validateAttributes(request) ??
        validatePayloadShape(request) ??
        validatePartitionKey(request) ??
        validateSequence(topic, request) ??
        validateDeduplication(request) ??
        validateSize(topic, request)
    );
}

export function BuildWorkMessage<TPayload extends WorkJson = WorkJson>(
    topicName: string,
    request: PublishRequest<TPayload>,
    publishedAt: Date,
    newId: () => string,
): WorkMessage<TPayload> {
    return {
        MessageID: request.MessageID ?? newId(),
        Topic: topicName,
        ...(request.PartitionKey !== undefined ? { PartitionKey: request.PartitionKey } : {}),
        ...(request.Sequence !== undefined ? { Sequence: request.Sequence } : {}),
        Attributes: { ...(request.Attributes ?? {}) },
        ...(request.Payload !== undefined ? { Payload: request.Payload } : {}),
        ...(request.PayloadRef !== undefined ? { PayloadRef: { ...request.PayloadRef } } : {}),
        ...(request.CorrelationID !== undefined ? { CorrelationID: request.CorrelationID } : {}),
        PublishedAt: publishedAt.toISOString(),
    };
}

export function SerializedEnvelopeBytes(message: WorkMessage): number {
    return utf8.encode(JSON.stringify(message)).length;
}

function validateMessageID(request: PublishRequest): PublishError | null {
    if (request.MessageID === undefined || IsWorkQueueUuid(request.MessageID)) {
        return null;
    }
    return CreatePublishError(PublishErrorCodes.InvalidMessageID, `MessageID '${request.MessageID}' is not a UUID`);
}

function validateAttributes(request: PublishRequest): PublishError | null {
    if (request.Attributes === undefined) {
        return null;
    }
    const entries = Object.entries(request.Attributes);
    if (entries.length > MAX_ATTRIBUTES) {
        return invalidAttributes(`At most ${MAX_ATTRIBUTES} attributes are allowed; got ${entries.length}`);
    }
    for (const [key, value] of entries) {
        if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
            return invalidAttributes(`Attribute key '${key}' must be 1-${MAX_ATTRIBUTE_KEY_LENGTH} characters of A-Z a-z 0-9 _ . -`);
        }
        if (IsReservedAttributeKey(key)) {
            return invalidAttributes(`Attribute key '${key}' uses a reserved prefix (mj. or mj_)`);
        }
        if (typeof value !== 'string' || value.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
            return invalidAttributes(`Attribute '${key}' must be a string of at most ${MAX_ATTRIBUTE_VALUE_LENGTH} characters`);
        }
    }
    return null;
}

function validatePayloadShape(request: PublishRequest): PublishError | null {
    if (request.Payload !== undefined && request.PayloadRef !== undefined) {
        return CreatePublishError(PublishErrorCodes.InvalidPayload, 'Supply Payload or PayloadRef, not both');
    }
    if (request.PayloadRef !== undefined && (typeof request.PayloadRef.Uri !== 'string' || request.PayloadRef.Uri.length === 0)) {
        return CreatePublishError(PublishErrorCodes.InvalidPayload, 'PayloadRef.Uri must be a non-empty string');
    }
    return null;
}

function validatePartitionKey(request: PublishRequest): PublishError | null {
    const key = request.PartitionKey;
    if (key === undefined || (key.length > 0 && key.length <= MAX_PARTITION_KEY_LENGTH)) {
        return null;
    }
    return CreatePublishError(PublishErrorCodes.InvalidPartitionKey, `PartitionKey must be 1-${MAX_PARTITION_KEY_LENGTH} characters`);
}

function validateSequence(topic: TopicBinding, request: PublishRequest): PublishError | null {
    const hasKey = request.PartitionKey !== undefined;
    const sequence = request.Sequence;
    if (topic.OrderingMode === 'PublishOrder') {
        return sequence === undefined
            ? null
            : CreatePublishError(PublishErrorCodes.SequenceNotAllowed, `Topic '${topic.TopicName}' uses PublishOrder; Sequence is not allowed`);
    }
    if (hasKey && sequence === undefined) {
        return CreatePublishError(PublishErrorCodes.SequenceRequired, `Topic '${topic.TopicName}' requires Sequence when PartitionKey is set`);
    }
    if (!hasKey && sequence !== undefined) {
        return CreatePublishError(PublishErrorCodes.InvalidSequence, 'Sequence requires a PartitionKey');
    }
    if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 1)) {
        return CreatePublishError(PublishErrorCodes.InvalidSequence, 'Sequence must be an integer of at least 1');
    }
    return null;
}

function validateDeduplication(request: PublishRequest): PublishError | null {
    const key = request.DeduplicationKey;
    const ttl = request.DeduplicationTTLSeconds;
    if (key === undefined) {
        return ttl === undefined ? null : invalidDeduplication('DeduplicationTTLSeconds requires a DeduplicationKey');
    }
    if (key.length === 0 || key.length > MAX_DEDUPLICATION_KEY_LENGTH) {
        return invalidDeduplication(`DeduplicationKey must be 1-${MAX_DEDUPLICATION_KEY_LENGTH} characters`);
    }
    if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < MIN_DEDUPLICATION_TTL_SECONDS || ttl > MAX_DEDUPLICATION_TTL_SECONDS)) {
        return invalidDeduplication(
            `DeduplicationTTLSeconds must be an integer from ${MIN_DEDUPLICATION_TTL_SECONDS} to ${MAX_DEDUPLICATION_TTL_SECONDS}`,
        );
    }
    return null;
}

function validateSize(topic: TopicBinding, request: PublishRequest): PublishError | null {
    const limit = Math.min(topic.MaxPayloadBytes, MAX_ENVELOPE_BYTES);
    let bytes: number;
    try {
        const provisional = BuildWorkMessage(topic.TopicName, request, SIZE_PLACEHOLDER_PUBLISHED_AT, () => SIZE_PLACEHOLDER_MESSAGE_ID);
        bytes = SerializedEnvelopeBytes(provisional);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return CreatePublishError(PublishErrorCodes.InvalidPayload, `Payload is not serializable JSON: ${detail}`);
    }
    if (bytes > limit) {
        return CreatePublishError(PublishErrorCodes.PayloadTooLarge, `Envelope is ${bytes} bytes; the limit for '${topic.TopicName}' is ${limit}`);
    }
    return null;
}

function invalidAttributes(message: string): PublishError {
    return CreatePublishError(PublishErrorCodes.InvalidAttributes, message);
}

function invalidDeduplication(message: string): PublishError {
    return CreatePublishError(PublishErrorCodes.InvalidDeduplication, message);
}
```

- [ ] **Step 4: Export the module**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export * from './validation';
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — dependencyGuard (3), errors (6), publishing (2), validation (25): **36 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): publish request validation and envelope building"
```

---

### Task 3: Filters (`CompositeFilterDescriptor`, restricted)

**Files:**
- Create: `packages/WorkQueue/core/src/filter.ts`
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/filter.test.ts`

**Interfaces:**
- Consumes: `FilterOperator`, `FilterRule`, `FilterGroup`, `SubscriptionFilter`, `FilterSupport` (filterTypes.ts), `WorkQueueConfigurationError` (errors.ts) — Task 1.
- Produces:
  - `WORK_QUEUE_FILTER_SUPPORT: FilterSupport` — every operator, single-field OR groups, `MaxFields` 5, `MaxValues` 50 (what the Database transport accepts)
  - `ParseSubscriptionFilter(json: string | null, support: FilterSupport): SubscriptionFilter | null` — null/blank text → `null`; throws `WorkQueueConfigurationError` on invalid JSON or an unsupported shape
  - `ValidateSubscriptionFilter(value: unknown, support: FilterSupport): SubscriptionFilter` — the same check on an already-parsed value (used by the engine's entity validation and by `SubscriptionUnsupportedReason`)
  - `MatchesFilter(filter: SubscriptionFilter | null, attributes: Record<string, string>): boolean`
  - `FilterFields(filter: SubscriptionFilter | null): string[]` — distinct field names, for binding validation and manifest rendering

Shape (spec 03 §4): MJ's `CompositeFilterDescriptor` — `{ logic: 'and' | 'or', filters: (rule | group)[] }`, where a rule is
`{ field, operator, value? }`. `field` is a bare envelope attribute name; the dotted `source.field` form used by
multi-record view filters is rejected. The root's `logic` must be `and`; a nested group may only be a single-field OR of
`eq` (its depth limit is one level). Operators: `eq`, `neq`, `startswith`, `isnull`, `isnotnull`, each subject to
`support.Operators`. Values are normalised to strings (`String(value)`), because envelope attributes are strings; `eq`,
`neq` and `startswith` require a value, `isnull`/`isnotnull` must not carry one. **Each field may be constrained only
once** — one rule, or one single-field OR group: brokers read a field's value array as OR, so two AND-ed rules on one
field would silently widen the filter instead of narrowing it (plan 07's `ToSnsFilterPolicy` relies on this). Limits:
`support.MaxFields` distinct fields, `support.MaxValues` values in total.

Matching is **case-sensitive** (brokers match exactly; MJ's own `CompositeFilter` lowercases both sides, and spec 03 §4.3
records this as the one deliberate divergence). A missing attribute fails every operator except `isnull`. A `null` filter,
or one whose `filters` array is empty, matches everything.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/core/src/__tests__/filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WORK_QUEUE_FILTER_SUPPORT, FilterFields, MatchesFilter, ParseSubscriptionFilter, ValidateSubscriptionFilter } from '../filter';
import { WorkQueueConfigurationError } from '../errors';
import type { FilterSupport, SubscriptionFilter } from '../filterTypes';

const NO_GROUPS: FilterSupport = { ...WORK_QUEUE_FILTER_SUPPORT, SingleFieldOrGroups: false };
const EQ_ONLY: FilterSupport = { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq'] };

describe('ParseSubscriptionFilter', () => {
    it('returns null for null or blank text', () => {
        expect(ParseSubscriptionFilter(null, WORK_QUEUE_FILTER_SUPPORT)).toBeNull();
        expect(ParseSubscriptionFilter('   ', WORK_QUEUE_FILTER_SUPPORT)).toBeNull();
    });

    it('parses the spec 03 §4 example: rules, a single-field OR group and a presence test', () => {
        const filter = ParseSubscriptionFilter(
            JSON.stringify({
                logic: 'and',
                filters: [
                    { field: 'eventType', operator: 'eq', value: 'click' },
                    { logic: 'or', filters: [
                        { field: 'tenant', operator: 'eq', value: 'acme' },
                        { field: 'tenant', operator: 'eq', value: 'globex' },
                    ] },
                    { field: 'campaign', operator: 'isnotnull', value: null },
                ],
            }),
            WORK_QUEUE_FILTER_SUPPORT,
        );
        expect(filter).toEqual({
            logic: 'and',
            filters: [
                { field: 'eventType', operator: 'eq', value: 'click' },
                { logic: 'or', filters: [
                    { field: 'tenant', operator: 'eq', value: 'acme' },
                    { field: 'tenant', operator: 'eq', value: 'globex' },
                ] },
                { field: 'campaign', operator: 'isnotnull' },
            ],
        });
    });

    it('normalises number and boolean values to strings', () => {
        const filter = ParseSubscriptionFilter(
            '{"logic":"and","filters":[{"field":"attempt","operator":"eq","value":2},{"field":"live","operator":"eq","value":true}]}',
            WORK_QUEUE_FILTER_SUPPORT,
        );
        expect(filter).toEqual({
            logic: 'and',
            filters: [
                { field: 'attempt', operator: 'eq', value: '2' },
                { field: 'live', operator: 'eq', value: 'true' },
            ],
        });
    });

    it('rejects text that is not JSON', () => {
        expect(() => ParseSubscriptionFilter('{logic:', WORK_QUEUE_FILTER_SUPPORT)).toThrow(WorkQueueConfigurationError);
    });

    it('rejects a root that is not a CompositeFilterDescriptor', () => {
        expect(() => ParseSubscriptionFilter('[]', WORK_QUEUE_FILTER_SUPPORT)).toThrow('Filter must be a CompositeFilterDescriptor');
        expect(() => ParseSubscriptionFilter('{"field":"a","operator":"eq","value":"1"}', WORK_QUEUE_FILTER_SUPPORT))
            .toThrow('Filter must be a CompositeFilterDescriptor');
    });

    it("rejects a root whose logic is not 'and'", () => {
        expect(() => ParseSubscriptionFilter('{"logic":"or","filters":[{"field":"a","operator":"eq","value":"1"}]}', WORK_QUEUE_FILTER_SUPPORT))
            .toThrow("Filter root logic must be 'and'");
    });

    it('rejects an operator the transport does not support, naming field and operator', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'tenant', operator: 'contains', value: 'acme' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("Filter operator 'contains' on field 'tenant' is not supported");
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'tenant', operator: 'startswith', value: 'acme' }] },
            EQ_ONLY,
        )).toThrow("Filter operator 'startswith' on field 'tenant' is not supported");
    });

    it('rejects dotted multi-record field names', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'source.name', operator: 'eq', value: 'x' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("Filter field 'source.name'");
    });

    it('rejects a group that mixes fields or uses an operator other than eq', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { field: 'region', operator: 'eq', value: 'eu' },
            ] }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow('single field');
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { field: 'tenant', operator: 'startswith', value: 'glo' },
            ] }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("only 'eq'");
    });

    it('rejects groups when the transport does not support them, and rejects deeper nesting', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [{ field: 'a', operator: 'eq', value: '1' }] }] },
            NO_GROUPS,
        )).toThrow('does not support OR groups');
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [
                { logic: 'or', filters: [{ field: 'a', operator: 'eq', value: '1' }] },
            ] }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow('nesting');
    });

    it('rejects a field constrained more than once', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { field: 'tenant', operator: 'startswith', value: 'ac' },
            ] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("Filter field 'tenant' is constrained more than once");
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { logic: 'or', filters: [
                    { field: 'tenant', operator: 'eq', value: 'globex' },
                    { field: 'tenant', operator: 'eq', value: 'initech' },
                ] },
            ] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow('constrained more than once');
    });

    it('rejects more fields or values than the transport allows', () => {
        const manyFields = { logic: 'and', filters: ['a', 'b', 'c', 'd', 'e', 'f'].map((field) => ({ field, operator: 'eq', value: '1' })) };
        expect(() => ValidateSubscriptionFilter(manyFields, WORK_QUEUE_FILTER_SUPPORT)).toThrow('at most 5 fields');

        const manyValues = {
            logic: 'and',
            filters: [{ logic: 'or', filters: Array.from({ length: 51 }, (_, i) => ({ field: 'tenant', operator: 'eq', value: `v${i}` })) }],
        };
        expect(() => ValidateSubscriptionFilter(manyValues, WORK_QUEUE_FILTER_SUPPORT)).toThrow('at most 50 values');
    });

    it('requires a value for eq, neq and startswith, and forbids one for isnull', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'a', operator: 'eq' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("operator 'eq' on field 'a' requires a value");
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'a', operator: 'isnull', value: 'x' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("operator 'isnull' on field 'a' takes no value");
    });

    it('lists distinct fields', () => {
        const filter = ValidateSubscriptionFilter(
            { logic: 'and', filters: [
                { field: 'eventType', operator: 'eq', value: 'click' },
                { logic: 'or', filters: [
                    { field: 'tenant', operator: 'eq', value: 'acme' },
                    { field: 'tenant', operator: 'eq', value: 'globex' },
                ] },
            ] },
            WORK_QUEUE_FILTER_SUPPORT,
        );
        expect(FilterFields(filter)).toEqual(['eventType', 'tenant']);
        expect(FilterFields(null)).toEqual([]);
    });
});

describe('MatchesFilter', () => {
    const parse = (value: unknown): SubscriptionFilter => ValidateSubscriptionFilter(value, WORK_QUEUE_FILTER_SUPPORT);

    it('matches everything for a null or empty filter', () => {
        expect(MatchesFilter(null, {})).toBe(true);
        expect(MatchesFilter({ logic: 'and', filters: [] }, { eventType: 'click' })).toBe(true);
    });

    it('matches eq exactly', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] });
        expect(MatchesFilter(filter, { eventType: 'click' })).toBe(true);
        expect(MatchesFilter(filter, { eventType: 'open' })).toBe(false);
    });

    it('is case-sensitive, unlike MJ CompositeFilter', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] });
        expect(MatchesFilter(filter, { eventType: 'Click' })).toBe(false);
        const prefix = parse({ logic: 'and', filters: [{ field: 'tenant', operator: 'startswith', value: 'acme' }] });
        expect(MatchesFilter(prefix, { tenant: 'ACME-7' })).toBe(false);
    });

    it('matches neq only when the attribute is present and different', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'source', operator: 'neq', value: 'test' }] });
        expect(MatchesFilter(filter, { source: 'prod' })).toBe(true);
        expect(MatchesFilter(filter, { source: 'test' })).toBe(false);
        expect(MatchesFilter(filter, {})).toBe(false);
    });

    it('matches startswith', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'tenant', operator: 'startswith', value: 'acme-' }] });
        expect(MatchesFilter(filter, { tenant: 'acme-7' })).toBe(true);
        expect(MatchesFilter(filter, { tenant: 'globex' })).toBe(false);
    });

    it('matches isnull and isnotnull against missing and present attributes', () => {
        const present = parse({ logic: 'and', filters: [{ field: 'priority', operator: 'isnotnull' }] });
        const absent = parse({ logic: 'and', filters: [{ field: 'priority', operator: 'isnull' }] });
        expect(MatchesFilter(present, { priority: 'high' })).toBe(true);
        expect(MatchesFilter(present, {})).toBe(false);
        expect(MatchesFilter(absent, {})).toBe(true);
        expect(MatchesFilter(absent, { priority: 'high' })).toBe(false);
    });

    it('requires every top-level rule to match', () => {
        const filter = parse({ logic: 'and', filters: [
            { field: 'eventType', operator: 'eq', value: 'unsubscribe' },
            { field: 'provider', operator: 'eq', value: 'sendgrid' },
        ] });
        expect(MatchesFilter(filter, { eventType: 'unsubscribe', provider: 'sendgrid' })).toBe(true);
        expect(MatchesFilter(filter, { eventType: 'unsubscribe', provider: 'ses' })).toBe(false);
    });

    it('matches any value inside a single-field OR group', () => {
        const filter = parse({ logic: 'and', filters: [{ logic: 'or', filters: [
            { field: 'tenant', operator: 'eq', value: 'acme' },
            { field: 'tenant', operator: 'eq', value: 'globex' },
        ] }] });
        expect(MatchesFilter(filter, { tenant: 'globex' })).toBe(true);
        expect(MatchesFilter(filter, { tenant: 'initech' })).toBe(false);
    });

    it('fails every operator except isnull on a missing attribute', () => {
        for (const operator of ['eq', 'neq', 'startswith'] as const) {
            const filter = parse({ logic: 'and', filters: [{ field: 'tenant', operator, value: 'acme' }] });
            expect(MatchesFilter(filter, {})).toBe(false);
        }
        expect(MatchesFilter(parse({ logic: 'and', filters: [{ field: 'tenant', operator: 'isnull' }] }), {})).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/core && pnpm test filter`
Expected: FAIL — unresolved import `../filter`.

- [ ] **Step 3: Write `src/filter.ts`**

```typescript
import { WorkQueueConfigurationError } from './errors';
import type { FilterGroup, FilterOperator, FilterRule, FilterSupport, SubscriptionFilter } from './filterTypes';

const ALL_OPERATORS: FilterOperator[] = ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'];
const VALUELESS_OPERATORS: FilterOperator[] = ['isnull', 'isnotnull'];
const ATTRIBUTE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** What the Database transport accepts; cloud drivers narrow it. */
export const WORK_QUEUE_FILTER_SUPPORT: FilterSupport = {
    Operators: ALL_OPERATORS,
    SingleFieldOrGroups: true,
    MaxFields: 5,
    MaxValues: 50,
};

/** Parses a subscription's Filter column. Null or blank text means "match everything". */
export function ParseSubscriptionFilter(json: string | null, support: FilterSupport): SubscriptionFilter | null {
    if (json === null || json.trim() === '') {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new WorkQueueConfigurationError('Filter is not valid JSON');
    }
    return ValidateSubscriptionFilter(parsed, support);
}

/** Checks an already-parsed CompositeFilterDescriptor against the queue's subset and this transport's support. */
export function ValidateSubscriptionFilter(value: unknown, support: FilterSupport): SubscriptionFilter {
    if (!isGroup(value)) {
        throw new WorkQueueConfigurationError(
            'Filter must be a CompositeFilterDescriptor object: { "logic": "and", "filters": [...] }',
        );
    }
    if (value.logic !== 'and') {
        throw new WorkQueueConfigurationError("Filter root logic must be 'and'; OR is only allowed inside a single-field group");
    }
    const filters = value.filters.map((entry) => (isGroup(entry) ? validateGroup(entry, support) : validateRule(entry, support)));
    const constrained = new Set<string>();
    for (const entry of filters) {
        const field = entryField(entry);
        if (constrained.has(field)) {
            throw new WorkQueueConfigurationError(
                `Filter field '${field}' is constrained more than once; combine the conditions into a single rule or one OR group`,
            );
        }
        constrained.add(field);
    }
    const result: SubscriptionFilter = { logic: 'and', filters };
    const fields = FilterFields(result);
    if (fields.length > support.MaxFields) {
        throw new WorkQueueConfigurationError(`Filter may reference at most ${support.MaxFields} fields; got ${fields.length}`);
    }
    const values = countValues(result);
    if (values > support.MaxValues) {
        throw new WorkQueueConfigurationError(`Filter may have at most ${support.MaxValues} values in total; got ${values}`);
    }
    return result;
}

/** AND across the root's entries; OR inside a single-field group. Case-sensitive (spec 03 §4.3). */
export function MatchesFilter(filter: SubscriptionFilter | null, attributes: Record<string, string>): boolean {
    if (filter === null || filter.filters.length === 0) {
        return true;
    }
    return matchesGroup(filter, attributes);
}

/** Distinct field names, in first-seen order. */
export function FilterFields(filter: SubscriptionFilter | null): string[] {
    if (filter === null) {
        return [];
    }
    const seen: string[] = [];
    walkRules(filter, (rule) => {
        if (!seen.includes(rule.field)) {
            seen.push(rule.field);
        }
    });
    return seen;
}

function matchesGroup(group: FilterGroup, attributes: Record<string, string>): boolean {
    const results = group.filters.map((entry) =>
        isGroup(entry) ? matchesGroup(entry, attributes) : matchesRule(entry, attributes),
    );
    return group.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
}

function matchesRule(rule: FilterRule, attributes: Record<string, string>): boolean {
    const present = Object.prototype.hasOwnProperty.call(attributes, rule.field);
    const value = present ? attributes[rule.field] : undefined;
    if (rule.operator === 'isnull') {
        return !present;
    }
    if (rule.operator === 'isnotnull') {
        return present;
    }
    if (value === undefined) {
        return false;
    }
    const expected = String(rule.value ?? '');
    switch (rule.operator) {
        case 'eq':
            return value === expected;
        case 'neq':
            return value !== expected;
        default:
            return value.startsWith(expected);
    }
}

function validateGroup(group: FilterGroup, support: FilterSupport): FilterGroup {
    if (!support.SingleFieldOrGroups) {
        throw new WorkQueueConfigurationError('This transport does not support OR groups in a subscription filter');
    }
    if (group.logic !== 'or') {
        throw new WorkQueueConfigurationError("A nested filter group must use logic 'or'");
    }
    if (group.filters.some(isGroup)) {
        throw new WorkQueueConfigurationError('Filter nesting is limited to one OR group inside the root');
    }
    const rules = group.filters.map((entry) => validateRule(entry, support));
    const fields = new Set(rules.map((rule) => rule.field));
    if (fields.size !== 1) {
        throw new WorkQueueConfigurationError(`An OR group must test a single field; got ${[...fields].join(', ')}`);
    }
    const offender = rules.find((rule) => rule.operator !== 'eq');
    if (offender) {
        throw new WorkQueueConfigurationError(
            `An OR group may use only 'eq'; field '${offender.field}' uses '${offender.operator}'`,
        );
    }
    return { logic: 'or', filters: rules };
}

function validateRule(value: unknown, support: FilterSupport): FilterRule {
    if (!isPlainObject(value) || typeof value['field'] !== 'string' || typeof value['operator'] !== 'string') {
        throw new WorkQueueConfigurationError('Each filter entry must be { field, operator, value? } or a nested group');
    }
    const field = value['field'];
    const operator = value['operator'];
    if (field.includes('.')) {
        throw new WorkQueueConfigurationError(
            `Filter field '${field}' is not supported: use a bare attribute name, not the dotted source.field form`,
        );
    }
    if (!ATTRIBUTE_NAME_PATTERN.test(field)) {
        throw new WorkQueueConfigurationError(`Filter field '${field}' is not a valid attribute name`);
    }
    if (!isOperator(operator) || !support.Operators.includes(operator)) {
        throw new WorkQueueConfigurationError(`Filter operator '${operator}' on field '${field}' is not supported by this transport`);
    }
    const raw = value['value'];
    if (VALUELESS_OPERATORS.includes(operator)) {
        if (raw !== undefined && raw !== null) {
            throw new WorkQueueConfigurationError(`Filter operator '${operator}' on field '${field}' takes no value`);
        }
        return { field, operator };
    }
    if (raw === undefined || raw === null || raw === '') {
        throw new WorkQueueConfigurationError(`Filter operator '${operator}' on field '${field}' requires a value`);
    }
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
        throw new WorkQueueConfigurationError(`Filter value for field '${field}' must be a string, number or boolean`);
    }
    return { field, operator, value: String(raw) };
}

/** The field a validated root entry constrains; a group is single-field by construction. */
function entryField(entry: FilterRule | FilterGroup): string {
    if (!isGroup(entry)) {
        return entry.field;
    }
    const first = entry.filters[0];
    return isGroup(first) ? '' : first.field;
}

function countValues(filter: SubscriptionFilter): number {
    let count = 0;
    walkRules(filter, (rule) => {
        if (rule.value !== undefined) {
            count += 1;
        }
    });
    return count;
}

function walkRules(group: FilterGroup, visit: (rule: FilterRule) => void): void {
    for (const entry of group.filters) {
        if (isGroup(entry)) {
            walkRules(entry, visit);
        } else {
            visit(entry);
        }
    }
}

function isOperator(value: string): value is FilterOperator {
    return (ALL_OPERATORS as string[]).includes(value);
}

function isGroup(value: unknown): value is FilterGroup {
    return isPlainObject(value) && typeof value['logic'] === 'string' && Array.isArray(value['filters']);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Export the module**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export * from './filter';
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 36 plus filter (23): **59 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): CompositeFilterDescriptor subscription filters, restricted to the broker-translatable subset"
```

---

### Task 4: Backoff and subscription compatibility

**Files:**
- Create: `packages/WorkQueue/core/src/backoff.ts`, `packages/WorkQueue/core/src/compatibility.ts`
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/backoff.test.ts`, `packages/WorkQueue/core/src/__tests__/compatibility.test.ts`

**Interfaces:**
- Consumes: `SubscriptionPolicy` (policy.ts), `SubscriptionBinding`, `TransportCapabilities` (transport.ts) — Task 1; `ValidateSubscriptionFilter` (filter.ts) — Task 3.
- Produces:
  - `ComputeBackoffSeconds(policy: SubscriptionPolicy, attempt: number, handlerDelaySeconds?: number, random?: () => number): number` — a handler-supplied finite delay wins (rounded up, clamped to `[0, BackoffMaxSeconds]`); otherwise full jitter `round(random() × min(BackoffMaxSeconds, BackoffBaseSeconds × 2^(attempt−1)))`, exponent capped at 30
  - `SubscriptionUnsupportedReason(binding: SubscriptionBinding, capabilities: TransportCapabilities, stagedToDatabase: boolean): string | null` — rules in the order of spec 03 §5, ending with the filter check
  - `FilterUnsupportedReason(filter: SubscriptionFilter | null, capabilities: TransportCapabilities): string | null` — re-validates the parsed filter against `capabilities.Filters` (spec 03 §4.1) and returns the thrown message

Warnings for `MaxProcessingSeconds` above a host ceiling are the engine's job (plan 05), not core's.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/core/src/__tests__/backoff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ComputeBackoffSeconds } from '../backoff';
import type { SubscriptionPolicy } from '../policy';

const POLICY: SubscriptionPolicy = {
    SubscriptionName: 'email.unsubscribe',
    TopicName: 'email.events',
    OrderingMode: 'PublishOrder',
    PartitionMode: 'Exclusive',
    MaxAttempts: 5,
    BackoffBaseSeconds: 10,
    BackoffMaxSeconds: 900,
    LeaseSeconds: 60,
    HeartbeatMode: 'Auto',
};

const always = (value: number) => () => value;

describe('ComputeBackoffSeconds', () => {
    it('uses the base delay as the ceiling for the first attempt', () => {
        expect(ComputeBackoffSeconds(POLICY, 1, undefined, always(1))).toBe(10);
    });

    it('doubles the ceiling for each later attempt', () => {
        expect(ComputeBackoffSeconds(POLICY, 2, undefined, always(1))).toBe(20);
        expect(ComputeBackoffSeconds(POLICY, 4, undefined, always(1))).toBe(80);
    });

    it('clamps the ceiling to BackoffMaxSeconds', () => {
        expect(ComputeBackoffSeconds(POLICY, 10, undefined, always(1))).toBe(900);
    });

    it('applies full jitter between zero and the ceiling', () => {
        expect(ComputeBackoffSeconds(POLICY, 3, undefined, always(0))).toBe(0);
        expect(ComputeBackoffSeconds(POLICY, 3, undefined, always(0.5))).toBe(20);
    });

    it('prefers a handler-supplied delay, rounded up and clamped', () => {
        expect(ComputeBackoffSeconds(POLICY, 5, 45, always(0))).toBe(45);
        expect(ComputeBackoffSeconds(POLICY, 1, 5000, always(0))).toBe(900);
        expect(ComputeBackoffSeconds(POLICY, 1, 2.2, always(0))).toBe(3);
        expect(ComputeBackoffSeconds(POLICY, 1, -4, always(0))).toBe(0);
    });

    it('ignores a non-finite handler delay', () => {
        expect(ComputeBackoffSeconds(POLICY, 2, Number.NaN, always(1))).toBe(20);
    });

    it('treats attempt zero like attempt one', () => {
        expect(ComputeBackoffSeconds(POLICY, 0, undefined, always(1))).toBe(10);
    });

    it('does not overflow for very large attempt counts', () => {
        const result = ComputeBackoffSeconds(POLICY, 1_000_000, undefined, always(1));
        expect(result).toBe(900);
        expect(Number.isFinite(result)).toBe(true);
    });
});
```

`packages/WorkQueue/core/src/__tests__/compatibility.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FilterUnsupportedReason, SubscriptionUnsupportedReason } from '../compatibility';
import { WORK_QUEUE_FILTER_SUPPORT } from '../filter';
import type { SubscriptionBinding, TransportCapabilities } from '../transport';
import type { HostType, PartitionMode } from '../policy';

const DATABASE_LIKE: TransportCapabilities = {
    Filters: WORK_QUEUE_FILTER_SUPPORT,
    DetectsMessageIDDuplicates: true,
    PersistsProgress: true,
    SupportsOrdered: true,
    SupportsExternalHosts: false,
    CancelPending: true,
    CancelInFlight: true,
    ListPartitions: true,
    PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true,
    CompletedCounts: true,
    MaxRetryDelaySeconds: 2147483647,
};

const CLOUD_LIKE: TransportCapabilities = {
    ...DATABASE_LIKE,
    Filters: { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'] },
    DetectsMessageIDDuplicates: false,
    PersistsProgress: false,
    SupportsOrdered: false,
    SupportsExternalHosts: true,
    CancelPending: false,
    CancelInFlight: false,
    ListPartitions: false,
    PeekDeadLetters: 'BestEffort',
    CompletedCounts: false,
    MaxRetryDelaySeconds: 43200,
};

function binding(hostType: HostType, partitionMode: PartitionMode, backoffMaxSeconds = 900): SubscriptionBinding {
    return {
        Policy: {
            SubscriptionName: 'integration.apply',
            TopicName: 'integration.batch-ready',
            OrderingMode: 'ExplicitSequence',
            PartitionMode: partitionMode,
            MaxAttempts: 5,
            BackoffBaseSeconds: 10,
            BackoffMaxSeconds: backoffMaxSeconds,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
        },
        Filter: null,
        HostType: hostType,
        Config: {},
    };
}

describe('SubscriptionUnsupportedReason', () => {
    it('accepts supported combinations', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'Ordered'), DATABASE_LIKE, false)).toBeNull();
        expect(SubscriptionUnsupportedReason(binding('External', 'Exclusive'), CLOUD_LIKE, false)).toBeNull();
    });

    it('rejects External hosts on a transport that cannot host them', () => {
        expect(SubscriptionUnsupportedReason(binding('External', 'None'), DATABASE_LIKE, false)).toContain('HostType External');
    });

    it('rejects Ordered on a transport without ordering when not staged', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'Ordered'), CLOUD_LIKE, false)).toContain('staging to the database');
    });

    it('accepts Ordered on a cloud transport when an MJ worker stages it', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'Ordered'), CLOUD_LIKE, true)).toBeNull();
    });

    it('rejects Ordered with an External host on a cloud transport even when marked staged', () => {
        expect(SubscriptionUnsupportedReason(binding('External', 'Ordered'), CLOUD_LIKE, true)).toContain('requires HostType MJWorker');
    });

    it('rejects a maximum backoff above the transport limit', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'None', 86400), CLOUD_LIKE, false)).toContain('BackoffMaxSeconds 86400');
    });

    it('reports the first failing rule', () => {
        const reason = SubscriptionUnsupportedReason(binding('External', 'Ordered', 999999), DATABASE_LIKE, false);
        expect(reason).toContain('HostType External');
    });

    it('rejects a filter this transport cannot express, naming the subscription', () => {
        const withFilter = {
            ...binding('MJWorker', 'None'),
            Filter: { logic: 'and' as const, filters: [{ field: 'tenant', operator: 'startswith' as const, value: 'acme' }] },
        };
        const eqOnly: TransportCapabilities = { ...CLOUD_LIKE, Filters: { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq'] } };
        const reason = SubscriptionUnsupportedReason(withFilter, eqOnly, false);
        expect(reason).toContain("integration.apply");
        expect(reason).toContain("operator 'startswith' on field 'tenant'");
        expect(SubscriptionUnsupportedReason(withFilter, DATABASE_LIKE, false)).toBeNull();
    });
});

describe('FilterUnsupportedReason', () => {
    it('passes a null filter and a supported filter, and explains an unsupported one', () => {
        expect(FilterUnsupportedReason(null, CLOUD_LIKE)).toBeNull();
        const filter = { logic: 'and' as const, filters: [{ field: 'eventType', operator: 'eq' as const, value: 'click' }] };
        expect(FilterUnsupportedReason(filter, CLOUD_LIKE)).toBeNull();
        const groups: TransportCapabilities = { ...CLOUD_LIKE, Filters: { ...WORK_QUEUE_FILTER_SUPPORT, SingleFieldOrGroups: false } };
        const grouped = { logic: 'and' as const, filters: [{ logic: 'or' as const, filters: [
            { field: 'tenant', operator: 'eq' as const, value: 'acme' },
            { field: 'tenant', operator: 'eq' as const, value: 'globex' },
        ] }] };
        expect(FilterUnsupportedReason(grouped, groups)).toContain('does not support OR groups');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/core && pnpm test backoff compatibility`
Expected: FAIL — unresolved imports `../backoff`, `../compatibility`.

- [ ] **Step 3: Write `src/backoff.ts`**

```typescript
import type { SubscriptionPolicy } from './policy';

/** Largest exponent applied, so 2^n never overflows before clamping. */
const MAX_EXPONENT = 30;

/**
 * Retry delay in seconds. A finite handler-supplied delay wins (rounded up, clamped to
 * [0, BackoffMaxSeconds]); otherwise full jitter: random(0, min(BackoffMax, BackoffBase × 2^(attempt−1))).
 */
export function ComputeBackoffSeconds(
    policy: SubscriptionPolicy,
    attempt: number,
    handlerDelaySeconds?: number,
    random: () => number = Math.random,
): number {
    const maxSeconds = Math.max(0, policy.BackoffMaxSeconds);
    if (handlerDelaySeconds !== undefined && Number.isFinite(handlerDelaySeconds)) {
        return clamp(Math.ceil(handlerDelaySeconds), 0, maxSeconds);
    }
    const exponent = Math.min(Math.max(0, Math.floor(attempt) - 1), MAX_EXPONENT);
    const ceiling = Math.min(maxSeconds, Math.max(0, policy.BackoffBaseSeconds) * Math.pow(2, exponent));
    return clamp(Math.round(clamp(random(), 0, 1) * ceiling), 0, ceiling);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
```

- [ ] **Step 4: Write `src/compatibility.ts`**

```typescript
import { ValidateSubscriptionFilter } from './filter';
import type { SubscriptionFilter } from './filterTypes';
import { WorkQueueConfigurationError } from './errors';
import type { SubscriptionBinding, TransportCapabilities } from './transport';

/** Why this transport cannot express the subscription's filter (spec 03 §4.1), or null when it can. */
export function FilterUnsupportedReason(
    filter: SubscriptionFilter | null,
    capabilities: TransportCapabilities,
): string | null {
    if (filter === null) {
        return null;
    }
    try {
        ValidateSubscriptionFilter(filter, capabilities.Filters);
        return null;
    } catch (error) {
        if (error instanceof WorkQueueConfigurationError) {
            return error.message;
        }
        throw error;
    }
}

/**
 * Why a transport cannot run a subscription as configured, or null when it can. Used when a
 * subscription is saved and when a host starts (capability gating). Rules follow spec 03 §5.
 */
export function SubscriptionUnsupportedReason(
    binding: SubscriptionBinding,
    capabilities: TransportCapabilities,
    stagedToDatabase: boolean,
): string | null {
    const policy = binding.Policy;
    const name = policy.SubscriptionName;
    if (binding.HostType === 'External' && !capabilities.SupportsExternalHosts) {
        return `Subscription '${name}' uses HostType External, which this transport cannot host`;
    }
    if (policy.PartitionMode === 'Ordered' && !capabilities.SupportsOrdered && !stagedToDatabase) {
        return `Subscription '${name}' is Ordered, which this transport cannot honour without staging to the database`;
    }
    if (policy.PartitionMode === 'Ordered' && binding.HostType === 'External' && !capabilities.SupportsOrdered) {
        return `Subscription '${name}': Ordered on a cloud transport requires HostType MJWorker`;
    }
    if (policy.BackoffMaxSeconds > capabilities.MaxRetryDelaySeconds) {
        return `Subscription '${name}' has BackoffMaxSeconds ${policy.BackoffMaxSeconds}, above this transport's limit of ${capabilities.MaxRetryDelaySeconds}`;
    }
    const filterReason = FilterUnsupportedReason(binding.Filter, capabilities);
    if (filterReason) {
        return `Subscription '${name}': ${filterReason}`;
    }
    return null;
}
```

- [ ] **Step 5: Export the modules**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export * from './backoff';
export * from './compatibility';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 59 plus backoff (8) and compatibility (9): **76 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): jittered backoff and subscription capability gating"
```

---

### Task 5: Outcome mapping and `DeliveryExecution`

**Files:**
- Create: `packages/WorkQueue/core/src/runtime/types.ts`, `src/runtime/outcomes.ts`, `src/runtime/DeliveryExecution.ts`
- Create: `packages/WorkQueue/core/src/__tests__/fakes.ts` (shared test doubles, extended by Task 6)
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/outcomes.test.ts`, `src/__tests__/DeliveryExecution.test.ts`

**Interfaces:**
- Consumes: `WorkJson`, `WorkMessage`; `WorkContext`, `WorkHandler`, `WorkLogger`, `WorkOutcome`, `WorkProgress`, `Outcome`; `FatalWorkError`, `TransientWorkError`; `SubscriptionPolicy`, `DeliveryStatus`; `ITransportConsumer`, `ReceivedDelivery`, `SettleResult` (Task 1); `ComputeBackoffSeconds` (Task 4).
- Produces:
  - `runtime/types.ts`: `ConsumerRuntimeOptions` (spec 03 §3.2 plus optional `ReceiveWaitSeconds`), `ExecutionStopReason = 'LeaseLost' | 'LeaseExpired' | 'MaxProcessingSeconds' | 'Shutdown'`
  - `runtime/outcomes.ts`: `MAX_ATTEMPTS_EXCEEDED_REASON = 'MaxAttemptsExceeded'`, `MAX_DEAD_LETTER_REASON_LENGTH = 100`, `interface HandlerResult { Outcome: WorkOutcome; ErrorText: string | null }`, `type SettleAction = { Kind: 'Complete' } | { Kind: 'Retry'; DelaySeconds: number; Error: string } | { Kind: 'DeadLetter'; Reason: string; Error: string | null }`, `IsWorkOutcome(value: unknown): value is WorkOutcome`, `MapHandlerReturn(value: unknown): HandlerResult`, `MapThrownError(error: unknown): HandlerResult`, `DescribeError(error: unknown): string`, `ErrorMessageOf(error: unknown): string`, `ResolveSettleAction(result: HandlerResult, attempt: number, policy: SubscriptionPolicy, random?: () => number): SettleAction`
  - `runtime/DeliveryExecution.ts`: `MIN_AUTO_HEARTBEAT_INTERVAL_MS = 1000`, `LEASE_EXPIRY_GRACE_MS = 5000`, `interface DeliveryExecutionOptions<TPayload>` (adds optional `LeaseExpiryGraceMs`), `class DeliveryExecution<TPayload>` with `Run(): Promise<SettleResult>`, `Abort(reason: ExecutionStopReason): void`, getters `DeliveryID`, `StopReason`

Behaviour (spec 03 §3, §3.2):

| Situation | Effect |
| --- | --- |
| `Complete` | `consumer.Complete` |
| `Retry` / `TransientWorkError` / any other throw / invalid return / handler factory throws, attempts remain | `consumer.Retry(delivery, ComputeBackoffSeconds(...), error)`; a `TransientWorkError.RetryAfterSeconds` or `Retry.DelaySeconds` is the handler delay |
| same, `Attempt ≥ MaxAttempts` | `consumer.DeadLetter(delivery, 'MaxAttemptsExceeded', error)` |
| `DeadLetter` / `FatalWorkError` | `consumer.DeadLetter(delivery, reason ≤ 100 chars, error)` |
| `HeartbeatMode = 'Auto'` | `ExtendLease` every `max(1000 ms, LeaseSeconds × 1000 / 3)` while the handler runs |
| `HeartbeatMode = 'Manual'` | `ExtendLease` only when the handler calls `context.Heartbeat(progress?)` |
| `ExtendLease` → `Lost` (taken over after expiry, **or revoked by an operator cancel** — spec 03 §7) | signal aborted with reason `'LeaseLost'`; `Heartbeat` resolves `false`; outcome discarded; `Run` returns `{ Kind: 'LeaseLost' }` |
| `ExtendLease` throws, lease still valid | logged as a warning; `Heartbeat` resolves `true`; the next tick retries (spec 03 §3.2: a transient transport failure never aborts a handler) |
| `ExtendLease` throws and `now ≥ LeaseExpiresAt + LEASE_EXPIRY_GRACE_MS` | the lease can no longer be held: signal aborted with reason `'LeaseExpired'`; `Heartbeat` resolves `false`; outcome discarded; `Run` returns `{ Kind: 'LeaseLost' }` |
| `MaxProcessingSeconds` elapsed | signal aborted with reason `'MaxProcessingSeconds'`; automatic renewal stops; `Heartbeat` resolves `false`; a later outcome is still settled (the transport fences it if the lease expired) |
| `Abort('Shutdown')` and the outcome is not `Complete` | `consumer.Release` (no attempt consumed on the Database transport) |
| settle call throws | `Run` returns `{ Kind: 'Failed', Error }` |

Concurrent heartbeats are coalesced: a `Heartbeat` call made while another `ExtendLease` is in flight shares its result (its progress is not sent).

**Lease horizon.** The execution tracks the lease's wall-clock expiry: it starts at `Delivery.LeaseExpiresAt` and moves to `now + LeaseSeconds` on every `ExtendLease` that returns `Held`. Only that horizon (plus `LEASE_EXPIRY_GRACE_MS`, to absorb clock skew between this host and the transport) ends a run whose heartbeats are failing — never a single failed call. An operator cancel needs no separate channel: it rotates the delivery's lease token, so the next `ExtendLease` returns `Lost` (spec 03 §7).

- [ ] **Step 1: Write the shared test doubles**

`packages/WorkQueue/core/src/__tests__/fakes.ts`:

```typescript
import type { WorkJson, WorkMessage } from '../envelope';
import type { WorkContext, WorkHandler, WorkLogger, WorkOutcome, WorkProgress } from '../handler';
import type { DeliveryStatus, SubscriptionPolicy } from '../policy';
import type { ITransportConsumer, ReceivedDelivery, SettleResult } from '../transport';

export type ConsumerCall =
    | { Op: 'Receive'; Max: number; WaitSeconds: number }
    | { Op: 'ExtendLease'; DeliveryID: string; LeaseSeconds: number; Progress: WorkProgress | undefined }
    | { Op: 'Complete'; DeliveryID: string }
    | { Op: 'Retry'; DeliveryID: string; DelaySeconds: number; Error: string }
    | { Op: 'DeadLetter'; DeliveryID: string; Reason: string; Error: string | null }
    | { Op: 'Release'; DeliveryID: string }
    | { Op: 'Close' };

/** An ITransportConsumer that returns scripted batches and records every call. */
export class ScriptedConsumer implements ITransportConsumer {
    public readonly Calls: ConsumerCall[] = [];
    public readonly Batches: ReceivedDelivery[][] = [];
    public ReceiveImpl: ((max: number) => Promise<ReceivedDelivery[]>) | null = null;
    public ReceiveError: Error | null = null;
    public ExtendLeaseResult: 'Held' | 'Lost' | Error = 'Held';
    /** Consumed in order before falling back to ExtendLeaseResult; lets a test script "fail, then succeed". */
    public ExtendLeaseSequence: ('Held' | 'Lost' | Error)[] = [];
    public SettleError: Error | null = null;

    public async Receive(max: number, waitSeconds: number, _signal: AbortSignal): Promise<ReceivedDelivery[]> {
        this.Calls.push({ Op: 'Receive', Max: max, WaitSeconds: waitSeconds });
        if (this.ReceiveError !== null) {
            throw this.ReceiveError;
        }
        if (this.ReceiveImpl !== null) {
            return this.ReceiveImpl(max);
        }
        const batch = this.Batches.shift() ?? [];
        if (batch.length > max) {
            this.Batches.unshift(batch.slice(max));
            return batch.slice(0, max);
        }
        return batch;
    }

    public async ExtendLease(delivery: ReceivedDelivery, leaseSeconds: number, progress?: WorkProgress): Promise<'Held' | 'Lost'> {
        this.Calls.push({ Op: 'ExtendLease', DeliveryID: delivery.DeliveryID, LeaseSeconds: leaseSeconds, Progress: progress });
        const result = this.ExtendLeaseSequence.length > 0 ? this.ExtendLeaseSequence.shift() ?? this.ExtendLeaseResult : this.ExtendLeaseResult;
        if (result instanceof Error) {
            throw result;
        }
        return result;
    }

    public async Complete(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Calls.push({ Op: 'Complete', DeliveryID: delivery.DeliveryID });
        return this.settled(delivery, 'Completed');
    }

    public async Retry(delivery: ReceivedDelivery, delaySeconds: number, error: string): Promise<SettleResult> {
        this.Calls.push({ Op: 'Retry', DeliveryID: delivery.DeliveryID, DelaySeconds: delaySeconds, Error: error });
        return this.settled(delivery, 'Pending');
    }

    public async DeadLetter(delivery: ReceivedDelivery, reason: string, error: string | null): Promise<SettleResult> {
        this.Calls.push({ Op: 'DeadLetter', DeliveryID: delivery.DeliveryID, Reason: reason, Error: error });
        return this.settled(delivery, 'DeadLettered');
    }

    public async Release(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Calls.push({ Op: 'Release', DeliveryID: delivery.DeliveryID });
        return this.settled(delivery, 'Pending');
    }

    public async Close(): Promise<void> {
        this.Calls.push({ Op: 'Close' });
    }

    public Count(op: ConsumerCall['Op']): number {
        return this.Calls.filter((call) => call.Op === op).length;
    }

    public CallsOf<K extends ConsumerCall['Op']>(op: K): Extract<ConsumerCall, { Op: K }>[] {
        return this.Calls.filter((call): call is Extract<ConsumerCall, { Op: K }> => call.Op === op);
    }

    private settled(delivery: ReceivedDelivery, status: DeliveryStatus): SettleResult {
        if (this.SettleError !== null) {
            throw this.SettleError;
        }
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status };
    }
}

export interface LogEntry {
    Level: 'Info' | 'Warn' | 'Error';
    Message: string;
    Data: Record<string, WorkJson> | undefined;
}

export class RecordingLogger implements WorkLogger {
    public readonly Entries: LogEntry[] = [];

    public Info(message: string, data?: Record<string, WorkJson>): void {
        this.Entries.push({ Level: 'Info', Message: message, Data: data });
    }

    public Warn(message: string, data?: Record<string, WorkJson>): void {
        this.Entries.push({ Level: 'Warn', Message: message, Data: data });
    }

    public Error(message: string, _error?: Error, data?: Record<string, WorkJson>): void {
        this.Entries.push({ Level: 'Error', Message: message, Data: data });
    }

    public Has(level: LogEntry['Level'], fragment: string): boolean {
        return this.Entries.some((entry) => entry.Level === level && entry.Message.includes(fragment));
    }
}

export interface Deferred<T> {
    Promise: Promise<T>;
    Resolve(value: T): void;
    Reject(error: Error): void;
}

export function CreateDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { Promise: promise, Resolve: resolve, Reject: reject };
}

export function MakePolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'test.subscription',
        TopicName: 'test.topic',
        OrderingMode: 'PublishOrder',
        PartitionMode: 'None',
        MaxAttempts: 5,
        BackoffBaseSeconds: 10,
        BackoffMaxSeconds: 900,
        LeaseSeconds: 60,
        HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function MakeDelivery(id: string, overrides: Partial<ReceivedDelivery> = {}): ReceivedDelivery {
    return {
        Message: { MessageID: `msg-${id}`, Topic: 'test.topic', Attributes: {}, PublishedAt: '2026-01-01T00:00:00.000Z' },
        DeliveryID: id,
        LeaseToken: `token-${id}`,
        Attempt: 1,
        IsReplay: false,
        LeaseExpiresAt: new Date('2026-01-01T00:01:00.000Z'),
        ...overrides,
    };
}

export function WithPartitionKey(delivery: ReceivedDelivery, partitionKey: string): ReceivedDelivery {
    return { ...delivery, Message: { ...delivery.Message, PartitionKey: partitionKey } };
}

export function HandlerFrom<TPayload extends WorkJson = WorkJson>(
    handle: (message: WorkMessage<TPayload>, context: WorkContext) => Promise<WorkOutcome>,
): () => WorkHandler<TPayload> {
    return () => ({ Handle: handle });
}
```

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/core/src/__tests__/outcomes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { IsWorkOutcome, MapHandlerReturn, MapThrownError, ResolveSettleAction } from '../runtime/outcomes';
import { FatalWorkError, TransientWorkError } from '../errors';
import { Outcome } from '../handler';
import { MakePolicy } from './fakes';

describe('IsWorkOutcome', () => {
    it('accepts the three outcome shapes', () => {
        expect(IsWorkOutcome({ Kind: 'Complete' })).toBe(true);
        expect(IsWorkOutcome({ Kind: 'Retry' })).toBe(true);
        expect(IsWorkOutcome({ Kind: 'Retry', DelaySeconds: 5, Reason: 'busy' })).toBe(true);
        expect(IsWorkOutcome({ Kind: 'DeadLetter', Reason: 'poison' })).toBe(true);
    });

    it('rejects anything else', () => {
        const invalid: unknown[] = [null, undefined, 'Complete', {}, { Kind: 'Retry', DelaySeconds: '5' }, { Kind: 'DeadLetter' }, { Kind: 'Other' }];
        for (const value of invalid) {
            expect(IsWorkOutcome(value)).toBe(false);
        }
    });
});

describe('MapThrownError', () => {
    it('maps FatalWorkError to DeadLetter with the error message as reason', () => {
        const result = MapThrownError(new FatalWorkError('bad payload'));
        expect(result.Outcome).toEqual({ Kind: 'DeadLetter', Reason: 'bad payload' });
        expect(result.ErrorText?.startsWith('FatalWorkError: bad payload')).toBe(true);
    });

    it('maps TransientWorkError to Retry with its delay', () => {
        expect(MapThrownError(new TransientWorkError('rate limited', 45)).Outcome).toEqual({ Kind: 'Retry', Reason: 'rate limited', DelaySeconds: 45 });
    });

    it('maps any other thrown value to Retry', () => {
        expect(MapThrownError(new Error('boom')).Outcome).toEqual({ Kind: 'Retry', Reason: 'boom' });
        const text = MapThrownError('plain text');
        expect(text.Outcome).toEqual({ Kind: 'Retry', Reason: 'plain text' });
        expect(text.ErrorText).toBe('plain text');
    });
});

describe('MapHandlerReturn', () => {
    it('passes valid outcomes through and turns invalid returns into Retry', () => {
        expect(MapHandlerReturn(Outcome.Complete())).toEqual({ Outcome: { Kind: 'Complete' }, ErrorText: null });
        const invalid = MapHandlerReturn(undefined);
        expect(invalid.Outcome.Kind).toBe('Retry');
        expect(invalid.ErrorText).toBe('Handler returned no valid outcome');
    });
});

describe('ResolveSettleAction', () => {
    const policy = MakePolicy({ MaxAttempts: 3, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900 });

    it('completes', () => {
        expect(ResolveSettleAction({ Outcome: Outcome.Complete(), ErrorText: null }, 1, policy)).toEqual({ Kind: 'Complete' });
    });

    it('dead-letters with the handler reason truncated to 100 characters', () => {
        const action = ResolveSettleAction({ Outcome: Outcome.DeadLetter('r'.repeat(150)), ErrorText: 'details' }, 1, policy);
        expect(action.Kind).toBe('DeadLetter');
        if (action.Kind === 'DeadLetter') {
            expect(action.Reason).toHaveLength(100);
            expect(action.Error).toBe('details');
        }
    });

    it('retries with backoff while attempts remain, honouring a handler delay', () => {
        expect(ResolveSettleAction({ Outcome: Outcome.Retry('busy'), ErrorText: null }, 2, policy, () => 1))
            .toEqual({ Kind: 'Retry', DelaySeconds: 20, Error: 'busy' });
        expect(ResolveSettleAction({ Outcome: Outcome.Retry('busy', 45), ErrorText: null }, 2, policy, () => 1))
            .toEqual({ Kind: 'Retry', DelaySeconds: 45, Error: 'busy' });
    });

    it('dead-letters as MaxAttemptsExceeded on the final attempt', () => {
        expect(ResolveSettleAction({ Outcome: Outcome.Retry('busy'), ErrorText: 'stack' }, 3, policy))
            .toEqual({ Kind: 'DeadLetter', Reason: 'MaxAttemptsExceeded', Error: 'stack' });
    });

    it('uses the error text, then the reason, then a default as the retry error', () => {
        const retry = (errorText: string | null, reason?: string) =>
            ResolveSettleAction({ Outcome: Outcome.Retry(reason), ErrorText: errorText }, 1, policy, () => 0);
        expect(retry('stack', 'reason')).toMatchObject({ Error: 'stack' });
        expect(retry(null, 'reason')).toMatchObject({ Error: 'reason' });
        expect(retry(null)).toMatchObject({ Error: 'Retry requested by handler' });
    });
});
```

`packages/WorkQueue/core/src/__tests__/DeliveryExecution.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeliveryExecution } from '../runtime/DeliveryExecution';
import { FatalWorkError, TransientWorkError } from '../errors';
import { Outcome } from '../handler';
import type { WorkContext, WorkOutcome } from '../handler';
import type { WorkMessage } from '../envelope';
import type { SubscriptionPolicy } from '../policy';
import type { ReceivedDelivery } from '../transport';
import { CreateDeferred, HandlerFrom, MakeDelivery, MakePolicy, RecordingLogger, ScriptedConsumer } from './fakes';

interface Setup {
    Execution: DeliveryExecution;
    Consumer: ScriptedConsumer;
    Logger: RecordingLogger;
}

function setup(
    handle: (message: WorkMessage, context: WorkContext) => Promise<WorkOutcome>,
    policy: Partial<SubscriptionPolicy> = {},
    delivery: ReceivedDelivery = MakeDelivery('d1'),
): Setup {
    const consumer = new ScriptedConsumer();
    const logger = new RecordingLogger();
    const execution = new DeliveryExecution({
        Delivery: delivery,
        Consumer: consumer,
        HandlerFactory: HandlerFrom(handle),
        Policy: MakePolicy(policy),
        Log: logger,
        Random: () => 1,
    });
    return { Execution: execution, Consumer: consumer, Logger: logger };
}

describe('DeliveryExecution outcomes', () => {
    it('settles Complete', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Complete());
        expect(await Execution.Run()).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Completed' });
        expect(Consumer.CallsOf('Complete')).toHaveLength(1);
    });

    it('retries with backoff while attempts remain', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Retry('busy'), {}, MakeDelivery('d1', { Attempt: 2 }));
        await Execution.Run();
        expect(Consumer.CallsOf('Retry')).toEqual([{ Op: 'Retry', DeliveryID: 'd1', DelaySeconds: 20, Error: 'busy' }]);
    });

    it('dead-letters as MaxAttemptsExceeded on the final attempt', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Retry('busy'), { MaxAttempts: 5 }, MakeDelivery('d1', { Attempt: 5 }));
        await Execution.Run();
        expect(Consumer.CallsOf('DeadLetter')).toEqual([{ Op: 'DeadLetter', DeliveryID: 'd1', Reason: 'MaxAttemptsExceeded', Error: 'busy' }]);
    });

    it('dead-letters with the handler reason', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.DeadLetter('unknown subscriber'));
        expect(await Execution.Run()).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'DeadLettered' });
        expect(Consumer.CallsOf('DeadLetter')[0]).toMatchObject({ Reason: 'unknown subscriber', Error: null });
    });

    it('maps FatalWorkError to DeadLetter', async () => {
        const { Execution, Consumer } = setup(async () => {
            throw new FatalWorkError('malformed payload');
        });
        await Execution.Run();
        const call = Consumer.CallsOf('DeadLetter')[0];
        expect(call.Reason).toBe('malformed payload');
        expect(call.Error?.startsWith('FatalWorkError: malformed payload')).toBe(true);
    });

    it('maps TransientWorkError to Retry with its delay', async () => {
        const { Execution, Consumer } = setup(async () => {
            throw new TransientWorkError('throttled', 120);
        });
        await Execution.Run();
        expect(Consumer.CallsOf('Retry')[0].DelaySeconds).toBe(120);
    });

    it('maps other thrown errors to Retry and records the error text', async () => {
        const { Execution, Consumer } = setup(async () => {
            throw new Error('connection reset');
        });
        await Execution.Run();
        expect(Consumer.CallsOf('Retry')[0].Error.startsWith('Error: connection reset')).toBe(true);
    });

    it('maps a throwing handler factory to Retry', async () => {
        const consumer = new ScriptedConsumer();
        const execution = new DeliveryExecution({
            Delivery: MakeDelivery('d1'),
            Consumer: consumer,
            HandlerFactory: () => {
                throw new Error('no handler registered');
            },
            Policy: MakePolicy(),
            Log: new RecordingLogger(),
            Random: () => 1,
        });
        await execution.Run();
        expect(consumer.CallsOf('Retry')[0].Error).toContain('no handler registered');
    });

    it('populates the context', async () => {
        const seen: WorkContext[] = [];
        const { Execution } = setup(
            async (_message, context) => {
                seen.push(context);
                return Outcome.Complete();
            },
            { SubscriptionName: 'email.unsubscribe', MaxAttempts: 7 },
            MakeDelivery('d9', { Attempt: 3, IsReplay: true }),
        );
        await Execution.Run();
        expect(seen[0]).toMatchObject({ SubscriptionName: 'email.unsubscribe', DeliveryID: 'd9', Attempt: 3, MaxAttempts: 7, IsReplay: true });
        expect(seen[0].Signal.aborted).toBe(false);
    });

    it('returns Failed when settling throws', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Complete());
        Consumer.SettleError = new Error('db down');
        expect(await Execution.Run()).toEqual({ Kind: 'Failed', DeliveryID: 'd1', Error: 'db down' });
    });
});

describe('DeliveryExecution leases', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Auto mode heartbeats every LeaseSeconds / 3', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer } = setup(async () => gate.Promise, { HeartbeatMode: 'Auto', LeaseSeconds: 30 });
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(25_000);
        expect(Consumer.CallsOf('ExtendLease')).toHaveLength(2);
        expect(Consumer.CallsOf('ExtendLease')[0]).toMatchObject({ LeaseSeconds: 30 });
        gate.Resolve(Outcome.Complete());
        await run;
        await vi.advanceTimersByTimeAsync(30_000);
        expect(Consumer.CallsOf('ExtendLease')).toHaveLength(2);
    });

    it('Manual mode heartbeats only when the handler asks', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const held: boolean[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                held.push(await context.Heartbeat({ Percent: 50, Message: 'halfway' }));
                return gate.Promise;
            },
            { HeartbeatMode: 'Manual', LeaseSeconds: 30 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(Consumer.CallsOf('ExtendLease')).toEqual([
            { Op: 'ExtendLease', DeliveryID: 'd1', LeaseSeconds: 30, Progress: { Percent: 50, Message: 'halfway' } },
        ]);
        expect(held).toEqual([true]);
        gate.Resolve(Outcome.Complete());
        await run;
    });

    it('lease loss aborts the handler and skips settling', async () => {
        const seen: unknown[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                seen.push(await context.Heartbeat(), context.Signal.aborted, String(context.Signal.reason));
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseResult = 'Lost';
        expect(await Execution.Run()).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(seen).toEqual([false, true, 'LeaseLost']);
        expect(Consumer.Count('Complete')).toBe(0);
        expect(Execution.StopReason).toBe('LeaseLost');
    });

    it('treats a failed heartbeat call as still held and logs it', async () => {
        const held: boolean[] = [];
        const { Execution, Consumer, Logger } = setup(
            async (_message, context) => {
                held.push(await context.Heartbeat());
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseResult = new Error('network');
        expect(await Execution.Run()).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
        expect(held).toEqual([true]);
        expect(Logger.Has('Warn', 'Heartbeat failed')).toBe(true);
    });

    it('retries a failed heartbeat on the next tick and keeps the handler running', async () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer, Logger } = setup(async () => gate.Promise, { HeartbeatMode: 'Auto', LeaseSeconds: 30 });
        // The delivery's lease runs to 00:01:00, so the first failure is well inside the horizon.
        Consumer.ExtendLeaseSequence = [new Error('network blip')];
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        expect(Logger.Has('Warn', 'Heartbeat failed')).toBe(true);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('ExtendLease')).toBe(2);
        expect(Execution.StopReason).toBeNull();
        gate.Resolve(Outcome.Complete());
        expect(await run).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
        expect(Consumer.Count('Complete')).toBe(1);
    });

    it('aborts once heartbeats have failed past the lease horizon', async () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const contexts: WorkContext[] = [];
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer, Logger } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Auto', LeaseSeconds: 30 },
        );
        // Lease horizon is 00:01:00 (MakeDelivery) + 5 s grace; every renewal fails.
        Consumer.ExtendLeaseResult = new Error('database unreachable');
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(50_000);
        expect(contexts[0].Signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(20_000);
        expect(contexts[0].Signal.aborted).toBe(true);
        expect(String(contexts[0].Signal.reason)).toBe('LeaseExpired');
        expect(Execution.StopReason).toBe('LeaseExpired');
        expect(Logger.Has('Warn', 'Heartbeats kept failing')).toBe(true);
        gate.Resolve(Outcome.Complete());
        expect(await run).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(Consumer.Count('Complete')).toBe(0);
    });

    it('treats an operator cancel (rotated lease token) as a lost lease and discards the outcome', async () => {
        // Spec 03 §7: Discard on an InFlight delivery rotates LeaseToken, so the next ExtendLease reports Lost.
        const seen: boolean[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                seen.push(await context.Heartbeat());
                // A handler that ignores the signal still cannot settle: the fence rejects it.
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseResult = 'Lost';
        expect(await Execution.Run()).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(seen).toEqual([false]);
        expect(Consumer.Count('Complete')).toBe(0);
        expect(Execution.StopReason).toBe('LeaseLost');
    });

    it('MaxProcessingSeconds aborts the handler and stops renewing', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const contexts: WorkContext[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Auto', LeaseSeconds: 30, MaxProcessingSeconds: 15 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(contexts[0].Signal.aborted).toBe(true);
        expect(String(contexts[0].Signal.reason)).toBe('MaxProcessingSeconds');
        await vi.advanceTimersByTimeAsync(20_000);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        expect(await contexts[0].Heartbeat()).toBe(false);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        gate.Resolve(Outcome.Complete());
        expect(await run).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
    });

    it('releases a delivery that did not complete after a shutdown abort', async () => {
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                await new Promise<void>((resolve) => context.Signal.addEventListener('abort', () => resolve()));
                throw new Error('interrupted');
            },
            { HeartbeatMode: 'Manual' },
        );
        const run = Execution.Run();
        Execution.Abort('Shutdown');
        expect(await run).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Pending' });
        expect(Consumer.Count('Release')).toBe(1);
        expect(Consumer.Count('Retry')).toBe(0);
    });

    it('still completes a delivery whose handler finished after a shutdown abort', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer } = setup(async () => gate.Promise, { HeartbeatMode: 'Manual' });
        const run = Execution.Run();
        Execution.Abort('Shutdown');
        gate.Resolve(Outcome.Complete());
        await run;
        expect(Consumer.Count('Complete')).toBe(1);
        expect(Consumer.Count('Release')).toBe(0);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/core && pnpm test outcomes DeliveryExecution`
Expected: FAIL — unresolved imports `../runtime/outcomes`, `../runtime/DeliveryExecution`.

- [ ] **Step 4: Write `src/runtime/types.ts`**

```typescript
export interface ConsumerRuntimeOptions {
    /** Maximum handlers in flight for this subscription on this host. */
    Concurrency: number;
    ReceiveBatchSize: number;
    IdlePollMinMs: number;
    IdlePollMaxMs: number;
    ShutdownDrainMs: number;
    /** Long-poll wait passed to ITransportConsumer.Receive (SQS: up to 20). Default 0. */
    ReceiveWaitSeconds?: number;
}

/**
 * Why a run stopped early. 'LeaseLost' = the transport reported the lease gone (taken over, or revoked by an
 * operator cancel); 'LeaseExpired' = heartbeats kept failing until the lease's wall-clock horizon passed.
 */
export type ExecutionStopReason = 'LeaseLost' | 'LeaseExpired' | 'MaxProcessingSeconds' | 'Shutdown';
```

- [ ] **Step 5: Write `src/runtime/outcomes.ts`**

```typescript
import { ComputeBackoffSeconds } from '../backoff';
import { FatalWorkError, TransientWorkError } from '../errors';
import { Outcome } from '../handler';
import type { WorkOutcome } from '../handler';
import type { SubscriptionPolicy } from '../policy';

export const MAX_ATTEMPTS_EXCEEDED_REASON = 'MaxAttemptsExceeded';
/** Matches WorkQueueDelivery.DeadLetterReason nvarchar(100). */
export const MAX_DEAD_LETTER_REASON_LENGTH = 100;

const INVALID_RETURN_TEXT = 'Handler returned no valid outcome';
const DEFAULT_RETRY_ERROR = 'Retry requested by handler';

export interface HandlerResult {
    Outcome: WorkOutcome;
    ErrorText: string | null;
}

export type SettleAction =
    | { Kind: 'Complete' }
    | { Kind: 'Retry'; DelaySeconds: number; Error: string }
    | { Kind: 'DeadLetter'; Reason: string; Error: string | null };

export function IsWorkOutcome(value: unknown): value is WorkOutcome {
    if (typeof value !== 'object' || value === null || !('Kind' in value)) {
        return false;
    }
    if (value.Kind === 'Complete') {
        return true;
    }
    if (value.Kind === 'Retry') {
        return !('DelaySeconds' in value) || value.DelaySeconds === undefined || typeof value.DelaySeconds === 'number';
    }
    return value.Kind === 'DeadLetter' && 'Reason' in value && typeof value.Reason === 'string';
}

export function MapHandlerReturn(value: unknown): HandlerResult {
    if (IsWorkOutcome(value)) {
        return { Outcome: value, ErrorText: null };
    }
    return { Outcome: Outcome.Retry(INVALID_RETURN_TEXT), ErrorText: INVALID_RETURN_TEXT };
}

export function MapThrownError(error: unknown): HandlerResult {
    if (error instanceof FatalWorkError) {
        return { Outcome: Outcome.DeadLetter(error.message), ErrorText: DescribeError(error) };
    }
    if (error instanceof TransientWorkError) {
        return { Outcome: Outcome.Retry(error.message, error.RetryAfterSeconds), ErrorText: DescribeError(error) };
    }
    return { Outcome: Outcome.Retry(ErrorMessageOf(error)), ErrorText: DescribeError(error) };
}

/** "Name: message" followed by stack frames when available. */
export function DescribeError(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }
    const header = `${error.name}: ${error.message}`;
    const frames = (error.stack ?? '').split('\n').slice(1).join('\n');
    return frames.length > 0 ? `${header}\n${frames}` : header;
}

export function ErrorMessageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function ResolveSettleAction(
    result: HandlerResult,
    attempt: number,
    policy: SubscriptionPolicy,
    random?: () => number,
): SettleAction {
    const outcome = result.Outcome;
    if (outcome.Kind === 'Complete') {
        return { Kind: 'Complete' };
    }
    if (outcome.Kind === 'DeadLetter') {
        return { Kind: 'DeadLetter', Reason: truncate(outcome.Reason, MAX_DEAD_LETTER_REASON_LENGTH), Error: result.ErrorText };
    }
    const error = result.ErrorText ?? outcome.Reason ?? DEFAULT_RETRY_ERROR;
    if (attempt >= policy.MaxAttempts) {
        return { Kind: 'DeadLetter', Reason: MAX_ATTEMPTS_EXCEEDED_REASON, Error: error };
    }
    return { Kind: 'Retry', DelaySeconds: ComputeBackoffSeconds(policy, attempt, outcome.DelaySeconds, random), Error: error };
}

function truncate(text: string, maxLength: number): string {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
```

- [ ] **Step 6: Write `src/runtime/DeliveryExecution.ts`**

```typescript
import type { WorkJson } from '../envelope';
import type { WorkContext, WorkHandler, WorkLogger, WorkProgress } from '../handler';
import type { SubscriptionPolicy } from '../policy';
import type { ITransportConsumer, ReceivedDelivery, SettleResult } from '../transport';
import { ErrorMessageOf, MapHandlerReturn, MapThrownError, ResolveSettleAction } from './outcomes';
import type { HandlerResult, SettleAction } from './outcomes';
import type { ExecutionStopReason } from './types';

export const MIN_AUTO_HEARTBEAT_INTERVAL_MS = 1000;

/** Clock-skew allowance added to the lease horizon before a run whose heartbeats keep failing is abandoned. */
export const LEASE_EXPIRY_GRACE_MS = 5000;

export interface DeliveryExecutionOptions<TPayload extends WorkJson = WorkJson> {
    Delivery: ReceivedDelivery<TPayload>;
    Consumer: ITransportConsumer<TPayload>;
    HandlerFactory: () => WorkHandler<TPayload>;
    Policy: SubscriptionPolicy;
    Log: WorkLogger;
    Now?: () => number;
    Random?: () => number;
    /** Defaults to LEASE_EXPIRY_GRACE_MS. */
    LeaseExpiryGraceMs?: number;
}

/** Runs one handler for one delivery: context, lease heartbeats, processing cap, outcome, settle. */
export class DeliveryExecution<TPayload extends WorkJson = WorkJson> {
    private readonly controller = new AbortController();
    private stopReason: ExecutionStopReason | null = null;
    private leaseLost = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private capTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingHeartbeat: Promise<boolean> | null = null;
    /** Wall-clock instant this lease is good until; moves forward on every ExtendLease that returns Held. */
    private leaseExpiresAtMs: number;

    constructor(private readonly options: DeliveryExecutionOptions<TPayload>) {
        this.leaseExpiresAtMs = options.Delivery.LeaseExpiresAt.getTime();
    }

    private now(): number {
        return (this.options.Now ?? Date.now)();
    }

    public get DeliveryID(): string {
        return this.options.Delivery.DeliveryID;
    }

    public get StopReason(): ExecutionStopReason | null {
        return this.stopReason;
    }

    /** Requests the handler to stop. The first reason wins. */
    public Abort(reason: ExecutionStopReason): void {
        if (this.stopReason === null) {
            this.stopReason = reason;
        }
        if (!this.controller.signal.aborted) {
            this.controller.abort(reason);
        }
    }

    public async Run(): Promise<SettleResult> {
        const startedAt = this.now();
        this.startTimers();
        let result: HandlerResult;
        try {
            result = await this.invokeHandler();
        } finally {
            this.stopTimers();
        }
        if (this.pendingHeartbeat !== null) {
            await this.pendingHeartbeat;
        }
        if (this.leaseLost) {
            this.options.Log.Warn('Lease lost before settle; handler outcome discarded', this.logData({ DurationMs: this.now() - startedAt, StopReason: this.stopReason }));
            return { Kind: 'LeaseLost', DeliveryID: this.DeliveryID };
        }
        if (this.stopReason === 'Shutdown' && result.Outcome.Kind !== 'Complete') {
            return this.settleSafely(() => this.options.Consumer.Release(this.options.Delivery));
        }
        return this.settle(ResolveSettleAction(result, this.options.Delivery.Attempt, this.options.Policy, this.options.Random));
    }

    private async invokeHandler(): Promise<HandlerResult> {
        try {
            const handler = this.options.HandlerFactory();
            const returned = await handler.Handle(this.options.Delivery.Message, this.buildContext());
            return MapHandlerReturn(returned);
        } catch (error) {
            return MapThrownError(error);
        }
    }

    private buildContext(): WorkContext {
        const { Delivery, Policy, Log } = this.options;
        return {
            SubscriptionName: Policy.SubscriptionName,
            DeliveryID: Delivery.DeliveryID,
            Attempt: Delivery.Attempt,
            MaxAttempts: Policy.MaxAttempts,
            IsReplay: Delivery.IsReplay,
            Signal: this.controller.signal,
            Heartbeat: (progress?: WorkProgress) => this.heartbeat(progress),
            Log,
        };
    }

    private async heartbeat(progress?: WorkProgress): Promise<boolean> {
        if (this.leaseLost || this.stopReason === 'MaxProcessingSeconds') {
            return false;
        }
        if (this.pendingHeartbeat !== null) {
            return this.pendingHeartbeat;
        }
        this.pendingHeartbeat = this.extendLease(progress);
        try {
            return await this.pendingHeartbeat;
        } finally {
            this.pendingHeartbeat = null;
        }
    }

    private async extendLease(progress?: WorkProgress): Promise<boolean> {
        const { Consumer, Delivery, Policy, Log } = this.options;
        try {
            const status = await Consumer.ExtendLease(Delivery, Policy.LeaseSeconds, progress);
            if (status === 'Lost') {
                // Taken over after expiry, or revoked by an operator cancel (spec 03 §7).
                this.leaseLost = true;
                this.Abort('LeaseLost');
                Log.Warn('Lease lost; aborting handler', this.logData({}));
                return false;
            }
            this.leaseExpiresAtMs = this.now() + Policy.LeaseSeconds * 1000;
            return true;
        } catch (error) {
            // A transient transport failure must not abort a healthy handler: keep going until the lease
            // horizon itself has passed, then give up (spec 03 §3.2).
            const graceMs = this.options.LeaseExpiryGraceMs ?? LEASE_EXPIRY_GRACE_MS;
            if (this.now() >= this.leaseExpiresAtMs + graceMs) {
                this.leaseLost = true;
                this.Abort('LeaseExpired');
                Log.Warn('Heartbeats kept failing until the lease expired; aborting handler', this.logData({ Error: ErrorMessageOf(error) }));
                return false;
            }
            Log.Warn('Heartbeat failed; the next heartbeat will retry', this.logData({ Error: ErrorMessageOf(error) }));
            return true;
        }
    }

    private startTimers(): void {
        const policy = this.options.Policy;
        if (policy.HeartbeatMode === 'Auto') {
            const intervalMs = Math.max(MIN_AUTO_HEARTBEAT_INTERVAL_MS, Math.floor((policy.LeaseSeconds * 1000) / 3));
            this.heartbeatTimer = setInterval(() => {
                void this.heartbeat();
            }, intervalMs);
        }
        if (policy.MaxProcessingSeconds !== undefined && policy.MaxProcessingSeconds > 0) {
            this.capTimer = setTimeout(() => this.onProcessingCap(), policy.MaxProcessingSeconds * 1000);
        }
    }

    private onProcessingCap(): void {
        this.clearHeartbeatTimer();
        this.options.Log.Warn('MaxProcessingSeconds reached; aborting handler and no longer renewing the lease', this.logData({}));
        this.Abort('MaxProcessingSeconds');
    }

    private stopTimers(): void {
        this.clearHeartbeatTimer();
        if (this.capTimer !== null) {
            clearTimeout(this.capTimer);
            this.capTimer = null;
        }
    }

    private clearHeartbeatTimer(): void {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private settle(action: SettleAction): Promise<SettleResult> {
        const { Consumer, Delivery } = this.options;
        if (action.Kind === 'Complete') {
            return this.settleSafely(() => Consumer.Complete(Delivery));
        }
        if (action.Kind === 'Retry') {
            return this.settleSafely(() => Consumer.Retry(Delivery, action.DelaySeconds, action.Error));
        }
        return this.settleSafely(() => Consumer.DeadLetter(Delivery, action.Reason, action.Error));
    }

    private async settleSafely(operation: () => Promise<SettleResult>): Promise<SettleResult> {
        try {
            return await operation();
        } catch (error) {
            this.options.Log.Error('Settle failed; the delivery will be redelivered when its lease expires', error instanceof Error ? error : undefined, this.logData({}));
            return { Kind: 'Failed', DeliveryID: this.DeliveryID, Error: ErrorMessageOf(error) };
        }
    }

    private logData(extra: Record<string, WorkJson>): Record<string, WorkJson> {
        const { Delivery, Policy } = this.options;
        return {
            Subscription: Policy.SubscriptionName,
            DeliveryID: Delivery.DeliveryID,
            MessageID: Delivery.Message.MessageID,
            Attempt: Delivery.Attempt,
            ...extra,
        };
    }
}
```

- [ ] **Step 7: Export the modules**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export * from './runtime/types';
export * from './runtime/outcomes';
export * from './runtime/DeliveryExecution';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 76 plus outcomes (11) and DeliveryExecution (20): **107 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): handler outcome mapping and leased delivery execution"
```

---

### Task 6: `ConsumerRuntime`

**Files:**
- Create: `packages/WorkQueue/core/src/runtime/ConsumerRuntime.ts`
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/ConsumerRuntime.test.ts`

**Interfaces:**
- Consumes: `ConsumerRuntimeOptions`, `DeliveryExecution`, `ErrorMessageOf` (Task 5); `ITransportConsumer`, `ReceivedDelivery`, `SettleResult`, `WorkHandler`, `WorkLogger`, `SubscriptionPolicy`, `WorkJson` (Task 1); test doubles from `src/__tests__/fakes.ts` (Task 5).
- Produces:
  - `SKIPPED_AFTER_PARTITION_FAILURE = 'SkippedAfterEarlierFailureInPartition'`
  - `class ConsumerRuntime<TPayload extends WorkJson = WorkJson>` exactly as spec 03 §3.2: `constructor(consumer, handlerFactory, policy, options, log, now?)`, `Start(): void`, `Stop(): Promise<void>`, `Kick(): void`, `get InFlightCount(): number`, `ProcessBatch(deliveries): Promise<SettleResult[]>`; plus `get IsRunning(): boolean`

Loop rules:
- Receives `min(Concurrency − in-flight, ReceiveBatchSize)` with `waitSeconds = ReceiveWaitSeconds ?? 0`. With no free slot it sleeps up to `IdlePollMaxMs`, woken as soon as any delivery settles.
- An empty receive sleeps `IdlePollMinMs`, doubling each empty receive up to `IdlePollMaxMs`; any work resets it. `Kick()` wakes a sleep immediately and resets the delay to the minimum.
- A receive that throws is logged and treated as empty.
- `Stop()` stops receiving; deliveries returned by a receive that was in progress are released unstarted; waits up to `ShutdownDrainMs` for in-flight handlers, then aborts them with `'Shutdown'` (non-complete outcomes are released) and waits up to `ShutdownDrainMs` again before giving up with a warning.
- `ProcessBatch` (Lambda mode, no loop) runs up to `Concurrency` lanes at once. For `Exclusive`/`Ordered` policies, deliveries sharing a `Message.PartitionKey` form one lane processed in order; after a delivery in a lane does not settle as `Completed`, the rest of that lane is not run and reports `{ Kind: 'Failed', Error: 'SkippedAfterEarlierFailureInPartition' }` (the AWS Lambda adapter maps these to batch item failures). Results align with the input.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/core/src/__tests__/ConsumerRuntime.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsumerRuntime, SKIPPED_AFTER_PARTITION_FAILURE } from '../runtime/ConsumerRuntime';
import { Outcome } from '../handler';
import type { WorkContext, WorkOutcome } from '../handler';
import type { WorkMessage } from '../envelope';
import type { SubscriptionPolicy } from '../policy';
import type { ReceivedDelivery } from '../transport';
import type { ConsumerRuntimeOptions } from '../runtime/types';
import { CreateDeferred, HandlerFrom, MakeDelivery, MakePolicy, RecordingLogger, ScriptedConsumer, WithPartitionKey } from './fakes';
import type { Deferred } from './fakes';

const OPTIONS: ConsumerRuntimeOptions = {
    Concurrency: 2,
    ReceiveBatchSize: 10,
    IdlePollMinMs: 100,
    IdlePollMaxMs: 400,
    ShutdownDrainMs: 1000,
};

interface RuntimeOverrides {
    Options?: Partial<ConsumerRuntimeOptions>;
    Policy?: Partial<SubscriptionPolicy>;
    Logger?: RecordingLogger;
}

function createRuntime(
    consumer: ScriptedConsumer,
    handle: (message: WorkMessage, context: WorkContext) => Promise<WorkOutcome>,
    overrides: RuntimeOverrides = {},
): ConsumerRuntime {
    return new ConsumerRuntime(
        consumer,
        HandlerFrom(handle),
        MakePolicy({ HeartbeatMode: 'Manual', ...overrides.Policy }),
        { ...OPTIONS, ...overrides.Options },
        overrides.Logger ?? new RecordingLogger(),
    );
}

function gates(ids: string[]): (id: string) => Deferred<WorkOutcome> {
    const map = new Map(ids.map((id) => [`msg-${id}`, CreateDeferred<WorkOutcome>()]));
    return (messageID: string) => {
        const gate = map.get(messageID.startsWith('msg-') ? messageID : `msg-${messageID}`);
        if (gate === undefined) {
            throw new Error(`No gate for ${messageID}`);
        }
        return gate;
    };
}

describe('ConsumerRuntime loop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('receives a batch and settles every delivery', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1'), MakeDelivery('d2')]);
        const runtime = createRuntime(consumer, async () => Outcome.Complete());
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.CallsOf('Complete').map((call) => call.DeliveryID).sort()).toEqual(['d1', 'd2']);
        expect(runtime.InFlightCount).toBe(0);
        await runtime.Stop();
    });

    it('never runs more handlers than Concurrency', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1'), MakeDelivery('d2'), MakeDelivery('d3')]);
        const gate = gates(['d1', 'd2', 'd3']);
        const runtime = createRuntime(consumer, async (message) => gate(message.MessageID).Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.CallsOf('Receive')).toEqual([{ Op: 'Receive', Max: 2, WaitSeconds: 0 }]);
        expect(runtime.InFlightCount).toBe(2);
        await vi.advanceTimersByTimeAsync(300);
        expect(consumer.Count('Receive')).toBe(1);
        gate('d1').Resolve(Outcome.Complete());
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.CallsOf('Receive')[1]).toEqual({ Op: 'Receive', Max: 1, WaitSeconds: 0 });
        expect(runtime.InFlightCount).toBe(2);
        gate('d2').Resolve(Outcome.Complete());
        gate('d3').Resolve(Outcome.Complete());
        await runtime.Stop();
        expect(consumer.Count('Complete')).toBe(3);
    });

    it('doubles the idle delay up to IdlePollMaxMs', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, async () => Outcome.Complete());
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(1);
        await vi.advanceTimersByTimeAsync(99);
        expect(consumer.Count('Receive')).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(consumer.Count('Receive')).toBe(2);
        await vi.advanceTimersByTimeAsync(199);
        expect(consumer.Count('Receive')).toBe(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(consumer.Count('Receive')).toBe(3);
        await vi.advanceTimersByTimeAsync(400);
        expect(consumer.Count('Receive')).toBe(4);
        await vi.advanceTimersByTimeAsync(400);
        expect(consumer.Count('Receive')).toBe(5);
        await runtime.Stop();
    });

    it('wakes immediately on Kick', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, async () => Outcome.Complete(), { Options: { IdlePollMinMs: 1000, IdlePollMaxMs: 1000 } });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(1);
        runtime.Kick();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(2);
        await runtime.Stop();
    });

    it('resets the idle delay after receiving work', async () => {
        const consumer = new ScriptedConsumer();
        const gate = gates(['d1']);
        const runtime = createRuntime(consumer, async (message) => gate(message.MessageID).Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(100);
        expect(consumer.Count('Receive')).toBe(2);
        consumer.Batches.push([MakeDelivery('d1')]);
        await vi.advanceTimersByTimeAsync(200);
        expect(consumer.Count('Receive')).toBe(4);
        await vi.advanceTimersByTimeAsync(99);
        expect(consumer.Count('Receive')).toBe(4);
        await vi.advanceTimersByTimeAsync(1);
        expect(consumer.Count('Receive')).toBe(5);
        gate('d1').Resolve(Outcome.Complete());
        await runtime.Stop();
    });

    it('logs a failed receive and keeps polling', async () => {
        const consumer = new ScriptedConsumer();
        consumer.ReceiveError = new Error('network');
        const logger = new RecordingLogger();
        const runtime = createRuntime(consumer, async () => Outcome.Complete(), { Logger: logger });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(logger.Has('Error', 'Receive failed')).toBe(true);
        await vi.advanceTimersByTimeAsync(100);
        expect(consumer.Count('Receive')).toBe(2);
        await runtime.Stop();
    });

    it('is idempotent on Start', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, async () => Outcome.Complete());
        runtime.Start();
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(1);
        expect(runtime.IsRunning).toBe(true);
        await runtime.Stop();
        expect(runtime.IsRunning).toBe(false);
    });
});

describe('ConsumerRuntime.Stop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits for in-flight handlers to drain and stops receiving', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1')]);
        const gate = gates(['d1']);
        const runtime = createRuntime(consumer, async (message) => gate(message.MessageID).Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        let stopped = false;
        const stopping = runtime.Stop().then(() => {
            stopped = true;
        });
        await vi.advanceTimersByTimeAsync(500);
        expect(stopped).toBe(false);
        gate('d1').Resolve(Outcome.Complete());
        await stopping;
        expect(consumer.Count('Complete')).toBe(1);
        expect(consumer.Count('Release')).toBe(0);
        const receives = consumer.Count('Receive');
        await vi.advanceTimersByTimeAsync(5000);
        expect(consumer.Count('Receive')).toBe(receives);
    });

    it('aborts handlers after the drain period and releases unfinished deliveries', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1')]);
        const runtime = createRuntime(consumer, async (_message, context) => {
            await new Promise<void>((resolve) => context.Signal.addEventListener('abort', () => resolve()));
            throw new Error('interrupted');
        });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        const stopping = runtime.Stop();
        await vi.advanceTimersByTimeAsync(1000);
        await stopping;
        expect(consumer.CallsOf('Release').map((call) => call.DeliveryID)).toEqual(['d1']);
        expect(consumer.Count('Retry')).toBe(0);
    });

    it('releases deliveries returned by a receive that finished after Stop', async () => {
        const consumer = new ScriptedConsumer();
        const late = CreateDeferred<ReceivedDelivery[]>();
        consumer.ReceiveImpl = () => late.Promise;
        const handled: string[] = [];
        const runtime = createRuntime(consumer, async (message) => {
            handled.push(message.MessageID);
            return Outcome.Complete();
        });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        const stopping = runtime.Stop();
        late.Resolve([MakeDelivery('late')]);
        await stopping;
        expect(consumer.CallsOf('Release').map((call) => call.DeliveryID)).toEqual(['late']);
        expect(handled).toEqual([]);
    });
});

describe('ConsumerRuntime.ProcessBatch', () => {
    const outcomeFor = (outcomes: Record<string, WorkOutcome>) => async (message: WorkMessage): Promise<WorkOutcome> =>
        outcomes[message.MessageID] ?? Outcome.Complete();

    it('processes every delivery and aligns results with the input', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, outcomeFor({ 'msg-d2': Outcome.DeadLetter('poison') }));
        const results = await runtime.ProcessBatch([MakeDelivery('d1'), MakeDelivery('d2'), MakeDelivery('d3')]);
        expect(results).toEqual([
            { Kind: 'Settled', DeliveryID: 'd1', Status: 'Completed' },
            { Kind: 'Settled', DeliveryID: 'd2', Status: 'DeadLettered' },
            { Kind: 'Settled', DeliveryID: 'd3', Status: 'Completed' },
        ]);
    });

    it('skips the rest of a partition after a delivery that did not complete', async () => {
        const consumer = new ScriptedConsumer();
        const handled: string[] = [];
        const runtime = createRuntime(
            consumer,
            async (message) => {
                handled.push(message.MessageID);
                return message.MessageID === 'msg-a1' ? Outcome.Retry('busy') : Outcome.Complete();
            },
            { Policy: { PartitionMode: 'Exclusive' } },
        );
        const results = await runtime.ProcessBatch([
            WithPartitionKey(MakeDelivery('a1'), 'A'),
            WithPartitionKey(MakeDelivery('a2'), 'A'),
            WithPartitionKey(MakeDelivery('b1'), 'B'),
        ]);
        expect(results).toEqual([
            { Kind: 'Settled', DeliveryID: 'a1', Status: 'Pending' },
            { Kind: 'Failed', DeliveryID: 'a2', Error: SKIPPED_AFTER_PARTITION_FAILURE },
            { Kind: 'Settled', DeliveryID: 'b1', Status: 'Completed' },
        ]);
        expect(handled.sort()).toEqual(['msg-a1', 'msg-b1']);
    });

    it('does not group by partition key when PartitionMode is None', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, outcomeFor({ 'msg-a1': Outcome.Retry('busy') }));
        const results = await runtime.ProcessBatch([
            WithPartitionKey(MakeDelivery('a1'), 'A'),
            WithPartitionKey(MakeDelivery('a2'), 'A'),
        ]);
        expect(results[1]).toEqual({ Kind: 'Settled', DeliveryID: 'a2', Status: 'Completed' });
    });

    it('runs at most Concurrency lanes at once', async () => {
        const consumer = new ScriptedConsumer();
        let active = 0;
        let peak = 0;
        const runtime = createRuntime(
            consumer,
            async () => {
                active += 1;
                peak = Math.max(peak, active);
                await Promise.resolve();
                await Promise.resolve();
                active -= 1;
                return Outcome.Complete();
            },
            { Options: { Concurrency: 1 } },
        );
        await runtime.ProcessBatch([MakeDelivery('d1'), MakeDelivery('d2'), MakeDelivery('d3')]);
        expect(peak).toBe(1);
        expect(consumer.Count('Complete')).toBe(3);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/core && pnpm test ConsumerRuntime`
Expected: FAIL — unresolved import `../runtime/ConsumerRuntime`.

- [ ] **Step 3: Write `src/runtime/ConsumerRuntime.ts`**

```typescript
import type { WorkJson } from '../envelope';
import type { WorkHandler, WorkLogger } from '../handler';
import type { SubscriptionPolicy } from '../policy';
import type { ITransportConsumer, ReceivedDelivery, SettleResult } from '../transport';
import { DeliveryExecution } from './DeliveryExecution';
import { ErrorMessageOf } from './outcomes';
import type { ConsumerRuntimeOptions } from './types';

export const SKIPPED_AFTER_PARTITION_FAILURE = 'SkippedAfterEarlierFailureInPartition';

interface RunningExecution<TPayload extends WorkJson> {
    Execution: DeliveryExecution<TPayload>;
    Done: Promise<SettleResult>;
}

/** Transport-agnostic loop: receive → run handler with lease management → settle. */
export class ConsumerRuntime<TPayload extends WorkJson = WorkJson> {
    private running = false;
    private loopPromise: Promise<void> | null = null;
    private readonly executions = new Map<string, RunningExecution<TPayload>>();
    private receiveController = new AbortController();
    private wakeResolver: (() => void) | null = null;
    private wakeTimer: ReturnType<typeof setTimeout> | null = null;
    private kickPending = false;

    constructor(
        private readonly consumer: ITransportConsumer<TPayload>,
        private readonly handlerFactory: () => WorkHandler<TPayload>,
        private readonly policy: SubscriptionPolicy,
        private readonly options: ConsumerRuntimeOptions,
        private readonly log: WorkLogger,
        private readonly now: () => number = () => Date.now(),
    ) {}

    public get InFlightCount(): number {
        return this.executions.size;
    }

    public get IsRunning(): boolean {
        return this.running;
    }

    public Start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        this.receiveController = new AbortController();
        this.loopPromise = this.loop();
    }

    /** Wake an idle loop immediately (used after in-process publish). */
    public Kick(): void {
        this.kickPending = true;
        this.wake();
    }

    /** Stops receiving, waits up to ShutdownDrainMs, then aborts remaining handlers and releases their deliveries. */
    public async Stop(): Promise<void> {
        this.running = false;
        this.receiveController.abort();
        this.wake();
        if (this.loopPromise !== null) {
            await this.loopPromise;
            this.loopPromise = null;
        }
        if (await this.waitForExecutions(this.options.ShutdownDrainMs)) {
            return;
        }
        for (const running of this.executions.values()) {
            running.Execution.Abort('Shutdown');
        }
        if (!(await this.waitForExecutions(this.options.ShutdownDrainMs))) {
            this.log.Warn('Handlers still running after shutdown; their leases will expire and the deliveries will be redelivered', {
                Subscription: this.policy.SubscriptionName,
                Remaining: this.executions.size,
            });
        }
    }

    /** Process exactly the given deliveries (Lambda mode: no loop). Results align with the input. */
    public async ProcessBatch(deliveries: ReceivedDelivery<TPayload>[]): Promise<SettleResult[]> {
        const results: SettleResult[] = [];
        const lanes = [...this.groupIntoLanes(deliveries).values()];
        let nextLane = 0;
        const workerCount = Math.max(1, Math.min(this.options.Concurrency, lanes.length));
        const workers = Array.from({ length: workerCount }, async () => {
            while (nextLane < lanes.length) {
                const lane = lanes[nextLane];
                nextLane += 1;
                await this.runLane(lane, deliveries, results);
            }
        });
        await Promise.all(workers);
        return results;
    }

    private async loop(): Promise<void> {
        let idleMs = this.options.IdlePollMinMs;
        while (this.running) {
            const free = this.options.Concurrency - this.executions.size;
            if (free <= 0) {
                await this.sleep(this.options.IdlePollMaxMs);
                continue;
            }
            this.kickPending = false;
            const deliveries = await this.receive(Math.min(free, this.options.ReceiveBatchSize));
            if (!this.running) {
                await this.releaseUnstarted(deliveries);
                return;
            }
            if (deliveries.length > 0) {
                idleMs = this.options.IdlePollMinMs;
                deliveries.forEach((delivery) => {
                    void this.startExecution(delivery);
                });
                continue;
            }
            if (this.kickPending) {
                idleMs = this.options.IdlePollMinMs;
                continue;
            }
            await this.sleep(idleMs);
            idleMs = this.kickPending ? this.options.IdlePollMinMs : Math.min(idleMs * 2, this.options.IdlePollMaxMs);
        }
    }

    private async receive(max: number): Promise<ReceivedDelivery<TPayload>[]> {
        try {
            return await this.consumer.Receive(max, this.options.ReceiveWaitSeconds ?? 0, this.receiveController.signal);
        } catch (error) {
            if (this.running) {
                this.log.Error('Receive failed; backing off', error instanceof Error ? error : undefined, {
                    Subscription: this.policy.SubscriptionName,
                    Error: ErrorMessageOf(error),
                });
            }
            return [];
        }
    }

    private async releaseUnstarted(deliveries: ReceivedDelivery<TPayload>[]): Promise<void> {
        for (const delivery of deliveries) {
            try {
                await this.consumer.Release(delivery);
            } catch (error) {
                this.log.Warn('Release of an unstarted delivery failed; its lease will expire', {
                    Subscription: this.policy.SubscriptionName,
                    DeliveryID: delivery.DeliveryID,
                    Error: ErrorMessageOf(error),
                });
            }
        }
    }

    private startExecution(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        const execution = new DeliveryExecution<TPayload>({
            Delivery: delivery,
            Consumer: this.consumer,
            HandlerFactory: this.handlerFactory,
            Policy: this.policy,
            Log: this.log,
            Now: this.now,
        });
        const done = execution
            .Run()
            .catch((error: unknown): SettleResult => ({ Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorMessageOf(error) }))
            .then((result) => {
                this.executions.delete(delivery.DeliveryID);
                this.reportSettle(result);
                this.wake();
                return result;
            });
        this.executions.set(delivery.DeliveryID, { Execution: execution, Done: done });
        return done;
    }

    private reportSettle(result: SettleResult): void {
        if (result.Kind === 'Failed') {
            this.log.Error('Delivery settle failed', undefined, {
                Subscription: this.policy.SubscriptionName,
                DeliveryID: result.DeliveryID,
                Error: result.Error,
            });
        }
    }

    private async waitForExecutions(timeoutMs: number): Promise<boolean> {
        if (this.executions.size === 0) {
            return true;
        }
        const allDone = Promise.all([...this.executions.values()].map((running) => running.Done)).then(() => true);
        const deadline: { Timer: ReturnType<typeof setTimeout> | null } = { Timer: null };
        const timedOut = new Promise<boolean>((resolve) => {
            deadline.Timer = setTimeout(() => resolve(false), timeoutMs);
        });
        try {
            return await Promise.race([allDone, timedOut]);
        } finally {
            if (deadline.Timer !== null) {
                clearTimeout(deadline.Timer);
            }
        }
    }

    private groupIntoLanes(deliveries: ReceivedDelivery<TPayload>[]): Map<string, number[]> {
        const lanes = new Map<string, number[]>();
        const partitioned = this.policy.PartitionMode !== 'None';
        deliveries.forEach((delivery, index) => {
            const key = delivery.Message.PartitionKey;
            const laneKey = partitioned && key !== undefined ? `key:${key}` : `item:${index}`;
            lanes.set(laneKey, [...(lanes.get(laneKey) ?? []), index]);
        });
        return lanes;
    }

    private async runLane(indices: number[], deliveries: ReceivedDelivery<TPayload>[], results: SettleResult[]): Promise<void> {
        let blocked = false;
        for (const index of indices) {
            const delivery = deliveries[index];
            if (blocked) {
                results[index] = { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: SKIPPED_AFTER_PARTITION_FAILURE };
                continue;
            }
            const result = await this.startExecution(delivery);
            results[index] = result;
            blocked = !(result.Kind === 'Settled' && result.Status === 'Completed');
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            this.wakeResolver = resolve;
            this.wakeTimer = setTimeout(() => this.wake(), ms);
        });
    }

    private wake(): void {
        if (this.wakeTimer !== null) {
            clearTimeout(this.wakeTimer);
            this.wakeTimer = null;
        }
        const resolve = this.wakeResolver;
        this.wakeResolver = null;
        if (resolve !== null) {
            resolve();
        }
    }
}
```

- [ ] **Step 4: Export the module**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export * from './runtime/ConsumerRuntime';
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 107 plus ConsumerRuntime (14): **121 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): consumer runtime loop, graceful stop and batch processing"
```

---

### Task 7: `InMemoryTransport`

**Files:**
- Create: `packages/WorkQueue/core/src/memory/InMemoryStore.ts`, `src/memory/InMemoryConsumer.ts`, `src/memory/InMemoryOperator.ts`, `src/memory/InMemoryTransport.ts`
- Create: `packages/WorkQueue/core/src/testing/fixtures.ts` (exported through `./testing` in Task 8)
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/InMemoryTransport.test.ts`

**Interfaces:**
- Consumes: every contract type (Task 1); `BuildWorkMessage`, `MAX_ENVELOPE_BYTES` (Task 2); `MatchesFilter` (Task 3); `SUBSCRIPTION_POLICY_DEFAULTS`, `PublishErrorCodes`, `RejectedPublishResult` (Task 1).
- Produces:
  - `memory/InMemoryStore.ts`: `LEASE_EXPIRED_REASON = 'LeaseExpired'`, `SEQUENCE_ALREADY_RESOLVED_NOTE = 'SequenceAlreadyResolved'`, `interface DeliveryHandle { DeliveryID: string; LeaseToken: string }`, `interface DiscardResult { Changed: boolean; CancelRequested: boolean }`, `interface InMemoryDeliverySnapshot { DeliveryID; MessageID; Status: DeliveryStatus; PartitionKey: string | null; OrderKey: number; AttemptCount: number; IsReplay: boolean; ResolutionNote: string | null }`, `class InMemoryStore` (internal to the memory folder)
  - `memory/InMemoryTransport.ts`: `IN_MEMORY_TRANSPORT_CAPABILITIES: TransportCapabilities` (identical to the Database transport's), `interface InMemoryTransportOptions { Now?: () => number; NewId?: () => string }`, `class InMemoryTransport implements ITransportDriver` with `Name = 'InMemory'`, `RunSweep(): { ExpiredLeases: number; GapStalls: number }`, `Snapshot(subscriptionName: string): InMemoryDeliverySnapshot[]`
  - `memory/InMemoryConsumer.ts`: `class InMemoryConsumer<TPayload> implements ITransportConsumer<TPayload>`
  - `memory/InMemoryOperator.ts`: `class InMemoryOperator implements ITransportOperator`
  - `testing/fixtures.ts`: `type SubscriptionBindingOverrides`, `BuildTopicBinding(name: string, overrides?: Partial<TopicBinding>): TopicBinding`, `BuildSubscriptionBinding(topic: TopicBinding, name: string, overrides?: SubscriptionBindingOverrides): SubscriptionBinding`, `BuildMessages(topic: TopicBinding, requests: PublishRequest[], publishedAt?: Date): WorkMessage[]`, `class ManualClock { Now: () => number; Advance(ms: number): void }`

The in-memory transport implements spec 03 §7 exactly, so it can stand in for the Database transport in unit tests and prove the conformance kit:

| Concern | Rule |
| --- | --- |
| Publish | Same `MessageID` + same envelope (ignoring `PublishedAt`) → `Duplicate`; different envelope → `Rejected MessageIDConflict`; same `(topic, PartitionKey, Sequence)` → `Rejected DuplicateSequence`. One delivery per subscription whose filter matches. |
| Delivery `PartitionKey` | Stored only for `Exclusive`/`Ordered` subscriptions; a message without a key is its own lane. |
| `OrderKey` | `Sequence` on `ExplicitSequence` topics, else the publish ordinal. |
| Already-resolved sequence | An `Ordered` + `ExplicitSequence` delivery whose `Sequence ≤ LastCompletedSequence` is created `Discarded` with note `SequenceAlreadyResolved` (otherwise it would wedge its key). |
| Claim | `ExpireLeases` first; `Pending` + visible, ordered by `OrderKey`; `Exclusive`: no in-flight delivery for the key; `Ordered`: must be the head (lowest unfinished `OrderKey`), no in-flight delivery, and for `ExplicitSequence` `OrderKey = LastCompletedSequence + 1` (else `AwaitingSequenceSince` is set). |
| Holder writes | Guarded on `ID`, `InFlight` and `LeaseToken`; otherwise `LeaseLost` / `Lost`. |
| Sequence mark | Advances when the next sequence completes, is discarded or is skipped, then keeps advancing through consecutive already-discarded sequences. |
| Operator | Replay (`DeadLettered` → `Pending`, attempts reset, `IsReplay`); Discard (`Pending` or `DeadLettered`); SkipSequence (only when mark = sequence − 1 and no non-discarded delivery has that sequence). |
| Cancel in flight | Discard of an `InFlight` delivery leaves `Status` alone: it records `CancelRequestedAt`, rotates `LeaseToken` (so the holder's next heartbeat reports `Lost`) and returns `CancelRequested: true`. The row stays `InFlight` — and an `Exclusive`/`Ordered` key stays busy — until its lease expires, when `ExpireLeases` makes it `Discarded` instead of retrying it (spec 03 §7). |

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/core/src/__tests__/InMemoryTransport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from '../memory/InMemoryTransport';
import { BuildMessages, BuildSubscriptionBinding, BuildTopicBinding, ManualClock } from '../testing/fixtures';
import { BuildWorkMessage } from '../validation';

const signal = new AbortController().signal;

describe('InMemoryTransport publish', () => {
    it('creates one delivery per matching subscription', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('email.events');
        const archive = BuildSubscriptionBinding(topic, 'email.archive');
        const clicks = BuildSubscriptionBinding(topic, 'email.clicks', { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] } });
        const results = await transport.Publish(
            topic,
            BuildMessages(topic, [{ Attributes: { eventType: 'open' } }, { Attributes: { eventType: 'click' } }]),
            [archive, clicks],
        );
        expect(results.map((result) => result.Status)).toEqual(['Accepted', 'Accepted']);
        expect(transport.Snapshot('email.archive')).toHaveLength(2);
        expect(transport.Snapshot('email.clicks')).toHaveLength(1);
    });

    it('reports a republished identical envelope as Duplicate', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const id = crypto.randomUUID();
        const first = BuildWorkMessage('t', { MessageID: id, Attributes: { a: '1' } }, new Date('2026-01-01T00:00:00Z'), () => id);
        const retry = BuildWorkMessage('t', { MessageID: id, Attributes: { a: '1' } }, new Date('2026-01-01T00:05:00Z'), () => id);
        await transport.Publish(topic, [first], [subscription]);
        expect((await transport.Publish(topic, [retry], [subscription]))[0]).toEqual({ MessageID: id, Status: 'Duplicate' });
        expect(transport.Snapshot('s')).toHaveLength(1);
    });

    it('rejects a reused MessageID with a different envelope', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const id = crypto.randomUUID();
        await transport.Publish(topic, BuildMessages(topic, [{ MessageID: id, Attributes: { a: '1' } }]), [subscription]);
        const [result] = await transport.Publish(topic, BuildMessages(topic, [{ MessageID: id, Attributes: { a: '2' } }]), [subscription]);
        expect(result.Status).toBe('Rejected');
        expect(result.Error?.Code).toBe('MessageIDConflict');
    });

    it('rejects a second message with the same partition key and sequence', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t', { OrderingMode: 'ExplicitSequence' });
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Ordered' });
        const results = await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k', Sequence: 1 }, { PartitionKey: 'k', Sequence: 1 }]), [subscription]);
        expect(results[1].Error?.Code).toBe('DuplicateSequence');
    });
});

describe('InMemoryTransport partition rules', () => {
    it('ignores partition keys for None subscriptions', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k' }, { PartitionKey: 'k' }]), [subscription]);
        expect(await transport.OpenConsumer(subscription).Receive(10, 0, signal)).toHaveLength(2);
    });

    it('treats messages without a partition key as independent on an Exclusive subscription', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Exclusive' });
        await transport.Publish(topic, BuildMessages(topic, [{}, {}]), [subscription]);
        expect(await transport.OpenConsumer(subscription).Receive(10, 0, signal)).toHaveLength(2);
    });

    it('creates an already-resolved sequence as Discarded', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t', { OrderingMode: 'ExplicitSequence' });
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Ordered' });
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k', Sequence: 2 }]), [subscription]);
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(await transport.Operator().SkipSequence(subscription, 'k', 1, 'lost upstream', null)).toEqual({ Supported: true, Changed: true });
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k', Sequence: 1 }]), [subscription]);
        const late = transport.Snapshot('s').find((delivery) => delivery.OrderKey === 1);
        expect(late).toMatchObject({ Status: 'Discarded', ResolutionNote: 'SequenceAlreadyResolved' });
        expect((await consumer.Receive(10, 0, signal)).map((delivery) => delivery.Message.Sequence)).toEqual([2]);
    });

    it('advances the sequence mark through a discarded later sequence', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t', { OrderingMode: 'ExplicitSequence' });
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Ordered' });
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [1, 2, 3].map((sequence) => ({ PartitionKey: 'k', Sequence: sequence }))), [subscription]);
        const [first] = await consumer.Receive(10, 0, signal);
        const second = transport.Snapshot('s').find((delivery) => delivery.OrderKey === 2);
        expect(second).toBeDefined();
        expect(await transport.Operator().Discard(subscription, second?.DeliveryID ?? '', 'bad batch', null)).toEqual({ Supported: true, Changed: true });
        await consumer.Complete(first);
        expect((await consumer.Receive(10, 0, signal)).map((delivery) => delivery.Message.Sequence)).toEqual([3]);
    });
});

describe('InMemoryTransport operator and sweep', () => {
    it('flags a sequence gap as stalled after SequenceGapAlertSeconds', async () => {
        const clock = new ManualClock();
        const transport = new InMemoryTransport({ Now: clock.Now });
        const topic = BuildTopicBinding('t', { OrderingMode: 'ExplicitSequence' });
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Ordered', SequenceGapAlertSeconds: 60 });
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k', Sequence: 2 }]), [subscription]);
        expect(await transport.OpenConsumer(subscription).Receive(10, 0, signal)).toEqual([]);
        clock.Advance(61_000);
        expect(transport.RunSweep()).toEqual({ ExpiredLeases: 0, GapStalls: 1 });
        const page = await transport.Operator().ListPartitions(subscription, 'GapStalled', null, 10);
        expect(page?.Items).toEqual([
            expect.objectContaining({ PartitionKey: 'k', Condition: 'GapStalled', LastCompletedSequence: 0, WaitingItems: 1 }),
        ]);
    });

    it('pages dead letters with a cursor', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{}, {}, {}]), [subscription]);
        for (const delivery of await consumer.Receive(10, 0, signal)) {
            await consumer.DeadLetter(delivery, 'Poison', null);
        }
        const firstPage = await transport.Operator().ListDeadLetters(subscription, null, 2);
        expect(firstPage?.Items).toHaveLength(2);
        expect(firstPage?.NextCursor).toBe('2');
        const secondPage = await transport.Operator().ListDeadLetters(subscription, firstPage?.NextCursor ?? null, 2);
        expect(secondPage?.Items).toHaveLength(1);
        expect(secondPage?.NextCursor).toBeNull();
    });

    it('reports stats from the injected clock', async () => {
        const clock = new ManualClock();
        const transport = new InMemoryTransport({ Now: clock.Now });
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{}, {}]), [subscription]);
        clock.Advance(5_000);
        const [delivery] = await consumer.Receive(1, 0, signal);
        await consumer.Complete(delivery);
        expect(await transport.Operator().GetStats(subscription)).toEqual({
            SubscriptionName: 's',
            Pending: 1,
            InFlight: 0,
            DeadLettered: 0,
            BlockedKeys: null,
            OldestPendingAgeSeconds: 5,
            CompletedLastHour: 1,
            AsOf: new Date(clock.Now()).toISOString(),
        });
    });

    it('hands out copies, so a handler cannot mutate the stored message', async () => {
        const transport = new InMemoryTransport();
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's');
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ Attributes: { eventType: 'open' } }]), [subscription]);
        const [delivery] = await consumer.Receive(10, 0, signal);
        delivery.Message.Attributes.eventType = 'mutated';
        await consumer.Release(delivery);
        const [again] = await consumer.Receive(10, 0, signal);
        expect(again.Message.Attributes.eventType).toBe('open');
        expect(again.Attempt).toBe(1);
    });

    it('cancels an in-flight delivery by revoking its lease', async () => {
        const clock = new ManualClock();
        const transport = new InMemoryTransport({ Now: clock.Now });
        const topic = BuildTopicBinding('t');
        const subscription = BuildSubscriptionBinding(topic, 's', { PartitionMode: 'Exclusive', LeaseSeconds: 30 });
        const consumer = transport.OpenConsumer(subscription);
        await transport.Publish(topic, BuildMessages(topic, [{ PartitionKey: 'k' }, { PartitionKey: 'k' }]), [subscription]);
        const [delivery] = await consumer.Receive(10, 0, signal);

        expect(await transport.Operator().Discard(subscription, delivery.DeliveryID, 'operator cancelled', null)).toEqual({
            Supported: true,
            Changed: true,
            CancelRequested: true,
        });
        // The holder is fenced out immediately, but the key stays busy until the lease runs out.
        expect(await consumer.ExtendLease(delivery, 30)).toBe('Lost');
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
        expect(transport.Snapshot('s').find((row) => row.DeliveryID === delivery.DeliveryID)?.Status).toBe('InFlight');
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);

        clock.Advance(31_000);
        expect(transport.RunSweep()).toEqual({ ExpiredLeases: 1, GapStalls: 0 });
        expect(transport.Snapshot('s').find((row) => row.DeliveryID === delivery.DeliveryID)?.Status).toBe('Discarded');
        expect((await consumer.Receive(10, 0, signal)).length).toBe(1);
    });

    it('declares Database-transport capabilities', () => {
        expect(new InMemoryTransport().Capabilities).toBe(IN_MEMORY_TRANSPORT_CAPABILITIES);
        expect(IN_MEMORY_TRANSPORT_CAPABILITIES).toMatchObject({ SupportsOrdered: true, SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, PeekDeadLetters: 'Full' });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/core && pnpm test InMemoryTransport`
Expected: FAIL — unresolved imports `../memory/InMemoryTransport`, `../testing/fixtures`.

- [ ] **Step 3: Write `src/testing/fixtures.ts`**

```typescript
import type { WorkJson, WorkMessage } from '../envelope';
import type { SubscriptionFilter } from '../filterTypes';
import { SUBSCRIPTION_POLICY_DEFAULTS } from '../policy';
import type { HostType, SubscriptionPolicy } from '../policy';
import type { PublishRequest } from '../publishing';
import type { SubscriptionBinding, TopicBinding } from '../transport';
import { BuildWorkMessage, MAX_ENVELOPE_BYTES } from '../validation';

export type SubscriptionBindingOverrides = Partial<Omit<SubscriptionPolicy, 'SubscriptionName' | 'TopicName' | 'OrderingMode'>> & {
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
};

export function BuildTopicBinding(name: string, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: name,
        OrderingMode: 'PublishOrder',
        IsFifo: false,
        MaxPayloadBytes: MAX_ENVELOPE_BYTES,
        Config: {},
        ...overrides,
    };
}

export function BuildSubscriptionBinding(topic: TopicBinding, name: string, overrides: SubscriptionBindingOverrides = {}): SubscriptionBinding {
    const { Filter: filter, HostType: hostType, Config: config, ...policy } = overrides;
    return {
        Policy: {
            SubscriptionName: name,
            TopicName: topic.TopicName,
            OrderingMode: topic.OrderingMode,
            ...SUBSCRIPTION_POLICY_DEFAULTS,
            ...policy,
        },
        Filter: filter ?? null,
        HostType: hostType ?? 'MJWorker',
        Config: config ?? {},
    };
}

export function BuildMessages(topic: TopicBinding, requests: PublishRequest[], publishedAt: Date = new Date()): WorkMessage[] {
    return requests.map((request) => BuildWorkMessage(topic.TopicName, request, publishedAt, () => crypto.randomUUID()));
}

/** A clock tests advance explicitly. Pass `clock.Now` as a transport's `Now` option. */
export class ManualClock {
    private current: number;

    public readonly Now = (): number => this.current;

    constructor(startMs: number = Date.UTC(2026, 0, 1)) {
        this.current = startMs;
    }

    public Advance(ms: number): void {
        this.current += ms;
    }
}
```

- [ ] **Step 4: Write `src/memory/InMemoryStore.ts`**

```typescript
import type { WorkMessage } from '../envelope';
import { MatchesFilter } from '../filter';
import type { WorkProgress } from '../handler';
import type { DeadLetterRecord, Page, PartitionCondition, PartitionStateRecord, SubscriptionStats } from '../operator';
import type { DeliveryStatus, SubscriptionPolicy } from '../policy';
import { PublishErrorCodes, RejectedPublishResult } from '../publishing';
import type { PublishResult } from '../publishing';
import type { ReceivedDelivery, SettleResult, SubscriptionBinding, TopicBinding } from '../transport';

export const LEASE_EXPIRED_REASON = 'LeaseExpired';
export const SEQUENCE_ALREADY_RESOLVED_NOTE = 'SequenceAlreadyResolved';

export interface DeliveryHandle {
    DeliveryID: string;
    LeaseToken: string;
}

/** Discard of an InFlight delivery revokes its lease instead of settling it (spec 03 §7). */
export interface DiscardResult {
    Changed: boolean;
    CancelRequested: boolean;
}

export interface InMemoryDeliverySnapshot {
    DeliveryID: string;
    MessageID: string;
    Status: DeliveryStatus;
    PartitionKey: string | null;
    OrderKey: number;
    AttemptCount: number;
    IsReplay: boolean;
    ResolutionNote: string | null;
}

interface StoredMessage {
    Message: WorkMessage;
    Ordinal: number;
}

interface StoredDelivery {
    ID: string;
    MessageKey: string;
    SubscriptionName: string;
    Status: DeliveryStatus;
    PartitionKey: string | null;
    OrderKey: number;
    Ordinal: number;
    AttemptCount: number;
    IsReplay: boolean;
    CreatedAtMs: number;
    VisibleAtMs: number;
    LeaseToken: string | null;
    LeaseExpiresAtMs: number | null;
    LastHeartbeatAtMs: number | null;
    Progress: WorkProgress | null;
    LastError: string | null;
    DeadLetterReason: string | null;
    DeadLetteredAtMs: number | null;
    CompletedAtMs: number | null;
    CancelRequestedAtMs: number | null;
    ResolvedByUserID: string | null;
    ResolutionNote: string | null;
}

interface SequenceState {
    SubscriptionName: string;
    PartitionKey: string;
    LastCompletedSequence: number;
    AwaitingSequenceSinceMs: number | null;
    GapStalled: boolean;
}

const UNFINISHED: ReadonlySet<DeliveryStatus> = new Set<DeliveryStatus>(['Pending', 'InFlight', 'DeadLettered']);
const ONE_HOUR_MS = 3_600_000;

/** State and rules of the in-memory transport (spec 03 §7). Not thread-safe; single process only. */
export class InMemoryStore {
    private readonly messages = new Map<string, StoredMessage>();
    private readonly sequenceIndex = new Set<string>();
    private readonly deliveries = new Map<string, StoredDelivery>();
    private readonly sequences = new Map<string, SequenceState>();
    private readonly bindings = new Map<string, SubscriptionBinding>();
    private ordinal = 0;

    constructor(
        private readonly now: () => number,
        private readonly newId: () => string,
    ) {}

    public RegisterBinding(binding: SubscriptionBinding): void {
        this.bindings.set(binding.Policy.SubscriptionName, binding);
    }

    public Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[]): PublishResult[] {
        subscriptions.forEach((subscription) => this.RegisterBinding(subscription));
        return messages.map((message) => this.publishOne(topic, message, subscriptions));
    }

    public Claim(binding: SubscriptionBinding, max: number): ReceivedDelivery[] {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        this.ExpireLeases(policy.SubscriptionName);
        const now = this.now();
        const claimed: ReceivedDelivery[] = [];
        for (const delivery of this.visiblePending(policy.SubscriptionName, now)) {
            if (claimed.length >= max) {
                break;
            }
            if (this.isClaimable(policy, delivery, now)) {
                claimed.push(this.lease(policy, delivery, now));
            }
        }
        return claimed;
    }

    public ExpireLeases(subscriptionName?: string): number {
        const now = this.now();
        let expired = 0;
        for (const delivery of this.deliveries.values()) {
            const due = delivery.Status === 'InFlight' && delivery.LeaseExpiresAtMs !== null && delivery.LeaseExpiresAtMs < now;
            if (!due || (subscriptionName !== undefined && delivery.SubscriptionName !== subscriptionName)) {
                continue;
            }
            clearLease(delivery);
            if (delivery.CancelRequestedAtMs !== null) {
                // A cancelled delivery is never retried: it settles as Discarded once its lease has run out,
                // which is also when its partition key is released (spec 03 §7).
                delivery.Status = 'Discarded';
                delivery.CompletedAtMs = now;
                this.onResolved(delivery);
                expired += 1;
                continue;
            }
            delivery.LastError = LEASE_EXPIRED_REASON;
            if (delivery.AttemptCount < this.policyOf(delivery.SubscriptionName).MaxAttempts) {
                delivery.Status = 'Pending';
                delivery.VisibleAtMs = now;
            } else {
                delivery.Status = 'DeadLettered';
                delivery.DeadLetterReason = LEASE_EXPIRED_REASON;
                delivery.DeadLetteredAtMs = now;
            }
            expired += 1;
        }
        return expired;
    }

    public ExtendLease(handle: DeliveryHandle, leaseSeconds: number, progress?: WorkProgress): 'Held' | 'Lost' {
        const delivery = this.held(handle);
        if (delivery === null) {
            return 'Lost';
        }
        const now = this.now();
        delivery.LeaseExpiresAtMs = now + leaseSeconds * 1000;
        delivery.LastHeartbeatAtMs = now;
        if (progress !== undefined) {
            delivery.Progress = structuredClone(progress);
        }
        return 'Held';
    }

    public Complete(handle: DeliveryHandle): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Completed';
        delivery.CompletedAtMs = this.now();
        this.onResolved(delivery);
        return settled(delivery);
    }

    public Retry(handle: DeliveryHandle, delaySeconds: number, error: string): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Pending';
        delivery.VisibleAtMs = this.now() + Math.max(0, delaySeconds) * 1000;
        delivery.LastError = error;
        return settled(delivery);
    }

    public DeadLetter(handle: DeliveryHandle, reason: string, error: string | null): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'DeadLettered';
        delivery.DeadLetterReason = reason;
        delivery.DeadLetteredAtMs = this.now();
        delivery.LastError = error;
        return settled(delivery);
    }

    public Release(handle: DeliveryHandle): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Pending';
        delivery.AttemptCount = Math.max(0, delivery.AttemptCount - 1);
        delivery.VisibleAtMs = this.now();
        return settled(delivery);
    }

    public Stats(binding: SubscriptionBinding): SubscriptionStats {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        const now = this.now();
        const own = this.deliveriesOf(policy.SubscriptionName);
        const pending = own.filter((delivery) => delivery.Status === 'Pending');
        const oldest = pending.reduce<number | null>((min, delivery) => (min === null || delivery.CreatedAtMs < min ? delivery.CreatedAtMs : min), null);
        return {
            SubscriptionName: policy.SubscriptionName,
            Pending: pending.length,
            InFlight: own.filter((delivery) => delivery.Status === 'InFlight').length,
            DeadLettered: own.filter((delivery) => delivery.Status === 'DeadLettered').length,
            BlockedKeys: policy.PartitionMode === 'Ordered' ? this.blockedKeyCount(policy.SubscriptionName) : null,
            OldestPendingAgeSeconds: oldest === null ? null : Math.floor((now - oldest) / 1000),
            CompletedLastHour: own.filter((delivery) => delivery.Status === 'Completed' && (delivery.CompletedAtMs ?? 0) >= now - ONE_HOUR_MS).length,
            AsOf: new Date(now).toISOString(),
        };
    }

    public DeadLetters(binding: SubscriptionBinding, cursor: string | null, pageSize: number): Page<DeadLetterRecord> {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        const records = this.deliveriesOf(policy.SubscriptionName)
            .filter((delivery) => delivery.Status === 'DeadLettered')
            .sort((a, b) => (a.DeadLetteredAtMs ?? 0) - (b.DeadLetteredAtMs ?? 0) || a.Ordinal - b.Ordinal)
            .map((delivery) => this.deadLetterRecord(policy, delivery));
        return paginate(records, cursor, pageSize);
    }

    public Partitions(binding: SubscriptionBinding, condition: PartitionCondition | null, cursor: string | null, pageSize: number): Page<PartitionStateRecord> {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        const records = this.partitionKeys(policy.SubscriptionName)
            .map((key) => this.partitionRecord(policy, key))
            .filter((record) => (condition === null ? record.Condition !== 'Idle' : record.Condition === condition));
        return paginate(records, cursor, pageSize);
    }

    public Replay(binding: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): boolean {
        const delivery = this.ownDelivery(binding, deliveryID);
        if (delivery === null || delivery.Status !== 'DeadLettered') {
            return false;
        }
        delivery.Status = 'Pending';
        delivery.AttemptCount = 0;
        delivery.IsReplay = true;
        delivery.VisibleAtMs = this.now();
        delivery.DeadLetterReason = null;
        delivery.DeadLetteredAtMs = null;
        delivery.ResolvedByUserID = actorUserID;
        delivery.ResolutionNote = note;
        return true;
    }

    public Discard(binding: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): DiscardResult {
        const delivery = this.ownDelivery(binding, deliveryID);
        if (delivery === null) {
            return { Changed: false, CancelRequested: false };
        }
        if (delivery.Status === 'InFlight') {
            if (delivery.CancelRequestedAtMs !== null) {
                return { Changed: false, CancelRequested: true };
            }
            // Revoke the lease rather than settling now: rotating the token fences the holder out on its next
            // heartbeat, and the key stays busy until the lease expires (spec 03 §7).
            delivery.CancelRequestedAtMs = this.now();
            delivery.LeaseToken = this.newId();
            delivery.ResolvedByUserID = actorUserID;
            delivery.ResolutionNote = reason;
            return { Changed: true, CancelRequested: true };
        }
        if (delivery.Status !== 'Pending' && delivery.Status !== 'DeadLettered') {
            return { Changed: false, CancelRequested: false };
        }
        delivery.Status = 'Discarded';
        delivery.CompletedAtMs = this.now();
        delivery.ResolvedByUserID = actorUserID;
        delivery.ResolutionNote = reason;
        this.onResolved(delivery);
        return { Changed: true, CancelRequested: false };
    }

    public SkipSequence(binding: SubscriptionBinding, partitionKey: string, sequence: number): boolean {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        if (!tracksSequence(policy)) {
            return false;
        }
        const state = this.sequenceState(policy.SubscriptionName, partitionKey);
        const published = this.deliveriesOf(policy.SubscriptionName).some(
            (delivery) => delivery.PartitionKey === partitionKey && delivery.OrderKey === sequence && delivery.Status !== 'Discarded',
        );
        if (state.LastCompletedSequence !== sequence - 1 || published) {
            return false;
        }
        state.LastCompletedSequence = sequence;
        this.advanceThroughDiscarded(state);
        return true;
    }

    public RunSweep(): { ExpiredLeases: number; GapStalls: number } {
        const expiredLeases = this.ExpireLeases();
        const now = this.now();
        let gapStalls = 0;
        for (const state of this.sequences.values()) {
            const alertSeconds = this.bindings.get(state.SubscriptionName)?.Policy.SequenceGapAlertSeconds;
            if (alertSeconds === undefined || state.AwaitingSequenceSinceMs === null || state.GapStalled) {
                continue;
            }
            if (now - state.AwaitingSequenceSinceMs >= alertSeconds * 1000) {
                state.GapStalled = true;
                gapStalls += 1;
            }
        }
        return { ExpiredLeases: expiredLeases, GapStalls: gapStalls };
    }

    public Snapshot(subscriptionName: string): InMemoryDeliverySnapshot[] {
        return this.deliveriesOf(subscriptionName)
            .sort(byOrder)
            .map((delivery) => ({
                DeliveryID: delivery.ID,
                MessageID: this.messageOf(delivery).MessageID,
                Status: delivery.Status,
                PartitionKey: delivery.PartitionKey,
                OrderKey: delivery.OrderKey,
                AttemptCount: delivery.AttemptCount,
                IsReplay: delivery.IsReplay,
                ResolutionNote: delivery.ResolutionNote,
            }));
    }

    private publishOne(topic: TopicBinding, message: WorkMessage, subscriptions: SubscriptionBinding[]): PublishResult {
        const messageKey = JSON.stringify([topic.TopicName, message.MessageID.toLowerCase()]);
        const existing = this.messages.get(messageKey);
        if (existing !== undefined) {
            return sameEnvelope(existing.Message, message)
                ? { MessageID: message.MessageID, Status: 'Duplicate' }
                : RejectedPublishResult(message.MessageID, PublishErrorCodes.MessageIDConflict, `MessageID ${message.MessageID} was already published with a different envelope`);
        }
        if (message.PartitionKey !== undefined && message.Sequence !== undefined) {
            const sequenceKey = JSON.stringify([topic.TopicName, message.PartitionKey, message.Sequence]);
            if (this.sequenceIndex.has(sequenceKey)) {
                return RejectedPublishResult(message.MessageID, PublishErrorCodes.DuplicateSequence, `Sequence ${message.Sequence} for '${message.PartitionKey}' was already published`);
            }
            this.sequenceIndex.add(sequenceKey);
        }
        this.ordinal += 1;
        const stored: StoredMessage = { Message: structuredClone(message), Ordinal: this.ordinal };
        this.messages.set(messageKey, stored);
        for (const subscription of subscriptions) {
            if (MatchesFilter(subscription.Filter, message.Attributes)) {
                this.createDelivery(topic, subscription.Policy, messageKey, stored);
            }
        }
        return { MessageID: message.MessageID, Status: 'Accepted' };
    }

    private createDelivery(topic: TopicBinding, policy: SubscriptionPolicy, messageKey: string, stored: StoredMessage): void {
        const now = this.now();
        const message = stored.Message;
        const partitionKey = policy.PartitionMode !== 'None' ? message.PartitionKey ?? null : null;
        const explicit = topic.OrderingMode === 'ExplicitSequence' && message.Sequence !== undefined;
        const delivery: StoredDelivery = {
            ID: this.newId(),
            MessageKey: messageKey,
            SubscriptionName: policy.SubscriptionName,
            Status: 'Pending',
            PartitionKey: partitionKey,
            OrderKey: explicit && message.Sequence !== undefined ? message.Sequence : stored.Ordinal,
            Ordinal: stored.Ordinal,
            AttemptCount: 0,
            IsReplay: false,
            CreatedAtMs: now,
            VisibleAtMs: now,
            LeaseToken: null,
            LeaseExpiresAtMs: null,
            LastHeartbeatAtMs: null,
            Progress: null,
            LastError: null,
            DeadLetterReason: null,
            DeadLetteredAtMs: null,
            CompletedAtMs: null,
            CancelRequestedAtMs: null,
            ResolvedByUserID: null,
            ResolutionNote: null,
        };
        if (partitionKey !== null && tracksSequence(policy) && delivery.OrderKey <= this.sequenceState(policy.SubscriptionName, partitionKey).LastCompletedSequence) {
            delivery.Status = 'Discarded';
            delivery.CompletedAtMs = now;
            delivery.ResolutionNote = SEQUENCE_ALREADY_RESOLVED_NOTE;
        }
        this.deliveries.set(delivery.ID, delivery);
    }

    private visiblePending(subscriptionName: string, now: number): StoredDelivery[] {
        return this.deliveriesOf(subscriptionName)
            .filter((delivery) => delivery.Status === 'Pending' && delivery.VisibleAtMs <= now)
            .sort(byOrder);
    }

    private isClaimable(policy: SubscriptionPolicy, delivery: StoredDelivery, now: number): boolean {
        const key = delivery.PartitionKey;
        if (policy.PartitionMode === 'None' || key === null) {
            return true;
        }
        if (this.hasInFlight(policy.SubscriptionName, key)) {
            return false;
        }
        if (policy.PartitionMode === 'Exclusive') {
            return true;
        }
        if (this.headOf(policy.SubscriptionName, key)?.ID !== delivery.ID) {
            return false;
        }
        if (!tracksSequence(policy)) {
            return true;
        }
        const state = this.sequenceState(policy.SubscriptionName, key);
        if (delivery.OrderKey === state.LastCompletedSequence + 1) {
            state.AwaitingSequenceSinceMs = null;
            state.GapStalled = false;
            return true;
        }
        state.AwaitingSequenceSinceMs = state.AwaitingSequenceSinceMs ?? now;
        return false;
    }

    private lease(policy: SubscriptionPolicy, delivery: StoredDelivery, now: number): ReceivedDelivery {
        const leaseExpiresAtMs = now + policy.LeaseSeconds * 1000;
        const leaseToken = this.newId();
        delivery.Status = 'InFlight';
        delivery.AttemptCount += 1;
        delivery.LeaseToken = leaseToken;
        delivery.LeaseExpiresAtMs = leaseExpiresAtMs;
        delivery.LastHeartbeatAtMs = null;
        return {
            Message: structuredClone(this.messageOf(delivery)),
            DeliveryID: delivery.ID,
            LeaseToken: leaseToken,
            Attempt: delivery.AttemptCount,
            IsReplay: delivery.IsReplay,
            LeaseExpiresAt: new Date(leaseExpiresAtMs),
        };
    }

    private onResolved(delivery: StoredDelivery): void {
        const policy = this.policyOf(delivery.SubscriptionName);
        if (delivery.PartitionKey === null || !tracksSequence(policy)) {
            return;
        }
        const state = this.sequenceState(delivery.SubscriptionName, delivery.PartitionKey);
        if (delivery.OrderKey !== state.LastCompletedSequence + 1) {
            return;
        }
        state.LastCompletedSequence = delivery.OrderKey;
        this.advanceThroughDiscarded(state);
    }

    private advanceThroughDiscarded(state: SequenceState): void {
        const own = this.deliveriesOf(state.SubscriptionName).filter((delivery) => delivery.PartitionKey === state.PartitionKey);
        while (own.some((delivery) => delivery.OrderKey === state.LastCompletedSequence + 1 && delivery.Status === 'Discarded')) {
            state.LastCompletedSequence += 1;
        }
        state.AwaitingSequenceSinceMs = null;
        state.GapStalled = false;
    }

    private partitionRecord(policy: SubscriptionPolicy, key: string): PartitionStateRecord {
        const name = policy.SubscriptionName;
        const head = this.headOf(name, key);
        const state = tracksSequence(policy) ? this.sequenceState(name, key) : null;
        return {
            PartitionKey: key,
            Condition: this.conditionOf(policy, key, head, state),
            HeadDeliveryID: head?.ID ?? null,
            LastCompletedSequence: state === null ? null : state.LastCompletedSequence,
            AwaitingSequenceSince: state === null || state.AwaitingSequenceSinceMs === null ? null : new Date(state.AwaitingSequenceSinceMs).toISOString(),
            WaitingItems: this.deliveriesOf(name).filter((delivery) => delivery.PartitionKey === key && delivery.Status === 'Pending').length,
        };
    }

    private conditionOf(policy: SubscriptionPolicy, key: string, head: StoredDelivery | null, state: SequenceState | null): PartitionCondition {
        if (this.hasInFlight(policy.SubscriptionName, key)) {
            return 'InFlight';
        }
        if (policy.PartitionMode === 'Ordered' && head?.Status === 'DeadLettered') {
            return 'Blocked';
        }
        if (state?.GapStalled === true) {
            return 'GapStalled';
        }
        if (state !== null && state.AwaitingSequenceSinceMs !== null) {
            return 'AwaitingSequence';
        }
        return 'Idle';
    }

    private deadLetterRecord(policy: SubscriptionPolicy, delivery: StoredDelivery): DeadLetterRecord {
        const message = this.messageOf(delivery);
        const blocksKey = policy.PartitionMode === 'Ordered' && delivery.PartitionKey !== null && this.headOf(policy.SubscriptionName, delivery.PartitionKey)?.ID === delivery.ID;
        return {
            DeliveryID: delivery.ID,
            Message: structuredClone(message),
            PartitionKey: message.PartitionKey ?? null,
            Attempts: delivery.AttemptCount,
            Reason: delivery.DeadLetterReason ?? 'Unknown',
            LastError: delivery.LastError,
            DeadLetteredAt: delivery.DeadLetteredAtMs === null ? null : new Date(delivery.DeadLetteredAtMs).toISOString(),
            BlocksKey: blocksKey,
        };
    }

    private partitionKeys(subscriptionName: string): string[] {
        const keys = new Set<string>();
        for (const delivery of this.deliveriesOf(subscriptionName)) {
            if (delivery.PartitionKey !== null) {
                keys.add(delivery.PartitionKey);
            }
        }
        for (const state of this.sequences.values()) {
            if (state.SubscriptionName === subscriptionName) {
                keys.add(state.PartitionKey);
            }
        }
        return [...keys].sort();
    }

    private blockedKeyCount(subscriptionName: string): number {
        return this.partitionKeys(subscriptionName).filter((key) => this.headOf(subscriptionName, key)?.Status === 'DeadLettered').length;
    }

    private headOf(subscriptionName: string, key: string): StoredDelivery | null {
        const unfinished = this.deliveriesOf(subscriptionName).filter((delivery) => delivery.PartitionKey === key && UNFINISHED.has(delivery.Status));
        return unfinished.sort(byOrder)[0] ?? null;
    }

    private hasInFlight(subscriptionName: string, key: string): boolean {
        return this.deliveriesOf(subscriptionName).some((delivery) => delivery.PartitionKey === key && delivery.Status === 'InFlight');
    }

    private held(handle: DeliveryHandle): StoredDelivery | null {
        const delivery = this.deliveries.get(handle.DeliveryID);
        return delivery !== undefined && delivery.Status === 'InFlight' && delivery.LeaseToken === handle.LeaseToken ? delivery : null;
    }

    private ownDelivery(binding: SubscriptionBinding, deliveryID: string): StoredDelivery | null {
        this.RegisterBinding(binding);
        const delivery = this.deliveries.get(deliveryID);
        return delivery !== undefined && delivery.SubscriptionName === binding.Policy.SubscriptionName ? delivery : null;
    }

    private deliveriesOf(subscriptionName: string): StoredDelivery[] {
        return [...this.deliveries.values()].filter((delivery) => delivery.SubscriptionName === subscriptionName);
    }

    private sequenceState(subscriptionName: string, partitionKey: string): SequenceState {
        const key = JSON.stringify([subscriptionName, partitionKey]);
        let state = this.sequences.get(key);
        if (state === undefined) {
            state = { SubscriptionName: subscriptionName, PartitionKey: partitionKey, LastCompletedSequence: 0, AwaitingSequenceSinceMs: null, GapStalled: false };
            this.sequences.set(key, state);
        }
        return state;
    }

    private messageOf(delivery: StoredDelivery): WorkMessage {
        const stored = this.messages.get(delivery.MessageKey);
        if (stored === undefined) {
            throw new Error(`InMemoryStore is missing message ${delivery.MessageKey}`);
        }
        return stored.Message;
    }

    private policyOf(subscriptionName: string): SubscriptionPolicy {
        const binding = this.bindings.get(subscriptionName);
        if (binding === undefined) {
            throw new Error(`Subscription '${subscriptionName}' is not registered with this InMemoryTransport`);
        }
        return binding.Policy;
    }
}

function tracksSequence(policy: SubscriptionPolicy): boolean {
    return policy.PartitionMode === 'Ordered' && policy.OrderingMode === 'ExplicitSequence';
}

function byOrder(a: StoredDelivery, b: StoredDelivery): number {
    return a.OrderKey - b.OrderKey || a.Ordinal - b.Ordinal;
}

function clearLease(delivery: StoredDelivery): void {
    delivery.LeaseToken = null;
    delivery.LeaseExpiresAtMs = null;
}

function settled(delivery: StoredDelivery): SettleResult {
    return { Kind: 'Settled', DeliveryID: delivery.ID, Status: delivery.Status };
}

function lost(handle: DeliveryHandle): SettleResult {
    return { Kind: 'LeaseLost', DeliveryID: handle.DeliveryID };
}

function sameEnvelope(a: WorkMessage, b: WorkMessage): boolean {
    return JSON.stringify({ ...a, PublishedAt: '' }) === JSON.stringify({ ...b, PublishedAt: '' });
}

function paginate<T>(items: T[], cursor: string | null, pageSize: number): Page<T> {
    const parsed = cursor === null ? 0 : Number.parseInt(cursor, 10);
    const offset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const end = offset + Math.max(1, pageSize);
    return { Items: items.slice(offset, end), NextCursor: end < items.length ? String(end) : null };
}
```

- [ ] **Step 5: Write the consumer, operator and transport**

`src/memory/InMemoryConsumer.ts`:

```typescript
import type { WorkJson } from '../envelope';
import type { WorkProgress } from '../handler';
import type { ITransportConsumer, ReceivedDelivery, SettleResult, SubscriptionBinding } from '../transport';
import type { InMemoryStore } from './InMemoryStore';

export class InMemoryConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    constructor(
        private readonly store: InMemoryStore,
        private readonly binding: SubscriptionBinding,
    ) {
        store.RegisterBinding(binding);
    }

    public async Receive(max: number, _waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        if (signal.aborted) {
            return [];
        }
        // Like every transport, the in-memory store cannot verify that payloads match TPayload.
        return this.store.Claim(this.binding, max) as ReceivedDelivery<TPayload>[];
    }

    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<'Held' | 'Lost'> {
        return this.store.ExtendLease(delivery, leaseSeconds, progress);
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.store.Complete(delivery);
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult> {
        return this.store.Retry(delivery, delaySeconds, error);
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        return this.store.DeadLetter(delivery, reason, error);
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.store.Release(delivery);
    }

    public async Close(): Promise<void> {
        return;
    }
}
```

`src/memory/InMemoryOperator.ts`:

```typescript
import type { DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord, SubscriptionStats } from '../operator';
import type { SubscriptionBinding } from '../transport';
import type { InMemoryStore } from './InMemoryStore';

export class InMemoryOperator implements ITransportOperator {
    constructor(private readonly store: InMemoryStore) {}

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        return this.store.Stats(subscription);
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        return this.store.DeadLetters(subscription, cursor, pageSize);
    }

    public async ListPartitions(
        subscription: SubscriptionBinding,
        condition: PartitionCondition | null,
        cursor: string | null,
        pageSize: number,
    ): Promise<Page<PartitionStateRecord> | null> {
        return this.store.Partitions(subscription, condition, cursor, pageSize);
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        return { Supported: true, Changed: this.store.Replay(subscription, deliveryID, actorUserID, note) };
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        const result = this.store.Discard(subscription, deliveryID, reason, actorUserID);
        // CancelRequested is only set for the in-flight case, so plain discards keep the simple shape.
        return result.CancelRequested
            ? { Supported: true, Changed: result.Changed, CancelRequested: true }
            : { Supported: true, Changed: result.Changed };
    }

    public async SkipSequence(
        subscription: SubscriptionBinding,
        partitionKey: string,
        sequence: number,
        _reason: string,
        _actorUserID: string | null,
    ): Promise<OperatorResult> {
        return { Supported: true, Changed: this.store.SkipSequence(subscription, partitionKey, sequence) };
    }
}
```

`src/memory/InMemoryTransport.ts`:

```typescript
import type { WorkJson, WorkMessage } from '../envelope';
import { WORK_QUEUE_FILTER_SUPPORT } from '../filter';
import type { ITransportOperator } from '../operator';
import type { PublishResult } from '../publishing';
import type {
    BindingValidationIssue,
    DatabasePublishOptions,
    ITransportConsumer,
    ITransportDriver,
    SubscriptionBinding,
    TopicBinding,
    TransportCapabilities,
} from '../transport';
import { InMemoryConsumer } from './InMemoryConsumer';
import { InMemoryOperator } from './InMemoryOperator';
import { InMemoryStore } from './InMemoryStore';
import type { InMemoryDeliverySnapshot } from './InMemoryStore';

/** Identical to the Database transport's capabilities, so it can stand in for it in tests. */
export const IN_MEMORY_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    Filters: WORK_QUEUE_FILTER_SUPPORT,
    DetectsMessageIDDuplicates: true,
    PersistsProgress: true,
    SupportsOrdered: true,
    SupportsExternalHosts: false,
    CancelPending: true,
    CancelInFlight: true,
    ListPartitions: true,
    PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true,
    CompletedCounts: true,
    MaxRetryDelaySeconds: 2147483647,
};

export interface InMemoryTransportOptions {
    Now?: () => number;
    NewId?: () => string;
}

/** Reference transport with full Database-transport semantics, held in process memory. */
export class InMemoryTransport implements ITransportDriver {
    public readonly Name = 'InMemory';
    public readonly Capabilities: TransportCapabilities = IN_MEMORY_TRANSPORT_CAPABILITIES;
    private readonly store: InMemoryStore;

    constructor(options: InMemoryTransportOptions = {}) {
        this.store = new InMemoryStore(options.Now ?? (() => Date.now()), options.NewId ?? (() => crypto.randomUUID()));
    }

    public async Publish(
        topic: TopicBinding,
        messages: WorkMessage[],
        subscriptions: SubscriptionBinding[],
        _opts?: DatabasePublishOptions,
    ): Promise<PublishResult[]> {
        return this.store.Publish(topic, messages, subscriptions);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new InMemoryConsumer<TPayload>(this.store, subscription);
    }

    public Operator(): ITransportOperator {
        return new InMemoryOperator(this.store);
    }

    public async ValidateBindings(_topic: TopicBinding, _subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return [];
    }

    /** Expire leases everywhere and flag sequence gaps past SequenceGapAlertSeconds (the sweeper's job). */
    public RunSweep(): { ExpiredLeases: number; GapStalls: number } {
        return this.store.RunSweep();
    }

    /** Test/diagnostic view of one subscription's deliveries, in claim order. */
    public Snapshot(subscriptionName: string): InMemoryDeliverySnapshot[] {
        return this.store.Snapshot(subscriptionName);
    }
}
```

- [ ] **Step 6: Export the modules**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from './memory/InMemoryTransport';
export type { InMemoryTransportOptions } from './memory/InMemoryTransport';
export type { InMemoryDeliverySnapshot } from './memory/InMemoryStore';
export { LEASE_EXPIRED_REASON, SEQUENCE_ALREADY_RESOLVED_NOTE } from './memory/InMemoryStore';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 121 plus InMemoryTransport (14): **135 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): in-memory reference transport with Database semantics"
```

---

### Task 8: Conformance kit (`@memberjunction/work-queue-core/testing`)

**Files:**
- Create: `packages/WorkQueue/core/src/testing/assertions.ts`, `src/testing/ConformanceHarness.ts`, `src/testing/ConformanceScenario.ts`
- Create: `packages/WorkQueue/core/src/testing/conformanceCases.ts`, `src/testing/RunConformanceChecks.ts`, `src/testing/index.ts`, `src/testing/vitest.ts`
- Modify: `packages/WorkQueue/core/package.json` (add `./testing` and `./testing/vitest` exports and an optional `vitest` peer)
- Test: `packages/WorkQueue/core/src/__tests__/conformanceAssertions.test.ts`, `src/__tests__/RunConformanceChecks.test.ts`, `src/__tests__/conformance.test.ts`

**Interfaces:**
- Consumes: `BuildMessages`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `SubscriptionBindingOverrides`, `ManualClock` (Task 7 fixtures); `InMemoryTransport`, `IN_MEMORY_TRANSPORT_CAPABILITIES` (Task 7); contract types (Task 1).
- Produces from `@memberjunction/work-queue-core/testing` (**no `vitest` import anywhere in this entry**):
  - everything in `testing/fixtures.ts`
  - `class ConformanceAssertionError extends Error`
  - `interface ConformanceTraits { ReleaseConsumesAttempt: boolean; ExpiredLeaseDeadLetters: boolean; ReceiveWaitSeconds: number }`
  - `interface ConformanceHarness { readonly Capabilities: TransportCapabilities; readonly Traits: ConformanceTraits; CreateDriver(): Promise<ITransportDriver>; CreateTopic(driver: ITransportDriver, name: string, overrides?: Partial<TopicBinding>): Promise<TopicBinding>; CreateSubscription(driver: ITransportDriver, topic: TopicBinding, name: string, overrides?: SubscriptionBindingOverrides): Promise<SubscriptionBinding>; AdvanceTime(ms: number): Promise<void>; Dispose?(driver: ITransportDriver): Promise<void> }`
  - `interface ConformanceCase { Id: string; Title: string; Gate(harness: ConformanceHarness): string | null; Run(harness: ConformanceHarness): Promise<void> }` — `Gate` returns a skip reason or `null`; `Run` throws `ConformanceAssertionError` on failure and disposes its own driver
  - `const CONFORMANCE_CASES: readonly ConformanceCase[]` (27 cases, ids `C01`–`C27`)
  - `interface ConformanceCheckResult { Id: string; Title: string; Status: 'Passed' | 'Failed' | 'Skipped'; Detail: string | null; DurationMs: number }`
  - `RunConformanceChecks(harness: ConformanceHarness): Promise<ConformanceCheckResult[]>` — runs cases sequentially, never throws
- Produces from `@memberjunction/work-queue-core/testing/vitest`:
  - `RunTransportConformanceSuite(name: string, harness: ConformanceHarness): void` — `describe(name)` with one `it` (or `it.skip`, titled with the skip reason) per case calling `case.Run(harness)`

**Why two entries.** Plan 06's integration bundle runs the kit against a live database inside the MJ test runner, where `vitest` is not available. Case bodies therefore use the kit's own assertion helpers (`testing/assertions.ts`), and `RunConformanceChecks` returns plain results. Only `./testing/vitest` imports `vitest`, which stays an **optional** peer dependency: driver packages' unit tests already have it, and Lambda bundles and production installs never load it. `check-internal-peer-deps` forbids only `@memberjunction/*` peers, so an external optional peer is allowed.

**Dispose per case.** Each case opens its own scenario through `WithScenario`, which closes the scenario's consumers and calls `harness.Dispose(driver)` in a `finally` block, whether the case passes, fails or throws.

Cases (the `Gate` column is the condition for running; otherwise the case is `Skipped` with the reason shown):

| Id | Gate | Behaviour |
| --- | --- | --- |
| C01 | — | Publish fans out to every subscription |
| C02 | — | Subscriptions settle independently (complete in one, dead-letter in the other) |
| C03 | — | Attribute filters select deliveries |
| C04 | — | A completed delivery is not redelivered |
| C05 | — | `Retry` hides the delivery for its delay, then redelivers with the next attempt |
| C06 | — | An expired lease redelivers and counts an attempt |
| C07 | — | A stale lease token is fenced out (`LeaseLost`) |
| C08 | — | `ExtendLease` keeps a delivery leased past its original expiry |
| C09 | — | `ExtendLease` after a lost lease returns `Lost` |
| C10 | — | A dead letter is listed with its reason |
| C11 | — | `Exclusive`: one in flight per key |
| C12 | — | `Exclusive`: different keys run concurrently |
| C13 | — | `Exclusive`: a dead letter does not block the key |
| C14 | `SupportsOrdered` | `Ordered`: head of line |
| C15 | `SupportsOrdered` | `Ordered`: a head in retry backoff holds its key |
| C16 | `SupportsOrdered` | `Ordered`: a dead letter blocks its key (listed as `Blocked` when `ListPartitions`); replay unblocks in order |
| C17 | `SupportsOrdered` | `Ordered`: discarding the dead letter unblocks the key |
| C18 | `SupportsOrdered` | `ExplicitSequence`: a gap waits, then proceeds in sequence order |
| C19 | `SupportsOrdered` | `SkipSequence` releases the waiting sequence |
| C20 | `SupportsOrdered` + `ListPartitions` | A waiting key is listed as `AwaitingSequence` |
| C21 | `CancelPending` | Discarding a pending delivery cancels it |
| C22 | `DetectsMessageIDDuplicates` | Republishing a `MessageID` returns `Duplicate` and delivers once |
| C23 | — | `Release` redelivers with the same attempt, or the next when `Traits.ReleaseConsumesAttempt` |
| C24 | `Traits.ExpiredLeaseDeadLetters` | A lease expiring on the final attempt dead-letters as `LeaseExpired` |
| C25 | `CompletedCounts` | Stats count completions in the last hour |

Partitioned cases create their topic with `IsFifo: true`; sequence cases with `OrderingMode: 'ExplicitSequence'`. Delays are short (lease 5 s, retry 2 s) so real-time harnesses stay fast.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/core/src/__tests__/conformanceAssertions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AssertEqual, AssertLength, AssertMatch, ConformanceAssertionError, IsDeepEqual } from '../testing/assertions';

describe('conformance assertions', () => {
    it('compares values structurally', () => {
        expect(IsDeepEqual({ a: [1, { b: 'x' }], c: null }, { c: null, a: [1, { b: 'x' }] })).toBe(true);
        expect(IsDeepEqual([1, 2], [2, 1])).toBe(false);
        expect(IsDeepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(IsDeepEqual('1', 1)).toBe(false);
    });

    it('throws ConformanceAssertionError with both values in the message', () => {
        expect(() => AssertEqual(['2'], ['1'], 'numbers')).toThrow(ConformanceAssertionError);
        expect(() => AssertEqual(['2'], ['1'], 'numbers')).toThrow('numbers: expected ["1"] but got ["2"]');
        expect(() => AssertLength([1], 2, 'receive')).toThrow('receive: expected 2 items but got 1');
    });

    it('matches a subset of properties', () => {
        expect(() => AssertMatch({ Kind: 'Settled', Status: 'Completed', DeliveryID: 'd' }, { Kind: 'Settled', Status: 'Completed' }, 'settle')).not.toThrow();
        expect(() => AssertMatch({ Kind: 'LeaseLost' }, { Kind: 'Settled' }, 'settle')).toThrow('settle: expected Kind "Settled" but got "LeaseLost"');
        expect(() => AssertMatch(null, { Kind: 'Settled' }, 'settle')).toThrow('settle: expected an object');
    });
});
```

`packages/WorkQueue/core/src/__tests__/RunConformanceChecks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from '../memory/InMemoryTransport';
import { BuildSubscriptionBinding, BuildTopicBinding, CONFORMANCE_CASES, ManualClock, RunConformanceChecks } from '../testing';
import type { ConformanceHarness } from '../testing';
import type { ITransportDriver } from '../transport';

function inMemoryHarness(overrides: Partial<ConformanceHarness> = {}): ConformanceHarness & { Disposed: ITransportDriver[] } {
    const clock = new ManualClock();
    const disposed: ITransportDriver[] = [];
    return {
        Capabilities: IN_MEMORY_TRANSPORT_CAPABILITIES,
        Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 },
        CreateDriver: async () => new InMemoryTransport({ Now: clock.Now }),
        CreateTopic: async (_driver, name, topicOverrides) => BuildTopicBinding(name, topicOverrides),
        CreateSubscription: async (_driver, topic, name, subscriptionOverrides) => BuildSubscriptionBinding(topic, name, subscriptionOverrides),
        AdvanceTime: async (ms) => clock.Advance(ms),
        Dispose: async (driver) => {
            disposed.push(driver);
        },
        Disposed: disposed,
        ...overrides,
    };
}

describe('RunConformanceChecks', () => {
    it('passes every case against InMemoryTransport and disposes each driver', async () => {
        const harness = inMemoryHarness();
        const results = await RunConformanceChecks(harness);
        expect(results.map((result) => result.Id)).toEqual(CONFORMANCE_CASES.map((conformanceCase) => conformanceCase.Id));
        expect(results.filter((result) => result.Status === 'Failed')).toEqual([]);
        expect(results.every((result) => result.Status === 'Passed')).toBe(true);
        expect(harness.Disposed).toHaveLength(CONFORMANCE_CASES.length);
    });

    it('reports gated cases as Skipped with the reason', async () => {
        const harness = inMemoryHarness({ Capabilities: { ...IN_MEMORY_TRANSPORT_CAPABILITIES, SupportsOrdered: false, CancelPending: false } });
        const results = await RunConformanceChecks(harness);
        const byId = new Map(results.map((result) => [result.Id, result]));
        expect(byId.get('C14')).toMatchObject({ Status: 'Skipped', Detail: 'Transport does not support Ordered subscriptions', DurationMs: 0 });
        expect(byId.get('C21')?.Status).toBe('Skipped');
        expect(results.filter((result) => result.Status === 'Failed')).toEqual([]);
    });

    it('records failures without throwing and still disposes the driver', async () => {
        const harness = inMemoryHarness({ Traits: { ReleaseConsumesAttempt: true, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 } });
        const results = await RunConformanceChecks(harness);
        const release = results.find((result) => result.Id === 'C23');
        expect(release?.Status).toBe('Failed');
        expect(release?.Detail).toContain('attempt: expected 2 but got 1');
        expect(harness.Disposed).toHaveLength(CONFORMANCE_CASES.length);
    });
});
```

`packages/WorkQueue/core/src/__tests__/conformance.test.ts`:

```typescript
import { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from '../memory/InMemoryTransport';
import { BuildSubscriptionBinding, BuildTopicBinding, ManualClock } from '../testing';
import { RunTransportConformanceSuite } from '../testing/vitest';

const clock = new ManualClock();

RunTransportConformanceSuite('InMemoryTransport', {
    Capabilities: IN_MEMORY_TRANSPORT_CAPABILITIES,
    Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 },
    CreateDriver: async () => new InMemoryTransport({ Now: clock.Now }),
    CreateTopic: async (_driver, name, overrides) => BuildTopicBinding(name, overrides),
    CreateSubscription: async (_driver, topic, name, overrides) => BuildSubscriptionBinding(topic, name, overrides),
    AdvanceTime: async (ms) => clock.Advance(ms),
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/core && pnpm test conformance RunConformanceChecks`
Expected: FAIL — unresolved imports `../testing/assertions`, `../testing` (no `index.ts`) and `../testing/vitest`.

- [ ] **Step 3: Write `src/testing/assertions.ts`**

```typescript
/** Thrown by conformance cases when a transport does not behave as the contract requires. */
export class ConformanceAssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConformanceAssertionError';
    }
}

/** Structural equality for JSON-like values (primitives, arrays, plain objects). */
export function IsDeepEqual(actual: unknown, expected: unknown): boolean {
    if (Object.is(actual, expected)) {
        return true;
    }
    if (Array.isArray(actual) || Array.isArray(expected)) {
        return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && actual.every((item, index) => IsDeepEqual(item, expected[index]));
    }
    if (!isRecord(actual) || !isRecord(expected)) {
        return false;
    }
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(actual, key) && IsDeepEqual(actual[key], expected[key]));
}

export function AssertEqual(actual: unknown, expected: unknown, label: string): void {
    if (!IsDeepEqual(actual, expected)) {
        Fail(`${label}: expected ${render(expected)} but got ${render(actual)}`);
    }
}

/** Every property of `expected` must be deep-equal on `actual`; other properties are ignored. */
export function AssertMatch(actual: unknown, expected: Record<string, unknown>, label: string): void {
    if (!isRecord(actual)) {
        Fail(`${label}: expected an object but got ${render(actual)}`);
    }
    for (const [key, value] of Object.entries(expected)) {
        if (!IsDeepEqual(actual[key], value)) {
            Fail(`${label}: expected ${key} ${render(value)} but got ${render(actual[key])}`);
        }
    }
}

export function AssertLength(items: readonly unknown[], expected: number, label: string): void {
    if (items.length !== expected) {
        Fail(`${label}: expected ${expected} items but got ${items.length}`);
    }
}

export function AssertTrue(condition: boolean, label: string): void {
    if (!condition) {
        Fail(`${label}: expected true`);
    }
}

export function Fail(message: string): never {
    throw new ConformanceAssertionError(message);
}

function render(value: unknown): string {
    if (value === undefined) {
        return 'undefined';
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Write `src/testing/ConformanceHarness.ts`**

```typescript
import type { ITransportDriver, SubscriptionBinding, TopicBinding, TransportCapabilities } from '../transport';
import type { SubscriptionBindingOverrides } from './fixtures';

export interface ConformanceTraits {
    /** true for SQS-like transports where Release consumes a receive (attempt). */
    ReleaseConsumesAttempt: boolean;
    /** true when an expired lease on the final attempt dead-letters as 'LeaseExpired' (Database-like). */
    ExpiredLeaseDeadLetters: boolean;
    /** waitSeconds passed to Receive (eventually consistent transports need > 0). */
    ReceiveWaitSeconds: number;
}

export interface ConformanceHarness {
    readonly Capabilities: TransportCapabilities;
    readonly Traits: ConformanceTraits;
    /** A driver for one case; resources may be shared across cases because names are unique. */
    CreateDriver(): Promise<ITransportDriver>;
    CreateTopic(driver: ITransportDriver, name: string, overrides?: Partial<TopicBinding>): Promise<TopicBinding>;
    CreateSubscription(driver: ITransportDriver, topic: TopicBinding, name: string, overrides?: SubscriptionBindingOverrides): Promise<SubscriptionBinding>;
    /** Advance the transport's clock (fake) or wait in real time. */
    AdvanceTime(ms: number): Promise<void>;
    /** Called once per case, after the case finishes, with the driver it created. */
    Dispose?(driver: ITransportDriver): Promise<void>;
}

export interface ConformanceCase {
    Id: string;
    Title: string;
    /** A skip reason when the harness cannot run this case, otherwise null. */
    Gate(harness: ConformanceHarness): string | null;
    /** Throws ConformanceAssertionError on failure. Disposes its own driver. */
    Run(harness: ConformanceHarness): Promise<void>;
}

export interface ConformanceCheckResult {
    Id: string;
    Title: string;
    Status: 'Passed' | 'Failed' | 'Skipped';
    Detail: string | null;
    DurationMs: number;
}
```

- [ ] **Step 5: Write `src/testing/ConformanceScenario.ts`**

```typescript
import type { ITransportOperator } from '../operator';
import type { PublishRequest, PublishResult } from '../publishing';
import type { ITransportConsumer, ITransportDriver, ReceivedDelivery, SubscriptionBinding, TopicBinding } from '../transport';
import { Fail } from './assertions';
import type { ConformanceHarness } from './ConformanceHarness';
import { BuildMessages } from './fixtures';
import type { SubscriptionBindingOverrides } from './fixtures';

let nameCounter = 0;

function uniqueName(prefix: string): string {
    nameCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${nameCounter}`;
}

/** One driver, one topic and named subscriptions for a single conformance case. */
export class ConformanceScenario {
    private readonly subscriptions = new Map<string, SubscriptionBinding>();
    private readonly consumers = new Map<string, ITransportConsumer>();

    private constructor(
        private readonly harness: ConformanceHarness,
        public readonly Driver: ITransportDriver,
        public readonly Topic: TopicBinding,
    ) {}

    public static async Open(harness: ConformanceHarness, driver: ITransportDriver, topicOverrides: Partial<TopicBinding>): Promise<ConformanceScenario> {
        const topic = await harness.CreateTopic(driver, uniqueName('wqc-topic'), topicOverrides);
        return new ConformanceScenario(harness, driver, topic);
    }

    public get Operator(): ITransportOperator {
        return this.Driver.Operator();
    }

    public async AddSubscription(key: string, overrides: SubscriptionBindingOverrides): Promise<void> {
        this.subscriptions.set(key, await this.harness.CreateSubscription(this.Driver, this.Topic, uniqueName(`wqc-${key}`), overrides));
    }

    public Subscription(key: string): SubscriptionBinding {
        return this.subscriptions.get(key) ?? Fail(`Scenario has no subscription '${key}'`);
    }

    public Consumer(key: string): ITransportConsumer {
        const existing = this.consumers.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const created = this.Driver.OpenConsumer(this.Subscription(key));
        this.consumers.set(key, created);
        return created;
    }

    public Publish(requests: PublishRequest[]): Promise<PublishResult[]> {
        return this.Driver.Publish(this.Topic, BuildMessages(this.Topic, requests), [...this.subscriptions.values()]);
    }

    public Receive(key: string, max = 10): Promise<ReceivedDelivery[]> {
        return this.Consumer(key).Receive(max, this.harness.Traits.ReceiveWaitSeconds, new AbortController().signal);
    }

    public async DeadLetterID(key: string, messageID: string): Promise<string> {
        const page = await this.Operator.ListDeadLetters(this.Subscription(key), null, 100);
        const record = page?.Items.find((item) => item.Message.MessageID === messageID);
        return record?.DeliveryID ?? Fail(`No dead letter listed for message ${messageID}`);
    }

    public async Close(): Promise<void> {
        for (const consumer of this.consumers.values()) {
            await consumer.Close();
        }
    }
}

/** Opens a scenario, runs the case body, then always closes consumers and disposes the driver. */
export async function WithScenario(
    harness: ConformanceHarness,
    topicOverrides: Partial<TopicBinding>,
    subscriptions: [string, SubscriptionBindingOverrides][],
    body: (scenario: ConformanceScenario) => Promise<void>,
): Promise<void> {
    const driver = await harness.CreateDriver();
    let scenario: ConformanceScenario | null = null;
    try {
        scenario = await ConformanceScenario.Open(harness, driver, topicOverrides);
        for (const [key, overrides] of subscriptions) {
            await scenario.AddSubscription(key, overrides);
        }
        await body(scenario);
    } finally {
        if (scenario !== null) {
            await scenario.Close();
        }
        if (harness.Dispose !== undefined) {
            await harness.Dispose(driver);
        }
    }
}

/** Sorted values of each delivery's `n` attribute, the numbering every case publishes with. */
export function Numbers(deliveries: ReceivedDelivery[]): string[] {
    return deliveries.map((delivery) => delivery.Message.Attributes['n'] ?? '').sort();
}

export function Keyed(n: string, key = 'k'): PublishRequest {
    return { PartitionKey: key, Attributes: { n } };
}

export function Sequenced(sequence: number, key = 'k'): PublishRequest {
    return { PartitionKey: key, Sequence: sequence, Attributes: { n: String(sequence) } };
}
```

- [ ] **Step 6: Write `src/testing/conformanceCases.ts`**

```typescript
import type { TopicBinding } from '../transport';
import { AssertEqual, AssertLength, AssertMatch, AssertTrue } from './assertions';
import type { ConformanceCase, ConformanceHarness } from './ConformanceHarness';
import { Keyed, Numbers, Sequenced, WithScenario } from './ConformanceScenario';

const PARTITIONED_TOPIC: Partial<TopicBinding> = { IsFifo: true };
const SEQUENCED_TOPIC: Partial<TopicBinding> = { OrderingMode: 'ExplicitSequence', IsFifo: true };

const always = (): string | null => null;
const whenOrdered = (harness: ConformanceHarness): string | null =>
    harness.Capabilities.SupportsOrdered ? null : 'Transport does not support Ordered subscriptions';

const C01: ConformanceCase = {
    Id: 'C01',
    Title: 'fans a message out to every subscription',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}], ['b', {}]], async (s) => {
            const [result] = await s.Publish([{ Attributes: { n: '1' } }]);
            AssertEqual(result.Status, 'Accepted', 'publish status');
            const a = await s.Receive('a');
            const b = await s.Receive('b');
            AssertEqual(a.map((delivery) => delivery.Message.MessageID), [result.MessageID], 'subscription a');
            AssertEqual(b.map((delivery) => delivery.Message.MessageID), [result.MessageID], 'subscription b');
            AssertEqual(a[0].Attempt, 1, 'first attempt');
        }),
};

const C02: ConformanceCase = {
    Id: 'C02',
    Title: 'settles subscriptions independently',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}], ['b', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [a] = await s.Receive('a');
            const [b] = await s.Receive('b');
            AssertMatch(await s.Consumer('a').Complete(a), { Kind: 'Settled', Status: 'Completed' }, 'complete a');
            AssertMatch(await s.Consumer('b').DeadLetter(b, 'Poison', 'bad data'), { Kind: 'Settled', Status: 'DeadLettered' }, 'dead-letter b');
            AssertLength(await s.Receive('a'), 0, 'redelivery to a');
            const aDead = await s.Operator.ListDeadLetters(s.Subscription('a'), null, 100);
            const bDead = await s.Operator.ListDeadLetters(s.Subscription('b'), null, 100);
            AssertLength(aDead?.Items ?? [], 0, 'dead letters of a');
            AssertEqual((bDead?.Items ?? []).map((item) => item.Reason), ['Poison'], 'dead letters of b');
        }),
};

const C03: ConformanceCase = {
    Id: 'C03',
    Title: 'selects deliveries with attribute filters',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['clicks', { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] } }]], async (s) => {
            await s.Publish([{ Attributes: { eventType: 'open', n: '1' } }, { Attributes: { eventType: 'click', n: '2' } }]);
            AssertEqual(Numbers(await s.Receive('clicks')), ['2'], 'filtered deliveries');
        }),
};

const C04: ConformanceCase = {
    Id: 'C04',
    Title: 'does not redeliver a completed delivery',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await s.Consumer('a').Complete(delivery);
            AssertLength(await s.Receive('a'), 0, 'redelivery');
        }),
};

const C05: ConformanceCase = {
    Id: 'C05',
    Title: 'hides a retried delivery for its delay, then redelivers it',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            AssertMatch(await s.Consumer('a').Retry(delivery, 2, 'busy'), { Kind: 'Settled', Status: 'Pending' }, 'retry');
            AssertLength(await s.Receive('a'), 0, 'receive during backoff');
            await harness.AdvanceTime(2500);
            const [again] = await s.Receive('a');
            AssertEqual(again?.Message.MessageID, delivery.Message.MessageID, 'redelivered message');
            AssertEqual(again?.Attempt, 2, 'attempt');
        }),
};

const C06: ConformanceCase = {
    Id: 'C06',
    Title: 'redelivers after an expired lease and counts the attempt',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            await s.Receive('a');
            await harness.AdvanceTime(6000);
            const [again] = await s.Receive('a');
            AssertEqual(again?.Attempt, 2, 'attempt');
        }),
};

const C07: ConformanceCase = {
    Id: 'C07',
    Title: 'fences out a stale lease token',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [first] = await s.Receive('a');
            await harness.AdvanceTime(6000);
            const [second] = await s.Receive('a');
            AssertMatch(await s.Consumer('a').Complete(first), { Kind: 'LeaseLost' }, 'stale complete');
            AssertMatch(await s.Consumer('a').Complete(second), { Kind: 'Settled', Status: 'Completed' }, 'current complete');
        }),
};

const C08: ConformanceCase = {
    Id: 'C08',
    Title: 'keeps a delivery leased after ExtendLease',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await harness.AdvanceTime(4000);
            AssertEqual(await s.Consumer('a').ExtendLease(delivery, 5), 'Held', 'extend');
            await harness.AdvanceTime(3000);
            AssertLength(await s.Receive('a'), 0, 'receive while extended');
            AssertMatch(await s.Consumer('a').Complete(delivery), { Kind: 'Settled', Status: 'Completed' }, 'complete');
        }),
};

const C09: ConformanceCase = {
    Id: 'C09',
    Title: 'reports Lost when extending a lost lease',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [first] = await s.Receive('a');
            await harness.AdvanceTime(6000);
            await s.Receive('a');
            AssertEqual(await s.Consumer('a').ExtendLease(first, 5), 'Lost', 'extend stale lease');
        }),
};

const C10: ConformanceCase = {
    Id: 'C10',
    Title: 'lists a dead letter with its reason',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(delivery, 'Poison', 'stack trace');
            AssertLength(await s.Receive('a'), 0, 'redelivery');
            const page = await s.Operator.ListDeadLetters(s.Subscription('a'), null, 100);
            AssertEqual((page?.Items ?? []).map((item) => [item.Reason, item.Message.MessageID]), [['Poison', delivery.Message.MessageID]], 'dead letters');
        }),
};

const C11: ConformanceCase = {
    Id: 'C11',
    Title: 'Exclusive: runs one delivery per key at a time',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const first = await s.Receive('a');
            AssertLength(first, 1, 'first receive');
            await s.Consumer('a').Complete(first[0]);
            AssertLength(await s.Receive('a'), 1, 'second receive');
        }),
};

const C12: ConformanceCase = {
    Id: 'C12',
    Title: 'Exclusive: runs different keys concurrently',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive' }]], async (s) => {
            await s.Publish([Keyed('1', 'k1'), Keyed('2', 'k2')]);
            AssertEqual(Numbers(await s.Receive('a')), ['1', '2'], 'concurrent keys');
        }),
};

const C13: ConformanceCase = {
    Id: 'C13',
    Title: 'Exclusive: a dead letter does not block its key',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [first] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(first, 'Poison', null);
            AssertLength(await s.Receive('a'), 1, 'receive after dead letter');
        }),
};

const C14: ConformanceCase = {
    Id: 'C14',
    Title: 'Ordered: delivers only the head of each key',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const first = await s.Receive('a');
            AssertEqual(Numbers(first), ['1'], 'head');
            await s.Consumer('a').Complete(first[0]);
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next');
        }),
};

const C15: ConformanceCase = {
    Id: 'C15',
    Title: 'Ordered: a head in retry backoff holds its key',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Consumer('a').Retry(head, 2, 'busy');
            AssertLength(await s.Receive('a'), 0, 'receive during head backoff');
            await harness.AdvanceTime(2500);
            const again = await s.Receive('a');
            AssertEqual(Numbers(again), ['1'], 'head redelivered');
            AssertEqual(again[0]?.Attempt, 2, 'attempt');
        }),
};

const C16: ConformanceCase = {
    Id: 'C16',
    Title: 'Ordered: a dead letter blocks its key until replayed',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(head, 'Poison', null);
            AssertLength(await s.Receive('a'), 0, 'receive behind dead letter');
            if (harness.Capabilities.ListPartitions) {
                const blocked = await s.Operator.ListPartitions(s.Subscription('a'), 'Blocked', null, 10);
                AssertEqual((blocked?.Items ?? []).map((item) => item.PartitionKey), ['k'], 'blocked keys');
            }
            const id = await s.DeadLetterID('a', head.Message.MessageID);
            AssertEqual(await s.Operator.Replay(s.Subscription('a'), id, null, 'fixed upstream'), { Supported: true, Changed: true }, 'replay');
            const replayed = await s.Receive('a');
            AssertEqual(Numbers(replayed), ['1'], 'replayed head');
            AssertTrue(replayed[0]?.IsReplay === true, 'IsReplay');
            AssertEqual(replayed[0]?.Attempt, 1, 'replay attempt');
            await s.Consumer('a').Complete(replayed[0]);
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next after replay');
        }),
};

const C17: ConformanceCase = {
    Id: 'C17',
    Title: 'Ordered: discarding the dead letter unblocks the key',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(head, 'Poison', null);
            const id = await s.DeadLetterID('a', head.Message.MessageID);
            AssertEqual(await s.Operator.Discard(s.Subscription('a'), id, 'bad batch', null), { Supported: true, Changed: true }, 'discard');
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next after discard');
        }),
};

const C18: ConformanceCase = {
    Id: 'C18',
    Title: 'ExplicitSequence: waits for a gap, then proceeds in order',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, SEQUENCED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Sequenced(2)]);
            AssertLength(await s.Receive('a'), 0, 'receive with sequence 1 missing');
            await s.Publish([Sequenced(1)]);
            const first = await s.Receive('a');
            AssertEqual(Numbers(first), ['1'], 'sequence 1');
            await s.Consumer('a').Complete(first[0]);
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'sequence 2');
        }),
};

const C19: ConformanceCase = {
    Id: 'C19',
    Title: 'ExplicitSequence: SkipSequence releases the waiting sequence',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, SEQUENCED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Sequenced(2)]);
            AssertLength(await s.Receive('a'), 0, 'receive with sequence 1 missing');
            AssertEqual(await s.Operator.SkipSequence(s.Subscription('a'), 'k', 1, 'lost upstream', null), { Supported: true, Changed: true }, 'skip');
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'sequence 2 after skip');
        }),
};

const C20: ConformanceCase = {
    Id: 'C20',
    Title: 'ExplicitSequence: lists a waiting key as AwaitingSequence',
    Gate: (harness) => whenOrdered(harness) ?? (harness.Capabilities.ListPartitions ? null : 'Transport cannot list partitions'),
    Run: (harness) =>
        WithScenario(harness, SEQUENCED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Sequenced(2)]);
            await s.Receive('a');
            const page = await s.Operator.ListPartitions(s.Subscription('a'), 'AwaitingSequence', null, 10);
            AssertEqual((page?.Items ?? []).map((item) => item.PartitionKey), ['k'], 'awaiting keys');
        }),
};

const C21: ConformanceCase = {
    Id: 'C21',
    Title: 'discards a pending delivery',
    Gate: (harness) => (harness.Capabilities.CancelPending ? null : 'Transport cannot cancel pending deliveries'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await s.Consumer('a').Release(delivery);
            AssertEqual(await s.Operator.Discard(s.Subscription('a'), delivery.DeliveryID, 'cancelled', null), { Supported: true, Changed: true }, 'discard');
            AssertLength(await s.Receive('a'), 0, 'receive after discard');
        }),
};

const C22: ConformanceCase = {
    Id: 'C22',
    Title: 'reports a republished MessageID as Duplicate',
    Gate: (harness) => (harness.Capabilities.DetectsMessageIDDuplicates ? null : 'Transport does not detect MessageID duplicates'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            const messageID = crypto.randomUUID();
            await s.Publish([{ MessageID: messageID, Attributes: { n: '1' } }]);
            const [again] = await s.Publish([{ MessageID: messageID, Attributes: { n: '1' } }]);
            AssertEqual(again.Status, 'Duplicate', 'republish status');
            AssertLength(await s.Receive('a'), 1, 'deliveries');
        }),
};

const C23: ConformanceCase = {
    Id: 'C23',
    Title: 'redelivers a released delivery',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            AssertMatch(await s.Consumer('a').Release(delivery), { Kind: 'Settled' }, 'release');
            const [again] = await s.Receive('a');
            AssertEqual(again?.Attempt, harness.Traits.ReleaseConsumesAttempt ? 2 : 1, 'attempt');
        }),
};

const C24: ConformanceCase = {
    Id: 'C24',
    Title: 'dead-letters a lease that expires on the final attempt',
    Gate: (harness) => (harness.Traits.ExpiredLeaseDeadLetters ? null : 'Transport does not dead-letter expired leases itself'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { MaxAttempts: 1, LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            await s.Receive('a');
            await harness.AdvanceTime(6000);
            AssertLength(await s.Receive('a'), 0, 'receive after final lease expiry');
            const page = await s.Operator.ListDeadLetters(s.Subscription('a'), null, 100);
            AssertEqual((page?.Items ?? []).map((item) => item.Reason), ['LeaseExpired'], 'dead-letter reasons');
        }),
};

const C25: ConformanceCase = {
    Id: 'C25',
    Title: 'counts completions in the last hour',
    Gate: (harness) => (harness.Capabilities.CompletedCounts ? null : 'Transport does not count completions'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }, { Attributes: { n: '2' } }]);
            const [delivery] = await s.Receive('a', 1);
            await s.Consumer('a').Complete(delivery);
            AssertMatch(await s.Operator.GetStats(s.Subscription('a')), { Pending: 1, InFlight: 0, CompletedLastHour: 1 }, 'stats');
        }),
};

const whenCancelInFlight = (harness: ConformanceHarness): string | null =>
    harness.Capabilities.CancelInFlight ? null : 'Transport cannot cancel in-flight deliveries';

const C26: ConformanceCase = {
    Id: 'C26',
    Title: 'cancelling in flight fences the holder and settles as Discarded when the lease expires',
    Gate: whenCancelInFlight,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            AssertEqual(
                await s.Operator.Discard(s.Subscription('a'), delivery.DeliveryID, 'operator cancelled', null),
                { Supported: true, Changed: true, CancelRequested: true },
                'cancel in flight',
            );
            // The lease is revoked at once: the holder learns on its next heartbeat and cannot settle.
            AssertEqual(await s.Consumer('a').ExtendLease(delivery, 5), 'Lost', 'heartbeat after cancel');
            AssertMatch(await s.Consumer('a').Complete(delivery), { Kind: 'LeaseLost' }, 'settle after cancel');
            await harness.AdvanceTime(6000);
            AssertLength(await s.Receive('a'), 0, 'cancelled work is not redelivered');
            AssertMatch(await s.Operator.GetStats(s.Subscription('a')), { Pending: 0, InFlight: 0, DeadLettered: 0 }, 'stats after cancel');
        }),
};

const C27: ConformanceCase = {
    Id: 'C27',
    Title: 'a cancelled key is released only once the old lease expires',
    Gate: whenCancelInFlight,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive', LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Operator.Discard(s.Subscription('a'), head.DeliveryID, 'operator cancelled', null);
            // Still in flight: the next item must not start while the old handler is winding down.
            AssertLength(await s.Receive('a'), 0, 'key busy while the cancelled lease is alive');
            await harness.AdvanceTime(6000);
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next item after the cancelled lease expired');
        }),
};

/** The transport conformance cases (spec 02 §6), in execution order. */
export const CONFORMANCE_CASES: readonly ConformanceCase[] = [
    C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13,
    C14, C15, C16, C17, C18, C19, C20, C21, C22, C23, C24, C25, C26, C27,
];
```

- [ ] **Step 7: Write `src/testing/RunConformanceChecks.ts`**

```typescript
import { ConformanceAssertionError } from './assertions';
import type { ConformanceCheckResult, ConformanceHarness } from './ConformanceHarness';
import { CONFORMANCE_CASES } from './conformanceCases';

/**
 * Runs every conformance case sequentially and reports each outcome. Never throws: a gated case is
 * Skipped with its reason, and any error (assertion or otherwise) makes the case Failed. Each case
 * disposes its own driver (see WithScenario). Usable outside vitest, e.g. from an integration runner.
 */
export async function RunConformanceChecks(harness: ConformanceHarness): Promise<ConformanceCheckResult[]> {
    const results: ConformanceCheckResult[] = [];
    for (const conformanceCase of CONFORMANCE_CASES) {
        const base = { Id: conformanceCase.Id, Title: conformanceCase.Title };
        const skipReason = gateSafely(conformanceCase.Gate.bind(conformanceCase), harness);
        if (skipReason !== null) {
            results.push({ ...base, Status: 'Skipped', Detail: skipReason, DurationMs: 0 });
            continue;
        }
        const startedAt = Date.now();
        try {
            await conformanceCase.Run(harness);
            results.push({ ...base, Status: 'Passed', Detail: null, DurationMs: Date.now() - startedAt });
        } catch (error) {
            results.push({ ...base, Status: 'Failed', Detail: describeFailure(error), DurationMs: Date.now() - startedAt });
        }
    }
    return results;
}

function gateSafely(gate: (harness: ConformanceHarness) => string | null, harness: ConformanceHarness): string | null {
    try {
        return gate(harness);
    } catch (error) {
        return `Gate failed: ${describeFailure(error)}`;
    }
}

function describeFailure(error: unknown): string {
    if (error instanceof ConformanceAssertionError) {
        return error.message;
    }
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
```

- [ ] **Step 8: Write `src/testing/vitest.ts` and `src/testing/index.ts`**

`src/testing/vitest.ts` — the only file in the package that imports `vitest`:

```typescript
import { describe, it } from 'vitest';
import type { ConformanceHarness } from './ConformanceHarness';
import { CONFORMANCE_CASES } from './conformanceCases';

/** Registers every conformance case as a vitest test (skipped cases show their reason). */
export function RunTransportConformanceSuite(name: string, harness: ConformanceHarness): void {
    describe(`${name} — work-queue transport conformance`, () => {
        for (const conformanceCase of CONFORMANCE_CASES) {
            const title = `${conformanceCase.Id} ${conformanceCase.Title}`;
            const skipReason = conformanceCase.Gate(harness);
            if (skipReason === null) {
                it(title, () => conformanceCase.Run(harness));
            } else {
                it.skip(`${title} (skipped: ${skipReason})`, () => conformanceCase.Run(harness));
            }
        }
    });
}
```

`src/testing/index.ts` — no `vitest` import, directly or transitively:

```typescript
export * from './fixtures';
export { ConformanceAssertionError } from './assertions';
export type { ConformanceCase, ConformanceCheckResult, ConformanceHarness, ConformanceTraits } from './ConformanceHarness';
export { CONFORMANCE_CASES } from './conformanceCases';
export { RunConformanceChecks } from './RunConformanceChecks';
```

- [ ] **Step 9: Add the exports and the optional peer**

In `packages/WorkQueue/core/package.json`, replace the `exports` block and add `peerDependencies` / `peerDependenciesMeta` after `license`:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "default": "./dist/testing/index.js"
    },
    "./testing/vitest": {
      "types": "./dist/testing/vitest.d.ts",
      "default": "./dist/testing/vitest.js"
    }
  },
```

```json
  "peerDependencies": {
    "vitest": ">=3.2.0"
  },
  "peerDependenciesMeta": {
    "vitest": {
      "optional": true
    }
  },
```

Run: `pnpm install` (repository root)
Expected: succeeds; the lockfile records the optional peer.

- [ ] **Step 10: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 135 plus conformanceAssertions (3), RunConformanceChecks (3) and conformance (27): **168 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds; `dist/testing/index.js` and `dist/testing/vitest.js` exist.

Run: `grep -rl "from 'vitest'" packages/WorkQueue/core/dist`
Expected: exactly one file, `packages/WorkQueue/core/dist/testing/vitest.js`.

- [ ] **Step 11: Commit**

```bash
git add packages/WorkQueue/core/package.json packages/WorkQueue/core/src pnpm-lock.yaml
git commit -m "feat(work-queue-core): runner-agnostic transport conformance kit with a vitest wrapper"
```

---

### Task 9: REST contract mapping and `WorkQueueApiPublisher`

**Files:**
- Create: `packages/WorkQueue/core/src/api/restContract.ts`, `packages/WorkQueue/core/src/api/WorkQueueApiPublisher.ts`
- Modify: `packages/WorkQueue/core/src/index.ts`
- Test: `packages/WorkQueue/core/src/__tests__/restContract.test.ts`, `packages/WorkQueue/core/src/__tests__/WorkQueueApiPublisher.test.ts`

**Interfaces:**
- Consumes: `WorkJson`, `WorkPayloadRef`; `IWorkPublisher`, `PublishRequest`, `PublishResult`, `PublishStatus`, `PublishError`, `PublishErrorCodes`, `CreatePublishError`, `RejectedPublishResult` (Task 1).
- Produces:
  - `api/restContract.ts` — the JSON shapes of spec 03 §9, shared with the REST extension (plan 06) so client and server map identically:
    - `MAX_REST_PUBLISH_BATCH = 100`
    - `RestPayloadRefJson { uri; contentType?; sizeBytes?; checksum? }`, `RestPublishRequestJson { messageId?; partitionKey?; sequence?; attributes?; payload?; payloadRef?; correlationId?; deduplicationKey?; deduplicationTtlSeconds? }`, `RestPublishBodyJson { messages }`, `RestPublishErrorJson { code; message; retryable }`, `RestPublishResultJson { messageId; status: PublishStatus; error? }`, `RestPublishResponseJson { results }`
    - `ToRestPublishRequest(request: PublishRequest): RestPublishRequestJson`, `FromRestPublishRequest(json: RestPublishRequestJson): PublishRequest`, `ToRestPublishResult(result: PublishResult): RestPublishResultJson`
    - `type RestPublishBodyParseResult = { Kind: 'Parsed'; Requests: PublishRequest[] } | { Kind: 'Invalid'; Error: string }`, `ParseRestPublishBody(value: unknown): RestPublishBodyParseResult` (shape only; envelope rules stay in `ValidatePublishRequest`)
    - `ParseRestPublishResponse(value: unknown, expectedCount: number): PublishResult[] | null`
    - `IsWorkJson(value: unknown): value is WorkJson`
  - `api/WorkQueueApiPublisher.ts` — `interface WorkQueueApiPublisherOptions { BaseUrl; ApiKey; Fetch?; MaxRetries?; TimeoutMs?; RetryBaseDelayMs?; NewId?; Sleep? }`, `class WorkQueueApiPublisher implements IWorkPublisher`

Client rules:
- `MessageID`s are assigned **before** the first request, so every retry resends the same IDs.
- Requests are chunked to 100 and sent to `POST {BaseUrl}/topics/{encodeURIComponent(topic)}/messages` with `X-API-Key`.
- Network errors, timeouts (`TimeoutMs`, default 10 000), `429` and `5xx` are retried up to `MaxRetries` (default 3), sleeping `Retry-After` seconds when given, else `RetryBaseDelayMs × 2^attempt` (default base 200). After the last retry every item is `Rejected` with `TransportUnavailable` (retryable).
- `200`/`202` bodies are parsed per item; a malformed body rejects every item with retryable `InvalidResponse`. Status values are matched case-insensitively; the client and extension emit `Accepted` / `Duplicate` / `Rejected`.
- Other statuses reject every item with the body's `code` (fallbacks: `400 BadRequest`, `401 Unauthorized`, `403 Forbidden`, `404 TopicNotFound`, `413 PayloadTooLarge`, otherwise `Http<status>`), retryable per `IsRetryablePublishErrorCode`.
- `Publish` never throws for transport or per-item failures.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/core/src/__tests__/restContract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    FromRestPublishRequest,
    IsWorkJson,
    ParseRestPublishBody,
    ParseRestPublishResponse,
    ToRestPublishRequest,
    ToRestPublishResult,
} from '../api/restContract';
import type { PublishRequest } from '../publishing';

const FULL_REQUEST: PublishRequest = {
    MessageID: '6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60',
    PartitionKey: 'integration-42',
    Sequence: 3,
    Attributes: { source: 'hubspot' },
    PayloadRef: { Uri: 's3://bucket/batch-3.jsonl', ContentType: 'application/x-ndjson', SizeBytes: 2048, Checksum: 'sha256:abc' },
    CorrelationID: 'corr-7',
    DeduplicationKey: 'batch:3',
    DeduplicationTTLSeconds: 86400,
};

describe('REST request mapping', () => {
    it('round-trips a request and uses camelCase JSON names', () => {
        const json = ToRestPublishRequest(FULL_REQUEST);
        expect(json).toEqual({
            messageId: FULL_REQUEST.MessageID,
            partitionKey: 'integration-42',
            sequence: 3,
            attributes: { source: 'hubspot' },
            payloadRef: { uri: 's3://bucket/batch-3.jsonl', contentType: 'application/x-ndjson', sizeBytes: 2048, checksum: 'sha256:abc' },
            correlationId: 'corr-7',
            deduplicationKey: 'batch:3',
            deduplicationTtlSeconds: 86400,
        });
        expect(FromRestPublishRequest(json)).toEqual(FULL_REQUEST);
        expect(ToRestPublishRequest({})).toEqual({});
    });

    it('parses a valid body', () => {
        const parsed = ParseRestPublishBody({ messages: [{ attributes: { eventType: 'click' }, payload: { url: 'https://x', n: [1, null, true] } }, {}] });
        expect(parsed).toEqual({
            Kind: 'Parsed',
            Requests: [{ Attributes: { eventType: 'click' }, Payload: { url: 'https://x', n: [1, null, true] } }, {}],
        });
    });

    it('rejects malformed bodies with a reason', () => {
        const invalidBodies: unknown[] = [
            null,
            {},
            { messages: [] },
            { messages: Array.from({ length: 101 }, () => ({})) },
            { messages: ['text'] },
            { messages: [{ attributes: { a: 1 } }] },
            { messages: [{ sequence: '1' }] },
            { messages: [{ payloadRef: {} }] },
            { messages: [{ messageId: 7 }] },
        ];
        for (const body of invalidBodies) {
            expect(ParseRestPublishBody(body).Kind).toBe('Invalid');
        }
        expect(ParseRestPublishBody({ messages: [{}, { sequence: 'x' }] })).toEqual({ Kind: 'Invalid', Error: 'messages[1]: "sequence" must be a number' });
    });
});

describe('REST result mapping', () => {
    it('includes an error only when present', () => {
        expect(ToRestPublishResult({ MessageID: 'm1', Status: 'Accepted' })).toEqual({ messageId: 'm1', status: 'Accepted' });
        expect(ToRestPublishResult({ MessageID: 'm2', Status: 'Rejected', Error: { Code: 'InvalidAttributes', Message: 'bad', Retryable: false } }))
            .toEqual({ messageId: 'm2', status: 'Rejected', error: { code: 'InvalidAttributes', message: 'bad', retryable: false } });
    });

    it('parses responses and rejects count mismatches or malformed items', () => {
        expect(ParseRestPublishResponse({ results: [{ messageId: 'm1', status: 'accepted' }] }, 1)).toEqual([{ MessageID: 'm1', Status: 'Accepted' }]);
        expect(ParseRestPublishResponse({ results: [] }, 1)).toBeNull();
        expect(ParseRestPublishResponse({ results: [{ messageId: 'm1', status: 'maybe' }] }, 1)).toBeNull();
        expect(ParseRestPublishResponse({ results: [{ status: 'Accepted' }] }, 1)).toBeNull();
        expect(ParseRestPublishResponse('nope', 1)).toBeNull();
    });

    it('recognises JSON values', () => {
        expect(IsWorkJson({ a: [1, 'b', null, { c: false }] })).toBe(true);
        expect(IsWorkJson(Number.NaN)).toBe(false);
        expect(IsWorkJson(undefined)).toBe(false);
    });
});
```

`packages/WorkQueue/core/src/__tests__/WorkQueueApiPublisher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueApiPublisher } from '../api/WorkQueueApiPublisher';
import { ParseRestPublishBody } from '../api/restContract';

interface FetchCall {
    Url: string;
    Init: RequestInit | undefined;
}

type Scripted = Response | Error | ((init: RequestInit | undefined) => Promise<Response>);

function fakeFetch(script: Scripted[]): { Fetch: typeof fetch; Calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    const queue = [...script];
    const impl: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        calls.push({ Url: url, Init: init });
        const next = queue.shift();
        if (next === undefined) {
            throw new Error('No scripted response left');
        }
        if (next instanceof Error) {
            throw next;
        }
        return typeof next === 'function' ? next(init) : next;
    };
    return { Fetch: impl, Calls: calls };
}

function json(status: number, body: object, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function messageIDsOf(init: RequestInit | undefined): string[] {
    const parsed = ParseRestPublishBody(JSON.parse(String(init?.body)));
    return parsed.Kind === 'Parsed' ? parsed.Requests.map((request) => request.MessageID ?? '') : [];
}

function echo(status: string): (init: RequestInit | undefined) => Promise<Response> {
    return async (init) => json(202, { results: messageIDsOf(init).map((messageId) => ({ messageId, status })) });
}

function sequentialIds(): () => string {
    let next = 0;
    return () => {
        next += 1;
        return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
    };
}

const UUID = '6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60';

describe('WorkQueueApiPublisher', () => {
    it('posts camelCase messages with the API key to the encoded topic URL', async () => {
        const { Fetch, Calls } = fakeFetch([echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj.example.com/work-queue/', ApiKey: 'mj_sk_test', Fetch, NewId: () => UUID });
        const results = await publisher.Publish('email events/v2', [
            { PartitionKey: 'sub-1', Attributes: { eventType: 'click' }, Payload: { url: 'https://x' }, DeduplicationKey: 'sg:1', DeduplicationTTLSeconds: 3600 },
        ]);
        expect(Calls[0].Url).toBe('https://mj.example.com/work-queue/topics/email%20events%2Fv2/messages');
        expect(Calls[0].Init?.method).toBe('POST');
        expect(new Headers(Calls[0].Init?.headers).get('X-API-Key')).toBe('mj_sk_test');
        const body: unknown = JSON.parse(String(Calls[0].Init?.body));
        expect(body).toEqual({
            messages: [{ messageId: UUID, partitionKey: 'sub-1', attributes: { eventType: 'click' }, payload: { url: 'https://x' }, deduplicationKey: 'sg:1', deduplicationTtlSeconds: 3600 }],
        });
        expect(results).toEqual([{ MessageID: UUID, Status: 'Accepted' }]);
    });

    it('keeps caller-supplied MessageIDs', async () => {
        const { Fetch, Calls } = fakeFetch([echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => 'should-not-be-used' });
        await publisher.Publish('t', [{ MessageID: UUID }]);
        expect(messageIDsOf(Calls[0].Init)).toEqual([UUID]);
    });

    it('reuses MessageIDs when retrying after a 503', async () => {
        const sleeps: number[] = [];
        const { Fetch, Calls } = fakeFetch([json(503, {}), echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({
            BaseUrl: 'https://mj',
            ApiKey: 'k',
            Fetch,
            NewId: sequentialIds(),
            Sleep: async (ms) => {
                sleeps.push(ms);
            },
        });
        const results = await publisher.Publish('t', [{}, {}]);
        expect(Calls).toHaveLength(2);
        expect(messageIDsOf(Calls[1].Init)).toEqual(messageIDsOf(Calls[0].Init));
        expect(sleeps).toEqual([200]);
        expect(results.map((result) => result.Status)).toEqual(['Accepted', 'Accepted']);
    });

    it('chunks large batches into requests of 100', async () => {
        const { Fetch, Calls } = fakeFetch([echo('Accepted'), echo('Accepted'), echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: sequentialIds() });
        const results = await publisher.Publish('t', Array.from({ length: 250 }, () => ({})));
        expect(Calls.map((call) => messageIDsOf(call.Init).length)).toEqual([100, 100, 50]);
        expect(results).toHaveLength(250);
        expect(new Set(results.map((result) => result.MessageID)).size).toBe(250);
    });

    it('honours Retry-After on 429', async () => {
        const sleeps: number[] = [];
        const { Fetch } = fakeFetch([json(429, {}, { 'Retry-After': '3' }), echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID, Sleep: async (ms) => { sleeps.push(ms); } });
        await publisher.Publish('t', [{}]);
        expect(sleeps).toEqual([3000]);
    });

    it('reports TransportUnavailable after exhausting retries on network errors', async () => {
        const sleeps: number[] = [];
        const { Fetch, Calls } = fakeFetch([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, MaxRetries: 2, NewId: () => UUID, Sleep: async (ms) => { sleeps.push(ms); } });
        const [result] = await publisher.Publish('t', [{}]);
        expect(Calls).toHaveLength(3);
        expect(sleeps).toEqual([200, 400]);
        expect(result).toEqual({ MessageID: UUID, Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'ECONNRESET', Retryable: true } });
    });

    it('maps 400 to non-retryable rejections using the body code, without retrying', async () => {
        const { Fetch, Calls } = fakeFetch([json(400, { code: 'InvalidAttributes', message: 'bad key' })]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        const [result] = await publisher.Publish('t', [{}]);
        expect(Calls).toHaveLength(1);
        expect(result).toEqual({ MessageID: UUID, Status: 'Rejected', Error: { Code: 'InvalidAttributes', Message: 'bad key', Retryable: false } });
    });

    it('maps 403 and 404 with sensible default codes', async () => {
        const { Fetch } = fakeFetch([json(403, { code: 'TopicNotExternallyPublishable', message: 'internal topic' }), new Response('', { status: 404 })]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        const [forbidden] = await publisher.Publish('t', [{}]);
        const [missing] = await publisher.Publish('t', [{}]);
        expect(forbidden.Error?.Code).toBe('TopicNotExternallyPublishable');
        expect(missing.Error).toEqual({ Code: 'TopicNotFound', Message: 'HTTP 404', Retryable: false });
    });

    it('rejects a malformed success body as a retryable InvalidResponse', async () => {
        const { Fetch } = fakeFetch([json(202, { results: [] })]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        const [result] = await publisher.Publish('t', [{}]);
        expect(result.Error).toMatchObject({ Code: 'InvalidResponse', Retryable: true });
    });

    it('parses status values case-insensitively', async () => {
        const { Fetch } = fakeFetch([echo('duplicate')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        expect(await publisher.Publish('t', [{}])).toEqual([{ MessageID: UUID, Status: 'Duplicate' }]);
    });

    it('treats a timeout as a retryable transport failure', async () => {
        const hang = (init: RequestInit | undefined): Promise<Response> =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        const { Fetch } = fakeFetch([hang]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, TimeoutMs: 20, MaxRetries: 0, NewId: () => UUID });
        const [result] = await publisher.Publish('t', [{}]);
        expect(result.Error).toMatchObject({ Code: 'TransportUnavailable', Retryable: true });
        expect(result.Error?.Message).toContain('Timed out after 20 ms');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/core && pnpm test restContract WorkQueueApiPublisher`
Expected: FAIL — unresolved imports `../api/restContract`, `../api/WorkQueueApiPublisher`.

- [ ] **Step 3: Write `src/api/restContract.ts`**

```typescript
import type { WorkJson, WorkPayloadRef } from '../envelope';
import type { PublishError, PublishRequest, PublishResult, PublishStatus } from '../publishing';
import { CreatePublishError } from '../publishing';

export const MAX_REST_PUBLISH_BATCH = 100;

export interface RestPayloadRefJson {
    uri: string;
    contentType?: string;
    sizeBytes?: number;
    checksum?: string;
}

export interface RestPublishRequestJson {
    messageId?: string;
    partitionKey?: string;
    sequence?: number;
    attributes?: Record<string, string>;
    payload?: WorkJson;
    payloadRef?: RestPayloadRefJson;
    correlationId?: string;
    deduplicationKey?: string;
    deduplicationTtlSeconds?: number;
}

export interface RestPublishBodyJson {
    messages: RestPublishRequestJson[];
}

export interface RestPublishErrorJson {
    code: string;
    message: string;
    retryable: boolean;
}

export interface RestPublishResultJson {
    messageId: string;
    status: PublishStatus;
    error?: RestPublishErrorJson;
}

export interface RestPublishResponseJson {
    results: RestPublishResultJson[];
}

export type RestPublishBodyParseResult = { Kind: 'Parsed'; Requests: PublishRequest[] } | { Kind: 'Invalid'; Error: string };

type Field<T> = { Valid: true; Value: T | undefined } | { Valid: false };

const STATUS_BY_LOWER_NAME: ReadonlyMap<string, PublishStatus> = new Map<string, PublishStatus>([
    ['accepted', 'Accepted'],
    ['duplicate', 'Duplicate'],
    ['rejected', 'Rejected'],
]);

export function ToRestPublishRequest(request: PublishRequest): RestPublishRequestJson {
    return {
        ...(request.MessageID !== undefined ? { messageId: request.MessageID } : {}),
        ...(request.PartitionKey !== undefined ? { partitionKey: request.PartitionKey } : {}),
        ...(request.Sequence !== undefined ? { sequence: request.Sequence } : {}),
        ...(request.Attributes !== undefined ? { attributes: { ...request.Attributes } } : {}),
        ...(request.Payload !== undefined ? { payload: request.Payload } : {}),
        ...(request.PayloadRef !== undefined ? { payloadRef: toRestPayloadRef(request.PayloadRef) } : {}),
        ...(request.CorrelationID !== undefined ? { correlationId: request.CorrelationID } : {}),
        ...(request.DeduplicationKey !== undefined ? { deduplicationKey: request.DeduplicationKey } : {}),
        ...(request.DeduplicationTTLSeconds !== undefined ? { deduplicationTtlSeconds: request.DeduplicationTTLSeconds } : {}),
    };
}

export function FromRestPublishRequest(json: RestPublishRequestJson): PublishRequest {
    return {
        ...(json.messageId !== undefined ? { MessageID: json.messageId } : {}),
        ...(json.partitionKey !== undefined ? { PartitionKey: json.partitionKey } : {}),
        ...(json.sequence !== undefined ? { Sequence: json.sequence } : {}),
        ...(json.attributes !== undefined ? { Attributes: { ...json.attributes } } : {}),
        ...(json.payload !== undefined ? { Payload: json.payload } : {}),
        ...(json.payloadRef !== undefined ? { PayloadRef: fromRestPayloadRef(json.payloadRef) } : {}),
        ...(json.correlationId !== undefined ? { CorrelationID: json.correlationId } : {}),
        ...(json.deduplicationKey !== undefined ? { DeduplicationKey: json.deduplicationKey } : {}),
        ...(json.deduplicationTtlSeconds !== undefined ? { DeduplicationTTLSeconds: json.deduplicationTtlSeconds } : {}),
    };
}

export function ToRestPublishResult(result: PublishResult): RestPublishResultJson {
    return {
        messageId: result.MessageID,
        status: result.Status,
        ...(result.Error !== undefined
            ? { error: { code: result.Error.Code, message: result.Error.Message, retryable: result.Error.Retryable } }
            : {}),
    };
}

/** Checks the body's shape and maps it to PublishRequests. Envelope rules are ValidatePublishRequest's job. */
export function ParseRestPublishBody(value: unknown): RestPublishBodyParseResult {
    if (!isRecord(value) || !Array.isArray(value['messages'])) {
        return { Kind: 'Invalid', Error: 'Body must be an object with a "messages" array' };
    }
    const messages: unknown[] = value['messages'];
    if (messages.length === 0 || messages.length > MAX_REST_PUBLISH_BATCH) {
        return { Kind: 'Invalid', Error: `"messages" must contain 1-${MAX_REST_PUBLISH_BATCH} items` };
    }
    const requests: PublishRequest[] = [];
    for (let index = 0; index < messages.length; index += 1) {
        const parsed = parseRequestJson(messages[index]);
        if (typeof parsed === 'string') {
            return { Kind: 'Invalid', Error: `messages[${index}]: ${parsed}` };
        }
        requests.push(FromRestPublishRequest(parsed));
    }
    return { Kind: 'Parsed', Requests: requests };
}

export function ParseRestPublishResponse(value: unknown, expectedCount: number): PublishResult[] | null {
    if (!isRecord(value) || !Array.isArray(value['results'])) {
        return null;
    }
    const items: unknown[] = value['results'];
    if (items.length !== expectedCount) {
        return null;
    }
    const results: PublishResult[] = [];
    for (const item of items) {
        const result = parseResult(item);
        if (result === null) {
            return null;
        }
        results.push(result);
    }
    return results;
}

export function IsWorkJson(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every((item) => IsWorkJson(item));
    }
    return isRecord(value) && Object.values(value).every((item) => IsWorkJson(item));
}

function parseRequestJson(value: unknown): RestPublishRequestJson | string {
    if (!isRecord(value)) {
        return 'must be an object';
    }
    const scalar = parseScalarFields(value);
    if (typeof scalar === 'string') {
        return scalar;
    }
    const attributes = attributesField(value);
    if (!attributes.Valid) {
        return '"attributes" must be an object of string values';
    }
    const rawPayload = value['payload'];
    let payload: WorkJson | undefined;
    if (rawPayload !== undefined) {
        if (!IsWorkJson(rawPayload)) {
            return '"payload" must be JSON';
        }
        payload = rawPayload;
    }
    const payloadRef = payloadRefField(value);
    if (!payloadRef.Valid) {
        return '"payloadRef" must be an object with a string "uri"';
    }
    return {
        ...scalar,
        ...(attributes.Value !== undefined ? { attributes: attributes.Value } : {}),
        ...(payload !== undefined ? { payload } : {}),
        ...(payloadRef.Value !== undefined ? { payloadRef: payloadRef.Value } : {}),
    };
}

function parseScalarFields(value: Record<string, unknown>): RestPublishRequestJson | string {
    const strings = ['messageId', 'partitionKey', 'correlationId', 'deduplicationKey'] as const;
    const numbers = ['sequence', 'deduplicationTtlSeconds'] as const;
    const result: RestPublishRequestJson = {};
    for (const name of strings) {
        const field = typedField(value, name, 'string');
        if (!field.Valid) {
            return `"${name}" must be a string`;
        }
        if (typeof field.Value === 'string') {
            result[name] = field.Value;
        }
    }
    for (const name of numbers) {
        const field = typedField(value, name, 'number');
        if (!field.Valid) {
            return `"${name}" must be a number`;
        }
        if (typeof field.Value === 'number') {
            result[name] = field.Value;
        }
    }
    return result;
}

function typedField(source: Record<string, unknown>, name: string, type: 'string' | 'number'): Field<string | number> {
    const value = source[name];
    if (value === undefined) {
        return { Valid: true, Value: undefined };
    }
    if (type === 'string' && typeof value === 'string') {
        return { Valid: true, Value: value };
    }
    if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
        return { Valid: true, Value: value };
    }
    return { Valid: false };
}

function attributesField(source: Record<string, unknown>): Field<Record<string, string>> {
    const value = source['attributes'];
    if (value === undefined) {
        return { Valid: true, Value: undefined };
    }
    if (!isRecord(value)) {
        return { Valid: false };
    }
    const attributes: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string') {
            return { Valid: false };
        }
        attributes[key] = item;
    }
    return { Valid: true, Value: attributes };
}

function payloadRefField(source: Record<string, unknown>): Field<RestPayloadRefJson> {
    const value = source['payloadRef'];
    if (value === undefined) {
        return { Valid: true, Value: undefined };
    }
    if (!isRecord(value) || typeof value['uri'] !== 'string') {
        return { Valid: false };
    }
    const contentType = value['contentType'];
    const sizeBytes = value['sizeBytes'];
    const checksum = value['checksum'];
    const optionalOk =
        (contentType === undefined || typeof contentType === 'string') &&
        (sizeBytes === undefined || typeof sizeBytes === 'number') &&
        (checksum === undefined || typeof checksum === 'string');
    if (!optionalOk) {
        return { Valid: false };
    }
    return {
        Valid: true,
        Value: {
            uri: String(value['uri']),
            ...(typeof contentType === 'string' ? { contentType } : {}),
            ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
            ...(typeof checksum === 'string' ? { checksum } : {}),
        },
    };
}

function parseResult(value: unknown): PublishResult | null {
    if (!isRecord(value)) {
        return null;
    }
    const messageId = value['messageId'];
    const statusText = value['status'];
    const status = typeof statusText === 'string' ? STATUS_BY_LOWER_NAME.get(statusText.toLowerCase()) : undefined;
    if (typeof messageId !== 'string' || status === undefined) {
        return null;
    }
    const error = parseError(value['error']);
    return { MessageID: messageId, Status: status, ...(error !== undefined ? { Error: error } : {}) };
}

function parseError(value: unknown): PublishError | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const code = value['code'];
    const message = value['message'];
    const retryable = value['retryable'];
    if (typeof code !== 'string') {
        return undefined;
    }
    const error = CreatePublishError(code, typeof message === 'string' ? message : code);
    return typeof retryable === 'boolean' ? { ...error, Retryable: retryable } : error;
}

function toRestPayloadRef(ref: WorkPayloadRef): RestPayloadRefJson {
    return {
        uri: ref.Uri,
        ...(ref.ContentType !== undefined ? { contentType: ref.ContentType } : {}),
        ...(ref.SizeBytes !== undefined ? { sizeBytes: ref.SizeBytes } : {}),
        ...(ref.Checksum !== undefined ? { checksum: ref.Checksum } : {}),
    };
}

function fromRestPayloadRef(ref: RestPayloadRefJson): WorkPayloadRef {
    return {
        Uri: ref.uri,
        ...(ref.contentType !== undefined ? { ContentType: ref.contentType } : {}),
        ...(ref.sizeBytes !== undefined ? { SizeBytes: ref.sizeBytes } : {}),
        ...(ref.checksum !== undefined ? { Checksum: ref.checksum } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Write `src/api/WorkQueueApiPublisher.ts`**

```typescript
import type { WorkJson } from '../envelope';
import type { IWorkPublisher, PublishRequest, PublishResult } from '../publishing';
import { PublishErrorCodes, RejectedPublishResult } from '../publishing';
import { MAX_REST_PUBLISH_BATCH, ParseRestPublishResponse, ToRestPublishRequest } from './restContract';

export interface WorkQueueApiPublisherOptions {
    /** Root of the work-queue REST extension, e.g. https://api.example.com/work-queue */
    BaseUrl: string;
    /** MJ API key with workqueue:publish for the target topics. */
    ApiKey: string;
    Fetch?: typeof fetch;
    /** Retries after the first attempt. Default 3. */
    MaxRetries?: number;
    /** Per-request timeout. Default 10000. */
    TimeoutMs?: number;
    /** Base for exponential retry delay. Default 200. */
    RetryBaseDelayMs?: number;
    NewId?: () => string;
    Sleep?: (ms: number) => Promise<void>;
}

type SendOutcome =
    | { Kind: 'Response'; Status: number; Body: unknown; RetryAfterSeconds: number | null }
    | { Kind: 'NetworkError'; Error: string };

type IdentifiedRequest<TPayload extends WorkJson> = PublishRequest<TPayload> & { MessageID: string };

const FALLBACK_CODES: ReadonlyMap<number, string> = new Map<number, string>([
    [400, PublishErrorCodes.BadRequest],
    [401, PublishErrorCodes.Unauthorized],
    [403, PublishErrorCodes.Forbidden],
    [404, PublishErrorCodes.TopicNotFound],
    [413, PublishErrorCodes.PayloadTooLarge],
]);

/** IWorkPublisher for producers outside MJ: calls the MJ work-queue REST publish endpoint (spec 03 §9). */
export class WorkQueueApiPublisher implements IWorkPublisher {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly maxRetries: number;
    private readonly timeoutMs: number;
    private readonly retryBaseDelayMs: number;
    private readonly newId: () => string;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(private readonly options: WorkQueueApiPublisherOptions) {
        this.baseUrl = options.BaseUrl.replace(/\/+$/, '');
        this.fetchImpl = options.Fetch ?? ((input, init) => fetch(input, init));
        this.maxRetries = options.MaxRetries ?? 3;
        this.timeoutMs = options.TimeoutMs ?? 10_000;
        this.retryBaseDelayMs = options.RetryBaseDelayMs ?? 200;
        this.newId = options.NewId ?? (() => crypto.randomUUID());
        this.sleep = options.Sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    }

    public async Publish<TPayload extends WorkJson>(topic: string, requests: PublishRequest<TPayload>[]): Promise<PublishResult[]> {
        const identified = requests.map((request): IdentifiedRequest<TPayload> => ({ ...request, MessageID: request.MessageID ?? this.newId() }));
        const results: PublishResult[] = [];
        for (let start = 0; start < identified.length; start += MAX_REST_PUBLISH_BATCH) {
            results.push(...(await this.publishChunk(topic, identified.slice(start, start + MAX_REST_PUBLISH_BATCH))));
        }
        return results;
    }

    private async publishChunk<TPayload extends WorkJson>(topic: string, chunk: IdentifiedRequest<TPayload>[]): Promise<PublishResult[]> {
        const url = `${this.baseUrl}/topics/${encodeURIComponent(topic)}/messages`;
        const body = JSON.stringify({ messages: chunk.map((request) => ToRestPublishRequest(request)) });
        for (let attempt = 0; ; attempt += 1) {
            const outcome = await this.send(url, body);
            if (outcome.Kind === 'Response' && !isRetryableStatus(outcome.Status)) {
                return mapResponse(outcome.Status, outcome.Body, chunk);
            }
            if (attempt >= this.maxRetries) {
                const reason = outcome.Kind === 'Response' ? `HTTP ${outcome.Status}` : outcome.Error;
                return chunk.map((request) => RejectedPublishResult(request.MessageID, PublishErrorCodes.TransportUnavailable, reason));
            }
            await this.sleep(this.retryDelayMs(attempt, outcome));
        }
    }

    private async send(url: string, body: string): Promise<SendOutcome> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': this.options.ApiKey },
                body,
                signal: controller.signal,
            });
            const text = await response.text();
            return { Kind: 'Response', Status: response.status, Body: parseJson(text), RetryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')) };
        } catch (error) {
            const message = controller.signal.aborted ? `Timed out after ${this.timeoutMs} ms` : error instanceof Error ? error.message : String(error);
            return { Kind: 'NetworkError', Error: message };
        } finally {
            clearTimeout(timer);
        }
    }

    private retryDelayMs(attempt: number, outcome: SendOutcome): number {
        if (outcome.Kind === 'Response' && outcome.RetryAfterSeconds !== null) {
            return outcome.RetryAfterSeconds * 1000;
        }
        return this.retryBaseDelayMs * Math.pow(2, attempt);
    }
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

function mapResponse(status: number, body: unknown, chunk: { MessageID: string }[]): PublishResult[] {
    if (status === 200 || status === 202) {
        const parsed = ParseRestPublishResponse(body, chunk.length);
        if (parsed !== null) {
            return parsed;
        }
        return chunk.map((request) => RejectedPublishResult(request.MessageID, PublishErrorCodes.InvalidResponse, `Unexpected response body for HTTP ${status}`));
    }
    const { Code, Message } = readErrorBody(status, body);
    return chunk.map((request) => RejectedPublishResult(request.MessageID, Code, Message));
}

function readErrorBody(status: number, body: unknown): { Code: string; Message: string } {
    const fallback = FALLBACK_CODES.get(status) ?? `Http${status}`;
    if (typeof body !== 'object' || body === null) {
        return { Code: fallback, Message: `HTTP ${status}` };
    }
    const code: unknown = Reflect.get(body, 'code');
    const message: unknown = Reflect.get(body, 'message');
    return {
        Code: typeof code === 'string' ? code : fallback,
        Message: typeof message === 'string' ? message : `HTTP ${status}`,
    };
}

function parseJson(text: string): unknown {
    if (text.trim() === '') {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch {
        return null;
    }
}

function parseRetryAfter(header: string | null): number | null {
    if (header === null) {
        return null;
    }
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
```

- [ ] **Step 5: Export the modules**

Append to `packages/WorkQueue/core/src/index.ts`:

```typescript
export * from './api/restContract';
export * from './api/WorkQueueApiPublisher';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — previous 168 plus restContract (6) and WorkQueueApiPublisher (11): **185 tests**.

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/core/src
git commit -m "feat(work-queue-core): REST publish contract mapping and API publisher client"
```

---

### Task 10: Exports, README, changeset and full verification

**Files:**
- Modify: `packages/WorkQueue/core/src/index.ts` (final form below)
- Create: `packages/WorkQueue/core/README.md`, `.changeset/work-queue-core-package.md`
- Test: `packages/WorkQueue/core/src/__tests__/publicApi.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 1–9.
- Produces: the published surface of `@memberjunction/work-queue-core` and `@memberjunction/work-queue-core/testing` that plans 05–08 import.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/core/src/__tests__/publicApi.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as Core from '../index';
import * as Testing from '../testing';
import * as TestingVitest from '../testing/vitest';

describe('public API', () => {
    it('exposes the runtime, validation, transports and client from the main entry', () => {
        const names = [
            'ValidatePublishRequest',
            'BuildWorkMessage',
            'SerializedEnvelopeBytes',
            'ParseSubscriptionFilter',
            'ValidateSubscriptionFilter',
            'MatchesFilter',
            'FilterFields',
            'WORK_QUEUE_FILTER_SUPPORT',
            'ComputeBackoffSeconds',
            'SubscriptionUnsupportedReason',
            'ConsumerRuntime',
            'DeliveryExecution',
            'InMemoryTransport',
            'WorkQueueApiPublisher',
            'ParseRestPublishBody',
            'Outcome',
            'FatalWorkError',
            'TransientWorkError',
            'WorkQueueConfigurationError',
            'PublishErrorCodes',
        ];
        for (const name of names) {
            expect(Object.prototype.hasOwnProperty.call(Core, name), name).toBe(true);
        }
    });

    it('keeps the conformance kit out of the main entry', () => {
        expect(Object.prototype.hasOwnProperty.call(Core, 'RunConformanceChecks')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(Core, 'RunTransportConformanceSuite')).toBe(false);
    });

    it('exposes the runner-agnostic kit from ./testing without the vitest wrapper', () => {
        for (const name of ['RunConformanceChecks', 'CONFORMANCE_CASES', 'ConformanceAssertionError', 'BuildSubscriptionBinding', 'ManualClock']) {
            expect(Object.prototype.hasOwnProperty.call(Testing, name), name).toBe(true);
        }
        expect(Object.prototype.hasOwnProperty.call(Testing, 'RunTransportConformanceSuite')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(TestingVitest, 'RunTransportConformanceSuite')).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test**

Run: `cd packages/WorkQueue/core && pnpm test publicApi`
Expected: PASS if Tasks 1–9 exported everything; FAIL naming the missing export otherwise. Fix `index.ts` until it passes.

- [ ] **Step 3: Replace `src/index.ts` with its final, ordered form**

```typescript
// Contracts (spec 03 §1–§5, §10)
export * from './envelope';
export * from './publishing';
export * from './policy';
export * from './filterTypes';
export * from './handler';
export * from './errors';
export * from './transport';
export * from './operator';
export * from './manifest';

// Shared rules
export * from './validation';
export * from './filter';
export * from './backoff';
export * from './compatibility';

// Consumer runtime
export * from './runtime/types';
export * from './runtime/outcomes';
export * from './runtime/DeliveryExecution';
export * from './runtime/ConsumerRuntime';

// Reference transport (the conformance kit lives in ./testing)
export { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from './memory/InMemoryTransport';
export type { InMemoryTransportOptions } from './memory/InMemoryTransport';
export type { InMemoryDeliverySnapshot } from './memory/InMemoryStore';
export { LEASE_EXPIRED_REASON, SEQUENCE_ALREADY_RESOLVED_NOTE } from './memory/InMemoryStore';

// REST publish client
export * from './api/restContract';
export * from './api/WorkQueueApiPublisher';
```

- [ ] **Step 4: Write `packages/WorkQueue/core/README.md`**

````markdown
# @memberjunction/work-queue-core

Transport-neutral contracts and runtime for the MemberJunction durable work queue. **No MemberJunction
runtime dependencies** — Lambda and other external consumers import only this package (plus a transport
package such as `@memberjunction/work-queue-aws`).

Design and contract: `plans/work-queue-1/02-implementation-overview.md` and `03-interfaces-and-tables.md`.

## What is in the box

| Area | Exports |
| --- | --- |
| Envelope & publishing | `WorkMessage`, `PublishRequest`, `PublishResult`, `IWorkPublisher`, `ValidatePublishRequest`, `BuildWorkMessage`, `PublishErrorCodes` |
| Handlers | `WorkHandler`, `WorkContext`, `Outcome`, `FatalWorkError`, `TransientWorkError` |
| Policy & rules | `SubscriptionPolicy`, `ParseSubscriptionFilter`, `ValidateSubscriptionFilter`, `MatchesFilter`, `FilterFields`, `WORK_QUEUE_FILTER_SUPPORT`, `ComputeBackoffSeconds`, `SubscriptionUnsupportedReason`, `FilterUnsupportedReason` |
| Transports | `ITransportDriver`, `ITransportConsumer`, `ITransportOperator`, `TransportCapabilities` |
| Runtime | `ConsumerRuntime` (loop or `ProcessBatch`), `DeliveryExecution` |
| Reference transport | `InMemoryTransport` (Database-transport semantics, in memory) |
| REST client | `WorkQueueApiPublisher`, REST mapping helpers |
| Testing (`/testing`) | `RunConformanceChecks`, `CONFORMANCE_CASES`, `ConformanceAssertionError`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `ManualClock` |
| Testing with vitest (`/testing/vitest`) | `RunTransportConformanceSuite` |

## Writing a handler

```typescript
import { FatalWorkError, Outcome, type WorkContext, type WorkHandler, type WorkMessage } from '@memberjunction/work-queue-core';

interface UnsubscribePayload { email: string; occurredAt: string }

export class UnsubscribeHandler implements WorkHandler<UnsubscribePayload> {
    public async Handle(message: WorkMessage<UnsubscribePayload>, context: WorkContext) {
        if (!message.Payload?.email) {
            throw new FatalWorkError('email missing');           // dead-letter immediately
        }
        await suppress(message.Payload.email, message.MessageID); // idempotent by MessageID
        return Outcome.Complete();                                 // throw anything else → retry with backoff
    }
}
```

### Handler rules

The queue guarantees durable delivery, one valid lease holder while your handler runs, and fencing. Everything
else is yours — see `plans/work-queue-1/10-consumer-guide.md`. Four rules cover most handlers:

1. **Long awaits need no heartbeat code.** Keep `HeartbeatMode: 'Auto'` (the default) and set
   `MaxProcessingSeconds` to the longest a healthy run should take: the runtime renews the lease while your
   handler awaits, and aborts once the cap passes. Use `'Manual'` only when you want a *stuck* handler detected,
   then call `await context.Heartbeat({ Percent })` at real progress boundaries.
2. **Honor `context.Signal`.** It aborts when the lease is lost, an operator cancels the item, or the host shuts
   down. Stop whatever external work you started — a child process, a remote job, a long query.
3. **Never block the event loop.** A long synchronous CPU-bound loop stops the heartbeat timer with it and the
   lease expires under you; move that work to a worker thread or child process.
4. **Non-restartable side effects need your own guard.** At-least-once delivery means a handler can run twice.
   Make handlers idempotent (`message.MessageID` is stable across redeliveries and replays), and for work that
   must not overlap — an infrastructure apply, a financial posting — set a `LeaseSeconds` larger than your worst
   heartbeat outage *and* hold a domain lock of your own.

`context.Heartbeat` resolves `false` once the lease is gone (taken over, or revoked by an operator cancel); a
transient transport error does not — it is retried on the next tick while the lease is still valid.

## Subscription filters

A filter is MJ's standard `CompositeFilterDescriptor` JSON over **envelope attributes** — the shape
`mj-filter-builder` edits and user views persist — restricted to what every transport can express:

```jsonc
{ "logic": "and", "filters": [
  { "field": "eventType", "operator": "eq", "value": "click" },
  { "logic": "or", "filters": [
      { "field": "tenant", "operator": "eq", "value": "acme" },
      { "field": "tenant", "operator": "eq", "value": "globex" } ] }
] }
```

Operators: `eq`, `neq`, `startswith`, `isnull`, `isnotnull`. The root is `and`; a nested group may only be a
single-field OR of `eq`; and each field may be constrained only once (brokers read a field's values as OR, so two
AND-ed rules on one field would widen the filter rather than narrow it). Matching is **case-sensitive** (brokers match exactly, so MJ and the broker agree),
which is the one deliberate divergence from `CompositeFilter`'s case-insensitive comparison. Richer filters are
rejected by `ValidateSubscriptionFilter` / `SubscriptionUnsupportedReason` when a subscription is saved, rather
than silently delivering everything.

## Publishing from outside MJ

```typescript
import { WorkQueueApiPublisher } from '@memberjunction/work-queue-core';

const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://api.example.com/work-queue', ApiKey: process.env.MJ_API_KEY ?? '' });
const results = await publisher.Publish('email.events', [
    { PartitionKey: 'alice@example.com', Attributes: { eventType: 'unsubscribe' }, Payload: { email: 'alice@example.com', occurredAt: '2026-09-16T12:00:00Z' }, DeduplicationKey: 'sg:evt-123' },
]);
// Every result is Accepted, Duplicate or Rejected; retry Rejected items whose Error.Retryable is true.
```

## Testing a transport driver

```typescript
import { BuildTopicBinding, BuildSubscriptionBinding } from '@memberjunction/work-queue-core/testing';
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';

RunTransportConformanceSuite('MyTransport', {
    Capabilities: MY_CAPABILITIES,
    Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 },
    CreateDriver: async () => new MyTransport(),
    CreateTopic: async (_driver, name, overrides) => BuildTopicBinding(name, overrides),
    CreateSubscription: async (_driver, topic, name, overrides) => BuildSubscriptionBinding(topic, name, overrides),
    AdvanceTime: async (ms) => clock.Advance(ms),
});
```

Outside vitest (for example an integration runner against a live database), call
`await RunConformanceChecks(harness)` from `/testing`: it runs the same 27 cases sequentially, never throws, and
returns `{ Id, Title, Status: 'Passed' | 'Failed' | 'Skipped', Detail, DurationMs }` per case.

`vitest` is an optional peer dependency used only by `/testing/vitest`.

## Rules for contributors

- No `@memberjunction/*` dependency or import, and no runtime `dependencies` — enforced by `src/__tests__/dependencyGuard.test.ts`.
- `cd packages/WorkQueue/core && pnpm test` and `pnpm run build`.
````

- [ ] **Step 5: Write the changeset**

`.changeset/work-queue-core-package.md`:

```markdown
---
"@memberjunction/work-queue-core": patch
---

Add `@memberjunction/work-queue-core`: transport-neutral durable work-queue contracts, publish validation, attribute filters, jittered backoff, a leased consumer runtime, an in-memory reference transport, a transport conformance kit (`/testing`) and a REST publisher client — with no MemberJunction runtime dependencies so external consumers such as Lambda functions stay lightweight.
```

- [ ] **Step 6: Full verification**

Run: `cd packages/WorkQueue/core && pnpm test`
Expected: PASS — **188 tests** (dependencyGuard 3, errors 6, publishing 2, validation 25, filter 23, backoff 8, compatibility 9, outcomes 11, DeliveryExecution 20, ConsumerRuntime 14, InMemoryTransport 14, conformanceAssertions 3, RunConformanceChecks 3, conformance 27, restContract 6, WorkQueueApiPublisher 11, publicApi 3).

Run: `cd packages/WorkQueue/core && pnpm run build`
Expected: builds; `dist/index.js`, `dist/testing/index.js` and `dist/testing/vitest.js` exist.

Run (repository root): `node .github/scripts/check-esm-imports.mjs packages --changed-since origin/next`
Expected: `@memberjunction/work-queue-core` imports cleanly under native ESM (no `ERR_MODULE_NOT_FOUND`).

Run (repository root): `node .github/scripts/check-internal-peer-deps.mjs packages`
Expected: passes (the only peer is the external, optional `vitest`).

Run (repository root): `pnpm run check:changeset`
Expected: passes with the `patch` changeset (no database or metadata change in this plan).

- [ ] **Step 7: Commit and push**

```bash
git add packages/WorkQueue/core .changeset/work-queue-core-package.md
git commit -m "docs(work-queue-core): package README, public API guard and changeset"
git branch -vv   # confirm [origin/feat/work-queue] before pushing
git push
```

---

## Self-review checklist (run before handing off)

| Spec item | Task |
| --- | --- |
| 03 §0 zero MJ dependencies | 1 (guard test), 10 |
| 03 §1 envelope + §1.1 validation rules core can check | 1, 2 |
| 03 §2 publisher contract, `WorkQueueApiPublisher` | 1, 9 |
| 03 §3 handler/runtime contract, errors, outcomes | 1, 5, 6 |
| 03 §3.1 policy, `ComputeBackoffSeconds` | 1, 4 |
| 03 §3.2 `ConsumerRuntime` rules | 5, 6 |
| 03 §4 filter grammar, limits, missing-attribute rule | 3 |
| 03 §5 transport contracts, `SubscriptionUnsupportedReason` | 1, 4 |
| 03 §5.2 operator contract | 1, 7 |
| 03 §7 claim semantics (reference implementation) | 7, 8 |
| 03 §9 REST JSON shapes | 9 |
| 03 §10 manifest types | 1 |
| 02 §6 conformance kit (vitest and runner-agnostic) | 8 |
| 03 §7 cancel in flight (lease revocation, key held until expiry) | 5 (runtime), 7 (store/operator), 8 (C26–C27) |
| 02 §1a consumer responsibilities (handler rules) | 10 (README) |

## Contract deltas

Differences between this plan and spec 03 that must be folded into 03 (and honoured by plans 05–08). **Adopted**
means 03 already carries the rule (Revision 2/3) and the row is kept for traceability.

| # | Delta | Why |
| --- | --- | --- |
| CD1 *(adopted — 03 §3.2)* | `ConsumerRuntimeOptions` gains optional `ReceiveWaitSeconds` (default 0), passed as `Receive`'s `waitSeconds`. | 03 §3.2 gives the runtime no way to long-poll SQS (plan 07's MJ worker needs 20 s). |
| CD2 *(adopted — 03 §0)* | 03 §0's "lint rule (`no-restricted-imports`)" is not implementable as written: the repo has ESLint packages but no ESLint configuration wired into package builds or CI. Enforcement is `dependencyGuard.test.ts` (package.json fields + source import scan), which runs in every `pnpm test`. | Verified: no `.eslintrc*`/`eslint.config.*` at the root or in any package. |
| CD3 *(adopted — 03 §3.2)* | `ProcessBatch` skips the remainder of a partition lane after a delivery that did not settle `Completed`, reporting `{ Kind: 'Failed', Error: 'SkippedAfterEarlierFailureInPartition' }` (exported `SKIPPED_AFTER_PARTITION_FAILURE`). | SQS FIFO batches must not run later items of a message group after an earlier one fails; plan 07's Lambda adapter maps these to batch item failures. |
| CD4 *(adopted — 03 §3.2)* | Dead-letter reasons are truncated to 100 characters in the runtime (`MAX_DEAD_LETTER_REASON_LENGTH`). | `WorkQueueDelivery.DeadLetterReason` is `nvarchar(100)` (03 §6.5); a long `FatalWorkError` message would otherwise fail the settle. |
| CD5 *(adopted — 03 §7)* | 03 §7 must add two sequence rules: (a) the `LastCompletedSequence` mark keeps advancing through consecutive already-`Discarded` sequences after Complete/Discard/Skip; (b) a delivery created for an `Ordered` + `ExplicitSequence` subscription whose `Sequence ≤ LastCompletedSequence` is created `Discarded` (note `SequenceAlreadyResolved`). | Without (a), discarding sequence 3 while 2 is pending leaves 4 waiting forever. Without (b), a late publish of a skipped sequence becomes an unclaimable head and wedges its key (possible on the Database transport once the original message row is purged, and on staged subscriptions). |
| CD6 *(adopted — 03 §7)* | Awaiting-sequence state is cleared as soon as the head becomes the next sequence (not only on completion). | Otherwise `ListPartitions` keeps reporting `AwaitingSequence` for a key whose missing sequence has arrived. |
| CD7 | 03 §9 does not pin the casing of `status` values or `payloadRef` field names. This plan emits `Accepted`/`Duplicate`/`Rejected` (parsed case-insensitively) and camelCase `payloadRef` fields (`uri`, `contentType`, `sizeBytes`, `checksum`), and exports the mapping (`ParseRestPublishBody`, `ToRestPublishResult`, …) from core so the REST extension (plan 06) uses the identical code. | Client and server are written in different plans; one shared mapping removes drift. |
| CD8 | `PublishErrorCodes` adds client-side codes `BadRequest`, `Unauthorized` and `InvalidResponse` (retryable). An ExplicitSequence request with `Sequence` but no `PartitionKey` returns `InvalidSequence` (03 §1.1 names no code for that case). | Needed to report HTTP failures and a malformed success body per item. |
| CD9 *(adopted — 03 §3.2)* | Heartbeats are coalesced: a `Heartbeat` call made while another `ExtendLease` is in flight shares its result and its progress is not sent. After `MaxProcessingSeconds`, `Heartbeat` resolves `false` but a later handler outcome is still settled (the transport's lease token fences it if the lease expired). | 03 §3.2 does not specify either case. |
| CD10 | Extra exports beyond 03: `PublishErrorCodes`, `CreatePublishError`, `RejectedPublishResult`, `IsRetryablePublishErrorCode`, `SUBSCRIPTION_POLICY_DEFAULTS`, `NULL_WORK_LOGGER`, `ValidateSubscriptionFilter`, `FilterFields`, `WORK_QUEUE_FILTER_SUPPORT`, `FilterUnsupportedReason`, runtime helpers (`MapThrownError`, `ResolveSettleAction`, …), `DeliveryExecution`, `IN_MEMORY_TRANSPORT_CAPABILITIES`, and in `/testing`: fixtures, `ConformanceHarness` (with `Capabilities` and `Traits { ReleaseConsumesAttempt, ExpiredLeaseDeadLetters, ReceiveWaitSeconds }`), `ConformanceCase`, `CONFORMANCE_CASES`, `ConformanceAssertionError`, `ConformanceCheckResult`, `RunConformanceChecks`; in `/testing/vitest`: `RunTransportConformanceSuite`. | Shared by plans 05–07 so rules are implemented once. |
| CD12 *(adopted — 02 §6)* | The conformance kit is runner-agnostic: cases are data (`CONFORMANCE_CASES`, each with `Gate` returning a skip reason and `Run` throwing `ConformanceAssertionError`), `RunConformanceChecks(harness)` runs them sequentially without throwing and disposes the driver per case, and the vitest wrapper lives in a separate `./testing/vitest` entry — the only module importing `vitest`. 02 §6 should name both entries. | Plan 06's integration bundle runs the kit against a live database outside vitest. |
| CD11 *(adopted — 03 §0)* | Workspace globs: `packages/WorkQueue/*` must be added to both `pnpm-workspace.yaml` and the root `package.json` `workspaces` (Task 1). | Nested `packages/WorkQueue/{core,aws,engine,server}` folders are not covered by `packages/*`. |
| CD13 | The lease horizon is enforced in the runtime, not only by the transport: `DeliveryExecution` tracks `LeaseExpiresAt` (moved forward on every `Held` renewal) and aborts with the **new** `ExecutionStopReason` value `'LeaseExpired'` once heartbeats have failed past it plus `LEASE_EXPIRY_GRACE_MS` (5 s, overridable per execution). 03 §3.2 says "only `Lost`, or the lease passing its expiry, aborts" without naming the grace allowance or the stop reason. | A transient database or SQS failure must not abort an hour-long handler, but a handler whose lease is genuinely gone must stop before another worker takes over. |
| CD14 | Cancel needs no new consumer method: 03 §7's token rotation surfaces through the existing `ExtendLease → 'Lost'` path. The **operator** side does change — `ITransportOperator.Discard` may return `CancelRequested: true`, and the field is emitted **only** when true, so plain discards keep the `{ Supported, Changed }` shape that existing assertions and plans 05–07 use. `TransportCapabilities.CancelInFlight` gates conformance cases C26–C27. | 03 §5.2 types `CancelRequested` as optional but does not say when it is present. |
| CD15 *(resolved — 03 §1/§1.1)* | Attribute keys may not contain a dot: the charset is `[A-Za-z0-9_-]{1,64}`, and the reserved-prefix rule is "starts with `mj` followed by `.` or `_`, case-insensitive". Filter field names are therefore always bare names, and a dotted field stays rejected as MJ's multi-record `source.field` form. | Allowing dotted attribute keys would make those attributes unfilterable, since `CompositeFilterDescriptor` overloads `field` for multi-record filters (`CompositeFilter.ParseFilterField`). |
| CD16 | Filter details 03 §4 leaves open: an empty `filters: []` array matches everything (same as `null`); rule values are normalised with `String(value)` at parse time, so the stored filter always holds strings; an empty-string value is rejected for `eq`/`neq`/`startswith`; a nested group must use `logic: 'or'` (an inner `and` is rejected); `FilterSupport` is carried on `TransportCapabilities.Filters`, which every driver and fake must now set; and a field may be constrained only once per filter (matching plan 07's `ToSnsFilterPolicy`, delta D15). | Needed so the Database, AWS and in-memory transports agree byte-for-byte on what a stored filter means. |
