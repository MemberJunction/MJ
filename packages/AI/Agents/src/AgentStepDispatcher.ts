import { LogError, ToPlainJSON } from '@memberjunction/core';
import { ChatMessage } from '@memberjunction/ai';
import {
    AgentAction,
    AgentPayloadChangeRequest,
    ApplyOutputMapping,
    BaseAgentNextStep,
    BuildActionOutputObject,
    ExecuteAgentParams,
    ExecuteAgentResult,
    ForEachOperation,
    GetValueFromPath,
    SetMappedValue,
    WhileOperation,
} from '@memberjunction/ai-core-plus';
import { IsPlainObject } from '@memberjunction/global';
import { CrushJSON, DescribeCrush, type JsonValue } from '@memberjunction/context-crush';
import { CrushCode, type CodeLang } from '@memberjunction/context-crush/code';
import {
    ActionParam,
    AIDirective,
    type ActionErrorRecovery,
    type ActionOutputTrustLevel,
} from '@memberjunction/actions-base';
import { FormatResponseFormSummary } from './sub-agent-consult';
import { WrapUntrustedExternalData } from './client-tool-results';
import { ConversationMessageResolver } from './utils/ConversationMessageResolver';
import {
    ExtractWholeTemplateExpression,
    ReplaceEmbeddedTemplateExpressions,
} from './pipeline/template';
import type {
    ActionCircuitBreakerReason,
    ActionResultCrushConfig,
    ActionResultSummary,
} from './base-agent';

/** One failed loop iteration (ForEach or While), or a loop that failed before its first iteration. */
export interface LoopIterationError {
    /** Zero-based index of the iteration that failed. */
    index: number; // case-violation-ok-legacy-back-compat: existing BaseAgent loop error shape
    message: string; // case-violation-ok-legacy-back-compat: existing BaseAgent loop error shape
    /** The ForEach collection element or While attempt context. Arbitrary payload data, only ever serialized. */
    item?: unknown; // case-violation-ok-legacy-back-compat: existing BaseAgent loop error shape
}

/**
 * Collaborator extracted from `BaseAgent` (WS-4.5b) responsible for step and loop
 * dispatching utilities: action/sub-agent invocation & result markdown formatting,
 * structural JSON/code context-crush compression, sub-agent payload cloning and
 * input/output path mapping, ForEach/While batching & sequential result folding,
 * and loop template interpolation (`{{item.field}}`).
 */
export class AgentStepDispatcher {
    /**
     * Builds the `user`-role record of what the model asked to run on an Actions turn (`[You invoked ...]`).
     */
    public BuildActionInvocationMessage(
        actions: AgentAction[],
        resolveShownParams: (action: AgentAction) => Array<[string, unknown]>,
    ): string {
        if (actions.length === 1) {
            const aa = actions[0];
            const shownParams = resolveShownParams(aa);
            if (shownParams.length === 0) {
                return `[You invoked the **${aa.name}** action.]`;
            }
            const paramsList = shownParams
                .map(([key, value]) => `• **${key}**: ${this.FormatParamValueForMessage(value)}`)
                .join('\n');
            return `[You invoked the **${aa.name}** action with parameters:\n${paramsList}\n]`;
        }
        return (
            `[You invoked **${actions.length} actions** in parallel:\n\n` +
            actions
                .map((aa, index) => {
                    const actionText = `${index + 1}. **${aa.name}**`;
                    const shownParams = resolveShownParams(aa);
                    if (shownParams.length === 0) {
                        return actionText;
                    }
                    const paramsList = shownParams
                        .map(([key, value]) => `   • **${key}**: ${this.FormatParamValueForMessage(value)}`)
                        .join('\n');
                    return `${actionText}\n${paramsList}`;
                })
                .join('\n\n') +
            '\n]'
        );
    }

