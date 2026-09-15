/**
 * @file ai-usage-analytics.compute.ts
 * Pure computation functions for MemberJunction AI Usage Analytics.
 *
 * Doctrine rules:
 * - Pure computation only: no DOM, no Angular, no SQL, no network calls.
 * - Cost fields are always `number | null`, never `number`.
 * - No nullish-to-zero or or-zero coalescing on cost or any other expression.
 * - Unpriced runs are carried in coverage, never collapsed to $0.
 */

import { AIUsageCoverage, AIUsageHourlyRow } from './ai-usage-analytics.types';

export interface TrendData {
  timestamp: Date;
  executions: number;
  cost: number | null;
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
  cost?: number | null;
  tokens?: number;
  progress?: number;
}

export interface DashboardKPIs {
  totalExecutions: number;
  activeExecutions: number;
  totalCost: number | null;
  costCurrency: string;
  avgExecutionTime: number;
  successRate: number;
  totalTokens: number;
  costPerToken: number | null;
  topModel: string;
  topAgent: string;
  errorRate: number;
  dailyCostBurn: number | null;
  cacheHitRate: number;
  Coverage: AIUsageCoverage;
}

export interface LivePromptRunInput {
  ID: string;
  RunAt: string;
  CompletedAt: string | null;
  Success: boolean;
  Cost: number | null;
  TokensUsed?: number | null;
  Prompt?: string | null;
}

export interface LiveAgentRunInput {
  ID: string;
  StartedAt: string;
  CompletedAt: string | null;
  Status: string;
  Success: boolean;
  TotalCost: number | null;
  TotalTokensUsed?: number | null;
  Agent?: string | null;
}

/**
 * Safely parses a date string, Date object, or null/undefined.
 */
export function parseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export interface CoverageInputRow {
  Runs?: number;
  PricedRuns?: number;
  UnpricedRuns?: number;
  UnmeasuredRuns?: number;
  TokensPrompt?: number;
  TokensCompletion?: number;
}

/**
 * Computes coverage metrics from aggregated rows.
 * PricedTokenShare reflects the token-weighted share of runs that were priced.
 */
export function computeCoverage(rows: CoverageInputRow[]): AIUsageCoverage {
  let pricedRuns = 0;
  let unpricedRuns = 0;
  let unmeasuredRuns = 0;
  let pricedTokens = 0;
  let totalTokens = 0;

  for (const r of rows) {
    const runs = typeof r.Runs === 'number' ? r.Runs : 0;
    const pRuns = typeof r.PricedRuns === 'number' ? r.PricedRuns : 0;
    const uRuns = typeof r.UnpricedRuns === 'number' ? r.UnpricedRuns : 0;
    const mRuns = typeof r.UnmeasuredRuns === 'number' ? r.UnmeasuredRuns : 0;
    const promptTokens = typeof r.TokensPrompt === 'number' ? r.TokensPrompt : 0;
    const compTokens = typeof r.TokensCompletion === 'number' ? r.TokensCompletion : 0;
    const rowTokens = promptTokens + compTokens;

    pricedRuns += pRuns;
    unpricedRuns += uRuns;
    unmeasuredRuns += mRuns;
    totalTokens += rowTokens;

    if (runs > 0 && pRuns > 0) {
      pricedTokens += (pRuns / runs) * rowTokens;
    }
  }

  const pricedTokenShare = totalTokens > 0 ? pricedTokens / totalTokens : 0;

  return {
    PricedRuns: pricedRuns,
    UnpricedRuns: unpricedRuns,
    UnmeasuredRuns: unmeasuredRuns,
    PricedTokenShare: pricedTokenShare
  };
}

export interface CostInputRow {
  PricedRuns?: number;
  UnpricedRuns?: number;
  OwnCost?: number | null;
  TotalCost?: number | null;
  Cost?: number | null;
}

/**
 * Computes total cost across rows.
 * If there are no rows, returns 0.
 * If all runs in the period are unpriced (PricedRuns === 0 and UnpricedRuns > 0),
 * returns null so the dashboard renders an em dash with unpriced state rather than $0.
 * When priced runs exist, sums only priced rows.
 */
