import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { TrustVerdicts } from '@memberjunction/predictive-studio-core';
import type { PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import type { RunContext } from './run-fixtures';
import type { AgentStepResult } from './types';

/**
 * Agent runs for the truth harness, in process over the harness's client provider: `GraphQLAIClient.RunAIAgent` runs
 * the agent on MJAPI and, for a headless client, returns the finished run (payload and agent run) as its result.
 */
export class HarnessAgent {
  /** Pipeline names longer than this are cut by the builder (`ModelingPlanToPipelineConfig`'s name rule). */
  private static readonly maxPipelineNameLength = 80;

  /**
   * Run the Pipeline Builder agent on `plan` and report the run, its build, and every pipeline the run created — read
   * back by the exact names the builder gives them, so a failed run's pipelines are reported too.
   */
  public static async RunBuilderAgent(ctx: RunContext, plan: ModelingPlanSpec): Promise<AgentStepResult> {
    const agent = await HarnessAgent.loadAgent(ctx, 'Pipeline Builder');
    if (agent.DriverClass !== 'PredictiveStudioPipelineBuilderAgent') {
      throw new Error(`'Pipeline Builder' agent has DriverClass '${agent.DriverClass || 'none'}'`);
    }
    const t0 = Date.now();
    const result: ExecuteAgentResult<PredictiveStudioBuilderPayload> = await new GraphQLAIClient(ctx.Provider).RunAIAgent({
      agent,
      conversationMessages: [{ role: 'user', content: 'build it' }],
      payload: plan,
    });
    const wallMs = Date.now() - t0;
    const build = result.payload?.BuildResult || null;
    const pipelineIds = await HarnessAgent.PipelineIDsNamed(ctx.Provider, ctx.User, HarnessAgent.BuilderPipelineNames(plan));
    const builtPipelineId = build?.pipelineId;
    if (builtPipelineId && !pipelineIds.some((id) => UUIDsEqual(id, builtPipelineId))) pipelineIds.push(builtPipelineId);
    return {
      AgentRunID: result.agentRun?.ID || null,
      AgentSuccess: result.success,
      AgentErrorMessage: result.agentRun?.ErrorMessage || result.errorMessage || null,
      BuildModelID: build?.modelId || null,
      BuildSuccess: build?.success === true,
      BuildErrorMessage: build?.errorMessage || null,
      PipelineIDs: pipelineIds,
      WallMs: wallMs,
    };
  }

  /** One Model Development Agent report for `modelId` (the user-facing text of the run's final step); null if none. */
  public static async GenerateStory(ctx: RunContext, modelId: string): Promise<string | null> {
    const agent = await HarnessAgent.loadAgent(ctx, 'Model Development Agent');
    const model = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
    if (!(await model.Load(modelId))) throw new Error(`ML Model ${modelId} not found`);
    const result = await new GraphQLAIClient(ctx.Provider).RunAIAgent({
      agent,
      conversationMessages: [{ role: 'user', content: HarnessAgent.StoryRequest(model) }],
    });
    // A run that ended without a final message counts as "no story".
    return result.success && result.agentRun?.Message ? result.agentRun.Message : null;
  }

  /** The facts a user would have after a build, in the words the Model Development Agent receives them. */
  public static StoryRequest(model: MJMLModelEntity): string {
    const trust = TrustVerdicts.DeriveTrustVerdict(model);
    const weights = Object.entries(SafeJSONParse<Record<string, number>>(model.FeatureImportance || '{}') || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([f, w]) => `${f} (${(w * 100).toFixed(1)}%)`)
      .join(', ');
    return [
      `Our model predicting ${model.TargetVariable} is already built and trained (ML Model ${model.ID}, version ${model.Version}).`,
      `Holdout metrics: ${model.HoldoutMetrics || 'none'}. Trust: ${trust.grade} — ${trust.oneLiner}`,
      `Feature weights recorded for it: ${weights || 'none'}.`,
      'Do not call any sub-agent or action and do not train anything. Give me the summary you give after a build',
      '(your "Report" step): what it predicts, how good it is with the metric explained, and which features it weighted most.',
    ].join('\n');
  }

  /**
   * The names the builder gives `plan`'s pipelines: the plan name, and `<name> (<algorithm>)` per experiment when the
   * plan proposes more than one (`ModelingPlanToPipelineConfig`). Empty when the plan has no name (the gates name all).
   */
  public static BuilderPipelineNames(plan: ModelingPlanSpec): string[] {
    const custom = (plan.Name || '').trim();
    if (!custom) return [];
    const max = HarnessAgent.maxPipelineNameLength;
    const base = custom.length <= max ? custom : `${custom.slice(0, max - 3)}…`;
    const experiments = plan.ProposedExperiments || [];
    if (experiments.length <= 1) return [base];
    return [base, ...experiments.map((e) => `${base} (${e.AlgorithmName.trim()})`)];
  }

  /**
   * The IDs of the `MJ: ML Training Pipelines` rows with exactly these names (never a pattern). Run after an agent run,
   * and again by `RunFixtures.CleanupRun`, so pipelines an agent run created after the client call returned are found.
   */
  public static async PipelineIDsNamed(provider: IMetadataProvider, user: UserInfo, names: readonly string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const res = await RunView.FromMetadataProvider(provider).RunView<{ ID: string }>(
      {
        EntityName: 'MJ: ML Training Pipelines',
        ExtraFilter: `Name IN (${names.map((n) => `'${EscapeSQLString(n)}'`).join(',')})`,
        Fields: ['ID'],
        BypassCache: true,
      },
      user,
    );
    if (!res.Success) throw new Error(`read the pipelines named ${names.join(', ')}: ${res.ErrorMessage}`);
    return res.Results.map((p) => p.ID);
  }

  /** The `MJ: AI Agents` row named `name`, as the agent entity `RunAIAgent` takes. */
  private static async loadAgent(ctx: RunContext, name: string): Promise<MJAIAgentEntityExtended> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentEntityExtended>(
      {
        EntityName: 'MJ: AI Agents',
        ExtraFilter: `Name='${EscapeSQLString(name)}'`,
        ResultType: 'entity_object',
        MaxRows: 1,
        SkipTotalRowCount: true,
      },
      ctx.User,
    );
    if (!res.Success) throw new Error(`read the '${name}' agent: ${res.ErrorMessage}`);
    const agent = res.Results[0];
    if (!agent) throw new Error(`'${name}' is not in the agent metadata`);
    return agent;
  }
}
