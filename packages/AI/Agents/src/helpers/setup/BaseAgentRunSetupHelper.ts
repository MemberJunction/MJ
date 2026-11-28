/**
 * @fileoverview Abstract pluggable base seam for `BaseAgent` run lifecycle setup,
 * 3-phase initialization pipeline (`ExecuteRun`), data preloading, checkpoint restore,
 * Plan Mode gating, teardown (`EndRun`), and terminal run finalization (`FinalizeAgentRun`,
 * `CreateFailureResult`, `CreateCancelledResult`).
 *
 * Resolved via `MJGlobal.Instance.ClassFactory` (`SeamKey: 'setup'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { BaseAgentType } from '../../agent-types/base-agent-type';
import type { AgentRunContext } from '../AgentRunContext';

/**
 * Pluggable base helper encapsulating run lifecycle orchestration, Phases 1–3 setup,
 * checkpoint restoration, teardown, and run finalization.
 */
export class BaseAgentRunSetupHelper {
    public ExecuteRun<C, R>(_ctx: AgentRunContext, _params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        throw new Error('BaseAgentRunSetupHelper.ExecuteRun must be implemented by a registered subclass.');
    }

    public EndRun(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.EndRun must be implemented by a registered subclass.');
    }

    public FailRunAtStart(_ctx: AgentRunContext, _errorMessage: string, _params: ExecuteAgentParams): Promise<never> {
        throw new Error('BaseAgentRunSetupHelper.FailRunAtStart must be implemented by a registered subclass.');
    }

    public ClearRunBoundState(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentRunSetupHelper.ClearRunBoundState must be implemented by a registered subclass.');
    }

    public ReleasePerRunDataCache(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentRunSetupHelper.ReleasePerRunDataCache must be implemented by a registered subclass.');
    }

    public FinalizeRun(_ctx: AgentRunContext, _outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.FinalizeRun must be implemented by a registered subclass.');
    }

    public DeriveRunOutcome(_ctx: AgentRunContext): 'success' | 'failure' | 'cancelled' {
        throw new Error('BaseAgentRunSetupHelper.DeriveRunOutcome must be implemented by a registered subclass.');
    }

    public IsSessionDrivenAgentType(_ctx: AgentRunContext, _agentType: BaseAgentType): boolean {
        throw new Error('BaseAgentRunSetupHelper.IsSessionDrivenAgentType must be implemented by a registered subclass.');
    }

    public InitializeAgentType(_ctx: AgentRunContext, _params: ExecuteAgentParams, _config: AgentConfiguration): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.InitializeAgentType must be implemented by a registered subclass.');
    }

    public PreloadAgentData(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.PreloadAgentData must be implemented by a registered subclass.');
    }

    public WithRunDataTrustApplied<C>(_ctx: AgentRunContext, _params: ExecuteAgentParams<C>): ExecuteAgentParams<C> {
        throw new Error('BaseAgentRunSetupHelper.WithRunDataTrustApplied must be implemented by a registered subclass.');
    }

    public InitializeEngines(_ctx: AgentRunContext, _contextUser?: UserInfo): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.InitializeEngines must be implemented by a registered subclass.');
    }

    public ValidateRunChain(_ctx: AgentRunContext, _lastRunId: string, _contextUser?: UserInfo, _preloadedLastRun?: { LastRunID?: string | null } | null): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.ValidateRunChain must be implemented by a registered subclass.');
    }

    public ValidateAgent(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        throw new Error('BaseAgentRunSetupHelper.ValidateAgent must be implemented by a registered subclass.');
    }

    public LoadAgentConfiguration(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        throw new Error('BaseAgentRunSetupHelper.LoadAgentConfiguration must be implemented by a registered subclass.');
    }

    public InitializeAgentRun(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.InitializeAgentRun must be implemented by a registered subclass.');
    }

    public RestorePausedRunFromCheckpoint(_ctx: AgentRunContext, _params: ExecuteAgentParams, _runProvider: IMetadataProvider): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.RestorePausedRunFromCheckpoint must be implemented by a registered subclass.');
    }

    public ResolvePlanModeGate(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<{ active: boolean; approved: boolean }> {
        throw new Error('BaseAgentRunSetupHelper.ResolvePlanModeGate must be implemented by a registered subclass.');
    }

    public ValidateAgentWithTracking(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        throw new Error('BaseAgentRunSetupHelper.ValidateAgentWithTracking must be implemented by a registered subclass.');
    }

    public GetStorageAccountID(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<string | null> {
        throw new Error('BaseAgentRunSetupHelper.GetStorageAccountID must be implemented by a registered subclass.');
    }

    public AreArtifactToolsEnabled(_ctx: AgentRunContext, _params?: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentRunSetupHelper.AreArtifactToolsEnabled must be implemented by a registered subclass.');
    }

    public GetAgentTypeName(_ctx: AgentRunContext, _typeID: string): string {
        throw new Error('BaseAgentRunSetupHelper.GetAgentTypeName must be implemented by a registered subclass.');
    }

    public GetValueListItems(_ctx: AgentRunContext, _valueListID: string): string[] | null {
        throw new Error('BaseAgentRunSetupHelper.GetValueListItems must be implemented by a registered subclass.');
    }

    public GetActionCategoryName(_ctx: AgentRunContext, _categoryID: string): string {
        throw new Error('BaseAgentRunSetupHelper.GetActionCategoryName must be implemented by a registered subclass.');
    }

    public AssertLastRunIdIsUUID(_ctx: AgentRunContext, _lastRunId: string | undefined): void {
        throw new Error('BaseAgentRunSetupHelper.AssertLastRunIdIsUUID must be implemented by a registered subclass.');
    }

    public FlushPromptRunnerSaves(_ctx: AgentRunContext): Promise<void> {
        throw new Error('BaseAgentRunSetupHelper.FlushPromptRunnerSaves must be implemented by a registered subclass.');
    }

    public CreateFailureResult(_ctx: AgentRunContext, _errorMessage: string, _contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        throw new Error('BaseAgentRunSetupHelper.CreateFailureResult must be implemented by a registered subclass.');
    }

    public CreateCancelledResult(_ctx: AgentRunContext, _message: string, _contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        throw new Error('BaseAgentRunSetupHelper.CreateCancelledResult must be implemented by a registered subclass.');
    }

    public ReleaseFinishedRun(_ctx: AgentRunContext, _saved: boolean): void {
        throw new Error('BaseAgentRunSetupHelper.ReleaseFinishedRun must be implemented by a registered subclass.');
    }

    public FinalizeAgentRun<P>(_ctx: AgentRunContext, _finalStep: BaseAgentNextStep, _payload?: P, _contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        throw new Error('BaseAgentRunSetupHelper.FinalizeAgentRun must be implemented by a registered subclass.');
    }
}
