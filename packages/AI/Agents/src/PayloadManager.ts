/**
 * @fileoverview Payload management for hierarchical agent execution.
 * 
 * This module provides functionality to control which parts of a payload
 * are accessible to sub-agents (downstream) and which parts they can
 * modify (upstream). It supports JSON path-based access control with
 * wildcards and nested path support.
 * 
 * ## Key Features:
 * - Path-based access control for sub-agent data isolation
 * - Operation-level permissions (add, update, delete) per path
 * - Automatic detection of suspicious payload changes
 * - Human-readable diff generation for audit trails
 * - Configurable warning thresholds for content changes
 * 
 * ## Path Syntax:
 * - Exact paths: "customer.name"
 * - Wildcards: "customer.*" (all properties under customer)
 * - Array indices: "items[0].price" or "items[*].price"
 * - Deep wildcards: "**.id" (all id fields at any depth)
 * - Root wildcard: "*" (entire payload)
 * - Operation control: "path:add,update" (specific operations only)
 * 
 * ## Change Detection Rules:
 * - Content truncation: Warns when text reduced by >70%
 * - Key removal: Flags when non-empty keys are removed
 * - Type changes: Detects object→primitive conversions
 * - Pattern anomalies: Identifies placeholder replacements
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 3.0.0
 */

import { LogError, LogStatus } from '@memberjunction/core';
import { AgentPayloadChangeRequest } from '@memberjunction/ai-core-plus';
import { DeepDiffer, DeepDiffResult } from '@memberjunction/global';
import _ from 'lodash';
import { PayloadChangeAnalyzer, PayloadAnalysisResult, PayloadWarning } from './PayloadChangeAnalyzer';
import { 
    PayloadOperation, 
    parsePathWithOperations, 
    parsePathsWithOperations,
    isOperationAllowed 
} from './types/payload-operations';


/**
 * Result of applying a payload change request with enhanced tracking
 */
/**
 * Summary of payload change operations for audit trail storage
 */
export interface PayloadChangeResultSummary {
    /** Operation counts */
    applied: {
        additions: number;
        updates: number;
        deletions: number;
    };
    /** Warning messages */
    warnings: string[];
    /** Whether feedback is required */
    requiresFeedback: boolean;
    /** Timestamp of the operation */
    timestamp: Date | string;
    /** Payload validation tracking */
    payloadValidation?: {
        selfWriteViolations?: {
            deniedOperations: Array<{
                path: string;
                operation: 'add' | 'update' | 'delete';
                from?: unknown;
                to?: unknown;
                reason: string;
                timestamp: string;
            }>;
            timestamp: string;
        };
        upstreamMergeViolations?: {
            subAgentName: string;
            attemptedOperations: Array<{
                path: string;
                operation: 'add' | 'update' | 'delete';
                from?: unknown;
                to?: unknown;
                reason: string;
                timestamp: string;
            }>;
            authorizedPaths: string[];
            timestamp: string;
        };
    };
    /** Analysis summary */
    analysis?: {
        totalWarnings: number;
        warningsByType: Record<string, number>;
        suspiciousChanges: number;
        criticalWarnings: Array<{
            type: string;
            severity: string;
            path: string;
            message: string;
        }>;
    };
    /** Diff summary */
    diffSummary?: {
        added: number;
        removed: number;
        modified: number;
        totalChanges: number;
    };
}

