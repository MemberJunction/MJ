/**
 * @fileoverview The Agent Pipeline executor — runs a server-side dataflow over {@link PipeValue}s.
 *
 * Stage kinds:
 *  - operator (`where`/`select`/…) — pure, applied directly.
 *  - `tool` — an Action/artifact tool; params get `{{template}}` resolution + optional `pipeInto`
 *    (the whole upstream value injected into a named param).
 *  - `map` — run a sub-pipeline per element of an array (bounded concurrency, caps, fail-policy).
 *  - `let` — run a sub-pipeline, bind its result to a name for later `{{name}}` use; stream unchanged.
 *
 * Only top-level stages produce log records; `map`/`let` summarize. Fails fast with an agent-facing
 * message (never echoes a piped value; field-errors list available fields).
 *
 * @module @memberjunction/ai-agents
 */
import {
    PipeValue,
    PipelineStage,
    PipelineStepRecord,
    PipelineExecutionResult,
    PipelineProviderKind,
} from './pipeline.types';
import { PipelineToolRegistry } from './pipeline-registry';
import { GetOperator, CONTROL_VERBS } from './operators';
import { resolveParams, TemplateScope } from './template';
import { sizeOf, previewOf, describeEmptyMatch } from './coerce';

export const MAX_PIPELINE_STAGES = 20;
export const MAX_MAP_ELEMENTS = 1000;
export const MAP_CONCURRENCY = 8;

/** Internal outcome of running a single stage (never throws). */
interface StageOutcome {
    output: PipeValue;
    success: boolean;
    error?: string;
    providerKind: PipelineProviderKind;
    toolName: string;
    actionExecutionLogId?: string;
    preview?: string;
}

export class PipelineExecutor {
    /** Total bytes produced by every stage anywhere in the tree (incl. map/let sub-pipelines). */
    private producedBytes = 0;

    constructor(
        private readonly registry: PipelineToolRegistry,
        private readonly maxStages: number = MAX_PIPELINE_STAGES,
    ) {}

    /** Validate + run a pipeline. Returns a structured result; never throws on stage failure. */
    public async Execute(stages: PipelineStage[]): Promise<PipelineExecutionResult> {
        const shapeError = this.validateShape(stages);
        if (shapeError) {
            return { success: false, finalOutput: null, steps: [], error: shapeError, contextBytesSaved: 0 };
        }

        const records: PipelineStepRecord[] = [];
        const scope: TemplateScope = {};
        let current: PipeValue = null;
        this.producedBytes = 0;
        let firstDiagnostic: string | undefined;

        for (let i = 0; i < stages.length; i++) {
            const inputValue = current;
            const inputSize = sizeOf(current);
            const startedAt = Date.now();
            const outcome = await this.runStage(stages[i], current, scope);
            const durationMs = Date.now() - startedAt;
            // A stage that turns a non-empty array into nothing useful — empty, or all-null
            // elements (the classic `map` clobber: `map` REPLACES the stream with each iteration's
            // final value, so a throwaway last sub-stage nulls every row) — is almost always a logic
            // error. Capture a self-correction hint so the agent fixes it next turn instead of
            // blindly retrying. Purely informational: it NEVER fails or alters the pipeline.
            const diagnostic = outcome.success
                ? stageDegenerationHint(stages[i], inputValue, outcome.output, outcome.toolName, i + 1)
                : undefined;
            if (diagnostic && !firstDiagnostic) {
                firstDiagnostic = diagnostic;
            }
            records.push({
                index: i,
                toolName: outcome.toolName,
                providerKind: outcome.providerKind,
                inputSize,
                outputSize: sizeOf(outcome.output),
                durationMs,
                success: outcome.success,
                error: outcome.error,
                diagnostic,
                logRef: {
                    providerKind: outcome.providerKind,
                    actionExecutionLogId: outcome.actionExecutionLogId,
                    preview: outcome.preview ?? previewOf(outcome.output),
                },
            });
            this.producedBytes += records[records.length - 1].outputSize;
            if (!outcome.success) {
                return this.failure(records, i, outcome.toolName, inputSize, outcome.error);
            }
            current = outcome.output;
            scope['$'] = current;
        }

        return {
            success: true,
            finalOutput: current,
            steps: records,
            contextBytesSaved: this.computeSaved(current),
            // Surface the hint only when the FINAL result is itself degenerate (empty, or all-null
            // elements); a deliberate empty result mid-pipeline that's later repopulated shouldn't nag.
            diagnostic: looksDegenerate(current) ? firstDiagnostic : undefined,
        };
    }

    private validateShape(stages: PipelineStage[]): string | null {
        if (!Array.isArray(stages) || stages.length < 1) {
            return 'A pipeline needs at least 1 stage.';
        }
        if (stages.length > this.maxStages) {
            return `A pipeline may have at most ${this.maxStages} stages (got ${stages.length}).`;
        }
        return null;
    }

