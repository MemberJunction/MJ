/**
 * @fileoverview Deep difference comparison utility for JavaScript objects
 * 
 * This module provides comprehensive utilities to generate detailed diffs between
 * any two JavaScript objects, arrays, or primitive values. It recursively traverses
 * nested structures and produces both machine-readable change objects and human-readable
 * formatted output.
 * 
 * Key features:
 * - Deep recursive comparison of objects and arrays
 * - Configurable depth limits and output formatting
 * - Path tracking for nested changes
 * - Summary statistics for change types
 * - Human-readable formatted output
 * - Type-safe change tracking
 * 
 * @module @memberjunction/global
 * @author MemberJunction.com
 * @since 2.63.0
 * 
 * @example
 * ```typescript
 * const differ = new DeepDiffer();
 * const diff = differ.diff(
 *   { name: 'John', age: 30, hobbies: ['reading'] },
 *   { name: 'John', age: 31, hobbies: ['reading', 'gaming'] }
 * );
 * console.log(diff.formatted);
 * // Output:
 * // Modified: age
 * //   Changed from 30 to 31
 * // Modified: hobbies
 * //   Array length changed from 1 to 2
 * // Added: hobbies[1]
 * //   Added "gaming"
 * ```
 * 
 * @example
 * ```typescript
 * // With treatNullAsUndefined option
 * const differ = new DeepDiffer({ treatNullAsUndefined: true });
 * const diff = differ.diff(
 *   { name: null, status: 'active', oldProp: 'value' },
 *   { name: 'John', status: null, newProp: 'value' }
 * );
 * // name: shows as Added (not Modified)
 * // status: shows as Removed (not Modified)
 * // oldProp: shows as Removed
 * // newProp: shows as Added
 * ```
 */

import _ from 'lodash';

/**
 * Types of changes that can occur in a deep diff operation
 */
export enum DiffChangeType {
    /** A new property or value was added */
    Added = 'added',
    /** An existing property or value was removed */
    Removed = 'removed',
    /** An existing value was changed to a different value */
    Modified = 'modified',
    /** No change detected (only included when includeUnchanged is true) */
    Unchanged = 'unchanged'
}

/**
 * Represents a single change detected during diff operation
 */
export interface DiffChange {
    /** The path to the changed value (e.g., "user.profile.name" or "items[2].id") */
    path: string;
    /** The type of change that occurred */
    type: DiffChangeType;
    /** The original value (undefined for Added changes) */
    oldValue?: any;
    /** The new value (undefined for Removed changes) */
    newValue?: any;
    /** Human-readable description of the change */
    description: string;
}

/**
 * Complete result of a deep diff operation
 */
export interface DeepDiffResult {
    /** Array of all detected changes */
    changes: DiffChange[];
    /** Summary statistics about the diff */
    summary: {
        /** Number of properties/values that were added */
        added: number;
        /** Number of properties/values that were removed */
        removed: number;
        /** Number of properties/values that were modified */
        modified: number;
        /** Number of properties/values that remained unchanged (if tracked) */
        unchanged: number;
        /** Total number of paths examined */
        totalPaths: number;
    };
    /** Human-readable formatted diff output suitable for display or logging */
    formatted: string;
}

/**
 * Configuration options for deep diff generation
 */
export interface DeepDiffConfig {
    /** 
     * Whether to include unchanged paths in the diff results.
     * Useful for seeing the complete structure comparison.
     * @default false
     */
    includeUnchanged: boolean;
    
    /** 
     * Maximum depth to traverse in nested objects.
     * Prevents infinite recursion and controls performance.
     * @default 10
     */
    maxDepth: number;
    
    /** 
     * Maximum string length before truncation in formatted output.
     * Helps keep the output readable for large text values.
     * @default 100
     */
    maxStringLength: number;
    
    /** 
     * Whether to include array indices in paths (e.g., "items[0]" vs "items").
     * Provides more precise change tracking for arrays.
     * @default true
     */
    includeArrayIndices: boolean;
    
    /**
     * Whether to treat null values as equivalent to undefined.
     * When true, transitions between null and undefined are not considered changes,
     * and null values in the old object are treated as "not present" for new values.
     * Useful for APIs where null and undefined are used interchangeably.
     * @default false
     */
    treatNullAsUndefined: boolean;
    
    /**
     * Custom value formatter for the formatted output.
     * Allows customization of how values are displayed.
     * @param value - The value to format
     * @param type - The type of the value
     * @returns Formatted string representation
     */
    valueFormatter?: (value: any, type: string) => string;
}

/**
 * Deep difference generator for comparing JavaScript objects, arrays, and primitives.
 * 
 * This class provides comprehensive comparison capabilities with configurable
 * output formatting and depth control.
 */
