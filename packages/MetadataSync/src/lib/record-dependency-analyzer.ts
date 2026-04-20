import { Metadata, EntityInfo } from '@memberjunction/core';
import { RecordData } from './sync-engine';
import { METADATA_KEYWORDS, isNonKeywordAtSymbol } from '../constants/metadata-keywords';

/**
 * Represents a flattened record with its context and dependencies
 */
export interface FlattenedRecord {
  record: RecordData;
  entityName: string;
  parentContext?: {
    entityName: string;
    record: RecordData;
    recordIndex: number;
  };
  depth: number;
  path: string; // Path to this record for debugging
  dependencies: Set<string>; // Set of record IDs this record depends on
  id: string; // Unique identifier for this record in the flattened list
  originalIndex: number; // Original index in the source array
}

/**
 * Represents a reverse dependency relationship
 * (which records depend on a given record)
 */
export interface ReverseDependency {
  recordId: string;           // The record being referenced
  dependentId: string;        // The record that depends on it
  entityName: string;         // Entity of the dependent
  fieldName: string | null;   // Foreign key field name (if known)
  filePath: string;           // Location of dependent record
}

/**
 * Result of dependency analysis
 */
export interface DependencyAnalysisResult {
  sortedRecords: FlattenedRecord[];
  circularDependencies: string[][];
  dependencyGraph: Map<string, Set<string>>;
  dependencyLevels?: FlattenedRecord[][]; // Records grouped by dependency level for parallel processing
}

/**
 * Analyzes and sorts records based on their dependencies
 */
export class RecordDependencyAnalyzer {
  private metadata: Metadata;
  private flattenedRecords: FlattenedRecord[] = [];
  private recordIdMap: Map<string, FlattenedRecord> = new Map();
  private entityInfoCache: Map<string, EntityInfo> = new Map();
  private recordCounter: number = 0;

  constructor() {
    this.metadata = new Metadata();
  }

  /**
   * Phase 1: Flatten records from a single file without analyzing dependencies.
   *
   * This method flattens records including nested relatedEntities and assigns unique IDs,
   * but does NOT analyze dependencies. Use this when collecting records from multiple files
   * before running global dependency analysis.
   *
   * After collecting records from all files, call `analyzeAllDependencies()` to resolve
   * cross-file dependencies.
   *
   * @param records The records from a metadata file
   * @param entityName The root entity name for these records
   * @returns Flattened records (dependencies not yet resolved)
   */
  public flattenFileRecords(
    records: RecordData[],
    entityName: string
  ): FlattenedRecord[] {
    // Store the starting index to return only the newly added records
    const startIndex = this.flattenedRecords.length;

    // Flatten records (this adds to this.flattenedRecords and this.recordIdMap)
    this.flattenRecords(records, entityName);

    // Return only the records added from this file
    return this.flattenedRecords.slice(startIndex);
  }

  /**
   * Phase 2: Analyze dependencies across all collected records globally.
   *
   * This method should be called AFTER all files have been processed with `flattenFileRecords()`.
   * It resolves @lookup, @parent, @root references and foreign key dependencies across
   * ALL records, enabling correct cross-file dependency detection.
   *
   * @param allRecords All flattened records from all metadata files
   * @returns Analysis result with sorted records, circular dependencies, etc.
   */
  public analyzeAllDependencies(
    allRecords: FlattenedRecord[]
  ): DependencyAnalysisResult {
    // Set up state from the provided records
    this.flattenedRecords = allRecords;
    this.recordIdMap.clear();
    for (const record of allRecords) {
      this.recordIdMap.set(record.id, record);
    }

    // Analyze dependencies between ALL records (enables cross-file dependency detection)
    this.analyzeDependencies();

    // Detect circular dependencies
    const circularDeps = this.detectCircularDependencies();

    // Perform topological sort
    const sortedRecords = this.topologicalSort();

    // Build dependency graph for debugging
    const dependencyGraph = new Map<string, Set<string>>();
    for (const record of this.flattenedRecords) {
      dependencyGraph.set(record.id, record.dependencies);
    }

    // Group records into dependency levels for parallel processing
    const dependencyLevels = this.groupByDependencyLevels(sortedRecords, dependencyGraph);

    return {
      sortedRecords,
      circularDependencies: circularDeps,
      dependencyGraph,
      dependencyLevels
    };
  }

  /**
   * Resets the analyzer state. Call this before starting a new batch of files.
   */
  public reset(): void {
    this.flattenedRecords = [];
    this.recordIdMap.clear();
    this.recordCounter = 0;
  }

