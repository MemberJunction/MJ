/**
 * Communications admin Remote Operations (`operations/CommsAdminOperations.ts`): who may run them,
 * and what each one does when a dependency fails.
 *
 * Authorization under test (`assertCommsAdmin`):
 *   - no user: refused (`UNAUTHORIZED`);
 *   - an Owner (`User.Type` is `nchar(15)`, so it arrives space-padded): allowed;
 *   - anyone else must hold the "Communications: Admin" authorization, directly or through an
 *     ancestor, on the operation's provider (`FORBIDDEN` otherwise). MJ seeds no role named
 *     "Administrator"; metadata/ grants the authorization to the Developer role.
 *
 * The doubles fail the way the real system does: `RunView` returns `Success: false`, `Save()` and
 * `Load()` return false (with `LatestResult.CompleteMessage`), providers return `Success: false`
 * or throw, and the credential engine throws.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseRemotableOperation, RemoteOpResult, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import type { BaseMessageResult, CreateDomainAuthResult, DomainDNSRecord, VerifyDomainAuthResult } from '@memberjunction/communication-types';
import { CommsFakes, FakeMetadataProvider, FakeViews, FilterValue, MakeFakeEntity, type FakeEntity, type FakeEntityBehaviour } from './commsTestFakes.js';
import { COMMS_ADMIN_AUTHORIZATION_ID, DEVELOPER_ROLE_ID, MakeAuthorization, MakeGrant, MakeUser, UI_ROLE_ID } from './commsTestUsers.js';

const state = vi.hoisted(() => ({
  engineConfigCalls: [] as Array<{ User: object; Provider: object }>,
  /** Provider instances by name, as `CommunicationEngine.GetProvider(name)` returns them. */
  providerInstances: new Map<string, object>(),
  providerEntities: [] as Array<{ ID: string; Name: string }>,
  credentials: [] as Array<{ ID: string; Name: string }>,
  /** Resolves a credential's values by name, or throws like the real engine does. */
  resolveCredential: (name: string): { values: Record<string, string> } => {
    throw new Error(`Credential not found: ${name}`);
  },
  credentialRequests: [] as Array<{ Name: string; ContextUser: object | undefined }>,
}));

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  const fakes = await import('./commsTestFakes.js');
  return { ...actual, RunView: fakes.CommsFakes.Views.AsRunViewClass() };
});

vi.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: async () => undefined,
      getCredentialById: (id: string) => state.credentials.find((c) => c.ID === id),
      GetCredential: async (name: string, options?: { contextUser?: object }) => {
        state.credentialRequests.push({ Name: name, ContextUser: options?.contextUser });
        return state.resolveCredential(name);
      },
    },
  },
}));

vi.mock('@memberjunction/communication-engine', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/communication-engine')>('@memberjunction/communication-engine');
  return {
    ...actual,
    CommunicationEngine: {
      Instance: {
        Config: async (_force: boolean, user: object, provider: object) => {
          state.engineConfigCalls.push({ User: user, Provider: provider });
        },
        GetProvider: (name: string) => {
          const instance = state.providerInstances.get(name);
          if (!instance) {
            throw new Error(`Provider ${name} not found.`);
          }
          return instance;
        },
        BaseMessageTypes: [{ ID: 'chan-email', Type: 'Email' }],
        get Providers() {
          return state.providerEntities;
        },
      },
    },
  };
});

import {
  CommsBlockEndpointServerOperation,
  CommsCreateSendingDomainServerOperation,
  CommsDeleteSendingDomainServerOperation,
  CommsRevokeSuppressionServerOperation,
  CommsSimulateComplianceGateServerOperation,
  CommsVerifySendingDomainServerOperation,
} from '../operations/CommsAdminOperations.js';

// ─── Users ───────────────────────────────────────────────────────────────────

// `User.Type` is nchar(15): the database returns it space-padded.
const OWNER = MakeUser({ ID: 'user-owner', Name: 'Olive', Email: 'olive@example.com', Type: 'Owner          ' });
const DEVELOPER = MakeUser({ ID: 'user-dev', Name: 'Dana', Email: 'dana@example.com', Type: 'User           ' }, [
  { RoleID: DEVELOPER_ROLE_ID, Role: 'Developer' },
]);
const UI_USER = MakeUser({ ID: 'user-ui', Name: 'Pat', Email: 'pat@example.com', Type: 'User           ' }, [{ RoleID: UI_ROLE_ID, Role: 'UI' }]);

// ─── Fixtures ────────────────────────────────────────────────────────────────

type DomainFields = Pick<
  MJCommunicationSendingDomainEntity,
  'ID' | 'Domain' | 'CommunicationProviderID' | 'CredentialID' | 'Status' | 'ProviderDomainID' | 'DNSRecords' | 'LastVerifiedAt' | 'VerifiedAt'
>;
type SuppressionFields = Pick<MJCommunicationSuppressionEntity, 'ID' | 'CommunicationEndpointID' | 'CommunicationSenderID' | 'Reason' | 'Status' | 'RevokedAt'>;
type EndpointFields = Pick<MJCommunicationEndpointEntity, 'ID' | 'NormalizedValue' | 'Status' | 'SoftBounceCount' | 'BaseMessageTypeID'>;
type SenderFields = Pick<MJCommunicationSenderEntity, 'ID' | 'CommunicationProviderID' | 'CredentialID'>;

const DKIM_RECORD: DomainDNSRecord = {
  Type: 'CNAME',
  Purpose: 'DKIM',
  Host: 's1._domainkey.mail.example.com',
  Value: 's1.domainkey.u1.wl.sendgrid.net',
  Validated: false,
};

