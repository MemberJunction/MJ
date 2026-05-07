/**
 * @fileoverview Action-related logic extracted from {@link BaseAgent}.
 *
 * `BaseAgent` is the orchestration layer for the MJ agent framework, but
 * over time it accumulated ~10k lines covering many concerns. This module
 * lifts the **action-handling** subset (format the action list section of
 * the system prompt, execute a single action, intercept large binary
 * params, search/filter actions, validate, etc.) into an abstract base
 * class that `BaseAgent` extends. No semantic change — the moved methods
 * are still resolved on `this` (TS sees them through inheritance) so call
 * sites in `BaseAgent` are unchanged. The orchestration method
 * `executeActionsStep` stays in `BaseAgent` because it's coupled to
 * agent-internal state (run records, payload manager, hierarchical step
 * builders, etc.) — see PR #2470 review thread on the split criterion.
 *
 * @module @memberjunction/ai-agents
 */

import { ExecuteAgentParams, AgentAction, MJAIAgentEntityExtended, MJAIAgentRunStepEntityExtended, FileOutputRef, ParseFileOutputRef, ActionChange, ActionChangeScope } from '@memberjunction/ai-core-plus';
import { MJAIAgentTypeEntity, MJActionParamEntity } from '@memberjunction/core-entities';
import { MJActionEntityExtended, ActionParam, ActionResult, AIDirective } from '@memberjunction/actions-base';
import { ChatMessage } from '@memberjunction/ai';
import { ActionEngineServer } from '@memberjunction/actions';
import { UUIDsEqual } from '@memberjunction/global';
import { UserInfo, LogError } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Wire-protocol identifier for the built-in action-search meta-tool. The LLM
 * is instructed to invoke `_searchactions` like any other action; the agent
 * runtime intercepts that name and routes to {@link AgentActionHandler.executeActionSearch}.
 *
 * NOT exposed as configurable: this is a wire-protocol identifier the LLM is
 * told about and that the runtime intercepts. Changing it per-deployment would
 * break cross-deployment consistency for the same agent definition.
 */
export const ACTION_SEARCH_TOOL_NAME = '_searchactions';

/**
 * Tunable knobs for the `_searchActions` meta-tool. Defaults match the values
 * shipped with PR #2470. Consumers (typically MJAPI startup) can override
 * any of these from `mj.config.cjs`:
 *
 * ```javascript
 * agentSettings: {
 *   actionSearch: {
 *     threshold: 25,        // dump-vs-summary cutoff (default: 25)
 *     defaultTopK: 10,      // fallback topK when LLM omits it (default: 10)
 *     maxTopK: 50,          // hard upper bound on topK (default: 50)
 *     minSimilarity: 0.3,   // cosine similarity floor for matches (default: 0.3)
 *   }
 * }
 * ```
 *
 * Per-agent overrides (via fields on the `MJAIAgent` entity) are intentionally
 * out of scope here — see the follow-on RFC for that.
 */
export class ActionSearchConfig {
    /**
     * Threshold above which the full action dump in the prompt is replaced
     * with a category summary + instructions to use the built-in
     * `_searchActions` meta-tool. Below this count the full dump is kept.
     * Default: 25.
     */
    public static Threshold: number = 25;

    /**
     * Default topK returned by the action-search meta-tool when the LLM
     * doesn't specify one. Default: 10.
     */
    public static DefaultTopK: number = 10;

    /**
     * Hard maximum topK after clamping. Bounds result-list size regardless
     * of what the LLM requests. Default: 50.
     */
    public static MaxTopK: number = 50;

    /**
     * Minimum cosine similarity for action-search hits. Kept relatively
     * loose so the agent gets some candidates to reason about even on
     * vague queries. Default: 0.3.
     */
    public static MinSimilarity: number = 0.3;
}

/**
 * Compact representation of a single action's execution result, used for
 * building the markdown summary that goes into conversation messages.
 */
export interface ActionResultSummary {
    actionName: string;
    success: boolean;
    params: ActionParam[];
    resultCode: string;
    message: string;
    aiDirectives?: AIDirective[];
}

/**
 * Abstract base for `BaseAgent` carrying the action-handling concerns.
 *
 * Subclasses must provide the cross-cutting helpers below — `BaseAgent`
 * already implements all of them, so for it the contract is a no-op
 * inheritance hop. Other future subclasses (if any) need to satisfy the
 * same shape.
 */
