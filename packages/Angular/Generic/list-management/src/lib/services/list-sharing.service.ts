import { Injectable } from '@angular/core';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  ListEntity,
  ResourcePermissionEntity,
  ResourceTypeEntity,
  UserEntity,
  RoleEntity
} from '@memberjunction/core-entities';
import { BehaviorSubject, Observable } from 'rxjs';
import { ListShareInfo, ListPermissionLevel, ShareRecipient, ListShareResult } from '../models/list-sharing.models';

/**
 * Known List ResourceType ID from the database
 */
const LIST_RESOURCE_TYPE_ID = 'E64D433E-F36B-1410-8560-0041FA62858A';

/**
 * Service for managing list sharing using the existing ResourcePermission system.
 * Lists are already registered as a ResourceType, so we use ResourcePermissions
 * to share lists with users and roles.
 */
@Injectable({
  providedIn: 'root'
})
export class ListSharingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  // Cache for users and roles (for autocomplete)
  private usersCache: UserEntity[] | null = null;
  private rolesCache: RoleEntity[] | null = null;

  constructor() {}

  /**
   * Get the ResourceType ID for Lists
   */
  getListResourceTypeId(): string {
    return LIST_RESOURCE_TYPE_ID;
  }

  /**
   * Get all shares for a specific list
   */
  async getListShares(listId: string): Promise<ListShareInfo[]> {
    this.loadingSubject.next(true);

    try {
      const rv = new RunView();
      const result = await rv.RunView<ResourcePermissionEntity>({
        EntityName: 'Resource Permissions',
        ExtraFilter: `ResourceTypeID = '${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID = '${listId}'`,
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

  /**
   * Get permission level for a specific user on a specific list
   */
  async getUserPermissionLevel(listId: string, userId: string): Promise<ListPermissionLevel | null> {
    const rv = new RunView();

    // Check direct user permission
    const userResult = await rv.RunView<ResourcePermissionEntity>({
      EntityName: 'Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID = '${listId}' AND Type = 'User' AND UserID = '${userId}' AND Status = 'Approved'`,
      ResultType: 'entity_object'
    });

    if (userResult.Success && userResult.Results && userResult.Results.length > 0) {
      return userResult.Results[0].PermissionLevel as ListPermissionLevel;
    }

    // If no direct permission, could check role-based permissions
    // For now, return null
    return null;
  }

  /**
   * Share a list with a user
   */
  async shareListWithUser(
    listId: string,
    userId: string,
    permissionLevel: ListPermissionLevel,
    sharedByUserId: string
  ): Promise<ListShareResult> {
    try {
      const md = new Metadata();

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
      const permission = await md.GetEntityObject<ResourcePermissionEntity>('Resource Permissions');
      permission.NewRecord();
      permission.ResourceTypeID = LIST_RESOURCE_TYPE_ID;
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

  /**
   * Share a list with a role
   */
  async shareListWithRole(
    listId: string,
    roleId: string,
    permissionLevel: ListPermissionLevel,
    sharedByUserId: string
  ): Promise<ListShareResult> {
    try {
      const md = new Metadata();

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
      const permission = await md.GetEntityObject<ResourcePermissionEntity>('Resource Permissions');
      permission.NewRecord();
      permission.ResourceTypeID = LIST_RESOURCE_TYPE_ID;
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

  /**
   * Update permission level for an existing share
   */
  async updateSharePermission(
    shareId: string,
    newPermissionLevel: ListPermissionLevel
  ): Promise<ListShareResult> {
    try {
      const md = new Metadata();
      const permission = await md.GetEntityObject<ResourcePermissionEntity>('Resource Permissions');

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

  /**
   * Remove a share (revoke access)
   */
  async removeShare(shareId: string): Promise<ListShareResult> {
    try {
      const md = new Metadata();
      const permission = await md.GetEntityObject<ResourcePermissionEntity>('Resource Permissions');

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

  /**
   * Get lists shared with the current user (that they don't own)
   */
  async getListsSharedWithUser(userId: string): Promise<string[]> {
    const rv = new RunView();

    const result = await rv.RunView<ResourcePermissionEntity>({
      EntityName: 'Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${LIST_RESOURCE_TYPE_ID}' AND Type = 'User' AND UserID = '${userId}' AND Status = 'Approved'`,
      Fields: ['ResourceRecordID'],
      ResultType: 'simple'
    });

    if (!result.Success || !result.Results) {
      return [];
    }

    return result.Results.map((r: { ResourceRecordID: string }) => r.ResourceRecordID);
  }

  /**
   * Get lists that the user has shared with others
   */
  async getListsSharedByUser(userId: string): Promise<Map<string, number>> {
    // First get all lists owned by the user
    const rv = new RunView();

    const listsResult = await rv.RunView<ListEntity>({
      EntityName: 'Lists',
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
    const sharesResult = await rv.RunView<ResourcePermissionEntity>({
      EntityName: 'Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID IN (${listIdFilter}) AND Status = 'Approved'`,
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

  /**
   * Check if user can share a list (must be owner or have Owner permission)
   */
  async canUserShareList(listId: string, userId: string): Promise<boolean> {
    const rv = new RunView();

    // Check if user is the owner
    const listResult = await rv.RunView<ListEntity>({
      EntityName: 'Lists',
      ExtraFilter: `ID = '${listId}' AND UserID = '${userId}'`,
      ResultType: 'simple'
    });

    if (listResult.Success && listResult.Results && listResult.Results.length > 0) {
      return true;
    }

    // Check if user has Owner permission
    const permissionLevel = await this.getUserPermissionLevel(listId, userId);
    return permissionLevel === 'Owner';
  }

  /**
   * Search users for sharing autocomplete
   */
  async searchUsers(searchTerm: string, limit: number = 10): Promise<ShareRecipient[]> {
    const rv = new RunView();

    const result = await rv.RunView<UserEntity>({
      EntityName: 'Users',
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

  /**
   * Search roles for sharing autocomplete
   */
  async searchRoles(searchTerm: string, limit: number = 10): Promise<ShareRecipient[]> {
    const rv = new RunView();

    const result = await rv.RunView<RoleEntity>({
      EntityName: 'Roles',
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

  /**
   * Get all available users (cached)
   */
  async getAllUsers(forceRefresh: boolean = false): Promise<UserEntity[]> {
    if (!forceRefresh && this.usersCache) {
      return this.usersCache;
    }

    const rv = new RunView();
    const result = await rv.RunView<UserEntity>({
      EntityName: 'Users',
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

  /**
   * Get all available roles (cached)
   */
  async getAllRoles(forceRefresh: boolean = false): Promise<RoleEntity[]> {
    if (!forceRefresh && this.rolesCache) {
      return this.rolesCache;
    }

    const rv = new RunView();
    const result = await rv.RunView<RoleEntity>({
      EntityName: 'Roles',
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results) {
      this.rolesCache = result.Results;
      return result.Results;
    }

    return [];
  }

  /**
   * Helper to find existing share
   */
  private async findExistingShare(
    listId: string,
    type: 'User' | 'Role',
    recipientId: string
  ): Promise<ResourcePermissionEntity | null> {
    const rv = new RunView();
    const idField = type === 'User' ? 'UserID' : 'RoleID';

    const result = await rv.RunView<ResourcePermissionEntity>({
      EntityName: 'Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID = '${listId}' AND Type = '${type}' AND ${idField} = '${recipientId}'`,
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results && result.Results.length > 0) {
      return result.Results[0];
    }

    return null;
  }

  /**
   * Convert ResourcePermissionEntity to ListShareInfo
   */
  private async convertToListShareInfo(permission: ResourcePermissionEntity): Promise<ListShareInfo | null> {
    const rv = new RunView();

    if (permission.Type === 'User' && permission.UserID) {
      const userResult = await rv.RunView<UserEntity>({
        EntityName: 'Users',
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
      const roleResult = await rv.RunView<RoleEntity>({
        EntityName: 'Roles',
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
  async getListSharingSummary(listId: string): Promise<{ listId: string; totalShares: number; userShares: number; roleShares: number; isSharedWithMe: boolean; isSharedByMe: boolean }> {
    const rv = new RunView();

    const result = await rv.RunView<ResourcePermissionEntity>({
      EntityName: 'Resource Permissions',
      ExtraFilter: `ResourceTypeID = '${LIST_RESOURCE_TYPE_ID}' AND ResourceRecordID = '${listId}' AND Status = 'Approved'`,
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

  /**
   * Clear internal caches
   */
  clearCache(): void {
    this.usersCache = null;
    this.rolesCache = null;
  }
}
