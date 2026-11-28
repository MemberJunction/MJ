/**
 * @module experiment/token-accounting
 *
 * An experiment iteration's `TokensUsed` is real (F-EXP-3, §5.1.7): the sum of the `MJ: AI Prompt Runs.TokensUsed`
 * attributed to the iteration. A prompt run is attributed to an iteration when it ran in the agent run tree that made
 * calls for that iteration — a strategist choosing it, or a derivation computing its inputs — which the iteration names
 * in `AIAgentRunID` (D5-A6-1). The tree's prompt runs are reached through its `Prompt` run steps (`TargetLogID`), as
 * the decision log reads them. An iteration with no `AIAgentRunID` had no LLM call made for it and used 0 tokens.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJAIPromptRunEntity, MJExperimentSessionIterationEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet } from '@memberjunction/global';

/**
 * A wave strategist that makes LLM calls names the agent run they run under, so the orchestrator records it on every
 * iteration the strategist proposes (`AIAgentRunID`) and the iteration's tokens can be summed.
 */
export interface IAttributedWaveStrategist {
  /** The agent run the strategist's calls for the wave it last proposed ran under; null when it made none. */
  readonly CurrentAgentRunID: string | null;
}

/** Where a trainer reads the tokens attributed to an iteration (production: {@link ExperimentTokenAccounting.TokensFor}). */
export type IterationTokenSource = (iterationId: string) => Promise<number>;

/** An agent run and every run below it. */
export class AgentRunTree {
  /**
   * The IDs of `rootRunId` and every descendant run (`ParentRunID`), each once.
   *
   * @throws when a read fails
   */
  public static async Ids(rootRunId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<string[]> {
    const seen = new UUIDSet([rootRunId]);
    const ids = [rootRunId];
    let level = [rootRunId];
    while (level.length > 0) {
      const children = await AgentRunTree.childrenOf(level, provider, contextUser);
      level = children.filter((id) => !seen.Has(id));
      for (const id of level) { seen.Add(id); ids.push(id); }
    }
    return ids;
  }

  /** A quoted SQL `IN` list of IDs. */
  public static InList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }

  /** The runs whose parent is one of `parents`. */
  private static async childrenOf(parents: readonly string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<string[]> {
    const rows = await RunView.FromMetadataProvider(provider).RunView<Pick<MJAIAgentRunEntity, 'ID'>>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ParentRunID IN (${AgentRunTree.InList(parents)})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!rows.Success) throw new Error(`AgentRunTree: reading the child runs of ${parents.join(', ')} failed: ${rows.ErrorMessage || 'unknown error'}`);
    return rows.Results.map((r) => r.ID);
  }
}

/** Token accounting of experiment iterations. */
export class ExperimentTokenAccounting {
  /** True when `strategist` names the agent run its calls ran under ({@link IAttributedWaveStrategist}). */
  public static IsAttributed(strategist: object): strategist is IAttributedWaveStrategist {
    return 'CurrentAgentRunID' in strategist && (strategist.CurrentAgentRunID === null || typeof strategist.CurrentAgentRunID === 'string');
  }

  /**
   * The tokens attributed to `iterationId`: the sum of `TokensUsed` over the prompt runs of its `AIAgentRunID` tree,
   * 0 when it names no agent run.
   *
   * @throws when the iteration does not exist or a read fails (a failed read is never counted as 0)
   */
  public static async TokensFor(iterationId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<number> {
    const agentRunId = await ExperimentTokenAccounting.agentRunOf(iterationId, provider, contextUser);
    if (agentRunId === null) return 0;
    const tree = await AgentRunTree.Ids(agentRunId, provider, contextUser);
    return ExperimentTokenAccounting.PromptRunTokens(tree, provider, contextUser);
  }

  /**
   * The sum of `TokensUsed` over the prompt runs the `Prompt` steps of `agentRunIds` name.
   *
   * @throws when a read fails
   */
  public static async PromptRunTokens(agentRunIds: readonly string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<number> {
    if (agentRunIds.length === 0) return 0;
    const view = RunView.FromMetadataProvider(provider);
    const steps = await view.RunView<Pick<MJAIAgentRunStepEntity, 'TargetLogID'>>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID IN (${AgentRunTree.InList(agentRunIds)}) AND StepType='Prompt' AND TargetLogID IS NOT NULL`,
      Fields: ['TargetLogID'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!steps.Success) throw new Error(`ExperimentTokenAccounting: reading the prompt steps failed: ${steps.ErrorMessage || 'unknown error'}`);
    const seen = new UUIDSet();
    const promptRunIds: string[] = [];
    for (const step of steps.Results) {
      if (!step.TargetLogID || seen.Has(step.TargetLogID)) continue;
      seen.Add(step.TargetLogID);
      promptRunIds.push(step.TargetLogID);
    }
    if (promptRunIds.length === 0) return 0;
    const prompts = await view.RunView<Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsed'>>({
      EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `ID IN (${AgentRunTree.InList(promptRunIds)})`, Fields: ['ID', 'TokensUsed'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!prompts.Success) throw new Error(`ExperimentTokenAccounting: reading the prompt runs failed: ${prompts.ErrorMessage || 'unknown error'}`);
    return prompts.Results.reduce((sum, p) => sum + (p.TokensUsed || 0), 0);
  }

  /** The iteration's `AIAgentRunID`. */
  private static async agentRunOf(iterationId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<string | null> {
    const rows = await RunView.FromMetadataProvider(provider).RunView<Pick<MJExperimentSessionIterationEntity, 'ID' | 'AIAgentRunID'>>({
      EntityName: 'MJ: Experiment Session Iterations', ExtraFilter: `ID='${EscapeSQLString(iterationId)}'`, Fields: ['ID', 'AIAgentRunID'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!rows.Success) throw new Error(`ExperimentTokenAccounting: reading iteration ${iterationId} failed: ${rows.ErrorMessage || 'unknown error'}`);
    const row = rows.Results[0];
    if (!row) throw new Error(`ExperimentTokenAccounting: iteration ${iterationId} does not exist`);
    return row.AIAgentRunID || null;
  }
}