/** A SendGrid-shaped provider double whose every operation can be made to fail or throw. */
function makeCommsProvider() {
  return {
    CreateDomainAuthentication: vi.fn(
      async (): Promise<CreateDomainAuthResult> => ({ Success: true, ProviderDomainID: 'sg-dom-42', DNSRecords: [DKIM_RECORD] }),
    ),
    VerifyDomainAuthentication: vi.fn(
      async (): Promise<VerifyDomainAuthResult> => ({ Success: true, Verified: true, DNSRecords: [{ ...DKIM_RECORD, Validated: true }] }),
    ),
    DeleteDomainAuthentication: vi.fn(async (): Promise<BaseMessageResult> => ({ Success: true })),
    RemoveSuppression: vi.fn(async (): Promise<BaseMessageResult> => ({ Success: true })),
  };
}

let provider: FakeMetadataProvider;
let sendGrid: ReturnType<typeof makeCommsProvider>;
const views: FakeViews = CommsFakes.Views;

/** Who an operation runs as. Omit the argument for the default admin; pass `undefined` for "no user". */
type Caller = [user?: UserInfo | undefined];
const callerOf = (caller: Caller): UserInfo | undefined => (caller.length > 0 ? caller[0] : DEVELOPER);

/** Runs an operation the way the server does: as `user`, on `onProvider`. */
function run<TInput, TOutput>(
  operation: BaseRemotableOperation<TInput, TOutput>,
  input: TInput,
  user: UserInfo | undefined,
  onProvider: FakeMetadataProvider | null,
): Promise<RemoteOpResult<TOutput>> {
  const context = { provider: onProvider?.AsProvider(), user, emitProgress: () => undefined };
  return operation.ExecuteServer(input, context as RemoteOpServerContext);
}

const create = (domainID: string, ...caller: Caller) => run(new CommsCreateSendingDomainServerOperation(), { DomainID: domainID }, callerOf(caller), provider);
const verify = (domainID: string, ...caller: Caller) => run(new CommsVerifySendingDomainServerOperation(), { DomainID: domainID }, callerOf(caller), provider);
const remove = (domainID: string, ...caller: Caller) => run(new CommsDeleteSendingDomainServerOperation(), { DomainID: domainID }, callerOf(caller), provider);
const revoke = (suppressionID: string, ...caller: Caller) =>
  run(new CommsRevokeSuppressionServerOperation(), { SuppressionID: suppressionID }, callerOf(caller), provider);
const block = (endpointID: string, ...caller: Caller) => run(new CommsBlockEndpointServerOperation(), { EndpointID: endpointID }, callerOf(caller), provider);
const simulate = (input: { SenderID: string; MessageClass: string; PrincipalID?: string; RecordID?: string }, ...caller: Caller) =>
  run(new CommsSimulateComplianceGateServerOperation(), input, callerOf(caller), provider);

function makeDomain(overrides: Partial<DomainFields> = {}, behaviour: Partial<FakeEntityBehaviour> = {}): FakeEntity<DomainFields> {
  return MakeFakeEntity<DomainFields>(
    {
      ID: 'dom-1',
      Domain: 'mail.example.com',
      CommunicationProviderID: 'prov-sg',
      CredentialID: null,
      Status: 'Pending',
      ProviderDomainID: null,
      DNSRecords: null,
      LastVerifiedAt: null,
      VerifiedAt: null,
      ...overrides,
    },
    behaviour,
  );
}

/** Serves `domain` from the sending-domain view only when the filter names its ID, like the real view. */
function serveDomain(domain: FakeEntity<DomainFields>): void {
  views.Serve('MJ: Communication Sending Domains', (params) => (FilterValue(params, 'ID') === domain.ID ? [domain] : []));
}

/** Grants "Communications: Admin" to the Developer role, as metadata/authorization-roles seeds it. */
function seedCommsAdminAuthorization(): void {
  const commsAdmin = MakeAuthorization(provider, { ID: COMMS_ADMIN_AUTHORIZATION_ID, Name: 'Communications: Admin' });
  provider.Authorizations = [commsAdmin];
  provider.AuthorizationRoles = [MakeGrant('Allow', commsAdmin, DEVELOPER_ROLE_ID)];
}

beforeEach(() => {
  views.Reset();
  provider = new FakeMetadataProvider('request-provider');
  seedCommsAdminAuthorization();
  sendGrid = makeCommsProvider();
  state.engineConfigCalls = [];
  state.providerInstances = new Map<string, object>([['SendGrid', sendGrid]]);
  state.providerEntities = [{ ID: 'prov-sg', Name: 'SendGrid' }];
  state.credentials = [];
  state.credentialRequests = [];
  state.resolveCredential = (name: string) => {
    throw new Error(`Credential not found: ${name}`);
  };
});

// ─── Authorization ───────────────────────────────────────────────────────────