export function computeTotalCost(rows: CostInputRow[]): number | null {
  if (rows.length === 0) {
    return 0;
  }

  let pricedRuns = 0;
  let unpricedRuns = 0;
  let totalCost = 0;
  let hasPricedCost = false;

  for (const r of rows) {
    const pRuns = typeof r.PricedRuns === 'number' ? r.PricedRuns : 0;
    const uRuns = typeof r.UnpricedRuns === 'number' ? r.UnpricedRuns : 0;
    pricedRuns += pRuns;
    unpricedRuns += uRuns;

    const rowCost = r.OwnCost !== null && r.OwnCost !== undefined
      ? r.OwnCost
      : (r.TotalCost !== null && r.TotalCost !== undefined
          ? r.TotalCost
          : (r.Cost !== null && r.Cost !== undefined ? r.Cost : null));

    if (rowCost !== null) {
      totalCost += rowCost;
      hasPricedCost = true;
    }
  }

  if (pricedRuns === 0 && unpricedRuns > 0) {
    return null;
  }

  if (!hasPricedCost && pricedRuns === 0) {
    return 0;
  }

  return totalCost;
}

/**
 * Computes daily cost burn: sum of cost for rows occurring in the current UTC day.
 */
export function computeDailyCostBurn(rows: AIUsageHourlyRow[], now: Date = new Date()): number | null {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayRows = rows.filter(r => {
    const bucketDate = parseDate(r.HourBucket);
    return bucketDate !== null && bucketDate >= dayStart;
  });

  return computeTotalCost(todayRows);
}

/**
 * Computes cost per token safely, returning null if total cost is null or total tokens is 0.
 */
export function computeCostPerToken(totalCost: number | null, totalTokens: number): number | null {
  if (totalCost === null || totalTokens <= 0) {
    return null;
  }
  return totalCost / totalTokens;
}

/**
 * Computes prompt cache hit rate across hourly rows.
 * TokensCacheRead / (TokensPrompt + TokensCacheRead + TokensCacheWrite)
 */
export function computeCacheHitRate(rows: AIUsageHourlyRow[]): number {
  let cacheRead = 0;
  let totalInput = 0;

  for (const r of rows) {
    const prompt = typeof r.TokensPrompt === 'number' ? r.TokensPrompt : 0;
    const read = typeof r.TokensCacheRead === 'number' ? r.TokensCacheRead : 0;
    const write = typeof r.TokensCacheWrite === 'number' ? r.TokensCacheWrite : 0;

    cacheRead += read;
    totalInput += prompt + read + write;
  }

  return totalInput > 0 ? cacheRead / totalInput : 0;
}

/**
 * Computes execution time weighted by runs count.
 */
export function computeAverageExecutionTime(rows: AIUsageHourlyRow[]): number {
  let totalWeightedTime = 0;
  let totalRuns = 0;

  for (const r of rows) {
    const runs = typeof r.Runs === 'number' ? r.Runs : 0;
    const lat = typeof r.LatencyP50 === 'number' ? r.LatencyP50 : null;
    if (lat !== null && runs > 0) {
      totalWeightedTime += lat * runs;
      totalRuns += runs;
    }
  }

  return totalRuns > 0 ? totalWeightedTime / totalRuns : 0;
}

/**
 * Computes overall success rate from succeeded runs / total runs.
 */
export function computeSuccessRate(rows: AIUsageHourlyRow[]): number {
  let totalRuns = 0;
  let succeededRuns = 0;

  for (const r of rows) {
    const runs = typeof r.Runs === 'number' ? r.Runs : 0;
    const succeeded = typeof r.SucceededRuns === 'number' ? r.SucceededRuns : 0;
    totalRuns += runs;
    succeededRuns += succeeded;
  }

  return totalRuns > 0 ? succeededRuns / totalRuns : 1;
}

/**
 * Computes total tokens (prompt + completion) across rows.
 */
export function computeTotalTokens(rows: AIUsageHourlyRow[]): number {
  let total = 0;
  for (const r of rows) {
    const prompt = typeof r.TokensPrompt === 'number' ? r.TokensPrompt : 0;
    const completion = typeof r.TokensCompletion === 'number' ? r.TokensCompletion : 0;
    total += prompt + completion;
  }
  return total;
}

