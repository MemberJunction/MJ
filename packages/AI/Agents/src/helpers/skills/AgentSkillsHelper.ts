/**
 * @fileoverview Default `@RegisterClass(BaseAgentSkillsHelper, 'Default')` implementation
 * owning skill step validation, activation, fail-closed application policy filtering,
 * conversation-scoped skill persistence, templated instruction rendering, capability
 * granting, and action/sub-agent skill attribution.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s6`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import {
    type AgentChatMessage,
    type AgentConfiguration,
    type AgentSkillActivationRequest,
    type AgentSkillInvocation,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type SkillAvailabilityPurpose,
    SystemPlaceholderManager,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { LogErrorEx, RunView, type UserInfo } from '@memberjunction/core';
import type { MJConversationSkillEntity, MJAISkillEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, RegisterClass, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';
import { BaseAgentType } from '../../agent-types/base-agent-type';
import { IsTemplatedSkillInstructions } from '../../skill-instructions-template';
import { DEFAULT_AGENT_HELPER_KEY, SafeResolveEffectiveAgentProperties } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import { BaseAgentSkillsHelper } from './BaseAgentSkillsHelper';

/**
 * Default pluggable implementation of {@link BaseAgentSkillsHelper}.
 */
@RegisterClass(BaseAgentSkillsHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentSkillsHelper extends BaseAgentSkillsHelper {
    public override ActiveSkillIDsForRun(ctx: AgentRunContext, params: ExecuteAgentParams): string[] {
        const merged: string[] = [...(params.parentActivatedSkillIDs ?? [])];
        const seen = new UUIDSet(merged);
        for (const id of ctx.ActivatedSkillIDs) {
            if (!seen.Has(id)) {
                seen.Add(id);
                merged.push(id);
            }
        }
        return merged;
    }

    public override async ValidateSkillNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const requested = nextStep.skillActivations ?? [];
        if (requested.length === 0) {
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: 'When activating a skill, 1 or more skills must be specified',
            };
        }

        if (ctx.PlanModeActive && ctx.PlanApproved) {
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage:
                    'Skill activations are not allowed after your plan has been approved — ' +
                    'the approved plan did not include these capabilities. Present an updated plan ' +
                    "(nextStep.type='Plan') that includes the skill(s) you need and why, so the user " +
                    'can review the expanded tool surface.',
            };
        }

        const availableSkills = await ctx.Hooks.AvailableSkills(
            AIEngine.Instance.GetAutoActivatableSkillsForAgent(params.agent, params.contextUser),
            'auto-activation',
            params.agent,
            params.contextUser
        );

        const missingSkills = requested.filter(req => {
            if (!req.name || typeof req.name !== 'string') {
                return true;
            }
            const requestedName = req.name.trim().toLowerCase();

            const exactMatch = availableSkills.find(s => s.Name.trim().toLowerCase() === requestedName);
            if (exactMatch) return false;

            const containsMatches = availableSkills.filter(s => s.Name.trim().toLowerCase().includes(requestedName));
            if (containsMatches.length === 1) {
                ctx.Hooks.LogStatus(`Skill name fuzzy matched: '${req.name}' → '${containsMatches[0].Name}'`, true, params);
                req.name = containsMatches[0].Name;
                return false;
            }

            return true;
        });

        if (missingSkills.length > 0) {
            const missingNames = missingSkills.map(s => s.name).join(', ');
            const availableNames = availableSkills.map(s => s.Name).join(', ') || '(none)';
            ctx.Hooks.LogError(
                `Skill(s) '${missingNames}' not found or not available for agent '${params.agent.Name}'. Available: ${availableNames}`,
                { agent: params.agent, category: 'SkillExecution' }
            );
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: `Skill(s) '${missingNames}' not found or not available. Available: ${availableNames}`,
            };
        }

        return nextStep;
    }

    public override async ExecuteSkillStep(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep> {
        const requested: AgentSkillActivationRequest[] = previousDecision.skillActivations ?? [];
        if (requested.length === 0) {
            return await ctx.Hooks.ExecutePromptStep(params, config, previousDecision, stepCount);
        }

        const resolvedSkills = await ctx.Hooks.AvailableSkills(
            ctx.Hooks.ResolveSkillActivations(requested, params.agent, params.contextUser),
            'auto-activation',
            params.agent,
            params.contextUser
        );
        const activatedSet = new UUIDSet(ctx.ActivatedSkillIDs);
        const newlyActivated = resolvedSkills.filter(skill => !activatedSet.Has(skill.ID));

        if (newlyActivated.length === 0) {
            return await ctx.Hooks.ExecutePromptStep(params, config, previousDecision, stepCount);
        }

        const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;

        for (const skill of newlyActivated) {
            const request = requested.find(r => r.name.trim().toLowerCase() === skill.Name.trim().toLowerCase());
            const invocation = ctx.Hooks.BuildSkillInvocation(skill, params.agent, 'auto', request?.reason);
            await ctx.Hooks.RecordSkillActivationStep(skill, currentPayload, params, invocation);
            ctx.Hooks.EnableSkillCapabilities(skill, params);
            ctx.ActivatedSkillIDs.push(skill.ID);
            ctx.SkillInvocations.push(invocation);
            await ctx.Hooks.PersistConversationSkillActivation(skill, params);
        }

        const instructions = await this.resolveSkillInstructionsFor(ctx, newlyActivated, params, currentPayload);
        const activationMessage = ctx.Hooks.BuildSkillActivationMessage(newlyActivated, instructions);
        params.conversationMessages.push({
            role: 'user',
            content: activationMessage,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: 'skill-activation',
            },
        } as AgentChatMessage);

        return await ctx.Hooks.ExecutePromptStep(params, config, previousDecision, stepCount);
    }

    public override async FilterAvailableSkills(
        _ctx: AgentRunContext,
        skills: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        void purpose;
        void agent;
        void contextUser;
        return skills;
    }

    public override async AvailableSkills(
        ctx: AgentRunContext,
        gated: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        try {
            return await ctx.Hooks.FilterAvailableSkills(gated, purpose, agent, contextUser);
        } catch (error) {
            ctx.Hooks.LogError(
                `filterAvailableSkills threw for '${purpose}' — treating every skill as unavailable: ${error instanceof Error ? error.message : String(error)}`,
                { agent, category: 'AgentSkills' }
            );
            return [];
        }
    }

    public override async PreActivateRequestedSkills(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        if (ctx.Depth !== 0) {
            return;
        }
        ctx.ConversationSkillIDs = await ctx.Hooks.LoadConversationSkillIDs(params);
        const explicitIds = params.requestedSkillIDs ?? [];
        const requestedIds = ctx.Hooks.MergeSkillIDs(explicitIds, ctx.ConversationSkillIDs);
        if (requestedIds.length === 0) {
            return;
        }

        const allowed = await ctx.Hooks.AvailableSkills(
            AIEngine.Instance.GetSkillsForAgent(params.agent, params.contextUser),
            'requested',
            params.agent,
            params.contextUser
        );
        const allowedSet = new UUIDSet(allowed.map(s => s.ID));
        const explicitSet = new UUIDSet(explicitIds);
        const requestedSet = new UUIDSet(requestedIds);
        const activatedSet = new UUIDSet(ctx.ActivatedSkillIDs);
        const droppedIds = requestedIds.filter(id => !allowedSet.Has(id));
        const droppedExplicit = droppedIds.filter(id => explicitSet.Has(id));
        if (droppedExplicit.length > 0) {
            ctx.Hooks.NotifyDroppedSkillRequests(droppedExplicit, params);
        }
        const newlyActivated = allowed.filter(s => requestedSet.Has(s.ID) && !activatedSet.Has(s.ID));
        if (newlyActivated.length === 0) {
            return;
        }
        await ctx.Hooks.ActivateRequestedSkills(newlyActivated, params);
    }

    public override async ActivateRequestedSkills(
        ctx: AgentRunContext,
        newlyActivated: MJAISkillEntity[],
        params: ExecuteAgentParams
    ): Promise<void> {
        const currentPayload = params.payload;
        for (const skill of newlyActivated) {
            const invocation = ctx.Hooks.BuildSkillInvocation(skill, params.agent, 'requested');
            await ctx.Hooks.RecordSkillActivationStep(skill, currentPayload, params, invocation);
            ctx.Hooks.EnableSkillCapabilities(skill, params);
            ctx.ActivatedSkillIDs.push(skill.ID);
            ctx.SkillInvocations.push(invocation);
            await ctx.Hooks.PersistConversationSkillActivation(skill, params);
        }

        const instructions = await this.resolveSkillInstructionsFor(ctx, newlyActivated, params, currentPayload);
        const activationMessage = ctx.Hooks.BuildSkillActivationMessage(newlyActivated, instructions);
        if (!params.conversationMessages) {
            params.conversationMessages = [];
        }
        params.conversationMessages.push({
            role: 'user',
            content: activationMessage,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: 'skill-activation',
            },
        } as AgentChatMessage);
    }

    public override MergeSkillIDs(
        _ctx: AgentRunContext,
        explicit: readonly string[],
        persisted: readonly string[]
    ): string[] {
        const merged = [...explicit];
        const seen = new UUIDSet(merged);
        for (const id of persisted) {
            if (!seen.Has(id)) {
                seen.Add(id);
                merged.push(id);
            }
        }
        return merged;
    }

    public override async LoadConversationSkillIDs(_ctx: AgentRunContext, params: ExecuteAgentParams): Promise<string[]> {
        const conversationId = params.conversationId;
        if (!conversationId || !params.contextUser) return [];
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ SkillID: string }>(
                {
                    EntityName: 'MJ: Conversation Skills',
                    ExtraFilter: `ConversationID = '${EscapeSQLString(conversationId)}' AND Status = 'Active'`,
                    Fields: ['SkillID'],
                    ResultType: 'simple',
                },
                params.contextUser
            );
            if (!result.Success) {
                LogErrorEx({
                    message: `Could not read conversation skills for ${conversationId}: ${result.ErrorMessage}`,
                    severity: 'warning',
                    category: 'AgentSkills',
                });
                return [];
            }
            return (result.Results ?? []).map(r => r.SkillID).filter(id => typeof id === 'string' && id.length > 0);
        } catch (e) {
            LogErrorEx({
                message: `Could not read conversation skills for ${conversationId}: ${e instanceof Error ? e.message : String(e)}`,
                severity: 'warning',
                category: 'AgentSkills',
            });
            return [];
        }
    }

    public override async PersistConversationSkillActivation(
        ctx: AgentRunContext,
        skill: MJAISkillEntity,
        params: ExecuteAgentParams
    ): Promise<void> {
        const conversationId = params.conversationId;
        if (!conversationId || !params.contextUser) return;
        if (skill.ActivationScope !== 'Conversation') return;
        if (ctx.ConversationSkillIDs.some(id => UUIDsEqual(id, skill.ID))) return;
        try {
            const provider = params.provider ?? ctx.ProviderToUse;
            const rv = new RunView();
            const existing = await rv.RunView<MJConversationSkillEntity>(
                {
                    EntityName: 'MJ: Conversation Skills',
                    ExtraFilter: `ConversationID = '${EscapeSQLString(conversationId)}' AND SkillID = '${EscapeSQLString(skill.ID)}'`,
                    ResultType: 'entity_object',
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                },
                params.contextUser
            );
            if (!existing.Success) {
                LogErrorEx({
                    message: `Could not read conversation skill '${skill.Name}': ${existing.ErrorMessage}`,
                    severity: 'warning',
                    category: 'AgentSkills',
                });
                return;
            }
            const hit = existing.Results?.[0];
            if (hit?.Status === 'Active') return;
            const row =
                hit ??
                (await provider.GetEntityObject<MJConversationSkillEntity>(
                    'MJ: Conversation Skills',
                    params.contextUser
                ));
            if (!hit) {
                row.ConversationID = conversationId;
                row.SkillID = skill.ID;
            }
            row.Status = 'Active';
            row.EndedAt = null;
            row.ActivatedByRunID = ctx.AgentRun?.ID ?? null;
            if (!(await row.Save())) {
                LogErrorEx({
                    message: `Could not persist conversation skill '${skill.Name}': ${row.LatestResult?.CompleteMessage ?? 'save failed'}`,
                    severity: 'warning',
                    category: 'AgentSkills',
                });
            }
        } catch (e) {
            LogErrorEx({
                message: `Could not persist conversation skill '${skill.Name}': ${e instanceof Error ? e.message : String(e)}`,
                severity: 'warning',
                category: 'AgentSkills',
            });
        }
    }

    public override async EndConversationSkill(
        _ctx: AgentRunContext,
        conversationId: string,
        skillId: string,
        contextUser?: UserInfo
    ): Promise<void> {
        if (!conversationId || !skillId || !contextUser) return;
        try {
            const rv = new RunView();
            const existing = await rv.RunView<MJConversationSkillEntity>(
                {
                    EntityName: 'MJ: Conversation Skills',
                    ExtraFilter: `ConversationID = '${EscapeSQLString(conversationId)}' AND SkillID = '${EscapeSQLString(skillId)}' AND Status = 'Active'`,
                    ResultType: 'entity_object',
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                },
                contextUser
            );
            const row = existing.Success ? existing.Results?.[0] : undefined;
            if (!row) return;
            row.Status = 'Ended';
            row.EndedAt = new Date();
            if (!(await row.Save())) {
                LogErrorEx({
                    message: `Could not end conversation skill ${skillId}: ${row.LatestResult?.CompleteMessage ?? 'save failed'}`,
                    severity: 'warning',
                    category: 'AgentSkills',
                });
            }
        } catch (e) {
            LogErrorEx({
                message: `Could not end conversation skill ${skillId}: ${e instanceof Error ? e.message : String(e)}`,
                severity: 'warning',
                category: 'AgentSkills',
            });
        }
    }

    public override NotifyDroppedSkillRequests(
        ctx: AgentRunContext,
        droppedIds: string[],
        params: ExecuteAgentParams
    ): void {
        const skillsById = IndexByUUID(AIEngine.Instance.Skills, s => s.ID);
        const names = droppedIds.map(id => skillsById.Get(id)?.Name ?? id);
        const reason =
            params.agent.AcceptsSkills === 'None'
                ? `agent '${params.agent.Name}' does not accept skills (AcceptsSkills='None')`
                : `the skill(s) are not available to agent '${params.agent.Name}' — not Active, not assigned to it (AcceptsSkills='Limited'), or the user lacks Run permission, or the application's skill-availability policy refused it`;
        LogErrorEx({
            message: `Requested skill activation dropped for [${names.join(', ')}]: ${reason}`,
            severity: 'warning',
            category: 'AgentSkills',
        });
        if (!params.conversationMessages) {
            params.conversationMessages = [];
        }
        params.conversationMessages.push({
            role: 'user',
            content: `SYSTEM NOTE: The user requested activation of the following skill(s) for this run: ${names.join(', ')}. The request was NOT honored because ${reason}. Briefly inform the user that the requested skill(s) are not available to you and, if appropriate, suggest an agent that accepts skills or that an administrator can grant this capability. Do NOT attempt to build, delegate, or improvise a workaround for the missing capability.`,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: 'skill-activation-refused',
            },
        } as AgentChatMessage);
    }

    public override ResolveSkillActivations(
        _ctx: AgentRunContext,
        requested: AgentSkillActivationRequest[],
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): MJAISkillEntity[] {
        const availableSkills = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agent, contextUser);
        const resolved: MJAISkillEntity[] = [];
        const resolvedSet = new UUIDSet();

        for (const req of requested) {
            const requestedName = req.name.trim().toLowerCase();
            const match = availableSkills.find(s => s.Name.trim().toLowerCase() === requestedName);
            if (match && !resolvedSet.Has(match.ID)) {
                resolvedSet.Add(match.ID);
                resolved.push(match);
            }
        }

        return resolved;
    }

    public override BuildSkillActivationMessage(
        _ctx: AgentRunContext,
        skills: MJAISkillEntity[],
        resolvedInstructions?: ReadonlyMap<string, string>
    ): string {
        const sections = skills.map(s => `## Skill Activated: ${s.Name}\n\n${resolvedInstructions?.get(s.ID) ?? s.Instructions}`);
        return (
            `The following skill(s) have been activated. Their instructions are now in effect ` +
            `for the remainder of this run:\n\n${sections.join('\n\n')}`
        );
    }

    private async resolveSkillInstructionsFor(
        ctx: AgentRunContext,
        skills: MJAISkillEntity[],
        params: ExecuteAgentParams,
        payload: unknown
    ): Promise<Map<string, string>> {
        const resolved = new Map<string, string>();
        for (const skill of skills) {
            resolved.set(skill.ID, await ctx.Hooks.ResolveSkillInstructions(skill, params, payload));
        }
        return resolved;
    }

    public override async ResolveSkillInstructions(
        ctx: AgentRunContext,
        skill: MJAISkillEntity,
        params: ExecuteAgentParams,
        payload: unknown
    ): Promise<string> {
        const stored = skill.Instructions ?? '';
        if (!IsTemplatedSkillInstructions(stored)) {
            return stored;
        }
        try {
            await ctx.Hooks.EnsureTemplateEngineConfigured(params.contextUser);
            const result = await TemplateEngineServer.Instance.RenderTemplateSimple(
                stored,
                await ctx.Hooks.BuildSkillTemplateData(params, payload),
                { ContextUser: params.contextUser }
            );
            if (result.Success && result.Output != null) {
                return result.Output.trimStart();
            }
            this.warnSkillRenderFailed(skill, params, result.Message);
        } catch (error) {
            this.warnSkillRenderFailed(skill, params, error instanceof Error ? error.message : String(error));
        }
        return stored;
    }

    public override async BuildSkillTemplateData(
        _ctx: AgentRunContext,
        params: ExecuteAgentParams,
        payload: unknown
    ): Promise<Record<string, unknown>> {
        const placeholders = await SystemPlaceholderManager.ResolveAvailablePlaceholders({ contextUser: params.contextUser });
        return {
            ...placeholders,
            ...(params.data ?? {}),
            [BaseAgentType.CURRENT_PAYLOAD_PLACEHOLDER]: payload ?? {},
            agentName: params.agent.Name,
            agentDescription: params.agent.Description ?? '',
        };
    }

    private warnSkillRenderFailed(skill: MJAISkillEntity, params: ExecuteAgentParams, reason: string | undefined): void {
        LogErrorEx({
            message: `Skill '${skill.Name}' instructions failed to render as a template; using the stored text: ${reason ?? 'no message from the template engine'}`,
            severity: 'warning',
            category: 'AgentSkills',
            metadata: { agent: params.agent.Name, skillID: skill.ID },
        });
    }

    public override EnableSkillCapabilities(
        _ctx: AgentRunContext,
        skill: MJAISkillEntity,
        params: ExecuteAgentParams
    ): void {
        const activatingAgentIds = [params.agent.ID];

        const actionIds = AIEngine.Instance.GetSkillExposedActionIDs(skill.ID);
        if (actionIds.length > 0) {
            if (!params.actionChanges) {
                params.actionChanges = [];
            }
            params.actionChanges.push({
                scope: 'specific',
                mode: 'add',
                actionIds,
                agentIds: activatingAgentIds,
            });
        }

        const subAgentIds = AIEngine.Instance.GetSkillSubAgentIDs(skill.ID);
        if (subAgentIds.length > 0) {
            if (!params.subAgentChanges) {
                params.subAgentChanges = [];
            }
            params.subAgentChanges.push({
                scope: 'specific',
                mode: 'add',
                subAgentIds,
                agentIds: activatingAgentIds,
            });
        }
    }

    public override BuildSkillInvocation(
        _ctx: AgentRunContext,
        skill: MJAISkillEntity,
        agent: MJAIAgentEntityExtended,
        activationType: AgentSkillInvocation['ActivationType'],
        reason?: string
    ): AgentSkillInvocation {
        const eff = SafeResolveEffectiveAgentProperties(agent);
        return {
            SkillID: skill.ID,
            SkillName: skill.Name,
            ActivationType: activationType,
            Provenance: {
                AgentAcceptsSkills: eff?.AcceptsSkills ?? agent.AcceptsSkills,
                SkillActivationMode: skill.ActivationMode,
                AgentSkillActivationMode: eff?.SkillActivationMode ?? agent.SkillActivationMode,
                RequestedBy: activationType === 'requested' ? 'user-request' : 'agent-decision',
            },
            ...(reason ? { Reason: reason } : {}),
        };
    }

    public override GetSkillAttributionForAction(
        ctx: AgentRunContext,
        actionId: string,
        agent: MJAIAgentEntityExtended
    ): AgentSkillInvocation[] | undefined {
        if (ctx.SkillInvocations.length === 0 || !actionId) {
            return undefined;
        }
        const isNative = ctx.Hooks.GetEffectiveAgentActions(agent.ID).some(aa => UUIDsEqual(aa.ActionID, actionId));
        if (isNative) {
            return undefined;
        }
        const granting = ctx.SkillInvocations.filter(inv =>
            new UUIDSet(AIEngine.Instance.GetSkillActionIDs(inv.SkillID)).Has(actionId)
        );
        return granting.length > 0 ? granting : undefined;
    }

    public override GetSkillAttributionForSubAgent(
        ctx: AgentRunContext,
        subAgent: MJAIAgentEntityExtended,
        agent: MJAIAgentEntityExtended
    ): AgentSkillInvocation[] | undefined {
        if (ctx.SkillInvocations.length === 0 || !subAgent) {
            return undefined;
        }
        const chainIdSet = new UUIDSet(
            typeof AIEngine.Instance.GetAgentInheritanceChain === 'function'
                ? AIEngine.Instance.GetAgentInheritanceChain(agent.ID).map(a => a.ID)
                : [agent.ID]
        );
        const isParentChild = subAgent.ParentID != null && chainIdSet.Has(subAgent.ParentID);
        const isReferenced = AIEngine.Instance.AgentRelationships.some(
            rel => chainIdSet.Has(rel.AgentID) && UUIDsEqual(rel.SubAgentID, subAgent.ID) && rel.Status === 'Active'
        );
        if (isParentChild || isReferenced) {
            return undefined;
        }
        const granting = ctx.SkillInvocations.filter(inv =>
            new UUIDSet(AIEngine.Instance.GetSkillSubAgentIDs(inv.SkillID)).Has(subAgent.ID)
        );
        return granting.length > 0 ? granting : undefined;
    }

    public override async RecordSkillActivationStep(
        ctx: AgentRunContext,
        skill: MJAISkillEntity,
        currentPayload: unknown,
        params: ExecuteAgentParams,
        invocation?: AgentSkillInvocation
    ): Promise<void> {
        await ctx.Hooks.CreateStepEntity({
            stepType: 'Skill',
            stepName: `Skill: ${skill.Name}`,
            targetId: skill.ID,
            inputData: { skillName: skill.Name },
            contextUser: params.contextUser,
            payloadAtStart: currentPayload,
            payloadAtEnd: currentPayload,
            ...(invocation ? { skills: [invocation] } : {}),
            completed: {
                success: true,
                outputData: {
                    skillId: skill.ID,
                    skillName: skill.Name,
                    ...(invocation
                        ? {
                              activationType: invocation.ActivationType,
                              requestedBy: invocation.Provenance.RequestedBy,
                              ...(invocation.Reason ? { reason: invocation.Reason } : {}),
                          }
                        : {}),
                },
            },
        });
    }
}
