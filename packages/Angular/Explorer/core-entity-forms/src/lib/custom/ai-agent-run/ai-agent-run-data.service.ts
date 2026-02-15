import { BehaviorSubject, Observable } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJActionExecutionLogEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';

export interface AgentRunData {
  steps: MJAIAgentRunStepEntity[];
  subRuns: MJAIAgentRunEntity[];
  actionLogs: MJActionExecutionLogEntity[];
  promptRuns: MJAIPromptRunEntity[];
}

/**
 * Helper class for managing AI Agent Run data per component instance
 * No longer a singleton Angular service - instantiated per component
 */
export class AIAgentRunDataHelper {
  // Data subjects
  private stepsSubject$ = new BehaviorSubject<MJAIAgentRunStepEntity[]>([]);
  private subRunsSubject$ = new BehaviorSubject<MJAIAgentRunEntity[]>([]);
  private actionLogsSubject$ = new BehaviorSubject<MJActionExecutionLogEntity[]>([]);
  private promptRunsSubject$ = new BehaviorSubject<MJAIPromptRunEntity[]>([]);
  private loadingSubject$ = new BehaviorSubject<boolean>(false);
  private errorSubject$ = new BehaviorSubject<string | null>(null);
  
  // Public observables
  steps$ = this.stepsSubject$.asObservable();
  subRuns$ = this.subRunsSubject$.asObservable();
  actionLogs$ = this.actionLogsSubject$.asObservable();
  promptRuns$ = this.promptRunsSubject$.asObservable();
  loading$ = this.loadingSubject$.asObservable();
  error$ = this.errorSubject$.asObservable();
  
  // Cache for sub-agent data with size limit
  private readonly MAX_CACHE_SIZE = 100; // Maximum 100 sub-agent entries
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minute TTL
  
  private subAgentDataCache = new Map<string, {
    steps: MJAIAgentRunStepEntity[];
    promptRuns: MJAIPromptRunEntity[];
    timestamp: number;
  }>();
  
  // Track cache access order for LRU eviction
  private cacheAccessOrder: string[] = [];
  
  private currentAgentRunId: string | null = null;
  
  constructor() {}
  
  /**
   * Load all data for an agent run
   */
  async loadAgentRunData(agentRunId: string, forceReload = false): Promise<void> {
    if (!agentRunId) {
      this.errorSubject$.next('No agent run ID provided');
      return;
    }
    
    // Skip cache check when force reloading
    if (!forceReload && this.currentAgentRunId === agentRunId && this.stepsSubject$.value.length > 0) {
      return;
    }
    
    this.currentAgentRunId = agentRunId;
    this.loadingSubject$.next(true);
    this.errorSubject$.next(null);
    
    // Clear cache when loading new run
    this.subAgentDataCache.clear();
    
    try {
      await this.loadStepsAndSubRuns(agentRunId);
    } catch (error) {
      this.errorSubject$.next('Failed to load agent run data');
      console.error('Error loading agent run data:', error);
    } finally {
      this.loadingSubject$.next(false);
    }
  }
  
