import { describe, it, expect, beforeEach } from 'vitest';
import { QueryParameterProcessor } from '../queryParameterProcessor.js';
import { RunQuerySQLFilterManager } from '@memberjunction/core';

/**
 * A query template must render the same SQL every time it is given the same parameters: the
 * statement that is checked for what it reads is rendered separately from the one that runs, so
 * a template that can render differently could pass the check and then run something else.
 */
describe('query templates render deterministically', () => {
  beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
  });

  const render = (sql: string) =>
    QueryParameterProcessor.ProcessQueryTemplate({ SQL: sql, UsesTemplate: true, Parameters: [] } as never, {});

  it('refuses the random filter instead of picking a value', () => {
    const result = render('SELECT * FROM {{ ["vwProjects", "Person"] | random }}');
    expect(result.success).toBe(false);
    expect(result.processedSQL).toBe('');
    expect(result.error).toMatch(/random/);
  });

  it('still renders the stateful helpers, which repeat the same way on every render', () => {
    const sql = '{% set c = cycler("a", "b") %}SELECT {{ c.next() }}{{ c.next() }}{{ c.next() }}';
    const first = render(sql);
    expect(first.success).toBe(true);
    expect(first.processedSQL).toBe('SELECT aba');
    expect(render(sql).processedSQL).toBe(first.processedSQL);
  });
});
