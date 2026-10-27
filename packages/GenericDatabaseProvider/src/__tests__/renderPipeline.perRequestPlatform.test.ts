/**
 * Each render uses the SQL filters of the platform it renders for.
 *
 * Desired rule (DISCUSSION §6, 2026-10-27: "per-request rendering platform"; objective O1): the
 * Nunjucks environment and its SQL filters come from the request's provider, read from
 * `RenderContext.Platform`, so a SQL Server provider and a PostgreSQL provider in one process each
 * render with their own dialect. Today the filters come from the process-global
 * `RunQuerySQLFilterManager`, whose platform is whatever the last `SetPlatform` call left
 * (`PostgreSQLDataProvider.Config` / `ConfigWithSharedPool` call it; the SQL Server provider
 * never does), so one provider's render gets the other's filters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata, DatabasePlatform, RunQuerySQLFilterManager } from '@memberjunction/core';
import { SQLServerDialect, PostgreSQLDialect, SQLDialect } from '@memberjunction/sql-dialect';
import { RenderPipeline } from '../renderPipeline';

afterEach(() => {
    vi.restoreAllMocks();
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
});

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as unknown as typeof Metadata.Provider);
}

const dialects: Record<DatabasePlatform, SQLDialect> = {
    sqlserver: new SQLServerDialect(),
    postgresql: new PostgreSQLDialect(),
};

const TEMPLATE = 'SELECT {{ Col | sqlIdentifier }} AS c FROM t WHERE flag = {{ Flag | sqlBoolean }} AND n = {{ Name | sqlString }}';
const PARAMETERS: Record<string, string> = { Col: 'Name', Flag: 'true', Name: '日本' };

/** The SQL `TEMPLATE` should render to on `platform`, built from that platform's dialect. */
function expectedSQL(platform: DatabasePlatform): string {
    const d = dialects[platform];
    return `SELECT ${d.QuoteIdentifier('Name')} AS c FROM t WHERE flag = ${d.BooleanLiteral(true)} AND n = ${d.StringLiteralPrefix('日本')}'日本'`;
}

function render(platform: DatabasePlatform): string {
    return RenderPipeline.Run(TEMPLATE, { Platform: platform, UsesTemplate: true, Parameters: PARAMETERS }).FinalSQL;
}

/** What `PostgreSQLDataProvider.Config` / `ConfigWithSharedPool` do to the shared filter manager. */
function configurePostgreSQLProvider(): void {
    RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('per-request rendering platform', () => {
    it('the two dialects render the template differently (the test can tell them apart)', () => {
        expect(expectedSQL('sqlserver')).not.toBe(expectedSQL('postgresql'));
    });

    it('a process with one provider renders with that provider’s filters', () => {
        stubMetadata();
        expect(render('sqlserver')).toBe(expectedSQL('sqlserver'));
        configurePostgreSQLProvider();
        expect(render('postgresql')).toBe(expectedSQL('postgresql'));
    });

    // Pinned: per-request rendering platform (DISCUSSION §6, 2026-10-27). R1 / O1.
    // Observed today: the SQL Server render gets PostgreSQL's filters, because configuring the
    // PostgreSQL provider flipped the process-global filter manager:
    // 'SELECT "Name" AS c FROM t WHERE flag = true AND n = '日本'' instead of 'SELECT [Name] AS c FROM t WHERE flag = 1 AND n = N'日本''.
    it.fails('interleaved renders on a SQL Server and a PostgreSQL provider each use their own dialect', async () => {
        stubMetadata();
        const sqlServerRequest = async (): Promise<string> => {
            await tick();
            return render('sqlserver');
        };
        const postgreSQLRequest = async (): Promise<string> => {
            configurePostgreSQLProvider(); // a per-request PostgreSQL provider is built for this request
            await tick();
            return render('postgresql');
        };
        const [sqlServerSQL, postgreSQLSQL] = await Promise.all([sqlServerRequest(), postgreSQLRequest()]);
        expect(postgreSQLSQL).toBe(expectedSQL('postgresql'));
        expect(sqlServerSQL).toBe(expectedSQL('sqlserver'));
    });

    // Pinned: per-request rendering platform (DISCUSSION §6, 2026-10-27). R1 / O1.
    // Observed today: a PostgreSQL render while the global filter manager is on SQL Server gets
    // SQL Server's filters: '[Name]', '1' and N'日本' instead of '"Name"', 'true' and '日本'.
    it.fails('a PostgreSQL render does not depend on which provider set the global platform last', () => {
        stubMetadata();
        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
        expect(render('postgresql')).toBe(expectedSQL('postgresql'));
    });
});
