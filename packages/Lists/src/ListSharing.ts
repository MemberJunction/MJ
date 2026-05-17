import {
  IMetadataProvider,
  LogError,
  Metadata,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import {
  CreateShareNotification,
  MJAuditLogEntity,
  MJListEntity,
  MJListInvitationEntity,
  MJResourcePermissionEntity,
  MJUserEntity,
} from '@memberjunction/core-entities';

/**
 * @memberjunction/lists — sharing surface.
 *
 * Sharing has two parallel paths:
 *
 *   1. **Direct share** — the recipient already has an MJ user account.
 *      We write a row to `MJResourcePermission` immediately, scoped to
 *      the List resource type. Either a user (`Type='User'`) or a role
 *      (`Type='Role'`) target.
 *
 *   2. **Email invitation** — the recipient may or may not have an
 *      account yet. We write a row to `MJ: List Invitations` with a
 *      signed token + expiry; `AcceptInvitation` later promotes that
 *      pending invite into a real `MJResourcePermission`.
 *
 * Every mutation also emits an `MJ: Audit Logs` entry — type IDs
 * defined in `LIST_AUDIT_LOG_TYPES` below — so administrators can trace
 * who shared what with whom and when.
 */

// ---------------------------------------------------------------------------
// Constants — UUIDs match the seeded MJ: Audit Log Types and MJ: Resource
// Types metadata files. Hard-coded here so the runtime doesn't have to do a
// lookup on every emit, and so the contract is grep-able from code.
// ---------------------------------------------------------------------------

/** ResourceType.ID for "Lists" (see metadata/resource-types/.resource-types.json). */
export const LIST_RESOURCE_TYPE_ID = 'E64D433E-F36B-1410-8560-0041FA62858A';

/** AuditLogType IDs for the seven list-sharing events. */
export const LIST_AUDIT_LOG_TYPES = {
  ListShared: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F01',
  ListUnshared: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F02',
  ListInvitationSent: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F03',
  ListInvitationAccepted: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F04',
  ListInvitationRevoked: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F05',
  ListRefreshed: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F06',
  ListBulkOperation: '9C8A0A90-1A4B-4CD2-9E3F-7A13A89C6F07',
} as const;

/** Default invitation TTL: 7 days. The plan calls for tunable expiry but
 * keeps the spec simple — overridable at call time. */
export const DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Permission level granted to a share recipient. Mirrors the
 * MJResourcePermission `PermissionLevel` field exactly. */
export type SharePermissionLevel = 'View' | 'Edit' | 'Owner';

/**
 * Capability flags derived from a permission level. The mapping mirrors
 * the gating rules from mockup 19:
 *   - Viewer: hide Add/Remove/Refresh/Edit/Share/Delete/Operations
 *   - Editor: hide Delete/Share
 *   - Owner: show everything
 * Server-side enforcement remains the source of truth — this is a UX
 * convenience so users don't see buttons they'll be rejected on.
 */
export interface ListCapabilities {
  CanRead: boolean;
  CanEdit: boolean;
  CanRefresh: boolean;
  CanShare: boolean;
  CanDelete: boolean;
  CanRunOperations: boolean;
}

export function capabilitiesForLevel(level: SharePermissionLevel | null): ListCapabilities {
  if (level === 'Owner') {
    return {
      CanRead: true, CanEdit: true, CanRefresh: true,
      CanShare: true, CanDelete: true, CanRunOperations: true,
    };
  }
  if (level === 'Edit') {
    return {
      CanRead: true, CanEdit: true, CanRefresh: true,
      CanShare: false, CanDelete: false, CanRunOperations: true,
    };
  }
  if (level === 'View') {
    return {
      CanRead: true, CanEdit: false, CanRefresh: false,
      CanShare: false, CanDelete: false, CanRunOperations: false,
    };
  }
  // No access at all — caller should hide the list entirely.
  return {
    CanRead: false, CanEdit: false, CanRefresh: false,
    CanShare: false, CanDelete: false, CanRunOperations: false,
  };
}

/**
 * Target of a direct share: either an MJ user or an MJ role. Discriminated
 * union so the type system enforces exactly one of `userId` / `roleId` is
 * provided (mirrors the `ValidateTypeAndRoleOrUserIDExclusive` rule on
 * `MJResourcePermission`).
 */
export type ShareTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'role'; roleId: string };