export abstract class AgentActionHandler {
    // ------------------------------------------------------------------
    // Required cross-cutting helpers (provided by `BaseAgent`)
    // ------------------------------------------------------------------

    /**
     * Verbose-aware logger. Mirrors the runner-side helper pattern:
     * `verboseOnly=true` only emits when local `params.verbose` is true OR
     * `IsVerboseLoggingEnabled()` is true globally.
     */
    protected abstract logStatus(
        message: string,
        verboseOnly?: boolean,
        params?: ExecuteAgentParams,
    ): void;

    /**
     * Enhanced error logger. Signature kept identical to `BaseAgent.logError`
     * (including the legacy `Record<string, any>` metadata shape) to avoid
     * touching existing call sites.
     */
    protected abstract logError(
        error: Error | string,
        options?: {
            category?: string;
            metadata?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
            agent?: MJAIAgentEntityExtended;
            agentType?: MJAIAgentTypeEntity;
            severity?: 'warning' | 'error' | 'critical';
        },
    ): void;

    /**
     * Storage-account ID resolved during agent run setup. `ExecuteSingleAction`
     * threads it into `actionContext` so individual actions can route file
     * artifact uploads to the right account.
     */
    protected abstract get ResolvedStorageAccountId(): string | null;

    /**
     * Creates an `MJAIAgentRunStepEntityExtended` row for observability.
     * Implemented by `BaseAgent` against the agent-run state it owns. The
     * action-search path needs this to record one step per `_searchActions`
     * invocation.
     */
    protected abstract createStepEntity(params: {
        stepType: MJAIAgentRunStepEntityExtended['StepType'];
        stepName: string;
        contextUser: UserInfo;
        targetId?: string;
        inputData?: unknown;
        targetLogId?: string;
        payloadAtStart?: unknown;
        payloadAtEnd?: unknown;
        parentId?: string;
    }): Promise<MJAIAgentRunStepEntityExtended>;

