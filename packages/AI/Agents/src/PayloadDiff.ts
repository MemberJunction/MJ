/**
 * @fileoverview Payload diff generation for tracking changes between states
 * 
 * This module provides utilities to generate human-readable diffs between
 * payload states, useful for debugging and audit trails.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 3.1.0
 */

import * as _ from 'lodash';

/**
 * Types of changes that can occur in a diff
 */
export enum DiffChangeType {
    Added = 'added',
    Removed = 'removed',
    Modified = 'modified',
    Unchanged = 'unchanged'
}

/**
 * Represents a single change in the diff
 */
export interface DiffChange {
    path: string;
    type: DiffChangeType;
    oldValue?: any;
    newValue?: any;
    /** Human-readable description of the change */
    description: string;
}

/**
 * Result of a payload diff operation
 */
export interface PayloadDiff {
    changes: DiffChange[];
    summary: {
        added: number;
        removed: number;
        modified: number;
        unchanged: number;
        totalPaths: number;
    };
    /** Formatted diff as a string for display/storage */
    formatted: string;
}

/**
 * Configuration options for diff generation
 */
export interface DiffConfig {
    /** Whether to include unchanged paths in the diff */
    includeUnchanged: boolean;
    /** Maximum depth to traverse */
    maxDepth: number;
    /** Maximum string length before truncation in formatted output */
    maxStringLength: number;
    /** Whether to include array indices in paths */
    includeArrayIndices: boolean;
}

/**
 * Generates diffs between payload states
 */
export class PayloadDiffer {
    private config: DiffConfig;
    
    constructor(config?: Partial<DiffConfig>) {
        this.config = {
            includeUnchanged: false,
            maxDepth: 10,
            maxStringLength: 100,
            includeArrayIndices: true,
            ...config
        };
    }
    
    /**
     * Generate a diff between two payload states
     */
    public diff<T = any>(oldPayload: T, newPayload: T): PayloadDiff {
        const changes: DiffChange[] = [];
        
        // Generate the diff recursively
        this.generateDiff(
            oldPayload,
            newPayload,
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
     * Recursively generate diff between two values
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
        
        // Handle different cases
        if (oldValue === newValue) {
            if (this.config.includeUnchanged) {
                changes.push({
                    path: pathStr || 'root',
                    type: DiffChangeType.Unchanged,
                    oldValue,
                    newValue,
                    description: 'No change'
                });
            }
        } else if (oldValue === undefined && newValue !== undefined) {
            changes.push({
                path: pathStr || 'root',
                type: DiffChangeType.Added,
                newValue,
                description: this.describeValue(newValue, 'Added')
            });
        } else if (oldValue !== undefined && newValue === undefined) {
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
     * Diff two arrays
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
        
        // Diff individual elements
        const maxLength = Math.max(oldArray.length, newArray.length);
        for (let i = 0; i < maxLength; i++) {
            const elementPath = this.config.includeArrayIndices 
                ? [...path, `[${i}]`]
                : path;
                
            if (i < oldArray.length && i < newArray.length) {
                this.generateDiff(
                    oldArray[i],
                    newArray[i],
                    elementPath,
                    changes,
                    depth + 1
                );
            } else if (i < oldArray.length) {
                changes.push({
                    path: elementPath.join('.'),
                    type: DiffChangeType.Removed,
                    oldValue: oldArray[i],
                    description: `Removed array element at index ${i}`
                });
            } else {
                changes.push({
                    path: elementPath.join('.'),
                    type: DiffChangeType.Added,
                    newValue: newArray[i],
                    description: `Added array element at index ${i}`
                });
            }
        }
    }
    
    /**
     * Diff two objects
     */
    private diffObjects(
        oldObj: any,
        newObj: any,
        path: string[],
        changes: DiffChange[],
        depth: number
    ): void {
        const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
        
        for (const key of allKeys) {
            const keyPath = [...path, key];
            
            if (!(key in oldObj)) {
                changes.push({
                    path: keyPath.join('.'),
                    type: DiffChangeType.Added,
                    newValue: newObj[key],
                    description: `Added property '${key}'`
                });
            } else if (!(key in newObj)) {
                changes.push({
                    path: keyPath.join('.'),
                    type: DiffChangeType.Removed,
                    oldValue: oldObj[key],
                    description: `Removed property '${key}'`
                });
            } else {
                this.generateDiff(
                    oldObj[key],
                    newObj[key],
                    keyPath,
                    changes,
                    depth + 1
                );
            }
        }
    }
    
    /**
     * Create a human-readable description of a value
     */
    private describeValue(value: any, prefix?: string): string {
        const type = Array.isArray(value) ? 'array' : typeof value;
        
        switch (type) {
            case 'string':
                const str = value.length > this.config.maxStringLength
                    ? value.substring(0, this.config.maxStringLength) + '...'
                    : value;
                return prefix ? `${prefix} string: "${str}"` : `"${str}"`;
                
            case 'number':
            case 'boolean':
                return prefix ? `${prefix} ${type}: ${value}` : String(value);
                
            case 'array':
                return prefix ? `${prefix} array[${value.length}]` : `array[${value.length}]`;
                
            case 'object':
                if (value === null) {
                    return prefix ? `${prefix} null` : 'null';
                }
                const keys = Object.keys(value).length;
                return prefix ? `${prefix} object{${keys} keys}` : `object{${keys} keys}`;
                
            default:
                return prefix ? `${prefix} ${type}` : type;
        }
    }
    
    /**
     * Format the diff for display
     */
    private formatDiff(changes: DiffChange[], summary: any): string {
        const lines: string[] = [
            '=== Payload Diff ===',
            `Summary: +${summary.added} -${summary.removed} ~${summary.modified}`,
            ''
        ];
        
        // Group changes by type
        const grouped = _.groupBy(changes, 'type');
        
        // Format additions
        if (grouped[DiffChangeType.Added]?.length > 0) {
            lines.push('Added:');
            for (const change of grouped[DiffChangeType.Added]) {
                lines.push(`  + ${change.path}: ${change.description}`);
            }
            lines.push('');
        }
        
        // Format removals
        if (grouped[DiffChangeType.Removed]?.length > 0) {
            lines.push('Removed:');
            for (const change of grouped[DiffChangeType.Removed]) {
                lines.push(`  - ${change.path}: ${change.description}`);
            }
            lines.push('');
        }
        
        // Format modifications
        if (grouped[DiffChangeType.Modified]?.length > 0) {
            lines.push('Modified:');
            for (const change of grouped[DiffChangeType.Modified]) {
                lines.push(`  ~ ${change.path}: ${change.description}`);
            }
            lines.push('');
        }
        
        return lines.join('\n');
    }
    
    /**
     * Generate a compact summary suitable for logging
     */
    public generateCompactSummary(diff: PayloadDiff): string {
        const { summary } = diff;
        return `+${summary.added} -${summary.removed} ~${summary.modified} (${summary.totalPaths} total paths)`;
    }
}