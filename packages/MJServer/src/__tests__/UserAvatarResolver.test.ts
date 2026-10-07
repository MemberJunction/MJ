import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for UserAvatarResolver.UpdateMyAvatar.
 *
 * The decorators are stubbed to no-ops (see TagGovernanceResolver.test.ts for the same shape),
 * and the provider hands back a small fake `MJ: Users` entity that tracks dirty state the way
 * BaseEntity does, so the tests can assert what the row looks like AT THE MOMENT OF SAVE.
 */

const SYSTEM_USER = { ID: 'system-user-id', Email: 'system@example.com', Type: 'Owner' };
const CALLER = { ID: 'caller-id', Email: 'caller@example.com', Type: 'User' };

/** The stored row the fake entity loads. */
const STORED_ROW: Record<string, string | null> = {
  ID: CALLER.ID,
  Name: 'caller@example.com',
  Email: 'caller@example.com',
  FirstName: 'Alice',
  Type: 'User',
  UserImageURL: 'https://example.com/old.png',
  UserImageIconClass: null,
};

class FakeUserEntity {
  public ContextUser: unknown;
  public LoadedID: string | undefined;
  public SavedSnapshot: Record<string, string | null> | undefined;
  public SavedDirtyFields: string[] = [];
  public LoadResult = true;
  public SaveResult = true;
  public SaveThrows: Error | undefined;
  public DirtyOnLoad: Record<string, string> = {};
  public LatestResult = { CompleteMessage: 'spUpdateUser failed: boom' };
  private oldValues: Record<string, string | null> = {};
  private values: Record<string, string | null> = {};

  constructor(contextUser: unknown) {
    this.ContextUser = contextUser;
  }

  async Load(id: string): Promise<boolean> {
    this.LoadedID = id;
    if (!this.LoadResult) {
      return false;
    }
    this.oldValues = { ...STORED_ROW };
    // Simulate state left dirty by something other than this resolver (a subclass hook, say).
    this.values = { ...STORED_ROW, ...this.DirtyOnLoad };
    return true;
  }

  Revert(): boolean {
    this.values = { ...this.oldValues };
    return true;
  }

  get UserImageURL(): string | null { return this.values.UserImageURL; }
  set UserImageURL(v: string | null) { this.values.UserImageURL = v; }
  get UserImageIconClass(): string | null { return this.values.UserImageIconClass; }
  set UserImageIconClass(v: string | null) { this.values.UserImageIconClass = v; }

  async Save(): Promise<boolean> {
    if (this.SaveThrows) {
      throw this.SaveThrows;
    }
    this.SavedSnapshot = { ...this.values };
    this.SavedDirtyFields = Object.keys(this.values).filter((k) => this.values[k] !== this.oldValues[k]);
    return this.SaveResult;
  }
}

const { state, logStatus, logError, scopeCheck } = vi.hoisted(() => ({
  state: {
    entity: undefined as FakeUserEntity | undefined,
    entityName: undefined as string | undefined,
    configure: undefined as ((e: FakeUserEntity) => void) | undefined,
    systemUserThrows: false,
  },
  logStatus: vi.fn(),
  logError: vi.fn(),
  scopeCheck: vi.fn(async () => undefined),
}));

vi.mock('type-graphql', () => ({
  Resolver: () => () => undefined,
  Mutation: () => () => undefined,
  Ctx: () => () => undefined,
  Arg: () => () => undefined,
  ObjectType: () => () => undefined,
  Field: () => () => undefined,
}));

vi.mock('@memberjunction/core', () => ({ LogStatus: logStatus, LogError: logError }));

vi.mock('../generic/ResolverBase.js', () => ({
  ResolverBase: class {
    CheckAPIKeyScopeAuthorization = scopeCheck;
  },
}));

vi.mock('../auth/index.js', () => ({
  GetSystemUser: async () => {
    if (state.systemUserThrows) {
      throw new Error('System user not found');
    }
    return SYSTEM_USER;
  },
}));

vi.mock('../util.js', () => ({
  GetReadWriteProvider: () => ({
    GetEntityObject: async (entityName: string, contextUser: unknown) => {
      state.entityName = entityName;
      state.entity = new FakeUserEntity(contextUser);
      state.configure?.(state.entity);
      return state.entity;
    },
  }),
}));

import { UserAvatarResolver } from '../resolvers/UserAvatarResolver.js';
import type { AppContext } from '../types.js';

function ctxFor(userRecord: unknown): AppContext {
  return { userPayload: { email: 'caller@example.com', userRecord, sessionId: 's-1' }, providers: [] } as unknown as AppContext;
}

const PNG = `data:image/png;base64,${Buffer.alloc(16, 1).toString('base64')}`;

