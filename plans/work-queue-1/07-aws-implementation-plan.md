# Work Queue — AWS Transport Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@memberjunction/work-queue-aws` (SNS publish, SQS consumer, SQS dead-letter operator, Lambda adapter — with no MemberJunction runtime dependencies), wire it into the engine through the `@memberjunction/work-queue-engine/aws` subpath (driver factory, credentials, manifest filter policies), and ship a manifest-driven Terraform module with an enforced deployment governance pipeline.

**Architecture:** A topic bound to the AWS transport is an SNS topic; each subscription is an SQS queue subscribed with raw delivery and an SNS filter policy, plus a dead-letter queue. `None` and `Exclusive` subscriptions are consumed directly from SQS by a thin Lambda (`CreateSqsLambdaHandler`) or an MJ worker, using the core `ConsumerRuntime`. **`Ordered` is not available on this transport** — validation rejects it ("Ordered requires the Database transport", 03 §5). FIFO queues are consumed **one message per receive** so `Exclusive` holds and followers never burn receive counts (03 §5.1, F5). Dead letters are SQS messages carrying `mj_*` reason attributes, each in its own message group (F6); the redrive policy is a crash backstop. No DynamoDB. Cloud resources are provisioned only by Terraform, from the topology manifest MJ exports.

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, AWS SDK for JavaScript v3 (`@aws-sdk/client-sns`, `@aws-sdk/client-sqs`; `@aws-sdk/credential-providers` in the engine's `./aws` subpath only), esbuild (bundle check), Terraform ≥ 1.7 with the `hashicorp/aws` provider 6.x, tflint, LocalStack (opt-in), GitHub Actions.

**Spec:** [`03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative, Revision 4 — read §0, §4, §5, §5.1, §5.2, §10, §11), [`11-revision-4-review.md`](11-revision-4-review.md), [`02-implementation-overview.md`](02-implementation-overview.md), [`README.md`](README.md). Names in 03 are binding; where this plan disagrees with 03, fix this plan (the few deltas still open are listed in [Contract deltas](#contract-deltas)).

## Global Constraints

- **Package manager:** pnpm. `pnpm install` at the repository root only; never inside a package; never `npm install`.
- **Per-package commands:** `cd packages/WorkQueue/aws && pnpm test` / `pnpm run build`; engine: `cd packages/WorkQueue/engine && pnpm test` / `pnpm run build`. Never build single packages with turbo from the root.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the version in `packages/MJCore/package.json` (`6.1.0` when this plan was written).
- **External versions:** `@aws-sdk/client-sns`, `@aws-sdk/client-sqs`, `@aws-sdk/credential-providers` at `^3.984.0` (matches the AWS SDK clients already in the repo, e.g. `packages/MJStorage/package.json`); `esbuild` `^0.27.3` (already in `pnpm-lock.yaml`).
- **Dependency rule (R9, 03 §0):** `@memberjunction/work-queue-aws` depends **only** on `@memberjunction/work-queue-core`, `@aws-sdk/client-sns` and `@aws-sdk/client-sqs`. No CloudWatch client. The repo has no ESLint configuration, so enforcement is `src/__tests__/dependencyGuard.test.ts` (package.json fields plus every import form: `from`, side-effect `import '…'`, dynamic `import(…)`, `require(…)`, single or double quotes). The `./lambda` entry must not reach `@aws-sdk/client-sns`; `scripts/check-lambda-bundle.mjs` bundles it **with the SDK included** and fails if the SNS client appears.
- **Engine loading (F12, 03 §0):** the engine's **main entry never imports `@memberjunction/work-queue-aws`**. The AWS factory, credential resolution and manifest enrichment live in `packages/WorkQueue/engine/src/aws/` and are exported **only** from the subpath `@memberjunction/work-queue-engine/aws`, which `ServerBootstrap` (never `ServerBootstrapLite`) imports for its registration side effect. A guard test in the engine enforces this.
- **Package shape:** `"type": "module"`, build `tsc && tsc-alias -f`, `tsconfig.json` extends `../../../tsconfig.server.json`, `vitest.config.ts` merges `../../../vitest.shared`, tests in `src/__tests__/*.test.ts`, extensionless relative imports, subpath exports declared with `types` + `default` (pattern: `packages/ServerBootstrapLite/package.json`). No cross-package re-exports (F13).
- **No test calls AWS.** Every SDK call goes through `SnsGateway`/`SqsGateway`; unit tests use the recording fakes in `src/testing/fakes.ts` (exported as `@memberjunction/work-queue-aws/testing` so engine tests can reuse them) or a scripted `client.send`. The LocalStack suite (Task 11) is opt-in and excluded from `pnpm test`.
- **No DynamoDB, no parking, no state-sweeper Lambda, no cloud-side `Ordered`** (README R8, 11 S2).
- **Code rules:** no `any`; `unknown` only at trust boundaries (JSON parsing, SDK errors) and narrowed immediately; PascalCase public members, camelCase private; static imports only; functions around 30–40 lines.
- **AWS limits used by this plan** (verify against current AWS quotas before release): SNS/SQS message ≤ 262,144 bytes including attributes; ≤ 10 message attributes; an SNS `String` attribute value must be non-empty; `PublishBatch` / `SendMessageBatch` ≤ 10 entries and ≤ 262,144 bytes per request; `ReceiveMessage` ≤ 10 messages, `WaitTimeSeconds` ≤ 20; visibility timeout ≤ 43,200 s and a message cannot stay invisible beyond 12 h from its receive; FIFO `MessageGroupId`/`MessageDeduplicationId` ≤ 128 printable ASCII characters; FIFO dedup window 5 minutes; SQS queue names ≤ 80 characters including `.fifo`; Lambda timeout ≤ 900 s; event-source `maximum_concurrency` 2–1,000.
- **Terraform:** `required_version = ">= 1.7.0"` (needed for `mock_provider` in `terraform test`), provider `hashicorp/aws` `~> 6.0`. `terraform fmt -check -recursive`, `terraform validate`, `tflint` and `terraform test` must pass.
- **Commits:** a "Commit" step runs **only when the user has approved commits for this execution session** (repository rule: no commits without explicit approval). Otherwise stage the files and report.
- **Branch:** `feat/work-queue`, tracking `origin/feat/work-queue` (verify with `git branch -vv` before any push).

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | `work-queue-aws` scaffold, dependency guard, binding config, resource names, envelope | Package builds; guard and pure helpers tested |
| 2 | SNS filter-policy translation | `ToSnsFilterPolicy` tested |
| 3 | SNS/SQS gateways, error mapping, client factories (SQS-only and SNS), fakes with FIFO group locking | Gateways tested against scripted SDK clients |
| 4 | Capabilities, SNS publish mapping, binding validation, test fixtures | Publish and validation tested against fakes |
| 5 | `SqsTransportConsumer` and dead-letter writer | One-message FIFO receive, single flight per key, lease, settle and poison handling tested |
| 6 | `AwsTransportOperator` and `AwsTransportDriver` | Stats, dead-letter scan, replay, discard and driver assembly tested |
| 7 | Lambda adapter (`./lambda`), EMF metrics, example consumer, bundle check | Batch semantics tested; bundle check proves no SNS client |
| 8 | Engine `./aws` subpath: `AWSTransportDriverFactory`, credential resolution, manifest filter policies, cloud dedup verification | Factory tested; main-entry guard passes; publish coordinator dedup proven over the real AWS driver |
| 9 | Terraform module `infrastructure/terraform/work-queue/aws` | `fmt`, `validate`, `tflint`, `terraform test` pass |
| 10 | Deployment governance runbook, gated pipeline, drift job and CI workflow | `GOVERNANCE.md`; pipeline gates destructive changes and applies the reviewed plan |
| 11 | LocalStack conformance (opt-in) and package README | Conformance suite passes against LocalStack |

Tasks 1–7 depend only on plan 04. Task 8 needs plans 05 and 06 merged. Tasks 9–10 need Task 1 (naming parity) and plan 06's `mj queue export-topology` / `import-bindings` for the runbook's end-to-end check. Task 11 needs Tasks 1–7.

## Pre-flight

- [ ] You are on `feat/work-queue` and `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] Plan 04 is merged: `cd packages/WorkQueue/core && pnpm test` passes, and `pnpm-workspace.yaml` contains `'packages/WorkQueue/*'`.
- [ ] For Task 8: plans 05 and 06 are merged: `cd packages/WorkQueue/engine && pnpm test` passes.
- [ ] `terraform version` reports ≥ 1.7.0; `tflint --version` works (install from https://github.com/terraform-linters/tflint if missing).
- [ ] No AWS credentials are needed for Tasks 1–10. Task 11 needs Docker.

## File structure

```
packages/WorkQueue/aws/
  package.json · tsconfig.json · vitest.config.ts                                   Task 1 (package.json extended in 3, 7, 11)
  README.md                                                                         Task 11
  scripts/check-lambda-bundle.mjs                                                   Task 7
  examples/thin-consumer/index.ts                                                   Task 7
  localstack/docker-compose.yml · vitest.localstack.config.ts                       Task 11
  src/index.ts                                                                      Task 1, extended by 2–6
  src/config.ts · src/names.ts · src/envelope.ts                                    Task 1
  src/filterPolicy.ts                                                               Task 2
  src/gateway/errors.ts · SnsGateway.ts · SqsGateway.ts                             Task 3
  src/gateway/SdkSnsGateway.ts · SdkSqsGateway.ts                                   Task 3
  src/gateway/sqsClient.ts (SQS only) · snsClient.ts                                Task 3
  src/driver/capabilities.ts · publish.ts · bindingValidation.ts · src/testing/fixtures.ts   Task 4
  src/driver/AwsTransportDriver.ts                                                  Task 6
  src/consumer/deadLetter.ts · SqsTransportConsumer.ts                              Task 5
  src/operator/deadLetterScan.ts · AwsTransportOperator.ts                          Task 6
  src/lambda/index.ts · lambdaTypes.ts · bindingEnv.ts · emf.ts · CreateSqsLambdaHandler.ts   Task 7
  src/testing/index.ts · src/testing/fakes.ts                                       Task 3 (exported as ./testing)
  src/__tests__/*.test.ts                                                           every code task
  src/__localstack__/conformance.localstack.test.ts                                 Task 11

packages/WorkQueue/engine/
  package.json (./aws export + dependencies)                                        Task 8
  src/aws/index.ts · ResolveAwsCredentials.ts · AWSTransportDriverFactory.ts        Task 8
  src/aws/AwsManifestEnricher.ts                                                    Task 8
  src/topology/ManifestEnricherRegistry.ts · src/WorkQueueEngine.ts (ExportManifest)   Task 8
  src/__tests__/ResolveAwsCredentials.test.ts · AWSTransportDriverFactory.test.ts   Task 8
  src/__tests__/AwsPublishCoordinator.test.ts · AwsManifestEnricher.test.ts         Task 8
  src/__tests__/mainEntryGuard.test.ts                                              Task 8

packages/ServerBootstrap/
  package.json · src/index.ts (import '@memberjunction/work-queue-engine/aws')      Task 8

packages/MJCLI/
  src/commands/queue/export-topology.ts · import-bindings.ts                        Task 8 (Step 7b: same import)
  src/commands/queue/validate-bindings.ts · work.ts                                 Task 8 (Step 7b)
  src/__tests__/queue-aws-registration.test.ts                                      Task 8 (Step 7b)

infrastructure/terraform/work-queue/aws/
  versions.tf · variables.tf · locals.tf · topics.tf · subscriptions.tf            Task 9
  lambda.tf · iam.tf · kms.tf · alarms.tf · outputs.tf · .tflint.hcl · README.md    Task 9
  tests/basic.tftest.hcl · tests/fixtures/manifest.json                             Task 9
  examples/basic/main.tf · examples/basic/manifest.json                             Task 9
  GOVERNANCE.md · scripts/check-destructive-plan.mjs                                Task 10
  examples/deploy-pipeline.github-actions.yml · examples/drift.github-actions.yml   Task 10

.github/workflows/work-queue-aws.yml                                                Task 10 (extended in 11)
```

**Why `infrastructure/terraform/`:** the repository has no infrastructure-as-code folder today (`docker/` holds container definitions only, and `packages/*` are pnpm workspace members). A new top-level `infrastructure/terraform/` keeps Terraform out of the pnpm workspace and out of the unit-test workflow's `packages/**` path filter, and leaves room for `infrastructure/terraform/work-queue/azure` (09a).

---

### Task 1: Package scaffold, dependency guard, binding config, resource names and envelope

**Files:**
- Create: `packages/WorkQueue/aws/package.json`, `tsconfig.json`, `vitest.config.ts`
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

Naming is shared with Terraform (Task 9 reproduces `AwsResourceName` in HCL and asserts the same three cases), so a resource name in a validation message always matches what the module created.

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
        const offenders = sourceFiles(join(PACKAGE_ROOT, 'src')).flatMap((file) =>
            ImportedModules(readFileSync(file, 'utf8'))
                .filter((name) => name.startsWith('@memberjunction/') && !name.startsWith('@memberjunction/work-queue-core'))
                .map((name) => `${file}: ${name}`));
        expect(offenders).toEqual([]);
    });

    it('recognises every import form', () => {
        const text = [
            `import { A } from '@memberjunction/core';`,
            `import "@memberjunction/global";`,
            `export * from "@memberjunction/ai";`,
            `const x = require('@memberjunction/queue');`,
            `const y = await import("@memberjunction/server");`,
        ].join('\n');
        expect(ImportedModules(text)).toEqual([
            '@memberjunction/core', '@memberjunction/global', '@memberjunction/ai',
            '@memberjunction/queue', '@memberjunction/server',
        ]);
    });
});

/** Module specifiers from `from '…'`, side-effect `import '…'`, `require('…')` and `import('…')`, either quote style. */
function ImportedModules(text: string): string[] {
    const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;
    return [...text.matchAll(pattern)].map((match) => match[2]);
}
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

    it('rejects non-string attribute values and non-string optional scalars', () => {
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Attributes: { a: 1 } }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, PartitionKey: 42 }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, CorrelationID: false }))).toBeNull();
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
    return typeof raw['MessageID'] === 'string' && raw['MessageID'] !== ''
        && typeof raw['Topic'] === 'string' && raw['Topic'] !== ''
        && typeof raw['PublishedAt'] === 'string'
        && isStringMap(raw['Attributes'])
        && optionalString(raw['PartitionKey']) && optionalString(raw['CorrelationID'])
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
Expected: PASS — dependencyGuard (4), config (8), names (5), envelope (7). Total 24.

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
- Consumes: `SubscriptionFilter` (= `FilterGroup`), `FilterGroup`, `FilterRule`, `WorkQueueConfigurationError` (core, 03 §4.2).
- Produces:
  - `SNS_MAX_FILTER_COMBINATIONS = 150`
  - `ToSnsFilterPolicy(filter: SubscriptionFilter): string` — canonical JSON (keys sorted), throws for an empty filter, an untranslatable structure or too many combinations
  - `SnsFilterPolicyFor(filter: SubscriptionFilter | null): string | null` — `null` for a null or empty filter (no policy = match everything)
  - `NormalizeSnsFilterPolicy(json: string | null | undefined): string | null` — canonical form for comparing a policy read back from SNS

Mapping (03 §4.1 → SNS filter policy with `FilterPolicyScope = MessageAttributes`):

| Filter node | SNS policy entry |
| --- | --- |
| `{ field: 'eventType', operator: 'eq', value: 'click' }` | `"eventType": ["click"]` |
| `{ logic: 'or', filters: [eq 'click', eq 'open'] }` on one field | `"eventType": ["click","open"]` |
| `{ operator: 'neq', value: 'test' }` | `"source": [{ "anything-but": ["test"] }]` |
| `{ operator: 'startswith', value: 'acme-' }` | `"tenant": [{ "prefix": "acme-" }]` |
| `{ operator: 'isnotnull' }` / `{ operator: 'isnull' }` | `[{ "exists": true }]` / `[{ "exists": false }]` |

Values are stringified (`String(value)`) because envelope attributes are strings, and **case is preserved exactly** —
SNS matches case-sensitively, which is why 03 §4.3 makes the whole queue case-sensitive.

**One entry per field.** SNS treats the values under an attribute as **OR**, so two AND-ed rules on one attribute
(`tenant startswith 'acme-'` AND `tenant neq 'acme-test'`) cannot be expressed: merging them into one array would
silently *widen* the filter. Translation therefore rejects a field that is constrained more than once at the top
level. A nested OR group is the only way one field carries several values, and its members must all be `eq` on that
same field.

**Missing attributes.** SNS evaluates a policy key only against messages that carry the attribute, except
`{ "exists": false }` — the same rule 03 §4.2 states for `MatchesFilter`, so no translation is needed (verify against
current SNS filter-policy documentation during review). **Combinations.** SNS limits the number of value combinations
(the product of the array lengths across keys) to 150 (verify against current AWS quotas); the 03 §4.1 limits
(≤ 5 fields, ≤ 50 values) do not bound that product, so translation rejects policies above it.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/aws/src/__tests__/filterPolicy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { NormalizeSnsFilterPolicy, SnsFilterPolicyFor, ToSnsFilterPolicy } from '../filterPolicy';

const Eq = (field: string, value: string): FilterRule => ({ field, operator: 'eq', value });
const And = (...filters: (FilterRule | FilterGroup)[]): SubscriptionFilter => ({ logic: 'and', filters });
const Or = (field: string, ...values: string[]): FilterGroup => ({ logic: 'or', filters: values.map(v => Eq(field, v)) });

describe('ToSnsFilterPolicy', () => {
    it('translates an eq rule and a single-field OR group', () => {
        expect(ToSnsFilterPolicy(And(Eq('eventType', 'click')))).toBe('{"eventType":["click"]}');
        expect(ToSnsFilterPolicy(And(Or('eventType', 'click', 'open')))).toBe('{"eventType":["click","open"]}');
    });

    it('translates neq, startswith, isnotnull and isnull', () => {
        const filter = And(
            { field: 'source', operator: 'neq', value: 'test' },
            { field: 'tenant', operator: 'startswith', value: 'acme-' },
            { field: 'priority', operator: 'isnotnull' },
            { field: 'legacy', operator: 'isnull' },
        );
        expect(JSON.parse(ToSnsFilterPolicy(filter))).toEqual({
            legacy: [{ exists: false }],
            priority: [{ exists: true }],
            source: [{ 'anything-but': ['test'] }],
            tenant: [{ prefix: 'acme-' }],
        });
    });

    it('preserves value case, because SNS matches case-sensitively', () => {
        expect(ToSnsFilterPolicy(And(Eq('tenant', 'ACME')))).toBe('{"tenant":["ACME"]}');
    });

    it('produces the same text regardless of the order fields appear in', () => {
        expect(ToSnsFilterPolicy(And(Eq('b', '2'), Eq('a', '1')))).toBe(ToSnsFilterPolicy(And(Eq('a', '1'), Eq('b', '2'))));
        expect(ToSnsFilterPolicy(And(Eq('b', '2'), Eq('a', '1')))).toBe('{"a":["1"],"b":["2"]}');
    });

    it('rejects an empty filter and a top level that is not AND', () => {
        expect(() => ToSnsFilterPolicy(And())).toThrow(WorkQueueConfigurationError);
        expect(() => ToSnsFilterPolicy({ logic: 'or', filters: [Eq('a', '1')] })).toThrow('top level must use AND');
    });

    it('rejects a field constrained twice, which SNS would widen into OR', () => {
        const filter = And(
            { field: 'tenant', operator: 'startswith', value: 'acme-' },
            { field: 'tenant', operator: 'neq', value: 'acme-test' },
        );
        expect(() => ToSnsFilterPolicy(filter)).toThrow("constrains 'tenant' more than once");
    });

    it('rejects a mixed-field OR group and a rule with no value', () => {
        expect(() => ToSnsFilterPolicy(And({ logic: 'or', filters: [Eq('a', '1'), Eq('b', '2')] }))).toThrow('single field');
        expect(() => ToSnsFilterPolicy(And({ field: 'a', operator: 'eq', value: null }))).toThrow('has no value');
    });

    it('rejects a filter with too many value combinations', () => {
        const wide = And(Or('a', '1', '2', '3', '4', '5', '6'), Or('b', '1', '2', '3', '4', '5', '6'), Or('c', '1', '2', '3', '4', '5'));
        expect(() => ToSnsFilterPolicy(wide)).toThrow('180 value combinations');
    });
});

describe('SnsFilterPolicyFor', () => {
    it('returns null when there is nothing to filter', () => {
        expect(SnsFilterPolicyFor(null)).toBeNull();
        expect(SnsFilterPolicyFor(And())).toBeNull();
        expect(SnsFilterPolicyFor(And(Eq('a', '1')))).toBe('{"a":["1"]}');
    });
});