export class DeepDiffer {
    private config: DeepDiffConfig;
    
    /**
     * Creates a new DeepDiffer instance
     * @param config - Optional configuration overrides
     */
    constructor(config?: Partial<DeepDiffConfig>) {
        this.config = {
            includeUnchanged: false,
            maxDepth: 10,
            maxStringLength: 100,
            includeArrayIndices: true,
            treatNullAsUndefined: false,
            ...config
        };
    }
    
    /**
     * Generate a deep diff between two values
     * 
     * @param oldValue - The original value
     * @param newValue - The new value to compare against
     * @returns Complete diff results including changes, summary, and formatted output
     * 
     * @example
     * ```typescript
     * const differ = new DeepDiffer({ includeUnchanged: true });
     * const result = differ.diff(
     *   { users: [{ id: 1, name: 'Alice' }] },
     *   { users: [{ id: 1, name: 'Alice Cooper' }] }
     * );
     * ```
     */
    public diff<T = any>(oldValue: T, newValue: T): DeepDiffResult {
        const changes: DiffChange[] = [];
        
        // Generate the diff recursively
        this.generateDiff(
            oldValue,
            newValue,
            [],
            changes,
            0
        );
        
        // Sort changes by path for consistency
        changes.sort((a, b) => a.path.localeCompare(b.path));
        
        // Generate summary
        const summary = {
            added: changes.filter(c => c.type === DiffChangeType.Added).length,
            removed: changes.filter(c => c.type === DiffChangeType.Removed).length,
            modified: changes.filter(c => c.type === DiffChangeType.Modified).length,
            unchanged: changes.filter(c => c.type === DiffChangeType.Unchanged).length,
            totalPaths: changes.length
        };
        
        // Generate formatted output
        const formatted = this.formatDiff(changes, summary);
        
        return {
            changes,
            summary,
            formatted
        };
    }
    
    /**
     * Update configuration options
     * @param config - Partial configuration to merge with existing config
     */
    public updateConfig(config: Partial<DeepDiffConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * Recursively generate diff between two values
     * @private
     */
    private generateDiff(
        oldValue: any,
        newValue: any,
        path: string[],
        changes: DiffChange[],
        depth: number
    ): void {
        // Check depth limit
        if (depth > this.config.maxDepth) {
            return;
        }
        
        const pathStr = path.join('.');
        
        // Helper to check if a value is effectively undefined (includes null if treatNullAsUndefined is true)
        const isEffectivelyUndefined = (value: any): boolean => {
            return value === undefined || (this.config.treatNullAsUndefined && value === null);
        };
        
        // Helper to check if values are effectively equal
        const areEffectivelyEqual = (val1: any, val2: any): boolean => {
            if (val1 === val2) return true;
            if (this.config.treatNullAsUndefined && isEffectivelyUndefined(val1) && isEffectivelyUndefined(val2)) {
                return true;
            }
            return false;
        };
        
        // Handle different cases
        if (areEffectivelyEqual(oldValue, newValue)) {
            if (this.config.includeUnchanged) {
                changes.push({
                    path: pathStr || 'root',
                    type: DiffChangeType.Unchanged,
                    oldValue,
                    newValue,
                    description: 'No change'
                });
            }
        } else if (isEffectivelyUndefined(oldValue) && !isEffectivelyUndefined(newValue)) {
            changes.push({
                path: pathStr || 'root',
                type: DiffChangeType.Added,
                newValue,
                description: this.describeValue(newValue, 'Added')
            });
        } else if (!isEffectivelyUndefined(oldValue) && isEffectivelyUndefined(newValue)) {
            changes.push({
                path: pathStr || 'root',
                type: DiffChangeType.Removed,
                oldValue,
                description: this.describeValue(oldValue, 'Removed')
            });
        } else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            this.diffArrays(oldValue, newValue, path, changes, depth);
        } else if (_.isObject(oldValue) && _.isObject(newValue)) {
            this.diffObjects(oldValue, newValue, path, changes, depth);
        } else {
            // Values are different types or primitives
            changes.push({
                path: pathStr || 'root',
                type: DiffChangeType.Modified,
                oldValue,
                newValue,
                description: `Changed from ${this.describeValue(oldValue)} to ${this.describeValue(newValue)}`
            });
        }
    }
    
