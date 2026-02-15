import { Injectable } from '@angular/core';
import { Metadata, RunView, CompositeKey, LogError } from '@memberjunction/core';
import { MJUserRecordLogEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Represents a recently accessed resource
 */
export interface RecentAccessItem {
  id: string;
  entityId: string;
  entityName: string;
  recordId: string;
  recordName?: string;
  latestAt: Date;
  totalCount: number;
  /** Resource type for special handling (record, view, dashboard, artifact) */
  resourceType: 'record' | 'view' | 'dashboard' | 'artifact' | 'report';
}

/**
 * Service for tracking and retrieving recently accessed resources.
 * Uses the User Record Logs entity to persist access history.
 */
@Injectable({
  providedIn: 'root'
})
export class RecentAccessService {
  private static _instance: RecentAccessService;
  private _recentItems$ = new BehaviorSubject<RecentAccessItem[]>([]);
  private _isLoading$ = new BehaviorSubject<boolean>(false);
  private _isLoaded = false;

  constructor() {
    if (RecentAccessService._instance) {
      return RecentAccessService._instance;
    }
    RecentAccessService._instance = this;
  }

  public static get Instance(): RecentAccessService {
    return RecentAccessService._instance;
  }

  /**
   * Observable of recent access items, sorted by most recent first
   */
  public get RecentItems(): Observable<RecentAccessItem[]> {
    return this._recentItems$.asObservable();
  }

  /**
   * Current value of recent items
   */
  public get RecentItemsValue(): RecentAccessItem[] {
    return this._recentItems$.value;
  }

  /**
   * Observable loading state
   */
  public get IsLoading(): Observable<boolean> {
    return this._isLoading$.asObservable();
  }

  /**
   * Logs access to a record. Creates or updates the User Record Log entry.
   * This is a fire-and-forget operation - errors are logged but don't interrupt the user.
   *
   * @param entityName - The name of the entity being accessed
   * @param recordId - The record ID (single value or CompositeKey string)
   * @param resourceType - The type of resource being accessed
   */
  public async logAccess(
    entityName: string,
    recordId: string | CompositeKey,
    resourceType: 'record' | 'view' | 'dashboard' | 'artifact' | 'report' = 'record'
  ): Promise<void> {
    try {
      const md = new Metadata();
      const entityInfo = md.Entities.find(e => e.Name === entityName);
      if (!entityInfo) {
        console.warn(`RecentAccessService: Entity "${entityName}" not found in metadata`);
        return;
      }

      // Convert CompositeKey to string if needed
      const recordIdString = recordId instanceof CompositeKey
        ? recordId.Values(',')  // Values() returns joined string with specified delimiter
        : recordId;

      // Check if we already have a log entry for this user/entity/record combination
      const rv = new RunView();
      const existingResult = await rv.RunView<MJUserRecordLogEntity>({
        EntityName: 'MJ: User Record Logs',
        ExtraFilter: `UserID='${md.CurrentUser.ID}' AND EntityID='${entityInfo.ID}' AND RecordID='${recordIdString}'`,
        ResultType: 'entity_object',
        MaxRows: 1
      });

      if (!existingResult.Success) {
        console.error('RecentAccessService: Failed to check existing log', existingResult.ErrorMessage);
        return;
      }

      if (existingResult.Results && existingResult.Results.length > 0) {
        // Update existing entry
        const existing = existingResult.Results[0];
        existing.LatestAt = new Date();
        existing.TotalCount = (existing.TotalCount || 0) + 1;

        const saveResult = await existing.Save();
        if (!saveResult) {
          console.error('RecentAccessService: Failed to update log entry');
        }
      } else {
        // Create new entry
        const newLog = await md.GetEntityObject<MJUserRecordLogEntity>('MJ: User Record Logs');
        newLog.UserID = md.CurrentUser.ID;
        newLog.EntityID = entityInfo.ID;
        newLog.RecordID = recordIdString;
        // EarliestAt and LatestAt have default values of getdate() in the DB
        // TotalCount defaults to 0, so we set it to 1
        newLog.TotalCount = 1;

        const saveResult = await newLog.Save();
        if (!saveResult) {
          console.error('RecentAccessService: Failed to create log entry');
        }
      }

      // Refresh the recent items list in background
      this.refreshRecentItems();
    } catch (error) {
      // Don't throw - this is non-critical functionality
      console.error('RecentAccessService: Error logging access', error);
    }
  }

  /**
   * Loads recent access items for the current user using UserInfoEngine (cached).
   * @param maxItems - Maximum number of items to return (default 15)
   * @param forceRefresh - Force refresh even if already loaded
   */
  public async loadRecentItems(maxItems: number = 15, forceRefresh: boolean = false): Promise<RecentAccessItem[]> {
    if (this._isLoaded && !forceRefresh) {
      return this._recentItems$.value;
    }

    try {
      this._isLoading$.next(true);

      const md = new Metadata();

      // Get recent records, limited to maxItems (already ordered by LatestAt DESC in engine)
      const userRecordLogs = UserInfoEngine.Instance.UserRecordLogs.slice(0, maxItems);

      const items: RecentAccessItem[] = [];

      for (const log of userRecordLogs) {
        const entityInfo = md.Entities.find(e => e.ID === log.EntityID);
        if (!entityInfo) continue;

        // Determine resource type based on entity name
        const resourceType = this.determineResourceType(entityInfo.Name);

        items.push({
          id: log.ID,
          entityId: log.EntityID,
          entityName: entityInfo.Name,
          recordId: log.RecordID,
          latestAt: log.LatestAt,
          totalCount: log.TotalCount,
          resourceType
        });
      }

      this._recentItems$.next(items);
      this._isLoaded = true;

      return items;
    } catch (error) {
      LogError('RecentAccessService: Error loading recent items', undefined, error);
      return [];
    } finally {
      this._isLoading$.next(false);
    }
  }

  /**
   * Refresh recent items in background
   */
  public async refreshRecentItems(): Promise<void> {
    await this.loadRecentItems(15, true);
  }

  /**
   * Determines the resource type based on entity name
   */
  private determineResourceType(entityName: string): 'record' | 'view' | 'dashboard' | 'artifact' | 'report' {
    const normalizedName = entityName.toLowerCase();

    if (normalizedName === 'user views') {
      return 'view';
    }
    if (normalizedName === 'dashboards') {
      return 'dashboard';
    }
    if (normalizedName === 'mj: conversation artifacts' || normalizedName === 'conversation artifacts') {
      return 'artifact';
    }
    if (normalizedName === 'reports') {
      return 'report';
    }

    return 'record';
  }

  /**
   * Clears the cached recent items (useful for logout)
   */
  public clearCache(): void {
    this._recentItems$.next([]);
    this._isLoaded = false;
  }
}
