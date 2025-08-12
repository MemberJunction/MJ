import { Metadata, EntityInfo } from '@memberjunction/core';
import { RecordData } from './sync-engine';

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
 * Result of dependency analysis
 */
export interface DependencyAnalysisResult {
  sortedRecords: FlattenedRecord[];
  circularDependencies: string[][];
  dependencyGraph: Map<string, Set<string>>;
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
   * Main entry point: analyzes all records in a file and returns them in dependency order
   */
  public async analyzeFileRecords(
    records: RecordData[],
    entityName: string
  ): Promise<DependencyAnalysisResult> {
    // Reset state
    this.flattenedRecords = [];
    this.recordIdMap.clear();
    this.recordCounter = 0;

    // Step 1: Flatten all records (including nested relatedEntities)
    this.flattenRecords(records, entityName);

    // Step 2: Analyze dependencies between all flattened records
    this.analyzeDependencies();

    // Step 3: Detect circular dependencies
    const circularDeps = this.detectCircularDependencies();

    // Step 4: Perform topological sort
    const sortedRecords = this.topologicalSort();

    // Step 5: Build dependency graph for debugging
    const dependencyGraph = new Map<string, Set<string>>();
    for (const record of this.flattenedRecords) {
      dependencyGraph.set(record.id, record.dependencies);
    }

    return {
      sortedRecords,
      circularDependencies: circularDeps,
      dependencyGraph
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
            if (fieldValue.startsWith('@lookup:')) {
              const dependency = this.findLookupDependency(fieldValue, record);
              if (dependency) {
                record.dependencies.add(dependency);
              }
            }
            // Handle @root references - these create dependencies on the root record
            else if (fieldValue.startsWith('@root:')) {
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
        if (resolvedValue.startsWith('@lookup:')) {
          const nestedDependency = this.findLookupDependency(resolvedValue, currentRecord);
          if (nestedDependency) {
            // Add this as a dependency of the current record
            currentRecord.dependencies.add(nestedDependency);
            // Continue processing - we can't resolve the actual value here
            // but we've recorded the dependency
          }
        }
        // Special handling for @root references in lookup criteria
        else if (resolvedValue.startsWith('@root:')) {
          // Add dependency on root record
          const rootDep = this.findRootDependency(currentRecord);
          if (rootDep) {
            currentRecord.dependencies.add(rootDep);
          }
          // Note: We can't resolve the actual value here, but we've recorded the dependency
        }
        // Special handling for @parent references in lookup criteria
        // If the value is @parent:field, we need to resolve it from the parent context
        else if (resolvedValue.startsWith('@parent:') && currentRecord.parentContext) {
          const parentField = resolvedValue.substring(8);
          
          // Try to resolve from parent context
          const parentValue = currentRecord.parentContext.record.fields?.[parentField] ||
                             currentRecord.parentContext.record.primaryKey?.[parentField];
          
          if (parentValue && typeof parentValue === 'string') {
            // Check if parent value is also a @parent reference (nested parent refs)
            if (parentValue.startsWith('@parent:')) {
              // Find the parent record to get its parent context
              const parentRecord = this.flattenedRecords.find(r => 
                r.record === currentRecord.parentContext!.record && 
                r.entityName === currentRecord.parentContext!.entityName
              );
              
              if (parentRecord && parentRecord.parentContext) {
                const grandParentField = parentValue.substring(8);
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
        
        // Handle special case where candidate has @parent:ID and lookup has resolved value
        if (candidateValue === '@parent:ID' && candidate.parentContext && !lookupValue.startsWith('@')) {
          // Get the parent record's ID
          const parentRecord = candidate.parentContext.record;
          candidateValue = parentRecord.primaryKey?.ID || parentRecord.fields?.ID;
          
          // If parent ID is not yet set (new record), we can't match yet
          if (!candidateValue) {
            allMatch = false;
            break;
          }
        }
        
        // Also check if @parent:<field> syntax
        if (typeof candidateValue === 'string' && candidateValue.startsWith('@parent:') && candidate.parentContext) {
          const parentField = candidateValue.substring(8);
          const parentRecord = candidate.parentContext.record;
          candidateValue = parentRecord.fields?.[parentField] || parentRecord.primaryKey?.[parentField];
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
}