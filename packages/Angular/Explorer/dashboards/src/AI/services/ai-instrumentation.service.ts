import { Injectable } from '@angular/core';
import { BehaviorSubject, from, combineLatest } from 'rxjs';
import { switchMap, shareReplay, tap, map } from 'rxjs/operators';
import { RunView, RunQuery, Metadata, IMetadataProvider, IRunQueryProvider } from '@memberjunction/core';
import { AIUsageCoverage, AIUsageHourlyRow } from './ai-usage-analytics.types';
import {
  DashboardKPIs,
  TrendData,
  LiveExecution,
  computeKPIs,
  computeTrends,
  computeLiveExecutions,
  computeCostByModel,
  computePerformanceMatrix,
  computeTokenEfficiency,
  countActiveExecutions
} from './ai-usage-analytics.compute';

export {
  DashboardKPIs,
  TrendData,
  LiveExecution,
  AIUsageCoverage,
  AIUsageHourlyRow
};

/**
 * Lightweight record types for live run monitoring and execution drill-down.
 * We use ResultType: 'simple' with explicit Fields and MaxRows bounds
 * to avoid unbounded reads and large payload transfers.
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
  TokensCacheRead: number | null;
  TokensCacheWrite: number | null;
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

/** Fields to request for prompt runs — only what is needed for drilldown and live monitoring */
export const PROMPT_RUN_FIELDS = [
  'ID', 'RunAt', 'CompletedAt', 'Success', 'Cost', 'TokensUsed',
  'TokensPrompt', 'TokensCompletion', 'TokensCacheRead', 'TokensCacheWrite', 'ExecutionTimeMS',
  'ModelID', 'Model', 'AgentID', 'Agent', 'Prompt', 'ErrorMessage'
];

/** Fields to request for agent runs — only what is needed for drilldown and live monitoring */
export const AGENT_RUN_FIELDS = [
  'ID', 'StartedAt', 'CompletedAt', 'Status', 'Success',
  'TotalCost', 'TotalTokensUsed', 'AgentID', 'Agent', 'ErrorMessage'
];

export interface ExecutionDetails {
  id: string;
  type: 'prompt' | 'agent';
  name: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  cost: number | null;
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
  costByModel: { model: string; cost: number | null; tokens: number }[];
  performanceMatrix: { agent: string; model: string; avgTime: number; successRate: number }[];
  tokenEfficiency: { inputTokens: number; outputTokens: number; cost: number | null; model: string }[];
}

