import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../types.js';

vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator,
    Mutation: noopDecorator,
    Query: noopDecorator,
    ObjectType: noopDecorator,
    InputType: noopDecorator,
    Field: noopDecorator,
    Arg: noopDecorator,
    Ctx: noopDecorator,
  };
});

const mocks = vi.hoisted(() => ({
  getReadWriteProvider: vi.fn(),
  engineConfig: vi.fn().mockResolvedValue(undefined),
  getProvider: vi.fn(),
  providersList: [] as Array<{ ID: string; Name: string }>,
  runViewResults: [] as unknown[],
  entityById: new Map<string, Record<string, unknown>>(),
  credConfig: vi.fn().mockResolvedValue(undefined),
  getCredentialById: vi.fn(),
  getCredential: vi.fn(),
}));

vi.mock('../util.js', () => ({
  GetReadWriteProvider: mocks.getReadWriteProvider,
  GetReadOnlyProvider: mocks.getReadWriteProvider,
}));

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return {
    ...actual,
    RunView: {
      FromMetadataProvider: () => ({
        RunView: vi.fn(async () => ({
          Success: true,
          Results: mocks.runViewResults,
        })),
        RunViews: vi.fn(async (params: Array<{ EntityName: string }>) =>
          params.map((p) => {
            if (p.EntityName === 'MJ: Communication Senders') {
              return {
                Success: true,
                Results: [{ ID: 'sender-1', Name: 'Default', CommunicationProviderID: 'prov-sg', EnforcementMode: 'Enforce', ParentSenderID: null }],
              };
            }
            return { Success: true, Results: [] };
          }),
        ),
      }),
    },
  };
});

vi.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: mocks.credConfig,
      getCredentialById: mocks.getCredentialById,
      GetCredential: mocks.getCredential,
    },
  },
}));

vi.mock('@memberjunction/communication-engine', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/communication-engine')>(
    '@memberjunction/communication-engine',
  );
  return {
    ...actual,
    CommunicationEngine: {
      Instance: {
        Config: mocks.engineConfig,
        GetProvider: mocks.getProvider,
        BaseMessageTypes: [{ ID: 'chan-email', Type: 'Email' }],
        get Providers() {
          return mocks.providersList;
        },
      },
    },
  };
});

import { CommsAdminResolver } from '../resolvers/CommsAdminResolver.js';