describe('Communications admin operations: authorization', () => {
  /** Every operation, called with arguments that would reach its work for an authorized caller. */
  const operations: Array<[string, (user: UserInfo | undefined) => Promise<RemoteOpResult<{ Success: boolean }>>]> = [
    ['Communications.SimulateComplianceGate', (u) => simulate({ SenderID: 'sender-1', MessageClass: 'Marketing' }, u)],
    ['Communications.CreateSendingDomain', (u) => create('dom-1', u)],
    ['Communications.VerifySendingDomain', (u) => verify('dom-1', u)],
    ['Communications.DeleteSendingDomain', (u) => remove('dom-1', u)],
    ['Communications.RevokeSuppression', (u) => revoke('supp-1', u)],
    ['Communications.BlockEndpoint', (u) => block('ep-1', u)],
  ];

  function expectNothingTouched(): void {
    expect(state.engineConfigCalls).toHaveLength(0);
    expect(views.Calls).toHaveLength(0);
    expect(provider.Requests).toHaveLength(0);
    expect(sendGrid.CreateDomainAuthentication).not.toHaveBeenCalled();
    expect(sendGrid.DeleteDomainAuthentication).not.toHaveBeenCalled();
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
  }

  it.each(operations)('%s refuses a call with no user before reading anything', async (_key, call) => {
    const res = await call(undefined);

    expect(res).toEqual({ Success: false, ResultCode: 'UNAUTHORIZED', ErrorMessage: 'Authentication required' });
    expectNothingTouched();
  });

  it.each(operations)('%s refuses a non-owner without the authorization before reading anything', async (_key, call) => {
    const res = await call(UI_USER);

    expect(res.Success).toBe(false);
    expect(res.ResultCode).toBe('FORBIDDEN');
    expect(res.ErrorMessage).toContain('"Communications: Admin" authorization required');
    expect(res.Output).toBeUndefined();
    expectNothingTouched();
  });

  it.each(operations)('%s lets a padded Owner through to its work', async (_key, call) => {
    provider.Authorizations = [];
    provider.AuthorizationRoles = [];

    const res = await call(OWNER);

    // Authorized: the operation ran and answered for itself (here, that its record was not found).
    expect(res.ResultCode).toBe('SUCCESS');
    expect(res.Output).toBeDefined();
  });

  it('allows an Owner whose Type arrives space-padded from the nchar(15) column, with no roles at all', async () => {
    provider.Authorizations = [];
    provider.AuthorizationRoles = [];
    serveDomain(makeDomain());

    const res = await create('dom-1', OWNER);

    expect(OWNER.Type).toBe('Owner          ');
    expect(OWNER.UserRoles).toEqual([]);
    expect(res.Output?.Success).toBe(true);
  });

  it('allows a non-owner whose role is granted "Communications: Admin" directly', async () => {
    serveDomain(makeDomain());

    const res = await create('dom-1', DEVELOPER);

    expect(res.Output?.Success).toBe(true);
  });

  it('allows a non-owner whose role is granted an ancestor of "Communications: Admin"', async () => {
    const parent = MakeAuthorization(provider, { ID: 'A11C0000-0000-4000-8000-0000000000A1', Name: 'Communications' });
    const commsAdmin = MakeAuthorization(provider, {
      ID: COMMS_ADMIN_AUTHORIZATION_ID,
      Name: 'Communications: Admin',
      ParentID: parent.ID,
    });
    provider.Authorizations = [parent, commsAdmin];
    provider.AuthorizationRoles = [MakeGrant('Allow', parent, UI_ROLE_ID)];
    serveDomain(makeDomain());

    const res = await create('dom-1', UI_USER);

    expect(res.Output?.Success).toBe(true);
  });

  it('refuses a non-owner whose only "admin" is a role named Administrator, which MJ does not seed or grant', async () => {
    const legacyAdmin = MakeUser({ ID: 'user-legacy', Name: 'Lee', Email: 'lee@example.com', Type: 'User           ' }, [
      { RoleID: 'A11C0000-0000-4000-8000-0000000000F1', Role: 'Administrator' },
    ]);

    const res = await create('dom-1', legacyAdmin);

    expect(res).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
  });

  it('refuses a non-owner when one of their roles is denied the authorization, even if another allows it', async () => {
    const both = MakeUser({ ID: 'user-both', Name: 'Bo', Email: 'bo@example.com', Type: 'User           ' }, [
      { RoleID: DEVELOPER_ROLE_ID, Role: 'Developer' },
      { RoleID: UI_ROLE_ID, Role: 'UI' },
    ]);
    provider.AuthorizationRoles.push(MakeGrant('Deny', provider.Authorizations[0], UI_ROLE_ID));

    expect(await create('dom-1', both)).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
  });

  it('refuses a granted non-owner when the authorization is inactive', async () => {
    const inactive = MakeAuthorization(provider, { ID: COMMS_ADMIN_AUTHORIZATION_ID, Name: 'Communications: Admin', IsActive: false });
    provider.Authorizations = [inactive];
    provider.AuthorizationRoles = [MakeGrant('Allow', inactive, DEVELOPER_ROLE_ID)];

    expect(await create('dom-1', DEVELOPER)).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
  });

  it('refuses every non-owner when the authorization is not seeded on the provider', async () => {
    provider.Authorizations = [];
    provider.AuthorizationRoles = [];

    expect(await create('dom-1', DEVELOPER)).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
  });

  it('refuses a non-owner when the call carries no provider to read authorizations from', async () => {
    const res = await run(new CommsCreateSendingDomainServerOperation(), { DomainID: 'dom-1' }, DEVELOPER, null);

    expect(res).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
  });

  it("reads the grant from the operation's own provider, not from another one", async () => {
    const other = new FakeMetadataProvider('another-server');
    serveDomain(makeDomain());

    const res = await run(new CommsCreateSendingDomainServerOperation(), { DomainID: 'dom-1' }, DEVELOPER, other);

    expect(res).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
  });

  it('matches the authorization name and the role grant that metadata/ ships', () => {
    const metadataDir = fileURLToPath(new URL('../../../../metadata/', import.meta.url));
    const authorizations = JSON.parse(readFileSync(`${metadataDir}authorizations/.comms-authorizations.json`, 'utf8')) as Array<{
      fields: { Name: string; IsActive: boolean };
      primaryKey: { ID: string };
    }>;
    const grants = JSON.parse(readFileSync(`${metadataDir}authorization-roles/.comms-authorization-roles.json`, 'utf8')) as Array<{
      fields: { AuthorizationID: string; RoleID: string; Type: string };
    }>;

    expect(authorizations.map((a) => a.fields)).toEqual([expect.objectContaining({ Name: 'Communications: Admin', IsActive: true })]);
    expect(authorizations[0].primaryKey.ID).toBe(COMMS_ADMIN_AUTHORIZATION_ID);
    // The grant must name a role MJ actually seeds; there is no "Administrator" role.
    expect(grants.map((g) => g.fields)).toEqual([
      { AuthorizationID: '@lookup:MJ: Authorizations.Name=Communications: Admin', RoleID: '@lookup:MJ: Roles.Name=Developer', Type: 'Allow' },
    ]);
  });
});

// ─── Communications.CreateSendingDomain ──────────────────────────────────────