    /** Dispatch one stage. Never throws — converts errors into a failed outcome. */
    private async runStage(stage: PipelineStage, current: PipeValue, scope: TemplateScope): Promise<StageOutcome> {
        try {
            if ('tool' in stage) {
                return await this.runToolStage(stage, current, scope);
            }
            if ('map' in stage) {
                return await this.runMapStage(stage, current, scope);
            }
            if ('let' in stage) {
                return await this.runLetStage(stage, current, scope);
            }
            return this.runOperatorStage(stage, current);
        } catch (e) {
            return { output: null, success: false, error: (e as Error).message, providerKind: 'Transform', toolName: stageVerb(stage) };
        }
    }

    private runOperatorStage(stage: PipelineStage, current: PipeValue): StageOutcome {
        const verbs = Object.keys(stage).filter((k) => GetOperator(k));
        if (verbs.length === 0) {
            throw new Error(`Stage has no known verb. Keys: ${Object.keys(stage).join(', ')}.`);
        }
        if (verbs.length > 1) {
            throw new Error(`A stage must have exactly one verb, but found: ${verbs.join(', ')}.`);
        }
        const op = GetOperator(verbs[0])!;
        const output = op.apply(current, stage[verbs[0]]);
        return { output, success: true, providerKind: 'Transform', toolName: op.name };
    }

    private async runToolStage(stage: PipelineStage, current: PipeValue, scope: TemplateScope): Promise<StageOutcome> {
        const toolName = String(stage.tool);
        const invocable = this.registry.Resolve(toolName);
        if (!invocable) {
            throw new Error(`Unknown pipeline tool "${toolName}". Available tools: ${this.registry.ToolNames().join(', ')}.`);
        }
        const params = resolveParams((stage.with as Record<string, unknown>) ?? {}, { ...scope, $: current });
        if (typeof stage.pipeInto === 'string') {
            params[stage.pipeInto] = current;
        }
        const result = await invocable.invoke(current, params);
        return {
            output: result.output,
            success: result.success,
            error: result.error,
            providerKind: invocable.providerKind,
            toolName,
            actionExecutionLogId: result.logRef.actionExecutionLogId,
            preview: result.logRef.preview,
        };
    }

    private async runMapStage(stage: PipelineStage, current: PipeValue, scope: TemplateScope): Promise<StageOutcome> {
        const cfg = (stage.map ?? {}) as { as?: string; do?: PipelineStage[]; continueOnError?: boolean };
        const asName = cfg.as ?? 'item';
        const subStages = cfg.do ?? [];
        if (!Array.isArray(subStages) || subStages.length === 0) {
            throw new Error('"map" requires a non-empty "do" sub-pipeline.');
        }
        if (!Array.isArray(current)) {
            throw new Error(`"map" expects an array to iterate, but the upstream value is ${Array.isArray(current) ? 'an array' : typeof current}.`);
        }
        if (current.length > MAX_MAP_ELEMENTS) {
            throw new Error(`"map" capped at ${MAX_MAP_ELEMENTS} elements (got ${current.length}). Narrow upstream with where/first.`);
        }

        const failFast = cfg.continueOnError === false;
        const results: PipeValue[] = new Array(current.length).fill(null);
        let failures = 0;
        let firstError: string | undefined;

        for (let start = 0; start < current.length; start += MAP_CONCURRENCY) {
            const batch = current.slice(start, start + MAP_CONCURRENCY);
            await Promise.all(
                batch.map(async (element, j) => {
                    const idx = start + j;
                    const childScope: TemplateScope = { ...scope, [asName]: element };
                    const sub = await this.runStages(subStages, element, childScope);
                    if (sub.success) {
                        results[idx] = sub.value;
                    } else {
                        failures++;
                        firstError = firstError ?? sub.error;
                        results[idx] = null;
                    }
                }),
            );
            if (failFast && failures > 0) {
                throw new Error(`"map" failed on an element: ${firstError}`);
            }
        }

        const summary = failures > 0 ? `${failures} of ${current.length} elements failed (first: ${firstError})` : undefined;
        return {
            output: results,
            success: true,
            error: summary,
            providerKind: 'Transform',
            toolName: `map(${current.length})`,
            preview: previewOf(results),
        };
    }

    private async runLetStage(stage: PipelineStage, current: PipeValue, scope: TemplateScope): Promise<StageOutcome> {
        const cfg = (stage.let ?? {}) as { name?: string; value?: PipelineStage[] };
        if (!cfg.name || !Array.isArray(cfg.value) || cfg.value.length === 0) {
            throw new Error('"let" requires { "name": string, "value": [ sub-stages ] }.');
        }
        const sub = await this.runStages(cfg.value, current, { ...scope });
        if (!sub.success) {
            throw new Error(`"let ${cfg.name}" failed: ${sub.error}`);
        }
        scope[cfg.name] = sub.value; // bind for downstream {{name}}; stream passes through unchanged
        return { output: current, success: true, providerKind: 'Transform', toolName: `let ${cfg.name}` };
    }