  /**
   * Main entry point: analyzes all records in a file and returns them in dependency order.
   *
   * @deprecated Use `flattenFileRecords()` + `analyzeAllDependencies()` for multi-file scenarios
   * to enable cross-file dependency detection. This method only detects dependencies within
   * a single file.
   *
   * @param records The records from a metadata file
   * @param entityName The root entity name for these records
   * @returns Analysis result with sorted records
   */
  public async analyzeFileRecords(
    records: RecordData[],
    entityName: string
  ): Promise<DependencyAnalysisResult> {
    // Reset state for single-file analysis (backward compatible behavior)
    this.reset();

    // Flatten records
    this.flattenRecords(records, entityName);

    // Analyze dependencies (only within this file's records)
    this.analyzeDependencies();

    // Detect circular dependencies
    const circularDeps = this.detectCircularDependencies();

    // Perform topological sort
    const sortedRecords = this.topologicalSort();

    // Build dependency graph for debugging
    const dependencyGraph = new Map<string, Set<string>>();
    for (const record of this.flattenedRecords) {
      dependencyGraph.set(record.id, record.dependencies);
    }

    // Group records into dependency levels for parallel processing
    const dependencyLevels = this.groupByDependencyLevels(sortedRecords, dependencyGraph);

    return {
      sortedRecords,
      circularDependencies: circularDeps,
      dependencyGraph,
      dependencyLevels
    };
  }