describe('Communications.CreateSendingDomain', () => {
  it('creates the domain with the provider, saves the DNS records as Pending, and runs as the requesting user', async () => {
    const domain = makeDomain();
    serveDomain(domain);

    const res = await create('dom-1');

    expect(res.Output).toEqual({
      Success: true,
      Status: 'Pending',
      ProviderDomainID: 'sg-dom-42',
      DNSRecordsJSON: JSON.stringify([DKIM_RECORD]),
    });
    expect(sendGrid.CreateDomainAuthentication).toHaveBeenCalledWith({ Domain: 'mail.example.com' }, undefined);
    expect(domain.SaveCalls).toBe(1);
    // Data is read as the caller on the operation's provider, never as a system user.
    expect(state.engineConfigCalls).toEqual([{ User: DEVELOPER, Provider: provider }]);
    expect(views.Calls.map((c) => c.User)).toEqual([DEVELOPER]);
    expect(views.Calls[0].Provider).toBe(provider);
  });

  it('resolves the domain credential as the requesting user and hands the API key to the provider', async () => {
    serveDomain(makeDomain({ CredentialID: 'cred-42' }));
    state.credentials = [{ ID: 'cred-42', Name: 'SendGrid Subaccount' }];
    state.resolveCredential = () => ({ values: { apiKey: 'SG.subaccount-key' } });

    const res = await create('dom-1');

    expect(res.Output?.Success).toBe(true);
    expect(state.credentialRequests).toEqual([{ Name: 'SendGrid Subaccount', ContextUser: DEVELOPER }]);
    expect(sendGrid.CreateDomainAuthentication).toHaveBeenCalledWith({ Domain: 'mail.example.com' }, { apiKey: 'SG.subaccount-key' });
  });

  it('reports not-found for an unknown domain without calling the provider', async () => {
    serveDomain(makeDomain());

    const res = await create('dom-missing');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: "Sending domain 'dom-missing' not found" });
    expect(sendGrid.CreateDomainAuthentication).not.toHaveBeenCalled();
  });

  it('fails without calling the provider when the domain view fails', async () => {
    views.Fail('MJ: Communication Sending Domains', 'Timeout expired');

    const res = await create('dom-1');

    expect(res.Output?.Success).toBe(false);
    expect(sendGrid.CreateDomainAuthentication).not.toHaveBeenCalled();
  });

  // DEFECT CommsAdminOperations.ts, loadSendingDomain: a failed RunView is folded into "no
  // rows", so a database error is reported to the admin as "Sending domain '<id>' not found" and
  // the RunView ErrorMessage is dropped. Create, Verify and Delete all go through it.
  it('reports the view error, not "not found", when the domain view fails', async () => {
    views.Fail('MJ: Communication Sending Domains', 'Timeout expired');

    const res = await create('dom-1');

    const message = res.Output?.ErrorMessage ?? res.ErrorMessage;
    expect(message).toContain('Timeout expired');
    expect(message).not.toContain('not found');
  });

  it('fails when the domain points at a provider the engine does not know', async () => {
    serveDomain(makeDomain({ CommunicationProviderID: 'prov-gone' }));

    expect((await create('dom-1')).Output).toEqual({ Success: false, ErrorMessage: 'Communication provider not found for sending domain' });
  });

  it('returns the provider error and saves nothing when the provider refuses', async () => {
    const domain = makeDomain();
    serveDomain(domain);
    sendGrid.CreateDomainAuthentication.mockResolvedValue({ Success: false, ErrorMessage: 'domain already exists', DNSRecords: [] });

    const res = await create('dom-1');

    expect(res.Output).toEqual({
      Success: false,
      Status: 'Pending',
      ProviderDomainID: undefined,
      DNSRecordsJSON: '[]',
      ErrorMessage: 'domain already exists',
    });
    expect(domain.SaveCalls).toBe(0);
    expect(domain.ProviderDomainID).toBeNull();
  });

  it('returns an execution error and saves nothing when the provider throws', async () => {
    const domain = makeDomain();
    serveDomain(domain);
    sendGrid.CreateDomainAuthentication.mockRejectedValue(new Error('ECONNRESET'));

    const res = await create('dom-1');

    expect(res).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'ECONNRESET' });
    expect(domain.SaveCalls).toBe(0);
  });

  it('returns the save error when the domain cannot be saved after the provider created it', async () => {
    const domain = makeDomain({}, { SaveSucceeds: false, SaveError: 'Status is not a valid value' });
    serveDomain(domain);

    const res = await create('dom-1');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: 'Status is not a valid value' });
    expect(sendGrid.CreateDomainAuthentication).toHaveBeenCalledTimes(1);
  });

  it('does not call the provider when resolving the credential throws', async () => {
    serveDomain(makeDomain({ CredentialID: 'cred-42' }));
    state.credentials = [{ ID: 'cred-42', Name: 'SendGrid Subaccount' }];
    state.resolveCredential = () => {
      throw new Error('Credential "SendGrid Subaccount" has expired');
    };

    const res = await create('dom-1');

    expect(res).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'Credential "SendGrid Subaccount" has expired' });
    expect(sendGrid.CreateDomainAuthentication).not.toHaveBeenCalled();
  });

  // DEFECT CommsAdminOperations.ts, resolveDomainCredentials (`if (!cred) return undefined`): when the domain names a
  // CredentialID the credential engine does not hold (deleted, inactive, not visible), the function
  // returns undefined and the provider is called with no credentials, so it falls back to the
  // process-wide API key and creates the domain in the wrong provider account.
  it('does not call the provider with default credentials when the domain names a credential that cannot be found', async () => {
    serveDomain(makeDomain({ CredentialID: 'cred-deleted' }));
    state.credentials = [];

    const res = await create('dom-1');

    expect(sendGrid.CreateDomainAuthentication).not.toHaveBeenCalled();
    expect(res.Output?.Success ?? res.Success).toBe(false);
  });
});

// ─── Communications.VerifySendingDomain ──────────────────────────────────────