    /**
     * Builds the action-results message body: a header naming any failures, then each result in
     * compact markdown format.
     */
    public BuildActionResultsMessage(
        actionSummaries: ActionResultSummary[],
        crushConfig?: ActionResultCrushConfig,
    ): string {
        const failed = actionSummaries.filter((a) => !a.success).length;
        const header = failed > 0 ? `${failed} of ${actionSummaries.length} action(s) failed:` : 'Action results:';
        return `${header}\n${this.FormatActionResultsAsMarkdown(actionSummaries, crushConfig)}`;
    }

    /**
     * Formats an array of action result summaries as compact markdown.
     */
    public FormatActionResultsAsMarkdown(
        actionSummaries: ActionResultSummary[],
        crushConfig?: ActionResultCrushConfig,
    ): string {
        return actionSummaries
            .map((a) => {
                const marker = a.success ? '✓' : '✗';
                const lines: string[] = [];

                lines.push(`## ${a.actionName} ${marker}`);
                lines.push(`**Result:** ${a.resultCode} — ${a.message || '(no message)'}`);

                if (!a.success && a.errorRecovery) {
                    const er = a.errorRecovery;
                    if (er.Retryable !== undefined) {
                        lines.push(
                            `**Retryable:** ${er.Retryable ? 'Yes (adjust parameters before retrying)' : 'No (do not retry this action with the same goal)'}`,
                        );
                    }
                    if (er.RecoverySuggestion) {
                        lines.push(`**How to Recover:** ${er.RecoverySuggestion}`);
                    }
                    if (er.SuggestedValues && er.SuggestedValues.length > 0) {
                        lines.push(`**Did You Mean:** ${er.SuggestedValues.map((v) => `\`${v}\``).join(', ')}`);
                    }
                    if (er.InvalidParams && er.InvalidParams.length > 0) {
                        lines.push('**Invalid Parameters:**');
                        for (const ip of er.InvalidParams) {
                            lines.push(`• \`${ip.ParamName}\`: ${ip.Reason}`);
                        }
                    }
                    if (er.ValidParameterExample) {
                        lines.push(`**Valid Example:** \`${JSON.stringify(er.ValidParameterExample)}\``);
                    }
                    if (er.SuggestedNextActions && er.SuggestedNextActions.length > 0) {
                        lines.push(
                            `**Suggested Next Actions:** ${er.SuggestedNextActions.map((v) => `\`${v}\``).join(', ')}`,
                        );
                    }
                }

                if (a.params && a.params.length > 0) {
                    const crush = !crushConfig?.exemptActions?.has(a.actionName);
                    lines.push('**Output:**');
                    for (const p of a.params) {
                        lines.push(`• \`${p.Name}\`: ${this.FormatParamValueForResult(p.Value, 0, crush, crushConfig)}`);
                    }
                }

                const formatted = lines.join('\n');
                if (a.trustLevel === 'Untrusted' || a.trustLevel === 'SemiTrusted') {
                    return WrapUntrustedExternalData(formatted, `action:${a.actionName}`, a.trustLevel);
                }
                return formatted;
            })
            .join('\n\n');
    }

    /**
     * Formats an `ExecuteAgentResult` as compact markdown for inclusion in conversation messages.
     */
    public FormatSubAgentResultAsMarkdown(subAgentName: string, result: ExecuteAgentResult): string {
        const marker = result.success ? '✓' : '✗';
        const lines: string[] = [];

        lines.push(`## Sub-agent: ${subAgentName} ${marker}`);

        const status = result.agentRun?.Status || (result.success ? 'Completed' : 'Failed');
        lines.push(`**Status:** ${status}`);

        if (result.agentRun?.FinalStep) {
            lines.push(`**Final step:** ${result.agentRun.FinalStep}`);
        }

        if (result.agentRun?.Message) {
            lines.push(`**Message:** ${result.agentRun.Message}`);
        }

        const formSummary = FormatResponseFormSummary(result.responseForm);
        if (formSummary) {
            lines.push(`**Form:**\n${formSummary}`);
        }

        if (!result.success && result.agentRun?.ErrorMessage) {
            lines.push(`**Error:** ${result.agentRun.ErrorMessage}`);
        }

        if (result.agentRun?.Message?.trim()) {
            lines.push(`**Message:**\n${result.agentRun.Message.trim()}`);
        }

        if (result.payload != null) {
            const payloadStr =
                typeof result.payload === 'string' ? result.payload : JSON.stringify(result.payload);
            lines.push(`**Payload:**\n${payloadStr}`);
        }

        return lines.join('\n');
    }

    /**
     * Formats a single output parameter value for inclusion in action result markdown.
     */
    public FormatParamValueForResult(
        value: unknown,
        maxLength: number = 0,
        crush: boolean = true,
        crushConfig?: ActionResultCrushConfig,
    ): string {
        if (value === null || value === undefined) {
            return '`null`';
        }

        if (typeof value === 'boolean' || typeof value === 'number') {
            return `\`${String(value)}\``;
        }

        if (typeof value === 'string') {
            const crushedJson = crush ? this.CrushParamValue(value, crushConfig) : null;
            if (crushedJson !== null) {
                return crushedJson;
            }
            const crushedCode = crush ? this.CrushCodeValue(value, crushConfig) : null;
            if (crushedCode !== null) {
                return crushedCode;
            }
            return maxLength > 0 && value.length > maxLength ? `${value.substring(0, maxLength)}…` : value;
        }

        const stringValue = JSON.stringify(value);
        const crushed = crush ? this.CrushParamValue(stringValue, crushConfig) : null;
        if (crushed !== null) {
            return crushed;
        }

        if (maxLength > 0 && stringValue.length > maxLength) {
            return `${stringValue.substring(0, maxLength)}…`;
        }

        return stringValue;
    }

    /**
     * Resolves the per-run action-result compression config from the agent-type prompt params.
     */
    public ResolveActionResultCrush(
        params: ExecuteAgentParams,
        fallbackPromptParams: Record<string, unknown> | undefined,
        defaultThreshold: number,
    ): ActionResultCrushConfig | undefined {
        const agentTypePromptParams = (params.data?.__agentTypePromptParams ?? fallbackPromptParams) as
            | Record<string, unknown>
            | undefined;
        if (agentTypePromptParams?.crushActionResults === false) {
            return undefined;
        }
        const requestedLang = agentTypePromptParams?.crushCodeLang;
        const codeLang: CodeLang | undefined =
            requestedLang === 'sql' || requestedLang === 'typescript' ? requestedLang : undefined;
        const uncrushed = agentTypePromptParams?.uncrushedActions;
        const exemptActions = new Set(
            Array.isArray(uncrushed)
                ? uncrushed.filter((name): name is string => typeof name === 'string')
                : [],
        );
        return { threshold: defaultThreshold, maxChars: undefined, codeLang, exemptActions };
    }

    /**
     * AST-reduces a large code-string action-result value when opted into a code language.
     */
    public CrushCodeValue(stringValue: string, config?: ActionResultCrushConfig): string | null {
        if (!config || !config.codeLang || stringValue.length < config.threshold) {
            return null;
        }
        try {
            const result = CrushCode(stringValue, config.codeLang);
            if (result.CrushedChars >= result.OriginalChars) {
                return null;
            }
            const legend = DescribeCrush(result);
            return legend ? `${result.Text}\n  ↳ ${legend}` : result.Text;
        } catch {
            return null;
        }
    }

    /**
     * Structurally compresses a JSON action-result value when crushing is enabled and the value
     * clears the size threshold.
     */
    public CrushParamValue(stringValue: string, config?: ActionResultCrushConfig): string | null {
        if (!config || stringValue.length < config.threshold) {
            return null;
        }
        try {
            const json = JSON.parse(stringValue) as JsonValue;
            const result = CrushJSON(json, { MaxChars: config.maxChars });
            if (result.CrushedChars >= result.OriginalChars) {
                return null;
            }
            const legend = DescribeCrush(result);
            return legend ? `${result.Text}\n  ↳ ${legend}` : result.Text;
        } catch {
            return null;
        }
    }

    /**
     * Formats a parameter value for display in action execution messages.
     */
    public FormatParamValueForMessage(value: unknown, maxLength: number = 100): string {
        if (value === null || value === undefined) {
            return 'null';
        }

        let stringValue: string;

        if (typeof value === 'string') {
            stringValue = value;
        } else if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        if (stringValue.length > maxLength) {
            return `\`${stringValue.substring(0, maxLength)}...\``;
        }

        return `\`${stringValue}\``;
    }

    /**
     * Best-effort deep clone for sub-agent payloads using `structuredClone` with `ToPlainJSON` fallback.
     */
    public CloneSubAgentPayload<T>(payload: T): T {
        if (payload === null || payload === undefined) return payload;
        if (typeof payload !== 'object') return payload;
        if (typeof globalThis.structuredClone === 'function') {
            try {
                return globalThis.structuredClone(payload);
            } catch {
                // Fall through to ToPlainJSON when payload contains Proxies or non-cloneable properties.
            }
        }
        try {
            return ToPlainJSON(payload);
        } catch (error: unknown) {
            LogError(
                `BaseAgent.cloneSubAgentPayload: payload could not be cloned (${error instanceof Error ? error.message : String(error)}); sub-agent will share the caller's object`,
            );
            return payload;
        }
    }

    /**
     * Applies sub-agent output mapping to update the parent payload.
     */
    public ApplySubAgentOutputMapping<P>(
        subAgentResult: Record<string, unknown>,
        _parentPayload: Record<string, unknown>,
        mappingConfig: string,
        getPathFn?: (obj: unknown, path: string) => unknown,
    ): AgentPayloadChangeRequest<P> | null {
        const pathGetter = getPathFn ?? GetValueFromPath;
        try {
            const mapping = JSON.parse(mappingConfig) as Record<string, string>;
            const updateObj: Record<string, unknown> = {};

            for (const [subAgentPath, parentPath] of Object.entries(mapping)) {
                let value: unknown;

                if (subAgentPath === '*') {
                    value = subAgentResult;
                } else {
                    value = pathGetter(subAgentResult, subAgentPath);
                }

                if (value !== undefined) {
                    const pathParts = parentPath.split('.');
                    const hasBlockedSegment = pathParts.some((p) => {
                        const clean = p.endsWith('[]') ? p.slice(0, -2) : p;
                        return clean === '__proto__' || clean === 'constructor' || clean === 'prototype';
                    });
                    if (hasBlockedSegment) {
                        continue;
                    }
                    let current = updateObj;

                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        const cleanPart = part.endsWith('[]') ? part.slice(0, -2) : part;
                        if (!Object.prototype.hasOwnProperty.call(current, cleanPart)) {
                            current[cleanPart] = {};
                        }
                        current = current[cleanPart] as Record<string, unknown>;
                    }

                    const lastPart = pathParts[pathParts.length - 1];
                    SetMappedValue(current, lastPart, value);
                }
            }

            if (Object.keys(updateObj).length === 0) {
                return null;
            }

            return {
                updateElements: updateObj as Partial<P>,
            };
        } catch (error: unknown) {
            LogError(
                `Failed to parse SubAgentOutputMapping: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    /**
     * Applies sub-agent input mapping to prepare initial payload for a related sub-agent.
     */
    public ApplySubAgentInputMapping(
        parentPayload: Record<string, unknown>,
        mappingConfig: string,
        getPathFn?: (obj: unknown, path: string) => unknown,
    ): Record<string, unknown> | null {
        const pathGetter = getPathFn ?? GetValueFromPath;
        try {
            const mapping = JSON.parse(mappingConfig) as Record<string, string>;
            const subAgentPayload: Record<string, unknown> = {};

            for (const [parentPath, subAgentPath] of Object.entries(mapping)) {
                let value: unknown;

                if (parentPath === '*') {
                    value = parentPayload;
                } else {
                    value = pathGetter(parentPayload, parentPath);
                }

                if (value !== undefined) {
                    const pathParts = subAgentPath.split('.');
                    const hasBlockedSegment = pathParts.some((p) => {
                        const clean = p.endsWith('[]') ? p.slice(0, -2) : p;
                        return clean === '__proto__' || clean === 'constructor' || clean === 'prototype';
                    });
                    if (hasBlockedSegment) {
                        continue;
                    }
                    let current = subAgentPayload;

                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        if (!Object.prototype.hasOwnProperty.call(current, part)) {
                            current[part] = {};
                        }
                        current = current[part] as Record<string, unknown>;
                    }

                    const lastPart = pathParts[pathParts.length - 1];
                    current[lastPart] = value;
                }
            }

            if (Object.keys(subAgentPayload).length === 0) {
                return null;
            }

            return subAgentPayload;
        } catch (error: unknown) {
            LogError(
                `Failed to parse SubAgentInputMapping: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    /**
     * Prepares a context message containing parent payload data or conversation messages for a related sub-agent.
     */
    public PrepareRelatedSubAgentContextMessage(
        parentPayload: Record<string, unknown>,
        contextPaths: string[],
        params?: ExecuteAgentParams,
        getPathFn?: (obj: unknown, path: string) => unknown,
    ): ChatMessage | null {
        if (!contextPaths || contextPaths.length === 0) {
            return null;
        }

        if (contextPaths.includes('*')) {
            return {
                role: 'user',
                content: `Parent Agent Context:\n\n${JSON.stringify(parentPayload, null, 2)}`,
            };
        }

        const pathGetter = getPathFn ?? GetValueFromPath;
        const contextData: Record<string, unknown> = {};

        for (const path of contextPaths) {
            let value: unknown;

            if (ConversationMessageResolver.isConversationReference(path) && params?.conversationMessages) {
                value = ConversationMessageResolver.resolve(path, params.conversationMessages);
            } else {
                value = pathGetter(parentPayload, path);
            }

            if (value !== undefined) {
                contextData[path] = value;
            }
        }

        if (Object.keys(contextData).length === 0) {
            return null;
        }

        const contextLines = Object.entries(contextData).map(([key, value]) => {
            const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            return `${key}:\n${valueStr}`;
        });

        return {
            role: 'user',
            content: `Parent Agent Context:\n\n${contextLines.join('\n\n')}`,
        };
    }

    /**
     * Validates a `WhileOperation` header and delegates body validation.
     */
    public ValidateWhileOperation(
        whileOp: WhileOperation,
        validateLoopBody: (kind: 'ForEach' | 'While', op: ForEachOperation | WhileOperation) => string | null,
    ): string | null {
        if (!whileOp.condition || whileOp.condition.trim() === '') {
            return 'Condition is required';
        }
        if (!whileOp.itemVariable || whileOp.itemVariable.trim() === '') {
            return 'Item variable is required';
        }

        return validateLoopBody('While', whileOp);
    }

    /**
     * Validates a `ForEachOperation` header (`itemVariable` and `collectionPath`).
     */
    public ValidateForEachHeader(forEach: ForEachOperation): string | null {
        if (!forEach.itemVariable || forEach.itemVariable.trim() === '') {
            return 'Item variable is required';
        }
        if (!forEach.collectionPath || forEach.collectionPath.trim() === '') {
            return 'Collection path is required';
        }
        return null;
    }

    /**
     * Extracts an array collection from a payload path or a `static:[...]` literal.
     */
    public GetCollectionFromPayload(
        payload: unknown,
        path: string,
        getPathFn?: (obj: unknown, path: string) => unknown,
    ): unknown[] | null {
        const trimmed = path.trim();
        if (trimmed.toLowerCase().startsWith('static:')) {
            try {
                const parsed: unknown = JSON.parse(trimmed.substring(trimmed.indexOf(':') + 1).trim());
                return Array.isArray(parsed) ? parsed : null;
            } catch {
                return null;
            }
        }

        const pathGetter = getPathFn ?? GetValueFromPath;
        const cleanPath = path.toLowerCase().startsWith('payload.') ? path.substring(8) : path;
        const value = pathGetter(payload, cleanPath);
        return Array.isArray(value) ? value : null;
    }

    /**
     * Creates batches of items for parallel `ForEach` processing with their original indices.
     */
    public CreateBatches<T>(
        items: T[],
        maxConcurrency: number,
    ): Array<Array<{ item: T; index: number }>> {
        const batches: Array<Array<{ item: T; index: number }>> = [];

        for (let i = 0; i < items.length; i += maxConcurrency) {
            const batch = items.slice(i, i + maxConcurrency).map((item, batchOffset) => ({
                item,
                index: i + batchOffset,
            }));
            batches.push(batch);
        }

        return batches;
    }

    /**
     * Applies `ForEach` results sequentially to build the final payload in index order.
     */
    public ApplyForEachResultsSequentially(
        sortedResults: Array<{
            index: number;
            result?: BaseAgentNextStep;
            error?: LoopIterationError;
            payload?: unknown;
            appliedFolds?: Array<{ output: Record<string, unknown>; mapping: string }>;
        }>,
        initialPayload: unknown,
        continueOnError: boolean,
        clonePayloadFn?: <T>(payload: T) => T,
    ): { results: BaseAgentNextStep[]; errors: LoopIterationError[]; finalPayload: unknown } {
        let currentPayload = initialPayload;
        const results: BaseAgentNextStep[] = [];
        const errors: LoopIterationError[] = [];

        for (const { result, error, payload, appliedFolds } of sortedResults) {
            if (error) {
                errors.push(error);
                if (!continueOnError) {
                    break;
                }
            } else if (result) {
                results.push(result);
                if (appliedFolds && appliedFolds.length > 0) {
                    for (const fold of appliedFolds) {
                        currentPayload = this.ApplyLoopOutputFold(
                            currentPayload,
                            fold.output,
                            fold.mapping,
                            clonePayloadFn,
                        );
                    }
                } else {
                    currentPayload = payload || currentPayload;
                }
            }
        }

        return { results, errors, finalPayload: currentPayload };
    }

    /**
     * Extracts the output object from the first action result summary for loop output folding.
     */
    public ExtractActionOutputObject(summaries: readonly ActionResultSummary[]): Record<string, unknown> {
        return BuildActionOutputObject(summaries[0]?.params, summaries[0]?.message);
    }

    /**
     * Applies an action output mapping fold onto a cloned copy of `basePayload`.
     */
    public ApplyLoopOutputFold(
        basePayload: unknown,
        output: Record<string, unknown>,
        mapping: string,
        clonePayloadFn?: <T>(payload: T) => T,
    ): Record<string, unknown> {
        const clone = clonePayloadFn ?? (<T>(p: T): T => this.CloneSubAgentPayload(p));
        const target: Record<string, unknown> = IsPlainObject(basePayload)
            ? clone(basePayload as Record<string, unknown>)
            : {};
        const mapped = ApplyOutputMapping(output, mapping, target);
        return mapped.updates;
    }

    /**
     * Formats a single loop iteration error as a string.
     */
    public DescribeLoopError(err: LoopIterationError): string {
        return err.message ? err.message : JSON.stringify(err);
    }

    /**
     * Formats all loop errors as newline-separated text for a step's `ErrorMessage`.
     */
    public FormatLoopErrors(errors: LoopIterationError[]): string {
        return errors.map((err) => this.DescribeLoopError(err)).join('\n\n');
    }

    /**
     * Formats loop iteration results as compact markdown.
     */
    public FormatLoopResultsAsMarkdown(
        results: BaseAgentNextStep[],
        errors: LoopIterationError[],
        crushConfig?: ActionResultCrushConfig,
        formatActionResultsFn?: (summaries: ActionResultSummary[]) => string,
    ): string {
        const formatActions =
            formatActionResultsFn ??
            ((summaries: ActionResultSummary[]) =>
                this.FormatActionResultsAsMarkdown(summaries, crushConfig));
        const lines: string[] = [];

        for (let i = 0; i < results.length; i++) {
            const iterResult = results[i].priorStepResult;

            if (Array.isArray(iterResult)) {
                lines.push(`### Iteration ${i + 1}`);
                lines.push(formatActions(iterResult as ActionResultSummary[]));
            } else if (iterResult != null) {
                lines.push(`### Iteration ${i + 1}`);
                const text = typeof iterResult === 'string' ? iterResult : JSON.stringify(iterResult);
                lines.push(text);
            }
        }

        if (errors.length > 0) {
            lines.push('### Errors');
            for (const err of errors) {
                lines.push(`• ✗ ${this.DescribeLoopError(err)}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Creates a non-terminating `'Failed'` step preserving the previous decision's payload.
     */
    public CreateFailedStep(errorMessage: string, previousDecision: BaseAgentNextStep): BaseAgentNextStep {
        return {
            step: 'Failed',
            terminate: false,
            errorMessage,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
        };
    }

    /**
     * Resolves `{{variable}}` templates recursively across an object's string and array properties.
     */
    public ResolveTemplates(
        obj: Record<string, unknown>,
        context: Record<string, unknown>,
        itemVariable: string,
        resolveValue?: (val: string, ctx: Record<string, unknown>, itemVar: string) => unknown,
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const resolver =
            resolveValue ??
            ((val: string, ctx: Record<string, unknown>, itemVar: string) =>
                this.ResolveValueFromContext(val, ctx, itemVar));

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = resolver(value, context, itemVariable);
            } else if (Array.isArray(value)) {
                result[key] = value.map((v: unknown) =>
                    typeof v === 'string' ? resolver(v, context, itemVariable) : v,
                );
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.ResolveTemplates(
                    value as Record<string, unknown>,
                    context,
                    itemVariable,
                    resolver,
                );
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Resolves a single string value or `{{expression}}` reference from a loop iteration context.
     */
    public ResolveValueFromContext(
        value: string,
        context: Record<string, unknown>,
        itemVariable: string,
        options?: {
            resolveInline?: (template: string, ctx: Record<string, unknown>, itemVar: string) => string;
            getPath?: (obj: unknown, path: string) => unknown;
        },
    ): unknown {
        const trimmedValue = value.trim();
        const wholeExpr = ExtractWholeTemplateExpression(trimmedValue);
        if (wholeExpr !== null) {
            value = wholeExpr;
        } else if (trimmedValue.includes('{{')) {
            return options?.resolveInline
                ? options.resolveInline(trimmedValue, context, itemVariable)
                : this.ResolveInlineTemplateExpressions(trimmedValue, context, itemVariable);
        }

        const pathGetter = options?.getPath ?? GetValueFromPath;
        const ivToLower = itemVariable?.trim().toLowerCase();
        const valueLower = value?.toLowerCase();

        if (valueLower === ivToLower) {
            return context.item;
        }

        if (valueLower?.startsWith(`${ivToLower}.`)) {
            const path = value.substring(ivToLower.length + 1);
            return pathGetter(context.item, path);
        }

        for (const [varName, varValue] of Object.entries(context)) {
            if (value === varName) {
                return varValue;
            }

            if (value?.trim().toLowerCase().startsWith(`${varName.toLowerCase()}.`)) {
                const path = value.substring(varName.length + 1);
                return pathGetter(varValue, path);
            }
        }

        return value;
    }

    /**
     * Resolves multiple `{{expression}}` placeholders embedded within a literal string.
     */
    public ResolveInlineTemplateExpressions(
        template: string,
        context: Record<string, unknown>,
        itemVariable: string,
        resolveValue?: (val: string, ctx: Record<string, unknown>, itemVar: string) => unknown,
    ): string {
        const resolver =
            resolveValue ??
            ((val: string, ctx: Record<string, unknown>, itemVar: string) =>
                this.ResolveValueFromContext(val, ctx, itemVar));

        return ReplaceEmbeddedTemplateExpressions(template, (expr, rawMatch) => {
            const resolved = resolver(expr, context, itemVariable);
            if (resolved === expr) {
                return rawMatch;
            }
            return String(resolved ?? '');
        });
    }
}