describe('CommsAdminResolver', () => {
  const user = { ID: 'user-1', Email: 'admin@example.com', Type: 'Owner', UserRoles: [{ Role: 'Administrator' }] };
  const context = {
    userPayload: { userRecord: user },
    providers: [],
  } as unknown as AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providersList = [{ ID: 'prov-sg', Name: 'SendGrid' }];
    mocks.entityById.clear();
    mocks.runViewResults = [];
    mocks.getReadWriteProvider.mockReturnValue({
      GetEntityObject: vi.fn(async (entityName: string) => {
        if (entityName === 'MJ: Communication Consent Audit Logs') {
          return {
            Save: vi.fn(async () => true),
          };
        }
        return {
          Load: vi.fn(async (id: string) => {
            const found = mocks.entityById.get(id);
            if (!found) return false;
            Object.assign(this ?? {}, found);
            return true;
          }),
          Save: vi.fn(async () => true),
        };
      }),
    });
  });

  it('CreateCommsSendingDomain calls provider.CreateDomainAuthentication and saves Pending records', async () => {
    const domainEntity = {
      ID: 'dom-1',
      Domain: 'mail.example.com',
      CommunicationProviderID: 'prov-sg',
      Status: 'Pending',
      ProviderDomainID: null as string | null,
      DNSRecords: null as string | null,
      Save: vi.fn(async () => true),
    };
    mocks.runViewResults = [domainEntity];

    const createDomainAuth = vi.fn(async () => ({
      Success: true,
      ProviderDomainID: 'sg-dom-42',
      DNSRecords: [{ Type: 'CNAME', Purpose: 'DKIM', Host: 's1._domainkey.mail.example.com', Value: 's1.sendgrid.net', Validated: false }],
    }));
    mocks.getProvider.mockReturnValue({ CreateDomainAuthentication: createDomainAuth });

    const resolver = new CommsAdminResolver();
    const res = await resolver.CreateCommsSendingDomain('dom-1', context);

    expect(res.Success).toBe(true);
    expect(res.ProviderDomainID).toBe('sg-dom-42');
    expect(res.Status).toBe('Pending');
    expect(createDomainAuth).toHaveBeenCalledWith({ Domain: 'mail.example.com' }, undefined);
    expect(domainEntity.Save).toHaveBeenCalled();
  });

  it('CreateCommsSendingDomain resolves domain.CredentialID and passes credentials to provider', async () => {
    const domainEntity = {
      ID: 'dom-2',
      Domain: 'sub.example.com',
      CommunicationProviderID: 'prov-sg',
      CredentialID: 'cred-42',
      Status: 'Pending',
      ProviderDomainID: null as string | null,
      DNSRecords: null as string | null,
      Save: vi.fn(async () => true),
    };
    mocks.runViewResults = [domainEntity];
    mocks.getCredentialById.mockReturnValue({ ID: 'cred-42', Name: 'SendGrid Subaccount' });
    mocks.getCredential.mockResolvedValue({ values: { apiKey: 'SG.subaccount-key' } });

    const createDomainAuth = vi.fn(async () => ({
      Success: true,
      ProviderDomainID: 'sg-dom-99',
      DNSRecords: [],
    }));
    mocks.getProvider.mockReturnValue({ CreateDomainAuthentication: createDomainAuth });

    const resolver = new CommsAdminResolver();
    const res = await resolver.CreateCommsSendingDomain('dom-2', context);

    expect(res.Success).toBe(true);
    expect(createDomainAuth).toHaveBeenCalledWith({ Domain: 'sub.example.com' }, { apiKey: 'SG.subaccount-key' });
  });

  it('VerifyCommsSendingDomain marks domain Verified when provider confirms validation', async () => {
    const domainEntity = {
      ID: 'dom-1',
      Domain: 'mail.example.com',
      CommunicationProviderID: 'prov-sg',
      ProviderDomainID: 'sg-dom-42',
      Status: 'Pending',
      DNSRecords: '[]',
      LastVerifiedAt: null as Date | null,
      VerifiedAt: null as Date | null,
      Save: vi.fn(async () => true),
    };
    mocks.runViewResults = [domainEntity];

    const verifyDomainAuth = vi.fn(async () => ({
      Success: true,
      Verified: true,
      DNSRecords: [{ Type: 'CNAME', Purpose: 'DKIM', Host: 's1._domainkey.mail.example.com', Value: 's1.sendgrid.net', Validated: true }],
    }));
    mocks.getProvider.mockReturnValue({ VerifyDomainAuthentication: verifyDomainAuth });

    const resolver = new CommsAdminResolver();
    const res = await resolver.VerifyCommsSendingDomain('dom-1', context);

    expect(res.Success).toBe(true);
    expect(res.Verified).toBe(true);
    expect(res.Status).toBe('Verified');
    expect(domainEntity.VerifiedAt).toBeInstanceOf(Date);
    expect(verifyDomainAuth).toHaveBeenCalledWith(
      {
        ProviderDomainID: 'sg-dom-42',
        Domain: 'mail.example.com',
      },
      undefined,
    );
  });

  it('RevokeCommsSuppression revokes locally, writes audit log, and calls SendGrid RemoveSuppression', async () => {
    const suppEntity = {
      ID: 'supp-1',
      CommunicationEndpointID: 'ep-1',
      CommunicationSenderID: 'sender-1',
      Reason: 'Hard Bounce',
      Status: 'Active',
      RevokedAt: null as Date | null,
      Save: vi.fn(async () => true),
    };
    const epEntity = {
      ID: 'ep-1',
      NormalizedValue: 'bounced@example.com',
      Status: 'Hard Bounced',
      SoftBounceCount: 5,
      Save: vi.fn(async () => true),
    };
    const senderEntity = {
      ID: 'sender-1',
      CommunicationProviderID: 'prov-sg',
    };
    const auditSave = vi.fn(async () => true);

    mocks.getReadWriteProvider.mockReturnValue({
      GetEntityObject: vi.fn(async (entityName: string) => {
        if (entityName === 'MJ: Communication Suppressions') {
          return Object.assign(suppEntity, {
            Load: vi.fn(async () => true),
          });
        }
        if (entityName === 'MJ: Communication Endpoints') {
          return Object.assign(epEntity, {
            Load: vi.fn(async () => true),
          });
        }
        if (entityName === 'MJ: Communication Senders') {
          return Object.assign(senderEntity, {
            Load: vi.fn(async () => true),
          });
        }
        return { Save: auditSave };
      }),
    });

    const removeSuppression = vi.fn(async () => ({ Success: true }));
    mocks.getProvider.mockReturnValue({ RemoveSuppression: removeSuppression });

    const resolver = new CommsAdminResolver();
    const res = await resolver.RevokeCommsSuppression('supp-1', context);

    expect(res.Success).toBe(true);
    expect(suppEntity.Status).toBe('Revoked');
    expect(auditSave).toHaveBeenCalledTimes(1);
    expect(removeSuppression).toHaveBeenCalledWith('bounced@example.com', 'bounces');
  });

  it('SimulateCommsComplianceGate evaluates real ComplianceGate on the server', async () => {
    const resolver = new CommsAdminResolver();
    const res = await resolver.SimulateCommsComplianceGate(
      { SenderID: 'sender-1', MessageClass: 'Marketing' },
      context,
    );

    expect(res.Success).toBe(true);
    expect(res.Decision).toBe('Allowed');
    const parsed = JSON.parse(res.ResultJSON!) as { Decision: string };
    expect(parsed.Decision).toBe('Allowed');
  });

  it('rejects non-Administrator users on CommsAdminResolver operations', async () => {
    const nonAdminContext = {
      userPayload: { userRecord: { ID: 'user-2', Email: 'user@example.com', Type: 'User', UserRoles: [{ Role: 'UI' }] } },
      providers: [],
    } as unknown as AppContext;

    const resolver = new CommsAdminResolver();
    const res = await resolver.CreateCommsSendingDomain('dom-1', nonAdminContext);
    expect(res.Success).toBe(false);
    expect(res.ErrorMessage).toContain('Communications: Admin');
  });

  it('RevokeCommsSuppression does not clear downstream SendGrid lists for internal Admin Block', async () => {
    const suppEntity = {
      ID: 'supp-admin',
      CommunicationEndpointID: 'ep-1',
      CommunicationSenderID: 'sender-1',
      Reason: 'Admin Block',
      Status: 'Active',
      RevokedAt: null as Date | null,
      Save: vi.fn(async () => true),
    };
    const epEntity = {
      ID: 'ep-1',
      NormalizedValue: 'blocked@example.com',
      Status: 'Active',
      SoftBounceCount: 0,
      Save: vi.fn(async () => true),
    };
    const senderEntity = { ID: 'sender-1', CommunicationProviderID: 'prov-sg' };
    const auditSave = vi.fn(async () => true);

    mocks.getReadWriteProvider.mockReturnValue({
      GetEntityObject: vi.fn(async (entityName: string) => {
        if (entityName === 'MJ: Communication Suppressions') {
          return Object.assign(suppEntity, { Load: vi.fn(async () => true) });
        }
        if (entityName === 'MJ: Communication Endpoints') {
          return Object.assign(epEntity, { Load: vi.fn(async () => true) });
        }
        if (entityName === 'MJ: Communication Senders') {
          return Object.assign(senderEntity, { Load: vi.fn(async () => true) });
        }
        return { Save: auditSave };
      }),
    });

    const removeSuppression = vi.fn(async () => ({ Success: true }));
    mocks.getProvider.mockReturnValue({ RemoveSuppression: removeSuppression });

    const resolver = new CommsAdminResolver();
    const res = await resolver.RevokeCommsSuppression('supp-admin', context);

    expect(res.Success).toBe(true);
    expect(removeSuppression).not.toHaveBeenCalled();
  });
});