describe('NormalizeSnsFilterPolicy', () => {
    it('ignores whitespace and key order, including inside condition objects', () => {
        const fromSns = '{ "tenant": [ { "prefix": "acme-" } ],\n "eventType": ["click"] }';
        expect(NormalizeSnsFilterPolicy(fromSns)).toBe(
            ToSnsFilterPolicy(And(Eq('eventType', 'click'), { field: 'tenant', operator: 'startswith', value: 'acme-' })),
        );
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
import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';

/** SNS limit on value combinations across a policy's keys. Verify against current AWS quotas. */
export const SNS_MAX_FILTER_COMBINATIONS = 150;

type PolicyValue = string | { prefix: string } | { exists: boolean } | { 'anything-but': string[] };

interface FieldEntry {
    Field: string;
    Values: PolicyValue[];
}

function isGroup(node: FilterRule | FilterGroup): node is FilterGroup {
    return (node as FilterGroup).logic !== undefined;
}

function requiredValue(rule: FilterRule): string {
    if (rule.value === null || rule.value === undefined) {
        throw new WorkQueueConfigurationError(`Filter rule on '${rule.field}' with operator '${rule.operator}' has no value`);
    }
    return String(rule.value);
}

/** One rule → the values SNS matches for that attribute (03 §4.1). */
function ruleEntry(rule: FilterRule): FieldEntry {
    switch (rule.operator) {
        case 'eq':
            return { Field: rule.field, Values: [requiredValue(rule)] };
        case 'neq':
            return { Field: rule.field, Values: [{ 'anything-but': [requiredValue(rule)] }] };
        case 'startswith':
            return { Field: rule.field, Values: [{ prefix: requiredValue(rule) }] };
        case 'isnotnull':
            return { Field: rule.field, Values: [{ exists: true }] };
        case 'isnull':
            return { Field: rule.field, Values: [{ exists: false }] };
        default:
            throw new WorkQueueConfigurationError(
                `Operator '${String(rule.operator)}' on '${rule.field}' has no SNS filter-policy form`,
            );
    }
}

/** A nested group is only ever an OR of eq on a single field (03 §4.1). */
function groupEntry(group: FilterGroup): FieldEntry {
    if (group.logic !== 'or' || group.filters.length === 0) {
        throw new WorkQueueConfigurationError('A nested filter group must be a non-empty OR of eq rules on a single field');
    }
    const values: string[] = [];
    let field: string | null = null;
    for (const member of group.filters) {
        if (isGroup(member) || member.operator !== 'eq') {
            throw new WorkQueueConfigurationError('A nested filter group must be an OR of eq rules on a single field');
        }
        if (field !== null && member.field !== field) {
            throw new WorkQueueConfigurationError(
                `An OR group must stay on a single field; '${field}' is mixed with '${member.field}'`,
            );
        }
        field = member.field;
        values.push(requiredValue(member));
    }
    return { Field: field as string, Values: values };
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
    if (filter.logic !== 'and') {
        throw new WorkQueueConfigurationError("A subscription filter's top level must use AND (03 §4.1)");
    }
    if (filter.filters.length === 0) {
        throw new WorkQueueConfigurationError('An empty filter has no SNS filter policy; omit the policy instead');
    }
    const policy: Record<string, PolicyValue[]> = {};
    for (const node of filter.filters) {
        const entry = isGroup(node) ? groupEntry(node) : ruleEntry(node);
        if (policy[entry.Field] !== undefined) {
            throw new WorkQueueConfigurationError(
                `Filter constrains '${entry.Field}' more than once; SNS reads an attribute's values as OR, so two AND rules on one attribute cannot be expressed`,
            );
        }
        policy[entry.Field] = entry.Values;
    }
    const combinations = Object.values(policy).reduce((product, values) => product * Math.max(1, values.length), 1);
    if (combinations > SNS_MAX_FILTER_COMBINATIONS) {
        throw new WorkQueueConfigurationError(
            `Filter produces ${combinations} value combinations; SNS allows at most ${SNS_MAX_FILTER_COMBINATIONS}`,
        );
    }
    return canonicalJson(policy);
}

export function SnsFilterPolicyFor(filter: SubscriptionFilter | null): string | null {
    return filter === null || filter.filters.length === 0 ? null : ToSnsFilterPolicy(filter);
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
Expected: PASS — dependencyGuard (4), config (8), names (5), envelope (7), filterPolicy (11). Total 35.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/aws/src
git commit -m "feat(work-queue-aws): translate subscription filters to canonical SNS filter policies"
```

---
### Task 3: SNS/SQS gateways, error mapping, client factories and fakes

**Files:**
- Create: `packages/WorkQueue/aws/src/gateway/errors.ts`, `SnsGateway.ts`, `SqsGateway.ts`, `SdkSnsGateway.ts`, `SdkSqsGateway.ts`, `sqsClient.ts`, `snsClient.ts`
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
  - `gateway/sqsClient.ts` (imports `@aws-sdk/client-sqs` **only**): `type AwsCredentialsOption = SQSClientConfig['credentials']`, `CreateSqsClient(config: AwsTransportConfig, credentials?: AwsCredentialsOption): SQSClient`
  - `gateway/snsClient.ts`: `CreateSnsClient(config: AwsTransportConfig, credentials?: AwsCredentialsOption): SNSClient`
  - Test doubles exported from `@memberjunction/work-queue-aws/testing`: `FakeSqsGateway` (in-memory SQS with FIFO group blocking, visibility, receive counts, 5-minute FIFO dedup, failure injection, controllable clock) and `FakeSnsGateway` (records batches, scripted entry failures and attributes)

**Two client factories, on purpose.** The `./lambda` entry (Task 7) consumes SQS and never publishes, so it must not
pull `@aws-sdk/client-sns` into a bundle. Anything the Lambda path imports may import `sqsClient.ts` but never
`snsClient.ts`, `SdkSnsGateway.ts` or `driver/*`; Task 7's bundle check enforces it.

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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateSqsClient } from '../gateway/sqsClient';
import { CreateSnsClient } from '../gateway/snsClient';

const GATEWAY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'gateway');

describe('client factories', () => {
    it('configure the region with default endpoints', async () => {
        const config = { Region: 'eu-west-2', Endpoint: null };
        expect(await CreateSqsClient(config).config.region()).toBe('eu-west-2');
        expect(await CreateSnsClient(config).config.region()).toBe('eu-west-2');
        expect(CreateSqsClient(config).config.isCustomEndpoint).toBe(false);
    });

    it('apply a custom endpoint and static credentials (LocalStack)', async () => {
        const config = { Region: 'us-east-1', Endpoint: 'http://localhost:4566' };
        const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
        const sqs = CreateSqsClient(config, credentials);
        expect(sqs.config.isCustomEndpoint).toBe(true);
        expect(CreateSnsClient(config, credentials).config.isCustomEndpoint).toBe(true);
        expect((await sqs.config.credentials()).accessKeyId).toBe('test');
    });

    it('keeps the SQS factory free of the SNS client', () => {
        const text = readFileSync(join(GATEWAY_DIR, 'sqsClient.ts'), 'utf8');
        expect(text).not.toContain('client-sns');
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

    it('like real SQS, can return several messages of one group from a single batched receive', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a1', MessageGroupId: 'a', MessageDeduplicationId: 'a1' });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a2', MessageGroupId: 'a', MessageDeduplicationId: 'a2' });
        const batch = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(batch.map((m) => m.Body)).toEqual(['a1', 'a2']);
        expect(sqs.Calls[sqs.Calls.length - 1]).toMatchObject({ Op: 'Receive', MaxMessages: 10, WaitTimeSeconds: 0 });
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
Expected: FAIL — unresolved imports `../gateway/errors`, `../gateway/SdkSqsGateway`, `../gateway/SdkSnsGateway`, `../gateway/sqsClient`, `../gateway/snsClient`, `../testing/fakes`.

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

- [ ] **Step 7: Write `src/gateway/sqsClient.ts` and `src/gateway/snsClient.ts`**

`packages/WorkQueue/aws/src/gateway/sqsClient.ts` (imports the SQS client only — the Lambda path depends on this file):

```typescript
import { SQSClient, type SQSClientConfig } from '@aws-sdk/client-sqs';
import type { AwsTransportConfig } from '../config';

/** Static credentials or a credential provider. Undefined uses the SDK default chain (env, profile, role). */
export type AwsCredentialsOption = SQSClientConfig['credentials'];

export function CreateSqsClient(config: AwsTransportConfig, credentials?: AwsCredentialsOption): SQSClient {
    return new SQSClient({
        region: config.Region,
        ...(config.Endpoint ? { endpoint: config.Endpoint } : {}),
        ...(credentials ? { credentials } : {}),
    });
}
```

`packages/WorkQueue/aws/src/gateway/snsClient.ts`:

```typescript
import { SNSClient } from '@aws-sdk/client-sns';
import type { AwsTransportConfig } from '../config';
import type { AwsCredentialsOption } from './sqsClient';

export function CreateSnsClient(config: AwsTransportConfig, credentials?: AwsCredentialsOption): SNSClient {
    return new SNSClient({
        region: config.Region,
        ...(config.Endpoint ? { endpoint: config.Endpoint } : {}),
        ...(credentials ? { credentials } : {}),
    });
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
    public readonly Calls: { Op: FakeSqsOperation; QueueUrl: string; MaxMessages?: number; WaitTimeSeconds?: number }[] = [];
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
        this.record('Receive', request.QueueUrl, { MaxMessages: request.MaxMessages, WaitTimeSeconds: request.WaitTimeSeconds });
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

    private record(op: FakeSqsOperation, queueUrl: string, detail: { MaxMessages?: number; WaitTimeSeconds?: number } = {}): void {
        this.Calls.push({ Op: op, QueueUrl: queueUrl, ...detail });
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

Like real SQS, `FakeSqsGateway.Receive` with `MaxMessages > 1` **can return several messages of one FIFO group in a
single call** — a group is only locked against *other* receives while one of its messages is in flight. That is the
behavior Task 5's one-message-per-receive rule exists for, so the fake must not hide it. `Calls` records each
receive's `MaxMessages` and `WaitTimeSeconds` so tests can assert the rule.

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
export * from './gateway/sqsClient';
export * from './gateway/snsClient';
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
Expected: PASS — dependencyGuard (4), config (8), names (5), envelope (7), filterPolicy (11), gatewayErrors (3), SdkSqsGateway (8), SdkSnsGateway (5), clients (3), fakes (5). Total 59.

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
- Create: `packages/WorkQueue/aws/src/margins.ts`, `src/driver/capabilities.ts`, `src/driver/publish.ts`, `src/driver/bindingValidation.ts`
- Create: `packages/WorkQueue/aws/src/testing/fixtures.ts`
- Modify: `packages/WorkQueue/aws/src/index.ts`, `src/testing/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/capabilities.test.ts`, `publish.test.ts`, `bindingValidation.test.ts`

**Interfaces:**
- Consumes: `TopicBinding`, `SubscriptionBinding`, `SubscriptionPolicy`, `SubscriptionFilter`, `WorkMessage`, `WorkJson`, `HostType`, `PublishResult`, `BindingValidationIssue`, `TransportCapabilities`, `WorkQueueConfigurationError` (core); `ReadAwsTopicConfig`, `ReadAwsSubscriptionConfig`, `SerializeEnvelope`, `MessageGroupIdFor` (Task 1); `SnsFilterPolicyFor`, `NormalizeSnsFilterPolicy` (Task 2); `SnsGateway`, `SqsGateway`, `SnsPublishEntry`, `AwsGatewayError`, `FakeSnsGateway`, `FakeSqsGateway` (Task 3).
- Produces:
  - `AWS_TRANSPORT_NAME = 'AWS'`, `AWS_TRANSPORT_CAPABILITIES: TransportCapabilities` (including `Filters` — the operators and structure SNS can express, 03 §4.1)
  - `SNS_BATCH_MAX_ENTRIES = 10`, `SNS_REQUEST_MAX_BYTES = 262144`, `MAX_MESSAGE_ATTRIBUTES = 10`
  - `BuildPublishEntry(message: WorkMessage, index: number, isFifo: boolean): SnsPublishEntry`, `EntryBytes(entry: SnsPublishEntry): number`, `ChunkEntries(entries: SnsPublishEntry[], oneEntryPerGroup?: boolean): SnsPublishEntry[][]`
  - `PublishToSns(gateway: SnsGateway, topic: TopicBinding, messages: WorkMessage[]): Promise<PublishResult[]>`
  - `src/margins.ts` (no imports, so the Lambda path can use it without touching `driver/*`): `RECEIVE_GUARD_MARGIN = 2`, `REDRIVE_MARGIN = 5`; `ExpectedMaxReceiveCount(policy: SubscriptionPolicy): number` (= `MaxAttempts + 5`), `RequiresFifoTopic(subscriptions: SubscriptionBinding[]): boolean`
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
| More than 10 attributes, or an **empty attribute value** | `Rejected` `InvalidAttributes` (checked before the call: SNS rejects an empty `String` value by failing the **whole** `PublishBatch`, which would poison up to nine healthy messages) |
| FIFO: an earlier message of the same `MessageGroupId` failed in this call | `Rejected` `TransportUnavailable`, retryable — the group's tail is **not sent**, so a caller retry cannot reorder the key |
| Entry failed with `SenderFault = true` | `Rejected` `TransportRejected` (not retryable; SNS code in the message) |
| Entry failed with `SenderFault = false`, or unreported | `Rejected` `TransportUnavailable`, retryable |
| Whole `PublishBatch` call failed | every entry of that chunk `Rejected` `TransportUnavailable`, `Retryable` = the gateway error's flag |

The AWS driver never returns `Duplicate` (03 §2.1): FIFO deduplication is silent, and `DeduplicationKey`
suppression happens in the engine ledger before the driver is called.

**FIFO publish order.** On a FIFO topic a `PublishBatch` never carries two entries of one message group (a partial
entry failure inside one batch would let a later entry of the key succeed after an earlier one failed). `ChunkEntries`
starts a new chunk when the group is already present, chunks are sent sequentially, and once an entry of a group is
rejected every later entry of that group in the same `PublishToSns` call is rejected unsent. Core validation (03 §1.1)
already rejects empty attribute values; the driver repeats the check because it is the last line before SNS.

**`Ordered` is not available here.** `SupportsOrdered = false`, so core's `SubscriptionUnsupportedReason` rejects an
`Ordered` subscription on an AWS topic when it is saved and at host start, and `ValidateAwsBindings` reports it as an
error ("Ordered requires the Database transport"). A topic that needs a consumer which halts its key on failure lives
on the Database transport (11 S2).

**Receive margins (03 §5.1, F5).** `Attempt` is SQS's `ApproximateReceiveCount`. The runtime dead-letters after a
failure at `Attempt ≥ MaxAttempts`; the consumer's receive-time guard (Task 5) dead-letters only when the count is
`> MaxAttempts + RECEIVE_GUARD_MARGIN`; the queue's redrive policy is `MaxAttempts + REDRIVE_MARGIN`. `Release`
(visibility 0 on shutdown) and Lambda throttling each consume a receive without running the handler — the margins
absorb them. `ValidateAwsBindings` reports a redrive count or visibility timeout that no longer matches the policy as a
**Warning** (policy drift: the Lambda's `MJ_WQ_SUBSCRIPTION` and the queue are frozen at apply time — re-apply Terraform).

**`None` on a FIFO topic.** A topic is FIFO as soon as one subscription is `Exclusive`, and then **every** queue on it
is FIFO. A `None` subscription there is serialised per `PartitionKey`, and a message in retry backoff
(`ChangeMessageVisibility`) holds every later message of its key for the delay — unlike `None` on the Database
transport. Use the two-topic pattern for firehoses (11 §4; README, Task 11).

**Cancel.** Both `CancelPending` and `CancelInFlight` are `false`. SQS cannot delete a named pending message, and an
in-flight message's lease is its receipt handle — there is no cancel flag to set from outside the consumer. So on this
transport `ExtendLease` never returns `'Cancelled'`, `AcknowledgeCancel` always returns `LeaseLost` (03 §5), and the
operator's `Discard` of a pending or in-flight message answers `{ Supported: false }` (Task 6).

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/capabilities.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AWS_TRANSPORT_CAPABILITIES, AWS_TRANSPORT_NAME } from '../driver/capabilities';

describe('AWS transport capabilities', () => {
    it('declares exactly the 03 §5 AWS values', () => {
        expect(AWS_TRANSPORT_NAME).toBe('AWS');
        expect(AWS_TRANSPORT_CAPABILITIES).toEqual({
            Filters: { Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50 },
            DetectsMessageIDDuplicates: false,
            PersistsProgress: false,
            SupportsOrdered: false,
            SupportsExternalHosts: true,
            CancelPending: false,
            CancelInFlight: false,
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

    it('rejects an empty attribute value before the call so the batch is not poisoned', async () => {
        const empty = TestMessage(1, { Attributes: { eventType: '' } });
        const results = await PublishToSns(sns, TestTopicBinding(false), [empty, TestMessage(2)]);
        expect(results.map((r) => r.Error?.Code ?? r.Status)).toEqual(['InvalidAttributes', 'Accepted']);
        expect(sns.Batches).toHaveLength(1);
        expect(sns.Batches[0].Entries).toHaveLength(1);
    });

    it('never puts two messages of one key in one FIFO batch', async () => {
        const messages = [TestMessage(1, { PartitionKey: 'k' }), TestMessage(2, { PartitionKey: 'k' }), TestMessage(3, { PartitionKey: 'other' })];
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(results.map((r) => r.Status)).toEqual(['Accepted', 'Accepted', 'Accepted']);
        expect(sns.Batches.map((batch) => batch.Entries.map((e) => e.MessageGroupId))).toEqual([['k'], ['k', 'other']]);
    });

    it('does not send the tail of a key after one of its messages fails', async () => {
        const messages = [TestMessage(1, { PartitionKey: 'k' }), TestMessage(2, { PartitionKey: 'k' }), TestMessage(3, { PartitionKey: 'other' })];
        sns.FailedEntries.set(messages[0].MessageID, { Code: 'InternalError', Message: 'try again', SenderFault: false });
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(results.map((r) => r.Status)).toEqual(['Rejected', 'Rejected', 'Accepted']);
        expect(results[1].Error).toMatchObject({ Code: 'TransportUnavailable', Retryable: true });
        const sentGroups = sns.Batches.flatMap((batch) => batch.Entries.map((e) => e.MessageGroupId));
        expect(sentGroups).toEqual(['k', 'other']);
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
    it('uses MaxAttempts + 5 for every queue', () => {
        expect(ExpectedMaxReceiveCount(TestPolicy({ MaxAttempts: 5, PartitionMode: 'Exclusive' }))).toBe(10);
        expect(ExpectedMaxReceiveCount(TestPolicy({ MaxAttempts: 1, PartitionMode: 'None' }))).toBe(6);
    });

    it('requires FIFO as soon as one subscription is Exclusive', () => {
        const none = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'None' } });
        expect(RequiresFifoTopic([none])).toBe(false);
        expect(RequiresFifoTopic([none, TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } })])).toBe(true);
    });
});

describe('ValidateAwsBindings', () => {
    it('reports nothing for resources provisioned as expected', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
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
            'Error: Topic must be FIFO: it has an Exclusive subscription (03 W7)',
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

    it('rejects an Ordered subscription: Ordered requires the Database transport', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { PartitionMode: 'Ordered' } });
        SeedValidAwsResources(sns, sqs, topic, subscription);
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Error: Ordered requires the Database transport; this subscription cannot run on the AWS transport',
        ]);
    });

    it('reports a redrive policy that targets the wrong queue, and warns about a drifted count', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { MaxAttempts: 5 } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sqs.AddQueue(resources.QueueUrl, {
            Fifo: true, VisibilityTimeoutSeconds: 60,
            Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: 'arn:aws:sqs:us-east-1:123456789012:other.fifo', maxReceiveCount: 7 }), MaximumMessageSize: '262144' },
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            `Error: Redrive policy targets arn:aws:sqs:us-east-1:123456789012:other.fifo, expected ${resources.DeadLetterQueueArn}`,
            'Warning: Redrive maxReceiveCount is 7 but the policy expects 10 (MaxAttempts + 5): policy drift — re-apply Terraform',
        ]);
    });

    it('warns about a short visibility timeout and a small maximum message size', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { LeaseSeconds: 120 } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sqs.AddQueue(resources.QueueUrl, {
            Fifo: true, VisibilityTimeoutSeconds: 60,
            Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: resources.DeadLetterQueueArn, maxReceiveCount: 10 }), MaximumMessageSize: '65536' },
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Warning: Queue VisibilityTimeout 60 is below LeaseSeconds 120',
            'Warning: Queue MaximumMessageSize 65536 is below 262144',
        ]);
    });

    it('reports SNS subscription drift', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
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
    Filters: { Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50 },
    DetectsMessageIDDuplicates: false,
    PersistsProgress: false,
    SupportsOrdered: false,
    SupportsExternalHosts: true,
    CancelPending: false,
    CancelInFlight: false,
    ListPartitions: false,
    PeekDeadLetters: 'BestEffort',
    ReplaySingleDeadLetter: true,
    CompletedCounts: false,
    MaxRetryDelaySeconds: 43200,
};
```

`packages/WorkQueue/aws/src/margins.ts`:

```typescript
/** The consumer's receive-time guard dead-letters at ReceiveCount > MaxAttempts + RECEIVE_GUARD_MARGIN (03 §5.1). */
export const RECEIVE_GUARD_MARGIN = 2;
/** Queue redrive policy: maxReceiveCount = MaxAttempts + REDRIVE_MARGIN — a crash-loop backstop behind the guard. */
export const REDRIVE_MARGIN = 5;
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

