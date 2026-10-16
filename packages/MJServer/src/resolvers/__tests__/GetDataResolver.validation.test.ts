// type-graphql decorators on the resolver class need the reflect-metadata polyfill.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { SQLExpressionValidator } from '@memberjunction/global';

const { executedSQL } = vi.hoisted(() => ({ executedSQL: [] as string[] }));

// GetData's server bootstrap, provider, auth and driver imports are replaced so the resolver runs
// offline. The fake driver records every text it is asked to run.
vi.mock('../../index.js', () => ({ getDbType: () => 'sqlserver' }));
vi.mock('@memberjunction/generic-database-provider', () => ({
  QueryCompositionEngine: class {
    HasCompositionTokens(): boolean {
      return false;
    }
  },
}));
vi.mock('../../util.js', () => ({ GetReadOnlyDataSource: () => ({}), GetReadOnlyProvider: () => null }));
vi.mock('../../auth/index.js', () => ({ getSystemUser: async () => ({}) }));
vi.mock('mssql', () => ({
  default: {
    Request: class {
      async query(text: string): Promise<{ recordset: Array<Record<string, unknown>> }> {
        executedSQL.push(text);
        return { recordset: [] };
      }
    },
  },
}));

import { GetDataResolver, GetDataInputType, GetDataOutputType, registerAccessToken } from '../GetDataResolver.js';
import type { AppContext } from '../../types.js';

const CONTEXT = { dataSources: [] } as unknown as AppContext;

let tokenSeq = 0;

/** Calls GetData with a fresh valid token. */
async function runGetData(queries: string[]): Promise<GetDataOutputType> {
  const token = `getdata-validation-${Date.now()}-${++tokenSeq}`;
  registerAccessToken(token, 60_000);
  const input = Object.assign(new GetDataInputType(), { Token: token, Queries: queries });
  return new GetDataResolver().GetData(input, CONTEXT);
}

/** The text of every call to the validator's `validate` method. */
function validatedTexts(spy: MockInstance<SQLExpressionValidator['validate']>): string[] {
  return spy.mock.calls.map(([text]) => text);
}

describe('GetData runs exactly the SQL it validated', () => {
  beforeEach(() => {
    executedSQL.length = 0;
  });

  it('validates and runs the same text when the query contains backslash sequences', async () => {
    const query = String.raw`SELECT Name FROM __mj.vwFiles WHERE Path = 'C:\new\temp'`;
    const validateSpy = vi.spyOn(SQLExpressionValidator.Instance, 'validate');

    const output = await runGetData([query]);

    expect(output.ErrorMessages).toEqual([null]);
    expect(executedSQL).toEqual(validatedTexts(validateSpy));
    expect(executedSQL).toEqual([query]);
    expect(validateSpy).toHaveBeenCalledWith(query, { context: 'full_query', Dialect: 'sqlserver' });
  });

  it('runs the trimmed text that the validator reads', async () => {
    const validateSpy = vi.spyOn(SQLExpressionValidator.Instance, 'validate');

    const output = await runGetData(['\n  SELECT 1 AS One  \n']);

    expect(output.ErrorMessages).toEqual([null]);
    expect(executedSQL).toEqual(['SELECT 1 AS One']);
    expect(validatedTexts(validateSpy)).toEqual(executedSQL);
  });

  it('refuses a query whose text, as written, does not open with SELECT or WITH', async () => {
    const output = await runGetData(["-- note\\n SELECT 1\nPRINT 'hello'"]);

    expect(executedSQL).toEqual([]);
    expect(output.Success).toBe(false);
    expect(output.ErrorMessages[0]).toMatch(/must start with SELECT or WITH/);
  });

  it('does not run a refused query and still runs the others', async () => {
    const output = await runGetData(['SELECT 1; SELECT 2', 'SELECT 1 AS One']);

    expect(executedSQL).toEqual(['SELECT 1 AS One']);
    expect(output.ErrorMessages[0]).toMatch(/Semicolons are not allowed/);
    expect(output.ErrorMessages[1]).toBeNull();
  });
});
