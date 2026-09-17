# Work Queue — AWS Transport Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@memberjunction/work-queue-aws` (SNS publish, SQS consumer, SQS dead-letter operator, Lambda adapter — with no MemberJunction runtime dependencies), wire it into the engine (driver factory, credentials, staging of cloud `Ordered` subscriptions), and ship a manifest-driven Terraform module with a deployment governance runbook.

**Architecture:** A topic bound to the AWS transport is an SNS topic; each subscription is an SQS queue subscribed with raw delivery and an SNS filter policy, plus a dead-letter queue. `None`/`Exclusive` subscriptions are consumed directly from SQS by a thin Lambda (`CreateSqsLambdaHandler`) or an MJ worker, using the core `ConsumerRuntime`. `Ordered` subscriptions must be MJ-hosted: an `SqsStager` copies messages into Database delivery rows and the Database consumer processes them. Dead letters are SQS messages carrying `mj_*` reason attributes; the redrive policy is a crash backstop. No DynamoDB. Cloud resources are provisioned only by Terraform, from the topology manifest MJ exports.

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, AWS SDK for JavaScript v3 (`@aws-sdk/client-sns`, `@aws-sdk/client-sqs`, `@aws-sdk/credential-providers` in the engine only), esbuild (bundle check), Terraform ≥ 1.7 with the `hashicorp/aws` provider 6.x, tflint, LocalStack (opt-in), GitHub Actions.

**Spec:** [`03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative), [`02-implementation-overview.md`](02-implementation-overview.md), [`README.md`](README.md). Read all three before starting. Names in 03 are binding; where this plan disagrees with 03, fix this plan (the deltas this plan needs are listed in [Contract deltas](#contract-deltas)).

## Global Constraints

- **Package manager:** pnpm. `pnpm install` at the repository root only; never inside a package; never `npm install`.
- **Per-package commands:** `cd packages/WorkQueue/aws && pnpm test` / `pnpm run build`; engine: `cd packages/WorkQueue/engine && pnpm test` / `pnpm run build`. Never build single packages with turbo from the root.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the version in `packages/MJCore/package.json` (`6.1.0` when this plan was written).
- **External versions:** `@aws-sdk/client-sns`, `@aws-sdk/client-sqs`, `@aws-sdk/credential-providers` at `^3.984.0` (matches the AWS SDK clients already in the repo, e.g. `packages/MJStorage/package.json`); `esbuild` `^0.27.3` (already in `pnpm-lock.yaml`).
- **Dependency rule (R9, 03 §0):** `@memberjunction/work-queue-aws` depends **only** on `@memberjunction/work-queue-core`, `@aws-sdk/client-sns` and `@aws-sdk/client-sqs`. No CloudWatch client. Enforced by `src/__tests__/dependencyGuard.test.ts` and the package `.eslintrc.json`. The `./lambda` bundle is checked by `scripts/check-lambda-bundle.mjs`.
- **Package shape:** `"type": "module"`, build `tsc && tsc-alias -f`, `tsconfig.json` extends `../../../tsconfig.server.json`, `vitest.config.ts` merges `../../../vitest.shared`, tests in `src/__tests__/*.test.ts`, extensionless relative imports, subpath exports declared with `types` + `default` (pattern: `packages/ServerBootstrapLite/package.json`).
- **No test calls AWS.** Every SDK call goes through `SnsGateway`/`SqsGateway`; unit tests use the recording fakes in `src/testing/fakes.ts` (exported as `@memberjunction/work-queue-aws/testing` so engine tests can reuse them) or a scripted `client.send`. The LocalStack suite (Task 12) is opt-in and excluded from `pnpm test`.
- **No DynamoDB, no parking, no state-sweeper Lambda** (README R8).
- **Code rules:** no `any`; `unknown` only at trust boundaries (JSON parsing, SDK errors) and narrowed immediately; PascalCase public members, camelCase private; static imports only; functions around 30–40 lines.
- **AWS limits used by this plan** (verify against current AWS quotas before release): SNS/SQS message ≤ 262,144 bytes including attributes; ≤ 10 message attributes; `PublishBatch` / `SendMessageBatch` ≤ 10 entries and ≤ 262,144 bytes per request; `ReceiveMessage` ≤ 10 messages, `WaitTimeSeconds` ≤ 20; visibility timeout ≤ 43,200 s and a message cannot stay invisible beyond 12 h from its receive; FIFO `MessageGroupId`/`MessageDeduplicationId` ≤ 128 printable ASCII characters; FIFO dedup window 5 minutes; SQS queue names ≤ 80 characters including `.fifo`; redrive `maxReceiveCount` 1–1000; Lambda timeout ≤ 900 s.
- **Terraform:** `required_version = ">= 1.7.0"` (needed for `mock_provider` in `terraform test`), provider `hashicorp/aws` `~> 6.0`. `terraform fmt -check -recursive`, `terraform validate`, `tflint` and `terraform test` must pass.
- **Commits:** a "Commit" step runs **only when the user has approved commits for this execution session** (repository rule: no commits without explicit approval). Otherwise stage the files and report.
- **Branch:** `feat/work-queue`, tracking `origin/feat/work-queue` (verify with `git branch -vv` before any push).

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | `work-queue-aws` scaffold, dependency guard, binding config, resource names, envelope | Package builds; guard and pure helpers tested |
| 2 | SNS filter-policy translation | `ToSnsFilterPolicy` tested |
| 3 | SNS/SQS gateways, error mapping, client factory, fakes | Gateways tested against scripted SDK clients |
| 4 | Capabilities, SNS publish mapping, binding validation, test fixtures | Publish and validation tested against fakes |
| 5 | `SqsTransportConsumer` and dead-letter writer | Lease, settle and poison handling tested |
| 6 | `AwsTransportOperator` and `AwsTransportDriver` | Stats, dead-letter peek, replay, discard and driver assembly tested |
| 7 | Lambda adapter (`./lambda`), EMF metrics, example consumer, bundle check | Batch semantics tested; bundle check passes |
| 8 | Engine: `AWSTransportDriverFactory`, credential resolution, cloud dedup verification | Factory tested; publish coordinator dedup proven over the real AWS driver |
| 9 | Engine: `SqsStager` for staged `Ordered` subscriptions | Staging, idempotency, ordering, shutdown tested |
| 10 | Terraform module `infrastructure/terraform/work-queue/aws` | `fmt`, `validate`, `tflint`, `terraform test` pass |
| 11 | Deployment governance runbook and CI workflow | `GOVERNANCE.md`; workflow runs module checks and the bundle check |
| 12 | LocalStack conformance (opt-in) and package README | Conformance suite passes against LocalStack |

Tasks 1–7 depend only on plan 04. Tasks 8–9 need plans 05 and 06 merged. Tasks 10–11 need Task 1 (naming parity) and plan 06's `mj queue export-topology` / `import-bindings` for the runbook's end-to-end check. Task 12 needs Tasks 1–7.

## Pre-flight

- [ ] You are on `feat/work-queue` and `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] Plan 04 is merged: `cd packages/WorkQueue/core && pnpm test` passes, and `pnpm-workspace.yaml` contains `'packages/WorkQueue/*'`.
- [ ] For Tasks 8–9: plans 05 and 06 are merged: `cd packages/WorkQueue/engine && pnpm test` passes.
- [ ] `terraform version` reports ≥ 1.7.0; `tflint --version` works (install from https://github.com/terraform-linters/tflint if missing).
- [ ] No AWS credentials are needed for Tasks 1–11. Task 12 needs Docker.

## File structure

```
packages/WorkQueue/aws/
  package.json · tsconfig.json · vitest.config.ts · .eslintrc.json                 Task 1 (package.json extended in 7, 12)
  README.md                                                                         Task 12
  scripts/check-lambda-bundle.mjs                                                   Task 7
  examples/thin-consumer/index.ts                                                   Task 7
  localstack/docker-compose.yml · vitest.localstack.config.ts                       Task 12
  src/index.ts                                                                      Task 1, extended by 2–6
  src/config.ts · src/names.ts · src/envelope.ts                                    Task 1
  src/filterPolicy.ts                                                               Task 2
  src/gateway/errors.ts · SnsGateway.ts · SqsGateway.ts                             Task 3
  src/gateway/SdkSnsGateway.ts · SdkSqsGateway.ts · clients.ts                      Task 3
  src/driver/capabilities.ts · publish.ts · bindingValidation.ts · src/testing/fixtures.ts   Task 4
  src/driver/AwsTransportDriver.ts                                                  Task 6
  src/consumer/deadLetter.ts · SqsTransportConsumer.ts                              Task 5
  src/operator/deadLetterScan.ts · AwsTransportOperator.ts                          Task 6
  src/lambda/index.ts · lambdaTypes.ts · bindingEnv.ts · emf.ts · CreateSqsLambdaHandler.ts   Task 7
  src/testing/index.ts · src/testing/fakes.ts                                       Task 3 (exported as ./testing)
  src/__tests__/*.test.ts                                                           every code task
  src/__localstack__/conformance.localstack.test.ts                                 Task 12

packages/WorkQueue/engine/
  package.json                                                                      Task 8
  src/transports/aws/ResolveAwsCredentials.ts · AWSTransportDriverFactory.ts        Task 8
  src/transports/aws/SqsStager.ts · RegisterAwsHostLoops.ts                         Task 9
  src/index.ts                                                                      Tasks 8, 9
  src/__tests__/ResolveAwsCredentials.test.ts · AWSTransportDriverFactory.test.ts   Task 8
  src/__tests__/AwsPublishCoordinator.test.ts · FinalizeTopologyManifest.test.ts    Task 8
  src/topology/FinalizeTopologyManifest.ts · src/WorkQueueEngine.ts (ExportManifest)   Task 8
  src/__tests__/SqsStager.test.ts                                                   Task 9

infrastructure/terraform/work-queue/aws/
  versions.tf · variables.tf · locals.tf · topics.tf · subscriptions.tf            Task 10
  lambda.tf · iam.tf · alarms.tf · outputs.tf · .tflint.hcl · README.md             Task 10
  tests/basic.tftest.hcl · tests/fixtures/manifest.json                             Task 10
  examples/basic/main.tf · examples/basic/manifest.json                             Task 10
  GOVERNANCE.md · examples/deploy-pipeline.github-actions.yml                       Task 11

.github/workflows/work-queue-aws.yml                                                Task 11 (extended in 12)
```

**Why `infrastructure/terraform/`:** the repository has no infrastructure-as-code folder today (`docker/` holds container definitions only, and `packages/*` are pnpm workspace members). A new top-level `infrastructure/terraform/` keeps Terraform out of the pnpm workspace and out of the unit-test workflow's `packages/**` path filter, and leaves room for `infrastructure/terraform/work-queue/azure` (09a).

---

### Task 1: Package scaffold, dependency guard, binding config, resource names and envelope

**Files:**
- Create: `packages/WorkQueue/aws/package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.json`
- Create: `packages/WorkQueue/aws/src/index.ts`, `src/config.ts`, `src/names.ts`, `src/envelope.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/dependencyGuard.test.ts`, `config.test.ts`, `names.test.ts`, `envelope.test.ts`

**Interfaces:**
- Consumes: `WorkQueueConfigurationError`, `WorkJson`, `WorkMessage`, `WorkPayloadRef` (`@memberjunction/work-queue-core`, 03 §1, §3).
- Produces:
  - `interface AwsTransportConfig { Region: string; Endpoint: string | null }`, `ParseAwsTransportConfig(json: string | null): AwsTransportConfig`
  - `interface AwsTopicConfig { SnsTopicArn: string }`, `ReadAwsTopicConfig(config: Record<string, WorkJson>): AwsTopicConfig`
  - `interface AwsSubscriptionConfig { Region: string; QueueUrl: string; QueueArn: string; DeadLetterQueueUrl: string; DeadLetterQueueArn: string; IsFifo: boolean; SnsSubscriptionArn: string | null }`, `ReadAwsSubscriptionConfig(config: Record<string, WorkJson>): AwsSubscriptionConfig`
  - `type AwsResourceKind = 'Topic' | 'Queue' | 'DeadLetterQueue'`, `SQS_MAX_NAME_LENGTH = 80`, `SNS_MAX_NAME_LENGTH = 256`, `ToResourceSlug(name: string): string`, `AwsResourceName(prefix: string, environment: string, logicalName: string, kind: AwsResourceKind, isFifo: boolean): string`
  - `SerializeEnvelope(message: WorkMessage): string`, `ParseEnvelopeBody(body: string): WorkMessage | null`, `MessageGroupIdFor(message: WorkMessage): string`, `IsWorkJson(value: unknown): value is WorkJson`

Naming is shared with Terraform (Task 10 reproduces `AwsResourceName` in HCL and asserts the same three cases), so a resource name in a validation message always matches what the module created.

- [ ] **Step 1: Create the package files**

`packages/WorkQueue/aws/package.json`:

```json
{
  "name": "@memberjunction/work-queue-aws",
  "type": "module",
  "version": "6.1.0",
  "description": "MemberJunction: AWS (SNS + SQS) transport and Lambda adapter for the durable work queue. No MemberJunction runtime dependencies.",
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
  "dependencies": {
    "@aws-sdk/client-sns": "^3.984.0",
    "@aws-sdk/client-sqs": "^3.984.0",
    "@memberjunction/work-queue-core": "6.1.0"
  },
  "devDependencies": {
    "@types/node": "24.10.11",
    "tsc-alias": "^1.8.16",
    "typescript": "^5.9.3",
    "vitest": "^3.1.1"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/MemberJunction/MJ"
  }
}
```

`packages/WorkQueue/aws/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/__tests__/**", "src/__localstack__/**", "src/**/*.test.ts", "vitest.config.ts", "vitest.localstack.config.ts"]
}
```

`packages/WorkQueue/aws/vitest.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(sharedConfig, defineProject({
    test: {
        environment: 'node',
        exclude: ['src/__localstack__/**'],
    },
}));
```

`packages/WorkQueue/aws/.eslintrc.json` (editor/lint signal; the dependency guard test is the enforcement):

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["@memberjunction/*", "!@memberjunction/work-queue-core"],
            "message": "work-queue-aws must stay free of MemberJunction runtime packages so Lambda consumers stay thin (plan 03 §0)."
          }
        ]
      }
    ]
  }
}
```

`packages/WorkQueue/aws/src/index.ts`:

```typescript
export * from './config';
export * from './names';
export * from './envelope';
```

Run: `pnpm install` (repository root)
Expected: completes; `packages/WorkQueue/aws/node_modules/@memberjunction/work-queue-core` links to the workspace package.

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/dependencyGuard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED_DEPENDENCIES = ['@aws-sdk/client-sns', '@aws-sdk/client-sqs', '@memberjunction/work-queue-core'];

interface PackageJson {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageJson;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === '__tests__' || entry === '__localstack__' ? [] : sourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('work-queue-aws dependency guard', () => {
    it('declares only the allowed runtime dependencies', () => {
        const pkg = readPackageJson();
        expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(ALLOWED_DEPENDENCIES);
    });

    it('declares no peer or optional dependencies', () => {
        const pkg = readPackageJson();
        expect(pkg.peerDependencies ?? {}).toEqual({});
        expect(pkg.optionalDependencies ?? {}).toEqual({});
    });

    it('imports no MemberJunction package other than work-queue-core from source', () => {
        const offenders = sourceFiles(join(PACKAGE_ROOT, 'src')).flatMap((file) => {
            const text = readFileSync(file, 'utf8');
            const imports = [...text.matchAll(/from\s+'(@memberjunction\/[^']+)'/g)].map((match) => match[1]);
            return imports.filter((name) => name !== '@memberjunction/work-queue-core').map((name) => `${file}: ${name}`);
        });
        expect(offenders).toEqual([]);
    });
});
```

`packages/WorkQueue/aws/src/__tests__/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseAwsTransportConfig, ReadAwsSubscriptionConfig, ReadAwsTopicConfig } from '../config';

const FULL_SUBSCRIPTION = {
    Region: 'us-east-1',
    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/mj-wq-prod-integration-apply.fifo',
    QueueArn: 'arn:aws:sqs:us-east-1:123456789012:mj-wq-prod-integration-apply.fifo',
    DeadLetterQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/mj-wq-prod-integration-apply-dlq.fifo',
    DeadLetterQueueArn: 'arn:aws:sqs:us-east-1:123456789012:mj-wq-prod-integration-apply-dlq.fifo',
    IsFifo: true,
    SnsSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-integration-batch-ready.fifo:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
};

describe('ParseAwsTransportConfig', () => {
    it('reads the region and an optional endpoint', () => {
        expect(ParseAwsTransportConfig('{"Region":"us-east-1"}')).toEqual({ Region: 'us-east-1', Endpoint: null });
        expect(ParseAwsTransportConfig('{"Region":"eu-west-2","Endpoint":"http://localhost:4566"}'))
            .toEqual({ Region: 'eu-west-2', Endpoint: 'http://localhost:4566' });
    });

    it('rejects missing or malformed configuration', () => {
        expect(() => ParseAwsTransportConfig(null)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseAwsTransportConfig('not json')).toThrow('AWS transport Configuration is not valid JSON');
        expect(() => ParseAwsTransportConfig('{"Region":"Ohio"}')).toThrow("'Region'");
        expect(() => ParseAwsTransportConfig('{"Region":"us-east-1","Endpoint":"localhost"}')).toThrow("'Endpoint'");
    });
});

describe('ReadAwsTopicConfig', () => {
    it('reads a standard or FIFO topic ARN', () => {
        expect(ReadAwsTopicConfig({ SnsTopicArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-email-events' }))
            .toEqual({ SnsTopicArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-email-events' });
        expect(ReadAwsTopicConfig({ SnsTopicArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-batch.fifo' }).SnsTopicArn)
            .toContain('.fifo');
    });

    it('reports a topic without a binding', () => {
        expect(() => ReadAwsTopicConfig({})).toThrow("'SnsTopicArn'");
    });
});

describe('ReadAwsSubscriptionConfig', () => {
    it('reads a complete binding', () => {
        expect(ReadAwsSubscriptionConfig(FULL_SUBSCRIPTION)).toEqual(FULL_SUBSCRIPTION);
    });

    it('defaults SnsSubscriptionArn to null', () => {
        const { SnsSubscriptionArn: _omitted, ...rest } = FULL_SUBSCRIPTION;
        expect(ReadAwsSubscriptionConfig(rest).SnsSubscriptionArn).toBeNull();
    });

    it('rejects an IsFifo flag that disagrees with the queue ARNs', () => {
        expect(() => ReadAwsSubscriptionConfig({ ...FULL_SUBSCRIPTION, IsFifo: false })).toThrow('IsFifo');
    });

    it('rejects a non-boolean IsFifo', () => {
        expect(() => ReadAwsSubscriptionConfig({ ...FULL_SUBSCRIPTION, IsFifo: 'true' })).toThrow("'IsFifo' must be a boolean");
    });
});
```

`packages/WorkQueue/aws/src/__tests__/names.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AwsResourceName, SQS_MAX_NAME_LENGTH, ToResourceSlug } from '../names';

describe('ToResourceSlug', () => {
    it('lowercases, replaces unsupported characters and trims hyphens', () => {
        expect(ToResourceSlug('Email.Unsubscribe  Handler!')).toBe('email-unsubscribe-handler');
    });
});

describe('AwsResourceName', () => {
    it('names a standard queue', () => {
        expect(AwsResourceName('mj-wq', 'prod', 'email.unsubscribe', 'Queue', false)).toBe('mj-wq-prod-email-unsubscribe');
    });

    it('names a FIFO dead-letter queue', () => {
        expect(AwsResourceName('mj-wq', 'prod', 'Integration Apply', 'DeadLetterQueue', true)).toBe('mj-wq-prod-integration-apply-dlq.fifo');
    });

    it('names a FIFO topic', () => {
        expect(AwsResourceName('mj-wq', 'prod', 'email.events', 'Topic', true)).toBe('mj-wq-prod-email-events.fifo');
    });

    it('shortens an over-long queue name with a stable hash of the logical name', () => {
        const name = AwsResourceName('mj-wq', 'prod', 'a'.repeat(90), 'Queue', true);
        expect(name).toBe(`mj-wq-prod-${'a'.repeat(55)}-ec270642.fifo`);
        expect(name).toHaveLength(SQS_MAX_NAME_LENGTH);
    });
});
```

`packages/WorkQueue/aws/src/__tests__/envelope.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import { IsWorkJson, MessageGroupIdFor, ParseEnvelopeBody, SerializeEnvelope } from '../envelope';

const MESSAGE: WorkMessage = {
    MessageID: '5b0c7f4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    Topic: 'integration.batch-ready',
    PartitionKey: 'integration-42',
    Sequence: 7,
    Attributes: { source: 'hubspot' },
    PayloadRef: { Uri: 's3://staging/batch-7.jsonl', SizeBytes: 1024 },
    CorrelationID: 'corr-1',
    PublishedAt: '2026-09-16T12:00:00.000Z',
};

describe('envelope serialization', () => {
    it('round-trips a message', () => {
        expect(ParseEnvelopeBody(SerializeEnvelope(MESSAGE))).toEqual(MESSAGE);
    });

    it('returns null for text that is not JSON or not an envelope', () => {
        expect(ParseEnvelopeBody('not json')).toBeNull();
        expect(ParseEnvelopeBody('[1,2]')).toBeNull();
        expect(ParseEnvelopeBody('{"Topic":"x","Attributes":{},"PublishedAt":"t"}')).toBeNull();
    });

    it('rejects non-string attribute values and invalid sequences', () => {
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Attributes: { a: 1 } }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Sequence: 0 }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Sequence: 1.5 }))).toBeNull();
    });

    it('drops unknown fields', () => {
        const parsed = ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Extra: 'ignored' }));
        expect(parsed).toEqual(MESSAGE);
    });
});

describe('MessageGroupIdFor', () => {
    it('uses the partition key, or the message ID without one', () => {
        expect(MessageGroupIdFor(MESSAGE)).toBe('integration-42');
        const { PartitionKey: _omitted, ...unkeyed } = MESSAGE;
        expect(MessageGroupIdFor(unkeyed)).toBe(MESSAGE.MessageID);
    });

    it('hashes keys that are too long or not printable ASCII', () => {
        expect(MessageGroupIdFor({ ...MESSAGE, PartitionKey: 'x'.repeat(129) }))
            .toBe('pk-0ec9eb33e74510bcdd1f2ea55206e82f21649c5c2becbf2b433eb475b34c01bd');
        expect(MessageGroupIdFor({ ...MESSAGE, PartitionKey: 'café' })).toMatch(/^pk-[0-9a-f]{64}$/);
    });
});