/**
 * Determines bucket size in milliseconds based on span between start and end.
 */
export function getBucketSizeMs(start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (hours <= 24) return 60 * 60 * 1000;         // 1 hour
  if (hours <= 24 * 7) return 4 * 60 * 60 * 1000; // 4 hours
  return 24 * 60 * 60 * 1000;                     // 24 hours
}

/**
 * Creates bucket Date timestamps covering start to end.
 */
export function createHourlyBuckets(start: Date, end: Date): Date[] {
  const buckets: Date[] = [];
  const current = new Date(start);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  let bucketSizeHours: number;
  if (hours <= 24) {
    bucketSizeHours = 1;
    current.setMinutes(0, 0, 0);
  } else if (hours <= 24 * 7) {
    bucketSizeHours = 4;
    current.setHours(Math.floor(current.getHours() / 4) * 4, 0, 0, 0);
  } else {
    bucketSizeHours = 24;
    current.setHours(0, 0, 0, 0);
  }

  while (current < end) {
    buckets.push(new Date(current));
    current.setHours(current.getHours() + bucketSizeHours);
  }

  return buckets;
}

/**
 * Computes trend series by bucketing hourly aggregate rows.
 */
export function computeTrends(rows: AIUsageHourlyRow[], start: Date, end: Date): TrendData[] {
  const bucketSizeMs = getBucketSizeMs(start, end);
  const buckets = createHourlyBuckets(start, end);

  return buckets.map(bucket => {
    const bucketEnd = new Date(bucket.getTime() + bucketSizeMs);
    const bucketRows = rows.filter(r => {
      const d = parseDate(r.HourBucket);
      return d !== null && d >= bucket && d < bucketEnd;
    });

    let executions = 0;
    let errors = 0;
    for (const r of bucketRows) {
      executions += typeof r.Runs === 'number' ? r.Runs : 0;
      errors += typeof r.FailedRuns === 'number' ? r.FailedRuns : 0;
    }

    return {
      timestamp: bucket,
      executions,
      cost: computeTotalCost(bucketRows),
      tokens: computeTotalTokens(bucketRows),
      avgTime: computeAverageExecutionTime(bucketRows),
      errors
    };
  });
}

/**
 * Finds the top model by run volume.
 */
export function getTopModel(rows: AIUsageHourlyRow[], modelNames?: Map<string, string>): string {
  const modelRuns = new Map<string, number>();

  for (const r of rows) {
    if (r.ModelID) {
      const current = modelRuns.get(r.ModelID);
      const runs = typeof r.Runs === 'number' ? r.Runs : 0;
      modelRuns.set(r.ModelID, (current !== undefined ? current : 0) + runs);
    }
  }

  if (modelRuns.size === 0) return 'N/A';

  const sorted = Array.from(modelRuns.entries()).sort(([, a], [, b]) => b - a);
  const topId = sorted[0][0];
  const name = modelNames ? modelNames.get(topId) : undefined;
  return name !== undefined ? name : topId;
}

/**
 * Finds the top agent by run volume.
 */
export function getTopAgent(rows: AIUsageHourlyRow[], agentNames?: Map<string, string>): string {
  const agentRuns = new Map<string, number>();

  for (const r of rows) {
    if (r.AgentID) {
      const current = agentRuns.get(r.AgentID);
      const runs = typeof r.Runs === 'number' ? r.Runs : 0;
      agentRuns.set(r.AgentID, (current !== undefined ? current : 0) + runs);
    }
  }

  if (agentRuns.size === 0) return 'N/A';

  const sorted = Array.from(agentRuns.entries()).sort(([, a], [, b]) => b - a);
  const topId = sorted[0][0];
  const name = agentNames ? agentNames.get(topId) : undefined;
  return name !== undefined ? name : topId;
}

/**
 * Computes cost and token usage grouped by model.
 */
