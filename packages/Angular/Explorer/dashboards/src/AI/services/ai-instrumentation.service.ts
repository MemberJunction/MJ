import { Injectable } from '@angular/core';
import { BehaviorSubject, from, combineLatest } from 'rxjs';
import { switchMap, shareReplay, tap } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { AIPromptRunEntityExtended, AIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';

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

@Injectable({
  providedIn: 'root'
})
export class AIInstrumentationService {
  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date()
  });
  
  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);
  private readonly metadata = new Metadata();
  
  // Expose loading state as observable
  readonly isLoading$ = this._isLoading$.asObservable();

  constructor() {}

  // Main data streams - trigger on refresh or date range change
  readonly kpis$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadKPIs())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );
  
  readonly trends$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadTrends())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );
  
  readonly liveExecutions$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadLiveExecutions())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );
  
  readonly chartData$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadChartData())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );
  
  private loadingCount = 0;
  
  private checkLoadingComplete(): void {
    // Simple mechanism to track when all streams have completed
    setTimeout(() => {
      this._isLoading$.next(false);
    }, 100);
  }

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
    // No need to manually refresh - streams now react to date range changes
  }
  
  refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
  }

  private async loadKPIs(): Promise<DashboardKPIs> {
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();
    
    // Use RunViews to batch the queries
    const [promptResults, agentResults] = await rv.RunViews<any>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `RunAt >= '${start.toISOString()}' AND RunAt <= '${end.toISOString()}'` 
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'` 
      }
    ]);

    const promptRuns = promptResults.Results as AIPromptRunEntityExtended[];
    const agentRuns = agentResults.Results as AIAgentRunEntityExtended[];

    // Calculate KPIs
    const totalExecutions = promptRuns.length + agentRuns.length;
    const activeExecutions = this.countActiveExecutions(promptRuns, agentRuns);
    
    const totalCost = this.sumCosts(promptRuns, agentRuns);
    const totalTokens = this.sumTokens(promptRuns, agentRuns);
    const avgExecutionTime = this.calculateAverageExecutionTime(promptRuns, agentRuns);
    const successRate = this.calculateSuccessRate(promptRuns, agentRuns);
    const errorRate = 1 - successRate;
    
    const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;
    const dailyCostBurn = this.calculateDailyCostBurn(promptRuns, agentRuns);
    
    const topModel = await this.getTopModel(promptRuns);
    const topAgent = await this.getTopAgent(agentRuns);

    return {
      totalExecutions,
      activeExecutions,
      totalCost,
      costCurrency: 'USD',
      avgExecutionTime,
      successRate,
      totalTokens,
      costPerToken,
      topModel,
      topAgent,
      errorRate,
      dailyCostBurn
    };
  }

  private async loadTrends(): Promise<TrendData[]> {
    const { start, end } = this._dateRange$.value;
    const hourlyBuckets = this.createHourlyBuckets(start, end);
    
    // Calculate bucket size based on the number of buckets
    const duration = end.getTime() - start.getTime();
    const hours = duration / (1000 * 60 * 60);
    let bucketSizeMs: number;
    if (hours <= 24) {
      bucketSizeMs = 60 * 60 * 1000; // 1 hour
    } else if (hours <= 24 * 7) {
      bucketSizeMs = 4 * 60 * 60 * 1000; // 4 hours
    } else {
      bucketSizeMs = 24 * 60 * 60 * 1000; // 24 hours
    }
    
    // Load all data in a single query instead of per-bucket
    const rv = new RunView();
    const [promptResults, agentResults] = await rv.RunViews<any>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `RunAt >= '${start.toISOString()}' AND RunAt <= '${end.toISOString()}'` 
      },
      {
        EntityName: 'MJ: AI Agent Runs', 
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'` 
      }
    ]);

    const allPromptRuns = promptResults.Results as AIPromptRunEntityExtended[];
    const allAgentRuns = agentResults.Results as AIAgentRunEntityExtended[];
    
    // Now aggregate data into buckets on the client side
    const trends: TrendData[] = [];
    
    for (const bucket of hourlyBuckets) {
      const bucketStart = bucket;
      const bucketEnd = new Date(bucket.getTime() + bucketSizeMs);
      
      // Filter runs for this bucket
      const promptRuns = allPromptRuns.filter(r => {
        const runAt = new Date(r.RunAt);
        return runAt >= bucketStart && runAt < bucketEnd;
      });
      
      const agentRuns = allAgentRuns.filter(r => {
        const startedAt = new Date(r.StartedAt);
        return startedAt >= bucketStart && startedAt < bucketEnd;
      });

      trends.push({
        timestamp: bucket,
        executions: promptRuns.length + agentRuns.length,
        cost: this.sumCosts(promptRuns, agentRuns),
        tokens: this.sumTokens(promptRuns, agentRuns),
        avgTime: this.calculateAverageExecutionTime(promptRuns, agentRuns),
        errors: this.countErrors(promptRuns, agentRuns)
      });
    }

    return trends;
  }

  private async loadLiveExecutions(): Promise<LiveExecution[]> {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000);
    
    const rv = new RunView();
    const [promptResults, agentResults] = await rv.RunViews<any>([
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `RunAt >= '${recentTime.toISOString()}'`,
        OrderBy: 'RunAt DESC' 
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `StartedAt >= '${recentTime.toISOString()}'`,
        OrderBy: 'StartedAt DESC' 
      }
    ]);

    const promptRuns = promptResults.Results as AIPromptRunEntityExtended[];
    const agentRuns = agentResults.Results as AIAgentRunEntityExtended[];

    const liveExecutions: LiveExecution[] = [];

    // Process prompt runs - they already have the prompt name in the Prompt field
    for (const run of promptRuns) {
      const isRunning = !run.CompletedAt && run.Success !== false;
      const duration = run.CompletedAt ? 
        new Date(run.CompletedAt).getTime() - new Date(run.RunAt).getTime() : 
        now.getTime() - new Date(run.RunAt).getTime();

      liveExecutions.push({
        id: run.ID,
        type: 'prompt',
        name: run.Prompt || 'Unnamed Prompt', // Use the Prompt field directly
        status: isRunning ? 'running' : (run.Success ? 'completed' : 'failed'),
        startTime: new Date(run.RunAt),
        duration: duration,
        cost: run.Cost || 0,
        tokens: run.TokensUsed || 0,
        progress: isRunning ? Math.min(90, (duration / 30000) * 100) : 100
      });
    }

    // Process agent runs - they already have the agent name in the Agent field
    for (const run of agentRuns) {
      const isRunning = run.Status === 'Running';
      const duration = run.CompletedAt ? 
        new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime() : 
        now.getTime() - new Date(run.StartedAt).getTime();

      liveExecutions.push({
        id: run.ID,
        type: 'agent',
        name: run.Agent || 'Unnamed Agent', // Use the Agent field directly
        status: run.Status.toLowerCase() as 'running' | 'completed' | 'failed',
        startTime: new Date(run.StartedAt),
        duration: duration,
        cost: run.TotalCost || 0,
        tokens: run.TotalTokensUsed || 0,
        progress: isRunning ? Math.min(90, (duration / 60000) * 100) : 100
      });
    }

    return liveExecutions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  private async loadChartData(): Promise<ChartData> {
    const { start, end } = this._dateRange$.value;
    const dateFilter = `RunAt >= '${start.toISOString()}' AND RunAt <= '${end.toISOString()}'`;

    const promptRv = new RunView();
    const promptResults = await promptRv.RunView<AIPromptRunEntityExtended>({
      EntityName: 'MJ: AI Prompt Runs',
      ExtraFilter: dateFilter 
    });

    const promptRuns = promptResults.Results;
    const executionTrends = await this.loadTrends();
    const costByModel = await this.analyzeCostByModel(promptRuns);
    const performanceMatrix = await this.analyzePerformanceMatrix(promptRuns);
    const tokenEfficiency = await this.analyzeTokenEfficiency(promptRuns);

    return {
      executionTrends,
      costByModel,
      performanceMatrix,
      tokenEfficiency
    };
  }

  // Helper methods
  private countActiveExecutions(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const activePrompts = promptRuns.filter(r => !r.CompletedAt && r.Success !== false).length;
    const activeAgents = agentRuns.filter(r => r.Status === 'Running').length;
    return activePrompts + activeAgents;
  }

  private sumCosts(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const promptCost = promptRuns.reduce((sum, r) => sum + (r.Cost || 0), 0);
    const agentCost = agentRuns.reduce((sum, r) => sum + (r.TotalCost || 0), 0);
    return promptCost + agentCost;
  }

  private sumTokens(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const promptTokens = promptRuns.reduce((sum, r) => sum + (r.TokensUsed || 0), 0);
    const agentTokens = agentRuns.reduce((sum, r) => sum + (r.TotalTokensUsed || 0), 0);
    return promptTokens + agentTokens;
  }

  private calculateAverageExecutionTime(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const promptTimes = promptRuns
      .filter(r => r.ExecutionTimeMS)
      .map(r => r.ExecutionTimeMS!);
    
    const agentTimes = agentRuns
      .filter(r => r.StartedAt && r.CompletedAt)
      .map(r => new Date(r.CompletedAt!).getTime() - new Date(r.StartedAt).getTime());

    const allTimes = [...promptTimes, ...agentTimes];
    return allTimes.length > 0 ? allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length : 0;
  }

  private calculateSuccessRate(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const totalExecutions = promptRuns.length + agentRuns.length;
    if (totalExecutions === 0) return 1;

    const successfulPrompts = promptRuns.filter(r => r.Success).length;
    const successfulAgents = agentRuns.filter(r => r.Success).length;
    
    return (successfulPrompts + successfulAgents) / totalExecutions;
  }

  private countErrors(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const promptErrors = promptRuns.filter(r => !r.Success).length;
    const agentErrors = agentRuns.filter(r => !r.Success).length;
    return promptErrors + agentErrors;
  }

  private calculateDailyCostBurn(promptRuns: AIPromptRunEntityExtended[], agentRuns: AIAgentRunEntityExtended[]): number {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const todayPrompts = promptRuns.filter(r => new Date(r.RunAt) >= dayStart);
    const todayAgents = agentRuns.filter(r => new Date(r.StartedAt) >= dayStart);
    
    return this.sumCosts(todayPrompts, todayAgents);
  }

  private createHourlyBuckets(start: Date, end: Date): Date[] {
    const buckets: Date[] = [];
    const current = new Date(start);
    const duration = end.getTime() - start.getTime();
    const hours = duration / (1000 * 60 * 60);
    
    // Determine bucket size based on duration
    let bucketSize: number;
    if (hours <= 24) {
      // For up to 24 hours, use hourly buckets
      bucketSize = 1;
      current.setMinutes(0, 0, 0);
    } else if (hours <= 24 * 7) {
      // For up to 7 days, use 4-hour buckets
      bucketSize = 4;
      current.setHours(Math.floor(current.getHours() / 4) * 4, 0, 0, 0);
    } else {
      // For more than 7 days, use daily buckets
      bucketSize = 24;
      current.setHours(0, 0, 0, 0);
    }
    
    while (current < end) {
      buckets.push(new Date(current));
      current.setHours(current.getHours() + bucketSize);
    }
    
    return buckets;
  }



  private async getTopModel(promptRuns: AIPromptRunEntityExtended[]): Promise<string> {
    const modelCounts = new Map<string, number>();
    const modelNames = new Map<string, string>();
    
    // Count models and track their names from the Model field
    for (const run of promptRuns) {
      if (run.ModelID && run.Model) {
        const count = modelCounts.get(run.ModelID) || 0;
        modelCounts.set(run.ModelID, count + 1);
        modelNames.set(run.ModelID, run.Model);
      }
    }

    if (modelCounts.size === 0) return 'N/A';

    const topModelId = Array.from(modelCounts.entries())
      .sort(([,a], [,b]) => b - a)[0][0];

    return modelNames.get(topModelId) || 'Unknown Model';
  }

  private async getTopAgent(agentRuns: AIAgentRunEntityExtended[]): Promise<string> {
    const agentCounts = new Map<string, number>();
    const agentNames = new Map<string, string>();
    
    // Count agents and track their names from the Agent field
    for (const run of agentRuns) {
      if (run.AgentID && run.Agent) {
        const count = agentCounts.get(run.AgentID) || 0;
        agentCounts.set(run.AgentID, count + 1);
        agentNames.set(run.AgentID, run.Agent);
      }
    }

    if (agentCounts.size === 0) return 'N/A';

    const topAgentId = Array.from(agentCounts.entries())
      .sort(([,a], [,b]) => b - a)[0][0];

    return agentNames.get(topAgentId) || 'Unknown Agent';
  }

  private async analyzeCostByModel(promptRuns: AIPromptRunEntityExtended[]): Promise<{ model: string; cost: number; tokens: number }[]> {
    const modelStats = new Map<string, { cost: number; tokens: number; name: string }>();

    for (const run of promptRuns) {
      if (run.ModelID && run.Model) {
        const existing = modelStats.get(run.ModelID) || { cost: 0, tokens: 0, name: run.Model };
        existing.cost += run.Cost || 0;
        existing.tokens += run.TokensUsed || 0;
        modelStats.set(run.ModelID, existing);
      }
    }

    const results = [];
    for (const [modelId, stats] of modelStats.entries()) {
      results.push({
        model: stats.name,
        cost: stats.cost,
        tokens: stats.tokens
      });
    }

    return results.sort((a, b) => b.cost - a.cost);
  }

  private async analyzePerformanceMatrix(promptRuns: AIPromptRunEntityExtended[]): Promise<{ agent: string; model: string; avgTime: number; successRate: number }[]> {
    const combinations = new Map<string, { times: number[]; successes: number; total: number; agentName: string; modelName: string }>();

    for (const run of promptRuns) {
      if (run.AgentID && run.ModelID && run.ExecutionTimeMS) {
        const key = `${run.AgentID}:${run.ModelID}`;
        const existing = combinations.get(key) || { 
          times: [], 
          successes: 0, 
          total: 0,
          agentName: run.Agent || 'Unknown Agent',
          modelName: run.Model || 'Unknown Model'
        };
        
        existing.times.push(run.ExecutionTimeMS);
        existing.total += 1;
        if (run.Success) existing.successes += 1;
        
        combinations.set(key, existing);
      }
    }

    const results = [];
    for (const [key, data] of combinations.entries()) {
      results.push({
        agent: data.agentName,
        model: data.modelName,
        avgTime: data.times.reduce((sum, time) => sum + time, 0) / data.times.length,
        successRate: data.successes / data.total
      });
    }

    return results;
  }

  private async analyzeTokenEfficiency(promptRuns: AIPromptRunEntityExtended[]): Promise<{ inputTokens: number; outputTokens: number; cost: number; model: string }[]> {
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

    const results = [];
    for (const [modelId, data] of modelEfficiency.entries()) {
      results.push({
        inputTokens: data.input,
        outputTokens: data.output,
        cost: data.cost,
        model: data.name
      });
    }

    return results;
  }


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
    const rv = new RunView();
    const result = await rv.RunView<AIPromptRunEntityExtended>({
      EntityName: 'MJ: AI Prompt Runs',
      ExtraFilter: `ID = '${promptRunId}'` 
    });

    const run = result.Results[0];
    if (!run) throw new Error('Prompt run not found');

    const childrenResult = await rv.RunView<AIPromptRunEntityExtended>({
      EntityName: 'MJ: AI Prompt Runs',
      ExtraFilter: `ParentID = '${promptRunId}'` 
    });

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
      parentId: run.ParentID || undefined,
      children,
      model: run.Model || undefined
    };
  }

  private async getAgentExecutionDetails(agentRunId: string): Promise<ExecutionDetails> {
    const rv = new RunView();
    const result = await rv.RunView<AIAgentRunEntityExtended>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `ID = '${agentRunId}'` 
    });

    const run = result.Results[0];
    if (!run) throw new Error('Agent run not found');

    const childrenResult = await rv.RunView<AIAgentRunEntityExtended>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `ParentRunID = '${agentRunId}'` 
    });

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
      parentId: run.ParentRunID || undefined,
      children
    };
  }
}