describe('IsWorkJson', () => {
    it('accepts nested JSON values and rejects functions and undefined', () => {
        expect(IsWorkJson({ a: [1, 'two', null, { b: true }] })).toBe(true);
        expect(IsWorkJson(undefined)).toBe(false);
        expect(IsWorkJson({ f: () => 1 })).toBe(false);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: FAIL — unresolved imports `../config`, `../names`, `../envelope`. (`dependencyGuard` passes already; that is expected.)

- [ ] **Step 4: Write `src/config.ts`**

```typescript
import { WorkQueueConfigurationError, type WorkJson } from '@memberjunction/work-queue-core';

export interface AwsTransportConfig {
    Region: string;
    /** Custom endpoint, e.g. LocalStack. Null uses the AWS default endpoints. */
    Endpoint: string | null;
}

export interface AwsTopicConfig {
    SnsTopicArn: string;
}

export interface AwsSubscriptionConfig {
    Region: string;
    QueueUrl: string;
    QueueArn: string;
    DeadLetterQueueUrl: string;
    DeadLetterQueueArn: string;
    IsFifo: boolean;
    /** Used by binding validation to compare raw delivery and filter policy. Null skips those checks. */
    SnsSubscriptionArn: string | null;
}

const REGION = /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/;
const ENDPOINT = /^https?:\/\/\S+$/;
const QUEUE_URL = /^https?:\/\/\S+\/\d{12}\/[A-Za-z0-9_-]{1,75}(\.fifo)?$/;
const SNS_TOPIC_ARN = /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,251}(\.fifo)?$/;
const SQS_ARN = /^arn:aws[a-z-]*:sqs:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,75}(\.fifo)?$/;
const SNS_SUBSCRIPTION_ARN = /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_.-]+:[0-9a-f-]{36}$/;

function fail(message: string): never {
    throw new WorkQueueConfigurationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(source: Record<string, unknown>, key: string, what: string, pattern: RegExp): string {
    const value = source[key];
    if (typeof value !== 'string' || !pattern.test(value)) {
        fail(`${what}: '${key}' is missing or invalid`);
    }
    return value;
}

function optionalString(source: Record<string, unknown>, key: string, what: string, pattern: RegExp): string | null {
    return source[key] === undefined || source[key] === null ? null : requireString(source, key, what, pattern);
}

/** Parses MJ: Work Queue Transports.Configuration for DriverClass 'AWS'. */
export function ParseAwsTransportConfig(json: string | null): AwsTransportConfig {
    if (json === null || json.trim() === '') {
        fail("AWS transport Configuration is required and must contain 'Region'");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        fail('AWS transport Configuration is not valid JSON');
    }
    if (!isRecord(parsed)) {
        fail('AWS transport Configuration must be a JSON object');
    }
    return {
        Region: requireString(parsed, 'Region', 'AWS transport Configuration', REGION),
        Endpoint: optionalString(parsed, 'Endpoint', 'AWS transport Configuration', ENDPOINT),
    };
}

/** Reads a topic's BindingConfig (TopicBinding.Config). */
export function ReadAwsTopicConfig(config: Record<string, WorkJson>): AwsTopicConfig {
    return { SnsTopicArn: requireString(config, 'SnsTopicArn', 'AWS topic binding', SNS_TOPIC_ARN) };
}

/** Reads a subscription's BindingConfig (SubscriptionBinding.Config). */
export function ReadAwsSubscriptionConfig(config: Record<string, WorkJson>): AwsSubscriptionConfig {
    const what = 'AWS subscription binding';
    const isFifo = config['IsFifo'];
    if (typeof isFifo !== 'boolean') {
        fail(`${what}: 'IsFifo' must be a boolean`);
    }
    const result: AwsSubscriptionConfig = {
        Region: requireString(config, 'Region', what, REGION),
        QueueUrl: requireString(config, 'QueueUrl', what, QUEUE_URL),
        QueueArn: requireString(config, 'QueueArn', what, SQS_ARN),
        DeadLetterQueueUrl: requireString(config, 'DeadLetterQueueUrl', what, QUEUE_URL),
        DeadLetterQueueArn: requireString(config, 'DeadLetterQueueArn', what, SQS_ARN),
        IsFifo: isFifo,
        SnsSubscriptionArn: optionalString(config, 'SnsSubscriptionArn', what, SNS_SUBSCRIPTION_ARN),
    };
    const arnsFifo = [result.QueueArn, result.DeadLetterQueueArn].map((arn) => arn.endsWith('.fifo'));
    if (arnsFifo.some((fifo) => fifo !== isFifo)) {
        fail(`${what}: 'IsFifo' is ${isFifo} but the queue and dead-letter queue ARNs disagree`);
    }
    return result;
}
```

- [ ] **Step 5: Write `src/names.ts`**

```typescript
import { createHash } from 'node:crypto';

export type AwsResourceKind = 'Topic' | 'Queue' | 'DeadLetterQueue';

export const SQS_MAX_NAME_LENGTH = 80;
export const SNS_MAX_NAME_LENGTH = 256;

/** Lowercase; every character outside [a-z0-9_-] becomes '-'; runs of '-' collapse; leading/trailing '-' trimmed. */
export function ToResourceSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * `${prefix}-${environment}-${slug}` + '-dlq' for dead-letter queues + '.fifo' when FIFO.
 * Names over the service limit keep a prefix and end with '-' + the first 8 hex chars of SHA-1(logicalName).
 * Terraform (infrastructure/terraform/work-queue/aws/locals.tf) implements the same rule.
 */
export function AwsResourceName(prefix: string, environment: string, logicalName: string, kind: AwsResourceKind, isFifo: boolean): string {
    const base = `${prefix}-${environment}-${ToResourceSlug(logicalName)}`;
    const suffix = kind === 'DeadLetterQueue' ? '-dlq' : '';
    const fifo = isFifo ? '.fifo' : '';
    const max = kind === 'Topic' ? SNS_MAX_NAME_LENGTH : SQS_MAX_NAME_LENGTH;
    if (base.length + suffix.length + fifo.length <= max) {
        return `${base}${suffix}${fifo}`;
    }
    const hash = createHash('sha1').update(logicalName).digest('hex').slice(0, 8);
    const keep = max - suffix.length - fifo.length - hash.length - 1;
    return `${base.slice(0, keep)}-${hash}${suffix}${fifo}`;
}
```

- [ ] **Step 6: Write `src/envelope.ts`**

```typescript
import { createHash } from 'node:crypto';
import type { WorkJson, WorkMessage, WorkPayloadRef } from '@memberjunction/work-queue-core';

const GROUP_ID = /^[\x21-\x7e]{1,128}$/;

export function SerializeEnvelope(message: WorkMessage): string {
    return JSON.stringify(message);
}

export function IsWorkJson(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(IsWorkJson);
    }
    if (typeof value === 'object') {
        return Object.values(value).every(IsWorkJson);
    }
    return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMap(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every((v) => typeof v === 'string');
}

function optionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function readPayloadRef(value: unknown): WorkPayloadRef | undefined | null {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value) || typeof value['Uri'] !== 'string') {
        return null;
    }
    const ref: WorkPayloadRef = { Uri: value['Uri'] };
    if (typeof value['ContentType'] === 'string') ref.ContentType = value['ContentType'];
    if (typeof value['SizeBytes'] === 'number') ref.SizeBytes = value['SizeBytes'];
    if (typeof value['Checksum'] === 'string') ref.Checksum = value['Checksum'];
    return ref;
}

function hasValidScalars(raw: Record<string, unknown>): boolean {
    const sequence = raw['Sequence'];
    return typeof raw['MessageID'] === 'string' && raw['MessageID'] !== ''
        && typeof raw['Topic'] === 'string' && raw['Topic'] !== ''
        && typeof raw['PublishedAt'] === 'string'
        && isStringMap(raw['Attributes'])
        && optionalString(raw['PartitionKey']) && optionalString(raw['CorrelationID'])
        && (sequence === undefined || (typeof sequence === 'number' && Number.isInteger(sequence) && sequence >= 1))
        && (raw['Payload'] === undefined || IsWorkJson(raw['Payload']));
}

/** Parses an SQS body into an envelope. Null when the body is not a valid envelope (poison message). */
export function ParseEnvelopeBody(body: string): WorkMessage | null {
    let raw: unknown;
    try {
        raw = JSON.parse(body);
    } catch {
        return null;
    }
    if (!isRecord(raw) || !hasValidScalars(raw)) {
        return null;
    }
    const payloadRef = readPayloadRef(raw['PayloadRef']);
    if (payloadRef === null) {
        return null;
    }
    const message: WorkMessage = {
        MessageID: raw['MessageID'] as string,
        Topic: raw['Topic'] as string,
        Attributes: raw['Attributes'] as Record<string, string>,
        PublishedAt: raw['PublishedAt'] as string,
    };
    if (typeof raw['PartitionKey'] === 'string') message.PartitionKey = raw['PartitionKey'];
    if (typeof raw['Sequence'] === 'number') message.Sequence = raw['Sequence'];
    if (raw['Payload'] !== undefined && IsWorkJson(raw['Payload'])) message.Payload = raw['Payload'];
    if (payloadRef) message.PayloadRef = payloadRef;
    if (typeof raw['CorrelationID'] === 'string') message.CorrelationID = raw['CorrelationID'];
    return message;
}

/** FIFO MessageGroupId: the partition key (or MessageID); keys SQS/SNS cannot carry become 'pk-' + SHA-256 hex. */
export function MessageGroupIdFor(message: WorkMessage): string {
    const key = message.PartitionKey ?? message.MessageID;
    return GROUP_ID.test(key) ? key : `pk-${createHash('sha256').update(key).digest('hex')}`;
}
```

The four `as` casts in `ParseEnvelopeBody` are on fields `hasValidScalars` has just checked; TypeScript cannot carry that narrowing across the helper.

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — dependencyGuard (3), config (8), names (5), envelope (7). Total 23.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds; `dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/aws pnpm-lock.yaml
git commit -m "feat(work-queue-aws): package scaffold, dependency guard, binding config, resource names and envelope"
```

---
### Task 2: SNS filter-policy translation

**Files:**
- Create: `packages/WorkQueue/aws/src/filterPolicy.ts`
- Modify: `packages/WorkQueue/aws/src/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/filterPolicy.test.ts`

**Interfaces:**
- Consumes: `SubscriptionFilter`, `FilterCondition`, `WorkQueueConfigurationError` (core, 03 §4).
- Produces:
  - `SNS_MAX_FILTER_COMBINATIONS = 150`
  - `ToSnsFilterPolicy(filter: SubscriptionFilter): string` — canonical JSON (keys sorted), throws for an empty filter or too many combinations
  - `SnsFilterPolicyFor(filter: SubscriptionFilter | null): string | null` — `null` for a null or empty filter (no policy = match everything)
  - `NormalizeSnsFilterPolicy(json: string | null | undefined): string | null` — canonical form for comparing a policy read back from SNS

Mapping (03 §4 → SNS filter policy with `FilterPolicyScope = MessageAttributes`):

| 03 condition | SNS policy value |
| --- | --- |
| `"click"` | `"click"` |
| `{ "prefix": "acme-" }` | `{ "prefix": "acme-" }` |
| `{ "exists": true }` / `{ "exists": false }` | `{ "exists": true }` / `{ "exists": false }` |
| `{ "anything-but": ["test"] }` | `{ "anything-but": ["test"] }` |

**Missing attributes.** SNS evaluates a policy key only against messages that carry the attribute, except
`{ "exists": false }` — the same rule 03 §4 states, so no translation is needed (verify against current SNS
filter-policy documentation during review). **Combinations.** SNS limits the number of value combinations (the
product of the array lengths across keys) to 150 (verify against current AWS quotas); the 03 limits (≤ 5 keys,
≤ 50 values) do not bound that product, so translation rejects policies above it with a configuration error.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/aws/src/__tests__/filterPolicy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { NormalizeSnsFilterPolicy, SnsFilterPolicyFor, ToSnsFilterPolicy } from '../filterPolicy';

describe('ToSnsFilterPolicy', () => {
    it('translates equals-any string conditions', () => {
        expect(ToSnsFilterPolicy({ eventType: ['click', 'open'] })).toBe('{"eventType":["click","open"]}');
    });

    it('translates prefix, exists and anything-but conditions', () => {
        const filter: SubscriptionFilter = {
            tenant: [{ prefix: 'acme-' }],
            priority: [{ exists: true }],
            legacy: [{ exists: false }],
            source: [{ 'anything-but': ['test'] }],
        };
        expect(JSON.parse(ToSnsFilterPolicy(filter))).toEqual({
            legacy: [{ exists: false }],
            priority: [{ exists: true }],
            source: [{ 'anything-but': ['test'] }],
            tenant: [{ prefix: 'acme-' }],
        });
    });

    it('produces the same text regardless of key order', () => {
        expect(ToSnsFilterPolicy({ b: ['2'], a: ['1'] })).toBe(ToSnsFilterPolicy({ a: ['1'], b: ['2'] }));
        expect(ToSnsFilterPolicy({ b: ['2'], a: ['1'] })).toBe('{"a":["1"],"b":["2"]}');
    });

    it('rejects an empty filter and a filter with too many combinations', () => {
        expect(() => ToSnsFilterPolicy({})).toThrow(WorkQueueConfigurationError);
        const wide: SubscriptionFilter = {
            a: ['1', '2', '3', '4', '5', '6'],
            b: ['1', '2', '3', '4', '5', '6'],
            c: ['1', '2', '3', '4', '5'],
        };
        expect(() => ToSnsFilterPolicy(wide)).toThrow('180 value combinations');
    });
});

describe('SnsFilterPolicyFor', () => {
    it('returns null when there is nothing to filter', () => {
        expect(SnsFilterPolicyFor(null)).toBeNull();
        expect(SnsFilterPolicyFor({})).toBeNull();
        expect(SnsFilterPolicyFor({ a: ['1'] })).toBe('{"a":["1"]}');
    });
});

describe('NormalizeSnsFilterPolicy', () => {
    it('ignores whitespace and key order, including inside condition objects', () => {
        const fromSns = '{ "tenant": [ { "prefix": "acme-" } ],\n "eventType": ["click"] }';
        expect(NormalizeSnsFilterPolicy(fromSns)).toBe(ToSnsFilterPolicy({ eventType: ['click'], tenant: [{ prefix: 'acme-' }] }));
    });

    it('treats null, undefined, blank and an empty object as no policy', () => {
        expect(NormalizeSnsFilterPolicy(null)).toBeNull();
        expect(NormalizeSnsFilterPolicy(undefined)).toBeNull();
        expect(NormalizeSnsFilterPolicy('  ')).toBeNull();
        expect(NormalizeSnsFilterPolicy('{}')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/aws && pnpm test filterPolicy`
Expected: FAIL — unresolved import `../filterPolicy`.

- [ ] **Step 3: Write `src/filterPolicy.ts`**

```typescript
import { WorkQueueConfigurationError, type FilterCondition, type SubscriptionFilter } from '@memberjunction/work-queue-core';

/** SNS limit on value combinations across a policy's keys. Verify against current AWS quotas. */
export const SNS_MAX_FILTER_COMBINATIONS = 150;

type PolicyValue = string | { prefix: string } | { exists: boolean } | { 'anything-but': string[] };

function toPolicyValue(condition: FilterCondition): PolicyValue {
    if (typeof condition === 'string') {
        return condition;
    }
    if ('prefix' in condition) {
        return { prefix: condition.prefix };
    }
    if ('exists' in condition) {
        return { exists: condition.exists };
    }
    return { 'anything-but': [...condition['anything-but']] };
}

/** JSON with object keys sorted at every level; arrays keep their order. */
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function ToSnsFilterPolicy(filter: SubscriptionFilter): string {
    const keys = Object.keys(filter);
    if (keys.length === 0) {
        throw new WorkQueueConfigurationError('An empty filter has no SNS filter policy; omit the policy instead');
    }
    const combinations = keys.reduce((product, key) => product * Math.max(1, filter[key].length), 1);
    if (combinations > SNS_MAX_FILTER_COMBINATIONS) {
        throw new WorkQueueConfigurationError(
            `Filter produces ${combinations} value combinations; SNS allows at most ${SNS_MAX_FILTER_COMBINATIONS}`,
        );
    }
    const policy: Record<string, PolicyValue[]> = {};
    for (const key of keys) {
        policy[key] = filter[key].map(toPolicyValue);
    }
    return canonicalJson(policy);
}

export function SnsFilterPolicyFor(filter: SubscriptionFilter | null): string | null {
    return filter === null || Object.keys(filter).length === 0 ? null : ToSnsFilterPolicy(filter);
}

export function NormalizeSnsFilterPolicy(json: string | null | undefined): string | null {
    if (json === null || json === undefined || json.trim() === '') {
        return null;
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
        return null;
    }
    return canonicalJson(parsed);
}
```

- [ ] **Step 4: Export the module**

Replace `packages/WorkQueue/aws/src/index.ts` with:

```typescript
export * from './config';
export * from './names';
export * from './envelope';
export * from './filterPolicy';
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — dependencyGuard (3), config (8), names (5), envelope (7), filterPolicy (7). Total 30.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/aws/src
git commit -m "feat(work-queue-aws): translate subscription filters to canonical SNS filter policies"
```

---

### Task 3: SNS/SQS gateways, error mapping, client factory and fakes

**Files:**
- Create: `packages/WorkQueue/aws/src/gateway/errors.ts`, `SnsGateway.ts`, `SqsGateway.ts`, `SdkSnsGateway.ts`, `SdkSqsGateway.ts`, `clients.ts`
- Create: `packages/WorkQueue/aws/src/testing/index.ts`, `src/testing/fakes.ts`
- Modify: `packages/WorkQueue/aws/package.json` (add `./testing` export), `src/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/gatewayErrors.test.ts`, `SdkSqsGateway.test.ts`, `SdkSnsGateway.test.ts`, `clients.test.ts`, `fakes.test.ts`

**Interfaces:**
- Consumes: `AwsTransportConfig` (Task 1); `SNSClient`, `SNSClientConfig`, `PublishBatchCommand`, `GetTopicAttributesCommand`, `GetSubscriptionAttributesCommand` (`@aws-sdk/client-sns`); `SQSClient`, `ReceiveMessageCommand`, `SendMessageCommand`, `ChangeMessageVisibilityCommand`, `DeleteMessageCommand`, `GetQueueAttributesCommand`, `Message` (`@aws-sdk/client-sqs`).
- Produces:
  - `class AwsGatewayError extends Error { readonly Code: string; readonly Retryable: boolean }`, `ToGatewayError(error: unknown, operation: string): AwsGatewayError`, `ErrorCode(error: unknown): string`, `IsAbortError(error: unknown): boolean`
  - `interface SnsPublishEntry { Id: string; Message: string; MessageAttributes: Record<string, string>; MessageGroupId?: string; MessageDeduplicationId?: string }`
  - `type SnsPublishEntryResult = { Id: string; Kind: 'Published' } | { Id: string; Kind: 'Failed'; Code: string; Message: string; SenderFault: boolean }`
  - `interface SnsGateway { PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]>; GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null>; GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null> }`
  - `interface SqsReceivedMessage { MessageId: string; ReceiptHandle: string; Body: string; ReceiveCount: number; MessageGroupId: string | null; SentTimestamp: number | null; Attributes: Record<string, string> }`
  - `interface SqsReceiveRequest { QueueUrl: string; MaxMessages: number; WaitTimeSeconds: number; VisibilityTimeoutSeconds: number | null; Signal?: AbortSignal }`
  - `interface SqsSendRequest { QueueUrl: string; Body: string; Attributes?: Record<string, string>; MessageGroupId?: string; MessageDeduplicationId?: string }`
  - `interface SqsGateway { Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]>; Send(request: SqsSendRequest): Promise<string>; ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean>; Delete(queueUrl: string, receiptHandle: string): Promise<boolean>; GetAttributes(queueUrl: string): Promise<Record<string, string> | null> }`
  - `class SdkSnsGateway implements SnsGateway` — `constructor(client: SNSClient)`; `class SdkSqsGateway implements SqsGateway` — `constructor(client: SQSClient)`
  - `type AwsCredentialsOption = SNSClientConfig['credentials']`, `interface AwsClients { Sns: SNSClient; Sqs: SQSClient }`, `CreateAwsClients(config: AwsTransportConfig, credentials?: AwsCredentialsOption): AwsClients`
  - Test doubles exported from `@memberjunction/work-queue-aws/testing`: `FakeSqsGateway` (in-memory SQS with FIFO group blocking, visibility, receive counts, 5-minute FIFO dedup, failure injection, controllable clock) and `FakeSnsGateway` (records batches, scripted entry failures and attributes)

The gateways are the only code that talks to AWS. Their contract: a stale receipt handle is `false`, a missing
queue/topic/subscription is `null`, an aborted long poll is `[]`, and every other failure is an
`AwsGatewayError` whose `Retryable` flag tells callers whether to map it to `TransportUnavailable`.

- [ ] **Step 1: Write the gateway interfaces**

`packages/WorkQueue/aws/src/gateway/SnsGateway.ts`:

```typescript
export interface SnsPublishEntry {
    /** Batch-unique entry ID (the driver uses the entry's index). */
    Id: string;
    Message: string;
    /** String message attributes (DataType 'String'). */
    MessageAttributes: Record<string, string>;
    MessageGroupId?: string;
    MessageDeduplicationId?: string;
}

export type SnsPublishEntryResult =
    | { Id: string; Kind: 'Published' }
    | { Id: string; Kind: 'Failed'; Code: string; Message: string; SenderFault: boolean };

export interface SnsGateway {
    /** At most 10 entries. Throws AwsGatewayError when the whole call fails. */
    PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]>;
    /** Null when the topic does not exist. */
    GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null>;
    /** Null when the subscription does not exist. */
    GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null>;
}
```

`packages/WorkQueue/aws/src/gateway/SqsGateway.ts`:

```typescript
export interface SqsReceivedMessage {
    MessageId: string;
    ReceiptHandle: string;
    Body: string;
    /** ApproximateReceiveCount. */
    ReceiveCount: number;
    /** FIFO queues only. */
    MessageGroupId: string | null;
    SentTimestamp: number | null;
    /** String message attributes. */
    Attributes: Record<string, string>;
}

export interface SqsReceiveRequest {
    QueueUrl: string;
    /** Clamped to 1–10. */
    MaxMessages: number;
    /** Clamped to 0–20. */
    WaitTimeSeconds: number;
    /** Null uses the queue's default visibility timeout. */
    VisibilityTimeoutSeconds: number | null;
    Signal?: AbortSignal;
}

export interface SqsSendRequest {
    QueueUrl: string;
    Body: string;
    Attributes?: Record<string, string>;
    MessageGroupId?: string;
    MessageDeduplicationId?: string;
}

export interface SqsGateway {
    /** Returns [] when the signal aborts the long poll. */
    Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]>;
    /** Returns the new SQS MessageId. */
    Send(request: SqsSendRequest): Promise<string>;
    /** False when the receipt handle no longer owns an in-flight message. */
    ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean>;
    /** False when the receipt handle is no longer valid. */
    Delete(queueUrl: string, receiptHandle: string): Promise<boolean>;
    /** All queue attributes; null when the queue does not exist. */
    GetAttributes(queueUrl: string): Promise<Record<string, string> | null>;
}
```

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/gatewayErrors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AwsGatewayError, IsAbortError, ToGatewayError } from '../gateway/errors';

function awsError(name: string, fault?: 'client' | 'server'): Error {
    const error = new Error(`${name} happened`);
    error.name = name;
    return fault ? Object.assign(error, { $fault: fault }) : error;
}

describe('ToGatewayError', () => {
    it('marks throttling and server faults as retryable', () => {
        expect(ToGatewayError(awsError('ThrottlingException'), 'SNS PublishBatch').Retryable).toBe(true);
        expect(ToGatewayError(awsError('SomethingNew', 'server'), 'SQS SendMessage').Retryable).toBe(true);
    });

    it('marks client faults as not retryable and keeps the code and operation', () => {
        const mapped = ToGatewayError(awsError('AccessDenied', 'client'), 'SQS SendMessage');
        expect(mapped).toBeInstanceOf(AwsGatewayError);
        expect(mapped.Code).toBe('AccessDenied');
        expect(mapped.Retryable).toBe(false);
        expect(mapped.message).toBe('SQS SendMessage failed: AccessDenied happened');
    });

    it('recognises abort errors and passes gateway errors through', () => {
        expect(IsAbortError(awsError('AbortError'))).toBe(true);
        expect(IsAbortError(new Error('x'))).toBe(false);
        const original = new AwsGatewayError('boom', 'X', true);
        expect(ToGatewayError(original, 'op')).toBe(original);
    });
});
```

`packages/WorkQueue/aws/src/__tests__/SdkSqsGateway.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
    ChangeMessageVisibilityCommand, DeleteMessageCommand, GetQueueAttributesCommand, ReceiveMessageCommand,
    SendMessageCommand, SQSClient,
} from '@aws-sdk/client-sqs';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import { AwsGatewayError } from '../gateway/errors';

const URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/mj-wq-prod-email-unsubscribe';

interface Harness {
    Gateway: SdkSqsGateway;
    Commands: object[];
    Options: (object | undefined)[];
}

/** An SQSClient whose send is scripted. Test-only cast: SQSClient['send'] is heavily overloaded. */
function harness(respond: (command: object) => object): Harness {
    const commands: object[] = [];
    const options: (object | undefined)[] = [];
    const client = new SQSClient({ region: 'us-east-1' });
    const send = vi.fn(async (command: object, sendOptions?: object) => {
        commands.push(command);
        options.push(sendOptions);
        return respond(command);
    });
    client.send = send as unknown as SQSClient['send'];
    return { Gateway: new SdkSqsGateway(client), Commands: commands, Options: options };
}

function awsError(name: string, message: string = name): Error {
    const error = new Error(message);
    error.name = name;
    return error;
}

describe('SdkSqsGateway.Receive', () => {
    it('maps received messages and asks for system and message attributes', async () => {
        const signal = new AbortController().signal;
        const { Gateway, Commands, Options } = harness(() => ({
            Messages: [{
                MessageId: 'm-1', ReceiptHandle: 'r-1', Body: '{"v":1}',
                Attributes: { ApproximateReceiveCount: '3', MessageGroupId: 'g-1', SentTimestamp: '1800000000000' },
                MessageAttributes: { mj_replay: { DataType: 'String', StringValue: '1' } },
            }],
        }));
        const received = await Gateway.Receive({ QueueUrl: URL, MaxMessages: 5, WaitTimeSeconds: 20, VisibilityTimeoutSeconds: 60, Signal: signal });
        expect(received).toEqual([{
            MessageId: 'm-1', ReceiptHandle: 'r-1', Body: '{"v":1}', ReceiveCount: 3, MessageGroupId: 'g-1',
            SentTimestamp: 1800000000000, Attributes: { mj_replay: '1' },
        }]);
        expect(Commands[0]).toBeInstanceOf(ReceiveMessageCommand);
        expect((Commands[0] as ReceiveMessageCommand).input).toEqual({
            QueueUrl: URL, MaxNumberOfMessages: 5, WaitTimeSeconds: 20, VisibilityTimeout: 60,
            MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId', 'SentTimestamp'],
            MessageAttributeNames: ['All'],
        });
        expect(Options[0]).toEqual({ abortSignal: signal });
    });

    it('clamps batch size and wait time, and omits a null visibility timeout', async () => {
        const { Gateway, Commands } = harness(() => ({}));
        expect(await Gateway.Receive({ QueueUrl: URL, MaxMessages: 25, WaitTimeSeconds: 30, VisibilityTimeoutSeconds: null })).toEqual([]);
        const input = (Commands[0] as ReceiveMessageCommand).input;
        expect(input.MaxNumberOfMessages).toBe(10);
        expect(input.WaitTimeSeconds).toBe(20);
        expect(input.VisibilityTimeout).toBeUndefined();
    });

    it('returns no messages when the long poll is aborted', async () => {
        const { Gateway } = harness(() => { throw awsError('AbortError'); });
        expect(await Gateway.Receive({ QueueUrl: URL, MaxMessages: 1, WaitTimeSeconds: 20, VisibilityTimeoutSeconds: null })).toEqual([]);
    });
});

describe('SdkSqsGateway writes', () => {
    it('sends with attributes, group and deduplication IDs and returns the MessageId', async () => {
        const { Gateway, Commands } = harness(() => ({ MessageId: 'm-9' }));
        const id = await Gateway.Send({
            QueueUrl: URL, Body: '{}', Attributes: { mj_dead_letter_reason: 'Fatal' },
            MessageGroupId: 'g', MessageDeduplicationId: 'd',
        });
        expect(id).toBe('m-9');
        expect(Commands[0]).toBeInstanceOf(SendMessageCommand);
        expect((Commands[0] as SendMessageCommand).input).toEqual({
            QueueUrl: URL, MessageBody: '{}', MessageGroupId: 'g', MessageDeduplicationId: 'd',
            MessageAttributes: { mj_dead_letter_reason: { DataType: 'String', StringValue: 'Fatal' } },
        });
    });

    it('changes visibility and deletes with the receipt handle', async () => {
        const { Gateway, Commands } = harness(() => ({}));
        expect(await Gateway.ChangeVisibility(URL, 'r-1', 90)).toBe(true);
        expect(await Gateway.Delete(URL, 'r-1')).toBe(true);
        expect(Commands[0]).toBeInstanceOf(ChangeMessageVisibilityCommand);
        expect((Commands[0] as ChangeMessageVisibilityCommand).input).toEqual({ QueueUrl: URL, ReceiptHandle: 'r-1', VisibilityTimeout: 90 });
        expect(Commands[1]).toBeInstanceOf(DeleteMessageCommand);
    });

    it('reports a stale receipt handle as false', async () => {
        expect(await harness(() => { throw awsError('ReceiptHandleIsInvalid'); }).Gateway.Delete(URL, 'r')).toBe(false);
        expect(await harness(() => { throw awsError('MessageNotInflight'); }).Gateway.ChangeVisibility(URL, 'r', 1)).toBe(false);
        const expired = awsError('InvalidParameterValue', 'Value r for parameter ReceiptHandle is invalid. Reason: The receipt handle has expired.');
        expect(await harness(() => { throw expired; }).Gateway.Delete(URL, 'r')).toBe(false);
    });

    it('throws AwsGatewayError for other failures', async () => {
        const throttled = harness(() => { throw awsError('ThrottlingException'); });
        await expect(throttled.Gateway.Send({ QueueUrl: URL, Body: '{}' })).rejects.toMatchObject({ Code: 'ThrottlingException', Retryable: true });
        const denied = harness(() => { throw awsError('AccessDenied'); });
        await expect(denied.Gateway.Delete(URL, 'r')).rejects.toBeInstanceOf(AwsGatewayError);
    });
});

describe('SdkSqsGateway.GetAttributes', () => {
    it('returns every attribute, or null for a missing queue', async () => {
        const { Gateway, Commands } = harness(() => ({ Attributes: { FifoQueue: 'true', VisibilityTimeout: '60' } }));
        expect(await Gateway.GetAttributes(URL)).toEqual({ FifoQueue: 'true', VisibilityTimeout: '60' });
        expect(Commands[0]).toBeInstanceOf(GetQueueAttributesCommand);
        expect((Commands[0] as GetQueueAttributesCommand).input).toEqual({ QueueUrl: URL, AttributeNames: ['All'] });
        expect(await harness(() => { throw awsError('QueueDoesNotExist'); }).Gateway.GetAttributes(URL)).toBeNull();
    });
});
```

`packages/WorkQueue/aws/src/__tests__/SdkSnsGateway.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GetSubscriptionAttributesCommand, GetTopicAttributesCommand, PublishBatchCommand, SNSClient } from '@aws-sdk/client-sns';
import { SdkSnsGateway } from '../gateway/SdkSnsGateway';

const TOPIC = 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-email-events';
const SUBSCRIPTION = `${TOPIC}:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0`;

/** An SNSClient whose send is scripted. Test-only cast: SNSClient['send'] is heavily overloaded. */
function harness(respond: (command: object) => object): { Gateway: SdkSnsGateway; Commands: object[] } {
    const commands: object[] = [];
    const client = new SNSClient({ region: 'us-east-1' });
    const send = vi.fn(async (command: object) => {
        commands.push(command);
        return respond(command);
    });
    client.send = send as unknown as SNSClient['send'];
    return { Gateway: new SdkSnsGateway(client), Commands: commands };
}

function awsError(name: string): Error {
    const error = new Error(name);
    error.name = name;
    return error;
}

describe('SdkSnsGateway.PublishBatch', () => {
    it('maps entries to the SDK request', async () => {
        const { Gateway, Commands } = harness(() => ({ Successful: [{ Id: '0' }], Failed: [] }));
        await Gateway.PublishBatch(TOPIC, [{ Id: '0', Message: '{}', MessageAttributes: { eventType: 'click' }, MessageGroupId: 'g', MessageDeduplicationId: 'd' }]);
        expect(Commands[0]).toBeInstanceOf(PublishBatchCommand);
        expect((Commands[0] as PublishBatchCommand).input).toEqual({
            TopicArn: TOPIC,
            PublishBatchRequestEntries: [{
                Id: '0', Message: '{}', MessageGroupId: 'g', MessageDeduplicationId: 'd',
                MessageAttributes: { eventType: { DataType: 'String', StringValue: 'click' } },
            }],
        });
    });

    it('reports published, failed and unreported entries per ID', async () => {
        const { Gateway } = harness(() => ({
            Successful: [{ Id: '0' }],
            Failed: [{ Id: '1', Code: 'InvalidParameter', Message: 'bad attribute', SenderFault: true }],
        }));
        const entries = ['0', '1', '2'].map((Id) => ({ Id, Message: '{}', MessageAttributes: {} }));
        expect(await Gateway.PublishBatch(TOPIC, entries)).toEqual([
            { Id: '0', Kind: 'Published' },
            { Id: '1', Kind: 'Failed', Code: 'InvalidParameter', Message: 'bad attribute', SenderFault: true },
            { Id: '2', Kind: 'Failed', Code: 'Unreported', Message: 'SNS reported no result for this entry', SenderFault: false },
        ]);
    });

    it('throws a retryable error when the whole call is throttled', async () => {
        const { Gateway } = harness(() => { throw awsError('Throttling'); });
        await expect(Gateway.PublishBatch(TOPIC, [{ Id: '0', Message: '{}', MessageAttributes: {} }]))
            .rejects.toMatchObject({ Code: 'Throttling', Retryable: true });
    });
});

describe('SdkSnsGateway attributes', () => {
    it('reads topic attributes, or null for a missing topic', async () => {
        const { Gateway, Commands } = harness(() => ({ Attributes: { FifoTopic: 'true' } }));
        expect(await Gateway.GetTopicAttributes(TOPIC)).toEqual({ FifoTopic: 'true' });
        expect(Commands[0]).toBeInstanceOf(GetTopicAttributesCommand);
        expect(await harness(() => { throw awsError('NotFoundException'); }).Gateway.GetTopicAttributes(TOPIC)).toBeNull();
    });

    it('reads subscription attributes, or null for a missing subscription', async () => {
        const { Gateway, Commands } = harness(() => ({ Attributes: { RawMessageDelivery: 'true' } }));
        expect(await Gateway.GetSubscriptionAttributes(SUBSCRIPTION)).toEqual({ RawMessageDelivery: 'true' });
        expect(Commands[0]).toBeInstanceOf(GetSubscriptionAttributesCommand);
        expect(await harness(() => { throw awsError('NotFound'); }).Gateway.GetSubscriptionAttributes(SUBSCRIPTION)).toBeNull();
    });
});
```

`packages/WorkQueue/aws/src/__tests__/clients.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreateAwsClients } from '../gateway/clients';

describe('CreateAwsClients', () => {
    it('configures both clients for the region with default endpoints', async () => {
        const clients = CreateAwsClients({ Region: 'eu-west-2', Endpoint: null });
        expect(await clients.Sns.config.region()).toBe('eu-west-2');
        expect(await clients.Sqs.config.region()).toBe('eu-west-2');
        expect(clients.Sqs.config.isCustomEndpoint).toBe(false);
    });

    it('uses a custom endpoint and static credentials when given', async () => {
        const clients = CreateAwsClients(
            { Region: 'us-east-1', Endpoint: 'http://localhost:4566' },
            { accessKeyId: 'test', secretAccessKey: 'test' },
        );
        expect(clients.Sns.config.isCustomEndpoint).toBe(true);
        expect(clients.Sqs.config.isCustomEndpoint).toBe(true);
        const credentials = await clients.Sqs.config.credentials();
        expect(credentials.accessKeyId).toBe('test');
    });
});
```

`packages/WorkQueue/aws/src/__tests__/fakes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FakeSqsGateway } from '../testing/fakes';

const FIFO = 'https://sqs.us-east-1.amazonaws.com/123456789012/q.fifo';

describe('FakeSqsGateway', () => {
    it('blocks a FIFO group while its oldest message is in flight', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a1', MessageGroupId: 'a', MessageDeduplicationId: 'a1' });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a2', MessageGroupId: 'a', MessageDeduplicationId: 'a2' });
        await sqs.Send({ QueueUrl: FIFO, Body: 'b1', MessageGroupId: 'b', MessageDeduplicationId: 'b1' });
        const first = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(first.map((m) => m.Body)).toEqual(['a1']);
        const second = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(second.map((m) => m.Body)).toEqual(['b1']);
    });

    it('redelivers after the visibility timeout with a higher receive count and a new receipt handle', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'x' });
        const [first] = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        sqs.Advance(31);
        const [second] = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(second.ReceiveCount).toBe(2);
        expect(second.ReceiptHandle).not.toBe(first.ReceiptHandle);
        expect(await sqs.Delete(FIFO, first.ReceiptHandle)).toBe(false);
        expect(await sqs.ChangeVisibility(FIFO, first.ReceiptHandle, 10)).toBe(false);
        expect(await sqs.Delete(FIFO, second.ReceiptHandle)).toBe(true);
        expect(sqs.Messages(FIFO)).toHaveLength(0);
    });

    it('suppresses a FIFO duplicate inside five minutes and accepts it after', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        const first = await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'same' });
        expect(await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'same' })).toBe(first);
        sqs.Advance(301);
        expect(await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'same' })).not.toBe(first);
        expect(sqs.Messages(FIFO)).toHaveLength(2);
    });

    it('injects a failure once and reports queue counts', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true, Attributes: { VisibilityTimeout: '45' } });
        sqs.FailNext('Send', new Error('boom'));
        await expect(sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'x' })).rejects.toThrow('boom');
        await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'x' });
        expect(await sqs.GetAttributes(FIFO)).toMatchObject({ FifoQueue: 'true', VisibilityTimeout: '45', ApproximateNumberOfMessages: '1', ApproximateNumberOfMessagesNotVisible: '0' });
        expect(await sqs.GetAttributes('https://missing')).toBeNull();
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/aws && pnpm test gatewayErrors SdkSqsGateway SdkSnsGateway clients fakes`
Expected: FAIL — unresolved imports `../gateway/errors`, `../gateway/SdkSqsGateway`, `../gateway/SdkSnsGateway`, `../gateway/clients`, `../testing/fakes`.

- [ ] **Step 4: Write `src/gateway/errors.ts`**

```typescript
/** A failed AWS call. Retryable failures map to the TransportUnavailable publish error and to settle retries. */
export class AwsGatewayError extends Error {
    constructor(message: string, public readonly Code: string, public readonly Retryable: boolean) {
        super(message);
        this.name = 'AwsGatewayError';
    }
}

const RETRYABLE_CODES = new Set([
    'Throttling', 'ThrottlingException', 'ThrottledException', 'RequestThrottled', 'RequestThrottledException',
    'TooManyRequestsException', 'KMSThrottlingException', 'ServiceUnavailable', 'InternalError', 'InternalFailure',
    'RequestTimeout', 'RequestTimeoutException', 'TimeoutError', 'NetworkingError', 'ECONNRESET', 'ETIMEDOUT',
]);

function readString(source: unknown, key: string): string | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'string' ? value : null;
}

/** The SDK error name (or Node error code), 'Unknown' when neither exists. */
export function ErrorCode(error: unknown): string {
    return readString(error, 'name') ?? readString(error, 'code') ?? 'Unknown';
}

export function IsAbortError(error: unknown): boolean {
    return ErrorCode(error) === 'AbortError';
}

export function ToGatewayError(error: unknown, operation: string): AwsGatewayError {
    if (error instanceof AwsGatewayError) {
        return error;
    }
    const code = ErrorCode(error);
    const message = readString(error, 'message') ?? String(error);
    const retryable = RETRYABLE_CODES.has(code) || readString(error, '$fault') === 'server';
    return new AwsGatewayError(`${operation} failed: ${message}`, code, retryable);
}
```

- [ ] **Step 5: Write `src/gateway/SdkSqsGateway.ts`**

```typescript
import {
    ChangeMessageVisibilityCommand, DeleteMessageCommand, GetQueueAttributesCommand, ReceiveMessageCommand,
    SendMessageCommand, type Message, type SQSClient,
} from '@aws-sdk/client-sqs';
import { ErrorCode, IsAbortError, ToGatewayError } from './errors';
import type { SqsGateway, SqsReceivedMessage, SqsReceiveRequest, SqsSendRequest } from './SqsGateway';

const MISSING_QUEUE_CODES = new Set(['QueueDoesNotExist', 'AWS.SimpleQueueService.NonExistentQueue']);
const STALE_RECEIPT_CODES = new Set(['ReceiptHandleIsInvalid', 'MessageNotInflight']);

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(Math.floor(value), min), max);
}

function isStaleReceipt(error: unknown): boolean {
    const code = ErrorCode(error);
    if (STALE_RECEIPT_CODES.has(code)) {
        return true;
    }
    return code === 'InvalidParameterValue' && error instanceof Error && /receipt ?handle/i.test(error.message);
}

function stringMap(source: Record<string, string | undefined> | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(source ?? {})) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

function toReceived(message: Message): SqsReceivedMessage[] {
    if (!message.MessageId || !message.ReceiptHandle || message.Body === undefined) {
        return [];
    }
    const system = message.Attributes ?? {};
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(message.MessageAttributes ?? {})) {
        if (value.StringValue !== undefined) {
            attributes[key] = value.StringValue;
        }
    }
    return [{
        MessageId: message.MessageId,
        ReceiptHandle: message.ReceiptHandle,
        Body: message.Body,
        ReceiveCount: Number(system.ApproximateReceiveCount ?? '1'),
        MessageGroupId: system.MessageGroupId ?? null,
        SentTimestamp: system.SentTimestamp ? Number(system.SentTimestamp) : null,
        Attributes: attributes,
    }];
}

export class SdkSqsGateway implements SqsGateway {
    constructor(private readonly client: SQSClient) {}

    public async Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]> {
        const command = new ReceiveMessageCommand({
            QueueUrl: request.QueueUrl,
            MaxNumberOfMessages: clamp(request.MaxMessages, 1, 10),
            WaitTimeSeconds: clamp(request.WaitTimeSeconds, 0, 20),
            ...(request.VisibilityTimeoutSeconds === null ? {} : { VisibilityTimeout: clamp(request.VisibilityTimeoutSeconds, 0, 43200) }),
            MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId', 'SentTimestamp'],
            MessageAttributeNames: ['All'],
        });
        try {
            const output = await this.client.send(command, { abortSignal: request.Signal });
            return (output.Messages ?? []).flatMap(toReceived);
        } catch (error) {
            if (IsAbortError(error) || request.Signal?.aborted) {
                return [];
            }
            throw ToGatewayError(error, 'SQS ReceiveMessage');
        }
    }

    public async Send(request: SqsSendRequest): Promise<string> {
        const attributes = Object.entries(request.Attributes ?? {});
        const command = new SendMessageCommand({
            QueueUrl: request.QueueUrl,
            MessageBody: request.Body,
            ...(request.MessageGroupId ? { MessageGroupId: request.MessageGroupId } : {}),
            ...(request.MessageDeduplicationId ? { MessageDeduplicationId: request.MessageDeduplicationId } : {}),
            ...(attributes.length > 0
                ? { MessageAttributes: Object.fromEntries(attributes.map(([k, v]) => [k, { DataType: 'String', StringValue: v }])) }
                : {}),
        });
        try {
            const output = await this.client.send(command);
            return output.MessageId ?? '';
        } catch (error) {
            throw ToGatewayError(error, 'SQS SendMessage');
        }
    }

    public async ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean> {
        const command = new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle, VisibilityTimeout: clamp(seconds, 0, 43200) });
        return this.receiptWrite(() => this.client.send(command), 'SQS ChangeMessageVisibility');
    }

    public async Delete(queueUrl: string, receiptHandle: string): Promise<boolean> {
        const command = new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle });
        return this.receiptWrite(() => this.client.send(command), 'SQS DeleteMessage');
    }

    public async GetAttributes(queueUrl: string): Promise<Record<string, string> | null> {
        try {
            const output = await this.client.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['All'] }));
            return stringMap(output.Attributes);
        } catch (error) {
            if (MISSING_QUEUE_CODES.has(ErrorCode(error))) {
                return null;
            }
            throw ToGatewayError(error, 'SQS GetQueueAttributes');
        }
    }

    private async receiptWrite(write: () => Promise<object>, operation: string): Promise<boolean> {
        try {
            await write();
            return true;
        } catch (error) {
            if (isStaleReceipt(error)) {
                return false;
            }
            throw ToGatewayError(error, operation);
        }
    }
}
```

- [ ] **Step 6: Write `src/gateway/SdkSnsGateway.ts`**

```typescript
import {
    GetSubscriptionAttributesCommand, GetTopicAttributesCommand, PublishBatchCommand, type SNSClient,
} from '@aws-sdk/client-sns';
import { ErrorCode, ToGatewayError } from './errors';
import type { SnsGateway, SnsPublishEntry, SnsPublishEntryResult } from './SnsGateway';

const NOT_FOUND_CODES = new Set(['NotFound', 'NotFoundException']);

function stringMap(source: Record<string, string> | undefined): Record<string, string> {
    return { ...(source ?? {}) };
}

export class SdkSnsGateway implements SnsGateway {
    constructor(private readonly client: SNSClient) {}

    public async PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]> {
        const command = new PublishBatchCommand({
            TopicArn: topicArn,
            PublishBatchRequestEntries: entries.map((entry) => ({
                Id: entry.Id,
                Message: entry.Message,
                ...(entry.MessageGroupId ? { MessageGroupId: entry.MessageGroupId } : {}),
                ...(entry.MessageDeduplicationId ? { MessageDeduplicationId: entry.MessageDeduplicationId } : {}),
                MessageAttributes: Object.fromEntries(
                    Object.entries(entry.MessageAttributes).map(([k, v]) => [k, { DataType: 'String', StringValue: v }]),
                ),
            })),
        });
        try {
            const output = await this.client.send(command);
            const published = new Set((output.Successful ?? []).map((s) => s.Id));
            const failed = new Map((output.Failed ?? []).map((f) => [f.Id, f]));
            return entries.map((entry): SnsPublishEntryResult => {
                if (published.has(entry.Id)) {
                    return { Id: entry.Id, Kind: 'Published' };
                }
                const failure = failed.get(entry.Id);
                return failure
                    ? { Id: entry.Id, Kind: 'Failed', Code: failure.Code ?? 'Unknown', Message: failure.Message ?? '', SenderFault: failure.SenderFault ?? false }
                    : { Id: entry.Id, Kind: 'Failed', Code: 'Unreported', Message: 'SNS reported no result for this entry', SenderFault: false };
            });
        } catch (error) {
            throw ToGatewayError(error, 'SNS PublishBatch');
        }
    }

    public async GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null> {
        try {
            const output = await this.client.send(new GetTopicAttributesCommand({ TopicArn: topicArn }));
            return stringMap(output.Attributes);
        } catch (error) {
            if (NOT_FOUND_CODES.has(ErrorCode(error))) {
                return null;
            }
            throw ToGatewayError(error, 'SNS GetTopicAttributes');
        }
    }

    public async GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null> {
        try {
            const output = await this.client.send(new GetSubscriptionAttributesCommand({ SubscriptionArn: subscriptionArn }));
            return stringMap(output.Attributes);
        } catch (error) {
            if (NOT_FOUND_CODES.has(ErrorCode(error))) {
                return null;
            }
            throw ToGatewayError(error, 'SNS GetSubscriptionAttributes');
        }
    }
}
```

- [ ] **Step 7: Write `src/gateway/clients.ts`**

```typescript
import { SNSClient, type SNSClientConfig } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import type { AwsTransportConfig } from '../config';

/** Static credentials or a credential provider. Undefined uses the SDK default chain (env, profile, role). */
export type AwsCredentialsOption = SNSClientConfig['credentials'];

export interface AwsClients {
    Sns: SNSClient;
    Sqs: SQSClient;
}

export function CreateAwsClients(config: AwsTransportConfig, credentials?: AwsCredentialsOption): AwsClients {
    const common = {
        region: config.Region,
        ...(config.Endpoint ? { endpoint: config.Endpoint } : {}),
        ...(credentials ? { credentials } : {}),
    };
    return { Sns: new SNSClient(common), Sqs: new SQSClient(common) };
}
```

- [ ] **Step 8: Write the fakes**

`packages/WorkQueue/aws/src/testing/fakes.ts`:

```typescript
import type { SnsGateway, SnsPublishEntry, SnsPublishEntryResult } from '../gateway/SnsGateway';
import type { SqsGateway, SqsReceivedMessage, SqsReceiveRequest, SqsSendRequest } from '../gateway/SqsGateway';

export interface FakeSqsMessage {
    MessageId: string;
    Body: string;
    Attributes: Record<string, string>;
    GroupId: string | null;
    DeduplicationId: string | null;
    ReceiveCount: number;
    /** Epoch ms. */
    VisibleAt: number;
    ReceiptHandle: string | null;
    SentTimestamp: number;
    Deleted: boolean;
}

interface FakeQueue {
    Fifo: boolean;
    VisibilityTimeoutSeconds: number;
    Attributes: Record<string, string>;
    Messages: FakeSqsMessage[];
}

export type FakeSqsOperation = 'Receive' | 'Send' | 'ChangeVisibility' | 'Delete' | 'GetAttributes';

/** In-memory SQS: FIFO group blocking, visibility, receive counts, receipt-handle ownership, 5-minute FIFO dedup. */
export class FakeSqsGateway implements SqsGateway {
    /** Fake clock, epoch ms. */
    public Now = 1_800_000_000_000;
    public readonly Calls: { Op: FakeSqsOperation; QueueUrl: string }[] = [];
    private readonly queues = new Map<string, FakeQueue>();
    private readonly failures = new Map<FakeSqsOperation, Error>();
    private sequence = 0;

    public AddQueue(url: string, options: { Fifo: boolean; VisibilityTimeoutSeconds?: number; Attributes?: Record<string, string> }): this {
        this.queues.set(url, {
            Fifo: options.Fifo,
            VisibilityTimeoutSeconds: options.VisibilityTimeoutSeconds ?? 30,
            Attributes: options.Attributes ?? {},
            Messages: [],
        });
        return this;
    }

    /** Undeleted messages, oldest first. */
    public Messages(url: string): FakeSqsMessage[] {
        return this.queue(url).Messages.filter((m) => !m.Deleted);
    }

    public Advance(seconds: number): void {
        this.Now += seconds * 1000;
    }

    public FailNext(op: FakeSqsOperation, error: Error): void {
        this.failures.set(op, error);
    }

    public async Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]> {
        this.record('Receive', request.QueueUrl);
        const queue = this.queue(request.QueueUrl);
        const visibility = (request.VisibilityTimeoutSeconds ?? queue.VisibilityTimeoutSeconds) * 1000;
        const blockedGroups = new Set<string>();
        const received: SqsReceivedMessage[] = [];
        for (const message of queue.Messages) {
            if (message.Deleted || received.length >= Math.min(Math.max(request.MaxMessages, 1), 10)) {
                continue;
            }
            const visible = message.VisibleAt <= this.Now;
            if (queue.Fifo && message.GroupId !== null && (blockedGroups.has(message.GroupId) || !visible)) {
                blockedGroups.add(message.GroupId);
                continue;
            }
            if (!visible) {
                continue;
            }
            message.ReceiveCount += 1;
            message.ReceiptHandle = `rh-${++this.sequence}`;
            message.VisibleAt = this.Now + visibility;
            received.push(this.toReceived(message));
        }
        return received;
    }

    public async Send(request: SqsSendRequest): Promise<string> {
        this.record('Send', request.QueueUrl);
        const queue = this.queue(request.QueueUrl);
        const dedupId = request.MessageDeduplicationId ?? null;
        if (queue.Fifo && dedupId !== null) {
            const duplicate = queue.Messages.find((m) => m.DeduplicationId === dedupId && m.SentTimestamp > this.Now - 300_000);
            if (duplicate) {
                return duplicate.MessageId;
            }
        }
        const message: FakeSqsMessage = {
            MessageId: `msg-${++this.sequence}`, Body: request.Body, Attributes: { ...(request.Attributes ?? {}) },
            GroupId: request.MessageGroupId ?? null, DeduplicationId: dedupId, ReceiveCount: 0, VisibleAt: this.Now,
            ReceiptHandle: null, SentTimestamp: this.Now, Deleted: false,
        };
        queue.Messages.push(message);
        return message.MessageId;
    }

    public async ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean> {
        this.record('ChangeVisibility', queueUrl);
        const message = this.owned(queueUrl, receiptHandle);
        if (!message || message.VisibleAt <= this.Now) {
            return false;
        }
        message.VisibleAt = this.Now + seconds * 1000;
        return true;
    }

    public async Delete(queueUrl: string, receiptHandle: string): Promise<boolean> {
        this.record('Delete', queueUrl);
        const message = this.owned(queueUrl, receiptHandle);
        if (!message) {
            return false;
        }
        message.Deleted = true;
        return true;
    }

    public async GetAttributes(queueUrl: string): Promise<Record<string, string> | null> {
        this.record('GetAttributes', queueUrl);
        const queue = this.queues.get(queueUrl);
        if (!queue) {
            return null;
        }
        const live = queue.Messages.filter((m) => !m.Deleted);
        return {
            FifoQueue: String(queue.Fifo),
            VisibilityTimeout: String(queue.VisibilityTimeoutSeconds),
            ApproximateNumberOfMessages: String(live.filter((m) => m.VisibleAt <= this.Now).length),
            ApproximateNumberOfMessagesNotVisible: String(live.filter((m) => m.VisibleAt > this.Now).length),
            ApproximateNumberOfMessagesDelayed: '0',
            ...queue.Attributes,
        };
    }

    private record(op: FakeSqsOperation, queueUrl: string): void {
        this.Calls.push({ Op: op, QueueUrl: queueUrl });
        const failure = this.failures.get(op);
        if (failure) {
            this.failures.delete(op);
            throw failure;
        }
    }

    private queue(url: string): FakeQueue {
        const queue = this.queues.get(url);
        if (!queue) {
            throw new Error(`FakeSqsGateway: no queue ${url}`);
        }
        return queue;
    }

    private owned(url: string, receiptHandle: string): FakeSqsMessage | undefined {
        return this.queue(url).Messages.find((m) => !m.Deleted && m.ReceiptHandle === receiptHandle);
    }

    private toReceived(message: FakeSqsMessage): SqsReceivedMessage {
        return {
            MessageId: message.MessageId, ReceiptHandle: message.ReceiptHandle ?? '', Body: message.Body,
            ReceiveCount: message.ReceiveCount, MessageGroupId: message.GroupId, SentTimestamp: message.SentTimestamp,
            Attributes: { ...message.Attributes },
        };
    }
}

/** Records PublishBatch calls; entries listed in FailedEntries fail with the scripted reason. */
export class FakeSnsGateway implements SnsGateway {
    public readonly Batches: { TopicArn: string; Entries: SnsPublishEntry[] }[] = [];
    public readonly FailedEntries = new Map<string, { Code: string; Message: string; SenderFault: boolean }>();
    public readonly TopicAttributes = new Map<string, Record<string, string>>();
    public readonly SubscriptionAttributes = new Map<string, Record<string, string>>();
    public ThrowOnPublish: Error | null = null;

    public async PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]> {
        if (this.ThrowOnPublish) {
            throw this.ThrowOnPublish;
        }
        this.Batches.push({ TopicArn: topicArn, Entries: entries.map((e) => ({ ...e })) });
        return entries.map((entry): SnsPublishEntryResult => {
            const failure = this.FailedEntries.get(entry.MessageDeduplicationId ?? entry.Id);
            return failure ? { Id: entry.Id, Kind: 'Failed', ...failure } : { Id: entry.Id, Kind: 'Published' };
        });
    }

    public async GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null> {
        return this.TopicAttributes.get(topicArn) ?? null;
    }

    public async GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null> {
        return this.SubscriptionAttributes.get(subscriptionArn) ?? null;
    }
}
```

`FakeSnsGateway.FailedEntries` is keyed by `MessageDeduplicationId` when present (the driver sets it to the
`MessageID` on FIFO topics), otherwise by entry ID — so tests can fail a specific message.

`packages/WorkQueue/aws/src/testing/index.ts`:

```typescript
export * from './fakes';
```

- [ ] **Step 9: Export the modules and the `./testing` subpath**

Replace `packages/WorkQueue/aws/src/index.ts` with:

```typescript
export * from './config';
export * from './names';
export * from './envelope';
export * from './filterPolicy';
export * from './gateway/errors';
export * from './gateway/SnsGateway';
export * from './gateway/SqsGateway';
export * from './gateway/SdkSnsGateway';
export * from './gateway/SdkSqsGateway';
export * from './gateway/clients';
```

In `packages/WorkQueue/aws/package.json`, replace the `exports` block with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "default": "./dist/testing/index.js"
    }
  },
```

- [ ] **Step 10: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — dependencyGuard (3), config (8), names (5), envelope (7), filterPolicy (7), gatewayErrors (3), SdkSqsGateway (8), SdkSnsGateway (5), clients (2), fakes (4). Total 52.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds; `dist/testing/index.js` exists.

- [ ] **Step 11: Commit**

```bash
git add packages/WorkQueue/aws
git commit -m "feat(work-queue-aws): SNS/SQS gateways with error mapping, client factory and in-memory fakes"
```

---

### Task 4: Capabilities, SNS publish mapping and binding validation

**Files:**
- Create: `packages/WorkQueue/aws/src/driver/capabilities.ts`, `src/driver/publish.ts`, `src/driver/bindingValidation.ts`
- Create: `packages/WorkQueue/aws/src/testing/fixtures.ts`
- Modify: `packages/WorkQueue/aws/src/index.ts`, `src/testing/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/capabilities.test.ts`, `publish.test.ts`, `bindingValidation.test.ts`

**Interfaces:**
- Consumes: `TopicBinding`, `SubscriptionBinding`, `SubscriptionPolicy`, `SubscriptionFilter`, `WorkMessage`, `WorkJson`, `HostType`, `PublishResult`, `BindingValidationIssue`, `TransportCapabilities`, `WorkQueueConfigurationError` (core); `ReadAwsTopicConfig`, `ReadAwsSubscriptionConfig`, `SerializeEnvelope`, `MessageGroupIdFor` (Task 1); `SnsFilterPolicyFor`, `NormalizeSnsFilterPolicy` (Task 2); `SnsGateway`, `SqsGateway`, `SnsPublishEntry`, `AwsGatewayError`, `FakeSnsGateway`, `FakeSqsGateway` (Task 3).
- Produces:
  - `AWS_TRANSPORT_NAME = 'AWS'`, `AWS_TRANSPORT_CAPABILITIES: TransportCapabilities`
  - `SNS_BATCH_MAX_ENTRIES = 10`, `SNS_REQUEST_MAX_BYTES = 262144`, `MAX_MESSAGE_ATTRIBUTES = 10`
  - `BuildPublishEntry(message: WorkMessage, index: number, isFifo: boolean): SnsPublishEntry`, `EntryBytes(entry: SnsPublishEntry): number`, `ChunkEntries(entries: SnsPublishEntry[]): SnsPublishEntry[][]`
  - `PublishToSns(gateway: SnsGateway, topic: TopicBinding, messages: WorkMessage[]): Promise<PublishResult[]>`
  - `STAGED_MAX_RECEIVE_COUNT = 1000`, `ExpectedMaxReceiveCount(policy: SubscriptionPolicy): number`, `RequiresFifoTopic(topic: TopicBinding, subscriptions: SubscriptionBinding[]): boolean`
  - `ValidateAwsBindings(sns: SnsGateway, sqs: SqsGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]>`
  - Test fixtures from `./testing`: `interface TestAwsResourceSet`, `TestAwsResources(isFifo: boolean): TestAwsResourceSet`, `TestPolicy(overrides?: Partial<SubscriptionPolicy>): SubscriptionPolicy`, `TestTopicBinding(isFifo?: boolean, overrides?: Partial<TopicBinding>): TopicBinding`, `TestSubscriptionBinding(isFifo?: boolean, options?: TestSubscriptionOptions): SubscriptionBinding`, `TestMessage(index: number, overrides?: Partial<WorkMessage>): WorkMessage`, `SeedValidAwsResources(sns: FakeSnsGateway, sqs: FakeSqsGateway, topic: TopicBinding, subscription: SubscriptionBinding): void`

**Publish mapping.** Body = envelope JSON; each user attribute becomes a `String` SNS message attribute (the only
thing filter policies see); the reserved envelope fields travel in the body. FIFO topics: `MessageGroupId` =
`MessageGroupIdFor(message)`, `MessageDeduplicationId` = `MessageID`. Entries are chunked by 10 and by the 262,144-byte
request limit (message body + attribute names, types and values). Result mapping:

| Outcome | `PublishResult` |
| --- | --- |
| Entry published | `Accepted` |
| Topic has no valid `SnsTopicArn` | `Rejected` `TopicUnbound`, retryable |
| Envelope + attributes over the topic cap or 262,144 bytes | `Rejected` `PayloadTooLarge` |
| More than 10 attributes | `Rejected` `InvalidAttributes` |
| Entry failed with `SenderFault = true` | `Rejected` `TransportRejected` (not retryable; SNS code in the message) |
| Entry failed with `SenderFault = false`, or unreported | `Rejected` `TransportUnavailable`, retryable |
| Whole `PublishBatch` call failed | every entry of that chunk `Rejected` `TransportUnavailable`, `Retryable` = the gateway error's flag |

The AWS driver never returns `Duplicate` (03 §2.1): FIFO deduplication is silent, and `DeduplicationKey`
suppression happens in the engine ledger before the driver is called.

**Staged subscriptions.** On this transport `SupportsOrdered = false`, so every `Ordered` subscription is staged
(03 §5.1). A staging failure (database outage) must not push messages into the dead-letter queue and break order,
so staged queues use `maxReceiveCount = 1000` (the SQS maximum); every other queue uses `MaxAttempts + 2`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/capabilities.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AWS_TRANSPORT_CAPABILITIES, AWS_TRANSPORT_NAME } from '../driver/capabilities';

describe('AWS transport capabilities', () => {
    it('declares exactly the 03 §5 AWS values', () => {
        expect(AWS_TRANSPORT_NAME).toBe('AWS');
        expect(AWS_TRANSPORT_CAPABILITIES).toEqual({
            DetectsMessageIDDuplicates: false,
            PersistsProgress: false,
            SupportsOrdered: false,
            SupportsExternalHosts: true,
            CancelPending: false,
            ListPartitions: false,
            PeekDeadLetters: 'BestEffort',
            ReplaySingleDeadLetter: true,
            CompletedCounts: false,
            MaxRetryDelaySeconds: 43200,
        });
    });
});
```

`packages/WorkQueue/aws/src/__tests__/publish.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BuildPublishEntry, ChunkEntries, EntryBytes, PublishToSns } from '../driver/publish';
import { AwsGatewayError } from '../gateway/errors';
import { FakeSnsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestTopicBinding } from '../testing/fixtures';

let sns: FakeSnsGateway;

beforeEach(() => {
    sns = new FakeSnsGateway();
});

describe('BuildPublishEntry', () => {
    it('maps a message on a standard topic: body, attributes, no group or dedup ID', () => {
        const message = TestMessage(1, { Attributes: { eventType: 'click', provider: 'sendgrid' } });
        expect(BuildPublishEntry(message, 0, false)).toEqual({
            Id: '0', Message: JSON.stringify(message), MessageAttributes: { eventType: 'click', provider: 'sendgrid' },
        });
    });

    it('sets group and deduplication IDs on a FIFO topic', () => {
        const keyed = TestMessage(2, { PartitionKey: 'subscriber-9' });
        expect(BuildPublishEntry(keyed, 3, true)).toMatchObject({ Id: '3', MessageGroupId: 'subscriber-9', MessageDeduplicationId: keyed.MessageID });
        const unkeyed = TestMessage(3);
        expect(BuildPublishEntry(unkeyed, 4, true).MessageGroupId).toBe(unkeyed.MessageID);
    });
});

describe('ChunkEntries', () => {
    it('splits at ten entries', () => {
        const entries = Array.from({ length: 23 }, (_, i) => BuildPublishEntry(TestMessage(i), i, false));
        expect(ChunkEntries(entries).map((chunk) => chunk.length)).toEqual([10, 10, 3]);
    });

    it('splits before a request would exceed 262,144 bytes', () => {
        const big = 'x'.repeat(100_000);
        const entries = [0, 1, 2].map((i) => BuildPublishEntry(TestMessage(i, { Payload: big }), i, false));
        expect(EntryBytes(entries[0])).toBeGreaterThan(100_000);
        expect(ChunkEntries(entries).map((chunk) => chunk.length)).toEqual([2, 1]);
    });
});

describe('PublishToSns', () => {
    it('publishes every chunk and accepts every message in input order', async () => {
        const messages = Array.from({ length: 12 }, (_, i) => TestMessage(i));
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(sns.Batches).toHaveLength(2);
        expect(sns.Batches[0].TopicArn).toBe(TestAwsResources(true).TopicArn);
        expect(results.map((r) => r.Status)).toEqual(Array(12).fill('Accepted'));
        expect(results.map((r) => r.MessageID)).toEqual(messages.map((m) => m.MessageID));
    });

    it('maps per-entry failures by sender fault', async () => {
        const messages = [TestMessage(1), TestMessage(2), TestMessage(3)];
        sns.FailedEntries.set(messages[0].MessageID, { Code: 'InvalidParameter', Message: 'bad', SenderFault: true });
        sns.FailedEntries.set(messages[2].MessageID, { Code: 'InternalError', Message: 'try again', SenderFault: false });
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(results[0]).toEqual({ MessageID: messages[0].MessageID, Status: 'Rejected', Error: { Code: 'TransportRejected', Message: 'SNS InvalidParameter: bad', Retryable: false } });
        expect(results[1].Status).toBe('Accepted');
        expect(results[2]).toEqual({ MessageID: messages[2].MessageID, Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'SNS InternalError: try again', Retryable: true } });
    });

    it('rejects a whole chunk when the call fails, carrying the retryable flag', async () => {
        sns.ThrowOnPublish = new AwsGatewayError('SNS PublishBatch failed: Throttling', 'Throttling', true);
        const results = await PublishToSns(sns, TestTopicBinding(false), [TestMessage(1), TestMessage(2)]);
        expect(results.every((r) => r.Status === 'Rejected' && r.Error?.Code === 'TransportUnavailable' && r.Error.Retryable)).toBe(true);
    });

    it('rejects every message of an unbound topic without calling SNS', async () => {
        const results = await PublishToSns(sns, TestTopicBinding(true, { Config: {} }), [TestMessage(1)]);
        expect(results[0].Error).toMatchObject({ Code: 'TopicUnbound', Retryable: true });
        expect(sns.Batches).toHaveLength(0);
    });

    it('rejects oversized envelopes and too many attributes but publishes the rest', async () => {
        const tooBig = TestMessage(1, { Payload: 'x'.repeat(262_144) });
        const tooManyAttributes = TestMessage(2, { Attributes: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`a${i}`, 'v'])) });
        const fine = TestMessage(3);
        const results = await PublishToSns(sns, TestTopicBinding(true), [tooBig, tooManyAttributes, fine]);
        expect(results.map((r) => r.Error?.Code ?? r.Status)).toEqual(['PayloadTooLarge', 'InvalidAttributes', 'Accepted']);
        expect(sns.Batches[0].Entries).toHaveLength(1);
    });
});
```

`packages/WorkQueue/aws/src/__tests__/bindingValidation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpectedMaxReceiveCount, RequiresFifoTopic, ValidateAwsBindings } from '../driver/bindingValidation';
import { FakeSnsGateway, FakeSqsGateway } from '../testing/fakes';
import { SeedValidAwsResources, TestAwsResources, TestPolicy, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

let sns: FakeSnsGateway;
let sqs: FakeSqsGateway;

beforeEach(() => {
    sns = new FakeSnsGateway();
    sqs = new FakeSqsGateway();
});

function messages(issues: { Severity: string; Message: string }[]): string[] {
    return issues.map((issue) => `${issue.Severity}: ${issue.Message}`);
}

describe('ExpectedMaxReceiveCount and RequiresFifoTopic', () => {
    it('uses MaxAttempts + 2, or 1000 for staged Ordered subscriptions', () => {
        expect(ExpectedMaxReceiveCount(TestPolicy({ MaxAttempts: 5, PartitionMode: 'Exclusive' }))).toBe(7);
        expect(ExpectedMaxReceiveCount(TestPolicy({ PartitionMode: 'Ordered' }))).toBe(1000);
    });

    it('requires FIFO for partitioned subscriptions or ExplicitSequence topics', () => {
        const none = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'None' } });
        expect(RequiresFifoTopic(TestTopicBinding(false), [none])).toBe(false);
        expect(RequiresFifoTopic(TestTopicBinding(false), [TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } })])).toBe(true);
        expect(RequiresFifoTopic(TestTopicBinding(false, { OrderingMode: 'ExplicitSequence' }), [none])).toBe(true);
    });
});

describe('ValidateAwsBindings', () => {
    it('reports nothing for resources provisioned as expected', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { eventType: ['unsubscribe'] } });
        SeedValidAwsResources(sns, sqs, topic, subscription);
        expect(await ValidateAwsBindings(sns, sqs, topic, [subscription])).toEqual([]);
    });

    it('reports an unbound topic and a missing topic', async () => {
        const unbound = await ValidateAwsBindings(sns, sqs, TestTopicBinding(true, { Config: {} }), []);
        expect(messages(unbound)).toEqual([expect.stringMatching(/^Error: TopicUnbound: .*'SnsTopicArn'/)]);
        const missing = await ValidateAwsBindings(sns, sqs, TestTopicBinding(true), []);
        expect(messages(missing)).toEqual([`Error: SNS topic ${TestAwsResources(true).TopicArn} does not exist`]);
    });

    it('reports a FIFO mismatch and a partitioned subscription on a standard topic', async () => {
        const topic = TestTopicBinding(false);
        const subscription = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } });
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sns.TopicAttributes.set(TestAwsResources(false).TopicArn, { FifoTopic: 'true' });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Error: SNS topic FifoTopic is true but the topic binding says IsFifo false',
            'Error: Topic must be FIFO: it has Exclusive/Ordered subscriptions or uses ExplicitSequence',
        ]);
    });

    it('reports missing queues', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        sns.TopicAttributes.set(TestAwsResources(true).TopicArn, { FifoTopic: 'true' });
        const issues = messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]));
        expect(issues).toContain(`Error: SQS queue ${TestAwsResources(true).QueueUrl} does not exist`);
        expect(issues).toContain(`Error: SQS dead-letter queue ${TestAwsResources(true).DeadLetterQueueUrl} does not exist`);
    });

    it('reports a redrive policy that targets the wrong queue or count', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { PartitionMode: 'Ordered' } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sqs.AddQueue(resources.QueueUrl, {
            Fifo: true, VisibilityTimeoutSeconds: 60,
            Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: 'arn:aws:sqs:us-east-1:123456789012:other.fifo', maxReceiveCount: 7 }), MaximumMessageSize: '262144' },
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            `Error: Redrive policy targets arn:aws:sqs:us-east-1:123456789012:other.fifo, expected ${resources.DeadLetterQueueArn}`,
            'Error: Redrive maxReceiveCount is 7, expected 1000',
        ]);
    });

    it('warns about a short visibility timeout and a small maximum message size', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { LeaseSeconds: 120 } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sqs.AddQueue(resources.QueueUrl, {
            Fifo: true, VisibilityTimeoutSeconds: 60,
            Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: resources.DeadLetterQueueArn, maxReceiveCount: 7 }), MaximumMessageSize: '65536' },
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Warning: Queue VisibilityTimeout 60 is below LeaseSeconds 120',
            'Warning: Queue MaximumMessageSize 65536 is below 262144',
        ]);
    });

    it('reports SNS subscription drift', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { eventType: ['unsubscribe'] } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sns.SubscriptionAttributes.set(resources.SnsSubscriptionArn, {
            RawMessageDelivery: 'false', Endpoint: 'arn:aws:sqs:us-east-1:123456789012:elsewhere.fifo', TopicArn: resources.TopicArn,
            FilterPolicy: '{"eventType":["click"]}',
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Error: SNS subscription RawMessageDelivery must be true',
            `Error: SNS subscription endpoint is arn:aws:sqs:us-east-1:123456789012:elsewhere.fifo, expected ${resources.QueueArn}`,
            'Error: SNS filter policy {"eventType":["click"]} differs from the subscription filter {"eventType":["unsubscribe"]}',
        ]);
    });

    it('only warns when the SNS subscription ARN is not bound', async () => {
        const topic = TestTopicBinding(true);
        const bound = TestSubscriptionBinding(true);
        SeedValidAwsResources(sns, sqs, topic, bound);
        const { SnsSubscriptionArn: _omitted, ...config } = bound.Config;
        const unbound = { ...bound, Config: config };
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [unbound]))).toEqual([
            'Warning: SnsSubscriptionArn is not bound; raw delivery and filter policy were not checked',
        ]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/aws && pnpm test capabilities publish bindingValidation`
Expected: FAIL — unresolved imports `../driver/capabilities`, `../driver/publish`, `../driver/bindingValidation`, `../testing/fixtures`.

- [ ] **Step 3: Write `src/driver/capabilities.ts`**

```typescript
import type { TransportCapabilities } from '@memberjunction/work-queue-core';

export const AWS_TRANSPORT_NAME = 'AWS';

export const AWS_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    DetectsMessageIDDuplicates: false,
    PersistsProgress: false,
    SupportsOrdered: false,
    SupportsExternalHosts: true,
    CancelPending: false,
    ListPartitions: false,
    PeekDeadLetters: 'BestEffort',
    ReplaySingleDeadLetter: true,
    CompletedCounts: false,
    MaxRetryDelaySeconds: 43200,
};
```

- [ ] **Step 4: Write `src/driver/publish.ts`**

```typescript
import {
    WorkQueueConfigurationError, type PublishResult, type TopicBinding, type WorkMessage,
} from '@memberjunction/work-queue-core';
import { ReadAwsTopicConfig } from '../config';
import { MessageGroupIdFor, SerializeEnvelope } from '../envelope';
import { AwsGatewayError, ToGatewayError } from '../gateway/errors';
import type { SnsGateway, SnsPublishEntry, SnsPublishEntryResult } from '../gateway/SnsGateway';

export const SNS_BATCH_MAX_ENTRIES = 10;
export const SNS_REQUEST_MAX_BYTES = 262_144;
export const MAX_MESSAGE_ATTRIBUTES = 10;

export function BuildPublishEntry(message: WorkMessage, index: number, isFifo: boolean): SnsPublishEntry {
    const entry: SnsPublishEntry = { Id: String(index), Message: SerializeEnvelope(message), MessageAttributes: { ...message.Attributes } };
    if (isFifo) {
        entry.MessageGroupId = MessageGroupIdFor(message);
        entry.MessageDeduplicationId = message.MessageID;
    }
    return entry;
}

/** Bytes SNS counts toward the message size: body plus attribute names, data types and values. */
export function EntryBytes(entry: SnsPublishEntry): number {
    return Object.entries(entry.MessageAttributes).reduce(
        (total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength('String') + Buffer.byteLength(value),
        Buffer.byteLength(entry.Message),
    );
}

export function ChunkEntries(entries: SnsPublishEntry[]): SnsPublishEntry[][] {
    const chunks: SnsPublishEntry[][] = [];
    let current: SnsPublishEntry[] = [];
    let currentBytes = 0;
    for (const entry of entries) {
        const bytes = EntryBytes(entry);
        if (current.length === SNS_BATCH_MAX_ENTRIES || (current.length > 0 && currentBytes + bytes > SNS_REQUEST_MAX_BYTES)) {
            chunks.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(entry);
        currentBytes += bytes;
    }
    if (current.length > 0) {
        chunks.push(current);
    }
    return chunks;
}

function rejected(messageID: string, code: string, message: string, retryable: boolean): PublishResult {
    return { MessageID: messageID, Status: 'Rejected', Error: { Code: code, Message: message, Retryable: retryable } };
}

function fromEntryResult(messageID: string, result: SnsPublishEntryResult): PublishResult {
    if (result.Kind === 'Published') {
        return { MessageID: messageID, Status: 'Accepted' };
    }
    return result.SenderFault
        ? rejected(messageID, 'TransportRejected', `SNS ${result.Code}: ${result.Message}`, false)
        : rejected(messageID, 'TransportUnavailable', `SNS ${result.Code}: ${result.Message}`, true);
}

function precheck(message: WorkMessage, entry: SnsPublishEntry, topic: TopicBinding): PublishResult | null {
    if (Object.keys(message.Attributes).length > MAX_MESSAGE_ATTRIBUTES) {
        return rejected(message.MessageID, 'InvalidAttributes', `At most ${MAX_MESSAGE_ATTRIBUTES} attributes are allowed`, false);
    }
    const limit = Math.min(topic.MaxPayloadBytes, SNS_REQUEST_MAX_BYTES);
    const bytes = EntryBytes(entry);
    return bytes > limit ? rejected(message.MessageID, 'PayloadTooLarge', `Envelope is ${bytes} bytes; the limit is ${limit}`, false) : null;
}

async function publishChunk(gateway: SnsGateway, topicArn: string, chunk: SnsPublishEntry[], ids: Map<string, string>): Promise<PublishResult[]> {
    try {
        const results = await gateway.PublishBatch(topicArn, chunk);
        return results.map((result) => fromEntryResult(ids.get(result.Id) ?? result.Id, result));
    } catch (error) {
        const mapped: AwsGatewayError = ToGatewayError(error, 'SNS PublishBatch');
        return chunk.map((entry) => rejected(ids.get(entry.Id) ?? entry.Id, 'TransportUnavailable', mapped.message, mapped.Retryable));
    }
}

/** Publishes envelopes to the topic's SNS topic. Results are positionally aligned with messages. */
export async function PublishToSns(gateway: SnsGateway, topic: TopicBinding, messages: WorkMessage[]): Promise<PublishResult[]> {
    let topicArn: string;
    try {
        topicArn = ReadAwsTopicConfig(topic.Config).SnsTopicArn;
    } catch (error) {
        const reason = error instanceof WorkQueueConfigurationError ? error.message : String(error);
        return messages.map((m) => rejected(m.MessageID, 'TopicUnbound', reason, true));
    }
    const results = new Map<string, PublishResult>();
    const ids = new Map<string, string>();
    const sendable: SnsPublishEntry[] = [];
    messages.forEach((message, index) => {
        const entry = BuildPublishEntry(message, index, topic.IsFifo);
        const failure = precheck(message, entry, topic);
        if (failure) {
            results.set(entry.Id, failure);
        } else {
            ids.set(entry.Id, message.MessageID);
            sendable.push(entry);
        }
    });
    for (const chunk of ChunkEntries(sendable)) {
        const chunkResults = await publishChunk(gateway, topicArn, chunk, ids);
        chunk.forEach((entry, i) => results.set(entry.Id, chunkResults[i]));
    }
    return messages.map((message, index) => results.get(String(index)) ?? rejected(message.MessageID, 'TransportUnavailable', 'No result', true));
}
```

- [ ] **Step 5: Write `src/driver/bindingValidation.ts`**

```typescript
import type {
    BindingValidationIssue, SubscriptionBinding, SubscriptionPolicy, TopicBinding,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig, ReadAwsTopicConfig, type AwsSubscriptionConfig } from '../config';
import { NormalizeSnsFilterPolicy, SnsFilterPolicyFor } from '../filterPolicy';
import type { SnsGateway } from '../gateway/SnsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';

export const STAGED_MAX_RECEIVE_COUNT = 1000;
const REQUIRED_MAX_MESSAGE_SIZE = 262_144;

type IssueSink = (severity: 'Error' | 'Warning', message: string) => void;

export function ExpectedMaxReceiveCount(policy: SubscriptionPolicy): number {
    return policy.PartitionMode === 'Ordered' ? STAGED_MAX_RECEIVE_COUNT : policy.MaxAttempts + 2;
}

export function RequiresFifoTopic(topic: TopicBinding, subscriptions: SubscriptionBinding[]): boolean {
    return topic.OrderingMode === 'ExplicitSequence' || subscriptions.some((s) => s.Policy.PartitionMode !== 'None');
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function validateTopic(sns: SnsGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[], add: IssueSink): Promise<string | null> {
    let topicArn: string;
    try {
        topicArn = ReadAwsTopicConfig(topic.Config).SnsTopicArn;
    } catch (error) {
        add('Error', `TopicUnbound: ${describe(error)}`);
        return null;
    }
    const attributes = await sns.GetTopicAttributes(topicArn);
    if (attributes === null) {
        add('Error', `SNS topic ${topicArn} does not exist`);
        return null;
    }
    if ((attributes['FifoTopic'] === 'true') !== topic.IsFifo) {
        add('Error', `SNS topic FifoTopic is ${attributes['FifoTopic'] === 'true'} but the topic binding says IsFifo ${topic.IsFifo}`);
    }
    if (!topic.IsFifo && RequiresFifoTopic(topic, subscriptions)) {
        add('Error', 'Topic must be FIFO: it has Exclusive/Ordered subscriptions or uses ExplicitSequence');
    }
    return topicArn;
}

function readRedrive(value: string | undefined): { deadLetterTargetArn: string | null; maxReceiveCount: number | null } {
    try {
        const parsed: unknown = value ? JSON.parse(value) : {};
        const target = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'deadLetterTargetArn') : undefined;
        const count = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'maxReceiveCount') : undefined;
        return { deadLetterTargetArn: typeof target === 'string' ? target : null, maxReceiveCount: count === undefined ? null : Number(count) };
    } catch {
        return { deadLetterTargetArn: null, maxReceiveCount: null };
    }
}

async function validateQueues(sqs: SqsGateway, binding: SubscriptionBinding, config: AwsSubscriptionConfig, add: IssueSink): Promise<void> {
    const queue = await sqs.GetAttributes(config.QueueUrl);
    if (queue === null) {
        add('Error', `SQS queue ${config.QueueUrl} does not exist`);
    } else {
        if ((queue['FifoQueue'] === 'true') !== config.IsFifo) {
            add('Error', `SQS queue FifoQueue is ${queue['FifoQueue'] === 'true'} but the binding says IsFifo ${config.IsFifo}`);
        }
        const redrive = readRedrive(queue['RedrivePolicy']);
        if (redrive.deadLetterTargetArn !== config.DeadLetterQueueArn) {
            add('Error', `Redrive policy targets ${redrive.deadLetterTargetArn ?? 'nothing'}, expected ${config.DeadLetterQueueArn}`);
        }
        const expectedCount = ExpectedMaxReceiveCount(binding.Policy);
        if (redrive.maxReceiveCount !== expectedCount) {
            add('Error', `Redrive maxReceiveCount is ${redrive.maxReceiveCount ?? 'unset'}, expected ${expectedCount}`);
        }
        const visibility = Number(queue['VisibilityTimeout'] ?? '0');
        if (visibility < binding.Policy.LeaseSeconds) {
            add('Warning', `Queue VisibilityTimeout ${visibility} is below LeaseSeconds ${binding.Policy.LeaseSeconds}`);
        }
        const maxSize = Number(queue['MaximumMessageSize'] ?? '0');
        if (maxSize < REQUIRED_MAX_MESSAGE_SIZE) {
            add('Warning', `Queue MaximumMessageSize ${maxSize} is below ${REQUIRED_MAX_MESSAGE_SIZE}`);
        }
    }
    const deadLetter = await sqs.GetAttributes(config.DeadLetterQueueUrl);
    if (deadLetter === null) {
        add('Error', `SQS dead-letter queue ${config.DeadLetterQueueUrl} does not exist`);
    } else if ((deadLetter['FifoQueue'] === 'true') !== config.IsFifo) {
        add('Error', `SQS dead-letter queue FifoQueue does not match IsFifo ${config.IsFifo}`);
    }
}

async function validateSnsSubscription(sns: SnsGateway, binding: SubscriptionBinding, config: AwsSubscriptionConfig, topicArn: string, add: IssueSink): Promise<void> {
    if (config.SnsSubscriptionArn === null) {
        add('Warning', 'SnsSubscriptionArn is not bound; raw delivery and filter policy were not checked');
        return;
    }
    const attributes = await sns.GetSubscriptionAttributes(config.SnsSubscriptionArn);
    if (attributes === null) {
        add('Error', `SNS subscription ${config.SnsSubscriptionArn} does not exist`);
        return;
    }
    if (attributes['RawMessageDelivery'] !== 'true') {
        add('Error', 'SNS subscription RawMessageDelivery must be true');
    }
    if (attributes['Endpoint'] !== config.QueueArn) {
        add('Error', `SNS subscription endpoint is ${attributes['Endpoint'] ?? 'unset'}, expected ${config.QueueArn}`);
    }
    if (attributes['TopicArn'] !== topicArn) {
        add('Error', `SNS subscription belongs to ${attributes['TopicArn'] ?? 'unknown'}, expected ${topicArn}`);
    }
    const scope = attributes['FilterPolicyScope'];
    if (scope !== undefined && scope !== 'MessageAttributes') {
        add('Error', `SNS filter policy scope is ${scope}, expected MessageAttributes`);
    }
    const actual = NormalizeSnsFilterPolicy(attributes['FilterPolicy']);
    const expected = SnsFilterPolicyFor(binding.Filter);
    if (actual !== expected) {
        add('Error', `SNS filter policy ${actual ?? 'none'} differs from the subscription filter ${expected ?? 'none'}`);
    }
}

async function validateSubscription(sns: SnsGateway, sqs: SqsGateway, topic: TopicBinding, topicArn: string | null, binding: SubscriptionBinding, add: IssueSink): Promise<void> {
    let config: AwsSubscriptionConfig;
    try {
        config = ReadAwsSubscriptionConfig(binding.Config);
    } catch (error) {
        add('Error', `SubscriptionUnbound: ${describe(error)}`);
        return;
    }
    if (config.IsFifo !== topic.IsFifo) {
        add('Error', `Subscription IsFifo ${config.IsFifo} does not match topic IsFifo ${topic.IsFifo}`);
    }
    await validateQueues(sqs, binding, config, add);
    if (topicArn !== null) {
        await validateSnsSubscription(sns, binding, config, topicArn, add);
    }
}

/** Checks that pre-provisioned SNS/SQS resources exist and match the topology (FIFO, redrive, raw delivery, filter). */
export async function ValidateAwsBindings(sns: SnsGateway, sqs: SqsGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
    const issues: BindingValidationIssue[] = [];
    const sinkFor = (subject: string): IssueSink => (severity, message) => issues.push({ Severity: severity, Subject: subject, Message: message });
    try {
        const topicArn = await validateTopic(sns, topic, subscriptions, sinkFor(`topic:${topic.TopicName}`));
        for (const subscription of subscriptions) {
            await validateSubscription(sns, sqs, topic, topicArn, subscription, sinkFor(`subscription:${subscription.Policy.SubscriptionName}`));
        }
    } catch (error) {
        issues.push({ Severity: 'Error', Subject: `topic:${topic.TopicName}`, Message: `Validation could not complete: ${describe(error)}` });
    }
    return issues;
}
```

- [ ] **Step 6: Write `src/testing/fixtures.ts`**

```typescript
import type {
    HostType, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { ExpectedMaxReceiveCount } from '../driver/bindingValidation';
import { SnsFilterPolicyFor } from '../filterPolicy';
import type { FakeSnsGateway, FakeSqsGateway } from './fakes';

export interface TestAwsResourceSet {
    TopicArn: string;
    QueueUrl: string;
    QueueArn: string;
    DeadLetterQueueUrl: string;
    DeadLetterQueueArn: string;
    SnsSubscriptionArn: string;
    IsFifo: boolean;
}

export interface TestSubscriptionOptions {
    Policy?: Partial<SubscriptionPolicy>;
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
}

const ACCOUNT = '123456789012';
const REGION = 'us-east-1';

export function TestAwsResources(isFifo: boolean): TestAwsResourceSet {
    const fifo = isFifo ? '.fifo' : '';
    const topicArn = `arn:aws:sns:${REGION}:${ACCOUNT}:mj-wq-test-email-events${fifo}`;
    return {
        TopicArn: topicArn,
        QueueUrl: `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/mj-wq-test-email-unsubscribe${fifo}`,
        QueueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:mj-wq-test-email-unsubscribe${fifo}`,
        DeadLetterQueueUrl: `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/mj-wq-test-email-unsubscribe-dlq${fifo}`,
        DeadLetterQueueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:mj-wq-test-email-unsubscribe-dlq${fifo}`,
        SnsSubscriptionArn: `${topicArn}:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0`,
        IsFifo: isFifo,
    };
}

export function TestPolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'email.unsubscribe', TopicName: 'email.events', OrderingMode: 'PublishOrder', PartitionMode: 'Exclusive',
        MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function TestTopicBinding(isFifo: boolean = true, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'email.events', OrderingMode: 'PublishOrder', IsFifo: isFifo, MaxPayloadBytes: 262_144,
        Config: { SnsTopicArn: TestAwsResources(isFifo).TopicArn },
        ...overrides,
    };
}

export function TestSubscriptionBinding(isFifo: boolean = true, options: TestSubscriptionOptions = {}): SubscriptionBinding {
    const r = TestAwsResources(isFifo);
    return {
        Policy: TestPolicy({ ...(isFifo ? {} : { PartitionMode: 'None' }), ...options.Policy }),
        Filter: options.Filter ?? null,
        HostType: options.HostType ?? 'External',
        Config: options.Config ?? {
            Region: REGION, QueueUrl: r.QueueUrl, QueueArn: r.QueueArn, DeadLetterQueueUrl: r.DeadLetterQueueUrl,
            DeadLetterQueueArn: r.DeadLetterQueueArn, IsFifo: isFifo, SnsSubscriptionArn: r.SnsSubscriptionArn,
        },
    };
}

export function TestMessage(index: number, overrides: Partial<WorkMessage> = {}): WorkMessage {
    return {
        MessageID: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        Topic: 'email.events',
        Attributes: { eventType: 'unsubscribe' },
        Payload: { index },
        PublishedAt: '2026-09-16T12:00:00.000Z',
        ...overrides,
    };
}

/** Creates the queue, dead-letter queue, topic and SNS subscription exactly as the Terraform module would. */
export function SeedValidAwsResources(sns: FakeSnsGateway, sqs: FakeSqsGateway, topic: TopicBinding, subscription: SubscriptionBinding): void {
    const r = TestAwsResources(topic.IsFifo);
    sqs.AddQueue(r.QueueUrl, {
        Fifo: topic.IsFifo,
        VisibilityTimeoutSeconds: subscription.Policy.LeaseSeconds,
        Attributes: {
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: r.DeadLetterQueueArn, maxReceiveCount: ExpectedMaxReceiveCount(subscription.Policy) }),
            MaximumMessageSize: '262144',
            QueueArn: r.QueueArn,
        },
    });
    sqs.AddQueue(r.DeadLetterQueueUrl, { Fifo: topic.IsFifo, Attributes: { MaximumMessageSize: '262144', QueueArn: r.DeadLetterQueueArn } });
    sns.TopicAttributes.set(r.TopicArn, { FifoTopic: String(topic.IsFifo), TopicArn: r.TopicArn });
    const policy = SnsFilterPolicyFor(subscription.Filter);
    sns.SubscriptionAttributes.set(r.SnsSubscriptionArn, {
        RawMessageDelivery: 'true', Endpoint: r.QueueArn, TopicArn: r.TopicArn, FilterPolicyScope: 'MessageAttributes',
        ...(policy ? { FilterPolicy: policy } : {}),
    });
}
```

- [ ] **Step 7: Export the modules**

Replace `packages/WorkQueue/aws/src/index.ts` with:

```typescript
export * from './config';
export * from './names';
export * from './envelope';
export * from './filterPolicy';
export * from './gateway/errors';
export * from './gateway/SnsGateway';
export * from './gateway/SqsGateway';
export * from './gateway/SdkSnsGateway';
export * from './gateway/SdkSqsGateway';
export * from './gateway/clients';
export * from './driver/capabilities';
export * from './driver/publish';
export * from './driver/bindingValidation';
```

Replace `packages/WorkQueue/aws/src/testing/index.ts` with:

```typescript
export * from './fakes';
export * from './fixtures';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — previous 52, plus capabilities (1), publish (9), bindingValidation (10). Total 72.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/aws/src
git commit -m "feat(work-queue-aws): SNS publish mapping, binding validation and shared test fixtures"
```

---

### Task 5: `SqsTransportConsumer` and the dead-letter writer

**Files:**
- Create: `packages/WorkQueue/aws/src/consumer/deadLetter.ts`, `src/consumer/SqsTransportConsumer.ts`
- Modify: `packages/WorkQueue/aws/src/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/deadLetter.test.ts`, `SqsTransportConsumer.test.ts`

**Interfaces:**
- Consumes: `ITransportConsumer`, `ReceivedDelivery`, `SettleResult`, `SubscriptionBinding`, `WorkJson`, `WorkMessage`, `WorkProgress` (core); `ReadAwsSubscriptionConfig`, `AwsSubscriptionConfig`, `ParseEnvelopeBody` (Task 1); `SqsGateway`, `SqsReceivedMessage`, `AwsGatewayError`, `ToGatewayError`, `FakeSqsGateway` (Task 3); `TestAwsResources`, `TestSubscriptionBinding`, `TestMessage` (Task 4).
- Produces:
  - `DEAD_LETTER_ATTRIBUTES = { Reason: 'mj_dead_letter_reason', LastError: 'mj_last_error', Attempts: 'mj_attempts', DeadLetteredAt: 'mj_dead_lettered_at', SourceQueue: 'mj_source_queue' }`, `REPLAY_ATTRIBUTE = 'mj_replay'`, `DEAD_LETTER_REASON_MAX_CHARS = 500`, `LAST_ERROR_MAX_CHARS = 2000`
  - `interface DeadLetterRequest { Message: SqsReceivedMessage; Reason: string; Error: string | null; Attempts: number }`
  - `SendToDeadLetterQueue(gateway: SqsGateway, config: AwsSubscriptionConfig, request: DeadLetterRequest, now: Date): Promise<string>`
  - `SQS_MAX_INVISIBLE_SECONDS = 43200`
  - `interface SqsConsumerOptions { Now?: () => number }`
  - `class SqsTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload>` — `constructor(gateway: SqsGateway, binding: SubscriptionBinding, options?: SqsConsumerOptions)`, plus `Adopt(message: SqsReceivedMessage): Promise<ReceivedDelivery<TPayload> | null>` (used by the Lambda adapter, Task 7) and `get TrackedCount(): number`

Settle mapping (03 §5, 02 §4.4):

| Operation | SQS call | Result |
| --- | --- | --- |
| `Receive` | `ReceiveMessage` (visibility = `LeaseSeconds`, ≤ 10) → `Adopt` each | valid envelopes as deliveries |
| `Adopt` — body is not an envelope | dead-letter `InvalidEnvelope` + `DeleteMessage` | `null` |
| `Adopt` — `ReceiveCount > MaxAttempts` (crash loop: never settled) | dead-letter `LeaseExpired` + `DeleteMessage` | `null` |
| `ExtendLease` | `ChangeMessageVisibility(min(lease, 12 h window left))` | `Held`; `Lost` on stale receipt, exhausted 12 h window or non-retryable error; `Held` on a retryable error (next heartbeat retries) |
| `Complete` | `DeleteMessage` | `Settled Completed` / `LeaseLost` / `Failed` |
| `Retry` | `ChangeMessageVisibility(min(delay, 12 h window left))` | `Settled Pending` / `LeaseLost` / `Failed` |
| `DeadLetter` | `SendMessage` to the DLQ with `mj_*` attributes, then `DeleteMessage` | `Settled DeadLettered` / `LeaseLost` (a DLQ copy exists; SQS will redeliver, so a second dead letter is possible) / `Failed` (send failed; message untouched) |
| `Release` | `ChangeMessageVisibility(0)` | `Settled Pending` / `LeaseLost` |

`DeliveryID` is the SQS `MessageId`; `LeaseToken` is the receipt handle; `Attempt` is `ApproximateReceiveCount`
(a replayed message is a new SQS message, so its attempts restart at 1); `IsReplay` is `mj_replay = '1'`.
Dead-letter FIFO IDs: `MessageGroupId` = the original group (or the SQS `MessageId`), `MessageDeduplicationId` =
`<SQS MessageId>:dl` — stable across retries of the same delivery, distinct for a replayed copy.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/deadLetter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ReadAwsSubscriptionConfig } from '../config';
import { DEAD_LETTER_ATTRIBUTES, LAST_ERROR_MAX_CHARS, SendToDeadLetterQueue } from '../consumer/deadLetter';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestSubscriptionBinding } from '../testing/fixtures';

describe('SendToDeadLetterQueue', () => {
    it('copies the body with reason attributes and FIFO IDs', async () => {
        const r = TestAwsResources(true);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(true).Config);
        const message = { MessageId: 'sqs-1', ReceiptHandle: 'rh', Body: '{"x":1}', ReceiveCount: 3, MessageGroupId: 'subscriber-9', SentTimestamp: 1, Attributes: {} };
        await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'Fatal', Error: 'e'.repeat(5000), Attempts: 3 }, new Date('2026-09-16T12:00:00.000Z'));
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Body).toBe('{"x":1}');
        expect(copy.GroupId).toBe('subscriber-9');
        expect(copy.DeduplicationId).toBe('sqs-1:dl');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('Fatal');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toHaveLength(LAST_ERROR_MAX_CHARS);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('3');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]).toBe('2026-09-16T12:00:00.000Z');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.SourceQueue]).toBe(r.QueueArn);
    });

    it('omits FIFO IDs and the last error on a standard queue when there is no error', async () => {
        const r = TestAwsResources(false);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: false });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(false).Config);
        const message = { MessageId: 'sqs-2', ReceiptHandle: 'rh', Body: 'raw', ReceiveCount: 1, MessageGroupId: null, SentTimestamp: 1, Attributes: {} };
        await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'InvalidEnvelope', Error: null, Attempts: 1 }, new Date());
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.GroupId).toBeNull();
        expect(copy.DeduplicationId).toBeNull();
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toBeUndefined();
    });
});
```

`packages/WorkQueue/aws/src/__tests__/SqsTransportConsumer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { AwsGatewayError } from '../gateway/errors';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