export function computeCostByModel(
  rows: AIUsageHourlyRow[],
  modelNames?: Map<string, string>
): { model: string; cost: number | null; tokens: number }[] {
  const modelMap = new Map<string, AIUsageHourlyRow[]>();

  for (const r of rows) {
    const key = r.ModelID !== null && r.ModelID !== undefined ? r.ModelID : '__unknown__';
    const list = modelMap.get(key);
    if (list) {
      list.push(r);
    } else {
      modelMap.set(key, [r]);
    }
  }

  const result: { model: string; cost: number | null; tokens: number }[] = [];

  for (const [modelId, groupRows] of modelMap.entries()) {
    const name = modelId === '__unknown__'
      ? 'Unknown Model'
      : ((modelNames && modelNames.get(modelId)) ? modelNames.get(modelId)! : modelId);

    result.push({
      model: name,
      cost: computeTotalCost(groupRows),
      tokens: computeTotalTokens(groupRows)
    });
  }

  return result.sort((a, b) => {
    const costA = a.cost !== null ? a.cost : -1;
    const costB = b.cost !== null ? b.cost : -1;
    return costB - costA;
  });
}

/**
 * Computes performance matrix per agent + model pair.
 */
export function computePerformanceMatrix(
  rows: AIUsageHourlyRow[],
  modelNames?: Map<string, string>,
  agentNames?: Map<string, string>
): { agent: string; model: string; avgTime: number; successRate: number }[] {
  const groups = new Map<string, AIUsageHourlyRow[]>();

  for (const r of rows) {
    if (r.AgentID && r.ModelID) {
      const key = `${r.AgentID}:${r.ModelID}`;
      const list = groups.get(key);
      if (list) {
        list.push(r);
      } else {
        groups.set(key, [r]);
      }
    }
  }

  const result: { agent: string; model: string; avgTime: number; successRate: number }[] = [];

  for (const [key, pairRows] of groups.entries()) {
    const [agentId, modelId] = key.split(':');
    const agentName = (agentNames && agentNames.get(agentId)) ? agentNames.get(agentId)! : agentId;
    const modelName = (modelNames && modelNames.get(modelId)) ? modelNames.get(modelId)! : modelId;

    result.push({
      agent: agentName,
      model: modelName,
      avgTime: computeAverageExecutionTime(pairRows),
      successRate: computeSuccessRate(pairRows)
    });
  }

  return result;
}

/**
 * Computes input vs output tokens and cost by model.
 */
export function computeTokenEfficiency(
  rows: AIUsageHourlyRow[],
  modelNames?: Map<string, string>
): { inputTokens: number; outputTokens: number; cost: number | null; model: string }[] {
  const groups = new Map<string, AIUsageHourlyRow[]>();

  for (const r of rows) {
    if (r.ModelID) {
      const list = groups.get(r.ModelID);
      if (list) {
        list.push(r);
      } else {
        groups.set(r.ModelID, [r]);
      }
    }
  }

  const result: { inputTokens: number; outputTokens: number; cost: number | null; model: string }[] = [];

  for (const [modelId, modelRows] of groups.entries()) {
    let input = 0;
    let output = 0;
    for (const r of modelRows) {
      input += typeof r.TokensPrompt === 'number' ? r.TokensPrompt : 0;
      output += typeof r.TokensCompletion === 'number' ? r.TokensCompletion : 0;
    }

    const modelName = (modelNames && modelNames.get(modelId)) ? modelNames.get(modelId)! : modelId;

    result.push({
      inputTokens: input,
      outputTokens: output,
      cost: computeTotalCost(modelRows),
      model: modelName
    });
  }

  return result;
}

/**
 * Computes period percentage delta between current and previous metrics.
 */
export function computePeriodDelta(
  current: number | null,
  previous: number | null
): { percent: number; direction: 'up' | 'down' | 'stable' } {
  if (current === null || previous === null || previous === 0) {
    return { percent: 0, direction: 'stable' };
  }

  const diff = current - previous;
  const delta = (diff / previous) * 100;

  if (Math.abs(delta) < 0.01) {
    return { percent: 0, direction: 'stable' };
  }

  if (delta > 0) {
    return { percent: Math.abs(delta), direction: 'up' };
  }

  return { percent: Math.abs(delta), direction: 'down' };
}

/**
 * Counts currently active executions from live prompt and agent runs.
 */