describe('Communications.VerifySendingDomain', () => {
  it('marks the domain Verified, stamps both dates, and merges the validated DNS records', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42', DNSRecords: JSON.stringify([DKIM_RECORD]) });
    serveDomain(domain);

    const res = await verify('dom-1');

    expect(res.Output).toMatchObject({ Success: true, Verified: true, Status: 'Verified' });
    expect(domain.VerifiedAt).toBeInstanceOf(Date);
    expect(domain.LastVerifiedAt).toBeInstanceOf(Date);
    expect(JSON.parse(res.Output?.DNSRecordsJSON ?? '[]')).toEqual([{ ...DKIM_RECORD, Validated: true }]);
    expect(sendGrid.VerifyDomainAuthentication).toHaveBeenCalledWith({ ProviderDomainID: 'sg-dom-42', Domain: 'mail.example.com' }, undefined);
    expect(domain.SaveCalls).toBe(1);
  });

  it('refuses a domain that was never created with the provider, without calling it', async () => {
    const domain = makeDomain({ ProviderDomainID: null });
    serveDomain(domain);

    const res = await verify('dom-1');

    expect(res.Output?.Success).toBe(false);
    expect(res.Output?.ErrorMessage).toContain('has not been created with the provider');
    expect(sendGrid.VerifyDomainAuthentication).not.toHaveBeenCalled();
    expect(domain.SaveCalls).toBe(0);
  });

  it('keeps the domain Pending when the provider answers but DNS is not valid yet', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42' });
    serveDomain(domain);
    sendGrid.VerifyDomainAuthentication.mockResolvedValue({ Success: true, Verified: false, DNSRecords: [] });

    const res = await verify('dom-1');

    expect(res.Output).toMatchObject({ Success: true, Verified: false, Status: 'Pending' });
    expect(domain.VerifiedAt).toBeNull();
  });

  it('marks the domain Failed and returns the provider error when the provider call fails', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42' });
    serveDomain(domain);
    sendGrid.VerifyDomainAuthentication.mockResolvedValue({ Success: false, Verified: false, DNSRecords: [], ErrorMessage: 'SendGrid 500' });

    const res = await verify('dom-1');

    expect(res.Output).toMatchObject({ Success: false, Verified: false, Status: 'Failed', ErrorMessage: 'SendGrid 500' });
    expect(domain.Status).toBe('Failed');
    expect(domain.SaveCalls).toBe(1);
  });

  it('returns an execution error and leaves the domain unsaved when the provider throws', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42' });
    serveDomain(domain);
    sendGrid.VerifyDomainAuthentication.mockRejectedValue(new Error('socket hang up'));

    const res = await verify('dom-1');

    expect(res).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'socket hang up' });
    expect(domain.SaveCalls).toBe(0);
    expect(domain.Status).toBe('Pending');
  });

  it('returns the save error when the verification result cannot be saved', async () => {
    serveDomain(makeDomain({ ProviderDomainID: 'sg-dom-42' }, { SaveSucceeds: false, SaveError: 'permission denied' }));

    expect((await verify('dom-1')).Output).toEqual({ Success: false, ErrorMessage: 'permission denied' });
  });

  it('fails without calling the provider when the domain view fails', async () => {
    views.Fail('MJ: Communication Sending Domains');

    const res = await verify('dom-1');

    expect(res.Output?.Success).toBe(false);
    expect(sendGrid.VerifyDomainAuthentication).not.toHaveBeenCalled();
  });
});

// ─── Communications.DeleteSendingDomain ──────────────────────────────────────

describe('Communications.DeleteSendingDomain', () => {
  it('deletes the provider-side domain and marks the row Revoked', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42', Status: 'Verified' });
    serveDomain(domain);

    const res = await remove('dom-1');

    expect(res.Output).toEqual({ Success: true });
    expect(sendGrid.DeleteDomainAuthentication).toHaveBeenCalledWith({ ProviderDomainID: 'sg-dom-42' }, undefined);
    expect(domain.Status).toBe('Revoked');
    expect(domain.SaveCalls).toBe(1);
  });

  it('skips the provider for a domain that was never created there', async () => {
    const domain = makeDomain({ ProviderDomainID: null });
    serveDomain(domain);

    const res = await remove('dom-1');

    expect(res.Output).toEqual({ Success: true });
    expect(sendGrid.DeleteDomainAuthentication).not.toHaveBeenCalled();
    expect(domain.Status).toBe('Revoked');
  });

  it('leaves the row untouched when the provider refuses to delete', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42', Status: 'Verified' });
    serveDomain(domain);
    sendGrid.DeleteDomainAuthentication.mockResolvedValue({ Success: false, ErrorMessage: 'domain is in use' });

    const res = await remove('dom-1');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: 'domain is in use' });
    expect(domain.Status).toBe('Verified');
    expect(domain.SaveCalls).toBe(0);
  });

  it('returns an execution error and leaves the row untouched when the provider throws', async () => {
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42', Status: 'Verified' });
    serveDomain(domain);
    sendGrid.DeleteDomainAuthentication.mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await remove('dom-1');

    expect(res).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'ETIMEDOUT' });
    expect(domain.Status).toBe('Verified');
    expect(domain.SaveCalls).toBe(0);
  });

  it('returns the save error when the Revoked status cannot be saved', async () => {
    serveDomain(makeDomain({ ProviderDomainID: 'sg-dom-42' }, { SaveSucceeds: false, SaveError: 'row is locked' }));

    expect((await remove('dom-1')).Output).toEqual({ Success: false, ErrorMessage: 'row is locked' });
  });

  it('reports not-found for an unknown domain', async () => {
    expect((await remove('dom-missing')).Output).toEqual({ Success: false, ErrorMessage: "Sending domain 'dom-missing' not found" });
  });

  it('marks the row Revoked without deleting anything at the provider when the engine does not know the provider', async () => {
    // FLAG CommsDeleteSendingDomainServerOperation (`if (providerEntity)`): the provider-side domain is left behind, silently.
    const domain = makeDomain({ ProviderDomainID: 'sg-dom-42', CommunicationProviderID: 'prov-gone' });
    serveDomain(domain);

    const res = await remove('dom-1');

    expect(res.Output).toEqual({ Success: true });
    expect(sendGrid.DeleteDomainAuthentication).not.toHaveBeenCalled();
    expect(domain.Status).toBe('Revoked');
  });
});

