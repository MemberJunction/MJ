# Rubrics in Testing and Computer Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a published rubric judge any test type, computer use included: the rubric oracle runs in every driver (phase 1), the rubric judge can see screenshots (phase 2), and the rubric's criteria drive the in-loop computer use judge whose verdict is stored as the evaluation (phase 3).

**Architecture:** Rubric resolution and the oracle input move from `AgentEvalDriver` into `BaseTestDriver`, so every driver resolves the same five sources, pins the Published version per suite run, and hands the oracle a provider. The computer use driver builds a compact text transcript (and later chosen frames) as the judge's subject. The rubrics engine learns to send images as chat content blocks. The computer use engine accepts rubric criteria with keys and levels, and a `ComputerUse` rubric evaluator turns the in-loop judge's verdicts into a stored `RubricEvaluation` with no extra model call.

**Tech Stack:** TypeScript (ES modules, `.js` import suffixes in `packages/Rubrics` and `packages/AI/*`), vitest, MJ ClassFactory (`@RegisterClass`), MJ metadata sync for prompts, changesets.

**Spec:** "Rubrics Architecture and Testing Integration" (Claude Doc, 2026-10-07): https://claude.ai/code/artifact/d9a0e746-8712-4868-9057-c61d42e9f0c6 — sections *Integration design* and *Open questions and next steps*. Background: `guides/RUBRICS_GUIDE.md`, `plans/rubrics/RUBRICS_PLAN.md` §10.

## Global Constraints

- Repo: `/Users/caelebbalanesi/PROJ3/MJ`, branch off `next`: `git checkout -b feat/rubric-testing-computer-use next`. The working tree has untracked generated directories (`packages/GeneratedEntities/src/generated/entities/`, `packages/MJAPI/src/generated/graphql-schemas/`, `packages/MJExplorer/src/app/generated/Entities/`). Never `git add -A`; add named paths only.
- No schema change in any phase. No migration, no CodeGen.
- Package layering (do not invert): `@memberjunction/rubrics-base` ← `@memberjunction/rubrics` ← `@memberjunction/testing-engine` ← `@memberjunction/computer-use-engine` (MJComputerUse). `@memberjunction/computer-use` (packages/AI/ComputerUse) depends only on `@memberjunction/ai`, `core`, `global` and must stay free of MJ entities and app-specific strings (`no-app-specific-leaks.test.ts`).
- Workspace packages resolve through `node_modules` to each package's `dist`. After changing a package that another package imports, run `npm run build` in the changed package before running the importer's tests. Order: `packages/Rubrics/Engine` → `packages/TestingFramework/Engine` → `packages/AI/ComputerUse` → `packages/AI/MJComputerUse`.
- Tests: `cd <package> && npx vitest run src/__tests__/<file>.test.ts`. Whole package: `npm run test`. Build: `npm run build` (`packages/AI/ComputerUse` has a `prebuild` that regenerates `prompt-parts.generated.ts` from `metadata/prompts/templates/computer-use/_includes/`).
- Naming: public members PascalCase (`BuildOracleInput`, `ResolveRubricForRun`); pure helpers PascalCase exported functions; keep existing lowercase JSON field names that tests and stored data already use (`oracles`, `rubricId`, `criterion`, `met`).
- Comments: concise, describe what the code does now. JSDoc on exported functions and public methods.
- Metadata records: every new prompt record gets an uppercase `uuidgen` primary key and **no** `sync` block. Templates under `metadata/prompts/templates/...` referenced with `@file:`. Push with `mj sync push --dir=metadata --include="prompts"` from the MJ root against a configured database (verification only; unit tests do not need it).
- Commits: conventional (`feat(testing-engine): ...`), one per task, ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Each phase ends with a changeset file under `.changeset/` (format: YAML front matter naming packages with `minor`, then one paragraph).

---

## File map

| Phase | File | Responsibility |
| --- | --- | --- |
| 1 | `packages/TestingFramework/Engine/src/types.ts` | `OracleInput.subjectContent` |
| 1 | `packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts` | `BuildOracleInput`, `ResolveRubricForRun`, suite pin, rubric row readers |
| 1 | `packages/TestingFramework/Engine/src/oracles/rubric-resolution.ts` | `AgentRubricResolution`, `RubricJudgedConfig` |
| 1 | `packages/TestingFramework/Engine/src/oracles/RubricOracle.ts` | sends `subjectContent` |
| 1 | `packages/TestingFramework/Engine/src/drivers/{AgentEval,PromptEval,DecisionEval}Driver.ts` | use the base helpers |
| 1 | `packages/AI/MJComputerUse/src/test-driver/rubric-subject.ts` | `BuildRubricSubject`, `WithDefaultRubricEvaluator` |
| 1 | `packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts` | resolve rubric, pass subject |
| 2 | `packages/Rubrics/Engine/src/content.ts` | `RubricSubjectImage`, `images`, `SelectEvenly` |
| 2 | `packages/Rubrics/Engine/src/promptData.ts` | `BuildSubjectContent` (image blocks) |
| 2 | `packages/Rubrics/Engine/src/evaluatorServices.ts`, `LLMRubricEvaluator.ts`, `RubricEngine.ts`, `providerRecords.ts` | content blocks, frame evidence, test-run images |
| 2 | `metadata/prompts/templates/rubrics/rubric-evaluator.template.md` | frame evidence rule |
| 2 | `metadata/prompts/.rubric-judge-prompts.json`, `templates/rubrics/judges/computer-use.template.md` | vision judge |
| 2 | `packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts`, `types/results.ts` | post-action final frame |
| 2 | `packages/AI/MJComputerUse/src/test-driver/rubric-frames.ts` | `SelectRubricFrames` |
| 3 | `packages/AI/ComputerUse/src/types/{judge,params,controller}.ts`, `judge/{rubric,LLMJudge}.ts`, `engine/ComputerUseEngine.ts` | `RubricJudgeCriterion`, key and level in verdicts |
| 3 | `metadata/prompts/templates/computer-use/judge.template.md`, `_includes/judge-core.md` | rubric criteria block |
| 3 | `packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts` | passes `rubricCriteria` |
| 3 | `packages/AI/MJComputerUse/src/rubric/ComputerUseRubricEvaluator.ts` | `ComputerUse` evaluator |
| 3 | `packages/AI/MJComputerUse/src/test-driver/rubric-judge-criteria.ts`, `ComputerUseTestDriver.ts` | rubric leaves into the loop |

---

# Phase 1 — the rubric oracle runs in every driver

### Task 1: `OracleInput.subjectContent` and `BaseTestDriver.BuildOracleInput`

**Files:**
- Modify: `packages/TestingFramework/Engine/src/types.ts:331-368` (`OracleInput`)
- Modify: `packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts:100-115` (after the `_metadata` getter)
- Test: `packages/TestingFramework/Engine/src/__tests__/base-driver-oracle-input.test.ts`

**Interfaces:**
- Produces: `OracleInput.subjectContent?: RubricSubjectContent` (type from `@memberjunction/rubrics`); `protected BuildOracleInput(context: DriverExecutionContext, fields: Omit<OracleInput, 'test' | 'contextUser' | 'testRunId' | 'provider'>): OracleInput`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/TestingFramework/Engine/src/__tests__/base-driver-oracle-input.test.ts
import { describe, expect, it } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import type { DriverExecutionContext, OracleInput } from '../types';

class ProbeDriver extends BaseTestDriver {
    public async Execute(): Promise<never> {
        throw new Error('not used');
    }

    public input(context: DriverExecutionContext, fields: Omit<OracleInput, 'test' | 'contextUser' | 'testRunId' | 'provider'>): OracleInput {
        return this.BuildOracleInput(context, fields);
    }
}

const context = {
    test: { ID: 'test-1' },
    testRun: { ID: 'run-1' },
    contextUser: { ID: 'user-1' },
    options: {},
    oracleRegistry: new Map(),
} as unknown as DriverExecutionContext;

describe('BaseTestDriver.BuildOracleInput', () => {
    it('carries the test, the run, the user, and the driver provider', () => {
        const provider = { Entities: [] } as unknown as IMetadataProvider;
        const driver = new ProbeDriver();
        driver.Provider = provider;
        const input = driver.input(context, { expectedOutput: 'yes', actualOutput: 'no' });
        expect(input.test).toBe(context.test);
        expect(input.testRunId).toBe('run-1');
        expect(input.contextUser).toBe(context.contextUser);
        expect(input.provider).toBe(provider);
        expect(input.expectedOutput).toBe('yes');
        expect(input.actualOutput).toBe('no');
    });

    it('passes the target entity and the subject content through', () => {
        const driver = new ProbeDriver();
        driver.Provider = { Entities: [] } as unknown as IMetadataProvider;
        const target = { ID: 'agent-run' };
        const input = driver.input(context, { targetEntity: target, subjectContent: { text: 'transcript', data: { goal: 'g' } } });
        expect(input.targetEntity).toBe(target);
        expect(input.subjectContent).toEqual({ text: 'transcript', data: { goal: 'g' } });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/base-driver-oracle-input.test.ts`
Expected: FAIL — `this.BuildOracleInput is not a function` and a type error on `subjectContent`.

- [ ] **Step 3: Add the field and the helper**

In `types.ts`, add the import at the top with the other type imports and the field at the end of `OracleInput`:

```ts
import type { RubricSubjectContent } from '@memberjunction/rubrics';
```

```ts
  /**
   * What a rubric judge reads about this run. When set, the rubric oracle sends it
   * instead of the raw expected and actual output.
   */
  subjectContent?: RubricSubjectContent;
```

In `BaseTestDriver.ts`, add `OracleInput` to the `'../types'` import, and add after the `_metadata` getter:

```ts
    /**
     * The input every oracle receives: the test, the run, the user, this driver's
     * provider, and the fields the caller supplies.
     */
    protected BuildOracleInput(
        context: DriverExecutionContext,
        fields: Omit<OracleInput, 'test' | 'contextUser' | 'testRunId' | 'provider'>
    ): OracleInput {
        return {
            test: context.test,
            contextUser: context.contextUser,
            testRunId: context.testRun.ID,
            provider: this.Provider ?? undefined,
            ...fields,
        };
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/base-driver-oracle-input.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/TestingFramework/Engine/src/types.ts packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts packages/TestingFramework/Engine/src/__tests__/base-driver-oracle-input.test.ts
git commit -m "feat(testing-engine): build oracle input in the base driver with the provider and subject content

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `RubricOracle` sends the driver's subject content

**Files:**
- Modify: `packages/TestingFramework/Engine/src/oracles/RubricOracle.ts:6-24` (engine type) and `:48-61` (`evaluate`)
- Test: `packages/TestingFramework/Engine/src/__tests__/rubric-oracle-content.test.ts`

**Interfaces:**
- Consumes: `OracleInput.subjectContent` (Task 1).
- Produces: `RubricOracleEngine.EvaluateRecord(...).content?: RubricSubjectContent`.

- [ ] **Step 1: Write the failing test** — add to `rubric-oracle-content.test.ts` inside the existing `describe`:

```ts
    it('sends the driver subject content when the driver supplies it', async () => {
        const seen: { content?: unknown }[] = [];
        const oracle = new RubricOracle({
            async EvaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval', score: 1, outcome: 'Passed', criteria: [] };
            },
        });
        await oracle.evaluate({
            test: { ID: 'test' } as never,
            actualOutput: { finalScreenshot: 'AAAA' },
            subjectContent: { text: 'Step 1: opened the page', data: { goal: 'open the page' } },
            testRunId: 'run',
            contextUser: { ID: 'user' } as never,
        }, { rubricId: 'rubric' });
        expect(seen[0].content).toEqual({ text: 'Step 1: opened the page', data: { goal: 'open the page' } });
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/rubric-oracle-content.test.ts`
Expected: FAIL — content contains `actualOutput: { finalScreenshot: 'AAAA' }`.

- [ ] **Step 3: Use the subject content**

In `RubricOracle.ts`, change the engine type's `content` field and import the type:

```ts
import type { RubricSubjectContent } from '@memberjunction/rubrics';
// in RubricOracleEngine.EvaluateRecord input:
        content?: RubricSubjectContent;
```

In `evaluate`, replace `content: RubricOracleContent(input),` with:

```ts
            content: input.subjectContent ?? RubricOracleContent(input),
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/rubric-oracle-content.test.ts src/__tests__/rubric-resolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/TestingFramework/Engine/src/oracles/RubricOracle.ts packages/TestingFramework/Engine/src/__tests__/rubric-oracle-content.test.ts
git commit -m "feat(testing-engine): rubric oracle sends the driver's subject content when present

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Rubric resolution moves into `BaseTestDriver`

**Files:**
- Modify: `packages/TestingFramework/Engine/src/oracles/rubric-resolution.ts` (add two interfaces)
- Modify: `packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts` (imports, `SetupSuite` at `:400`, new methods)
- Modify: `packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts:25` (type), `:860-1000` (remove moved members, keep `WithResolvedRubric` and `LoadAgentEvaluationRubric`)
- Modify: `packages/TestingFramework/Engine/src/__tests__/agent-eval-rubric-driver.test.ts:130-152` and `:175-183`
- Test: `packages/TestingFramework/Engine/src/__tests__/base-driver-rubric-resolution.test.ts`

**Interfaces:**
- Produces (in `rubric-resolution.ts`):
  ```ts
  export interface AgentRubricResolution { rubricId: string; evaluatorConfig?: Record<string, unknown> | string; }
  export interface RubricJudgedConfig { oracles?: OracleConfigLike[]; scoringWeights?: Record<string, number>; }
  ```
- Produces (on `BaseTestDriver`, all `protected` unless noted):
  `public SetupSuite(context, contextUser)` pins the suite rubric; `ResolveRubricForRun<T extends RubricJudgedConfig>(config: T, context: DriverExecutionContext, agentRubric?: AgentRubricResolution): Promise<T>`; `LoadSuites(context)`; `LookupLatestPublished(context, rubricId)`; `LookupVersionLabel(context, versionId)`; `ReadOne(context, entityName, filter)`; `ReadMany(context, entityName, filter, maxRows = 100)`.
- Behavior change: when the resolved rubric has no Published version and the source is not an explicit `rubric` oracle, no oracle is added and a `warn` line is logged.

- [ ] **Step 1: Write the failing test**

```ts
// packages/TestingFramework/Engine/src/__tests__/base-driver-rubric-resolution.test.ts
import { describe, expect, it } from 'vitest';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import type { RubricJudgedConfig } from '../oracles/rubric-resolution';
import type { DriverExecutionContext, SuiteFixtureContext } from '../types';

class Probe extends BaseTestDriver {
    public latest: { id: string; label: string } | undefined = { id: 'version-4', label: '1.2.0' };
    public warnings: string[] = [];

    public async Execute(): Promise<never> {
        throw new Error('not used');
    }

    public resolve<T extends RubricJudgedConfig>(config: T, context: DriverExecutionContext): Promise<T> {
        return this.ResolveRubricForRun(config, context);
    }

    public start(fixtures: SuiteFixtureContext): Promise<void> {
        return this.SetupSuite(fixtures, {} as never);
    }

    protected override async ReadOne(_context: DriverExecutionContext, entityName: string): Promise<Record<string, unknown> | undefined> {
        return entityName === 'MJ: Test Suite Runs' ? { ID: 'suite-run', SuiteID: 'child' } : undefined;
    }

    protected override async ReadMany(_context: DriverExecutionContext, entityName: string): Promise<Record<string, unknown>[]> {
        return entityName === 'MJ: Test Suites'
            ? [{ ID: 'child', ParentID: 'parent', RubricID: null }, { ID: 'parent', ParentID: null, RubricID: 'parent-rubric' }]
            : [];
    }

    protected override async LookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
        return this.latest;
    }

    protected override logToTestRun(_context: DriverExecutionContext, level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
        if (level === 'warn') this.warnings.push(message);
    }
}

function context(overrides: Record<string, unknown> = {}): DriverExecutionContext {
    return {
        test: { ID: 'test', RubricID: null },
        testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
        options: {},
        contextUser: {},
        oracleRegistry: new Map(),
        ...overrides,
    } as unknown as DriverExecutionContext;
}

describe('BaseTestDriver rubric resolution', () => {
    it('adds the suite rubric, pinned to the published version, to any driver config', async () => {
        const resolved = await new Probe().resolve({ oracles: [{ type: 'exact-match' }] }, context());
        expect(resolved.oracles).toEqual([
            { type: 'exact-match' },
            { type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } },
        ]);
        expect(resolved.scoringWeights).toEqual({ rubric: 1 });
    });

    it('adds nothing and warns when the rubric has no published version', async () => {
        const driver = new Probe();
        driver.latest = undefined;
        const config = { oracles: [{ type: 'llm-judge', config: { criteria: ['Accurate'] } }] };
        const resolved = await driver.resolve(config, context({ test: { ID: 'test', RubricID: 'draft-rubric' } }));
        expect(resolved).toEqual(config);
        expect(driver.warnings).toEqual(['Rubric draft-rubric has no published version. The rubric oracle was not added.']);
    });

    it('keeps an explicit rubric oracle even without a published version', async () => {
        const driver = new Probe();
        driver.latest = undefined;
        const resolved = await driver.resolve({ oracles: [{ type: 'rubric', config: { rubricId: 'draft-rubric' } }] }, context());
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'draft-rubric' } }]);
        expect(driver.warnings).toEqual([]);
    });

    it('pins the suite rubric version on the fixture before the first test', async () => {
        const driver = new Probe();
        const fixtures: SuiteFixtureContext = { SuiteRunID: 'suite-run', Data: {}, CreatedRecords: [] };
        await driver.start(fixtures);
        expect(fixtures.PinnedRubricVersions?.['parent-rubric']).toEqual({ id: 'version-4', label: '1.2.0' });
        driver.latest = { id: 'version-9', label: '9.0.0' };
        const resolved = await driver.resolve({ oracles: [] }, context({ fixtures }));
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } }]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/base-driver-rubric-resolution.test.ts`
Expected: FAIL — `ResolveRubricForRun` does not exist.

- [ ] **Step 3: Add the interfaces to `rubric-resolution.ts`** (after `RubricSuiteRow`):

```ts
/** The agent's default Evaluation rubric and the evaluator its link names. */
export interface AgentRubricResolution {
    rubricId: string;
    evaluatorConfig?: Record<string, unknown> | string;
}

