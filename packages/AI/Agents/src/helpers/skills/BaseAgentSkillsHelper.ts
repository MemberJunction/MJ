/**
 * @fileoverview Pluggable base token class for the Skills Activation, Grants,
 * Conversation-Scope Persistence & Attribution seam (`s6`).
 *
 * Downstream packages can replace this helper globally via
 * `@RegisterClass(BaseAgentSkillsHelper, 'Default')` or per-agent via
 * `AIAgent.Configuration.helperPlugins` (`seam: 'skills'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentConfiguration,
    AgentSkillActivationRequest,
    AgentSkillInvocation,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    SkillAvailabilityPurpose,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { AgentRunContext } from '../AgentRunContext';

/**
 * Pluggable base token class for `BaseAgent`'s skill validation, activation,
 * policy filtering, templated instructions rendering, conversation-skill persistence,
 * and action/sub-agent skill attribution seam.
 */
export class BaseAgentSkillsHelper {
    public ActiveSkillIDsForRun(_ctx: AgentRunContext, _params: ExecuteAgentParams): string[] {
        throw new Error('BaseAgentSkillsHelper.ActiveSkillIDsForRun must be implemented by a registered subclass.');
    }

    public ValidateSkillNextStep<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentSkillsHelper.ValidateSkillNextStep must be implemented by a registered subclass.');
    }

    public ExecuteSkillStep(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        _previousDecision: BaseAgentNextStep,
        _stepCount?: number
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentSkillsHelper.ExecuteSkillStep must be implemented by a registered subclass.');
    }

    public FilterAvailableSkills(
        _ctx: AgentRunContext,
        _skills: MJAISkillEntity[],
        _purpose: SkillAvailabilityPurpose,
        _agent: MJAIAgentEntityExtended,
        _contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        throw new Error('BaseAgentSkillsHelper.FilterAvailableSkills must be implemented by a registered subclass.');
    }

    public AvailableSkills(
        _ctx: AgentRunContext,
        _gated: MJAISkillEntity[],
        _purpose: SkillAvailabilityPurpose,
        _agent: MJAIAgentEntityExtended,
        _contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        throw new Error('BaseAgentSkillsHelper.AvailableSkills must be implemented by a registered subclass.');
    }

    public PreActivateRequestedSkills(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentSkillsHelper.PreActivateRequestedSkills must be implemented by a registered subclass.');
    }

    public ActivateRequestedSkills(
        _ctx: AgentRunContext,
        _newlyActivated: MJAISkillEntity[],
        _params: ExecuteAgentParams
    ): Promise<void> {
        throw new Error('BaseAgentSkillsHelper.ActivateRequestedSkills must be implemented by a registered subclass.');
    }

    public MergeSkillIDs(_ctx: AgentRunContext, _explicit: readonly string[], _persisted: readonly string[]): string[] {
        throw new Error('BaseAgentSkillsHelper.MergeSkillIDs must be implemented by a registered subclass.');
    }

    public LoadConversationSkillIDs(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<string[]> {
        throw new Error('BaseAgentSkillsHelper.LoadConversationSkillIDs must be implemented by a registered subclass.');
    }

    public PersistConversationSkillActivation(
        _ctx: AgentRunContext,
        _skill: MJAISkillEntity,
        _params: ExecuteAgentParams
    ): Promise<void> {
        throw new Error('BaseAgentSkillsHelper.PersistConversationSkillActivation must be implemented by a registered subclass.');
    }

    public EndConversationSkill(
        _ctx: AgentRunContext,
        _conversationId: string,
        _skillId: string,
        _contextUser?: UserInfo
    ): Promise<void> {
        throw new Error('BaseAgentSkillsHelper.EndConversationSkill must be implemented by a registered subclass.');
    }

    public NotifyDroppedSkillRequests(
        _ctx: AgentRunContext,
        _droppedIds: string[],
        _params: ExecuteAgentParams
    ): void {
        throw new Error('BaseAgentSkillsHelper.NotifyDroppedSkillRequests must be implemented by a registered subclass.');
    }

    public ResolveSkillActivations(
        _ctx: AgentRunContext,
        _requested: AgentSkillActivationRequest[],
        _agent: MJAIAgentEntityExtended,
        _contextUser?: UserInfo
    ): MJAISkillEntity[] {
        throw new Error('BaseAgentSkillsHelper.ResolveSkillActivations must be implemented by a registered subclass.');
    }

    public BuildSkillActivationMessage(
        _ctx: AgentRunContext,
        _skills: MJAISkillEntity[],
        _resolvedInstructions?: ReadonlyMap<string, string>
    ): string {
        throw new Error('BaseAgentSkillsHelper.BuildSkillActivationMessage must be implemented by a registered subclass.');
    }

    public ResolveSkillInstructions(
        _ctx: AgentRunContext,
        _skill: MJAISkillEntity,
        _params: ExecuteAgentParams,
        _payload: unknown
    ): Promise<string> {
        throw new Error('BaseAgentSkillsHelper.ResolveSkillInstructions must be implemented by a registered subclass.');
    }

    public BuildSkillTemplateData(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _payload: unknown
    ): Promise<Record<string, unknown>> {
        throw new Error('BaseAgentSkillsHelper.BuildSkillTemplateData must be implemented by a registered subclass.');
    }

    public EnableSkillCapabilities(
        _ctx: AgentRunContext,
        _skill: MJAISkillEntity,
        _params: ExecuteAgentParams
    ): void {
        throw new Error('BaseAgentSkillsHelper.EnableSkillCapabilities must be implemented by a registered subclass.');
    }

    public BuildSkillInvocation(
        _ctx: AgentRunContext,
        _skill: MJAISkillEntity,
        _agent: MJAIAgentEntityExtended,
        _activationType: AgentSkillInvocation['ActivationType'],
        _reason?: string
    ): AgentSkillInvocation {
        throw new Error('BaseAgentSkillsHelper.BuildSkillInvocation must be implemented by a registered subclass.');
    }

    public GetSkillAttributionForAction(
        _ctx: AgentRunContext,
        _actionId: string,
        _agent: MJAIAgentEntityExtended
    ): AgentSkillInvocation[] | undefined {
        throw new Error('BaseAgentSkillsHelper.GetSkillAttributionForAction must be implemented by a registered subclass.');
    }

    public GetSkillAttributionForSubAgent(
        _ctx: AgentRunContext,
        _subAgent: MJAIAgentEntityExtended,
        _agent: MJAIAgentEntityExtended
    ): AgentSkillInvocation[] | undefined {
        throw new Error('BaseAgentSkillsHelper.GetSkillAttributionForSubAgent must be implemented by a registered subclass.');
    }

    public RecordSkillActivationStep(
        _ctx: AgentRunContext,
        _skill: MJAISkillEntity,
        _currentPayload: unknown,
        _params: ExecuteAgentParams,
        _invocation?: AgentSkillInvocation
    ): Promise<void> {
        throw new Error('BaseAgentSkillsHelper.RecordSkillActivationStep must be implemented by a registered subclass.');
    }
}
