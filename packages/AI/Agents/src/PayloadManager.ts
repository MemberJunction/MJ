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
import * as _ from 'lodash';
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
                _.set(result, actualPath, _.cloneDeep(subAgentValue));
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
        
        // Output consolidated warning if there were unauthorized changes
        if (unauthorizedChanges.length > 0) {
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
        changeRequest: AgentPayloadChangeRequest<P>,
        options?: {
            validateChanges?: boolean;
            logChanges?: boolean;
            agentName?: string;
            analyzeChanges?: boolean;
            generateDiff?: boolean;
            allowedPaths?: string[];
        }
    ): PayloadManagerResult<P> {
        const warnings: string[] = [];
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
            options?.allowedPaths
        );
        
        // Log if requested
        if (options?.logChanges) {
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
            timestamp: new Date()
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
        allowedPaths?: string[]
    ): void {
        if (Array.isArray(target)) {
            this.processArrayChanges(target, original, changeRequest, path, counts, warnings, allowedPaths);
        } else if (typeof target === 'object' && target !== null) {
            this.processObjectChanges(target, original, changeRequest, path, counts, warnings, allowedPaths);
        }
    }

    /**
     * Process changes for array elements
     */
    private processArrayChanges(
        target: any[],
        original: any[],
        changeRequest: AgentPayloadChangeRequest<any>,
        path: string[],
        counts: { additions: number; updates: number; deletions: number; },
        warnings: string[],
        allowedPaths?: string[]
    ): void {
        const pathStr = path.join('.');
        
        // Get change arrays for this path
        const removeArray = pathStr ? _.get(changeRequest.removeElements, pathStr) : changeRequest.removeElements;
        const updateArray = pathStr ? _.get(changeRequest.updateElements, pathStr) : changeRequest.updateElements;
        const newArray = pathStr ? _.get(changeRequest.newElements, pathStr) : changeRequest.newElements;
        
        // Build a new array with all changes applied
        const newTargetArray: any[] = [];
        
        // Process existing elements
        for (let i = 0; i < target.length; i++) {
            if (removeArray && removeArray[i] === '_DELETE_') {
                counts.deletions++;
                continue; // Skip deleted items
            }
            
            // Use updated value if provided, otherwise keep original
            let elementToAdd = target[i];
            
            if (updateArray && this.isSignificantValue(updateArray[i])) {
                elementToAdd = updateArray[i];
                counts.updates++;
            } else if (typeof elementToAdd === 'object' && elementToAdd !== null) {
                // For objects/arrays that aren't being replaced, process nested changes
                elementToAdd = _.cloneDeep(elementToAdd);
                this.processChangeRequest(
                    elementToAdd,
                    original ? original[i] : undefined,
                    changeRequest,
                    [...path, i.toString()],
                    counts,
                    warnings,
                    allowedPaths
                );
            }
            
            newTargetArray.push(elementToAdd);
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
        allowedPaths?: string[]
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
                allowedPaths
            );
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
                    allowedPaths
                );
            }
        }
    }

    /**
     * Process a single key change (add, update, or delete)
     */
    private processKeyChange(
        target: any,
        original: any,
        changeRequest: AgentPayloadChangeRequest<any>,
        keyPath: string[],
        key: string,
        counts: { additions: number; updates: number; deletions: number; },
        warnings: string[],
        allowedPaths?: string[]
    ): void {
        const pathStr = keyPath.join('.');
        
        // Check for deletion
        const removeValue = _.get(changeRequest.removeElements, pathStr);
        if (removeValue === '_DELETE_') {
            // Check if delete operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'delete', allowedPaths)) {
                warnings.push(`Operation denied: Cannot delete '${pathStr}' - operation 'delete' not allowed`);
                return;
            }
            delete target[key];
            counts.deletions++;
            return;
        }
        
        // Check for addition first
        const newValue = _.get(changeRequest.newElements, pathStr);
        if (newValue !== undefined && !(key in target)) {
            // Check if add operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'add', allowedPaths)) {
                warnings.push(`Operation denied: Cannot add '${pathStr}' - operation 'add' not allowed`);
                return;
            }
            target[key] = newValue;
            counts.additions++;
            return;
        }
        
        // Check for update
        const updateValue = _.get(changeRequest.updateElements, pathStr);
        
        // Be forgiving: if AI put an update in newElements by mistake, treat it as an update
        const effectiveUpdateValue = (updateValue !== undefined) ? updateValue : 
                                    (newValue !== undefined && key in target) ? newValue : 
                                    undefined;
        
        if (effectiveUpdateValue !== undefined && key in target) {
            // Check if update operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'update', allowedPaths)) {
                warnings.push(`Operation denied: Cannot update '${pathStr}' - operation 'update' not allowed`);
                return;
            }
            
            // If both values are objects, we need to recursively process the update
            if (typeof effectiveUpdateValue === 'object' && effectiveUpdateValue !== null &&
                typeof target[key] === 'object' && target[key] !== null &&
                !Array.isArray(effectiveUpdateValue) && !Array.isArray(target[key])) {
                // Recursively process nested updates
                this.processChangeRequest(
                    target[key],
                    original ? original[key] : undefined,
                    changeRequest,
                    keyPath,
                    counts,
                    warnings,
                    allowedPaths
                );
            } else {
                // For non-objects or arrays, replace the value
                target[key] = effectiveUpdateValue;
                counts.updates++;
            }
            
            // Add a soft warning if we auto-corrected the placement
            if (updateValue === undefined && newValue !== undefined) {
                warnings.push(`Auto-corrected: '${key}' was in newElements but already exists (treated as update)`);
            }
        } else if (updateValue !== undefined && !(key in target)) {
            // Be forgiving: if AI put an addition in updateElements by mistake, treat it as an addition
            // Check if add operation is allowed
            if (allowedPaths && !this.isOperationAllowedForPath(pathStr, 'add', allowedPaths)) {
                warnings.push(`Operation denied: Cannot add '${pathStr}' - operation 'add' not allowed`);
                return;
            }
            target[key] = updateValue;
            counts.additions++;
            warnings.push(`Auto-corrected: '${key}' was in updateElements but doesn't exist (treated as addition)`);
        }
    }

    /**
     * Get all unique keys from change request for a given path
     */
    private getChangeKeys(changeRequest: AgentPayloadChangeRequest<any>, path: string[]): Set<string> {
        const keys = new Set<string>();
        const pathStr = path.join('.');
        
        const addKeysFromObject = (obj: any) => {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                Object.keys(obj).forEach(k => keys.add(k));
            }
        };
        
        const removeObj = pathStr ? _.get(changeRequest.removeElements, pathStr) : changeRequest.removeElements;
        const updateObj = pathStr ? _.get(changeRequest.updateElements, pathStr) : changeRequest.updateElements;
        const newObj = pathStr ? _.get(changeRequest.newElements, pathStr) : changeRequest.newElements;
        
        addKeysFromObject(removeObj);
        addKeysFromObject(updateObj);
        addKeysFromObject(newObj);
        
        return keys;
    }

    /**
     * Check if a value is significant (not empty object or undefined)
     */
    private isSignificantValue(value: any): boolean {
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
        const guardedPayload = this.mergeUpstreamPayload(
            subAgentName,
            parentPayload,
            changeResult.result,
            upstreamPaths
        );
        
        // Count blocked changes (this is a simplified count)
        const blocked = this.countBlockedChanges(parentPayload, changeResult.result, guardedPayload);
        
        return {
            ...changeResult,
            result: guardedPayload,
            blocked
        };
    }

    /**
     * Count how many changes were blocked by guardrails
     */
    private countBlockedChanges(_original: any, intended: any, actual: any): number {
        // This is a simplified implementation
        // A full implementation would do deep comparison
        const intendedStr = JSON.stringify(intended);
        const actualStr = JSON.stringify(actual);
        return intendedStr === actualStr ? 0 : 1;
    }
}