/** Summary of one share row returned by `GetSharesForList`. */
export interface ListShareSummary {
  PermissionID: string;
  ListID: string;
  Target: ShareTarget;
  PermissionLevel: SharePermissionLevel;
  Status: 'Approved' | 'Requested' | 'Rejected' | 'Revoked';
  SharedByUserID: string | null;
  CreatedAt: Date;
}

/** Summary of one List visible to the current user via shares. */
export interface SharedListSummary {
  ListID: string;
  ListName: string;
  PermissionLevel: SharePermissionLevel;
  SharedByUserID: string | null;
  SharedAt: Date;
}

/** Status codes returned by sharing operations. */
export type ShareResultCode =
  | 'SUCCESS'
  | 'INVALID_PARAMETER'
  | 'LIST_NOT_FOUND'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_ALREADY_USED'
  | 'INVITATION_REVOKED'
  | 'PERMISSION_NOT_FOUND'
  | 'EMAIL_RECIPIENT_NOT_FOUND'
  | 'UNEXPECTED_ERROR';

export interface ShareResult {
  Success: boolean;
  ResultCode: ShareResultCode;
  Message: string;
  PermissionID?: string;
}

export interface InviteResult {
  Success: boolean;
  ResultCode: ShareResultCode;
  Message: string;
  InvitationID?: string;
  Token?: string;
  ExpiresAt?: Date;
}

export interface AcceptInvitationResult {
  Success: boolean;
  ResultCode: ShareResultCode;
  Message: string;
  PermissionID?: string;
  ListID?: string;
}

// ---------------------------------------------------------------------------
// ListSharing service
// ---------------------------------------------------------------------------

/**
 * Sharing engine. Public methods follow MJ PascalCase convention; private
 * helpers are camelCase. Mirrors the structure of `ListOperations`.
 */
export class ListSharing {
  private readonly contextUser: UserInfo;
  private readonly provider: IMetadataProvider | undefined;

  constructor(contextUser: UserInfo, provider?: IMetadataProvider) {
    this.contextUser = contextUser;
    this.provider = provider;
  }

