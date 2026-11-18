/**
 * Tests for the managed-PostgreSQL preflight (`mj doctor --db`, and the check `mj migrate`
 * runs first on PostgreSQL). Every check runs against a fake query runner that answers
 * each catalog query from a scripted server state, so no database is touched.
 */
import { describe, it, expect } from 'vitest';
import { BuildPostgresSetupSteps, POSTGRES_MJ_EXTENSIONS, POSTGRES_MJ_GROUP_ROLES } from '@memberjunction/installer';
import { RunPgManagedPreflight } from '../lib/pg-preflight/preflight';
import { ExtractCreatedExtensions } from '../lib/pg-preflight/extension-scan';
import { RenderRemediationScript } from '../lib/pg-preflight/remediation';
import { ClassifyExtension, ParseAllowlist } from '../lib/pg-preflight/extension-check';
import { IsLoopbackHost } from '../lib/pg-preflight/checks';
import { AdaptQueryRunner } from '../lib/pg-preflight/run-for-config';
import type { PgPreflightCheck, PgPreflightCheckId, PgPreflightQueryRunner, PgSessionContext } from '../lib/pg-preflight/types';

/** A scripted server. Every field defaults to a fully ready database. */
interface FakeServer {
  Session: PgSessionContext;
  Roles: string[];
  /** Owner of the target schema; undefined when the schema does not exist. */
  SchemaOwner?: { Owner: string; Owned: boolean };
  Extensions: Array<{ Name: string; InstalledVersion: string | null; Trusted: boolean }>;
  AzureAllowlist: string | null;
  Ssl: boolean;
  FailOn?: string;
}

function readyServer(overrides: Partial<FakeServer> = {}): FakeServer {
  return {
    Session: {
      Login: 'mj_codegen',
      Database: 'mj_test',
      ServerVersion: '16.4',
      ServerVersionNum: 160004,
      CanCreateInDatabase: true,
      IsSuperuser: false,
    },
    Roles: [...POSTGRES_MJ_GROUP_ROLES],
    SchemaOwner: { Owner: 'mj_codegen', Owned: true },
    Extensions: [
      { Name: 'pgcrypto', InstalledVersion: '1.3', Trusted: true },
      { Name: 'uuid-ossp', InstalledVersion: '1.1', Trusted: true },
    ],
    AzureAllowlist: null,
    Ssl: true,
    ...overrides,
  };
}

/** Answers each catalog query the checks issue from the scripted state. */
function fakeRunner(server: FakeServer): PgPreflightQueryRunner {
  return {
    async Query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (server.FailOn && sql.includes(server.FailOn)) throw new Error('permission denied');
      return answer(server, sql, params) as T[];
    },
  };
}

function answer(server: FakeServer, sql: string, params?: unknown[]): unknown[] {
  if (sql.includes('current_database() AS "Database"')) return [server.Session];
  if (sql.includes('FROM pg_catalog.pg_roles WHERE rolname = ANY')) {
    const wanted = params?.[0] as string[];
    return server.Roles.filter((r) => wanted.includes(r)).map((rolname) => ({ rolname }));
  }
  if (sql.includes('FROM pg_catalog.pg_namespace')) return server.SchemaOwner ? [server.SchemaOwner] : [];
  if (sql.includes('pg_available_extensions')) {
    const wanted = params?.[0] as string[];
    return server.Extensions.filter((e) => wanted.includes(e.Name));
  }
  if (sql.includes('azure.extensions')) return [{ Allowlist: server.AzureAllowlist }];
  if (sql.includes('pg_stat_ssl')) return [{ ssl: server.Ssl, version: server.Ssl ? 'TLSv1.3' : null }];
  if (sql.includes('max_connections')) return [{ Max: 100, Reserved: 3, InUse: 7 }];
  throw new Error(`Unexpected query: ${sql}`);
}

function check(checks: PgPreflightCheck[], id: PgPreflightCheckId): PgPreflightCheck {
  const found = checks.find((c) => c.Id === id);
  if (!found) throw new Error(`No ${id} check in the report`);
  return found;
}

const MJ_EXTENSIONS = [...POSTGRES_MJ_EXTENSIONS];

async function run(server: FakeServer, extensions: string[] = MJ_EXTENSIONS, schema = '__mj', host = 'db.example.com') {
  return RunPgManagedPreflight(fakeRunner(server), { TargetSchema: schema, RequiredExtensions: extensions, Host: host });
}