const r = TestAwsResources(true);
let sqs: FakeSqsGateway;
let binding: SubscriptionBinding;
let consumer: SqsTransportConsumer;
const signal = new AbortController().signal;

function withPolicy(overrides: Partial<SubscriptionBinding['Policy']>): SqsTransportConsumer {
    binding = TestSubscriptionBinding(true, { Policy: overrides });
    return new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now });
}

async function send(index: number, attributes: Record<string, string> = {}): Promise<void> {
    await sqs.Send({ QueueUrl: r.QueueUrl, Body: JSON.stringify(TestMessage(index)), MessageGroupId: `g-${index}`, MessageDeduplicationId: `d-${index}`, Attributes: attributes });
}

beforeEach(() => {
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
    consumer = withPolicy({});
});

describe('SqsTransportConsumer.Receive', () => {
    it('returns deliveries with attempt, replay flag and lease expiry', async () => {
        await send(1);
        await send(2, { [REPLAY_ATTRIBUTE]: '1' });
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
        expect(deliveries[0]).toMatchObject({ Attempt: 1, IsReplay: false, LeaseToken: expect.stringMatching(/^rh-/) });
        expect(deliveries[1].IsReplay).toBe(true);
        expect(deliveries[0].LeaseExpiresAt.getTime()).toBe(sqs.Now + 60_000);
        expect(consumer.TrackedCount).toBe(2);
    });

    it('dead-letters a body that is not an envelope and does not return it', async () => {
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: 'not json', MessageGroupId: 'g', MessageDeduplicationId: 'bad' });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(sqs.Messages(r.DeadLetterQueueUrl)[0].Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');
    });

    it('dead-letters a message received more than MaxAttempts times without settling', async () => {
        consumer = withPolicy({ MaxAttempts: 2 });
        await send(1);
        for (let i = 0; i < 2; i++) {
            await consumer.Receive(1, 0, signal);
            sqs.Advance(61);
        }
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('LeaseExpired');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('3');
    });
});

