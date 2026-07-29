/**
 * prompt-run-linkage.test.ts — regression guard for the agent-run → prompt-run linkage rule.
 *
 * Three live-harness helpers filtered `MJ: AI Prompt Runs` on `AgentRunID`, a column that does not
 * exist on AIPromptRun (its only agent-facing field is AgentID). Because RunView reports failure via
 * `Success: false` rather than throwing, and each helper coalesced that to `[]`, a SQL error was
 * indistinguishable from "this run made no model calls" — so the checks read zero prompt runs and
 * either passed vacuously or failed on an unrelated-looking assertion, and teardown silently left
 * every prompt-run row behind.
 *
 * A prompt run is reachable from its agent run only through the step that invoked it: an
 * `MJ: AI Agent Run Steps` row whose TargetLogID is the AIPromptRun's ID. Which step types qualify
 * is NOT just `Prompt` — base-agent writes a prompt run's id into TargetLogID on `Prompt`,
 * `Compaction`, and `Tool` steps, and counts only `Prompt` and `Compaction` toward the run's token
 * rollup. Stating the rule as Prompt-only is what made teardown orphan the other two, so the tests
 * below pin both sets deliberately: the exhaustive one that deletion must use, and the narrower
 * rollup-scoped one that token reconciliation must use.
 *
 * These tests pin that rule (`promptRunIdsFromSteps`) and pin that a failed RunView is surfaced
 * rather than swallowed (`requireRows`) — the property whose absence hid the original defect.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunViewResult } from '@memberjunction/core';
import {
    promptRunIdsFromSteps,
    requireRows,
    PROMPT_RUN_BEARING_STEP_TYPES,
    ROLLUP_BEARING_STEP_TYPES,
} from '../checks/agent-live-shared';

/** Build a RunViewResult without a DB — only the fields these helpers read carry meaning. */
function runViewResult<T>(partial: Partial<RunViewResult<T>>): RunViewResult<T> {
    return {
        Success: true,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: '',
        ...partial,
    };
}

describe('promptRunIdsFromSteps', () => {
    it('returns the TargetLogID of every Prompt step', () => {
        expect(
            promptRunIdsFromSteps([
                { StepType: 'Prompt', TargetLogID: 'pr-1' },
                { StepType: 'Prompt', TargetLogID: 'pr-2' },
            ]),
        ).toEqual(['pr-1', 'pr-2']);
    });

    it('ignores Sub-Agent and Actions steps — their TargetLogID points at another log type', () => {
        // Sub-Agent steps link a child AGENT RUN and Actions steps an Action Execution Log.
        // Treating those ids as prompt-run ids would delete or read the wrong rows entirely.
        expect(
            promptRunIdsFromSteps([
                { StepType: 'Sub-Agent', TargetLogID: 'child-run-1' },
                { StepType: 'Actions', TargetLogID: 'action-log-1' },
                { StepType: 'Prompt', TargetLogID: 'pr-1' },
            ]),
        ).toEqual(['pr-1']);
    });

    it('drops Prompt steps with a null TargetLogID — an unlinked step yields no prompt run', () => {
        expect(
            promptRunIdsFromSteps([
                { StepType: 'Prompt', TargetLogID: null },
                { StepType: 'Prompt', TargetLogID: 'pr-1' },
            ]),
        ).toEqual(['pr-1']);
    });

    it('returns empty for a run with no steps rather than throwing', () => {
        expect(promptRunIdsFromSteps([])).toEqual([]);
    });

    it('includes a Compaction step — cross-turn compaction stores its AIPromptRun in TargetLogID', () => {
        // base-agent.ts:13689 — recordCompactionRunStep creates stepType 'Compaction' with
        // targetLogId: outcome.PromptRunId. base-agent's own rollup (:13255) treats Compaction as
        // prompt-run-bearing alongside Prompt. Missing it here means teardown deletes the step and
        // orphans the prompt run permanently.
        expect(promptRunIdsFromSteps([{ StepType: 'Compaction', TargetLogID: 'pr-compaction' }])).toEqual(['pr-compaction']);
    });

    it('includes a Tool step — a conversation tool call stores its AIPromptRun there with NO Prompt step', () => {
        // base-agent.ts:5965 — `toolStep.TargetLogID = executed.promptRunId`, described there as
        // "one step + one prompt run: full lineage without a duplicate Prompt step for the same
        // call". Because no Prompt step is created, a Prompt-only rule cannot reach it at all.
        expect(promptRunIdsFromSteps([{ StepType: 'Tool', TargetLogID: 'pr-tool' }])).toEqual(['pr-tool']);
    });

    it('scoped to the rollup step types, excludes Tool but keeps Prompt and Compaction', () => {
        // base-agent.ts:13255 sums TokensUsedRollup for Prompt and Compaction steps ONLY. A check
        // reconciling Σ(prompt run tokens) against AIAgentRun.TotalTokensUsed must therefore use the
        // narrower set — counting a Tool step's prompt run would add tokens the rollup never did,
        // turning a correct rollup into a failed assertion.
        const steps = [
            { StepType: 'Prompt', TargetLogID: 'pr-1' },
            { StepType: 'Compaction', TargetLogID: 'pr-compaction' },
            { StepType: 'Tool', TargetLogID: 'pr-tool' },
        ];
        expect(promptRunIdsFromSteps(steps, ROLLUP_BEARING_STEP_TYPES)).toEqual(['pr-1', 'pr-compaction']);
        // The full set still reaches all three, so deletion cannot orphan the Tool one.
        expect(promptRunIdsFromSteps(steps, PROMPT_RUN_BEARING_STEP_TYPES)).toEqual(['pr-1', 'pr-compaction', 'pr-tool']);
    });
});