  /**
   * Grant a direct share on a list to a user or role. Idempotent at the
   * (list, target) level — re-sharing the same target updates the
   * existing permission row's level rather than creating duplicates.
   */
  public async Share(args: {
    ListID: string;
    Target: ShareTarget;
    PermissionLevel: SharePermissionLevel;
  }): Promise<ShareResult> {
    try {
      const md = this.metadata();
      const existing = await this.findExistingPermission(args.ListID, args.Target);

      const perm =
        existing ??
        (await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions', this.contextUser));
      if (!existing) {
        perm.NewRecord();
        perm.ResourceTypeID = LIST_RESOURCE_TYPE_ID;
        perm.ResourceRecordID = args.ListID;
        perm.Type = args.Target.kind === 'user' ? 'User' : 'Role';
        if (args.Target.kind === 'user') perm.UserID = args.Target.userId;
        else perm.RoleID = args.Target.roleId;
        perm.SharedByUserID = this.contextUser.ID;
      }
      perm.PermissionLevel = args.PermissionLevel;
      perm.Status = 'Approved';

      const ok = await perm.Save();
      if (!ok) {
        return this.shareFailure('UNEXPECTED_ERROR', `Failed to grant permission: ${perm.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }

      await this.emitAuditLog({
        TypeID: LIST_AUDIT_LOG_TYPES.ListShared,
        ListID: args.ListID,
        Description: `${this.contextUser.Name ?? this.contextUser.Email} shared list with ${args.Target.kind} ${this.targetId(args.Target)} as ${args.PermissionLevel}`,
        Details: { TargetKind: args.Target.kind, TargetID: this.targetId(args.Target), Level: args.PermissionLevel },
      });

      // Direct user shares route through the platform-wide share-notification
      // dispatcher — `@memberjunction/notifications` auto-registers a handler
      // that fans this out across the user's notification preferences (in-app
      // + email + SMS). Role-target shares are fan-out at the role level by
      // a separate worker; we don't try to enumerate every role member here.
      if (args.Target.kind === 'user' && args.Target.userId !== this.contextUser.ID) {
        await this.dispatchShareNotification(args.ListID, args.Target.userId, args.PermissionLevel);
      }

      return { Success: true, ResultCode: 'SUCCESS', Message: 'Permission granted', PermissionID: perm.ID };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`ListSharing.Share failed: ${message}`);
      return this.shareFailure('UNEXPECTED_ERROR', message);
    }
  }

  /**
   * Revoke a previously-granted permission. We soft-revoke (Status =
   * 'Revoked') rather than hard-delete so the audit trail stays
   * meaningful — `GetSharesForList` filters out revoked rows by default.
   */
  public async Unshare(permissionId: string): Promise<ShareResult> {
    try {
      const md = this.metadata();
      const perm = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions', this.contextUser);
      const loaded = await perm.Load(permissionId);
      if (!loaded) return this.shareFailure('PERMISSION_NOT_FOUND', `Permission ${permissionId} not found`);

      const listId = perm.ResourceRecordID;
      const targetSnapshot = this.snapshotTarget(perm);
      perm.Status = 'Revoked';
      const ok = await perm.Save();
      if (!ok) {
        return this.shareFailure('UNEXPECTED_ERROR', `Failed to revoke: ${perm.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }

      await this.emitAuditLog({
        TypeID: LIST_AUDIT_LOG_TYPES.ListUnshared,
        ListID: listId,
        Description: `${this.contextUser.Name ?? this.contextUser.Email} revoked permission ${permissionId}`,
        Details: targetSnapshot,
      });
      return { Success: true, ResultCode: 'SUCCESS', Message: 'Permission revoked', PermissionID: perm.ID };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`ListSharing.Unshare failed: ${message}`);
      return this.shareFailure('UNEXPECTED_ERROR', message);
    }
  }

  /**
   * Send an email invitation to share a list with someone — who may or
   * may not already have an MJ user account. We persist the invitation
   * with a random token + expiry; the recipient later calls
   * `AcceptInvitation(token)` to promote it into a real
   * `MJResourcePermission`.
   */
  public async Invite(args: {
    ListID: string;
    Email: string;
    Role: 'Editor' | 'Viewer';
    TtlMs?: number;
  }): Promise<InviteResult> {
    if (!args.Email || !args.Email.includes('@')) {
      return { Success: false, ResultCode: 'INVALID_PARAMETER', Message: 'Email is required' };
    }
    try {
      const md = this.metadata();
      const inv = await md.GetEntityObject<MJListInvitationEntity>('MJ: List Invitations', this.contextUser);
      inv.NewRecord();
      inv.ListID = args.ListID;
      inv.Email = args.Email;
      inv.Role = args.Role;
      inv.Token = this.generateInvitationToken();
      inv.ExpiresAt = new Date(Date.now() + (args.TtlMs ?? DEFAULT_INVITATION_TTL_MS));
      inv.CreatedByUserID = this.contextUser.ID;
      inv.Status = 'Pending';

      const ok = await inv.Save();
      if (!ok) {
        return {
          Success: false,
          ResultCode: 'UNEXPECTED_ERROR',
          Message: `Failed to create invitation: ${inv.LatestResult?.CompleteMessage ?? 'unknown'}`,
        };
      }

      await this.emitAuditLog({
        TypeID: LIST_AUDIT_LOG_TYPES.ListInvitationSent,
        ListID: args.ListID,
        Description: `${this.contextUser.Name ?? this.contextUser.Email} invited ${args.Email} (${args.Role})`,
        Details: { Email: args.Email, Role: args.Role, InvitationID: inv.ID },
      });

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Invitation sent to ${args.Email}`,
        InvitationID: inv.ID,
        Token: inv.Token,
        ExpiresAt: inv.ExpiresAt,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`ListSharing.Invite failed: ${message}`);
      return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
    }
  }

  /**
   * Accept an invitation by its token. The caller becomes the recipient
   * (we read `contextUser`); the invitation's email must match the
   * caller's email — protects against token interception by a different
   * MJ account.
   *
   * On success: creates the `MJResourcePermission` and marks the
   * invitation `Accepted`.
   */
  public async AcceptInvitation(token: string): Promise<AcceptInvitationResult> {
    try {
      const md = this.metadata();
      const rv = this.runView();
      const lookup = await rv.RunView<MJListInvitationEntity>({
        EntityName: 'MJ: List Invitations',
        ExtraFilter: `Token='${this.escape(token)}'`,
        ResultType: 'entity_object',
      }, this.contextUser);

      if (!lookup.Success || !lookup.Results || lookup.Results.length === 0) {
        return { Success: false, ResultCode: 'INVITATION_NOT_FOUND', Message: 'Invitation not found' };
      }
      const inv = lookup.Results[0];

      if (inv.Status === 'Revoked') {
        return { Success: false, ResultCode: 'INVITATION_REVOKED', Message: 'Invitation has been revoked' };
      }
      if (inv.Status === 'Accepted') {
        return { Success: false, ResultCode: 'INVITATION_ALREADY_USED', Message: 'Invitation has already been accepted' };
      }
      if (inv.ExpiresAt.getTime() < Date.now()) {
        // Mark expired so subsequent reads see consistent state.
        inv.Status = 'Expired';
        await inv.Save();
        return { Success: false, ResultCode: 'INVITATION_EXPIRED', Message: 'Invitation has expired' };
      }

      // Email-match check — best-effort: if context user has no email we
      // skip and rely on the token itself as the auth gate.
      const callerEmail = this.contextUser.Email?.toLowerCase();
      if (callerEmail && inv.Email.toLowerCase() !== callerEmail) {
        return {
          Success: false,
          ResultCode: 'EMAIL_RECIPIENT_NOT_FOUND',
          Message: `Invitation was for ${inv.Email} but caller is ${this.contextUser.Email}`,
        };
      }

      const share = await this.Share({
        ListID: inv.ListID,
        Target: { kind: 'user', userId: this.contextUser.ID },
        PermissionLevel: inv.Role === 'Editor' ? 'Edit' : 'View',
      });
      if (!share.Success) {
        return { Success: false, ResultCode: share.ResultCode, Message: share.Message };
      }

      inv.Status = 'Accepted';
      await inv.Save();

      await this.emitAuditLog({
        TypeID: LIST_AUDIT_LOG_TYPES.ListInvitationAccepted,
        ListID: inv.ListID,
        Description: `${this.contextUser.Name ?? this.contextUser.Email} accepted invitation ${inv.ID}`,
        Details: { InvitationID: inv.ID, GrantedPermissionID: share.PermissionID },
      });

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'Invitation accepted',
        PermissionID: share.PermissionID,
        ListID: inv.ListID,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`ListSharing.AcceptInvitation failed: ${message}`);
      return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
    }
  }

  /**
   * Revoke a pending invitation. No-op if already accepted (the resulting
   * permission can still be `Unshare`d separately).
   */
  public async RevokeInvitation(invitationId: string): Promise<ShareResult> {
    try {
      const md = this.metadata();
      const inv = await md.GetEntityObject<MJListInvitationEntity>('MJ: List Invitations', this.contextUser);
      const loaded = await inv.Load(invitationId);
      if (!loaded) return this.shareFailure('INVITATION_NOT_FOUND', `Invitation ${invitationId} not found`);
      if (inv.Status === 'Accepted') {
        return this.shareFailure(
          'INVITATION_ALREADY_USED',
          'Invitation already accepted — Unshare the resulting permission instead',
        );
      }
      inv.Status = 'Revoked';
      const ok = await inv.Save();
      if (!ok) {
        return this.shareFailure('UNEXPECTED_ERROR', `Failed to revoke: ${inv.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }
      await this.emitAuditLog({
        TypeID: LIST_AUDIT_LOG_TYPES.ListInvitationRevoked,
        ListID: inv.ListID,
        Description: `${this.contextUser.Name ?? this.contextUser.Email} revoked invitation ${inv.ID}`,
        Details: { InvitationID: inv.ID, Email: inv.Email },
      });
      return { Success: true, ResultCode: 'SUCCESS', Message: 'Invitation revoked' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`ListSharing.RevokeInvitation failed: ${message}`);
      return this.shareFailure('UNEXPECTED_ERROR', message);
    }
  }

  /**
   * Return the current (non-revoked) shares for a list — both user and
   * role grants, mapped into the canonical `ListShareSummary` shape.
   */
  public async GetSharesForList(listId: string): Promise<ListShareSummary[]> {
    const rv = this.runView();
    const result = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID='${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID='${this.escape(listId)}' AND Status<>'Revoked'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
    }, this.contextUser);
    if (!result.Success || !result.Results) return [];
    return result.Results.map((p) => this.toShareSummary(p));
  }

