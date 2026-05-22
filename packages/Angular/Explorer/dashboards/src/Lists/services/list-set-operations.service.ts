import { Injectable } from '@angular/core';
import { RunView, Metadata, IMetadataProvider, CompositeKey, EntityInfo } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity, MJUserViewEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Normalize an `MJ: List Details.RecordID`-style string so set operations
 * compare correctly regardless of where the value originated.
 *
 * The wrinkle: SQL Server returns UUIDs uppercased, PostgreSQL returns
 * them lowercased — and the same DB can host List Details written by
 * different code paths with different casing. Composite-PK keys are
 * concatenated strings (`Field1|Value1||Field2|Value2`); normalizing
 * the whole string is safe — `NormalizeUUID` lowercases anything that
 * pattern-matches a UUID and is a no-op on other content. The pipe
 * separators in composite keys are unaffected.
 */
function normalizeRecordId(raw: string | null | undefined): string {
  if (raw == null) return '';
  return NormalizeUUID(String(raw));
}

/**
 * Describes one operand for the Venn / set-op pipeline. The component
 * passes these in instead of raw `MJListEntity`s now that views are
 * supported; the service handles cache-keying + record-ID resolution.
 */
export interface SetOperand {
  kind: OperandKind;
  /** ID of the underlying MJ List or MJ User View. */
  id: string;
  /** Display name shown in the Venn legend + selection chips. */
  name: string;
  /** Entity ID — used to enforce the same-entity invariant on operations. */
  entityID: string;
  /** Entity name — denormalized for display. */
  entityName: string;
  /** Hex color from the predefined palette; chosen by the component. */
  color: string;
}

/**
 * Discriminates a Venn set / set-op operand between a saved MJ List and a
 * User View. The Venn diagram uses this to render views with a dashed
 * stroke (per mockup 10) so users can tell at a glance which inputs are
 * static (lists) vs. dynamic-at-resolution (views).
 */
export type OperandKind = 'list' | 'view';

/**
 * Stable key for an operand across cache lookups + state persistence.
 * `list:<id>` and `view:<id>` deliberately namespace the ID so a view and
 * a list with the same UUID (extremely unlikely but possible) can't
 * collide in the cache.
 */
