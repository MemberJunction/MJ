import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';

// Controls what UserCache.Instance.GetSystemUser() serves — undefined simulates an unpopulated
// cache (no system user available), the fail-closed path.
const getSystemUserMock = vi.fn<[], UserInfo | undefined>();
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    get Instance() {
      return { GetSystemUser: getSystemUserMock };
    },
  },
}));

import {
  resolveWidgetGuestRunContext,
  elevateUserPayload,
  ResolveScopedAnonymousRunUser,
} from '../realtimeWidget/widgetGuestElevation.js';
import type { UserPayload } from '../types.js';

/** A provider stub — the guard paths under test return before ever touching the provider. */
const providerStub = {} as DatabaseProviderBase;

/** Builds a UserPayload whose synthesized userRecord carries the given guest flags. */
function payloadWith(userRecord: Partial<UserInfo>): UserPayload {
  return { email: 'anonymous@magic-link.local', userRecord, sessionId: 'sess-123' };
}

describe('widgetGuestElevation — resolveWidgetGuestRunContext (guard paths, no DB)', () => {
  it('returns null for a normal authenticated user (not anonymous)', async () => {
    const result = await resolveWidgetGuestRunContext(payloadWith({ IsMagicLinkAnonymous: false }), providerStub);
    expect(result).toBeNull();
  });

  it('returns null for an anonymous magic-link session that is NOT a widget guest (no WidgetGuestContext)', async () => {
    const result = await resolveWidgetGuestRunContext(
      payloadWith({ IsMagicLinkAnonymous: true, WidgetGuestContext: undefined }),
      providerStub,
    );
    expect(result).toBeNull();
  });

  it('returns null when userRecord is absent', async () => {
    const result = await resolveWidgetGuestRunContext({ email: '', userRecord: undefined, sessionId: 's' }, providerStub);
    expect(result).toBeNull();
  });
});

describe('widgetGuestElevation — ResolveScopedAnonymousRunUser (issue #3371)', () => {
  const systemUser = { ID: 'system-1', Email: 'system@system.org' } as UserInfo;

  /** Builds a UserInfo carrying the given per-session guest flags. */
  function userWith(flags: Partial<UserInfo>): UserInfo {
    return { ID: 'anon-1', Email: 'anonymous@magic-link.local', ...flags } as UserInfo;
  }

  beforeEach(() => {
    getSystemUserMock.mockReset();
    getSystemUserMock.mockReturnValue(systemUser);
  });

  it('returns the caller unchanged for a normal authenticated user', () => {
    const named = userWith({ IsMagicLinkAnonymous: false, MagicLinkScope: { ResourceID: 'res-1' } });
    expect(ResolveScopedAnonymousRunUser(named)).toBe(named);
    expect(getSystemUserMock).not.toHaveBeenCalled();
  });

  it('returns the caller unchanged for an anonymous session with no resource scope', () => {
    const unscoped = userWith({ IsMagicLinkAnonymous: true, MagicLinkScope: undefined });
    expect(ResolveScopedAnonymousRunUser(unscoped)).toBe(unscoped);
    expect(getSystemUserMock).not.toHaveBeenCalled();
  });

  it('returns the caller unchanged for a scoped anonymous session with an empty ResourceID', () => {
    const emptyScope = userWith({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: '' } });
    expect(ResolveScopedAnonymousRunUser(emptyScope)).toBe(emptyScope);
  });

  it('returns the caller unchanged for a PUBLIC WEB-WIDGET guest (widget guests keep their own path)', () => {
    const widgetGuest = userWith({
      IsMagicLinkAnonymous: true,
      MagicLinkScope: { ResourceID: 'res-1' },
      WidgetGuestContext: { WidgetID: 'widget-1' },
    });
    expect(ResolveScopedAnonymousRunUser(widgetGuest)).toBe(widgetGuest);
    expect(getSystemUserMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED to the caller when no system user is available', () => {
    getSystemUserMock.mockReturnValue(undefined);
    const scopedAnon = userWith({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'res-1' } });
    expect(ResolveScopedAnonymousRunUser(scopedAnon)).toBe(scopedAnon);
  });

  it('returns the SYSTEM user for a scoped anonymous (non-widget) magic-link session', () => {
    const scopedAnon = userWith({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'res-1' } });
    expect(ResolveScopedAnonymousRunUser(scopedAnon)).toBe(systemUser);
  });
});

describe('widgetGuestElevation — elevateUserPayload', () => {
  it('swaps in the elevated principal while preserving the guest sessionId for PubSub routing', () => {
    const guestPayload = payloadWith({ IsMagicLinkAnonymous: true });
    const systemUser = { Email: 'system@system.org' } as UserInfo;

    const elevated = elevateUserPayload(guestPayload, systemUser);

    expect(elevated.userRecord).toBe(systemUser);
    expect(elevated.email).toBe('system@system.org');
    expect(elevated.isSystemUser).toBe(true);
    // The session id MUST be preserved so progress/streaming still routes to the guest's websocket.
    expect(elevated.sessionId).toBe('sess-123');
  });

  it('does not mutate the original guest payload', () => {
    const guestPayload = payloadWith({ IsMagicLinkAnonymous: true });
    const systemUser = { Email: 'system@system.org' } as UserInfo;

    elevateUserPayload(guestPayload, systemUser);

    expect(guestPayload.isSystemUser).toBeUndefined();
    expect(guestPayload.email).toBe('anonymous@magic-link.local');
  });
});