/** Chunks by entry count and request bytes. With `oneEntryPerGroup` (FIFO) a chunk never holds two entries of one group. */
export function ChunkEntries(entries: SnsPublishEntry[], oneEntryPerGroup = false): SnsPublishEntry[][] {
    const chunks: SnsPublishEntry[][] = [];
    let current: SnsPublishEntry[] = [];
    let currentBytes = 0;
    for (const entry of entries) {
        const bytes = EntryBytes(entry);
        const groupTaken = oneEntryPerGroup && current.some((other) => other.MessageGroupId === entry.MessageGroupId);
        if (groupTaken || current.length === SNS_BATCH_MAX_ENTRIES || (current.length > 0 && currentBytes + bytes > SNS_REQUEST_MAX_BYTES)) {
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
    const emptyKey = Object.entries(message.Attributes).find(([, value]) => value === '')?.[0];
    if (emptyKey !== undefined) {
        // SNS fails the whole PublishBatch for an empty String attribute value, so it must never reach the call.
        return rejected(message.MessageID, 'InvalidAttributes', `Attribute '${emptyKey}' has an empty value`, false);
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

/** FIFO: once a group has a rejected entry, its later entries are rejected unsent so a caller retry cannot reorder the key. */
function holdBack(entry: SnsPublishEntry, failedGroups: Set<string>, ids: Map<string, string>, results: Map<string, PublishResult>): boolean {
    if (entry.MessageGroupId === undefined || !failedGroups.has(entry.MessageGroupId)) {
        return false;
    }
    results.set(entry.Id, rejected(ids.get(entry.Id) ?? entry.Id, 'TransportUnavailable',
        'Not sent: an earlier message of this partition key failed in the same publish call', true));
    return true;
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
    const failedGroups = new Set<string>();
    for (const chunk of ChunkEntries(sendable, topic.IsFifo)) {
        const live = chunk.filter((entry) => !holdBack(entry, failedGroups, ids, results));
        if (live.length === 0) {
            continue;
        }
        const chunkResults = await publishChunk(gateway, topicArn, live, ids);
        live.forEach((entry, i) => {
            results.set(entry.Id, chunkResults[i]);
            if (chunkResults[i].Status === 'Rejected' && entry.MessageGroupId !== undefined) {
                failedGroups.add(entry.MessageGroupId);
            }
        });
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
import { REDRIVE_MARGIN } from '../margins';
import type { SnsGateway } from '../gateway/SnsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';

const REQUIRED_MAX_MESSAGE_SIZE = 262_144;

type IssueSink = (severity: 'Error' | 'Warning', message: string) => void;

export function ExpectedMaxReceiveCount(policy: SubscriptionPolicy): number {
    return policy.MaxAttempts + REDRIVE_MARGIN;
}

/** 03 W7: a topic must be FIFO when any subscription is Exclusive. (Ordered is rejected outright on this transport.) */
export function RequiresFifoTopic(subscriptions: SubscriptionBinding[]): boolean {
    return subscriptions.some((s) => s.Policy.PartitionMode === 'Exclusive');
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
    if (!topic.IsFifo && RequiresFifoTopic(subscriptions)) {
        add('Error', 'Topic must be FIFO: it has an Exclusive subscription (03 W7)');
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
            add('Warning', `Redrive maxReceiveCount is ${redrive.maxReceiveCount ?? 'unset'} but the policy expects ${expectedCount} (MaxAttempts + ${REDRIVE_MARGIN}): policy drift — re-apply Terraform`);
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
    if (binding.Policy.PartitionMode === 'Ordered') {
        add('Error', 'Ordered requires the Database transport; this subscription cannot run on the AWS transport');
        return;
    }
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

/** Checks that pre-provisioned SNS/SQS resources exist and match the topology (FIFO, redrive, raw delivery, filter).
 *  Read-only: it needs sns:GetTopicAttributes, sns:GetSubscriptionAttributes and sqs:GetQueueAttributes (Task 9 IAM). */
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
        SubscriptionName: 'email.unsubscribe', TopicName: 'email.events', PartitionMode: 'Exclusive',
        MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function TestTopicBinding(isFifo: boolean = true, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'email.events', IsFifo: isFifo, MaxPayloadBytes: 262_144,
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
export * from './gateway/sqsClient';
export * from './gateway/snsClient';
export * from './margins';
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
Expected: PASS — previous 59, plus capabilities (1), publish (12), bindingValidation (11). Total 83.

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
- Consumes: `ITransportConsumer`, `LeaseExtension`, `ReceivedDelivery`, `SettleResult`, `SubscriptionBinding`, `WorkJson`, `WorkMessage`, `WorkProgress` (core, 03 §5); `ReadAwsSubscriptionConfig`, `AwsSubscriptionConfig`, `ParseEnvelopeBody` (Task 1); `SqsGateway`, `SqsReceivedMessage`, `AwsGatewayError`, `ToGatewayError`, `FakeSqsGateway` (Task 3); `RECEIVE_GUARD_MARGIN` (`src/margins.ts`), `TestAwsResources`, `TestSubscriptionBinding`, `TestMessage` (Task 4).
- Produces:
  - `DEAD_LETTER_ATTRIBUTES = { Reason: 'mj_dead_letter_reason', LastError: 'mj_last_error', Attempts: 'mj_attempts', DeadLetteredAt: 'mj_dead_lettered_at', SourceQueue: 'mj_source_queue' }`, `REPLAY_ATTRIBUTE = 'mj_replay'`, `DEAD_LETTER_REASON_MAX_CHARS = 500`, `LAST_ERROR_MAX_CHARS = 2000`
  - `interface DeadLetterRequest { Message: SqsReceivedMessage; Reason: string; Error: string | null; Attempts: number }`
  - `SendToDeadLetterQueue(gateway: SqsGateway, config: AwsSubscriptionConfig, request: DeadLetterRequest, now: Date): Promise<string>`
  - `SQS_MAX_INVISIBLE_SECONDS = 43200`, `SQS_STANDARD_MAX_BATCH = 10`
  - `interface SqsConsumerOptions { Now?: () => number; OnAdoptError?: (message: SqsReceivedMessage, error: Error) => void }`
  - `class SqsTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload>` — `constructor(gateway: SqsGateway, binding: SubscriptionBinding, options?: SqsConsumerOptions)`, plus `Adopt(message: SqsReceivedMessage): Promise<ReceivedDelivery<TPayload> | null>` (used by the Lambda adapter, Task 7) and `get TrackedCount(): number`

**One message per FIFO receive (03 §5.1, F5).** SQS FIFO locks a message group against *other* receives while one of
its messages is in flight — but a single `ReceiveMessage` with `MaxNumberOfMessages > 1` may return several messages of
the **same** group. The core runtime starts every delivery it receives, so a batched receive would run one key's
messages concurrently (breaking `Exclusive`) and, when the head retries, its batch-mates would be released and
re-received, burning receive counts they never used. So on a FIFO binding `Receive(max, …)` issues up to
`min(max, 10)` **parallel** `ReceiveMessage` calls, each with `MaxNumberOfMessages = 1`; SQS's group lock then
guarantees they return different keys. Standard queues keep one batched receive (≤ 10).

Settle mapping (03 §5, §5.1):

| Operation | SQS call | Result |
| --- | --- | --- |
| `Receive` | FIFO: up to `max` parallel `ReceiveMessage(MaxNumberOfMessages = 1)`; standard: one `ReceiveMessage(≤ 10)`; visibility = `LeaseSeconds`; then `Adopt` each | valid envelopes as deliveries; one message failing to adopt never loses the others |
| `Adopt` — body is not an envelope | dead-letter `InvalidEnvelope` + `DeleteMessage` | `null` |
| `Adopt` — `ReceiveCount > MaxAttempts + 2` (receive-time guard: crash loop, never settled) | dead-letter `MaxAttemptsExceeded` + `DeleteMessage` | `null` |
| `ExtendLease` | `ChangeMessageVisibility(min(lease, 12 h window left))` | `Held`; `Lost` on a stale receipt, an exhausted 12 h window or a non-retryable error; **throws** on a retryable error. Never `Cancelled` |
| `Complete` | `DeleteMessage` | `Settled Completed` / `LeaseLost` / `Failed` |
| `Retry` | `ChangeMessageVisibility(min(delay, 12 h window left))` | `Settled Pending` / `LeaseLost` / `Failed` |
| `DeadLetter` | `SendMessage` to the DLQ with `mj_*` attributes, then `DeleteMessage` | `Settled DeadLettered` / `LeaseLost` (the DLQ copy exists; a second copy is suppressed by its dedup id) / `Failed` (send failed; message untouched) |
| `Release` | `ChangeMessageVisibility(0)` | `Settled Pending` / `LeaseLost` — **the receive is already counted** |
| `AcknowledgeCancel` | none | always `LeaseLost` (`CancelInFlight` is `false`) |

**Attempt accounting.** `Attempt` = `ApproximateReceiveCount`. The runtime dead-letters after a *failure* at
`Attempt ≥ MaxAttempts` (03 §3.2). Receives that never ran the handler — `Release` on shutdown, a Lambda throttle, a
worker killed mid-handler — still increment the count, so the receive-time guard waits for
`> MaxAttempts + RECEIVE_GUARD_MARGIN` and the queue's redrive policy for `MaxAttempts + REDRIVE_MARGIN` (Task 4). With
one message per FIFO receive, a key's followers are never received while their head retries, so they arrive for
their first run at `Attempt = 1`.

`ExtendLease` is this transport's instance of 03 §3.2's **retry-within-lease** rule: a transient SQS failure
(throttling, timeout, a 5xx) **throws**, which the runtime treats as transient and retries on its next heartbeat tick;
the independent lease-horizon timer (F4) still aborts the handler if the lease really runs out. Only three things
answer `Lost`: a stale or invalid receipt handle (`ReceiptHandleIsInvalid` — the message was already redelivered to
someone else), an exhausted 12-hour visibility window, or a non-retryable error.

`DeliveryID` is the SQS `MessageId`; `LeaseToken` is the receipt handle; `IsReplay` is `mj_replay = '1'` (a replayed
message is a new SQS message, so its attempts restart at 1).

**Dead-letter copies get their own message group (03 §5.1, F6).** On a FIFO dead-letter queue, `MessageGroupId` = the
source SQS `MessageId` and `MessageDeduplicationId` = `<SQS MessageId>:dl`. Order means nothing in a DLQ, and keeping
the original group would let one in-flight scan receive block every other dead letter of a poison key (Task 6).

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/deadLetter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ReadAwsSubscriptionConfig } from '../config';
import { DEAD_LETTER_ATTRIBUTES, LAST_ERROR_MAX_CHARS, SendToDeadLetterQueue } from '../consumer/deadLetter';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestSubscriptionBinding } from '../testing/fixtures';

describe('SendToDeadLetterQueue', () => {
    it('copies the body with reason attributes, in a message group of its own', async () => {
        const r = TestAwsResources(true);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(true).Config);
        const message = { MessageId: 'sqs-1', ReceiptHandle: 'rh', Body: '{"x":1}', ReceiveCount: 3, MessageGroupId: 'subscriber-9', SentTimestamp: 1, Attributes: {} };
        await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'Fatal', Error: 'e'.repeat(5000), Attempts: 3 }, new Date('2026-09-16T12:00:00.000Z'));
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Body).toBe('{"x":1}');
        expect(copy.GroupId).toBe('sqs-1');
        expect(copy.DeduplicationId).toBe('sqs-1:dl');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('Fatal');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toHaveLength(LAST_ERROR_MAX_CHARS);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('3');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]).toBe('2026-09-16T12:00:00.000Z');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.SourceQueue]).toBe(r.QueueArn);
    });

    it('lets a scan reach every dead letter of one poison key', async () => {
        const r = TestAwsResources(true);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(true).Config);
        for (const id of ['sqs-1', 'sqs-2', 'sqs-3']) {
            const message = { MessageId: id, ReceiptHandle: 'rh', Body: id, ReceiveCount: 6, MessageGroupId: 'poison-key', SentTimestamp: 1, Attributes: {} };
            await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'Fatal', Error: null, Attempts: 6 }, new Date());
        }
        const first = await sqs.Receive({ QueueUrl: r.DeadLetterQueueUrl, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        const rest = await sqs.Receive({ QueueUrl: r.DeadLetterQueueUrl, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect([...first, ...rest].map((m) => m.Body).sort()).toEqual(['sqs-1', 'sqs-2', 'sqs-3']);
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
import type { SqsReceivedMessage } from '../gateway/SqsGateway';
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

async function send(index: number, attributes: Record<string, string> = {}, group: string = `g-${index}`): Promise<void> {
    await sqs.Send({ QueueUrl: r.QueueUrl, Body: JSON.stringify(TestMessage(index)), MessageGroupId: group, MessageDeduplicationId: `d-${index}`, Attributes: attributes });
}

class AlwaysThrottledSqs extends FakeSqsGateway {
    public override async Receive(): Promise<SqsReceivedMessage[]> {
        throw new AwsGatewayError('SQS ReceiveMessage failed: Throttling', 'Throttling', true);
    }
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

    it('receives one message per call on a FIFO queue, so one key is never in flight twice', async () => {
        await send(1, {}, 'key-a');
        await send(2, {}, 'key-a');
        await send(3, {}, 'key-b');
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID).sort()).toEqual([TestMessage(1).MessageID, TestMessage(3).MessageID]);
        const receives = sqs.Calls.filter((call) => call.Op === 'Receive');
        expect(receives).toHaveLength(10);
        expect(receives.every((call) => call.MaxMessages === 1)).toBe(true);
        // key-a's second message stays queued until the first settles.
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        await consumer.Complete(deliveries.find((d) => d.Message.MessageID === TestMessage(1).MessageID)!);
        expect((await consumer.Receive(10, 0, signal)).map((d) => d.Message.MessageID)).toEqual([TestMessage(2).MessageID]);
    });

    it('does not burn a follower\'s attempts while its head retries', async () => {
        await send(1, {}, 'key-a');
        await send(2, {}, 'key-a');
        for (let attempt = 1; attempt <= 3; attempt++) {
            const [head] = await consumer.Receive(10, 0, signal);
            expect(head.Message.MessageID).toBe(TestMessage(1).MessageID);
            await consumer.Retry(head, 30, 'boom');
            sqs.Advance(31);
        }
        const [head] = await consumer.Receive(10, 0, signal);
        await consumer.Complete(head);
        const [follower] = await consumer.Receive(10, 0, signal);
        expect(follower.Message.MessageID).toBe(TestMessage(2).MessageID);
        expect(follower.Attempt).toBe(1);
    });

    it('batches on a standard queue', async () => {
        const standard = TestAwsResources(false);
        sqs.AddQueue(standard.QueueUrl, { Fifo: false }).AddQueue(standard.DeadLetterQueueUrl, { Fifo: false });
        const standardConsumer = new SqsTransportConsumer(sqs, TestSubscriptionBinding(false), { Now: () => sqs.Now });
        for (const index of [1, 2, 3]) {
            await sqs.Send({ QueueUrl: standard.QueueUrl, Body: JSON.stringify(TestMessage(index)) });
        }
        expect(await standardConsumer.Receive(25, 0, signal)).toHaveLength(3);
        const receives = sqs.Calls.filter((call) => call.Op === 'Receive');
        expect(receives).toEqual([expect.objectContaining({ MaxMessages: 10 })]);
    });

    it('dead-letters a body that is not an envelope and does not return it', async () => {
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: 'not json', MessageGroupId: 'g', MessageDeduplicationId: 'bad' });
        expect(await consumer.Receive(10, 0, signal)).toEqual([]);
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(0);
        expect(sqs.Messages(r.DeadLetterQueueUrl)[0].Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');
    });

    it('still returns the adopted messages when one message cannot be dead-lettered', async () => {
        const failures: string[] = [];
        consumer = new SqsTransportConsumer(sqs, binding, { Now: () => sqs.Now, OnAdoptError: (message, error) => failures.push(`${message.Body}: ${error.message}`) });
        await sqs.Send({ QueueUrl: r.QueueUrl, Body: 'not json', MessageGroupId: 'bad', MessageDeduplicationId: 'bad' });
        await send(1);
        sqs.FailNext('Send', new AwsGatewayError('SQS SendMessage failed: down', 'InternalError', true));
        const deliveries = await consumer.Receive(10, 0, signal);
        expect(deliveries.map((d) => d.Message.MessageID)).toEqual([TestMessage(1).MessageID]);
        expect(failures).toEqual(['not json: SQS SendMessage failed: down']);
        // The poison message was not deleted; SQS redelivers it after the visibility timeout.
        expect(sqs.Messages(r.QueueUrl).map((m) => m.Body)).toContain('not json');
    });

    it('throws only when every receive call fails', async () => {
        const throttled = new AlwaysThrottledSqs().AddQueue(r.QueueUrl, { Fifo: true });
        await expect(new SqsTransportConsumer(throttled, binding).Receive(3, 0, signal)).rejects.toThrow('Throttling');
        // One failed call out of several is tolerated: the other receives still return their messages.
        await send(1);
        sqs.FailNext('Receive', new AwsGatewayError('SQS ReceiveMessage failed: Throttling', 'Throttling', true));
        expect(await consumer.Receive(3, 0, signal)).toHaveLength(1);
    });

    it('guards at MaxAttempts + 2 receives, not at MaxAttempts', async () => {
        consumer = withPolicy({ MaxAttempts: 2 });
        await send(1);
        for (let i = 0; i < 4; i++) {
            expect(await consumer.Receive(1, 0, signal)).toHaveLength(1);   // receives 1–4 are still delivered
            sqs.Advance(61);
        }
        expect(await consumer.Receive(1, 0, signal)).toEqual([]);           // receive 5 > 2 + 2
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('MaxAttemptsExceeded');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('5');
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

    it('releases by making the message visible immediately, which consumes a receive', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.Release(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' });
        const [again] = await consumer.Receive(1, 0, signal);
        expect(again.Attempt).toBe(2);
    });

    it('cannot acknowledge a cancel: SQS has no cancel flag', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        expect(await consumer.AcknowledgeCancel(delivery)).toEqual({ Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID });
        expect(sqs.Messages(r.QueueUrl)).toHaveLength(1);
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

    it('throws on a retryable SQS error (the runtime retries next tick) and loses on a non-retryable one', async () => {
        await send(1);
        const [delivery] = await consumer.Receive(1, 0, signal);
        sqs.FailNext('ChangeVisibility', new AwsGatewayError('slow down', 'Throttling', true));
        await expect(consumer.ExtendLease(delivery, 60)).rejects.toThrow('slow down');
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
        expect(copy.GroupId).toBe(delivery.DeliveryID);
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
        // F6: every dead letter is its own message group, so a scan's in-flight receive never blocks the others.
        ...(config.IsFifo
            ? { MessageGroupId: request.Message.MessageId, MessageDeduplicationId: `${request.Message.MessageId}:dl` }
            : {}),
    });
}
```

- [ ] **Step 4: Write `src/consumer/SqsTransportConsumer.ts`**

```typescript
import type {
    ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkMessage, WorkProgress,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig, type AwsSubscriptionConfig } from '../config';
import { RECEIVE_GUARD_MARGIN } from '../margins';
import { ParseEnvelopeBody } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';
import { REPLAY_ATTRIBUTE, SendToDeadLetterQueue } from './deadLetter';

export const SQS_MAX_INVISIBLE_SECONDS = 43200;
export const SQS_STANDARD_MAX_BATCH = 10;

export interface SqsConsumerOptions {
    /** Clock, epoch ms. Defaults to Date.now. */
    Now?: () => number;
    /** Called when one received message could not be adopted (it stays on the queue and is redelivered). */
    OnAdoptError?: (message: SqsReceivedMessage, error: Error) => void;
}

interface Tracked {
    Raw: SqsReceivedMessage;
    ReceivedAt: number;
}

export class SqsTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly config: AwsSubscriptionConfig;
    private readonly now: () => number;
    private readonly onAdoptError: (message: SqsReceivedMessage, error: Error) => void;
    private readonly tracked = new Map<string, Tracked>();

    constructor(private readonly gateway: SqsGateway, private readonly binding: SubscriptionBinding, options: SqsConsumerOptions = {}) {
        this.config = ReadAwsSubscriptionConfig(binding.Config);
        this.now = options.Now ?? Date.now;
        this.onAdoptError = options.OnAdoptError ?? (() => undefined);
    }

    public get TrackedCount(): number {
        return this.tracked.size;
    }

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const messages = this.config.IsFifo
            ? await this.receiveOnePerCall(max, waitSeconds, signal)
            : await this.receiveCall(Math.min(Math.max(max, 1), SQS_STANDARD_MAX_BATCH), waitSeconds, signal);
        const deliveries: ReceivedDelivery<TPayload>[] = [];
        for (const message of messages) {
            try {
                const delivery = await this.Adopt(message);
                if (delivery) {
                    deliveries.push(delivery);
                }
            } catch (error) {
                // One message failing to adopt must not lose the ones already adopted: it was not deleted,
                // so SQS redelivers it after its visibility timeout (and the redrive policy is the backstop).
                this.onAdoptError(message, ToGatewayError(error, 'SQS adopt'));
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
        if (message.ReceiveCount > this.binding.Policy.MaxAttempts + RECEIVE_GUARD_MARGIN) {
            await this.deadLetterAndDelete(message, 'MaxAttemptsExceeded', `Received ${message.ReceiveCount} times without being settled`);
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

    /** Throws on a retryable SQS error: the runtime retries on its next heartbeat tick (03 §3.2). Never 'Cancelled'. */
    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, _progress?: WorkProgress): Promise<LeaseExtension> {
        const seconds = Math.min(leaseSeconds, this.windowLeftSeconds(delivery));
        if (seconds <= 0) {
            return 'Lost';
        }
        try {
            return (await this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, seconds)) ? 'Held' : 'Lost';
        } catch (error) {
            const mapped = ToGatewayError(error, 'SQS ChangeMessageVisibility');
            if (mapped.Retryable) {
                throw mapped;
            }
            return 'Lost';
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

    /** Visibility 0. SQS has already counted this receive; the receive margins (Task 4) absorb it. */
    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Pending', () => this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, 0));
    }

    /** CancelInFlight is false on this transport: there is no cancel flag to acknowledge (03 §5). */
    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.tracked.clear();
    }

    /** FIFO: parallel single-message receives. SQS's group lock makes them return different keys (03 §5.1, F5). */
    private async receiveOnePerCall(max: number, waitSeconds: number, signal: AbortSignal): Promise<SqsReceivedMessage[]> {
        const calls = Math.min(Math.max(max, 1), SQS_STANDARD_MAX_BATCH);
        const settled = await Promise.allSettled(Array.from({ length: calls }, () => this.receiveCall(1, waitSeconds, signal)));
        const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failures.length === calls) {
            throw ToGatewayError(failures[0].reason, 'SQS ReceiveMessage');
        }
        return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    }

    private receiveCall(maxMessages: number, waitSeconds: number, signal: AbortSignal): Promise<SqsReceivedMessage[]> {
        return this.gateway.Receive({
            QueueUrl: this.config.QueueUrl, MaxMessages: maxMessages, WaitTimeSeconds: waitSeconds,
            VisibilityTimeoutSeconds: this.binding.Policy.LeaseSeconds, Signal: signal,
        });
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

`Adopt` still throws when its dead-letter send fails — the Lambda adapter (Task 7) calls it per record and reports
that record as a batch item failure. `Receive` catches per message, so the MJ-worker path never drops deliveries it
already adopted. The parallel FIFO receives share the caller's `AbortSignal`; an aborted long poll returns `[]`.

- [ ] **Step 5: Export the modules**

Append to `packages/WorkQueue/aws/src/index.ts`:

```typescript
export * from './consumer/deadLetter';
export * from './consumer/SqsTransportConsumer';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/aws && pnpm test`
Expected: PASS — previous 83, plus deadLetter (3), SqsTransportConsumer (18). Total 104.

Run: `cd packages/WorkQueue/aws && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/aws/src
git commit -m "feat(work-queue-aws): SQS consumer with one-message FIFO receive, visibility leases and dead-letter writer"
```

---

### Task 6: `AwsTransportOperator` and `AwsTransportDriver`

**Files:**
- Create: `packages/WorkQueue/aws/src/operator/deadLetterScan.ts`, `src/operator/AwsTransportOperator.ts`, `src/driver/AwsTransportDriver.ts`
- Modify: `packages/WorkQueue/aws/src/index.ts`
- Test: `packages/WorkQueue/aws/src/__tests__/AwsTransportOperator.test.ts`, `AwsTransportDriver.test.ts`

**Interfaces:**
- Consumes: `ITransportDriver`, `ITransportOperator`, `ITransportConsumer`, `TransportCapabilities`, `TopicBinding`, `SubscriptionBinding`, `WorkMessage`, `WorkJson`, `PublishResult`, `BindingValidationIssue`, `DatabasePublishOptions`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionCondition`, `PartitionStateRecord`, `Page`, `OperatorResult` (core, 03 §5, §5.2); `AwsTransportConfig`, `ReadAwsSubscriptionConfig`, `ParseEnvelopeBody`, `MessageGroupIdFor` (Task 1); `SnsGateway`, `SqsGateway`, `SqsReceivedMessage`, `SdkSnsGateway`, `SdkSqsGateway`, `CreateSqsClient`, `CreateSnsClient`, `AwsCredentialsOption` (Task 3); `AWS_TRANSPORT_NAME`, `AWS_TRANSPORT_CAPABILITIES`, `PublishToSns`, `ValidateAwsBindings` (Task 4); `SqsTransportConsumer`, `DEAD_LETTER_ATTRIBUTES`, `REPLAY_ATTRIBUTE` (Task 5).
- Produces:
  - `DEAD_LETTER_SCAN_LIMIT = 100`, `PEEK_VISIBILITY_SECONDS = 30`, `DEAD_LETTER_SCAN_WAIT_SECONDS = 1`, `DEAD_LETTER_SCAN_EMPTY_LIMIT = 3`, `INVALID_ENVELOPE_ID_PREFIX = 'sqs:'`
  - `interface ScannedDeadLetter { Raw: SqsReceivedMessage; Envelope: WorkMessage | null }`
  - `ScanDeadLetters(gateway: SqsGateway, queueUrl: string, limit: number, isMatch?: (item: ScannedDeadLetter) => boolean): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }>`
  - `RestoreVisibility(gateway: SqsGateway, queueUrl: string, items: ScannedDeadLetter[], exceptReceiptHandle?: string): Promise<void>`
  - `DeadLetterIdOf(item: ScannedDeadLetter): string`, `ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord`
  - `REPLAY_NOTE_ATTRIBUTE = 'mj_replay_note'`, `REPLAYED_BY_ATTRIBUTE = 'mj_replayed_by'`
  - `class AwsTransportOperator implements ITransportOperator` — `constructor(sqs: SqsGateway, options?: { Now?: () => number })`
  - `class AwsTransportDriver implements ITransportDriver` — `constructor(sns: SnsGateway, sqs: SqsGateway, options?: { Now?: () => number })`, `readonly Sns: SnsGateway`, `readonly Sqs: SqsGateway`, `static Create(config: AwsTransportConfig, credentials?: AwsCredentialsOption): AwsTransportDriver`

**Best-effort dead-letter operations (03 §5.1, F6).** SQS has no peek or lookup by ID, so every operation is a scan:
receive with a 30-second visibility, act, then set everything not acted on back to visibility 0.

- **Scan rules.** Every scan receive uses `WaitTimeSeconds = 1` — short polling (`0`) samples a subset of SQS servers
  and returns false empties, which used to end a scan early. A scan stops after **three consecutive empty receives**,
  at `min(pageSize, 100)` items, or at the first match. `NextCursor` is always `null`.
- **Every dead letter is reachable.** Dead-letter copies are each their own message group (Task 5), so holding one in
  flight during a scan never hides the other dead letters of a poison key.
- **Identity.** The AWS `DeliveryID` of a dead letter is the envelope `MessageID` (03 §5.2). A body that is not an
  envelope (`InvalidEnvelope`) has none, so it is listed as `sqs:<SQS MessageId>` with a placeholder `Message`
  (`Payload: null`) and the first 1,000 characters of its raw body appended to `LastError`. It can be discarded by that
  ID; it cannot be replayed (`Changed: false`).
- **Replay** sends the original body back to the subscription queue with `mj_replay = '1'` (FIFO group = the
  envelope's group, dedup ID `<MessageID>:replay:<epoch ms>` so the 5-minute window never swallows it) and deletes it
  from the dead-letter queue. A replayed message goes behind anything already queued in its group, which `Exclusive`
  allows (no order promise). Bulk redrive of a large dead-letter queue is done with SQS's own `StartMessageMoveTask`
  (package README, Task 11).
- **Not supported.** Discarding a pending or in-flight SQS message (`CancelPending = false`, `CancelInFlight = false`):
  a discard whose ID is not among the scanned dead letters answers `{ Supported: false }`. `ListPartitions` returns
  `null`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/aws/src/__tests__/AwsTransportOperator.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { SubscriptionBinding } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import type { SqsReceivedMessage, SqsReceiveRequest } from '../gateway/SqsGateway';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

const r = TestAwsResources(true);
const signal = new AbortController().signal;
let sqs: FakeSqsGateway;

/** Returns `EmptyReceives` false-empty results before behaving normally (what SQS short polling does). */
class FalseEmptySqs extends FakeSqsGateway {
    public EmptyReceives = 0;
    public override async Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]> {
        if (this.EmptyReceives > 0) {
            this.EmptyReceives -= 1;
            return [];
        }
        return super.Receive(request);
    }
}
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
    it('maps runtime, redrive and unreadable dead letters and restores visibility', async () => {
        await deadLetter(1, runtimeAttributes('MaxAttemptsExceeded', '5'), 'subscriber-9');
        await deadLetter(2, {});
        await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: 'garbage', MessageGroupId: 'g-x', MessageDeduplicationId: 'x' });
        const page = await operator.ListDeadLetters(binding, null, 50);
        expect(page?.NextCursor).toBeNull();
        expect(page?.Items).toEqual([
            { DeliveryID: TestMessage(1).MessageID, Message: TestMessage(1, { PartitionKey: 'subscriber-9' }), PartitionKey: 'subscriber-9', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'boom', DeadLetteredAt: '2026-09-16T12:00:00.000Z', BlocksKey: false },
            { DeliveryID: TestMessage(2).MessageID, Message: TestMessage(2), PartitionKey: null, Attempts: 0, Reason: 'RedrivePolicy', LastError: null, DeadLetteredAt: null, BlocksKey: false },
            expect.objectContaining({ DeliveryID: expect.stringMatching(/^sqs:msg-/), Reason: 'RedrivePolicy', LastError: 'raw body: garbage' }),
        ]);
        expect(page?.Items[2].Message).toMatchObject({ Topic: '', Attributes: {}, Payload: null });
        expect(sqs.Messages(r.DeadLetterQueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });

    it('long-polls, survives false-empty receives and stops after three consecutive empties', async () => {
        const flaky = new FalseEmptySqs().AddQueue(r.QueueUrl, { Fifo: true }).AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        sqs = flaky;
        operator = new AwsTransportOperator(flaky, { Now: () => flaky.Now });
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        flaky.EmptyReceives = 2;
        expect((await operator.ListDeadLetters(binding, null, 50))?.Items).toHaveLength(1);
        const receives = flaky.Calls.filter((call) => call.Op === 'Receive');
        expect(receives.every((call) => call.WaitTimeSeconds === 1)).toBe(true);
        flaky.EmptyReceives = 3;
        expect((await operator.ListDeadLetters(binding, null, 50))?.Items).toEqual([]);
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
    it('discards a dead letter, and reports a pending or in-flight message as unsupported', async () => {
        await deadLetter(1, runtimeAttributes('Fatal', '1'));
        expect(await operator.Discard(binding, TestMessage(1).MessageID, 'bad data', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
        expect(await operator.Discard(binding, TestMessage(2).MessageID, 'cancel', 'user-1')).toEqual({ Supported: false });
    });

    it('discards an unreadable dead letter by its sqs: ID but cannot replay it', async () => {
        await sqs.Send({ QueueUrl: r.DeadLetterQueueUrl, Body: 'garbage', MessageGroupId: 'g-x', MessageDeduplicationId: 'x' });
        const [record] = (await operator.ListDeadLetters(binding, null, 50))?.Items ?? [];
        expect(await operator.Replay(binding, record.DeliveryID, null, null)).toEqual({ Supported: true, Changed: false });
        expect(await operator.Discard(binding, record.DeliveryID, 'unreadable', 'user-1')).toEqual({ Supported: true, Changed: true });
        expect(sqs.Messages(r.DeadLetterQueueUrl)).toHaveLength(0);
    });

    it('has no partitions', async () => {
        expect(await operator.ListPartitions(binding, 'Blocked', null, 50)).toBeNull();
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
/** Long poll: WaitTimeSeconds 0 samples a subset of SQS servers and returns false empties (03 §5.1, F6). */
export const DEAD_LETTER_SCAN_WAIT_SECONDS = 1;
/** A scan ends after this many consecutive empty receives. */
export const DEAD_LETTER_SCAN_EMPTY_LIMIT = 3;
/** DeliveryID prefix of a dead letter whose body is not an envelope (it has no MessageID). */
export const INVALID_ENVELOPE_ID_PREFIX = 'sqs:';
const RAW_BODY_PREVIEW_CHARS = 1000;

export interface ScannedDeadLetter {
    Raw: SqsReceivedMessage;
    Envelope: WorkMessage | null;
}

/** Receives up to `limit` dead letters with a short visibility. Stops at the first item `isMatch` accepts, at the
 *  limit, or after DEAD_LETTER_SCAN_EMPTY_LIMIT consecutive empty receives. */
export async function ScanDeadLetters(
    gateway: SqsGateway,
    queueUrl: string,
    limit: number,
    isMatch?: (item: ScannedDeadLetter) => boolean,
): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
    const items: ScannedDeadLetter[] = [];
    const cap = Math.min(limit, DEAD_LETTER_SCAN_LIMIT);
    let consecutiveEmpties = 0;
    while (items.length < cap && consecutiveEmpties < DEAD_LETTER_SCAN_EMPTY_LIMIT) {
        const batch = await gateway.Receive({
            QueueUrl: queueUrl, MaxMessages: Math.min(10, cap - items.length),
            WaitTimeSeconds: DEAD_LETTER_SCAN_WAIT_SECONDS, VisibilityTimeoutSeconds: PEEK_VISIBILITY_SECONDS,
        });
        if (batch.length === 0) {
            consecutiveEmpties += 1;
            continue;
        }
        consecutiveEmpties = 0;
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

/** The operator-facing ID: the envelope MessageID, or 'sqs:<SQS MessageId>' when the body is not an envelope. */
export function DeadLetterIdOf(item: ScannedDeadLetter): string {
    return item.Envelope?.MessageID ?? `${INVALID_ENVELOPE_ID_PREFIX}${item.Raw.MessageId}`;
}

export function ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord {
    const attributes = item.Raw.Attributes;
    const lastError = attributes[DEAD_LETTER_ATTRIBUTES.LastError] ?? null;
    const base = {
        DeliveryID: DeadLetterIdOf(item),
        Attempts: Number(attributes[DEAD_LETTER_ATTRIBUTES.Attempts] ?? '0'),
        Reason: attributes[DEAD_LETTER_ATTRIBUTES.Reason] ?? 'RedrivePolicy',
        DeadLetteredAt: attributes[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt] ?? null,
        BlocksKey: false,
    };
    if (item.Envelope !== null) {
        return { ...base, Message: item.Envelope, PartitionKey: item.Envelope.PartitionKey ?? null, LastError: lastError };
    }
    // Not an envelope: surface the raw body so an operator can see what arrived before discarding it.
    const preview = `raw body: ${item.Raw.Body.slice(0, RAW_BODY_PREVIEW_CHARS)}`;
    return {
        ...base,
        Message: { MessageID: base.DeliveryID, Topic: '', Attributes: {}, Payload: null, PublishedAt: '' },
        PartitionKey: null,
        LastError: lastError ? `${lastError}; ${preview}` : preview,
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
import { DeadLetterIdOf, RestoreVisibility, ScanDeadLetters, ToDeadLetterRecord, type ScannedDeadLetter } from './deadLetterScan';

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
        return { Items: Items.map(ToDeadLetterRecord), NextCursor: null };
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

    private find(queueUrl: string, messageID: string): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
        return ScanDeadLetters(this.sqs, queueUrl, Number.MAX_SAFE_INTEGER, (item) => DeadLetterIdOf(item) === messageID);
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
import { CreateSqsClient, type AwsCredentialsOption } from '../gateway/sqsClient';
import { CreateSnsClient } from '../gateway/snsClient';
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
        return new AwsTransportDriver(
            new SdkSnsGateway(CreateSnsClient(config, credentials)),
            new SdkSqsGateway(CreateSqsClient(config, credentials)),
        );
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
Expected: PASS — previous 104, plus AwsTransportOperator (10), AwsTransportDriver (4). Total 118.

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
- Consumes: `ConsumerRuntime`, `ConsumerRuntimeOptions`, `WorkHandler`, `WorkLogger`, `WorkJson`, `SettleResult`, `SubscriptionBinding`, `SubscriptionPolicy`, `ParseSubscriptionFilter` (now `(json, support)` — 03 §4.2), `Outcome`, `WorkQueueConfigurationError` (core; `ConsumerRuntime.ProcessBatch(deliveries)` returns one `SettleResult` per delivery and `Stop()` aborts in-flight handlers and releases them — 03 §3.2); `ReadAwsSubscriptionConfig` (Task 1); `SqsGateway`, `SqsReceivedMessage`, `SdkSqsGateway`, `CreateSqsClient` from `gateway/sqsClient` — **never** `snsClient`, `SdkSnsGateway` or `driver/AwsTransportDriver` (Task 3); `SqsTransportConsumer` (Task 5); fakes and fixtures (Tasks 3–4).
- Produces (all from `@memberjunction/work-queue-aws/lambda`):
  - `interface SqsLambdaRecord`, `interface SqsLambdaEvent`, `interface SqsBatchResponse`, `interface LambdaContextLike { getRemainingTimeInMillis(): number; awsRequestId?: string }`, `ToSqsReceivedMessage(record: SqsLambdaRecord): SqsReceivedMessage`
  - `SUBSCRIPTION_ENV_VAR = 'MJ_WQ_SUBSCRIPTION'`, `ParseSubscriptionBindingEnv(value: string | undefined): SubscriptionBinding`
  - `interface InvocationMetrics { Processed: number; Completed: number; Retried: number; DeadLettered: number; Failed: number; NotStarted: number; DurationMs: number }`, `EMF_NAMESPACE = 'MJ/WorkQueue'`, `FormatEmfLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string`
  - `interface SqsLambdaHandlerOptions { Binding?: SubscriptionBinding; Env?: Record<string, string | undefined>; Gateway?: SqsGateway; Concurrency?: number; TimeoutSafetyMs?: number; Log?: WorkLogger; EmitMetrics?: (line: string) => void; Now?: () => number }`
  - `type SqsLambdaHandler = (event: SqsLambdaEvent, context: LambdaContextLike) => Promise<SqsBatchResponse>`
  - `CreateSqsLambdaHandler<TPayload extends WorkJson = WorkJson>(handlerFactory: () => WorkHandler<TPayload>, options?: SqsLambdaHandlerOptions): SqsLambdaHandler`

**Batch size (03 §5.1, F5).** A FIFO event source uses `batch_size = 1` — the Terraform module defaults to it and
warns on anything larger (Task 9). With a larger batch, Lambda hands the function several messages of one key; when
the head fails, the adapter must release its followers, and each release-and-re-receive burns one of the follower's
receives without ever running it. Concurrency comes from the event source's `maximum_concurrency` (parallel
invocations, one per active message group), not from batching. The adapter still handles a larger batch correctly —
the grouping below is the safety net for a misconfigured event source, and the normal path for standard queues.

**How a batch is processed.** The event source mapping must enable `ReportBatchItemFailures`. Records are grouped by
`MessageGroupId` (standard queues: every record is its own group). Groups run concurrently (default 10); records
inside a group run one at a time, in order, through `ConsumerRuntime.ProcessBatch([delivery])`.

| Record result | Reported as a batch failure? | Why |
| --- | --- | --- |
| `Settled Completed` / `Settled DeadLettered` | no | Already deleted (and copied to the DLQ) |
| Poison body, or a message past the receive-time guard (`Adopt` returned `null`) | no | `Adopt` dead-lettered and deleted it |
| `Settled Pending` (retry), `LeaseLost`, `Failed`, or `Adopt` threw | **yes** | Must stay on the queue |
| Later records of a FIFO group after a failure | **yes**, not processed, visibility set to 0 | Order: they must not overtake the failed record; the group stays blocked by it in SQS. Each such release costs the follower one receive — the reason for `batch_size = 1` |
| Records not started because the remaining time is below `TimeoutSafetyMs` (default 10 s) | **yes**, visibility set to 0 | Lambda would time out; SQS redelivers them promptly |

A timer fires `TimeoutSafetyMs` before the function's deadline and calls `runtime.Stop()`, which aborts running
handlers and releases their messages; those records are reported as failures. Lambda **throttling** (reserved
concurrency exhausted) also returns messages to the queue with their receive already counted — throttle with the event
source's `maximum_concurrency` instead (Task 9). Cold-start initialization (binding
parse, SQS client) happens once; a failure throws and Lambda retries the whole batch.

The adapter hands core one delivery per `ProcessBatch` call and decides success from the returned `SettleResult`
alone (see `succeeded` below), so it never depends on how core reports a key's leftover items. Heartbeats come from
core at `HeartbeatIntervalSeconds(policy)` = `min(LeaseSeconds / 3, 30 s)` (03 §3.2) and extend the SQS visibility;
the timeout guard fires `TimeoutSafetyMs` before the deadline regardless of where the heartbeat cycle is, and a lease
that really runs out is caught by core's independent lease-horizon timer (F4).

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
        const binding = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
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

    it('rejects an Ordered subscription: Ordered requires the Database transport', () => {
        const binding = TestSubscriptionBinding(true);
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Policy: { ...binding.Policy, PartitionMode: 'Ordered' } })))
            .toThrow('Ordered requires the Database transport');
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
import { AWS_TRANSPORT_CAPABILITIES } from '../driver/capabilities';

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

function oneOf<T extends string>(source: Raw, key: string, allowed: readonly T[], hint?: string): T {
    const value = source[key];
    const match = allowed.find((candidate) => candidate === value);
    return match ?? fail(`Policy.${key} must be one of ${allowed.join(', ')}${hint ? ` (${hint})` : ''}`);
}

function readPolicy(raw: unknown): SubscriptionPolicy {
    if (!isRecord(raw)) {
        fail('Policy must be an object');
    }
    const policy: SubscriptionPolicy = {
        SubscriptionName: str(raw, 'SubscriptionName'),
        TopicName: str(raw, 'TopicName'),
        PartitionMode: oneOf(raw, 'PartitionMode', ['None', 'Exclusive'] as const, 'Ordered requires the Database transport'),
        MaxAttempts: int(raw, 'MaxAttempts', false) ?? 0,
        BackoffBaseSeconds: int(raw, 'BackoffBaseSeconds', false) ?? 0,
        BackoffMaxSeconds: int(raw, 'BackoffMaxSeconds', false) ?? 0,
        LeaseSeconds: int(raw, 'LeaseSeconds', false) ?? 0,
        HeartbeatMode: oneOf(raw, 'HeartbeatMode', ['Auto', 'Manual'] as const),
    };
    const maxProcessing = int(raw, 'MaxProcessingSeconds', true);
    if (maxProcessing !== undefined) policy.MaxProcessingSeconds = maxProcessing;
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
    // ParseSubscriptionFilter enforces 03 §4.1 against what this transport accepts, so a filter SNS cannot express
    // fails at cold start rather than silently matching everything.
    const filter = ParseSubscriptionFilter(filterJson, AWS_TRANSPORT_CAPABILITIES.Filters);
    return { Policy: readPolicy(raw['Policy']), Filter: filter, HostType: hostType, Config: config };
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
import { CreateSqsClient } from '../gateway/sqsClient';
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

/**
 * A record leaves the batch only when SQS no longer holds it: Settled Completed (deleted) or Settled DeadLettered
 * (copied to the DLQ, then deleted). Everything else — Settled Pending (retry or release), LeaseLost, Failed, or no
 * result at all — is reported as a batch item failure so it stays on the queue. No marker strings are inspected:
 * core's ProcessBatch returns the real SettleResult of every delivery, including ones it released (03 §3.2).
 */
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
            const gateway = options.Gateway ?? new SdkSqsGateway(CreateSqsClient({ Region: region, Endpoint: null }));
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
// Checks the ./lambda entry two ways. Run after `pnpm run build` of work-queue-core and work-queue-aws.
//  1. INSPECT: bundle with the AWS SDK *included* and fail when the graph reaches @aws-sdk/client-sns or any
//     MemberJunction package other than work-queue-core. (Marking @aws-sdk/* external here would hide an SNS import,
//     which is exactly the leak this check exists to catch.)
//  2. SIZE: bundle as a consumer would (the Lambda Node.js runtime provides the SDK, so it is external) and enforce
//     the budget on our own code.
import { build } from 'esbuild';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 150 * 1024;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedRoots = [packageRoot, resolve(packageRoot, '..', 'core')].map((root) => root + sep);
const common = {
    entryPoints: [resolve(packageRoot, 'dist/lambda/index.js')],
    bundle: true, platform: 'node', target: 'node22', format: 'esm', minify: true, write: false, metafile: true,
    logLevel: 'silent', absWorkingDir: packageRoot,
};

const inspected = await build(common);
const inputs = Object.keys(inspected.metafile.inputs).map((input) => resolve(packageRoot, input));
const isOurs = (input) => allowedRoots.some((root) => input.startsWith(root)) && !input.includes(`${sep}node_modules${sep}`);
const snsLeaks = inputs.filter((input) => input.includes(`${sep}@aws-sdk${sep}client-sns${sep}`));
const mjLeaks = inputs.filter((input) => !isOurs(input)
    && (input.includes(`${sep}@memberjunction${sep}`) || (input.includes(`${sep}packages${sep}`) && !input.includes(`${sep}node_modules${sep}`))));

if (snsLeaks.length > 0) {
    console.error(`work-queue-aws/lambda reaches the SNS client (${snsLeaks.length} files), e.g.\n` + snsLeaks.slice(0, 5).join('\n'));
    process.exit(1);
}
if (mjLeaks.length > 0) {
    console.error('work-queue-aws/lambda bundle includes forbidden modules:\n' + mjLeaks.join('\n'));
    process.exit(1);
}

const sized = await build({ ...common, metafile: false, external: ['@aws-sdk/*'] });
const bytes = sized.outputFiles[0].contents.byteLength;
if (bytes > BUDGET_BYTES) {
    console.error(`work-queue-aws/lambda bundle is ${bytes} bytes; budget is ${BUDGET_BYTES}`);
    process.exit(1);
}
console.log(`work-queue-aws/lambda bundle OK: ${bytes} bytes (budget ${BUDGET_BYTES}), no SNS client, ${inputs.filter(isOurs).length} own input files`);
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
Expected: PASS — previous 118, plus bindingEnv (4), emf (1), CreateSqsLambdaHandler (7). Total 130.

Run: `cd packages/WorkQueue/core && pnpm run build && cd ../aws && pnpm run build && pnpm run check:lambda-bundle`
Expected: `work-queue-aws/lambda bundle OK: <n> bytes (budget 153600), no SNS client, <m> own input files` with `<n>` under 153,600. To see the check fail, temporarily add `import '../gateway/snsClient';` to `src/lambda/index.ts`, rebuild and re-run: it must exit 1 with "reaches the SNS client". Remove the line afterwards.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/aws pnpm-lock.yaml
git commit -m "feat(work-queue-aws): Lambda adapter with FIFO-safe partial batch failures, EMF metrics and bundle check"
```

---

### Task 8: Engine `./aws` subpath — driver factory, credentials, manifest filter policies, cloud deduplication

**Files:**
- Modify: `packages/WorkQueue/engine/package.json` (`./aws` export; dependencies `@memberjunction/work-queue-aws`, `@memberjunction/credentials`, `@aws-sdk/credential-providers`)
- Create: `packages/WorkQueue/engine/src/aws/index.ts`, `src/aws/ResolveAwsCredentials.ts`, `src/aws/AWSTransportDriverFactory.ts`, `src/aws/AwsManifestEnricher.ts`
- Create: `packages/WorkQueue/engine/src/topology/ManifestEnricherRegistry.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts` (export the registry only), `packages/WorkQueue/engine/src/WorkQueueEngine.ts` (`ExportManifest`, plan 05)
- Modify: `packages/ServerBootstrap/package.json`, `packages/ServerBootstrap/src/index.ts` (side-effect import of the subpath)
- Modify: `packages/MJCLI/src/commands/queue/export-topology.ts`, `import-bindings.ts`, `validate-bindings.ts`, `work.ts` (same side-effect import); Test: `packages/MJCLI/src/__tests__/queue-aws-registration.test.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/ResolveAwsCredentials.test.ts`, `AWSTransportDriverFactory.test.ts`, `AwsPublishCoordinator.test.ts`, `AwsManifestEnricher.test.ts`, `mainEntryGuard.test.ts`

**Interfaces:**
- Consumes:
  - Plan 05: `BaseTransportDriverFactory { Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> }` (`src/transports/BaseTransportDriverFactory.ts`); `TransportDriverDeps` (`src/transports/TransportDriverDeps.ts`, 03 §11); `TransportRow`, `TopicRow`, `SubscriptionRow` (**`@memberjunction/work-queue-base`** — imported from there directly, no re-export, F13); `ResolveTopic`, `BuildTopologyManifest`, `TopologySnapshot` (plan 05 topology helpers, in `work-queue-base`); `WorkQueuePublishCoordinator`, `PublishCoordinatorDeps`, `LedgerOperations` (`src/publish/WorkQueuePublishCoordinator.ts`); `LedgerReservation` (`src/dedup/DeduplicationLedger.ts`, 03 §11: `{ Kind: 'Reserved' } | { Kind: 'Duplicate'; OwnerMessageID } | { Kind: 'Pending'; OwnerMessageID }`); test fakes `RecordingExecutor`, `RecordingLogger`, `TestDeps`, `TRANSPORT_ROW`, `TOPIC_ROW`, `SUBSCRIPTION_ROW`.
  - `CredentialEngine` (`@memberjunction/credentials`: `Config(forceRefresh, contextUser)`, `getCredentialById(id)`, `getCredential(name, { credentialId, contextUser, subsystem })`); `BaseSingleton`, `RegisterClass`, `MJGlobal` (`@memberjunction/global`); `fromTemporaryCredentials` (`@aws-sdk/credential-providers`).
  - `AwsTransportDriver`, `ParseAwsTransportConfig`, `AwsCredentialsOption`, `SdkSnsGateway`, `SdkSqsGateway`, `SnsFilterPolicyFor` (Tasks 1–6); `FakeSnsGateway`, `FakeSqsGateway`, `TestAwsResources` (`@memberjunction/work-queue-aws/testing`).
- Produces:
  - Main entry (`@memberjunction/work-queue-engine`): `type ManifestEnricher = (manifest: TopologyManifest) => TopologyManifest`, `class ManifestEnricherRegistry extends BaseSingleton<ManifestEnricherRegistry>` — `static get Instance()`, `Register(driverClass: string, enricher: ManifestEnricher): void`, `Has(driverClass: string): boolean`, `Apply(manifest: TopologyManifest): TopologyManifest`. `WorkQueueEngine.ExportManifest(transportName)` returns `ManifestEnricherRegistry.Instance.Apply(BuildTopologyManifest(…))`.
  - Subpath (`@memberjunction/work-queue-engine/aws`, **only** from here): `AWS_DRIVER_CLASS = 'AWS'`; `interface AwsCredentialValues { AccessKeyId?; SecretAccessKey?; SessionToken?; RoleArn?; ExternalId? }`; `ToAwsCredentials(values: AwsCredentialValues, region: string): AwsCredentialsOption`; `ResolveAwsCredentials(credentialID: string | null, region: string, contextUser: UserInfo): Promise<AwsCredentialsOption>`; `@RegisterClass(BaseTransportDriverFactory, 'AWS') class AWSTransportDriverFactory`; `EnrichAwsManifest(manifest: TopologyManifest): TopologyManifest`.

**Engine loading (03 §0, F12) — the rule this task exists to keep.** The engine's **main entry never imports
`@memberjunction/work-queue-aws`**, directly or transitively. Everything AWS lives in `src/aws/` and is exported only
through the `./aws` subpath. Importing that subpath has two side effects: `@RegisterClass(BaseTransportDriverFactory,
'AWS')` and `ManifestEnricherRegistry.Instance.Register('AWS', EnrichAwsManifest)`. `src/aws/*` imports the specific
engine modules it needs (`../transports/BaseTransportDriverFactory`, `../topology/ManifestEnricherRegistry`) — never
`../index` and never `../WorkQueueEngine` — so there is no import cycle and no temporal-dead-zone hazard at load.

Who imports the subpath:

| Process | Imports `…/aws`? | Why |
| --- | --- | --- |
| `ServerBootstrap` (MJAPI) | **yes** — `import '@memberjunction/work-queue-engine/aws';` in `src/index.ts` | It publishes to and consumes from AWS topics |
| `ServerBootstrapLite`, CodeGen, MetadataSync, data providers | **no** | They must load neither the engine's AWS code nor any AWS client |
| `mj queue export-topology` / `import-bindings` / `validate-bindings` / `work` (plan 06 CLI) | **yes**, from those four command modules only (Step 7b) | They render SNS filter policies, build AWS drivers or consume AWS queues; oclif loads a command module only when that command runs, so no other CLI command pays for it |

The generated class-registration manifest does **not** do this for us: `GenerateClassRegistrationsManifest` skips a
`@RegisterClass` class that is not exported from its package's main entry (it logs "found in … source but not in
public exports"), which is exactly the case here. The explicit side-effect import is the registration.

A transport row with `DriverClass = 'AWS'` in a process that did not import the subpath has no factory: plan 05's
engine reports that as a validation **error**, never a crash (03 §0), and `ExportManifest` throws a
`WorkQueueConfigurationError` naming the missing import instead of exporting a manifest without filter policies.

**Manifest export for AWS (03 §10).** `BuildTopologyManifest` (plan 05) is transport-neutral. The AWS enricher sets
every subscription's `Aws = { SnsFilterPolicy }` (null for an unfiltered subscription) so infrastructure code never
re-translates a filter; a filter SNS cannot express (more than 150 value combinations, a field constrained twice)
makes the export throw. It also refuses an `Ordered` subscription on an AWS topic ("Ordered requires the Database
transport"), so an invalid topology never reaches Terraform. Azure (09a) registers its own enricher the same way.

**Credentials.** `Transport.CredentialID = null` uses the SDK default chain (recommended when MJAPI runs in AWS with a
task or instance role). Otherwise the MJ credential's decrypted values are either static keys (`AccessKeyId`,
`SecretAccessKey`, optional `SessionToken`) or a role to assume (`RoleArn`, optional `ExternalId`) on top of the
ambient identity — recommended for MJ running outside AWS. The assume-role provider is given
`clientConfig: { region }` from the transport configuration: outside AWS there is no `AWS_REGION`, and STS would
otherwise fail to resolve an endpoint. The provider refreshes temporary credentials itself; **static** keys are read
once per driver, so rotating them means re-saving the transport (which drops the engine's cached driver). Credential
access is audited by the Credentials engine under subsystem `WorkQueue`.

**Deduplication on AWS (03 §2.1, F1).** Plan 05's `WorkQueuePublishCoordinator` owns the ledger protocol for cloud
transports: reserve keyed requests → one `driver.Publish` → confirm accepted keys, release the rest. Only a
**`Confirmed`** ledger row is a `Duplicate`; a `Reserved` row owned by another `MessageID` is `Rejected`
`DeduplicationPending` (retryable), and one owned by the same `MessageID` is re-taken and the send repeated (the SNS
FIFO 5-minute window absorbs the double send). Plan 05 tests that with a fake driver; this task runs the coordinator
against the **real** `AwsTransportDriver` over `FakeSnsGateway`, so the FIFO deduplication ID, per-entry failure
mapping and whole-call failure paths are proven end to end.

- [ ] **Step 1: Add the engine dependencies and the `./aws` export**

In `packages/WorkQueue/engine/package.json`, add to `dependencies` (keep a single entry if one already exists):

```json
    "@aws-sdk/credential-providers": "^3.984.0",
    "@memberjunction/credentials": "6.1.0",
    "@memberjunction/work-queue-aws": "6.1.0",
```

and add the subpath to `exports` (keep the existing `.` entry):

```json
    "./aws": {
      "types": "./dist/aws/index.d.ts",
      "default": "./dist/aws/index.js"
    }
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

const assumeRole = vi.hoisted(() => vi.fn(() => async () => ({ accessKeyId: 'ASIA', secretAccessKey: 's', sessionToken: 't' })));

vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: credentialEngine } }));
vi.mock('@aws-sdk/credential-providers', () => ({ fromTemporaryCredentials: assumeRole }));

import { ResolveAwsCredentials, ToAwsCredentials } from '../aws/ResolveAwsCredentials';

const USER = { ID: 'user-1' } as UserInfo;
const CREDENTIAL_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
    credentialEngine.Config.mockClear();
    credentialEngine.getCredentialById.mockReset();
    credentialEngine.getCredential.mockReset();
});

describe('ToAwsCredentials', () => {
    it('maps static keys, with an optional session token', () => {
        expect(ToAwsCredentials({ AccessKeyId: 'AKIA', SecretAccessKey: 'secret' }, 'us-east-1')).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
        expect(ToAwsCredentials({ AccessKeyId: 'ASIA', SecretAccessKey: 's', SessionToken: 't' }, 'us-east-1')).toEqual({ accessKeyId: 'ASIA', secretAccessKey: 's', sessionToken: 't' });
    });

    it('maps a role ARN to an assume-role provider and rejects incomplete values', () => {
        expect(typeof ToAwsCredentials({ RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue', ExternalId: 'x' }, 'eu-west-2')).toBe('function');
        expect(() => ToAwsCredentials({ AccessKeyId: 'AKIA' }, 'eu-west-2')).toThrow('AccessKeyId and SecretAccessKey, or RoleArn');
    });

    it('gives the assume-role provider the transport region (no AWS_REGION outside AWS)', () => {
        ToAwsCredentials({ RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue' }, 'eu-west-2');
        expect(assumeRole).toHaveBeenLastCalledWith({
            params: { RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue', RoleSessionName: 'mj-work-queue' },
            clientConfig: { region: 'eu-west-2' },
        });
    });
});

describe('ResolveAwsCredentials', () => {
    it('uses the ambient identity when no credential is configured', async () => {
        expect(await ResolveAwsCredentials(null, 'us-east-1', USER)).toBeUndefined();
        expect(credentialEngine.Config).not.toHaveBeenCalled();
    });

    it('loads and decrypts the configured credential under the WorkQueue subsystem', async () => {
        credentialEngine.getCredentialById.mockReturnValue({ ID: CREDENTIAL_ID, Name: 'AWS Work Queue' });
        credentialEngine.getCredential.mockResolvedValue({ values: { AccessKeyId: 'AKIA', SecretAccessKey: 'secret' } });
        expect(await ResolveAwsCredentials(CREDENTIAL_ID, 'us-east-1', USER)).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
        expect(credentialEngine.Config).toHaveBeenCalledWith(false, USER);
        expect(credentialEngine.getCredential).toHaveBeenCalledWith('AWS Work Queue', { credentialId: CREDENTIAL_ID, contextUser: USER, subsystem: 'WorkQueue' });
    });

    it('fails clearly when the credential does not exist', async () => {
        credentialEngine.getCredentialById.mockReturnValue(undefined);
        await expect(ResolveAwsCredentials(CREDENTIAL_ID, 'us-east-1', USER)).rejects.toThrow(`Credential ${CREDENTIAL_ID} was not found`);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/AWSTransportDriverFactory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { AwsTransportDriver, SdkSnsGateway, SdkSqsGateway } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { AWSTransportDriverFactory } from '../aws/AWSTransportDriverFactory';
import { RecordingExecutor, TestDeps } from './fakes';

function transport(configuration: string | null): TransportRow {
    return { ...TRANSPORT_ROW_FIXTURE, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: configuration };
}

describe('AWSTransportDriverFactory', () => {
    it('is registered under the AWS driver class once its module is imported', () => {
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'AWS');
        expect(resolved.Resolved).toBe(true);
        expect(resolved.Instance).toBeInstanceOf(AWSTransportDriverFactory);
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
import { ResolveTopic, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { WorkQueuePublishCoordinator, type LedgerOperations, type PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import { RecordingExecutor, RecordingLogger } from './fakes';

const TRANSPORT_ROW = TRANSPORT_ROW_FIXTURE;
const TOPIC_ROW = TOPIC_ROW_FIXTURE;
const SUBSCRIPTION_ROW = SUBSCRIPTION_ROW_FIXTURE;
const AWS_TRANSPORT: TransportRow = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const OWNER = 'EEEEEEEE-0000-4000-8000-000000000001';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

class FakeLedger implements LedgerOperations {
    public readonly Events: string[] = [];

    public async Reserve(topicID: string, key: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        if (key === 'confirmed') return { Kind: 'Duplicate', OwnerMessageID: OWNER };   // a Confirmed row: the only duplicate (F1)
        if (key === 'in-flight') return { Kind: 'Pending', OwnerMessageID: OWNER };     // Reserved by another MessageID
        return { Kind: 'Reserved' };                                                    // new, or re-taken by the same MessageID
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
    it('sends one SNS batch with FIFO IDs, skips a confirmed key and confirms accepted keys with their TTL', async () => {
        const { coordinator, sns, ledger } = Setup();
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, PartitionKey: 'subscriber-9', DeduplicationKey: 'click:1', DeduplicationTTLSeconds: 3600, Attributes: { eventType: 'click' } },
            { MessageID: M2, DeduplicationKey: 'confirmed', Attributes: { eventType: 'click' } },
            { MessageID: M3, Attributes: { eventType: 'open' } },
        ], OPTIONS);
        expect(results.map(r => r.Status)).toEqual(['Accepted', 'Duplicate', 'Accepted']);
        expect(results[1].MessageID).toBe(OWNER);
        expect(sns.Batches).toHaveLength(1);
        expect(sns.Batches[0].Entries.map(e => [e.MessageGroupId, e.MessageDeduplicationId, e.MessageAttributes])).toEqual([
            ['subscriber-9', M1, { eventType: 'click' }],
            [M3, M3, { eventType: 'open' }],
        ]);
        expect(ledger.Events).toEqual(['reserve:click:1', 'reserve:confirmed', 'confirm:click:1:3600']);
    });

    it('does not call a reservation held by another publish a duplicate: it is retryable, and nothing is sent', async () => {
        const { coordinator, sns, ledger } = Setup();
        const results = await coordinator.Publish('email.events', [{ MessageID: M1, DeduplicationKey: 'in-flight', Attributes: { eventType: 'click' } }], OPTIONS);
        expect(results[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'DeduplicationPending', Retryable: true } });
        expect(sns.Batches).toHaveLength(0);
        expect(ledger.Events).toEqual(['reserve:in-flight']);
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

`packages/WorkQueue/engine/src/__tests__/AwsManifestEnricher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { SubscriptionRow, TopicRow, TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { AWS_DRIVER_CLASS, EnrichAwsManifest } from '../aws/AwsManifestEnricher';
import { BuildTopologyManifest } from '../topology/manifest';
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';

const AWS_TRANSPORT: TransportRow = { ...TRANSPORT_ROW_FIXTURE, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const AWS_TOPIC: TopicRow = { ...TOPIC_ROW_FIXTURE, Name: 'email.events', TransportID: AWS_TRANSPORT.ID, IsFifo: true };
const FILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW_FIXTURE, ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'email.unsubscribe', PartitionMode: 'Exclusive', HostType: 'External', HandlerKey: null, Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"unsubscribe"}]}' };
const UNFILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW_FIXTURE, ID: 'BBBBBBBB-0000-0000-0000-000000000003', Name: 'email.archive', PartitionMode: 'None', Filter: null };

function build(transportName: string, subscriptions: SubscriptionRow[]) {
    const snapshot = { Transports: [TRANSPORT_ROW_FIXTURE, AWS_TRANSPORT], Topics: [TOPIC_ROW_FIXTURE, AWS_TOPIC], Subscriptions: subscriptions };
    return BuildTopologyManifest(snapshot, transportName, new Date('2026-09-16T12:00:00Z'));
}

describe('EnrichAwsManifest', () => {
    it('renders SNS filter policies for every subscription of an AWS manifest', () => {
        const manifest = EnrichAwsManifest(build('AWS-test', [FILTERED, UNFILTERED]));
        const byName = Object.fromEntries(manifest.Topics[0].Subscriptions.map(s => [s.Name, s]));
        expect(byName['email.unsubscribe'].Aws).toEqual({ SnsFilterPolicy: '{"eventType":["unsubscribe"]}' });
        expect(byName['email.archive'].Aws).toEqual({ SnsFilterPolicy: null });
    });

    it('refuses a filter SNS cannot express', () => {
        const or = (field: string, count: number) => ({
            logic: 'or',
            filters: Array.from({ length: count }, (_, i) => ({ field, operator: 'eq', value: String(i) })),
        });
        // 6 × 6 × 5 = 180 value combinations, above the SNS limit of 150 (Task 2).
        const wide: SubscriptionRow = { ...FILTERED, Filter: JSON.stringify({ logic: 'and', filters: [or('a', 6), or('b', 6), or('c', 5)] }) };
        expect(() => EnrichAwsManifest(build('AWS-test', [wide]))).toThrow(WorkQueueConfigurationError);
    });

    it('refuses an Ordered subscription: Ordered requires the Database transport', () => {
        const ordered: SubscriptionRow = { ...UNFILTERED, PartitionMode: 'Ordered', HostType: 'MJWorker' };
        expect(() => EnrichAwsManifest(build('AWS-test', [ordered]))).toThrow('Ordered requires the Database transport');
    });
});

describe('ManifestEnricherRegistry', () => {
    it('applies the enricher registered for the manifest transport and leaves Database manifests alone', () => {
        const registry = ManifestEnricherRegistry.Instance;
        registry.Register(AWS_DRIVER_CLASS, EnrichAwsManifest);
        expect(registry.Apply(build('AWS-test', [UNFILTERED])).Topics[0].Subscriptions[0].Aws).toEqual({ SnsFilterPolicy: null });
        expect(registry.Apply(build('Database', [SUBSCRIPTION_ROW_FIXTURE])).Topics[0].Subscriptions[0].Aws).toBeUndefined();
    });

    it('names the missing import when a cloud manifest has no enricher', () => {
        const manifest = { ...build('AWS-test', [UNFILTERED]), Transport: { Name: 'Azure-test', DriverClass: 'Azure', Configuration: {} } };
        expect(() => ManifestEnricherRegistry.Instance.Apply(manifest)).toThrow("No manifest enricher is registered for DriverClass 'Azure'");
    });
});
```

`packages/WorkQueue/engine/src/__tests__/mainEntryGuard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

function resolveRelative(fromFile: string, specifier: string): string | null {
    const base = resolve(dirname(fromFile), specifier);
    return [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate)) ?? null;
}

/** Every source file reachable from `entry` through relative imports, and every bare specifier they import. */
function walk(entry: string): { Files: Set<string>; Packages: Set<string> } {
    const files = new Set<string>();
    const packages = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.pop();
        if (file === undefined || files.has(file)) continue;
        files.add(file);
        for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
            const specifier = match[2];
            if (!specifier.startsWith('.')) {
                packages.add(specifier);
                continue;
            }
            const target = resolveRelative(file, specifier);
            if (target) queue.push(target);
        }
    }
    return { Files: files, Packages: packages };
}

