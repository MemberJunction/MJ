/**
 * @file ai-usage-analytics.types.ts
 * Type definitions for MemberJunction AI Usage Analytics queries.
 *
 * Each interface maps 1:1 to the SELECT list of a saved query in
 * metadata/queries/SQL/ai-usage-*.sql.
 *
 * Doctrine rules:
 * - Cost fields are always `number | null`, never `number`.
 * - Every row carrying a cost carries its `CostCurrency`: the queries group by it, so one logical
 *   group can arrive as several rows, one per currency. Never sum `OwnCost` across currencies.
 * - `Runs` counts model calls: parallel parents are excluded (they are tallied in `ParallelParents`
 *   where a query reports them).
 * - Stored queries by name/ID only, never raw SQL.
 */

export interface AIUsageCoverage {
  PricedRuns: number;
  UnpricedRuns: number;
  UnmeasuredRuns: number;
  PricedTokenShare: number;
}

/**
 * Result row from /MJ/AI/AIUsageHourly
 * SELECT list matches metadata/queries/SQL/ai-usage-hourly.sql
 */
export interface AIUsageHourlyRow {
  HourBucket: string;
  AgentID: string | null;
  PromptID: string | null;
  ModelID: string | null;
  VendorID: string | null;
  UserID: string | null;
  PrimaryScopeEntityID: string | null;
  PrimaryScopeRecordID: string | null;
  ConfigurationID: string | null;
  SourceKind: string;
  /** ISO 4217 currency of OwnCost (a GROUP BY dimension). Null when the group carries no priced runs. */
  CostCurrency: string | null;
  Runs: number;
  SucceededRuns: number;
  FailedRuns: number;
  PricedRuns: number;
  UnpricedRuns: number;
  UnmeasuredRuns: number;
  ParallelParents: number;
  TokensPrompt: number;
  TokensCompletion: number;
  TokensCacheRead: number;
  TokensCacheWrite: number;
  OwnCost: number | null;
  LatencyP50: number | null;
  LatencyP95: number | null;
  AvgFirstTokenMS: number | null;
}

/**
 * Result row from /MJ/AI/AIUsageDaily
 * SELECT list matches metadata/queries/SQL/ai-usage-daily.sql
 */
export interface AIUsageDailyRow {
  DayBucket: string;
  AgentID: string | null;
  AgentTypeID: string | null;
  PromptID: string | null;
  ModelID: string | null;
  VendorID: string | null;
  UserID: string | null;
  PrimaryScopeEntityID: string | null;
  PrimaryScopeRecordID: string | null;
  ConfigurationID: string | null;
  SourceKind: string;
  /** ISO 4217 currency of OwnCost (a GROUP BY dimension). Null when the group carries no priced runs. */
  CostCurrency: string | null;
  Runs: number;
  SucceededRuns: number;
  FailedRuns: number;
  PricedRuns: number;
  UnpricedRuns: number;
  UnmeasuredRuns: number;
  ParallelParents: number;
  TokensPrompt: number;
  TokensCompletion: number;
  TokensCacheRead: number;
  TokensCacheWrite: number;
  OwnCost: number | null;
  LatencyP50: number | null;
  LatencyP95: number | null;
  AvgFirstTokenMS: number | null;
}

/**
 * Result row from /MJ/AI/AIUsageByModel
 * SELECT list matches metadata/queries/SQL/ai-usage-by-model.sql
 */
export interface AIUsageByModelRow {
  VendorID: string | null;
  ModelID: string | null;
  /** ISO 4217 currency of OwnCost (a GROUP BY dimension). */
  CostCurrency: string | null;
  Runs: number;
  PricedRuns: number;
  UnpricedRuns: number;
  OwnCost: number | null;
  TokensPrompt: number;
  TokensCompletion: number;
  LatencyP50: number | null;
  LatencyP95: number | null;
  CacheEfficiencyPct: number | null;
}