// ─── Communications.RevokeSuppression ────────────────────────────────────────

describe('Communications.RevokeSuppression', () => {
  interface RevokeFixture {
    suppression: FakeEntity<SuppressionFields>;
    endpoint: FakeEntity<EndpointFields>;
    sender: FakeEntity<SenderFields>;
  }

  /** A hard-bounce suppression on an endpoint, sent by a SendGrid sender. */
  function seedRevoke(
    options: {
      suppression?: Partial<SuppressionFields>;
      suppressionBehaviour?: Partial<FakeEntityBehaviour>;
      endpoint?: Partial<EndpointFields>;
      endpointBehaviour?: Partial<FakeEntityBehaviour>;
      sender?: Partial<SenderFields>;
      senderBehaviour?: Partial<FakeEntityBehaviour>;
      auditBehaviour?: Partial<FakeEntityBehaviour>;
    } = {},
  ): RevokeFixture {
    const suppression = MakeFakeEntity<SuppressionFields>(
      {
        ID: 'supp-1',
        CommunicationEndpointID: 'ep-1',
        CommunicationSenderID: 'sender-1',
        Reason: 'Hard Bounce',
        Status: 'Active',
        RevokedAt: null,
        ...options.suppression,
      },
      options.suppressionBehaviour,
    );
    const endpoint = MakeFakeEntity<EndpointFields>(
      { ID: 'ep-1', NormalizedValue: 'bounced@example.com', Status: 'Hard Bounced', SoftBounceCount: 5, BaseMessageTypeID: 'chan-email', ...options.endpoint },
      options.endpointBehaviour,
    );
    const sender = MakeFakeEntity<SenderFields>(
      { ID: 'sender-1', CommunicationProviderID: 'prov-sg', CredentialID: null, ...options.sender },
      options.senderBehaviour,
    );
    provider.Provide('MJ: Communication Suppressions', () => suppression);
    provider.Provide('MJ: Communication Endpoints', () => endpoint);
    provider.Provide('MJ: Communication Senders', () => sender);
    provider.Provide('MJ: Communication Consent Audit Logs', () => MakeFakeEntity({}, options.auditBehaviour));
    return { suppression, endpoint, sender };
  }

  const auditLogs = () => provider.Created('MJ: Communication Consent Audit Logs');

  it('revokes the suppression, writes the audit row, clears the provider list, and restores the endpoint', async () => {
    const { suppression, endpoint } = seedRevoke();

    const res = await revoke('supp-1');

    expect(res.Output).toEqual({ Success: true, WarningMessage: undefined });
    expect(suppression.Status).toBe('Revoked');
    expect(suppression.RevokedAt).toBeInstanceOf(Date);
    expect(auditLogs()).toHaveLength(1);
    expect(auditLogs()[0]).toMatchObject({
      CommunicationSuppressionID: 'supp-1',
      Action: 'Revoked',
      PreviousValue: JSON.stringify({ Status: 'Active' }),
      NewValue: JSON.stringify({ Status: 'Revoked' }),
      Source: 'Admin',
      ChangedByUserID: DEVELOPER.ID,
      SaveCalls: 1,
    });
    expect(sendGrid.RemoveSuppression.mock.calls[0].slice(0, 2)).toEqual(['bounced@example.com', 'bounces']);
    expect(endpoint).toMatchObject({ Status: 'Active', SoftBounceCount: 0, SaveCalls: 1 });
    // Every entity is created for the requesting user.
    expect(provider.Requests.every((r) => r.User === DEVELOPER)).toBe(true);
  });

  it('reports not-found and changes nothing when the suppression does not load', async () => {
    const { suppression } = seedRevoke({ suppressionBehaviour: { LoadSucceeds: false } });

    const res = await revoke('supp-missing');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: "Suppression 'supp-missing' not found" });
    expect(suppression.SaveCalls).toBe(0);
    expect(auditLogs()).toHaveLength(0);
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
  });

  it('returns the save error and neither audits nor clears the provider when the revoke cannot be saved', async () => {
    const { endpoint } = seedRevoke({ suppressionBehaviour: { SaveSucceeds: false, SaveError: 'Update not permitted' } });

    const res = await revoke('supp-1');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: 'Update not permitted' });
    expect(auditLogs()).toHaveLength(0);
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
    expect(endpoint.SaveCalls).toBe(0);
  });

  it('still reports success, with no warning, when the audit row cannot be saved (the failure is only logged)', async () => {
    // FLAG CommsRevokeSuppressionServerOperation (`if (!(await audit.Save()))`): a suppression is revoked with no consent-audit row and
    // the admin is not told.
    seedRevoke({ auditBehaviour: { SaveSucceeds: false, SaveError: 'audit insert refused' } });

    const res = await revoke('supp-1');

    expect(res.Output).toEqual({ Success: true, WarningMessage: undefined });
    expect(auditLogs()[0].SaveCalls).toBe(1);
  });

  it('returns a warning, and still succeeds, when the provider refuses to clear its list', async () => {
    seedRevoke();
    sendGrid.RemoveSuppression.mockResolvedValue({ Success: false, ErrorMessage: '404 not on list' });

    expect((await revoke('supp-1')).Output).toEqual({ Success: true, WarningMessage: 'SendGrid: 404 not on list' });
  });

  it('returns a warning, and still succeeds, when the provider throws while clearing its list', async () => {
    seedRevoke();
    sendGrid.RemoveSuppression.mockRejectedValue(new Error('ENOTFOUND api.sendgrid.com'));

    expect((await revoke('supp-1')).Output).toEqual({ Success: true, WarningMessage: 'SendGrid: ENOTFOUND api.sendgrid.com' });
  });

  it.each(['Admin Block', 'Policy'] as const)('never clears a provider list for an internal %s suppression', async (reason) => {
    seedRevoke({ suppression: { Reason: reason } });

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
  });

  it.each([
    ['Hard Bounce', 'bounces'],
    ['Spam Complaint', 'spam_reports'],
    ['Invalid Address', 'invalid_emails'],
    ['User Unsubscribe', 'unsubscribes'],
  ] as const)('clears the provider\'s %s list as "%s"', async (reason, list) => {
    seedRevoke({ suppression: { Reason: reason } });

    await revoke('supp-1');

    expect(sendGrid.RemoveSuppression.mock.calls[0].slice(0, 2)).toEqual(['bounced@example.com', list]);
  });

  it('skips the provider and the endpoint for a suppression with no endpoint', async () => {
    const { endpoint } = seedRevoke({ suppression: { CommunicationEndpointID: null } });

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
    expect(endpoint.LoadCalls).toHaveLength(0);
  });

  it('leaves the endpoint blocked while another active suppression remains', async () => {
    const { endpoint } = seedRevoke();
    views.Serve('MJ: Communication Suppressions', [{ ID: 'supp-2' }]);

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(endpoint).toMatchObject({ Status: 'Hard Bounced', SoftBounceCount: 5, SaveCalls: 0 });
  });

  it('leaves the endpoint blocked when the remaining-suppressions view fails (fails closed)', async () => {
    const { endpoint } = seedRevoke();
    views.Fail('MJ: Communication Suppressions');

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(endpoint).toMatchObject({ Status: 'Hard Bounced', SaveCalls: 0 });
  });

  it('never reactivates an Erased endpoint', async () => {
    const { endpoint } = seedRevoke({ endpoint: { Status: 'Erased', NormalizedValue: null } });

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(endpoint.Status).toBe('Erased');
    expect(endpoint.SaveCalls).toBe(0);
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
  });

  it('still reports success when the endpoint cannot be saved back to Active (the failure is only logged)', async () => {
    const { endpoint } = seedRevoke({ endpointBehaviour: { SaveSucceeds: false, SaveError: 'endpoint locked' } });

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(endpoint.SaveCalls).toBe(1);
  });

  it('falls back to every active provider when the sender does not load', async () => {
    seedRevoke({ senderBehaviour: { LoadSucceeds: false } });
    const mailgun = makeCommsProvider();
    state.providerInstances.set('Mailgun', mailgun);
    views.Serve('MJ: Communication Providers', [
      { ID: 'prov-sg', Name: 'SendGrid' },
      { ID: 'prov-mg', Name: 'Mailgun' },
    ]);

    const res = await revoke('supp-1');

    expect(res.Output?.Success).toBe(true);
    expect(sendGrid.RemoveSuppression).toHaveBeenCalledTimes(1);
    expect(mailgun.RemoveSuppression).toHaveBeenCalledTimes(1);
    expect(views.CallsFor('MJ: Communication Providers')[0].Params.ExtraFilter).toBe("Status='Active'");
  });

  it('clears no provider list, without a warning, when the sender does not load and the provider view fails', async () => {
    seedRevoke({ senderBehaviour: { LoadSucceeds: false } });
    views.Fail('MJ: Communication Providers');

    const res = await revoke('supp-1');

    expect(res.Output).toEqual({ Success: true, WarningMessage: undefined });
    expect(sendGrid.RemoveSuppression).not.toHaveBeenCalled();
  });

  // DEFECT CommsAdminOperations.ts, clearDownstreamSuppression: RemoveSuppression is called
  // with no credentials, so the removal always goes to the process-wide provider account, even when
  // the suppression's sender is bound to its own credential (Sender.CredentialID, e.g. a
  // subaccount). The address stays on the list of the account that actually sent to it.
  it("clears the provider list with the credential the suppression's sender is bound to", async () => {
    seedRevoke({ sender: { CredentialID: 'cred-42' } });
    state.credentials = [{ ID: 'cred-42', Name: 'SendGrid Subaccount' }];
    state.resolveCredential = () => ({ values: { apiKey: 'SG.subaccount-key' } });

    await revoke('supp-1');

    expect(sendGrid.RemoveSuppression).toHaveBeenCalledWith('bounced@example.com', 'bounces', { apiKey: 'SG.subaccount-key' });
  });
});