describe('SqsTransportConsumer settles', () => {
    it('completes by deleting, and reports a stale receipt as lease lost', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
    });

    it('retries by hiding the message for the delay; it returns with the next attempt', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Retry(delivery, 120, 'boom')).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' });
        sqs.Advance(119);
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);
        sqs.Advance(2);
        const [again] = await consumer.Receive(1, 0, signal);
        expect(again.Attempt).toBe(2);
    });

    it('caps a retry delay at what is left of the 12-hour window', async () => {
        consumer = withPolicy({ LeaseSeconds: 43200 });
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.Advance(43000);
        await consumer.Retry(delivery, 900, 'late');
        expect(sqs.Messages(r.QueueUrl)[0].VisibleAt).toBe(sqs.Now + 200_000);
    });

    it('releases by making the message visible immediately', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Release(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' });
        expect(await consumer.Receive(1, 0, signal)).toHaveLength(1);
    });
});

describe('SqsTransportConsumer.ExtendLease', () => {
    it('holds while the receipt is current and loses it after another receive', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Held');
        sqs.Advance(61);
        await new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now }).Receive(1, 0, signal);
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
    });

    it('loses the lease once the 12-hour window is used, without calling SQS', async () => {
        consumer = withPolicy({ LeaseSeconds: 43200 });
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.Advance(43200);
        const callsBefore = sqs.Calls.length;
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
        expect(sqs.Calls).toHaveLength(callsBefore);
    });

    it('holds on a retryable SQS error and loses on a non-retryable one', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.FailNext('ChangeVisibility', new AwsGatewayError('slow down', 'Throttling', true));
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Held');
        sqs.FailNext('ChangeVisibility', new AwsGatewayError('denied', 'AccessDenied', false));
        expect(await consumer.ExtendLease(delivery, 60)).toBe('Lost');
    });
});

describe('SqsTransportConsumer.DeadLetter', () => {
    it('copies to the dead-letter queue, then deletes', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.DeadLetter(delivery, 'MaxAttemptsExceeded', 'last failure')).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'DeadLettered' });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Body).toBe(JSON.stringify(TestMessage(1)));
        expect(copy.GroupId).toBe('g-1');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toBe('last failure');
        expect(consumer.TrackedCount).toBe(0);
    });

    it('fails without touching the message when the dead-letter send fails', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.FailNext('Send', new AwsGatewayError('SQS SendMessage failed: down', 'InternalError', true));
        expect(await consumer.DeadLetter(delivery, 'Fatal', null)).toEqual({ Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: 'SQS SendMessage failed: down' });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(1);
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/aws && pnpm test deadLetter SqsTransportConsumer`
Expected: FAIL — unresolved imports `../consumer/deadLetter`, `../consumer/SqsTransportConsumer`.

- [ ] **Step 3: Write `src/consumer/deadLetter.ts`**

```typescript
import type { AwsSubscriptionConfig } from '../config';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';

export const DEAD_LETTER_ATTRIBUTES = {
    Reason: 'mj_dead_letter_reason',
    LastError: 'mj_last_error',
    Attempts: 'mj_attempts',
    DeadLetteredAt: 'mj_dead_lettered_at',
    SourceQueue: 'mj_source_queue',
} as const;

/** Set to '1' on a message the operator replayed from the dead-letter queue. */
export const REPLAY_ATTRIBUTE = 'mj_replay';

export const DEAD_LETTER_REASON_MAX_CHARS = 500;
export const LAST_ERROR_MAX_CHARS = 2000;

export interface DeadLetterRequest {
    Message: SqsReceivedMessage;
    Reason: string;
    Error: string | null;
    Attempts: number;
}

/** Copies a received message to the subscription's dead-letter queue. Returns the copy's SQS MessageId. */
export async function SendToDeadLetterQueue(gateway: SqsGateway, config: AwsSubscriptionConfig, request: DeadLetterRequest, now: Date): Promise<string> {
    const attributes: Record<string, string> = {
        [DEAD_LETTER_ATTRIBUTES.Reason]: request.Reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS),
        [DEAD_LETTER_ATTRIBUTES.Attempts]: String(request.Attempts),
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: now.toISOString(),
        [DEAD_LETTER_ATTRIBUTES.SourceQueue]: config.QueueArn,
    };
    if (request.Error !== null && request.Error !== '') {
        attributes[DEAD_LETTER_ATTRIBUTES.LastError] = request.Error.slice(0, LAST_ERROR_MAX_CHARS);
    }
    return gateway.Send({
        QueueUrl: config.DeadLetterQueueUrl,
        Body: request.Message.Body,
        Attributes: attributes,
        ...(config.IsFifo
            ? { MessageGroupId: request.Message.MessageGroupId ?? request.Message.MessageId, MessageDeduplicationId: `${request.Message.MessageId}:dl` }
            : {}),
    });
}
```

- [ ] **Step 4: Write `src/consumer/SqsTransportConsumer.ts`**

```typescript
import type {
    ITransportConsumer, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkMessage, WorkProgress,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig, type AwsSubscriptionConfig } from '../config';
import { ParseEnvelopeBody } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';
import { REPLAY_ATTRIBUTE, SendToDeadLetterQueue } from './deadLetter';

export const SQS_MAX_INVISIBLE_SECONDS = 43200;

export interface SqsConsumerOptions {
    /** Clock, epoch ms. Defaults to Date.now. */
    Now?: () => number;
}

interface Tracked {
    Raw: SqsReceivedMessage;
    ReceivedAt: number;
}

export class SqsTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly config: AwsSubscriptionConfig;
    private readonly now: () => number;
    private readonly tracked = new Map<string, Tracked>();

    constructor(private readonly gateway: SqsGateway, private readonly binding: SubscriptionBinding, options: SqsConsumerOptions = {}) {
        this.config = ReadAwsSubscriptionConfig(binding.Config);
        this.now = options.Now ?? Date.now;
    }

    public get TrackedCount(): number {
        return this.tracked.size;
    }

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const messages = await this.gateway.Receive({
            QueueUrl: this.config.QueueUrl, MaxMessages: max, WaitTimeSeconds: waitSeconds,
            VisibilityTimeoutSeconds: this.binding.Policy.LeaseSeconds, Signal: signal,
        });
        const deliveries: ReceivedDelivery<TPayload>[] = [];
        for (const message of messages) {
            const delivery = await this.Adopt(message);
            if (delivery) {
                deliveries.push(delivery);
            }
        }
        return deliveries;
    }

    /** Turns a received SQS message into a delivery; poison and crash-looping messages are dead-lettered and yield null. */
    public async Adopt(message: SqsReceivedMessage): Promise<ReceivedDelivery<TPayload> | null> {
        const envelope = ParseEnvelopeBody(message.Body);
        if (envelope === null) {
            await this.deadLetterAndDelete(message, 'InvalidEnvelope', 'Body is not a work-queue envelope');
            return null;
        }
        if (message.ReceiveCount > this.binding.Policy.MaxAttempts) {
            await this.deadLetterAndDelete(message, 'LeaseExpired', `Received ${message.ReceiveCount} times without being settled`);
            return null;
        }
        const receivedAt = this.now();
        this.tracked.set(message.MessageId, { Raw: message, ReceivedAt: receivedAt });
        return {
            // Trust boundary: the envelope shape is validated; the payload's shape is the handler's to validate.
            Message: envelope as WorkMessage<TPayload>,
            DeliveryID: message.MessageId,
            LeaseToken: message.ReceiptHandle,
            Attempt: message.ReceiveCount,
            IsReplay: message.Attributes[REPLAY_ATTRIBUTE] === '1',
            LeaseExpiresAt: new Date(receivedAt + this.binding.Policy.LeaseSeconds * 1000),
        };
    }

    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, _progress?: WorkProgress): Promise<'Held' | 'Lost'> {
        const seconds = Math.min(leaseSeconds, this.windowLeftSeconds(delivery));
        if (seconds <= 0) {
            return 'Lost';
        }
        try {
            return (await this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, seconds)) ? 'Held' : 'Lost';
        } catch (error) {
            return ToGatewayError(error, 'SQS ChangeMessageVisibility').Retryable ? 'Held' : 'Lost';
        }
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Completed', () => this.gateway.Delete(this.config.QueueUrl, delivery.LeaseToken));
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, _error: string): Promise<SettleResult> {
        const seconds = Math.max(0, Math.min(Math.ceil(delaySeconds), this.windowLeftSeconds(delivery)));
        return this.settle(delivery, 'Pending', () => this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, seconds));
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        const tracked = this.tracked.get(delivery.DeliveryID);
        if (!tracked) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: 'Delivery is not tracked by this consumer' };
        }
        try {
            await SendToDeadLetterQueue(this.gateway, this.config, { Message: tracked.Raw, Reason: reason, Error: error, Attempts: delivery.Attempt }, new Date(this.now()));
        } catch (sendError) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(sendError, 'SQS SendMessage').message };
        }
        return this.settle(delivery, 'DeadLettered', () => this.gateway.Delete(this.config.QueueUrl, delivery.LeaseToken));
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Pending', () => this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, 0));
    }

    public async Close(): Promise<void> {
        this.tracked.clear();
    }

    private windowLeftSeconds(delivery: ReceivedDelivery<TPayload>): number {
        const receivedAt = this.tracked.get(delivery.DeliveryID)?.ReceivedAt ?? this.now();
        return SQS_MAX_INVISIBLE_SECONDS - Math.floor((this.now() - receivedAt) / 1000);
    }

    private async settle(delivery: ReceivedDelivery<TPayload>, status: 'Completed' | 'Pending' | 'DeadLettered', write: () => Promise<boolean>): Promise<SettleResult> {
        try {
            const owned = await write();
            this.tracked.delete(delivery.DeliveryID);
            return owned
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(error, 'SQS settle').message };
        }
    }

    private async deadLetterAndDelete(message: SqsReceivedMessage, reason: string, error: string): Promise<void> {
        await SendToDeadLetterQueue(this.gateway, this.config, { Message: message, Reason: reason, Error: error, Attempts: message.ReceiveCount }, new Date(this.now()));
        await this.gateway.Delete(this.config.QueueUrl, message.ReceiptHandle);
    }
}
```

A failure inside `deadLetterAndDelete` propagates out of `Receive`/`Adopt`; the message was not deleted, so SQS
redelivers it and the redrive policy is the final backstop.

- [ ] **Step 5: Export the modules**

Append to `packages/WorkQueue/aws/src/index.ts`:

```typescript
export * from './consumer/deadLetter';
export * from './consumer/SqsTransportConsumer';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — previous 72, plus deadLetter (2), SqsTransportConsumer (12). Total 86.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/aws/src
git commit -m "feat(work-queue-aws): SQS transport consumer with visibility leases and dead-letter writer"
```

---

### Task 6: `AwsTransportOperator` and `AwsTransportDriver`

**Files:**
- Create: `packages/WorkQueue/aws/src/operator/deadLetterScan.ts`, `src/operator/AwsTransportOperator.ts`, `src/driver/AwsTransportDriver.ts`
- Modify: `packages/WorkQueue/aws/src/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/AwsTransportOperator.test.ts`, `AwsTransportDriver.test.ts`

**Interfaces:**
- Consumes: `ITransportDriver`, `ITransportOperator`, `ITransportConsumer`, `TransportCapabilities`, `TopicBinding`, `SubscriptionBinding`, `WorkMessage`, `WorkJson`, `PublishResult`, `BindingValidationIssue`, `DatabasePublishOptions`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionCondition`, `PartitionStateRecord`, `Page`, `OperatorResult` (core, 03 §5, §5.2); `AwsTransportConfig`, `ReadAwsSubscriptionConfig`, `ParseEnvelopeBody`, `MessageGroupIdFor` (Task 1); `SnsGateway`, `SqsGateway`, `SqsReceivedMessage`, `SdkSnsGateway`, `SdkSqsGateway`, `CreateAwsClients`, `AwsCredentialsOption` (Task 3); `AWS_TRANSPORT_NAME`, `AWS_TRANSPORT_CAPABILITIES`, `PublishToSns`, `ValidateAwsBindings` (Task 4); `SqsTransportConsumer`, `DEAD_LETTER_ATTRIBUTES`, `REPLAY_ATTRIBUTE` (Task 5).
- Produces:
  - `DEAD_LETTER_SCAN_LIMIT = 100`, `PEEK_VISIBILITY_SECONDS = 30`
  - `interface ScannedDeadLetter { Raw: SqsReceivedMessage; Envelope: WorkMessage | null }`
  - `ScanDeadLetters(gateway: SqsGateway, queueUrl: string, limit: number, isMatch?: (item: ScannedDeadLetter) => boolean): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }>`
  - `RestoreVisibility(gateway: SqsGateway, queueUrl: string, items: ScannedDeadLetter[], exceptReceiptHandle?: string): Promise<void>`
  - `ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord | null`
  - `REPLAY_NOTE_ATTRIBUTE = 'mj_replay_note'`, `REPLAYED_BY_ATTRIBUTE = 'mj_replayed_by'`
  - `class AwsTransportOperator implements ITransportOperator` — `constructor(sqs: SqsGateway, options?: { Now?: () => number })`
  - `class AwsTransportDriver implements ITransportDriver` — `constructor(sns: SnsGateway, sqs: SqsGateway, options?: { Now?: () => number })`, `readonly Sns: SnsGateway`, `readonly Sqs: SqsGateway`, `static Create(config: AwsTransportConfig, credentials?: AwsCredentialsOption): AwsTransportDriver`

**Best-effort dead-letter operations.** SQS has no peek or lookup by ID. Listing receives up to
`min(pageSize, 100)` dead letters with a 30-second visibility, maps them, then sets their visibility back to 0.
`NextCursor` is always `null`. Replay and discard scan up to 100 dead letters for the envelope `MessageID`
(03 §5.2: the AWS `DeliveryID` of a dead letter is the envelope `MessageID`). Replay sends the original body back to
the subscription queue with `mj_replay = '1'` (FIFO group = the envelope's group, dedup ID
`<MessageID>:replay:<epoch ms>` so a recent earlier copy does not suppress it) and deletes it from the dead-letter
queue. A replayed message goes behind anything already queued in its group, which `Exclusive` allows (no order
promise). Bulk redrive of a large dead-letter queue is done with SQS's own `StartMessageMoveTask` (see the package
README, Task 12). Discarding a pending SQS message is not supported (`CancelPending = false`); a discard whose
`MessageID` is not among the scanned dead letters answers `{ Supported: false }`. `ListPartitions` returns `null`
and `SkipSequence` answers `{ Supported: false }` — staged `Ordered` subscriptions use the Database operator.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/AwsTransportOperator.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

const r = TestAwsResources(true);
const signal = new AbortController().signal;
let sqs: FakeSqsGateway;
let binding: SubscriptionBinding;
let operator: AwsTransportOperator;

async function deadLetter(index: number, attributes: Record<string, string>, partitionKey?: string): Promise<void> {
    const message = TestMessage(index, partitionKey ? { PartitionKey: partitionKey } : {});
    await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: JSON.stringify(message), MessageGroupId: `g-${index}`, MessageDeduplicationId: `dl-${index}`, Attributes: attributes });
}

function runtimeAttributes(reason: string, attempts: string): Record<string, string> {
    return {
        [DEAD_LETTER_ATTRIBUTES.Reason]: reason,
        [DEAD_LETTER_ATTRIBUTES.Attempts]: attempts,
        [DEAD_LETTER_ATTRIBUTES.LastError]: 'boom',
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: '2026-09-16T12:00:00.000Z',
    };
}

beforeEach(() => {
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
    binding = TestSubscriptionBinding(true);
    operator = new AwsTransportOperator(sqs, { Now: () => sqs.Now });
});

describe('AwsTransportOperator.GetStats', () => {
    it('reports queue and dead-letter counts, with no DB-only figures', async () => {
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: '{}', MessageGroupId: 'a', MessageDeduplicationId: 'a' });
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: '{}', MessageGroupId: 'b', MessageDeduplicationId: 'b' });
        await sqs.Receive({ QueueUrl: r.QueueUrl, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 60 });
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.GetStats(binding)).toEqual({
            SubscriptionName: 'email.unsubscribe', Pending: 1, InFlight: 1, DeadLettered: 1, BlockedKeys: null,
            OldestPendingAgeSeconds: null, CompletedLastHour: null, AsOf: new Date(sqs.Now).toISOString(),
        });
    });

    it('throws when the queue does not exist', async () => {
        const empty = new FakeSqsGateway();
        await expect(new AwsTransportOperator(empty).GetStats(binding)).rejects.toThrow(`SQS queue ${r.QueueUrl} does not exist`);
    });
});

describe('AwsTransportOperator.ListDeadLetters', () => {
    it('maps runtime and redrive dead letters, skips unreadable bodies and restores visibility', async () => {
        await deadLetter(1, runtimeAttributes('MaxAttemptsExceeded', '5'), 'subscriber-9');
        await deadLetter(2, {});
        await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: 'garbage', MessageGroupId: 'g-x', MessageDeduplicationId: 'x' });
        const page = await operator.ListDeadLetters(binding, null, 50);
        expect(page?.NextCursor).toBeNull();
        expect(page?.Items).toEqual([
            { DeliveryID: TestMessage(1).MessageID, Message: TestMessage(1, { PartitionKey: 'subscriber-9' }), PartitionKey: 'subscriber-9', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'boom', DeadLetteredAt: '2026-09-16T12:00:00.000Z', BlocksKey: false },
            { DeliveryID: TestMessage(2).MessageID, Message: TestMessage(2), PartitionKey: null, Attempts: 0, Reason: 'RedrivePolicy', LastError: null, DeadLetteredAt: null, BlocksKey: false },
        ]);
        expect(sqs.Messages(r.DeadLetterQueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });

    it('scans no more than the page size', async () => {
        for (const i of [1, 2, 3]) {
            await deadLetter(i, runtimeAttributes('Fatal', '1'));
        }
        expect((await operator.ListDeadLetters(binding, null, 2))?.Items).toHaveLength(2);
    });
});

describe('AwsTransportOperator.Replay', () => {
    it('sends the dead letter back marked as a replay and removes it from the dead-letter queue', async () => {
        await deadLetter(7, runtimeAttributes('Fatal', '3'), 'subscriber-9');
        await deadLetter(8, runtimeAttributes('Fatal', '3'));
        expect(await operator.Replay(binding, TestMessage(7).MessageID, 'user-1', 'fixed the template')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(1);
        const [replayed] = sqs.Messages(r.QueueUrl);
        expect(replayed.GroupId).toBe('subscriber-9');
        expect(replayed.DeduplicationId).toBe(`${TestMessage(7).MessageID}:replay:${sqs.Now}`);
        expect(replayed.Attributes).toEqual({ [REPLAY_ATTRIBUTE]: '1', mj_replay_note: 'fixed the template', mj_replayed_by: 'user-1' });
        const [delivery] = await new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now }).Receive(1, 0, signal);
        expect(delivery).toMatchObject({ Attempt: 1, IsReplay: true });
    });

    it('changes nothing when the message is not among the scanned dead letters', async () => {
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.Replay(binding, TestMessage(99).MessageID, null, null)).toEqual({ Supported: true, Changed: false });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(sqs.Messages(r.DeadLetterQueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });
});

