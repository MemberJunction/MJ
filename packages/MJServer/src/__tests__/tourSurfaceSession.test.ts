import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';

const runViewMock = vi.fn(async () => ({ Success: true, Results: [] as unknown[] }));
const mockUsers: Array<{ ID: string; Email: string; IsActive: boolean }> = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: class {
      RunView = runViewMock;
    },
    Metadata: {
      get Provider() {
        return {
          Roles: [
            { ID: '00000000-0000-4000-8000-000000000099', Name: 'Widget Guest' },
            { ID: '00000000-0000-4000-8000-000000000077', Name: 'Tour Guest' },
            { ID: '00000000-0000-4000-8000-000000000088', Name: 'UI' },
          ],
          EntityByName: (name: string) => (name === 'Users' ? { ID: 'entity-users-id' } : undefined),
        };
      },
    },
  };
});

vi.mock('../config.js', () => ({
  configInfo: {},
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    Instance: {
      get Users() {
        return mockUsers;
      },
      SYSTEM_USER_ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    },
    get Users() {
      return mockUsers;
    },
  },
}));

vi.mock('../auth/magicLink/MagicLinkService.js', () => ({
  MagicLinkService: class {},
}));

vi.mock('../agentSessions/ReturningVisitorRecap.js', () => ({
  WriteReturningVisitorRecap: async () => undefined,
}));

vi.mock('../realtimeWidget/visitorIdentity.js', () => ({
  ResolveIdentityByEmail: async () => ({ entityId: 'entity-users-id', recordId: 'user-verified-1' }),
  MergeVisitorIdentity: async () => 1,
  ForgetVisitor: async () => ({ notesArchived: 0, conversationsCleared: 0, tourRunsCleared: 1, tourRunsDeleted: 2 }),
  ClaimGuestTourRuns: async () => 2,
}));

import { WidgetSessionService } from '../realtimeWidget/WidgetSessionService.js';
import {
  EvaluateTourSurfaceMint,
  IsIsolatedTourSurfaceGuestRole,
  TOUR_SURFACE_RESOURCE_TYPE,
} from '../realtimeWidget/widgetCore.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import type { WidgetConfig } from '../config.js';
import { CreateProofOfPossessionJwt, CreateProofOfPossessionKey, type ProofOfPossessionKey } from '@memberjunction/global';

function makeConfig(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    enabled: true,
    signingReuse: 'magic-link',
    audience: 'mj-magic-link',
    anonymousEmail: 'anonymous@magic-link.local',
    defaultSessionTtlMinutes: 15,
    defaultRateLimitPerMinute: 30,
    rateLimitWindowMs: 60_000,
    voiceDefaultMaxSessionMinutes: 10,
    hostPublicKeys: {},
    ...overrides,
  };
}

describe('widgetCore — Tour Surface helpers', () => {
  it('enforces Active status, Guest/Either AuthStrategy, and AllowedOrigins', () => {
    expect(
      EvaluateTourSurfaceMint({ Status: 'Disabled', AllowedOrigins: '["https://docs.acme.com"]', AuthStrategy: 'Guest' }, 'https://docs.acme.com'),
    ).toMatchObject({ ok: false, errorCode: 'disabled' });

    expect(
      EvaluateTourSurfaceMint({ Status: 'Active', AllowedOrigins: '["https://docs.acme.com"]', AuthStrategy: 'MJ User' }, 'https://docs.acme.com'),
    ).toMatchObject({ ok: false, errorCode: 'disabled' });

    expect(
      EvaluateTourSurfaceMint({ Status: 'Active', AllowedOrigins: '["https://docs.acme.com"]', AuthStrategy: 'Either' }, 'https://evil.example'),
    ).toMatchObject({ ok: false, errorCode: 'origin_not_allowed' });

    expect(
      EvaluateTourSurfaceMint({ Status: 'Active', AllowedOrigins: '["https://docs.acme.com"]', AuthStrategy: 'Either' }, 'https://docs.acme.com'),
    ).toEqual({ ok: true });
  });

  it('allows Tour Guest, Widget Guest, and configured grantable roles only', () => {
    expect(IsIsolatedTourSurfaceGuestRole('Tour Guest', { GrantableRoleNames: [] })).toBe(true);
    expect(IsIsolatedTourSurfaceGuestRole('Widget Guest', { GrantableRoleNames: [] })).toBe(true);
    expect(IsIsolatedTourSurfaceGuestRole('UI', { GrantableRoleNames: [] })).toBe(false);
    expect(IsIsolatedTourSurfaceGuestRole('CustomSurfaceGuest', { GrantableRoleNames: ['CustomSurfaceGuest'] })).toBe(true);
  });
});