    /**
     * Compare two arrays and generate diff
     * @private
     */
    private diffArrays(
        oldArray: any[],
        newArray: any[],
        path: string[],
        changes: DiffChange[],
        depth: number
    ): void {
        const pathStr = path.join('.');
        
        // Check if array lengths are different
        if (oldArray.length !== newArray.length) {
            changes.push({
                path: pathStr || 'root',
                type: DiffChangeType.Modified,
                oldValue: `Array[${oldArray.length}]`,
                newValue: `Array[${newArray.length}]`,
                description: `Array length changed from ${oldArray.length} to ${newArray.length}`
            });
        }
        
        // Compare array elements
        const maxLength = Math.max(oldArray.length, newArray.length);
        for (let i = 0; i < maxLength; i++) {
            const elementPath = this.config.includeArrayIndices 
                ? [...path, `[${i}]`]
                : [...path, `[]`];
            
            if (i < oldArray.length && i < newArray.length) {
                // Element exists in both arrays
                this.generateDiff(oldArray[i], newArray[i], elementPath, changes, depth + 1);
            } else if (i < oldArray.length) {
                // Element was removed
                changes.push({
                    path: elementPath.join('.'),
                    type: DiffChangeType.Removed,
                    oldValue: oldArray[i],
                    description: this.describeValue(oldArray[i], 'Removed')
                });
            } else {
                // Element was added
                changes.push({
                    path: elementPath.join('.'),
                    type: DiffChangeType.Added,
                    newValue: newArray[i],
                    description: this.describeValue(newArray[i], 'Added')
                });
            }
        }
    }
    
    /**
     * Compare two objects and generate diff
     * @private
     */
    private diffObjects(
        oldObj: any,
        newObj: any,
        path: string[],
        changes: DiffChange[],
        depth: number
    ): void {
        // Get all unique keys from both objects
        const allKeys = new Set([
            ...Object.keys(oldObj),
            ...Object.keys(newObj)
        ]);
        
        // Compare each key
        for (const key of allKeys) {
            const keyPath = [...path, key];
            this.generateDiff(
                oldObj[key],
                newObj[key],
                keyPath,
                changes,
                depth + 1
            );
        }
    }
    
    /**
     * Create a human-readable description of a value
     * @private
     */
    private describeValue(value: any, prefix?: string): string {
        if (this.config.valueFormatter) {
            const type = Array.isArray(value) ? 'array' : typeof value;
            return this.config.valueFormatter(value, type);
        }
        
        const description = this.getValueDescription(value);
        return prefix ? `${prefix} ${description}` : description;
    }
    
    /**
     * Get a description of a value for display
     * @private
     */
    private getValueDescription(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        
        const type = typeof value;
        
        if (type === 'string') {
            const str = value.length > this.config.maxStringLength
                ? `"${value.substring(0, this.config.maxStringLength)}..."`
                : `"${value}"`;
            return str;
        }
        
        if (type === 'number' || type === 'boolean') {
            return String(value);
        }
        
        if (Array.isArray(value)) {
            return `Array[${value.length}]`;
        }
        
        if (_.isObject(value)) {
            const keys = Object.keys(value);
            return `Object{${keys.length} ${keys.length === 1 ? 'key' : 'keys'}}`;
        }
        
        return String(value);
    }
    
    /**
     * Format the diff results as a human-readable string
     * @private
     */
    private formatDiff(changes: DiffChange[], summary: DeepDiffResult['summary']): string {
        const lines: string[] = [];
        
        // Add summary header
        lines.push('=== Deep Diff Summary ===');
        lines.push(`Total changes: ${summary.added + summary.removed + summary.modified}`);
        if (summary.added > 0) lines.push(`  Added: ${summary.added}`);
        if (summary.removed > 0) lines.push(`  Removed: ${summary.removed}`);
        if (summary.modified > 0) lines.push(`  Modified: ${summary.modified}`);
        if (this.config.includeUnchanged && summary.unchanged > 0) {
            lines.push(`  Unchanged: ${summary.unchanged}`);
        }
        lines.push('');
        
        // Add changes
        if (changes.length > 0) {
            lines.push('=== Changes ===');
            
            // Group changes by type for better readability
            const changesByType = _.groupBy(changes, 'type');
            
            for (const type of [DiffChangeType.Added, DiffChangeType.Removed, DiffChangeType.Modified]) {
                const typeChanges = changesByType[type];
                if (typeChanges && typeChanges.length > 0) {
                    lines.push(`\n${type.charAt(0).toUpperCase() + type.slice(1)}:`);
                    for (const change of typeChanges) {
                        lines.push(`  ${change.path}: ${change.description}`);
                    }
                }
            }
            
            if (this.config.includeUnchanged && changesByType[DiffChangeType.Unchanged]) {
                lines.push(`\nUnchanged (${changesByType[DiffChangeType.Unchanged].length} items)`);
            }
        }
        
        return lines.join('\n');
    }
}