/** Internal shape for the single data load that all derived streams share */
interface DashboardRawData {
  hourlyRows: AIUsageHourlyRow[];
  livePromptRuns: PromptRunRecord[];
  liveAgentRuns: AgentRunRecord[];
  modelNames: Map<string, string>;
  agentNames: Map<string, string>;
  start: Date;
  end: Date;
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
    if (this._provider) {
      return this._provider;
    }
    return Metadata.Provider;
  }

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider;
  }

  public get RunQueryToUse(): IRunQueryProvider {
    return <IRunQueryProvider><any>this.ProviderToUse;
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
   * Single data load: fetches aggregated hourly facts via RunQuery and
   * live runs via bounded RunViews once per refresh or date-range change.
   */
  private readonly rawData$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadAllData())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  // Derived streams — pure in-memory transforms via ai-usage-analytics.compute.ts
  readonly kpis$ = this.rawData$.pipe(
    map(data => {
      const activeExecutions = countActiveExecutions(data.livePromptRuns, data.liveAgentRuns);
      return computeKPIs(data.hourlyRows, activeExecutions, data.modelNames, data.agentNames);
    }),
    shareReplay(1)
  );

  readonly trends$ = this.rawData$.pipe(
    map(data => computeTrends(data.hourlyRows, data.start, data.end)),
    shareReplay(1)
  );

  readonly liveExecutions$ = this.rawData$.pipe(
    map(data => computeLiveExecutions(data.livePromptRuns, data.liveAgentRuns)),
    shareReplay(1)
  );

  readonly chartData$ = combineLatest([this.rawData$, this.trends$]).pipe(
    map(([data, executionTrends]) => ({
      executionTrends,
      costByModel: computeCostByModel(data.hourlyRows, data.modelNames),
      performanceMatrix: computePerformanceMatrix(data.hourlyRows, data.modelNames, data.agentNames),
      tokenEfficiency: computeTokenEfficiency(data.hourlyRows, data.modelNames)
    })),
    shareReplay(1)
  );

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  refresh(): void {
    const nextVal = this._refreshTrigger$.value + 1;
    this._refreshTrigger$.next(nextVal);
  }

  /**
   * Single batch query that loads all data needed by every dashboard widget.
   * AIUsageHourly runs through RunQuery (Materialized).
   * Live runs and dimension names are loaded with explicit MaxRows bounds.
   */
  private async loadAllData(): Promise<DashboardRawData> {
    const { start, end } = this._dateRange$.value;
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000);

    const rq = new RunQuery(this.RunQueryToUse);
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);

    const [queryResult, rvResults] = await Promise.all([
      rq.RunQuery({
        QueryName: 'AIUsageHourly',
        CategoryPath: '/MJ/AI/',
        Parameters: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        DataSource: 'Materialized'
      }),
      rv.RunViews<PromptRunRecord | AgentRunRecord | { ID: string; Name: string }>([
        {
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: `RunAt >= '${recentTime.toISOString()}'`,
          OrderBy: 'RunAt DESC',
          Fields: PROMPT_RUN_FIELDS,
          ResultType: 'simple',
          MaxRows: 50
        },
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `StartedAt >= '${recentTime.toISOString()}'`,
          OrderBy: 'StartedAt DESC',
          Fields: AGENT_RUN_FIELDS,
          ResultType: 'simple',
          MaxRows: 50
        },
        {
          EntityName: 'MJ: AI Models',
          Fields: ['ID', 'Name'],
          ResultType: 'simple',
          MaxRows: 500
        },
        {
          EntityName: 'MJ: AI Agents',
          Fields: ['ID', 'Name'],
          ResultType: 'simple',
          MaxRows: 500
        }
      ])
    ]);

    const hourlyRows = (queryResult && queryResult.Success && Array.isArray(queryResult.Results)
      ? queryResult.Results
      : []) as AIUsageHourlyRow[];

    const livePromptRuns = (rvResults && rvResults[0] && Array.isArray(rvResults[0].Results)
      ? rvResults[0].Results
      : []) as PromptRunRecord[];

    const liveAgentRuns = (rvResults && rvResults[1] && Array.isArray(rvResults[1].Results)
      ? rvResults[1].Results
      : []) as AgentRunRecord[];

    const modelNames = new Map<string, string>();
    if (rvResults && rvResults[2] && Array.isArray(rvResults[2].Results)) {
      for (const m of rvResults[2].Results as { ID: string; Name: string }[]) {
        if (m && m.ID && m.Name) {
          modelNames.set(m.ID, m.Name);
        }
      }
    }

    const agentNames = new Map<string, string>();
    if (rvResults && rvResults[3] && Array.isArray(rvResults[3].Results)) {
      for (const a of rvResults[3].Results as { ID: string; Name: string }[]) {
        if (a && a.ID && a.Name) {
          agentNames.set(a.ID, a.Name);
        }
      }
    }

    return {
      hourlyRows,
      livePromptRuns,
      liveAgentRuns,
      modelNames,
      agentNames,
      start,
      end
    };
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
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [result, childrenResult] = await rv.RunViews<PromptRunRecord>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID = '${promptRunId}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple',
        MaxRows: 1
      },
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ParentID = '${promptRunId}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple',
        MaxRows: 100
      }
    ]);

    const run = result && result.Results && result.Results.length > 0 ? result.Results[0] : null;
    if (!run) throw new Error('Prompt run not found');

    const childrenList = childrenResult && Array.isArray(childrenResult.Results) ? childrenResult.Results : [];
    const children = await Promise.all(
      childrenList.map(child => this.getPromptExecutionDetails(child.ID))
    );

    const costVal = run.Cost !== null && run.Cost !== undefined ? run.Cost : null;
    const tokensVal = typeof run.TokensUsed === 'number' ? run.TokensUsed : 0;
    const promptName = run.Prompt ? run.Prompt : 'Unnamed Prompt';
    const statusStr = run.Success ? 'completed' : 'failed';
    const errMsg = run.ErrorMessage ? run.ErrorMessage : undefined;
    const modelStr = run.Model ? run.Model : undefined;

    return {
      id: run.ID,
      type: 'prompt',
      name: promptName,
      status: statusStr,
      startTime: new Date(run.RunAt),
      endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
      cost: costVal,
      tokens: tokensVal,
      success: run.Success ? true : false,
      errorMessage: errMsg,
      children,
      model: modelStr
    };
  }

  private async getAgentExecutionDetails(agentRunId: string): Promise<ExecutionDetails> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [result, childrenResult] = await rv.RunViews<AgentRunRecord>([
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID = '${agentRunId}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple',
        MaxRows: 1
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID = '${agentRunId}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple',
        MaxRows: 100
      }
    ]);

    const run = result && result.Results && result.Results.length > 0 ? result.Results[0] : null;
    if (!run) throw new Error('Agent run not found');

    const childrenList = childrenResult && Array.isArray(childrenResult.Results) ? childrenResult.Results : [];
    const children = await Promise.all(
      childrenList.map(child => this.getAgentExecutionDetails(child.ID))
    );

    const costVal = run.TotalCost !== null && run.TotalCost !== undefined ? run.TotalCost : null;
    const tokensVal = typeof run.TotalTokensUsed === 'number' ? run.TotalTokensUsed : 0;
    const agentName = run.Agent ? run.Agent : 'Unnamed Agent';
    const statusStr = run.Status ? run.Status.toLowerCase() : 'unknown';
    const errMsg = run.ErrorMessage ? run.ErrorMessage : undefined;

    return {
      id: run.ID,
      type: 'agent',
      name: agentName,
      status: statusStr,
      startTime: new Date(run.StartedAt),
      endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
      cost: costVal,
      tokens: tokensVal,
      success: run.Success ? true : false,
      errorMessage: errMsg,
      parentId: undefined,
      children
    };
  }
}
