/**
 * Push leaves the saves of run and log records out of its SQL log by default, merges that with a
 * project's own exclude patterns, and can be told not to.
 */
import { describe, it, expect } from 'vitest';
import { EnsureRegExps } from '@memberjunction/global';
import { DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS, ResolveSqlLogFilter } from '../lib/sql-log-filters';

/** Whether the SQL logger would leave the statement out, applying the filter the way it does. */
function dropped(statement: string, filter: ReturnType<typeof ResolveSqlLogFilter>): boolean {
  const patterns = filter.Patterns ?? [];
  if (patterns.length === 0) {
    return false;
  }
  const anyMatch = EnsureRegExps(patterns).some((pattern) => pattern.test(statement));
  return filter.FilterType === 'exclude' ? anyMatch : !anyMatch;
}

const TELEMETRY = [
  "EXEC [__mj].spCreateAIPromptRun @ID='1', @PromptID='2'",
  "EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID='1'",
  "EXEC [__mj].spCreateAIAgentRun @ID='1'",
  "EXEC [__mj].spUpdateAIAgentRun @ID='1'",
  "EXEC [__mj].spCreateAIAgentRunStep @ID='1'",
  "EXEC [__mj].spUpdateAIAgentRunStep @ID='1'",
  "EXEC [__mj].spCreateActionExecutionLog @ID='1'",
  'SELECT * FROM __mj."spUpdateActionExecutionLog"($1)',
];

const METADATA = [
  "EXEC [__mj].spCreateAIPrompt @ID='1', @Name='Summarize'",
  "EXEC [__mj].spUpdateAIAgent @ID='1'",
  "EXEC [__mj].spCreateAIAgentRunMedia @ID='1'",
  "EXEC [__mj].spDeleteAIPromptRun @ID='1'",
];

describe('SQL log statement filter', () => {
  it('drops the create and update calls of the four run and log entities by default', () => {
    const filter = ResolveSqlLogFilter({ enabled: true });
    expect(filter.FilterType).toBe('exclude');
    for (const statement of TELEMETRY) {
      expect(dropped(statement, filter), statement).toBe(true);
    }
  });

  it('keeps metadata saves and similarly named procedures', () => {
    const filter = ResolveSqlLogFilter({ enabled: true });
    for (const statement of METADATA) {
      expect(dropped(statement, filter), statement).toBe(false);
    }
  });

  it('merges the defaults after the project patterns without duplicates', () => {
    const own = ['*EntityFieldValue*', DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS[0]];
    const filter = ResolveSqlLogFilter({ enabled: true, filterPatterns: own, filterType: 'exclude' });

    expect(filter.Patterns).toEqual([...own, ...DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS.slice(1)]);
    expect(dropped("EXEC [__mj].spUpdateEntityFieldValue @ID='1'", filter)).toBe(true);
    expect(dropped("EXEC [__mj].spCreateAIAgentRun @ID='1'", filter)).toBe(true);
  });

  it('adds no defaults when excludeTransactionalDefaults is false', () => {
    expect(ResolveSqlLogFilter({ enabled: true, excludeTransactionalDefaults: false }).Patterns).toBeUndefined();

    const filter = ResolveSqlLogFilter({ enabled: true, filterPatterns: ['*EntityFieldValue*'], excludeTransactionalDefaults: false });
    expect(filter.Patterns).toEqual(['*EntityFieldValue*']);
    for (const statement of TELEMETRY) {
      expect(dropped(statement, filter), statement).toBe(false);
    }
  });

  it('leaves include mode to the project patterns alone', () => {
    const filter = ResolveSqlLogFilter({ enabled: true, filterPatterns: ['*AIPromptRun*'], filterType: 'include' });

    expect(filter).toEqual({ Patterns: ['*AIPromptRun*'], FilterType: 'include' });
    expect(dropped("EXEC [__mj].spCreateAIPromptRun @ID='1'", filter)).toBe(false);
    expect(dropped("EXEC [__mj].spCreateAIPrompt @ID='1'", filter)).toBe(true);
  });
});