    /** Run a sub-pipeline (map/let) with no top-level record-keeping; fails fast internally. */
    private async runStages(
        stages: PipelineStage[],
        initialValue: PipeValue,
        scope: TemplateScope,
    ): Promise<{ value: PipeValue; success: boolean; error?: string }> {
        let current = initialValue;
        scope['$'] = current;
        for (const stage of stages) {
            const outcome = await this.runStage(stage, current, scope);
            // Every sub-pipeline stage output is processed server-side and never surfaces to the
            // LLM directly (only the top-level final value does) — count it toward bytes saved.
            this.producedBytes += sizeOf(outcome.output);
            if (!outcome.success) {
                return { value: null, success: false, error: outcome.error };
            }
            current = outcome.output;
            scope['$'] = current;
        }
        return { value: current, success: true };
    }

    private failure(
        records: PipelineStepRecord[],
        zeroBasedIndex: number,
        toolName: string,
        inputSize: number,
        error: string | undefined,
    ): PipelineExecutionResult {
        const message =
            `Pipeline failed at stage ${zeroBasedIndex + 1} (${toolName}).\n` +
            `Upstream value size: ${inputSize} bytes\n` +
            `Error: ${error ?? 'unknown error'}`;
        return {
            success: false,
            finalOutput: null,
            steps: records,
            error: message,
            failedStepIndex: zeroBasedIndex + 1,
            contextBytesSaved: this.computeSaved(null),
        };
    }

    /**
     * Bytes the LLM never saw: everything produced anywhere in the tree (top-level + every map/let
     * sub-pipeline stage) minus the single final value that is returned. Map/let internal fetches
     * (e.g. full pages fetched per element) are counted here, not just top-level stages.
     */
    private computeSaved(finalOutput: PipeValue): number {
        return Math.max(0, this.producedBytes - sizeOf(finalOutput));
    }
}

/** Whether a value is "no result" — empty array, empty string, or null. */
function isEmpty(v: PipeValue): boolean {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') return v.length === 0;
    return false;
}

/** An object with keys whose values are ALL null — a hollow row (e.g. `select`-ing absent fields). */
function isAllNullObject(v: PipeValue): boolean {
    return (
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v).length > 0 &&
        Object.values(v).every((x) => x == null)
    );
}

/** Degenerate = empty, OR a non-empty array whose every element is null / a hollow all-null object. */
function looksDegenerate(v: PipeValue): boolean {
    if (isEmpty(v)) return true;
    if (Array.isArray(v) && v.length > 0) {
        return v.every((el) => el == null || isAllNullObject(el));
    }
    return false;
}

/**
 * Self-correction hint for a stage that took a non-empty array and produced nothing useful — purely
 * informational, never alters execution. Two cases: (1) filtered down to empty (likely a wrong field
 * name / value casing → list the values present); (2) turned every element into null, the classic
 * `map` misuse (map REPLACES the stream with each iteration's final value — it does not add a field).
 */
function stageDegenerationHint(
    stage: PipelineStage,
    inputValue: PipeValue,
    output: PipeValue,
    toolName: string,
    oneBasedIndex: number,
): string | undefined {
    if (!Array.isArray(inputValue) || inputValue.length === 0) {
        return undefined;
    }
    if (isEmpty(output)) {
        return `Stage ${oneBasedIndex} ("${toolName}") ${describeEmptyMatch(inputValue)}`;
    }
    if (Array.isArray(output) && output.length > 0 && output.every((el) => el == null || isAllNullObject(el))) {
        const why =
            'map' in stage
                ? ' "map" REPLACES the array with each iteration\'s FINAL sub-stage value — it does NOT add a field to existing rows. Its last sub-stage returned null for every element. To add/keep fields, use select/groupBy directly; use map only for per-element actions.'
                : ' Check the field name/path — it resolved to null for every element (case-sensitive).';
        return `Stage ${oneBasedIndex} ("${toolName}") turned ${inputValue.length} item(s) into all-null.${why}`;
    }
    return undefined;
}

/** Best-effort verb label for a stage (for error messages). */
function stageVerb(stage: PipelineStage): string {
    if ('tool' in stage) return String(stage.tool);
    if ('map' in stage) return 'map';
    if ('let' in stage) return 'let';
    const verbs = Object.keys(stage).filter((k) => !CONTROL_VERBS.has(k));
    return verbs[0] ?? 'unknown';
}
