import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest, interval as rxInterval } from 'rxjs';
import { map, switchMap, startWith, shareReplay } from 'rxjs/operators';
import { RunView } from '@memberjunction/core';
import { AIPromptRunEntity, AIAgentRunEntity, AIAgentRunStepEntity, AIModelEntity, AIAgentEntity, AIPromptEntity } from '@memberjunction/core-entities';

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
  private readonly _refreshInterval$ = new BehaviorSubject<number>(30000); // 30 seconds default
  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date()
  });

  constructor() {}

  // Main data streams
  readonly kpis$ = this.createRefreshableStream(() => this.loadKPIs());
  readonly trends$ = this.createRefreshableStream(() => this.loadTrends());
  readonly liveExecutions$ = this.createRefreshableStream(() => this.loadLiveExecutions());
  readonly chartData$ = this.createRefreshableStream(() => this.loadChartData());

  setRefreshInterval(intervalMs: number): void {
    this._refreshInterval$.next(intervalMs);
  }

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  private createRefreshableStream<T>(loadFn: () => Promise<T>): Observable<T> {
    return combineLatest([
      this._refreshInterval$,
      this._dateRange$
    ]).pipe(
      switchMap(([interval]) => 
        interval > 0 
          ? rxInterval(interval).pipe(startWith(0))
          : [0]
      ),
      switchMap(() => loadFn()),
      shareReplay(1)
    );
  }

  private async loadKPIs(): Promise<DashboardKPIs> {
    const { start, end } = this._dateRange$.value;
    const dateFilter = `RunAt >= '${start.toISOString()}' AND RunAt <= '${end.toISOString()}'`;

    // Load prompt executions
    const promptRv = new RunView();
    const promptResults = await promptRv.RunView<AIPromptRunEntity>({
      EntityName: 'AI Prompt Runs',
      ExtraFilter: dateFilter,
      ResultType: 'entity_object'
    });

    // Load agent executions  
    const agentRv = new RunView();
    const agentResults = await agentRv.RunView<AIAgentRunEntity>({
      EntityName: 'AI Agent Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      ResultType: 'entity_object'
    });

    const promptRuns = promptResults.Results;
    const agentRuns = agentResults.Results;

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
    
    const trends: TrendData[] = [];
    
    for (const bucket of hourlyBuckets) {
      const bucketStart = bucket;
      const bucketEnd = new Date(bucket.getTime() + 60 * 60 * 1000);
      
      const promptFilter = `RunAt >= '${bucketStart.toISOString()}' AND RunAt < '${bucketEnd.toISOString()}'`;
      const agentFilter = `StartedAt >= '${bucketStart.toISOString()}' AND StartedAt < '${bucketEnd.toISOString()}'`;

      const [promptResults, agentResults] = await Promise.all([
        new RunView().RunView<AIPromptRunEntity>({
          EntityName: 'AI Prompt Runs',
          ExtraFilter: promptFilter,
          ResultType: 'entity_object'
        }),
        new RunView().RunView<AIAgentRunEntity>({
          EntityName: 'AI Agent Runs', 
          ExtraFilter: agentFilter,
          ResultType: 'entity_object'
        })
      ]);

      const promptRuns = promptResults.Results;
      const agentRuns = agentResults.Results;

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
    
    const [promptResults, agentResults] = await Promise.all([
      new RunView().RunView<AIPromptRunEntity>({
        EntityName: 'AI Prompt Runs',
        ExtraFilter: `RunAt >= '${recentTime.toISOString()}'`,
        OrderBy: 'RunAt DESC',
        ResultType: 'entity_object'
      }),
      new RunView().RunView<AIAgentRunEntity>({
        EntityName: 'AI Agent Runs',
        ExtraFilter: `StartedAt >= '${recentTime.toISOString()}'`,
        OrderBy: 'StartedAt DESC', 
        ResultType: 'entity_object'
      })
    ]);

    const liveExecutions: LiveExecution[] = [];

    for (const run of promptResults.Results) {
      const isRunning = !run.CompletedAt && run.Success !== false;
      const duration = run.CompletedAt ? 
        new Date(run.CompletedAt).getTime() - new Date(run.RunAt).getTime() : 
        now.getTime() - new Date(run.RunAt).getTime();

      liveExecutions.push({
        id: run.ID,
        type: 'prompt',
        name: await this.getPromptName(run.PromptID),
        status: isRunning ? 'running' : (run.Success ? 'completed' : 'failed'),
        startTime: new Date(run.RunAt),
        duration: duration,
        cost: run.Cost || 0,
        tokens: run.TokensUsed || 0,
        progress: isRunning ? Math.min(90, (duration / 30000) * 100) : 100
      });
    }

    for (const run of agentResults.Results) {
      const isRunning = run.Status === 'Running';
      const duration = run.CompletedAt ? 
        new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime() : 
        now.getTime() - new Date(run.StartedAt).getTime();

      liveExecutions.push({
        id: run.ID,
        type: 'agent',
        name: await this.getAgentName(run.AgentID),
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
    const promptResults = await promptRv.RunView<AIPromptRunEntity>({
      EntityName: 'AI Prompt Runs',
      ExtraFilter: dateFilter,
      ResultType: 'entity_object'
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
  private countActiveExecutions(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const activePrompts = promptRuns.filter(r => !r.CompletedAt && r.Success !== false).length;
    const activeAgents = agentRuns.filter(r => r.Status === 'Running').length;
    return activePrompts + activeAgents;
  }

  private sumCosts(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const promptCost = promptRuns.reduce((sum, r) => sum + (r.Cost || 0), 0);
    const agentCost = agentRuns.reduce((sum, r) => sum + (r.TotalCost || 0), 0);
    return promptCost + agentCost;
  }

  private sumTokens(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const promptTokens = promptRuns.reduce((sum, r) => sum + (r.TokensUsed || 0), 0);
    const agentTokens = agentRuns.reduce((sum, r) => sum + (r.TotalTokensUsed || 0), 0);
    return promptTokens + agentTokens;
  }

  private calculateAverageExecutionTime(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const promptTimes = promptRuns
      .filter(r => r.ExecutionTimeMS)
      .map(r => r.ExecutionTimeMS!);
    
    const agentTimes = agentRuns
      .filter(r => r.StartedAt && r.CompletedAt)
      .map(r => new Date(r.CompletedAt!).getTime() - new Date(r.StartedAt).getTime());

    const allTimes = [...promptTimes, ...agentTimes];
    return allTimes.length > 0 ? allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length : 0;
  }

  private calculateSuccessRate(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const totalExecutions = promptRuns.length + agentRuns.length;
    if (totalExecutions === 0) return 1;

    const successfulPrompts = promptRuns.filter(r => r.Success).length;
    const successfulAgents = agentRuns.filter(r => r.Success).length;
    
    return (successfulPrompts + successfulAgents) / totalExecutions;
  }

  private countErrors(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const promptErrors = promptRuns.filter(r => !r.Success).length;
    const agentErrors = agentRuns.filter(r => !r.Success).length;
    return promptErrors + agentErrors;
  }

  private calculateDailyCostBurn(promptRuns: AIPromptRunEntity[], agentRuns: AIAgentRunEntity[]): number {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const todayPrompts = promptRuns.filter(r => new Date(r.RunAt) >= dayStart);
    const todayAgents = agentRuns.filter(r => new Date(r.StartedAt) >= dayStart);
    
    return this.sumCosts(todayPrompts, todayAgents);
  }

  private createHourlyBuckets(start: Date, end: Date): Date[] {
    const buckets: Date[] = [];
    const current = new Date(start);
    current.setMinutes(0, 0, 0);
    
    while (current < end) {
      buckets.push(new Date(current));
      current.setHours(current.getHours() + 1);
    }
    
    return buckets;
  }

  private async getPromptName(promptId: string): Promise<string> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<AIPromptEntity>({
        EntityName: 'AI Prompts',
        ExtraFilter: `ID = '${promptId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Prompt';
    } catch {
      return 'Unknown Prompt';
    }
  }

  private async getAgentName(agentId: string): Promise<string> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        ExtraFilter: `ID = '${agentId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Agent';
    } catch {
      return 'Unknown Agent';
    }
  }

  private async getTopModel(promptRuns: AIPromptRunEntity[]): Promise<string> {
    const modelCounts = new Map<string, number>();
    
    for (const run of promptRuns) {
      if (run.ModelID) {
        const count = modelCounts.get(run.ModelID) || 0;
        modelCounts.set(run.ModelID, count + 1);
      }
    }

    if (modelCounts.size === 0) return 'N/A';

    const topModelId = Array.from(modelCounts.entries())
      .sort(([,a], [,b]) => b - a)[0][0];

    try {
      const rv = new RunView();
      const result = await rv.RunView<AIModelEntity>({
        EntityName: 'AI Models',
        ExtraFilter: `ID = '${topModelId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Model';
    } catch {
      return 'Unknown Model';
    }
  }

  private async getTopAgent(agentRuns: AIAgentRunEntity[]): Promise<string> {
    const agentCounts = new Map<string, number>();
    
    for (const run of agentRuns) {
      const count = agentCounts.get(run.AgentID) || 0;
      agentCounts.set(run.AgentID, count + 1);
    }

    if (agentCounts.size === 0) return 'N/A';

    const topAgentId = Array.from(agentCounts.entries())
      .sort(([,a], [,b]) => b - a)[0][0];

    try {
      const rv = new RunView();
      const result = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        ExtraFilter: `ID = '${topAgentId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Agent';
    } catch {
      return 'Unknown Agent';
    }
  }

  private async analyzeCostByModel(promptRuns: AIPromptRunEntity[]): Promise<{ model: string; cost: number; tokens: number }[]> {
    const modelStats = new Map<string, { cost: number; tokens: number }>();

    for (const run of promptRuns) {
      if (run.ModelID) {
        const existing = modelStats.get(run.ModelID) || { cost: 0, tokens: 0 };
        existing.cost += run.Cost || 0;
        existing.tokens += run.TokensUsed || 0;
        modelStats.set(run.ModelID, existing);
      }
    }

    const results = [];
    for (const [modelId, stats] of modelStats.entries()) {
      const modelName = await this.getModelName(modelId);
      results.push({
        model: modelName,
        cost: stats.cost,
        tokens: stats.tokens
      });
    }

    return results.sort((a, b) => b.cost - a.cost);
  }

  private async analyzePerformanceMatrix(promptRuns: AIPromptRunEntity[]): Promise<{ agent: string; model: string; avgTime: number; successRate: number }[]> {
    const combinations = new Map<string, { times: number[]; successes: number; total: number }>();

    for (const run of promptRuns) {
      if (run.AgentID && run.ModelID && run.ExecutionTimeMS) {
        const key = `${run.AgentID}:${run.ModelID}`;
        const existing = combinations.get(key) || { times: [], successes: 0, total: 0 };
        
        existing.times.push(run.ExecutionTimeMS);
        existing.total += 1;
        if (run.Success) existing.successes += 1;
        
        combinations.set(key, existing);
      }
    }

    const results = [];
    for (const [key, data] of combinations.entries()) {
      const [agentId, modelId] = key.split(':');
      const agentName = await this.getAgentName(agentId);
      const modelName = await this.getModelName(modelId);
      
      results.push({
        agent: agentName,
        model: modelName,
        avgTime: data.times.reduce((sum, time) => sum + time, 0) / data.times.length,
        successRate: data.successes / data.total
      });
    }

    return results;
  }

  private async analyzeTokenEfficiency(promptRuns: AIPromptRunEntity[]): Promise<{ inputTokens: number; outputTokens: number; cost: number; model: string }[]> {
    const modelEfficiency = new Map<string, { input: number; output: number; cost: number }>();

    for (const run of promptRuns) {
      if (run.ModelID && run.TokensPrompt && run.TokensCompletion) {
        const existing = modelEfficiency.get(run.ModelID) || { input: 0, output: 0, cost: 0 };
        existing.input += run.TokensPrompt;
        existing.output += run.TokensCompletion;
        existing.cost += run.Cost || 0;
        modelEfficiency.set(run.ModelID, existing);
      }
    }

    const results = [];
    for (const [modelId, data] of modelEfficiency.entries()) {
      const modelName = await this.getModelName(modelId);
      results.push({
        inputTokens: data.input,
        outputTokens: data.output,
        cost: data.cost,
        model: modelName
      });
    }

    return results;
  }

  private async getModelName(modelId: string): Promise<string> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<AIModelEntity>({
        EntityName: 'AI Models',
        ExtraFilter: `ID = '${modelId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Model';
    } catch {
      return 'Unknown Model';
    }
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
    const result = await rv.RunView<AIPromptRunEntity>({
      EntityName: 'AI Prompt Runs',
      ExtraFilter: `ID = '${promptRunId}'`,
      ResultType: 'entity_object'
    });

    const run = result.Results[0];
    if (!run) throw new Error('Prompt run not found');

    const childrenResult = await rv.RunView<AIPromptRunEntity>({
      EntityName: 'AI Prompt Runs',
      ExtraFilter: `ParentID = '${promptRunId}'`,
      ResultType: 'entity_object'
    });

    const children = await Promise.all(
      childrenResult.Results.map(child => this.getPromptExecutionDetails(child.ID))
    );

    return {
      id: run.ID,
      type: 'prompt',
      name: await this.getPromptName(run.PromptID),
      status: run.Success ? 'completed' : 'failed',
      startTime: new Date(run.RunAt),
      endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
      cost: run.Cost || 0,
      tokens: run.TokensUsed || 0,
      success: run.Success || false,
      errorMessage: run.ErrorMessage || undefined,
      parentId: run.ParentID || undefined,
      children,
      model: run.ModelID ? await this.getModelName(run.ModelID) : undefined
    };
  }

  private async getAgentExecutionDetails(agentRunId: string): Promise<ExecutionDetails> {
    const rv = new RunView();
    const result = await rv.RunView<AIAgentRunEntity>({
      EntityName: 'AI Agent Runs',
      ExtraFilter: `ID = '${agentRunId}'`,
      ResultType: 'entity_object'
    });

    const run = result.Results[0];
    if (!run) throw new Error('Agent run not found');

    const childrenResult = await rv.RunView<AIAgentRunEntity>({
      EntityName: 'AI Agent Runs',
      ExtraFilter: `ParentRunID = '${agentRunId}'`,
      ResultType: 'entity_object'
    });

    const children = await Promise.all(
      childrenResult.Results.map(child => this.getAgentExecutionDetails(child.ID))
    );

    return {
      id: run.ID,
      type: 'agent',
      name: await this.getAgentName(run.AgentID),
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