  /**
   * Flattens all records including nested relatedEntities
   */
  private flattenRecords(
    records: RecordData[],
    entityName: string,
    parentContext?: FlattenedRecord['parentContext'],
    depth: number = 0,
    pathPrefix: string = '',
    parentRecordId?: string
  ): void {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const recordId = `${entityName}_${this.recordCounter++}`;
      const path = pathPrefix ? `${pathPrefix}/${entityName}[${i}]` : `${entityName}[${i}]`;

      // Validate that the record has a 'fields' property (required)
      if (!record.fields) {
        const hint = 'field' in record ? ' Did you mean "fields" instead of "field"?' : '';
        throw new Error(
          `Record at ${path} is missing required "fields" property.${hint} ` +
          `Each record must have a "fields" object containing the entity field values.`
        );
      }

      const flattenedRecord: FlattenedRecord = {
        record,
        entityName,
        parentContext,
        depth,
        path,
        dependencies: new Set(),
        id: recordId,
        originalIndex: i
      };

      // If this has a parent, add dependency on the parent
      if (parentRecordId) {
        flattenedRecord.dependencies.add(parentRecordId);
      }

      this.flattenedRecords.push(flattenedRecord);
      this.recordIdMap.set(recordId, flattenedRecord);

      // Recursively flatten related entities
      if (record.relatedEntities) {
        for (const [relatedEntityName, relatedRecords] of Object.entries(record.relatedEntities)) {
          this.flattenRecords(
            relatedRecords,
            relatedEntityName,
            {
              entityName,
              record,
              recordIndex: i
            },
            depth + 1,
            path,
            recordId  // Pass current record ID as parent for children
          );
        }
      }
    }
  }

  /**
   * Analyzes dependencies between all flattened records
   */
  private analyzeDependencies(): void {
    for (const record of this.flattenedRecords) {
      // Get entity info for foreign key relationships
      const entityInfo = this.getEntityInfo(record.entityName);
      if (!entityInfo) continue;

      // Analyze field dependencies
      if (record.record.fields) {
        for (const [fieldName, fieldValue] of Object.entries(record.record.fields)) {
          if (typeof fieldValue === 'string') {
            // Handle @lookup references
            if (fieldValue.startsWith(METADATA_KEYWORDS.LOOKUP)) {
              const dependency = this.findLookupDependency(fieldValue, record);
              if (dependency) {
                record.dependencies.add(dependency);
              }
            }
            // Handle @root references - these create dependencies on the root record
            else if (fieldValue.startsWith(METADATA_KEYWORDS.ROOT)) {
              const rootDependency = this.findRootDependency(record);
              if (rootDependency) {
                record.dependencies.add(rootDependency);
              }
            }
            // @parent references don't create explicit dependencies in our flattened structure
            // because parent is guaranteed to be processed before children due to the way
            // we flatten records (parent always comes before its children)
          }
        }
      }

      // Check foreign key dependencies
      this.analyzeForeignKeyDependencies(record, entityInfo);
    }
  }

  /**
   * Analyzes foreign key dependencies based on EntityInfo
   */
  private analyzeForeignKeyDependencies(record: FlattenedRecord, entityInfo: EntityInfo): void {
    // Check all foreign key fields
    for (const field of entityInfo.ForeignKeys) {
      const fieldValue = record.record.fields?.[field.Name];
      if (fieldValue && typeof fieldValue === 'string' && !fieldValue.startsWith('@')) {
        // This is a direct foreign key value, find the referenced record
        const relatedEntityInfo = this.getEntityInfo(field.RelatedEntity);
        if (relatedEntityInfo) {
          const dependency = this.findRecordByPrimaryKey(
            field.RelatedEntity,
            fieldValue,
            relatedEntityInfo
          );
          if (dependency) {
            record.dependencies.add(dependency);
          }
        }
      }
    }
  }

  /**
   * Finds a record that matches a @lookup reference
   */
  private findLookupDependency(lookupValue: string, currentRecord: FlattenedRecord): string | null {
    // Parse lookup format: @lookup:EntityName.Field=Value or @lookup:Field=Value
    const lookupStr = lookupValue.substring(8); // Remove '@lookup:'
    
    // Handle the ?create syntax by removing it
    const cleanLookup = lookupStr.split('?')[0];
    
    // Parse entity name if present
    let targetEntity: string;
    let criteria: string;
    
    if (cleanLookup.includes('.')) {
      const parts = cleanLookup.split('.');
      targetEntity = parts[0];
      criteria = parts.slice(1).join('.');
    } else {
      // Same entity if not specified
      targetEntity = currentRecord.entityName;
      criteria = cleanLookup;
    }

    // Parse criteria (can be multiple with &)
    const criteriaMap = new Map<string, string>();
    for (const pair of criteria.split('&')) {
      const [field, value] = pair.split('=');
      if (field && value) {
        let resolvedValue = value.trim();
        
        // Special handling for nested @lookup references in lookup criteria
        // This creates a dependency on the looked-up record
        if (resolvedValue.startsWith(METADATA_KEYWORDS.LOOKUP)) {
          const nestedDependency = this.findLookupDependency(resolvedValue, currentRecord);
          if (nestedDependency) {
            // Add this as a dependency of the current record
            currentRecord.dependencies.add(nestedDependency);
            // Continue processing - we can't resolve the actual value here
            // but we've recorded the dependency
          }
        }
        // Special handling for @root references in lookup criteria
        else if (resolvedValue.startsWith(METADATA_KEYWORDS.ROOT)) {
          // Add dependency on root record
          const rootDep = this.findRootDependency(currentRecord);
          if (rootDep) {
            currentRecord.dependencies.add(rootDep);
          }
          // Note: We can't resolve the actual value here, but we've recorded the dependency
        }
        // Special handling for @parent references in lookup criteria
        // If the value is @parent:field, we need to resolve it from the parent context
        else if (resolvedValue.startsWith(METADATA_KEYWORDS.PARENT) && currentRecord.parentContext) {
          const parentField = resolvedValue.substring(METADATA_KEYWORDS.PARENT.length);
          
          // Try to resolve from parent context
          const parentValue = currentRecord.parentContext.record.fields?.[parentField] ||
                             currentRecord.parentContext.record.primaryKey?.[parentField];
          
          if (parentValue && typeof parentValue === 'string') {
            // Check if parent value is also a @parent reference (nested parent refs)
            if (parentValue.startsWith(METADATA_KEYWORDS.PARENT)) {
              // Find the parent record to get its parent context
              const parentRecord = this.flattenedRecords.find(r =>
                r.record === currentRecord.parentContext!.record &&
                r.entityName === currentRecord.parentContext!.entityName
              );

              if (parentRecord && parentRecord.parentContext) {
                const grandParentField = parentValue.substring(METADATA_KEYWORDS.PARENT.length);
                const grandParentValue = parentRecord.parentContext.record.fields?.[grandParentField] ||
                                        parentRecord.parentContext.record.primaryKey?.[grandParentField];
                if (grandParentValue && typeof grandParentValue === 'string' && !grandParentValue.startsWith('@')) {
                  resolvedValue = grandParentValue;
                }
              }
            } else if (!parentValue.startsWith('@')) {
              resolvedValue = parentValue;
            }
          }
        }
        
        criteriaMap.set(field.trim(), resolvedValue);
      }
    }

    // Find matching record in our flattened list
    for (const candidate of this.flattenedRecords) {
      if (candidate.entityName !== targetEntity) continue;
      if (candidate.id === currentRecord.id) continue; // Skip self

      // Check if all criteria match
      let allMatch = true;
      for (const [field, value] of criteriaMap) {
        let candidateValue = candidate.record.fields?.[field] || 
                             candidate.record.primaryKey?.[field];
        let lookupValue = value;
        
        // Resolve candidate value if it's a @parent reference
        if (typeof candidateValue === 'string' && candidateValue.startsWith(METADATA_KEYWORDS.PARENT) && candidate.parentContext) {
          const parentField = candidateValue.substring(METADATA_KEYWORDS.PARENT.length);
          const parentRecord = candidate.parentContext.record;
          candidateValue = parentRecord.fields?.[parentField] || parentRecord.primaryKey?.[parentField];

          // If the parent field is also a @parent reference, resolve it recursively
          if (typeof candidateValue === 'string' && candidateValue.startsWith(METADATA_KEYWORDS.PARENT)) {
            // Find the candidate's parent in our flattened list
            const candidateParent = this.flattenedRecords.find(r => 
              r.record === candidate.parentContext!.record && 
              r.entityName === candidate.parentContext!.entityName
            );
            if (candidateParent?.parentContext) {
              const grandParentField = candidateValue.substring(8);
              candidateValue = candidateParent.parentContext.record.fields?.[grandParentField] || 
                              candidateParent.parentContext.record.primaryKey?.[grandParentField];
            }
          }
        }
        
        // Resolve lookup value if it contains @parent reference
        if (typeof lookupValue === 'string' && lookupValue.includes(METADATA_KEYWORDS.PARENT)) {
          // Handle cases like "@parent:AgentID" or embedded references
          if (lookupValue.startsWith(METADATA_KEYWORDS.PARENT) && currentRecord.parentContext) {
            const parentField = lookupValue.substring(METADATA_KEYWORDS.PARENT.length);
            lookupValue = currentRecord.parentContext.record.fields?.[parentField] ||
                         currentRecord.parentContext.record.primaryKey?.[parentField];

            // If still a reference, try to resolve from the parent's parent
            if (typeof lookupValue === 'string' && lookupValue.startsWith(METADATA_KEYWORDS.PARENT)) {
              const currentParent = this.flattenedRecords.find(r =>
                r.record === currentRecord.parentContext!.record &&
                r.entityName === currentRecord.parentContext!.entityName
              );
              if (currentParent?.parentContext) {
                const grandParentField = lookupValue.substring(METADATA_KEYWORDS.PARENT.length);
                lookupValue = currentParent.parentContext.record.fields?.[grandParentField] ||
                             currentParent.parentContext.record.primaryKey?.[grandParentField];
              }
            }
          }
        }

        // Special case: if both values are @parent references pointing to the same parent field,
        // and they have the same parent context, they match
        if (value.startsWith(METADATA_KEYWORDS.PARENT) && candidateValue === value && 
            currentRecord.parentContext && candidate.parentContext) {
          // Check if they share the same parent
          if (currentRecord.parentContext.record === candidate.parentContext.record) {
            // Same parent, same reference - they will resolve to the same value
            continue; // This criterion matches
          }
        }
        
        if (candidateValue !== lookupValue) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return candidate.id;
      }
    }

    return null;
  }

  /**
   * Finds the root record for a given record
   */
  private findRootDependency(record: FlattenedRecord): string | null {
    // If this record has no parent, it IS the root, no dependency
    if (!record.parentContext) {
      return null;
    }
    
    // Walk up the parent chain to find the root
    let current = record;
    while (current.parentContext) {
      // Try to find the parent record in our flattened list
      const parentRecord = this.flattenedRecords.find(r => 
        r.record === current.parentContext!.record && 
        r.entityName === current.parentContext!.entityName
      );
      
      if (!parentRecord) {
        // Parent not found, something is wrong
        return null;
      }
      
      // If this parent has no parent, it's the root
      if (!parentRecord.parentContext) {
        return parentRecord.id;
      }
      
      current = parentRecord;
    }
    
    return null;
  }

  /**
   * Finds a record by its primary key value
   */
  private findRecordByPrimaryKey(
    entityName: string,
    primaryKeyValue: string,
    entityInfo: EntityInfo
  ): string | null {
    // Get primary key field name
    const primaryKeyField = entityInfo.PrimaryKeys[0]?.Name;
    if (!primaryKeyField) return null;

    for (const candidate of this.flattenedRecords) {
      if (candidate.entityName !== entityName) continue;

      const candidateValue = candidate.record.primaryKey?.[primaryKeyField] ||
                            candidate.record.fields?.[primaryKeyField];
      if (candidateValue === primaryKeyValue) {
        return candidate.id;
      }
    }

    return null;
  }

  /**
   * Gets EntityInfo from cache or metadata
   */
  private getEntityInfo(entityName: string): EntityInfo | null {
    if (!this.entityInfoCache.has(entityName)) {
      const info = this.metadata.EntityByName(entityName);
      if (info) {
        this.entityInfoCache.set(entityName, info);
      }
    }
    return this.entityInfoCache.get(entityName) || null;
  }

  /**
   * Detects circular dependencies in the dependency graph
   */
  private detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (recordId: string, path: string[]): boolean => {
      visited.add(recordId);
      recursionStack.add(recordId);
      path.push(recordId);

      const record = this.recordIdMap.get(recordId);
      if (record) {
        for (const depId of record.dependencies) {
          if (!visited.has(depId)) {
            if (detectCycle(depId, [...path])) {
              return true;
            }
          } else if (recursionStack.has(depId)) {
            // Found a cycle
            const cycleStart = path.indexOf(depId);
            const cycle = path.slice(cycleStart);
            cycle.push(depId); // Complete the cycle
            cycles.push(cycle);
            return true;
          }
        }
      }

      recursionStack.delete(recordId);
      return false;
    };

    // Check all records for cycles
    for (const record of this.flattenedRecords) {
      if (!visited.has(record.id)) {
        detectCycle(record.id, []);
      }
    }

    return cycles;
  }

  /**
   * Performs topological sort on the dependency graph
   */
  private topologicalSort(): FlattenedRecord[] {
    const result: FlattenedRecord[] = [];
    const visited = new Set<string>();
    const tempStack = new Set<string>();

    const visit = (recordId: string): boolean => {
      if (tempStack.has(recordId)) {
        // Circular dependency - we've already detected these
        return false;
      }

      if (visited.has(recordId)) {
        return true;
      }

      tempStack.add(recordId);

      const record = this.recordIdMap.get(recordId);
      if (record) {
        // Visit dependencies first
        for (const depId of record.dependencies) {
          visit(depId);
        }
      }

      tempStack.delete(recordId);
      visited.add(recordId);
      
      if (record) {
        result.push(record);
      }

      return true;
    };

    // Process all records, starting with those that have no dependencies
    // First, process records with no dependencies
    for (const record of this.flattenedRecords) {
      if (record.dependencies.size === 0 && !visited.has(record.id)) {
        visit(record.id);
      }
    }

    // Then process any remaining records (handles disconnected components)
    for (const record of this.flattenedRecords) {
      if (!visited.has(record.id)) {
        visit(record.id);
      }
    }

    return result;
  }

  /**
   * Groups sorted records into dependency levels for parallel processing
   * Records in the same level have no dependencies on each other and can be processed in parallel
   */
  private groupByDependencyLevels(
    sortedRecords: FlattenedRecord[],
    dependencyGraph: Map<string, Set<string>>
  ): FlattenedRecord[][] {
    const levels: FlattenedRecord[][] = [];
    const recordLevels = new Map<string, number>();
    
    // Calculate the level for each record
    for (const record of sortedRecords) {
      let maxDependencyLevel = -1;
      
      // Find the maximum level of all dependencies
      for (const depId of record.dependencies) {
        const depLevel = recordLevels.get(depId);
        if (depLevel !== undefined && depLevel > maxDependencyLevel) {
          maxDependencyLevel = depLevel;
        }
      }
      
      // This record's level is one more than its highest dependency
      const recordLevel = maxDependencyLevel + 1;
      recordLevels.set(record.id, recordLevel);
      
      // Add to the appropriate level array
      if (!levels[recordLevel]) {
        levels[recordLevel] = [];
      }
      levels[recordLevel].push(record);
    }
    
    return levels;
  }

  /**
   * Build reverse dependency map from forward dependencies
   * Maps: record ID -> list of records that depend on it
   *
   * This is essential for deletion ordering - we need to know what depends on a record
   * before we can safely delete it.
   */
  public buildReverseDependencyMap(
    records: FlattenedRecord[]
  ): Map<string, ReverseDependency[]> {
    const reverseMap = new Map<string, ReverseDependency[]>();

    for (const record of records) {
      // For each dependency this record has...
      for (const depId of record.dependencies) {
        // Skip undefined or null dependency IDs (defensive check)
        if (!depId) {
          console.warn(`Warning: Record ${record.id} has undefined/null dependency, skipping`);
          continue;
        }

        // Add this record as a dependent of that dependency
        if (!reverseMap.has(depId)) {
          reverseMap.set(depId, []);
        }

        reverseMap.get(depId)!.push({
          recordId: depId,
          dependentId: record.id,
          entityName: record.entityName,
          fieldName: this.findForeignKeyFieldForDependency(record, depId),
          filePath: record.path
        });
      }
    }

    return reverseMap;
  }

  /**
   * Find the foreign key field that creates a dependency
   * Used for better error reporting
   */
  private findForeignKeyFieldForDependency(
    record: FlattenedRecord,
    dependencyId: string
  ): string | null {
    const entityInfo = this.getEntityInfo(record.entityName);
    if (!entityInfo) return null;

    const dependentRecord = this.recordIdMap.get(dependencyId);
    if (!dependentRecord) return null;

    // Check all foreign key fields
    for (const field of entityInfo.ForeignKeys) {
      const fieldValue = record.record.fields?.[field.Name];

      // Check if this field references the dependent record
      if (fieldValue && typeof fieldValue === 'string') {
        // Handle @lookup references
        if (fieldValue.startsWith(METADATA_KEYWORDS.LOOKUP)) {
          const resolvedDep = this.findLookupDependency(fieldValue, record);
          if (resolvedDep === dependencyId) {
            return field.Name;
          }
        }
        // Handle direct foreign key values
        else if (!fieldValue.startsWith('@')) {
          const relatedEntityInfo = this.getEntityInfo(field.RelatedEntity);
          if (relatedEntityInfo) {
            const dep = this.findRecordByPrimaryKey(
              field.RelatedEntity,
              fieldValue,
              relatedEntityInfo
            );
            if (dep === dependencyId) {
              return field.Name;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Perform reverse topological sort for deletion order
   * Returns records grouped by dependency level, with leaf nodes (highest dependency level) first
   *
   * For deletions, we want to delete in reverse order of creation:
   * - Records at highest forward dependency levels (leaf nodes) delete FIRST
   * - Records at level 0 (root nodes with no dependencies) delete LAST
   *
   * This is simply the reverse of the forward topological sort used for creates.
   */
  public reverseTopologicalSort(
    records: FlattenedRecord[],
    reverseDependencies: Map<string, ReverseDependency[]>
  ): FlattenedRecord[][] {
    // Calculate forward dependency levels (same as creation order)
    const recordLevels = new Map<string, number>();

    // Calculate the level for each record based on its FORWARD dependencies
    for (const record of records) {
      let maxDependencyLevel = -1;

      // Find the maximum level of all dependencies (things this record depends ON)
      for (const depId of record.dependencies) {
        const depLevel = recordLevels.get(depId);
        if (depLevel !== undefined && depLevel > maxDependencyLevel) {
          maxDependencyLevel = depLevel;
        }
      }

      // This record's level is one more than its highest dependency
      const recordLevel = maxDependencyLevel + 1;
      recordLevels.set(record.id, recordLevel);
    }

    // Group records by level
    const forwardLevels: FlattenedRecord[][] = [];
    for (const record of records) {
      const level = recordLevels.get(record.id) || 0;

      if (!forwardLevels[level]) {
        forwardLevels[level] = [];
      }
      forwardLevels[level].push(record);
    }

    // Reverse the array for deletion order
    // Forward level 0 (roots) becomes last to delete
    // Forward level N (leaves) becomes first to delete
    return forwardLevels.reverse();
  }

  /**
   * Find all transitive dependents of a set of records
   * This is useful for finding all records that must be deleted when deleting a parent
   *
   * @param recordIds Set of record IDs to find dependents for
   * @param reverseDependencies Reverse dependency map
   * @returns Set of all record IDs that depend on the input records (transitively)
   */
  public findTransitiveDependents(
    recordIds: Set<string>,
    reverseDependencies: Map<string, ReverseDependency[]>
  ): Set<string> {
    const dependents = new Set<string>();
    const visited = new Set<string>();

    // BFS to find all transitive dependents
    const queue = Array.from(recordIds);

    while (queue.length > 0) {
      const recordId = queue.shift()!;
      if (visited.has(recordId)) continue;
      visited.add(recordId);

      const deps = reverseDependencies.get(recordId) || [];

      for (const dep of deps) {
        // Add dependent to result set
        dependents.add(dep.dependentId);

        // Queue for processing its dependents
        queue.push(dep.dependentId);
      }
    }

    return dependents;
  }
}