// ─── Communications.BlockEndpoint ────────────────────────────────────────────

describe('Communications.BlockEndpoint', () => {
  type BlockSuppression = Partial<
    Pick<MJCommunicationSuppressionEntity, 'CommunicationEndpointID' | 'BaseMessageTypeID' | 'Reason' | 'Source' | 'Status' | 'EffectiveAt'>
  >;

  function seedBlock(
    options: {
      endpointBehaviour?: Partial<FakeEntityBehaviour>;
      suppressionBehaviour?: Partial<FakeEntityBehaviour>;
      auditBehaviour?: Partial<FakeEntityBehaviour>;
    } = {},
  ): FakeEntity<EndpointFields> {
    const endpoint = MakeFakeEntity<EndpointFields>(
      { ID: 'ep-1', NormalizedValue: 'user@example.com', Status: 'Active', SoftBounceCount: 0, BaseMessageTypeID: 'chan-email' },
      options.endpointBehaviour,
    );
    provider.Provide('MJ: Communication Endpoints', () => endpoint);
    provider.Provide('MJ: Communication Suppressions', () => MakeFakeEntity<BlockSuppression>({}, options.suppressionBehaviour));
    provider.Provide('MJ: Communication Consent Audit Logs', () => MakeFakeEntity({}, options.auditBehaviour));
    return endpoint;
  }

  const suppressions = () => provider.Created('MJ: Communication Suppressions');
  const auditLogs = () => provider.Created('MJ: Communication Consent Audit Logs');

  it('creates an active Admin Block suppression on the endpoint and audits it, as the requesting user', async () => {
    seedBlock();

    const res = await block('ep-1');

    expect(suppressions()).toHaveLength(1);
    expect(res.Output).toEqual({ Success: true, SuppressionID: suppressions()[0].ID });
    expect(suppressions()[0]).toMatchObject({
      CommunicationEndpointID: 'ep-1',
      BaseMessageTypeID: 'chan-email',
      Reason: 'Admin Block',
      Source: 'Admin',
      Status: 'Active',
      SaveCalls: 1,
    });
    expect(auditLogs()[0]).toMatchObject({
      CommunicationSuppressionID: suppressions()[0].ID,
      Action: 'Created',
      PreviousValue: null,
      NewValue: JSON.stringify({ Reason: 'Admin Block', Status: 'Active' }),
      Source: 'Admin',
      ChangedByUserID: DEVELOPER.ID,
      SaveCalls: 1,
    });
    expect(provider.Requests.every((r) => r.User === DEVELOPER)).toBe(true);
  });

  it('reports not-found and creates nothing when the endpoint does not load', async () => {
    seedBlock({ endpointBehaviour: { LoadSucceeds: false } });

    const res = await block('ep-missing');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: "Endpoint 'ep-missing' not found" });
    expect(suppressions()).toHaveLength(0);
    expect(auditLogs()).toHaveLength(0);
  });

  it('returns the save error and writes no audit row when the suppression cannot be saved', async () => {
    seedBlock({ suppressionBehaviour: { SaveSucceeds: false, SaveError: 'Create not permitted' } });

    const res = await block('ep-1');

    expect(res.Output).toEqual({ Success: false, ErrorMessage: 'Create not permitted' });
    expect(auditLogs()).toHaveLength(0);
  });

  it('returns an execution error when saving the suppression throws', async () => {
    seedBlock({ suppressionBehaviour: { SaveThrows: new Error('connection reset') } });

    expect(await block('ep-1')).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'connection reset' });
    expect(auditLogs()).toHaveLength(0);
  });

  it('still reports success when the audit row cannot be saved (the failure is only logged)', async () => {
    seedBlock({ auditBehaviour: { SaveSucceeds: false, SaveError: 'audit insert refused' } });

    const res = await block('ep-1');

    expect(res.Output?.Success).toBe(true);
    expect(auditLogs()[0].SaveCalls).toBe(1);
  });

  it('leaves the endpoint row itself unchanged: the block is the suppression', async () => {
    const endpoint = seedBlock();

    await block('ep-1');

    expect(endpoint).toMatchObject({ Status: 'Active', SaveCalls: 0 });
  });

  // DEFECT CommsBlockEndpointServerOperation.InternalExecute: the operation never looks for an existing active Admin
  // Block, so blocking the same endpoint twice (a double click, a retried request) creates two
  // active suppressions. Revoking one leaves the endpoint blocked by the other.
  it('does not create a second active Admin Block for an endpoint that already has one', async () => {
    seedBlock();
    await block('ep-1');
    views.Serve('MJ: Communication Suppressions', [{ ID: suppressions()[0].ID, CommunicationEndpointID: 'ep-1', Reason: 'Admin Block', Status: 'Active' }]);

    await block('ep-1');

    expect(suppressions().filter((s) => s.SaveCalls > 0)).toHaveLength(1);
  });
});