describe('RunPgManagedPreflight — ready database', () => {
  it('passes every check and needs no remediation', async () => {
    const report = await run(readyServer());
    expect(report.Passed).toBe(true);
    expect(report.Checks.map((c) => c.Id)).toEqual(['server-version', 'group-roles', 'database-create', 'target-schema', 'extensions', 'tls', 'connections']);
    expect(report.Checks.filter((c) => c.Status === 'fail')).toEqual([]);
    expect(RenderRemediationScript(report)).toBe('');
  });

  it('reports max_connections as info', async () => {
    const report = await run(readyServer());
    expect(check(report.Checks, 'connections')).toMatchObject({ Status: 'info', Message: expect.stringContaining('max_connections=100') });
  });
});

describe('server version', () => {
  it('fails below PostgreSQL 14', async () => {
    const server = readyServer();
    server.Session = { ...server.Session, ServerVersion: '13.9', ServerVersionNum: 130009 };
    const result = check((await run(server)).Checks, 'server-version');
    expect(result.Status).toBe('fail');
    expect(result.Notes[0]).toContain('PostgreSQL 14');
  });

  it('passes at exactly 14.0', async () => {
    const server = readyServer();
    server.Session = { ...server.Session, ServerVersion: '14.0', ServerVersionNum: 140000 };
    expect(check((await run(server)).Checks, 'server-version').Status).toBe('pass');
  });
});

describe('group roles', () => {
  it('fails listing only the missing roles, with the installer CREATE ROLE statements', async () => {
    const report = await run(readyServer({ Roles: ['cdp_BI', 'cdp_UI'] }));
    const result = check(report.Checks, 'group-roles');
    expect(result.Status).toBe('fail');
    expect(result.Message).toContain('cdp_CodeGen, cdp_Developer, cdp_Integration');
    expect(result.Remediation.map((s) => s.Sql)).toEqual([
      'CREATE ROLE "cdp_CodeGen" NOLOGIN',
      'CREATE ROLE "cdp_Developer" NOLOGIN',
      'CREATE ROLE "cdp_Integration" NOLOGIN',
    ]);
    expect(report.Passed).toBe(false);
  });

  it('uses exactly the statements the installer runs (no drift)', async () => {
    const report = await run(readyServer({ Roles: [] }));
    const installerSql = BuildPostgresSetupSteps({ DatabaseName: 'mj_test', CodeGenUser: 'mj_codegen' }).map((s) => s.Sql);
    for (const step of check(report.Checks, 'group-roles').Remediation) {
      expect(installerSql).toContain(step.Sql);
    }
  });

  it('builds a statement for a role the installer does not know', async () => {
    const report = await RunPgManagedPreflight(fakeRunner(readyServer()), {
      TargetSchema: '__mj',
      RequiredExtensions: [],
      RequiredRoles: ['cdp_BI', 'w6_missing_role'],
    });
    expect(check(report.Checks, 'group-roles').Remediation.map((s) => s.Sql)).toEqual(['CREATE ROLE "w6_missing_role" NOLOGIN']);
  });
});

describe('database CREATE privilege', () => {
  it('fails without CREATE and prints the installer GRANT', async () => {
    const server = readyServer();
    server.Session = { ...server.Session, CanCreateInDatabase: false };
    const result = check((await run(server)).Checks, 'database-create');
    expect(result.Status).toBe('fail');
    expect(result.Remediation.map((s) => s.Sql)).toEqual(['GRANT CONNECT, CREATE, TEMPORARY ON DATABASE "mj_test" TO "mj_codegen"']);
  });
});

describe('target schema', () => {
  it('is info when the schema does not exist yet', async () => {
    const result = check((await run(readyServer({ SchemaOwner: undefined }))).Checks, 'target-schema');
    expect(result.Status).toBe('info');
  });

  it('fails when another role owns it, with ALTER SCHEMA OWNER', async () => {
    const result = check((await run(readyServer({ SchemaOwner: { Owner: 'postgres', Owned: false } }))).Checks, 'target-schema');
    expect(result.Status).toBe('fail');
    expect(result.Message).toContain('postgres');
    expect(result.Remediation.map((s) => s.Sql)).toEqual(['ALTER SCHEMA "__mj" OWNER TO "mj_codegen"']);
  });

  it('quotes an Open App schema', async () => {
    const report = await run(readyServer({ SchemaOwner: { Owner: 'postgres', Owned: false } }), [], '__mj_BizAppsCommon');
    expect(check(report.Checks, 'target-schema').Remediation[0].Sql).toBe('ALTER SCHEMA "__mj_BizAppsCommon" OWNER TO "mj_codegen"');
  });
});

