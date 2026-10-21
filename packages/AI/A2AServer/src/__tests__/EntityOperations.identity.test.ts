import { describe, it, expect, beforeEach, vi } from 'vitest';

const { settings, cachedUsers, mockRunView, mockGetEntityObject } = vi.hoisted(() => {
  const settings: { userEmail?: string } = {};
  const cachedUsers = [
    { ID: 'user-first', Email: 'first@example.com', Name: 'First Cached User' },
    { ID: 'user-configured', Email: 'Configured@Example.com', Name: 'Configured User' },
  ];
  const mockRunView = vi.fn().mockResolvedValue({ Success: true, Results: [] });
  const mockGetEntityObject = vi.fn();
  return { settings, cachedUsers, mockRunView, mockGetEntityObject };
});

vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  EntityInfo: class {},
  Metadata: class {},
  UserInfo: class {},
  CompositeKey: class {},
  RunQuery: class {},
  LogError: vi.fn(),
  // Field security is covered in EntityOperations.fieldSecurity.test.ts; here it passes rows through.
  ProjectEntityValueRowsForUser: <T,>(_provider: object, _entity: object, rows: T): T => rows,
  RunView: class {
    RunView = mockRunView;
  },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { Users: cachedUsers } },
}));

vi.mock('../config.js', () => ({
  a2aServerSettings: settings,
}));

import { EntityOperations } from '../EntityOperations';

const provider = {
  Entities: [{ Name: 'Contacts', ClassName: 'Contact', PrimaryKeys: [{ Name: 'ID' }] }],
  GetEntityObject: mockGetEntityObject,
};

function makeOps(): EntityOperations {
  return new EntityOperations(provider as never);
}

describe('EntityOperations identity', () => {
  beforeEach(() => {
    delete settings.userEmail;
    mockRunView.mockClear();
    mockGetEntityObject.mockClear();
  });

  it('refuses every operation when no user email is configured, instead of running as an arbitrary cached user', async () => {
    const ops = makeOps();
    for (const operation of ['get', 'create', 'update', 'delete', 'query']) {
      const result = await ops.ProcessOperation(operation, 'Contacts', { ID: '1' });
      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/userEmail/);
    }
    expect(mockRunView).not.toHaveBeenCalled();
    expect(mockGetEntityObject).not.toHaveBeenCalled();
  });

  it('refuses when the configured user email does not resolve to a cached user', async () => {
    settings.userEmail = 'nobody@example.com';
    const result = await makeOps().QueryEntity('Contacts', {});
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/nobody@example\.com/);
    expect(mockRunView).not.toHaveBeenCalled();
  });

  it('runs as the configured user when the email resolves (case-insensitive)', async () => {
    settings.userEmail = 'configured@example.com';
    const result = await makeOps().QueryEntity('Contacts', {});
    expect(result.success).toBe(true);
    expect(mockRunView).toHaveBeenCalledTimes(1);
    expect(mockRunView.mock.calls[0][1]).toBe(cachedUsers[1]);
  });
});
