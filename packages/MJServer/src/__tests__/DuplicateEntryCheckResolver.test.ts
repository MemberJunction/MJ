// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** The slice of `APIKeyEngine.Authorize` that ResolverBase.CheckAPIKeyScopeAuthorization calls. */
type AuthorizeFn = (
  apiKeyHash: string,
  application: string,
  scopePath: string,
  resource: string
) => Promise<{ Allowed: boolean; Reason: string }>;

const { mockAuthorize } = vi.hoisted(() => ({ mockAuthorize: vi.fn<AuthorizeFn>() }));

// As in RunDecisionResolver.test.ts: vitest's esbuild transform does not apply
// `emitDecoratorMetadata`, so the decorators are no-ops and the resolver runs as a plain class.
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
    ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
    Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
    Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
    createUnionType: () => class {},
    AuthorizationError: class AuthorizationError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = 'AuthorizationError';
      }
    },
    Float: class {}, Int: class {}, ID: class {},
  };
});

// Only the API-key engine is replaced; ResolverBase's scope check itself is the production code.
vi.mock('@memberjunction/api-keys', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, GetAPIKeyEngine: () => ({ Authorize: mockAuthorize }) };
});

// The resolver's tests replace the detector through CreateEntryChecker, so the detector package
// is never exercised here; it has its own specs.
vi.mock('@memberjunction/ai-vector-dupe', () => ({ DuplicateRecordDetector: class {} }));

import { EntityInfo, Metadata, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { DuplicateEntryCheckResult } from '@memberjunction/ai-vector-dupe';
import { DuplicateEntryCheckResolver, type DuplicateEntryChecker } from '../resolvers/DuplicateEntryCheckResolver.js';
import type { UserPayload } from '../types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER = new UserInfo(null, {
  ID: 'user-1',
  Name: 'Entry Person',
  Email: 'person@example.com',
  UserRoles: [{ UserID: 'user-1', RoleID: 'role-ui' }],
});
const SYSTEM_USER = new UserInfo(null, { ID: 'user-system', Name: 'System', Email: 'system@example.com' });

/** An entity the user's role may read. */
const ACCOUNTS = new EntityInfo({
  ID: 'entity-accounts',
  Name: 'Accounts',
  Status: 'Active',
  Fields: [
    { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
    { Name: 'Name', Type: 'nvarchar', IsNameField: true },
    { Name: 'City', Type: 'nvarchar' },
  ],
  EntityPermissions: [{ RoleID: 'role-ui', CanRead: true }],
});

/** An entity only another role may read. */
const PAYROLL = new EntityInfo({
  ID: 'entity-payroll',
  Name: 'Payroll',
  Status: 'Active',
  Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }],
  EntityPermissions: [{ RoleID: 'role-finance', CanRead: true }],
});

const CHECKED: DuplicateEntryCheckResult = {
  Status: 'Checked',
  Candidates: [{ RecordID: 'acct-7', DisplayName: 'Acme Corp', VectorScore: 0.93, Probability: 0.81 }],
  ElapsedMs: 212,
};

/** A session authenticated by JWT: no API key, so no scope check. */
const sessionPayload = (): UserPayload => ({ email: USER.Email, userRecord: USER, sessionId: 'session-1' });
/** A session authenticated by an MJ API key: scope-checked. */
const apiKeyPayload = (): UserPayload => ({ ...sessionPayload(), apiKeyId: 'key-1', apiKeyHash: 'hash-1' });

/** The resolver with its detector replaced by a double. */
class TestResolver extends DuplicateEntryCheckResolver {
  public readonly Checker = { CheckRecordValues: vi.fn<DuplicateEntryChecker['CheckRecordValues']>() };

  protected override CreateEntryChecker(): DuplicateEntryChecker {
    return this.Checker;
  }
}

let resolver: TestResolver;

const check = (entityName: string, valuesJSON: string, payload: UserPayload = sessionPayload()) =>
  resolver.RunEntryCheck(entityName, valuesJSON, payload, null);

