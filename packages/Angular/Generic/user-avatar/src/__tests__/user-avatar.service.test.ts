// Load the JIT compiler BEFORE any Angular library evaluates (see index.test.ts).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import type { MJUserEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { UserAvatarService } from '../lib/user-avatar.service';

const USER_ID = 'AAAA1111-0000-0000-0000-000000000001';
const DATA_URI = 'data:image/png;base64,AAAA';

/** The slice of GraphQLDataProvider the service touches. */
function fakeProvider(response: unknown, currentUserId = USER_ID) {
  const executeGQL = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  return { ExecuteGQL: executeGQL, CurrentUser: { ID: currentUserId } };
}

/** The slice of MJUserEntity SyncFromImageUrl touches. `Save` must never be called. */
function fakeUser(provider: ReturnType<typeof fakeProvider>) {
  return { ID: USER_ID, ProviderToUse: provider, Save: vi.fn(async () => true), Load: vi.fn(async () => true) };
}

class FakeFileReader {
  public result: string | null = null;
  public onloadend: (() => void) | null = null;
  public onerror: ((e: unknown) => void) | null = null;
  readAsDataURL(): void {
    this.result = DATA_URI;
    this.onloadend?.();
  }
}

describe('UserAvatarService', () => {
  let service: UserAvatarService;
  const http = { get: vi.fn(() => of(new Blob(['x'], { type: 'image/png' }))) };

  beforeEach(() => {
    vi.stubGlobal('FileReader', FakeFileReader);
    http.get.mockClear();
    service = new UserAvatarService(http as unknown as HttpClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('UpdateMyAvatar', () => {
    it('calls the UpdateMyAvatar mutation with both values', async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: true, ErrorMessage: null } });
      const result = await service.UpdateMyAvatar(DATA_URI, null, provider as unknown as GraphQLDataProvider);
      expect(result).toEqual({ Success: true });
      expect(provider.ExecuteGQL).toHaveBeenCalledTimes(1);
      const [query, variables] = provider.ExecuteGQL.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(query).toContain('UpdateMyAvatar(ImageURL: $ImageURL, IconClass: $IconClass)');
      expect(variables).toEqual({ ImageURL: DATA_URI, IconClass: null });
    });

    it("returns the server's message when it refuses", async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: false, ErrorMessage: 'Avatar image must be 200KB or smaller' } });
      const result = await service.UpdateMyAvatar(DATA_URI, null, provider as unknown as GraphQLDataProvider);
      expect(result).toEqual({ Success: false, ErrorMessage: 'Avatar image must be 200KB or smaller' });
    });

    it('turns a transport error into a failure instead of throwing', async () => {
      const provider = fakeProvider(new Error('Network down'));
      const result = await service.UpdateMyAvatar(null, 'fa-solid fa-user', provider as unknown as GraphQLDataProvider);
      expect(result).toEqual({ Success: false, ErrorMessage: 'Network down' });
    });
  });

  describe('SyncFromImageUrl', () => {
    it("saves through the mutation, never through the entity's Save(), and reloads the entity", async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: true } });
      const user = fakeUser(provider);
      const synced = await service.SyncFromImageUrl(user as unknown as MJUserEntity, 'https://graph.example.com/me/photo');
      expect(synced).toBe(true);
      expect(user.Save).not.toHaveBeenCalled();
      expect(provider.ExecuteGQL).toHaveBeenCalledWith(expect.any(String), { ImageURL: DATA_URI, IconClass: null });
      expect(user.Load).toHaveBeenCalledWith(USER_ID);
    });

    it('the deprecated camelCase alias takes the same path', async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: true } });
      const user = fakeUser(provider);
      expect(await service.syncFromImageUrl(user as unknown as MJUserEntity, 'https://graph.example.com/me/photo')).toBe(true);
      expect(user.Save).not.toHaveBeenCalled();
      expect(provider.ExecuteGQL).toHaveBeenCalledTimes(1);
    });

    it('returns false and leaves the entity alone when the server refuses', async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: false, ErrorMessage: 'too big' } });
      const user = fakeUser(provider);
      expect(await service.SyncFromImageUrl(user as unknown as MJUserEntity, 'https://graph.example.com/me/photo')).toBe(false);
      expect(user.Load).not.toHaveBeenCalled();
      expect(user.Save).not.toHaveBeenCalled();
    });

    it('refuses to sync a user who is not the signed-in user (the mutation only writes the caller)', async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: true } }, 'BBBB2222-0000-0000-0000-000000000002');
      const user = fakeUser(provider);
      expect(await service.SyncFromImageUrl(user as unknown as MJUserEntity, 'https://graph.example.com/me/photo')).toBe(false);
      expect(provider.ExecuteGQL).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
    });

    it('does nothing for an empty URL', async () => {
      const provider = fakeProvider({ UpdateMyAvatar: { Success: true } });
      const user = fakeUser(provider);
      expect(await service.SyncFromImageUrl(user as unknown as MJUserEntity, '  ')).toBe(false);
      expect(provider.ExecuteGQL).not.toHaveBeenCalled();
    });
  });
});