// ─── Communications.SimulateComplianceGate ───────────────────────────────────

describe('Communications.SimulateComplianceGate', () => {
  const SENDER = { ID: 'sender-1', Name: 'Default', CommunicationProviderID: 'prov-sg', EnforcementMode: 'Enforce', ParentSenderID: null };

  it('evaluates the real ComplianceGate and reads every view as the requesting user', async () => {
    views.Serve('MJ: Communication Senders', [SENDER]);

    const res = await simulate({ SenderID: 'sender-1', MessageClass: 'Marketing' });

    expect(res.Output?.Success).toBe(true);
    expect(res.Output?.Decision).toBe('Allowed');
    expect((JSON.parse(res.Output?.ResultJSON ?? '{}') as { Decision: string }).Decision).toBe('Allowed');
    expect(views.Calls.length).toBeGreaterThan(0);
    expect(views.Calls.every((c) => c.User === DEVELOPER && c.Provider === provider)).toBe(true);
  });

  it('reports an unknown sender', async () => {
    views.Serve('MJ: Communication Senders', [SENDER]);

    const res = await simulate({ SenderID: 'sender-zzz', MessageClass: 'Marketing' });

    expect(res.Output).toEqual({ Success: false, ErrorMessage: "Sender 'sender-zzz' not found" });
  });

  it('gives no decision when the sender view fails', async () => {
    views.Fail('MJ: Communication Senders', 'deadlock victim');

    const res = await simulate({ SenderID: 'sender-1', MessageClass: 'Marketing' });

    expect(res.Output?.Success).toBe(false);
    expect(res.Output?.Decision).toBeUndefined();
  });

  // DEFECT CommsSimulateComplianceGateServerOperation.InternalExecute (`if (suppRes.Success)` and the other `Success ? Results : []` reads): a
  // failed read of suppressions, preferences, jurisdictions or regimes is treated as "none exist",
  // so the simulator answers as if the recipient had no suppression instead of reporting that it
  // could not evaluate the gate.
  it("does not report a decision when the recipient's suppressions cannot be read", async () => {
    views.Serve('MJ: Communication Senders', [SENDER]);
    views.Serve('MJ: Communication Principals', [{ ID: 'principal-1', EntityID: 'entity-contacts' }]);
    views.Fail('MJ: Communication Suppressions', 'Timeout expired');

    const res = await simulate({ SenderID: 'sender-1', MessageClass: 'Marketing', PrincipalID: 'principal-1', RecordID: 'contact-7' });

    expect(views.CallsFor('MJ: Communication Suppressions')).toHaveLength(1);
    expect(res.Output?.Success ?? res.Success).toBe(false);
    expect(res.Output?.Decision).toBeUndefined();
  });
});