describe('extensions', () => {
  const notInstalled = [
    { Name: 'pgcrypto', InstalledVersion: null, Trusted: true },
    { Name: 'uuid-ossp', InstalledVersion: null, Trusted: true },
  ];

  it('passes when no pending migration creates an extension', async () => {
    expect(check((await run(readyServer({ Extensions: [] }), [])).Checks, 'extensions').Status).toBe('pass');
  });

  it('passes for trusted extensions the login can create itself', async () => {
    expect(check((await run(readyServer({ Extensions: notInstalled }))).Checks, 'extensions').Status).toBe('pass');
  });

  it('fails for trusted extensions when the login lacks CREATE on the database', async () => {
    const server = readyServer({ Extensions: notInstalled });
    server.Session = { ...server.Session, CanCreateInDatabase: false };
    const result = check((await run(server)).Checks, 'extensions');
    expect(result.Status).toBe('fail');
    expect(result.Remediation.map((s) => s.Sql)).toEqual(['CREATE EXTENSION IF NOT EXISTS "pgcrypto"', 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"']);
  });

  it('fails for an untrusted extension unless the login is a superuser', async () => {
    const server = readyServer({ Extensions: [{ Name: 'vector', InstalledVersion: null, Trusted: false }] });
    expect(check((await run(server, ['vector'])).Checks, 'extensions').Status).toBe('fail');
    server.Session = { ...server.Session, IsSuperuser: true };
    expect(check((await run(server, ['vector'])).Checks, 'extensions').Status).toBe('pass');
  });

  it('fails for an extension the server does not offer, with a note and no SQL', async () => {
    const result = check((await run(readyServer({ Extensions: [] }), ['vector'])).Checks, 'extensions');
    expect(result.Status).toBe('fail');
    expect(result.Message).toContain('not available on this server: vector');
    expect(result.Remediation).toEqual([]);
    expect(result.Notes[0]).toContain('vector');
  });

  it('fails for an extension missing from the Azure allowlist, even for a superuser', async () => {
    const server = readyServer({ Extensions: notInstalled, AzureAllowlist: 'PGCRYPTO' });
    server.Session = { ...server.Session, IsSuperuser: true };
    const result = check((await run(server)).Checks, 'extensions');
    expect(result.Status).toBe('fail');
    expect(result.Message).toContain('not in the azure.extensions allowlist: uuid-ossp');
    expect(result.Notes[0]).toContain('--value "pgcrypto,uuid-ossp"');
    expect(result.Remediation.map((s) => s.Sql)).toEqual(['CREATE EXTENSION IF NOT EXISTS "uuid-ossp"']);
  });

  it('ignores the Azure allowlist for extensions that are already installed', async () => {
    expect(check((await run(readyServer({ AzureAllowlist: '' }))).Checks, 'extensions').Status).toBe('pass');
  });

  it('uses the installer CREATE EXTENSION statements (no drift)', async () => {
    const server = readyServer({ Extensions: notInstalled });
    server.Session = { ...server.Session, CanCreateInDatabase: false };
    const installerSql = BuildPostgresSetupSteps({ DatabaseName: 'mj_test', CodeGenUser: 'mj_codegen' }).map((s) => s.Sql);
    for (const step of check((await run(server)).Checks, 'extensions').Remediation) {
      expect(installerSql).toContain(step.Sql);
    }
  });
});

describe('TLS', () => {
  it('passes when the backend uses TLS', async () => {
    expect(check((await run(readyServer())).Checks, 'tls').Status).toBe('pass');
  });

  it('warns, never fails, for a remote host without TLS', async () => {
    const report = await run(readyServer({ Ssl: false }));
    expect(check(report.Checks, 'tls').Status).toBe('warn');
    expect(report.Passed).toBe(true);
  });

  it('is info on a loopback host', async () => {
    expect(check((await run(readyServer({ Ssl: false }), MJ_EXTENSIONS, '__mj', 'localhost')).Checks, 'tls').Status).toBe('info');
  });
});

describe('robustness', () => {
  it('turns a failing check query into a warning and keeps going', async () => {
    const report = await run(readyServer({ FailOn: 'pg_stat_ssl' }));
    expect(check(report.Checks, 'tls')).toMatchObject({ Status: 'warn', Message: expect.stringContaining('permission denied') });
    expect(check(report.Checks, 'connections').Status).toBe('info');
    expect(report.Passed).toBe(true);
  });

  it('throws when the session query fails', async () => {
    await expect(run(readyServer({ FailOn: 'current_database()' }))).rejects.toThrow('permission denied');
  });
});

describe('RenderRemediationScript', () => {
  it('combines every failed check into one numbered, de-duplicated script', async () => {
    const server = readyServer({ Roles: ['cdp_BI', 'cdp_CodeGen', 'cdp_Developer', 'cdp_Integration'], Extensions: [
      { Name: 'pgcrypto', InstalledVersion: null, Trusted: true },
      { Name: 'uuid-ossp', InstalledVersion: '1.1', Trusted: true },
    ] });
    server.Session = { ...server.Session, CanCreateInDatabase: false };
    const script = RenderRemediationScript(await run(server));
    expect(script).toContain('connected to database "mj_test"');
    expect(script).toContain('-- 1. Create group role cdp_UI\nCREATE ROLE "cdp_UI" NOLOGIN;');
    expect(script).toContain('-- 2. Let mj_codegen connect and create schemas\nGRANT CONNECT, CREATE, TEMPORARY ON DATABASE "mj_test" TO "mj_codegen";');
    expect(script).toContain('-- 3. Create extension pgcrypto\nCREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    expect(script).not.toContain('uuid-ossp');
  });
});

describe('ExtractCreatedExtensions', () => {
  it('finds quoted and bare names, de-duplicated across scripts', () => {
    const scripts = [
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto";\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
      'create extension vector;\nCREATE   EXTENSION\n IF NOT EXISTS "pgcrypto" SCHEMA public;',
    ];
    expect(ExtractCreatedExtensions(scripts)).toEqual(['pgcrypto', 'uuid-ossp', 'vector']);
  });

  it('ignores commented-out statements', () => {
    const script = '-- CREATE EXTENSION "pg_trgm";\n/* CREATE EXTENSION citext; */\nSELECT 1;';
    expect(ExtractCreatedExtensions([script])).toEqual([]);
  });

  it('folds bare names to lower case and keeps quoted case', () => {
    expect(ExtractCreatedExtensions(['CREATE EXTENSION PG_TRGM; CREATE EXTENSION "MyExt";'])).toEqual(['pg_trgm', 'MyExt']);
  });

  it('ignores DROP EXTENSION and prose', () => {
    expect(ExtractCreatedExtensions(['DROP EXTENSION IF EXISTS "pgcrypto"; -- the CREATE EXTENSION`).'])).toEqual([]);
  });
});

describe('helpers', () => {
  it('parses the Azure allowlist', () => {
    expect(ParseAllowlist(null)).toBeNull();
    expect(ParseAllowlist('')).toEqual([]);
    expect(ParseAllowlist(' PGCRYPTO , uuid-ossp,')).toEqual(['pgcrypto', 'uuid-ossp']);
  });

  it('classifies an installed extension as fine whatever the allowlist', () => {
    const session = readyServer().Session;
    expect(ClassifyExtension('pgcrypto', { Name: 'pgcrypto', InstalledVersion: '1.3', Trusted: false }, [], session)).toBeNull();
  });

  it('recognises loopback hosts', () => {
    expect(IsLoopbackHost('localhost')).toBe(true);
    expect(IsLoopbackHost('127.0.0.1')).toBe(true);
    expect(IsLoopbackHost('::1')).toBe(true);
    expect(IsLoopbackHost('mydb.postgres.database.azure.com')).toBe(false);
    expect(IsLoopbackHost(undefined)).toBe(false);
  });

  it('adapts the baseline connection helper to the preflight runner', async () => {
    const seen: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = AdaptQueryRunner({
      query: async <T,>(sql: string, params?: unknown[]): Promise<T[]> => {
        seen.push({ sql, params });
        return [{ ok: 1 } as T];
      },
    });
    expect(await runner.Query('SELECT $1', [5])).toEqual([{ ok: 1 }]);
    expect(seen).toEqual([{ sql: 'SELECT $1', params: [5] }]);
  });
});
