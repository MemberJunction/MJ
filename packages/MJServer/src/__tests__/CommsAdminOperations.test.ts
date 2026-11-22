import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import {
  CommsBlockEndpointServerOperation,
  CommsRevokeSuppressionServerOperation,
  CommsVerifySendingDomainServerOperation,
} from '../operations/CommsAdminOperations.js';

function makeUser(overrides: Partial<{ ID: string; Type: string; UserRoles: Array<{ RoleName: string; RoleID: string }> }> = {}): UserInfo {
  return {
    ID: overrides.ID ?? 'user-1',
    Type: overrides.Type ?? 'User   ',
    UserRoles: overrides.UserRoles ?? [],
  } as unknown as UserInfo;
}

function makeProvider(authorizations: Array<{ Name: string; Roles?: Array<{ RoleID: string; Type: 'Allow' | 'Deny' }> }> = []): IMetadataProvider {
  return {
    Authorizations: authorizations.map((a) => {
      const info = new AuthorizationInfo({
        ID: 'auth-comms-1',
        Name: a.Name,
        IsActive: true,
        UseParent: false,
        ParentID: null,
      });
      const roles = (a.Roles ?? []).map(
        (r) => new AuthorizationRoleInfo({ AuthorizationID: 'auth-comms-1', RoleID: r.RoleID, Type: r.Type }),
      );
      Object.defineProperty(info, 'Roles', { get: () => roles });
      return info;
    }),
    GetEntityObject: vi.fn(),
  } as unknown as IMetadataProvider;
}

