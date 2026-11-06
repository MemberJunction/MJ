// ---------------------------------------------------------------------------
// Fakes for node:net (TCP probe) and pg (Client)
// ---------------------------------------------------------------------------

interface FakeQueryResult {
  rowCount: number;
}

/** Shared state the fakes report into; reset before each test. */
const state = vi.hoisted(() => ({
  sockets: [] as Array<{ emit: (event: string, ...args: unknown[]) => boolean; connect: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>,
  clients: [] as Array<{
    Config: Record<string, unknown>;
    Queries: Array<{ Sql: string; Params?: string[] }>;
    Connected: boolean;
    Ended: boolean;
  }>,
  connectError: null as (Error & { code?: string }) | null,
  failSql: null as string | null,
  existing: new Set<string>(),
}));

vi.mock('node:net', () => {
  /** Minimal socket: records listeners so tests can fire connect / error / timeout. */
  class FakeSocket {
    private listeners = new Map<string, (...args: unknown[]) => void>();
    connect = vi.fn();
    setTimeout = vi.fn();
    destroy = vi.fn();
    constructor() {
      state.sockets.push(this);
    }
    on(event: string, handler: (...args: unknown[]) => void): this {
      this.listeners.set(event, handler);
      return this;
    }
    removeAllListeners(): this {
      return this;
    }
    emit(event: string, ...args: unknown[]): boolean {
      const handler = this.listeners.get(event);
      handler?.(...args);
      return handler !== undefined;
    }
  }
  return { default: { Socket: FakeSocket } };
});

vi.mock('pg', () => {
  class FakeClient {
    private record: (typeof state.clients)[number];
    constructor(config: Record<string, unknown>) {
      this.record = { Config: config, Queries: [], Connected: false, Ended: false };
      state.clients.push(this.record);
    }
    async connect(): Promise<void> {
      if (state.connectError) throw state.connectError;
      this.record.Connected = true;
    }
    async query(sql: string, params?: string[]): Promise<FakeQueryResult> {
      this.record.Queries.push({ Sql: sql, Params: params });
      if (state.failSql !== null && sql === state.failSql) throw new Error('permission denied');
      if (params && params.length > 0) return { rowCount: state.existing.has(params[0]) ? 1 : 0 };
      return { rowCount: 0 };
    }
    async end(): Promise<void> {
      this.record.Ended = true;
    }
    on(): this {
      return this;
    }
  }
  return { default: { Client: FakeClient } };
});

import { PostgresAdapter, PgStepError, type PgSetupStep } from '../adapters/PostgresAdapter.js';

const server = { Host: 'localhost', Port: 5433, User: 'postgres', Password: 'admin' };

describe('PostgresAdapter', () => {
  let adapter: PostgresAdapter;

  beforeEach(() => {
    adapter = new PostgresAdapter();
    state.sockets.length = 0;
    state.clients.length = 0;
    state.connectError = null;
    state.failSql = null;
    state.existing = new Set<string>();
  });

  describe('CheckConnectivity', () => {
    it('is a TCP probe: reachable when the socket connects, and no SQL client is created', async () => {
      const promise = adapter.CheckConnectivity('localhost', 5433);
      state.sockets[0].emit('connect');

      const result = await promise;

      expect(result.Reachable).toBe(true);
      expect(state.sockets[0].connect).toHaveBeenCalledWith(5433, 'localhost');
      expect(state.sockets[0].destroy).toHaveBeenCalled();
      expect(state.clients).toHaveLength(0);
    });

    it('reports a refused connection in PostgreSQL terms', async () => {
      const promise = adapter.CheckConnectivity('localhost', 5433);
      const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      state.sockets[0].emit('error', err);

      const result = await promise;

      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toBe('Connection refused at localhost:5433. Is PostgreSQL running?');
    });

    it('reports a timeout', async () => {
      const promise = adapter.CheckConnectivity('db', 5432, 100);
      state.sockets[0].emit('timeout');

      expect((await promise).ErrorMessage).toBe('Connection timed out after 100ms');
    });
  });

  describe('TryLogin', () => {
    it('connects to the requested database and always closes the client', async () => {
      const result = await adapter.TryLogin({ ...server, Database: 'mj' });

      expect(result).toEqual({ Ok: true, LoginRejected: false });
      expect(state.clients[0].Config).toMatchObject({ host: 'localhost', port: 5433, database: 'mj', user: 'postgres', password: 'admin' });
      expect(state.clients[0].Ended).toBe(true);
    });

    for (const [code, meaning] of [
      ['28P01', 'wrong password'],
      ['28000', 'role does not exist'],
      ['3D000', 'database does not exist'],
      ['42501', 'no CONNECT privilege'],
    ] as const) {
      it(`treats SQLSTATE ${code} (${meaning}) as "not set up" and closes the client`, async () => {
        state.connectError = Object.assign(new Error(`${meaning}.`), { code });

        const result = await adapter.TryLogin({ ...server, Database: 'mj' });

        expect(result).toEqual({ Ok: false, LoginRejected: true, ErrorMessage: meaning });
        expect(state.clients[0].Ended).toBe(true);
      });
    }

    it('treats other failures (TLS, network) as "cannot tell"', async () => {
      state.connectError = Object.assign(new Error('The server does not support SSL connections'), { code: undefined });

      const result = await adapter.TryLogin({ ...server, Database: 'mj' });

      expect(result.Ok).toBe(false);
      expect(result.LoginRejected).toBe(false);
      expect(state.clients[0].Ended).toBe(true);
    });
  });

  describe('ExecuteSteps', () => {
    const steps: PgSetupStep[] = [
      { Database: 'postgres', Description: 'scs', Sql: 'SET standard_conforming_strings = on' },
      { Database: 'postgres', Description: 'db', Sql: 'CREATE DATABASE "mj"', SkipIf: { Sql: 'SELECT 1 FROM pg_database WHERE datname = $1', Param: 'mj' } },
      { Database: 'postgres', Description: 'role', Sql: `CREATE ROLE "cg" LOGIN PASSWORD 'x'`, SkipIf: { Sql: 'SELECT 1 FROM pg_roles WHERE rolname = $1', Param: 'cg' } },
      { Database: 'mj', Description: 'schema', Sql: 'CREATE SCHEMA IF NOT EXISTS "__mj"' },
    ];

    it('runs each statement as its own query, switching connection when the database changes', async () => {
      const messages: string[] = [];

      await adapter.ExecuteSteps(server, steps, (m) => messages.push(m));

      expect(state.clients.map((c) => c.Config.database)).toEqual(['postgres', 'mj']);
      expect(state.clients[0].Queries.map((q) => q.Sql)).toEqual([
        'SET standard_conforming_strings = on',
        'SELECT 1 FROM pg_database WHERE datname = $1',
        'CREATE DATABASE "mj"',
        'SELECT 1 FROM pg_roles WHERE rolname = $1',
        `CREATE ROLE "cg" LOGIN PASSWORD 'x'`,
      ]);
      expect(state.clients[0].Queries[1].Params).toEqual(['mj']);
      expect(state.clients[1].Queries.map((q) => q.Sql)).toEqual(['CREATE SCHEMA IF NOT EXISTS "__mj"']);
      expect(state.clients.every((c) => c.Ended)).toBe(true);
      expect(messages).toContain('Done: db');
    });

    it('skips a step whose existence check finds a row', async () => {
      state.existing.add('mj');
      const messages: string[] = [];

      await adapter.ExecuteSteps(server, steps, (m) => messages.push(m));

      expect(state.clients[0].Queries.map((q) => q.Sql)).not.toContain('CREATE DATABASE "mj"');
      expect(messages).toContain('Skipped (already exists): db');
    });

    it('throws PgStepError for the failing step, runs nothing after it, and closes the connection', async () => {
      state.failSql = `CREATE ROLE "cg" LOGIN PASSWORD 'x'`;

      const error = await adapter.ExecuteSteps(server, steps, () => undefined).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(PgStepError);
      expect((error as PgStepError).StepNumber).toBe(3);
      expect((error as PgStepError).StepDescription).toBe('role');
      expect(state.clients).toHaveLength(1);
      expect(state.clients[0].Ended).toBe(true);
    });

    it('closes the client when connecting fails', async () => {
      state.connectError = Object.assign(new Error('password authentication failed'), { code: '28P01' });

      await expect(adapter.ExecuteSteps(server, steps, () => undefined)).rejects.toBeInstanceOf(PgStepError);
      expect(state.clients[0].Ended).toBe(true);
    });
  });
});
