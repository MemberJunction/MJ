import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { resolveWidgetGuestRunContext, elevateUserPayload } from '../widget/widgetGuestElevation.js';
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
