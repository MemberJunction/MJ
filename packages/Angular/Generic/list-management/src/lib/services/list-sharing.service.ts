import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  MJListEntity,
  MJResourcePermissionEntity,
  MJResourceTypeEntity,
  MJUserEntity,
  MJRoleEntity,
  ResourceTypeEngine,
} from '@memberjunction/core-entities';
import { BehaviorSubject, Observable } from 'rxjs';
import { ListShareInfo, ListPermissionLevel, ShareRecipient, ListShareResult } from '../models/list-sharing.models';

/** Name of the row in `MJ: Resource Types` that scopes List shares. */
const LIST_RESOURCE_TYPE_NAME = 'Lists';

/**
 * Service for managing list sharing using the existing ResourcePermission system.
 * Lists are already registered as a ResourceType, so we use ResourcePermissions
 * to share lists with users and roles.
 *
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable({
  providedIn: 'root'
})
export class ListSharingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public Loading$: Observable<boolean> = this.loadingSubject.asObservable();

  /** @deprecated Use {@link Loading$}. */
  public get loading$(): Observable<boolean> {
    return this.Loading$;
  }
  /** @deprecated Use {@link Loading$}. */
  public set loading$(value: Observable<boolean>) {
    this.Loading$ = value;
  }

  // Cache for users and roles (for autocomplete)
  private usersCache: MJUserEntity[] | null = null;
  private rolesCache: MJRoleEntity[] | null = null;

  private _provider: IMetadataProvider | null = null;

  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  constructor() {}

  /**
   * Resolve the `MJ: Resource Types.ID` for the row named "Lists" via the
   * shared `ResourceTypeEngine`. Throws if missing — that indicates a
   * misconfigured environment (seed data never pushed) and we'd rather fail
   * loud than write `MJResourcePermission` rows with an undefined
   * `ResourceTypeID`. `Engine.Config()` is idempotent (BaseEngine semantics)
   * so calling this on every method that needs it is cheap.
   */
  private async resolveListResourceTypeId(): Promise<string> {
    await ResourceTypeEngine.Instance.Config(false, undefined, this.Provider);
    const rt = ResourceTypeEngine.Instance.ByName(LIST_RESOURCE_TYPE_NAME);
    if (!rt) {
      throw new Error(
        `MJ: Resource Types row "${LIST_RESOURCE_TYPE_NAME}" not found. ` +
          `Seed metadata/resource-types/ via 'mj sync push' before using ListSharingService.`,
      );
    }
    return rt.ID;
  }

  /**
   * Get all shares for a specific list
   */
  async GetListShares(listId: string): Promise<ListShareInfo[]> {
    this.loadingSubject.next(true);

    try {
      const resourceTypeId = await this.resolveListResourceTypeId();
      const rv = RunView.FromMetadataProvider(this.Provider);
      const result = await rv.RunView<MJResourcePermissionEntity>({
        EntityName: 'MJ: Resource Permissions',
        ExtraFilter: `ResourceTypeID = '${resourceTypeId}' AND ResourceRecordID = '${listId}'`,
        ResultType: 'entity_object'
      });

      if (!result.Success || !result.Results) {
        return [];
      }

      // Convert to ListShareInfo objects with user/role details
      const shares: ListShareInfo[] = [];

      for (const permission of result.Results) {
        const shareInfo = await this.convertToListShareInfo(permission);
        if (shareInfo) {
          shares.push(shareInfo);
        }
      }

      return shares;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /** @deprecated Use {@link GetListShares}. */
  async getListShares(listId: string): Promise<ListShareInfo[]> {
    return this.GetListShares(listId);
  }

  /**
   * Get permission level for a specific user on a specific list
   */
  async GetUserPermissionLevel(listId: string, userId: string): Promise<ListPermissionLevel | null> {
    const resourceTypeId = await this.resolveListResourceTypeId();
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Check direct user permission
    const userResult = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${resourceTypeId}' AND ResourceRecordID = '${listId}' AND Type = 'User' AND UserID = '${userId}' AND Status = 'Approved'`,
      ResultType: 'entity_object'
    });

    if (userResult.Success && userResult.Results && userResult.Results.length > 0) {
      return userResult.Results[0].PermissionLevel as ListPermissionLevel;
    }

    // If no direct permission, could check role-based permissions
    // For now, return null
    return null;
  }

  /** @deprecated Use {@link GetUserPermissionLevel}. */
  async getUserPermissionLevel(listId: string, userId: string): Promise<ListPermissionLevel | null> {
    return this.GetUserPermissionLevel(listId, userId);
  }

  /**
   * Share a list with a user
   */
  async ShareListWithUser(
    listId: string,
    userId: string,
    permissionLevel: ListPermissionLevel,
    sharedByUserId: string
  ): Promise<ListShareResult> {
    try {
      const md = this.Provider;

      // Check if share already exists
      const existing = await this.findExistingShare(listId, 'User', userId);

      if (existing) {
        // Update existing share
        existing.PermissionLevel = permissionLevel;
        existing.Status = 'Approved';
        const saved = await existing.Save();
        return {
          success: saved,
          shareId: existing.ID,
          message: saved ? 'Share updated successfully' : 'Failed to update share'
        };
      }

      // Create new share
      const resourceTypeId = await this.resolveListResourceTypeId();
      const permission = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');
      permission.NewRecord();
      permission.ResourceTypeID = resourceTypeId;
      permission.ResourceRecordID = listId;
      permission.Type = 'User';
      permission.UserID = userId;
      permission.PermissionLevel = permissionLevel;
      permission.Status = 'Approved';

      const saved = await permission.Save();
      return {
        success: saved,
        shareId: permission.ID,
        message: saved ? 'List shared successfully' : 'Failed to share list'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error sharing list: ${errorMessage}`
      };
    }
  }

  /** @deprecated Use {@link ShareListWithUser}. */
  async shareListWithUser(
    listId: string,
    userId: string,
    permissionLevel: ListPermissionLevel,
    sharedByUserId: string
  ): Promise<ListShareResult> {
    return this.ShareListWithUser(listId, userId, permissionLevel, sharedByUserId);
  }

  /**
   * Share a list with a role
   */
  async ShareListWithRole(
    listId: string,
    roleId: string,
    permissionLevel: ListPermissionLevel,
    sharedByUserId: string
  ): Promise<ListShareResult> {
    try {
      const md = this.Provider;

      // Check if share already exists
      const existing = await this.findExistingShare(listId, 'Role', roleId);

      if (existing) {
        // Update existing share
        existing.PermissionLevel = permissionLevel;
        existing.Status = 'Approved';
        const saved = await existing.Save();
        return {
          success: saved,
          shareId: existing.ID,
          message: saved ? 'Share updated successfully' : 'Failed to update share'
        };
      }

      // Create new share
      const resourceTypeId = await this.resolveListResourceTypeId();
      const permission = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');
      permission.NewRecord();
      permission.ResourceTypeID = resourceTypeId;
      permission.ResourceRecordID = listId;
      permission.Type = 'Role';
      permission.RoleID = roleId;
      permission.PermissionLevel = permissionLevel;
      permission.Status = 'Approved';

      const saved = await permission.Save();
      return {
        success: saved,
        shareId: permission.ID,
        message: saved ? 'List shared with role successfully' : 'Failed to share list with role'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error sharing list: ${errorMessage}`
      };
    }
  }

  /** @deprecated Use {@link ShareListWithRole}. */
  async shareListWithRole(
    listId: string,
    roleId: string,
    permissionLevel: ListPermissionLevel,
    sharedByUserId: string
  ): Promise<ListShareResult> {
    return this.ShareListWithRole(listId, roleId, permissionLevel, sharedByUserId);
  }

  /**
   * Update permission level for an existing share
   */
  async UpdateSharePermission(
    shareId: string,
    newPermissionLevel: ListPermissionLevel
  ): Promise<ListShareResult> {
    try {
      const md = this.Provider;
      const permission = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');

      const loaded = await permission.Load(shareId);
      if (!loaded) {
        return {
          success: false,
          message: 'Share not found'
        };
      }

      permission.PermissionLevel = newPermissionLevel;
      const saved = await permission.Save();

      return {
        success: saved,
        shareId: permission.ID,
        message: saved ? 'Permission updated successfully' : 'Failed to update permission'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error updating permission: ${errorMessage}`
      };
    }
  }

  /** @deprecated Use {@link UpdateSharePermission}. */
  async updateSharePermission(
    shareId: string,
    newPermissionLevel: ListPermissionLevel
  ): Promise<ListShareResult> {
    return this.UpdateSharePermission(shareId, newPermissionLevel);
  }

  /**
   * Remove a share (revoke access)
   */
  async RemoveShare(shareId: string): Promise<ListShareResult> {
    try {
      const md = this.Provider;
      const permission = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');

      const loaded = await permission.Load(shareId);
      if (!loaded) {
        return {
          success: false,
          message: 'Share not found'
        };
      }

      const deleted = await permission.Delete();

      return {
        success: deleted,
        message: deleted ? 'Share removed successfully' : 'Failed to remove share'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error removing share: ${errorMessage}`
      };
    }
  }

  /** @deprecated Use {@link RemoveShare}. */
  async removeShare(shareId: string): Promise<ListShareResult> {
    return this.RemoveShare(shareId);
  }

  /**
   * Get lists shared with the current user (that they don't own)
   */
  async GetListsSharedWithUser(userId: string): Promise<string[]> {
    const resourceTypeId = await this.resolveListResourceTypeId();
    const rv = RunView.FromMetadataProvider(this.Provider);

    const result = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${resourceTypeId}' AND Type = 'User' AND UserID = '${userId}' AND Status = 'Approved'`,
      Fields: ['ResourceRecordID'],
      ResultType: 'simple'
    });

    if (!result.Success || !result.Results) {
      return [];
    }

    return result.Results.map((r: { ResourceRecordID: string }) => r.ResourceRecordID);
  }

  /** @deprecated Use {@link GetListsSharedWithUser}. */
  async getListsSharedWithUser(userId: string): Promise<string[]> {
    return this.GetListsSharedWithUser(userId);
  }

  /**
   * Get lists that the user has shared with others
   */
  async GetListsSharedByUser(userId: string): Promise<Map<string, number>> {
    // First get all lists owned by the user
    const rv = RunView.FromMetadataProvider(this.Provider);

    const listsResult = await rv.RunView<MJListEntity>({
      EntityName: 'MJ: Lists',
      ExtraFilter: `UserID = '${userId}'`,
      Fields: ['ID'],
      ResultType: 'simple'
    });

    if (!listsResult.Success || !listsResult.Results || listsResult.Results.length === 0) {
      return new Map();
    }

    const listIds = listsResult.Results.map((l: { ID: string }) => l.ID);
    const listIdFilter = listIds.map((id: string) => `'${id}'`).join(',');

    // Get all shares for these lists
    const resourceTypeId = await this.resolveListResourceTypeId();
    const sharesResult = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${resourceTypeId}' AND ResourceRecordID IN (${listIdFilter}) AND Status = 'Approved'`,
      Fields: ['ResourceRecordID'],
      ResultType: 'simple'
    });

    const shareCountMap = new Map<string, number>();

    if (sharesResult.Success && sharesResult.Results) {
      for (const share of sharesResult.Results) {
        const typedShare = share as { ResourceRecordID: string };
        const current = shareCountMap.get(typedShare.ResourceRecordID) || 0;
        shareCountMap.set(typedShare.ResourceRecordID, current + 1);
      }
    }

    return shareCountMap;
  }

  /** @deprecated Use {@link GetListsSharedByUser}. */
  async getListsSharedByUser(userId: string): Promise<Map<string, number>> {
    return this.GetListsSharedByUser(userId);
  }

  /**
   * Check if user can share a list (must be owner or have Owner permission)
   */
  async CanUserShareList(listId: string, userId: string): Promise<boolean> {
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Check if user is the owner
    const listResult = await rv.RunView<MJListEntity>({
      EntityName: 'MJ: Lists',
      ExtraFilter: `ID = '${listId}' AND UserID = '${userId}'`,
      ResultType: 'simple'
    });

    if (listResult.Success && listResult.Results && listResult.Results.length > 0) {
      return true;
    }

    // Check if user has Owner permission
    const permissionLevel = await this.GetUserPermissionLevel(listId, userId);
    return permissionLevel === 'Owner';
  }

  /** @deprecated Use {@link CanUserShareList}. */
  async canUserShareList(listId: string, userId: string): Promise<boolean> {
    return this.CanUserShareList(listId, userId);
  }

  /**
   * Search users for sharing autocomplete
   */
  async SearchUsers(searchTerm: string, limit: number = 10): Promise<ShareRecipient[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);

    const result = await rv.RunView<MJUserEntity>({
      EntityName: 'MJ: Users',
      ExtraFilter: `(Name LIKE '%${searchTerm}%' OR Email LIKE '%${searchTerm}%') AND IsActive = 1`,
      OrderBy: 'Name',
      MaxRows: limit,
      ResultType: 'entity_object'
    });

    if (!result.Success || !result.Results) {
      return [];
    }

    return result.Results.map(user => ({
      id: user.ID,
      name: user.Name,
      email: user.Email,
      type: 'User' as const
    }));
  }

  /** @deprecated Use {@link SearchUsers}. */
  async searchUsers(searchTerm: string, limit: number = 10): Promise<ShareRecipient[]> {
    return this.SearchUsers(searchTerm, limit);
  }

  /**
   * Search roles for sharing autocomplete
   */
  async SearchRoles(searchTerm: string, limit: number = 10): Promise<ShareRecipient[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);

    const result = await rv.RunView<MJRoleEntity>({
      EntityName: 'MJ: Roles',
      ExtraFilter: `Name LIKE '%${searchTerm}%'`,
      OrderBy: 'Name',
      MaxRows: limit,
      ResultType: 'entity_object'
    });

    if (!result.Success || !result.Results) {
      return [];
    }

    return result.Results.map(role => ({
      id: role.ID,
      name: role.Name,
      type: 'Role' as const
    }));
  }

  /** @deprecated Use {@link SearchRoles}. */
  async searchRoles(searchTerm: string, limit: number = 10): Promise<ShareRecipient[]> {
    return this.SearchRoles(searchTerm, limit);
  }

  /**
   * Get all available users (cached)
   */
  async GetAllUsers(forceRefresh: boolean = false): Promise<MJUserEntity[]> {
    if (!forceRefresh && this.usersCache) {
      return this.usersCache;
    }

    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<MJUserEntity>({
      EntityName: 'MJ: Users',
      ExtraFilter: 'IsActive = 1',
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results) {
      this.usersCache = result.Results;
      return result.Results;
    }

    return [];
  }

  /** @deprecated Use {@link GetAllUsers}. */
  async getAllUsers(forceRefresh: boolean = false): Promise<MJUserEntity[]> {
    return this.GetAllUsers(forceRefresh);
  }

  /**
   * Get all available roles (cached)
   */
  async GetAllRoles(forceRefresh: boolean = false): Promise<MJRoleEntity[]> {
    if (!forceRefresh && this.rolesCache) {
      return this.rolesCache;
    }

    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<MJRoleEntity>({
      EntityName: 'MJ: Roles',
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results) {
      this.rolesCache = result.Results;
      return result.Results;
    }

    return [];
  }

  /** @deprecated Use {@link GetAllRoles}. */
  async getAllRoles(forceRefresh: boolean = false): Promise<MJRoleEntity[]> {
    return this.GetAllRoles(forceRefresh);
  }

  /**
   * Helper to find existing share
   */
  private async findExistingShare(
    listId: string,
    type: 'User' | 'Role',
    recipientId: string
  ): Promise<MJResourcePermissionEntity | null> {
    const resourceTypeId = await this.resolveListResourceTypeId();
    const rv = RunView.FromMetadataProvider(this.Provider);
    const idField = type === 'User' ? 'UserID' : 'RoleID';

    const result = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${resourceTypeId}' AND ResourceRecordID = '${listId}' AND Type = '${type}' AND ${idField} = '${recipientId}'`,
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results && result.Results.length > 0) {
      return result.Results[0];
    }

    return null;
  }

  /**
   * Convert MJResourcePermissionEntity to ListShareInfo
   */
  private async convertToListShareInfo(permission: MJResourcePermissionEntity): Promise<ListShareInfo | null> {
    const rv = RunView.FromMetadataProvider(this.Provider);

    if (permission.Type === 'User' && permission.UserID) {
      const userResult = await rv.RunView<MJUserEntity>({
        EntityName: 'MJ: Users',
        ExtraFilter: `ID = '${permission.UserID}'`,
        ResultType: 'entity_object'
      });

      if (userResult.Success && userResult.Results && userResult.Results.length > 0) {
        const user = userResult.Results[0];
        return {
          shareId: permission.ID,
          listId: permission.ResourceRecordID,
          type: 'User',
          recipientId: permission.UserID,
          recipientName: user.Name,
          recipientEmail: user.Email,
          permissionLevel: permission.PermissionLevel as ListPermissionLevel,
          status: permission.Status as 'Approved' | 'Pending' | 'Rejected',
          startSharingAt: permission.StartSharingAt ? new Date(permission.StartSharingAt) : undefined,
          endSharingAt: permission.EndSharingAt ? new Date(permission.EndSharingAt) : undefined
        };
      }
    } else if (permission.Type === 'Role' && permission.RoleID) {
      const roleResult = await rv.RunView<MJRoleEntity>({
        EntityName: 'MJ: Roles',
        ExtraFilter: `ID = '${permission.RoleID}'`,
        ResultType: 'entity_object'
      });

      if (roleResult.Success && roleResult.Results && roleResult.Results.length > 0) {
        const role = roleResult.Results[0];
        return {
          shareId: permission.ID,
          listId: permission.ResourceRecordID,
          type: 'Role',
          recipientId: permission.RoleID,
          recipientName: role.Name,
          permissionLevel: permission.PermissionLevel as ListPermissionLevel,
          status: permission.Status as 'Approved' | 'Pending' | 'Rejected',
          startSharingAt: permission.StartSharingAt ? new Date(permission.StartSharingAt) : undefined,
          endSharingAt: permission.EndSharingAt ? new Date(permission.EndSharingAt) : undefined
        };
      }
    }

    return null;
  }

  /**
   * Get sharing summary for a single list
   */
  async GetListSharingSummary(listId: string): Promise<{ listId: string; totalShares: number; userShares: number; roleShares: number; isSharedWithMe: boolean; isSharedByMe: boolean }> {
    const resourceTypeId = await this.resolveListResourceTypeId();
    const rv = RunView.FromMetadataProvider(this.Provider);

    const result = await rv.RunView<MJResourcePermissionEntity>({
      EntityName: 'MJ: Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${resourceTypeId}' AND ResourceRecordID = '${listId}' AND Status = 'Approved'`,
      Fields: ['ID', 'Type'],
      ResultType: 'simple'
    });

    let userShares = 0;
    let roleShares = 0;

    if (result.Success && result.Results) {
      for (const share of result.Results) {
        const typedShare = share as { ID: string; Type: string };
        if (typedShare.Type === 'User') {
          userShares++;
        } else if (typedShare.Type === 'Role') {
          roleShares++;
        }
      }
    }

    return {
      listId,
      totalShares: userShares + roleShares,
      userShares,
      roleShares,
      isSharedWithMe: false, // Would need current user context to determine
      isSharedByMe: userShares + roleShares > 0
    };
  }

  /** @deprecated Use {@link GetListSharingSummary}. */
  async getListSharingSummary(listId: string): Promise<{ listId: string; totalShares: number; userShares: number; roleShares: number; isSharedWithMe: boolean; isSharedByMe: boolean }> {
    return this.GetListSharingSummary(listId);
  }

  /**
   * Clear internal caches
   */
  ClearCache(): void {
    this.usersCache = null;
    this.rolesCache = null;
  }

  /** @deprecated Use {@link ClearCache}. */
  clearCache(): void {
    return this.ClearCache();
  }
}