describe('engine main entry (03 §0, F12)', () => {
    const main = walk(join(SRC, 'index.ts'));

    it('never reaches work-queue-aws, an AWS SDK package, or src/aws', () => {
        const forbidden = [...main.Packages].filter((name) => name.startsWith('@memberjunction/work-queue-aws') || name.startsWith('@aws-sdk/'));
        expect(forbidden).toEqual([]);
        expect([...main.Files].filter((file) => file.startsWith(join(SRC, 'aws')))).toEqual([]);
    });

    it('never depends on the legacy queue or a data provider (03 §0 layering)', () => {
        const forbidden = [...main.Packages].filter((name) =>
            ['@memberjunction/queue', '@memberjunction/generic-database-provider', '@memberjunction/sqlserver-dataprovider', '@memberjunction/postgresql-dataprovider'].includes(name));
        expect(forbidden).toEqual([]);
    });

    it('the ./aws entry imports engine modules directly, never the main entry or WorkQueueEngine', () => {
        const awsEntry = walk(join(SRC, 'aws', 'index.ts'));
        expect(awsEntry.Files.has(join(SRC, 'index.ts'))).toBe(false);
        expect(awsEntry.Files.has(join(SRC, 'WorkQueueEngine.ts'))).toBe(false);
        expect(awsEntry.Packages.has('@memberjunction/work-queue-aws')).toBe(true);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test ResolveAwsCredentials AWSTransportDriverFactory AwsPublishCoordinator AwsManifestEnricher mainEntryGuard`
Expected: FAIL — unresolved imports `../aws/ResolveAwsCredentials`, `../aws/AWSTransportDriverFactory`, `../aws/AwsManifestEnricher`, `../topology/ManifestEnricherRegistry`; `mainEntryGuard` fails on the missing `src/aws/index.ts`. `AwsPublishCoordinator` needs no new code; it must pass once the others compile. If it fails, fix the defect (in `PublishToSns`, Task 4, or the coordinator, plan 05) rather than the test.

- [ ] **Step 4: Write `src/topology/ManifestEnricherRegistry.ts` (main entry) and call it from `ExportManifest`**

```typescript
import { BaseSingleton } from '@memberjunction/global';
import { WorkQueueConfigurationError, type TopologyManifest } from '@memberjunction/work-queue-core';

export type ManifestEnricher = (manifest: TopologyManifest) => TopologyManifest;

const DATABASE_DRIVER_CLASS = 'Database';

/**
 * Transport-specific manifest rendering. The main entry owns the registry; a transport's engine subpath
 * (`@memberjunction/work-queue-engine/aws`) registers its enricher as an import side effect, so the main entry never
 * imports a cloud package (03 §0, F12).
 */
export class ManifestEnricherRegistry extends BaseSingleton<ManifestEnricherRegistry> {
    private readonly enrichers = new Map<string, ManifestEnricher>();

    protected constructor() {
        super();
    }

    public static get Instance(): ManifestEnricherRegistry {
        return super.getInstance<ManifestEnricherRegistry>();
    }

    public Register(driverClass: string, enricher: ManifestEnricher): void {
        this.enrichers.set(driverClass, enricher);
    }

    public Has(driverClass: string): boolean {
        return this.enrichers.has(driverClass);
    }

    /** Database manifests pass through. A cloud manifest without its enricher is refused rather than exported half-rendered. */
    public Apply(manifest: TopologyManifest): TopologyManifest {
        const driverClass = manifest.Transport.DriverClass;
        const enricher = this.enrichers.get(driverClass);
        if (enricher) {
            return enricher(manifest);
        }
        if (driverClass === DATABASE_DRIVER_CLASS) {
            return manifest;
        }
        throw new WorkQueueConfigurationError(
            `No manifest enricher is registered for DriverClass '${driverClass}'. Import the transport's engine entry in this process ` +
            `(for AWS: import '@memberjunction/work-queue-engine/aws').`,
        );
    }
}
```

In `packages/WorkQueue/engine/src/WorkQueueEngine.ts`, add the import and replace `ExportManifest`:

```typescript
import { ManifestEnricherRegistry } from './topology/ManifestEnricherRegistry';
```

```typescript
    public ExportManifest(transportName: string): TopologyManifest {
        return ManifestEnricherRegistry.Instance.Apply(BuildTopologyManifest(this.Snapshot, transportName, new Date()));
    }
```

(`this.Snapshot` is whatever plan 05's facade uses to hand `BuildTopologyManifest` its rows; keep that expression as plan
05 wrote it and wrap only the result.)

Append to `packages/WorkQueue/engine/src/index.ts` — the **only** line this task adds to the main entry:

```typescript
export * from './topology/ManifestEnricherRegistry';
```

- [ ] **Step 5: Write `src/aws/ResolveAwsCredentials.ts`**

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

/** `region` is the transport's region: the STS client behind assume-role needs it when AWS_REGION is not set. */
export function ToAwsCredentials(values: AwsCredentialValues, region: string): AwsCredentialsOption {
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
            clientConfig: { region },
        });
    }
    throw new WorkQueueConfigurationError('AWS credential values must contain AccessKeyId and SecretAccessKey, or RoleArn');
}

/** Null credential = SDK default chain (ambient role). Otherwise decrypts the MJ credential and maps its values. */
export async function ResolveAwsCredentials(credentialID: string | null, region: string, contextUser: UserInfo): Promise<AwsCredentialsOption> {
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
    return ToAwsCredentials(resolved.values, region);
}
```

- [ ] **Step 6: Write `src/aws/AWSTransportDriverFactory.ts`, `src/aws/AwsManifestEnricher.ts` and `src/aws/index.ts`**

`packages/WorkQueue/engine/src/aws/AWSTransportDriverFactory.ts`:

```typescript
import { RegisterClass } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { AwsTransportDriver, ParseAwsTransportConfig } from '@memberjunction/work-queue-aws';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';
import { ResolveAwsCredentials } from './ResolveAwsCredentials';

/** Resolves MJ: Work Queue Transports rows with DriverClass 'AWS' to an SNS/SQS driver. Registered by importing `./aws`. */
@RegisterClass(BaseTransportDriverFactory, 'AWS')
export class AWSTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        const config = ParseAwsTransportConfig(transport.Configuration);
        const credentials = await ResolveAwsCredentials(transport.CredentialID, config.Region, deps.ContextUser);
        return AwsTransportDriver.Create(config, credentials);
    }
}
```

`packages/WorkQueue/engine/src/aws/AwsManifestEnricher.ts`:

```typescript
import { SnsFilterPolicyFor } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError, type ManifestSubscription, type TopologyManifest } from '@memberjunction/work-queue-core';

export const AWS_DRIVER_CLASS = 'AWS';

function withAwsExtension(subscription: ManifestSubscription): ManifestSubscription {
    if (subscription.Policy.PartitionMode === 'Ordered') {
        throw new WorkQueueConfigurationError(
            `Subscription '${subscription.Name}': Ordered requires the Database transport; it cannot be exported for the AWS transport`,
        );
    }
    return { ...subscription, Aws: { SnsFilterPolicy: SnsFilterPolicyFor(subscription.Filter) } };
}

/**
 * Renders what Terraform must not re-translate. SnsFilterPolicyFor throws WorkQueueConfigurationError for filters SNS
 * cannot express — more than 150 value combinations, a field constrained twice, or a mixed-field OR group (Task 2).
 */
export function EnrichAwsManifest(manifest: TopologyManifest): TopologyManifest {
    return {
        ...manifest,
        Topics: manifest.Topics.map(topic => ({ ...topic, Subscriptions: topic.Subscriptions.map(withAwsExtension) })),
    };
}
```

`packages/WorkQueue/engine/src/aws/index.ts` — the `@memberjunction/work-queue-engine/aws` entry:

```typescript
// Importing this module registers the AWS transport with the engine (03 §0, F12):
//  - @RegisterClass(BaseTransportDriverFactory, 'AWS') runs when AWSTransportDriverFactory is evaluated;
//  - the manifest enricher is registered below.
// It imports only the engine modules it needs — never '../index' or '../WorkQueueEngine' — so loading it cannot
// create an import cycle with the main entry.
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';
import { AWS_DRIVER_CLASS, EnrichAwsManifest } from './AwsManifestEnricher';

export * from './ResolveAwsCredentials';
export * from './AWSTransportDriverFactory';
export * from './AwsManifestEnricher';

ManifestEnricherRegistry.Instance.Register(AWS_DRIVER_CLASS, EnrichAwsManifest);
```

- [ ] **Step 7: Import the subpath from `ServerBootstrap`**

In `packages/ServerBootstrap/package.json`, confirm `@memberjunction/work-queue-engine` is a dependency (plan 06 adds it; add `"@memberjunction/work-queue-engine": "6.1.0"` if it is missing) and run `pnpm install` at the repository root.

In `packages/ServerBootstrap/src/index.ts`, add after the existing imports:

```typescript
// Registers the AWS work-queue transport (driver factory + manifest enricher). Deliberately NOT in
// ServerBootstrapLite: CodeGen, MetadataSync and the data providers must never load AWS clients (work-queue 03 §0).
import '@memberjunction/work-queue-engine/aws';
```

The generated `mj-class-registrations.ts` will not list `AWSTransportDriverFactory` — the manifest generator only
emits classes exported from a package's main entry — and that is expected.

- [ ] **Step 7b: Register the AWS transport in the four `mj queue` commands that need cloud drivers**

`export-topology` renders SNS filter policies; `import-bindings` and `validate-bindings` build AWS drivers;
`work` consumes AWS `MJWorker` subscriptions. The CLI boots `ServerBootstrapLite`, which never imports the subpath, so
each of these command modules imports it itself. oclif loads a command module only when that command runs, so
`mj codegen`, `mj sync`, `mj migrate` and every other `mj queue` command still load no AWS client. **Do not** add the
import to a shared CLI entry, to `commands/queue/index.ts`, or to `ServerBootstrapLite`.

Write the failing test, `packages/MJCLI/src/__tests__/queue-aws-registration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseTransportDriverFactory, ManifestEnricherRegistry } from '@memberjunction/work-queue-engine';

const QUEUE_COMMANDS = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'queue');
const AWS_IMPORT = /^import '@memberjunction\/work-queue-engine\/aws';$/m;
const NEEDS_AWS = ['export-topology', 'import-bindings', 'validate-bindings', 'work'];
const MUST_NOT = ['index', 'stats', 'backlog', 'dead-letters', 'replay', 'discard', 'partitions', 'usage'];

describe('mj queue commands and the AWS transport', () => {
    it('registers the AWS driver factory and manifest enricher when a cloud command module loads', async () => {
        await import('../commands/queue/validate-bindings');
        const factory = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'AWS');
        expect(factory.Resolved).toBe(true);
        expect(ManifestEnricherRegistry.Instance.Has('AWS')).toBe(true);
    });

    it.each(NEEDS_AWS)('%s imports the engine ./aws subpath statically', (name) => {
        expect(readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8')).toMatch(AWS_IMPORT);
    });

    it.each(MUST_NOT)('%s does not load the AWS transport', (name) => {
        expect(readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8')).not.toContain('work-queue-engine/aws');
    });
});
```

(The `await import` is test-only module loading, the same technique vitest suites in this repo use to load a module
after mocks; production code keeps static imports.)

Run: `cd packages/MJCLI && pnpm test queue-aws-registration`
Expected: FAIL — `factory.Resolved` is `false`, and the four "imports the engine ./aws subpath" cases fail.

Add this line, directly after the existing `@memberjunction/work-queue-engine` import, to each of
`packages/MJCLI/src/commands/queue/export-topology.ts`, `import-bindings.ts`, `validate-bindings.ts` and `work.ts`
(the files plan 06's CLI task creates):

```typescript
// Registers the 'AWS' transport driver factory and manifest enricher for this command only (work-queue 03 §0).
import '@memberjunction/work-queue-engine/aws';
```

Confirm `packages/MJCLI/package.json` lists `"@memberjunction/work-queue-engine": "6.1.0"` under `dependencies`
(plan 06 adds it with the `mj queue` commands); add it and run `pnpm install` at the repository root if it is missing.
pnpm resolves the `./aws` subpath's own dependencies through the engine package, so MJCLI declares nothing else.

Run: `cd packages/MJCLI && pnpm test queue-aws-registration`
Expected: PASS — 13 tests (1 registration, 4 import, 8 must-not).

Run: `cd packages/MJCLI && pnpm run build`
Expected: builds.

Manual check, against a database that has an `AWS` transport row (any region; no AWS credentials are needed to see
the difference):

Run: `pnpm exec mj queue validate-bindings --transport <aws transport name>`
Expected: the output no longer contains "no registered factory" / "No transport driver factory is registered for
DriverClass 'AWS'"; it now reports real binding issues (for an unprovisioned transport, `TopicUnbound` errors).

Run: `pnpm exec mj queue export-topology --transport <aws transport name> | grep -c SnsFilterPolicy`
Expected: one line per subscription of that transport (before this step the command failed with "No manifest enricher
is registered for DriverClass 'AWS'").

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — the engine's existing suites (including plan 05's `manifest` tests, unchanged for Database manifests) plus ResolveAwsCredentials (6), AWSTransportDriverFactory (3), AwsPublishCoordinator (4), AwsManifestEnricher (5), mainEntryGuard (3).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds; `dist/aws/index.js` and `dist/aws/index.d.ts` exist.

Run: `cd packages/WorkQueue/engine && node --input-type=module -e "await import('@memberjunction/work-queue-engine'); await import('@memberjunction/work-queue-engine/aws'); console.log('both entries load');"`
Expected: prints `both entries load`. (The authoritative check that the main entry stays AWS-free is `mainEntryGuard.test.ts`; this only proves the built entries resolve and load in either order.)

Run: `cd packages/ServerBootstrap && pnpm run build`
Expected: builds. `grep -c "work-queue-engine/aws" dist/index.js` prints `1`.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/engine packages/ServerBootstrap/package.json packages/ServerBootstrap/src/index.ts packages/MJCLI/src/commands/queue packages/MJCLI/src/__tests__/queue-aws-registration.test.ts packages/MJCLI/package.json pnpm-lock.yaml
git commit -m "feat(work-queue-engine): AWS transport behind the ./aws subpath — driver factory, credentials, manifest filter policies"
```

---

### Task 9: Terraform module `infrastructure/terraform/work-queue/aws`

**Files:**
- Create: `infrastructure/terraform/work-queue/aws/versions.tf`, `variables.tf`, `locals.tf`, `kms.tf`, `topics.tf`, `subscriptions.tf`, `lambda.tf`, `iam.tf`, `alarms.tf`, `outputs.tf`, `.tflint.hcl`, `README.md`
- Create: `infrastructure/terraform/work-queue/aws/tests/basic.tftest.hcl`, `tests/fixtures/manifest.json`, `tests/fixtures/invalid-standard-exclusive.json`, `tests/fixtures/invalid-ordered.json`, `tests/fixtures/invalid-name-collision.json`
- Create: `infrastructure/terraform/work-queue/aws/examples/basic/main.tf`, `examples/basic/manifest.json`

**Interfaces:**
- Consumes: the topology manifest (03 §10: `TopologyManifest`, `ManifestTopic`, `ManifestSubscription` including `Status` and `Aws.SnsFilterPolicy`), produced by `mj queue export-topology` (plan 06, with Task 8's enricher); the naming rule of `AwsResourceName` (Task 1); `ExpectedMaxReceiveCount` = `MaxAttempts + 5` (Task 4); the `MJ_WQ_SUBSCRIPTION` contract (Task 7).
- Produces:
  - Module inputs: `manifest_path`, `name_prefix`, `environment`, `region`, `create_kms_key`, `kms_key_arn`, `kms_key_policy_confirmed`, `lambda_consumers`, `fifo_high_throughput`, `message_retention_seconds`, `alarm_actions`, `oldest_message_age_alarm_seconds`, `tags`
  - Outputs: `binding_import` (exactly 03 §10 `BindingImport`, subscriptions carrying the Task 1 `AwsSubscriptionConfig` fields), `mjapi_policy_json`, `mj_worker_policy_json` (null without `MJWorker` subscriptions), `lambda_function_arns`, `lambda_alias_arns`, `kms_key_arn`, `external_subscriptions_without_lambda`

What the module creates, per manifest entry:

| Manifest | Resources |
| --- | --- |
| Topic | `aws_sns_topic` (FIFO when `IsFifo`; precondition: FIFO required as soon as one subscription is `Exclusive`) |
| Subscription | Dead-letter `aws_sqs_queue` + redrive-allow policy; subscription `aws_sqs_queue` (redrive `maxReceiveCount = MaxAttempts + 5`; visibility = `max(LeaseSeconds, 6 × Lambda timeout)` for Lambda consumers, else `max(LeaseSeconds, 30)`; FIFO high-throughput mode); queue policy allowing only its topic and denying non-TLS access; `aws_sns_topic_subscription` (raw delivery, `FilterPolicyScope = MessageAttributes`, the manifest's pre-rendered policy) with a **delivery-failure** dead-letter queue, so an SNS→SQS delivery that fails is kept and alarmed instead of silently dropped |
| `External` subscription listed in `lambda_consumers` | IAM role (consume its queue, send to its DLQ, logging, KMS, optional extra policy), `aws_lambda_function` (always published) with `MJ_WQ_SUBSCRIPTION`, a `live` **alias**, and an event source mapping **on the alias** with `ReportBatchItemFailures`, `batch_size = 1` on FIFO, and `enabled` driven by the subscription's `Status` |
| Every subscription | CloudWatch alarms: dead letters present; SNS delivery failures present; oldest message age; Lambda errors and throttles for Lambda consumers |
| Optional | A customer-managed KMS key whose policy already carries the SNS and CloudWatch Logs statements |

Guard rails (each a `precondition` that fails `plan`): an `Ordered` subscription is refused ("Ordered requires the
Database transport"); a standard topic with an `Exclusive` subscription is refused; two subscriptions whose names
collapse to the same queue name are refused; a filtered subscription without a rendered policy is refused; a FIFO
Lambda consumer with `batch_size ≠ 1` is refused; `lambda_consumers` keys must name `External` subscriptions; a
bring-your-own KMS key must be confirmed to carry the required key-policy statements. Queues carry
`prevent_destroy`, so removing or renaming a subscription cannot destroy a queue by accident — the procedure is in
GOVERNANCE.md (Task 10). Two `check` blocks warn without failing: an `External` subscription with no
`lambda_consumers` entry, and a consumer that sets `reserved_concurrency`.

**Why every test run is `command = plan`.** `prevent_destroy` makes the teardown of an `apply` run fail, and nothing
these tests assert needs a provider-computed value: they assert names, flags, policy counts and the module's own
locals (test assertions can reference any value available to a custom condition inside the module).

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
      "IsFifo": false,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "email.archive",
          "Filter": null,
          "Policy": { "SubscriptionName": "email.archive", "TopicName": "email.events", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "External",
          "Status": "Active",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        },
        {
          "Name": "email.dashboard",
          "Filter": { "logic": "and", "filters": [{ "logic": "or", "filters": [{ "field": "eventType", "operator": "eq", "value": "click" }, { "field": "eventType", "operator": "eq", "value": "open" }] }] },
          "Policy": { "SubscriptionName": "email.dashboard", "TopicName": "email.events", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "Status": "Active",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": "{\"eventType\":[\"click\",\"open\"]}" }
        },
        {
          "Name": "email.unsubscribe",
          "Filter": { "logic": "and", "filters": [{ "field": "eventType", "operator": "eq", "value": "unsubscribe" }] },
          "Policy": { "SubscriptionName": "email.unsubscribe", "TopicName": "email.events", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "External",
          "Status": "Active",
          "ExternalRef": "arn:aws:lambda:us-east-1:123456789012:function:suppression",
          "Aws": { "SnsFilterPolicy": "{\"eventType\":[\"unsubscribe\"]}" }
        }
      ]
    },
    {
      "Name": "email.subscriber",
      "IsFifo": true,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "email.subscriber-update",
          "Filter": null,
          "Policy": { "SubscriptionName": "email.subscriber-update", "TopicName": "email.subscriber", "PartitionMode": "Exclusive", "MaxAttempts": 3, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "External",
          "Status": "Paused",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        },
        {
          "Name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "Filter": null,
          "Policy": { "SubscriptionName": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "TopicName": "email.subscriber", "PartitionMode": "Exclusive", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "Status": "Active",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        }
      ]
    }
  ]
}
```

The 90-character subscription name exercises the shortened-name rule and must produce the same queue name as the
Task 1 unit test: `mj-wq-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ec270642.fifo`. `email.subscriber-update`
is `Paused`, so its event source mapping must come out disabled.

`infrastructure/terraform/work-queue/aws/tests/fixtures/invalid-standard-exclusive.json`:

```json
{
  "ManifestVersion": 1,
  "GeneratedAt": "2026-09-16T12:00:00.000Z",
  "Transport": { "Name": "AWS-prod", "DriverClass": "AWS", "Configuration": { "Region": "us-east-1" } },
  "Topics": [
    {
      "Name": "email.events",
      "IsFifo": false,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "email.subscriber-update",
          "Filter": null,
          "Policy": { "SubscriptionName": "email.subscriber-update", "TopicName": "email.events", "PartitionMode": "Exclusive", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "Status": "Active",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        }
      ]
    }
  ]
}
```

`infrastructure/terraform/work-queue/aws/tests/fixtures/invalid-ordered.json` (what a hand-edited manifest might
contain; MJ's own export refuses it in Task 8):

```json
{
  "ManifestVersion": 1,
  "GeneratedAt": "2026-09-16T12:00:00.000Z",
  "Transport": { "Name": "AWS-prod", "DriverClass": "AWS", "Configuration": { "Region": "us-east-1" } },
  "Topics": [
    {
      "Name": "integration.batch-ready",
      "IsFifo": true,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "integration.apply",
          "Filter": null,
          "Policy": { "SubscriptionName": "integration.apply", "TopicName": "integration.batch-ready", "PartitionMode": "Ordered", "MaxAttempts": 3, "BackoffBaseSeconds": 60, "BackoffMaxSeconds": 1800, "LeaseSeconds": 300, "HeartbeatMode": "Manual" },
          "HostType": "MJWorker",
          "Status": "Active",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        }
      ]
    }
  ]
}
```

`infrastructure/terraform/work-queue/aws/tests/fixtures/invalid-name-collision.json` (`a.b` and `a-b` both slug to `a-b`):

```json
{
  "ManifestVersion": 1,
  "GeneratedAt": "2026-09-16T12:00:00.000Z",
  "Transport": { "Name": "AWS-prod", "DriverClass": "AWS", "Configuration": { "Region": "us-east-1" } },
  "Topics": [
    {
      "Name": "email.events",
      "IsFifo": false,
      "MaxPayloadBytes": 262144,
      "Subscriptions": [
        {
          "Name": "a.b",
          "Filter": null,
          "Policy": { "SubscriptionName": "a.b", "TopicName": "email.events", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "Status": "Active",
          "ExternalRef": null,
          "Aws": { "SnsFilterPolicy": null }
        },
        {
          "Name": "a-b",
          "Filter": null,
          "Policy": { "SubscriptionName": "a-b", "TopicName": "email.events", "PartitionMode": "None", "MaxAttempts": 5, "BackoffBaseSeconds": 10, "BackoffMaxSeconds": 900, "LeaseSeconds": 60, "HeartbeatMode": "Auto" },
          "HostType": "MJWorker",
          "Status": "Active",
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
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
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
    "email.subscriber-update" = {
      s3_bucket           = "mj-artifacts"
      s3_key              = "work-queue/email-subscriber-update/7be1d2aa.zip"
      timeout_seconds     = 30
      maximum_concurrency = 50
    }
  }
}

run "names_flags_and_margins" {
  command = plan

  assert {
    condition     = aws_sns_topic.this["email.events"].name == "mj-wq-prod-email-events"
    error_message = "Standard topic name does not follow the naming rule."
  }
  assert {
    condition     = aws_sns_topic.this["email.subscriber"].name == "mj-wq-prod-email-subscriber.fifo" && aws_sns_topic.this["email.subscriber"].fifo_topic
    error_message = "FIFO topic name or flag is wrong."
  }
  assert {
    condition     = aws_sqs_queue.subscription["email.unsubscribe"].name == "mj-wq-prod-email-unsubscribe"
    error_message = "Standard queue name does not match AwsResourceName."
  }
  assert {
    condition     = aws_sqs_queue.dead_letter["email.subscriber-update"].name == "mj-wq-prod-email-subscriber-update-dlq.fifo"
    error_message = "FIFO dead-letter queue name does not match AwsResourceName."
  }
  assert {
    condition     = aws_sqs_queue.subscription["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].name == "mj-wq-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ec270642.fifo"
    error_message = "Shortened queue name does not match AwsResourceName."
  }
  assert {
    condition     = local.max_receive_count["email.unsubscribe"] == 10 && local.max_receive_count["email.subscriber-update"] == 8
    error_message = "Redrive must be MaxAttempts + 5 for every queue."
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
    condition     = length(aws_sqs_queue.delivery_failure) == 5 && aws_sqs_queue.delivery_failure["email.subscriber-update"].fifo_queue
    error_message = "Every SNS subscription needs a delivery-failure queue of the same type as its topic."
  }
  assert {
    condition     = length(output.binding_import.Topics) == 2 && length(output.binding_import.Subscriptions) == 5 && output.binding_import.ManifestVersion == 1
    error_message = "binding_import must list every topic and subscription."
  }
}

run "lambda_consumers_are_fifo_safe_and_pausable" {
  command = plan

  assert {
    condition     = length(aws_lambda_function.consumer) == 2 && alltrue([for f in aws_lambda_function.consumer : f.publish])
    error_message = "Only External subscriptions listed in lambda_consumers get a function, and every function publishes versions."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.consumer["email.subscriber-update"].batch_size == 1 && aws_lambda_event_source_mapping.consumer["email.archive"].batch_size == 10
    error_message = "FIFO event sources default to batch_size 1; standard queues to 10."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.consumer["email.archive"].enabled && !aws_lambda_event_source_mapping.consumer["email.subscriber-update"].enabled
    error_message = "A Paused or Disabled subscription must disable its event source mapping."
  }
  assert {
    condition     = contains(tolist(aws_lambda_event_source_mapping.consumer["email.archive"].function_response_types), "ReportBatchItemFailures")
    error_message = "The event source mapping must report batch item failures."
  }
  assert {
    condition     = aws_lambda_alias.live["email.archive"].name == "live"
    error_message = "Each consumer needs a 'live' alias for the event source and for rollback."
  }
  assert {
    condition     = jsondecode(local.subscriptions["email.archive"].policy_json).SubscriptionName == "email.archive"
    error_message = "MJ_WQ_SUBSCRIPTION must carry the subscription's policy."
  }
}

run "rejects_exclusive_subscription_on_standard_topic" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-standard-exclusive.json"
    lambda_consumers = {}
  }
  expect_failures = [aws_sns_topic.this]
}

run "rejects_ordered_subscriptions" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-ordered.json"
    lambda_consumers = {}
  }
  expect_failures = [aws_sqs_queue.subscription]
}

run "rejects_colliding_queue_names" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-name-collision.json"
    lambda_consumers = {}
  }
  expect_failures = [terraform_data.name_uniqueness]
}

run "rejects_batching_on_a_fifo_event_source" {
  command = plan
  variables {
    lambda_consumers = {
      "email.subscriber-update" = {
        s3_bucket  = "mj-artifacts"
        s3_key     = "work-queue/email-subscriber-update/7be1d2aa.zip"
        batch_size = 10
      }
    }
  }
  expect_failures = [aws_lambda_event_source_mapping.consumer]
}

run "rejects_lambda_consumer_for_mj_worker_subscription" {
  command = plan
  variables {
    lambda_consumers = {
      "email.dashboard" = {
        s3_bucket = "mj-artifacts"
        s3_key    = "work-queue/email-dashboard/1.zip"
      }
    }
  }
  expect_failures = [terraform_data.lambda_consumer_keys]
}

run "rejects_an_unconfirmed_customer_key" {
  command = plan
  variables {
    kms_key_arn = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  }
  expect_failures = [terraform_data.kms_key_policy]
}

run "creates_a_key_with_the_service_statements" {
  command = plan
  variables {
    create_kms_key = true
  }
  assert {
    condition     = length(aws_kms_key.this) == 1 && aws_kms_key.this[0].enable_key_rotation
    error_message = "create_kms_key must create one rotating key."
  }
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
  description = "AWS region the provider deploys into; written into each subscription binding and the KMS key policy."
  type        = string
}

variable "create_kms_key" {
  description = "Create a customer managed key whose policy already allows SNS delivery and CloudWatch Logs. Mutually exclusive with kms_key_arn."
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "Bring-your-own customer managed key for SNS, SQS, Lambda and log encryption. Null (and create_kms_key = false) uses SQS-managed SSE and no SNS encryption."
  type        = string
  default     = null
}

variable "kms_key_policy_confirmed" {
  description = "Set true only after confirming the bring-your-own key's policy carries the two service statements listed in the module README. Without them SNS accepts publishes and delivers nothing, and log-group creation fails."
  type        = bool
  default     = false
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
    batch_size           = optional(number) # default: 1 on FIFO queues, 10 on standard queues
    maximum_concurrency  = optional(number) # event-source concurrency: the supported way to throttle
    reserved_concurrency = optional(number) # discouraged: throttled invocations burn receives (see README)
    alias_version        = optional(string) # pin the 'live' alias to an earlier version to roll back
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

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.batch_size == null ? true : (c.batch_size >= 1 && c.batch_size <= 10)])
    error_message = "batch_size must be between 1 and 10 (larger standard-queue batches need a batching window this module does not configure)."
  }

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.maximum_concurrency == null ? true : c.maximum_concurrency >= 2])
    error_message = "maximum_concurrency must be at least 2 (the event source mapping minimum). Omit it for unbounded scaling."
  }
}

variable "fifo_high_throughput" {
  description = "Use per-message-group deduplication and throughput limits on FIFO queues and topics."
  type        = bool
  default     = true
}

variable "message_retention_seconds" {
  description = "Retention for subscription queues. Dead-letter and delivery-failure queues always keep messages for 14 days."
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

- [ ] **Step 5: Write `locals.tf` and `kms.tf`**

`infrastructure/terraform/work-queue/aws/locals.tf`:

```hcl
locals {
  manifest = jsondecode(file(var.manifest_path))
  base     = "${var.name_prefix}-${var.environment}"

  topics = {
    for t in local.manifest.Topics : t.Name => {
      name    = t.Name
      is_fifo = t.IsFifo
      slug    = trim(replace(replace(lower(t.Name), "/[^a-z0-9_-]/", "-"), "/-+/", "-"), "-")
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
        status            = try(s.Status, "Active")
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
  # SNS -> SQS delivery failures (not an MJ dead-letter queue; MJ never reads it).
  delivery_failure_queue_names = {
    for k, s in local.subscriptions : k => (
      length("${local.base}-${s.slug}-snsdlq${local.fifo_suffix[k]}") <= 80
      ? "${local.base}-${s.slug}-snsdlq${local.fifo_suffix[k]}"
      : "${substr("${local.base}-${s.slug}", 0, 80 - 7 - length(local.fifo_suffix[k]) - 9)}-${substr(sha1(s.name), 0, 8)}-snsdlq${local.fifo_suffix[k]}"
    )
  }

  # Distinct names can slug to one queue name ('a.b' and 'a-b', or 'x-dlq' and the DLQ of 'x'). SQS CreateQueue with
  # identical attributes returns the existing queue, so two Terraform resources would silently own one queue.
  all_queue_names = concat(values(local.queue_names), values(local.dead_letter_queue_names), values(local.delivery_failure_queue_names))

  lambda_subscriptions = {
    for k, s in local.subscriptions : k => s if s.host_type == "External" && contains(keys(var.lambda_consumers), k)
  }
  mj_worker_subscriptions = { for k, s in local.subscriptions : k => s if s.host_type == "MJWorker" }

  # 03 section 5.1 (F5): the runtime dead-letters at MaxAttempts, the consumer's receive-time guard at MaxAttempts + 2,
  # and this redrive policy is the crash-loop backstop behind both. Same value as ExpectedMaxReceiveCount (Task 4).
  max_receive_count = { for k, s in local.subscriptions : k => s.max_attempts + 5 }
  visibility_timeout_seconds = {
    for k, s in local.subscriptions : k => min(43200, (
      contains(keys(local.lambda_subscriptions), k)
      ? max(s.lease_seconds, 6 * var.lambda_consumers[k].timeout_seconds)
      : max(s.lease_seconds, 30)
    ))
  }
  # One message per invocation on FIFO queues: a larger batch hands the function several messages of one key, and
  # every follower released after a head failure burns a receive it never used.
  esm_batch_size = {
    for k, s in local.lambda_subscriptions : k => coalesce(var.lambda_consumers[k].batch_size, s.is_fifo ? 1 : 10)
  }

  kms_key_arn = var.create_kms_key ? aws_kms_key.this[0].arn : var.kms_key_arn
  common_tags = merge(var.tags, { "mj-work-queue-environment" = var.environment })
}

resource "terraform_data" "name_uniqueness" {
  input = length(local.all_queue_names)

  lifecycle {
    precondition {
      condition     = length(distinct(local.all_queue_names)) == length(local.all_queue_names)
      error_message = "Two subscriptions resolve to the same SQS queue name (names differing only in '.', '-' or case, or a name ending in '-dlq'/'-snsdlq' that shadows another subscription's queue). Rename one subscription in MJ."
    }
  }
}
```

`infrastructure/terraform/work-queue/aws/kms.tf`:

```hcl
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "terraform_data" "kms_key_policy" {
  input = var.kms_key_arn

  lifecycle {
    precondition {
      condition     = !(var.create_kms_key && var.kms_key_arn != null)
      error_message = "Set create_kms_key or kms_key_arn, not both."
    }
    precondition {
      condition     = var.kms_key_arn == null || var.kms_key_policy_confirmed
      error_message = "kms_key_arn is set but kms_key_policy_confirmed is false. The key policy must allow (1) sns.amazonaws.com: kms:GenerateDataKey* and kms:Decrypt, or SNS accepts publishes and delivers nothing to the encrypted queues; and (2) logs.${var.region}.amazonaws.com: kms:Encrypt*, kms:Decrypt*, kms:ReEncrypt*, kms:GenerateDataKey*, kms:Describe* for the /aws/lambda/${var.name_prefix}-${var.environment}-* log groups, or log-group creation fails. Add them (see the module README), then set kms_key_policy_confirmed = true — or use create_kms_key = true."
    }
  }
}

data "aws_iam_policy_document" "kms" {
  count = var.create_kms_key ? 1 : 0

  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowSnsToDeliverToEncryptedQueues"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
  }

  statement {
    sid       = "AllowCloudWatchLogsForConsumerLogGroups"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${data.aws_partition.current.partition}:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.base}-*"]
    }
  }
}

resource "aws_kms_key" "this" {
  count = var.create_kms_key ? 1 : 0

  description         = "MJ work queue ${local.base}: SNS topics, SQS queues, consumer functions and log groups"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.kms[0].json
  tags                = local.common_tags
}

resource "aws_kms_alias" "this" {
  count = var.create_kms_key ? 1 : 0

  name          = "alias/${local.base}-work-queue"
  target_key_id = aws_kms_key.this[0].key_id
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
  # High-throughput FIFO: throughput quota per message group rather than per topic (verify the attribute name
  # against the pinned provider version; it pairs with the queues' perMessageGroupId limit below).
  fifo_throughput_scope = each.value.is_fifo && var.fifo_high_throughput ? "MessageGroup" : null
  kms_master_key_id     = local.kms_key_arn
  tags                  = local.common_tags

  lifecycle {
    precondition {
      condition     = each.value.is_fifo || length([for s in values(local.subscriptions) : s.name if s.topic == each.key && s.partition_mode == "Exclusive"]) == 0
      error_message = "Topic '${each.key}' must be FIFO (IsFifo = true): it has an Exclusive subscription (plan 03 W7). A FIFO topic makes every queue on it FIFO; use the two-topic pattern for firehoses (plan 11 section 4)."
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
  kms_master_key_id         = local.kms_key_arn
  sqs_managed_sse_enabled   = local.kms_key_arn == null ? true : null
  tags                      = local.common_tags

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [terraform_data.name_uniqueness, terraform_data.kms_key_policy]
}

# SNS -> SQS delivery failures (queue policy or KMS problems). Without it SNS drops what it cannot deliver.
resource "aws_sqs_queue" "delivery_failure" {
  for_each = local.subscriptions

  name                      = local.delivery_failure_queue_names[each.key]
  fifo_queue                = each.value.is_fifo
  message_retention_seconds = 1209600
  max_message_size          = 262144
  kms_master_key_id         = local.kms_key_arn
  sqs_managed_sse_enabled   = local.kms_key_arn == null ? true : null
  tags                      = local.common_tags

  depends_on = [terraform_data.name_uniqueness, terraform_data.kms_key_policy]
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
  kms_master_key_id          = local.kms_key_arn
  sqs_managed_sse_enabled    = local.kms_key_arn == null ? true : null
  tags                       = local.common_tags

  # Crash-loop backstop only: the runtime dead-letters at MaxAttempts and the consumer's receive-time guard at
  # MaxAttempts + 2 (plan 03 section 5.1). Release on shutdown and Lambda throttling consume receives too.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[each.key].arn
    maxReceiveCount     = local.max_receive_count[each.key]
  })

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = each.value.partition_mode != "Ordered"
      error_message = "Subscription '${each.key}' is Ordered. Ordered requires the Database transport: move its topic to the Database transport in MJ and re-export the manifest (plan 11, S2)."
    }
  }

  depends_on = [terraform_data.name_uniqueness, terraform_data.kms_key_policy]
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

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.subscription[each.key].arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "subscription" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.subscription[each.key].id
  policy    = data.aws_iam_policy_document.queue[each.key].json
}

data "aws_iam_policy_document" "delivery_failure_queue" {
  for_each = local.subscriptions

  statement {
    sid       = "AllowOwnTopicDeliveryFailures"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.delivery_failure[each.key].arn]

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

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.delivery_failure[each.key].arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "delivery_failure" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.delivery_failure[each.key].id
  policy    = data.aws_iam_policy_document.delivery_failure_queue[each.key].json
}

data "aws_iam_policy_document" "dead_letter_queue" {
  for_each = local.subscriptions

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.dead_letter[each.key].arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "dead_letter" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.dead_letter[each.key].id
  policy    = data.aws_iam_policy_document.dead_letter_queue[each.key].json
}

resource "aws_sns_topic_subscription" "this" {
  for_each = local.subscriptions

  topic_arn            = aws_sns_topic.this[each.value.topic].arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.subscription[each.key].arn
  raw_message_delivery = true
  filter_policy        = each.value.sns_filter_policy
  filter_policy_scope  = each.value.sns_filter_policy == null ? null : "MessageAttributes"
  redrive_policy       = jsonencode({ deadLetterTargetArn = aws_sqs_queue.delivery_failure[each.key].arn })

  depends_on = [aws_sqs_queue_policy.subscription, aws_sqs_queue_policy.delivery_failure]

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

An SNS subscription only receives messages published **after** it exists. A subscription added to a live topic
therefore misses everything published before its `apply` — see GOVERNANCE.md ("Adding a subscription").

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

  # MJ_WQ_SUBSCRIPTION freezes the subscription's policy at apply time. Changing MaxAttempts, backoff or the filter in
  # MJ without a new export + apply is drift (GOVERNANCE.md); 'mj queue validate-bindings' warns about it.
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
  # Needs the CloudWatch Logs statement in the key policy (kms.tf creates it; bring-your-own keys must confirm it).
  kms_key_id = local.kms_key_arn
  tags       = local.common_tags

  depends_on = [terraform_data.kms_key_policy]
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
    for_each = local.kms_key_arn == null ? [] : [local.kms_key_arn]

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
  publish                        = true # every apply that changes code or configuration publishes an immutable version
  kms_key_arn                    = local.kms_key_arn
  tags                           = local.common_tags

  environment {
    variables = merge(var.lambda_consumers[each.key].environment, {
      MJ_WQ_SUBSCRIPTION = local.subscription_binding_json[each.key]
      NODE_OPTIONS       = "--enable-source-maps"
    })
  }

  depends_on = [aws_cloudwatch_log_group.consumer, aws_iam_role_policy.consumer]
}

# The event source targets this alias, never $LATEST: a rollback is moving the alias (alias_version), not a redeploy.
resource "aws_lambda_alias" "live" {
  for_each = local.lambda_subscriptions

  name             = "live"
  function_name    = aws_lambda_function.consumer[each.key].function_name
  function_version = coalesce(var.lambda_consumers[each.key].alias_version, aws_lambda_function.consumer[each.key].version)
}

resource "aws_lambda_event_source_mapping" "consumer" {
  for_each = local.lambda_subscriptions

  event_source_arn        = aws_sqs_queue.subscription[each.key].arn
  function_name           = aws_lambda_alias.live[each.key].arn
  batch_size              = local.esm_batch_size[each.key]
  function_response_types = ["ReportBatchItemFailures"]
  # Pausing or disabling a subscription in MJ pauses its Lambda: the manifest carries Status (plan 03 section 10).
  enabled = each.value.status == "Active"

  dynamic "scaling_config" {
    for_each = var.lambda_consumers[each.key].maximum_concurrency == null ? [] : [var.lambda_consumers[each.key].maximum_concurrency]

    content {
      maximum_concurrency = scaling_config.value
    }
  }

  lifecycle {
    precondition {
      condition     = !each.value.is_fifo || local.esm_batch_size[each.key] == 1
      error_message = "Subscription '${each.key}' is on a FIFO queue, so its event source must use batch_size = 1 (plan 03 section 5.1): a larger batch hands the function several messages of one key, and followers released after a head failure burn receives they never used. Scale with maximum_concurrency instead."
    }
  }
}

check "reserved_concurrency_is_discouraged" {
  assert {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.reserved_concurrency == null])
    error_message = "A lambda consumer sets reserved_concurrency. Throttled invocations return their messages to the queue with the receive already counted, which can dead-letter messages that never ran. Throttle with maximum_concurrency (event source scaling) instead."
  }
}

check "external_subscriptions_have_a_consumer" {
  assert {
    condition     = length([for k, s in local.subscriptions : k if s.host_type == "External" && !contains(keys(var.lambda_consumers), k)]) == 0
    error_message = "At least one External subscription has no lambda_consumers entry (see output external_subscriptions_without_lambda). That is fine when its consumer is deployed elsewhere; otherwise its queue will only fill."
  }
}
```

Sizing notes. `MJ_WQ_SUBSCRIPTION` is well under Lambda's 4 KB environment limit for typical policies and filters
(verify against current Lambda quotas). The visibility timeout follows AWS's guidance for SQS event sources (at least
6 × the function timeout); the consumer then keeps it fresh from its heartbeat, whose interval is
`min(LeaseSeconds / 3, 30 s)` (core `HeartbeatIntervalSeconds`, 03 §3.2) — so a consumer's `timeout_seconds` must
exceed 30 s plus the adapter's 10 s safety margin for a heartbeat ever to fire; shorter functions rely on the initial
visibility alone, which the 6× rule already covers. The consumer bundle does not have to include `@aws-sdk/*`: the
Lambda Node.js runtime provides the SDK v3 clients.

- [ ] **Step 8: Write `iam.tf`, `alarms.tf` and `outputs.tf`**

`infrastructure/terraform/work-queue/aws/iam.tf` — policy documents the platform team attaches to the MJAPI and
MJ worker roles (the module does not own those roles):

```hcl
locals {
  topic_arns                  = [for t in aws_sns_topic.this : t.arn]
  all_queue_arns              = [for q in aws_sqs_queue.subscription : q.arn]
  all_dlq_arns                = [for q in aws_sqs_queue.dead_letter : q.arn]
  subscription_arns           = [for s in aws_sns_topic_subscription.this : s.arn]
  mj_worker_queue_arns        = [for k, s in local.mj_worker_subscriptions : aws_sqs_queue.subscription[k].arn]
  mj_worker_dlq_arns          = [for k, s in local.mj_worker_subscriptions : aws_sqs_queue.dead_letter[k].arn]
  mj_worker_topic_arns        = distinct([for k, s in local.mj_worker_subscriptions : aws_sns_topic.this[s.topic].arn])
  mj_worker_subscription_arns = [for k, s in local.mj_worker_subscriptions : aws_sns_topic_subscription.this[k].arn]
}

# MJAPI: publish (REST + in-process), binding validation, and the operator remote operations
# (stats, dead-letter scan/replay/discard).
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
    for_each = local.kms_key_arn == null ? [] : [local.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}

# MJ workers: consume MJWorker subscription queues, write their dead letters, and run the read-only binding
# validation the host performs at start (sns:Get* on their own topics and subscriptions, sqs:GetQueueAttributes).
data "aws_iam_policy_document" "mj_worker" {
  count = length(local.mj_worker_subscriptions) > 0 ? 1 : 0

  statement {
    sid       = "ConsumeWorkerQueues"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = local.mj_worker_queue_arns
  }

  statement {
    sid       = "WriteAndInspectWorkerDeadLetters"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = local.mj_worker_dlq_arns
  }

  statement {
    sid       = "ValidateWorkerTopics"
    actions   = ["sns:GetTopicAttributes"]
    resources = local.mj_worker_topic_arns
  }

  statement {
    sid       = "ValidateWorkerSubscriptions"
    actions   = ["sns:GetSubscriptionAttributes"]
    resources = local.mj_worker_subscription_arns
  }

  dynamic "statement" {
    for_each = local.kms_key_arn == null ? [] : [local.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}
```

`infrastructure/terraform/work-queue/aws/alarms.tf`:

```hcl
resource "aws_cloudwatch_metric_alarm" "dead_letters" {
  for_each = local.subscriptions

  alarm_name          = "${local.dead_letter_queue_names[each.key]}-has-messages"
  alarm_description   = "Dead letters waiting for subscription '${each.key}'. List with 'mj queue dead-letters --subscription ${each.key}' (scans up to 100; reason 'RedrivePolicy' means a crash loop). Replay one with 'mj queue replay'; for a bulk redrive use 'aws sqs start-message-move-task' on ${local.dead_letter_queue_names[each.key]}."
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

resource "aws_cloudwatch_metric_alarm" "delivery_failures" {
  for_each = local.subscriptions

  alarm_name          = "${local.delivery_failure_queue_names[each.key]}-has-messages"
  alarm_description   = "SNS could not deliver to the queue of subscription '${each.key}' (queue policy or KMS key policy). MemberJunction cannot see this queue: inspect it in the SQS console or with 'aws sqs receive-message', fix the policy, then move the messages back with 'aws sqs start-message-move-task'."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.delivery_failure[each.key].name }
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
  alarm_description   = "Oldest message for subscription '${each.key}' is older than ${var.oldest_message_age_alarm_seconds} seconds. Check 'mj queue stats --subscription ${each.key}', the consumer's errors/throttles alarms, and whether the subscription is Paused (its Lambda event source is then disabled)."
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
  alarm_description   = "Consumer of '${each.key}' is being throttled. Every throttled invocation burns a receive of its messages; raise account concurrency or lower maximum_concurrency on the event source, and remove reserved_concurrency."
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
  description = "IAM policy JSON for MJ worker roles consuming MJWorker subscriptions. Null when the manifest has none (IAM rejects statements with no resources)."
  value       = length(local.mj_worker_subscriptions) > 0 ? data.aws_iam_policy_document.mj_worker[0].json : null
}

output "lambda_function_arns" {
  description = "Consumer functions by subscription name."
  value       = { for k, f in aws_lambda_function.consumer : k => f.arn }
}

output "lambda_alias_arns" {
  description = "The 'live' alias each event source invokes, by subscription name."
  value       = { for k, a in aws_lambda_alias.live : k => a.arn }
}

output "kms_key_arn" {
  description = "The key in use: the module-created key, the bring-your-own key, or null."
  value       = local.kms_key_arn
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
  source         = "../../infrastructure/terraform/work-queue/aws"
  manifest_path  = "${path.module}/manifest.json"   # mj queue export-topology --transport AWS-prod > manifest.json
  name_prefix    = "mj-wq"
  environment    = "prod"
  region         = "us-east-1"
  create_kms_key = true
  alarm_actions  = [aws_sns_topic.ops_alerts.arn]

  lambda_consumers = {
    "email.unsubscribe" = {
      s3_bucket           = "acme-artifacts"
      s3_key              = "work-queue/email-unsubscribe/3f2a9c1d.zip"
      timeout_seconds     = 60
      maximum_concurrency = 50
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

Attach `mjapi_policy_json` to the MJAPI role and `mj_worker_policy_json` (when not null) to MJ worker roles.

## Encryption

| Setting | Result |
| --- | --- |
| neither | SQS-managed SSE on queues; SNS topics unencrypted |
| `create_kms_key = true` | The module creates a rotating customer managed key whose policy already allows SNS delivery and CloudWatch Logs |
| `kms_key_arn` + `kms_key_policy_confirmed = true` | Your key. **Its policy must contain both statements below**, or SNS accepts publishes and delivers nothing, and log-group creation fails |

```json
{ "Sid": "AllowSnsToDeliverToEncryptedQueues", "Effect": "Allow", "Principal": { "Service": "sns.amazonaws.com" },
  "Action": ["kms:GenerateDataKey*", "kms:Decrypt"], "Resource": "*" }
{ "Sid": "AllowCloudWatchLogsForConsumerLogGroups", "Effect": "Allow", "Principal": { "Service": "logs.<region>.amazonaws.com" },
  "Action": ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"], "Resource": "*",
  "Condition": { "ArnLike": { "kms:EncryptionContext:aws:logs:arn": "arn:aws:logs:<region>:<account>:log-group:/aws/lambda/<name_prefix>-<environment>-*" } } }
```

## Rules the module enforces

| Rule | Where |
| --- | --- |
| A topic with an `Exclusive` subscription is FIFO | `aws_sns_topic.this` precondition |
| `Ordered` subscriptions are refused — Ordered requires the Database transport | `aws_sqs_queue.subscription` precondition |
| No two subscriptions resolve to the same queue name | `terraform_data.name_uniqueness` precondition |
| `lambda_consumers` keys are `External` subscriptions | `terraform_data.lambda_consumer_keys` precondition |
| A bring-your-own KMS key is confirmed to carry the service statements | `terraform_data.kms_key_policy` precondition |
| Redrive after `MaxAttempts + 5` receives (runtime dead-letters at `MaxAttempts`, receive-time guard at `+ 2`) | `aws_sqs_queue.subscription` |
| Raw message delivery, a `MessageAttributes` filter policy rendered by MJ, and an SNS delivery-failure queue | `aws_sns_topic_subscription.this` |
| FIFO event sources use `batch_size = 1`; scale with `maximum_concurrency` (≥ 2), not reserved concurrency | `aws_lambda_event_source_mapping.consumer` precondition; `check` warning |
| The event source invokes the `live` alias and is disabled when the subscription is `Paused`/`Disabled` | `lambda.tf` |
| Lambda visibility timeout ≥ 6 × function timeout | `locals.tf` |
| Queues cannot be destroyed by a plan | `prevent_destroy` on `aws_sqs_queue.subscription` and `.dead_letter` |
| TLS only | `DenyInsecureTransport` on every queue policy |

Resource names follow `AwsResourceName` in `@memberjunction/work-queue-aws`; renaming or removing a subscription would
replace its queues, which `prevent_destroy` blocks — follow GOVERNANCE.md ("Destructive changes").
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
  # (the export renders Aws.SnsFilterPolicy and Status for every subscription; never hand-edit filters here)
  manifest_path  = "${path.module}/manifest.json"
  name_prefix    = "mj-wq"
  environment    = "dev"
  region         = "us-east-1"
  create_kms_key = true

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
Expected: `tests/basic.tftest.hcl... pass` for all nine runs and `Success! 9 passed, 0 failed.` The two `check` blocks may print warnings for the fixture (`email.unsubscribe` has no Lambda here); warnings do not fail a run.

Run: `cd examples/basic && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

If an assertion reports an unknown value at plan time (mock-provider behavior differs by Terraform version — verify
with the version you pin), assert the module local that feeds the attribute instead (as the redrive and policy
assertions already do); do not switch the run to `apply` — `prevent_destroy` makes an apply run's teardown fail.
If `fifo_throughput_scope` is not an argument of `aws_sns_topic` in the pinned provider, remove that one line and
note it in the module README (the queue-side high-throughput settings still apply).

- [ ] **Step 11: Commit**

```bash
git add infrastructure/terraform/work-queue/aws
git commit -m "feat(work-queue): manifest-driven Terraform module for the AWS transport"
```

---

### Task 10: Deployment governance runbook, gated pipeline, drift job and CI workflow

**Files:**
- Create: `infrastructure/terraform/work-queue/aws/GOVERNANCE.md`
- Create: `infrastructure/terraform/work-queue/aws/scripts/check-destructive-plan.mjs`, `scripts/fixtures/plan-safe.json`, `scripts/fixtures/plan-destructive.json`
- Create: `infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml`, `examples/drift.github-actions.yml`
- Create: `.github/workflows/work-queue-aws.yml`

**Interfaces:**
- Consumes: the module and its outputs (Task 9); `check:lambda-bundle` (Task 7); plan 06's CLI commands `mj queue export-topology --transport <name>`, `mj queue import-bindings <file>`, `mj queue validate-bindings --transport <name>`, `mj queue dead-letters`, `mj queue replay`, `mj queue discard`, `mj queue stats`; `.github/actions/mj-setup` (repository composite action: pnpm, Node, frozen install).
- Produces: the change process for SNS, SQS and Lambda resources; `check-destructive-plan.mjs` (`node check-destructive-plan.mjs <plan.json> [--allow-destructive]`, exit 1 on an unapproved destructive plan); a repository workflow `Work Queue AWS` with jobs `terraform-module`, `plan-gate` and `lambda-bundle`; an example deployment pipeline and an example drift job for the repository that owns an environment's infrastructure.

**What "governed" means here — four controls the pipeline enforces, not describes:**

| Control | Enforcement |
| --- | --- |
| Destructive changes are gated | `check-destructive-plan.mjs` **fails** the job when a plan deletes or replaces a topic, queue, queue policy, SNS subscription, event source mapping, function, alias or key — unless the PR carries the label `work-queue-destructive-approved` |
| Queues cannot be destroyed by a plan at all | `prevent_destroy` (Task 9). Deleting a queue is a deliberate out-of-band step recorded in the PR |
| What is applied is what was reviewed | The apply job downloads the **saved plan file** produced by the plan job of the same run and applies exactly that; approval happens at the environment gate, where the plan is shown. `terraform apply` refuses a saved plan if state moved since it was made |
| Drift is detected | A scheduled `terraform plan -detailed-exitcode` per environment fails and notifies on exit code 2 |

- [ ] **Step 1: Write the gate script and its fixtures**

`infrastructure/terraform/work-queue/aws/scripts/check-destructive-plan.mjs`:

```javascript
// Fails (exit 1) when a Terraform plan deletes or replaces a resource that holds or routes messages, unless
// --allow-destructive is passed (the pipeline passes it only for PRs labelled work-queue-destructive-approved).
// Usage: terraform show -json tfplan > plan.json && node check-destructive-plan.mjs plan.json [--allow-destructive]
import { readFileSync } from 'node:fs';

const GUARDED_TYPES = new Set([
    'aws_sns_topic', 'aws_sns_topic_subscription',
    'aws_sqs_queue', 'aws_sqs_queue_policy', 'aws_sqs_queue_redrive_allow_policy',
    'aws_lambda_event_source_mapping', 'aws_lambda_function', 'aws_lambda_alias',
    'aws_kms_key',
]);

const [planPath, ...flags] = process.argv.slice(2);
if (!planPath) {
    console.error('usage: node check-destructive-plan.mjs <plan.json> [--allow-destructive]');
    process.exit(2);
}
const allow = flags.includes('--allow-destructive');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const destructive = (plan.resource_changes ?? [])
    .filter((change) => GUARDED_TYPES.has(change.type) && (change.change?.actions ?? []).includes('delete'))
    .map((change) => `${(change.change.actions.length > 1 ? 'replace' : 'delete').padEnd(7)} ${change.address}`);

if (destructive.length === 0) {
    console.log('No destructive work-queue changes.');
    process.exit(0);
}
console.log(`Destructive work-queue changes (${destructive.length}):\n${destructive.join('\n')}`);
if (allow) {
    console.log('Allowed: the pull request carries the work-queue-destructive-approved label.');
    process.exit(0);
}
console.error('\nBlocked. Complete the procedure in GOVERNANCE.md ("Destructive changes"), link it in the pull request, ' +
    'and have an approver add the label work-queue-destructive-approved.');
process.exit(1);
```

`infrastructure/terraform/work-queue/aws/scripts/fixtures/plan-safe.json`:

```json
{
  "resource_changes": [
    { "address": "module.work_queue.aws_sqs_queue.subscription[\"email.archive\"]", "type": "aws_sqs_queue", "change": { "actions": ["update"] } },
    { "address": "module.work_queue.aws_cloudwatch_metric_alarm.dead_letters[\"email.archive\"]", "type": "aws_cloudwatch_metric_alarm", "change": { "actions": ["delete", "create"] } },
    { "address": "module.work_queue.aws_sns_topic.this[\"email.events\"]", "type": "aws_sns_topic", "change": { "actions": ["no-op"] } }
  ]
}
```

`infrastructure/terraform/work-queue/aws/scripts/fixtures/plan-destructive.json`:

```json
{
  "resource_changes": [
    { "address": "module.work_queue.aws_sns_topic_subscription.this[\"email.archive\"]", "type": "aws_sns_topic_subscription", "change": { "actions": ["delete"] } },
    { "address": "module.work_queue.aws_lambda_event_source_mapping.consumer[\"email.archive\"]", "type": "aws_lambda_event_source_mapping", "change": { "actions": ["delete", "create"] } },
    { "address": "module.work_queue.aws_sqs_queue_policy.subscription[\"email.archive\"]", "type": "aws_sqs_queue_policy", "change": { "actions": ["delete"] } }
  ]
}
```

Run: `cd infrastructure/terraform/work-queue/aws/scripts && node check-destructive-plan.mjs fixtures/plan-safe.json; echo "exit $?"`
Expected: `No destructive work-queue changes.` and `exit 0`.

Run: `node check-destructive-plan.mjs fixtures/plan-destructive.json; echo "exit $?"`
Expected: three lines (`delete`, `replace`, `delete`), the "Blocked." message, and `exit 1`.

Run: `node check-destructive-plan.mjs fixtures/plan-destructive.json --allow-destructive; echo "exit $?"`
Expected: the same three lines, "Allowed: …", and `exit 0`.

- [ ] **Step 2: Write `GOVERNANCE.md`**

`infrastructure/terraform/work-queue/aws/GOVERNANCE.md`:

````markdown
# Work Queue on AWS — Deployment Governance

MemberJunction metadata is the source of truth for work-queue topology. AWS resources are created **only** by this
Terraform module, from a manifest exported from that metadata, through a gated pipeline. MJ binds to what exists
and validates it; it never creates, changes or deletes cloud resources.

## Roles

| Role | Owns |
| --- | --- |
| Application developer | Topics, subscriptions and handlers in MJ metadata; Lambda consumer code |
| Platform engineer | The infrastructure repository, Terraform state, IAM attachments, environment promotion, out-of-band queue deletion |
| Approver (per environment) | Approving the saved plan at the environment gate; `prod` requires a second approver. Only an approver may add the `work-queue-destructive-approved` label |

## Normal change lifecycle

```
 1. Developer changes topology       metadata/work-queue-topics/*.json (system topics) or MJ: Work Queue entities
 2. Export the manifest              mj queue export-topology --transport AWS-dev > manifest.json
                                     (renders Aws.SnsFilterPolicy and Status; refuses Ordered subscriptions)
 3. Open an infrastructure PR        manifest.json diff + lambda_consumers changes (artifact keys) in the env folder
 4. CI on the PR                     fmt / validate / tflint / test, terraform plan, DESTRUCTIVE-CHANGE GATE, plan posted
 5. Merge                            only with a green gate (or the approver's label, after the procedure below)
 6. Deploy run, per environment      plan -out=tfplan → gate → upload tfplan → ENVIRONMENT APPROVAL (plan shown)
                                     → download the same tfplan → terraform apply tfplan   (never a fresh plan)
 7. Bind MJ                          terraform output -json binding_import > bindings.json   (kept as a run artifact)
                                     mj queue import-bindings bindings.json
 8. Verify                           mj queue validate-bindings --transport AWS-dev   → no Errors, no drift Warnings
                                     MJAPI startup logs no binding errors for the transport
 9. Promote                          dev → staging → prod, each from that environment's own manifest export
```

Rules:

- **One manifest per environment**, exported from that environment's MJ database. Never apply a dev manifest to prod.
- **Metadata first, infrastructure second, bindings last.** A topic whose binding is not yet imported rejects publishes
  with the retryable `TopicUnbound`; producers retry and nothing is lost.
- **Removing** a topic or subscription is infrastructure first (after draining — below), metadata second.
- **State**: remote backend (S3 + DynamoDB lock table, or Terraform Cloud) with versioning and encryption; one state
  per environment; no local state outside development.
- **Accounts**: one AWS account per environment is recommended; at minimum, separate `environment` values and IAM
  boundaries. Give the pipeline's apply role an explicit **Deny** on `sqs:DeleteQueue` and `sns:DeleteTopic`; queue
  deletion uses a separate break-glass role.

### What is frozen at apply time

A Lambda consumer reads its subscription's **policy and filter from `MJ_WQ_SUBSCRIPTION`**, which Terraform writes when
it applies. The queue's redrive count and visibility timeout are set at the same moment. Changing `MaxAttempts`,
backoff, `LeaseSeconds`, the filter or `Status` in MJ therefore changes **nothing** on AWS until the manifest is
re-exported and applied. `mj queue validate-bindings` compares the queue's redrive count and visibility timeout with
the current policy and reports a **Warning** ("policy drift — re-apply Terraform"); the scheduled drift job below
catches the rest. MJ-worker subscriptions read their policy from MJ directly, but their queue attributes are frozen
the same way.

### Pausing a subscription

| Host | Effect of `Status = 'Paused'` in MJ |
| --- | --- |
| MJ worker | Immediate: the host stops receiving from the queue at its next reconcile |
| Lambda | **Only after export + apply**: the manifest carries `Status`, and the module sets the event source mapping's `enabled = false`. Until then the function keeps consuming |

Pausing never stops fan-out: SNS keeps delivering to the queue, and messages older than the queue's retention
(14 days by default) are lost.

### Adding a subscription

An SNS subscription receives only what is published **after** it exists. A subscription added to a live topic starts
empty and misses everything published before its apply; there is no backfill on this transport. If the new consumer
needs history, replay it from the system of record.

## Change classes

| Change | Class | What Terraform does | Procedure |
| --- | --- | --- | --- |
| Add topic or subscription | Safe | Creates resources | Normal lifecycle |
| Change filter (`Aws.SnsFilterPolicy`) | Safe | Updates the SNS subscription in place | Normal; messages published during the update may be filtered by either policy |
| Change `MaxAttempts`, `LeaseSeconds`, Lambda timeout, `Status` | Safe | Updates queue attributes, function environment, event-source `enabled` in place | Normal; in-flight messages keep their old visibility |
| Add or update a Lambda consumer artifact | Safe | Updates function code, publishes a version, moves the `live` alias | Normal (see Lambda pipeline) |
| Roll a consumer back | Safe | Moves the `live` alias | Set `alias_version`, apply |
| Flip a topic between standard and FIFO (including adding the first `Exclusive` subscription to a standard topic) | **Destructive** | Would replace the topic and every queue on it — blocked by `prevent_destroy` | Migration procedure below |
| Rename a topic or subscription | **Destructive** | Would replace resources — queues blocked by `prevent_destroy` | Create the new one, move producers/consumers, drain, then remove the old one |
| Delete a topic or subscription | **Destructive** | Deletes the SNS subscription, policies, consumer and alarms; the queues need the out-of-band step | Removal procedure below |
| Change `name_prefix` or `environment` | **Destructive** | Would replace everything | Treat as a new deployment |
| Change a subscription to `Ordered` | **Refused** | Plan fails | Ordered requires the Database transport: move the topic there in MJ |

## Destructive changes

The gate blocks any plan that deletes or replaces an SNS topic, SNS subscription, SQS queue, queue policy, redrive-allow
policy, event source mapping, function, alias or KMS key. To proceed, complete the matching procedure, link the
evidence in the PR, and have an approver add `work-queue-destructive-approved`.

### Removal procedure (delete, or the old half of a rename)

1. Stop what feeds it: stop the producers when a whole topic is going away. A single subscription cannot be starved
   while its topic is live — anything still queued when it is removed is discarded, by design.
2. Let the consumer catch up: `mj queue stats --subscription <name>` shows `Pending = 0` and `InFlight = 0`.
3. Settle the dead letters: `mj queue dead-letters --subscription <name>`; `mj queue replay` or `mj queue discard` each
   one, or export the dead-letter queue (`aws sqs receive-message`) if they must be kept. Check the SNS
   delivery-failure queue (`…-snsdlq`) in the console as well — MJ cannot see it.
4. **Release the queues from Terraform** (platform engineer; paste the commands and output into the PR):
   `terraform state rm 'module.work_queue.aws_sqs_queue.subscription["<name>"]' 'module.work_queue.aws_sqs_queue.dead_letter["<name>"]'`
   Without this the plan fails on `prevent_destroy` — that failure is the control working.
5. Open the PR that removes the subscription from the manifest. The plan deletes the SNS subscription, policies,
   consumer and alarms; the gate needs the approver's label.
6. After the apply, re-check that both queues are empty, then delete them with the break-glass role:
   `aws sqs delete-queue --queue-url <url>` (twice).
7. Remove the metadata in MJ.

**Rollback.** Before step 6 nothing irreversible has happened: re-add the subscription to the manifest,
`terraform import` the two queues back into state, and apply — the SNS subscription is recreated and starts receiving
again (messages published in between are missed). After step 6 the messages are gone; that is why steps 2–3 come
first. State versioning on the backend lets a bad `state rm` be undone by restoring the previous state object.

### Standard ↔ FIFO migration

1. Create a **new** topic in metadata (for example `email.events.v2`) with the new `IsFifo`, and its subscriptions.
2. Apply infrastructure and import bindings for the new topic.
3. Deploy consumers for the new subscriptions (they are idle).
4. Switch producers to the new topic name.
5. Remove the old topic's subscriptions with the removal procedure, then the old topic.

Prefer the **two-topic pattern** to flipping a busy topic to FIFO: keep the standard topic for the firehose
subscriptions, and publish to a second FIFO topic for the per-key work (plan 11 §4).

### Rolling back a bindings import

Every deploy run keeps its `bindings.json` as an artifact. To roll back, re-import the previous run's file
(`mj queue import-bindings <previous>/bindings.json`) and run `mj queue validate-bindings`. Import only rewrites
`BindingConfig` on topics and subscriptions; it never touches AWS.

## Lambda consumer pipeline

```
consumer source ─► pnpm build ─► esbuild bundle (platform node, format esm, @aws-sdk/* external, sourcemap)
                ─► zip ─► sha256 of zip = content hash
                ─► upload s3://<artifact-bucket>/work-queue/<subscription-slug>/<content-hash>.zip (never overwritten)
                ─► PR: set lambda_consumers["<subscription>"].s3_key to the new key
                ─► plan/apply: a new immutable version is published and the 'live' alias moves to it
```

- **Immutable artifacts**: the key is the content hash; a rebuild of the same code produces no change.
- **The event source invokes the `live` alias**, never `$LATEST`.
- **Rollback**: set `lambda_consumers["<subscription>"].alias_version = "<previous version number>"` and apply — the
  alias moves, nothing is rebuilt. Remove `alias_version` with the next forward release. (Reverting `s3_key` also
  works, but publishes yet another version.)
- **Canary (optional)**: deploy to `staging` first and watch the `MJ/WorkQueue` EMF metrics (`Failed`, `Retried`,
  `DeadLettered`) and the module's alarms for one full traffic cycle before promoting.
- **Throttle with `maximum_concurrency`**, not reserved concurrency: a throttled invocation returns its messages to the
  queue with the receive already counted, and enough of those dead-letter a message that never ran.
- **Idempotency is required** of every consumer; redeliveries happen during deploys.

## Operating

| Signal | Alarm / source | Action |
| --- | --- | --- |
| Dead letters present | `<dlq>-has-messages` | `mj queue dead-letters --subscription <name>` (scans up to 100); fix, then `mj queue replay` or `mj queue discard`. Reason `RedrivePolicy` = crash loop. Bulk: `aws sqs start-message-move-task` from the DLQ to the queue after fixing the cause |
| SNS could not deliver | `<snsdlq>-has-messages` | Not visible to MJ. Inspect the queue in the SQS console; the cause is almost always the queue policy or the KMS key policy. Fix, then `aws sqs start-message-move-task` |
| Backlog age | `<queue>-backlog-age` | Check consumer errors/throttles and whether the subscription is `Paused`; for Lambda raise `maximum_concurrency`; for MJ workers raise `workQueue` concurrency |
| Lambda errors / throttles | `<function>-errors`, `<function>-throttles` | Inspect logs; throttles burn receives — raise concurrency limits or lower `maximum_concurrency`, and remove reserved concurrency |
| Binding or policy drift | `mj queue validate-bindings` Errors / Warnings; the drift job | Re-export the manifest and apply, then import bindings |

## Required CI checks for infrastructure PRs

1. `terraform fmt -check -recursive`
2. `terraform validate`
3. `tflint`
4. `terraform test` (module repository)
5. `terraform plan` for the target environment, posted to the PR
6. `check-destructive-plan.mjs` on that plan — **a failing gate, not a warning**
7. Scheduled drift detection per environment (`plan -detailed-exitcode`)
````

- [ ] **Step 3: Write the example deployment pipeline**

`infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml` (for the repository that
owns an environment's infrastructure; copy and adjust names — it expects `check-destructive-plan.mjs` copied to
`work-queue/scripts/`):

```yaml
name: Work Queue Infrastructure

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
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
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
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
          terraform_wrapper: false
      - run: terraform fmt -check -recursive
      - run: terraform init -input=false
      - run: terraform validate
      - run: terraform plan -input=false -out=tfplan
      - run: terraform show -json tfplan > plan.json
      - name: Destructive-change gate
        env:
          GH_TOKEN: ${{ github.token }}
          PR_LABELS: ${{ toJson(github.event.pull_request.labels.*.name) }}
        run: |
          # On a pull request the labels come from the event; on the merge commit, from the PR that produced it.
          if [ "${{ github.event_name }}" = "push" ]; then
            PR_LABELS=$(gh api "repos/${{ github.repository }}/commits/${{ github.sha }}/pulls" --jq '[.[0].labels[].name]')
          fi
          ALLOW=""
          if echo "$PR_LABELS" | grep -q '"work-queue-destructive-approved"'; then ALLOW="--allow-destructive"; fi
          node ../scripts/check-destructive-plan.mjs plan.json $ALLOW
      - name: Show the plan
        run: |
          {
            echo "### Work queue plan: ${{ matrix.environment }}"
            echo '```'
            terraform show -no-color tfplan | tail -c 60000
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
      - name: Post the plan to the pull request
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        env:
          ENVIRONMENT: ${{ matrix.environment }}
        with:
          script: |
            const { execSync } = require('child_process');
            const plan = execSync('terraform show -no-color tfplan', { cwd: `work-queue/${process.env.ENVIRONMENT}` }).toString();
            const body = `### Work queue plan: ${process.env.ENVIRONMENT}\n\n\`\`\`\n${plan.slice(-60000)}\n\`\`\``;
            await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body });
      - name: Save the plan for the apply job
        if: github.event_name == 'push'
        uses: actions/upload-artifact@v4
        with:
          name: tfplan-${{ matrix.environment }}
          path: |
            work-queue/${{ matrix.environment }}/tfplan
            work-queue/${{ matrix.environment }}/.terraform.lock.hcl
          retention-days: 7

  apply:
    if: github.event_name == 'push'
    needs: plan
    runs-on: ubuntu-latest
    strategy:
      max-parallel: 1
      matrix:
        environment: [dev, staging, prod]
    # Protection rules on this environment require approval; the approver reviews the plan in the plan job's summary.
    # prod requires two reviewers.
    environment: ${{ matrix.environment }}
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
          terraform_wrapper: false
      - uses: actions/download-artifact@v4
        with:
          name: tfplan-${{ matrix.environment }}
          path: work-queue/${{ matrix.environment }}
      - run: terraform init -input=false
      # Applies the reviewed plan file — never a fresh plan. Terraform rejects it ("Saved plan is stale") if the
      # state changed after it was made; re-run the workflow to produce and review a new one.
      - run: terraform apply -input=false tfplan
      - run: terraform output -json binding_import > bindings.json
      - uses: actions/upload-artifact@v4
        with:
          name: bindings-${{ matrix.environment }}
          path: work-queue/${{ matrix.environment }}/bindings.json
          retention-days: 90
```

The bindings artifact is imported into the matching MJ environment with `mj queue import-bindings bindings.json`
(by the platform engineer, or by a job with MJ API access), followed by `mj queue validate-bindings`. Keeping it for
90 days is what makes "Rolling back a bindings import" possible.

`infrastructure/terraform/work-queue/aws/examples/drift.github-actions.yml`:

```yaml
name: Work Queue Drift

on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write
  issues: write

jobs:
  drift:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
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
          terraform_wrapper: false
      - run: terraform init -input=false
      - name: Detect drift
        id: plan
        run: |
          set +e
          terraform plan -input=false -lock=false -detailed-exitcode -no-color > drift.txt
          CODE=$?
          echo "code=$CODE" >> "$GITHUB_OUTPUT"
          tail -c 60000 drift.txt >> "$GITHUB_STEP_SUMMARY"
          if [ "$CODE" -eq 1 ]; then exit 1; fi   # plan itself failed
      - name: Report drift
        if: steps.plan.outputs.code == '2'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh issue create --title "Work queue drift: ${{ matrix.environment }}" --label work-queue-drift \
            --body "terraform plan found differences between the committed manifest and AWS in **${{ matrix.environment }}**. See run ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}. Either someone changed AWS by hand, or topology changed in MJ without a re-export (then also run mj queue validate-bindings)."
          exit 1
```

Exit code 2 means "the plan is not empty": AWS no longer matches the committed manifest and variables. This job does
not see MJ-side changes that were never exported — `mj queue validate-bindings` (policy-drift warnings) covers those,
and `validate-bindings` in turn does not check IAM, KMS, alarms, event source mappings or queue policies, which is
what this job is for.

- [ ] **Step 4: Write the repository workflow**

`.github/workflows/work-queue-aws.yml`:

```yaml
name: Work Queue AWS

# Checks the AWS Terraform module, the destructive-plan gate, and the dependency/size budget of the thin Lambda entry
# point (@memberjunction/work-queue-aws/lambda). The unit tests of the packages run in test.yml like every package.

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

  plan-gate:
    name: Destructive-plan gate
    runs-on: ubuntu-latest
    timeout-minutes: 5
    defaults:
      run:
        working-directory: infrastructure/terraform/work-queue/aws/scripts
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Safe plan passes
        run: node check-destructive-plan.mjs fixtures/plan-safe.json
      - name: Destructive plan is blocked
        run: |
          if node check-destructive-plan.mjs fixtures/plan-destructive.json; then
            echo "The gate let a destructive plan through"; exit 1
          fi
      - name: Destructive plan passes with the approval flag
        run: node check-destructive-plan.mjs fixtures/plan-destructive.json --allow-destructive

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

- [ ] **Step 5: Check the workflow files**

Run: `actionlint .github/workflows/work-queue-aws.yml infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml infrastructure/terraform/work-queue/aws/examples/drift.github-actions.yml` (install from https://github.com/rhysd/actionlint if missing)
Expected: exit code 0, no output.

Run: `cd packages/WorkQueue/core && pnpm run build && cd ../aws && pnpm run build && pnpm run check:lambda-bundle`
Expected: `work-queue-aws/lambda bundle OK: …` (the same command the `lambda-bundle` job runs).

- [ ] **Step 6: Commit**

```bash
git add infrastructure/terraform/work-queue/aws/GOVERNANCE.md infrastructure/terraform/work-queue/aws/scripts infrastructure/terraform/work-queue/aws/examples/deploy-pipeline.github-actions.yml infrastructure/terraform/work-queue/aws/examples/drift.github-actions.yml .github/workflows/work-queue-aws.yml
git commit -m "feat(work-queue): gated AWS deployment pipeline — destructive-plan gate, reviewed-plan apply, drift job, runbook"
```

---

### Task 11: LocalStack conformance (opt-in) and the package README

**Files:**
- Create: `packages/WorkQueue/aws/localstack/docker-compose.yml`, `packages/WorkQueue/aws/vitest.localstack.config.ts`
- Create: `packages/WorkQueue/aws/src/__localstack__/LocalStackHarness.ts`, `src/__localstack__/conformance.localstack.test.ts`
- Create: `packages/WorkQueue/aws/README.md`
- Modify: `packages/WorkQueue/aws/package.json` (`test:localstack` script; `@memberjunction/work-queue-core` stays the only MJ dependency), `.github/workflows/work-queue-aws.yml` (manual `localstack-conformance` job)

**Interfaces:**
- Consumes: `RunTransportConformanceSuite` (`@memberjunction/work-queue-core/testing/vitest`); `ConformanceHarness`, `ConformanceTraits`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `SubscriptionBindingOverrides` (`@memberjunction/work-queue-core/testing`, plan 04 Task 8); `AwsTransportDriver`, `AWS_TRANSPORT_CAPABILITIES`, `AwsResourceName`, `ExpectedMaxReceiveCount`, `SnsFilterPolicyFor` (Tasks 1–6); `SNSClient`, `CreateTopicCommand`, `DeleteTopicCommand`, `SubscribeCommand` (`@aws-sdk/client-sns`); `SQSClient`, `CreateQueueCommand`, `DeleteQueueCommand`, `GetQueueAttributesCommand` (`@aws-sdk/client-sqs`).
- Produces: `class LocalStackHarness implements ConformanceHarness`; npm script `test:localstack`; README.

The conformance kit skips cases whose capabilities the transport lacks (`Ordered`, pending discard, partitions,
progress, MessageID duplicate detection). What remains — fan-out, filters, lease extension and loss, retry backoff,
`Exclusive` single flight, dead-letter, replay and discard of dead letters — runs against real SNS/SQS semantics in
LocalStack. `Ordered` is a Database-transport feature (11 S2); its behavior is covered by the Database conformance
run (plan 05), and its cases are skipped here by the `SupportsOrdered = false` gate.

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
Expected: PASS — 130 tests; the LocalStack suite is not included.

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

MJ servers load this package through the engine's **`@memberjunction/work-queue-engine/aws`** subpath
(`AWSTransportDriverFactory`), which only `ServerBootstrap` imports — the engine's main entry, the CLI's other
commands, CodeGen and the data providers never load an AWS client. Cloud resources are created by
`infrastructure/terraform/work-queue/aws`, never at runtime.

**What runs here:** `None` and `Exclusive` subscriptions. **`Ordered` requires the Database transport** — validation
rejects it on an AWS topic. `Exclusive` on SQS FIFO already processes a key's messages in order, one at a time; what it
does not do is halt the key when one of them dead-letters.

## Entry points

| Import | Use |
| --- | --- |
| `@memberjunction/work-queue-aws` | `AwsTransportDriver`, consumer, operator, filter-policy translation, binding validation |
| `@memberjunction/work-queue-aws/lambda` | `CreateSqsLambdaHandler` for SQS-triggered Lambda consumers. Built on an SQS-only client factory: it never pulls the SNS client into a bundle |
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
  `ReportBatchItemFailures` on the event source mapping. The policy in it is **frozen at apply time**: changing
  `MaxAttempts` or backoff in MJ does nothing here until the manifest is re-exported and applied.
- FIFO event sources use **`batch_size = 1`** (the module enforces it); scale with the event source's
  `maximum_concurrency`, never reserved concurrency.
- Bundle with esbuild (`platform: node`, `format: esm`, `external: ['@aws-sdk/*']`); the Lambda Node.js runtime
  provides the SDK.
- Return `Outcome.Retry(reason, delaySeconds)` or throw `TransientWorkError` to retry; return `Outcome.DeadLetter(reason)`
  or throw `FatalWorkError` to dead-letter now. Any other thrown error retries with backoff.

### Handler rules

The full version is the [consumer guide](../../../plans/work-queue-1/10-consumer-guide.md); the short version:

- **Be idempotent.** Delivery is at least once, and `MessageID` is stable across redeliveries and replays — use it (or
  your own natural key) as the idempotency key.
- **Honour `context.Signal`.** It aborts when the lease is lost, `MaxProcessingSeconds` passes or the host is shutting
  down (`Signal.reason` says which; `'Cancelled'` never occurs on this transport). Stop whatever external
  work you started; anything you write after that is fenced out anyway.
- **Keep the item a claim check.** Results, output and history belong on your own domain row, referenced from the
  payload — not in `Payload` (256 KB cap) and not in `Progress`.
- **Fit the host.** Lambda's hard ceiling is 15 minutes, and the adapter stops starting records 10 s before the
  deadline and releases them. Set `MaxProcessingSeconds` below the function timeout; work that can run longer belongs
  on an MJ worker or a container job, not here.
- **Publish attributes in the exact case your filters use.** SNS matches attribute values case-sensitively, so the
  queue's filters are case-sensitive everywhere (03 §4.3); normalise values when you publish.
- **Own your side effects.** The queue guarantees delivery and one valid lease holder while your handler runs — not
  that a non-idempotent side effect happens exactly once, and not anything after your handler returns. Work finished
  later by a webhook uses the split-message pattern (record the job on a domain row, complete, publish a completion
  message when the callback arrives); overlap and coalescing policy are yours.

**FIFO queues:** with `batch_size = 1` each invocation gets one message, and SQS holds the rest of its key until it
settles — including for the whole delay of a retry. If a larger batch is ever configured, records of one message group
still run in order, and after a record retries or fails the rest of its group in that batch is released unprocessed
so nothing overtakes it (each such release costs the follower one receive).

**Metrics:** each invocation writes one CloudWatch Embedded Metric Format line in namespace `MJ/WorkQueue`
(`Processed`, `Completed`, `Retried`, `DeadLettered`, `Failed`, `NotStarted`, `DurationMs`; dimension `Subscription`).

## What this transport does not do for you

Per 02 §1a, the queue's guarantees stop when your handler settles. On SQS specifically:

| Not provided | Consequence |
| --- | --- |
| Cancelling a pending or in-flight message (`CancelPending`/`CancelInFlight` are `false`) | An operator can discard a dead letter, not a running one. Handlers that must be interruptible should poll their own domain flag, or live on a Database-transport topic, where 03 §7's cancel flag applies. |
| `Ordered` (halt a key when one of its messages dead-letters) | Put the topic on the Database transport. A cloud topic that needs one such consumer bridges to it: a subscriber republishes onto a Database topic. |
| `None` semantics on a FIFO topic | One `Exclusive` subscription makes the topic — and every queue on it — FIFO. A `None` subscription there is serialised per `PartitionKey`, and a message in retry backoff holds its key. |
| Waiting for work that finishes elsewhere | Use the split-message pattern; the queue never parks a message awaiting a webhook. |
| Suppressing duplicate side effects | Handlers are idempotent, or they hold their own lock. |
| Knowing whether a consumer is still alive | The visibility timeout is the only liveness signal; size `LeaseSeconds` accordingly. |

## Known limits

- **FIFO throughput.** A topic with any `Exclusive` subscription must be FIFO, which caps **every** subscription on it
  at the FIFO quotas (verify the current SNS/SQS FIFO and high-throughput-mode numbers for your region). For a
  firehose, use the **two-topic pattern**: a standard topic for permanence and reporting subscriptions, and a second
  FIFO topic for per-subscriber work.
- **Every publish passes through MJ** (in-process or the REST endpoint), and a `DeduplicationKey` costs two
  MJ-database writes (reserve, confirm). Producers at firehose volume should rely on stable `MessageID`s — on a FIFO
  topic they are the SNS deduplication ID for five minutes — and on the direct publisher follow-on (09d).
- **Receives are attempts.** `Attempt` is SQS's receive count, so a `Release` on shutdown or a Lambda throttle uses
  one up. The receive-time guard (`MaxAttempts + 2`) and the redrive policy (`MaxAttempts + 5`) leave room for that;
  sustained throttling does not.
- **A new subscription starts empty.** SNS delivers only what is published after the subscription exists.

## Calling MemberJunction from a Lambda consumer

Thin consumers do not load MJ. When a handler needs MJ data, call the MJ API with an API key held in AWS Secrets
Manager (scope the key to the operations the handler needs). Handlers that need MJ entities throughout should run
as `MJWorker` subscriptions instead.

## Dead letters

| Source | Reason attribute (`mj_dead_letter_reason`) |
| --- | --- |
| Handler returned `DeadLetter` / threw `FatalWorkError` | the handler's reason |
| Retries exhausted | `MaxAttemptsExceeded` |
| Received more than `MaxAttempts + 2` times without being settled (the consumer's receive-time guard) | `MaxAttemptsExceeded` |
| Body is not an envelope | `InvalidEnvelope` — listed as `sqs:<SQS MessageId>` with the raw body in `LastError`; discardable, not replayable |
| Moved by the SQS redrive policy (`MaxAttempts + 5` receives: a crash loop the consumer never saw) | no attribute — reported as `RedrivePolicy`, `Attempts = 0` |

Every dead letter is its own FIFO message group, so a scan can reach all of a poison key's dead letters.

Operate them from MJ:

```bash
mj queue dead-letters --subscription email.unsubscribe
mj queue replay  --subscription email.unsubscribe --delivery <MessageID>
mj queue discard --subscription email.unsubscribe --delivery <MessageID> --reason "invalid address"
```

Listing, replay and discard are **best effort** on SQS: they long-poll up to 100 dead letters at a time and stop after
three consecutive empty receives. For large
dead-letter queues, fix the cause and move everything back with SQS's own redrive
(`aws sqs start-message-move-task --source-arn <dlq-arn> --destination-arn <queue-arn>`); moved messages keep their
body and are processed again.

## IAM

The Terraform module outputs `mjapi_policy_json` (publish, validation, dead-letter operations) and
`mj_worker_policy_json` (consume MJ worker queues, plus the read-only `sns:Get*`/`sqs:GetQueueAttributes` calls binding
validation makes at host start). Lambda consumer roles are created by the module with access to
their own queue, dead-letter queue and log group only.

## Limits (verify against current AWS quotas)

| Limit | Value |
| --- | --- |
| Envelope incl. attributes | 262,144 bytes |
| User attributes per message | 10 |
| Retry delay / lease extension | ≤ 12 hours from receive |
| Lambda batch size | 1 on FIFO queues (enforced); ≤ 10 on standard queues |
| Event source `maximum_concurrency` | ≥ 2 |
| FIFO deduplication window (MessageID) | 5 minutes |

## Testing

- `pnpm test` — unit tests against in-memory fakes; never calls AWS.
- `pnpm run test:localstack` — the shared transport conformance suite against LocalStack
  (`docker compose -f localstack/docker-compose.yml up -d --wait` first).
- `pnpm run check:lambda-bundle` — fails if the `./lambda` entry reaches the SNS client or an MJ runtime package, or
  its own code exceeds 150 KB.
````

- [ ] **Step 6: Build and commit**

Run: `cd packages/WorkQueue/aws && pnpm run build && pnpm test`
Expected: builds; PASS — 130 tests.

```bash
git add packages/WorkQueue/aws .github/workflows/work-queue-aws.yml
git commit -m "test(work-queue-aws): LocalStack conformance harness, manual CI job and package README"
```

---

## Contract deltas

Revision 4 rewrote 03, and every delta earlier revisions of this plan carried (the `SnsSubscriptionArn` binding field,
`TransportRejected`, the AWS operator's best-effort semantics, the `./lambda` and `./testing` subpaths, shared
resource naming, the filter subset and its once-per-field rule, `CancelInFlight: false`, one-message FIFO receive and
the `+2` / `+5` receive margins, dead-letter message groups, the engine's `./aws` subpath) is now **stated in 03**.
The staging deltas are gone with S2. What is still open:

| # | Delta | Owner | Why |
| --- | --- | --- | --- |
| D1 | **`ManifestEnricherRegistry`** (engine main entry) is how `ExportManifest` gets `Aws.SnsFilterPolicy` without the main entry importing `work-queue-aws`. 03 §10 says the policy is "rendered by the engine's ./aws entry" but names no seam; 03 §11 and plan 05's `ExportManifest` should name the registry. Task 8 wraps plan 05's `BuildTopologyManifest` result and adds one export line to the main entry. | 03 §10/§11, plan 05 | F12 forbids the direct import earlier revisions used |
| D2 | **The CLI imports the subpath too — resolved.** 03 §0 now says the four `mj queue` commands that need cloud drivers (`export-topology`, `import-bindings`, `validate-bindings`, `work`) statically import `@memberjunction/work-queue-engine/aws`; Task 8 Step 7b adds the imports with a registration test, and nothing shared (CLI entry, `commands/queue/index.ts`, `ServerBootstrapLite`) imports it. | resolved (03 §0) | The manifest is exported from the CLI, which boots `ServerBootstrapLite` |
| D3 | **Fixture names from plan 05.** Task 8's engine tests import `TRANSPORT_ROW_FIXTURE`, `TOPIC_ROW_FIXTURE`, `SUBSCRIPTION_ROW_FIXTURE`, `TransportRow`/`TopicRow`/`SubscriptionRow` and `ResolveTopic` from `@memberjunction/work-queue-base`, and `BuildTopologyManifest` from the engine's `src/topology/manifest`. **Resolved:** plan 05 ships the fixtures from `@memberjunction/work-queue-base/testing`; the imports in this plan use that subpath. | plan 05 | Cross-plan seam written while 05 was being revised |
| D4 | **Unreadable dead letters.** 03 §5.1 says `InvalidEnvelope` dead letters are "listable (with a null `Message` payload) and discardable" but `DeadLetterRecord.Message` is a non-null `WorkMessage` and the AWS `DeliveryID` is "the envelope MessageID", which such a body lacks. Task 6 lists them as `DeliveryID = 'sqs:<SQS MessageId>'` with a placeholder `Message` (`Topic: ''`, `Payload: null`) and the raw body's first 1,000 characters in `LastError`. | 03 §5.1/§5.2 | Needed a concrete shape |
| D5 | **`ValidateBindings` severities.** A redrive count or visibility timeout that no longer matches the policy is a **Warning** (policy drift, 03 §10); a redrive policy that targets the wrong queue, a missing resource, a FIFO mismatch or an `Ordered` subscription is an **Error**. 03 §10 states the warning but not the split. | 03 §5 / §10 | Drift must not read as a broken binding |
| D6 | **FIFO publish tail.** On a FIFO topic `PublishToSns` never sends two entries of one message group in one `PublishBatch`, and rejects (unsent, `TransportUnavailable`, retryable) the later entries of a group once one of them fails. 03 §5.1 does not say how a partial batch failure is kept from reordering a key. | 03 §5.1 | Reviewer M3 |
| D7 | **SNS delivery-failure queues** (`…-snsdlq`) exist per subscription in the Terraform module and are invisible to MJ by design (they hold SNS envelopes that never reached the subscription queue). Not in 03; operators handle them in AWS (GOVERNANCE.md). | 03 §5.1 (informational) | Reviewer M1 |

## Self-review notes

- **Spec coverage.** 02 §4.4 and 03 §5.1 (SNS → SQS → Lambda or MJ worker; one message per FIFO receive; heartbeat,
  retry and release by visibility; runtime dead-lettering; receive-time guard; redrive backstop; dead-letter message
  groups and scan rules): Tasks 3–7. 03 §5 / §5.2 transport, consumer (`LeaseExtension`, `AcknowledgeCancel`) and
  operator contracts: Tasks 4–6. 03 §0 engine loading (F12) and no re-exports (F13): Tasks 3, 7, 8. 03 §2.1 cloud
  deduplication (F1): Task 8 (coordinator from plan 05, proven over the real driver). 03 §10 manifest (`Status`,
  `Aws.SnsFilterPolicy`) and `BindingImport`: Tasks 8–9. Scope cuts S1/S2: no ordering numbers and no cloud-side
  `Ordered` anywhere; `Ordered` on an AWS topic is rejected in validation (Task 4), the Lambda binding parser
  (Task 7), the manifest export (Task 8) and the module (Task 9). Deployment governance (README D6; 11 §3): Tasks
  9–10. Known limits (11 §4): package README (Task 11) and GOVERNANCE.md.
- **Reviewer findings.** C1/C2 → Task 5 (one-message receive, margins) and Task 9 (`batch_size = 1`,
  `maximum_concurrency`). H1–H3 → removed with S2. H4 → Tasks 5–6. M1, M2, M7 → Task 9. M3, M4 → Task 4. M5 → Task 5.
  M6 → Task 10. Lows: SQS-only client factory and an honest bundle check (Tasks 3, 7), guard regex (Task 1),
  assume-role region (Task 8), listable `InvalidEnvelope` (Task 6), `maximum_concurrency` minimum,
  `fifo_throughput_scope`, `aws:SecureTransport`, worker `sns:Get*` (Task 9).
- **Not covered here, by design:** the `mj queue` CLI and remote operations (plan 06), manifest building and binding
  import (plans 05/06), Azure (09a), Firehose (09g).