    /**
     * Finalizes a step entity — sets success/failure, error message, output
     * payload, and persists. Implemented by `BaseAgent` against the agent-run
     * state it owns.
     */
    protected abstract finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: unknown,
    ): Promise<void>;

    // ------------------------------------------------------------------
    // Action-list formatting for the system prompt
    // ------------------------------------------------------------------

    /**
     * Picks between the full action dump and the compact summary based on
     * the agent's action count. Threshold is `ActionSearchConfig.Threshold`.
     */
    protected formatActionDetails(actions: MJActionEntityExtended[]): string {
        if (actions.length > ActionSearchConfig.Threshold) {
            return this.formatActionSummary(actions);
        }
        return this.formatActionFullDump(actions);
    }

    /**
     * Renders the full per-action markdown block the LLM consumes when the
     * action count is small enough to fit in the prompt without pain.
     */
    protected formatActionFullDump(actions: MJActionEntityExtended[]): string {
        return actions.map(action => {
            const lines: string[] = [];
            lines.push(`### ${action.Name}`);
            lines.push(action.Description);

            const inputParams = action.Params
                .filter(p => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'input' || t === 'both';
                });
            const outputParams = action.Params
                .filter(p => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'output' || t === 'both';
                });

            if (inputParams.length > 0) {
                lines.push(`**Input:** ${inputParams.map(p => this.formatActionParameter(p)).join(', ')}`);
            }
            if (outputParams.length > 0) {
                lines.push(`**Output:** ${outputParams.map(p => this.formatActionParameter(p)).join(', ')}`);
            }

            if (action.ResultCodes.length > 0) {
                const rcParts = action.ResultCodes.map(rc => {
                    const marker = rc.IsSuccess ? '✓' : '✗';
                    const desc = rc.Description && rc.Description.toLowerCase() !== rc.ResultCode.toLowerCase()
                        ? ` ${rc.Description}`
                        : '';
                    return `${rc.ResultCode} ${marker}${desc}`;
                });
                lines.push(`**Results:** ${rcParts.join(' · ')}`);
            }

            return lines.join('\n');
        }).join('\n\n');
    }

    /**
     * Renders a compact category summary + usage instructions for the
     * `_searchActions` meta-tool, for agents with too many actions to dump
     * into the prompt directly.
     */
    protected formatActionSummary(actions: MJActionEntityExtended[]): string {
        const categories = this.summarizeActionsByCategory(actions);
        const catLines = categories.map(c => `- **${c.category}** — ${c.count}`).join('\n');

        return [
            `You have **${actions.length} actions** available — too many to list in full here.`,
            ``,
            `### Actions by category`,
            catLines,
            ``,
            `### How to find an action: \`${ACTION_SEARCH_TOOL_NAME}\``,
            `You have a built-in meta-tool for finding actions by semantic similarity. Call it like any other action:`,
            ``,
            `- \`query\` (string, required) — natural-language description of what you want to do`,
            `- \`topK\` (number, optional, default ${ActionSearchConfig.DefaultTopK}) — max results to return`,
            ``,
            `It returns a ranked list of matching actions with their name, description, category, and similarity score. After searching, invoke the chosen action by its exact name on your next turn. Searching costs a turn but keeps the prompt small — use it whenever you're not sure of the exact action name.`,
        ].join('\n');
    }

    /**
     * Groups actions by Category and returns descending-count buckets.
     * Actions with no category are bucketed as "Uncategorized".
     */
    protected summarizeActionsByCategory(actions: MJActionEntityExtended[]): Array<{ category: string; count: number }> {
        const counts = new Map<string, number>();
        for (const action of actions) {
            const engine = ActionEngineServer.Instance;
            const catEntity = action.CategoryID ? engine.ActionCategories.find(c => UUIDsEqual(c.ID, action.CategoryID!)) : null;
            const category = catEntity?.Name?.trim() || 'Uncategorized';
            counts.set(category, (counts.get(category) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    }

    /**
     * Renders one parameter's signature line for the system prompt.
     * Marks required params with `\*`, prepends `(array)` and value-type
     * tags, appends the description and any default value.
     */
    protected formatActionParameter(param: MJActionParamEntity): string {
        const requiredMarker = param.IsRequired ? '\\*' : '';
        const parts: string[] = [];

        if (param.IsArray) {
            parts.push('array');
        }

        const vt = param.ValueType?.trim();
        if (vt && vt !== 'Scalar' && vt !== 'Other') {
            parts.push(vt);
        }

        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';

        let defaultStr = '';
        if (param.DefaultValue != null && param.DefaultValue !== '') {
            defaultStr = ` (default: ${JSON.stringify(param.DefaultValue)})`;
        }

        const desc = param.Description ? ` — ${param.Description}` : '';
        return `\`${param.Name}\`${requiredMarker}${suffix}${desc}${defaultStr}`;
    }

    /**
     * Formats an array of action result summaries as compact markdown
     * (60-70% smaller than the old `JSON.stringify(..., null, 2)` form,
     * still equally parseable by LLMs).
     *
     * AI directives are intentionally omitted here — they're surfaced as a
     * separate high-priority message by the caller.
     */
    protected formatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string {
        return actionSummaries.map(a => {
            const marker = a.success ? '✓' : '✗';
            const lines: string[] = [];

            lines.push(`## ${a.actionName} ${marker}`);
            lines.push(`**Result:** ${a.resultCode} — ${a.message || '(no message)'}`);

            if (a.params && a.params.length > 0) {
                lines.push('**Output:**');
                for (const p of a.params) {
                    lines.push(`• \`${p.Name}\`: ${this.formatParamValueForResult(p.Value)}`);
                }
            }

            return lines.join('\n');
        }).join('\n\n');
    }

    /**
     * Formats one action-output param value for the result-summary markdown.
     * `null`/`undefined` → backticked `null`; primitives → backticked `String()`;
     * strings pass through; objects/arrays → compact JSON. `maxLength=0`
     * disables truncation.
     */
    protected formatParamValueForResult(value: unknown, maxLength: number = 0): string {
        if (value === null || value === undefined) {
            return '`null`';
        }

        if (typeof value === 'boolean' || typeof value === 'number') {
            return `\`${String(value)}\``;
        }

        let stringValue: string;
        if (typeof value === 'string') {
            stringValue = value;
        } else {
            stringValue = JSON.stringify(value);
        }

        if (maxLength > 0 && stringValue.length > maxLength) {
            return `${stringValue.substring(0, maxLength)}…`;
        }

        return stringValue;
    }

    /**
     * Looks up an action category name. Currently a placeholder returning
     * `'General'` — preserved verbatim from `BaseAgent` pending the real
     * lookup against `ActionCategory` storage.
     */
    protected getActionCategoryName(_categoryID: string): string {
        return 'General';
    }

    // ------------------------------------------------------------------
    // Action search (`_searchActions` meta-tool — PR #2470)
    // ------------------------------------------------------------------

    /**
     * Executes a call to the built-in `_searchActions` meta-tool. Resolves
     * via {@link AIEngine.FindSimilarActions} scoped to the agent's own
     * action list, creates a step entity for observability, and returns a
     * ready-to-merge {@link ActionResultSummary} so the search result
     * flows back to the LLM through the normal action-results message path.
     *
     * @param action - The `_searchActions` call produced by the LLM
     * @param effectiveActions - The agent's full effective action set (for scoping)
     * @param parentStepId - Parent step for hierarchy
     * @param payloadAtStart - Current payload snapshot
     * @param params - Overall agent execution params
     * @param stepNumber - Unique step number slot for this call
     */
    protected async executeActionSearch(
        action: AgentAction,
        effectiveActions: MJActionEntityExtended[],
        parentStepId: string,
        payloadAtStart: unknown,
        params: ExecuteAgentParams,
        stepNumber: number,
    ): Promise<ActionResultSummary> {
        const rawParams = action.params || {};
        const query = typeof rawParams.query === 'string' ? rawParams.query.trim() : '';
        const requestedTopK = Number(rawParams.topK);
        const topK = Number.isFinite(requestedTopK) && requestedTopK > 0
            ? Math.min(Math.trunc(requestedTopK), ActionSearchConfig.MaxTopK)
            : ActionSearchConfig.DefaultTopK;

        const stepEntity = await this.createStepEntity({
            stepType: 'Actions',
            stepName: `Execute Action: ${ACTION_SEARCH_TOOL_NAME}`,
            contextUser: params.contextUser,
            // No targetId — this isn't a real MJAction. createStepEntity tolerates null.
            inputData: { actionName: ACTION_SEARCH_TOOL_NAME, actionParams: { query, topK } },
            payloadAtStart,
            payloadAtEnd: payloadAtStart,
            parentId: parentStepId,
        });
        stepEntity.StepNumber = stepNumber;

        if (!query) {
            const errorMessage = `Missing required parameter 'query' (string) for ${ACTION_SEARCH_TOOL_NAME}.`;
            await this.finalizeStepEntity(stepEntity, false, errorMessage);
            return {
                actionName: ACTION_SEARCH_TOOL_NAME,
                success: false,
                params: [],
                resultCode: 'MISSING_PARAMETER',
                message: errorMessage,
            };
        }

        try {
            const rawMatches = await AIEngine.Instance.FindSimilarActions(query, topK, ActionSearchConfig.MinSimilarity);

            // Scope matches to the agent's effective actions — agents must not learn about
            // actions they can't invoke. Rebuild with full action entity info so the
            // response message can include parameter signatures.
            const effectiveById = new Map(effectiveActions.map(a => [a.ID, a]));
            const scopedMatches = rawMatches
                .map(m => ({ match: m, entity: effectiveById.get(m.actionId) }))
                .filter((x): x is { match: typeof rawMatches[number]; entity: MJActionEntityExtended } => !!x.entity);

            const message = this.formatActionSearchResults(query, scopedMatches);

            const outputParam: ActionParam = {
                Name: 'matches',
                Type: 'Output',
                Value: scopedMatches.map(({ match, entity }) => ({
                    name: entity.Name,
                    description: entity.Description,
                    similarityScore: Number(match.similarityScore.toFixed(4)),
                    category: match.categoryName ?? null,
                    inputs: entity.Params
                        .filter(p => p.Type.trim().toLowerCase() === 'input' || p.Type.trim().toLowerCase() === 'both')
                        .map(p => ({ name: p.Name, type: p.ValueType, required: p.IsRequired, description: p.Description })),
                    outputs: entity.Params
                        .filter(p => p.Type.trim().toLowerCase() === 'output' || p.Type.trim().toLowerCase() === 'both')
                        .map(p => ({ name: p.Name, type: p.ValueType, description: p.Description })),
                })),
            };

            await this.finalizeStepEntity(stepEntity, true, undefined, {
                actionResult: { success: true, resultCode: 'SUCCESS', matchCount: scopedMatches.length },
            });

            return {
                actionName: ACTION_SEARCH_TOOL_NAME,
                success: true,
                params: [outputParam],
                resultCode: 'SUCCESS',
                message,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogError(`_searchActions failed for agent '${params.agent.Name}': ${errorMessage}`);
            await this.finalizeStepEntity(stepEntity, false, errorMessage);
            return {
                actionName: ACTION_SEARCH_TOOL_NAME,
                success: false,
                params: [],
                resultCode: 'SEARCH_ERROR',
                message: `Action search failed: ${errorMessage}`,
            };
        }
    }

    // ------------------------------------------------------------------
    // Action execution
    // ------------------------------------------------------------------

    /**
     * Inspects a set of action output params for any value matching the
     * `FileOutputRef` shape (an object with `fileName`, `mimeType`, and
     * either `fileData` or `fileId`). Returns all matching `FileOutputRef`
     * values found across all output params.
     *
     * Detection is shape-based, not name-based — actions can name their
     * file output parameter anything and it will still be detected.
     *
     * @since 5.22.0
     */
    protected detectFileOutputs(outputParams: ActionParam[]): FileOutputRef[] {
        const results: FileOutputRef[] = [];
        for (const param of outputParams) {
            if (param.Value == null) continue;
            const ref = ParseFileOutputRef(param.Value);
            if (ref) results.push(ref);
        }
        return results;
    }

    /**
     * Executes one action via the MemberJunction Actions framework. The
     * full `ActionResult` is returned so callers can inspect result codes,
     * output parameters, and other execution details.
     *
     * @param params - Agent execution params (carries `context` we forward to the action)
     * @param action - Action invocation produced by the LLM (`name` + `params`)
     * @param actionEntity - The resolved action metadata entity
     * @param contextUser - Optional user context for permissions
     */
    public async ExecuteSingleAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo,
    ): Promise<ActionResult> {
        try {
            const actionEngine = ActionEngineServer.Instance;

            // Convert params object to ActionParam array
            const actionParams = Object.entries(action.params || {}).map(([key, value]) => ({
                Name: key,
                Value: value,
                Type: 'Input' as const,
            }));

            // Build action context: preserve the agent's context and inject the resolved storage account ID.
            const resolvedStorageAccountId = this.ResolvedStorageAccountId;
            const actionContext = resolvedStorageAccountId
                ? { ...(typeof params.context === 'object' && params.context ? params.context : {}), __resolvedStorageAccountId: resolvedStorageAccountId }
                : params.context;

            const result = await actionEngine.RunAction({
                Action: actionEntity,
                Params: actionParams,
                ContextUser: contextUser,
                Filters: [],
                SkipActionLog: false,
                Context: actionContext,
            });

            if (result.Success) {
                this.logStatus(`   ✅ Action '${action.name}' completed successfully`, true, params);
            } else {
                this.logStatus(`   ❌ Action '${action.name}' failed: ${result.Message || 'Unknown error'}`, false, params);
            }

            return result;
        } catch (error) {
            this.logError(error as Error | string, {
                category: 'ActionExecution',
                metadata: {
                    actionName: action.name,
                    actionParams: action.params,
                },
            });
            throw new Error(`Error executing actions: ${(error as Error).message}`);
        }
    }

    // ------------------------------------------------------------------
    // Action-change scope handling (runtime add/remove of actions)
    // ------------------------------------------------------------------

    /**
     * Decides whether a given `ActionChange.scope` applies to the current
     * agent context.
     *
     *  - `'global'`        → always
     *  - `'root'`          → only at the root agent
     *  - `'all-subagents'` → only at non-root agents
     *  - `'specific'`      → only when `agentId` is in `agentIds`
     *
     * @since 2.123.0
     */
    protected doesChangeScopeApply(
        scope: ActionChangeScope,
        agentId: string,
        isRoot: boolean,
        agentIds?: string[],
    ): boolean {
        switch (scope) {
            case 'global':
                return true;
            case 'root':
                return isRoot;
            case 'all-subagents':
                return !isRoot;
            case 'specific':
                return agentIds?.includes(agentId) ?? false;
            default:
                return false;
        }
    }

    /**
     * Applies the runtime `ActionChange[]` set to the agent's base action
     * list. Returns the modified action list plus any per-action dynamic
     * execution limits the changes carried.
     *
     * @since 2.123.0
     */
    protected applyActionChanges(
        baseActions: MJActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean,
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> } {
        let actions = [...baseActions];
        const dynamicLimits: Record<string, number> = {};

        for (const change of actionChanges) {
            if (!this.doesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
                continue;
            }

            if (change.mode === 'add') {
                for (const actionId of change.actionIds) {
                    if (!actions.some(a => UUIDsEqual(a.ID, actionId))) {
                        const actionToAdd = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, actionId));
                        if (actionToAdd) {
                            actions.push(actionToAdd);
                            if (change.actionLimits?.[actionId] != null) {
                                dynamicLimits[actionId] = change.actionLimits[actionId];
                            }
                        } else {
                            // Use bare LogStatus from @memberjunction/core: this is a one-off
                            // diagnostic without verbose-gating semantics.
                            // eslint-disable-next-line no-console
                            console.warn(`Action with ID '${actionId}' not found in ActionEngineServer - skipping add`);
                        }
                    }
                }
            } else if (change.mode === 'remove') {
                actions = actions.filter(a => !change.actionIds.some(id => UUIDsEqual(id, a.ID)));
            }
        }

        return { actions, dynamicLimits };
    }

    /**
     * Filters and transforms action changes for propagation to a sub-agent.
     *
     * Propagation rules:
     *  - `'global'`        → propagated as-is
     *  - `'root'`          → not propagated (root-only)
     *  - `'all-subagents'` → re-cast to `'global'` (sub-agent is now in scope)
     *  - `'specific'`      → propagated as-is (sub-agent checks if it's in `agentIds`)
     *
     * @since 2.123.0
     */
    protected filterActionChangesForSubAgent(
        actionChanges: ActionChange[] | undefined,
    ): ActionChange[] | undefined {
        if (!actionChanges?.length) {
            return undefined;
        }

        const filtered: ActionChange[] = [];

        for (const change of actionChanges) {
            switch (change.scope) {
                case 'root':
                    continue;
                case 'global':
                    filtered.push(change);
                    break;
                case 'all-subagents':
                    filtered.push({ ...change, scope: 'global' });
                    break;
                case 'specific':
                    filtered.push(change);
                    break;
            }
        }

        return filtered.length > 0 ? filtered : undefined;
    }

    /**
     * Builds the `ChatMessage` carrying the markdown summary of an action
     * batch's results. Used to feed action results back to the LLM via the
     * normal user-role message path.
     */
    protected createActionResultMessage(actions: AgentAction[], results: ActionResult[]): ChatMessage {
        const actionSummaries: ActionResultSummary[] = actions.map((action, index) => {
            const result = results[index];
            const outputParams = result.Params?.filter(p =>
                p.Type === 'Output' || p.Type === 'Both',
            ) || [];

            return {
                actionName: action.name,
                success: result.Success,
                params: outputParams,
                resultCode: result.Result?.ResultCode || 'N/A',
                message: result.Message || '(no message)',
                aiDirectives: result.AIDirectives,
            };
        });

        return {
            role: 'user',
            content: `Action results:\n${this.formatActionResultsAsMarkdown(actionSummaries)}`,
        };
    }

    /**
     * Renders `_searchActions` hits as compact markdown so the result message
     * gives the LLM everything it needs to pick an action on the next turn.
     */
    protected formatActionSearchResults(
        query: string,
        scopedMatches: Array<{ match: { similarityScore: number; categoryName?: string | null }; entity: MJActionEntityExtended }>,
    ): string {
        if (scopedMatches.length === 0) {
            return `No actions matched query "${query}". Try rephrasing, or use broader terms.`;
        }

        const lines: string[] = [];
        lines.push(`Found ${scopedMatches.length} action(s) for query "${query}":`);
        lines.push('');
        for (const { match, entity } of scopedMatches) {
            const category = match.categoryName ? ` _(${match.categoryName})_` : '';
            lines.push(`### ${entity.Name} — ${(match.similarityScore * 100).toFixed(1)}%${category}`);
            if (entity.Description) {
                lines.push(entity.Description);
            }
            const inputs = entity.Params.filter(p => {
                const t = p.Type.trim().toLowerCase();
                return t === 'input' || t === 'both';
            });
            const outputs = entity.Params.filter(p => {
                const t = p.Type.trim().toLowerCase();
                return t === 'output' || t === 'both';
            });
            if (inputs.length > 0) {
                lines.push(`**Input:** ${inputs.map(p => this.formatActionParameter(p)).join(', ')}`);
            }
            if (outputs.length > 0) {
                lines.push(`**Output:** ${outputs.map(p => this.formatActionParameter(p)).join(', ')}`);
            }
            lines.push('');
        }
        lines.push(`Invoke any of these by its exact name on your next turn.`);
        return lines.join('\n');
    }
}