describe('UserAvatarResolver.UpdateMyAvatar', () => {
  let resolver: UserAvatarResolver;

  beforeEach(() => {
    state.entity = undefined;
    state.entityName = undefined;
    state.configure = undefined;
    state.systemUserThrows = false;
    logStatus.mockClear();
    logError.mockClear();
    scopeCheck.mockReset();
    scopeCheck.mockImplementation(async () => undefined);
    resolver = new UserAvatarResolver();
  });

  it('refuses an unauthenticated request without touching the database', async () => {
    await expect(resolver.UpdateMyAvatar(ctxFor(undefined), PNG, null)).rejects.toThrow('not authenticated');
    expect(state.entity).toBeUndefined();
  });

  it.each([
    ['an anonymous magic-link guest (the shared Anonymous principal)', { ...CALLER, IsMagicLinkAnonymous: true }],
    ['a resource-scoped magic-link session', { ...CALLER, MagicLinkScope: { ResourceID: 'r-1', ResourceType: 'Conversation' } }],
  ])('refuses %s without touching the database', async (_label, caller) => {
    const result = await resolver.UpdateMyAvatar(ctxFor(caller), PNG, null);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('scope-limited');
    expect(state.entity).toBeUndefined();
  });

  it('runs the API key scope check as entity:update on MJ: Users, and stops if it throws', async () => {
    scopeCheck.mockImplementation(async () => {
      throw new Error('scope denied');
    });
    const ctx = ctxFor(CALLER);
    await expect(resolver.UpdateMyAvatar(ctx, PNG, null)).rejects.toThrow('scope denied');
    expect(scopeCheck).toHaveBeenCalledWith('entity:update', 'MJ: Users', ctx.userPayload);
    expect(state.entity).toBeUndefined();
  });

  it('refuses invalid input before loading anything', async () => {
    const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), 'javascript:alert(1)', null);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('http or https');
    expect(state.entity).toBeUndefined();
  });

  it("loads the CALLER's own row, taken from the request context", async () => {
    const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
    expect(result).toEqual({ Success: true });
    expect(state.entityName).toBe('MJ: Users');
    expect(state.entity?.LoadedID).toBe(CALLER.ID);
  });

  it('makes the write as the system user, and logs which user asked', async () => {
    await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
    expect(state.entity?.ContextUser).toBe(SYSTEM_USER);
    expect(logStatus).toHaveBeenCalledWith(expect.stringContaining(CALLER.ID));
  });

  it('writes the two avatar columns', async () => {
    await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
    expect(state.entity?.SavedSnapshot).toMatchObject({ UserImageURL: PNG, UserImageIconClass: null });
  });

  it('writes ONLY the two avatar columns, even when the loaded entity carried other dirty state', async () => {
    state.configure = (e) => {
      e.DirtyOnLoad = { Email: 'someone-else@example.com', FirstName: 'Mallory', Type: 'Owner' };
    };
    const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), null, 'fa-solid fa-user');
    expect(result.Success).toBe(true);
    expect(state.entity?.SavedDirtyFields.sort()).toEqual(['UserImageIconClass', 'UserImageURL']);
    expect(state.entity?.SavedSnapshot).toEqual({ ...STORED_ROW, UserImageURL: null, UserImageIconClass: 'fa-solid fa-user' });
  });

  it('clears both columns when both are null (revert to default)', async () => {
    const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), null, null);
    expect(result.Success).toBe(true);
    expect(state.entity?.SavedSnapshot).toMatchObject({ UserImageURL: null, UserImageIconClass: null });
  });

  describe('failure paths', () => {
    it('returns a failure when the row cannot be loaded', async () => {
      state.configure = (e) => {
        e.LoadResult = false;
      };
      const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
      expect(result).toEqual({ Success: false, ErrorMessage: 'Could not load your user record.' });
      expect(state.entity?.SavedSnapshot).toBeUndefined();
      expect(logError).toHaveBeenCalledWith(expect.stringContaining(CALLER.ID));
    });

    it("logs the save's CompleteMessage but returns only a generic message when Save() returns false", async () => {
      state.configure = (e) => {
        e.SaveResult = false;
      };
      const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Could not save your avatar');
      expect(result.ErrorMessage).not.toContain('spUpdateUser');
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('spUpdateUser failed: boom'));
      expect(logError).toHaveBeenCalledWith(expect.stringContaining(CALLER.ID));
    });

    it('returns a failure (does not throw) when Save() throws', async () => {
      state.configure = (e) => {
        e.SaveThrows = new Error('connection reset');
      };
      const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Could not save your avatar');
      expect(result.ErrorMessage).not.toContain('connection reset');
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('connection reset'));
    });

    it('returns a failure when the system user cannot be resolved', async () => {
      state.systemUserThrows = true;
      const result = await resolver.UpdateMyAvatar(ctxFor(CALLER), PNG, null);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).not.toContain('System user');
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('System user not found'));
      expect(state.entity).toBeUndefined();
    });
  });
});
