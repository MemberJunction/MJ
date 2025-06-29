/**
 * @fileoverview Payload management for hierarchical agent execution.
 * 
 * This module provides functionality to control which parts of a payload
 * are accessible to sub-agents (downstream) and which parts they can
 * modify (upstream). It supports JSON path-based access control with
 * wildcards and nested path support.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 3.0.0
 */

import { LogError, LogStatus } from '@memberjunction/core';
import * as _ from 'lodash';

/**
 * Manages payload access control for agent hierarchies.
 * 
 * This class handles extracting specific paths from payloads when sending
 * data downstream to sub-agents, and merging results back upstream while
 * respecting write permissions.
 * 
 * Path syntax supports:
 * - Exact paths: "customer.name"
 * - Wildcards: "customer.*" (all properties under customer)
 * - Array indices: "items[0].price" or "items[*].price"
 * - Deep wildcards: "**.id" (all id fields at any depth)
 * - Root wildcard: "*" (entire payload)
 */
export class PayloadManager {
    /**
     * Extracts only the allowed paths from a payload for downstream transmission.
     * 
     * @param fullPayload The complete payload object
     * @param downstreamPaths Array of path patterns defining what to extract
     * @returns A new object containing only the allowed paths
     * 
     * @example
     * ```typescript
     * const payload = { customer: { id: 1, name: 'John', secret: 'xxx' }, order: { id: 2 } };
     * const paths = ['customer.id', 'customer.name', 'order.*'];
     * const result = extractDownstreamPayload(payload, paths);
     * // Returns: { customer: { id: 1, name: 'John' }, order: { id: 2 } }
     * ```
     */
    public extractDownstreamPayload(subAgentName: string, fullPayload: any, downstreamPaths: string[]): any {
        if (!fullPayload) return null;
        if (!downstreamPaths || downstreamPaths.length === 0) return {};
        
        // Handle wildcard - return everything
        if (downstreamPaths.includes('*')) {
            return _.cloneDeep(fullPayload);
        }

        const result = {};
        
        for (const pathPattern of downstreamPaths) {
            try {
                this.extractPathPattern(fullPayload, pathPattern, result);
            } catch (error) {
                LogError(`Failed to extract path pattern '${pathPattern}': ${error.message}`);
            }
        }
        
        return result;
    }

    /**
     * Merges sub-agent results back into the parent payload, respecting write permissions.
     * 
     * @param parentPayload The original parent payload
     * @param subAgentPayload The payload returned by the sub-agent
     * @param upstreamPaths Array of path patterns the sub-agent is allowed to write
     * @returns A new merged payload object
     * 
     * @example
     * ```typescript
     * const parent = { customer: { id: 1 }, analysis: { sentiment: null } };
     * const subResult = { customer: { id: 2 }, analysis: { sentiment: 'positive', score: 0.9 } };
     * const writePaths = ['analysis.*'];
     * const merged = mergeUpstreamPayload(parent, subResult, writePaths);
     * // Returns: { customer: { id: 1 }, analysis: { sentiment: 'positive', score: 0.9 } }
     * ```
     */
    public mergeUpstreamPayload(
        subAgentName: string,
        parentPayload: any, 
        subAgentPayload: any, 
        upstreamPaths: string[]
    ): any {
        if (!parentPayload && !subAgentPayload) return null;
        if (!subAgentPayload) return parentPayload;
        if (!upstreamPaths || upstreamPaths.length === 0) {
            LogStatus('Warning: No upstream paths specified - sub-agent changes will be ignored');
            return parentPayload;
        }
        
        // Start with a deep clone of the parent payload
        const result = _.cloneDeep(parentPayload || {});
        
        // Handle wildcard - merge everything
        if (upstreamPaths.includes('*')) {
            return this.deepMerge(result, subAgentPayload);
        }
        
        // Check each path in the sub-agent payload
        this.mergeAllowedPaths(result, subAgentPayload, upstreamPaths, subAgentName);
        
        return result;
    }

    /**
     * Extracts a path pattern from source object into destination.
     * 
     * @private
     */
    private extractPathPattern(source: any, pathPattern: string, destination: any): void {
        // Handle deep wildcards (**)
        if (pathPattern.includes('**')) {
            this.extractDeepWildcard(source, pathPattern, destination);
            return;
        }
        
        // Handle regular paths with potential wildcards
        const pathParts = this.parsePathParts(pathPattern);
        this.extractPath(source, pathParts, destination, []);
    }

