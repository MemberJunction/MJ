import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity, MJListCategoryEntity } from '@memberjunction/core-entities';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  ListItemViewModel,
  BatchOperationResult,
  RecordMembershipInfo,
  CreateListConfig
} from '../models/list-management.models';

interface CacheEntry<T> {
  data: T;
  timestamp: Date;
}

/**
 * Service for managing list operations including data loading, caching,
 * and batch add/remove operations.
 *
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable({
  providedIn: 'root'
})
export class ListManagementService {
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Cache storage
  private listCache = new Map<string, CacheEntry<MJListEntity[]>>();
  private categoryCache: CacheEntry<MJListCategoryEntity[]> | null = null;
  private membershipCache = new Map<string, CacheEntry<Map<string, string[]>>>();

  // Loading state subjects
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  private _provider: IMetadataProvider | null = null;

  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  constructor() {}

  /**
   * Get lists for a specific entity, with optional caching
   */
  async getListsForEntity(
    entityId: string,
    userId?: string,
    forceRefresh: boolean = false
  ): Promise<MJListEntity[]> {
    const cacheKey = `${entityId}_${userId || 'all'}`;

    // Check cache first
    if (!forceRefresh) {
      const cached = this.listCache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached.data;
      }
    }

    this.loadingSubject.next(true);

    try {
      const rv = RunView.FromMetadataProvider(this.Provider);
      let filter = `EntityID = '${entityId}'`;

      if (userId) {
        filter += ` AND UserID = '${userId}'`;
      }

      const result = await rv.RunView<MJListEntity>({
        EntityName: 'MJ: Lists',
        ExtraFilter: filter,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        const lists = result.Results || [];
        this.listCache.set(cacheKey, {
          data: lists,
          timestamp: new Date()
        });
        return lists;
      } else {
        console.error('Failed to load lists:', result.ErrorMessage);
        return [];
      }
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Get all list categories
   */
  async getListCategories(forceRefresh: boolean = false): Promise<MJListCategoryEntity[]> {
    if (!forceRefresh && this.categoryCache && this.isCacheValid(this.categoryCache)) {
      return this.categoryCache.data;
    }

    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<MJListCategoryEntity>({
      EntityName: 'MJ: List Categories',
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success) {
      this.categoryCache = {
        data: result.Results || [],
        timestamp: new Date()
      };
      return this.categoryCache.data;
    }

    return [];
  }

  /**
   * Get membership information for a set of records
   * Returns a Map where key is listId and value is array of recordIds that are members
   */
  async getRecordMembership(
    entityId: string,
    recordIds: string[]
  ): Promise<Map<string, string[]>> {
    if (recordIds.length === 0) {
      return new Map();
    }

    const cacheKey = `${entityId}_${recordIds.sort().join(',')}`;

    // Check cache
    const cached = this.membershipCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    this.loadingSubject.next(true);

    try {
      const rv = RunView.FromMetadataProvider(this.Provider);

      // Get all list details for these records — read-only lookup, so
      // 'simple' with narrow Fields (no BaseEntity instantiation overhead)
      const recordIdFilter = recordIds.map(id => `'${id}'`).join(',');
      const result = await rv.RunView<{ ListID: string; RecordID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `RecordID IN (${recordIdFilter})`,
        Fields: ['ListID', 'RecordID'],
        ResultType: 'simple'
      });

      const membership = new Map<string, string[]>();

      if (result.Success && result.Results) {
        for (const detail of result.Results) {
          const existingRecords = membership.get(detail.ListID) || [];
          if (!existingRecords.includes(detail.RecordID)) {
            existingRecords.push(detail.RecordID);
          }
          membership.set(detail.ListID, existingRecords);
        }
      }

      this.membershipCache.set(cacheKey, {
        data: membership,
        timestamp: new Date()
      });

      return membership;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Get lists that contain a specific record
   */
  async getListsForRecord(
    entityId: string,
    recordId: string
  ): Promise<MJListEntity[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Get list details for this record — read-only lookup
    const detailsResult = await rv.RunView<{ ListID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `RecordID = '${recordId}'`,
      Fields: ['ListID'],
      ResultType: 'simple'
    });

    if (!detailsResult.Success || !detailsResult.Results || detailsResult.Results.length === 0) {
      return [];
    }

    const listIds = [...new Set(detailsResult.Results.map(d => d.ListID))];

    // Get the lists filtered by entity
    const listIdFilter = listIds.map(id => `'${id}'`).join(',');
    const listsResult = await rv.RunView<MJListEntity>({
      EntityName: 'MJ: Lists',
      ExtraFilter: `ID IN (${listIdFilter}) AND EntityID = '${entityId}'`,
      ResultType: 'entity_object'
    });

    return listsResult.Success ? (listsResult.Results || []) : [];
  }

  /**
   * Get item count for a list
   */
  async getListItemCount(listId: string): Promise<number> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID = '${listId}'`,
      ResultType: 'count_only'
    });

    return result.Success ? result.TotalRowCount : 0;
  }

  /**
   * Build view models for lists with membership information
   */
  async buildListViewModels(
    lists: MJListEntity[],
    recordIds: string[],
    membership: Map<string, string[]>
  ): Promise<ListItemViewModel[]> {
    const viewModels: ListItemViewModel[] = [];
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Get item counts for all lists in one batched round trip of count_only
    // queries — each an index-seek COUNT server-side. Never download the
    // membership rows just to count them.
    const countMap = new Map<string, number>();
    if (lists.length > 0) {
      const countResults = await rv.RunViews(lists.map(list => ({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID = '${list.ID}'`,
        ResultType: 'count_only' as const
      })));
      countResults.forEach((res, idx) => {
        countMap.set(lists[idx].ID, res.Success ? res.TotalRowCount : 0);
      });
    }

    for (const list of lists) {
      const memberRecordIds = membership.get(list.ID) || [];
      const membershipCount = memberRecordIds.length;
      const totalSelected = recordIds.length;

      viewModels.push({
        list,
        itemCount: countMap.get(list.ID) || 0,
        membershipCount,
        totalSelectedRecords: totalSelected,
        isFullMember: membershipCount === totalSelected && totalSelected > 0,
        isPartialMember: membershipCount > 0 && membershipCount < totalSelected,
        isNotMember: membershipCount === 0,
        lastUpdated: list.Get('__mj_UpdatedAt') as Date || new Date(),
        category: undefined, // Can be populated separately if needed
        isSelectedForAdd: false,
        isSelectedForRemove: false
      });
    }

    return viewModels;
  }

  /**
   * Add records to one or more lists
   */
  async addRecordsToLists(
    listIds: string[],
    recordIds: string[],
    skipDuplicates: boolean = true
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    const md = this.Provider;

    // Get existing membership to skip duplicates
    let existingMembership = new Map<string, Set<string>>();
    if (skipDuplicates) {
      const rv = RunView.FromMetadataProvider(this.Provider);
      const listIdFilter = listIds.map(id => `'${id}'`).join(',');
      const recordIdFilter = recordIds.map(id => `'${id}'`).join(',');

      const existing = await rv.RunView<{ ListID: string; RecordID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID IN (${listIdFilter}) AND RecordID IN (${recordIdFilter})`,
        Fields: ['ListID', 'RecordID'],
        ResultType: 'simple'
      }, md.CurrentUser);

      if (existing.Success && existing.Results) {
        for (const detail of existing.Results) {
          const recordSet = existingMembership.get(detail.ListID) || new Set();
          recordSet.add(detail.RecordID);
          existingMembership.set(detail.ListID, recordSet);
        }
      }
    }

    // Build list of records to add (excluding duplicates)
    const recordsToAdd: Array<{listId: string, recordId: string}> = [];
    for (const listId of listIds) {
      const existingRecords = existingMembership.get(listId) || new Set();
      for (const recordId of recordIds) {
        if (skipDuplicates && existingRecords.has(recordId)) {
          result.skipped++;
        } else {
          recordsToAdd.push({ listId, recordId });
        }
      }
    }

    if (recordsToAdd.length === 0) {
      return result;
    }

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (const { listId, recordId } of recordsToAdd) {
      try {
        const listDetail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', md.CurrentUser);
        listDetail.ListID = listId;
        listDetail.RecordID = recordId;
        listDetail.TransactionGroup = tg;
        const saveResult = await listDetail.Save();
        if (!saveResult) {
          console.error(`[ListManagementService] Failed to queue record ${recordId} for list ${listId}:`, listDetail.LatestResult?.Message);
          result.errors.push(`Failed to add record ${recordId} to list ${listId}: ${listDetail.LatestResult?.Message || 'Unknown error'}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ListManagementService] Exception adding record:`, error);
        result.errors.push(`Error adding record ${recordId} to list ${listId}: ${errorMessage}`);
      }
    }

    // Submit the transaction
    const success = await tg.Submit();

    if (success) {
      result.success = recordsToAdd.length - result.errors.length;
      result.failed = result.errors.length;
    } else {
      result.failed = recordsToAdd.length;
      result.success = 0;
      result.errors.push('Transaction failed to submit');
    }

    // Invalidate membership cache
    this.membershipCache.clear();

    return result;
  }

  /**
   * Remove records from one or more lists
   */
  async removeRecordsFromLists(
    listIds: string[],
    recordIds: string[]
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    const md = this.Provider;
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Find existing list details to delete
    const listIdFilter = listIds.map(id => `'${id}'`).join(',');
    const recordIdFilter = recordIds.map(id => `'${id}'`).join(',');

    const existingResult = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID IN (${listIdFilter}) AND RecordID IN (${recordIdFilter})`,
      ResultType: 'entity_object'
    });

    if (!existingResult.Success) {
      result.errors.push('Failed to query existing list details');
      return result;
    }

    const toDelete = existingResult.Results || [];
    if (toDelete.length === 0) {
      return result;
    }

    // Queue all deletes in one TransactionGroup — a single round trip
    // instead of one per removed membership row. Deliberately atomic (unlike
    // the server-side bulk paths, which trade atomicity for per-record error
    // isolation): if Submit() fails, the transaction rolled back and no rows
    // were removed.
    const tg = await md.CreateTransactionGroup();
    let queued = 0;
    for (const detail of toDelete) {
      try {
        detail.TransactionGroup = tg;
        // With a TransactionGroup set, Delete() returns true once enqueued;
        // false means a pre-enqueue failure (validation/permission) and the
        // row never joined the transaction.
        if (await detail.Delete()) {
          queued++;
        } else {
          result.failed++;
          result.errors.push(`Failed to queue removal of record ${detail.RecordID} from list ${detail.ListID}: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error removing record: ${errorMessage}`);
      }
    }

    const submitted = queued === 0 || await tg.Submit();
    if (submitted) {
      result.success = queued;
    } else {
      result.failed += queued;
      result.errors.push('Transaction failed to submit');
    }

    // Invalidate caches
    this.membershipCache.clear();

    return result;
  }

  /**
   * Create a new list
   */
  async createList(config: CreateListConfig): Promise<MJListEntity | null> {
    const md = this.Provider;

    try {
      const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', md.CurrentUser);
      list.NewRecord();
      list.Name = config.name;
      list.Description = config.description || '';
      list.EntityID = config.entityId;
      list.UserID = md.CurrentUser.ID;

      if (config.categoryId) {
        list.CategoryID = config.categoryId;
      }

      const saveResult = await list.Save();
      if (saveResult) {
        // Invalidate list cache
        this.invalidateListCache(config.entityId);
        return list;
      }

      return null;
    } catch (error) {
      console.error('Error creating list:', error);
      return null;
    }
  }

  /**
   * Check if a cache entry is still valid
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    const now = new Date().getTime();
    const entryTime = entry.timestamp.getTime();
    return (now - entryTime) < this.CACHE_TTL_MS;
  }

  /**
   * Invalidate cache for a specific entity or all caches
   */
  invalidateCache(entityId?: string): void {
    if (entityId) {
      this.invalidateListCache(entityId);
    } else {
      this.listCache.clear();
      this.categoryCache = null;
      this.membershipCache.clear();
    }
  }

  /**
   * Invalidate list cache for a specific entity
   */
  private invalidateListCache(entityId: string): void {
    // Remove all cache entries that start with this entityId
    for (const key of this.listCache.keys()) {
      if (key.startsWith(entityId)) {
        this.listCache.delete(key);
      }
    }
  }
}