beforeEach(() => {
  vi.restoreAllMocks();
  mockAuthorize.mockReset();
  vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation((name: string) =>
    [ACCOUNTS, PAYROLL].find(e => e.Name.toLowerCase() === name.trim().toLowerCase())
  );
  vi.spyOn(UserCache.prototype, 'GetSystemUser').mockReturnValue(SYSTEM_USER);
  resolver = new TestResolver();
  resolver.Checker.CheckRecordValues.mockResolvedValue(CHECKED);
});

// ─── Authorization ───────────────────────────────────────────────────────────

describe('CheckDuplicateEntry: authorization', () => {
  it('denies a user who cannot read the entity, before the check runs', async () => {
    const result = await check('Payroll', '{"ID":"x"}');

    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toContain('does not have read permissions on Payroll');
    expect(result.Candidates).toEqual([]);
    expect(resolver.Checker.CheckRecordValues).not.toHaveBeenCalled();
  });

  it('fails an unknown entity without running the check', async () => {
    const result = await check('No Such Entity', '{}');

    expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: 'Entity not found in metadata' });
    expect(resolver.Checker.CheckRecordValues).not.toHaveBeenCalled();
  });

  it('applies the view:run API-key scope for the entity, and a denial is a status', async () => {
    mockAuthorize.mockResolvedValue({ Allowed: false, Reason: 'scope not granted' });

    const result = await check('Accounts', '{"Name":"Acme"}', apiKeyPayload());

    const scopeCalls = mockAuthorize.mock.calls.filter(call => call[2] !== 'full_access');
    expect(scopeCalls.map(call => [call[2], call[3]])).toEqual([['view:run', 'Accounts']]);
    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toContain("requires the 'view:run' scope");
    expect(resolver.Checker.CheckRecordValues).not.toHaveBeenCalled();
  });
});

// ─── The values ──────────────────────────────────────────────────────────────

describe('CheckDuplicateEntry: the values', () => {
  it('returns an error status, not a throw, for values that are not JSON', async () => {
    const result = await check('Accounts', '{ Name: ');

    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toMatch(/^valuesJSON is not valid JSON: /);
    expect(resolver.Checker.CheckRecordValues).not.toHaveBeenCalled();
  });

  it('returns an error status for JSON that is not an object', async () => {
    const result = await check('Accounts', '["Acme"]');

    expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: 'valuesJSON must be the JSON of an object of field values' });
  });

  it('ignores the fields the entity does not have, and keys the rest by the real field name', async () => {
    await check('Accounts', JSON.stringify({ name: 'Acme', City: 'Boston', Revenue: 5, NotAField: 'x' }));

    expect(resolver.Checker.CheckRecordValues).toHaveBeenCalledWith('Accounts', { Name: 'Acme', City: 'Boston' }, USER);
  });
});

// ─── The result ──────────────────────────────────────────────────────────────

describe('CheckDuplicateEntry: the result', () => {
  it('returns the detector result', async () => {
    const result = await check('Accounts', '{"Name":"Acme"}');

    expect(result).toEqual({
      Status: 'Checked',
      ErrorMessage: undefined,
      Candidates: [{ RecordID: 'acct-7', DisplayName: 'Acme Corp', VectorScore: 0.93, Probability: 0.81 }],
      ElapsedMs: 212,
    });
  });

  it('passes NotConfigured through', async () => {
    resolver.Checker.CheckRecordValues.mockResolvedValue({ Status: 'NotConfigured', Candidates: [], ElapsedMs: 3 });

    const result = await check('Accounts', '{"Name":"Acme"}');

    expect(result).toMatchObject({ Status: 'NotConfigured', Candidates: [] });
  });

  it('returns Failed, not a throw, when the check throws', async () => {
    resolver.Checker.CheckRecordValues.mockRejectedValue(new Error('vector index unreachable'));

    const result = await check('Accounts', '{"Name":"Acme"}');

    expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: 'vector index unreachable', Candidates: [] });
  });
});
