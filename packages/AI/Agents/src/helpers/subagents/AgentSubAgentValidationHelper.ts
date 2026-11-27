/**
 * @fileoverview Collaborator owned by {@link AgentSubAgentHelper} encapsulating sub-agent
 * request validation, task-graph & handoff validation, sanitized tool-name matching,
 * Flow step sub-agent resolution, and sub-agent consult mode resolution.
 *
 * @module @memberjunction/ai-agents
 */

import {
    ConfigOf,
    GetTaskGraphSubmitter,
    WithAgentRunDataTrustApplied,
    type AgentSubAgentRequest,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '@memberjunction/ai-core-plus';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { GroupByUUID, IndexByUUID, IsValidUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { HostAllowedAgentIDs, KeepHostAllowedAgents } from '../../decision-discovery';
import { ResolveHandoffTarget } from '../../handoff-target';
import { SanitizeToolName } from '../../native-tools/action-tool-builder';
import { SUB_AGENT_TOOL_PREFIX } from '../../native-tools/control-tools';
import type { AgentRunContext } from '../AgentRunContext';

/**
 * Collaborator handling sub-agent, task-graph, handoff validation and consult resolution.
 */
export class AgentSubAgentValidationHelper {
    public GetTotalSubAgentConsultRounds(ctx: AgentRunContext): number {
        let total = 0;
        for (const count of ctx.SubAgentConsultRounds.values()) {
            total += count;
        }
        return total;
    }

    public GetRequestedSubAgents<P, C>(
        nextStep: BaseAgentNextStep<P, C> | undefined | null
    ): AgentSubAgentRequest<C>[] {
        if (!nextStep) return [];
        if (nextStep.subAgents && nextStep.subAgents.length > 0) {
            return nextStep.subAgents;
        }
        return nextStep.subAgent ? [nextStep.subAgent] : [];
    }

    public async ValidateSubAgentNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const curAgentSubAgents = ctx.Hooks.GetEffectiveSubAgentsForValidation(params.agent.ID);
        const allowFoldedTaskGraphTarget = nextStep.taskGraph?.folded === true && !GetTaskGraphSubmitter();

        const requested = ctx.Hooks.GetRequestedSubAgents<P, unknown>(nextStep);

        if (requested.length === 0) {
            ctx.Hooks.LogError(`Sub-agent 'undefined' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'SubAgentExecution',
            });
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: `Sub-agent 'undefined' not found or not active`,
            };
        }

        const seenResumeRunIds = new Set<string>();
        const openConsultsBySubAgent = GroupByUUID(ctx.OpenSubAgentConsults.values(), (c) => c.subAgentId);
        for (const req of requested) {
            const name = req?.name;
            const normalizedName = name?.trim().toLowerCase();
            const directSubAgent =
                curAgentSubAgents.find((a) => a.Name.trim().toLowerCase() === normalizedName) ??
                (name ? ctx.Hooks.MatchNamedBySanitizedToolName(name, curAgentSubAgents, true).match : undefined);
            const activeCatalogAgents = allowFoldedTaskGraphTarget
                ? AIEngine.Instance.Agents.filter((a) => a.Status === 'Active')
                : [];
            const catalogSubAgent =
                !directSubAgent && allowFoldedTaskGraphTarget && name
                    ? activeCatalogAgents.find((a) => a.Name.trim().toLowerCase() === normalizedName) ??
                      ctx.Hooks.MatchNamedBySanitizedToolName(name, activeCatalogAgents, true).match
                    : undefined;
            const subAgent = directSubAgent ?? catalogSubAgent;
            const hasRunPermission =
                subAgent && catalogSubAgent && params.contextUser
                    ? await AIAgentPermissionHelper.HasPermission(subAgent.ID, params.contextUser, 'run')
                    : true;

            if (!name || !subAgent || !hasRunPermission) {
                const availableHint = allowFoldedTaskGraphTarget
                    ? ctx.Hooks.BuildAvailableRunnableAgentsHint(params.contextUser)
                    : '';
                ctx.Hooks.LogError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
                    agent: params.agent,
                    category: 'SubAgentExecution',
                });
                if (nextStep.step !== 'Retry') {
                    ctx.GeneralValidationRetryCount++;
                }
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: `Sub-agent '${name}' not found or not active${availableHint}`,
                };
            }

            if (subAgent.MaxExecutionsPerRun != null) {
                const executionCount = await ctx.Hooks.GetSubAgentExecutionCount(agentRun.ID, subAgent.ID);
                if (executionCount >= subAgent.MaxExecutionsPerRun) {
                    ctx.Hooks.LogError(
                        `Sub-agent '${name}' has reached its maximum execution limit of ${subAgent.MaxExecutionsPerRun}`,
                        {
                            agent: params.agent,
                            category: 'SubAgentExecution',
                            metadata: {
                                subAgentName: name,
                                executionCount,
                                maxExecutions: subAgent.MaxExecutionsPerRun,
                            },
                        }
                    );
                    if (nextStep.step !== 'Retry') {
                        ctx.GeneralValidationRetryCount++;
                    }
                    return {
                        step: 'Retry',
                        terminate: false,
                        errorMessage: `Sub-agent '${name}' has reached its maximum execution limit of ${subAgent.MaxExecutionsPerRun}`,
                    };
                }
            }

            if (req.resumeRunId != null && req.resumeRunId !== '') {
                const openForSubAgent = openConsultsBySubAgent.Get(subAgent.ID) ?? [];
                const matchingConsult = IsValidUUID(req.resumeRunId)
                    ? IndexByUUID(openForSubAgent, (c) => c.childRunId).Get(req.resumeRunId)
                    : undefined;
                if (!matchingConsult) {
                    const openIds =
                        openForSubAgent.length > 0 ? openForSubAgent.map((c) => c.childRunId).join(', ') : 'none';
                    const errorMessage = `Invalid resumeRunId '${req.resumeRunId}' for sub-agent '${subAgent.Name}'. Open consult run IDs for '${subAgent.Name}': ${openIds}`;
                    ctx.Hooks.LogError(errorMessage, {
                        agent: params.agent,
                        category: 'SubAgentExecution',
                        metadata: {
                            subAgentName: name,
                            resumeRunId: req.resumeRunId,
                            openConsultIds: openIds,
                        },
                    });
                    if (nextStep.step !== 'Retry') {
                        ctx.GeneralValidationRetryCount++;
                    }
                    return {
                        step: 'Retry',
                        terminate: false,
                        errorMessage,
                    };
                }

                const normalizedResumeId = matchingConsult.childRunId.trim().toLowerCase();
                if (seenResumeRunIds.has(normalizedResumeId)) {
                    const errorMessage = `resumeRunId '${req.resumeRunId}' is used more than once`;
                    ctx.Hooks.LogError(errorMessage, {
                        agent: params.agent,
                        category: 'SubAgentExecution',
                        metadata: {
                            subAgentName: name,
                            resumeRunId: req.resumeRunId,
                        },
                    });
                    if (nextStep.step !== 'Retry') {
                        ctx.GeneralValidationRetryCount++;
                    }
                    return {
                        step: 'Retry',
                        terminate: false,
                        errorMessage,
                    };
                }
                seenResumeRunIds.add(normalizedResumeId);
            }

            if (req.presetName != null && req.presetName.trim() !== '') {
                const matchedPreset = AIEngine.Instance.FindActiveAgentConfigurationPreset(subAgent.ID, req.presetName);
                if (!matchedPreset) {
                    const availablePresets = AIEngine.Instance.GetAgentConfigurationPresets(subAgent.ID, true).map(
                        (p) => p.Name
                    );
                    const availableList = availablePresets.length > 0 ? availablePresets.join(', ') : 'none';
                    const errorMessage = `Sub-agent '${subAgent.Name}' has no preset '${req.presetName}'. Available: ${availableList}.`;
                    ctx.Hooks.LogError(errorMessage, {
                        agent: params.agent,
                        category: 'SubAgentExecution',
                        metadata: {
                            subAgentName: name,
                            presetName: req.presetName,
                            availablePresets: availableList,
                        },
                    });
                    if (nextStep.step !== 'Retry') {
                        ctx.GeneralValidationRetryCount++;
                    }
                    return {
                        ...nextStep,
                        step: 'Retry',
                        terminate: false,
                        errorMessage,
                    };
                }
            }
        }

        return nextStep;
    }

    public StripSubAgentToolPrefix(rawName: string): string {
        const trimmed = rawName.trim();
        return trimmed.toLowerCase().startsWith(SUB_AGENT_TOOL_PREFIX)
            ? trimmed.slice(SUB_AGENT_TOOL_PREFIX.length)
            : trimmed;
    }

    public MatchNamedBySanitizedToolName<T extends { Name?: string | null }>(
        ctx: AgentRunContext,
        rawName: string,
        pool: readonly T[],
        stripSubAgentPrefix: boolean = false
    ): { match?: T; ambiguous?: T[] } {
        const candidate = stripSubAgentPrefix ? ctx.Hooks.StripSubAgentToolPrefix(rawName) : rawName.trim();
        const sanitized = SanitizeToolName(candidate);
        if (!sanitized) {
            return {};
        }
        const matches = pool.filter((item) => item.Name && SanitizeToolName(item.Name) === sanitized);
        if (matches.length === 1) {
            return { match: matches[0] };
        }
        if (matches.length > 1) {
            return { ambiguous: matches };
        }
        return {};
    }

    public BuildAvailableRunnableAgentsHint(contextUser?: UserInfo): string {
        const engine = AIEngine.Instance;
        if (typeof engine.GetUserRunnableAgentDirectory === 'function') {
            const runnable = engine.GetUserRunnableAgentDirectory(contextUser);
            if (runnable.length > 0) {
                const names = runnable.slice(0, 25).map((a) => a.Name).join(', ');
                return `. Available runnable agents: ${names}`;
            }
        }
        return '';
    }

    public async ValidateTasksNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const spec: TaskGraphSpec | undefined = nextStep.taskGraph?.spec;
        if (!spec || !Array.isArray(spec.tasks) || spec.tasks.length === 0) {
            return nextStep;
        }

        const extractNodeAgentNames = (node: TaskGraphSpecNode): string[] => {
            const loopOp = ConfigOf(node, 'ForEach') ?? ConfigOf(node, 'While');
            return [ConfigOf(node, 'Agent')?.agentName, loopOp?.subAgent?.name].filter(
                (n): n is string => typeof n === 'string' && n.trim().length > 0
            );
        };
        const extractNodeActionNames = (node: TaskGraphSpecNode): string[] => {
            const loopOp = ConfigOf(node, 'ForEach') ?? ConfigOf(node, 'While');
            return [
                ConfigOf(node, 'Action')?.actionName,
                loopOp?.action?.name,
                ...(loopOp?.steps?.map((s) => s.name) ?? []),
            ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
        };

        const referencedAgents = [...new Set(spec.tasks.flatMap(extractNodeAgentNames))];
        const referencedActions = [...new Set(spec.tasks.flatMap(extractNodeActionNames))];

        const hostAllowedIds = HostAllowedAgentIDs(params.data);
        const disallowedAgents: string[] = [];
        const invalidAgents: string[] = [];
        const activeAgents = (AIEngine.Instance?.Agents ?? []).filter((a) => a.Status === 'Active');
        if (referencedAgents.length > 0 && (activeAgents.length > 0 || hostAllowedIds !== undefined)) {
            for (const agentName of referencedAgents) {
                const normalized = agentName.trim().toLowerCase();
                const matched =
                    activeAgents.find((a) => a.Name?.trim().toLowerCase() === normalized) ??
                    ctx.Hooks.MatchNamedBySanitizedToolName(agentName, activeAgents, true).match;
                if (
                    hostAllowedIds !== undefined &&
                    (!matched || KeepHostAllowedAgents([matched], hostAllowedIds).length === 0)
                ) {
                    disallowedAgents.push(agentName);
                    continue;
                }
                const permitted = matched
                    ? params.contextUser
                        ? await AIAgentPermissionHelper.HasPermission(matched.ID, params.contextUser, 'run')
                        : true
                    : false;
                if (!matched || !permitted) {
                    invalidAgents.push(agentName);
                }
            }
        }

        if (disallowedAgents.length > 0) {
            const subject = disallowedAgents.join(', ');
            const refusalMessage =
                disallowedAgents.length === 1
                    ? `${subject} isn't available in this chat, so it didn't run.`
                    : `${subject} aren't available in this chat, so they didn't run.`;
            ctx.Hooks.LogError(refusalMessage, {
                agent: params.agent,
                category: 'NextStepValidation',
            });
            return {
                step: 'Failed',
                terminate: true,
                message: refusalMessage,
                errorMessage: refusalMessage,
                previousPayload: nextStep.previousPayload,
                newPayload: nextStep.newPayload || nextStep.previousPayload,
            };
        }

        const invalidActions: string[] = [];
        const activeActions = (ActionEngineServer.Instance?.Actions ?? []).filter((act) => act.Status === 'Active');
        if (referencedActions.length > 0 && activeActions.length > 0) {
            for (const actionName of referencedActions) {
                const normalized = actionName.trim().toLowerCase();
                const matched =
                    activeActions.find((act) => act.Name?.trim().toLowerCase() === normalized) ??
                    ctx.Hooks.MatchNamedBySanitizedToolName(actionName, activeActions).match;
                if (!matched) {
                    invalidActions.push(actionName);
                }
            }
        }

        if (invalidAgents.length === 0 && invalidActions.length === 0) {
            return nextStep;
        }

        const errorParts: string[] = [];
        if (invalidAgents.length > 0) {
            const availableHint = ctx.Hooks.BuildAvailableRunnableAgentsHint(params.contextUser);
            errorParts.push(
                `Task graph "${spec.workflowName}" references unknown or inaccessible agent(s): ${invalidAgents.join(', ')}. ` +
                    `Use only exact agent names from the Available Agents for Task Graph & Sub-Agent Delegation list ` +
                    `(or discovered via "Find Candidate Agents")${availableHint}.`
            );
        }
        if (invalidActions.length > 0) {
            errorParts.push(
                `Task graph "${spec.workflowName}" references unknown or inactive action(s): ${invalidActions.join(', ')}. ` +
                    `Use "Find Candidate Actions" first to discover exact action names.`
            );
        }

        const errorMessage = errorParts.join(' ');
        ctx.Hooks.LogError(errorMessage, {
            agent: params.agent,
            category: 'NextStepValidation',
        });
        if (nextStep.step !== 'Retry') {
            ctx.GeneralValidationRetryCount++;
        }
        return {
            step: 'Retry',
            terminate: false,
            errorMessage,
        };
    }

    public GetFlowStepSubAgents(agentId: string): MJAIAgentEntityExtended[] {
        if (!agentId) return [];
        const steps = AIEngine.Instance.GetAgentSteps?.(agentId, 'Active') ?? [];
        const ids = new UUIDSet(
            steps
                .filter(
                    (s) =>
                        s.StepType === 'Sub-Agent' ||
                        ((s.StepType === 'ForEach' || s.StepType === 'While') && s.LoopBodyType === 'Sub-Agent')
                )
                .map((s) => s.SubAgentID)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
        );
        if (ids.Size === 0) return [];
        return AIEngine.Instance.Agents.filter((a) => a.Status === 'Active' && ids.Has(a.ID));
    }

    public CanonicalizeTaskGraphSpec(ctx: AgentRunContext, spec: TaskGraphSpec): TaskGraphSpec {
        const cloned = ctx.Hooks.CloneSubAgentPayload(spec);
        const activeAgents = (AIEngine.Instance?.Agents ?? []).filter((a) => a.Status === 'Active');
        const activeActions = (ActionEngineServer.Instance?.Actions ?? []).filter((act) => act.Status === 'Active');

        const resolveAgent = (name: string | undefined): string | undefined => {
            if (!name) return name;
            const lower = name.trim().toLowerCase();
            const found =
                activeAgents.find((a) => a.Name?.trim().toLowerCase() === lower) ??
                ctx.Hooks.MatchNamedBySanitizedToolName(name, activeAgents, true).match;
            return found?.Name ?? name;
        };
        const resolveAction = (name: string | undefined): string | undefined => {
            if (!name) return name;
            const lower = name.trim().toLowerCase();
            const found =
                activeActions.find((act) => act.Name?.trim().toLowerCase() === lower) ??
                ctx.Hooks.MatchNamedBySanitizedToolName(name, activeActions).match;
            return found?.Name ?? name;
        };

        for (const node of cloned.tasks ?? []) {
            const agentCfg = ConfigOf(node, 'Agent');
            if (agentCfg?.agentName) {
                agentCfg.agentName = resolveAgent(agentCfg.agentName) ?? agentCfg.agentName;
            }
            const actionCfg = ConfigOf(node, 'Action');
            if (actionCfg?.actionName) {
                actionCfg.actionName = resolveAction(actionCfg.actionName) ?? actionCfg.actionName;
            }
            const loopOp = ConfigOf(node, 'ForEach') ?? ConfigOf(node, 'While');
            if (loopOp?.subAgent?.name) {
                loopOp.subAgent.name = resolveAgent(loopOp.subAgent.name) ?? loopOp.subAgent.name;
            }
            if (loopOp?.action?.name) {
                loopOp.action.name = resolveAction(loopOp.action.name) ?? loopOp.action.name;
            }
            if (Array.isArray(loopOp?.steps)) {
                for (const step of loopOp.steps) {
                    if (step.name) {
                        step.name = resolveAction(step.name) ?? step.name;
                    }
                }
            }
        }
        return cloned;
    }

    public GetEffectiveSubAgentsForValidation(ctx: AgentRunContext, agentId: string): MJAIAgentEntityExtended[] {
        if (ctx.EffectiveCatalogComputed || ctx.EffectiveSubAgents.length > 0) {
            return ctx.EffectiveSubAgents;
        }
        return AIEngine.Instance.GetSubAgents(agentId, 'Active');
    }

    public async ValidateHandoffNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        if (ctx.Hooks.RunWithholdsHandoff(params)) {
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                message:
                    'Handoff is not available here, so nextStep.type must never be "Handoff". ' +
                    'Answer directly, or use nextStep.type "Sub-Agent" or "Actions" instead.',
                errorMessage: 'Handoff is not available on this run',
            };
        }

        const requestedName = nextStep.handoff?.agentName ?? '';
        const brief = nextStep.handoff?.brief ?? '';
        const reason = nextStep.handoff?.reason ?? '';
        const data = WithAgentRunDataTrustApplied(params).Params.data;
        const resolution = await ResolveHandoffTarget({
            AgentName: requestedName,
            SourceAgentID: params.agent.ID,
            HandoffChain: params.handoffChain ?? [],
            HostAllowedIDs: HostAllowedAgentIDs(data),
            ContextUser: params.contextUser,
            Agents: AIEngine.Instance.Agents,
        });

        if (resolution.Refusal) {
            const refusal = resolution.Refusal;
            ctx.Hooks.LogError(
                `Handoff target agent '${requestedName}' refused (${refusal.Reason}) for agent '${params.agent.Name}': ${refusal.Message}`,
                {
                    agent: params.agent,
                    category: 'NextStepValidation',
                }
            );
            await ctx.Hooks.CreateStepEntity({
                stepType: 'Handoff',
                stepName: `Handoff: ${requestedName.trim() || '(unknown)'}`,
                contextUser: params.contextUser,
                inputData: {
                    agentName: requestedName,
                    brief,
                    reason,
                },
                completed: {
                    success: false,
                    errorMessage: refusal.Message,
                    outputData: {
                        RefusalReason: refusal.Reason,
                        AgentName: requestedName,
                        Brief: brief,
                        Reason: reason,
                    },
                },
            });
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                message: refusal.Message,
                errorMessage: refusal.Message,
            };
        }

        const target = resolution.Target;
        ctx.ResolvedHandoffTarget = { id: target.ID, name: target.Name };
        if (nextStep.handoff) {
            nextStep.handoff = { ...nextStep.handoff, agentName: target.Name };
        }
        return nextStep;
    }

    public ResolveSubAgentChatHandlingOption(
        parentAgent: MJAIAgentEntityExtended,
        relationship?: MJAIAgentRelationshipEntity
    ): MJAIAgentEntity['ChatHandlingOption'] {
        return relationship?.ChatHandlingOption ?? parentAgent.ChatHandlingOption ?? null;
    }

    public IsSubAgentConsultActive(
        ctx: AgentRunContext,
        resolvedOption: MJAIAgentEntity['ChatHandlingOption'],
        params?: ExecuteAgentParams
    ): boolean {
        if (resolvedOption !== 'Consult') {
            return false;
        }
        if (ctx.AgentTypeInstance?.InjectLoopResultsAsMessage === false) {
            if (!ctx.LoggedConsultUnsupportedAgentType) {
                ctx.LoggedConsultUnsupportedAgentType = true;
                ctx.Hooks.LogStatus(
                    "⚠️ ChatHandlingOption 'Consult' is not supported for agent types where InjectLoopResultsAsMessage is false; treating as null (propagate).",
                    false,
                    params
                );
            }
            return false;
        }
        return true;
    }

    public EffectiveSubAgentChatHandlingOption(
        ctx: AgentRunContext,
        parentAgent: MJAIAgentEntityExtended,
        relationship?: MJAIAgentRelationshipEntity,
        params?: ExecuteAgentParams
    ): MJAIAgentEntity['ChatHandlingOption'] {
        const resolved = ctx.Hooks.ResolveSubAgentChatHandlingOption(parentAgent, relationship);
        if (resolved === 'Consult' && !this.IsSubAgentConsultActive(ctx, resolved, params)) {
            return null;
        }
        return resolved;
    }

    public IsSubAgentConsultEnabledForSubAgent(
        ctx: AgentRunContext,
        parentAgent: MJAIAgentEntityExtended,
        subAgent: MJAIAgentEntityExtended
    ): boolean {
        if (ctx.AgentTypeInstance?.InjectLoopResultsAsMessage === false) {
            return false;
        }
        const isDirectChild = subAgent.ParentID != null && UUIDsEqual(subAgent.ParentID, parentAgent.ID);
        const relationship = isDirectChild
            ? undefined
            : (AIEngine.Instance.AgentRelationships ?? []).find(
                  (r) =>
                      UUIDsEqual(r.AgentID, parentAgent.ID) &&
                      UUIDsEqual(r.SubAgentID, subAgent.ID) &&
                      r.Status === 'Active'
              );
        return ctx.Hooks.ResolveSubAgentChatHandlingOption(parentAgent, relationship) === 'Consult';
    }

    public ValidateSubAgentInAgent(ctx: AgentRunContext, subAgentName: string, agentId?: string): string | null {
        const resolvedAgentId = agentId ?? ctx.AgentRun?.AgentID ?? '';
        const relatedAgents = AIEngine.Instance.AgentRelationships.filter((ar) => UUIDsEqual(ar.AgentID, resolvedAgentId));
        const childAgents = AIEngine.Instance.Agents.filter((a) => UUIDsEqual(a.ParentID, resolvedAgentId));
        const candidate = ctx.Hooks.StripSubAgentToolPrefix(subAgentName);
        const lower = candidate.toLowerCase();
        const sanitized = SanitizeToolName(candidate);

        let subAgent = relatedAgents.filter((ra) => ra.SubAgent?.trim().toLowerCase() === lower);
        if (subAgent.length === 0 && sanitized) {
            subAgent = relatedAgents.filter((ra) => Boolean(ra.SubAgent && SanitizeToolName(ra.SubAgent) === sanitized));
        }
        if (subAgent.length > 1) {
            return `Ambiguous sub-agent '${subAgentName}' specified`;
        }
        if (subAgent.length === 0) {
            subAgent = relatedAgents.filter((ra) => ra.SubAgent?.trim().toLowerCase().includes(lower || ''));
            if (subAgent.length > 1) {
                return `Ambiguous sub-agent '${subAgentName}' specified`;
            }
            if (subAgent.length === 0) {
                let childAgent = childAgents.filter((ca) => ca.Name?.trim().toLowerCase() === lower);
                if (childAgent.length === 0 && sanitized) {
                    childAgent = childAgents.filter((ca) => Boolean(ca.Name && SanitizeToolName(ca.Name) === sanitized));
                }
                if (childAgent.length > 1) {
                    return `Ambiguous child agent '${subAgentName}' specified`;
                }
                if (childAgent.length === 0) {
                    childAgent = childAgents.filter((ca) => ca.Name?.trim().toLowerCase().includes(lower || ''));
                    if (childAgent.length > 1) {
                        return `Ambiguous child agent '${subAgentName}' specified`;
                    } else if (childAgent.length === 0) {
                        return `No child agent '${subAgentName}' found`;
                    }
                }
            }
        }

        return null;
    }
}
