import { Injectable } from '@angular/core';
import { BehaviorSubject, from, combineLatest } from 'rxjs';
import { switchMap, shareReplay, tap, map } from 'rxjs/operators';
import { RunView, Metadata, IMetadataProvider } from '@memberjunction/core';

/**
 * Lightweight record types for dashboard aggregation.
 * We use ResultType: 'simple' with explicit Fields to avoid pulling
 * large text columns (InputData, OutputData, etc.) that can blow up
 * the GraphQL response beyond V8's string limit.
 */
export interface PromptRunRecord {
  ID: string;
  RunAt: string;
  CompletedAt: string | null;
  Success: boolean;
  Cost: number | null;
  TokensUsed: number | null;
  TokensPrompt: number | null;
  TokensCompletion: number | null;
  ExecutionTimeMS: number | null;
  ModelID: string | null;
  Model: string | null;
  AgentID: string | null;
  Agent: string | null;
  Prompt: string | null;
  ErrorMessage: string | null;
}

export interface AgentRunRecord {
  ID: string;
  StartedAt: string;
  CompletedAt: string | null;
  Status: string;
  Success: boolean;
  TotalCost: number | null;
  TotalTokensUsed: number | null;
  AgentID: string | null;
  Agent: string | null;
  ErrorMessage: string | null;
}

/** Fields to request for prompt runs — only what the dashboard needs for aggregation */
const PROMPT_RUN_FIELDS = [
  'ID', 'RunAt', 'CompletedAt', 'Success', 'Cost', 'TokensUsed',
  'TokensPrompt', 'TokensCompletion', 'ExecutionTimeMS',
  'ModelID', 'Model', 'AgentID', 'Agent', 'Prompt', 'ErrorMessage'
];

/** Fields to request for agent runs — only what the dashboard needs for aggregation */
const AGENT_RUN_FIELDS = [
  'ID', 'StartedAt', 'CompletedAt', 'Status', 'Success',
  'TotalCost', 'TotalTokensUsed', 'AgentID', 'Agent', 'ErrorMessage'
];

export interface DashboardKPIs {
  totalExecutions: number;
  activeExecutions: number;
  totalCost: number;
  costCurrency: string;
  avgExecutionTime: number;
  successRate: number;
  totalTokens: number;
  costPerToken: number;
  topModel: string;
  topAgent: string;
  errorRate: number;
  dailyCostBurn: number;
}

export interface TrendData {
  timestamp: Date;
  executions: number;
  cost: number;
  tokens: number;
  avgTime: number;
  errors: number;
}

export interface LiveExecution {
  id: string;
  type: 'prompt' | 'agent';
  name: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  duration?: number;
  cost?: number;
  tokens?: number;
  progress?: number;
}

export interface ExecutionDetails {
  id: string;
  type: 'prompt' | 'agent';
  name: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  cost: number;
  tokens: number;
  success: boolean;
  errorMessage?: string;
  parentId?: string;
  children: ExecutionDetails[];
  model?: string;
  vendor?: string;
}

export interface ChartData {
  executionTrends: TrendData[];
  costByModel: { model: string; cost: number; tokens: number }[];
  performanceMatrix: { agent: string; model: string; avgTime: number; successRate: number }[];
  tokenEfficiency: { inputTokens: number; outputTokens: number; cost: number; model: string }[];
}

/** Internal shape for the single data load that all derived streams share */
interface DashboardRawData {
  promptRuns: PromptRunRecord[];
  agentRuns: AgentRunRecord[];
  livePromptRuns: PromptRunRecord[];
  liveAgentRuns: AgentRunRecord[];
}

@Injectable({
  providedIn: 'root'
})
export class AIInstrumentationService {
  private _provider: IMetadataProvider | null = null;