  /**
   * Resolve the effective permission level the context user has on a
   * list. Returns `'Owner'` if they created the list (UserID match);
   * otherwise checks for a direct user share. Role-based shares are
   * resolved by `ResourcePermissionEngine` server-side — we return null
   * here to indicate "no direct share" and let the caller fall back if
   * needed. Phase 2 ships with direct user-shares only.
   */
  public async ResolveEffectivePermission(listId: string): Promise<SharePermissionLevel | null> {
    try {
      const md = this.metadata();
      const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.contextUser);
      const loaded = await list.Load(listId);
      if (!loaded) return null;
      if (list.UserID === this.contextUser.ID) return 'Owner';

      const rv = this.runView();
      const result = await rv.RunView<MJResourcePermissionEntity>({
        EntityName: 'MJ: Resource Permissions',
        ExtraFilter: `ResourceTypeID='${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID='${this.escape(listId)}' AND Type='User' AND UserID='${this.contextUser.ID}' AND Status='Approved'`,
        ResultType: 'entity_object',
      }, this.contextUser);
      if (!result.Success || !result.Results || result.Results.length === 0) return null;
      return (result.Results[0].PermissionLevel ?? null) as SharePermissionLevel | null;
    } catch (e) {
      LogError(`ResolveEffectivePermission failed for list ${listId}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /**
   * Return all lists currently shared with the context user. Role-based
   * shares are deferred to a future iteration — Phase 2 ships with
   * direct user-level shares only.
   */
  public async GetListsSharedWithUser(): Promise<SharedListSummary[]> {
    const rv = this.runView();
    const result = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID='${LIST_RESOURCE_TYPE_ID}' AND Type='User' AND UserID='${this.contextUser.ID}' AND Status='Approved'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
    }, this.contextUser);
    if (!result.Success || !result.Results) return [];
    // Resolve list names in one pass via a single RunView. Avoids an N+1.
    const listIds = result.Results.map((p) => p.ResourceRecordID);
    if (listIds.length === 0) return [];
    const filter = listIds.map((id) => `'${this.escape(id)}'`).join(',');
    const listLookup = await rv.RunView<{ ID: string; Name: string }>({
      EntityName: 'MJ: Lists',
      ExtraFilter: `ID IN (${filter})`,
      Fields: ['ID', 'Name'],
      ResultType: 'simple',
    }, this.contextUser);
    const nameById = new Map<string, string>();
    if (listLookup.Success && listLookup.Results) {
      for (const row of listLookup.Results) {
        nameById.set(String(row.ID), String(row.Name));
      }
    }
    return result.Results.map((p) => ({
      ListID: p.ResourceRecordID,
      ListName: nameById.get(p.ResourceRecordID) ?? '(unknown list)',
      PermissionLevel: (p.PermissionLevel ?? 'View') as SharePermissionLevel,
      SharedByUserID: p.SharedByUserID,
      SharedAt: p.__mj_CreatedAt,
    }));
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  private async findExistingPermission(
    listId: string,
    target: ShareTarget,
  ): Promise<MJResourcePermissionEntity | null> {
    const rv = this.runView();
    const targetClause =
      target.kind === 'user'
        ? `Type='User' AND UserID='${this.escape(target.userId)}'`
        : `Type='Role' AND RoleID='${this.escape(target.roleId)}'`;
    const result = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID='${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID='${this.escape(listId)}' AND ${targetClause}`,
      ResultType: 'entity_object',
    }, this.contextUser);
    if (!result.Success || !result.Results || result.Results.length === 0) return null;
    return result.Results[0];
  }

  private toShareSummary(p: MJResourcePermissionEntity): ListShareSummary {
    const target: ShareTarget =
      p.Type === 'User'
        ? { kind: 'user', userId: p.UserID! }
        : { kind: 'role', roleId: p.RoleID! };
    return {
      PermissionID: p.ID,
      ListID: p.ResourceRecordID,
      Target: target,
      PermissionLevel: (p.PermissionLevel ?? 'View') as SharePermissionLevel,
      Status: p.Status,
      SharedByUserID: p.SharedByUserID,
      CreatedAt: p.__mj_CreatedAt,
    };
  }

  private snapshotTarget(p: MJResourcePermissionEntity): Record<string, unknown> {
    return {
      TargetKind: p.Type === 'User' ? 'user' : 'role',
      TargetID: p.Type === 'User' ? p.UserID : p.RoleID,
      Level: p.PermissionLevel,
    };
  }

  private targetId(target: ShareTarget): string {
    return target.kind === 'user' ? target.userId : target.roleId;
  }

  /**
   * Generate a 32-byte URL-safe random token for invitations. 256 bits of
   * entropy is overkill for a 7-day TTL but cheap, and keeps the token
   * unguessable even if the database leaks Statuses/Emails separately.
   *
   * Uses the Web Crypto API (`globalThis.crypto.getRandomValues`) so the
   * function works identically in Node 19+ and browser bundles — without
   * the `node:crypto` import that breaks browser-side bundling.
   */
  private generateInvitationToken(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    // Base64-URL: standard base64 then swap `+` `/` and strip `=` padding.
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = (typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64'));
    return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  /**
   * Best-effort audit-log emit. We never fail the parent operation on
   * an audit-log failure; instead we LogError so the discrepancy is
   * observable. Cross-cutting reliability concern.
   */
  private async emitAuditLog(args: {
    TypeID: string;
    ListID: string;
    Description: string;
    Details: Record<string, unknown>;
  }): Promise<void> {
    try {
      const md = this.metadata();
      const log = await md.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', this.contextUser);
      log.NewRecord();
      log.UserID = this.contextUser.ID;
      log.AuditLogTypeID = args.TypeID;
      log.Status = 'Success';
      log.Description = args.Description;
      log.Details = JSON.stringify(args.Details);
      // EntityID for MJ: Lists is looked up lazily — cached on first call.
      const listEntity = md.Entities.find((e) => e.Name === 'MJ: Lists');
      if (listEntity) log.EntityID = listEntity.ID;
      log.RecordID = args.ListID;
      const ok = await log.Save();
      if (!ok) {
        LogError(`Audit log save failed: ${log.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }
    } catch (e) {
      LogError(`emitAuditLog threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Fire-and-forget share notification via the platform-wide dispatcher.
   * If the recipient has notification preferences for email, MJServer's
   * registered handler will send an email; if they prefer in-app only,
   * a `MJ: User Notifications` row is written instead. Either way the
   * share itself has already succeeded — a notification failure is logged
   * (inside `CreateShareNotification`) but does not propagate.
   *
   * Pre-condition: this is only called for `Target.kind === 'user'` and
   * never for self-shares (the caller guards both).
   */
  private async dispatchShareNotification(
    listId: string,
    granteeUserId: string,
    level: SharePermissionLevel,
  ): Promise<void> {
    try {
      const md = this.metadata();
      // Resolve the list name for the notification copy. Best-effort — if
      // it fails, the dispatcher falls back to a generic "shared a list".
      let listName: string | undefined;
      try {
        const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.contextUser);
        const loaded = await list.Load(listId);
        if (loaded) listName = list.Name;
      } catch {
        // ignore — listName stays undefined
      }
      await CreateShareNotification({
        Provider: this.metadata() as unknown as IMetadataProvider,
        ContextUser: this.contextUser,
        GrantorUserID: this.contextUser.ID,
        GranteeUserID: granteeUserId,
        ResourceTypeLabel: 'List',
        ResourceTypeName: 'Lists',
        ResourceName: listName,
        ResourceRecordID: listId,
        ActionsSummary: `granted ${level} access`,
        ExtraConfiguration: { PermissionLevel: level },
      });
    } catch (e) {
      LogError(`dispatchShareNotification failed for list ${listId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private shareFailure(code: ShareResultCode, message: string): ShareResult {
    return { Success: false, ResultCode: code, Message: message };
  }

  /** Escape a value for inline-literal use in `ExtraFilter`. */
  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }

  private metadata(): Metadata {
    return (this.provider as unknown as Metadata | undefined) ?? new Metadata();
  }

  private runView(): RunView {
    return this.provider ? RunView.FromMetadataProvider(this.provider) : new RunView();
  }
}

// Re-export the user entity so consumers don't have to dual-import; some
// callers (e.g. the resolver's recipient-resolve path) need it. Kept thin
// to avoid pulling unnecessary surface into the public API.
export type { MJUserEntity };
