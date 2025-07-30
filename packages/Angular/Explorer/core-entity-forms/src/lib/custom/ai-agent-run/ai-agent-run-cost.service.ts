import { Injectable } from '@angular/core';
import { Metadata, RunQuery } from '@memberjunction/core';

export interface AgentRunCostMetrics {
  totalCost: number;
  totalPrompts: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  isLoading: boolean;
  error?: string;
}

interface QueryResult {
  AgentRunID: string;
  TotalCost: number;
  TotalPrompts: number;
  TotalTokensInput: number;
  TotalTokensOutput: number;
  TotalTokens: number;
}

@Injectable({
  providedIn: 'root'
})
export class AIAgentRunCostService {
  private costCache = new Map<string, { metrics: AgentRunCostMetrics; timestamp: number }>();
  private readonly CACHE_DURATION_MS = 30000; // 30 seconds

  /**
   * Get comprehensive cost metrics for an agent run including all nested sub-runs
   * Uses the high-performance CalculateAIAgentRunCost templated query
   */
  async getAgentRunCostMetrics(agentRunId: string, useCache: boolean = true): Promise<AgentRunCostMetrics> {
    // Check cache first
    if (useCache) {
      const cached = this.getCachedMetrics(agentRunId);
      if (cached) {
        return cached;
      }
    }

    const metrics: AgentRunCostMetrics = {
      totalCost: 0,
      totalPrompts: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      isLoading: true
    };

    try {
      // Use the high-performance templated query
      const rq = new RunQuery();
      const queryResult = await rq.RunQuery({
        QueryName: 'CalculateRunCost',
        CategoryPath: '/MJ/AI/Agents/',
        Parameters: {
          AIAgentRunID: agentRunId
        }
      });

      if (queryResult.Success && queryResult.Results && queryResult.Results.length > 0) {
        const result = queryResult.Results[0] as QueryResult;
        
        metrics.totalCost = result.TotalCost || 0;
        metrics.totalPrompts = result.TotalPrompts || 0;
        metrics.totalTokensInput = result.TotalTokensInput || 0;
        metrics.totalTokensOutput = result.TotalTokensOutput || 0;
      } else {
        console.warn(`No cost data found for agent run ${agentRunId}:`, queryResult.ErrorMessage);
      }
      
      metrics.isLoading = false;
      
      // Cache the results
      if (useCache) {
        this.setCachedMetrics(agentRunId, metrics);
      }
      
      return metrics;
      
    } catch (error) {
      console.error('Error calculating agent run cost metrics:', error);
      return {
        ...metrics,
        isLoading: false,
        error: 'Failed to calculate cost metrics'
      };
    }
  }

  /**
   * Get just the total cost for display (simplified version)
   */
  async getTotalCost(agentRunId: string, useCache: boolean = true): Promise<number> {
    const metrics = await this.getAgentRunCostMetrics(agentRunId, useCache);
    return metrics.totalCost;
  }

  /**
   * Clear cache for specific agent run or all cached data
   */
  clearCache(agentRunId?: string): void {
    if (agentRunId) {
      this.costCache.delete(agentRunId);
    } else {
      this.costCache.clear();
    }
  }

  /**
   * Get cached metrics if they exist and are still valid
   */
  private getCachedMetrics(agentRunId: string): AgentRunCostMetrics | null {
    const cached = this.costCache.get(agentRunId);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION_MS) {
      return { ...cached.metrics }; // Return a copy
    }
    
    // Remove stale cache entry
    if (cached) {
      this.costCache.delete(agentRunId);
    }
    
    return null;
  }

  /**
   * Cache metrics for future use
   */
  private setCachedMetrics(agentRunId: string, metrics: AgentRunCostMetrics): void {
    this.costCache.set(agentRunId, {
      metrics: { ...metrics }, // Store a copy
      timestamp: Date.now()
    });
  }
}