    /**
     * Recursively extracts paths based on parsed path parts.
     * 
     * @private
     */
    private extractPath(
        source: any, 
        pathParts: string[], 
        destination: any, 
        currentPath: string[]
    ): void {
        if (!source || pathParts.length === 0) return;
        
        const [currentPart, ...remainingParts] = pathParts;
        
        // Handle wildcards
        if (currentPart === '*') {
            if (_.isObject(source) && !_.isArray(source)) {
                for (const key in source) {
                    if (source.hasOwnProperty(key)) {
                        const newPath = [...currentPath, key];
                        if (remainingParts.length === 0) {
                            // Terminal wildcard - copy the value
                            _.set(destination, newPath, _.cloneDeep(source[key]));
                        } else {
                            // Non-terminal wildcard - continue recursion
                            this.extractPath(source[key], remainingParts, destination, newPath);
                        }
                    }
                }
            }
            return;
        }
        
        // Handle array notation
        if (currentPart.includes('[')) {
            this.extractArrayPath(source, currentPart, remainingParts, destination, currentPath);
            return;
        }
        
        // Handle regular property
        if (source.hasOwnProperty(currentPart)) {
            const newPath = [...currentPath, currentPart];
            if (remainingParts.length === 0) {
                // Terminal property - copy the value
                _.set(destination, newPath, _.cloneDeep(source[currentPart]));
            } else {
                // Non-terminal property - continue recursion
                this.extractPath(source[currentPart], remainingParts, destination, newPath);
            }
        }
    }

    /**
     * Handles array path extraction (e.g., items[0] or items[*]).
     * 
     * @private
     */
    private extractArrayPath(
        source: any,
        arrayPart: string,
        remainingParts: string[],
        destination: any,
        currentPath: string[]
    ): void {
        const match = arrayPart.match(/^([^[]+)\[([^\]]+)\]$/);
        if (!match) return;
        
        const [, propertyName, indexPart] = match;
        const sourceArray = source[propertyName];
        
        if (!Array.isArray(sourceArray)) return;
        
        const newPath = [...currentPath, propertyName];
        
        if (indexPart === '*') {
            // Extract all array elements
            const destArray = [];
            for (let i = 0; i < sourceArray.length; i++) {
                if (remainingParts.length === 0) {
                    destArray.push(_.cloneDeep(sourceArray[i]));
                } else {
                    const itemDest = {};
                    this.extractPath(sourceArray[i], remainingParts, itemDest, []);
                    if (Object.keys(itemDest).length > 0) {
                        destArray.push(itemDest);
                    }
                }
            }
            if (destArray.length > 0) {
                _.set(destination, newPath, destArray);
            }
        } else {
            // Extract specific index
            const index = parseInt(indexPart, 10);
            if (!isNaN(index) && index >= 0 && index < sourceArray.length) {
                if (remainingParts.length === 0) {
                    _.set(destination, [...newPath, index], _.cloneDeep(sourceArray[index]));
                } else {
                    this.extractPath(sourceArray[index], remainingParts, destination, [...newPath, index.toString()]);
                }
            }
        }
    }

