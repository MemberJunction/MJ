/**
 * @fileoverview Types and utilities for operation-level payload access control
 * 
 * Extends the path-based permission system to support fine-grained control
 * over which operations (add, update, delete) are allowed on specific paths.
 * 
 * @module @memberjunction/ai-agents
 */

/**
 * Allowed operations on payload paths
 */
export type PayloadOperation = 'add' | 'update' | 'delete';

/**
 * All possible operations
 */
export const ALL_OPERATIONS: PayloadOperation[] = ['add', 'update', 'delete'];

/**
 * Parsed path with operation restrictions
 */
export interface ParsedPathWithOperations {
    /** The path pattern (e.g., "customer.*", "analysis.results") */
    path: string;
    /** Allowed operations on this path. Empty array means no operations allowed. */
    operations: PayloadOperation[];
    /** Whether all operations are allowed (backward compatibility) */
    allOperations: boolean;
}

/**
 * Parses a path specification into path and allowed operations.
 * 
 * Supports formats:
 * - "customer.*" - All operations allowed (backward compatible)
 * - "customer.*:add" - Only add operation allowed
 * - "customer.*:add,update" - Add and update allowed
 * - "customer.*:add,update,delete" - All operations explicitly allowed
 * 
 * @param pathSpec The path specification string
 * @returns Parsed path with operations
 */
export function parsePathWithOperations(pathSpec: string): ParsedPathWithOperations {
    if (!pathSpec || typeof pathSpec !== 'string') {
        return { path: '', operations: [], allOperations: false };
    }

    const colonIndex = pathSpec.lastIndexOf(':');
    
    // No colon or colon is part of the path (not followed by valid operations)
    if (colonIndex === -1) {
        return {
            path: pathSpec,
            operations: [...ALL_OPERATIONS],
            allOperations: true
        };
    }

    const path = pathSpec.substring(0, colonIndex);
    const opsString = pathSpec.substring(colonIndex + 1);

    // Parse operations
    const operations: PayloadOperation[] = [];
    if (opsString) {
        const opsList = opsString.split(',').map(op => op.trim().toLowerCase());
        
        for (const op of opsList) {
            if (op === 'add' || op === 'update' || op === 'delete') {
                if (!operations.includes(op as PayloadOperation)) {
                    operations.push(op as PayloadOperation);
                }
            }
            // Ignore invalid operations silently
        }
    }

    // If no valid operations specified, treat as no operations allowed
    if (operations.length === 0) {
        return { path, operations: [], allOperations: false };
    }

    return {
        path,
        operations,
        allOperations: operations.length === ALL_OPERATIONS.length &&
                      ALL_OPERATIONS.every(op => operations.includes(op))
    };
}

/**
 * Parses multiple path specifications
 * 
 * @param pathSpecs Array of path specification strings
 * @returns Array of parsed paths with operations
 */
export function parsePathsWithOperations(pathSpecs: string[]): ParsedPathWithOperations[] {
    if (!Array.isArray(pathSpecs)) {
        return [];
    }
    
    return pathSpecs.map(spec => parsePathWithOperations(spec));
}

/**
 * Checks if a specific operation is allowed for a path
 * 
 * @param parsedPath The parsed path with operations
 * @param operation The operation to check
 * @returns True if the operation is allowed
 */
export function isOperationAllowed(
    parsedPath: ParsedPathWithOperations,
    operation: PayloadOperation
): boolean {
    return parsedPath.allOperations || parsedPath.operations.includes(operation);
}

/**
 * Formats a parsed path back to string representation
 * 
 * @param parsedPath The parsed path with operations
 * @returns String representation
 */
export function formatPathWithOperations(parsedPath: ParsedPathWithOperations): string {
    if (parsedPath.allOperations) {
        return parsedPath.path;
    }
    
    if (parsedPath.operations.length === 0) {
        return `${parsedPath.path}:none`;
    }
    
    return `${parsedPath.path}:${parsedPath.operations.join(',')}`;
}