  /** Set the metadata provider this service should use. Components should call this after injection. */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date()
  });

  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);

  // Expose loading state as observable
  readonly isLoading$ = this._isLoading$.asObservable();

  constructor() {}

  /**
   * Single data load: fetches prompt runs and agent runs ONCE per refresh/date-range change.
   * All downstream streams derive from this shared dataset.
   */
  private readonly rawData$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadAllData())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  // Derived streams — pure in-memory transforms, no extra DB queries
  readonly kpis$ = this.rawData$.pipe(
    map(data => this.computeKPIs(data.promptRuns, data.agentRuns)),
    shareReplay(1)
  );

  readonly trends$ = this.rawData$.pipe(
    map(data => this.computeTrends(data.promptRuns, data.agentRuns)),
    shareReplay(1)
  );

  readonly liveExecutions$ = this.rawData$.pipe(
    map(data => this.computeLiveExecutions(data.livePromptRuns, data.liveAgentRuns)),
    shareReplay(1)
  );

  readonly chartData$ = combineLatest([this.rawData$, this.trends$]).pipe(
    map(([data, executionTrends]) => this.computeChartData(data.promptRuns, executionTrends)),
    shareReplay(1)
  );

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
  }

  /**
   * Single batch query that loads all data needed by every dashboard widget.
   * Uses ResultType: 'simple' with explicit Fields to minimize payload size.
   */
  private async loadAllData(): Promise<DashboardRawData> {
    const { start, end } = this._dateRange$.value;
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000);

    const rv = RunView.FromMetadataProvider(this.Provider);
    const [promptResults, agentResults, livePromptResults, liveAgentResults] = await rv.RunViews<PromptRunRecord | AgentRunRecord>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `RunAt >= '${start.toISOString()}' AND RunAt <= '${end.toISOString()}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `RunAt >= '${recentTime.toISOString()}'`,
        OrderBy: 'RunAt DESC',
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `StartedAt >= '${recentTime.toISOString()}'`,
        OrderBy: 'StartedAt DESC',
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple'
      }
    ]);

    return {
      promptRuns: promptResults.Results as PromptRunRecord[],
      agentRuns: agentResults.Results as AgentRunRecord[],
      livePromptRuns: livePromptResults.Results as PromptRunRecord[],
      liveAgentRuns: liveAgentResults.Results as AgentRunRecord[]
    };
  }

  // ─── KPI Computation ─────────────────────────────────────────────

  private computeKPIs(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): DashboardKPIs {
    const totalExecutions = promptRuns.length + agentRuns.length;
    const activeExecutions = this.countActiveExecutions(promptRuns, agentRuns);
    const totalCost = this.sumCosts(promptRuns, agentRuns);
    const totalTokens = this.sumTokens(promptRuns, agentRuns);
    const avgExecutionTime = this.calculateAverageExecutionTime(promptRuns, agentRuns);
    const successRate = this.calculateSuccessRate(promptRuns, agentRuns);

    return {
      totalExecutions,
      activeExecutions,
      totalCost,
      costCurrency: 'USD',
      avgExecutionTime,
      successRate,
      totalTokens,
      costPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      topModel: this.getTopModel(promptRuns),
      topAgent: this.getTopAgent(agentRuns),
      errorRate: 1 - successRate,
      dailyCostBurn: this.calculateDailyCostBurn(promptRuns, agentRuns)
    };
  }

  // ─── Trend Computation ────────────────────────────────────────────

  private computeTrends(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): TrendData[] {
    const { start, end } = this._dateRange$.value;
    const bucketSizeMs = this.getBucketSizeMs(start, end);
    const hourlyBuckets = this.createHourlyBuckets(start, end);

    return hourlyBuckets.map(bucket => {
      const bucketEnd = new Date(bucket.getTime() + bucketSizeMs);
      const bucketPrompts = promptRuns.filter(r => {
        const runAt = new Date(r.RunAt);
        return runAt >= bucket && runAt < bucketEnd;
      });
      const bucketAgents = agentRuns.filter(r => {
        const startedAt = new Date(r.StartedAt);
        return startedAt >= bucket && startedAt < bucketEnd;
      });

      return {
        timestamp: bucket,
        executions: bucketPrompts.length + bucketAgents.length,
        cost: this.sumCosts(bucketPrompts, bucketAgents),
        tokens: this.sumTokens(bucketPrompts, bucketAgents),
        avgTime: this.calculateAverageExecutionTime(bucketPrompts, bucketAgents),
        errors: this.countErrors(bucketPrompts, bucketAgents)
      };
    });
  }

  // ─── Live Executions Computation ──────────────────────────────────

  private computeLiveExecutions(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): LiveExecution[] {
    const now = new Date();
    const liveExecutions: LiveExecution[] = [];

    for (const run of promptRuns) {
      const isRunning = !run.CompletedAt && run.Success !== false;
      const duration = run.CompletedAt
        ? new Date(run.CompletedAt).getTime() - new Date(run.RunAt).getTime()
        : now.getTime() - new Date(run.RunAt).getTime();

      liveExecutions.push({
        id: run.ID,
        type: 'prompt',
        name: run.Prompt || 'Unnamed Prompt',
        status: isRunning ? 'running' : (run.Success ? 'completed' : 'failed'),
        startTime: new Date(run.RunAt),
        duration,
        cost: run.Cost || 0,
        tokens: run.TokensUsed || 0,
        progress: isRunning ? Math.min(90, (duration / 30000) * 100) : 100
      });
    }

    for (const run of agentRuns) {
      const isRunning = run.Status === 'Running';
      const duration = run.CompletedAt
        ? new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime()
        : now.getTime() - new Date(run.StartedAt).getTime();

      liveExecutions.push({
        id: run.ID,
        type: 'agent',
        name: run.Agent || 'Unnamed Agent',
        status: run.Status.toLowerCase() as 'running' | 'completed' | 'failed',
        startTime: new Date(run.StartedAt),
        duration,
        cost: run.TotalCost || 0,
        tokens: run.TotalTokensUsed || 0,
        progress: isRunning ? Math.min(90, (duration / 60000) * 100) : 100
      });
    }

    return liveExecutions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  // ─── Chart Data Computation ───────────────────────────────────────

  private computeChartData(promptRuns: PromptRunRecord[], executionTrends: TrendData[]): ChartData {
    return {
      executionTrends,
      costByModel: this.analyzeCostByModel(promptRuns),
      performanceMatrix: this.analyzePerformanceMatrix(promptRuns),
      tokenEfficiency: this.analyzeTokenEfficiency(promptRuns)
    };
  }

  // ─── Helper Methods ───────────────────────────────────────────────

  private countActiveExecutions(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const activePrompts = promptRuns.filter(r => !r.CompletedAt && r.Success !== false).length;
    const activeAgents = agentRuns.filter(r => r.Status === 'Running').length;
    return activePrompts + activeAgents;
  }

  private sumCosts(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const promptCost = promptRuns.reduce((sum, r) => sum + (r.Cost || 0), 0);
    const agentCost = agentRuns.reduce((sum, r) => sum + (r.TotalCost || 0), 0);
    return promptCost + agentCost;
  }

  private sumTokens(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const promptTokens = promptRuns.reduce((sum, r) => sum + (r.TokensUsed || 0), 0);
    const agentTokens = agentRuns.reduce((sum, r) => sum + (r.TotalTokensUsed || 0), 0);
    return promptTokens + agentTokens;
  }

  private calculateAverageExecutionTime(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const promptTimes = promptRuns
      .filter(r => r.ExecutionTimeMS)
      .map(r => r.ExecutionTimeMS!);

    const agentTimes = agentRuns
      .filter(r => r.StartedAt && r.CompletedAt)
      .map(r => new Date(r.CompletedAt!).getTime() - new Date(r.StartedAt).getTime());

    const allTimes = [...promptTimes, ...agentTimes];
    return allTimes.length > 0 ? allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length : 0;
  }

  private calculateSuccessRate(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const totalExecutions = promptRuns.length + agentRuns.length;
    if (totalExecutions === 0) return 1;

    const successfulPrompts = promptRuns.filter(r => r.Success).length;
    const successfulAgents = agentRuns.filter(r => r.Success).length;

    return (successfulPrompts + successfulAgents) / totalExecutions;
  }

  private countErrors(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const promptErrors = promptRuns.filter(r => !r.Success).length;
    const agentErrors = agentRuns.filter(r => !r.Success).length;
    return promptErrors + agentErrors;
  }

  private calculateDailyCostBurn(promptRuns: PromptRunRecord[], agentRuns: AgentRunRecord[]): number {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayPrompts = promptRuns.filter(r => new Date(r.RunAt) >= dayStart);
    const todayAgents = agentRuns.filter(r => new Date(r.StartedAt) >= dayStart);

    return this.sumCosts(todayPrompts, todayAgents);
  }

  private getBucketSizeMs(start: Date, end: Date): number {
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (hours <= 24) return 60 * 60 * 1000;        // 1 hour
    if (hours <= 24 * 7) return 4 * 60 * 60 * 1000; // 4 hours
    return 24 * 60 * 60 * 1000;                      // 24 hours
  }

  private createHourlyBuckets(start: Date, end: Date): Date[] {
    const buckets: Date[] = [];
    const current = new Date(start);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    let bucketSize: number;
    if (hours <= 24) {
      bucketSize = 1;
      current.setMinutes(0, 0, 0);
    } else if (hours <= 24 * 7) {
      bucketSize = 4;
      current.setHours(Math.floor(current.getHours() / 4) * 4, 0, 0, 0);
    } else {
      bucketSize = 24;
      current.setHours(0, 0, 0, 0);
    }

    while (current < end) {
      buckets.push(new Date(current));
      current.setHours(current.getHours() + bucketSize);
    }

    return buckets;
  }

  private getTopModel(promptRuns: PromptRunRecord[]): string {
    const modelCounts = new Map<string, number>();
    const modelNames = new Map<string, string>();

    for (const run of promptRuns) {
      if (run.ModelID && run.Model) {
        modelCounts.set(run.ModelID, (modelCounts.get(run.ModelID) || 0) + 1);
        modelNames.set(run.ModelID, run.Model);
      }
    }

    if (modelCounts.size === 0) return 'N/A';

    const topModelId = Array.from(modelCounts.entries())
      .sort(([,a], [,b]) => b - a)[0][0];

    return modelNames.get(topModelId) || 'Unknown Model';
  }

  private getTopAgent(agentRuns: AgentRunRecord[]): string {
    const agentCounts = new Map<string, number>();
    const agentNames = new Map<string, string>();

    for (const run of agentRuns) {
      if (run.AgentID && run.Agent) {
        agentCounts.set(run.AgentID, (agentCounts.get(run.AgentID) || 0) + 1);
        agentNames.set(run.AgentID, run.Agent);
      }
    }

    if (agentCounts.size === 0) return 'N/A';

    const topAgentId = Array.from(agentCounts.entries())
      .sort(([,a], [,b]) => b - a)[0][0];

    return agentNames.get(topAgentId) || 'Unknown Agent';
  }

  private analyzeCostByModel(promptRuns: PromptRunRecord[]): { model: string; cost: number; tokens: number }[] {
    const modelStats = new Map<string, { cost: number; tokens: number; name: string }>();

    for (const run of promptRuns) {
      if (run.ModelID && run.Model) {
        const existing = modelStats.get(run.ModelID) || { cost: 0, tokens: 0, name: run.Model };
        existing.cost += run.Cost || 0;
        existing.tokens += run.TokensUsed || 0;
        modelStats.set(run.ModelID, existing);
      }
    }

    return Array.from(modelStats.values())
      .map(stats => ({ model: stats.name, cost: stats.cost, tokens: stats.tokens }))
      .sort((a, b) => b.cost - a.cost);
  }

  private analyzePerformanceMatrix(promptRuns: PromptRunRecord[]): { agent: string; model: string; avgTime: number; successRate: number }[] {
    const combinations = new Map<string, { times: number[]; successes: number; total: number; agentName: string; modelName: string }>();

    for (const run of promptRuns) {
      if (run.AgentID && run.ModelID && run.ExecutionTimeMS) {
        const key = `${run.AgentID}:${run.ModelID}`;
        const existing = combinations.get(key) || {
          times: [], successes: 0, total: 0,
          agentName: run.Agent || 'Unknown Agent',
          modelName: run.Model || 'Unknown Model'
        };

        existing.times.push(run.ExecutionTimeMS);
        existing.total += 1;
        if (run.Success) existing.successes += 1;
        combinations.set(key, existing);
      }
    }

    return Array.from(combinations.values()).map(data => ({
      agent: data.agentName,
      model: data.modelName,
      avgTime: data.times.reduce((sum, time) => sum + time, 0) / data.times.length,
      successRate: data.successes / data.total
    }));
  }

  private analyzeTokenEfficiency(promptRuns: PromptRunRecord[]): { inputTokens: number; outputTokens: number; cost: number; model: string }[] {
    const modelEfficiency = new Map<string, { input: number; output: number; cost: number; name: string }>();

    for (const run of promptRuns) {
      if (run.ModelID && run.Model && run.TokensPrompt && run.TokensCompletion) {
        const existing = modelEfficiency.get(run.ModelID) || { input: 0, output: 0, cost: 0, name: run.Model };
        existing.input += run.TokensPrompt;
        existing.output += run.TokensCompletion;
        existing.cost += run.Cost || 0;
        modelEfficiency.set(run.ModelID, existing);
      }
    }

    return Array.from(modelEfficiency.values()).map(data => ({
      inputTokens: data.input,
      outputTokens: data.output,
      cost: data.cost,
      model: data.name
    }));
  }

  // ─── Execution Details (on-demand, not part of initial load) ──────

  async getExecutionDetails(executionId: string, type: 'prompt' | 'agent'): Promise<ExecutionDetails | null> {
    try {
      if (type === 'prompt') {
        return await this.getPromptExecutionDetails(executionId);
      } else {
        return await this.getAgentExecutionDetails(executionId);
      }
    } catch (error) {
      console.error('Error loading execution details:', error);
      return null;
    }
  }

  private async getPromptExecutionDetails(promptRunId: string): Promise<ExecutionDetails> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const [result, childrenResult] = await rv.RunViews<PromptRunRecord>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID = '${promptRunId}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ParentID = '${promptRunId}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple'
      }
    ]);

    const run = result.Results[0];
    if (!run) throw new Error('Prompt run not found');

    const children = await Promise.all(
      childrenResult.Results.map(child => this.getPromptExecutionDetails(child.ID))
    );

    return {
      id: run.ID,
      type: 'prompt',
      name: run.Prompt || 'Unnamed Prompt',
      status: run.Success ? 'completed' : 'failed',
      startTime: new Date(run.RunAt),
      endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
      cost: run.Cost || 0,
      tokens: run.TokensUsed || 0,
      success: run.Success || false,
      errorMessage: run.ErrorMessage || undefined,
      children,
      model: run.Model || undefined
    };
  }

  private async getAgentExecutionDetails(agentRunId: string): Promise<ExecutionDetails> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const [result, childrenResult] = await rv.RunViews<AgentRunRecord>([
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID = '${agentRunId}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID = '${agentRunId}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple'
      }
    ]);

    const run = result.Results[0];
    if (!run) throw new Error('Agent run not found');

    const children = await Promise.all(
      childrenResult.Results.map(child => this.getAgentExecutionDetails(child.ID))
    );

    return {
      id: run.ID,
      type: 'agent',
      name: run.Agent || 'Unnamed Agent',
      status: run.Status.toLowerCase(),
      startTime: new Date(run.StartedAt),
      endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
      cost: run.TotalCost || 0,
      tokens: run.TotalTokensUsed || 0,
      success: run.Success || false,
      errorMessage: run.ErrorMessage || undefined,
      parentId: undefined,
      children
    };
  }
}
