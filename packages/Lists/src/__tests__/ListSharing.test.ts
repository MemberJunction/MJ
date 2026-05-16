/**
 * Tests for the ListSharing service. Same mocking strategy as
 * `ListOperations.io.test.ts`: stub `@memberjunction/core` and
 * `@memberjunction/core-entities` so we can exercise the sharing flows
 * without a real database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockGetEntityObject = vi.fn();
const mockEntities: Array<{ ID: string; Name: string }> = [];
const mockCreateShareNotification = vi.fn();

vi.mock('@memberjunction/core', () => {
  class CompositeKey {
    KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
    ToConcatenatedString() {
      return this.KeyValuePairs.map((kv) => `${kv.FieldName}|${kv.Value}`).join('||');
    }
  }
  class RunView {
    constructor(_p?: unknown) {}
    static FromMetadataProvider() {
      return new RunView();
    }
    static async GetEntityNameFromRunViewParams() {
      return 'Contacts';
    }
    RunView(params: unknown) {
      return mockRunViewImpl(params);
    }
  }
  class Metadata {
    get Entities() {
      return mockEntities;
    }
    EntityByName(name: string) {
      return mockEntities.find((e) => e.Name === name);
    }
    GetEntityObject(entityName: string) {
      return mockGetEntityObject(entityName);
    }
  }
  return {
    CompositeKey,
    Metadata,
    RunView,
    LogError: () => {},
    LogStatus: () => {},
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJAuditLogEntity: class {},
  MJListEntity: class {},
  MJListInvitationEntity: class {},
  MJResourcePermissionEntity: class {},
  MJUserEntity: class {},
  CreateShareNotification: (input: unknown) => mockCreateShareNotification(input),
}));

import {
  LIST_AUDIT_LOG_TYPES,
  LIST_RESOURCE_TYPE_ID,
  ListSharing,
} from '../ListSharing';

const CTX_USER = { ID: 'user-grantor', Name: 'Grantor', Email: 'grantor@x', UserRoles: [] };
const LIST_ENTITY = { ID: 'list-entity-id', Name: 'MJ: Lists' };

function makeMockPermission(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    ID: 'perm-new',
    ResourceTypeID: '',
    ResourceRecordID: '',
    Type: '',
    UserID: null,
    RoleID: null,
    PermissionLevel: null,
    Status: 'Requested',
    SharedByUserID: null,
    __mj_CreatedAt: new Date(),
    ...overrides,
  };
  return {
    NewRecord: vi.fn(),
    Load: vi.fn().mockResolvedValue(true),
    Save: vi.fn().mockResolvedValue(true),
    LatestResult: { CompleteMessage: '' },
    get ID() { return state.ID; },
    get ResourceTypeID() { return state.ResourceTypeID; },
    set ResourceTypeID(v: unknown) { state.ResourceTypeID = v; },
    get ResourceRecordID() { return state.ResourceRecordID; },
    set ResourceRecordID(v: unknown) { state.ResourceRecordID = v; },
    get Type() { return state.Type; },
    set Type(v: unknown) { state.Type = v; },
    get UserID() { return state.UserID; },
    set UserID(v: unknown) { state.UserID = v; },
    get RoleID() { return state.RoleID; },
    set RoleID(v: unknown) { state.RoleID = v; },
    get PermissionLevel() { return state.PermissionLevel; },
    set PermissionLevel(v: unknown) { state.PermissionLevel = v; },
    get Status() { return state.Status; },
    set Status(v: unknown) { state.Status = v; },
    get SharedByUserID() { return state.SharedByUserID; },
    set SharedByUserID(v: unknown) { state.SharedByUserID = v; },
    get __mj_CreatedAt() { return state.__mj_CreatedAt; },
    _state: state,
  };
}

function makeMockInvitation(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    ID: 'inv-new',
    ListID: '',
    Email: '',
    Role: 'Viewer',
    Token: '',
    ExpiresAt: new Date(Date.now() + 86400000),
    CreatedByUserID: '',
    Status: 'Pending',
    ...overrides,
  };
  return {
    NewRecord: vi.fn(),
    Load: vi.fn().mockResolvedValue(true),
    Save: vi.fn().mockResolvedValue(true),
    LatestResult: { CompleteMessage: '' },
    get ID() { return state.ID; },
    get ListID() { return state.ListID; },
    set ListID(v: unknown) { state.ListID = v; },
    get Email() { return state.Email; },
    set Email(v: unknown) { state.Email = v; },
    get Role() { return state.Role; },
    set Role(v: unknown) { state.Role = v; },
    get Token() { return state.Token; },
    set Token(v: unknown) { state.Token = v; },
    get ExpiresAt() { return state.ExpiresAt; },
    set ExpiresAt(v: unknown) { state.ExpiresAt = v; },
    get CreatedByUserID() { return state.CreatedByUserID; },
    set CreatedByUserID(v: unknown) { state.CreatedByUserID = v; },
    get Status() { return state.Status; },
    set Status(v: unknown) { state.Status = v; },
    _state: state,
  };
}

function makeMockAuditLog() {
  return {
    NewRecord: vi.fn(),
    Save: vi.fn().mockResolvedValue(true),
    LatestResult: { CompleteMessage: '' },
    UserID: '',
    AuditLogTypeID: '',
    Status: '',
    Description: '',
    Details: '',
    EntityID: '',
    RecordID: '',
  };
}

describe('ListSharing', () => {
  beforeEach(() => {
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    mockEntities.length = 0;
    mockEntities.push(LIST_ENTITY);
    mockCreateShareNotification.mockReset();
    mockCreateShareNotification.mockResolvedValue(true);
  });

  describe('Share', () => {
    it('creates a new user permission and emits audit log + notification', async () => {
      const auditLog = makeMockAuditLog();
      const list = { Load: vi.fn().mockResolvedValue(true), Name: 'VIPs' };
      const permission = makeMockPermission();
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: Lists') return list;
        if (entityName === 'MJ: Resource Permissions') return permission;
        throw new Error(`unexpected ${entityName}`);
      });
      // No existing permission found.
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [], RowCount: 0 });

      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.Share({
        ListID: 'list-1',
        Target: { kind: 'user', userId: 'recipient-user' },
        PermissionLevel: 'Edit',
      });

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(permission._state.ResourceTypeID).toBe(LIST_RESOURCE_TYPE_ID);
      expect(permission._state.ResourceRecordID).toBe('list-1');
      expect(permission._state.Type).toBe('User');
      expect(permission._state.UserID).toBe('recipient-user');
      expect(permission._state.PermissionLevel).toBe('Edit');
      expect(permission._state.Status).toBe('Approved');
      expect(auditLog.AuditLogTypeID).toBe(LIST_AUDIT_LOG_TYPES.ListShared);
      expect(mockCreateShareNotification).toHaveBeenCalledTimes(1);
      expect(mockCreateShareNotification.mock.calls[0][0]).toMatchObject({
        GrantorUserID: CTX_USER.ID,
        GranteeUserID: 'recipient-user',
        ResourceTypeName: 'Lists',
      });
    });

    it('reuses an existing permission row (idempotent)', async () => {
      const auditLog = makeMockAuditLog();
      const existingPermission = makeMockPermission({
        ID: 'perm-existing',
        ResourceTypeID: LIST_RESOURCE_TYPE_ID,
        ResourceRecordID: 'list-1',
        Type: 'User',
        UserID: 'recipient',
        PermissionLevel: 'View',
        Status: 'Approved',
      });
      const list = { Load: vi.fn().mockResolvedValue(true), Name: 'L' };
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: Lists') return list;
        throw new Error(`unexpected ${entityName}`);
      });
      mockRunViewImpl.mockResolvedValue({
        Success: true,
        Results: [existingPermission],
        RowCount: 1,
      });

      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.Share({
        ListID: 'list-1',
        Target: { kind: 'user', userId: 'recipient' },
        PermissionLevel: 'Edit',
      });
      expect(result.Success).toBe(true);
      expect(result.PermissionID).toBe('perm-existing');
      // Level was promoted from View to Edit, no new permission row was created.
      expect(existingPermission._state.PermissionLevel).toBe('Edit');
    });

    it('creates a Role-type share when target is a role', async () => {
      const auditLog = makeMockAuditLog();
      const permission = makeMockPermission();
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: Resource Permissions') return permission;
        throw new Error(`unexpected ${entityName}`);
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [], RowCount: 0 });

      const sharing = new ListSharing(CTX_USER as never);
      await sharing.Share({
        ListID: 'list-1',
        Target: { kind: 'role', roleId: 'role-x' },
        PermissionLevel: 'View',
      });
      expect(permission._state.Type).toBe('Role');
      expect(permission._state.RoleID).toBe('role-x');
      // Role shares do NOT fire a per-user notification (role fan-out is a separate job).
      expect(mockCreateShareNotification).not.toHaveBeenCalled();
    });

    it('does not dispatch notification when sharing with self', async () => {
      const auditLog = makeMockAuditLog();
      const permission = makeMockPermission();
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: Resource Permissions') return permission;
        throw new Error(`unexpected ${entityName}`);
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [] });

      const sharing = new ListSharing(CTX_USER as never);
      await sharing.Share({
        ListID: 'list-1',
        Target: { kind: 'user', userId: CTX_USER.ID },
        PermissionLevel: 'Owner',
      });
      expect(mockCreateShareNotification).not.toHaveBeenCalled();
    });
  });

  describe('Unshare', () => {
    it('sets permission Status to Revoked', async () => {
      const auditLog = makeMockAuditLog();
      const permission = makeMockPermission({
        ID: 'perm-1',
        ResourceRecordID: 'list-1',
        Type: 'User',
        UserID: 'recipient',
        Status: 'Approved',
      });
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: Resource Permissions') return permission;
        throw new Error(`unexpected ${entityName}`);
      });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.Unshare('perm-1');
      expect(result.Success).toBe(true);
      expect(permission._state.Status).toBe('Revoked');
      expect(auditLog.AuditLogTypeID).toBe(LIST_AUDIT_LOG_TYPES.ListUnshared);
    });

    it('returns PERMISSION_NOT_FOUND when load fails', async () => {
      mockGetEntityObject.mockResolvedValue({
        Load: vi.fn().mockResolvedValue(false),
        LatestResult: { CompleteMessage: '' },
      });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.Unshare('missing');
      expect(result.ResultCode).toBe('PERMISSION_NOT_FOUND');
    });
  });

  describe('Invite', () => {
    it('creates a pending invitation with a token + expiry', async () => {
      const auditLog = makeMockAuditLog();
      const invitation = makeMockInvitation();
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: List Invitations') return invitation;
        throw new Error(`unexpected ${entityName}`);
      });

      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.Invite({
        ListID: 'list-1',
        Email: 'alice@example.com',
        Role: 'Editor',
      });
      expect(result.Success).toBe(true);
      expect(result.Token).toBeDefined();
      expect(result.Token?.length).toBeGreaterThan(20);
      expect(result.ExpiresAt).toBeInstanceOf(Date);
      expect(invitation._state.ListID).toBe('list-1');
      expect(invitation._state.Email).toBe('alice@example.com');
      expect(invitation._state.Role).toBe('Editor');
      expect(invitation._state.Status).toBe('Pending');
      expect(auditLog.AuditLogTypeID).toBe(LIST_AUDIT_LOG_TYPES.ListInvitationSent);
    });

    it('rejects when Email is invalid', async () => {
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.Invite({
        ListID: 'list-1',
        Email: 'not-an-email',
        Role: 'Viewer',
      });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });

    it('respects custom TTL', async () => {
      const auditLog = makeMockAuditLog();
      const invitation = makeMockInvitation();
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: List Invitations') return invitation;
        throw new Error(`unexpected ${entityName}`);
      });
      const sharing = new ListSharing(CTX_USER as never);
      const before = Date.now();
      const result = await sharing.Invite({
        ListID: 'list-1',
        Email: 'x@y.com',
        Role: 'Viewer',
        TtlMs: 60 * 1000, // 1 minute
      });
      const expiresAt = (result.ExpiresAt as Date).getTime();
      expect(expiresAt - before).toBeGreaterThanOrEqual(60 * 1000 - 100);
      expect(expiresAt - before).toBeLessThanOrEqual(60 * 1000 + 5000);
    });
  });

  describe('AcceptInvitation', () => {
    it('promotes pending invitation into a permission and marks accepted', async () => {
      const auditLog = makeMockAuditLog();
      const permission = makeMockPermission();
      const invitation = makeMockInvitation({
        ID: 'inv-1',
        ListID: 'list-1',
        Email: 'grantor@x',
        Role: 'Editor',
        Status: 'Pending',
        ExpiresAt: new Date(Date.now() + 60_000),
      });
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: Resource Permissions') return permission;
        throw new Error(`unexpected ${entityName}`);
      });
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string }) => {
        if (params.EntityName === 'MJ: List Invitations') {
          return { Success: true, Results: [invitation], RowCount: 1 };
        }
        // For Share's existence check
        return { Success: true, Results: [], RowCount: 0 };
      });

      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.AcceptInvitation('some-token');
      expect(result.Success).toBe(true);
      expect(result.ListID).toBe('list-1');
      expect(invitation._state.Status).toBe('Accepted');
      expect(permission._state.PermissionLevel).toBe('Edit');
    });

    it('returns INVITATION_NOT_FOUND on unknown token', async () => {
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [], RowCount: 0 });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.AcceptInvitation('bogus');
      expect(result.ResultCode).toBe('INVITATION_NOT_FOUND');
    });

    it('returns INVITATION_EXPIRED for past-due invitations and marks expired', async () => {
      const invitation = makeMockInvitation({
        Email: 'grantor@x',
        ExpiresAt: new Date(Date.now() - 60_000),
        Status: 'Pending',
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [invitation] });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.AcceptInvitation('t');
      expect(result.ResultCode).toBe('INVITATION_EXPIRED');
      expect(invitation._state.Status).toBe('Expired');
    });

    it('returns INVITATION_ALREADY_USED on accepted invitation', async () => {
      const invitation = makeMockInvitation({
        Email: 'grantor@x',
        Status: 'Accepted',
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [invitation] });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.AcceptInvitation('t');
      expect(result.ResultCode).toBe('INVITATION_ALREADY_USED');
    });

    it('returns INVITATION_REVOKED on revoked invitation', async () => {
      const invitation = makeMockInvitation({
        Email: 'grantor@x',
        Status: 'Revoked',
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [invitation] });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.AcceptInvitation('t');
      expect(result.ResultCode).toBe('INVITATION_REVOKED');
    });

    it('refuses when invitation email does not match caller', async () => {
      const invitation = makeMockInvitation({
        Email: 'someone-else@x',
        Status: 'Pending',
        ExpiresAt: new Date(Date.now() + 60_000),
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [invitation] });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.AcceptInvitation('t');
      expect(result.ResultCode).toBe('EMAIL_RECIPIENT_NOT_FOUND');
    });
  });

  describe('RevokeInvitation', () => {
    it('marks the invitation Revoked', async () => {
      const auditLog = makeMockAuditLog();
      const invitation = makeMockInvitation({ ID: 'inv-1', ListID: 'list-1', Status: 'Pending' });
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Audit Logs') return auditLog;
        if (entityName === 'MJ: List Invitations') return invitation;
        throw new Error(`unexpected ${entityName}`);
      });
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.RevokeInvitation('inv-1');
      expect(result.Success).toBe(true);
      expect(invitation._state.Status).toBe('Revoked');
    });

    it('refuses to revoke an already-accepted invitation', async () => {
      const invitation = makeMockInvitation({ Status: 'Accepted' });
      mockGetEntityObject.mockResolvedValue(invitation);
      const sharing = new ListSharing(CTX_USER as never);
      const result = await sharing.RevokeInvitation('inv-1');
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVITATION_ALREADY_USED');
    });
  });

  describe('GetSharesForList / GetListsSharedWithUser', () => {
    it('GetSharesForList returns a typed summary array', async () => {
      const perm1 = makeMockPermission({
        ID: 'p1',
        ResourceRecordID: 'list-1',
        Type: 'User',
        UserID: 'u1',
        PermissionLevel: 'Edit',
        Status: 'Approved',
        SharedByUserID: CTX_USER.ID,
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [perm1] });
      const sharing = new ListSharing(CTX_USER as never);
      const shares = await sharing.GetSharesForList('list-1');
      expect(shares).toHaveLength(1);
      expect(shares[0]).toMatchObject({
        PermissionID: 'p1',
        ListID: 'list-1',
        Target: { kind: 'user', userId: 'u1' },
        PermissionLevel: 'Edit',
        Status: 'Approved',
      });
    });

    it('GetListsSharedWithUser joins list names via a single RunView', async () => {
      const perm1 = makeMockPermission({
        ID: 'p1',
        ResourceRecordID: 'list-1',
        Type: 'User',
        UserID: CTX_USER.ID,
        PermissionLevel: 'View',
        Status: 'Approved',
      });
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string }) => {
        if (params.EntityName === 'MJ: Resource Permissions') {
          return { Success: true, Results: [perm1] };
        }
        if (params.EntityName === 'MJ: Lists') {
          return { Success: true, Results: [{ ID: 'list-1', Name: 'My List' }] };
        }
        return { Success: true, Results: [] };
      });
      const sharing = new ListSharing(CTX_USER as never);
      const summaries = await sharing.GetListsSharedWithUser();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        ListID: 'list-1',
        ListName: 'My List',
        PermissionLevel: 'View',
      });
    });
  });
});