describe('AwsTransportOperator.Discard and unsupported operations', () => {
    it('discards a dead letter, and reports a pending message as unsupported', async () => {
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.Discard(binding, TestMessage(1).MessageID, 'bad data', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
        expect(await operator.Discard(binding, TestMessage(2).MessageID, 'cancel', 'user-1')).toEqual({ Supported: false });
    });

    it('has no partitions and cannot skip sequences', async () => {
        expect(await operator.ListPartitions(binding, 'Blocked', null, 50)).toBeNull();
        expect(await operator.SkipSequence(binding, 'k', 5, 'gone', null)).toEqual({ Supported: false });
    });
});
```

`packages/WorkQueue/aws/src/__tests__/AwsTransportDriver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AwsTransportDriver } from '../driver/AwsTransportDriver';
import { AWS_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { SdkSnsGateway } from '../gateway/SdkSnsGateway';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { FakeSnsGateway, FakeSqsGateway } from '../testing/fakes';
import { SeedValidAwsResources, TestAwsResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

describe('AwsTransportDriver', () => {
    it('declares its name and capabilities and caches its operator', () => {
        const driver = new AwsTransportDriver(new FakeSnsGateway(), new FakeSqsGateway());
        expect(driver.Name).toBe('AWS');
        expect(driver.Capabilities).toBe(AWS_TRANSPORT_CAPABILITIES);
        expect(driver.Operator()).toBeInstanceOf(AwsTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
    });

    it('publishes through SNS and consumes through SQS', async () => {
        const sns = new FakeSnsGateway();
        const sqs = new FakeSqsGateway();
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        const driver = new AwsTransportDriver(sns, sqs, { Now: () => sqs.Now });
        const results = await driver.Publish(topic, [TestMessage(1)], [subscription]);
        expect(results[0].Status).toBe('Accepted');
        expect(sns.Batches).toHaveLength(1);
        const entry = sns.Batches[0].Entries[0];
        await sqs.Send({ QueueUrl: TestAwsResources(true).QueueUrl, Body: entry.Message, MessageGroupId: entry.MessageGroupId, MessageDeduplicationId: entry.MessageDeduplicationId });
        const consumer = driver.OpenConsumer(subscription);
        const [delivery] = await consumer.Receive(1, 0, new AbortController().signal);
        expect(delivery.Message).toEqual(TestMessage(1));
    });

    it('validates bindings', async () => {
        const sns = new FakeSnsGateway();
        const sqs = new FakeSqsGateway();
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        expect(await new AwsTransportDriver(sns, sqs).ValidateBindings(topic, [subscription])).toEqual([]);
    });

    it('creates SDK-backed gateways from transport configuration', () => {
        const driver = AwsTransportDriver.Create({ Region: 'us-east-1', Endpoint: 'http://localhost:4566' });
        expect(driver.Sns).toBeInstanceOf(SdkSnsGateway);
        expect(driver.Sqs).toBeInstanceOf(SdkSqsGateway);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/aws && pnpm test AwsTransportOperator AwsTransportDriver`
Expected: FAIL — unresolved imports `../operator/AwsTransportOperator`, `../driver/AwsTransportDriver`.

- [ ] **Step 3: Write `src/operator/deadLetterScan.ts`**

```typescript
import type { DeadLetterRecord, WorkMessage } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES } from '../consumer/deadLetter';
import { ParseEnvelopeBody } from '../envelope';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';

export const DEAD_LETTER_SCAN_LIMIT = 100;
export const PEEK_VISIBILITY_SECONDS = 30;

export interface ScannedDeadLetter {
    Raw: SqsReceivedMessage;
    Envelope: WorkMessage | null;
}

/** Receives up to `limit` dead letters with a short visibility. Stops early at the first item `isMatch` accepts. */
export async function ScanDeadLetters(
    gateway: SqsGateway,
    queueUrl: string,
    limit: number,
    isMatch?: (item: ScannedDeadLetter) => boolean,
): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
    const items: ScannedDeadLetter[] = [];
    const cap = Math.min(limit, DEAD_LETTER_SCAN_LIMIT);
    while (items.length < cap) {
        const batch = await gateway.Receive({
            QueueUrl: queueUrl, MaxMessages: Math.min(10, cap - items.length), WaitTimeSeconds: 0, VisibilityTimeoutSeconds: PEEK_VISIBILITY_SECONDS,
        });
        if (batch.length === 0) {
            break;
        }
        // Keep every received item (even past a match) so the caller can restore all of their visibility.
        const scanned = batch.map((raw): ScannedDeadLetter => ({ Raw: raw, Envelope: ParseEnvelopeBody(raw.Body) }));
        items.push(...scanned);
        const match = isMatch ? scanned.find(isMatch) : undefined;
        if (match) {
            return { Items: items, Match: match };
        }
    }
    return { Items: items, Match: null };
}

/** Makes scanned dead letters visible again (best effort; a stale receipt is ignored). */
export async function RestoreVisibility(gateway: SqsGateway, queueUrl: string, items: ScannedDeadLetter[], exceptReceiptHandle?: string): Promise<void> {
    for (const item of items) {
        if (item.Raw.ReceiptHandle !== exceptReceiptHandle) {
            await gateway.ChangeVisibility(queueUrl, item.Raw.ReceiptHandle, 0);
        }
    }
}

export function ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord | null {
    if (item.Envelope === null) {
        return null;
    }
    const attributes = item.Raw.Attributes;
    return {
        DeliveryID: item.Envelope.MessageID,
        Message: item.Envelope,
        PartitionKey: item.Envelope.PartitionKey ?? null,
        Attempts: Number(attributes[DEAD_LETTER_ATTRIBUTES.Attempts] ?? '0'),
        Reason: attributes[DEAD_LETTER_ATTRIBUTES.Reason] ?? 'RedrivePolicy',
        LastError: attributes[DEAD_LETTER_ATTRIBUTES.LastError] ?? null,
        DeadLetteredAt: attributes[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt] ?? null,
        BlocksKey: false,
    };
}
```

- [ ] **Step 4: Write `src/operator/AwsTransportOperator.ts`**

```typescript
import type {
    DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord,
    SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig } from '../config';
import { REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { MessageGroupIdFor } from '../envelope';
import type { SqsGateway } from '../gateway/SqsGateway';
import { RestoreVisibility, ScanDeadLetters, ToDeadLetterRecord, type ScannedDeadLetter } from './deadLetterScan';

export const REPLAY_NOTE_ATTRIBUTE = 'mj_replay_note';
export const REPLAYED_BY_ATTRIBUTE = 'mj_replayed_by';

function count(attributes: Record<string, string>, ...names: string[]): number {
    return names.reduce((total, name) => total + Number(attributes[name] ?? '0'), 0);
}

export class AwsTransportOperator implements ITransportOperator {
    private readonly now: () => number;

    constructor(private readonly sqs: SqsGateway, options: { Now?: () => number } = {}) {
        this.now = options.Now ?? Date.now;
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const queue = await this.sqs.GetAttributes(config.QueueUrl);
        if (queue === null) {
            throw new Error(`SQS queue ${config.QueueUrl} does not exist`);
        }
        const deadLetter = (await this.sqs.GetAttributes(config.DeadLetterQueueUrl)) ?? {};
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: count(queue, 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed'),
            InFlight: count(queue, 'ApproximateNumberOfMessagesNotVisible'),
            DeadLettered: count(deadLetter, 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'),
            BlockedKeys: null,
            OldestPendingAgeSeconds: null,
            CompletedLastHour: null,
            AsOf: new Date(this.now()).toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, _cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const { Items } = await ScanDeadLetters(this.sqs, config.DeadLetterQueueUrl, Math.max(1, pageSize));
        await RestoreVisibility(this.sqs, config.DeadLetterQueueUrl, Items);
        return { Items: Items.map(ToDeadLetterRecord).filter((record): record is DeadLetterRecord => record !== null), NextCursor: null };
    }

    public async ListPartitions(_subscription: SubscriptionBinding, _condition: PartitionCondition | null, _cursor: string | null, _pageSize: number): Promise<Page<PartitionStateRecord> | null> {
        return null;
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const { Items, Match } = await this.find(config.DeadLetterQueueUrl, deliveryID);
        try {
            if (Match === null || Match.Envelope === null) {
                return { Supported: true, Changed: false };
            }
            await this.sqs.Send({
                QueueUrl: config.QueueUrl,
                Body: Match.Raw.Body,
                Attributes: {
                    [REPLAY_ATTRIBUTE]: '1',
                    ...(note ? { [REPLAY_NOTE_ATTRIBUTE]: note.slice(0, 500) } : {}),
                    ...(actorUserID ? { [REPLAYED_BY_ATTRIBUTE]: actorUserID } : {}),
                },
                ...(config.IsFifo ? { MessageGroupId: MessageGroupIdFor(Match.Envelope), MessageDeduplicationId: `${Match.Envelope.MessageID}:replay:${this.now()}` } : {}),
            });
            await this.sqs.Delete(config.DeadLetterQueueUrl, Match.Raw.ReceiptHandle);
            return { Supported: true, Changed: true };
        } finally {
            await RestoreVisibility(this.sqs, config.DeadLetterQueueUrl, Items, Match?.Raw.ReceiptHandle);
        }
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, _reason: string, _actorUserID: string | null): Promise<OperatorResult> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const { Items, Match } = await this.find(config.DeadLetterQueueUrl, deliveryID);
        try {
            if (Match === null) {
                return { Supported: false };
            }
            await this.sqs.Delete(config.DeadLetterQueueUrl, Match.Raw.ReceiptHandle);
            return { Supported: true, Changed: true };
        } finally {
            await RestoreVisibility(this.sqs, config.DeadLetterQueueUrl, Items, Match?.Raw.ReceiptHandle);
        }
    }

    public async SkipSequence(_subscription: SubscriptionBinding, _partitionKey: string, _sequence: number, _reason: string, _actorUserID: string | null): Promise<OperatorResult> {
        return { Supported: false };
    }

    private find(queueUrl: string, messageID: string): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
        return ScanDeadLetters(this.sqs, queueUrl, Number.MAX_SAFE_INTEGER, (item) => item.Envelope?.MessageID === messageID);
    }
}
```

If `Replay`'s `Send` succeeds but `Delete` fails, the dead letter stays and the replay copy exists: at-least-once
holds (handlers are idempotent). The `finally` still restores visibility for everything else scanned.

- [ ] **Step 5: Write `src/driver/AwsTransportDriver.ts`**

```typescript
import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, TransportCapabilities, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import type { AwsTransportConfig } from '../config';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { CreateAwsClients, type AwsCredentialsOption } from '../gateway/clients';
import { SdkSnsGateway } from '../gateway/SdkSnsGateway';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import type { SnsGateway } from '../gateway/SnsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { ValidateAwsBindings } from './bindingValidation';
import { AWS_TRANSPORT_CAPABILITIES, AWS_TRANSPORT_NAME } from './capabilities';
import { PublishToSns } from './publish';

export class AwsTransportDriver implements ITransportDriver {
    public readonly Name = AWS_TRANSPORT_NAME;
    public readonly Capabilities: TransportCapabilities = AWS_TRANSPORT_CAPABILITIES;
    private readonly now: () => number;
    private operator: AwsTransportOperator | null = null;

    constructor(public readonly Sns: SnsGateway, public readonly Sqs: SqsGateway, options: { Now?: () => number } = {}) {
        this.now = options.Now ?? Date.now;
    }

    public static Create(config: AwsTransportConfig, credentials?: AwsCredentialsOption): AwsTransportDriver {
        const clients = CreateAwsClients(config, credentials);
        return new AwsTransportDriver(new SdkSnsGateway(clients.Sns), new SdkSqsGateway(clients.Sqs));
    }

    public Publish(topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[], _opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        return PublishToSns(this.Sns, topic, messages);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new SqsTransportConsumer<TPayload>(this.Sqs, subscription, { Now: this.now });
    }

    public Operator(): ITransportOperator {
        this.operator ??= new AwsTransportOperator(this.Sqs, { Now: this.now });
        return this.operator;
    }

    public ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return ValidateAwsBindings(this.Sns, this.Sqs, topic, subscriptions);
    }
}
```

- [ ] **Step 6: Export the modules**

Append to `packages/WorkQueue/aws/src/index.ts`:

```typescript
export * from './operator/deadLetterScan';
export * from './operator/AwsTransportOperator';
export * from './driver/AwsTransportDriver';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — previous 86, plus AwsTransportOperator (8), AwsTransportDriver (4). Total 98.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/aws/src
git commit -m "feat(work-queue-aws): best-effort dead-letter operator and the AWS transport driver"
```

---

### Task 7: Lambda adapter, EMF metrics, example consumer and bundle check

**Files:**
- Create: `packages/WorkQueue/aws/src/lambda/lambdaTypes.ts`, `src/lambda/bindingEnv.ts`, `src/lambda/emf.ts`, `src/lambda/CreateSqsLambdaHandler.ts`, `src/lambda/index.ts`
- Create: `packages/WorkQueue/aws/scripts/check-lambda-bundle.mjs`, `packages/WorkQueue/aws/examples/thin-consumer/index.ts`
- Modify: `packages/WorkQueue/aws/package.json` (`./lambda` export, `check:lambda-bundle` script, `esbuild` dev dependency)
- Test: `packages/WorkQueue/aws/src/__tests__/bindingEnv.test.ts`, `emf.test.ts`, `CreateSqsLambdaHandler.test.ts`

**Interfaces:**
- Consumes: `ConsumerRuntime`, `ConsumerRuntimeOptions`, `WorkHandler`, `WorkLogger`, `WorkJson`, `SettleResult`, `SubscriptionBinding`, `SubscriptionPolicy`, `ParseSubscriptionFilter`, `Outcome`, `WorkQueueConfigurationError` (core; `ConsumerRuntime.ProcessBatch(deliveries)` returns one `SettleResult` per delivery and `Stop()` aborts in-flight handlers and releases them — 03 §3.2); `ReadAwsSubscriptionConfig` (Task 1); `SqsGateway`, `SqsReceivedMessage`, `SdkSqsGateway`, `CreateAwsClients` (Task 3); `SqsTransportConsumer` (Task 5); fakes and fixtures (Tasks 3–4).
- Produces (all from `@memberjunction/work-queue-aws/lambda`):
  - `interface SqsLambdaRecord`, `interface SqsLambdaEvent`, `interface SqsBatchResponse`, `interface LambdaContextLike { getRemainingTimeInMillis(): number; awsRequestId?: string }`, `ToSqsReceivedMessage(record: SqsLambdaRecord): SqsReceivedMessage`
  - `SUBSCRIPTION_ENV_VAR = 'MJ_WQ_SUBSCRIPTION'`, `ParseSubscriptionBindingEnv(value: string | undefined): SubscriptionBinding`
  - `interface InvocationMetrics { Processed: number; Completed: number; Retried: number; DeadLettered: number; Failed: number; NotStarted: number; DurationMs: number }`, `EMF_NAMESPACE = 'MJ/WorkQueue'`, `FormatEmfLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string`
  - `interface SqsLambdaHandlerOptions { Binding?: SubscriptionBinding; Env?: Record<string, string | undefined>; Gateway?: SqsGateway; Concurrency?: number; TimeoutSafetyMs?: number; Log?: WorkLogger; EmitMetrics?: (line: string) => void; Now?: () => number }`
  - `type SqsLambdaHandler = (event: SqsLambdaEvent, context: LambdaContextLike) => Promise<SqsBatchResponse>`
  - `CreateSqsLambdaHandler<TPayload extends WorkJson = WorkJson>(handlerFactory: () => WorkHandler<TPayload>, options?: SqsLambdaHandlerOptions): SqsLambdaHandler`

**How a batch is processed.** The event source mapping must enable `ReportBatchItemFailures`. Records are grouped by
`MessageGroupId` (standard queues: every record is its own group). Groups run concurrently (default 10); records
inside a group run one at a time, in order, through `ConsumerRuntime.ProcessBatch([delivery])`.

| Record result | Reported as a batch failure? | Why |
| --- | --- | --- |
| `Settled Completed` / `Settled DeadLettered` | no | Already deleted (and copied to the DLQ) |
| Poison body or crash-looping message (`Adopt` returned `null`) | no | `Adopt` dead-lettered and deleted it |
| `Settled Pending` (retry), `LeaseLost`, `Failed`, or `Adopt` threw | **yes** | Must stay on the queue |
| Later records of a FIFO group after a failure | **yes**, not processed, visibility set to 0 | Order: they must not overtake the failed record; the group stays blocked by it in SQS |
| Records not started because the remaining time is below `TimeoutSafetyMs` (default 10 s) | **yes**, visibility set to 0 | Lambda would time out; SQS redelivers them promptly |

A timer fires `TimeoutSafetyMs` before the function's deadline and calls `runtime.Stop()`, which aborts running
handlers and releases their messages; those records are reported as failures. Cold-start initialization (binding
parse, SQS client) happens once; a failure throws and Lambda retries the whole batch.

One EMF line is written per invocation (namespace `MJ/WorkQueue`, dimension `Subscription`), so CloudWatch gets
`Processed`, `Completed`, `Retried`, `DeadLettered`, `Failed`, `NotStarted` and `DurationMs` without a CloudWatch
client in the bundle.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/bindingEnv.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseSubscriptionBindingEnv } from '../lambda/bindingEnv';
import { TestSubscriptionBinding } from '../testing/fixtures';

describe('ParseSubscriptionBindingEnv', () => {
    it('parses a binding produced by the Terraform module', () => {
        const binding = TestSubscriptionBinding(true, { Filter: { eventType: ['unsubscribe'] } });
        expect(ParseSubscriptionBindingEnv(JSON.stringify(binding))).toEqual(binding);
    });

    it('rejects a missing or unparseable value', () => {
        expect(() => ParseSubscriptionBindingEnv(undefined)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseSubscriptionBindingEnv('{')).toThrow('MJ_WQ_SUBSCRIPTION is not valid JSON');
    });

    it('rejects an invalid policy or queue binding', () => {
        const binding = TestSubscriptionBinding(true);
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Policy: { ...binding.Policy, PartitionMode: 'Sorted' } })))
            .toThrow("Policy.PartitionMode");
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Policy: { ...binding.Policy, LeaseSeconds: '60' } })))
            .toThrow("Policy.LeaseSeconds");
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Config: {} }))).toThrow("'IsFifo' must be a boolean");
    });
});
```

`packages/WorkQueue/aws/src/__tests__/emf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FormatEmfLine } from '../lambda/emf';

describe('FormatEmfLine', () => {
    it('emits an embedded-metric-format record with one dimension', () => {
        const line = FormatEmfLine('email.unsubscribe', { Processed: 3, Completed: 2, Retried: 1, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 120 }, 1800000000000);
        expect(JSON.parse(line)).toEqual({
            _aws: {
                Timestamp: 1800000000000,
                CloudWatchMetrics: [{
                    Namespace: 'MJ/WorkQueue',
                    Dimensions: [['Subscription']],
                    Metrics: [
                        { Name: 'Processed', Unit: 'Count' }, { Name: 'Completed', Unit: 'Count' }, { Name: 'Retried', Unit: 'Count' },
                        { Name: 'DeadLettered', Unit: 'Count' }, { Name: 'Failed', Unit: 'Count' }, { Name: 'NotStarted', Unit: 'Count' },
                        { Name: 'DurationMs', Unit: 'Milliseconds' },
                    ],
                }],
            },
            Subscription: 'email.unsubscribe', Processed: 3, Completed: 2, Retried: 1, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 120,
        });
    });
});
```

`packages/WorkQueue/aws/src/__tests__/CreateSqsLambdaHandler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Outcome, type SubscriptionBinding, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES } from '../consumer/deadLetter';
import { CreateSqsLambdaHandler } from '../lambda/CreateSqsLambdaHandler';
import type { LambdaContextLike, SqsLambdaEvent, SqsLambdaRecord } from '../lambda/lambdaTypes';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

let sqs: FakeSqsGateway;
let binding: SubscriptionBinding;
let calls: string[];
let script: Map<string, WorkOutcome>;
let metrics: string[];

class ScriptedHandler implements WorkHandler {
    public async Handle(message: WorkMessage): Promise<WorkOutcome> {
        calls.push(message.MessageID);
        return script.get(message.MessageID) ?? Outcome.Complete();
    }
}

function context(remainingMs: number): LambdaContextLike {
    return { getRemainingTimeInMillis: () => remainingMs, awsRequestId: 'req-1' };
}

function setup(isFifo: boolean): void {
    const r = TestAwsResources(isFifo);
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: isFifo, VisibilityTimeoutSeconds: 360 }).AddQueue(r.DeadLetterQueueUrl, { Fifo: isFifo });
    binding = TestSubscriptionBinding(isFifo);
    calls = [];
    script = new Map();
    metrics = [];
}

/** Sends messages and receives them the way the Lambda poller does, shaped as an SQS event. */
async function event(isFifo: boolean, items: { index: number; group?: string; body?: string }[]): Promise<SqsLambdaEvent> {
    const r = TestAwsResources(isFifo);
    for (const item of items) {
        await sqs.Send({
            QueueUrl: r.QueueUrl, Body: item.body ?? JSON.stringify(TestMessage(item.index)),
            ...(isFifo ? { MessageGroupId: item.group ?? `g-${item.index}`, MessageDeduplicationId: `d-${item.index}` } : {}),
        });
    }
    const received = await sqs.Receive({ QueueUrl: r.QueueUrl, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: null });
    const records: SqsLambdaRecord[] = received.map((m) => ({
        messageId: m.MessageId, receiptHandle: m.ReceiptHandle, body: m.Body,
        attributes: { ApproximateReceiveCount: String(m.ReceiveCount), SentTimestamp: String(m.SentTimestamp), ...(m.MessageGroupId ? { MessageGroupId: m.MessageGroupId } : {}) },
        messageAttributes: {}, eventSourceARN: r.QueueArn,
    }));
    return { Records: records };
}

function handler() {
    return CreateSqsLambdaHandler(() => new ScriptedHandler(), {
        Binding: binding, Gateway: sqs, Now: () => sqs.Now, EmitMetrics: (line) => metrics.push(line), TimeoutSafetyMs: 10_000,
    });
}

beforeEach(() => setup(true));

describe('CreateSqsLambdaHandler', () => {
    it('completes every record and reports no failures', async () => {
        const response = await handler()(await event(true, [{ index: 1 }, { index: 2 }]), context(60_000));
        expect(response).toEqual({ batchItemFailures: [] });
        expect(sqs.Messages(TestAwsResources(true).QueueUrl)).toHaveLength(0);
        expect(JSON.parse(metrics[0])).toMatchObject({ Subscription: 'email.unsubscribe', Processed: 2, Completed: 2 });
    });

    it('stops a FIFO group at a retry and releases the rest of that group unprocessed', async () => {
        const ev = await event(true, [{ index: 1, group: 'a' }, { index: 2, group: 'a' }, { index: 3, group: 'b' }]);
        script.set(TestMessage(1).MessageID, Outcome.Retry('not yet', 60));
        const response = await handler()(ev, context(60_000));
        expect(response.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([ev.Records[0].messageId, ev.Records[1].messageId]);
        expect(calls).toEqual(expect.arrayContaining([TestMessage(1).MessageID, TestMessage(3).MessageID]));
        expect(calls).not.toContain(TestMessage(2).MessageID);
        const a2 = sqs.Messages(TestAwsResources(true).QueueUrl).find((m) => m.Body === JSON.stringify(TestMessage(2)));
        expect(a2?.VisibleAt).toBe(sqs.Now);
        expect(JSON.parse(metrics[0])).toMatchObject({ Retried: 1, NotStarted: 1, Completed: 1 });
    });

    it('does not report dead-lettered records as failures', async () => {
        const ev = await event(true, [{ index: 1 }]);
        script.set(TestMessage(1).MessageID, Outcome.DeadLetter('bad address'));
        expect(await handler()(ev, context(60_000))).toEqual({ batchItemFailures: [] });
        const [copy] = sqs.Messages(TestAwsResources(true).DeadLetterQueueUrl);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('bad address');
    });

    it('dead-letters a poison body without running the handler or failing the batch', async () => {
        const ev = await event(true, [{ index: 1, body: 'not an envelope' }]);
        expect(await handler()(ev, context(60_000))).toEqual({ batchItemFailures: [] });
        expect(calls).toEqual([]);
        expect(sqs.Messages(TestAwsResources(true).DeadLetterQueueUrl)[0].Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');
    });

    it('treats every record of a standard queue independently', async () => {
        setup(false);
        const ev = await event(false, [{ index: 1 }, { index: 2 }, { index: 3 }]);
        script.set(TestMessage(2).MessageID, Outcome.Retry('later', 30));
        const response = await handler()(ev, context(60_000));
        expect(response.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([ev.Records[1].messageId]);
        expect(calls).toHaveLength(3);
    });

    it('starts nothing when too little time remains and releases every record', async () => {
        const ev = await event(true, [{ index: 1 }, { index: 2 }]);
        const response = await handler()(ev, context(5_000));
        expect(response.batchItemFailures).toHaveLength(2);
        expect(calls).toEqual([]);
        expect(sqs.Messages(TestAwsResources(true).QueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });

    it('reads the binding from MJ_WQ_SUBSCRIPTION and fails the invocation when it is missing', async () => {
        const ev = await event(true, [{ index: 1 }]);
        const fromEnv = CreateSqsLambdaHandler(() => new ScriptedHandler(), {
            Env: { MJ_WQ_SUBSCRIPTION: JSON.stringify(binding) }, Gateway: sqs, Now: () => sqs.Now, EmitMetrics: () => undefined,
        });
        expect(await fromEnv(ev, context(60_000))).toEqual({ batchItemFailures: [] });
        const missing = CreateSqsLambdaHandler(() => new ScriptedHandler(), { Env: {}, Gateway: sqs, EmitMetrics: () => undefined });
        await expect(missing({ Records: [] }, context(60_000))).rejects.toThrow('MJ_WQ_SUBSCRIPTION');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/aws && pnpm test bindingEnv emf CreateSqsLambdaHandler`
Expected: FAIL — unresolved imports under `../lambda/`.

- [ ] **Step 3: Write `src/lambda/lambdaTypes.ts`**

```typescript
import type { SqsReceivedMessage } from '../gateway/SqsGateway';

/** The fields of an SQS record in a Lambda event that the adapter reads (no @types/aws-lambda dependency). */
export interface SqsLambdaRecord {
    messageId: string;
    receiptHandle: string;
    body: string;
    attributes: { ApproximateReceiveCount: string; SentTimestamp?: string; MessageGroupId?: string };
    messageAttributes: Record<string, { stringValue?: string; dataType: string }>;
    eventSourceARN: string;
}

export interface SqsLambdaEvent {
    Records: SqsLambdaRecord[];
}

/** Partial batch response. Requires FunctionResponseTypes = ["ReportBatchItemFailures"] on the event source mapping. */
export interface SqsBatchResponse {
    batchItemFailures: { itemIdentifier: string }[];
}

export interface LambdaContextLike {
    getRemainingTimeInMillis(): number;
    awsRequestId?: string;
}

export function ToSqsReceivedMessage(record: SqsLambdaRecord): SqsReceivedMessage {
    const attributes: Record<string, string> = {};
    for (const [name, value] of Object.entries(record.messageAttributes)) {
        if (value.stringValue !== undefined) {
            attributes[name] = value.stringValue;
        }
    }
    return {
        MessageId: record.messageId,
        ReceiptHandle: record.receiptHandle,
        Body: record.body,
        ReceiveCount: Number(record.attributes.ApproximateReceiveCount),
        MessageGroupId: record.attributes.MessageGroupId ?? null,
        SentTimestamp: record.attributes.SentTimestamp ? Number(record.attributes.SentTimestamp) : null,
        Attributes: attributes,
    };
}
```

- [ ] **Step 4: Write `src/lambda/bindingEnv.ts`**

```typescript
import {
    ParseSubscriptionFilter, WorkQueueConfigurationError, type HostType, type SubscriptionBinding, type SubscriptionPolicy, type WorkJson,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig } from '../config';

export const SUBSCRIPTION_ENV_VAR = 'MJ_WQ_SUBSCRIPTION';

type Raw = Record<string, unknown>;

function fail(message: string): never {
    throw new WorkQueueConfigurationError(`${SUBSCRIPTION_ENV_VAR}: ${message}`);
}

function isRecord(value: unknown): value is Raw {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(source: Raw, key: string): string {
    const value = source[key];
    return typeof value === 'string' && value !== '' ? value : fail(`Policy.${key} must be a non-empty string`);
}

function int(source: Raw, key: string, optional: boolean): number | undefined {
    const value = source[key];
    if (value === undefined && optional) {
        return undefined;
    }
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fail(`Policy.${key} must be a non-negative integer`);
}

function oneOf<T extends string>(source: Raw, key: string, allowed: readonly T[]): T {
    const value = source[key];
    const match = allowed.find((candidate) => candidate === value);
    return match ?? fail(`Policy.${key} must be one of ${allowed.join(', ')}`);
}

function readPolicy(raw: unknown): SubscriptionPolicy {
    if (!isRecord(raw)) {
        fail('Policy must be an object');
    }
    const policy: SubscriptionPolicy = {
        SubscriptionName: str(raw, 'SubscriptionName'),
        TopicName: str(raw, 'TopicName'),
        OrderingMode: oneOf(raw, 'OrderingMode', ['PublishOrder', 'ExplicitSequence'] as const),
        PartitionMode: oneOf(raw, 'PartitionMode', ['None', 'Exclusive', 'Ordered'] as const),
        MaxAttempts: int(raw, 'MaxAttempts', false) ?? 0,
        BackoffBaseSeconds: int(raw, 'BackoffBaseSeconds', false) ?? 0,
        BackoffMaxSeconds: int(raw, 'BackoffMaxSeconds', false) ?? 0,
        LeaseSeconds: int(raw, 'LeaseSeconds', false) ?? 0,
        HeartbeatMode: oneOf(raw, 'HeartbeatMode', ['Auto', 'Manual'] as const),
    };
    const maxProcessing = int(raw, 'MaxProcessingSeconds', true);
    const gapAlert = int(raw, 'SequenceGapAlertSeconds', true);
    if (maxProcessing !== undefined) policy.MaxProcessingSeconds = maxProcessing;
    if (gapAlert !== undefined) policy.SequenceGapAlertSeconds = gapAlert;
    return policy;
}

/** Parses and validates the SubscriptionBinding JSON that Terraform writes into the function's environment. */
export function ParseSubscriptionBindingEnv(value: string | undefined): SubscriptionBinding {
    if (value === undefined || value.trim() === '') {
        fail('environment variable is not set');
    }
    let raw: unknown;
    try {
        raw = JSON.parse(value);
    } catch {
        throw new WorkQueueConfigurationError(`${SUBSCRIPTION_ENV_VAR} is not valid JSON`);
    }
    if (!isRecord(raw) || !isRecord(raw['Config'])) {
        fail('must be an object with Policy, Filter, HostType and Config');
    }
    const hostType: HostType = raw['HostType'] === 'MJWorker' ? 'MJWorker' : raw['HostType'] === 'External' ? 'External' : fail('HostType must be MJWorker or External');
    const filterJson = raw['Filter'] === null || raw['Filter'] === undefined ? null : JSON.stringify(raw['Filter']);
    // Config values are JSON from JSON.parse; ReadAwsSubscriptionConfig validates every field it uses.
    const config = raw['Config'] as Record<string, WorkJson>;
    ReadAwsSubscriptionConfig(config);
    return { Policy: readPolicy(raw['Policy']), Filter: ParseSubscriptionFilter(filterJson), HostType: hostType, Config: config };
}
```

- [ ] **Step 5: Write `src/lambda/emf.ts`**

```typescript
export const EMF_NAMESPACE = 'MJ/WorkQueue';

export interface InvocationMetrics {
    Processed: number;
    Completed: number;
    Retried: number;
    DeadLettered: number;
    Failed: number;
    NotStarted: number;
    DurationMs: number;
}

const COUNT_METRICS: (keyof InvocationMetrics)[] = ['Processed', 'Completed', 'Retried', 'DeadLettered', 'Failed', 'NotStarted'];

/** One CloudWatch Embedded Metric Format log line; Lambda's log pipeline turns it into metrics. */
export function FormatEmfLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string {
    return JSON.stringify({
        _aws: {
            Timestamp: timestamp,
            CloudWatchMetrics: [{
                Namespace: EMF_NAMESPACE,
                Dimensions: [['Subscription']],
                Metrics: [...COUNT_METRICS.map((name) => ({ Name: name, Unit: 'Count' })), { Name: 'DurationMs', Unit: 'Milliseconds' }],
            }],
        },
        Subscription: subscriptionName,
        ...metrics,
    });
}
```

- [ ] **Step 6: Write `src/lambda/CreateSqsLambdaHandler.ts`**

```typescript
import {
    ConsumerRuntime, type SettleResult, type SubscriptionBinding, type WorkHandler, type WorkJson, type WorkLogger,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig } from '../config';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { CreateAwsClients } from '../gateway/clients';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';
import { ParseSubscriptionBindingEnv, SUBSCRIPTION_ENV_VAR } from './bindingEnv';
import { FormatEmfLine, type InvocationMetrics } from './emf';
import { ToSqsReceivedMessage, type LambdaContextLike, type SqsBatchResponse, type SqsLambdaEvent, type SqsLambdaRecord } from './lambdaTypes';

export interface SqsLambdaHandlerOptions {
    Binding?: SubscriptionBinding;
    Env?: Record<string, string | undefined>;
    Gateway?: SqsGateway;
    /** Message groups processed in parallel. Default 10. */
    Concurrency?: number;
    /** Stop starting records, and abort running ones, this long before the deadline. Default 10,000 ms. */
    TimeoutSafetyMs?: number;
    Log?: WorkLogger;
    EmitMetrics?: (line: string) => void;
    Now?: () => number;
}

export type SqsLambdaHandler = (event: SqsLambdaEvent, context: LambdaContextLike) => Promise<SqsBatchResponse>;

interface Initialized {
    Binding: SubscriptionBinding;
    Gateway: SqsGateway;
}

const JSON_LOGGER: WorkLogger = {
    Info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
    Warn: (message, data) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
    Error: (message, error, data) => console.error(JSON.stringify({ level: 'error', message, error: error?.message, ...data })),
};

function groupRecords(records: SqsLambdaRecord[]): SqsLambdaRecord[][] {
    const groups = new Map<string, SqsLambdaRecord[]>();
    for (const record of records) {
        const key = record.attributes.MessageGroupId ?? `record:${record.messageId}`;
        groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    return [...groups.values()];
}

async function runLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await work(item);
        }
    });
    await Promise.all(workers);
}

function succeeded(result: SettleResult | undefined): boolean {
    return result?.Kind === 'Settled' && (result.Status === 'Completed' || result.Status === 'DeadLettered');
}

function tally(metrics: InvocationMetrics, result: SettleResult | undefined): void {
    metrics.Processed += 1;
    if (result?.Kind === 'Settled') {
        const key = result.Status === 'Completed' ? 'Completed' : result.Status === 'DeadLettered' ? 'DeadLettered' : 'Retried';
        metrics[key] += 1;
    } else {
        metrics.Failed += 1;
    }
}

export function CreateSqsLambdaHandler<TPayload extends WorkJson = WorkJson>(
    handlerFactory: () => WorkHandler<TPayload>,
    options: SqsLambdaHandlerOptions = {},
): SqsLambdaHandler {
    const now = options.Now ?? Date.now;
    const log = options.Log ?? JSON_LOGGER;
    const emit = options.EmitMetrics ?? ((line: string) => console.log(line));
    const safetyMs = options.TimeoutSafetyMs ?? 10_000;
    let initialized: Initialized | null = null;

    const initialize = (): Initialized => {
        if (initialized === null) {
            const binding = options.Binding ?? ParseSubscriptionBindingEnv((options.Env ?? process.env)[SUBSCRIPTION_ENV_VAR]);
            const region = ReadAwsSubscriptionConfig(binding.Config).Region;
            const gateway = options.Gateway ?? new SdkSqsGateway(CreateAwsClients({ Region: region, Endpoint: null }).Sqs);
            initialized = { Binding: binding, Gateway: gateway };
        }
        return initialized;
    };

    return async (event, context) => {
        const { Binding: binding, Gateway: gateway } = initialize();
        const started = now();
        const queueUrl = ReadAwsSubscriptionConfig(binding.Config).QueueUrl;
        const consumer = new SqsTransportConsumer<TPayload>(gateway, binding, { Now: now });
        const runtime = new ConsumerRuntime<TPayload>(consumer, handlerFactory, binding.Policy,
            { Concurrency: options.Concurrency ?? 10, ReceiveBatchSize: 10, IdlePollMinMs: 0, IdlePollMaxMs: 0, ShutdownDrainMs: 0 }, log, now);
        const metrics: InvocationMetrics = { Processed: 0, Completed: 0, Retried: 0, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 0 };
        const failures = new Set<string>();
        let stopping = false;
        const timer = setTimeout(() => {
            stopping = true;
            void runtime.Stop();
        }, Math.max(0, context.getRemainingTimeInMillis() - safetyMs));

        const release = async (records: SqsLambdaRecord[]): Promise<void> => {
            for (const record of records) {
                failures.add(record.messageId);
                metrics.NotStarted += 1;
                await gateway.ChangeVisibility(queueUrl, record.receiptHandle, 0).catch(() => false);
            }
        };

        const processGroup = async (group: SqsLambdaRecord[]): Promise<void> => {
            for (let i = 0; i < group.length; i++) {
                if (stopping || context.getRemainingTimeInMillis() < safetyMs) {
                    await release(group.slice(i));
                    return;
                }
                const record = group[i];
                try {
                    const delivery = await consumer.Adopt(ToSqsReceivedMessage(record));
                    if (delivery === null) {
                        metrics.DeadLettered += 1;
                        continue;
                    }
                    const [result] = await runtime.ProcessBatch([delivery]);
                    tally(metrics, result);
                    if (!succeeded(result)) {
                        failures.add(record.messageId);
                        await release(group.slice(i + 1));
                        return;
                    }
                } catch (error) {
                    log.Error('Record processing failed', error instanceof Error ? error : new Error(String(error)), { messageId: record.messageId });
                    failures.add(record.messageId);
                    metrics.Failed += 1;
                    await release(group.slice(i + 1));
                    return;
                }
            }
        };

        try {
            await runLimited(groupRecords(event.Records), options.Concurrency ?? 10, processGroup);
        } finally {
            clearTimeout(timer);
            metrics.DurationMs = now() - started;
            emit(FormatEmfLine(binding.Policy.SubscriptionName, metrics, now()));
        }
        return { batchItemFailures: event.Records.filter((r) => failures.has(r.messageId)).map((r) => ({ itemIdentifier: r.messageId })) };
    };
}
```

- [ ] **Step 7: Write `src/lambda/index.ts`**

```typescript
export * from './lambdaTypes';
export * from './bindingEnv';
export * from './emf';
export * from './CreateSqsLambdaHandler';
```

- [ ] **Step 8: Add the `./lambda` export, the bundle check script and the example**

In `packages/WorkQueue/aws/package.json`, replace the `exports` block with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./lambda": {
      "types": "./dist/lambda/index.d.ts",
      "default": "./dist/lambda/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "default": "./dist/testing/index.js"
    }
  },
```

Add to `scripts`: `"check:lambda-bundle": "node scripts/check-lambda-bundle.mjs"`. Add to `devDependencies`: `"esbuild": "^0.27.3"`.

Run: `pnpm install` (repository root)
Expected: completes; `pnpm-lock.yaml` records `esbuild` for `@memberjunction/work-queue-aws`.

`packages/WorkQueue/aws/scripts/check-lambda-bundle.mjs`:

```javascript
// Bundles the ./lambda entry exactly as a consumer's esbuild build would (AWS SDK external, as the Lambda Node.js
// runtime provides it) and fails when the bundle pulls in any MemberJunction package other than work-queue-core,
// or grows past the size budget. Run after `pnpm run build` of work-queue-core and work-queue-aws.
import { build } from 'esbuild';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 150 * 1024;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedRoots = [packageRoot, resolve(packageRoot, '..', 'core')].map((root) => root + sep);

const result = await build({
    entryPoints: [resolve(packageRoot, 'dist/lambda/index.js')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: true,
    write: false,
    metafile: true,
    external: ['@aws-sdk/*'],
    logLevel: 'silent',
    absWorkingDir: packageRoot,
});

const inputs = Object.keys(result.metafile.inputs).map((input) => resolve(packageRoot, input));
const offenders = inputs.filter((input) => {
    if (allowedRoots.some((root) => input.startsWith(root)) && !input.includes(`${sep}node_modules${sep}`)) {
        return false;
    }
    return input.includes(`${sep}@memberjunction${sep}`) || input.includes(`${sep}packages${sep}`);
});
const bytes = result.outputFiles[0].contents.byteLength;

if (offenders.length > 0) {
    console.error('work-queue-aws/lambda bundle includes forbidden modules:\n' + offenders.join('\n'));
    process.exit(1);
}
if (bytes > BUDGET_BYTES) {
    console.error(`work-queue-aws/lambda bundle is ${bytes} bytes; budget is ${BUDGET_BYTES}`);
    process.exit(1);
}
console.log(`work-queue-aws/lambda bundle OK: ${bytes} bytes (budget ${BUDGET_BYTES}), ${inputs.length} input files`);
```

`packages/WorkQueue/aws/examples/thin-consumer/index.ts` (not compiled by the package; shown in the README):

```typescript
import { FatalWorkError, Outcome, TransientWorkError, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateSqsLambdaHandler } from '@memberjunction/work-queue-aws/lambda';

interface UnsubscribeEvent {
    providerEventId: string;
    email: string;
    occurredAt: string;
}

function isUnsubscribeEvent(value: WorkMessage['Payload']): value is UnsubscribeEvent & { [key: string]: string } {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && typeof value['providerEventId'] === 'string' && typeof value['email'] === 'string' && typeof value['occurredAt'] === 'string';
}

/** Records a one-click unsubscribe in a suppression service. Idempotent on providerEventId. No MemberJunction runtime. */
class UnsubscribeRecorder implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        if (!isUnsubscribeEvent(message.Payload)) {
            throw new FatalWorkError('Payload is not an unsubscribe event');
        }
        const url = process.env.SUPPRESSION_API_URL;
        if (!url) {
            throw new FatalWorkError('SUPPRESSION_API_URL is not configured');
        }
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', 'idempotency-key': message.Payload.providerEventId },
            body: JSON.stringify(message.Payload),
            signal: context.Signal,
        });
        if (response.status >= 500 || response.status === 429) {
            throw new TransientWorkError(`Suppression service returned ${response.status}`, 30);
        }
        return response.ok ? Outcome.Complete() : Outcome.DeadLetter(`Suppression service rejected the event: ${response.status}`);
    }
}

export const handler = CreateSqsLambdaHandler(() => new UnsubscribeRecorder());
```

- [ ] **Step 9: Run the tests, build and check the bundle**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — previous 98, plus bindingEnv (3), emf (1), CreateSqsLambdaHandler (7). Total 109.

Run: `cd packages/WorkQueue/core && pnpm run build && cd ../aws && pnpm run build && pnpm run check:lambda-bundle`
Expected: `work-queue-aws/lambda bundle OK: <n> bytes (budget 153600), <m> input files` with `<n>` under 153,600.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/aws pnpm-lock.yaml
git commit -m "feat(work-queue-aws): Lambda adapter with FIFO-safe partial batch failures, EMF metrics and bundle check"
```

---

### Task 8: Engine — `AWSTransportDriverFactory`, credential resolution and cloud deduplication

**Files:**
- Modify: `packages/WorkQueue/engine/package.json` (dependencies `@memberjunction/work-queue-aws`, `@memberjunction/credentials`, `@aws-sdk/credential-providers`)
- Create: `packages/WorkQueue/engine/src/transports/aws/ResolveAwsCredentials.ts`, `src/transports/aws/AWSTransportDriverFactory.ts`, `src/topology/FinalizeTopologyManifest.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`, `packages/WorkQueue/engine/src/WorkQueueEngine.ts` (`ExportManifest`, plan 05 Task 13)
- Test: `packages/WorkQueue/engine/src/__tests__/ResolveAwsCredentials.test.ts`, `AWSTransportDriverFactory.test.ts`, `AwsPublishCoordinator.test.ts`, `FinalizeTopologyManifest.test.ts`

**Interfaces:**
- Consumes:
  - Plan 05: `BaseTransportDriverFactory { Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> }` (`src/transports/BaseTransportDriverFactory.ts`); `TransportRow`, `TopicRow`, `SubscriptionRow` (`src/topology/rows.ts`); `TransportDriverDeps { ContextUser; Executor: WorkQueueExecutorSource; Log; InstanceID? }`; `ResolveTopic(snapshot, topicName)` (`src/topology/bindings.ts`); `WorkQueuePublishCoordinator`, `PublishCoordinatorDeps`, `LedgerOperations` (`src/publish/WorkQueuePublishCoordinator.ts`); `LedgerReservation` (`src/dedup/DeduplicationLedger.ts`); test fakes `RecordingExecutor`, `RecordingLogger`, `TestDeps`, `TRANSPORT_ROW`, `TOPIC_ROW`, `SUBSCRIPTION_ROW` (`src/__tests__/fakes.ts`).
  - `CredentialEngine` (`@memberjunction/credentials`: `Config(forceRefresh, contextUser)`, `getCredentialById(id)`, `getCredential(name, { credentialId, contextUser, subsystem })`); `MJGlobal`, `RegisterClass` (`@memberjunction/global`); `fromTemporaryCredentials` (`@aws-sdk/credential-providers`).
  - `AwsTransportDriver`, `ParseAwsTransportConfig`, `AwsCredentialsOption`, `SdkSnsGateway`, `SdkSqsGateway` (Tasks 1–6); `FakeSnsGateway`, `FakeSqsGateway`, `TestAwsResources` (`@memberjunction/work-queue-aws/testing`).
- Produces:
  - `interface AwsCredentialValues { AccessKeyId?: string; SecretAccessKey?: string; SessionToken?: string; RoleArn?: string; ExternalId?: string }`
  - `ToAwsCredentials(values: AwsCredentialValues): AwsCredentialsOption`
  - `ResolveAwsCredentials(credentialID: string | null, contextUser: UserInfo): Promise<AwsCredentialsOption>`
  - `@RegisterClass(BaseTransportDriverFactory, 'AWS') class AWSTransportDriverFactory extends BaseTransportDriverFactory`
  - `AWS_DRIVER_CLASS = 'AWS'`, `FinalizeTopologyManifest(manifest: TopologyManifest): TopologyManifest` — for `manifest.Transport.DriverClass === 'AWS'` sets every subscription's `Aws = { SnsFilterPolicy: SnsFilterPolicyFor(Filter) }`; returns other manifests unchanged
  - `WorkQueueEngine.ExportManifest(transportName)` now returns `FinalizeTopologyManifest(BuildTopologyManifest(this.Snapshot, transportName, new Date()))`
  - Also consumes: `BuildTopologyManifest`, `TopologySnapshot` (plan 05 `src/topology/manifest.ts`, `src/topology/bindings.ts`); `TopologyManifest`, `ManifestSubscription` (core); `SnsFilterPolicyFor` (Task 2)

**Manifest export for AWS (03 §10).** Plan 05's `BuildTopologyManifest` cannot render SNS filter policies because
the engine only depends on `@memberjunction/work-queue-aws` from this task on. `FinalizeTopologyManifest` is the
single post-processing hook, called by `WorkQueueEngine.ExportManifest`, and guarded by `DriverClass`: AWS manifests
get `Aws.SnsFilterPolicy` (null for an unfiltered subscription); a filter SNS cannot express (more than 150 value
combinations) makes the export throw `WorkQueueConfigurationError` instead of producing a manifest Terraform would
apply with the wrong filter. Azure (09a) adds its own `DriverClass` branch here. The Terraform module refuses a
filtered subscription without a rendered policy (Task 10), so a manifest exported without this step cannot silently
deliver every message.

**Credentials.** `Transport.CredentialID = null` uses the SDK default chain (recommended when MJAPI runs in AWS with
a task or instance role). Otherwise the MJ credential's decrypted values are either static keys (`AccessKeyId`,
`SecretAccessKey`, optional `SessionToken`) or a role to assume (`RoleArn`, optional `ExternalId`) on top of the
ambient identity — recommended for MJ running outside AWS. Credential access is audited by the Credentials engine
under subsystem `WorkQueue`.

**Why the engine carries the factory.** `@memberjunction/work-queue-aws` stays free of MJ runtime packages (R9),
so the ClassFactory registration lives here. Every MJ server that includes the engine installs
`@aws-sdk/client-sns` and `@aws-sdk/client-sqs`; clients are only constructed when an AWS transport is resolved
(precedent: `@memberjunction/storage` already ships `@aws-sdk/client-s3` to every server).

**Deduplication on AWS (03 §2.1).** Plan 05's `WorkQueuePublishCoordinator` owns the ledger protocol for cloud
transports: reserve keyed requests → one `driver.Publish` → confirm accepted keys, release the rest. Plan 05 tests
that with a fake driver; this task runs the coordinator against the **real** `AwsTransportDriver` over
`FakeSnsGateway`, so the FIFO deduplication ID, per-entry failure mapping and whole-call failure paths are proven
end to end.

- [ ] **Step 1: Add the engine dependencies**

In `packages/WorkQueue/engine/package.json`, add to `dependencies` (keep a single entry if one already exists):

```json
    "@aws-sdk/credential-providers": "^3.984.0",
    "@memberjunction/credentials": "6.1.0",
    "@memberjunction/work-queue-aws": "6.1.0",
```