/** The part of a driver config that rubric resolution reads and rewrites. */
export interface RubricJudgedConfig {
    oracles?: OracleConfigLike[];
    scoringWeights?: Record<string, number>;
}
```

`OracleConfigLike` is declared later in the same file; move the two new interfaces below it so the reference is in source order.

- [ ] **Step 4: Move the resolution into `BaseTestDriver.ts`**

Add imports:

```ts
import { RunView } from '@memberjunction/core';          // add to the existing '@memberjunction/core' import
import { MJLruCache } from '@memberjunction/global';
import {
    EnsureImplicitRubricOracle,
    PublishedVersionPin,
    ResolveRubric,
    WeightsForImplicitRubric,
    type AgentRubricResolution,
    type RubricJudgedConfig,
    type RubricSuiteRow,
} from '../oracles/rubric-resolution';
```

Add fields after `_provider`:

```ts
    private readonly versionPins = new PublishedVersionPin();
    private readonly versionLabels = new MJLruCache<string, string>({ maxSize: 5000, ttlMs: 6 * 60 * 60 * 1000 });
```

Replace the body of the existing no-op `SetupSuite` (`:400`) — keep its JSDoc, add one sentence "Pins the suite chain's rubric to its latest Published version on `context.PinnedRubricVersions`. Overrides must call `super.SetupSuite` first.":

```ts
    public async SetupSuite(context: SuiteFixtureContext, contextUser: UserInfo): Promise<void> {
        const execution = {
            contextUser,
            fixtures: context,
            test: { ID: '' },
            testRun: { ID: context.SuiteRunID, TestSuiteRunID: context.SuiteRunID },
            options: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const loaded = await this.LoadSuites(execution);
        const choice = ResolveRubric({ suites: loaded.suites, suiteId: loaded.suiteId });
        if (!choice.RubricId || context.PinnedRubricVersions?.[choice.RubricId]) return;
        const found = await this.LookupLatestPublished(execution, choice.RubricId);
        if (!found) return;
        context.PinnedRubricVersions = { ...context.PinnedRubricVersions, [choice.RubricId]: found };
    }
```

Add the resolver and the readers (new section after `TeardownSuite`):

```ts
    /**
     * Adds the rubric oracle for this run. The first source that names a rubric wins: the
     * run flag, a rubric oracle's own config, the test, the suite chain, then the agent
     * default the caller passes. The Published version is pinned for the suite run. A rubric
     * with no Published version adds nothing unless a rubric oracle named it itself.
     */
    protected async ResolveRubricForRun<T extends RubricJudgedConfig>(
        config: T,
        context: DriverExecutionContext,
        agentRubric?: AgentRubricResolution
    ): Promise<T> {
        const named = config.oracles?.find(oracle => oracle.type === 'rubric')?.config as
            { rubricId?: string; rubricVersionId?: string; evaluator?: Record<string, unknown> | string } | undefined;
        const loaded = await this.LoadSuites(context);
        const choice = ResolveRubric({
            run: context.options.rubricId ? { rubricId: context.options.rubricId, versionId: context.options.rubricVersionId } : undefined,
            oracle: named,
            testRubricId: context.test.RubricID,
            suites: loaded.suites,
            suiteId: loaded.suiteId,
            agentRubricId: agentRubric?.rubricId,
            agentEvaluatorConfig: agentRubric?.evaluatorConfig,
        });
        if (!choice.RubricId) return config;
        const hadRubric = (config.oracles ?? []).some(oracle => oracle.type === 'rubric');
        const suiteRunId = (context.testRun as { TestSuiteRunID?: string }).TestSuiteRunID || context.testRun.ID;
        const labelKey = `${suiteRunId}:${choice.RubricId}`;
        let versionId: string | undefined;
        let versionLabel: string | undefined;
        if (choice.ExplicitVersion && choice.VersionId) {
            versionId = choice.VersionId;
            versionLabel = await this.LookupVersionLabel(context, choice.VersionId);
        } else {
            const pinned = context.fixtures?.PinnedRubricVersions?.[choice.RubricId];
            if (pinned) {
                versionId = pinned.id;
                versionLabel = pinned.label;
            } else {
                versionId = await this.versionPins.Remember(suiteRunId, choice.RubricId, undefined, async () => {
                    const found = await this.LookupLatestPublished(context, choice.RubricId!);
                    if (found) this.versionLabels.Set(labelKey, found.label);
                    return found?.id;
                });
                versionLabel = this.versionLabels.Get(labelKey);
                if (versionId && context.fixtures) {
                    context.fixtures.PinnedRubricVersions = {
                        ...context.fixtures.PinnedRubricVersions,
                        [choice.RubricId]: { id: versionId, label: versionLabel ?? '' },
                    };
                }
            }
        }
        if (!versionId && choice.Source !== 'oracle') {
            this.logToTestRun(context, 'warn', `Rubric ${choice.RubricId} has no published version. The rubric oracle was not added.`);
            return config;
        }
        const oracles = EnsureImplicitRubricOracle(config.oracles, choice, versionId, versionLabel);
        const addedImplicit = oracles.length > (config.oracles?.length ?? 0) && !hadRubric;
        return { ...config, oracles, scoringWeights: WeightsForImplicitRubric(config.scoringWeights, addedImplicit) } as T;
    }

    /**
     * The suites of this run, loaded once. The suite id comes from the run's Test Suite Run.
     * ResolveRubric walks ParentID over these rows in memory.
     */
    protected async LoadSuites(context: DriverExecutionContext): Promise<{ suiteId?: string; suites: RubricSuiteRow[] }> {
        const suiteRunId = context.testRun.TestSuiteRunID;
        if (!suiteRunId) return { suites: [] };
        const suiteRun = await this.ReadOne(context, 'MJ: Test Suite Runs', `ID='${suiteRunId.replace(/'/g, "''")}'`);
        const suiteId = suiteRun?.SuiteID == null || suiteRun.SuiteID === '' ? undefined : String(suiteRun.SuiteID);
        if (!suiteId) return { suites: [] };
        const rows = await this.ReadMany(context, 'MJ: Test Suites', '', 5000);
        return {
            suiteId,
            suites: rows.map(row => ({
                Id: String(row.ID ?? ''),
                ParentId: row.ParentID == null ? null : String(row.ParentID),
                RubricId: row.RubricID == null ? null : String(row.RubricID),
            })).filter(row => row.Id.length > 0),
        };
    }

    /** The latest Published version of a rubric, by Major.Minor.Patch. */
    protected async LookupLatestPublished(context: DriverExecutionContext, rubricId: string): Promise<{ id: string; label: string } | undefined> {
        const rows = await this.ReadMany(context, 'MJ: Rubric Versions', `RubricID='${rubricId}' AND Status='Published'`);
        const best = [...rows].sort((a, b) =>
            Number(b.MajorVersion ?? 0) - Number(a.MajorVersion ?? 0)
            || Number(b.MinorVersion ?? 0) - Number(a.MinorVersion ?? 0)
            || Number(b.PatchVersion ?? 0) - Number(a.PatchVersion ?? 0))[0];
        if (!best) return undefined;
        return { id: String(best.ID), label: `${best.MajorVersion ?? 0}.${best.MinorVersion ?? 0}.${best.PatchVersion ?? 0}` };
    }

    /** Major.Minor.Patch of one version. Does not change the suite pin. */
    protected async LookupVersionLabel(context: DriverExecutionContext, versionId: string): Promise<string | undefined> {
        const row = await this.ReadOne(context, 'MJ: Rubric Versions', `ID='${versionId}'`);
        if (!row) return undefined;
        return `${row.MajorVersion ?? 0}.${row.MinorVersion ?? 0}.${row.PatchVersion ?? 0}`;
    }

    protected async ReadOne(context: DriverExecutionContext, entityName: string, filter: string): Promise<Record<string, unknown> | undefined> {
        const rows = await this.ReadMany(context, entityName, filter);
        return rows[0];
    }

    protected async ReadMany(context: DriverExecutionContext, entityName: string, filter: string, maxRows = 100): Promise<Record<string, unknown>[]> {
        const provider = this.Provider;
        if (!provider) throw new Error(`Could not read ${entityName}.`);
        const view = RunView.FromMetadataProvider(provider);
        const found = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: maxRows }, context.contextUser);
        if (!found.Success) throw new Error(found.ErrorMessage || `Could not read ${entityName}.`);
        return (found.Results ?? []) as Record<string, unknown>[];
    }
```

- [ ] **Step 5: Slim `AgentEvalDriver.ts`**

1. Replace the local `AgentRubricResolution` interface (`:25`) with a re-export so the existing test import keeps working:
   ```ts
   export type { AgentRubricResolution } from '../oracles/rubric-resolution';
   import type { AgentRubricResolution } from '../oracles/rubric-resolution';
   ```
2. Delete `versionPins`, `versionLabels`, the `SetupSuite` override (`:868-884`), `LoadSuites`, `LookupLatestPublished`, `LookupVersionLabel`, `ReadOne`, `ReadMany` (`:938-999`). Keep `LoadAgentEvaluationRubric`.
3. Replace `WithResolvedRubric` (`:886-931`) with:
   ```ts
    /** The agent's default Evaluation rubric is the last source. */
    protected async WithResolvedRubric(config: AgentEvalConfig, context: DriverExecutionContext): Promise<AgentEvalConfig> {
        const agentRubric = context.options.agentEvaluationRubricId
            ? { rubricId: context.options.agentEvaluationRubricId }
            : await this.LoadAgentEvaluationRubric(context, config.agentId);
        return this.ResolveRubricForRun(config, context, agentRubric);
    }
   ```
4. Replace both `OracleInput` literals (`:1101-1116` and `:1163-1170`) with `this.BuildOracleInput(context, { expectedOutput: expected, actualOutput: ..., targetEntity: ... })`, keeping the same `actualOutput` and `targetEntity` values.
5. Remove now-unused imports (`MJLruCache`, `PublishedVersionPin`, `EnsureImplicitRubricOracle`, `ResolveRubric`, `WeightsForImplicitRubric`, `RunView` if nothing else uses it). `npm run build` reports any leftover.

- [ ] **Step 6: Update the two AgentEval tests**

In `agent-eval-rubric-driver.test.ts`, test "keeps the inline judge when the resolved rubric has no published version" (`:130-152`): rename it to `'adds no rubric oracle when the resolved rubric has no published version'` and change the expectation to:

```ts
        expect(resolved.oracles).toEqual([{ type: 'llm-judge', config: { criteria: ['Accurate'] } }]);
```

In test "refuses a failed view instead of treating it as no rows" (`:175-183`), the `if (!found.Success)` text now lives in the base driver:

```ts
        const base = readFileSync(join(directory, '../drivers/BaseTestDriver.ts'), 'utf8');
        expect(base).toContain('if (!found.Success)');
        expect(base).not.toMatch(/new RunView\(\)/);
```

Keep the `calibration` assertions and the `driver` `not.toMatch(/new RunView\(\)/)` assertion; drop `expect(driver).toContain('if (!found.Success)')`.

- [ ] **Step 7: Run the engine tests**

Run: `cd packages/TestingFramework/Engine && npm run build && npm run test`
Expected: PASS. `base-driver-rubric-resolution.test.ts` (4), `agent-eval-rubric-driver.test.ts`, `rubric-resolution.test.ts` all green.

- [ ] **Step 8: Commit**

```bash
git add packages/TestingFramework/Engine/src/oracles/rubric-resolution.ts packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts packages/TestingFramework/Engine/src/__tests__/base-driver-rubric-resolution.test.ts packages/TestingFramework/Engine/src/__tests__/agent-eval-rubric-driver.test.ts
git commit -m "feat(testing-engine): resolve and pin the rubric in the base driver for every test type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Prompt Eval and Decision Eval use the base resolution

**Files:**
- Modify: `packages/TestingFramework/Engine/src/drivers/PromptEvalDriver.ts:140-182` (`Execute`) and `:428-472` (`runOracles`)
- Modify: `packages/TestingFramework/Engine/src/drivers/DecisionEvalDriver.ts:433-466` (`runOracles`)
- Modify: `packages/TestingFramework/Engine/src/__tests__/rubric-resolution.test.ts:24-40`