export interface PayloadManagerResult<P = any> {
    /** The resulting payload after changes */
    result: P;
    /** Counts of applied operations */
    applied: {
        additions: number;
        updates: number;
        deletions: number;
    };
    /** Basic warnings from the change process */
    warnings: string[];
    /** Detailed analysis of suspicious changes */
    analysis?: PayloadAnalysisResult;
    /** Diff between original and result payload */
    diff?: DeepDiffResult;
    /** Whether feedback is required from the agent */
    requiresFeedback?: boolean;
    /** Timestamp of the operation */
    timestamp: Date;
    /** Blocked operations with detailed tracking */
    blockedOperations?: Array<{
        path: string;
        operation: 'add' | 'update' | 'delete';
        from?: unknown;
        to?: unknown;
        reason: string;
        timestamp: string;
    }>;
}

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
    public extractDownstreamPayload<P = any>(subAgentName: string, fullPayload: P | null | undefined, downstreamPaths: string[]): Partial<P> | null {
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
    public mergeUpstreamPayload<P = any>(
        subAgentName: string,
        parentPayload: P | null | undefined, 
        subAgentPayload: Partial<P> | null | undefined, 
        upstreamPaths: string[],
        verbose?: boolean
    ): PayloadManagerResult<P> {
        const blockedOperations: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: unknown;
            to?: unknown;
            reason: string;
            timestamp: string;
        }> = [];

        if (!parentPayload && !subAgentPayload) {
            return {
                result: null,
                applied: { additions: 0, updates: 0, deletions: 0 },
                warnings: [],
                timestamp: new Date(),
                blockedOperations
            };
        }
        
        if (!subAgentPayload) {
            return {
                result: parentPayload,
                applied: { additions: 0, updates: 0, deletions: 0 },
                warnings: [],
                timestamp: new Date(),
                blockedOperations
            };
        }
        
        if (!upstreamPaths || upstreamPaths.length === 0) {
            if (verbose) {
                LogStatus('Warning: No upstream paths specified - sub-agent changes will be ignored');
            }
            return {
                result: parentPayload,
                applied: { additions: 0, updates: 0, deletions: 0 },
                warnings: ['No upstream paths specified - sub-agent changes ignored'],
                timestamp: new Date(),
                blockedOperations
            };
        }
        
        // Start with a deep clone of the parent payload
        const result = _.cloneDeep(parentPayload || {});
        const counts = { additions: 0, updates: 0, deletions: 0 };
        
        // Handle wildcard - merge everything
        if (upstreamPaths.includes('*')) {
            const merged = this.deepMerge(result, subAgentPayload);
            // Count changes
            this.countChanges(parentPayload, merged, counts);
            return {
                result: merged as P,
                applied: counts,
                warnings: [],
                timestamp: new Date(),
                blockedOperations
            };
        }
        
        // Check each path in the sub-agent payload
        const mergeResult = this.mergeAllowedPaths(result, subAgentPayload, upstreamPaths, subAgentName, verbose);
        
        return {
            result: result as P,
            applied: mergeResult.counts,
            warnings: mergeResult.warnings,
            timestamp: new Date(),
            blockedOperations: mergeResult.blockedOperations
        };
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
    private mergeAllowedPaths<P = any>(
        result: P,
        subAgentPayload: Partial<P>,
        upstreamPaths: string[],
        subAgentName: string,
        verbose?: boolean
    ): {
        counts: { additions: number; updates: number; deletions: number };
        warnings: string[];
        blockedOperations: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: any;
            to?: any;
            reason: string;
            timestamp: string;
        }>;
    } {
        // Get all paths from sub-agent payload
        const subAgentPaths = this.getAllPaths(subAgentPayload);
        
        // Track unauthorized changes for consolidated warning
        const unauthorizedChanges: Array<{
            path: string;
            from: any;
            to: any;
            operation: string;
            reason: string;
        }> = [];
        
        // Check each path against allowed patterns
        for (const actualPath of subAgentPaths) {
            const subAgentValue = _.get(subAgentPayload, actualPath);
            const originalValue = _.get(result, actualPath);
            
            // Determine the operation type
            const operation: PayloadOperation = originalValue === undefined ? 'add' : 'update';
            
            // Check if the operation is allowed for this path
            const isOperationAllowed = this.isOperationAllowedForPath(actualPath, operation, upstreamPaths);
            
            if (isOperationAllowed) {
                _.set(result as any, actualPath, _.cloneDeep(subAgentValue));
            } else {
                // Only track if the sub-agent is trying to change the value
                if (!_.isEqual(subAgentValue, originalValue)) {
                    // Check if any operation is allowed on this path
                    const isPathAllowed = this.isPathAllowed(actualPath, upstreamPaths);
                    
                    unauthorizedChanges.push({
                        path: actualPath,
                        from: originalValue,
                        to: subAgentValue,
                        operation: operation,
                        reason: isPathAllowed ? `operation '${operation}' not allowed` : 'path not allowed'
                    });
                }
            }
        }
        
        // Also check for deletions (paths in result but not in subAgentPayload)
        const resultPaths = this.getAllPaths(result);
        for (const resultPath of resultPaths) {
            const resultValue = _.get(result, resultPath);
            const subAgentValue = _.get(subAgentPayload, resultPath);
            
            // If the path exists in result but not in subAgentPayload, it's a deletion attempt
            if (resultValue !== undefined && subAgentValue === undefined) {
                // Check if delete operation is allowed
                const isDeleteAllowed = this.isOperationAllowedForPath(resultPath, 'delete', upstreamPaths);
                
                if (isDeleteAllowed) {
                    // Delete the path from result
                    _.unset(result, resultPath);
                } else {
                    const isPathAllowed = this.isPathAllowed(resultPath, upstreamPaths);
                    unauthorizedChanges.push({
                        path: resultPath,
                        from: resultValue,
                        to: undefined,
                        operation: 'delete',
                        reason: isPathAllowed ? `operation 'delete' not allowed` : 'path not allowed'
                    });
                }
            }
        }
        
        // Clean up any empty objects that resulted from property deletions in arrays
        this.cleanupEmptyArrayElements(result);
        
        // Initialize counts
        const counts = { additions: 0, updates: 0, deletions: 0 };
        const warnings: string[] = [];
        const blockedOperations: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: any;
            to?: any;
            reason: string;
            timestamp: string;
        }> = [];

        // Count successful operations
        const parentPayload = arguments[2]; // The original parent payload parameter
        for (const path of subAgentPaths) {
            const mergedValue = _.get(result, path);
            const subAgentValue = _.get(subAgentPayload, path);
            if (_.isEqual(mergedValue, subAgentValue)) {
                // This change was allowed and applied
                const originalParentValue = _.get(parentPayload || {}, path);
                if (originalParentValue === undefined) {
                    counts.additions++;
                } else if (!_.isEqual(originalParentValue, subAgentValue)) {
                    counts.updates++;
                }
            }
        }

        // Output consolidated warning if there were unauthorized changes
        if (unauthorizedChanges.length > 0) {
            // Convert to blocked operations format
            const now = new Date().toISOString();
            for (const change of unauthorizedChanges) {
                blockedOperations.push({
                    path: change.path,
                    operation: change.operation as 'add' | 'update' | 'delete',
                    from: change.from,
                    to: change.to,
                    reason: change.reason,
                    timestamp: now
                });
            }

            warnings.push(`Sub-agent "${subAgentName}" attempted ${unauthorizedChanges.length} unauthorized operation(s)`);

            // Only log to console in verbose mode
            if (verbose) {
                const groupedChanges = this.groupUnauthorizedChanges(unauthorizedChanges);
                let warningMessage = `\n⚠️  Sub-agent "${subAgentName}" attempted ${unauthorizedChanges.length} unauthorized operation${unauthorizedChanges.length > 1 ? 's' : ''}:\n`;
                
                for (const [category, changes] of Object.entries(groupedChanges)) {
                    warningMessage += `\n  📁 ${category}:\n`;
                    for (const change of changes) {
                        const fromStr = this.formatValue(change.from);
                        const toStr = this.formatValue(change.to);
                        warningMessage += `     • ${change.path} [${change.operation}]: ${fromStr} → ${toStr} (${change.reason})\n`;
                    }
                }
                
                warningMessage += `\n  ℹ️  Authorized paths: ${upstreamPaths.join(', ')}\n`;
                LogStatus(warningMessage);
            }
        }

        return { counts, warnings, blockedOperations };
    }
    
    /**
     * Count changes between two payloads for tracking operations
     * 
     * @private
     */
    private countChanges(original: any, modified: any, counts: { additions: number; updates: number; deletions: number }): void {
        const originalPaths = this.getAllPaths(original || {});
        const modifiedPaths = this.getAllPaths(modified || {});
        
        // Check for additions and updates
        for (const path of modifiedPaths) {
            const originalValue = _.get(original, path);
            const modifiedValue = _.get(modified, path);
            
            if (originalValue === undefined) {
                counts.additions++;
            } else if (!_.isEqual(originalValue, modifiedValue)) {
                counts.updates++;
            }
        }
        
        // Check for deletions
        for (const path of originalPaths) {
            if (!modifiedPaths.includes(path)) {
                counts.deletions++;
            }
        }
    }
    
    /**
     * Groups unauthorized changes by their root path for cleaner display.
     * 
     * @private
     */
    private groupUnauthorizedChanges(changes: Array<{path: string; from: any; to: any; operation?: string; reason?: string}>): Record<string, Array<{path: string; from: any; to: any; operation?: string; reason?: string}>> {
        const grouped: Record<string, Array<{path: string; from: any; to: any; operation?: string; reason?: string}>> = {};
        
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
     * Recursively cleans up empty objects from arrays after merge operations.
     * This is necessary because property-level deletions can leave empty object shells in arrays.
     * 
     * @private
     */
    private cleanupEmptyArrayElements(obj: any): void {
        if (!obj || typeof obj !== 'object') {
            return;
        }

        if (Array.isArray(obj)) {
            // Filter out empty objects from the array
            // We need to modify the array in place to maintain references
            let writeIndex = 0;
            for (let readIndex = 0; readIndex < obj.length; readIndex++) {
                const element = obj[readIndex];
                
                // Keep the element if it's not an empty object
                // An empty object is one that is an object with no own properties
                const shouldKeep = !(
                    element !== null && 
                    typeof element === 'object' && 
                    !Array.isArray(element) && 
                    Object.keys(element).length === 0
                );
                
                if (shouldKeep) {
                    // First recurse into the element to clean up any nested arrays
                    this.cleanupEmptyArrayElements(element);
                    
                    // Then keep the element in the array
                    if (writeIndex !== readIndex) {
                        obj[writeIndex] = element;
                    }
                    writeIndex++;
                }
            }
            
            // Truncate the array to remove the empty slots at the end
            obj.length = writeIndex;
        } else {
            // For objects, recursively clean up any nested arrays
            for (const key of Object.keys(obj)) {
                this.cleanupEmptyArrayElements(obj[key]);
            }
        }
    }

    /**
     * Checks if a path matches any of the allowed patterns.
     * 
     * @private
     */
    private isPathAllowed(actualPath: string, allowedPatterns: string[]): boolean {
        const normalizedPath = actualPath.replace(/\[(\d+)\]/g, '.$1');
        
        for (const pattern of allowedPatterns) {
            // Parse the pattern to extract path and operations
            const parsedPattern = parsePathWithOperations(pattern);
            const pathPattern = parsedPattern.path;
            
            if (pathPattern === '*') return true;
            
            if (pathPattern.includes('**')) {
                // Handle deep wildcards
                const regex = pathPattern
                    .replace(/\./g, '\\.')
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^.]+');
                if (new RegExp(`^${regex}$`).test(normalizedPath)) {
                    return true;
                }
            } else {
                // Handle regular patterns
                // Check if pattern ends with .* which means "everything under this path"
                if (pathPattern.endsWith('.*')) {
                    const basePath = pathPattern.slice(0, -2); // Remove the .*
                    const escapedBase = basePath.replace(/\./g, '\\.');
                    // Match the base path followed by a dot and anything after
                    const regex = `^${escapedBase}(\\..*)?$`;
                    if (new RegExp(regex).test(normalizedPath)) {
                        return true;
                    }
                } else {
                    // Handle other wildcard patterns
                    const regex = pathPattern
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
     * Checks if a specific operation is allowed for a path.
     * 
     * @param actualPath The actual path to check
     * @param operation The operation to check
     * @param allowedPatterns Array of allowed patterns with optional operations
     * @returns True if the operation is allowed on this path
     */
    private isOperationAllowedForPath(
        actualPath: string, 
        operation: PayloadOperation, 
        allowedPatterns: string[]
    ): boolean {
        const normalizedPath = actualPath.replace(/\[(\d+)\]/g, '.$1');
        const parsedPatterns = parsePathsWithOperations(allowedPatterns);
        
        for (const parsedPattern of parsedPatterns) {
            const pathPattern = parsedPattern.path;
            let pathMatches = false;
            
            if (pathPattern === '*') {
                pathMatches = true;
            } else if (pathPattern.includes('**')) {
                // Handle deep wildcards
                const regex = pathPattern
                    .replace(/\./g, '\\.')
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^.]+');
                pathMatches = new RegExp(`^${regex}$`).test(normalizedPath);
            } else {
                // Handle regular patterns
                if (pathPattern.endsWith('.*')) {
                    const basePath = pathPattern.slice(0, -2);
                    const escapedBase = basePath.replace(/\./g, '\\.');
                    const regex = `^${escapedBase}(\\..*)?$`;
                    pathMatches = new RegExp(regex).test(normalizedPath);
                } else {
                    const regex = pathPattern
                        .replace(/\./g, '\\.')
                        .replace(/\*/g, '[^.]+')
                        .replace(/\[(\*|\d+)\]/g, '\\[(\\*|\\d+)\\]');
                    pathMatches = new RegExp(`^${regex}$`).test(normalizedPath);
                }
            }
            
            // If path matches, check if operation is allowed
            if (pathMatches && isOperationAllowed(parsedPattern, operation)) {
                return true;
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
     * This method preserves existing nested properties in the destination while
     * adding or updating properties from the source. It handles nested objects
     * recursively, ensuring that partial updates don't wipe out existing data.
     *
     * @example
     * ```typescript
     * const dest = { decision: { Y: 4, Z: 2 } };
     * const src = { decision: { x: "string" } };
     * const result = deepMerge(dest, src);
     * // Returns: { decision: { x: "string", Y: 4, Z: 2 } }
     * ```
     *
     * @param destination The target object to merge into
     * @param source The source object to merge from
     * @returns A new merged object with all properties from both objects
     *
     * @public
     */
    public deepMerge<T = any>(destination: T | null | undefined, source: Partial<T> | null | undefined): T {
        if (!source) return destination as T;
        if (!destination) return _.cloneDeep(source) as T;
        
        const result = _.cloneDeep(destination);
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (_.isObject(source[key]) && !_.isArray(source[key]) && _.isObject(result[key]) && !_.isArray(result[key])) {
                    // Both are objects - recursive merge
                    result[key] = this.deepMerge(result[key], source[key]) as T[Extract<keyof T, string>];
                } else {
                    // Otherwise, source overwrites destination
                    result[key] = _.cloneDeep(source[key]) as T[Extract<keyof T, string>];
                }
            }
        }
        
        return result;
    }

    /**
     * Applies an AgentPayloadChangeRequest to a payload
     * 
     * @param originalPayload The original payload to apply changes to
     * @param changeRequest The change request from the AI agent
     * @param options Configuration options for the operation
     * @returns Result object with the modified payload, operation counts, and any warnings
     */
    public applyAgentChangeRequest<P = any>(
        originalPayload: P,
        changeRequest: AgentPayloadChangeRequest<any>,
        options?: {
            validateChanges?: boolean;
            logChanges?: boolean;
            agentName?: string;
            analyzeChanges?: boolean;
            generateDiff?: boolean;
            allowedPaths?: string[];
            verbose?: boolean;
        }
    ): PayloadManagerResult<P> {
        const warnings: string[] = [];
        const blockedOperations: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: any;
            to?: any;
            reason: string;
            timestamp: string;
        }> = [];
        const result = _.cloneDeep(originalPayload) || {} as P;
        const counts = { additions: 0, updates: 0, deletions: 0 };
        
        // Process all changes recursively
        this.processChangeRequest(
            result,
            originalPayload,
            changeRequest,
            [],
            counts,
            warnings,
            options?.allowedPaths,
            blockedOperations
        );
        
        // Log if requested and in verbose mode
        if (options?.logChanges && options?.verbose) {
            this.logChangesSummary(counts, changeRequest.reasoning, options.agentName);
        }
        
        // Analyze changes if requested
        let analysis: PayloadAnalysisResult | undefined;
        if (options?.analyzeChanges !== false) { // Default to true
            const analyzer = new PayloadChangeAnalyzer();
            analysis = analyzer.analyzeChangeRequest(originalPayload, changeRequest, result);
            
            // Add analysis warnings to the main warnings array
            if (analysis.warnings.length > 0) {
                warnings.push(...analysis.warnings.map(w => `[${w.severity}] ${w.message}`));
            }
        }
        
        // Generate diff if requested
        let diff: DeepDiffResult | undefined;
        if (options?.generateDiff !== false) { // Default to true
            const differ = new DeepDiffer();
            diff = differ.diff(originalPayload, result);
        }
        
        return {
            result,
            applied: counts,
            warnings,
            analysis,
            diff,
            requiresFeedback: analysis?.requiresFeedback || false,
            timestamp: new Date(),
            blockedOperations
        };
    }

    /**
     * Process a change request recursively through the payload structure
     */
    private processChangeRequest(
        target: any,
        original: any,
        changeRequest: AgentPayloadChangeRequest<any>,
        path: string[],
        counts: { additions: number; updates: number; deletions: number; },
        warnings: string[],
        allowedPaths?: string[],
        blockedOperations?: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: any;
            to?: any;
            reason: string;
            timestamp: string;
        }>
    ): void {
        if (Array.isArray(target)) {
            this.processArrayChanges(target, original, changeRequest, path, counts, warnings, allowedPaths, blockedOperations);
        } else if (typeof target === 'object' && target !== null) {
            this.processObjectChanges(target, original, changeRequest, path, counts, warnings, allowedPaths, blockedOperations);
        }
    }

    /**
     * Process changes for array elements with support for deep merging object elements.
     * 
     * For arrays containing objects, updates are merged deeply rather than replacing
     * the entire element. This preserves existing properties while updating only the
     * specified fields.
     * 
     * Example:
     * Original: [{id: 1, name: "Test", value: 100}]
     * Update: [{value: 200}]
     * Result: [{id: 1, name: "Test", value: 200}]
     * 
     * Arrays of primitives still use replacement behavior for backwards compatibility.
     */
    private processArrayChanges(
        target: any[],
        original: any[],
        changeRequest: AgentPayloadChangeRequest<any>,
        path: string[],
        counts: { additions: number; updates: number; deletions: number; },
        warnings: string[],
        allowedPaths?: string[],
        blockedOperations?: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: unknown;
            to?: unknown;
            reason: string;
            timestamp: string;
        }>
    ): void {
        const pathStr = path.join('.');
        
        // Get change arrays for this path
        const removeArray = pathStr ? _.get(changeRequest.removeElements, pathStr) : changeRequest.removeElements;
        const updateArray = pathStr ? _.get(changeRequest.updateElements, pathStr) : changeRequest.updateElements;
        const newArray = pathStr ? _.get(changeRequest.newElements, pathStr) : changeRequest.newElements;
        
        // Build a new array with all changes applied
        const newTargetArray: unknown[] = [];
        
        // Process existing elements
        for (let i = 0; i < target.length; i++) {
            if (removeArray && removeArray[i] === '__DELETE__') {
                counts.deletions++;
                continue; // Skip deleted items
            }
            
            // Check for __DELETE__ in updateArray as well
            if (updateArray && updateArray[i] === '__DELETE__') {
                counts.deletions++;
                continue; // Skip deleted items
            }
            
            // Use updated value if provided, otherwise keep original
            let elementToAdd = target[i];
            
            if (updateArray && this.isSignificantValue(updateArray[i])) {
                // Check if both the update and current element are objects for deep merge
                if (typeof updateArray[i] === 'object' && typeof elementToAdd === 'object' && 
                    !Array.isArray(updateArray[i]) && !Array.isArray(elementToAdd) &&
                    updateArray[i] !== null && elementToAdd !== null) {
                    // Deep merge for object elements - preserve existing properties
                    elementToAdd = _.cloneDeep(elementToAdd);
                    // Create a synthetic change request with just this update
                    // The updateElements should be the object itself at the root level
                    const elementChangeRequest: AgentPayloadChangeRequest<any> = {
                        updateElements: updateArray[i]
                    };
                    this.processChangeRequest(
                        elementToAdd,
                        original ? original[i] : undefined,
                        elementChangeRequest,
                        [], // Empty path since updateArray[i] is already at the element level
                        counts,
                        warnings,
                        allowedPaths,
                        blockedOperations
                    );
                } else {
                    // For primitives or arrays, replace entirely (existing behavior)
                    elementToAdd = updateArray[i];
                    counts.updates++;
                }
            } else if (typeof elementToAdd === 'object' && elementToAdd !== null) {
                // For objects/arrays that aren't being replaced, process nested changes
                // IMPORTANT: Don't pass newElements for existing array elements -
                // newElements items should be appended to the array, not merged into existing items
                elementToAdd = _.cloneDeep(elementToAdd);
                const changeRequestWithoutNew: AgentPayloadChangeRequest<any> = {
                    updateElements: changeRequest.updateElements,
                    removeElements: changeRequest.removeElements,
                    replaceElements: changeRequest.replaceElements,
                    reasoning: changeRequest.reasoning
                    // Intentionally omit newElements
                };
                this.processChangeRequest(
                    elementToAdd,
                    original ? original[i] : undefined,
                    changeRequestWithoutNew,
                    [...path, i.toString()],
                    counts,
                    warnings,
                    allowedPaths,
                    blockedOperations
                );
            }
            
            newTargetArray.push(elementToAdd);
        }

        // Handle items in updateArray that are beyond target.length
        // These should be treated as additions (AI put new items in updateElements)
        if (updateArray && Array.isArray(updateArray)) {
            for (let i = target.length; i < updateArray.length; i++) {
                if (this.isSignificantValue(updateArray[i])) {
                    newTargetArray.push(updateArray[i]);
                    counts.additions++;
                }
            }
        }

        // Add new elements
        if (newArray && Array.isArray(newArray)) {
            for (const item of newArray) {
                if (this.isSignificantValue(item)) {
                    newTargetArray.push(item);
                    counts.additions++;
                }
            }
        }

        // Replace array contents in-place
        target.length = 0;
        target.push(...newTargetArray);
    }


    /**
     * Process changes for object properties
     */
    private processObjectChanges(
        target: any,
        original: any,
        changeRequest: AgentPayloadChangeRequest<any>,
        path: string[],
        counts: { additions: number; updates: number; deletions: number; },
        warnings: string[],
        allowedPaths?: string[],
        blockedOperations?: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: unknown;
            to?: unknown;
            reason: string;
            timestamp: string;
        }>
    ): void {
        // Get all unique keys from change request
        const changeKeys = this.getChangeKeys(changeRequest, path);
        
        // Process changes for each key
        for (const key of changeKeys) {
            this.processKeyChange(
                target,
                original,
                changeRequest,
                [...path, key],
                key,
                counts,
                warnings,
                allowedPaths,
                blockedOperations
            );
        }
        
        // After processing all changes, check for "_DELETE_" values in updateElements
        // This allows deletion within update operations at any depth
        const pathStr = path.join('.');
        const updateObj = pathStr ? _.get(changeRequest.updateElements, pathStr) : changeRequest.updateElements;
        
        if (updateObj && typeof updateObj === 'object' && !Array.isArray(updateObj)) {
            const keysToDelete: string[] = [];
            
            for (const [key, value] of Object.entries(updateObj)) {
                if (value === '__DELETE__' && key in target) {
                    keysToDelete.push(key);
                }
            }
            
            // Delete the keys after iteration to avoid modification during iteration
            for (const key of keysToDelete) {
                delete target[key];
                counts.deletions++;
            }
        }
        
        // Recurse into all existing keys for nested changes
        for (const key of Object.keys(target)) {
            if (!changeKeys.has(key) && typeof target[key] === 'object' && target[key] !== null) {
                this.processChangeRequest(
                    target[key],
                    original ? original[key] : undefined,
                    changeRequest,
                    [...path, key],
                    counts,
                    warnings,
                    allowedPaths,
                    blockedOperations
                );
            }
        }
    }

    /**
     * Process a single key change (add, update, or delete)
     */
    private processKeyChange<P = any>(
        target: any,
        original: any,
        changeRequest: AgentPayloadChangeRequest<any>,
        keyPath: string[],
        key: string,
        counts: { additions: number; updates: number; deletions: number; },
        warnings: string[],
        allowedPaths?: string[],
        blockedOperations?: Array<{
            path: string;
            operation: 'add' | 'update' | 'delete';
            from?: unknown;
            to?: unknown;
            reason: string;
            timestamp: string;
        }>
    ): void {
        const pathStr = keyPath.join('.');
        
        // Check for replacement first (complete replacement - remove then add)
        const replaceValue = _.get(changeRequest.replaceElements, pathStr);
        if (replaceValue !== undefined) {
            // Check if appropriate operation is allowed (delete if exists, add if not)
            const operation = key in target ? 'update' : 'add';
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, operation, allowedPaths)) {
                const warning = `Operation denied: Cannot replace '${pathStr}' - operation '${operation}' not allowed`;
                warnings.push(warning);
                if (blockedOperations) {
                    blockedOperations.push({
                        path: pathStr,
                        operation: operation,
                        from: target[key],
                        to: replaceValue,
                        reason: `operation '${operation}' not allowed`,
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }
            
            // Count the operations
            if (key in target) {
                counts.deletions++;
                counts.additions++;
            } else {
                counts.additions++;
            }
            
            // Replace the value
            target[key] = replaceValue;
            return; // Skip other operations since this is a complete replacement
        }
        
        // Check for deletion
        const removeValue = _.get(changeRequest.removeElements, pathStr);
        if (removeValue === '__DELETE__') {
            // Check if delete operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'delete', allowedPaths)) {
                const warning = `Operation denied: Cannot delete '${pathStr}' - operation 'delete' not allowed`;
                warnings.push(warning);
                if (blockedOperations) {
                    blockedOperations.push({
                        path: pathStr,
                        operation: 'delete',
                        from: target[key],
                        to: undefined,
                        reason: "operation 'delete' not allowed",
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }
            delete target[key];
            counts.deletions++;
            // Don't return here - check if there's also a new value to add
            // This handles the case where AI wants to replace by removing then adding
        }
        
        // Check for addition first
        const newValue = _.get(changeRequest.newElements, pathStr);
        if (newValue !== undefined && !(key in target)) {
            // Check if add operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'add', allowedPaths)) {
                const warning = `Operation denied: Cannot add '${pathStr}' - operation 'add' not allowed`;
                warnings.push(warning);
                if (blockedOperations) {
                    blockedOperations.push({
                        path: pathStr,
                        operation: 'add',
                        from: undefined,
                        to: newValue,
                        reason: "operation 'add' not allowed",
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }
            target[key] = newValue;
            counts.additions++;
            return;
        }
        
        // Check for update
        const updateValue = _.get(changeRequest.updateElements, pathStr);

        // Be forgiving: if AI put an update in newElements by mistake, treat it as an update
        // EXCEPTIONS where we should NOT treat newElements as updateElements:
        // 1. Both are arrays - let processArrayChanges handle append semantics
        // 2. Both are objects - recurse to find nested arrays that need append semantics
        const bothAreArrays = Array.isArray(newValue) && Array.isArray(target[key]);
        const bothAreObjects = newValue !== undefined &&
                               typeof newValue === 'object' && !Array.isArray(newValue) &&
                               key in target &&
                               typeof target[key] === 'object' && !Array.isArray(target[key]) &&
                               target[key] !== null;
        const shouldTreatNewAsUpdate = newValue !== undefined &&
                                       key in target &&
                                       !bothAreArrays &&
                                       !bothAreObjects;
        const effectiveUpdateValue = (updateValue !== undefined) ? updateValue :
                                    shouldTreatNewAsUpdate ? newValue :
                                    undefined;
        
        if (effectiveUpdateValue !== undefined && key in target) {
            // Check if update operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'update', allowedPaths)) {
                const warning = `Operation denied: Cannot update '${pathStr}' - operation 'update' not allowed`;
                warnings.push(warning);
                if (blockedOperations) {
                    blockedOperations.push({
                        path: pathStr,
                        operation: 'update',
                        from: target[key],
                        to: effectiveUpdateValue,
                        reason: "operation 'update' not allowed",
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }
            
            // If both values are objects or arrays, we need to recursively process the update
            if (typeof effectiveUpdateValue === 'object' && effectiveUpdateValue !== null &&
                typeof target[key] === 'object' && target[key] !== null) {
                // Recursively process nested updates for both objects and arrays
                this.processChangeRequest(
                    target[key],
                    original ? original[key] : undefined,
                    changeRequest,
                    keyPath,
                    counts,
                    warnings,
                    allowedPaths,
                    blockedOperations
                );
            } else {
                // For primitives or type mismatches, replace the value
                target[key] = effectiveUpdateValue;
                counts.updates++;
            }
            
            // Add a soft warning if we auto-corrected the placement (but not for arrays which use append semantics)
            if (updateValue === undefined && newValue !== undefined && shouldTreatNewAsUpdate) {
                warnings.push(`Auto-corrected: '${key}' was in newElements but already exists (treated as update)`);
            }
        } else if (updateValue !== undefined && !(key in target)) {
            // Be forgiving: if AI put an addition in updateElements by mistake, treat it as an addition
            // Check if add operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'add', allowedPaths)) {
                const warning = `Operation denied: Cannot add '${pathStr}' - operation 'add' not allowed`;
                warnings.push(warning);
                if (blockedOperations) {
                    blockedOperations.push({
                        path: pathStr,
                        operation: 'add',
                        from: undefined,
                        to: updateValue,
                        reason: "operation 'add' not allowed",
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }
            target[key] = updateValue;
            counts.additions++;
            warnings.push(`Auto-corrected: '${key}' was in updateElements but doesn't exist (treated as addition)`);
        } else if (removeValue !== undefined && removeValue !== '__DELETE__' &&
                   typeof target[key] === 'object' && target[key] !== null) {
            // Handle case where removeValue exists but isn't a direct deletion
            // This happens with arrays where removeValue is like [{}, '_DELETE_', {}]
            // We need to recurse to process the array removals
            this.processChangeRequest(
                target[key],
                original ? original[key] : undefined,
                changeRequest,
                keyPath,
                counts,
                warnings,
                allowedPaths,
                blockedOperations
            );
        } else if (newValue !== undefined && Array.isArray(newValue) && Array.isArray(target[key])) {
            // Handle array append: newElements has an array for an existing array key
            // Recurse to let processArrayChanges handle the append
            this.processChangeRequest(
                target[key],
                original ? original[key] : undefined,
                changeRequest,
                keyPath,
                counts,
                warnings,
                allowedPaths,
                blockedOperations
            );
        } else if (bothAreObjects) {
            // Handle object in newElements for existing object key
            // Recurse to find nested arrays that need append semantics
            this.processChangeRequest(
                target[key],
                original ? original[key] : undefined,
                changeRequest,
                keyPath,
                counts,
                warnings,
                allowedPaths,
                blockedOperations
            );
        }
    }

    /**
     * Get all unique keys from change request for a given path
     */
    private getChangeKeys<P = any>(changeRequest: AgentPayloadChangeRequest<P>, path: string[]): Set<string> {
        const keys = new Set<string>();
        const pathStr = path.join('.');
        
        const addKeysFromObject = (obj: unknown) => {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                Object.keys(obj).forEach(k => keys.add(k));
            }
        };
        
        const removeObj = pathStr ? _.get(changeRequest.removeElements, pathStr) : changeRequest.removeElements;
        const updateObj = pathStr ? _.get(changeRequest.updateElements, pathStr) : changeRequest.updateElements;
        const newObj = pathStr ? _.get(changeRequest.newElements, pathStr) : changeRequest.newElements;
        const replaceObj = pathStr ? _.get(changeRequest.replaceElements, pathStr) : changeRequest.replaceElements;
        
        addKeysFromObject(removeObj);
        addKeysFromObject(updateObj);
        addKeysFromObject(newObj);
        addKeysFromObject(replaceObj);
        
        return keys;
    }

    /**
     * Check if a value is significant (not empty object or undefined)
     */
    private isSignificantValue(value: unknown): boolean {
        if (value === undefined) return false;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return Object.keys(value).length > 0;
        }
        return true;
    }


    /**
     * Log a summary of changes applied
     */
    private logChangesSummary(
        counts: { additions: number; updates: number; deletions: number; },
        reasoning: string | undefined,
        agentName: string | undefined
    ): void {
        const agent = agentName ? ` by ${agentName}` : '';
        const reason = reasoning ? ` | Reason: ${reasoning}` : '';
        LogStatus(
            `Payload changes applied${agent}: ` +
            `+${counts.additions} additions, ~${counts.updates} updates, -${counts.deletions} deletions${reason}`
        );
    }

    /**
     * Apply a change request to a sub-agent payload with upstream guardrails
     * 
     * This method first applies the change request, then enforces upstream path restrictions
     * to ensure the sub-agent only modifies allowed paths.
     */
    public applySubAgentChangeRequest<P = any>(
        parentPayload: P,
        changeRequest: AgentPayloadChangeRequest<P>,
        upstreamPaths: string[],
        subAgentName: string
    ): PayloadManagerResult<P> & { blocked: number } {
        // First apply the full change request
        const changeResult = this.applyAgentChangeRequest(
            parentPayload,
            changeRequest,
            { validateChanges: true }
        );
        
        // Then apply upstream guardrails
        const guardedResult = this.mergeUpstreamPayload(
            subAgentName,
            parentPayload,
            changeResult.result,
            upstreamPaths
        );
        
        // Count blocked changes (this is a simplified count)
        const blocked = this.countBlockedChanges(parentPayload, changeResult.result, guardedResult.result);
        
        return {
            ...changeResult,
            result: guardedResult.result,
            blocked,
            blockedOperations: guardedResult.blockedOperations
        };
    }

    /**
     * Count how many changes were blocked by guardrails
     */
    private countBlockedChanges<P = any>(_original: P, intended: P, actual: P): number {
        // This is a simplified implementation
        // A full implementation would do deep comparison
        const intendedStr = JSON.stringify(intended);
        const actualStr = JSON.stringify(actual);
        return intendedStr === actualStr ? 0 : 1;
    }

    /**
     * Applies a payload scope transformation to extract only the scoped portion.
     * 
     * @param payload The full payload to scope
     * @param scopePath The scope path (e.g., "/functionalRequirements" or "/PropA/SubProp1")
     * @returns The scoped portion of the payload
     * 
     * @example
     * ```typescript
     * const payload = { functionalRequirements: { feature1: "..." }, technicalDesign: { ... } };
     * const scoped = applyPayloadScope(payload, "/functionalRequirements");
     * // Returns: { feature1: "..." }
     * ```
     */
    public applyPayloadScope<P = any>(payload: P, scopePath: string): any | null {
        if (!payload || !scopePath) return payload;
        
        // Remove leading slash and split path
        const pathParts = scopePath.startsWith('/') 
            ? scopePath.slice(1).split('/') 
            : scopePath.split('/');
        
        // Navigate to the scoped portion
        let current: unknown = payload;
        for (const part of pathParts) {
            if (current && typeof current === 'object' && current !== null && part in current) {
                current = (current)[part];
            } else {
                // Path doesn't exist, return null
                return null;
            }
        }
        
        // Return a deep clone of the scoped portion
        return _.cloneDeep(current);
    }

    /**
     * Reverses a payload scope transformation by wrapping the scoped content back into the full structure.
     * 
     * @param scopedPayload The scoped payload to wrap
     * @param scopePath The scope path used for extraction
     * @returns A full payload structure with the scoped content at the correct path
     * 
     * @example
     * ```typescript
     * const scoped = { feature1: "updated" };
     * const full = reversePayloadScope(scoped, "/functionalRequirements");
     * // Returns: { functionalRequirements: { feature1: "updated" } }
     * ```
     */
    public reversePayloadScope<P = any>(scopedPayload: unknown, scopePath: string): P {
        if (!scopePath) return scopedPayload as P;
        
        // Remove leading slash and split path
        const pathParts = scopePath.startsWith('/') 
            ? scopePath.slice(1).split('/') 
            : scopePath.split('/');
        
        // Build the structure from the inside out
        let result = _.cloneDeep(scopedPayload);
        for (let i = pathParts.length - 1; i >= 0; i--) {
            result = { [pathParts[i]]: result };
        }
        
        return result as P;
    }

    /**
     * Transforms paths in a change request to account for payload scoping.
     * Prepends the scope path to all paths in the change request.
     * 
     * @param changeRequest The change request with paths relative to the scoped view
     * @param scopePath The scope path to prepend
     * @returns A new change request with transformed paths
     * 
     * @example
     * ```typescript
     * const request = { updateElements: { "field1": "value" } };
     * const transformed = transformChangeRequestPaths(request, "/functionalRequirements");
     * // Returns: { updateElements: { "functionalRequirements.field1": "value" } }
     * ```
     */
    public transformChangeRequestPaths<P = any>(
        changeRequest: AgentPayloadChangeRequest<P>,
        scopePath: string
    ): AgentPayloadChangeRequest<P> {
        if (!scopePath) return changeRequest;
        
        // Remove leading slash and convert to dot notation
        const pathPrefix = scopePath.startsWith('/') 
            ? scopePath.slice(1).replace(/\//g, '.') 
            : scopePath.replace(/\//g, '.');
        
        const transformObject = (obj: any, prefix: string): any => {
            if (!obj || typeof obj !== 'object') return obj;
            
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    // For nested objects, check if it's a leaf value
                    if (this.isLeafValue(value)) {
                        result[newKey] = value;
                    } else {
                        // It's a nested path structure, recurse without adding to prefix
                        Object.assign(result, transformObject(value, newKey));
                    }
                } else {
                    result[newKey] = value;
                }
            }
            return result;
        };
        
        return {
            newElements: transformObject(changeRequest.newElements, pathPrefix) as Partial<P>,
            updateElements: transformObject(changeRequest.updateElements, pathPrefix) as Partial<P>,
            removeElements: transformObject(changeRequest.removeElements, pathPrefix) as Partial<P>,
            replaceElements: transformObject(changeRequest.replaceElements, pathPrefix) as Partial<P>,
            reasoning: changeRequest.reasoning
        } as AgentPayloadChangeRequest<P>;
    }

    /**
     * Helper to determine if a value is a leaf value (not a path structure)
     */
    private isLeafValue(value: any): boolean {
        if (!value || typeof value !== 'object') return true;
        
        // Check if it looks like a data value rather than a path structure
        // This is a heuristic - may need refinement based on actual use cases
        const keys = Object.keys(value);
        
        // If it has common data properties, it's likely a value
        if (keys.some(k => ['id', 'name', 'value', 'data', 'type'].includes(k.toLowerCase()))) {
            return true;
        }
        
        // If all values are primitives, it's likely a value object
        return Object.values(value).every(v => 
            v === null || 
            v === undefined || 
            typeof v !== 'object'
        );
    }
}