Run: `pnpm install` (repository root)
Expected: completes.

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/ResolveAwsCredentials.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const credentialEngine = vi.hoisted(() => ({
    Config: vi.fn(async () => undefined),
    getCredentialById: vi.fn(),
    getCredential: vi.fn(),
}));

vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: credentialEngine } }));

import { ResolveAwsCredentials, ToAwsCredentials } from '../transports/aws/ResolveAwsCredentials';

const USER = { ID: 'user-1' } as UserInfo;
const CREDENTIAL_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
    credentialEngine.Config.mockClear();
    credentialEngine.getCredentialById.mockReset();
    credentialEngine.getCredential.mockReset();
});

describe('ToAwsCredentials', () => {
    it('maps static keys, with an optional session token', () => {
        expect(ToAwsCredentials({ AccessKeyId: 'AKIA', SecretAccessKey: 'secret' })).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
        expect(ToAwsCredentials({ AccessKeyId: 'ASIA', SecretAccessKey: 's', SessionToken: 't' })).toEqual({ accessKeyId: 'ASIA', secretAccessKey: 's', sessionToken: 't' });
    });

    it('maps a role ARN to an assume-role provider and rejects incomplete values', () => {
        expect(typeof ToAwsCredentials({ RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue', ExternalId: 'x' })).toBe('function');
        expect(() => ToAwsCredentials({ AccessKeyId: 'AKIA' })).toThrow('AccessKeyId and SecretAccessKey, or RoleArn');
    });
});

describe('ResolveAwsCredentials', () => {
    it('uses the ambient identity when no credential is configured', async () => {
        expect(await ResolveAwsCredentials(null, USER)).toBeUndefined();
        expect(credentialEngine.Config).not.toHaveBeenCalled();
    });

    it('loads and decrypts the configured credential under the WorkQueue subsystem', async () => {
        credentialEngine.getCredentialById.mockReturnValue({ ID: CREDENTIAL_ID, Name: 'AWS Work Queue' });
        credentialEngine.getCredential.mockResolvedValue({ values: { AccessKeyId: 'AKIA', SecretAccessKey: 'secret' } });
        expect(await ResolveAwsCredentials(CREDENTIAL_ID, USER)).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
        expect(credentialEngine.Config).toHaveBeenCalledWith(false, USER);
        expect(credentialEngine.getCredential).toHaveBeenCalledWith('AWS Work Queue', { credentialId: CREDENTIAL_ID, contextUser: USER, subsystem: 'WorkQueue' });
    });

    it('fails clearly when the credential does not exist', async () => {
        credentialEngine.getCredentialById.mockReturnValue(undefined);
        await expect(ResolveAwsCredentials(CREDENTIAL_ID, USER)).rejects.toThrow(`Credential ${CREDENTIAL_ID} was not found`);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/AWSTransportDriverFactory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { AwsTransportDriver, SdkSnsGateway, SdkSqsGateway } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { AWSTransportDriverFactory } from '../transports/aws/AWSTransportDriverFactory';
import type { TransportRow } from '../topology/rows';
import { RecordingExecutor, TestDeps, TRANSPORT_ROW } from './fakes';

function transport(configuration: string | null): TransportRow {
    return { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: configuration };
}

describe('AWSTransportDriverFactory', () => {
    it('is registered under the AWS driver class', () => {
        const factory = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'AWS');
        expect(factory).toBeInstanceOf(AWSTransportDriverFactory);
    });

    it('creates an SDK-backed AWS driver from the transport configuration', async () => {
        const driver = await new AWSTransportDriverFactory().Create(transport('{"Region":"us-east-1","Endpoint":"http://localhost:4566"}'), TestDeps(new RecordingExecutor()));
        expect(driver).toBeInstanceOf(AwsTransportDriver);
        expect(driver.Name).toBe('AWS');
        if (!(driver instanceof AwsTransportDriver)) {
            throw new Error('expected an AwsTransportDriver');
        }
        expect(driver.Sns).toBeInstanceOf(SdkSnsGateway);
        expect(driver.Sqs).toBeInstanceOf(SdkSqsGateway);
    });

    it('rejects a transport without a region', async () => {
        await expect(new AWSTransportDriverFactory().Create(transport('{}'), TestDeps(new RecordingExecutor()))).rejects.toBeInstanceOf(WorkQueueConfigurationError);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/AwsPublishCoordinator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AwsGatewayError, AwsTransportDriver } from '@memberjunction/work-queue-aws';
import { FakeSnsGateway, FakeSqsGateway, TestAwsResources } from '@memberjunction/work-queue-aws/testing';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { WorkQueuePublishCoordinator, type LedgerOperations, type PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import { ResolveTopic } from '../topology/bindings';
import type { TopicRow, TransportRow } from '../topology/rows';
import { RecordingExecutor, RecordingLogger, SUBSCRIPTION_ROW, TOPIC_ROW, TRANSPORT_ROW } from './fakes';

const AWS_TRANSPORT: TransportRow = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const OWNER = 'EEEEEEEE-0000-4000-8000-000000000001';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

class FakeLedger implements LedgerOperations {
    public readonly Events: string[] = [];

    public async Reserve(topicID: string, key: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        return key === 'held' ? { Kind: 'Duplicate', OwnerMessageID: OWNER } : { Kind: 'Reserved' };
    }
    public async Confirm(topicID: string, key: string, messageID: string, ttlSeconds: number): Promise<boolean> {
        this.Events.push(`confirm:${key}:${ttlSeconds}`);
        return true;
    }
    public async Release(topicID: string, key: string): Promise<boolean> {
        this.Events.push(`release:${key}`);
        return true;
    }
}

function Setup() {
    const sns = new FakeSnsGateway();
    const driver = new AwsTransportDriver(sns, new FakeSqsGateway());
    const ledger = new FakeLedger();
    const topic: TopicRow = {
        ...TOPIC_ROW, Name: 'email.events', TransportID: AWS_TRANSPORT.ID, IsFifo: true, AllowExternalPublish: true,
        BindingConfig: JSON.stringify({ SnsTopicArn: TestAwsResources(true).TopicArn }),
    };
    const snapshot = { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [topic], Subscriptions: [{ ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const }] };
    let id = 100;
    const deps: PublishCoordinatorDeps = {
        ResolveTopic: name => ResolveTopic(snapshot, name),
        GetDriver: async () => driver,
        Executor: new RecordingExecutor(),
        CreateLedger: () => ledger,
        NewID: () => `00000000-0000-4000-8000-000000000${++id}`,
        Now: () => new Date('2026-09-16T12:00:00Z'),
        NotifyPublished: () => undefined,
        Log: new RecordingLogger(),
    };
    return { coordinator: new WorkQueuePublishCoordinator(deps), sns, ledger };
}

const OPTIONS = { UserID: 'U1', External: false, CallerExecutor: null };

describe('WorkQueuePublishCoordinator with the AWS transport driver', () => {
    it('sends one SNS batch with FIFO IDs, skips a held key and confirms accepted keys with their TTL', async () => {
        const { coordinator, sns, ledger } = Setup();
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, PartitionKey: 'subscriber-9', DeduplicationKey: 'click:1', DeduplicationTTLSeconds: 3600, Attributes: { eventType: 'click' } },
            { MessageID: M2, DeduplicationKey: 'held', Attributes: { eventType: 'click' } },
            { MessageID: M3, Attributes: { eventType: 'open' } },
        ], OPTIONS);
        expect(results.map(r => r.Status)).toEqual(['Accepted', 'Duplicate', 'Accepted']);
        expect(results[1].MessageID).toBe(OWNER);
        expect(sns.Batches).toHaveLength(1);
        expect(sns.Batches[0].Entries.map(e => [e.MessageGroupId, e.MessageDeduplicationId, e.MessageAttributes])).toEqual([
            ['subscriber-9', M1, { eventType: 'click' }],
            [M3, M3, { eventType: 'open' }],
        ]);
        expect(ledger.Events).toEqual(['reserve:click:1', 'reserve:held', 'confirm:click:1:3600']);
    });

    it('releases the key of an entry SNS fails, and reports it as retryable', async () => {
        const { coordinator, sns, ledger } = Setup();
        sns.FailedEntries.set(M1, { Code: 'InternalError', Message: 'try again', SenderFault: false });
        const results = await coordinator.Publish('email.events', [{ MessageID: M1, DeduplicationKey: 'click:1', Attributes: { eventType: 'click' } }], OPTIONS);
        expect(results[0]).toEqual({ MessageID: M1, Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'SNS InternalError: try again', Retryable: true } });
        expect(ledger.Events).toEqual(['reserve:click:1', 'release:click:1']);
    });

    it('releases every key when the whole SNS call fails', async () => {
        const { coordinator, sns, ledger } = Setup();
        sns.ThrowOnPublish = new AwsGatewayError('SNS PublishBatch failed: Throttling', 'Throttling', true);
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, DeduplicationKey: 'a' },
            { MessageID: M2, DeduplicationKey: 'b' },
        ], OPTIONS);
        expect(results.every(r => r.Status === 'Rejected' && r.Error?.Retryable === true)).toBe(true);
        expect(ledger.Events).toEqual(['reserve:a', 'reserve:b', 'release:a', 'release:b']);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/FinalizeTopologyManifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { BuildTopologyManifest } from '../topology/manifest';
import { FinalizeTopologyManifest } from '../topology/FinalizeTopologyManifest';
import type { SubscriptionRow, TopicRow, TransportRow } from '../topology/rows';
import { SUBSCRIPTION_ROW, TOPIC_ROW, TRANSPORT_ROW } from './fakes';

const AWS_TRANSPORT: TransportRow = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const AWS_TOPIC: TopicRow = { ...TOPIC_ROW, Name: 'email.events', TransportID: AWS_TRANSPORT.ID, IsFifo: true };
const FILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW, ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'email.unsubscribe', PartitionMode: 'Exclusive', HostType: 'External', HandlerKey: null, Filter: '{"eventType":["unsubscribe"]}' };
const UNFILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW, ID: 'BBBBBBBB-0000-0000-0000-000000000003', Name: 'email.archive', PartitionMode: 'None', Filter: null };

function exportFor(transportName: string, subscriptions: SubscriptionRow[]) {
    const snapshot = { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [TOPIC_ROW, AWS_TOPIC], Subscriptions: subscriptions };
    return FinalizeTopologyManifest(BuildTopologyManifest(snapshot, transportName, new Date('2026-09-16T12:00:00Z')));
}

describe('FinalizeTopologyManifest', () => {
    it('renders SNS filter policies for every subscription of an AWS manifest', () => {
        const manifest = exportFor('AWS-test', [FILTERED, UNFILTERED]);
        const byName = Object.fromEntries(manifest.Topics[0].Subscriptions.map(s => [s.Name, s]));
        expect(byName['email.unsubscribe'].Aws).toEqual({ SnsFilterPolicy: '{"eventType":["unsubscribe"]}' });
        expect(byName['email.archive'].Aws).toEqual({ SnsFilterPolicy: null });
    });

    it('leaves non-AWS manifests unchanged', () => {
        const manifest = exportFor('Database', [SUBSCRIPTION_ROW]);
        expect(manifest.Topics[0].Subscriptions[0].Aws).toBeUndefined();
    });

    it('refuses a filter SNS cannot express', () => {
        const values = ['1', '2', '3', '4', '5', '6'];
        const wide: SubscriptionRow = { ...FILTERED, Filter: JSON.stringify({ a: values, b: values, c: values.slice(0, 5) }) };
        expect(() => exportFor('AWS-test', [wide])).toThrow(WorkQueueConfigurationError);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test ResolveAwsCredentials AWSTransportDriverFactory AwsPublishCoordinator`
Expected: FAIL — unresolved imports `../transports/aws/ResolveAwsCredentials`, `../transports/aws/AWSTransportDriverFactory` and `../topology/FinalizeTopologyManifest`. `AwsPublishCoordinator` needs no new code; it must pass once the others compile. If it fails, fix the defect (in `PublishToSns`, Task 4, or the coordinator, plan 05) rather than the test.

- [ ] **Step 4: Write `src/transports/aws/ResolveAwsCredentials.ts`**

```typescript
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import type { UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import type { AwsCredentialsOption } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';

export interface AwsCredentialValues {
    AccessKeyId?: string;
    SecretAccessKey?: string;
    SessionToken?: string;
    RoleArn?: string;
    ExternalId?: string;
}

export function ToAwsCredentials(values: AwsCredentialValues): AwsCredentialsOption {
    if (values.AccessKeyId && values.SecretAccessKey) {
        return {
            accessKeyId: values.AccessKeyId,
            secretAccessKey: values.SecretAccessKey,
            ...(values.SessionToken ? { sessionToken: values.SessionToken } : {}),
        };
    }
    if (values.RoleArn) {
        return fromTemporaryCredentials({
            params: { RoleArn: values.RoleArn, RoleSessionName: 'mj-work-queue', ...(values.ExternalId ? { ExternalId: values.ExternalId } : {}) },
        });
    }
    throw new WorkQueueConfigurationError('AWS credential values must contain AccessKeyId and SecretAccessKey, or RoleArn');
}

/** Null credential = SDK default chain (ambient role). Otherwise decrypts the MJ credential and maps its values. */
export async function ResolveAwsCredentials(credentialID: string | null, contextUser: UserInfo): Promise<AwsCredentialsOption> {
    if (credentialID === null) {
        return undefined;
    }
    const engine = CredentialEngine.Instance;
    await engine.Config(false, contextUser);
    const credential = engine.getCredentialById(credentialID);
    if (!credential) {
        throw new WorkQueueConfigurationError(`Credential ${credentialID} was not found`);
    }
    const resolved = await engine.getCredential<Record<string, string>>(credential.Name, { credentialId: credentialID, contextUser, subsystem: 'WorkQueue' });
    return ToAwsCredentials(resolved.values);
}
```

- [ ] **Step 5: Write `src/transports/aws/AWSTransportDriverFactory.ts`**

```typescript
import { RegisterClass } from '@memberjunction/global';
import { AwsTransportDriver, ParseAwsTransportConfig } from '@memberjunction/work-queue-aws';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import type { TransportRow } from '../../topology/rows';
import { BaseTransportDriverFactory, type TransportDriverDeps } from '../BaseTransportDriverFactory';
import { ResolveAwsCredentials } from './ResolveAwsCredentials';

/** Resolves MJ: Work Queue Transports rows with DriverClass 'AWS' to an SNS/SQS driver. */
@RegisterClass(BaseTransportDriverFactory, 'AWS')
export class AWSTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        const config = ParseAwsTransportConfig(transport.Configuration);
        const credentials = await ResolveAwsCredentials(transport.CredentialID, deps.ContextUser);
        return AwsTransportDriver.Create(config, credentials);
    }
}
```

If plan 05 exports `TransportDriverDeps` from a different module than `BaseTransportDriverFactory.ts`, import it
from that module (plan 05 Task 8 is the source of truth).

- [ ] **Step 5b: Write `src/topology/FinalizeTopologyManifest.ts` and call it from `ExportManifest`**

```typescript
import { SnsFilterPolicyFor } from '@memberjunction/work-queue-aws';
import type { ManifestSubscription, TopologyManifest } from '@memberjunction/work-queue-core';

export const AWS_DRIVER_CLASS = 'AWS';

function withAwsExtension(subscription: ManifestSubscription): ManifestSubscription {
    return { ...subscription, Aws: { SnsFilterPolicy: SnsFilterPolicyFor(subscription.Filter) } };
}

/**
 * Transport-specific manifest rendering, applied after BuildTopologyManifest (plan 05) so infrastructure code never
 * re-translates policy. SnsFilterPolicyFor throws WorkQueueConfigurationError for filters SNS cannot express.
 */
export function FinalizeTopologyManifest(manifest: TopologyManifest): TopologyManifest {
    if (manifest.Transport.DriverClass !== AWS_DRIVER_CLASS) {
        return manifest;
    }
    return {
        ...manifest,
        Topics: manifest.Topics.map(topic => ({ ...topic, Subscriptions: topic.Subscriptions.map(withAwsExtension) })),
    };
}
```

In `packages/WorkQueue/engine/src/WorkQueueEngine.ts`, add the import and replace `ExportManifest`:

```typescript
import { FinalizeTopologyManifest } from './topology/FinalizeTopologyManifest';
```

```typescript
    public ExportManifest(transportName: string): TopologyManifest {
        return FinalizeTopologyManifest(BuildTopologyManifest(this.Snapshot, transportName, new Date()));
    }
```

- [ ] **Step 6: Export the modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transports/aws/ResolveAwsCredentials';
export * from './transports/aws/AWSTransportDriverFactory';
export * from './topology/FinalizeTopologyManifest';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — the engine's existing suites (including plan 05's `manifest` tests, unchanged for Database manifests) plus ResolveAwsCredentials (5), AWSTransportDriverFactory (3), AwsPublishCoordinator (3), FinalizeTopologyManifest (3).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

Run: `cd packages/ServerBootstrap && pnpm run build`
Expected: builds, and the regenerated `src/generated/mj-class-registrations.ts` contains `AWSTransportDriverFactory` (the engine is a ServerBootstrap dependency from plan 06).

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/engine packages/ServerBootstrap/src/generated/mj-class-registrations.ts pnpm-lock.yaml
git commit -m "feat(work-queue-engine): AWS driver factory with MJ credential resolution and SNS filter policies in manifest export"
```

---

### Task 9: Engine — `SqsStager` for staged `Ordered` subscriptions

**Files:**
- Create: `packages/WorkQueue/engine/src/transports/aws/SqsStager.ts`, `src/transports/aws/RegisterAwsHostLoops.ts`
- Modify: `packages/WorkQueue/engine/src/transports/aws/AWSTransportDriverFactory.ts` (side-effect import), `src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/SqsStager.test.ts`, `src/__tests__/RegisterAwsHostLoops.test.ts`

**Interfaces:**
- Consumes:
  - Plan 06 Task 2 (`src/host/WorkQueueHostLoopRegistry.ts`): `interface IHostLoop { readonly Name: string; Start(): void; Stop(): Promise<void> }`; `interface HostLoopContext { InstanceID; Subscription: MJWorkQueueSubscriptionEntity; Topic: MJWorkQueueTopicEntity; Transport: MJWorkQueueTransportEntity; Binding: SubscriptionBinding; StagedToDatabase: boolean; ContextUser; Executor; Log: WorkLogger; KickConsumer(): void }`; `type HostLoopFactory = (context: HostLoopContext) => Promise<IHostLoop[]>`; `WorkQueueHostLoopRegistry.Instance.Register(driverClass, factory)` / `.Get(driverClass)`. The host calls the factory for every hosted subscription on the transport, starts the returned loops with the consumer runtime and stops them on shutdown.
  - Plan 05 Task 12 (`src/transports/database/DatabaseTransportDriver.ts`): `interface StageDeliveriesRequest { TopicID: string; SubscriptionID: string; PartitionMode: PartitionMode; OrderingMode: OrderingMode; Messages: WorkMessage[] }`; `type StageResult = { MessageID; Kind: 'Staged' } | { MessageID; Kind: 'AlreadyStaged' } | { MessageID; Kind: 'Rejected'; Code; Message }`; `DatabaseTransportDriver.StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>` — the whole batch in one transaction, results in request order, a thrown error rolls the batch back. Plan 05 Task 13: `WorkQueueEngine.Instance.GetDriver(transportID)`, `WorkQueueEngine.Instance.GetDatabaseDriver(): Promise<DatabaseTransportDriver>`.
  - `SqsGateway`, `SqsReceivedMessage`, `ParseEnvelopeBody`, `ReadAwsSubscriptionConfig`, `SendToDeadLetterQueue`, `AwsTransportDriver`, `DEAD_LETTER_ATTRIBUTES` (Tasks 1–6); `FakeSqsGateway`, `FakeSnsGateway`, `TestAwsResources`, `TestMessage`, `TestSubscriptionBinding` (`@memberjunction/work-queue-aws/testing`); `RecordingExecutor`, `RecordingLogger` (plan 05 test fakes).
- Produces:
  - `interface StagingTarget { StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]> }`
  - `interface StagingIdentity { TopicID: string; SubscriptionID: string; PartitionMode: PartitionMode; OrderingMode: OrderingMode }`
  - `interface SqsStagerOptions { ReceiveBatchSize?: number; WaitTimeSeconds?: number; VisibilityTimeoutSeconds?: number; FailureBackoffSeconds?: number; IdleDelayMs?: number; Now?: () => number }`
  - `class SqsStager implements IHostLoop` — `constructor(gateway: SqsGateway, target: StagingTarget, binding: SubscriptionBinding, identity: StagingIdentity, onStaged: () => void, log: WorkLogger, options?: SqsStagerOptions)`, `RunOnce(signal: AbortSignal): Promise<number>`
  - `interface AwsHostLoopDrivers { Aws(context: HostLoopContext): Promise<ITransportDriver>; Database(context: HostLoopContext): Promise<StagingTarget> }`, `ENGINE_DRIVERS: AwsHostLoopDrivers`, `StagingIdentityFor(context: HostLoopContext): StagingIdentity`
  - `CreateAwsHostLoopFactory(drivers?: AwsHostLoopDrivers): HostLoopFactory`, `RegisterAwsHostLoops(): void`

**Staging contract (03 §5.1).**

```
SQS FIFO queue (Ordered subscription)                  MJ database
  ReceiveMessage (≤10, visibility 60 s) ──► parse ──► StageDeliveries(batch) — one transaction, receive order
                                                         Staged / AlreadyStaged ──► DeleteMessage
                                                         Rejected (MessageIDConflict, DuplicateSequence) ──► DLQ (reason = Code) + DeleteMessage + log error
                                                         any Staged ──► KickConsumer()
                                                         throws (rolled back) ──► stage one at a time, in order:
                                                            result handled as above
                                                            first throw ──► hide it and every later message 30 s
  unparseable body ────────────────────────────────────► DLQ (InvalidEnvelope) + DeleteMessage
```

- **Identity.** `TopicID`/`SubscriptionID` come from the context's `Topic` and `Subscription` entities,
  `PartitionMode` from `Subscription.PartitionMode`, `OrderingMode` from `Topic.OrderingMode`.
- **Order.** SQS FIFO does not release a group's next message while an earlier one is in flight, and a batch lists a
  group's messages in order. Staging inserts in request order, and after a thrown error nothing later in the batch is
  staged, so `PublishOrdinal` follows publish order per key across instances.
- **Idempotency.** A crash after commit and before `DeleteMessage` redelivers the message; it comes back
  `AlreadyStaged` and is deleted.
- **Rejected messages** are permanent producer errors (a reused `MessageID` with a different envelope, or a sequence
  already used by another message) that MJ publish validation normally prevents. They were never staged, so they
  cannot block a database key; they go to the SQS dead-letter queue for the operator.
- **Outages.** Nothing is deleted unless its result was returned. Staged queues redrive only after 1000 receives
  (Tasks 4 and 10), so a long database outage does not move messages to the dead-letter queue and break order.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/SqsStager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEAD_LETTER_ATTRIBUTES } from '@memberjunction/work-queue-aws';
import { FakeSqsGateway, TestAwsResources, TestMessage, TestSubscriptionBinding } from '@memberjunction/work-queue-aws/testing';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import type { StageDeliveriesRequest, StageResult } from '../transports/database/DatabaseTransportDriver';
import { SqsStager, type StagingIdentity, type StagingTarget } from '../transports/aws/SqsStager';
import { RecordingLogger } from './fakes';

const r = TestAwsResources(true);
const IDENTITY: StagingIdentity = {
    TopicID: 'AAAAAAAA-0000-4000-8000-000000000001', SubscriptionID: 'DDDDDDDD-0000-4000-8000-000000000001',
    PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence',
};

class RecordingTarget implements StagingTarget {
    public readonly Requests: StageDeliveriesRequest[] = [];
    public readonly Existing = new Set<string>();
    public readonly Rejections = new Map<string, { Code: string; Message: string }>();
    public ThrowWhenIncluding: string | null = null;

    public async StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]> {
        this.Requests.push(request);
        if (this.ThrowWhenIncluding !== null && request.Messages.some((m) => m.MessageID === this.ThrowWhenIncluding)) {
            throw new Error('database unavailable');
        }
        return request.Messages.map((m): StageResult => {
            const rejection = this.Rejections.get(m.MessageID);
            if (rejection) {
                return { MessageID: m.MessageID, Kind: 'Rejected', ...rejection };
            }
            const kind = this.Existing.has(m.MessageID) ? 'AlreadyStaged' : 'Staged';
            this.Existing.add(m.MessageID);
            return { MessageID: m.MessageID, Kind: kind };
        });
    }
}

let sqs: FakeSqsGateway;
let target: RecordingTarget;
let binding: SubscriptionBinding;
let log: RecordingLogger;
let kicks: number;
let stager: SqsStager;
const signal = new AbortController().signal;

async function send(index: number, group: string, body?: string): Promise<void> {
    await sqs.Send({ QueueUrl: r.QueueUrl, Body: body ?? JSON.stringify(TestMessage(index, { PartitionKey: group })), MessageGroupId: group, MessageDeduplicationId: `d-${index}` });
}

function remainingIDs(): string[] {
    return sqs.Messages(r.QueueUrl).map((m) => JSON.parse(m.Body).MessageID);
}

beforeEach(() => {
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
    target = new RecordingTarget();
    binding = TestSubscriptionBinding(true, { Policy: { PartitionMode: 'Ordered', SubscriptionName: 'integration.apply' }, HostType: 'MJWorker' });
    log = new RecordingLogger();
    kicks = 0;
    stager = new SqsStager(sqs, target, binding, IDENTITY, () => { kicks += 1; }, log, { WaitTimeSeconds: 0, IdleDelayMs: 5, Now: () => sqs.Now });
});

describe('SqsStager.RunOnce', () => {
    it('stages a batch in receive order with the subscription identity, deletes it and kicks once', async () => {
        await send(1, 'a');
        await send(2, 'b');
        expect(await stager.RunOnce(signal)).toBe(2);
        expect(target.Requests).toEqual([{ ...IDENTITY, Messages: [TestMessage(1, { PartitionKey: 'a' }), TestMessage(2, { PartitionKey: 'b' })] }]);
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(kicks).toBe(1);
    });

    it('deletes already-staged redeliveries without kicking', async () => {
        await send(1, 'a');
        target.Existing.add(TestMessage(1).MessageID);
        expect(await stager.RunOnce(signal)).toBe(0);
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(kicks).toBe(0);
    });

    it('dead-letters a rejected message with its code and message, and stages the rest', async () => {
        await send(1, 'a');
        await send(2, 'b');
        target.Rejections.set(TestMessage(1).MessageID, { Code: 'DuplicateSequence', Message: 'sequence 3 already published by another message' });
        expect(await stager.RunOnce(signal)).toBe(1);
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('DuplicateSequence');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toBe('sequence 3 already published by another message');
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(log.Lines.some((line) => line.startsWith('ERROR') && line.includes('rejected'))).toBe(true);
    });

    it('dead-letters an unparseable body and stages the rest', async () => {
        await send(1, 'a', 'not an envelope');
        await send(2, 'b');
        expect(await stager.RunOnce(signal)).toBe(1);
        expect(target.Requests[0].Messages.map((m) => m.MessageID)).toEqual([TestMessage(2).MessageID]);
        expect(sqs.Messages(r.DeadLetterQueueUrl)[0].Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');
    });

    it('after a rolled-back batch, stages earlier messages one at a time and holds back the failing one and everything after it', async () => {
        await send(1, 'a');
        await send(2, 'b');
        await send(3, 'c');
        target.ThrowWhenIncluding = TestMessage(2).MessageID;
        expect(await stager.RunOnce(signal)).toBe(1);
        expect(target.Requests.map((request) => request.Messages.length)).toEqual([3, 1, 1]);
        expect(remainingIDs()).toEqual([TestMessage(2).MessageID, TestMessage(3).MessageID]);
        expect(sqs.Messages(r.QueueUrl).every((m) => m.VisibleAt === sqs.Now + 30_000)).toBe(true);
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
        expect(kicks).toBe(1);
    });

    it('does nothing when the queue is empty', async () => {
        expect(await stager.RunOnce(signal)).toBe(0);
        expect(target.Requests).toHaveLength(0);
    });

    it('preserves order within a group across batches', async () => {
        stager = new SqsStager(sqs, target, binding, IDENTITY, () => undefined, log, { WaitTimeSeconds: 0, ReceiveBatchSize: 1, Now: () => sqs.Now });
        await send(1, 'a');
        await send(2, 'a');
        await stager.RunOnce(signal);
        await stager.RunOnce(signal);
        expect(target.Requests.map((request) => request.Messages[0].MessageID)).toEqual([TestMessage(1).MessageID, TestMessage(2).MessageID]);
    });
});

describe('SqsStager loop', () => {
    it('stages while running and stops cleanly', async () => {
        stager.Start();
        await send(1, 'a');
        await vi.waitFor(() => expect(target.Requests).toHaveLength(1), { timeout: 2000, interval: 10 });
        await stager.Stop();
        const requestsAfterStop = target.Requests.length;
        await send(2, 'a');
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(target.Requests).toHaveLength(requestsAfterStop);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/RegisterAwsHostLoops.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { AWS_TRANSPORT_CAPABILITIES, AwsTransportDriver } from '@memberjunction/work-queue-aws';
import { FakeSnsGateway, FakeSqsGateway, TestSubscriptionBinding } from '@memberjunction/work-queue-aws/testing';
import type {
    BindingValidationIssue, ITransportConsumer, ITransportDriver, ITransportOperator, PublishResult, WorkJson,
} from '@memberjunction/work-queue-core';
import { WorkQueueHostLoopRegistry, type HostLoopContext } from '../host/WorkQueueHostLoopRegistry';
import type { StageDeliveriesRequest, StageResult } from '../transports/database/DatabaseTransportDriver';
import { CreateAwsHostLoopFactory, RegisterAwsHostLoops, StagingIdentityFor, type AwsHostLoopDrivers } from '../transports/aws/RegisterAwsHostLoops';
import { SqsStager, type StagingTarget } from '../transports/aws/SqsStager';
import { RecordingExecutor, RecordingLogger } from './fakes';

class OtherDriver implements ITransportDriver {
    public readonly Name: string = 'Azure';
    public readonly Capabilities = AWS_TRANSPORT_CAPABILITIES;
    public async Publish(): Promise<PublishResult[]> { return []; }
    public OpenConsumer<TPayload extends WorkJson>(): ITransportConsumer<TPayload> { throw new Error('not used'); }
    public Operator(): ITransportOperator { throw new Error('not used'); }
    public async ValidateBindings(): Promise<BindingValidationIssue[]> { return []; }
}

const TARGET: StagingTarget = {
    StageDeliveries: async (request: StageDeliveriesRequest): Promise<StageResult[]> => request.Messages.map((m) => ({ MessageID: m.MessageID, Kind: 'Staged' })),
};

function context(staged: boolean): HostLoopContext {
    return {
        InstanceID: 'host-1', StagedToDatabase: staged,
        Subscription: { ID: 'DDDDDDDD-0000-4000-8000-000000000001', Name: 'integration.apply', PartitionMode: 'Ordered' } as MJWorkQueueSubscriptionEntity,
        Topic: { ID: 'AAAAAAAA-0000-4000-8000-000000000001', Name: 'integration.batch-ready', OrderingMode: 'ExplicitSequence' } as MJWorkQueueTopicEntity,
        Transport: { ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS' } as MJWorkQueueTransportEntity,
        Binding: TestSubscriptionBinding(true, { Policy: { PartitionMode: 'Ordered' }, HostType: 'MJWorker' }),
        ContextUser: { ID: 'user-1' } as UserInfo, Executor: new RecordingExecutor(), Log: new RecordingLogger(), KickConsumer: () => undefined,
    };
}

function drivers(aws: ITransportDriver): AwsHostLoopDrivers {
    return { Aws: async () => aws, Database: async () => TARGET };
}

describe('AWS host loops', () => {
    it('registers a factory for the AWS driver class', () => {
        RegisterAwsHostLoops();
        expect(WorkQueueHostLoopRegistry.Instance.Get('AWS')).toBeTypeOf('function');
    });

    it('takes the staging identity from the subscription and topic entities', () => {
        expect(StagingIdentityFor(context(true))).toEqual({
            TopicID: 'AAAAAAAA-0000-4000-8000-000000000001', SubscriptionID: 'DDDDDDDD-0000-4000-8000-000000000001',
            PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence',
        });
    });

    it('returns a stager only for staged subscriptions', async () => {
        const factory = CreateAwsHostLoopFactory(drivers(new AwsTransportDriver(new FakeSnsGateway(), new FakeSqsGateway())));
        expect(await factory(context(false))).toEqual([]);
        const loops = await factory(context(true));
        expect(loops).toHaveLength(1);
        expect(loops[0]).toBeInstanceOf(SqsStager);
        expect(loops[0].Name).toBe('stager:integration.apply');
    });

    it('refuses a transport driver that is not the AWS driver', async () => {
        await expect(CreateAwsHostLoopFactory(drivers(new OtherDriver()))(context(true))).rejects.toThrow('requires the AWS transport driver');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test SqsStager RegisterAwsHostLoops`
Expected: FAIL — unresolved imports `../transports/aws/SqsStager`, `../transports/aws/RegisterAwsHostLoops`.

- [ ] **Step 3: Write `src/transports/aws/SqsStager.ts`**

```typescript
import {
    ParseEnvelopeBody, ReadAwsSubscriptionConfig, SendToDeadLetterQueue, type AwsSubscriptionConfig, type SqsGateway, type SqsReceivedMessage,
} from '@memberjunction/work-queue-aws';
import type { OrderingMode, PartitionMode, SubscriptionBinding, WorkLogger, WorkMessage } from '@memberjunction/work-queue-core';
import type { IHostLoop } from '../../host/WorkQueueHostLoopRegistry';
import type { StageDeliveriesRequest, StageResult } from '../database/DatabaseTransportDriver';

export interface StagingTarget {
    StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>;
}

export interface StagingIdentity {
    TopicID: string;
    SubscriptionID: string;
    PartitionMode: PartitionMode;
    OrderingMode: OrderingMode;
}

export interface SqsStagerOptions {
    ReceiveBatchSize?: number;
    WaitTimeSeconds?: number;
    VisibilityTimeoutSeconds?: number;
    FailureBackoffSeconds?: number;
    /** Pause after a cycle that staged nothing (guards a zero-wait receive from spinning). */
    IdleDelayMs?: number;
    Now?: () => number;
}

interface Parsed {
    Raw: SqsReceivedMessage;
    Envelope: WorkMessage;
}

function errorOf(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted || ms <= 0) {
            resolve();
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
}

/** Copies an Ordered subscription's SQS messages into Database delivery rows (03 §5.1). */
export class SqsStager implements IHostLoop {
    public readonly Name: string;
    private readonly config: AwsSubscriptionConfig;
    private readonly batchSize: number;
    private readonly waitSeconds: number;
    private readonly visibilitySeconds: number;
    private readonly backoffSeconds: number;
    private readonly idleDelayMs: number;
    private readonly now: () => number;
    private controller: AbortController | null = null;
    private running: Promise<void> | null = null;

    constructor(
        private readonly gateway: SqsGateway,
        private readonly target: StagingTarget,
        private readonly binding: SubscriptionBinding,
        private readonly identity: StagingIdentity,
        private readonly onStaged: () => void,
        private readonly log: WorkLogger,
        options: SqsStagerOptions = {},
    ) {
        this.Name = `stager:${binding.Policy.SubscriptionName}`;
        this.config = ReadAwsSubscriptionConfig(binding.Config);
        this.batchSize = options.ReceiveBatchSize ?? 10;
        this.waitSeconds = options.WaitTimeSeconds ?? 20;
        this.visibilitySeconds = options.VisibilityTimeoutSeconds ?? 60;
        this.backoffSeconds = options.FailureBackoffSeconds ?? 30;
        this.idleDelayMs = options.IdleDelayMs ?? 250;
        this.now = options.Now ?? Date.now;
    }

    public Start(): void {
        if (this.running) {
            return;
        }
        this.controller = new AbortController();
        this.running = this.loop(this.controller.signal);
    }

    public async Stop(): Promise<void> {
        this.controller?.abort();
        await this.running;
        this.running = null;
        this.controller = null;
    }

    /** One receive → stage → settle cycle. Returns the number of newly staged messages. */
    public async RunOnce(signal: AbortSignal): Promise<number> {
        const received = await this.gateway.Receive({
            QueueUrl: this.config.QueueUrl, MaxMessages: this.batchSize, WaitTimeSeconds: this.waitSeconds,
            VisibilityTimeoutSeconds: this.visibilitySeconds, Signal: signal,
        });
        const parsed = await this.parseOrDeadLetter(received);
        if (parsed.length === 0) {
            return 0;
        }
        let staged: number;
        try {
            staged = await this.settle(parsed, await this.stage(parsed));
        } catch (error) {
            this.log.Warn('Batch staging failed; staging one message at a time', { subscription: this.binding.Policy.SubscriptionName, error: errorOf(error).message });
            staged = await this.stageIndividually(parsed);
        }
        if (staged > 0) {
            this.onStaged();
        }
        return staged;
    }

    private stage(parsed: Parsed[]): Promise<StageResult[]> {
        return this.target.StageDeliveries({ ...this.identity, Messages: parsed.map((p) => p.Envelope) });
    }

    private async parseOrDeadLetter(received: SqsReceivedMessage[]): Promise<Parsed[]> {
        const parsed: Parsed[] = [];
        for (const raw of received) {
            const envelope = ParseEnvelopeBody(raw.Body);
            if (envelope === null) {
                await this.deadLetter(raw, 'InvalidEnvelope', 'Body is not a work-queue envelope');
            } else {
                parsed.push({ Raw: raw, Envelope: envelope });
            }
        }
        return parsed;
    }

    /** Applies results (request order): delete staged and already-staged messages, dead-letter rejected ones. */
    private async settle(parsed: Parsed[], results: StageResult[]): Promise<number> {
        let staged = 0;
        for (let i = 0; i < parsed.length; i++) {
            const result = results[i];
            if (result === undefined) {
                continue;   // no result: leave the message; it is redelivered after its visibility timeout
            }
            if (result.Kind === 'Rejected') {
                this.log.Error(`Staging rejected message ${result.MessageID}: ${result.Code}`, undefined, { subscription: this.binding.Policy.SubscriptionName, detail: result.Message });
                await this.deadLetter(parsed[i].Raw, result.Code, result.Message);
                continue;
            }
            await this.gateway.Delete(this.config.QueueUrl, parsed[i].Raw.ReceiptHandle);
            staged += result.Kind === 'Staged' ? 1 : 0;
        }
        return staged;
    }

    /** Stages in order; at the first thrown error, hides that message and every later one so order is kept. */
    private async stageIndividually(parsed: Parsed[]): Promise<number> {
        let staged = 0;
        for (let i = 0; i < parsed.length; i++) {
            try {
                staged += await this.settle([parsed[i]], await this.stage([parsed[i]]));
            } catch (error) {
                this.log.Error('Staging failed; backing off', errorOf(error), { subscription: this.binding.Policy.SubscriptionName, messageID: parsed[i].Envelope.MessageID });
                for (const later of parsed.slice(i)) {
                    await this.gateway.ChangeVisibility(this.config.QueueUrl, later.Raw.ReceiptHandle, this.backoffSeconds);
                }
                return staged;
            }
        }
        return staged;
    }

    private async deadLetter(raw: SqsReceivedMessage, reason: string, error: string): Promise<void> {
        await SendToDeadLetterQueue(this.gateway, this.config, { Message: raw, Reason: reason, Error: error, Attempts: raw.ReceiveCount }, new Date(this.now()));
        await this.gateway.Delete(this.config.QueueUrl, raw.ReceiptHandle);
    }

    private async loop(signal: AbortSignal): Promise<void> {
        while (!signal.aborted) {
            try {
                if ((await this.RunOnce(signal)) === 0) {
                    await delay(this.idleDelayMs, signal);
                }
            } catch (error) {
                this.log.Error('Stager cycle failed', errorOf(error), { subscription: this.binding.Policy.SubscriptionName });
                await delay(this.backoffSeconds * 1000, signal);
            }
        }
    }
}
```

If the batch commits but a later `DeleteMessage` or dead-letter send throws, `RunOnce` falls into the one-at-a-time
path; the already-committed messages come back `AlreadyStaged` and are deleted, so the retry is safe.

- [ ] **Step 4: Write `src/transports/aws/RegisterAwsHostLoops.ts`**

```typescript
import { AwsTransportDriver } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError, type ITransportDriver } from '@memberjunction/work-queue-core';
import { WorkQueueHostLoopRegistry, type HostLoopContext, type HostLoopFactory, type IHostLoop } from '../../host/WorkQueueHostLoopRegistry';
import { WorkQueueEngine } from '../../WorkQueueEngine';
import { SqsStager, type StagingIdentity, type StagingTarget } from './SqsStager';

export interface AwsHostLoopDrivers {
    Aws(context: HostLoopContext): Promise<ITransportDriver>;
    Database(context: HostLoopContext): Promise<StagingTarget>;
}

/** Both drivers come from the engine's cache (credentials, pools and instance IDs included). */
export const ENGINE_DRIVERS: AwsHostLoopDrivers = {
    Aws: (context) => WorkQueueEngine.Instance.GetDriver(context.Transport.ID),
    Database: () => WorkQueueEngine.Instance.GetDatabaseDriver(),
};

export function StagingIdentityFor(context: HostLoopContext): StagingIdentity {
    return {
        TopicID: context.Topic.ID,
        SubscriptionID: context.Subscription.ID,
        PartitionMode: context.Subscription.PartitionMode,
        OrderingMode: context.Topic.OrderingMode,
    };
}

export function CreateAwsHostLoopFactory(drivers: AwsHostLoopDrivers = ENGINE_DRIVERS): HostLoopFactory {
    return async (context: HostLoopContext): Promise<IHostLoop[]> => {
        if (!context.StagedToDatabase) {
            return [];
        }
        const aws = await drivers.Aws(context);
        if (!(aws instanceof AwsTransportDriver)) {
            throw new WorkQueueConfigurationError(`Subscription '${context.Subscription.Name}': staging requires the AWS transport driver, got '${aws.Name}'`);
        }
        const database = await drivers.Database(context);
        return [new SqsStager(aws.Sqs, database, context.Binding, StagingIdentityFor(context), () => context.KickConsumer(), context.Log)];
    };
}

export function RegisterAwsHostLoops(): void {
    WorkQueueHostLoopRegistry.Instance.Register('AWS', CreateAwsHostLoopFactory());
}

RegisterAwsHostLoops();
```

In `packages/WorkQueue/engine/src/transports/aws/AWSTransportDriverFactory.ts`, add after the existing imports:

```typescript
// Loading the AWS factory (the class manifest does) also registers the SQS stager with the host loop registry.
import './RegisterAwsHostLoops';
```

- [ ] **Step 5: Export the modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transports/aws/SqsStager';
export * from './transports/aws/RegisterAwsHostLoops';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — existing suites, the Task 8 suites, plus SqsStager (8), RegisterAwsHostLoops (4).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): stage AWS Ordered subscriptions into database deliveries"
```

---

### Task 10: Terraform module `infrastructure/terraform/work-queue/aws`

**Files:**
- Create: `infrastructure/terraform/work-queue/aws/versions.tf`, `variables.tf`, `locals.tf`, `topics.tf`, `subscriptions.tf`, `lambda.tf`, `iam.tf`, `alarms.tf`, `outputs.tf`, `.tflint.hcl`, `README.md`
- Create: `infrastructure/terraform/work-queue/aws/tests/basic.tftest.hcl`, `tests/fixtures/manifest.json`, `tests/fixtures/invalid-standard-exclusive.json`, `tests/fixtures/invalid-ordered-external.json`
- Create: `infrastructure/terraform/work-queue/aws/examples/basic/main.tf`, `examples/basic/manifest.json`

**Interfaces:**
- Consumes: the topology manifest (03 §10: `TopologyManifest`, `ManifestTopic`, `ManifestSubscription` including `StagedToDatabase` and `Aws.SnsFilterPolicy`), produced by `mj queue export-topology` (plan 06); the naming rule of `AwsResourceName` (Task 1); `ExpectedMaxReceiveCount` (Task 4); the `MJ_WQ_SUBSCRIPTION` contract (Task 7).
- Produces:
  - Module inputs: `manifest_path`, `name_prefix`, `environment`, `region`, `kms_key_arn`, `lambda_consumers`, `fifo_high_throughput`, `message_retention_seconds`, `alarm_actions`, `oldest_message_age_alarm_seconds`, `tags`
  - Outputs: `binding_import` (exactly 03 §10 `BindingImport`, subscriptions carrying the Task 1 `AwsSubscriptionConfig` fields), `mjapi_policy_json`, `mj_worker_policy_json`, `lambda_function_arns`

What the module creates, per manifest entry:

| Manifest | Resources |
| --- | --- |
| Topic | `aws_sns_topic` (FIFO when `IsFifo`; precondition: FIFO required for partitioned subscriptions or `ExplicitSequence`) |
| Subscription | DLQ `aws_sqs_queue` + redrive-allow policy; subscription `aws_sqs_queue` (redrive `maxReceiveCount` = 1000 when staged, else `MaxAttempts + 2`; visibility = `max(LeaseSeconds, 6 × Lambda timeout)` for Lambda consumers, else `max(LeaseSeconds, 30)`; FIFO high-throughput mode); queue policy allowing only its topic; `aws_sns_topic_subscription` (raw delivery, `FilterPolicyScope = MessageAttributes`, the manifest's pre-rendered policy) |
| `External` subscription listed in `lambda_consumers` | IAM role (consume its queue, send to its DLQ, basic logging, optional KMS/extra policy), `aws_lambda_function` with `MJ_WQ_SUBSCRIPTION`, event source mapping with `ReportBatchItemFailures` |
| Every subscription | CloudWatch alarms: DLQ has messages; oldest message age; Lambda errors and throttles for Lambda consumers |

Guard rails: an `Ordered` subscription must be `MJWorker` (staged); `lambda_consumers` keys must name `External`
subscriptions; an `External` subscription with no `lambda_consumers` entry is a `check` warning (its consumer may be
deployed elsewhere).

- [ ] **Step 1: Write the test fixtures**

`infrastructure/terraform/work-queue/aws/tests/fixtures/manifest.json`:

```json
{
  "ManifestVersion": 1,
  "GeneratedAt": "2026-09-16T12:00:00.000Z",
  "Transport": { "Name": "AWS-prod", "DriverClass": "AWS", "Configuration": { "Region": "us-east-1" } },
  "Topics": [
    {
      "Name": "email.events",
      "OrderingMode": "PublishOrder",
      "IsFifo": false,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "email.archive",
          "Filter": null,
          "Policy": { "SubscriptionName": "email.archive", "TopicName": "email.events", "OrderingMode": "PublishOrder", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "External",
          "StagedToDatabase": false,
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        },
        {
          "Name": "email.dashboard",
          "Filter": { "eventType": ["click", "open"] },
          "Policy": { "SubscriptionName": "email.dashboard", "TopicName": "email.events", "OrderingMode": "PublishOrder", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "StagedToDatabase": false,
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": "{\"eventType\":[\"click\",\"open\"]}" }
        },
        {
          "Name": "email.unsubscribe",
          "Filter": { "eventType": ["unsubscribe"] },
          "Policy": { "SubscriptionName": "email.unsubscribe", "TopicName": "email.events", "OrderingMode": "PublishOrder", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "External",
          "StagedToDatabase": false,
          "ExternalRef": "arn:aws:lambda:us-east-1:123456789012:function:suppression",
          "Aws": { "SnsFilterPolicy": "{\"eventType\":[\"unsubscribe\"]}" }
        }
      ]
    },
    {
      "Name": "integration.batch-ready",
      "OrderingMode": "ExplicitSequence",
      "IsFifo": true,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "integration.apply",
          "Filter": null,
          "Policy": { "SubscriptionName": "integration.apply", "TopicName": "integration.batch-ready", "OrderingMode": "ExplicitSequence", "PartitionMode": "Ordered", "MaxAttempts": 3, "BackoffBaseSeconds": 60, "BackoffMaxSeconds": 1800, "LeaseSeconds": 300, "HeartbeatMode": "Manual", "SequenceGapAlertSeconds": 3600 },
          "HostType": "MJWorker",
          "StagedToDatabase": true,
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        },
        {
          "Name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "Filter": null,
          "Policy": { "SubscriptionName": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "TopicName": "integration.batch-ready", "OrderingMode": "ExplicitSequence", "PartitionMode": "Exclusive", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "StagedToDatabase": false,
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        }
      ]
    }
  ]
}
```

The 90-character subscription name exercises the shortened-name rule and must produce the same queue name as the
Task 1 unit test: `mj-wq-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ec270642.fifo`.

`infrastructure/terraform/work-queue/aws/tests/fixtures/invalid-standard-exclusive.json`:

```json
{
  "ManifestVersion": 1,
  "GeneratedAt": "2026-09-16T12:00:00.000Z",
  "Transport": { "Name": "AWS-prod", "DriverClass": "AWS", "Configuration": { "Region": "us-east-1" } },
  "Topics": [
    {
      "Name": "email.events",
      "OrderingMode": "PublishOrder",
      "IsFifo": false,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "email.subscriber-update",
          "Filter": null,
          "Policy": { "SubscriptionName": "email.subscriber-update", "TopicName": "email.events", "OrderingMode": "PublishOrder", "PartitionMode": "Exclusive", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "StagedToDatabase": false,
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        }
      ]
    }
  ]
}
```

`infrastructure/terraform/work-queue/aws/tests/fixtures/invalid-ordered-external.json`:

```json
{
  "ManifestVersion": 1,
  "GeneratedAt": "2026-09-16T12:00:00.000Z",
  "Transport": { "Name": "AWS-prod", "DriverClass": "AWS", "Configuration": { "Region": "us-east-1" } },
  "Topics": [
    {
      "Name": "integration.batch-ready",
      "OrderingMode": "PublishOrder",
      "IsFifo": true,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "integration.apply",
          "Filter": null,
          "Policy": { "SubscriptionName": "integration.apply", "TopicName": "integration.batch-ready", "OrderingMode": "PublishOrder", "PartitionMode": "Ordered", "MaxAttempts": 3, "BackoffBaseSeconds": 60, "BackoffMaxSeconds": 1800, "LeaseSeconds": 300, "HeartbeatMode": "Manual" },
          "HostType": "External",
          "StagedToDatabase": false,
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the failing module test**

`infrastructure/terraform/work-queue/aws/tests/basic.tftest.hcl`:

```hcl
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:mock-topic"
    }
  }
  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:us-east-1:123456789012:mock-queue"
      url = "https://sqs.us-east-1.amazonaws.com/123456789012/mock-queue"
    }
  }
  mock_resource "aws_sns_topic_subscription" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:mock-topic:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }
  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-1:123456789012:function:mock"
    }
  }
}

variables {
  manifest_path = "tests/fixtures/manifest.json"
  name_prefix   = "mj-wq"
  environment   = "prod"
  region        = "us-east-1"
  lambda_consumers = {
    "email.archive" = {
      s3_bucket       = "mj-artifacts"
      s3_key          = "work-queue/email-archive/3f2a9c1d.zip"
      timeout_seconds = 60
    }
  }
}

run "creates_named_resources_with_policies" {
  command = apply

  assert {
    condition     = aws_sns_topic.this["email.events"].name == "mj-wq-prod-email-events"
    error_message = "Standard topic name does not follow the naming rule."
  }
  assert {
    condition     = aws_sns_topic.this["integration.batch-ready"].name == "mj-wq-prod-integration-batch-ready.fifo" && aws_sns_topic.this["integration.batch-ready"].fifo_topic
    error_message = "FIFO topic name or flag is wrong."
  }
  assert {
    condition     = aws_sqs_queue.subscription["email.unsubscribe"].name == "mj-wq-prod-email-unsubscribe"
    error_message = "Standard queue name does not match AwsResourceName."
  }
  assert {
    condition     = aws_sqs_queue.dead_letter["integration.apply"].name == "mj-wq-prod-integration-apply-dlq.fifo"
    error_message = "FIFO dead-letter queue name does not match AwsResourceName."
  }
  assert {
    condition     = aws_sqs_queue.subscription["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].name == "mj-wq-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ec270642.fifo"
    error_message = "Shortened queue name does not match AwsResourceName."
  }
  assert {
    condition     = jsondecode(aws_sqs_queue.subscription["integration.apply"].redrive_policy).maxReceiveCount == 1000
    error_message = "Staged Ordered subscription must redrive after 1000 receives."
  }
  assert {
    condition     = jsondecode(aws_sqs_queue.subscription["email.unsubscribe"].redrive_policy).maxReceiveCount == 7
    error_message = "Redrive must be MaxAttempts + 2."
  }
  assert {
    condition     = aws_sqs_queue.subscription["email.archive"].visibility_timeout_seconds == 360 && aws_sqs_queue.subscription["email.dashboard"].visibility_timeout_seconds == 60
    error_message = "Visibility timeout must be 6x the Lambda timeout for Lambda consumers, else max(LeaseSeconds, 30)."
  }
  assert {
    condition     = aws_sns_topic_subscription.this["email.dashboard"].filter_policy == "{\"eventType\":[\"click\",\"open\"]}" && aws_sns_topic_subscription.this["email.dashboard"].filter_policy_scope == "MessageAttributes"
    error_message = "Filter policy must be the manifest's pre-rendered policy with MessageAttributes scope."
  }
  assert {
    condition     = alltrue([for s in aws_sns_topic_subscription.this : s.raw_message_delivery])
    error_message = "Every SNS subscription must use raw message delivery."
  }
  assert {
    condition     = contains(tolist(aws_lambda_event_source_mapping.consumer["email.archive"].function_response_types), "ReportBatchItemFailures")
    error_message = "The event source mapping must report batch item failures."
  }
  assert {
    condition     = jsondecode(aws_lambda_function.consumer["email.archive"].environment[0].variables.MJ_WQ_SUBSCRIPTION).Policy.SubscriptionName == "email.archive"
    error_message = "MJ_WQ_SUBSCRIPTION must carry the subscription binding."
  }
  assert {
    condition     = length(aws_lambda_function.consumer) == 1
    error_message = "Only External subscriptions listed in lambda_consumers get a function."
  }
  assert {
    condition     = length(output.binding_import.Topics) == 2 && length(output.binding_import.Subscriptions) == 5 && output.binding_import.ManifestVersion == 1
    error_message = "binding_import must list every topic and subscription."
  }
}

run "rejects_partitioned_subscription_on_standard_topic" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-standard-exclusive.json"
    lambda_consumers = {}
  }
  expect_failures = [aws_sns_topic.this]
}

run "rejects_ordered_subscription_on_external_host" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-ordered-external.json"
    lambda_consumers = {}
  }
  expect_failures = [aws_sqs_queue.subscription]
}

run "rejects_lambda_consumer_for_mj_worker_subscription" {
  command = plan
  variables {
    lambda_consumers = {
      "integration.apply" = {
        s3_bucket = "mj-artifacts"
        s3_key    = "work-queue/integration-apply/1.zip"
      }
    }
  }
  expect_failures = [terraform_data.lambda_consumer_keys]
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd infrastructure/terraform/work-queue/aws && terraform init -backend=false && terraform test`
Expected: FAIL — `terraform init` reports no provider requirements and `terraform test` fails on references to undeclared resources (`aws_sns_topic.this`, …) and variables.

- [ ] **Step 4: Write `versions.tf` and `variables.tf`**

`infrastructure/terraform/work-queue/aws/versions.tf`:

```hcl
terraform {
  # 1.7+ for mock_provider in terraform test.
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
```

`infrastructure/terraform/work-queue/aws/variables.tf`:

```hcl
variable "manifest_path" {
  description = "Path to the topology manifest written by 'mj queue export-topology' (plan 03 section 10)."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for every resource name. Must match the prefix MJ uses when naming resources."
  type        = string
  default     = "mj-wq"

  validation {
    condition     = can(regex("^[a-z0-9-]{1,20}$", var.name_prefix))
    error_message = "name_prefix must be 1-20 characters of a-z, 0-9 and '-'."
  }
}

variable "environment" {
  description = "Environment name, e.g. dev, staging, prod."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{1,16}$", var.environment))
    error_message = "environment must be 1-16 characters of a-z, 0-9 and '-'."
  }
}

variable "region" {
  description = "AWS region the provider deploys into; written into each subscription binding."
  type        = string
}

variable "kms_key_arn" {
  description = "Customer managed KMS key for SNS and SQS encryption. Null uses SQS-managed SSE and no SNS encryption. The key policy must allow sns.amazonaws.com to use the key."
  type        = string
  default     = null
}

variable "lambda_consumers" {
  description = "Lambda consumers keyed by External subscription name. Provide either image_uri or s3_bucket + s3_key."
  type = map(object({
    s3_bucket            = optional(string)
    s3_key               = optional(string)
    image_uri            = optional(string)
    handler              = optional(string, "index.handler")
    runtime              = optional(string, "nodejs22.x")
    memory_size          = optional(number, 512)
    timeout_seconds      = optional(number, 60)
    batch_size           = optional(number, 10)
    maximum_concurrency  = optional(number)
    reserved_concurrency = optional(number)
    publish_version      = optional(bool, true)
    environment          = optional(map(string), {})
    extra_policy_json    = optional(string)
  }))
  default = {}

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : (c.image_uri != null) != (c.s3_bucket != null && c.s3_key != null)])
    error_message = "Each lambda consumer needs exactly one artifact: image_uri, or s3_bucket and s3_key."
  }

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.timeout_seconds >= 1 && c.timeout_seconds <= 900])
    error_message = "timeout_seconds must be between 1 and 900 (the Lambda maximum)."
  }
}