export function OperandCacheKey(kind: OperandKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Represents a set (list or view) in the Venn diagram
 */
export interface VennSet {
  /** Stable cache key. Use `OperandCacheKey()` to construct. */
  operandKey: string;
  /** Discriminator — drives the dashed-vs-solid stroke in the Venn diagram. */
  kind: OperandKind;
  /** Underlying list / view ID. Same UUID space as the entity it points at. */
  listId: string;
  listName: string;
  color: string;
  recordIds: Set<string>;
  size: number;
}

/**
 * Represents an intersection region in the Venn diagram
 */
export interface VennIntersection {
  /**
   * IDs of lists that participate in this intersection
   */
  setIds: string[];

  /**
   * Labels of lists that participate in this intersection
   */
  setLabels: string[];

  /**
   * Number of records in this intersection
   */
  size: number;

  /**
   * Actual record IDs in this intersection
   */
  recordIds: string[];

  /**
   * Display label for this region
   */
  label: string;

  /**
   * Whether this region is currently selected
   */
  isSelected: boolean;
}

/**
 * Complete Venn data for visualization
 */
export interface VennData {
  sets: VennSet[];
  intersections: VennIntersection[];
  entityId?: string;
  entityName?: string;
}

/**
 * Set operation types
 */
export type SetOperation = 'union' | 'intersection' | 'difference' | 'symmetric_difference' | 'complement';

/**
 * Result of a set operation
 */
export interface SetOperationResult {
  operation: SetOperation;
  inputSetIds: string[];
  resultRecordIds: string[];
  resultCount: number;
}

// Predefined color palette for Venn sets
const VENN_COLORS = [
  '#2196F3', // Blue
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#00BCD4', // Cyan
  '#F44336', // Red
  '#8BC34A'  // Light Green
];

/**
 * Service for performing set operations on lists and preparing data for Venn visualization.
 */
@Injectable({
  providedIn: 'root'
})
export class ListSetOperationsService {
  private _provider: IMetadataProvider | null = null;
  /** Set the metadata provider this service should use. Components should call this after injection. */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }
  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  // Cache for list details
  private listDetailsCache = new Map<string, Set<string>>();

  constructor() {}

  /**
   * Load list data and calculate all intersections for Venn visualization
   */
  async calculateVennData(lists: MJListEntity[]): Promise<VennData> {
    if (lists.length === 0) {
      return { sets: [], intersections: [] };
    }

    this.loadingSubject.next(true);

    try {
      // Load all list details in a single query
      const listIds = lists.map(l => l.ID);
      const listIdFilter = listIds.map(id => `'${id}'`).join(',');

      const rv = RunView.FromMetadataProvider(this.Provider);
      const result = await rv.RunView<{ ListID: string; RecordID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID IN (${listIdFilter})`,
        Fields: ['ListID', 'RecordID'],
        ResultType: 'simple'
      });

      // Build sets per list
      const setsMap = new Map<string, Set<string>>();
      for (const listId of listIds) {
        setsMap.set(listId, new Set());
      }

      if (result.Success && result.Results) {
        for (const detail of result.Results) {
          const set = setsMap.get(detail.ListID);
          if (set) {
            set.add(detail.RecordID);
          }
        }
      }

      // Update cache — namespaced under `list:` so view operands can share
      // the same cache map without collision.
      for (const [listId, records] of setsMap) {
        this.listDetailsCache.set(OperandCacheKey('list', listId), records);
      }

      // Build VennSet objects. We keep the legacy `MJListEntity` overload's
      // shape but populate the new discriminator fields so the diagram +
      // downstream operations stay consistent regardless of which entry
      // point was used.
      const sets: VennSet[] = lists.map((list, index) => ({
        operandKey: OperandCacheKey('list', list.ID),
        kind: 'list' as const,
        listId: list.ID,
        listName: list.Name,
        color: VENN_COLORS[index % VENN_COLORS.length],
        recordIds: setsMap.get(list.ID) || new Set(),
        size: setsMap.get(list.ID)?.size || 0
      }));

      // Calculate all possible intersections
      const intersections = this.calculateAllIntersections(sets);

      // Get entity info from the first list (assuming all lists are same entity)
      const entityId = lists[0]?.EntityID;
      const entityName = lists[0]?.Entity;

      return { sets, intersections, entityId, entityName };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Generalized Venn-data loader supporting both lists and views.
   *
   * - Lists resolve via the same `MJ: List Details` query as the legacy
   *   path (cached by `list:<id>`).
   * - Views resolve via `RunView({ViewID})` and primary-key serialization;
   *   cached by `view:<id>` so picking the same view twice doesn't
   *   re-query.
   *
   * The cache deliberately namespaces the kind — a list and a view that
   * shared the same UUID would still hit distinct entries.
   */
  async calculateVennDataForOperands(operands: SetOperand[]): Promise<VennData> {
    if (operands.length === 0) return { sets: [], intersections: [] };
    this.loadingSubject.next(true);
    try {
      await this.ensureOperandsLoaded(operands);

      const sets: VennSet[] = operands.map((op) => ({
        operandKey: OperandCacheKey(op.kind, op.id),
        kind: op.kind,
        listId: op.id,
        listName: op.name,
        color: op.color,
        recordIds: this.cacheGet(op) ?? new Set<string>(),
        size: this.cacheGet(op)?.size ?? 0,
      }));

      const intersections = this.calculateAllIntersections(sets);
      const entityId = operands[0]?.entityID;
      const entityName = operands[0]?.entityName;
      return { sets, intersections, entityId, entityName };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Operand-aware sibling of `performOperation`. `operandKeys` are the
   * `OperandCacheKey()` strings produced by `calculateVennDataForOperands`,
   * so callers can stay in operand-key space end-to-end.
   */
  async performOperationForOperands(
    operation: SetOperation,
    operands: SetOperand[],
    allOperands?: SetOperand[],
  ): Promise<SetOperationResult> {
    this.loadingSubject.next(true);
    try {
      await this.ensureOperandsLoaded([...operands, ...(allOperands ?? [])]);
      const sets = operands.map((op) => this.cacheGet(op) ?? new Set<string>());
      const resultSet = this.computeOperationResult(operation, sets, allOperands);
      return {
        operation,
        inputSetIds: operands.map((op) => OperandCacheKey(op.kind, op.id)),
        resultRecordIds: Array.from(resultSet),
        resultCount: resultSet.size,
      };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Calculate all possible intersections between the given sets
   */
  private calculateAllIntersections(sets: VennSet[]): VennIntersection[] {
    const intersections: VennIntersection[] = [];
    const n = sets.length;

    // Generate all non-empty subsets of sets
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset: VennSet[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(sets[i]);
        }
      }

      // Calculate exclusive intersection (records in exactly these sets)
      const recordIds = this.calculateExclusiveIntersection(subset, sets);

      if (recordIds.length > 0 || subset.length === 1) {
        const setIds = subset.map(s => s.listId);
        const setLabels = subset.map(s => s.listName);

        intersections.push({
          setIds,
          setLabels,
          size: recordIds.length,
          recordIds,
          label: this.buildIntersectionLabel(setLabels),
          isSelected: false
        });
      }
    }

    // Sort by number of sets (single sets first, then pairs, etc.)
    intersections.sort((a, b) => a.setIds.length - b.setIds.length);

    return intersections;
  }

  /**
   * Calculate records that are in ALL of the specified sets but NONE of the other sets
   */
  private calculateExclusiveIntersection(includedSets: VennSet[], allSets: VennSet[]): string[] {
    if (includedSets.length === 0) return [];

    // Start with records in the first included set
    let result = new Set(includedSets[0].recordIds);

    // Intersect with all other included sets
    for (let i = 1; i < includedSets.length; i++) {
      result = this.intersect(result, includedSets[i].recordIds);
    }

    // Remove records that are in excluded sets
    const excludedSets = allSets.filter(s => !includedSets.includes(s));
    for (const excluded of excludedSets) {
      result = this.difference(result, excluded.recordIds);
    }

    return Array.from(result);
  }

  /**
   * Build a display label for an intersection
   */
  private buildIntersectionLabel(setLabels: string[]): string {
    if (setLabels.length === 1) {
      return `Only in ${setLabels[0]}`;
    }
    return setLabels.join(' ∩ ');
  }

  /**
   * Perform a set operation on multiple lists
   */
  async performOperation(
    operation: SetOperation,
    listIds: string[],
    allListIds?: string[]
  ): Promise<SetOperationResult> {
    this.loadingSubject.next(true);

    try {
      // Ensure we have the list details loaded
      await this.ensureListsLoaded(listIds);

      const sets = listIds.map(id => this.listDetailsCache.get(OperandCacheKey('list', id)) || new Set<string>());
      let resultSet: Set<string>;

      switch (operation) {
        case 'union':
          resultSet = this.unionAll(sets);
          break;

        case 'intersection':
          resultSet = this.intersectAll(sets);
          break;

        case 'difference':
          // A - B - C - ... (first set minus all others)
          if (sets.length < 2) {
            resultSet = sets[0] || new Set();
          } else {
            resultSet = new Set(sets[0]);
            for (let i = 1; i < sets.length; i++) {
              resultSet = this.difference(resultSet, sets[i]);
            }
          }
          break;

        case 'symmetric_difference':
          // Records that are in exactly one of the sets
          resultSet = this.symmetricDifferenceAll(sets);
          break;

        case 'complement':
          // Records NOT in any of the selected sets (requires allListIds)
          if (allListIds) {
            await this.ensureListsLoaded(allListIds);
            const allSets = allListIds.map(id => this.listDetailsCache.get(OperandCacheKey('list', id)) || new Set<string>());
            const allRecords = this.unionAll(allSets);
            const selectedRecords = this.unionAll(sets);
            resultSet = this.difference(allRecords, selectedRecords);
          } else {
            resultSet = new Set();
          }
          break;

        default:
          resultSet = new Set();
      }

      return {
        operation,
        inputSetIds: listIds,
        resultRecordIds: Array.from(resultSet),
        resultCount: resultSet.size
      };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Cached lookup keyed by operand kind+id. Lists and views share the
   * cache map but their entries can't collide thanks to the key namespace.
   */
  private cacheGet(operand: SetOperand): Set<string> | undefined {
    return this.listDetailsCache.get(OperandCacheKey(operand.kind, operand.id));
  }

  /**
   * Bulk-load any operands not already cached. Lists batch through a
   * single `MJ: List Details` query (same shape as before); views resolve
   * one at a time because each is a separate parameterized RunView. Both
   * paths populate the same cache map.
   */
  private async ensureOperandsLoaded(operands: SetOperand[]): Promise<void> {
    const missingLists: string[] = [];
    const missingViews: SetOperand[] = [];
    for (const op of operands) {
      if (this.cacheGet(op)) continue;
      if (op.kind === 'list') missingLists.push(op.id);
      else missingViews.push(op);
    }
    await Promise.all([
      missingLists.length > 0 ? this.loadMissingLists(missingLists) : Promise.resolve(),
      missingViews.length > 0 ? this.loadMissingViews(missingViews) : Promise.resolve(),
    ]);
  }

  private async loadMissingLists(listIds: string[]): Promise<void> {
    const listIdFilter = listIds.map((id) => `'${id}'`).join(',');
    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<{ ListID: string; RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID IN (${listIdFilter})`,
      Fields: ['ListID', 'RecordID'],
      ResultType: 'simple',
    });

    for (const id of listIds) {
      this.listDetailsCache.set(OperandCacheKey('list', id), new Set<string>());
    }
    if (result.Success && result.Results) {
      for (const detail of result.Results) {
        // Normalize on the ListID we look up by AND on the RecordID we
        // store — mixed casing on either side would otherwise produce
        // empty intersections between lists that actually share records.
        const set = this.listDetailsCache.get(OperandCacheKey('list', NormalizeUUID(detail.ListID)))
          ?? this.listDetailsCache.get(OperandCacheKey('list', detail.ListID));
        if (set) set.add(normalizeRecordId(detail.RecordID));
      }
    }
  }

  private async loadMissingViews(operands: SetOperand[]): Promise<void> {
    // Fire view queries in parallel — each one is small and independent.
    const tasks = operands.map((op) => this.loadSingleView(op));
    await Promise.all(tasks);
  }

  /**
   * Resolve a view to a set of record IDs in the canonical `MJ: List
   * Details.RecordID` format (single-PK → raw value; composite-PK →
   * `Field1|Value1||Field2|Value2`, matching `CompositeKey.ToConcatenatedString`).
   * This keeps view operands cache-compatible with list operands without
   * any transformation in the set-op logic.
   */
  private async loadSingleView(operand: SetOperand): Promise<void> {
    const md = this.Provider;
    const entityInfo = md.EntityByName(operand.entityName);
    if (!entityInfo) {
      this.listDetailsCache.set(OperandCacheKey('view', operand.id), new Set<string>());
      return;
    }
    const pkFields = entityInfo.PrimaryKeys.map((pk) => pk.Name);

    const rv = RunView.FromMetadataProvider(md);
    const result = await rv.RunView({
      ViewID: operand.id,
      Fields: pkFields,
      ResultType: 'simple',
    });

    const set = new Set<string>();
    if (result.Success && result.Results) {
      for (const row of result.Results) {
        set.add(this.serializeRecordId(entityInfo, row as Record<string, unknown>));
      }
    }
    this.listDetailsCache.set(OperandCacheKey('view', operand.id), set);
  }

  /**
   * Mirror of `ListOperations.serializeRecordId` so view operands produce
   * IDs that round-trip cleanly against MJ List Details.
   */
  private serializeRecordId(entityInfo: EntityInfo, row: Record<string, unknown>): string {
    if (entityInfo.PrimaryKeys.length === 1) {
      return normalizeRecordId(String(row[entityInfo.PrimaryKeys[0].Name]));
    }
    const ck = new CompositeKey();
    ck.KeyValuePairs = entityInfo.PrimaryKeys.map((pk) => ({
      FieldName: pk.Name,
      Value: row[pk.Name] as string | number | Date | null | undefined,
    }));
    return normalizeRecordId(ck.ToConcatenatedString());
  }

  /**
   * Pure compute step shared by the legacy and operand-aware paths.
   * Operates on raw `Set<string>` inputs so it stays agnostic to where
   * those sets came from.
   */
  private computeOperationResult(
    operation: SetOperation,
    sets: Set<string>[],
    allOperandsForComplement?: SetOperand[],
  ): Set<string> {
    switch (operation) {
      case 'union':
        return this.unionAll(sets);
      case 'intersection':
        return this.intersectAll(sets);
      case 'difference': {
        if (sets.length < 2) return sets[0] ?? new Set<string>();
        let r = new Set(sets[0]);
        for (let i = 1; i < sets.length; i++) r = this.difference(r, sets[i]);
        return r;
      }
      case 'symmetric_difference':
        return this.symmetricDifferenceAll(sets);
      case 'complement': {
        if (!allOperandsForComplement) return new Set<string>();
        const allSets = allOperandsForComplement.map((op) => this.cacheGet(op) ?? new Set<string>());
        return this.difference(this.unionAll(allSets), this.unionAll(sets));
      }
      default:
        return new Set<string>();
    }
  }

  /**
   * Ensure list details are loaded for the given list IDs. Cache keys use
   * the `list:<id>` namespace introduced for operand support; the legacy
   * list-only callers go through here without needing to know the format.
   */
  private async ensureListsLoaded(listIds: string[]): Promise<void> {
    const missingIds = listIds.filter(id => !this.listDetailsCache.has(OperandCacheKey('list', id)));

    if (missingIds.length === 0) return;

    const listIdFilter = missingIds.map(id => `'${id}'`).join(',');
    const rv = RunView.FromMetadataProvider(this.Provider);

    const result = await rv.RunView<{ ListID: string; RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID IN (${listIdFilter})`,
      Fields: ['ListID', 'RecordID'],
      ResultType: 'simple'
    });

    // Initialize sets for missing lists
    for (const id of missingIds) {
      this.listDetailsCache.set(OperandCacheKey('list', id), new Set());
    }

    if (result.Success && result.Results) {
      for (const detail of result.Results) {
        const set = this.listDetailsCache.get(OperandCacheKey('list', detail.ListID));
        if (set) {
          set.add(detail.RecordID);
        }
      }
    }
  }

  /**
   * Set intersection of two sets
   */
  private intersect(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    for (const item of a) {
      if (b.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Set difference (a - b)
   */
  private difference(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    for (const item of a) {
      if (!b.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Union of multiple sets
   */
  private unionAll(sets: Set<string>[]): Set<string> {
    const result = new Set<string>();
    for (const set of sets) {
      for (const item of set) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Intersection of multiple sets
   */
  private intersectAll(sets: Set<string>[]): Set<string> {
    if (sets.length === 0) return new Set();
    if (sets.length === 1) return new Set(sets[0]);

    let result = new Set(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      result = this.intersect(result, sets[i]);
    }
    return result;
  }

  /**
   * Symmetric difference of multiple sets (items in exactly one set)
   */
  private symmetricDifferenceAll(sets: Set<string>[]): Set<string> {
    if (sets.length === 0) return new Set();

    // Count occurrences of each item
    const counts = new Map<string, number>();
    for (const set of sets) {
      for (const item of set) {
        counts.set(item, (counts.get(item) || 0) + 1);
      }
    }

    // Keep only items that appear exactly once
    const result = new Set<string>();
    for (const [item, count] of counts) {
      if (count === 1) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Get the color for a list by its index
   */
  getColorForIndex(index: number): string {
    return VENN_COLORS[index % VENN_COLORS.length];
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.listDetailsCache.clear();
  }
}