/**
 * Result row from /MJ/AI/AIUsageByUser
 * SELECT list matches metadata/queries/SQL/ai-usage-by-user.sql
 */
export interface AIUsageByUserRow {
  UserID: string | null;
  /** ISO 4217 currency of OwnCost (a GROUP BY dimension). */
  CostCurrency: string | null;
  Runs: number;
  PricedRuns: number;
  UnpricedRuns: number;
  OwnCost: number | null;
  TokensPrompt: number;
  TokensCompletion: number;
  LastRunAt: string | null;
}

/**
 * Result row from /MJ/AI/AIUsageByScope
 * SELECT list matches metadata/queries/SQL/ai-usage-by-scope.sql
 */
export interface AIUsageByScopeRow {
  PrimaryScopeEntityID: string | null;
  PrimaryScopeRecordID: string | null;
  /** ISO 4217 currency of OwnCost (a GROUP BY dimension). */
  CostCurrency: string | null;
  Runs: number;
  SucceededRuns: number;
  FailedRuns: number;
  PricedRuns: number;
  UnpricedRuns: number;
  UnmeasuredRuns: number;
  ParallelParents: number;
  TokensPrompt: number;
  TokensCompletion: number;
  TokensCacheRead: number;
  TokensCacheWrite: number;
  OwnCost: number | null;
  LatencyP50: number | null;
  LatencyP95: number | null;
  AvgFirstTokenMS: number | null;
}

/**
 * Result row from /MJ/AI/AIUsageCacheEfficiency
 * SELECT list matches metadata/queries/SQL/ai-usage-cache-efficiency.sql
 */
export interface AIUsageCacheEfficiencyRow {
  ModelID: string | null;
  PromptID: string | null;
  /** ISO 4217 currency of EstimatedSavings. */
  CostCurrency: string | null;
  TokensCacheRead: number;
  TokensPrompt: number;
  CacheReadShare: number | null;
  EstimatedSavings: number | null;
}

/**
 * Result row from /MJ/AI/AIUsageErrorRateByModel
 * SELECT list matches metadata/queries/SQL/ai-usage-error-rate-by-model.sql
 */
export interface AIUsageErrorRateByModelRow {
  VendorID: string | null;
  ModelID: string | null;
  TotalRuns: number;
  SucceededRuns: number;
  FailedRuns: number;
  ErrorRatePct: number | null;
}

/**
 * Result row from /MJ/AI/AIUsageUnpricedAudit
 * SELECT list matches metadata/queries/SQL/ai-usage-unpriced-audit.sql
 */
export interface AIUsageUnpricedAuditRow {
  PromptRunID: string | null;
  AgentRunID: string | null;
  ParentPromptRunID: string | null;
  RunAt: string;
  RunAtUTC: string;
  PromptID: string | null;
  ModelID: string | null;
  VendorID: string | null;
  AgentID: string | null;
  ConfigurationID: string | null;
  UserID: string | null;
  ConversationID: string | null;
  PrimaryScopeEntityID: string | null;
  PrimaryScopeRecordID: string | null;
  RunType: string | null;
  SourceKind: string;
  Status: string | null;
  Success: boolean;
  TokensPrompt: number;
  TokensCompletion: number;
  TokensCacheRead: number;
  TokensCacheWrite: number;
  InputUnitsUsed: number | null;
  OutputUnitsUsed: number | null;
  ExecutionTimeMS: number | null;
  IsUnmeasured: number | boolean;
  UnpricedReason: string;
}

/**
 * Result row from /MJ/AI/Agents/CalculateRunCost
 * SELECT list matches metadata/queries/SQL/calculate-ai-agent-run-cost.sql
 */
export interface AIAgentRunSubtreeCost {
  AgentRunID: string;
  TotalCost: number | null;
  TotalPrompts: number;
  TotalTokensInput: number;
  TotalTokensOutput: number;
  TotalTokens: number;
}