variable "fifo_high_throughput" {
  description = "Use per-message-group deduplication and throughput limits on FIFO queues."
  type        = bool
  default     = true
}

variable "message_retention_seconds" {
  description = "Retention for subscription queues. Dead-letter queues always keep messages for 14 days."
  type        = number
  default     = 1209600
}

variable "alarm_actions" {
  description = "SNS topic ARNs (or other alarm actions) notified by the module's CloudWatch alarms."
  type        = list(string)
  default     = []
}

variable "oldest_message_age_alarm_seconds" {
  description = "Alarm when a subscription queue's oldest message is older than this."
  type        = number
  default     = 900
}

variable "tags" {
  description = "Tags applied to every taggable resource."
  type        = map(string)
  default     = {}
}
```

- [ ] **Step 5: Write `locals.tf`**

`infrastructure/terraform/work-queue/aws/locals.tf`:

```hcl
locals {
  manifest = jsondecode(file(var.manifest_path))
  base     = "${var.name_prefix}-${var.environment}"

  topics = {
    for t in local.manifest.Topics : t.Name => {
      name          = t.Name
      is_fifo       = t.IsFifo
      ordering_mode = t.OrderingMode
      slug          = trim(replace(replace(lower(t.Name), "/[^a-z0-9_-]/", "-"), "/-+/", "-"), "-")
    }
  }

  # Every value is a scalar or a JSON string so the map has one element type.
  subscriptions = merge([
    for t in local.manifest.Topics : {
      for s in t.Subscriptions : s.Name => {
        name              = s.Name
        topic             = t.Name
        is_fifo           = t.IsFifo
        host_type         = s.HostType
        staged            = s.StagedToDatabase
        partition_mode    = s.Policy.PartitionMode
        max_attempts      = s.Policy.MaxAttempts
        lease_seconds     = s.Policy.LeaseSeconds
        policy_json       = jsonencode(s.Policy)
        filter_json       = s.Filter == null ? null : jsonencode(s.Filter)
        sns_filter_policy = try(s.Aws.SnsFilterPolicy, null)
        slug              = trim(replace(replace(lower(s.Name), "/[^a-z0-9_-]/", "-"), "/-+/", "-"), "-")
      }
    }
  ]...)

  # Naming mirrors AwsResourceName in @memberjunction/work-queue-aws (plan 07 Task 1).
  topic_fifo_suffix = { for k, t in local.topics : k => t.is_fifo ? ".fifo" : "" }
  topic_names = {
    for k, t in local.topics : k => (
      length("${local.base}-${t.slug}${local.topic_fifo_suffix[k]}") <= 256
      ? "${local.base}-${t.slug}${local.topic_fifo_suffix[k]}"
      : "${substr("${local.base}-${t.slug}", 0, 256 - length(local.topic_fifo_suffix[k]) - 9)}-${substr(sha1(t.name), 0, 8)}${local.topic_fifo_suffix[k]}"
    )
  }

  fifo_suffix = { for k, s in local.subscriptions : k => s.is_fifo ? ".fifo" : "" }
  queue_names = {
    for k, s in local.subscriptions : k => (
      length("${local.base}-${s.slug}${local.fifo_suffix[k]}") <= 80
      ? "${local.base}-${s.slug}${local.fifo_suffix[k]}"
      : "${substr("${local.base}-${s.slug}", 0, 80 - length(local.fifo_suffix[k]) - 9)}-${substr(sha1(s.name), 0, 8)}${local.fifo_suffix[k]}"
    )
  }
  dead_letter_queue_names = {
    for k, s in local.subscriptions : k => (
      length("${local.base}-${s.slug}-dlq${local.fifo_suffix[k]}") <= 80
      ? "${local.base}-${s.slug}-dlq${local.fifo_suffix[k]}"
      : "${substr("${local.base}-${s.slug}", 0, 80 - 4 - length(local.fifo_suffix[k]) - 9)}-${substr(sha1(s.name), 0, 8)}-dlq${local.fifo_suffix[k]}"
    )
  }

  lambda_subscriptions = {
    for k, s in local.subscriptions : k => s if s.host_type == "External" && contains(keys(var.lambda_consumers), k)
  }
  mj_worker_subscriptions = { for k, s in local.subscriptions : k => s if s.host_type == "MJWorker" }

  max_receive_count = { for k, s in local.subscriptions : k => s.staged ? 1000 : s.max_attempts + 2 }
  visibility_timeout_seconds = {
    for k, s in local.subscriptions : k => min(43200, (
      contains(keys(local.lambda_subscriptions), k)
      ? max(s.lease_seconds, 6 * var.lambda_consumers[k].timeout_seconds)
      : max(s.lease_seconds, 30)
    ))
  }

  common_tags = merge(var.tags, { "mj-work-queue-environment" = var.environment })
}
```


- [ ] **Step 6: Write `topics.tf` and `subscriptions.tf`**

`infrastructure/terraform/work-queue/aws/topics.tf`:

```hcl
resource "aws_sns_topic" "this" {
  for_each = local.topics

  name                        = local.topic_names[each.key]
  fifo_topic                  = each.value.is_fifo
  content_based_deduplication = false
  kms_master_key_id           = var.kms_key_arn
  tags                        = local.common_tags

  lifecycle {
    precondition {
      condition = each.value.is_fifo || (
        each.value.ordering_mode != "ExplicitSequence" &&
        length([for s in values(local.subscriptions) : s.name if s.topic == each.key && s.partition_mode != "None"]) == 0
      )
      error_message = "Topic '${each.key}' must be FIFO (IsFifo = true): it uses ExplicitSequence or has Exclusive/Ordered subscriptions (plan 03 W7)."
    }
  }
}
```

`infrastructure/terraform/work-queue/aws/subscriptions.tf`:

```hcl
resource "aws_sqs_queue" "dead_letter" {
  for_each = local.subscriptions

  name                      = local.dead_letter_queue_names[each.key]
  fifo_queue                = each.value.is_fifo
  message_retention_seconds = 1209600
  max_message_size          = 262144
  kms_master_key_id         = var.kms_key_arn
  sqs_managed_sse_enabled   = var.kms_key_arn == null ? true : null
  tags                      = local.common_tags
}

resource "aws_sqs_queue" "subscription" {
  for_each = local.subscriptions

  name                       = local.queue_names[each.key]
  fifo_queue                 = each.value.is_fifo
  deduplication_scope        = each.value.is_fifo && var.fifo_high_throughput ? "messageGroup" : null
  fifo_throughput_limit      = each.value.is_fifo && var.fifo_high_throughput ? "perMessageGroupId" : null
  visibility_timeout_seconds = local.visibility_timeout_seconds[each.key]
  message_retention_seconds  = var.message_retention_seconds
  max_message_size           = 262144
  receive_wait_time_seconds  = 20
  kms_master_key_id          = var.kms_key_arn
  sqs_managed_sse_enabled    = var.kms_key_arn == null ? true : null
  tags                       = local.common_tags

  # Staged Ordered subscriptions redrive only after 1000 receives so a database outage cannot break order;
  # everything else redrives after MaxAttempts + 2 as a crash backstop (the runtime dead-letters at MaxAttempts).
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[each.key].arn
    maxReceiveCount     = local.max_receive_count[each.key]
  })

  lifecycle {
    precondition {
      condition     = each.value.partition_mode != "Ordered" || each.value.host_type == "MJWorker"
      error_message = "Subscription '${each.key}' is Ordered on the AWS transport, so it must be hosted by an MJ worker (HostType MJWorker) and staged into the database (plan 03 section 5.1)."
    }
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "dead_letter" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.dead_letter[each.key].id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.subscription[each.key].arn]
  })
}

data "aws_iam_policy_document" "queue" {
  for_each = local.subscriptions

  statement {
    sid       = "AllowOwnTopic"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.subscription[each.key].arn]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.this[each.value.topic].arn]
    }
  }
}

resource "aws_sqs_queue_policy" "subscription" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.subscription[each.key].id
  policy    = data.aws_iam_policy_document.queue[each.key].json
}

resource "aws_sns_topic_subscription" "this" {
  for_each = local.subscriptions

  topic_arn            = aws_sns_topic.this[each.value.topic].arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.subscription[each.key].arn
  raw_message_delivery = true
  filter_policy        = each.value.sns_filter_policy
  filter_policy_scope  = each.value.sns_filter_policy == null ? null : "MessageAttributes"

  depends_on = [aws_sqs_queue_policy.subscription]

  lifecycle {
    precondition {
      condition     = each.value.filter_json == null || each.value.sns_filter_policy != null
      error_message = "Subscription '${each.key}' has a Filter but the manifest carries no Aws.SnsFilterPolicy; re-export the manifest with 'mj queue export-topology' so the subscription does not receive every message."
    }
  }
}

locals {
  # The Config half of SubscriptionBinding (plan 07 Task 1 AwsSubscriptionConfig).
  subscription_config = {
    for k, s in local.subscriptions : k => {
      Region             = var.region
      QueueUrl           = aws_sqs_queue.subscription[k].url
      QueueArn           = aws_sqs_queue.subscription[k].arn
      DeadLetterQueueUrl = aws_sqs_queue.dead_letter[k].url
      DeadLetterQueueArn = aws_sqs_queue.dead_letter[k].arn
      IsFifo             = s.is_fifo
      SnsSubscriptionArn = aws_sns_topic_subscription.this[k].arn
    }
  }
}
```

When `kms_key_arn` is set, the key policy must allow `sns.amazonaws.com` to call `kms:GenerateDataKey*` and
`kms:Decrypt`, or SNS cannot deliver to the encrypted queues (verify against the current SNS/SQS SSE documentation).

- [ ] **Step 7: Write `lambda.tf`**

`infrastructure/terraform/work-queue/aws/lambda.tf`:

```hcl
locals {
  # Function and role names are limited to 64 characters; shortened names end with a hash of the subscription name.
  function_names = {
    for k, s in local.lambda_subscriptions : k => (
      length("${local.base}-${s.slug}") <= 64 ? "${local.base}-${s.slug}" : "${substr("${local.base}-${s.slug}", 0, 55)}-${substr(sha1(k), 0, 8)}"
    )
  }

  subscription_binding_json = {
    for k, s in local.lambda_subscriptions : k => jsonencode({
      Policy   = jsondecode(s.policy_json)
      Filter   = s.filter_json == null ? null : jsondecode(s.filter_json)
      HostType = s.host_type
      Config   = local.subscription_config[k]
    })
  }
}

resource "terraform_data" "lambda_consumer_keys" {
  input = sort(keys(var.lambda_consumers))

  lifecycle {
    precondition {
      condition = alltrue([
        for k in keys(var.lambda_consumers) : contains(keys(local.subscriptions), k) && try(local.subscriptions[k].host_type, "") == "External"
      ])
      error_message = "Every lambda_consumers key must name a subscription in the manifest with HostType External."
    }
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "consumer" {
  for_each = local.lambda_subscriptions

  name               = local.function_names[each.key]
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.common_tags
}

resource "aws_cloudwatch_log_group" "consumer" {
  for_each = local.lambda_subscriptions

  name              = "/aws/lambda/${local.function_names[each.key]}"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn
  tags              = local.common_tags
}

data "aws_iam_policy_document" "consumer" {
  for_each = local.lambda_subscriptions

  statement {
    sid       = "ConsumeOwnQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.subscription[each.key].arn]
  }

  statement {
    sid       = "WriteOwnDeadLetters"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dead_letter[each.key].arn]
  }

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.consumer[each.key].arn}:*"]
  }

  dynamic "statement" {
    for_each = var.kms_key_arn == null ? [] : [var.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_role_policy" "consumer" {
  for_each = local.lambda_subscriptions

  name   = "work-queue-consumer"
  role   = aws_iam_role.consumer[each.key].id
  policy = data.aws_iam_policy_document.consumer[each.key].json
}

resource "aws_iam_role_policy" "consumer_extra" {
  for_each = { for k, s in local.lambda_subscriptions : k => s if var.lambda_consumers[k].extra_policy_json != null }

  name   = "consumer-extra"
  role   = aws_iam_role.consumer[each.key].id
  policy = var.lambda_consumers[each.key].extra_policy_json
}

resource "aws_lambda_function" "consumer" {
  for_each = local.lambda_subscriptions

  function_name                  = local.function_names[each.key]
  role                           = aws_iam_role.consumer[each.key].arn
  package_type                   = var.lambda_consumers[each.key].image_uri == null ? "Zip" : "Image"
  image_uri                      = var.lambda_consumers[each.key].image_uri
  s3_bucket                      = var.lambda_consumers[each.key].s3_bucket
  s3_key                         = var.lambda_consumers[each.key].s3_key
  handler                        = var.lambda_consumers[each.key].image_uri == null ? var.lambda_consumers[each.key].handler : null
  runtime                        = var.lambda_consumers[each.key].image_uri == null ? var.lambda_consumers[each.key].runtime : null
  memory_size                    = var.lambda_consumers[each.key].memory_size
  timeout                        = var.lambda_consumers[each.key].timeout_seconds
  reserved_concurrent_executions = coalesce(var.lambda_consumers[each.key].reserved_concurrency, -1)
  publish                        = var.lambda_consumers[each.key].publish_version
  kms_key_arn                    = var.kms_key_arn
  tags                           = local.common_tags

  environment {
    variables = merge(var.lambda_consumers[each.key].environment, {
      MJ_WQ_SUBSCRIPTION = local.subscription_binding_json[each.key]
      NODE_OPTIONS       = "--enable-source-maps"
    })
  }

  depends_on = [aws_cloudwatch_log_group.consumer, aws_iam_role_policy.consumer]
}

resource "aws_lambda_event_source_mapping" "consumer" {
  for_each = local.lambda_subscriptions

  event_source_arn        = aws_sqs_queue.subscription[each.key].arn
  function_name           = aws_lambda_function.consumer[each.key].arn
  batch_size              = var.lambda_consumers[each.key].batch_size
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true

  dynamic "scaling_config" {
    for_each = var.lambda_consumers[each.key].maximum_concurrency == null ? [] : [var.lambda_consumers[each.key].maximum_concurrency]

    content {
      maximum_concurrency = scaling_config.value
    }
  }
}
```

Add this validation to `lambda_consumers` in `variables.tf` (inside the variable block, after the timeout validation):

```hcl
  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.batch_size >= 1 && c.batch_size <= 10])
    error_message = "batch_size must be between 1 and 10 (the SQS FIFO event source maximum; larger standard-queue batches need a batching window this module does not configure)."
  }
