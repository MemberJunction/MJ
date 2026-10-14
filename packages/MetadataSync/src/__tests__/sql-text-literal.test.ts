import { describe, it, expect, afterEach, vi } from 'vitest';
import { SQLTextLiteral } from '../lib/sql-text-literal';

describe('SQLTextLiteral', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('doubles quotes, and prefixes N only for text outside ASCII on SQL Server', () => {
    vi.stubEnv('DB_PLATFORM', 'sqlserver');
    expect(SQLTextLiteral.For("O'Brien")).toBe("'O''Brien'");
    expect(SQLTextLiteral.For('C1 → C2.1')).toBe("N'C1 → C2.1'");
    expect(SQLTextLiteral.List(['a', 'Café'])).toBe("'a', N'Café'");
  });
});
