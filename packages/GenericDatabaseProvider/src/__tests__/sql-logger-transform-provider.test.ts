/**
 * The provider's shared verbose print shows the statement after each session's TransformStatement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import { SqlLoggingSessionImpl } from '../SqlLogger';

const SECRET = 'provider-secret-456';

describe('GenericDatabaseProvider._logSqlStatement — verbose print', () => {
  let dir: string;
  let session: SqlLoggingSessionImpl;
  let provider: GenericDatabaseProvider;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-transform-provider-'));
    session = new SqlLoggingSessionImpl('provider-transform', path.join(dir, 'capture.sql'), {
      verboseOutput: true,
      TransformStatement: (sql: string): string => sql.split(SECRET).join('<removed>'),
    });
    await session.initialize();
    // Only the logging members are used, so the provider needs no constructor or connection
    provider = Object.create(GenericDatabaseProvider.prototype) as GenericDatabaseProvider;
    provider['_sqlLoggingSessions'].set(session.id, session);
  });

  afterEach(async () => {
    provider['_sqlLoggingSessions'].delete(session.id);
    await session.dispose();
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints the transformed query', async () => {
    const printed: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '));
    });
    await provider['_logSqlStatement'](`SET @T_6679d1fd77d5 = N'${SECRET}'`, undefined, 'Save Widgets', false, true);
    const queryLine = printed.find((line) => line.startsWith('Query to log:'));
    expect(queryLine).toContain('<removed>');
    expect(printed.join('\n')).not.toContain(SECRET);
  });
});