describe('WidgetSessionService — shared embed-surface guest sessions', () => {
  const SURFACE_STANDALONE_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
  const SURFACE_LINKED_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
  const LINKED_WIDGET_ID = 'cccccccc-3333-4333-8333-333333333333';
  const TOUR_GUEST_ROLE_ID = '00000000-0000-4000-8000-000000000077';
  const WIDGET_GUEST_ROLE_ID = '00000000-0000-4000-8000-000000000099';
  const UI_ROLE_ID = '00000000-0000-4000-8000-000000000088';

  let key: ProofOfPossessionKey;

  beforeEach(async () => {
    key = await CreateProofOfPossessionKey();
    MagicLinkKeyManager.Instance.Initialize();
    mockUsers.length = 0;
    mockUsers.push({ ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', Email: 'system@system.org', IsActive: true });
    runViewMock.mockReset();
    runViewMock.mockImplementation(async (params: { EntityName?: string; ExtraFilter?: string }) => {
      const f = params.ExtraFilter ?? '';
      if (params.EntityName === 'MJ: Tour Surfaces') {
        if (f.includes('ts_standalone')) {
          return {
            Success: true,
            Results: [
              {
                ID: SURFACE_STANDALONE_ID,
                SurfaceKey: 'docs.public',
                PublicKey: 'ts_standalone',
                Status: 'Active',
                AllowedOrigins: '["https://docs.acme.com"]',
                AuthStrategy: 'Guest',
                GuestRoleID: TOUR_GUEST_ROLE_ID,
                ConversationWidgetInstanceID: null,
                RateLimitPerMinute: 45,
                VisitorRetentionDays: 30,
              },
            ],
          };
        }
        if (f.includes('ts_linked')) {
          return {
            Success: true,
            Results: [
              {
                ID: SURFACE_LINKED_ID,
                SurfaceKey: 'portal.shared',
                PublicKey: 'ts_linked',
                Status: 'Active',
                AllowedOrigins: '["https://portal.acme.com"]',
                AuthStrategy: 'Either',
                GuestRoleID: null,
                ConversationWidgetInstanceID: LINKED_WIDGET_ID,
                RateLimitPerMinute: 75,
                VisitorRetentionDays: null,
              },
            ],
          };
        }
        if (f.includes('ts_bad_role')) {
          return {
            Success: true,
            Results: [
              {
                ID: SURFACE_STANDALONE_ID,
                SurfaceKey: 'bad.role',
                PublicKey: 'ts_bad_role',
                Status: 'Active',
                AllowedOrigins: '["https://docs.acme.com"]',
                AuthStrategy: 'Guest',
                GuestRoleID: UI_ROLE_ID,
                ConversationWidgetInstanceID: null,
                RateLimitPerMinute: 10,
                VisitorRetentionDays: null,
              },
            ],
          };
        }
      }
      if (params.EntityName === 'MJ: Conversation Widget Instances' && f.includes(LINKED_WIDGET_ID)) {
        return {
          Success: true,
          Results: [
            {
              ID: LINKED_WIDGET_ID,
              PublicKey: 'pk_live_linked',
              Status: 'Active',
              AllowedOrigins: '["https://portal.acme.com"]',
              Modality: 'Both',
              GuestRoleID: WIDGET_GUEST_ROLE_ID,
              ApplicationID: '44444444-4444-4444-8444-444444444444',
              PinnedAgentID: '55555555-5555-4555-8555-555555555555',
              AuthStrategy: 'Anonymous',
              SessionTTLMinutes: 15,
              RateLimitPerMinute: 60,
              RememberReturningVisitors: true,
              EnabledChannels: null,
              VoiceMaxSessionMinutes: 10,
            },
          ],
        };
      }
      return { Success: true, Results: [] };
    });
  });

  it('mints and refreshes a standalone TourSurface guest token with Tour Surface scope and VisitorKey', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    const minted = await service.MintGuestSession({
      surfaceKey: 'ts_standalone',
      origin: 'https://docs.acme.com',
      visitorKey: 'visitor_key_1234567890',
      ProofKey: key.PublicJwk,
    });

    expect(minted.success).toBe(true);
    expect(minted.surfaceId).toBe(SURFACE_STANDALONE_ID);
    expect(minted.surfaceKey).toBe('docs.public');
    expect(minted.visitorKey).toBe('visitor_key_1234567890');
    expect(minted.token).toBeDefined();

    const publicKey = createPublicKey({ key: MagicLinkKeyManager.Instance.GetJWKS().keys[0] as object, format: 'jwk' });
    const decoded = jwt.verify(minted.token!, publicKey, { algorithms: ['RS256'], audience: 'mj-magic-link' }) as jwt.JwtPayload;
    expect(decoded.mj_scopes?.[0]?.resourceType).toBe(TOUR_SURFACE_RESOURCE_TYPE);
    expect(decoded.mj_scopes?.[0]?.resourceId).toBe(SURFACE_STANDALONE_ID);
    expect(decoded.mj_role).toBe('Tour Guest');
    expect(decoded.mj_visitor_key).toBe('visitor_key_1234567890');

    const proof = await CreateProofOfPossessionJwt(key, {
      Method: 'POST',
      Url: 'https://mj.example.com/widget/session/refresh',
      AccessToken: minted.token!,
    });
    const refreshed = await service.RefreshGuestSession({
      surfaceKey: 'ts_standalone',
      origin: 'https://docs.acme.com',
      visitorKey: 'visitor_key_1234567890',
      BearerToken: minted.token,
      Proof: proof,
    });
    expect(refreshed.success).toBe(true);
    expect(refreshed.sessionId).toBe(minted.sessionId);
    expect(refreshed.surfaceId).toBe(SURFACE_STANDALONE_ID);
  });

  it('rejects non-isolated GuestRoleID on a TourSurface', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    const res = await service.MintGuestSession({
      surfaceKey: 'ts_bad_role',
      origin: 'https://docs.acme.com',
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('guest_role_not_isolated');
  });

  it('mints one shared JWT + VisitorKey when a TourSurface links to a ConversationWidgetInstanceID', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    const res = await service.MintGuestSession({
      widgetKey: 'ts_linked',
      origin: 'https://portal.acme.com',
    });

    expect(res.success).toBe(true);
    expect(res.surfaceId).toBe(SURFACE_LINKED_ID);
    expect(res.conversationWidgetInstanceId).toBe(LINKED_WIDGET_ID);
    expect(res.widgetId).toBe(LINKED_WIDGET_ID);
    expect(res.pinnedAgentId).toBe('55555555-5555-4555-8555-555555555555');
    expect(res.visitorKey).toBeDefined();

    const publicKey = createPublicKey({ key: MagicLinkKeyManager.Instance.GetJWKS().keys[0] as object, format: 'jwk' });
    const decoded = jwt.verify(res.token!, publicKey, { algorithms: ['RS256'], audience: 'mj-magic-link' }) as jwt.JwtPayload;
    expect(decoded.mj_widget_id).toBe(LINKED_WIDGET_ID);
    expect(decoded.mj_visitor_key).toBe(res.visitorKey);
  });

  it('reads RateLimitPerMinute for ts_* surface keys and passes RV4/RV5 surface privacy hooks', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    await expect(service.ResolvePerInstanceRateLimit('ts_standalone')).resolves.toBe(45);

    const resolveRes = await service.ResolveVisitorIdentity({
      SurfaceKey: 'ts_standalone',
      VisitorKey: 'visitor_key_1234567890',
      VerifiedEmail: 'ada@example.com',
      origin: 'https://docs.acme.com',
    });
    expect(resolveRes.success).toBe(true);
    expect(resolveRes.claimedTourRuns).toBe(2);

    const forgetRes = await service.ForgetVisitor({
      SurfaceKey: 'ts_standalone',
      VisitorKey: 'visitor_key_1234567890',
      origin: 'https://docs.acme.com',
    });
    expect(forgetRes.success).toBe(true);
    expect(forgetRes.tourRunsDeleted).toBe(2);
    expect(forgetRes.tourRunsCleared).toBe(1);
  });
});
