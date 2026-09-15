/**
 * prompt-eval-harness.checks.ts — the 'prompt-eval-harness' bundle (PE1–PE7): deliverable T5.
 *
 * **Verifies the measuring instrument, not the models.** Eval runs spend real tokens to
 * produce rates; those rates are only meaningful if the harness that produced them is correct. So
 * this bundle proves — deterministically, for zero tokens — that:
 *
 *   - every corpus case names an agent and actions that actually exist (PE1);
 *   - the golden files and the generated `MJ: Tests` records have not drifted apart (PE2);
 *   - every corpus expectation is decidable — a correct answer exists that passes it (PE3);
 *   - a scripted CORRECT model reply scores as correct end to end through the real driver (PE4);
 *   - a scripted MALFORMED reply is actually caught, rather than quietly scoring as fine (PE5);
 *   - a scripted WRONG-BUT-WELL-FORMED reply separates the two metrics (PE6);
 *   - a record the GENERATOR produced satisfies the DRIVER that consumes it (PE7).
 *
 * **Which of these run on a PR.** PE1–PE3, PE5 and PE6 read the corpus FILES and the evaluator
 * functions, so they run everywhere and gate every PR. PE4 and PE7 are environment-dependent and
 * SKIP-AS-PASS on a CI runner:
 *
 *   - PE7 needs the corpus in the DATABASE, and CI deliberately pushes only `metadata` and
 *     `metadata-optional/integration-test` — the corpus is a measurement fixture, not product
 *     metadata, so it is not pushed and PE7 has nothing to drive.
 *   - PE4 needs at least one model-vendor with configured credentials, because model selection
 *     rejects candidates on credentials BEFORE the ClassFactory can hand back the registered
 *     TestLLM. A runner with no keys never reaches the stub.
 *
 * Both therefore prove something only on a developer database or an eval host. Treat their green
 * on a PR as "not evaluated", not as "passed". Tracked in #4438.
 *
 * PE5 and PE6 are the ones that matter most. A harness that never fails is indistinguishable from
 * a harness that always passes, and the entire native-tool-calling argument rests on a malformed
 * rate this thing reports. If it cannot detect a malformed response on demand, no number it
 * produces means anything.
 *
 * TRANSPORT: server. Needs the AI stack in-process (AIEngine, AIPromptRunner, the ClassFactory).
 * NO REAL LLM CALLS — `TestLLM` is registered over the driver classes so the real `BaseLLM`
 * routing, the real prompt runner, and the real oracles all execute against scripted output.
 * Read-only: nothing here mutates catalog data; prompt-run rows are the runner's own.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { PromptEvalDriver, AgentDecisionOracle, ResponseWellFormedOracle } from '@memberjunction/testing-engine';
import type { IOracle } from '@memberjunction/testing-engine';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { TestLLM, registerTestLLM } from '@memberjunction/unit-testing';
import { parseCorpusCase, normalizeDecision, evaluateCorpusExpectation, evaluateWellFormed, type CorpusCase } from '@memberjunction/testing-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const CORPUS_DIR = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/cases');
const GENERATED_TESTS_DIR = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/tests');
const MATRIX_DIR = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/matrix');
const GENERATED_PROVENANCE = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/tests/generated-from.json');

/**
 * The matrix the generated records were actually built from.
 *
 * Not a constant, because the generated set holds ONE matrix at a time: regenerating for one matrix
 * replaces the other matrix's records on disk, and a hardcoded path then reports that deliberate switch as
 * drift. What must still be policed is that the matrix is a **pinned** one — a hand-rolled matrix
 * outside `matrix/` is exactly the "right suite name, wrong models, wrong price" failure PE2 exists
 * to catch — so the recorded path is required to resolve inside `matrix/`.
 */