**Interfaces:**
- Consumes: `ResolveRubricForRun`, `BuildOracleInput` (Tasks 1, 3).

- [ ] **Step 1: Update the source assertion test first**

In `rubric-resolution.test.ts`, the first test reads driver sources. Replace the two regexes so the test fails until the drivers change:

```ts
        for (const file of ['../drivers/PromptEvalDriver.ts', '../drivers/DecisionEvalDriver.ts']) {
            const source = readFileSync(join(directory, file), 'utf8');
            expect(source).toMatch(/ResolveRubricForRun\(/);
            expect(source).toMatch(/BuildOracleInput\(/);
        }
        const computerUse = readFileSync(join(directory, '../../../../AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts'), 'utf8');
        expect(computerUse).toMatch(/ResolveRubricForRun\(/);
        expect(computerUse).toMatch(/BuildOracleInput\(/);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/rubric-resolution.test.ts`
Expected: FAIL on the first `toMatch`.

- [ ] **Step 3: PromptEvalDriver**

In `Execute`, after `const config = this.parseConfig<PromptEvalConfig>(context.test);` add:

```ts
        const judged = await this.ResolveRubricForRun(config, context);
```

Then use `judged` in the two places that read oracle settings: `this.runOracles(judged, actualOutput, result, expected, context)` and `score: this.calculateScore(oracleResults, judged.scoringWeights)`. Everything else keeps `config`.

In `runOracles`, delete the `OraclesWithNamedRubric(...)` block and iterate `config.oracles ?? []`:

```ts
        for (const oracleConfig of config.oracles ?? []) {
```

Replace the `OracleInput` literal with:

```ts
            const oracleInput = this.BuildOracleInput(context, { expectedOutput: expected, actualOutput, targetEntity: result.promptRun });
```

Remove the `OraclesWithNamedRubric` import if unused. If `PromptEvalConfig.oracles` is declared without `scoringWeights`, add `scoringWeights?: Record<string, number>;` to the interface (it is read at `:171` already, so it exists).

- [ ] **Step 4: DecisionEvalDriver**

In `runOracles` (`:433`), replace the `OraclesWithNamedRubric(...)` block with:

```ts
        const judged = await this.ResolveRubricForRun(test.Config, context);
        for (const spec of judged.oracles ?? []) {
```

and the `OracleInput` literal with:

```ts
            const oracleInput = this.BuildOracleInput(context, { expectedOutput: test.Expected, actualOutput: actual, targetEntity: result?.promptRun });
```

Leave `oracleWeights(test.Config)` as is (per-oracle weights stay a Decision Eval feature; an implicit rubric scores 0 there, which this plan does not change).

- [ ] **Step 5: Run the tests**

Run: `cd packages/TestingFramework/Engine && npm run build && npm run test`
Expected: all PASS except the `computerUse` assertions in `rubric-resolution.test.ts`, which pass after Task 6. (Run that file again after Task 6.)

- [ ] **Step 6: Commit**

```bash
git add packages/TestingFramework/Engine/src/drivers/PromptEvalDriver.ts packages/TestingFramework/Engine/src/drivers/DecisionEvalDriver.ts packages/TestingFramework/Engine/src/__tests__/rubric-resolution.test.ts
git commit -m "feat(testing-engine): prompt and decision eval drivers resolve rubrics through the base driver

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `BuildRubricSubject` — the computer use transcript

**Files:**
- Create: `packages/AI/MJComputerUse/src/test-driver/rubric-subject.ts`
- Test: `packages/AI/MJComputerUse/src/__tests__/rubric-subject.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RubricSubjectImage { label: string; mimeType: string; data: string }
  export interface RubricSubject { text: string; data: Record<string, unknown>; images?: RubricSubjectImage[] }
  export function BuildRubricSubject(input: ComputerUseTestInput, expected: ComputerUseExpectedOutcomes, actualOutput: Record<string, unknown>, images?: RubricSubjectImage[]): RubricSubject
  export function CompactUrl(url: string | undefined): string
  export const COMPUTER_USE_RUBRIC_JUDGE = 'Rubric Judge - Computer Use'
  export function WithDefaultRubricEvaluator<T extends { oracles?: { type: string; config?: Record<string, unknown> }[] }>(config: T, evaluator: Record<string, unknown>): T
  ```
  `RubricSubject` is structurally a `RubricSubjectContent`; this package does not import `@memberjunction/rubrics` until phase 3.

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/MJComputerUse/src/__tests__/rubric-subject.test.ts
import { describe, expect, it } from 'vitest';
import { BuildRubricSubject, WithDefaultRubricEvaluator } from '../test-driver/rubric-subject.js';
import type { ComputerUseExpectedOutcomes, ComputerUseTestInput } from '../test-driver/types.js';

const input: ComputerUseTestInput = { goal: 'Open the Users list', startUrl: 'http://localhost:4200/home' };
const expected: ComputerUseExpectedOutcomes = { judgeValidationCriteria: ['The Users grid is visible'] };

function output(steps: number): Record<string, unknown> {
    return {
        success: true,
        status: 'Completed',
        totalSteps: steps,
        totalDurationMs: 1234,
        finalUrl: 'http://localhost:4200/users',
        finalScreenshot: 'A'.repeat(50_000),
        interactiveElements: [{ role: 'button', name: 'Save', selector: '#save' }],
        criteriaVerdicts: [{ criterion: 'The Users grid is visible', met: true, evidence: 'Grid with 12 rows' }],
        finalJudgeVerdict: { Done: true, Confidence: 1, Reason: 'All 1 criteria met.' },
        stepHistory: Array.from({ length: steps }, (_, i) => ({
            stepNumber: i + 1,
            url: `http://localhost:4200/page${i + 1}?tab=a`,
            reasoning: `Reason ${i + 1}`,
            actionsCount: 2,
            hadError: i === 2,
            judgeVerdict: i === steps - 1 ? { Done: true, Confidence: 1 } : undefined,
        })),
    };
}

describe('BuildRubricSubject', () => {
    it('writes a step transcript and leaves the screenshot and elements out', () => {
        const subject = BuildRubricSubject(input, expected, output(4));
        expect(subject.text).toContain('Goal: Open the Users list');
        expect(subject.text).toContain('Step 3 [/page3?tab=a]: Reason 3 -> 2 action(s) [ERROR]');
        expect(subject.text).toContain('Step 4 [/page4?tab=a]: Reason 4 -> 2 action(s) [judge: done=true]');
        expect(subject.text).toContain('Judge: done=true. All 1 criteria met.');
        expect(subject.text).not.toContain('AAAA');
        expect(subject.data).not.toHaveProperty('finalScreenshot');
        expect(subject.data).not.toHaveProperty('interactiveElements');
        expect(subject.data).not.toHaveProperty('stepHistory');
        expect(subject.data.criteriaVerdicts).toEqual([{ criterion: 'The Users grid is visible', met: true, evidence: 'Grid with 12 rows' }]);
        expect(subject.data.expectedOutcomes).toEqual({ judgeValidationCriteria: ['The Users grid is visible'] });
        expect(subject.images).toBeUndefined();
    });

    it('keeps the first and last steps of a long run inside the budget', () => {
        const subject = BuildRubricSubject(input, expected, output(120));
        expect(subject.text).toContain('Step 1 [');
        expect(subject.text).toContain('Step 120 [');
        expect(subject.text).toContain('... 80 step(s) omitted ...');
        expect(subject.text).not.toContain('Step 60 [');
        expect(subject.text.length + JSON.stringify(subject.data).length).toBeLessThan(24_000);
    });

    it('attaches the frames it is given', () => {
        const subject = BuildRubricSubject(input, expected, output(1), [{ label: 'final', mimeType: 'image/png', data: 'QUJD' }]);
        expect(subject.images).toEqual([{ label: 'final', mimeType: 'image/png', data: 'QUJD' }]);
    });
});

