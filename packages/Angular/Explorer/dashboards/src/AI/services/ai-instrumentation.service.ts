import { Injectable } from '@angular/core';
import { BehaviorSubject, from, combineLatest, of } from 'rxjs';
import { switchMap, shareReplay, tap, map, catchError } from 'rxjs/operators';
import { RunView, RunQuery, IMetadataProvider, IRunQueryProvider, RunViewResult } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { TOKEN_PRICE_UNIT_TYPE_DIVISORS } from '@memberjunction/ai-engine-base';
import { CacheRate } from './cache-metrics';
import { AIUsageCoverage, AIUsageHourlyRow, AIUsageDailyRow, AIUsageByModelRow, AIAgentRunSubtreeCost } from './ai-usage-analytics.types';
import {
  DashboardKPIs,
  TrendData,
  LiveExecution,
  LiveExecutionStatus,
  CostInputRow,
  ComputeTotalCost,
  ComputeKPIs,
  ComputeTrends,
  ComputeLiveExecutions,
  ComputeCostByModel,
  ComputePerformanceMatrix,
  ComputeTokenEfficiency,
  CountActiveExecutions,
  ResolveCostCurrency
} from './ai-usage-analytics.compute';

export {
  DashboardKPIs,
  TrendData,
  LiveExecution,
  LiveExecutionStatus,
  AIUsageCoverage,
  AIUsageHourlyRow,
  AIUsageDailyRow,
  AIUsageByModelRow,
  AIAgentRunSubtreeCost,
  CostInputRow,
  ComputeTotalCost,
  CacheRate
};

/**
 * True when a metadata provider can also run saved queries. At runtime MJ's providers (ProviderBase
 * subclasses) implement both interfaces, but IMetadataProvider does not extend IRunQueryProvider, so
 * this is checked rather than asserted — a provider that cannot run queries fails loudly here
 * instead of at the first RunQuery call.
 */
function IsRunQueryProvider(provider: IMetadataProvider): provider is IMetadataProvider & IRunQueryProvider {
  return 'RunQuery' in provider && typeof provider.RunQuery === 'function'
    && 'RunQueries' in provider && typeof provider.RunQueries === 'function';
}