function activeMatrixPath(): string {
    if (!existsSync(GENERATED_PROVENANCE)) {
        // Pre-provenance records, or a hand-assembled directory. Fall back to the baseline pin,
        // which is what every generated set was built from before this file existed.
        return join(MATRIX_DIR, 'envelope-baseline.json');
    }
    const { matrix } = JSON.parse(readFileSync(GENERATED_PROVENANCE, 'utf8')) as { matrix: string | null };
    Assert(!!matrix, 'tests/generated-from.json records no matrix — regenerate with rigs/generate-prompt-eval-suite.ts');
    const resolved = join(REPO_ROOT, matrix as string);
    Assert(resolved.startsWith(MATRIX_DIR + '/'),
        `Generated records claim matrix '${matrix}', which is outside ${relative(REPO_ROOT, MATRIX_DIR)}/ — ` +
        'only a pinned matrix may generate a suite, otherwise the suite name promises models it did not run');
    Assert(existsSync(resolved), `Generated records claim matrix '${matrix}', which does not exist`);
    return resolved;
}

function loadCorpus(): CorpusCase[] {
    return readdirSync(CORPUS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => parseCorpusCase(JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')) as unknown));
}

/**
 * The raw `LoopAgentResponse` envelope a correct model would emit for one expectation branch.
 *
 * PE3 synthesizes a *normalized decision*; this synthesizes the *wire text* a model produces, which
 * is what a driver-level check needs — the normalizer is part of what it is testing.
 */
/** A value shaped to pass one on-disk matcher (payload synthesis; regex is unsatisfiable by construction). */
function satisfyingValue(m: { matcher: string; value?: unknown; values?: unknown[]; type?: string }): unknown {
    switch (m.matcher) {
        case 'exact': case 'numericTolerance': return m.value;
        case 'oneOf': return (m.values ?? [])[0];
        case 'typeOf': return m.type === 'number' ? 1 : m.type === 'boolean' ? true : m.type === 'array' ? ['a usable value'] : m.type === 'object' ? { key: 'a usable value' } : 'a usable value';
        case 'absent': return undefined;
        default: return 'a usable value';
    }
}

/** Builds a payload change request that satisfies every dotted-path matcher of a payload expectation. */
function synthesizePayloadChange(payload: Record<string, { matcher: string; value?: unknown; values?: unknown[]; type?: string }> | undefined): Record<string, unknown> {
    if (!payload || Object.keys(payload).length === 0) {
        return { newElements: { done: true } };
    }
    const change: Record<string, unknown> = {};
    for (const [path, m] of Object.entries(payload)) {
        const value = satisfyingValue(m);
        if (value === undefined) continue;
        const keys = path.split('.');
        let cursor: Record<string, unknown> = change;
        for (const key of keys.slice(0, -1)) {
            cursor = (cursor[key] ??= {}) as Record<string, unknown>;
        }
        cursor[keys[keys.length - 1]] = value;
    }
    return change;
}

function synthesizeEnvelope(expect: CorpusCase['expect']): Record<string, unknown> {
    switch (expect.kind) {
        case 'action':
            return { taskComplete: false, nextStep: { type: 'Actions', actions: (expect.actions ?? []).map((a) => ({
                name: a.name,
                params: Object.fromEntries(Object.entries(a.params ?? {}).map(([param, m]) =>
                    [param, m.matcher === 'exact' || m.matcher === 'numericTolerance' ? m.value
                        : m.matcher === 'oneOf' ? (m.values ?? [])[0]
                        : 'a usable value']))
            })) } };
        case 'subAgent':
            return { taskComplete: false, nextStep: { type: 'Sub-Agent', subAgents: (expect.subAgents ?? [])
                .map((n) => ({ name: n, message: 'go', terminateAfter: false })) } };
        case 'chat':
            return { taskComplete: false, message: 'a usable message', nextStep: { type: 'Chat' } };
        case 'payloadChange':
            return { payloadChangeRequest: { newElements: { done: true } } };
        default:
            return { taskComplete: true, message: 'done' };
    }
}

/** Every action / sub-agent name an expectation references, including inside `anyOf` branches. */
function referencedNames(expect: CorpusCase['expect']): string[] {
    if (expect.kind === 'anyOf') {
        return (expect.anyOf ?? []).flatMap(referencedNames);
    }
    return [
        ...(expect.actions ?? []).map((a) => a.name),
        ...(expect.subAgents ?? []),
        ...(expect.forbiddenActions ?? [])
    ];
}

/** The catalog's view of what one agent can actually do. */
async function agentCapabilities(ctx: IntegrationCheckContext): Promise<Map<string, Set<string>>> {
    const rv = new RunView();
    const [agents, agentActions, actions] = await Promise.all([
        rv.RunView({ EntityName: 'MJ: AI Agents', ExtraFilter: `Status='Active'`, ResultType: 'simple' }, ctx.User),
        rv.RunView({ EntityName: 'MJ: AI Agent Actions', ExtraFilter: `Status='Active'`, ResultType: 'simple' }, ctx.User),
        rv.RunView({ EntityName: 'MJ: Actions', ResultType: 'simple' }, ctx.User)
    ]);
    Assert(agents.Success && agentActions.Success && actions.Success, 'Failed to load the agent/action catalog');

    const agentRows = agents.Results as Array<{ ID: string; Name: string; ParentID: string | null }>;
    const actionName = new Map((actions.Results as Array<{ ID: string; Name: string }>).map((a) => [a.ID, a.Name]));
    const byAgentId = new Map(agentRows.map((a) => [a.ID, a.Name]));

    const capabilities = new Map<string, Set<string>>(agentRows.map((a) => [a.Name, new Set<string>()]));
    for (const link of agentActions.Results as Array<{ AgentID: string; ActionID: string }>) {
        const agent = byAgentId.get(link.AgentID);
        const action = actionName.get(link.ActionID);
        if (agent && action) {
            capabilities.get(agent)?.add(action);
        }
    }
    for (const child of agentRows.filter((a) => a.ParentID)) {
        const parent = byAgentId.get(child.ParentID as string);
        if (parent) {
            capabilities.get(parent)?.add(child.Name);
        }
    }
    return capabilities;
}

const checks: NamedCheck[] = [
    {
        Id: 'prompt-eval-harness.PE1',
        Name: 'PE1: every corpus case names an agent and capabilities that exist in the catalog',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            // The unit tier can prove a case PARSES; only a database can prove it is ANSWERABLE.
            // A case naming an action its agent does not have is either unsatisfiable (the model
            // cannot possibly pass) or vacuous (a prohibition that can never fire) — and both look
            // like model behavior in the results. Two such cases existed when this was written.
            const corpus = loadCorpus();
            Assert(corpus.length >= 40, `Corpus has ${corpus.length} cases; the plan calls for ~40-60`);
            const capabilities = await agentCapabilities(ctx);

            const problems: string[] = [];
            for (const testCase of corpus) {
                const known = capabilities.get(testCase.agent);
                if (!known) {
                    problems.push(`${testCase.id}: agent '${testCase.agent}' is not an active agent`);
                    continue;
                }
                for (const name of referencedNames(testCase.expect)) {
                    if (!known.has(name)) {
                        problems.push(`${testCase.id}: '${testCase.agent}' has no action or sub-agent named '${name}'`);
                    }
                }
            }
            Assert(problems.length === 0, `Corpus references capabilities that do not exist:\n  ${problems.join('\n  ')}`);
            console.log(`      → ${corpus.length} case(s) verified against the live catalog`);
        }
    },
    {
        Id: 'prompt-eval-harness.PE2',
        Name: 'PE2: generated MJ: Tests records have not drifted from the golden files',
        Fn: async (): Promise<void> => {
            // The generator is the only supported way to produce these. A hand-edit, or a corpus
            // change nobody regenerated after, silently runs a stale expectation forever.
            const corpus = loadCorpus();
            // .mj-sync.json is the directory's sync config, not a test record.
            const generated = readdirSync(GENERATED_TESTS_DIR)
                .filter((f) => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json');
            Assert(generated.length > 0, 'No generated test records found — run rigs/generate-prompt-eval-suite.ts');

            const problems: string[] = [];
            for (const file of generated) {
                const record = JSON.parse(readFileSync(join(GENERATED_TESTS_DIR, file), 'utf8')) as
                    { fields: { ExpectedOutcomes: { caseId: string; expect: unknown } } };
                const caseId = record.fields.ExpectedOutcomes?.caseId;
                const source = corpus.find((c) => c.id === caseId);
                if (!source) {
                    problems.push(`${file}: references case '${caseId}', which no longer exists`);
                    continue;
                }
                if (JSON.stringify(record.fields.ExpectedOutcomes.expect) !== JSON.stringify(source.expect)) {
                    problems.push(`${file}: expectation differs from the golden file — regenerate`);
                }
            }
            const missing = corpus.filter((c) => !generated.some((f) => f.includes(c.id)));

            // The MATRIX half. The loop above only proves each record matches SOME golden case, so
            // it passes just as happily on a suite generated against the wrong matrix — which is a
            // baseline measured on the wrong models, at the wrong price, under the right name.
            // Only the cross product catches that.
            const matrixPath = activeMatrixPath();
            const cells = (JSON.parse(readFileSync(matrixPath, 'utf8')) as { cells: Array<{ label: string }> }).cells;
            const uncovered = cells.filter((cell) => {
                const suffix = `--${cell.label.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}.json`;
                return generated.filter((f) => f.endsWith(suffix)).length !== corpus.length;
            });

            Assert(problems.length === 0 && missing.length === 0 && uncovered.length === 0,
                `Generated records are stale:\n  ${[
                    ...problems,
                    ...missing.map((c) => `${c.id}: no generated record`),
                    ...uncovered.map((c) => `cell '${c.label}': expected ${corpus.length} record(s), matrix coverage incomplete`)
                ].join('\n  ')}`);
            AssertEqual(generated.length, corpus.length * cells.length,
                'Generated record count must be corpus × pinned matrix cells');

            // The REPETITION half. `reps` once reached only the cost manifest, so a
            // matrix asking for N=3 priced three passes and ran one — the run looked healthy, the
            // spend looked like a bargain, and the repetition the plan wants for rate-based
            // comparison was simply absent. Nothing about the output said so; only the arithmetic
            // between the manifest and the row count did, and nobody does that arithmetic.
            const reps = (JSON.parse(readFileSync(matrixPath, 'utf8')) as { reps: number }).reps;
            const wrongReps = generated
                .map((f) => ({ f, r: (JSON.parse(readFileSync(join(GENERATED_TESTS_DIR, f), 'utf8')) as
                    { fields: { RepeatCount?: number } }).fields.RepeatCount }))
                .filter((x) => (x.r ?? 1) !== reps);
            Assert(wrongReps.length === 0,
                `The matrix asks for reps=${reps}, but ${wrongReps.length} record(s) carry a different ` +
                `RepeatCount — the run would silently execute a different number of passes than it prices. ` +
                `First: ${wrongReps[0]?.f} (RepeatCount=${wrongReps[0]?.r ?? 'absent'})`);
            console.log(`      → ${generated.length} generated record(s) = ${corpus.length} golden file(s) × ${cells.length} cell(s) of ${relative(REPO_ROOT, matrixPath)}, RepeatCount=${reps}`);
        }
    },
    {
        Id: 'prompt-eval-harness.PE3',
        Name: 'PE3: every corpus expectation is decidable — a correct answer exists that passes it',
        Fn: async (): Promise<void> => {
            // Guards against an expectation nothing could satisfy. Synthesizes the decision the
            // case describes and asserts the case accepts it. A corpus of unsatisfiable cases
            // would report a 0% baseline that says nothing about any model.
            const problems: string[] = [];
            for (const testCase of loadCorpus()) {
                const expect = testCase.expect.kind === 'anyOf' ? (testCase.expect.anyOf ?? [])[0] : testCase.expect;
                const synthesized = expect.kind === 'action'
                    ? normalizeDecision({ toolCalls: (expect.actions ?? []).map((a) => ({
                        name: a.name,
                        // Satisfy each declared matcher with a value shaped to pass it.
                        arguments: Object.fromEntries(Object.entries(a.params ?? {}).map(([p, m]) =>
                            [p, m.matcher === 'exact' || m.matcher === 'numericTolerance' ? m.value
                                : m.matcher === 'oneOf' ? (m.values ?? [])[0]
                                : m.matcher === 'regex' ? undefined
                                : 'a usable value']))
                      })).concat(expect.payload ? [{ name: 'payload_change_request', arguments: synthesizePayloadChange(expect.payload) }] : []),
                      controlToolMap: expect.payload ? { payload_change_request: { kind: 'payloadChange' } } : undefined })
                    : normalizeDecision({ text: JSON.stringify(
                        expect.kind === 'chat' ? { taskComplete: false, message: 'a usable message', nextStep: { type: 'Chat' } }
                        : expect.kind === 'subAgent' ? { taskComplete: false, nextStep: { type: 'Sub-Agent', subAgents: (expect.subAgents ?? []).map((n) => ({ name: n, message: 'go', terminateAfter: false })) } }
                        : expect.kind === 'payloadChange' ? { payloadChangeRequest: synthesizePayloadChange(expect.payload) }
                        : { taskComplete: true, message: 'done' }) });

                // Regex matchers cannot be satisfied by synthesis, so only assert on cases without
                // one — the rest are covered by PE1's name check and the unit tier's matcher tests.
                const hasRegex = JSON.stringify(expect).includes('"regex"');
                if (hasRegex) {
                    continue;
                }
                const evaluation = evaluateCorpusExpectation(testCase.id, testCase.expect, synthesized);
                if (!evaluation.passed) {
                    problems.push(`${testCase.id}: no synthesized correct answer passes it — ${evaluation.messages.join('; ')}`);
                }
            }
            Assert(problems.length === 0, `Undecidable corpus expectation(s):\n  ${problems.join('\n  ')}`);
            console.log('      → every non-regex corpus expectation accepts a correct answer');
        }
    },
    {
        Id: 'prompt-eval-harness.PE4',
        Name: 'PE4: a scripted CORRECT reply scores as correct through the REAL prompt runner',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            // The end-to-end link every eval run depends on: AIPromptRunner → real BaseLLM routing →
            // ChatResult → the driver's turn extraction → normalizer → oracle. Everything except
            // the provider is real; TestLLM is registered over the driver classes so the
            // ClassFactory hands back scripted output through a genuine `new`.
            await AIEngine.Instance.Config(false, ctx.User);
            const prompt = AIEngine.Instance.Prompts.find((p) => p.Status === 'Active');
            Assert(!!prompt, 'No active prompt available to drive the runner');

            const llm = new TestLLM();
            llm.Script({ kind: 'succeed', content: JSON.stringify({
                taskComplete: false,
                nextStep: { type: 'Actions', actions: [{ name: 'Get Weather', params: { location: 'Chicago' } }] }
            }) });
            registerTestLLM(llm, ['OpenAILLM', 'AnthropicLLM', 'GeminiLLM', 'CerebrasLLM', 'GroqLLM']);

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt({ prompt: prompt!, contextUser: ctx.User, skipValidation: true });
            // Fire-and-forget persistence — settle it exactly as the driver does.
            await runner.WaitForPendingPromptRunSaves();
            if (!result.success && (result.errorMessage ?? '').includes('No valid API credentials')) {
                // Registering TestLLM over the driver classes is NOT enough to make this run
                // offline: model selection filters candidates on configured credentials before the
                // ClassFactory ever instantiates a driver, so with no keys every candidate is
                // rejected and TestLLM is never reached. A CI runner has no keys and this bundle
                // must not require them, so skip loudly rather than fail.
                //
                // Cost of this skip: PE4 provides NO per-PR coverage on a credential-less runner —
                // it only proves anything on a database that has some. Making it run in CI for real
                // needs a credential fixture in metadata-optional/integration-test (which CI does
                // push), not a change here. `errorMessage` is matched as a string because
                // AIPromptRunResult carries no typed error; base-agent.ts:5253 does the same.
                console.log('      → skipped: no model-vendor in this database has configured '
                    + 'credentials (selection rejects every candidate before TestLLM is reached)');
                return;
            }
            Assert(result.success, `Scripted prompt run failed: ${result.errorMessage}`);
            Assert(llm.CalledModels.length > 0, 'TestLLM was never reached — the ClassFactory did not resolve it');

            // The same extraction PromptEvalDriver performs.
            const choice = result.chatResult?.data?.choices?.[0];
            const decision = normalizeDecision({
                text: choice?.message?.content ?? result.rawResult ?? '',
                toolCalls: choice?.message?.toolCalls?.map((c) => ({ name: c.name, arguments: c.arguments })) ?? null
            });

            AssertEqual(decision.kind, 'action', 'The scripted envelope must normalize to an action decision');
            const evaluation = evaluateCorpusExpectation('pe4', { kind: 'action', actions: [{ name: 'Get Weather' }] }, decision);
            AssertEqual(evaluation.passed, true, `A correct reply must score as correct: ${evaluation.messages.join('; ')}`);
            AssertEqual(evaluateWellFormed({ decision }).passed, true, 'A correct reply must be well-formed');
            console.log('      → real runner + scripted reply → decision pass + well-formed pass');
        }
    },
    {
        Id: 'prompt-eval-harness.PE7',
        Name: 'PE7: a real GENERATED record scores correctly through the real PromptEvalDriver',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            // The contract check the other five miss. PE1-PE6 exercise the evaluator functions and
            // the prompt runner directly, each with a hand-built input — so nothing asserted that a
            // record the GENERATOR produced actually satisfies the DRIVER that consumes it. Two
            // Real bugs have shipped through that gap, both invisible to a green suite:
            //   * the generator wrote `agentName` while PromptEvalConfig read only `agentId`, so
            //     every one of the 171 records failed before reaching a model;
            //   * AgentDecisionOracle called evaluateDecision rather than evaluateCorpusExpectation,
            //     so all 13 `anyOf` cases scored a failure no model could have avoided.
            // Both are shape mismatches between two components that unit-test cleanly apart. Only
            // running a real record end to end catches that class, so this drives the whole path:
            // generated Configuration -> driver -> agent resolution -> prompt runner -> oracles.
            const corpus = loadCorpus();
            const anyOfCase = corpus.find((c) => c.expect.kind === 'anyOf'
                && (c.expect.anyOf ?? []).some((b) => !JSON.stringify(b).includes('"regex"')));
            Assert(!!anyOfCase, 'Corpus has no anyOf case — PE7 covers the anyOf path specifically');

            // Find the generated record for that case, whichever cell comes first.
            const file = readdirSync(GENERATED_TESTS_DIR)
                .find((f) => f.startsWith(`.${anyOfCase!.id}--`) && f.endsWith('.json'));
            Assert(!!file, `No generated record for '${anyOfCase!.id}'`);
            const record = JSON.parse(readFileSync(join(GENERATED_TESTS_DIR, file!), 'utf8')) as
                { fields: { Name: string } };

            const rv = new RunView();
            const found = await rv.RunView({
                EntityName: 'MJ: Tests',
                ExtraFilter: `Name='${EscapeSQLString(record.fields.Name)}'`,
                ResultType: 'entity_object'
            }, ctx.User);
            Assert(found.Success, `Query for the generated record failed: ${found.ErrorMessage}`);
            if (found.Results.length === 0) {
                // The corpus is a MEASUREMENT FIXTURE, not product metadata, so CI deliberately does
                // not push metadata-optional/prompt-eval-corpus — only metadata and
                // metadata-optional/integration-test. Without those rows this check has nothing to
                // drive, so skip loudly rather than fail a lane that was never going to have them.
                // The generator↔driver contract this covers still gets exercised wherever the corpus
                // IS pushed (a dev database, the eval runs themselves), and PE1–PE3 keep covering the
                // corpus FILES on every PR for zero tokens.
                console.log(`      → skipped: '${record.fields.Name}' is not in this database `
                    + `(corpus not pushed — mj sync push --dir=metadata-optional/prompt-eval-corpus)`);
                return;
            }
            Assert(found.Results.length === 1,
                `Generated record '${record.fields.Name}' is ambiguous — ${found.Results.length} rows share that name`);
            const test = found.Results[0] as MJTestEntity;

            // Script a reply satisfying the FIRST anyOf branch. If the oracle ignores anyOf and
            // compares the literal kind 'anyOf', this cannot pass however correct the reply is.
            // A regex matcher cannot be satisfied by synthesis, so take the first branch without one.
            const branch = (anyOfCase!.expect.anyOf ?? []).find((b) => !JSON.stringify(b).includes('"regex"'));
            Assert(!!branch, 'anyOf case has no synthesizable branch');
            const llm = new TestLLM();
            llm.Script({ kind: 'succeed', content: JSON.stringify(synthesizeEnvelope(branch!)) });
            registerTestLLM(llm, ['OpenAILLM', 'AnthropicLLM', 'GeminiLLM', 'CerebrasLLM', 'GroqLLM']);

            await AIEngine.Instance.Config(false, ctx.User);
            const testRun = await ctx.Provider.GetEntityObject<MJTestRunEntity>('MJ: Test Runs', ctx.User);
            testRun.NewRecord();

            // The two oracles the generated record's Configuration asks for, registered the way
            // TestEngine registers them.
            const oracleRegistry = new Map<string, IOracle>([
                ['agent-decision-match', new AgentDecisionOracle()],
                ['response-well-formed', new ResponseWellFormedOracle()]
            ]);
            const driver = new PromptEvalDriver();
            const result = await driver.Execute({ test, testRun, contextUser: ctx.User, options: {}, oracleRegistry });

            const decisionOracle = result.oracleResults.find((r) => r.oracleType === 'agent-decision-match');
            Assert(!!decisionOracle, 'agent-decision-match did not run');
            Assert(decisionOracle!.passed,
                `A reply matching an anyOf branch must score correct: ${decisionOracle!.message}`);
            console.log(`      → generated record '${record.fields.Name}' scored ${result.score} through the real driver`);
        }
    },
    {
        Id: 'prompt-eval-harness.PE5',
        Name: 'PE5: a scripted MALFORMED reply is actually caught',
        Fn: async (): Promise<void> => {
            // The load-bearing negative. If this ever passes-as-clean, every malformed rate the
            // baseline reports is a fiction.
            const prose = normalizeDecision({ text: 'Sure! I will look up the weather for you now.' });
            AssertEqual(evaluateWellFormed({ decision: prose }).passed, false, 'Prose instead of an envelope must be malformed');

            const empty = normalizeDecision({ text: '' });
            AssertEqual(evaluateWellFormed({ decision: empty }).passed, false, 'Empty output must be malformed');

            // The exact shape MJ's own shipped exemplars taught before the exemplar audit: a step
            // type the dispatcher cannot switch on, which costs a forced Retry.
            const badStepType = normalizeDecision({ text: JSON.stringify({ taskComplete: true, nextStep: { type: 'Success' } }) });
            AssertEqual(evaluateWellFormed({ decision: badStepType }).passed, false, "nextStep.type 'Success' must be malformed");

            const wrongCase = normalizeDecision({ text: JSON.stringify({ taskComplete: false, message: 'hi', nextStep: { type: 'chat' } }) });
            AssertEqual(evaluateWellFormed({ decision: wrongCase }).passed, false, "A lower-cased 'chat' must be malformed — the dispatcher is case-sensitive");

            const truncated = normalizeDecision({ text: JSON.stringify({ taskComplete: true }) });
            AssertEqual(evaluateWellFormed({ decision: truncated, finishReason: 'MALFORMED_FUNCTION_CALL' }).passed, false,
                'A malformed-function-call finish reason must fail regardless of content');
            console.log('      → all five malformed shapes detected');
        }
    },
    {
        Id: 'prompt-eval-harness.PE6',
        Name: 'PE6: a WRONG but well-formed reply separates the two metrics',
        Fn: async (): Promise<void> => {
            // Decision accuracy and malformed rate must move independently, or a comparison cannot say
            // WHICH of them a native run improved.
            const wrongButClean = normalizeDecision({ text: JSON.stringify({
                taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'Perplexity Search', params: {} }] }
            }) });
            AssertEqual(evaluateWellFormed({ decision: wrongButClean }).passed, true, 'A wrong-but-parseable reply is still well-formed');
            const evaluation = evaluateCorpusExpectation('pe6', { kind: 'action', actions: [{ name: 'Get Weather' }] }, wrongButClean);
            AssertEqual(evaluation.passed, false, 'Calling the wrong action must fail the decision oracle');
            AssertEqual(evaluation.decisionKindMatch, true, 'It chose the right KIND of thing — only the name was wrong');
            AssertEqual(evaluation.actionAccuracy, 0, 'Action accuracy must be the component that failed');
            console.log('      → well-formed pass + decision fail, with the failing component identified');
        }
    }
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