describe('WithDefaultRubricEvaluator', () => {
    it('fills the evaluator only on a rubric oracle that has none', () => {
        const judge = { EvaluatorType: 'AIPrompt', PromptName: 'Rubric Judge - Computer Use' };
        const config = { oracles: [
            { type: 'url-match' },
            { type: 'rubric', config: { rubricId: 'r1' } },
            { type: 'rubric', config: { rubricId: 'r2', evaluator: { EvaluatorName: 'Decision' } } },
        ] };
        expect(WithDefaultRubricEvaluator(config, judge).oracles).toEqual([
            { type: 'url-match' },
            { type: 'rubric', config: { rubricId: 'r1', evaluator: judge } },
            { type: 'rubric', config: { rubricId: 'r2', evaluator: { EvaluatorName: 'Decision' } } },
        ]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/rubric-subject.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
// packages/AI/MJComputerUse/src/test-driver/rubric-subject.ts
import type { ComputerUseExpectedOutcomes, ComputerUseTestInput } from './types.js';

/** One frame a rubric judge may look at. `data` is base64 with no data-URL prefix. */
export interface RubricSubjectImage {
    label: string;
    mimeType: string;
    data: string;
}

/** What a rubric judge reads about a computer use run: a step transcript, the run facts, and chosen frames. */
export interface RubricSubject {
    text: string;
    data: Record<string, unknown>;
    images?: RubricSubjectImage[];
}

/** The judge prompt shipped for computer use runs. */
export const COMPUTER_USE_RUBRIC_JUDGE = 'Rubric Judge - Computer Use';

const MAX_TRANSCRIPT_STEPS = 40;
const MAX_TEXT_LENGTH = 20_000;

interface StepSummary {
    stepNumber?: number;
    url?: string;
    reasoning?: string;
    actionsCount?: number;
    hadError?: boolean;
    judgeVerdict?: { Done?: boolean; Confidence?: number };
}

/** Builds the subject from the driver's actual output. The screenshot, element list and raw step history stay out. */
export function BuildRubricSubject(
    input: ComputerUseTestInput,
    expected: ComputerUseExpectedOutcomes,
    actualOutput: Record<string, unknown>,
    images?: RubricSubjectImage[]
): RubricSubject {
    const steps = Array.isArray(actualOutput.stepHistory) ? actualOutput.stepHistory as StepSummary[] : [];
    const lines = [
        `Goal: ${input.goal}`,
        `Start URL: ${input.startUrl ?? '(none)'}`,
        `Status: ${String(actualOutput.status ?? 'unknown')} (success: ${String(actualOutput.success ?? false)})`,
        `Final URL: ${String(actualOutput.finalUrl ?? '')}`,
        `Steps: ${steps.length}`,
        '',
        ...transcriptLines(steps),
    ];
    const verdict = actualOutput.finalJudgeVerdict as { Done?: boolean; Reason?: string } | undefined;
    if (verdict) lines.push('', `Judge: done=${String(verdict.Done)}. ${verdict.Reason ?? ''}`.trim());
    if (images && images.length > 0) lines.push('', `Frames attached: ${images.map(image => image.label).join(', ')}`);
    const data: Record<string, unknown> = {
        goal: input.goal,
        startUrl: input.startUrl,
        expectedOutcomes: {
            judgeValidationCriteria: expected.judgeValidationCriteria,
            finalUrlPattern: expected.finalUrlPattern,
            maxSteps: expected.maxSteps,
        },
        status: actualOutput.status,
        success: actualOutput.success,
        finalUrl: actualOutput.finalUrl,
        totalSteps: actualOutput.totalSteps,
        totalDurationMs: actualOutput.totalDurationMs,
        authDetourCount: actualOutput.authDetourCount,
        failureReason: actualOutput.failureReason,
        failureMemo: actualOutput.failureMemo,
        criteriaVerdicts: actualOutput.criteriaVerdicts,
        finalJudgeVerdict: actualOutput.finalJudgeVerdict,
        finalJudgePromptRunId: actualOutput.finalJudgePromptRunId,
        error: actualOutput.error,
    };
    const diagnostics = actualOutput.browserDiagnostics;
    if (Array.isArray(diagnostics) && diagnostics.length > 0) data.browserDiagnostics = diagnostics.slice(0, 20);
    const subject: RubricSubject = { text: fitText(lines.join('\n'), MAX_TEXT_LENGTH), data: withoutUndefined(data) };
    if (images && images.length > 0) subject.images = images;
    return subject;
}

/** Sets `evaluator` on each rubric oracle that has none. */
export function WithDefaultRubricEvaluator<T extends { oracles?: { type: string; config?: Record<string, unknown> }[] }>(config: T, evaluator: Record<string, unknown>): T {
    const oracles = (config.oracles ?? []).map(oracle =>
        oracle.type === 'rubric' && oracle.config?.evaluator === undefined
            ? { ...oracle, config: { ...oracle.config, evaluator } }
            : oracle);
    return { ...config, oracles };
}

/** Path and query of a URL. A string that is not a URL is returned as is. */
export function CompactUrl(url: string | undefined): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return url;
    }
}

function transcriptLines(steps: StepSummary[]): string[] {
    const line = (step: StepSummary): string => {
        const verdict = step.judgeVerdict ? ` [judge: done=${String(step.judgeVerdict.Done)}]` : '';
        const error = step.hadError ? ' [ERROR]' : '';
        return `Step ${step.stepNumber ?? '?'} [${CompactUrl(step.url)}]: ${step.reasoning || 'No reasoning'} -> ${step.actionsCount ?? 0} action(s)${error}${verdict}`;
    };
    if (steps.length <= MAX_TRANSCRIPT_STEPS) return steps.map(line);
    const half = MAX_TRANSCRIPT_STEPS / 2;
    return [
        ...steps.slice(0, half).map(line),
        `... ${steps.length - MAX_TRANSCRIPT_STEPS} step(s) omitted ...`,
        ...steps.slice(-half).map(line),
    ];
}

function fitText(text: string, room: number): string {
    if (text.length <= room) return text;
    const note = '\n[transcript cut to the prompt budget]';
    return text.slice(0, room - note.length) + note;
}

function withoutUndefined(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
```

- [ ] **Step 4: Run the test**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/rubric-subject.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/AI/MJComputerUse/src/test-driver/rubric-subject.ts packages/AI/MJComputerUse/src/__tests__/rubric-subject.test.ts
git commit -m "feat(computer-use-engine): build a compact rubric subject from a computer use run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The computer use driver resolves the rubric and passes the subject

**Files:**
- Modify: `packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts:55-62` (imports), `:357-420` (`Execute` step 5), `:1598-1636` (`runOracles`), `:1642-1697` (`runSingleOracle`)
- Modify: `packages/AI/MJComputerUse/src/index.ts` (export the new module)
- Modify: `packages/TestingFramework/Engine/README.md:115`, `guides/RUBRICS_GUIDE.md` §3 "Which rubric judges a run"
- Create: `.changeset/rubric-oracle-every-driver.md`

**Interfaces:**
- Consumes: `ResolveRubricForRun`, `BuildOracleInput` (Tasks 1, 3), `BuildRubricSubject` (Task 5).

- [ ] **Step 1: Run the source assertion test to see it fail for computer use**

Run: `cd packages/TestingFramework/Engine && npx vitest run src/__tests__/rubric-resolution.test.ts`
Expected: FAIL on `expect(computerUse).toMatch(/ResolveRubricForRun\(/)`.

- [ ] **Step 2: Rewire the driver**

Imports: remove `OraclesWithNamedRubric` from the `@memberjunction/testing-engine` import; add

```ts
import { BuildRubricSubject, type RubricSubject } from './rubric-subject.js';
```

In `Execute`, step 5 (`:357-363`): resolve once and score with the resolved weights:

```ts
            // 5. Run oracles
            this.logToTestRun(context, 'info', 'Running oracles for evaluation');
            const judged = await this.ResolveRubricForRun(config, context);
            const oracleResults = await this.runOracles(judged, input, expected, actualOutput, context);

            const { gating, score } = this.scoreOracleResults(oracleResults, judged.scoringWeights);
```

In `runOracles`, replace the `OraclesWithNamedRubric(...)` call with:

```ts
        const oracleConfigs = config.oracles ?? [];
        const subject = BuildRubricSubject(input, expected, actualOutput);
```

and pass the subject through: `this.runSingleOracle(oracleConfig, expected, actualOutput, subject, context)`. Change `runSingleOracle`'s signature to `(oracleConfig, expected, actualOutput, subject: RubricSubject, context)` and replace the `OracleInput` literal with:

```ts
            const oracleInput = this.BuildOracleInput(context, { expectedOutput: expected, actualOutput, subjectContent: subject });
```

`InlineVerdictIsAdvisory(config)` keeps reading the config passed in (now `judged`).

In `index.ts`, add under the test driver exports:

```ts
export * from './test-driver/rubric-subject.js';
```

- [ ] **Step 3: Build and run both packages' tests**

Run: `cd packages/TestingFramework/Engine && npm run build && cd ../../AI/MJComputerUse && npm run build && npm run test && cd ../../TestingFramework/Engine && npx vitest run src/__tests__/rubric-resolution.test.ts`
Expected: PASS everywhere. If a MJComputerUse test constructs the driver and calls `Execute` against fakes, override `LoadSuites` in its probe to return `{ suites: [] }` (none does today).

- [ ] **Step 4: Docs and changeset**

`packages/TestingFramework/Engine/README.md:115`: replace the sentence that says the resolution order applies to tests with: "Every driver resolves the rubric the same way through `BaseTestDriver.ResolveRubricForRun`: the run flag, a rubric oracle's own config, `Test.RubricID`, the suite chain, then (Agent Eval only) the agent's default Evaluation rubric. The Published version is pinned when the suite run starts. A rubric with only a Draft adds no oracle and logs a warning."

`guides/RUBRICS_GUIDE.md` §3 "Which rubric judges a run": after the bullet list add:

```markdown
- The same resolution runs in every driver (Agent Eval, Prompt Eval, Decision Eval, Computer Use). A computer use run is judged on a transcript of its steps (goal, URLs, reasoning, errors, in-run verdicts), not on the raw output.
- A rubric that has only a Draft (for example right after `mj test promote-criteria`) adds no oracle; the run log says so. Publish the draft to start judging.
```

Create `.changeset/rubric-oracle-every-driver.md`:

```markdown
---
"@memberjunction/testing-engine": minor
"@memberjunction/computer-use-engine": minor
---

The rubric oracle now runs in every test driver. Rubric resolution (run flag, rubric oracle config, `Test.RubricID`, the suite chain, the agent default) and the Published-version pin moved from `AgentEvalDriver` into `BaseTestDriver.ResolveRubricForRun`, and `BaseTestDriver.BuildOracleInput` gives every oracle the driver's provider, which the Prompt Eval, Decision Eval and Computer Use drivers did not pass before (their rubric oracle always failed with "No rubric engine is configured."). A driver can set `OracleInput.subjectContent` to shape what the judge reads; the Computer Use driver sends a compact step transcript instead of its raw output, which carried a base64 screenshot. A rubric with no Published version adds no oracle and logs a warning instead of failing the test.
```

- [ ] **Step 5: Commit**

```bash
git add packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts packages/AI/MJComputerUse/src/index.ts packages/TestingFramework/Engine/README.md guides/RUBRICS_GUIDE.md .changeset/rubric-oracle-every-driver.md
git commit -m "feat(computer-use-engine): resolve the rubric through the base driver and judge the step transcript

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Live check (needs a database and a browser)**

Run one computer use test with a published rubric: `mj test run "<computer use test name>" --rubric "<rubric name>" --verbose`. Expected: the log shows `Oracle rubric: PASSED|FAILED (Score: ...)` and `MJ: Rubric Evaluations` has a new Submitted row whose `SubjectRecordID` is the test run. Record the result in the PR description.

---

# Phase 2 — the rubric judge sees screenshots

### Task 7: Images in the subject and frame evidence (rubrics engine)

**Files:**
- Modify: `packages/Rubrics/Engine/src/content.ts:3-8` (`RubricSubjectContent`), `TestRunContent`, the `MJ: Test Runs` registration
- Modify: `packages/Rubrics/Engine/src/promptData.ts` (after `BuildSubjectMessage`)
- Modify: `packages/Rubrics/Engine/src/evaluatorServices.ts:78-89` (`RubricPromptRequest.Subject`)
- Modify: `packages/Rubrics/Engine/src/LLMRubricEvaluator.ts:31` (`RubricRunnerRequest.Subject`), `:45` (`LLMDecision.evidence`), `:176-183` (evidence loop), `:279`, `:290` (subject)
- Modify: `packages/Rubrics/Engine/src/index.ts` (export `BuildSubjectContent`, `RUBRIC_SUBJECT_MAX_IMAGES`, `SelectEvenly`, `type RubricSubjectImage`)
- Modify: `metadata/prompts/templates/rubrics/rubric-evaluator.template.md` (rules and reply shape)
- Modify: `packages/Rubrics/Engine/src/__tests__/llmEvaluator.test.ts:51-55` (string guard)
- Test: `packages/Rubrics/Engine/src/__tests__/subjectImages.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RubricSubjectImage { label: string; mimeType: string; data: string }
  // RubricSubjectContent gains: images?: RubricSubjectImage[]
  export const RUBRIC_SUBJECT_MAX_IMAGES = 8;
  export function BuildSubjectContent(content: RubricSubjectContent): ChatMessageContent
  export function SelectEvenly<T>(items: T[], max: number): T[]
  // RubricPromptRequest.Subject and RubricRunnerRequest.Subject: ChatMessageContent (string when no images)
  // LLMDecision.evidence?: { quote?: string; frame?: string }[]  — a frame that matches an attached label is kept as { ref: `frame:<label>` }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/Rubrics/Engine/src/__tests__/subjectImages.test.ts
import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { LLMRubricEvaluator, type RubricRunnerRequest } from '../LLMRubricEvaluator.js';
import { BuildSubjectContent, SubjectBody } from '../promptData.js';
import { SelectEvenly } from '../content.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'version', rubricId: 'rubric', notApplicablePolicy: 'ExcludeAndRedistribute', passThreshold: 0.5, scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [{ id: 'a', key: 'grid', name: 'Grid visible', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        scales: [{ id: 'scale', scaleType: 'Levels', higherIsBetter: true, levels: [
            { id: 'miss', label: 'Miss', value: 0, normalizedValue: 0, sequence: 0 },
            { id: 'meets', label: 'Meets', value: 1, normalizedValue: 1, sequence: 1 },
        ] }],
        bands: [],
    };
}

describe('BuildSubjectContent', () => {
    it('is the plain subject message when there are no images', () => {
        const content = BuildSubjectContent({ text: 'hello' });
        expect(typeof content).toBe('string');
        expect(content).toContain('<rubric-subject ');
    });

    it('sends the text first, then each frame behind a block that names it', () => {
        const blocks = BuildSubjectContent({ text: 'hello', images: [
            { label: 'step 3', mimeType: 'image/png', data: 'QUJD' },
            { label: 'final', mimeType: 'image/jpeg', data: 'REVG' },
        ] });
        expect(Array.isArray(blocks)).toBe(true);
        const list = blocks as { type: string; content: string; mimeType?: string }[];
        expect(list.map(block => block.type)).toEqual(['text', 'text', 'image_url', 'text', 'image_url']);
        expect(list[0].content).toContain('hello');
        expect(list[0].content).toContain('Cite a frame by its label.');
        expect(list[1].content).toBe('Frame "step 3":');
        expect(list[2]).toEqual({ type: 'image_url', content: 'data:image/png;base64,QUJD', mimeType: 'image/png' });
        expect(list[4].content).toBe('data:image/jpeg;base64,REVG');
    });

    it('caps the frames at the maximum', () => {
        const images = Array.from({ length: 12 }, (_, i) => ({ label: `step ${i}`, mimeType: 'image/png', data: 'QQ==' }));
        const blocks = BuildSubjectContent({ text: 'x', images }) as { type: string }[];
        expect(blocks.filter(block => block.type === 'image_url')).toHaveLength(8);
    });
});

describe('frame evidence', () => {
    it('keeps a frame that was attached and drops one that was not', async () => {
        const requests: RubricRunnerRequest[] = [];
        const runner = { async run(request: RubricRunnerRequest) {
            requests.push(request);
            return JSON.stringify({ decisions: [{ key: 'grid', level: 'Meets', rationale: 'The grid shows 12 rows.', evidence: [{ frame: 'final' }, { frame: 'step 99' }, { quote: 'not in the text' }] }] });
        } };
        const output = await new LLMRubricEvaluator(runner).EvaluateContent(version(), { text: 'Step 1: opened Users', images: [{ label: 'final', mimeType: 'image/png', data: 'QQ==' }] });
        expect(Array.isArray(requests[0].Subject)).toBe(true);
        expect(output.evidence).toEqual([{ ref: 'frame:final' }]);
        expect(output.droppedQuotes).toBe(2);
        expect(output.normalizedScore).toBe(1);
    });
});

describe('SelectEvenly', () => {
    it('keeps the first and the last and spreads the rest', () => {
        expect(SelectEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
        expect(SelectEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
        expect(SelectEvenly([1, 2, 3], 1)).toEqual([3]);
        expect(SelectEvenly([], 3)).toEqual([]);
    });
});

describe('SubjectBody', () => {
    it('does not put image data into the text', () => {
        expect(SubjectBody({ text: 't', images: [{ label: 'final', mimeType: 'image/png', data: 'ZZZZ' }] })).toBe('t');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Rubrics/Engine && npx vitest run src/__tests__/subjectImages.test.ts`
Expected: FAIL — `BuildSubjectContent` and `SelectEvenly` are not exported.

- [ ] **Step 3: content.ts**

```ts
/** One frame a judge may look at. `data` is base64 with no data-URL prefix. */
export interface RubricSubjectImage {
    label: string;
    mimeType: string;
    data: string;
}

/** What an evaluator is allowed to read about a subject. */
export interface RubricSubjectContent {
    text?: string;
    data?: Record<string, unknown>;
    files?: { fileId: string; name: string }[];
    images?: RubricSubjectImage[];
}

/** The first, the last, and evenly spaced items between them, at most `max`. */
export function SelectEvenly<T>(items: T[], max: number): T[] {
    if (max <= 0 || items.length === 0) return [];
    if (items.length <= max) return [...items];
    if (max === 1) return [items[items.length - 1]];
    const picked: T[] = [];
    for (let i = 0; i < max; i++) {
        picked.push(items[Math.round(i * (items.length - 1) / (max - 1))]);
    }
    return picked;
}
```

`TestRunContent` gains `images?: RubricSubjectImage[]` on its input and sets `images: record.images` on the result; the `MJ: Test Runs` registration passes `images: record.Images as RubricSubjectImage[] | undefined`.

- [ ] **Step 4: promptData.ts**

```ts
import type { ChatMessageContent, ChatMessageContentBlock } from '@memberjunction/ai';

/** The most images one subject message carries. */
export const RUBRIC_SUBJECT_MAX_IMAGES = 8;

/**
 * The subject as the user message content: the delimited text, then each frame behind a text
 * block that names it, so a rationale can cite the frame label. A string when there are no frames.
 */
export function BuildSubjectContent(content: RubricSubjectContent): ChatMessageContent {
    const text = BuildSubjectMessage(content);
    const images = (content.images ?? []).slice(0, RUBRIC_SUBJECT_MAX_IMAGES);
    if (images.length === 0) return text;
    const blocks: ChatMessageContentBlock[] = [{ type: 'text', content: `${text}\nThe frames named below follow as images. Cite a frame by its label.` }];
    for (const image of images) {
        blocks.push({ type: 'text', content: `Frame "${image.label}":` });
        blocks.push({ type: 'image_url', content: `data:${image.mimeType};base64,${image.data}`, mimeType: image.mimeType });
    }
    return blocks;
}
```

`SubjectBody` already ignores `images` (it reads only `text` and `data`); no change.

- [ ] **Step 5: evaluatorServices.ts and LLMRubricEvaluator.ts**

`RubricPromptRequest.Subject: ChatMessageContent` (import the type from `@memberjunction/ai`). `RubricRunnerRequest.Subject: ChatMessageContent`. In `singlePass` and `perCriterion`, replace `Subject: BuildSubjectMessage(content)` with `Subject: BuildSubjectContent(content)` and import it. `LLMDecision.evidence?: { quote?: string; frame?: string }[]`. In the evidence loop, with `content` in scope:

```ts
            const frames = new Set((content.images ?? []).map(image => image.label));
            const evidence: EvidenceRef[] = [];
            for (const item of decision.evidence ?? []) {
                if (item.frame !== undefined) {
                    if (frames.has(item.frame)) evidence.push({ ref: `frame:${item.frame}` });
                    else droppedQuotes += 1;
                    continue;
                }
                if (!item.quote || !text.includes(item.quote)) {
                    droppedQuotes += 1;
                    continue;
                }
                evidence.push({ ref: item.quote, quote: item.quote });
            }
```

Update the class JSDoc sentence "A quote that is not in the subject text is dropped." to "A quote that is not in the subject text, or a frame that was not attached, is dropped."

`index.ts`: export `BuildSubjectContent`, `RUBRIC_SUBJECT_MAX_IMAGES` from `promptData.js` and `SelectEvenly`, `type RubricSubjectImage` from `content.js`.

In `llmEvaluator.test.ts:51-55`, the subject is still a string in those tests; add `const subject = request.Subject as string;` and use `subject` in the five assertions so the file type-checks.

- [ ] **Step 6: The evaluator template**

In `rubric-evaluator.template.md`, replace the evidence rule with:

```
- Evidence is a verbatim quote from the subject, as `{"quote": "<text>"}`. When frames are attached, evidence may instead name a frame by its label, as `{"frame": "<frame label>"}`. A quote that is not in the subject, or a frame that was not attached, is discarded.
```

and in both reply shapes change `"evidence": [{"quote": "<verbatim quote>"}]` to `"evidence": [{"quote": "<verbatim quote>"}, {"frame": "<frame label>"}]`.

- [ ] **Step 7: Run the rubrics tests and build**

Run: `cd packages/Rubrics/Engine && npm run test && npm run build`
Expected: PASS, including `promptTemplates.test.ts` (it reads the template; if it asserts the old evidence line, update that string).

- [ ] **Step 8: Commit**

```bash
git add packages/Rubrics/Engine/src/content.ts packages/Rubrics/Engine/src/promptData.ts packages/Rubrics/Engine/src/evaluatorServices.ts packages/Rubrics/Engine/src/LLMRubricEvaluator.ts packages/Rubrics/Engine/src/index.ts packages/Rubrics/Engine/src/__tests__/subjectImages.test.ts packages/Rubrics/Engine/src/__tests__/llmEvaluator.test.ts metadata/prompts/templates/rubrics/rubric-evaluator.template.md
git commit -m "feat(rubrics): send subject frames as image blocks and accept frame evidence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The `Rubric Judge - Computer Use` prompt

**Files:**
- Create: `metadata/prompts/templates/rubrics/judges/computer-use.template.md`
- Modify: `metadata/prompts/.rubric-judge-prompts.json` (append one record)
- Test: `packages/Rubrics/Engine/src/__tests__/promptTemplates.test.ts` (add one assertion)

- [ ] **Step 1: Write the failing test** — add to `promptTemplates.test.ts`:

```ts
    it('ships a vision judge for computer use runs bound to image-capable models', () => {
        const judges = JSON.parse(readFileSync(new URL('../../../../../metadata/prompts/.rubric-judge-prompts.json', import.meta.url), 'utf8')) as { fields: { Name: string; TemplateText: string }; relatedEntities?: Record<string, { fields: { ModelID: string } }[]> }[];
        const judge = judges.find(item => item.fields.Name === 'Rubric Judge - Computer Use');
        expect(judge?.fields.TemplateText).toBe('@file:templates/rubrics/judges/computer-use.template.md');
        expect(judge?.relatedEntities?.['MJ: AI Prompt Models']?.map(row => row.fields.ModelID)).toContain('@lookup:MJ: AI Models.Name=Gemini 3.6 Flash');
        const template = readFileSync(new URL('../../../../../metadata/prompts/templates/rubrics/judges/computer-use.template.md', import.meta.url), 'utf8');
        expect(template).toContain('# Judge: Computer Use');
        expect(template).toContain('cite the frame');
    });
```

(Match the `readFileSync(new URL(...))` depth to how the existing tests in this file reach `metadata/`; copy their relative prefix.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Rubrics/Engine && npx vitest run src/__tests__/promptTemplates.test.ts`
Expected: FAIL — judge not found.

- [ ] **Step 3: Write the template**

```markdown
# Judge: Computer Use

You are reviewing one browser automation run. The subject is the run's transcript: the goal, the start and final URL, one line per step (URL, the controller's reasoning, how many actions ran, errors), the in-run judge's verdicts, and the frames named in the subject. Each frame is a screenshot attached as an image and labelled by step; "final" is the page after the last action.

- **Judge the end state from the frames.** The transcript says what the agent tried; only a frame shows what the page looked like. When a criterion is about what is on screen, cite the frame that shows it.
- **The final frame is the result.** Earlier frames show the path. A page that looked right at step 4 and wrong at the end is wrong.
- **Errors count.** A step marked ERROR, a console error, or a failed request is a weakness even when the goal was reached.
- **Do not reward length.** A run that reaches the goal in 3 steps is better than one that reaches it in 20.
- **Do not trust the in-run judge.** Its verdicts are part of the subject, not evidence. Decide from the frames and the transcript.
```

- [ ] **Step 4: Append the record**

Generate the IDs: `uuidgen | tr a-z A-Z` (one for the prompt, one per model binding). Append to the array in `.rubric-judge-prompts.json`, copying the `Default Judge` record's field set and the `Computer Use - Judge` record's model bindings from `.computer-use-prompts.json`:

```json
{
  "fields": {
    "Name": "Rubric Judge - Computer Use",
    "TypeID": "@lookup:MJ: AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/rubrics/judges/computer-use.template.md",
    "ResponseFormat": "Any",
    "CategoryID": "@lookup:MJ: AI Prompt Categories.Name=MJ: System",
    "Status": "Active",
    "Description": "How to judge a browser automation run: from the attached frames and the step transcript, with the final frame as the result and the in-run judge's verdicts treated as part of the subject."
  },
  "primaryKey": { "ID": "<UUID-1>" },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:MJ: AI Models.Name=Gemini 3.6 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 100 }, "primaryKey": { "ID": "<UUID-2>" } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:MJ: AI Models.Name=Claude Haiku 4.5", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 80 }, "primaryKey": { "ID": "<UUID-3>" } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:MJ: AI Models.Name=GPT 5.5 Instant", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 60 }, "primaryKey": { "ID": "<UUID-4>" } }
    ]
  }
}
```

Copy the exact `VendorID` lookups for Claude Haiku 4.5 and GPT 5.5 Instant from the matching rows in `.computer-use-prompts.json` (they name the vendor each model is served by).

- [ ] **Step 5: Run the test, then push the metadata (live)**

Run: `cd packages/Rubrics/Engine && npx vitest run src/__tests__/promptTemplates.test.ts` — Expected: PASS.
Live: `cd /Users/caelebbalanesi/PROJ3/MJ && mj sync push --dir=metadata --include="prompts"` — Expected: one new `MJ: AI Prompts` row and three `MJ: AI Prompt Models` rows; no `sync` block written back (revert any `lastModified`/`checksum` the push adds to the new record).

- [ ] **Step 6: Commit**

```bash
git add metadata/prompts/.rubric-judge-prompts.json metadata/prompts/templates/rubrics/judges/computer-use.template.md packages/Rubrics/Engine/src/__tests__/promptTemplates.test.ts
git commit -m "feat(metadata): ship the Rubric Judge - Computer Use prompt on vision models

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: A true final frame from the computer use engine

**Files:**
- Modify: `packages/AI/ComputerUse/src/types/results.ts:80` (after `FinalScreenshot`)
- Modify: `packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts:191-192` (`Run`) and a new private method
- Test: `packages/AI/ComputerUse/src/__tests__/final-frame.test.ts`

**Interfaces:**
- Produces: `ComputerUseResult.FinalFrameCapturedAfterActions: boolean` (default `false`). `FinalScreenshot` is the frame captured after the last step's actions on `Completed`, `Failed`, `Impossible`, `MaxStepsReached` and `TimeBudgetExceeded`; unchanged on `Error` and `Cancelled`.

- [ ] **Step 1: Write the failing test** (copy `NavFakeAdapter` and `fastProfile` from `prelude-engine.test.ts`; the adapter below returns a different frame on each capture):

```ts
// packages/AI/ComputerUse/src/__tests__/final-frame.test.ts
import { describe, expect, it } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import { ActionExecutionResult, type BrowserAction, type CookieEntry } from '../types/browser.js';
import { RunComputerUseParams } from '../types/params.js';
import { AppProfile, SettleConfig } from '../types/app-profile.js';
import { ControllerPromptResponse, JudgePromptResponse, type ControllerPromptRequest, type JudgePromptRequest } from '../types/controller.js';

class CountingAdapter extends BaseBrowserAdapter {
    public captures = 0;
    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(): Promise<void> {}
    public async CaptureScreenshot(): Promise<string> { this.captures += 1; return `FRAME-${this.captures}`; }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> { const r = new ActionExecutionResult(action); r.Success = true; return r; }
    public async SetExtraHeaders(): Promise<void> {}
    public async SetCookies(_c: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(): Promise<void> {}
    public get CurrentUrl(): string { return 'http://localhost:4200'; }
    public get IsOpen(): boolean { return true; }
    public get ViewportWidth(): number { return 1280; }
    public get ViewportHeight(): number { return 720; }
}

class DoneAtOnceEngine extends ComputerUseEngine {
    protected async executeControllerPrompt(_request: ControllerPromptRequest): Promise<ControllerPromptResponse> {
        const resp = new ControllerPromptResponse();
        resp.RequestJudgement = true;
        resp.Reasoning = 'checking';
        return resp;
    }
    protected async executeJudgePrompt(_request: JudgePromptRequest): Promise<JudgePromptResponse> {
        const resp = new JudgePromptResponse();
        resp.RawResponse = JSON.stringify({ done: true, confidence: 1, reason: 'ok' });
        return resp;
    }
}

function fastProfile(): AppProfile {
    const p = new AppProfile();
    const s = new SettleConfig();
    s.MaxWaitMs = 150; s.PollMs = 5; s.NetworkIdleCapMs = 5; s.MinWaitMs = 0;
    p.Settle = s;
    return p;
}

describe('final frame', () => {
    it('captures one more frame after the last step and reports it as the final screenshot', async () => {
        const engine = new DoneAtOnceEngine();
        const adapter = new CountingAdapter();
        engine.SetBrowserAdapter(adapter);
        const params = new RunComputerUseParams();
        params.Goal = 'final frame';
        params.StartUrl = 'http://localhost:4200';
        params.AppProfile = fastProfile();
        params.MaxSteps = 2;
        const result = await engine.Run(params);
        expect(result.Status).toBe('Completed');
        expect(result.FinalFrameCapturedAfterActions).toBe(true);
        expect(result.FinalScreenshot).toBe(`FRAME-${adapter.captures}`);
        expect(result.Steps[result.Steps.length - 1].Screenshot).not.toBe(result.FinalScreenshot);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/ComputerUse && npx vitest run src/__tests__/final-frame.test.ts`
Expected: FAIL — `FinalFrameCapturedAfterActions` is `undefined`.

- [ ] **Step 3: Implement**

`results.ts`, after `FinalScreenshot`:

```ts
    /** True when FinalScreenshot was captured after the last step's actions, not at the start of that step. */
    public FinalFrameCapturedAfterActions: boolean = false;
```

`ComputerUseEngine.Run`: replace `result = await this.executeMainLoop(context);` with:

```ts
            result = await this.executeMainLoop(context);
            await this.refreshFinalFrame(result);
```

Add the private method near `buildResult`:

```ts
    /**
     * Replaces the result's final screenshot with a frame captured after the last step's
     * actions, so the end state is imaged. Best effort: a failed capture keeps the step frame.
     */
    private async refreshFinalFrame(result: ComputerUseResult): Promise<void> {
        if (result.Status === 'Error' || result.Status === 'Cancelled') return;
        try {
            const frame = await this.browserAdapter.CaptureScreenshot();
            if (frame) {
                result.FinalScreenshot = frame;
                result.FinalFrameCapturedAfterActions = true;
            }
        } catch (error) {
            this.log(`Final frame capture skipped: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
```

The frame is not pushed into `RunContext`'s ring buffer, so the controller, the judge, and loop detection are unchanged.

- [ ] **Step 4: Run the package tests and build**

Run: `cd packages/AI/ComputerUse && npm run test && npm run build`
Expected: PASS. (`replay*.test.ts` and `prelude-engine.test.ts` keep passing; the extra capture is one more `CaptureScreenshot` call, which the fake adapters allow.)

- [ ] **Step 5: Commit**

```bash
git add packages/AI/ComputerUse/src/types/results.ts packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts packages/AI/ComputerUse/src/__tests__/final-frame.test.ts
git commit -m "feat(computer-use): capture the final frame after the last step's actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Frame selection and the vision judge in the computer use driver

**Files:**
- Create: `packages/AI/MJComputerUse/src/test-driver/rubric-frames.ts`
- Modify: `packages/AI/MJComputerUse/src/test-driver/types.ts:122` (after `oracles`)
- Modify: `packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts` (`Execute` step 5, `runOracles`)
- Modify: `packages/AI/MJComputerUse/src/index.ts`
- Test: `packages/AI/MJComputerUse/src/__tests__/rubric-frames.test.ts`

**Interfaces:**
- Produces: `export const DEFAULT_RUBRIC_FRAMES = 6; export function SelectRubricFrames(result: ComputerUseResult, max = DEFAULT_RUBRIC_FRAMES): RubricSubjectImage[]`; `ComputerUseTestConfig.rubricFrames?: number`.
- Consumes: `BuildRubricSubject(..., images)`, `WithDefaultRubricEvaluator`, `COMPUTER_USE_RUBRIC_JUDGE` (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/MJComputerUse/src/__tests__/rubric-frames.test.ts
import { describe, expect, it } from 'vitest';
import type { ComputerUseResult } from '@memberjunction/computer-use';
import { SelectRubricFrames } from '../test-driver/rubric-frames.js';

function run(steps: number, opts: { checkpointAt?: number[]; doneAt?: number; final?: string } = {}): ComputerUseResult {
    return {
        Status: 'Completed',
        Success: true,
        FinalScreenshot: opts.final ?? 'FINAL',
        FinalFrameCapturedAfterActions: opts.final !== undefined,
        Steps: Array.from({ length: steps }, (_, i) => ({
            StepNumber: i + 1,
            Screenshot: `S${i + 1}`,
            ScreenshotHash: `h${i + 1}`,
            CheckpointReached: opts.checkpointAt?.includes(i + 1) ? `cp${i + 1}` : undefined,
            JudgeVerdict: i + 1 === opts.doneAt ? { Done: true } : (i % 3 === 0 ? { Done: false } : undefined),
        })),
    } as unknown as ComputerUseResult;
}

describe('SelectRubricFrames', () => {
    it('keeps checkpoint frames, verdict changes, and the final frame, in step order', () => {
        const frames = SelectRubricFrames(run(10, { checkpointAt: [4], doneAt: 10 }), 6);
        expect(frames.map(frame => frame.label)).toEqual(['step 1', 'step 4', 'step 6', 'step 10', 'final']);
        expect(frames[0]).toEqual({ label: 'step 1', mimeType: 'image/png', data: 'S1' });
        expect(frames.at(-1)?.data).toBe('FINAL');
    });

    it('relabels the last step when the final frame is the same image', () => {
        const frames = SelectRubricFrames(run(2, { final: 'S2' }), 6);
        expect(frames.map(frame => frame.label)).toEqual(['step 1', 'step 2 (final)']);
    });

    it('never returns more than max and returns nothing for max 0', () => {
        expect(SelectRubricFrames(run(30, { checkpointAt: [2, 5, 8, 11, 14, 17, 20] }), 4)).toHaveLength(4);
        expect(SelectRubricFrames(run(5), 0)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/rubric-frames.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
// packages/AI/MJComputerUse/src/test-driver/rubric-frames.ts
import type { ComputerUseResult } from '@memberjunction/computer-use';
import type { RubricSubjectImage } from './rubric-subject.js';

/** How many frames a rubric judge sees by default. */
export const DEFAULT_RUBRIC_FRAMES = 6;

/**
 * The frames a rubric judge sees: the final frame, each checkpoint frame, each step whose
 * judge verdict changed, then evenly spaced steps up to `max`. Ordered by step, one per
 * distinct screenshot.
 */
export function SelectRubricFrames(result: ComputerUseResult, max = DEFAULT_RUBRIC_FRAMES): RubricSubjectImage[] {
    if (max <= 0) return [];
    const steps = result.Steps.filter(step => step.Screenshot);
    const chosen = new Map<number, string>();
    let lastDone: boolean | undefined;
    for (const step of steps) {
        if (step.CheckpointReached) chosen.set(step.StepNumber, step.Screenshot);
        if (step.JudgeVerdict && step.JudgeVerdict.Done !== lastDone) {
            chosen.set(step.StepNumber, step.Screenshot);
            lastDone = step.JudgeVerdict.Done;
        }
    }
    const room = max - 1 - chosen.size;
    if (room > 0 && steps.length > 0) {
        const stride = Math.max(1, Math.ceil(steps.length / room));
        for (let i = 0; i < steps.length && chosen.size < max - 1; i += stride) {
            chosen.set(steps[i].StepNumber, steps[i].Screenshot);
        }
    }
    const seen = new Set<string>();
    const frames: RubricSubjectImage[] = [];
    for (const [stepNumber, screenshot] of [...chosen.entries()].sort((a, b) => a[0] - b[0])) {
        const hash = steps.find(step => step.StepNumber === stepNumber)?.ScreenshotHash || screenshot;
        if (seen.has(hash)) continue;
        seen.add(hash);
        frames.push({ label: `step ${stepNumber}`, mimeType: 'image/png', data: screenshot });
    }
    if (result.FinalScreenshot) {
        const last = frames[frames.length - 1];
        if (last && last.data === result.FinalScreenshot) last.label = `${last.label} (final)`;
        else frames.push({ label: 'final', mimeType: 'image/png', data: result.FinalScreenshot });
    }
    return frames.slice(-max);
}
```

- [ ] **Step 4: Run the test**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/rubric-frames.test.ts`
Expected: PASS (3 tests). Trace of the first case: steps 1, 4 and 10 are chosen for the first verdict, the checkpoint and the verdict change; two slots remain, stride `ceil(10 / 2) = 5` adds step 6 (step 1 is already chosen); the final frame is appended.

- [ ] **Step 5: Wire the driver**

`types.ts`, after `oracles`:

```ts
    /** How many run frames the rubric judge sees (default 6). 0 sends the transcript only. */
    rubricFrames?: number;
```

`ComputerUseTestDriver.ts` imports: add `SelectRubricFrames, DEFAULT_RUBRIC_FRAMES` from `./rubric-frames.js` and `COMPUTER_USE_RUBRIC_JUDGE, WithDefaultRubricEvaluator` from `./rubric-subject.js`. In `Execute` step 5:

```ts
            const judged = WithDefaultRubricEvaluator(
                await this.ResolveRubricForRun(config, context),
                { EvaluatorType: 'AIPrompt', PromptName: COMPUTER_USE_RUBRIC_JUDGE, ModelSelection: 'Judge' },
            );
            const frames = SelectRubricFrames(result, judged.rubricFrames ?? DEFAULT_RUBRIC_FRAMES);
            const oracleResults = await this.runOracles(judged, input, expected, actualOutput, frames, context);
```

`runOracles` takes `frames: RubricSubjectImage[]` before `context` and builds `const subject = BuildRubricSubject(input, expected, actualOutput, frames);`.

`index.ts`: `export * from './test-driver/rubric-frames.js';`

- [ ] **Step 6: Build and test**

Run: `cd packages/AI/MJComputerUse && npm run build && npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/AI/MJComputerUse/src/test-driver/rubric-frames.ts packages/AI/MJComputerUse/src/test-driver/types.ts packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts packages/AI/MJComputerUse/src/index.ts packages/AI/MJComputerUse/src/__tests__/rubric-frames.test.ts
git commit -m "feat(computer-use-engine): send chosen run frames to the computer use rubric judge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Screenshots for post-run scoring of a test run

**Files:**
- Modify: `packages/Rubrics/Engine/src/RubricEngine.ts:40-45` (`RubricRecords.rows` signature), `:245-249` (`loadRecord`), new private method
- Modify: `packages/Rubrics/Engine/src/providerRecords.ts:31-36` (`rows` passes `Fields`)
- Test: `packages/Rubrics/Engine/src/__tests__/engine.test.ts` (add one test using the file's existing fake-records harness)

**Interfaces:**
- Produces: `RubricRecords.rows(entityName, filter, orderBy?, fields?: string[])`. When `EvaluateRecord` loads an `MJ: Test Runs` subject, the record carries `Images: RubricSubjectImage[]` built from up to `RUBRIC_SUBJECT_MAX_IMAGES` image rows of `MJ: Test Run Outputs` (first, last, spread), labelled `step <StepNumber>` or the output `Name`.

- [ ] **Step 1: Write the failing test** — add to `engine.test.ts`, reusing how that file builds a `RubricEngine` with a fake `records` and `store` (copy the harness of its `EvaluateRecord` test):

```ts
    it('attaches a spread of the test run screenshots when it loads an MJ: Test Runs subject', async () => {
        const seen: { entity: string; filter: string; fields?: string[] }[] = [];
        const rows = async (entityName: string, filter: string, _orderBy?: string, fields?: string[]) => {
            seen.push({ entity: entityName, filter, fields });
            if (entityName === 'MJ: Test Runs') return [{ ID: 'run-1', InputData: 'q', ActualOutputData: 'a', ResultDetails: '[]' }];
            if (entityName === 'MJ: Test Run Outputs' && fields) {
                return Array.from({ length: 20 }, (_, i) => ({ ID: `o${i + 1}`, Sequence: i + 1, StepNumber: i + 1, Name: `Step ${i + 1}`, MimeType: 'image/png' }));
            }
            if (entityName === 'MJ: Test Run Outputs') return [{ ID: 'o1', StepNumber: 1, MimeType: 'image/png', InlineData: 'QQ==' }, { ID: 'o20', StepNumber: 20, MimeType: 'image/png', InlineData: 'Qg==' }];
            return [];
        };
        // build the engine with `rows` as its records reader exactly as the existing EvaluateRecord test does,
        // with a Deterministic evaluator so no prompt service is needed, then:
        const content = await engine.SubjectContent({ subjectEntityName: 'MJ: Test Runs', subjectRecordId: 'run-1' });
        expect(content.images?.map(image => image.label)).toEqual(['step 1', 'step 20']);
        expect(content.images?.[0].data).toBe('QQ==');
        const list = seen.find(call => call.entity === 'MJ: Test Run Outputs' && call.fields);
        expect(list?.fields).toEqual(['ID', 'Sequence', 'StepNumber', 'Name', 'MimeType']);
        expect(list?.filter).toContain("MimeType LIKE 'image/%'");
    });
```

If `SubjectContent` (`RubricEngine.ts:413`) does not call `loadRecord` the same way `EvaluateRecord` does, route both through one private `loadSubject(entityName, recordId)` in Step 3 so the test exercises it.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Rubrics/Engine && npx vitest run src/__tests__/engine.test.ts`
Expected: FAIL — `images` undefined.

- [ ] **Step 3: Implement**

`RubricRecords.rows(entityName: string, filter: string, orderBy?: string, fields?: string[])`. In `providerRecords.ts` pass `Fields: fields` to `RunView`. In `RubricEngine.ts`:

```ts
const TEST_RUN_SUBJECT = 'MJ: Test Runs';
const TEST_RUN_OUTPUTS = 'MJ: Test Run Outputs';

    /** The subject row, with a spread of its saved screenshots when it is a test run. */
    private async loadSubject(entityName: string, recordId: string): Promise<Record<string, unknown>> {
        const rows = await this.records.rows(entityName, `ID=${sqlLiteral(recordId)}`);
        if (!rows[0]) throw new Error('subject not found or not readable');
        const record = rows[0];
        if (entityName === TEST_RUN_SUBJECT) record.Images = await this.testRunImages(recordId);
        return record;
    }

    /** Up to RUBRIC_SUBJECT_MAX_IMAGES image outputs of a test run: first, last, and spread between. */
    private async testRunImages(testRunId: string): Promise<RubricSubjectImage[]> {
        const listed = await this.records.rows(TEST_RUN_OUTPUTS, `TestRunID=${sqlLiteral(testRunId)} AND MimeType LIKE 'image/%'`, 'Sequence', ['ID', 'Sequence', 'StepNumber', 'Name', 'MimeType']);
        const picked = SelectEvenly(listed, RUBRIC_SUBJECT_MAX_IMAGES);
        if (picked.length === 0) return [];
        const ids = picked.map(row => sqlLiteral(String(row.ID))).join(', ');
        const full = await this.records.rows(TEST_RUN_OUTPUTS, `ID IN (${ids})`, 'Sequence');
        return full
            .filter(row => typeof row.InlineData === 'string' && (row.InlineData as string).length > 0)
            .map(row => ({
                label: row.StepNumber == null ? String(row.Name ?? 'output') : `step ${row.StepNumber}`,
                mimeType: String(row.MimeType ?? 'image/png'),
                data: String(row.InlineData).replace(/^data:[^,]*,/, ''),
            }));
    }
```

Use `loadSubject` in `EvaluateRecord`'s `loadRecord` and in `SubjectContent`. Import `SelectEvenly`, `type RubricSubjectImage` from `./content.js` and `RUBRIC_SUBJECT_MAX_IMAGES` from `./promptData.js`.

- [ ] **Step 4: Run tests and build**

Run: `cd packages/Rubrics/Engine && npm run test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/Rubrics/Engine/src/RubricEngine.ts packages/Rubrics/Engine/src/providerRecords.ts packages/Rubrics/Engine/src/__tests__/engine.test.ts
git commit -m "feat(rubrics): attach saved test run screenshots when a test run is scored after the run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Phase 2 docs and changeset

**Files:**
- Modify: `guides/RUBRICS_GUIDE.md` §8 "How the LLM evaluator builds its prompt" and §11 "Give a subject better content"
- Modify: `packages/Rubrics/Engine/README.md` (Evaluators: LLM bullet)
- Create: `.changeset/rubric-judge-sees-frames.md`

- [ ] **Step 1: Guide**

§8, after the paragraph that starts "The LLM evaluator sends the rubric as the system message": add

```markdown
A subject may carry **frames** (`RubricSubjectContent.images`): each one is sent as an image block after the
subject text, behind a text block that names it ("Frame \"step 7\":"). A judge may cite a frame as evidence with
`{"frame": "step 7"}`; a frame that was not attached is dropped like an unknown quote. At most
`RUBRIC_SUBJECT_MAX_IMAGES` (8) frames are sent. Bind a vision model to the judge and set `ModelSelection:
"Judge"` so it is used; the shipped `Rubric Judge - Computer Use` is bound that way.
```

§11, after the `MJ: Test Runs` sentence: "When the engine loads a test run itself (re-scoring, human review, calibration), it attaches a spread of the run's saved `MJ: Test Run Outputs` screenshots as frames. In-run oracles pass the frames the driver chose, because the outputs are saved after the oracles run."

- [ ] **Step 2: README** — in the LLM bullet add: "Frames on the subject (`images`) are sent as image blocks after the text; `{"frame": "<label>"}` is accepted as evidence."

- [ ] **Step 3: Changeset**

```markdown
---
"@memberjunction/rubrics": minor
"@memberjunction/computer-use": minor
"@memberjunction/computer-use-engine": minor
---

The rubric judge can see screenshots. `RubricSubjectContent.images` carries labelled frames, `BuildSubjectContent` sends them as image blocks after the subject text, and the LLM evaluator accepts `{"frame": "<label>"}` as evidence. The Computer Use driver sends up to `rubricFrames` (default 6) chosen frames: checkpoints, judge verdict changes, a spread of steps, and the final frame, which the engine now captures after the last step's actions (`ComputerUseResult.FinalFrameCapturedAfterActions`). A rubric oracle on a computer use test defaults to the new `Rubric Judge - Computer Use` prompt on vision models. Scoring a test run after the run attaches a spread of its saved screenshots.
```

- [ ] **Step 4: Commit**

```bash
git add guides/RUBRICS_GUIDE.md packages/Rubrics/Engine/README.md .changeset/rubric-judge-sees-frames.md
git commit -m "docs(rubrics): frames in the subject, the computer use judge, and post-run screenshots

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Live check**

Run a computer use test with `--rubric` as in Task 6. Expected: the `MJ: AI Prompt Runs` row linked from the evaluation's `AIPromptRunID` shows image content in its messages, and at least one `RubricEvaluationScore.Evidence` holds `frame:final` or `frame:step N`.

---

# Phase 3 — one judge for the loop and the score

### Task 13: Rubric criteria with keys and levels in the base judge

**Files:**
- Modify: `packages/AI/ComputerUse/src/judge/rubric.ts:17-24` (`CriterionVerdict`)
- Modify: `packages/AI/ComputerUse/src/types/judge.ts` (new class, `JudgeContext.RubricCriteria`)
- Modify: `packages/AI/ComputerUse/src/types/params.ts:233` (after `ValidationCriteria`)
- Modify: `packages/AI/ComputerUse/src/types/controller.ts` (`JudgePromptRequest.RubricCriteria`)
- Modify: `packages/AI/ComputerUse/src/judge/LLMJudge.ts` (`buildPromptRequest`, `applyRubric`, `JudgeParsedResponse`)
- Modify: `packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts:2831` (`evaluateJudge`) and `:3212-3218` (direct prompt render)
- Modify: `metadata/prompts/templates/computer-use/_includes/judge-core.md` (one note), then `npm run build` regenerates `prompt-parts.generated.ts`
- Modify: `packages/AI/ComputerUse/src/index.ts` (export the new class if `types/judge.js` is not already re-exported wholesale)
- Test: `packages/AI/ComputerUse/src/__tests__/rubric-criteria-judge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class RubricJudgeCriterion { public Key = ''; public Text = ''; public Levels?: string[]; }
  // CriterionVerdict gains: key?: string; level?: string;
  // RunComputerUseParams.RubricCriteria?: RubricJudgeCriterion[]; JudgeContext.RubricCriteria?; JudgePromptRequest.RubricCriteria?
  ```
  The judge reply's `criteria[]` entries may carry `key` and `level`; `met` still drives `Done`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/ComputerUse/src/__tests__/rubric-criteria-judge.test.ts
import { describe, expect, it } from 'vitest';
import { LLMJudge } from '../judge/LLMJudge.js';
import { JudgeContext, RubricJudgeCriterion } from '../types/judge.js';
import { JudgePromptResponse, type JudgePromptRequest } from '../types/controller.js';

function criterion(key: string, text: string, levels: string[]): RubricJudgeCriterion {
    const item = new RubricJudgeCriterion();
    item.Key = key; item.Text = text; item.Levels = levels;
    return item;
}

describe('LLMJudge with rubric criteria', () => {
    it('passes the criteria to the prompt and keeps key and level on each verdict', async () => {
        let seen: JudgePromptRequest | undefined;
        const judge = new LLMJudge(async request => {
            seen = request;
            const response = new JudgePromptResponse();
            response.RawResponse = JSON.stringify({ done: false, confidence: 0.5, reason: 'r', feedback: 'f', criteria: [
                { key: 'grid', criterion: 'The grid is visible', met: true, level: 'Meets', evidence: 'rows shown' },
                { key: 'filter', criterion: 'The filter is applied', met: false, level: 'Partial', evidence: 'filter open, not applied' },
            ] });
            return response;
        });
        const context = new JudgeContext();
        context.Goal = 'g';
        context.RubricCriteria = [criterion('grid', 'The grid is visible', ['Miss', 'Partial', 'Meets']), criterion('filter', 'The filter is applied', ['Miss', 'Partial', 'Meets'])];
        const verdict = await judge.Evaluate(context);
        expect(seen?.RubricCriteria?.map(item => item.Key)).toEqual(['grid', 'filter']);
        expect(verdict.Done).toBe(false);
        expect(verdict.Confidence).toBe(0.5);
        expect(verdict.CriteriaVerdicts).toEqual([
            { key: 'grid', criterion: 'The grid is visible', met: true, level: 'Meets', evidence: 'rows shown' },
            { key: 'filter', criterion: 'The filter is applied', met: false, level: 'Partial', evidence: 'filter open, not applied' },
        ]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/ComputerUse && npx vitest run src/__tests__/rubric-criteria-judge.test.ts`
Expected: FAIL — `RubricJudgeCriterion` is not exported.

- [ ] **Step 3: Types**

`judge/rubric.ts`, inside `CriterionVerdict` after `criterion`:

```ts
    /** The rubric criterion's permanent key, when the run supplied rubric criteria. */
    key?: string;
    /** The level label the judge chose, when the criterion has levels. */
    level?: string;
```

`types/judge.ts`, before `JudgeContext`:

```ts
/** One rubric criterion the judge scores: its permanent key, its rendered text, and its level labels lowest first. */
export class RubricJudgeCriterion {
    public Key: string = '';
    public Text: string = '';
    public Levels?: string[];
}
```

and in `JudgeContext` after `ValidationCriteria`:

```ts
    /** Rubric criteria with keys and levels. When present, the judge echoes each key and chooses a level. */
    public RubricCriteria?: RubricJudgeCriterion[];
```

`types/params.ts` after `ValidationCriteria` (import the class from `./judge.js`):

```ts
    /**
     * A published rubric's leaves, rendered for the judge. The judge echoes each key and
     * chooses a level; `Done` is still every criterion met. Set ValidationCriteria to the
     * same texts so loop detection counts them.
     */
    public RubricCriteria?: RubricJudgeCriterion[];
```

`types/controller.ts`, in `JudgePromptRequest` after `ValidationCriteria`:

```ts
    /** Rubric criteria with keys and levels, when the run supplied them. */
    public RubricCriteria?: RubricJudgeCriterion[];
```

- [ ] **Step 4: LLMJudge**

In `buildPromptRequest`: `request.RubricCriteria = context.RubricCriteria;`. In `JudgeParsedResponse`'s `criteria` item type add `key?: unknown; level?: unknown;`. In `applyRubric`:

```ts
        const criteria: CriterionVerdict[] = rawCriteria.map(c => {
            const verdict: CriterionVerdict = { criterion: String(c.criterion ?? ''), met: c.met === true, evidence: String(c.evidence ?? '') };
            if (typeof c.key === 'string' && c.key.length > 0) verdict.key = c.key;
            if (typeof c.level === 'string' && c.level.length > 0) verdict.level = c.level;
            return verdict;
        });
```

- [ ] **Step 5: Engine**

`evaluateJudge` (`:2831`), after the `ValidationCriteria` line:

```ts
        judgeContext.RubricCriteria = IsCheckpointRun(context.Params.Checkpoints) ? undefined : context.Params.RubricCriteria;
```

Direct prompt render (`:3212`): put the rubric block first and keep the old block as the fallback:

```ts
        if (request.RubricCriteria && request.RubricCriteria.length > 0) {
            const list = request.RubricCriteria
                .map((c, i) => `${i + 1}. [${c.Key}] ${c.Text}${c.Levels && c.Levels.length > 0 ? ` (levels, lowest first: ${c.Levels.join(' / ')})` : ''}`)
                .join('\n');
            sections.push(`## Rubric Criteria\nEvaluate the end-state against EACH criterion below. In your JSON response, include a "criteria" array of \`{ "key": "<key exactly as written>", "criterion": "<text>", "met": true|false, "level": "<one of the criterion's levels>", "evidence": "<what you observed>" }\` — one entry per criterion. "met" is true only when the chosen level is the highest one. The goal is "done" only when EVERY criterion is met.\n${list}`);
        } else if (request.ValidationCriteria && request.ValidationCriteria.length > 0) {
            // existing block unchanged
        }
```

`_includes/judge-core.md`: after the blockquote that starts "> Omit `criteria` only when..." add:

```
> When a criterion is listed with a key and levels, echo the `key` exactly and add `"level"` with the chosen level label; `met` is true only for the highest level.
```

- [ ] **Step 6: Build (regenerates prompt parts) and test**

Run: `cd packages/AI/ComputerUse && npm run build && npm run test`
Expected: PASS, including `prompt-single-source.test.ts` (the generated constant must contain the include text; the build regenerates it).

- [ ] **Step 7: Commit**

```bash
git add packages/AI/ComputerUse/src metadata/prompts/templates/computer-use/_includes/judge-core.md
git commit -m "feat(computer-use): judge rubric criteria by key and level

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(`packages/AI/ComputerUse/src` includes the regenerated `prompts/prompt-parts.generated.ts`; confirm with `git status` that nothing outside this task is staged.)

---

### Task 14: The MJ judge prompt renders rubric criteria

**Files:**
- Modify: `metadata/prompts/templates/computer-use/judge.template.md:24-30`
- Modify: `packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts:363-374` (`executeJudgePrompt` data)
- Test: `packages/AI/MJComputerUse/src/__tests__/judge-template-rubric.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/MJComputerUse/src/__tests__/judge-template-rubric.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = readFileSync(new URL('../../../../../metadata/prompts/templates/computer-use/judge.template.md', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../engine/MJComputerUseEngine.ts', import.meta.url), 'utf8');

describe('judge template rubric block', () => {
    it('renders rubric criteria with keys and levels ahead of plain validation criteria', () => {
        expect(template).toContain('{% if rubricCriteria and rubricCriteria.length > 0 %}');
        expect(template).toContain('[{{ criterion.Key }}]');
        expect(template).toContain("{{ criterion.Levels | join(' / ') }}");
        expect(template.indexOf('rubricCriteria')).toBeLessThan(template.indexOf('{% elif validationCriteria'));
    });

    it('is given rubricCriteria by the MJ engine', () => {
        expect(engine).toContain('rubricCriteria: request.RubricCriteria');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/judge-template-rubric.test.ts`
Expected: FAIL.

- [ ] **Step 3: Template** — replace the `{% if validationCriteria ... %}` block with:

```
{% if rubricCriteria and rubricCriteria.length > 0 %}
## Rubric Criteria
Evaluate the end-state against EACH criterion below. In your JSON response, include a `"criteria"` array with one entry per criterion: `{ "key": "<key exactly as written>", "criterion": "<text>", "met": true|false, "level": "<one of the criterion's levels>", "evidence": "<what you observed>" }`. `met` is true only when the chosen level is the highest level. The goal is "done" ONLY when EVERY criterion is met.
{% for criterion in rubricCriteria %}
{{ loop.index }}. [{{ criterion.Key }}] {{ criterion.Text | safe }}{% if criterion.Levels and criterion.Levels.length > 0 %} (levels, lowest first: {{ criterion.Levels | join(' / ') }}){% endif %}
{% endfor %}
{% elif validationCriteria and validationCriteria.length > 0 %}
## Validation Criteria
Evaluate the end-state against EACH criterion below. In your JSON response, include a `"criteria"` array with one entry per criterion: `{ "criterion": "<text>", "met": true|false, "evidence": "<what you observed>" }`. The goal is "done" ONLY when EVERY criterion is met — decide each criterion as a plain true/false, and let those decide `done`.
{% for criterion in validationCriteria %}
{{ loop.index }}. {{ criterion }}
{% endfor %}
{% endif %}
```

- [ ] **Step 4: Engine** — in `executeJudgePrompt`'s data object add `rubricCriteria: request.RubricCriteria,` after `validationCriteria`.

- [ ] **Step 5: Test, build, push the prompt (live)**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/judge-template-rubric.test.ts && npm run build` — Expected: PASS.
Live: `mj sync push --dir=metadata --include="prompts"`.

- [ ] **Step 6: Commit**

```bash
git add metadata/prompts/templates/computer-use/judge.template.md packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts packages/AI/MJComputerUse/src/__tests__/judge-template-rubric.test.ts
git commit -m "feat(computer-use-engine): the stored judge prompt renders rubric criteria with keys and levels

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: The `ComputerUse` rubric evaluator

**Files:**
- Modify: `packages/AI/MJComputerUse/package.json` (add `"@memberjunction/rubrics"` and `"@memberjunction/rubrics-base"` at the same version string as `"@memberjunction/testing-engine"`), then `pnpm install --frozen-lockfile=false` from the MJ root if the lockfile needs the new edges (commit `pnpm-lock.yaml` only if it changed)
- Create: `packages/AI/MJComputerUse/src/rubric/ComputerUseRubricEvaluator.ts`
- Modify: `packages/AI/MJComputerUse/src/index.ts`
- Test: `packages/AI/MJComputerUse/src/__tests__/computer-use-rubric-evaluator.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface JudgeCriterionVerdict { key?: string; criterion: string; met: boolean; level?: string; evidence?: string }
  export function CandidatesFromVerdicts(version: RubricVersionSnapshot, verdicts: JudgeCriterionVerdict[]): { candidates: RubricCandidate[]; unmatched: string[] }
  @RegisterClass(BaseRubricEvaluator, 'ComputerUse') export class ComputerUseRubricEvaluator extends BaseRubricEvaluator
  ```
  Reads `Content.data.criteriaVerdicts` and `Content.data.finalJudgePromptRunId`. `EvaluatorType` is `'AIPrompt'`. Throws `The run produced no rubric verdicts.` when there are none.

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/MJComputerUse/src/__tests__/computer-use-rubric-evaluator.test.ts
import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRubricEvaluator, type RubricEvaluatorContext } from '@memberjunction/rubrics';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { CandidatesFromVerdicts, ComputerUseRubricEvaluator } from '../rubric/ComputerUseRubricEvaluator.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'v', rubricId: 'r', notApplicablePolicy: 'ExcludeAndRedistribute', passThreshold: 0.7, scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [
            { id: 'a', key: 'grid', name: 'The grid is visible', nodeType: 'Criterion', scaleId: 's', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
            { id: 'b', key: 'filter', name: 'The filter is applied', nodeType: 'Criterion', scaleId: 's', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
        ],
        scales: [{ id: 's', scaleType: 'Levels', higherIsBetter: true, levels: [
            { id: 'miss', label: 'Miss', value: 0, normalizedValue: 0, sequence: 0 },
            { id: 'partial', label: 'Partial', value: 1, normalizedValue: 0.5, sequence: 1 },
            { id: 'meets', label: 'Meets', value: 2, normalizedValue: 1, sequence: 2 },
        ] }],
        bands: [],
    };
}

describe('CandidatesFromVerdicts', () => {
    it('maps by key with the chosen level, by name without a key, and met to the top or bottom level', () => {
        const { candidates, unmatched } = CandidatesFromVerdicts(version(), [
            { key: 'grid', criterion: 'The grid is visible', met: false, level: 'Partial', evidence: 'half the rows' },
            { criterion: 'The filter is applied', met: true, evidence: 'chip shown' },
            { key: 'nope', criterion: 'Unknown', met: true },
        ]);
        expect(candidates).toEqual([
            { criterionId: 'a', scaleLevelId: 'partial', rationale: 'half the rows', evidence: [] },
            { criterionId: 'b', scaleLevelId: 'meets', rationale: 'chip shown', evidence: [] },
        ]);
        expect(unmatched).toEqual(['nope']);
    });
});

describe('ComputerUseRubricEvaluator', () => {
    it('is registered under ComputerUse and scores the run verdicts through RubricScoring', async () => {
        expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseRubricEvaluator, 'ComputerUse')).toBeTruthy();
        const evaluator = new ComputerUseRubricEvaluator();
        expect(evaluator.EvaluatorType).toBe('AIPrompt');
        const context = {
            Version: version(),
            Subject: { entityName: 'MJ: Test Runs', recordId: 'run' },
            Settings: {},
            Services: {},
            Content: { data: { finalJudgePromptRunId: 'prompt-run-9', criteriaVerdicts: [
                { key: 'grid', criterion: 'The grid is visible', met: true, level: 'Meets', evidence: 'rows' },
                { key: 'filter', criterion: 'The filter is applied', met: false, level: 'Miss', evidence: 'none' },
            ] } },
        } as unknown as RubricEvaluatorContext;
        const run = await evaluator.EvaluateRubric(context);
        expect(run.normalizedScore).toBe(0.5);
        expect(run.result.outcome).toBe('BelowThreshold');
        expect(run.aiPromptRunId).toBe('prompt-run-9');
        expect(run.metadata).toEqual({ Source: 'ComputerUseJudge', Unmatched: [] });
    });

    it('fails when the run has no verdicts', async () => {
        const context = { Version: version(), Subject: { entityName: 'MJ: Test Runs', recordId: 'run' }, Settings: {}, Services: {}, Content: { data: {} } } as unknown as RubricEvaluatorContext;
        await expect(new ComputerUseRubricEvaluator().EvaluateRubric(context)).rejects.toThrow('The run produced no rubric verdicts.');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/computer-use-rubric-evaluator.test.ts`
Expected: FAIL — module not found (and `@memberjunction/rubrics` unresolved until the dependency is added).

- [ ] **Step 3: Dependency and module**

Add to `packages/AI/MJComputerUse/package.json` dependencies (same version string as `@memberjunction/testing-engine` in that file):

```json
    "@memberjunction/rubrics": "<same version>",
    "@memberjunction/rubrics-base": "<same version>",
```

Run `cd /Users/caelebbalanesi/PROJ3/MJ && pnpm install --frozen-lockfile` (if it refuses because the lockfile needs updating, run `pnpm install` and commit `pnpm-lock.yaml`).

```ts
// packages/AI/MJComputerUse/src/rubric/ComputerUseRubricEvaluator.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseRubricEvaluator, type RubricCandidate, type RubricEvaluatorContext, type RubricEvaluatorRun, type RubricEvaluatorType } from '@memberjunction/rubrics';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

/** One verdict the in-run judge returned for a criterion, as the driver saved it. */
export interface JudgeCriterionVerdict {
    key?: string;
    criterion: string;
    met: boolean;
    level?: string;
    evidence?: string;
}

/**
 * Scores a computer use run from the verdicts its in-run judge already returned. No model
 * call: the judge prompt run that produced the verdicts is linked as the evaluation's prompt run.
 */
@RegisterClass(BaseRubricEvaluator, 'ComputerUse')
export class ComputerUseRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'ComputerUse';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'AIPrompt';
    }

    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        const data = context.Content.data ?? {};
        const verdicts = Array.isArray(data.criteriaVerdicts) ? data.criteriaVerdicts as JudgeCriterionVerdict[] : [];
        if (verdicts.length === 0) throw new Error('The run produced no rubric verdicts.');
        const { candidates, unmatched } = CandidatesFromVerdicts(context.Version, verdicts);
        const promptRunId = typeof data.finalJudgePromptRunId === 'string' ? data.finalJudgePromptRunId : null;
        return { ...this.Evaluate(context.Version, candidates), aiPromptRunId: promptRunId, metadata: { Source: 'ComputerUseJudge', Unmatched: unmatched } };
    }
}

/**
 * Maps verdicts onto the version's leaves by key, then by name. A level label picks that
 * level; otherwise `met` picks the highest or the lowest level. Unmatched verdicts are listed.
 */
export function CandidatesFromVerdicts(version: RubricVersionSnapshot, verdicts: JudgeCriterionVerdict[]): { candidates: RubricCandidate[]; unmatched: string[] } {
    const leaves = version.nodes.filter(node => node.nodeType === 'Criterion');
    const candidates: RubricCandidate[] = [];
    const unmatched: string[] = [];
    for (const verdict of verdicts) {
        const node = (verdict.key ? leaves.find(leaf => leaf.key === verdict.key) : undefined)
            ?? leaves.find(leaf => leaf.name === verdict.criterion);
        if (!node) {
            unmatched.push(verdict.key ?? verdict.criterion);
            continue;
        }
        const scale = version.scales.find(item => item.id === node.scaleId);
        const levels = [...(scale?.levels ?? [])].sort((a, b) => a.normalizedValue - b.normalizedValue);
        const byLabel = verdict.level ? levels.find(level => level.label === verdict.level) : undefined;
        const level = byLabel ?? (verdict.met ? levels[levels.length - 1] : levels[0]);
        if (!level) {
            unmatched.push(node.key);
            continue;
        }
        candidates.push({ criterionId: node.id, scaleLevelId: level.id, rationale: verdict.evidence ?? '', evidence: [] });
    }
    return { candidates, unmatched };
}
```

`index.ts`: add a section

```ts
// ─── Rubric Evaluator Exports ─────────────────────────────
export * from './rubric/ComputerUseRubricEvaluator.js';
```

- [ ] **Step 4: Run the test and build**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/computer-use-rubric-evaluator.test.ts && npm run build`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/AI/MJComputerUse/package.json packages/AI/MJComputerUse/src/rubric/ComputerUseRubricEvaluator.ts packages/AI/MJComputerUse/src/index.ts packages/AI/MJComputerUse/src/__tests__/computer-use-rubric-evaluator.test.ts
git add pnpm-lock.yaml   # only if it changed
git commit -m "feat(computer-use-engine): ComputerUse rubric evaluator stores the in-run judge's verdicts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: The driver feeds the rubric into the loop

**Files:**
- Create: `packages/AI/MJComputerUse/src/test-driver/rubric-judge-criteria.ts`
- Modify: `packages/AI/MJComputerUse/src/test-driver/types.ts` (after `rubricFrames`)
- Modify: `packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts` (`Execute` steps 1c-2, step 5; `buildActualOutput`; new `loadJudgeRubric`)
- Modify: `packages/AI/MJComputerUse/src/index.ts`
- Test: `packages/AI/MJComputerUse/src/__tests__/rubric-judge-criteria.test.ts`

**Interfaces:**
- Produces: `export function RubricCriteriaForJudge(criteria: RubricCriterionPromptData[]): RubricJudgeCriterion[]`; `ComputerUseTestConfig.judgeWithRubric?: boolean` (default true); `actualOutput.finalJudgePromptRunId`; `protected loadJudgeRubric(config, context): Promise<RubricJudgeCriterion[] | undefined>`.
- Consumes: `ProviderRubricEngine`, `ProviderPromptService`, `RenderCriteriaText`, `RUBRIC_CRITERION_PROMPT`, `type RubricCriterionPromptData` from `@memberjunction/rubrics`; `RubricJudgeCriterion` from `@memberjunction/computer-use` (Task 13); `ComputerUseRubricEvaluator` (Task 15).

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/MJComputerUse/src/__tests__/rubric-judge-criteria.test.ts
import { describe, expect, it } from 'vitest';
import type { RubricCriterionPromptData } from '@memberjunction/rubrics';
import { RubricCriteriaForJudge } from '../test-driver/rubric-judge-criteria.js';

describe('RubricCriteriaForJudge', () => {
    it('keeps the key, uses the rendered text, and lists level labels lowest first', () => {
        const criteria = [
            { Key: 'grid', Name: 'Grid visible', Text: 'Grid visible: the Users grid shows rows.', Levels: [{ Label: 'Miss', NormalizedValue: 0, Anchor: null }, { Label: 'Meets', NormalizedValue: 1, Anchor: null }] },
            { Key: 'count', Name: 'Row count', Text: null, Levels: [] },
        ] as unknown as RubricCriterionPromptData[];
        const result = RubricCriteriaForJudge(criteria);
        expect(result.map(item => ({ Key: item.Key, Text: item.Text, Levels: item.Levels }))).toEqual([
            { Key: 'grid', Text: 'Grid visible: the Users grid shows rows.', Levels: ['Miss', 'Meets'] },
            { Key: 'count', Text: 'Row count', Levels: [] },
        ]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/MJComputerUse && npx vitest run src/__tests__/rubric-judge-criteria.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: The mapping module**

```ts
// packages/AI/MJComputerUse/src/test-driver/rubric-judge-criteria.ts
import { RubricJudgeCriterion } from '@memberjunction/computer-use';
import type { RubricCriterionPromptData } from '@memberjunction/rubrics';

/** A rubric's leaves as the in-run judge reads them: key, the rendered criterion text, level labels lowest first. */
export function RubricCriteriaForJudge(criteria: RubricCriterionPromptData[]): RubricJudgeCriterion[] {
    return criteria.map(item => {
        const criterion = new RubricJudgeCriterion();
        criterion.Key = item.Key;
        criterion.Text = item.Text ?? item.Name;
        criterion.Levels = item.Levels.map(level => level.Label);
        return criterion;
    });
}
```

- [ ] **Step 4: Config and driver**

`types.ts`, after `rubricFrames`:

```ts
    /**
     * When a published rubric resolves, its criteria drive the in-run judge and the
     * rubric oracle stores that judge's final verdict with no second model call (default true).
     * False keeps judgeValidationCriteria in the loop and judges the rubric after the run.
     */
    judgeWithRubric?: boolean;
```

`ComputerUseTestDriver.ts` imports:

```ts
import { ProviderPromptService, ProviderRubricEngine, RenderCriteriaText, RUBRIC_CRITERION_PROMPT } from '@memberjunction/rubrics';
import type { RubricJudgeCriterion } from '@memberjunction/computer-use';
import { RubricCriteriaForJudge } from './rubric-judge-criteria.js';
import './../rubric/ComputerUseRubricEvaluator.js';
```

In `Execute`, before "2. Build engine params", resolve the rubric once and load its leaves; move the Task 10 resolution here so it is not done twice:

```ts
            // 1d. Resolve the rubric once. Its leaves can drive the in-run judge.
            const resolved = await this.ResolveRubricForRun(config, context);
            const rubricCriteria = await this.loadJudgeRubric(resolved, context);
            const judged = WithDefaultRubricEvaluator(resolved, rubricCriteria
                ? { EvaluatorName: 'ComputerUse' }
                : { EvaluatorType: 'AIPrompt', PromptName: COMPUTER_USE_RUBRIC_JUDGE, ModelSelection: 'Judge' });
```

After `buildRunParams`, replace the `judgeValidationCriteria` block with:

```ts
            if (rubricCriteria && rubricCriteria.length > 0) {
                runParams.RubricCriteria = rubricCriteria;
                runParams.ValidationCriteria = rubricCriteria.map(item => item.Text);
                if (expected.judgeValidationCriteria && expected.judgeValidationCriteria.length > 0) {
                    this.logToTestRun(context, 'warn', 'The rubric drives the judge; judgeValidationCriteria were not used.');
                }
            } else if (expected.judgeValidationCriteria && expected.judgeValidationCriteria.length > 0) {
                runParams.ValidationCriteria = expected.judgeValidationCriteria;
            }
```

In step 5, use `judged` (already resolved) and drop the second `ResolveRubricForRun` call from Task 10:

```ts
            const frames = SelectRubricFrames(result, judged.rubricFrames ?? DEFAULT_RUBRIC_FRAMES);
            const oracleResults = await this.runOracles(judged, input, expected, actualOutput, frames, context);
```

Add the loader:

```ts
    /** The resolved rubric's leaves, rendered for the in-run judge. Undefined when no rubric drives the judge. */
    protected async loadJudgeRubric(config: ComputerUseTestConfig, context: DriverExecutionContext): Promise<RubricJudgeCriterion[] | undefined> {
        if (config.judgeWithRubric === false) return undefined;
        const versionId = config.oracles?.find(oracle => oracle.type === 'rubric')?.config?.rubricVersionId;
        if (typeof versionId !== 'string') return undefined;
        const engine = ProviderRubricEngine(this.Provider, context.contextUser);
        const version = await engine.GetRubric({ versionId });
        if (!version) return undefined;
        const criteria = await RenderCriteriaText(version, ProviderPromptService(this.Provider, context.contextUser), { Name: RUBRIC_CRITERION_PROMPT });
        const judge = RubricCriteriaForJudge(criteria);
        return judge.length > 0 ? judge : undefined;
    }
```

In `buildActualOutput`, after the `criteriaVerdicts` block:

```ts
        const judgedStep = [...result.Steps].reverse().find(step => step.JudgeVerdict);
        if (judgedStep?.JudgePromptRunId) {
            output.finalJudgePromptRunId = judgedStep.JudgePromptRunId;
        }
```

(`BuildRubricSubject` already copies `finalJudgePromptRunId` into `data`, Task 5.)

`index.ts`: `export * from './test-driver/rubric-judge-criteria.js';`

- [ ] **Step 5: Build and run all MJComputerUse tests**

Run: `cd packages/AI/MJComputerUse && npm run build && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/AI/MJComputerUse/src/test-driver/rubric-judge-criteria.ts packages/AI/MJComputerUse/src/test-driver/types.ts packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts packages/AI/MJComputerUse/src/index.ts packages/AI/MJComputerUse/src/__tests__/rubric-judge-criteria.test.ts
git commit -m "feat(computer-use-engine): a published rubric drives the in-run judge and stores its verdict

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Phase 3 docs, manifest, and changeset

**Files:**
- Modify: `guides/RUBRICS_GUIDE.md` §3 (new subsection "Computer use tests"), §8 built-in evaluators table (one row)
- Modify: `packages/AI/MJComputerUse/README.md` (test driver section: `rubricFrames`, `judgeWithRubric`; judge section: remove the claim that `MJLLMJudge` is used, say the engine routes the judge through `executeJudgePrompt`)
- Regenerate: `packages/ServerBootstrap/src/generated/mj-class-registrations.ts`
- Create: `.changeset/rubric-drives-computer-use-judge.md`

- [ ] **Step 1: Guide**

§3, add before "Moving inline criteria to a rubric":

```markdown
### Computer use tests

A computer use test with a resolved, published rubric runs one judge, not two. The rubric's leaves are
rendered through *Rubric Criterion* and given to the in-run judge with their keys and level labels; the run
stops when every criterion is met, as before. After the run, the `rubric` oracle uses the **ComputerUse**
evaluator, which turns the final judge verdict (one level per key) into the stored evaluation and links the
judge's prompt run as `AIPromptRunID`. No second model call is made.

| Setting | Default | Effect |
|---|---|---|
| `Configuration.judgeWithRubric` | `true` | `false` keeps `judgeValidationCriteria` in the loop and judges the rubric after the run with *Rubric Judge - Computer Use* |
| `Configuration.rubricFrames` | `6` | How many run frames the after-run judge sees. `0` sends the transcript only |

The in-run judge sees the current frame each time it runs; the after-run judge sees the transcript and the chosen
frames. Use `judgeWithRubric: false` when a criterion needs the whole path (for example "never showed an error").
```

§8 table, add a row: `| `ComputerUse` | AIPrompt | Nothing. Reads the computer use run's in-run judge verdicts (one level per criterion key) from the subject and links the judge's prompt run | none |`.

- [ ] **Step 2: Manifest**

Run: `cd /Users/caelebbalanesi/PROJ3/MJ && npm run mj:manifest:server-bootstrap`
Expected: `packages/ServerBootstrap/src/generated/mj-class-registrations.ts` lists `ComputerUseRubricEvaluator` under `@memberjunction/computer-use-engine`. Commit the file if it changed.

- [ ] **Step 3: Changeset**

```markdown
---
"@memberjunction/computer-use": minor
"@memberjunction/computer-use-engine": minor
---

A published rubric can drive the computer use judge. `RunComputerUseParams.RubricCriteria` carries criteria with keys and level labels; the judge echoes each key and chooses a level (`CriterionVerdict.key`, `.level`), and `Done` is still every criterion met. The Computer Use test driver renders the resolved rubric's leaves into the loop (`judgeWithRubric`, default true) and its `rubric` oracle uses the new `ComputerUse` evaluator, which stores the final verdict as the evaluation with the judge's prompt run linked and no second model call.
```

- [ ] **Step 4: Commit**

```bash
git add guides/RUBRICS_GUIDE.md packages/AI/MJComputerUse/README.md packages/ServerBootstrap/src/generated/mj-class-registrations.ts .changeset/rubric-drives-computer-use-judge.md
git commit -m "docs(computer-use-engine): rubric-driven judging for computer use tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Live check**

Run the same computer use test with `--rubric`. Expected in the log: no `Oracle rubric` prompt call after the run (the oracle finishes in milliseconds), `MJ: Rubric Evaluations` has a Submitted row with `EvaluatorName = 'ComputerUse'`, `EvaluatorType = 'AIPrompt'`, and `AIPromptRunID` pointing at a `Computer Use - Judge` prompt run. Then run with `"judgeWithRubric": false` and confirm the after-run judge path from phase 2 still works.

---

## Self-review

**Spec coverage.** Phase 1: provider in one place (Task 1), resolution in the base driver (Task 3), driver-shaped subject (Tasks 2, 5, 6), unpublished rubric does not fail the test (Task 3; the spec said "advisory result", this plan skips the oracle and warns because Agent Eval and Prompt Eval ignore `advisory` when gating, so an advisory failing result would still fail those tests). Phase 2: images in the subject and `ChatMessageContent` (Task 7), frame choice (Task 10), true final frame (Task 9), vision judge with `ModelSelection: Judge` (Tasks 8, 10), frame evidence (Task 7), post-run content provider (Task 11). Phase 3: rubric leaves into the loop (Tasks 13, 14, 16), `ComputerUse` evaluator (Task 15), levels in the verdict (Tasks 13, 14; phase 3 is no longer limited to Binary scales because the judge returns a level label).

**Known limits, called out in the plan.** Decision Eval's per-oracle weights still give an implicit rubric weight 0 (Task 4). `finalJudgePromptRunId` is the last judged step's run; a forced final judge after the last step is not on a step (Task 16). `IntegrationTestDriver.SetupSuite` does not call `super`, so its suites never pin a rubric (they do not use one).

**Type consistency.** `BuildOracleInput`, `ResolveRubricForRun`, `RubricJudgedConfig`, `AgentRubricResolution`, `RubricSubject`/`RubricSubjectImage` (MJComputerUse) vs `RubricSubjectContent`/`RubricSubjectImage` (rubrics) are structurally identical by design; `RubricJudgeCriterion` (`Key`, `Text`, `Levels`) is used with those names in Tasks 13, 14, 16; `CriterionVerdict` keeps lowercase `criterion`, `met`, `evidence` and adds lowercase `key`, `level`, matched by `JudgeCriterionVerdict` in Task 15.