/** How deep an execution drill-down follows child runs, and how many it will load in total. */
const EXECUTION_DETAIL_MAX_DEPTH = 4;
const EXECUTION_DETAIL_MAX_NODES = 200;

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
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  type: 'prompt' | 'agent';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  startTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  endTime?: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  cost: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  success: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  errorMessage?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  parentId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  children: ExecutionDetails[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  model?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  vendor?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface ChartData {
  executionTrends: TrendData[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  costByModel: { model: string; cost: number | null; tokens: number }[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  performanceMatrix: { agent: string; model: string; avgTime: number; successRate: number }[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokenEfficiency: { inputTokens: number; outputTokens: number; cost: number | null; model: string }[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
    throw new Error('AIInstrumentationService: MetadataProvider must be set before use');
  }

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider;
  }

  public get RunQueryToUse(): IRunQueryProvider {
    const provider = this.ProviderToUse;
    if (IsRunQueryProvider(provider)) {
      return provider;
    }
    throw new Error('AIInstrumentationService: the configured MetadataProvider cannot run queries');
  }

  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date()
  });

  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);

  // Expose loading state as observable
  readonly IsLoading$ = this._isLoading$.asObservable();

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }

  constructor() {}

  /**
   * Single data load: fetches aggregated hourly facts via RunQuery and
   * live runs via bounded RunViews once per refresh or date-range change.
   *
   * A failed load is contained INSIDE the switchMap. Left to reach shareReplay, one rejected load
   * (a transient network blip, a RunQuery 500) terminates the shared subject for the life of this
   * root-provided service: every derived stream replays the error, Refresh() and SetDateRange()
   * push into a combineLatest nobody is subscribed to any more, and IsLoading$ sticks at true.
   */
  private readonly rawData$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(([, range]) => from(this.loadAllData()).pipe(
      catchError((error: unknown) => {
        console.error('AI analytics: dashboard data failed to load; showing an empty period until the next refresh.', error);
        return of(this.emptyRawData(range.start, range.end));
      })
    )),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  // Derived streams — pure in-memory transforms via ai-usage-analytics.compute.ts
  readonly Kpis$ = this.rawData$.pipe(
    map(data => {
      const activeExecutions = CountActiveExecutions(data.livePromptRuns, data.liveAgentRuns);
      return ComputeKPIs(data.hourlyRows, activeExecutions, data.modelNames, data.agentNames);
    }),
    shareReplay(1)
  );

  /** @deprecated Use {@link Kpis$}. */
  get kpis$() {
    return this.Kpis$;
  }

  readonly Trends$ = this.rawData$.pipe(
    map(data => ComputeTrends(data.hourlyRows, data.start, data.end, ResolveCostCurrency(data.hourlyRows).Currency)),
    shareReplay(1)
  );

  /** @deprecated Use {@link Trends$}. */
  get trends$() {
    return this.Trends$;
  }

  readonly LiveExecutions$ = this.rawData$.pipe(
    map(data => ComputeLiveExecutions(data.livePromptRuns, data.liveAgentRuns)),
    shareReplay(1)
  );

  /** @deprecated Use {@link LiveExecutions$}. */
  get liveExecutions$() {
    return this.LiveExecutions$;
  }

  readonly ChartData$ = combineLatest([this.rawData$, this.Trends$]).pipe(
    map(([data, executionTrends]) => {
      // One currency for every cost on the page — the same one the KPIs report in.
      const currency = ResolveCostCurrency(data.hourlyRows).Currency;
      return {
        executionTrends,
        costByModel: ComputeCostByModel(data.hourlyRows, data.modelNames, currency),
        performanceMatrix: ComputePerformanceMatrix(data.hourlyRows, data.modelNames, data.agentNames),
        tokenEfficiency: ComputeTokenEfficiency(data.hourlyRows, data.modelNames, currency)
      };
    }),
    shareReplay(1)
  );

  /** @deprecated Use {@link ChartData$}. */
  get chartData$() {
    return this.ChartData$;
  }

  SetDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  /** @deprecated Use {@link SetDateRange}. */
  setDateRange(start: Date, end: Date): void {
    return this.SetDateRange(start, end);
  }

  Refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
  }

  /** @deprecated Use {@link Refresh}. */
  refresh(): void {
    return this.Refresh();
  }

  /**
   * Single batch query that loads all data needed by every dashboard widget.
   * AIUsageHourly runs through RunQuery.
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
        }
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

    if (!queryResult.Success) {
      // A failed aggregate read is not an empty period. Say so rather than let every KPI read zero.
      console.error(`AI analytics: AIUsageHourly failed to load; usage figures will be empty. ${queryResult.ErrorMessage}`);
    }
    const hourlyRows = (queryResult.Success && Array.isArray(queryResult.Results) ? queryResult.Results : []) as AIUsageHourlyRow[];

    const livePromptRuns = this.resultRows<PromptRunRecord>(rvResults[0], 'live prompt runs');
    const liveAgentRuns = this.resultRows<AgentRunRecord>(rvResults[1], 'live agent runs');

    const modelNames = new Map<string, string>();
    for (const m of this.resultRows<{ ID: string; Name: string }>(rvResults[2], 'model names')) {
      if (m && m.ID && m.Name) {
        modelNames.set(m.ID, m.Name);
      }
    }

    const agentNames = new Map<string, string>();
    for (const a of this.resultRows<{ ID: string; Name: string }>(rvResults[3], 'agent names')) {
      if (a && a.ID && a.Name) {
        agentNames.set(a.ID, a.Name);
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

  /** The payload a failed load degrades to: an empty period over the requested range. */
  private emptyRawData(start: Date, end: Date): DashboardRawData {
    return {
      hourlyRows: [],
      livePromptRuns: [],
      liveAgentRuns: [],
      modelNames: new Map<string, string>(),
      agentNames: new Map<string, string>(),
      start,
      end
    };
  }

  /**
   * The rows of a RunView result, logging when the view FAILED. A failed view and an empty one both
   * yield no rows, but only the empty one means "nothing there" — without the log, a failure reads
   * as a confident zero on whatever figure the rows feed.
   */
  private resultRows<T>(result: RunViewResult<unknown> | undefined, what: string): T[] {
    if (!result) {
      console.error(`AI analytics: no result returned for ${what}`);
      return [];
    }
    if (!result.Success) {
      console.error(`AI analytics: ${what} failed to load. ${result.ErrorMessage}`);
      return [];
    }
    return (Array.isArray(result.Results) ? result.Results : []) as T[];
  }

  // ─── Execution Details (on-demand, not part of initial load) ──────

  async GetExecutionDetails(executionId: string, type: 'prompt' | 'agent'): Promise<ExecutionDetails | null> {
    try {
      const budget = { visited: new Set<string>(), remaining: EXECUTION_DETAIL_MAX_NODES };
      if (type === 'prompt') {
        return await this.getPromptExecutionDetails(executionId, 0, budget);
      } else {
        return await this.getAgentExecutionDetails(executionId, 0, budget);
      }
    } catch (error) {
      console.error('Error loading execution details:', error);
      return null;
    }
  }

  /** @deprecated Use {@link GetExecutionDetails}. */
  async getExecutionDetails(executionId: string, type: 'prompt' | 'agent'): Promise<ExecutionDetails | null> {
    return this.GetExecutionDetails(executionId, type);
  }

  /**
   * Claims a node for the drill-down: false when it was already visited (a ParentID cycle) or the
   * total node budget is spent. Bounded because each node costs a RunViews round trip and children
   * fan out — an uncapped 3-level tree of 20 children each is thousands of requests from one click.
   */
  private claimDetailNode(id: string, budget: { visited: Set<string>; remaining: number }): boolean {
    const key = NormalizeUUID(id);
    if (budget.visited.has(key) || budget.remaining <= 0) {
      return false;
    }
    budget.visited.add(key);
    budget.remaining--;
    return true;
  }

  private async getPromptExecutionDetails(
    promptRunId: string,
    depth: number,
    budget: { visited: Set<string>; remaining: number }
  ): Promise<ExecutionDetails> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const loadChildren = depth < EXECUTION_DETAIL_MAX_DEPTH;
    const [result, childrenResult] = await rv.RunViews<PromptRunRecord>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID = '${promptRunId}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple',
        MaxRows: 1
      },
      ...(loadChildren ? [{
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ParentID = '${promptRunId}'`,
        Fields: PROMPT_RUN_FIELDS,
        ResultType: 'simple' as const,
        MaxRows: 100
      }] : [])
    ]);

    const run = this.resultRows<PromptRunRecord>(result, 'prompt run detail')[0];
    if (!run) throw new Error('Prompt run not found');

    const childrenList = loadChildren ? this.resultRows<PromptRunRecord>(childrenResult, 'prompt run children') : [];
    const children = await Promise.all(
      childrenList
        .filter(child => this.claimDetailNode(child.ID, budget))
        .map(child => this.getPromptExecutionDetails(child.ID, depth + 1, budget))
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

  private async getAgentExecutionDetails(
    agentRunId: string,
    depth: number,
    budget: { visited: Set<string>; remaining: number }
  ): Promise<ExecutionDetails> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const loadChildren = depth < EXECUTION_DETAIL_MAX_DEPTH;
    const [result, childrenResult] = await rv.RunViews<AgentRunRecord>([
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID = '${agentRunId}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple',
        MaxRows: 1
      },
      ...(loadChildren ? [{
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID = '${agentRunId}'`,
        Fields: AGENT_RUN_FIELDS,
        ResultType: 'simple' as const,
        MaxRows: 100
      }] : [])
    ]);

    const run = this.resultRows<AgentRunRecord>(result, 'agent run detail')[0];
    if (!run) throw new Error('Agent run not found');

    const childrenList = loadChildren ? this.resultRows<AgentRunRecord>(childrenResult, 'agent run children') : [];
    const children = await Promise.all(
      childrenList
        .filter(child => this.claimDetailNode(child.ID, budget))
        .map(child => this.getAgentExecutionDetails(child.ID, depth + 1, budget))
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

  /**
   * Runs one of the AI usage aggregate queries, logging a failure rather than letting it read as an
   * empty (zero-usage) period.
   */
  private async runUsageQuery<T>(queryName: string, start: Date, end: Date): Promise<T[]> {
    const rq = new RunQuery(this.RunQueryToUse);
    const res = await rq.RunQuery({
      QueryName: queryName,
      CategoryPath: '/MJ/AI/',
      Parameters: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });
    if (!res.Success) {
      console.error(`AI analytics: ${queryName} failed to load. ${res.ErrorMessage}`);
      return [];
    }
    return (Array.isArray(res.Results) ? res.Results : []) as T[];
  }

  /**
   * Fetch hourly aggregate usage for a date range via stored query AIUsageHourly.
   */
  async GetUsageHourly(start: Date, end: Date): Promise<AIUsageHourlyRow[]> {
    return this.runUsageQuery<AIUsageHourlyRow>('AIUsageHourly', start, end);
  }

  /**
   * Fetch daily aggregate usage for a date range via stored query AIUsageDaily.
   */
  async GetUsageDaily(start: Date, end: Date): Promise<AIUsageDailyRow[]> {
    return this.runUsageQuery<AIUsageDailyRow>('AIUsageDaily', start, end);
  }

  /**
   * Fetch model-level aggregate usage for a date range via stored query AIUsageByModel.
   */
  async GetUsageByModel(start: Date, end: Date): Promise<AIUsageByModelRow[]> {
    return this.runUsageQuery<AIUsageByModelRow>('AIUsageByModel', start, end);
  }

  /**
   * Calculate recursive subtree cost and token metrics for an agent run via CalculateRunCost.
   */
  async CalculateAgentRunCost(agentRunId: string): Promise<AIAgentRunSubtreeCost | null> {
    const rq = new RunQuery(this.RunQueryToUse);
    const res = await rq.RunQuery({
      QueryName: 'CalculateRunCost',
      CategoryPath: '/MJ/AI/Agents/',
      Parameters: {
        AIAgentRunID: agentRunId,
        AgentRunID: agentRunId
      }
    });
    if (!res.Success) {
      console.error(`AI analytics: CalculateRunCost failed for agent run ${agentRunId}. ${res.ErrorMessage}`);
      return null;
    }
    if (Array.isArray(res.Results) && res.Results.length > 0) {
      const raw = res.Results[0] as AIAgentRunSubtreeCost;
      const cost = raw.TotalCost !== null && raw.TotalCost !== undefined ? Number(raw.TotalCost) : null;
      const toFiniteNum = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      return {
        AgentRunID: raw.AgentRunID,
        TotalCost: cost,
        TotalPrompts: toFiniteNum(raw.TotalPrompts),
        TotalTokensInput: toFiniteNum(raw.TotalTokensInput),
        TotalTokensOutput: toFiniteNum(raw.TotalTokensOutput),
        TotalTokens: toFiniteNum(raw.TotalTokens)
      };
    }
    return null;
  }

  /**
   * Fetch model and vendor lookups for mapping IDs to display names.
   */
  async GetModelAndVendorLookups(): Promise<{
    models: Map<string, string>;
    modelVendors: Map<string, string>;
    vendors: Map<string, string>;
    agents: Map<string, string>;
  }> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [modelsRes, vendorsRes, agentsRes] = await rv.RunViews([
      {
        EntityName: 'MJ: AI Models',
        Fields: ['ID', 'Name', 'VendorID'],
        MaxRows: 500,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Vendors',
        Fields: ['ID', 'Name'],
        MaxRows: 500,
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Agents',
        Fields: ['ID', 'Name'],
        MaxRows: 500,
        ResultType: 'simple'
      }
    ]);
    const models = new Map<string, string>();
    const modelVendors = new Map<string, string>();
    const vendors = new Map<string, string>();
    const agents = new Map<string, string>();

    for (const m of this.resultRows<{ ID: string; Name: string; VendorID?: string | null }>(modelsRes, 'model names')) {
      if (m.ID) {
        models.set(m.ID.toLowerCase(), m.Name);
        if (m.VendorID) {
          modelVendors.set(m.ID.toLowerCase(), m.VendorID);
        }
      }
    }
    for (const v of this.resultRows<{ ID: string; Name: string }>(vendorsRes, 'vendor names')) {
      if (v.ID) {
        vendors.set(v.ID.toLowerCase(), v.Name);
      }
    }
    for (const a of this.resultRows<{ ID: string; Name: string }>(agentsRes, 'agent names')) {
      if (a.ID) {
        agents.set(a.ID.toLowerCase(), a.Name);
      }
    }
    return { models, modelVendors, vendors, agents };
  }

  /**
   * Fetch active realtime model pricing rates and compute currency-per-token divisors.
   */
  async GetCacheRates(): Promise<Map<string, CacheRate>> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [rateResult, unitTypeResult] = await rv.RunViews([
      {
        EntityName: 'MJ: AI Model Costs',
        ExtraFilter: `Status='Active' AND ProcessingType='Realtime'`,
        Fields: ['ModelID', 'VendorID', 'InputPricePerUnit', 'OutputPricePerUnit', 'CacheReadPricePerUnit', 'CacheWritePricePerUnit', 'UnitTypeID'],
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: AI Model Price Unit Types',
        Fields: ['ID', 'DriverClass'],
        ResultType: 'simple'
      }
    ]);

    // A failed unit-type view is NOT the same as "these rows are unpriceable". Without the driver
    // classes every rate row falls into the `continue` below, and cache savings render as a
    // confident 0 instead of an error — the figure most likely to be believed. Say so rather than
    // let the empty map speak for it.
    if (unitTypeResult && !unitTypeResult.Success) {
      console.error('AI analytics: price unit types failed to load; cache-savings figures will read 0. ' +
        unitTypeResult.ErrorMessage);
    }

    const cacheRates = new Map<string, CacheRate>();
    const unitTypes = this.resultRows<{ ID: string; DriverClass: string | null }>(unitTypeResult, 'price unit types');
    const driverClassByUnitType = new Map<string, string>(
      unitTypes.filter(u => u.DriverClass).map(u => [NormalizeUUID(u.ID), u.DriverClass!])
    );
    const rows = this.resultRows<{
      ModelID: string | null;
      VendorID: string | null;
      InputPricePerUnit: number | null;
      OutputPricePerUnit: number | null;
      CacheReadPricePerUnit: number | null;
      CacheWritePricePerUnit: number | null;
      UnitTypeID: string | null;
    }>(rateResult, 'model cost rates');

    for (const row of rows) {
      const unitTypeId = row.UnitTypeID !== null && row.UnitTypeID !== undefined ? row.UnitTypeID : '';
      const driverClass = driverClassByUnitType.get(NormalizeUUID(unitTypeId));
      const divisor = driverClass ? TOKEN_PRICE_UNIT_TYPE_DIVISORS[driverClass] : undefined;
      if (divisor === undefined) {
        continue;
      }
      const inputP = typeof row.InputPricePerUnit === 'number' ? row.InputPricePerUnit : 0;
      const readP = typeof row.CacheReadPricePerUnit === 'number' ? row.CacheReadPricePerUnit : inputP;
      const writeP = typeof row.CacheWritePricePerUnit === 'number' ? row.CacheWritePricePerUnit : inputP;
      const inputRate = inputP / divisor;
      const cacheReadRate = readP / divisor;
      const cacheWriteRate = writeP / divisor;
      const modelId = row.ModelID !== null && row.ModelID !== undefined ? row.ModelID : '';
      const vendorId = row.VendorID !== null && row.VendorID !== undefined ? row.VendorID : '';
      const key = `${NormalizeUUID(modelId)}|${NormalizeUUID(vendorId)}`;
      cacheRates.set(key, { InputRate: inputRate, CacheReadRate: cacheReadRate, CacheWriteRate: cacheWriteRate });
    }
    return cacheRates;
  }
}
