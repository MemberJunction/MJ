import { describe, it, expect } from 'vitest';
import { UserCacheKeySegment, UserScopedCacheKey } from '../util/UserScopedCacheKey';

describe('UserCacheKeySegment', () => {
  it('normalizes the user ID so the same user always maps to one segment', () => {
    expect(UserCacheKeySegment(' A1B2-C3D4 ')).toBe('u:a1b2-c3d4');
    expect(UserCacheKeySegment('a1b2-c3d4')).toBe('u:a1b2-c3d4');
  });

  it('returns null when there is no user, so the caller does not cache', () => {
    expect(UserCacheKeySegment(undefined)).toBeNull();
    expect(UserCacheKeySegment(null)).toBeNull();
    expect(UserCacheKeySegment('  ')).toBeNull();
  });
});

describe('UserScopedCacheKey', () => {
  it('gives two users different keys for the same entry', () => {
    const a = UserScopedCacheKey('user-a', 'agent-1', 'Customers');
    const b = UserScopedCacheKey('user-b', 'agent-1', 'Customers');
    expect(a).toBe('agent-1:Customers:u:user-a');
    expect(a).not.toBe(b);
  });

  it('returns null when there is no user', () => {
    expect(UserScopedCacheKey(undefined, 'agent-1', 'Customers')).toBeNull();
  });
});