/**
 * Source-level drift guard. The unit tests above pin the linkage RULE and the loud-failure
 * property, but neither can catch the original mistake — re-adding an `AgentRunID` filter against
 * `MJ: AI Prompt Runs`. Only a real database rejects that, and the live tier is triage-only, so the
 * regression would ship. This scans the check sources instead, the same filesystem-drift technique
 * sibling-parity.test.ts uses for bundle↔metadata parity.
 */
describe('no check filters MJ: AI Prompt Runs on AgentRunID', () => {
    const CHECKS_DIR = path.join(__dirname, '..', 'checks');
    const PROMPT_RUNS_ENTITY = "'MJ: AI Prompt Runs'";
    /** Chars after the entity name to inspect — its ExtraFilter/Fields always follow it. */
    const WINDOW = 300;

    /** Strip comments so prose ABOUT the defect (including this fix's own docs) can't trip the scan. */
    function stripComments(source: string): string {
        return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    }

    it('scans a non-empty set of check modules', () => {
        // Guards the guard: a moved/renamed directory must fail, not silently scan nothing.
        expect(fs.readdirSync(CHECKS_DIR).filter(f => f.endsWith('.ts')).length).toBeGreaterThan(0);
    });

    it('never names AgentRunID in a prompt-run query', () => {
        const offenders: string[] = [];
        for (const file of fs.readdirSync(CHECKS_DIR).filter(f => f.endsWith('.ts'))) {
            const source = stripComments(fs.readFileSync(path.join(CHECKS_DIR, file), 'utf-8'));
            let at = source.indexOf(PROMPT_RUNS_ENTITY);
            while (at !== -1) {
                // Forward-only: a steps query legitimately using AgentRunID often sits just ABOVE a
                // prompt-run query, and the entity name always precedes its own filter arguments.
                if (source.slice(at, at + WINDOW).includes('AgentRunID')) {
                    offenders.push(`${file} (at index ${at})`);
                }
                at = source.indexOf(PROMPT_RUNS_ENTITY, at + 1);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('requireRows', () => {
    it('returns the rows on success', () => {
        expect(requireRows(runViewResult({ Success: true, Results: [{ ID: 'a' }] }), 'probe')).toEqual([{ ID: 'a' }]);
    });

    it('throws with the provider error text when the query failed', () => {
        // The exact shape of the original defect: filtering on a column that does not exist must
        // fail the check LOUDLY and name the query, never read as an empty result set.
        const failed = runViewResult({
            Success: false,
            Results: [],
            ErrorMessage: "Invalid column name 'AgentRunID'.",
        });
        expect(() => requireRows(failed, 'prompt-run read for run r-1')).toThrowError(
            /prompt-run read for run r-1 failed: Invalid column name 'AgentRunID'\./,
        );
    });

    it('still throws when the provider gives no error text', () => {
        expect(() => requireRows(runViewResult({ Success: false, ErrorMessage: '' }), 'probe')).toThrowError(
            /probe failed: no error message returned/,
        );
    });

    it('normalizes a successful-but-undefined Results to an empty array', () => {
        const noRows = runViewResult<{ ID: string }>({ Success: true });
        noRows.Results = undefined as unknown as { ID: string }[];
        expect(requireRows(noRows, 'probe')).toEqual([]);
    });
});
