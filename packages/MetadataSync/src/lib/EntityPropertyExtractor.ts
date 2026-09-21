import { BaseEntity } from '@memberjunction/core';

/** Suffix CodeGen appends to a JSON column's name for its typed accessor. */
const TYPED_JSON_COMPANION_SUFFIX = 'Object';

/**
 * Whether `propertyName` is CodeGen's typed accessor for a real JSON field —
 * `ConfigurationObject` beside a `Configuration` column.
 *
 * These are derived: no column, no EntityField, and the same content the real
 * field already holds. Writing both duplicates the column into the metadata file
 * and, worse, defeats field externalization — `Configuration.ReplayScript`
 * becomes an `@file:` reference while the companion keeps the whole value inline,
 * so nothing is actually externalized.
 *
 * Identified structurally rather than by name so it holds for every entity: the
 * property must end in `Object` AND the remainder must be a real field. A
 * `BusinessObject` property on an entity with no `Business` field is a genuine
 * computed property and is kept.
 */
export function isTypedJsonCompanion(propertyName: string, entityFieldNames: readonly string[]): boolean {
    if (!propertyName.toLowerCase().endsWith(TYPED_JSON_COMPANION_SUFFIX.toLowerCase())) {
        return false;
    }
    const base = propertyName.slice(0, -TYPED_JSON_COMPANION_SUFFIX.length).toLowerCase();
    if (!base) {
        return false;
    }
    return entityFieldNames.some(f => f.toLowerCase() === base);
}

/**
 * Handles discovery and extraction of all properties from BaseEntity objects,
 * including both database fields and virtual properties defined in subclasses.
 */
export class EntityPropertyExtractor {
  /**
   * Gets ALL properties from a BaseEntity object, including both:
   * 1. Database fields (from record.GetAll())
   * 2. Virtual properties (getters defined in subclasses like TemplateText)
   * @param record The BaseEntity object to get properties from
   * @param fieldOverrides Optional field value overrides (e.g., for @parent:ID syntax)
   */
  ExtractAllProperties(record: BaseEntity, fieldOverrides?: Record<string, any>): Record<string, any> {
    const allProperties: Record<string, any> = {};
    
    // 1. Get database fields using GetAll()
    this.extractDatabaseFields(record, allProperties);
    
    // 2. Apply field overrides (e.g., for @parent:ID replacement in related entities)
    this.applyFieldOverrides(allProperties, fieldOverrides);
    
    // 3. Extract virtual properties by walking the prototype chain
    this.extractVirtualProperties(record, allProperties, fieldOverrides);
    
    return allProperties;
  }

  /** @deprecated Use {@link ExtractAllProperties}. */
  extractAllProperties(record: BaseEntity, fieldOverrides?: Record<string, any>): Record<string, any> {
    return this.ExtractAllProperties(record, fieldOverrides);
  }

  /**
   * Extracts database fields from the entity using GetAll()
   */
  private extractDatabaseFields(record: BaseEntity, allProperties: Record<string, any>): void {
    if (typeof record.GetAll === 'function') {
      const dbFields = record.GetAll();
      Object.assign(allProperties, dbFields);
    }
  }

  /**
   * Applies field overrides to the properties collection
   */
  private applyFieldOverrides(allProperties: Record<string, any>, fieldOverrides?: Record<string, any>): void {
    if (fieldOverrides) {
      Object.assign(allProperties, fieldOverrides);
    }
  }

  /**
   * Extracts virtual properties by walking the prototype chain
   */
  private extractVirtualProperties(
    record: BaseEntity, 
    allProperties: Record<string, any>, 
    fieldOverrides?: Record<string, any>
  ): void {
    const virtualProperties = this.discoverVirtualProperties(record);
    const entityFieldNames = record.EntityInfo?.Fields?.map(f => f.Name) ?? [];

    for (const propertyName of virtualProperties) {
      try {
        // Skip if this property is overridden
        if (fieldOverrides && propertyName in fieldOverrides) {
          continue;
        }

        // Skip CodeGen's typed accessor for a JSON column — it duplicates the
        // real field and would keep inline the very value externalization just
        // moved out to a file.
        if (isTypedJsonCompanion(propertyName, entityFieldNames)) {
          continue;
        }
        
        // Use bracket notation to access the getter
        const value = (record as any)[propertyName];
        
        // Only include if the value is not undefined and not a function
        if (value !== undefined && typeof value !== 'function') {
          allProperties[propertyName] = value;
        }
      } catch (error) {
        // Skip properties that throw errors when accessed
        continue;
      }
    }
  }