export function countActiveExecutions(
  livePromptRuns: { CompletedAt?: string | null; Success?: boolean }[],
  liveAgentRuns: { Status?: string }[]
): number {
  const activePrompts = livePromptRuns.filter(r => !r.CompletedAt && r.Success !== false).length;
  const activeAgents = liveAgentRuns.filter(r => r.Status === 'Running').length;
  return activePrompts + activeAgents;
}

/**
 * Transforms live prompt runs and live agent runs into unified LiveExecution records.
 */
export function computeLiveExecutions(
  promptRuns: LivePromptRunInput[],
  agentRuns: LiveAgentRunInput[],
  now: Date = new Date()
): LiveExecution[] {
  const liveExecutions: LiveExecution[] = [];

  for (const run of promptRuns) {
    const isRunning = !run.CompletedAt && run.Success !== false;
    const runAtDate = parseDate(run.RunAt);
    const startTime = runAtDate !== null ? runAtDate : now;
    const completedAtDate = parseDate(run.CompletedAt);

    const duration = completedAtDate !== null
      ? completedAtDate.getTime() - startTime.getTime()
      : now.getTime() - startTime.getTime();

    const costVal = run.Cost !== null && run.Cost !== undefined ? run.Cost : null;
    const tokensVal = typeof run.TokensUsed === 'number' ? run.TokensUsed : 0;
    const nameVal = run.Prompt ? run.Prompt : 'Unnamed Prompt';

    liveExecutions.push({
      id: run.ID,
      type: 'prompt',
      name: nameVal,
      status: isRunning ? 'running' : (run.Success ? 'completed' : 'failed'),
      startTime,
      duration,
      cost: costVal,
      tokens: tokensVal,
      progress: isRunning ? Math.min(90, (duration / 30000) * 100) : 100
    });
  }

  for (const run of agentRuns) {
    const isRunning = run.Status === 'Running';
    const startedAtDate = parseDate(run.StartedAt);
    const startTime = startedAtDate !== null ? startedAtDate : now;
    const completedAtDate = parseDate(run.CompletedAt);

    const duration = completedAtDate !== null
      ? completedAtDate.getTime() - startTime.getTime()
      : now.getTime() - startTime.getTime();

    const costVal = run.TotalCost !== null && run.TotalCost !== undefined ? run.TotalCost : null;
    const tokensVal = typeof run.TotalTokensUsed === 'number' ? run.TotalTokensUsed : 0;
    const nameVal = run.Agent ? run.Agent : 'Unnamed Agent';
    const statusVal = run.Status ? (run.Status.toLowerCase() as 'running' | 'completed' | 'failed') : 'completed';

    liveExecutions.push({
      id: run.ID,
      type: 'agent',
      name: nameVal,
      status: statusVal,
      startTime,
      duration,
      cost: costVal,
      tokens: tokensVal,
      progress: isRunning ? Math.min(90, (duration / 60000) * 100) : 100
    });
  }

  return liveExecutions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

/**
 * Aggregates all KPI metrics from hourly aggregate rows and active run counts.
 */
export function computeKPIs(
  rows: AIUsageHourlyRow[],
  activeExecutions: number,
  modelNames?: Map<string, string>,
  agentNames?: Map<string, string>,
  now: Date = new Date()
): DashboardKPIs {
  let totalExecutions = 0;
  for (const r of rows) {
    totalExecutions += typeof r.Runs === 'number' ? r.Runs : 0;
  }

  const totalCost = computeTotalCost(rows);
  const totalTokens = computeTotalTokens(rows);
  const avgExecutionTime = computeAverageExecutionTime(rows);
  const successRate = computeSuccessRate(rows);

  return {
    totalExecutions,
    activeExecutions,
    totalCost,
    costCurrency: 'USD',
    avgExecutionTime,
    successRate,
    totalTokens,
    costPerToken: computeCostPerToken(totalCost, totalTokens),
    topModel: getTopModel(rows, modelNames),
    topAgent: getTopAgent(rows, agentNames),
    errorRate: 1 - successRate,
    dailyCostBurn: computeDailyCostBurn(rows, now),
    cacheHitRate: computeCacheHitRate(rows),
    Coverage: computeCoverage(rows)
  };
}