```

`MJ_WQ_SUBSCRIPTION` is well under Lambda's 4 KB environment limit for typical policies and filters; a subscription
with a very large filter should keep its function's other environment variables small (verify against current
Lambda quotas). The consumer bundle does not have to include `@aws-sdk/*`: the Lambda Node.js runtime provides the
SDK v3 clients (Task 7 bundles with `@aws-sdk/*` external).

- [ ] **Step 8: Write `iam.tf`, `alarms.tf` and `outputs.tf`**

`infrastructure/terraform/work-queue/aws/iam.tf` — policy documents the platform team attaches to the MJAPI and
MJ worker roles (the module does not own those roles):

```hcl
locals {
  topic_arns           = [for t in aws_sns_topic.this : t.arn]
  all_queue_arns       = [for q in aws_sqs_queue.subscription : q.arn]
  all_dlq_arns         = [for q in aws_sqs_queue.dead_letter : q.arn]
  subscription_arns    = [for s in aws_sns_topic_subscription.this : s.arn]
  mj_worker_queue_arns = [for k, s in local.mj_worker_subscriptions : aws_sqs_queue.subscription[k].arn]
  mj_worker_dlq_arns   = [for k, s in local.mj_worker_subscriptions : aws_sqs_queue.dead_letter[k].arn]
}

# MJAPI: publish (REST + in-process), binding validation, and the operator remote operations
# (stats, dead-letter peek/replay/discard).
data "aws_iam_policy_document" "mjapi" {
  statement {
    sid       = "PublishTopics"
    actions   = ["sns:Publish", "sns:GetTopicAttributes"]
    resources = local.topic_arns
  }

  statement {
    sid       = "ValidateSubscriptions"
    actions   = ["sns:GetSubscriptionAttributes"]
    resources = local.subscription_arns
  }

  statement {
    sid       = "InspectQueues"
    actions   = ["sqs:GetQueueAttributes"]
    resources = concat(local.all_queue_arns, local.all_dlq_arns)
  }

  statement {
    sid       = "OperateDeadLetters"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility"]
    resources = local.all_dlq_arns
  }

  statement {
    sid       = "ReplayToSubscriptionQueues"
    actions   = ["sqs:SendMessage"]
    resources = local.all_queue_arns
  }

  dynamic "statement" {
    for_each = var.kms_key_arn == null ? [] : [var.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}

# MJ workers: consume MJWorker subscription queues (direct or staged) and write their dead letters.
data "aws_iam_policy_document" "mj_worker" {
  statement {
    sid       = "ConsumeWorkerQueues"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = local.mj_worker_queue_arns
  }

  statement {
    sid       = "WriteWorkerDeadLetters"
    actions   = ["sqs:SendMessage"]
    resources = local.mj_worker_dlq_arns
  }

  dynamic "statement" {
    for_each = var.kms_key_arn == null ? [] : [var.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}
```

If the manifest has no `MJWorker` subscriptions, `mj_worker_policy_json` has statements with empty resource lists;
do not attach it (IAM rejects empty resources).

`infrastructure/terraform/work-queue/aws/alarms.tf`:

```hcl
resource "aws_cloudwatch_metric_alarm" "dead_letters" {
  for_each = local.subscriptions

  alarm_name          = "${local.dead_letter_queue_names[each.key]}-has-messages"
  alarm_description   = "Dead letters waiting for subscription '${each.key}'. Inspect with 'mj queue dead-letters --subscription ${each.key}'."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.dead_letter[each.key].name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "oldest_message" {
  for_each = local.subscriptions

  alarm_name          = "${local.queue_names[each.key]}-backlog-age"
  alarm_description   = "Oldest message for subscription '${each.key}' is older than ${var.oldest_message_age_alarm_seconds} seconds."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = aws_sqs_queue.subscription[each.key].name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.oldest_message_age_alarm_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_subscriptions

  alarm_name          = "${local.function_names[each.key]}-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.consumer[each.key].function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = local.lambda_subscriptions

  alarm_name          = "${local.function_names[each.key]}-throttles"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.consumer[each.key].function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  tags                = local.common_tags
}
```

`infrastructure/terraform/work-queue/aws/outputs.tf`:

```hcl
output "binding_import" {
  description = "BindingImport (plan 03 section 10). Save with 'terraform output -json binding_import > bindings.json' and run 'mj queue import-bindings bindings.json'."
  value = {
    ManifestVersion = 1
    Topics = [
      for k, t in local.topics : {
        Name          = k
        BindingConfig = { SnsTopicArn = aws_sns_topic.this[k].arn }
      }
    ]
    Subscriptions = [
      for k, s in local.subscriptions : {
        Name          = k
        BindingConfig = local.subscription_config[k]
      }
    ]
  }
}

output "mjapi_policy_json" {
  description = "IAM policy JSON for the MJAPI role: publish, validation and dead-letter operations."
  value       = data.aws_iam_policy_document.mjapi.json
}

output "mj_worker_policy_json" {
  description = "IAM policy JSON for MJ worker roles consuming MJWorker subscriptions."
  value       = data.aws_iam_policy_document.mj_worker.json
}

output "lambda_function_arns" {
  description = "Consumer functions by subscription name."
  value       = { for k, f in aws_lambda_function.consumer : k => f.arn }
}

output "external_subscriptions_without_lambda" {
  description = "External subscriptions whose consumer is not deployed by this module (review: deployed elsewhere, or missing?)."
  value       = sort([for k, s in local.subscriptions : k if s.host_type == "External" && !contains(keys(var.lambda_consumers), k)])
}
```

- [ ] **Step 9: Write `.tflint.hcl`, the module README and the example**

`infrastructure/terraform/work-queue/aws/.tflint.hcl`:

```hcl
config {
  call_module_type = "none"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.38.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
```

(Before committing, check https://github.com/terraform-linters/tflint-ruleset-aws/releases and pin the newest release if it is later than `0.38.0`.)

`infrastructure/terraform/work-queue/aws/README.md`:

````markdown
# MJ Work Queue — AWS Terraform module

Creates SNS topics, SQS subscription queues, dead-letter queues, SNS subscriptions, optional Lambda consumers and
CloudWatch alarms from a MemberJunction topology manifest. MJ never creates cloud resources itself; this module is
the only supported way to provision them. The full change process is in [GOVERNANCE.md](GOVERNANCE.md).

## Usage

```hcl
module "work_queue" {
  source        = "../../infrastructure/terraform/work-queue/aws"
  manifest_path = "${path.module}/manifest.json"   # mj queue export-topology --transport AWS-prod > manifest.json
  name_prefix   = "mj-wq"
  environment   = "prod"
  region        = "us-east-1"
  alarm_actions = [aws_sns_topic.ops_alerts.arn]

  lambda_consumers = {
    "email.unsubscribe" = {
      s3_bucket       = "acme-artifacts"
      s3_key          = "work-queue/email-unsubscribe/3f2a9c1d.zip"
      timeout_seconds = 60
    }
  }
}
```

After `terraform apply`:

```bash
terraform output -json binding_import > bindings.json
mj queue import-bindings bindings.json
mj queue validate-bindings --transport AWS-prod
```

Attach `mjapi_policy_json` to the MJAPI role and `mj_worker_policy_json` to MJ worker roles.

## Rules the module enforces

| Rule | Where |
| --- | --- |
| A topic with `Exclusive`/`Ordered` subscriptions or `ExplicitSequence` ordering is FIFO | `aws_sns_topic.this` precondition |
| `Ordered` subscriptions are `MJWorker` hosted (staged into the database) | `aws_sqs_queue.subscription` precondition |
| `lambda_consumers` keys are `External` subscriptions | `terraform_data.lambda_consumer_keys` precondition |
| Redrive after `MaxAttempts + 2` receives, or 1000 for staged subscriptions | `aws_sqs_queue.subscription` |
| Raw message delivery and a `MessageAttributes` filter policy rendered by MJ | `aws_sns_topic_subscription.this` |
| Lambda visibility timeout ≥ 6 × function timeout | `locals.tf` |

Resource names follow `AwsResourceName` in `@memberjunction/work-queue-aws`; renaming a subscription replaces its
queues (see GOVERNANCE.md, destructive changes).
````

`infrastructure/terraform/work-queue/aws/examples/basic/main.tf`:

```hcl
terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

module "work_queue" {
  source = "../.."
  # Produce with: mj queue export-topology --transport AWS-dev > manifest.json
  # (the export renders Aws.SnsFilterPolicy for every subscription; never hand-edit filters here)
  manifest_path = "${path.module}/manifest.json"
  name_prefix   = "mj-wq"
  environment   = "dev"
  region        = "us-east-1"

  lambda_consumers = {
    "email.archive" = {
      s3_bucket       = "replace-with-artifact-bucket"
      s3_key          = "work-queue/email-archive/replace-with-content-hash.zip"
      timeout_seconds = 60
    }
  }
}

output "binding_import" {
  value = module.work_queue.binding_import
}
```

Copy `tests/fixtures/manifest.json` to `examples/basic/manifest.json`.

- [ ] **Step 10: Run the module checks**

Run: `cd infrastructure/terraform/work-queue/aws && terraform fmt -check -recursive`
Expected: exit code 0, no output.

Run: `terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

Run: `tflint --init && tflint`
Expected: exit code 0, no issues reported.

Run: `terraform test`
Expected: `tests/basic.tftest.hcl... pass` for all four runs and `Success! 4 passed, 0 failed.`

Run: `cd examples/basic && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

If `terraform test` reports an unknown value for a mocked computed attribute in an assertion (mock provider
behavior differs by Terraform version — verify with the version you pin), add that attribute to the matching
`mock_resource` defaults block; do not weaken the assertion.

- [ ] **Step 11: Commit**

```bash
git add infrastructure/terraform/work-queue/aws
git commit -m "feat(work-queue): manifest-driven Terraform module for the AWS transport"
```

---

### Task 11: Deployment governance runbook and CI workflow

**Files:**
- Create: `infrastructure/terraform/work-queue/aws/GOVERNANCE.md`
- Create: `infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml`
- Create: `.github/workflows/work-queue-aws.yml`

**Interfaces:**
- Consumes: the module and its outputs (Task 10); `check:lambda-bundle` (Task 7); plan 06's CLI commands `mj queue export-topology --transport <name>`, `mj queue import-bindings <file>`, `mj queue validate-bindings --transport <name>`, `mj queue dead-letters`, `mj queue stats`; `.github/actions/mj-setup` (repository composite action: pnpm, Node, frozen install).
- Produces: the change process for SNS, SQS and Lambda resources; a repository workflow `Work Queue AWS` with jobs `terraform-module` and `lambda-bundle`; an example deployment pipeline for the repository that owns an environment's infrastructure.

This task has no unit tests; its checks are the workflow's own jobs plus `actionlint`.

- [ ] **Step 1: Write `GOVERNANCE.md`**

`infrastructure/terraform/work-queue/aws/GOVERNANCE.md`:

````markdown
# Work Queue on AWS — Deployment Governance

MemberJunction metadata is the source of truth for work-queue topology. AWS resources are created **only** by this
Terraform module, from a manifest exported from that metadata, through a reviewed pipeline. MJ binds to what exists
and validates it; it never creates, changes or deletes cloud resources.

## Roles

| Role | Owns |
| --- | --- |
| Application developer | Topics, subscriptions and handlers in MJ metadata; Lambda consumer code |
| Platform engineer | The infrastructure repository, Terraform state, IAM attachments, environment promotion |
| Approver (per environment) | Approving the Terraform plan before apply; `prod` requires a second approver |

## Normal change lifecycle

```
 1. Developer changes topology       metadata/work-queue/*.json (system topics) or MJ: Work Queue entities (dev DB)
 2. Export the manifest              mj queue export-topology --transport AWS-dev > manifest.json
 3. Open an infrastructure PR        manifest.json diff + lambda_consumers changes (artifact keys) in the env folder
 4. CI                               terraform fmt / validate / tflint / test, then terraform plan (posted to the PR)
 5. Review                           approver reads the plan; destructive actions (see below) block without a runbook
 6. Apply to dev                     pipeline applies on merge
 7. Bind MJ                          terraform output -json binding_import > bindings.json
                                     mj queue import-bindings bindings.json
 8. Verify                           mj queue validate-bindings --transport AWS-dev   → no Errors
                                     MJAPI startup logs no binding errors for the transport
 9. Promote                          repeat 2–8 for staging, then prod, each with its own manifest export from that
                                     environment's MJ database and its own approval
```

Rules:

- **One manifest per environment**, exported from that environment's MJ database. Never apply a dev manifest to prod.
- **Metadata first, infrastructure second, bindings last.** A topic whose binding is not yet imported rejects publishes
  with the retryable `TopicUnbound`; producers retry and nothing is lost.
- **Removing** a topic or subscription is infrastructure first (after draining — below), metadata second.
- **State**: remote backend (S3 + DynamoDB lock table, or Terraform Cloud) with versioning and encryption; one state
  per environment; no local state outside development.
- **Accounts**: one AWS account per environment is recommended; at minimum, separate `environment` values and IAM
  boundaries.

## Change classes

| Change | Class | What Terraform does | Procedure |
| --- | --- | --- | --- |
| Add topic or subscription | Safe | Creates resources | Normal lifecycle |
| Change filter (`Aws.SnsFilterPolicy`) | Safe | Updates the SNS subscription in place | Normal; messages published during the update may be filtered by either policy |
| Change `MaxAttempts`, `LeaseSeconds`, Lambda timeout | Safe | Updates queue attributes in place | Normal; in-flight messages keep their old visibility |
| Add or update a Lambda consumer artifact | Safe | Updates function code, publishes a version | Normal (see Lambda pipeline) |
| Change `PartitionMode` between `None` and `Exclusive` on a FIFO topic | Safe | Nothing | Metadata only |
| Change a subscription to or from `Ordered` | **Behavioral** | Redrive count changes (7 ↔ 1000) | Pause the subscription, drain, change metadata and apply, import bindings, resume |
| Flip a topic between standard and FIFO | **Destructive** | Replaces the topic and every subscription queue (names change) | Migration procedure below |
| Rename a topic or subscription | **Destructive** | Replaces resources | Create the new one, move producers/consumers, drain, then remove the old one |
| Delete a topic or subscription | **Destructive** | Deletes queues **and their messages** | Drain procedure below |
| Change `name_prefix` or `environment` | **Destructive** | Replaces everything | Treat as a new deployment |

CI marks a plan as destructive when it contains any `delete` or `replace` of `aws_sns_topic`, `aws_sqs_queue`
or `aws_lambda_function`; such PRs need the approver to link the completed procedure.

### Drain procedure (delete, rename)

1. Set the subscription `Status = 'Paused'` in MJ (fan-out continues, nothing is consumed) — or stop its producers
   when the whole topic is going away.
2. Wait until `mj queue stats --subscription <name>` shows `Pending = 0` and `InFlight = 0`. For a topic, check every
   subscription.
3. Handle dead letters: `mj queue dead-letters --subscription <name>`; replay or discard each, or export the SQS
   dead-letter queue if they must be kept.
4. Merge the infrastructure PR that removes the resources; then remove the metadata.

### Standard ↔ FIFO migration

1. Create a **new** topic in metadata (for example `email.events.v2`) with the new `IsFifo`, and its subscriptions.
2. Apply infrastructure and import bindings for the new topic.
3. Deploy consumers for the new subscriptions (they are idle).
4. Switch producers to the new topic name.
5. Drain the old topic's subscriptions (procedure above), then remove the old topic.

## Lambda consumer pipeline

```
consumer source ─► pnpm build ─► esbuild bundle (platform node, format esm, @aws-sdk/* external, sourcemap)
                ─► zip ─► sha256 of zip = content hash
                ─► upload s3://<artifact-bucket>/work-queue/<subscription-slug>/<content-hash>.zip (never overwritten)
                ─► PR: set lambda_consumers["<subscription>"].s3_key to the new key
                ─► plan/apply (publish_version = true creates an immutable version)
```

- **Immutable artifacts**: the key is the content hash; a rebuild of the same code produces no change.
- **Rollback**: revert the `s3_key` in the infrastructure repository and apply; the previous zip still exists.
- **Canary (optional)**: deploy to `staging` first and watch the `MJ/WorkQueue` EMF metrics (`Failed`, `Retried`,
  `DeadLettered`) and the module's alarms for one full traffic cycle before promoting.
- **Idempotency is required** of every consumer; redeliveries happen during deploys.

## Operating

| Signal | Alarm / source | Action |
| --- | --- | --- |
| Dead letters present | `<dlq>-has-messages` | `mj queue dead-letters --subscription <name>`; fix, then `mj queue replay` or `mj queue discard`. Bulk: `aws sqs start-message-move-task` from the DLQ to the queue after fixing the cause |
| Backlog age | `<queue>-backlog-age` | Check consumer errors/throttles; for Lambda raise `maximum_concurrency`; for MJ workers raise `workQueue` concurrency |
| Lambda errors / throttles | `<function>-errors`, `<function>-throttles` | Inspect logs; throttles mean concurrency limits |
| Staged subscription stalled | `<queue>-backlog-age` on a staged queue | Check database health and MJ worker logs (`Staging failed; backing off`); `mj queue partitions --subscription <name> --condition Blocked` |
| Binding drift | `mj queue validate-bindings` Errors | Re-export the manifest and apply, or import bindings |

## Required CI checks for infrastructure PRs

1. `terraform fmt -check -recursive`
2. `terraform validate`
3. `tflint`
4. `terraform test` (module repository)
5. `terraform plan` for the target environment, posted to the PR
6. Destructive-change detection (above)
````

- [ ] **Step 2: Write the example deployment pipeline**

`infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml` (for the repository that
owns an environment's infrastructure; copy and adjust names):

```yaml
name: Work Queue Infrastructure

on:
  pull_request:
    paths: ['work-queue/**']
  push:
    branches: [main]
    paths: ['work-queue/**']

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  plan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, staging, prod]
    environment: ${{ matrix.environment }}-plan
    defaults:
      run:
        working-directory: work-queue/${{ matrix.environment }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.TERRAFORM_PLAN_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.9.8
      - run: terraform fmt -check -recursive
      - run: terraform init -input=false
      - run: terraform validate
      - run: terraform plan -input=false -out=tfplan
      - name: Detect destructive changes
        run: |
          terraform show -json tfplan > plan.json
          DESTRUCTIVE=$(jq '[.resource_changes[] | select((.type == "aws_sns_topic" or .type == "aws_sqs_queue" or .type == "aws_lambda_function") and (.change.actions | index("delete")))] | length' plan.json)
          echo "Destructive changes: $DESTRUCTIVE"
          if [ "$DESTRUCTIVE" -gt 0 ]; then
            echo "::warning::This plan deletes or replaces topics, queues or functions. Link the completed drain/migration runbook in the PR before approval."
          fi
      - name: Post plan
        uses: actions/github-script@v7
        env:
          ENVIRONMENT: ${{ matrix.environment }}
        with:
          script: |
            const { execSync } = require('child_process');
            const plan = execSync('terraform show -no-color tfplan', { cwd: `work-queue/${process.env.ENVIRONMENT}` }).toString();
            const body = `### Work queue plan: ${process.env.ENVIRONMENT}\n\n\`\`\`\n${plan.slice(-60000)}\n\`\`\``;
            await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body });

  apply:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    strategy:
      max-parallel: 1
      matrix:
        environment: [dev, staging, prod]
    environment: ${{ matrix.environment }}   # protection rules require approval; prod requires two reviewers
    defaults:
      run:
        working-directory: work-queue/${{ matrix.environment }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.TERRAFORM_APPLY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.9.8
      - run: terraform init -input=false
      - run: terraform apply -input=false -auto-approve
      - run: terraform output -json binding_import > bindings.json
      - uses: actions/upload-artifact@v4
        with:
          name: bindings-${{ matrix.environment }}
          path: work-queue/${{ matrix.environment }}/bindings.json
```

The bindings artifact is imported into the matching MJ environment with `mj queue import-bindings bindings.json`
(by the platform engineer, or by a job with MJ API access), followed by `mj queue validate-bindings`.

- [ ] **Step 3: Write the repository workflow**

`.github/workflows/work-queue-aws.yml`:

```yaml
name: Work Queue AWS

# Checks the AWS Terraform module and the size/dependency budget of the thin Lambda entry point
# (@memberjunction/work-queue-aws/lambda). The unit tests of the package itself run in test.yml like every package.

on:
  pull_request:
    branches: [next]
    paths:
      - 'infrastructure/terraform/work-queue/aws/**'
      - 'packages/WorkQueue/core/**'
      - 'packages/WorkQueue/aws/**'
      - '.github/workflows/work-queue-aws.yml'
  workflow_dispatch:

concurrency:
  group: work-queue-aws-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  terraform-module:
    name: Terraform module checks
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: infrastructure/terraform/work-queue/aws
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.9.8
          terraform_wrapper: false
      - uses: terraform-linters/setup-tflint@v4
      - run: terraform fmt -check -recursive
      - run: terraform init -backend=false -input=false
      - run: terraform validate
      - run: tflint --init && tflint
        env:
          GITHUB_TOKEN: ${{ github.token }}
      - run: terraform test
      - name: Validate example
        working-directory: infrastructure/terraform/work-queue/aws/examples/basic
        run: terraform init -backend=false -input=false && terraform validate

  lambda-bundle:
    name: Lambda bundle budget
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: ./.github/actions/mj-setup
      - run: cd packages/WorkQueue/core && pnpm run build
      - run: cd packages/WorkQueue/aws && pnpm run build
      - run: cd packages/WorkQueue/aws && pnpm run check:lambda-bundle
```

- [ ] **Step 4: Check the workflow files**

Run: `actionlint .github/workflows/work-queue-aws.yml infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml` (install from https://github.com/rhysd/actionlint if missing)
Expected: exit code 0, no output.

Run: `cd packages/WorkQueue/core && pnpm run build && cd ../aws && pnpm run build && pnpm run check:lambda-bundle`
Expected: `work-queue-aws/lambda bundle OK: …` (the same command the `lambda-bundle` job runs).

- [ ] **Step 5: Commit**

```bash
git add infrastructure/terraform/work-queue/aws/GOVERNANCE.md infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml .github/workflows/work-queue-aws.yml
git commit -m "docs(work-queue): AWS deployment governance runbook, example pipeline and module CI"
```

---

### Task 12: LocalStack conformance (opt-in) and the package README

**Files:**
- Create: `packages/WorkQueue/aws/localstack/docker-compose.yml`, `packages/WorkQueue/aws/vitest.localstack.config.ts`
- Create: `packages/WorkQueue/aws/src/__localstack__/LocalStackHarness.ts`, `src/__localstack__/conformance.localstack.test.ts`
- Create: `packages/WorkQueue/aws/README.md`
- Modify: `packages/WorkQueue/aws/package.json` (`test:localstack` script; `@memberjunction/work-queue-core` stays the only MJ dependency), `.github/workflows/work-queue-aws.yml` (manual `localstack-conformance` job)

**Interfaces:**
- Consumes: `RunTransportConformanceSuite`, `ConformanceHarness`, `ConformanceTraits`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `SubscriptionBindingOverrides` (`@memberjunction/work-queue-core/testing`, plan 04 Task 8); `AwsTransportDriver`, `AWS_TRANSPORT_CAPABILITIES`, `AwsResourceName`, `ExpectedMaxReceiveCount`, `SnsFilterPolicyFor` (Tasks 1–6); `SNSClient`, `CreateTopicCommand`, `DeleteTopicCommand`, `SubscribeCommand` (`@aws-sdk/client-sns`); `SQSClient`, `CreateQueueCommand`, `DeleteQueueCommand`, `GetQueueAttributesCommand` (`@aws-sdk/client-sqs`).
- Produces: `class LocalStackHarness implements ConformanceHarness`; npm script `test:localstack`; README.

The conformance kit skips cases whose capabilities the transport lacks (`Ordered`, pending discard, partitions,
progress, MessageID duplicate detection). What remains — fan-out, filters, lease extension and loss, retry backoff,
`Exclusive` single flight, dead-letter, replay and discard of dead letters — runs against real SNS/SQS semantics in
LocalStack. Staged `Ordered` behavior is covered by the Database conformance run (plan 05) plus Task 9's stager tests.

- [ ] **Step 1: Write the LocalStack environment**

`packages/WorkQueue/aws/localstack/docker-compose.yml`:

```yaml
services:
  localstack:
    image: localstack/localstack:4
    ports:
      - '4566:4566'
    environment:
      SERVICES: sns,sqs
      AWS_DEFAULT_REGION: us-east-1
    healthcheck:
      test: ['CMD', 'curl', '-sf', 'http://localhost:4566/_localstack/health']
      interval: 5s
      timeout: 3s
      retries: 20
```

`packages/WorkQueue/aws/vitest.localstack.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(sharedConfig, defineProject({
    test: {
        environment: 'node',
        include: ['src/__localstack__/**/*.localstack.test.ts'],
        exclude: [],
        testTimeout: 120_000,
        hookTimeout: 120_000,
        fileParallelism: false,
    },
}));
```

In `packages/WorkQueue/aws/package.json` add to `scripts`:

```json
    "test:localstack": "vitest run --config vitest.localstack.config.ts"
```

- [ ] **Step 2: Write the harness**

`packages/WorkQueue/aws/src/__localstack__/LocalStackHarness.ts`:

```typescript
import { CreateTopicCommand, DeleteTopicCommand, SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';
import { CreateQueueCommand, DeleteQueueCommand, GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import { BuildSubscriptionBinding, BuildTopicBinding, type ConformanceHarness, type ConformanceTraits, type SubscriptionBindingOverrides } from '@memberjunction/work-queue-core/testing';
import { ExpectedMaxReceiveCount } from '../driver/bindingValidation';
import { AWS_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { AwsTransportDriver } from '../driver/AwsTransportDriver';
import { SnsFilterPolicyFor } from '../filterPolicy';
import { AwsResourceName } from '../names';

const ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566';
const REGION = 'us-east-1';
const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };

interface Created {
    Topics: string[];
    Queues: string[];
}

export class LocalStackHarness implements ConformanceHarness {
    public readonly Capabilities = AWS_TRANSPORT_CAPABILITIES;
    public readonly Traits: ConformanceTraits = { ReleaseConsumesAttempt: true, ExpiredLeaseDeadLetters: false, ReceiveWaitSeconds: 2 };
    private readonly sns = new SNSClient({ region: REGION, endpoint: ENDPOINT, credentials: CREDENTIALS });
    private readonly sqs = new SQSClient({ region: REGION, endpoint: ENDPOINT, credentials: CREDENTIALS });
    private readonly created = new WeakMap<ITransportDriver, Created>();

    public async CreateDriver(): Promise<ITransportDriver> {
        const driver = AwsTransportDriver.Create({ Region: REGION, Endpoint: ENDPOINT }, CREDENTIALS);
        this.created.set(driver, { Topics: [], Queues: [] });
        return driver;
    }

    public async CreateTopic(driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> {
        const binding = BuildTopicBinding(name, overrides);
        const output = await this.sns.send(new CreateTopicCommand({
            Name: AwsResourceName('wqc', 'ls', name, 'Topic', binding.IsFifo),
            Attributes: binding.IsFifo ? { FifoTopic: 'true', ContentBasedDeduplication: 'false' } : {},
        }));
        const arn = this.required(output.TopicArn, 'TopicArn');
        this.track(driver).Topics.push(arn);
        return { ...binding, Config: { SnsTopicArn: arn } };
    }

    public async CreateSubscription(driver: ITransportDriver, topic: TopicBinding, name: string, overrides: SubscriptionBindingOverrides = {}): Promise<SubscriptionBinding> {
        const binding = BuildSubscriptionBinding(topic, name, overrides);
        const fifo = topic.IsFifo ? { FifoQueue: 'true' } : {};
        const dlqUrl = await this.createQueue(driver, AwsResourceName('wqc', 'ls', name, 'DeadLetterQueue', topic.IsFifo), fifo);
        const dlqArn = await this.queueArn(dlqUrl);
        const queueUrl = await this.createQueue(driver, AwsResourceName('wqc', 'ls', name, 'Queue', topic.IsFifo), {
            ...fifo,
            VisibilityTimeout: String(binding.Policy.LeaseSeconds),
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: ExpectedMaxReceiveCount(binding.Policy) }),
        });
        const queueArn = await this.queueArn(queueUrl);
        const topicArn = String(topic.Config['SnsTopicArn']);
        const policy = SnsFilterPolicyFor(binding.Filter);
        const subscription = await this.sns.send(new SubscribeCommand({
            TopicArn: topicArn, Protocol: 'sqs', Endpoint: queueArn, ReturnSubscriptionArn: true,
            Attributes: { RawMessageDelivery: 'true', ...(policy ? { FilterPolicy: policy, FilterPolicyScope: 'MessageAttributes' } : {}) },
        }));
        return {
            ...binding,
            Config: {
                Region: REGION, QueueUrl: queueUrl, QueueArn: queueArn, DeadLetterQueueUrl: dlqUrl, DeadLetterQueueArn: dlqArn,
                IsFifo: topic.IsFifo, SnsSubscriptionArn: this.required(subscription.SubscriptionArn, 'SubscriptionArn'),
            },
        };
    }

    public async AdvanceTime(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    public async Dispose(driver: ITransportDriver): Promise<void> {
        const created = this.created.get(driver);
        for (const url of created?.Queues ?? []) {
            await this.sqs.send(new DeleteQueueCommand({ QueueUrl: url }));
        }
        for (const arn of created?.Topics ?? []) {
            await this.sns.send(new DeleteTopicCommand({ TopicArn: arn }));
        }
    }

    private async createQueue(driver: ITransportDriver, name: string, attributes: Record<string, string>): Promise<string> {
        const output = await this.sqs.send(new CreateQueueCommand({ QueueName: name, Attributes: attributes }));
        const url = this.required(output.QueueUrl, 'QueueUrl');
        this.track(driver).Queues.push(url);
        return url;
    }

    private async queueArn(url: string): Promise<string> {
        const output = await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['QueueArn'] }));
        return this.required(output.Attributes?.QueueArn, 'QueueArn');
    }

    private track(driver: ITransportDriver): Created {
        const created = this.created.get(driver);
        if (!created) {
            throw new Error('Driver was not created by this harness');
        }
        return created;
    }

    private required(value: string | undefined, what: string): string {
        if (!value) {
            throw new Error(`LocalStack returned no ${what}`);
        }
        return value;
    }
}
```

LocalStack queue URLs use the `000000000000` account, which `ReadAwsSubscriptionConfig`'s 12-digit pattern accepts.
If the LocalStack version you run returns URLs in another shape (for example `sqs.us-east-1.localhost.localstack.cloud`),
the pattern still matches because it only requires `/<12 digits>/<name>` at the end — verify on first run.

`packages/WorkQueue/aws/src/__localstack__/conformance.localstack.test.ts`:

```typescript
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { LocalStackHarness } from './LocalStackHarness';

RunTransportConformanceSuite('AwsTransportDriver on LocalStack', new LocalStackHarness());
```

- [ ] **Step 3: Run the suite against LocalStack**

Run: `cd packages/WorkQueue/aws && docker compose -f localstack/docker-compose.yml up -d --wait`
Expected: the `localstack` service reports healthy.

Run: `cd packages/WorkQueue/aws && pnpm run test:localstack`
Expected: PASS for every case the AWS capabilities enable; capability-gated cases are reported as skipped. No failures.

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — 109 tests; the LocalStack suite is not included.

Run: `cd packages/WorkQueue/aws && docker compose -f localstack/docker-compose.yml down`
Expected: the container stops.

If a case fails because LocalStack's SNS→SQS delivery is slower than `ReceiveWaitSeconds`, raise the trait to 5
rather than weakening the case. If a case fails because LocalStack diverges from documented SQS behavior, confirm
against AWS in a sandbox account before changing driver code, and record the divergence in the README.

- [ ] **Step 4: Add the manual CI job**

Append this job to `.github/workflows/work-queue-aws.yml` under `jobs:`:

```yaml
  localstack-conformance:
    name: LocalStack conformance (manual)
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    services:
      localstack:
        image: localstack/localstack:4
        ports:
          - 4566:4566
        env:
          SERVICES: sns,sqs
          AWS_DEFAULT_REGION: us-east-1
        options: >-
          --health-cmd "curl -sf http://localhost:4566/_localstack/health"
          --health-interval 5s --health-timeout 3s --health-retries 20
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: ./.github/actions/mj-setup
      - run: cd packages/WorkQueue/core && pnpm run build
      - run: cd packages/WorkQueue/aws && pnpm run build
      - run: cd packages/WorkQueue/aws && pnpm run test:localstack
        env:
          LOCALSTACK_ENDPOINT: http://localhost:4566
```

Run: `actionlint .github/workflows/work-queue-aws.yml`
Expected: exit code 0, no output.

- [ ] **Step 5: Write the package README**

`packages/WorkQueue/aws/README.md`:

````markdown
# @memberjunction/work-queue-aws

AWS transport for the MemberJunction work queue: SNS topics, one SQS queue (plus dead-letter queue) per subscription,
and a Lambda adapter for thin consumers. **No MemberJunction runtime dependencies** — only
`@memberjunction/work-queue-core` and the AWS SDK SNS/SQS clients — so Lambda bundles stay small.

MJ servers load this package through `@memberjunction/work-queue-engine` (`AWSTransportDriverFactory`). Cloud
resources are created by `infrastructure/terraform/work-queue/aws`, never at runtime.

## Entry points

| Import | Use |
| --- | --- |
| `@memberjunction/work-queue-aws` | `AwsTransportDriver`, consumer, operator, filter-policy translation, binding validation |
| `@memberjunction/work-queue-aws/lambda` | `CreateSqsLambdaHandler` for SQS-triggered Lambda consumers |
| `@memberjunction/work-queue-aws/testing` | In-memory SNS/SQS fakes and fixtures for tests |

## Write a Lambda consumer

```typescript
import { Outcome, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateSqsLambdaHandler } from '@memberjunction/work-queue-aws/lambda';

class ArchiveEmailEvent implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        await writeToArchive(message.MessageID, message.Payload, context.Signal);   // idempotent on MessageID
        return Outcome.Complete();
    }
}

export const handler = CreateSqsLambdaHandler(() => new ArchiveEmailEvent());
```

- Terraform sets `MJ_WQ_SUBSCRIPTION` (the subscription's policy, filter and queue URLs) and enables
  `ReportBatchItemFailures` on the event source mapping.
- Bundle with esbuild (`platform: node`, `format: esm`, `external: ['@aws-sdk/*']`); the Lambda Node.js runtime
  provides the SDK.
- Return `Outcome.Retry(reason, delaySeconds)` or throw `TransientWorkError` to retry; return `Outcome.DeadLetter(reason)`
  or throw `FatalWorkError` to dead-letter now. Any other thrown error retries with backoff.
- Handlers must be idempotent: delivery is at least once.
- Keep work well under the function timeout. The adapter stops starting records 10 s before the deadline and releases
  them. Long-running work belongs on an MJ worker.

**FIFO queues:** records of one message group run in order; after a record retries or fails, the rest of its group
in that batch is released unprocessed so nothing overtakes it. Different groups run concurrently.

**Metrics:** each invocation writes one CloudWatch Embedded Metric Format line in namespace `MJ/WorkQueue`
(`Processed`, `Completed`, `Retried`, `DeadLettered`, `Failed`, `NotStarted`, `DurationMs`; dimension `Subscription`).

## Calling MemberJunction from a Lambda consumer

Thin consumers do not load MJ. When a handler needs MJ data, call the MJ API with an API key held in AWS Secrets
Manager (scope the key to the operations the handler needs). Handlers that need MJ entities throughout should run
as `MJWorker` subscriptions instead.

## Dead letters

| Source | Reason attribute (`mj_dead_letter_reason`) |
| --- | --- |
| Handler returned `DeadLetter` / threw `FatalWorkError` | the handler's reason |
| Retries exhausted | `MaxAttemptsExceeded` |
| Received more than `MaxAttempts` times without being settled (crash loop) | `LeaseExpired` |
| Body is not an envelope | `InvalidEnvelope` |
| Moved by the SQS redrive policy (`MaxAttempts + 2` receives) | no attribute — reported as `RedrivePolicy` |

Operate them from MJ:

```bash
mj queue dead-letters --subscription email.unsubscribe
mj queue replay  --subscription email.unsubscribe --delivery <MessageID>
mj queue discard --subscription email.unsubscribe --delivery <MessageID> --reason "invalid address"
```

Listing, replay and discard are **best effort** on SQS: they look at up to 100 dead letters at a time. For large
dead-letter queues, fix the cause and move everything back with SQS's own redrive
(`aws sqs start-message-move-task --source-arn <dlq-arn> --destination-arn <queue-arn>`); moved messages keep their
body and are processed again.

## IAM

The Terraform module outputs `mjapi_policy_json` (publish, validation, dead-letter operations) and
`mj_worker_policy_json` (consume MJ worker queues). Lambda consumer roles are created by the module with access to
their own queue, dead-letter queue and log group only.

## Limits (verify against current AWS quotas)

| Limit | Value |
| --- | --- |
| Envelope incl. attributes | 262,144 bytes |
| User attributes per message | 10 |
| Retry delay / lease extension | ≤ 12 hours from receive |
| Lambda batch size (FIFO) | ≤ 10 |
| FIFO deduplication window (MessageID) | 5 minutes |

## Testing

- `pnpm test` — unit tests against in-memory fakes; never calls AWS.
- `pnpm run test:localstack` — the shared transport conformance suite against LocalStack
  (`docker compose -f localstack/docker-compose.yml up -d --wait` first).
- `pnpm run check:lambda-bundle` — fails if the `./lambda` bundle pulls in MJ runtime packages or exceeds 150 KB.
````

- [ ] **Step 6: Build and commit**

Run: `cd packages/WorkQueue/aws && pnpm run build && pnpm test`
Expected: builds; PASS — 109 tests.

```bash
git add packages/WorkQueue/aws .github/workflows/work-queue-aws.yml
git commit -m "test(work-queue-aws): LocalStack conformance harness, manual CI job and package README"
```

---

## Contract deltas

Places where this plan needs something 03 does not state, or states differently. 03 was not edited; reconcile
there (or in the named sibling plan) before execution.

| # | Delta | Owner | Why |
| --- | --- | --- | --- |
| D1 | AWS `SubscriptionBinding.Config` adds `SnsSubscriptionArn` to 03 §6.3's field list (`Region, QueueUrl, QueueArn, DeadLetterQueueUrl, DeadLetterQueueArn, IsFifo, SnsSubscriptionArn`). Terraform's `binding_import` emits it. | 03 | Binding validation compares raw delivery, endpoint and filter policy only through the SNS subscription |
| D2 | Staging uses plan 05 Task 12's `DatabaseTransportDriver.StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>` (`{ TopicID, SubscriptionID, PartitionMode, OrderingMode, Messages }` → `Staged` / `AlreadyStaged` / `Rejected { Code, Message }`; one transaction; a throw rolls back) and `WorkQueueEngine.GetDatabaseDriver()`. Not in 03 §11. `Rejected` messages go to the SQS dead-letter queue with reason = `Code`. | 03 §11 (05 is normative) | 03 §5.1 staging (Task 9) |
| D3 | `HostLoopContext` (plan 06) carries no driver accessor. The AWS loop factory resolves the AWS driver with `WorkQueueEngine.Instance.GetDriver(context.Transport.ID)` and the staging target with `GetDatabaseDriver()`; the staging identity comes from `context.Subscription` (`ID`, `PartitionMode`) and `context.Topic` (`ID`, `OrderingMode`). | 06 / 03 §11 | Reuses cached, credentialed drivers |
| D4 | `WorkQueueEngine.ExportManifest` (plan 05 Task 13) is changed by this plan (Task 8) to `FinalizeTopologyManifest(BuildTopologyManifest(...))`, which sets `ManifestSubscription.Aws.SnsFilterPolicy` for `DriverClass = 'AWS'` manifests. The Terraform module refuses a filtered subscription without a rendered policy. | 05 (code touched by 07) | 03 §10 declares the field but plan 05's engine cannot depend on `work-queue-aws` |
| D5 | `SubscriptionStats.OldestPendingAgeSeconds` is **always `null`** on AWS in Phase 1 (no CloudWatch client, to keep the package dependency rule); backlog age is covered by the Terraform `backlog-age` alarm. 03 §5.2 says "requires CloudWatch read access, else null". | 03 | R9 dependency rule |
| D6 | New publish error code `TransportRejected` (not retryable) for SNS per-entry failures with `SenderFault = true`. | 03 §1.1 | Distinguishes bad requests from throttling (`TransportUnavailable`) |
| D7 | Redrive `maxReceiveCount` is `MaxAttempts + 2` **except staged `Ordered` subscriptions, which use 1000**. 02 §3.4 states `MaxAttempts + 2` for all SQS queues. | 02 / 03 | A database outage must not push staged messages into the DLQ and break order |
| D8 | New dead-letter reason `InvalidEnvelope`; SQS message attributes `mj_dead_letter_reason`, `mj_last_error`, `mj_attempts`, `mj_dead_lettered_at`, `mj_source_queue`, `mj_replay`, `mj_replay_note`, `mj_replayed_by` (reserved by 03 §1.1's `mj_` prefix rule). | 03 §5.2 | Dead-letter records and replay marking without DynamoDB |
| D9 | AWS operator: `Discard` of a message not found among the scanned dead letters (including any pending message) returns `{ Supported: false }`; `ListDeadLetters.NextCursor` is always `null`; `BlockedKeys` is `null`; dead-letter `Attempts` is `0` for redrive-policy moves. | 03 §5.2 | SQS has no peek, lookup by ID or cancel |
| D10 | `SqsTransportConsumer.ExtendLease` returns `Held` on a retryable SQS error (the next heartbeat retries) and `Lost` when the 12-hour visibility window is exhausted. | 03 §5 | Throttling must not abort healthy handlers |
| D11 | `@memberjunction/work-queue-engine` also depends on `@aws-sdk/credential-providers` (assume-role credentials). 03 §0 lists core, global, core-entities, sql-dialect, credentials and `work-queue-aws`. | 03 §0 | `RoleArn` credentials (Task 8) |
| D12 | `@memberjunction/work-queue-aws` exposes `./lambda` and `./testing` subpath exports; the dependency guard excludes `src/__localstack__/`. | 03 §0 | Thin Lambda entry point; engine tests reuse the SNS/SQS fakes |
| D13 | AWS resource naming (`AwsResourceName`: `<prefix>-<environment>-<slug>[-dlq][.fifo]`, hashed shortening) is shared by MJ validation messages and the Terraform module. Not in 03. | 03 §10 | Operators see identical names in MJ and AWS |

## Self-review notes

- **Spec coverage.** 02 §4.4 (SNS → SQS → Lambda or MJ worker, heartbeat by visibility, retry by visibility, runtime
  dead-lettering, redrive backstop): Tasks 3–7. 03 §5 transport, consumer and operator contracts: Tasks 4–6. 03 §5.1
  staging: Task 9. 03 §2.1 cloud deduplication: Task 8 (coordinator from plan 05, proven over the real driver). 03 §10
  manifest and `BindingImport`: Task 10. R6/R8/R9: Global Constraints, Tasks 1, 7, 9. Deployment governance (D6 in
  the README decision log): Tasks 10–11.
- **Not covered here, by design:** the `mj queue` CLI and remote operations (plan 06), manifest export and binding
  import (plans 05/06), Azure (09a), Firehose (09g).
