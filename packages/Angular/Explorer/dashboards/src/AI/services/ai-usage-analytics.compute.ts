/**
 * @file ai-usage-analytics.compute.ts
 * Pure computation functions for MemberJunction AI Usage Analytics.
 *
 * Doctrine rules:
 * - Pure computation only: no DOM, no Angular, no SQL, no network calls.
 * - Cost fields are always `number | null`, never `number`.
 * - No nullish-to-zero or or-zero coalescing on cost or any other expression.
 * - Unpriced runs are carried in coverage, never collapsed to $0.
 * - Amounts in different currencies are never summed into one figure. A cost total is always in a
 *   single currency — the dataset's primary one unless the caller names another — and rows priced
 *   in any other currency are left out of it rather than silently converted at 1:1.
 */

import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { AIUsageCoverage, AIUsageHourlyRow } from './ai-usage-analytics.types';

export interface TrendData {
  timestamp: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  executions: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  cost: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  avgTime: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  errors: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Display state of a live execution. Every `MJAIAgentRunEntity.Status` maps onto one of these
 * explicitly (see {@link ToLiveExecutionStatus}), so no run status can fall outside the union.
 */
export type LiveExecutionStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface LiveExecution {
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  type: 'prompt' | 'agent';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: LiveExecutionStatus;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  startTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  duration?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  cost?: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokens?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  progress?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface DashboardKPIs {
  totalExecutions: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  activeExecutions: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalCost: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  costCurrency: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  avgExecutionTime: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  successRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalTokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  costPerToken: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  topModel: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  topAgent: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  errorRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dailyCostBurn: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  cacheHitRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  Coverage: AIUsageCoverage;
  /**
   * True when the period's priced runs span more than one currency. `totalCost` and every other
   * cost figure are then in `costCurrency` only; runs priced in other currencies are excluded.
   */
  IsMixedCurrency: boolean;
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

/** The currency assumed for a dataset that carries no currency information at all. */
export const DEFAULT_COST_CURRENCY = 'USD';

/**
 * Safely parses a date string, Date object, or null/undefined.
 */
export function ParseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Computes coverage metrics from hourly aggregated rows.
 * PricedTokenShare reflects the token-weighted share of runs that were priced.
 * Coverage counts runs, so it spans every currency.
 */
export function ComputeCoverage(rows: AIUsageHourlyRow[]): AIUsageCoverage {
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

/**
 * Computes coverage percentage (0–100) from priced and unpriced run counts.
 * `IsPriced` is binary, so total runs = `PricedRuns + UnpricedRuns`.
 * Returns 100 when there are no runs.
 */
export function ComputeCoveragePercent(
  coverage: { PricedRuns?: number; UnpricedRuns?: number } | null | undefined
): number {
  if (!coverage) {
    return 100;
  }
  const priced = typeof coverage.PricedRuns === 'number' ? coverage.PricedRuns : 0;
  const unpriced = typeof coverage.UnpricedRuns === 'number' ? coverage.UnpricedRuns : 0;
  const total = priced + unpriced;
  return total > 0 ? (priced / total) * 100 : 100;
}

/**
 * A row any cost total can be computed over. Two shapes are accepted:
 * - an AGGREGATE row (`PricedRuns` / `UnpricedRuns` counters beside `OwnCost`), where the counters
 *   decide whether a zero sum means "free" or "nothing was priced";
 * - a RAW run row (`Cost` or `TotalCost` only, no counters), where a null cost IS the unpriced flag.
 */
export interface CostInputRow {
  PricedRuns?: number;
  UnpricedRuns?: number;
  OwnCost?: number | null;
  TotalCost?: number | null;
  Cost?: number | null;
  /** ISO 4217 code the row's cost is in. Null/absent means the row carries no currency (e.g. unpriced). */
  CostCurrency?: string | null;
}

/** The currency picture of a set of rows: which currency totals should be in, and whether others exist. */
export interface CostCurrencyResolution {
  /** The currency cost totals are reported in: the one carrying the most priced runs. */
  Currency: string;
  /** Every distinct currency that priced at least one run, primary first. */
  Currencies: string[];
  /** True when priced runs span more than one currency. */
  IsMixed: boolean;
}

function normalizeCurrency(code: string | null | undefined): string | null {
  return typeof code === 'string' && code.trim().length > 0 ? code.trim().toUpperCase() : null;
}

/** Number of priced runs a row represents: its counter when it has one, else 1 if it carries a cost. */
function pricedRunWeight(r: CostInputRow): number {
  if (typeof r.PricedRuns === 'number') {
    return r.PricedRuns;
  }
  return rowCost(r) !== null ? 1 : 0;
}

function rowCost(r: CostInputRow): number | null {
  if (r.OwnCost !== null && r.OwnCost !== undefined) return r.OwnCost;
  if (r.TotalCost !== null && r.TotalCost !== undefined) return r.TotalCost;
  if (r.Cost !== null && r.Cost !== undefined) return r.Cost;
  return null;
}

/**
 * Resolves the currency cost totals over these rows should be reported in. The primary currency is
 * the one carrying the most priced runs (ties prefer USD, then alphabetical order, so the choice is
 * stable). Rows with no currency — typically unpriced ones — do not vote.
 */
export function ResolveCostCurrency(rows: CostInputRow[]): CostCurrencyResolution {
  const weights = new Map<string, number>();
  for (const r of rows) {
    const code = normalizeCurrency(r.CostCurrency);
    if (code === null) continue;
    const w = pricedRunWeight(r);
    if (w <= 0) continue;
    weights.set(code, (weights.get(code) ?? 0) + w);
  }

  const currencies = Array.from(weights.entries())
    .sort(([codeA, wA], [codeB, wB]) => {
      if (wB !== wA) return wB - wA;
      if (codeA === DEFAULT_COST_CURRENCY) return -1;
      if (codeB === DEFAULT_COST_CURRENCY) return 1;
      return codeA.localeCompare(codeB);
    })
    .map(([code]) => code);

  return {
    Currency: currencies.length > 0 ? currencies[0] : DEFAULT_COST_CURRENCY,
    Currencies: currencies,
    IsMixed: currencies.length > 1
  };
}

/** True when the row belongs in a total reported in `currency` (rows without a currency always do). */
function isInCurrency(r: CostInputRow, currency: string): boolean {
  const code = normalizeCurrency(r.CostCurrency);
  return code === null || code === currency;
}

/** The subset of rows whose cost is in `currency`, plus rows that carry no currency. */
export function FilterRowsToCurrency<T extends CostInputRow>(rows: T[], currency: string): T[] {
  const target = normalizeCurrency(currency) ?? DEFAULT_COST_CURRENCY;
  return rows.filter(r => isInCurrency(r, target));
}

/**
 * Computes total cost across rows, in a single currency.
 *
 * - No rows at all → 0 (nothing ran, nothing was spent).
 * - Aggregate rows: when every run in scope is unpriced (`PricedRuns === 0 && UnpricedRuns > 0`)
 *   → null, so the dashboard renders an em dash with unpriced state rather than $0.
 * - Raw run rows (no counters): when every cost is null → null, for the same reason.
 * - Otherwise the sum of the priced costs.
 *
 * `currency` names the currency the total is in; omitted, it is the rows' primary currency
 * ({@link ResolveCostCurrency}). Rows priced in any other currency are excluded, and a set of rows
 * that is entirely in other currencies returns null — there is no figure in this currency to give.
 */
export function ComputeTotalCost(rows: CostInputRow[], currency?: string): number | null {
  if (rows.length === 0) {
    return 0;
  }

  const target = currency !== undefined
    ? (normalizeCurrency(currency) ?? DEFAULT_COST_CURRENCY)
    : ResolveCostCurrency(rows).Currency;
  const inScope = rows.filter(r => isInCurrency(r, target));
  if (inScope.length === 0) {
    return null;
  }

  let hasCounters = false;
  let pricedRuns = 0;
  let unpricedRuns = 0;
  let totalCost = 0;
  let hasPricedCost = false;

  for (const r of inScope) {
    if (typeof r.PricedRuns === 'number' || typeof r.UnpricedRuns === 'number') {
      hasCounters = true;
    }
    pricedRuns += typeof r.PricedRuns === 'number' ? r.PricedRuns : 0;
    unpricedRuns += typeof r.UnpricedRuns === 'number' ? r.UnpricedRuns : 0;

    const cost = rowCost(r);
    if (cost !== null) {
      totalCost += cost;
      hasPricedCost = true;
    }
  }

  if (hasCounters) {
    if (pricedRuns === 0 && unpricedRuns > 0) {
      return null;
    }
    return totalCost;
  }

  // Raw run rows carry no counters: a null cost is the only unpriced signal, so a set with no
  // priced cost at all is unpriced, not free.
  return hasPricedCost ? totalCost : null;
}

/**
 * Computes daily cost burn: sum of cost for rows occurring in the current UTC day.
 */
export function ComputeDailyCostBurn(rows: AIUsageHourlyRow[], now: Date = new Date(), currency?: string): number | null {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayRows = rows.filter(r => {
    const bucketDate = ParseDate(r.HourBucket);
    return bucketDate !== null && bucketDate >= dayStart;
  });

  return ComputeTotalCost(todayRows, currency !== undefined ? currency : ResolveCostCurrency(rows).Currency);
}

/**
 * Computes cost per token safely, returning null if total cost is null or total tokens is 0.
 */
export function ComputeCostPerToken(totalCost: number | null, totalTokens: number): number | null {
  if (totalCost === null || totalTokens <= 0) {
    return null;
  }
  return totalCost / totalTokens;
}

/**
 * Computes prompt cache hit rate across hourly rows.
 * TokensCacheRead / (TokensPrompt + TokensCacheRead + TokensCacheWrite)
 */
export function ComputeCacheHitRate(rows: AIUsageHourlyRow[]): number {
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
export function ComputeAverageExecutionTime(rows: AIUsageHourlyRow[]): number {
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
export function ComputeSuccessRate(rows: AIUsageHourlyRow[]): number {
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
export function ComputeTotalTokens(rows: AIUsageHourlyRow[]): number {
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
export function GetBucketSizeMs(start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (hours <= 24) return 60 * 60 * 1000;         // 1 hour
  if (hours <= 24 * 7) return 4 * 60 * 60 * 1000; // 4 hours
  return 24 * 60 * 60 * 1000;                     // 24 hours
}

/**
 * Creates bucket Date timestamps covering start to end.
 *
 * Buckets are aligned and advanced in UTC, because `HourBucket` / `DayBucket` are UTC and
 * {@link GetBucketSizeMs} is a fixed width. Local-clock alignment (`setHours`) put the first bucket
 * up to a day before the queried range west of UTC, landed on `:30Z` in half-hour zones, and drifted
 * an hour across every DST transition.
 */
export function CreateHourlyBuckets(start: Date, end: Date): Date[] {
  const buckets: Date[] = [];
  const bucketSizeMs = GetBucketSizeMs(start, end);
  const current = new Date(start);

  if (bucketSizeMs === 60 * 60 * 1000) {
    current.setUTCMinutes(0, 0, 0);
  } else if (bucketSizeMs === 4 * 60 * 60 * 1000) {
    current.setUTCHours(Math.floor(current.getUTCHours() / 4) * 4, 0, 0, 0);
  } else {
    current.setUTCHours(0, 0, 0, 0);
  }

  for (let t = current.getTime(); t < end.getTime(); t += bucketSizeMs) {
    buckets.push(new Date(t));
  }

  return buckets;
}

/**
 * Computes trend series by bucketing hourly aggregate rows. Cost is in `currency` (default: the
 * rows' primary currency), so every point on the series is in the same unit.
 */
export function ComputeTrends(rows: AIUsageHourlyRow[], start: Date, end: Date, currency?: string): TrendData[] {
  const bucketSizeMs = GetBucketSizeMs(start, end);
  const buckets = CreateHourlyBuckets(start, end);
  const costCurrency = currency !== undefined ? currency : ResolveCostCurrency(rows).Currency;

  return buckets.map(bucket => {
    const bucketEnd = new Date(bucket.getTime() + bucketSizeMs);
    const bucketRows = rows.filter(r => {
      const d = ParseDate(r.HourBucket);
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
      cost: ComputeTotalCost(bucketRows, costCurrency),
      tokens: ComputeTotalTokens(bucketRows),
      avgTime: ComputeAverageExecutionTime(bucketRows),
      errors
    };
  });
}

/**
 * Finds the top model by run volume.
 */
export function GetTopModel(rows: AIUsageHourlyRow[], modelNames?: Map<string, string>): string {
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
export function GetTopAgent(rows: AIUsageHourlyRow[], agentNames?: Map<string, string>): string {
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
 * Computes cost and token usage grouped by model. Cost is in `currency` (default: the rows'
 * primary currency) for every model, so the figures are comparable.
 */
export function ComputeCostByModel(
  rows: AIUsageHourlyRow[],
  modelNames?: Map<string, string>,
  currency?: string
): { model: string; cost: number | null; tokens: number }[] {
  const costCurrency = currency !== undefined ? currency : ResolveCostCurrency(rows).Currency;
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
      cost: ComputeTotalCost(groupRows, costCurrency),
      tokens: ComputeTotalTokens(groupRows)
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
export function ComputePerformanceMatrix(
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
      avgTime: ComputeAverageExecutionTime(pairRows),
      successRate: ComputeSuccessRate(pairRows)
    });
  }

  return result;
}

/**
 * Computes input vs output tokens and cost by model. Cost is in `currency` (default: the rows'
 * primary currency).
 */
export function ComputeTokenEfficiency(
  rows: AIUsageHourlyRow[],
  modelNames?: Map<string, string>,
  currency?: string
): { inputTokens: number; outputTokens: number; cost: number | null; model: string }[] {
  const costCurrency = currency !== undefined ? currency : ResolveCostCurrency(rows).Currency;
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
      cost: ComputeTotalCost(modelRows, costCurrency),
      model: modelName
    });
  }

  return result;
}

/**
 * Computes period percentage delta between current and previous metrics.
 */
export function ComputePeriodDelta(
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
export function CountActiveExecutions(
  livePromptRuns: { CompletedAt?: string | null; Success?: boolean }[],
  liveAgentRuns: { Status?: string }[]
): number {
  const activePrompts = livePromptRuns.filter(r => !r.CompletedAt && r.Success !== false).length;
  const activeAgents = liveAgentRuns.filter(r => r.Status === 'Running').length;
  return activePrompts + activeAgents;
}

/**
 * Display state for every agent-run status. Typed as a Record over the entity's own Status union, so
 * adding a status to `MJAIAgentRun` is a compile error here until it is mapped — the previous
 * `toLowerCase() as ...` assertion let 'Cancelled' through as 'cancelled', outside the union.
 */
const AGENT_RUN_STATUS_DISPLAY: Record<MJAIAgentRunEntity['Status'], LiveExecutionStatus> = {
  Running: 'running',
  Paused: 'paused',
  AwaitingFeedback: 'paused',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled'
};

/**
 * Maps an agent-run Status to its live display state. A value outside the entity's union (a newer
 * server than this build) falls back on completion: finished runs read as completed, open ones as running.
 */
export function ToLiveExecutionStatus(status: string | null | undefined, completedAt: string | null | undefined): LiveExecutionStatus {
  const known = (Object.keys(AGENT_RUN_STATUS_DISPLAY) as MJAIAgentRunEntity['Status'][]).find(s => s === status);
  if (known !== undefined) {
    return AGENT_RUN_STATUS_DISPLAY[known];
  }
  return completedAt ? 'completed' : 'running';
}

/**
 * Transforms live prompt runs and live agent runs into unified LiveExecution records.
 */
export function ComputeLiveExecutions(
  promptRuns: LivePromptRunInput[],
  agentRuns: LiveAgentRunInput[],
  now: Date = new Date()
): LiveExecution[] {
  const liveExecutions: LiveExecution[] = [];

  for (const run of promptRuns) {
    const isRunning = !run.CompletedAt && run.Success !== false;
    const runAtDate = ParseDate(run.RunAt);
    const startTime = runAtDate !== null ? runAtDate : now;
    const completedAtDate = ParseDate(run.CompletedAt);

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
    const statusVal = ToLiveExecutionStatus(run.Status, run.CompletedAt);
    const isRunning = statusVal === 'running';
    const startedAtDate = ParseDate(run.StartedAt);
    const startTime = startedAtDate !== null ? startedAtDate : now;
    const completedAtDate = ParseDate(run.CompletedAt);

    const duration = completedAtDate !== null
      ? completedAtDate.getTime() - startTime.getTime()
      : now.getTime() - startTime.getTime();

    const costVal = run.TotalCost !== null && run.TotalCost !== undefined ? run.TotalCost : null;
    const tokensVal = typeof run.TotalTokensUsed === 'number' ? run.TotalTokensUsed : 0;
    const nameVal = run.Agent ? run.Agent : 'Unnamed Agent';

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
 * Aggregates all KPI metrics from hourly aggregate rows and active run counts. Every cost figure is
 * in the rows' primary currency; `IsMixedCurrency` says when runs priced in another were left out.
 */
export function ComputeKPIs(
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

  const currency = ResolveCostCurrency(rows);
  const totalCost = ComputeTotalCost(rows, currency.Currency);
  const totalTokens = ComputeTotalTokens(rows);
  const avgExecutionTime = ComputeAverageExecutionTime(rows);
  const successRate = ComputeSuccessRate(rows);
  // Cost per token divides a single-currency cost, so it must divide that currency's tokens too.
  const tokensInCostCurrency = currency.IsMixed ? ComputeTotalTokens(FilterRowsToCurrency(rows, currency.Currency)) : totalTokens;

  return {
    totalExecutions,
    activeExecutions,
    totalCost,
    costCurrency: currency.Currency,
    avgExecutionTime,
    successRate,
    totalTokens,
    costPerToken: ComputeCostPerToken(totalCost, tokensInCostCurrency),
    topModel: GetTopModel(rows, modelNames),
    topAgent: GetTopAgent(rows, agentNames),
    errorRate: 1 - successRate,
    dailyCostBurn: ComputeDailyCostBurn(rows, now, currency.Currency),
    cacheHitRate: ComputeCacheHitRate(rows),
    Coverage: ComputeCoverage(rows),
    IsMixedCurrency: currency.IsMixed
  };
}
