/**
 * @fileoverview The statement filter push hands its SQL log. Besides the patterns a project sets
 * in `.mj-sync.json`, push leaves out the saves of run and log records that the server writes
 * while a push runs (prompt runs, agent runs and steps, action execution logs). Those rows are
 * telemetry, not metadata, and a migration built from the log must not carry them.
 * @module sql-log-filters
 */

import type { SyncConfig } from '../config';

/**
 * Exclude patterns push always applies to its SQL log, unless
 * `sqlLogging.excludeTransactionalDefaults` is false or `filterType` is 'include'. Each matches the
 * entity's generated create or update procedure by whole name, so `spCreateAIAgentRun` does not
 * also match `spCreateAIAgentRunMedia`.
 */
export const DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS: readonly string[] = [
  '/\\bsp(Create|Update)AIPromptRun\\b/i',
  '/\\bsp(Create|Update)AIAgentRun\\b/i',
  '/\\bsp(Create|Update)AIAgentRunStep\\b/i',
  '/\\bsp(Create|Update)ActionExecutionLog\\b/i',
];

/** The statement filter for a push SQL log. */
export interface SqlLogFilter {
  /** Patterns to pass to the SQL logger, or undefined when there are none. */
  Patterns: string[] | undefined;
  /** How the logger applies `Patterns`. */
  FilterType: 'exclude' | 'include';
}

/**
 * Builds the SQL log filter from the root `sqlLogging` settings. In exclude mode (the default) the
 * built-in transactional patterns are added after the project's own, unless
 * `excludeTransactionalDefaults` is false. In include mode only the project's patterns apply: the
 * log already holds nothing but what they match, and adding exclude patterns to an include list
 * would invert their meaning.
 */
export function ResolveSqlLogFilter(sqlLogging: SyncConfig['sqlLogging']): SqlLogFilter {
  const filterType = sqlLogging?.filterType ?? 'exclude';
  const userPatterns = sqlLogging?.filterPatterns ?? [];
  if (filterType === 'include' || sqlLogging?.excludeTransactionalDefaults === false) {
    return { Patterns: userPatterns.length > 0 ? [...userPatterns] : undefined, FilterType: filterType };
  }
  const patterns = [...userPatterns];
  for (const pattern of DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS) {
    if (!patterns.includes(pattern)) {
      patterns.push(pattern);
    }
  }
  return { Patterns: patterns, FilterType: filterType };
}