describe('CommsAdminOperations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CommunicationEngine.Instance, 'Config').mockResolvedValue();
  });

  it('authorizes Owner (with nchar trailing spaces) and Communications: Admin role, and rejects ordinary users', async () => {
    const op = new CommsBlockEndpointServerOperation();
    const provider = makeProvider([
      { Name: 'Communications: Admin', Roles: [{ RoleID: 'role-dev', Type: 'Allow' }] },
    ]);
    const owner = makeUser({ Type: 'Owner     ' });
    const dev = makeUser({ Type: 'User ', UserRoles: [{ RoleID: 'role-dev', RoleName: 'Developer' }] });
    const ordinary = makeUser({ Type: 'User ', UserRoles: [{ RoleID: 'role-ui', RoleName: 'UI' }] });

    const run = async (u: UserInfo) =>
      op.ExecuteServer({ EndpointID: 'ep-missing' }, { provider, user: u, emitProgress: vi.fn() });

    // Owner and Developer pass Authorize() (and hit Entity load returning Found: false / not found)
    vi.spyOn(provider, 'GetEntityObject').mockResolvedValue({
      Load: vi.fn().mockResolvedValue(false),
    } as never);

    const ownerRes = await run(owner);
    expect(ownerRes.Success).toBe(true);
    expect(ownerRes.Output?.Success).toBe(false);

    const devRes = await run(dev);
    expect(devRes.Success).toBe(true);
    expect(devRes.Output?.Success).toBe(false);

    const ordRes = await run(ordinary);
    expect(ordRes.Success).toBe(false);
    expect(ordRes.ErrorMessage).toContain('Communications: Admin');
  });

  it('CommsVerifySendingDomain merges DNS validation without wiping existing Host/Value', async () => {
    const op = new CommsVerifySendingDomainServerOperation();
    const existingRecords = [
      { Type: 'CNAME', Host: 'em123.example.com', Value: 'u123.wl.sendgrid.net', Purpose: 'SPF', Validated: false },
      { Type: 'CNAME', Host: 's1._domainkey.example.com', Value: 's1.domainkey.u123.wl.sendgrid.net', Purpose: 'DKIM', Validated: false },
    ];
    const domainEntity = {
      ID: 'dom-1',
      Domain: 'example.com',
      CommunicationProviderID: 'prov-sg',
      ProviderDomainID: 'sg-dom-1',
      CredentialID: null,
      Status: 'Pending',
      DNSRecords: JSON.stringify(existingRecords),
      LastVerifiedAt: null as Date | null,
      VerifiedAt: null as Date | null,
      Save: vi.fn().mockResolvedValue(true),
    };
    const provider = makeProvider();
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: true,
      Results: [domainEntity],
    } as never);
    Object.defineProperty(CommunicationEngine.Instance, 'Providers', {
      configurable: true,
      get: () => [{ ID: 'prov-sg', Name: 'SendGrid' }],
    });
    vi.spyOn(CommunicationEngine.Instance, 'GetProvider').mockReturnValue({
      VerifyDomainAuthentication: vi.fn().mockResolvedValue({
        Success: true,
        Verified: true,
        DNSRecords: [
          { Type: 'CNAME', Host: '', Value: '', Purpose: 'SPF', Validated: true },
          { Type: 'CNAME', Host: '', Value: '', Purpose: 'DKIM', Validated: true },
        ],
      }),
    } as never);

    const res = await op.ExecuteServer(
      { DomainID: 'dom-1' },
      { provider, user: makeUser({ Type: 'Owner' }), emitProgress: vi.fn() },
    );
    expect(res.Success).toBe(true);
    expect(res.Output?.Success).toBe(true);
    expect(res.Output?.Verified).toBe(true);
    const merged = JSON.parse(res.Output?.DNSRecordsJSON ?? '[]') as Array<{ Host: string; Value: string; Validated: boolean }>;
    expect(merged[0]).toMatchObject({ Host: 'em123.example.com', Value: 'u123.wl.sendgrid.net', Validated: true });
    expect(merged[1]).toMatchObject({ Host: 's1._domainkey.example.com', Value: 's1.domainkey.u123.wl.sendgrid.net', Validated: true });
  });

  it('CommsBlockEndpoint creates Admin Block suppression and append-only consent audit log server-side', async () => {
    const op = new CommsBlockEndpointServerOperation();
    const savedEntities: Array<{ entity: string; record: Record<string, unknown> }> = [];
    const provider = makeProvider();
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({ Success: true, Results: [] } as never);

    vi.spyOn(provider, 'GetEntityObject').mockImplementation(async (name: string) => {
      if (name === 'MJ: Communication Endpoints') {
        return {
          ID: 'ep-1',
          BaseMessageTypeID: 'chan-email',
          Load: vi.fn().mockResolvedValue(true),
        } as never;
      }
      const rec: Record<string, unknown> = { ID: `${name}-id-1` };
      rec.Save = vi.fn().mockImplementation(async () => {
        savedEntities.push({ entity: name, record: { ...rec } });
        return true;
      });
      return rec as never;
    });

    const res = await op.ExecuteServer(
      { EndpointID: 'ep-1' },
      { provider, user: makeUser({ ID: 'admin-42', Type: 'Owner' }), emitProgress: vi.fn() },
    );

    expect(res.Success).toBe(true);
    expect(res.Output?.Success).toBe(true);
    expect(savedEntities).toHaveLength(2);
    expect(savedEntities[0].entity).toBe('MJ: Communication Suppressions');
    expect(savedEntities[0].record).toMatchObject({
      CommunicationEndpointID: 'ep-1',
      BaseMessageTypeID: 'chan-email',
      Reason: 'Admin Block',
      Source: 'Admin',
      Status: 'Active',
    });
    expect(savedEntities[1].entity).toBe('MJ: Communication Consent Audit Logs');
    expect(savedEntities[1].record).toMatchObject({
      Action: 'Created',
      Source: 'Admin',
      ChangedByUserID: 'admin-42',
    });
  });

  it('CommsRevokeSuppression revokes suppression, writes audit log, and restores endpoint', async () => {
    const op = new CommsRevokeSuppressionServerOperation();
    const suppEntity = {
      ID: 'supp-1',
      CommunicationEndpointID: 'ep-1',
      CommunicationSenderID: null,
      Reason: 'Admin Block',
      Status: 'Active',
      RevokedAt: null as Date | null,
      Load: vi.fn().mockResolvedValue(true),
      Save: vi.fn().mockResolvedValue(true),
    };
    const endpointEntity = {
      ID: 'ep-1',
      NormalizedValue: 'user@example.com',
      Status: 'Complained',
      SoftBounceCount: 2,
      Load: vi.fn().mockResolvedValue(true),
      Save: vi.fn().mockResolvedValue(true),
    };
    const auditEntity = {
      CommunicationSuppressionID: null as string | null,
      Action: '',
      PreviousValue: null as string | null,
      NewValue: null as string | null,
      Source: '',
      ChangedByUserID: null as string | null,
      Save: vi.fn().mockResolvedValue(true),
    };

    const provider = makeProvider();
    vi.spyOn(provider, 'GetEntityObject').mockImplementation(async (name: string) => {
      if (name === 'MJ: Communication Suppressions') return suppEntity as never;
      if (name === 'MJ: Communication Endpoints') return endpointEntity as never;
      return auditEntity as never;
    });
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [] } as never);

    const res = await op.ExecuteServer(
      { SuppressionID: 'supp-1' },
      { provider, user: makeUser({ ID: 'admin-42', Type: 'Owner' }), emitProgress: vi.fn() },
    );

    expect(res.Success).toBe(true);
    expect(res.Output?.Success).toBe(true);
    expect(suppEntity.Status).toBe('Revoked');
    expect(auditEntity.Action).toBe('Revoked');
    expect(endpointEntity.Status).toBe('Active');
    expect(endpointEntity.SoftBounceCount).toBe(0);
  });
});