    /**
     * Handles deep wildcard extraction (e.g., **.id).
     * 
     * @private
     */
    private extractDeepWildcard(source: any, pathPattern: string, destination: any): void {
        const parts = pathPattern.split('**.');
        if (parts.length !== 2 || parts[0] !== '') return;
        
        const targetProperty = parts[1];
        
        const extractRecursive = (obj: any, path: string[] = []): void => {
            if (!obj || typeof obj !== 'object') return;
            
            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    extractRecursive(item, [...path, index.toString()]);
                });
            } else {
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        if (key === targetProperty) {
                            _.set(destination, [...path, key], _.cloneDeep(obj[key]));
                        }
                        extractRecursive(obj[key], [...path, key]);
                    }
                }
            }
        };
        
        extractRecursive(source);
    }

    /**
     * Merges allowed paths from sub-agent payload into result.
     * 
     * @private
     */
    private mergeAllowedPaths(
        result: any,
        subAgentPayload: any,
        upstreamPaths: string[],
        subAgentName: string
    ): void {
        // Get all paths from sub-agent payload
        const subAgentPaths = this.getAllPaths(subAgentPayload);
        
        // Track unauthorized changes for consolidated warning
        const unauthorizedChanges: Array<{
            path: string;
            from: any;
            to: any;
        }> = [];
        
        // Check each path against allowed patterns
        for (const actualPath of subAgentPaths) {
            const isAllowed = this.isPathAllowed(actualPath, upstreamPaths);
            const subAgentValue = _.get(subAgentPayload, actualPath);
            const originalValue = _.get(result, actualPath);
            
            if (isAllowed) {
                _.set(result, actualPath, _.cloneDeep(subAgentValue));
            } else {
                // Only track if the sub-agent is trying to change the value
                if (!_.isEqual(subAgentValue, originalValue)) {
                    unauthorizedChanges.push({
                        path: actualPath,
                        from: originalValue,
                        to: subAgentValue
                    });
                }
            }
        }
        
        // Output consolidated warning if there were unauthorized changes
        if (unauthorizedChanges.length > 0) {
            const groupedChanges = this.groupUnauthorizedChanges(unauthorizedChanges);
            let warningMessage = `\n⚠️  Sub-agent "${subAgentName}" attempted ${unauthorizedChanges.length} unauthorized write${unauthorizedChanges.length > 1 ? 's' : ''}:\n`;
            
            for (const [category, changes] of Object.entries(groupedChanges)) {
                warningMessage += `\n  📁 ${category}:\n`;
                for (const change of changes) {
                    const fromStr = this.formatValue(change.from);
                    const toStr = this.formatValue(change.to);
                    warningMessage += `     • ${change.path}: ${fromStr} → ${toStr}\n`;
                }
            }
            
            warningMessage += `\n  ℹ️  Authorized paths: ${upstreamPaths.join(', ')}\n`;
            LogStatus(warningMessage);
        }
    }
    
    /**
     * Groups unauthorized changes by their root path for cleaner display.
     * 
     * @private
     */
    private groupUnauthorizedChanges(changes: Array<{path: string; from: any; to: any}>): Record<string, Array<{path: string; from: any; to: any}>> {
        const grouped: Record<string, Array<{path: string; from: any; to: any}>> = {};
        
        for (const change of changes) {
            // Extract the root category (first part of the path)
            const rootCategory = change.path.split('.')[0] || 'root';
            
            if (!grouped[rootCategory]) {
                grouped[rootCategory] = [];
            }
            
            grouped[rootCategory].push(change);
        }
        
        return grouped;
    }
    
    /**
     * Formats a value for display in warning messages.
     * 
     * @private
     */
    private formatValue(value: any): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'string') {
            // Clip long strings to 50 characters
            const trimmed = value.length > 50 ? value.substring(0, 50) + '...' : value;
            return `"${trimmed}"`;
        }
        if (typeof value === 'object') {
            const str = JSON.stringify(value);
            // Clip long JSON to 50 characters
            return str.length > 50 ? str.substring(0, 50) + '...' : str;
        }
        return String(value);
    }

    /**
     * Gets all leaf paths from an object.
     * 
     * @private
     */
    private getAllPaths(obj: any, currentPath: string[] = []): string[] {
        const paths: string[] = [];
        
        if (!obj || typeof obj !== 'object') {
            return currentPath.length > 0 ? [currentPath.join('.')] : [];
        }
        
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                paths.push(...this.getAllPaths(item, [...currentPath, `[${index}]`]));
            });
        } else {
            const keys = Object.keys(obj);
            if (keys.length === 0 && currentPath.length > 0) {
                paths.push(currentPath.join('.'));
            } else {
                for (const key of keys) {
                    paths.push(...this.getAllPaths(obj[key], [...currentPath, key]));
                }
            }
        }
        
        return paths;
    }

    /**
     * Checks if a path matches any of the allowed patterns.
     * 
     * @private
     */
    private isPathAllowed(actualPath: string, allowedPatterns: string[]): boolean {
        const normalizedPath = actualPath.replace(/\[(\d+)\]/g, '.$1');
        
        for (const pattern of allowedPatterns) {
            if (pattern === '*') return true;
            
            if (pattern.includes('**')) {
                // Handle deep wildcards
                const regex = pattern
                    .replace(/\./g, '\\.')
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^.]+');
                if (new RegExp(`^${regex}$`).test(normalizedPath)) {
                    return true;
                }
            } else {
                // Handle regular patterns
                // Check if pattern ends with .* which means "everything under this path"
                if (pattern.endsWith('.*')) {
                    const basePath = pattern.slice(0, -2); // Remove the .*
                    const escapedBase = basePath.replace(/\./g, '\\.');
                    // Match the base path followed by a dot and anything after
                    const regex = `^${escapedBase}(\\..*)?$`;
                    if (new RegExp(regex).test(normalizedPath)) {
                        return true;
                    }
                } else {
                    // Handle other wildcard patterns
                    const regex = pattern
                        .replace(/\./g, '\\.')
                        .replace(/\*/g, '[^.]+')
                        .replace(/\[(\*|\d+)\]/g, '\\[(\\*|\\d+)\\]');
                    if (new RegExp(`^${regex}$`).test(normalizedPath)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * Parses a path string into parts, handling array notation.
     * 
     * @private
     */
    private parsePathParts(path: string): string[] {
        // Split by dots but preserve array notation
        const parts: string[] = [];
        let current = '';
        let inBracket = false;
        
        for (const char of path) {
            if (char === '[') {
                inBracket = true;
                current += char;
            } else if (char === ']') {
                inBracket = false;
                current += char;
            } else if (char === '.' && !inBracket) {
                if (current) {
                    parts.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }
        
        if (current) {
            parts.push(current);
        }
        
        return parts;
    }

    /**
     * Deep merges two objects, with source overriding destination.
     * 
     * @private
     */
    private deepMerge(destination: any, source: any): any {
        if (!source) return destination;
        if (!destination) return _.cloneDeep(source);
        
        const result = _.cloneDeep(destination);
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (_.isObject(source[key]) && !_.isArray(source[key]) && _.isObject(result[key]) && !_.isArray(result[key])) {
                    // Both are objects - recursive merge
                    result[key] = this.deepMerge(result[key], source[key]);
                } else {
                    // Otherwise, source overwrites destination
                    result[key] = _.cloneDeep(source[key]);
                }
            }
        }
        
        return result;
    }
}