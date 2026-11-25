import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJListEntity, MJListCategoryEntity } from '@memberjunction/core-entities';
import type { ApplyResult } from '@memberjunction/lists-base';
import { MJLruCache } from '@memberjunction/global';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  ListItemViewModel,
  BatchOperationResult,
  RecordMembershipInfo,
  CreateListConfig
} from '../models/list-management.models';
import { CreateListsClient } from '../utils/list-member-changes';

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
  /** Bounded: keyed by entity + record-ID set, so unbounded browsing would otherwise grow it all session. */
  private membershipCache = new MJLruCache<string, CacheEntry<Map<string, string[]>>>({ maxSize: 50, ttlMs: this.CACHE_TTL_MS });

  // Loading state subjects
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
  async GetListsForEntity(
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

  /** @deprecated Use {@link GetListsForEntity}. */
  async getListsForEntity(
    entityId: string,
    userId?: string,
    forceRefresh: boolean = false
  ): Promise<MJListEntity[]> {
    return this.GetListsForEntity(entityId, userId, forceRefresh);
  }

  /**
   * Get all list categories
   */
  async GetListCategories(forceRefresh: boolean = false): Promise<MJListCategoryEntity[]> {
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

  /** @deprecated Use {@link GetListCategories}. */
  async getListCategories(forceRefresh: boolean = false): Promise<MJListCategoryEntity[]> {
    return this.GetListCategories(forceRefresh);
  }

  /**
   * Get membership information for a set of records
   * Returns a Map where key is listId and value is array of recordIds that are members
   */
  async GetRecordMembership(
    entityId: string,
    recordIds: string[]
  ): Promise<Map<string, string[]>> {
    if (recordIds.length === 0) {
      return new Map();
    }

    const cacheKey = `${entityId}_${recordIds.sort().join(',')}`;

    // Check cache
    const cached = this.membershipCache.Get(cacheKey);
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

      this.membershipCache.Set(cacheKey, {
        data: membership,
        timestamp: new Date()
      });

      return membership;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /** @deprecated Use {@link GetRecordMembership}. */
  async getRecordMembership(
    entityId: string,
    recordIds: string[]
  ): Promise<Map<string, string[]>> {
    return this.GetRecordMembership(entityId, recordIds);
  }

  /**
   * Get lists that contain a specific record
   */
  async GetListsForRecord(
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

  /** @deprecated Use {@link GetListsForRecord}. */
  async getListsForRecord(
    entityId: string,
    recordId: string
  ): Promise<MJListEntity[]> {
    return this.GetListsForRecord(entityId, recordId);
  }

  /**
   * Get item count for a list
   */
  async GetListItemCount(listId: string): Promise<number> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID = '${listId}'`,
      ResultType: 'count_only'
    });

    return result.Success ? result.TotalRowCount ?? 0 : 0;
  }

  /** @deprecated Use {@link GetListItemCount}. */
  async getListItemCount(listId: string): Promise<number> {
    return this.GetListItemCount(listId);
  }

  /**
   * Build view models for lists with membership information
   */
  async BuildListViewModels(
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
        countMap.set(lists[idx].ID, res.Success ? res.TotalRowCount ?? 0 : 0);
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

  /** @deprecated Use {@link BuildListViewModels}. */
  async buildListViewModels(
    lists: MJListEntity[],
    recordIds: string[],
    membership: Map<string, string[]>
  ): Promise<ListItemViewModel[]> {
    return this.BuildListViewModels(lists, recordIds, membership);
  }

  /**
   * Adds records to one or more lists with one server call per list. Records a list already
   * holds are skipped by the server and counted in `skipped`. `skipDuplicates` is kept for
   * callers; the server never adds a record twice.
   */
  async AddRecordsToLists(
    listIds: string[],
    recordIds: string[],
    skipDuplicates: boolean = true
  ): Promise<BatchOperationResult> {
    const result = this.emptyBatchResult();
    if (recordIds.length === 0) return result;
    const client = CreateListsClient(this.Provider);
    for (const listId of listIds) {
      const applied = await this.callListsClient(() => client.AddRecordsToList(listId, recordIds));
      const added = applied.Counts?.Added ?? 0;
      this.mergeApplyResult(result, applied, added, recordIds.length);
      result.skipped += Math.max(0, recordIds.length - added - this.failedCount(applied, recordIds.length));
    }
    this.membershipCache.Clear();
    return result;
  }

  /** @deprecated Use {@link AddRecordsToLists}. */
  async addRecordsToLists(
    listIds: string[],
    recordIds: string[],
    skipDuplicates: boolean = true
  ): Promise<BatchOperationResult> {
    return this.AddRecordsToLists(listIds, recordIds, skipDuplicates);
  }

  /**
   * Removes records from one or more lists with one server call per list. `recordIds` are the
   * members' `RecordID` values; records a list does not hold are ignored.
   */
  async RemoveRecordsFromLists(
    listIds: string[],
    recordIds: string[]
  ): Promise<BatchOperationResult> {
    const result = this.emptyBatchResult();
    if (recordIds.length === 0) return result;
    const client = CreateListsClient(this.Provider);
    for (const listId of listIds) {
      const applied = await this.callListsClient(() => client.RemoveRecordsFromList(listId, recordIds));
      this.mergeApplyResult(result, applied, applied.Counts?.Removed ?? 0, recordIds.length);
    }
    this.membershipCache.Clear();
    return result;
  }

  /** @deprecated Use {@link RemoveRecordsFromLists}. */
  async removeRecordsFromLists(
    listIds: string[],
    recordIds: string[]
  ): Promise<BatchOperationResult> {
    return this.RemoveRecordsFromLists(listIds, recordIds);
  }

  /**
   * Create a new list
   */
  async CreateList(config: CreateListConfig): Promise<MJListEntity | null> {
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

  /** @deprecated Use {@link CreateList}. */
  async createList(config: CreateListConfig): Promise<MJListEntity | null> {
    return this.CreateList(config);
  }

  private emptyBatchResult(): BatchOperationResult {
    return { success: 0, failed: 0, skipped: 0, errors: [] };
  }

  /** Runs a client call and turns a thrown error into a failed result. */
  private async callListsClient(call: () => Promise<ApplyResult>): Promise<ApplyResult> {
    try {
      return await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
    }
  }

  /** Records that failed; all of them when the server gave no counts. */
  private failedCount(applied: ApplyResult, requested: number): number {
    if (applied.Counts) return applied.Counts.Failed;
    return applied.Success ? 0 : requested;
  }

  private mergeApplyResult(result: BatchOperationResult, applied: ApplyResult, succeeded: number, requested: number): void {
    result.success += succeeded;
    result.failed += this.failedCount(applied, requested);
    if (applied.Errors?.length) {
      result.errors.push(...applied.Errors);
    } else if (!applied.Success) {
      result.errors.push(applied.Message || 'The server could not change the list');
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
  InvalidateCache(entityId?: string): void {
    if (entityId) {
      this.invalidateListCache(entityId);
    } else {
      this.listCache.clear();
      this.categoryCache = null;
      this.membershipCache.Clear();
    }
  }

  /** @deprecated Use {@link InvalidateCache}. */
  invalidateCache(entityId?: string): void {
    return this.InvalidateCache(entityId);
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
