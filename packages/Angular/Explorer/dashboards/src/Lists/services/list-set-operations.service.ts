import { Injectable } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity } from '@memberjunction/core-entities';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Represents a set (list) in the Venn diagram
 */
export interface VennSet {
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

      const rv = new RunView();
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

      // Update cache
      for (const [listId, records] of setsMap) {
        this.listDetailsCache.set(listId, records);
      }

      // Build VennSet objects
      const sets: VennSet[] = lists.map((list, index) => ({
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

      const sets = listIds.map(id => this.listDetailsCache.get(id) || new Set<string>());
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
            const allSets = allListIds.map(id => this.listDetailsCache.get(id) || new Set<string>());
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
   * Ensure list details are loaded for the given list IDs
   */
  private async ensureListsLoaded(listIds: string[]): Promise<void> {
    const missingIds = listIds.filter(id => !this.listDetailsCache.has(id));

    if (missingIds.length === 0) return;

    const listIdFilter = missingIds.map(id => `'${id}'`).join(',');
    const rv = new RunView();

    const result = await rv.RunView<{ ListID: string; RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID IN (${listIdFilter})`,
      Fields: ['ListID', 'RecordID'],
      ResultType: 'simple'
    });

    // Initialize sets for missing lists
    for (const id of missingIds) {
      this.listDetailsCache.set(id, new Set());
    }

    if (result.Success && result.Results) {
      for (const detail of result.Results) {
        const set = this.listDetailsCache.get(detail.ListID);
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