  private async loadStepsAndSubRuns(agentRunId: string) {
    const rv = new RunView();
    
    // First, get all steps to determine what additional data we need
    const stepsResult = await rv.RunView<MJAIAgentRunStepEntity>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${agentRunId}'`,
      OrderBy: '__mj_CreatedAt, StepNumber'
    });
    
    if (!stepsResult.Success) {
      throw new Error('Failed to load agent run steps');
    }
    
    const steps = stepsResult.Results as MJAIAgentRunStepEntity[] || [];
    
    // Build filters for batch loading
    const actionLogIds = steps
      .filter(s => s.StepType === 'Actions' && s.TargetLogID)
      .map(s => s.TargetLogID)
      .filter(id => id != null);
      
    const promptRunIds = steps
      .filter(s => s.StepType === 'Prompt' && s.TargetLogID)
      .map(s => s.TargetLogID)
      .filter(id => id != null);
    
    // Build batch queries array
    const batchQueries: any[] = [
      // Sub-runs query
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID='${agentRunId}'`,
        OrderBy: 'StartedAt'
      },
      // Current run query
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID='${agentRunId}'`
      }
    ];
    
    // Add action logs query if needed
    if (actionLogIds.length > 0) {
      batchQueries.push({
        EntityName: 'MJ: Action Execution Logs',
        ExtraFilter: `ID IN ('${actionLogIds.join("','")}')`,
        OrderBy: 'StartedAt'
      });
    }
    
    // Add prompt runs query if needed
    if (promptRunIds.length > 0) {
      batchQueries.push({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN ('${promptRunIds.join("','")}')`,
        OrderBy: '__mj_CreatedAt'
      });
    }
    
    // Execute all queries in one batch
    const batchResults = await rv.RunViews(batchQueries);
    
    // Process results
    let resultIndex = 0;
    
    // Sub-runs
    const subRuns = batchResults[resultIndex].Success 
      ? (batchResults[resultIndex].Results as MJAIAgentRunEntity[] || [])
      : [];
    resultIndex++;
    
    // Skip current run result
    resultIndex++;
    
    // Action logs
    const actionLogs = actionLogIds.length > 0 && batchResults[resultIndex]?.Success
      ? (batchResults[resultIndex].Results as MJActionExecutionLogEntity[] || [])
      : [];
    if (actionLogIds.length > 0) resultIndex++;
    
    // Prompt runs
    const promptRuns = promptRunIds.length > 0 && batchResults[resultIndex]?.Success
      ? (batchResults[resultIndex].Results as MJAIPromptRunEntity[] || [])
      : [];
    
    // Update all subjects
    this.stepsSubject$.next(steps);
    this.subRunsSubject$.next(subRuns);
    this.actionLogsSubject$.next(actionLogs);
    this.promptRunsSubject$.next(promptRuns);
  }
  
  /**
   * Load sub-agent data (for expanding sub-agent nodes)
   */
  async loadSubAgentData(subAgentRunId: string): Promise<{ steps: MJAIAgentRunStepEntity[], promptRuns: MJAIPromptRunEntity[] }> {
    // Check cache first
    const cachedData = this.subAgentDataCache.get(subAgentRunId);
    if (cachedData) {
      // Check if cache is still valid
      const now = Date.now();
      if (now - cachedData.timestamp < this.CACHE_TTL_MS) {
        // Update access order for LRU
        this.updateCacheAccessOrder(subAgentRunId);
        return { steps: cachedData.steps, promptRuns: cachedData.promptRuns };
      } else {
        // Cache expired, remove it
        this.removeCacheEntry(subAgentRunId);
      }
    }
    
    const rv = new RunView();
    
    // Load steps first to determine what else we need
    const stepsResult = await rv.RunView<MJAIAgentRunStepEntity>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID = '${subAgentRunId}'`,
      OrderBy: '__mj_CreatedAt, StepNumber'
    });
    
    if (!stepsResult.Success || !stepsResult.Results) {
      return { steps: [], promptRuns: [] };
    }
    
    const steps = stepsResult.Results;
    
    // Get prompt run IDs
    const promptRunIds = steps
      .filter(s => s.StepType === 'Prompt' && s.TargetLogID)
      .map(s => s.TargetLogID)
      .filter(id => id != null);
    
    let promptRuns: MJAIPromptRunEntity[] = [];
    
    // Load prompt runs if needed
    if (promptRunIds.length > 0) {
      const promptResult = await rv.RunView<MJAIPromptRunEntity>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN ('${promptRunIds.join("','")}')`,
        OrderBy: '__mj_CreatedAt'
      });
      
      if (promptResult.Success) {
        promptRuns = promptResult.Results || [];
      }
    }
    
    // Cache the data with timestamp
    const data = { steps, promptRuns, timestamp: Date.now() };
    
    // Enforce cache size limit
    if (this.subAgentDataCache.size >= this.MAX_CACHE_SIZE) {
      // Remove least recently used entry
      const lruKey = this.cacheAccessOrder[0];
      if (lruKey && lruKey !== subAgentRunId) {
        this.removeCacheEntry(lruKey);
      }
    }
    
    this.subAgentDataCache.set(subAgentRunId, data);
    this.updateCacheAccessOrder(subAgentRunId);
    
    return data;
  }
  
  /**
   * Clear all data
   */
  clearData() {
    this.stepsSubject$.next([]);
    this.subRunsSubject$.next([]);
    this.actionLogsSubject$.next([]);
    this.promptRunsSubject$.next([]);
    this.clearCache();
    this.currentAgentRunId = null;
  }
  
  /**
   * Clear just the cache for the current agent run
   */
  clearCurrentRunCache() {
    // Clear all cache entries related to current run
    if (this.currentAgentRunId) {
      const keysToRemove: string[] = [];
      for (const [key, value] of this.subAgentDataCache.entries()) {
        // You might want to add logic here to identify related entries
        keysToRemove.push(key);
      }
      keysToRemove.forEach(key => this.removeCacheEntry(key));
    }
  }
  
  /**
   * Clear entire cache
   */
  private clearCache() {
    this.subAgentDataCache.clear();
    this.cacheAccessOrder = [];
  }
  
  /**
   * Update cache access order for LRU eviction
   */
  private updateCacheAccessOrder(key: string) {
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    this.cacheAccessOrder.push(key);
  }
  
  /**
   * Remove a cache entry
   */
  private removeCacheEntry(key: string) {
    this.subAgentDataCache.delete(key);
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
  }
  
  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return {
      size: this.subAgentDataCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttlMs: this.CACHE_TTL_MS,
      accessOrder: [...this.cacheAccessOrder]
    };
  }
  
  /**
   * Get current data snapshot
   */
  getCurrentData(): AgentRunData {
    return {
      steps: this.stepsSubject$.value,
      subRuns: this.subRunsSubject$.value,
      actionLogs: this.actionLogsSubject$.value,
      promptRuns: this.promptRunsSubject$.value
    };
  }
}