  /**
   * Discovers virtual properties (getters) defined in BaseEntity subclasses
   * Returns property names that are getters but not in the base database fields
   */
  private discoverVirtualProperties(record: BaseEntity): string[] {
    const virtualProperties: string[] = [];
    const dbFieldNames = this.getDatabaseFieldNames(record);
    
    // Walk the prototype chain to find getters
    let currentPrototype = Object.getPrototypeOf(record);
    
    while (currentPrototype && currentPrototype !== Object.prototype) {
      this.extractPropertiesFromPrototype(currentPrototype, virtualProperties, dbFieldNames);
      currentPrototype = Object.getPrototypeOf(currentPrototype);
    }
    
    return virtualProperties;
  }

  /**
   * Gets the set of database field names from the entity
   */
  private getDatabaseFieldNames(record: BaseEntity): Set<string> {
    const dbFieldNames = new Set<string>();
    
    if (typeof record.GetAll === 'function') {
      const dbFields = record.GetAll();
      Object.keys(dbFields).forEach(key => dbFieldNames.add(key));
    }
    
    return dbFieldNames;
  }

  /**
   * Extracts properties from a single prototype level
   */
  private extractPropertiesFromPrototype(
    prototype: any, 
    virtualProperties: string[], 
    dbFieldNames: Set<string>
  ): void {
    const propertyNames = Object.getOwnPropertyNames(prototype);
    
    for (const propertyName of propertyNames) {
      if (this.shouldIncludeProperty(propertyName, virtualProperties, dbFieldNames)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
        if (this.isVirtualProperty(descriptor)) {
          virtualProperties.push(propertyName);
        }
      }
    }
  }

  /**
   * Determines if a property should be considered for inclusion
   */
  private shouldIncludeProperty(
    propertyName: string, 
    virtualProperties: string[], 
    dbFieldNames: Set<string>
  ): boolean {
    // Skip if already found or is a database field
    if (virtualProperties.includes(propertyName) || dbFieldNames.has(propertyName)) {
      return false;
    }
    
    // Skip internal properties and methods
    return !this.shouldSkipProperty(propertyName);
  }

  /**
   * Determines if a property descriptor represents a virtual property
   */
  private isVirtualProperty(descriptor: PropertyDescriptor | undefined): boolean {
    if (!descriptor) return false;
    
    // Skip read-only getters (might be computed properties)
    if (typeof descriptor.get === 'function' && !descriptor.set) {
      return false;
    }
    
    // Include read-write getter/setter pairs (likely virtual properties)
    return typeof descriptor.get === 'function' && typeof descriptor.set === 'function';
  }

  /**
   * Determines if a property should be skipped during virtual property discovery
   */
  private shouldSkipProperty(propertyName: string): boolean {
    // Skip private properties (starting with _ or __)
    if (propertyName.startsWith('_') || propertyName.startsWith('__')) {
      return true;
    }
    
    // Skip constructor and common Object.prototype methods
    if (this.isCommonObjectMethod(propertyName)) {
      return true;
    }
    
    // Skip known BaseEntity methods and properties
    return this.isBaseEntityMethod(propertyName);
  }

  /**
   * Checks if property is a common Object.prototype method
   */
  private isCommonObjectMethod(propertyName: string): boolean {
    const commonMethods = ['constructor', 'toString', 'valueOf'];
    return commonMethods.includes(propertyName);
  }

  /**
   * Checks if property is a known BaseEntity method or property
   */
  private isBaseEntityMethod(propertyName: string): boolean {
    const baseEntityMethods = [
      'Get', 'Set', 'GetAll', 'SetMany', 'LoadFromData', 'Save', 'Load', 'Delete',
      'Fields', 'Dirty', 'IsSaved', 'PrimaryKeys', 'EntityInfo', 'ContextCurrentUser',
      'ProviderToUse', 'RecordChanges', 'TransactionGroup'
    ];
    
    return baseEntityMethods.includes(propertyName);
  }
}