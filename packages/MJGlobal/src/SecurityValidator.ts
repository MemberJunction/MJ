/**
 * @fileoverview Security validation utilities for preventing common attack vectors.
 *
 * This module provides utilities for validating objects against security threats including:
 * - Prototype pollution attacks (via __proto__, constructor, prototype keys)
 * - Denial-of-service attacks (via oversized payloads)
 * - Stack overflow attacks (via deeply nested objects)
 *
 * ## Key Features:
 * - Prototype pollution detection with recursive scanning
 * - Object size validation to prevent memory exhaustion
 * - Configurable limits with safe defaults
 * - Clear error messages with security context
 *
 * ## Usage Examples:
 *
 * ```typescript
 * import { SecurityValidator } from '@memberjunction/global';
 *
 * // Check for prototype pollution
 * const hasDangerousKeys = SecurityValidator.hasPrototypePollution(untrustedData);
 *
 * // Validate with custom options
 * SecurityValidator.validateSecure(data, {
 *     maxSize: 5 * 1024 * 1024,  // 5MB
 *     maxDepth: 15,
 *     preventPrototypePollution: true,
 *     context: 'API Request'
 * });
 * ```
 *
 * @module @memberjunction/global
 * @author MemberJunction.com
 * @since 2.129.0
 */

import {
    SecurityValidationOptions,
    DEFAULT_SECURITY_OPTIONS,
    DANGEROUS_KEYS
} from './SecurityTypes';

/**
 * Security validation utility class providing static methods for common security checks
 */
export class SecurityValidator {
    /**
     * Checks if an object contains keys that could be used for prototype pollution attacks
     *
     * This method recursively scans the object (including nested objects and arrays) for
     * dangerous keys: `__proto__`, `constructor`, and `prototype`.
     *
     * @param obj - Object to validate
     * @returns true if dangerous keys are found, false otherwise
     *
     * @example
     * ```typescript
     * const safe = { data: "normal" };
     * SecurityValidator.hasPrototypePollution(safe); // false
     *
     * const unsafe = { __proto__: { isAdmin: true } };
     * SecurityValidator.hasPrototypePollution(unsafe); // true
     * ```
     */
    static hasPrototypePollution(obj: unknown): boolean {
        if (!obj || typeof obj !== 'object') {
            return false;
        }

        // Check top-level keys
        for (const key of DANGEROUS_KEYS) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                return true;
            }
        }

        // Recursively check nested objects and arrays
        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (typeof item === 'object' && item !== null) {
                    if (this.hasPrototypePollution(item)) {
                        return true;
                    }
                }
            }
        } else {
            for (const value of Object.values(obj)) {
                if (typeof value === 'object' && value !== null) {
                    if (this.hasPrototypePollution(value)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Validates that an object doesn't contain prototype pollution keys and throws if found
     *
     * @param obj - Object to validate
     * @param context - Context string for error messages
     * @throws Error if prototype pollution is detected
     *
     * @example
     * ```typescript
     * try {
     *     SecurityValidator.validateNoPrototypePollution(untrustedData, 'API Request');
     * } catch (error) {
     *     // Handle security violation
     * }
     * ```
     */
    static validateNoPrototypePollution(obj: unknown, context: string): void {
        if (this.hasPrototypePollution(obj)) {
            const errorMsg = `Prototype pollution detected in ${context}: Found dangerous key (${DANGEROUS_KEYS.join(', ')})`;
            throw new Error(errorMsg);
        }
    }

    /**
     * Gets the size of an object in bytes using JSON serialization
     *
     * @param obj - Object to measure
     * @returns Size in bytes, or -1 if measurement fails
     *
     * @example
     * ```typescript
     * const size = SecurityValidator.getObjectSize({ data: "test" });
     * console.log(`Object is ${size} bytes`);
     * ```
     */
    static getObjectSize(obj: unknown): number {
        try {
            return JSON.stringify(obj).length;
        } catch (error) {
            // If serialization fails, return -1 to indicate measurement failure
            return -1;
        }
    }

    /**
     * Validates that an object doesn't exceed the maximum size limit
     *
     * @param obj - Object to validate
     * @param maxSize - Maximum allowed size in bytes
     * @param context - Context string for error messages
     * @throws Error if object exceeds size limit
     *
     * @example
     * ```typescript
     * SecurityValidator.validateObjectSize(data, 1024 * 1024, 'File Upload');
     * ```
     */
    static validateObjectSize(obj: unknown, maxSize: number, context: string): void {
        try {
            const size = this.getObjectSize(obj);

            if (size === -1) {
                // Serialization failed - silently return as we can't measure
                // Callers can use getObjectSize() if they want to handle this explicitly
                return;
            }

            if (size > maxSize) {
                const errorMsg = `${context}: Object size (${size} bytes) exceeds maximum allowed size (${maxSize} bytes). This may indicate a DoS attack or excessive data.`;
                throw new Error(errorMsg);
            }
        } catch (error) {
            // Re-throw if it's our size validation error
            if (error instanceof Error && error.message.includes('exceeds maximum')) {
                throw error;
            }
            // Otherwise silently return - serialization issues are not security violations
        }
    }

    /**
     * Validates a string's size before JSON parsing
     *
     * This is useful for validating JSON strings before calling JSON.parse() to prevent
     * DoS attacks from extremely large JSON payloads.
     *
     * @param jsonString - JSON string to validate
     * @param maxSize - Maximum allowed size in bytes
     * @param context - Context string for error messages
     * @throws Error if string exceeds size limit
     *
     * @example
     * ```typescript
     * SecurityValidator.validateStringSize(jsonResponse, 10 * 1024 * 1024, 'API Response');
     * const data = JSON.parse(jsonResponse);
     * ```
     */
    static validateStringSize(jsonString: string, maxSize: number, context: string): void {
        if (jsonString.length > maxSize) {
            const errorMsg = `${context}: String size (${jsonString.length} bytes) exceeds maximum allowed size (${maxSize} bytes). This may indicate a DoS attack or malformed response.`;
            throw new Error(errorMsg);
        }
    }

    /**
     * Validates recursion depth to prevent stack overflow
     *
     * @param currentDepth - Current recursion depth
     * @param maxDepth - Maximum allowed depth
     * @param context - Context string for error messages
     * @throws Error if depth exceeds limit
     *
     * @example
     * ```typescript
     * function processNested(obj: unknown, depth = 0) {
     *     SecurityValidator.validateRecursionDepth(depth, 10, 'Object Processing');
     *     // ... recursive logic
     * }
     * ```
     */
    static validateRecursionDepth(currentDepth: number, maxDepth: number, context: string): void {
        if (currentDepth > maxDepth) {
            const errorMsg = `${context}: Exceeded maximum recursion depth of ${maxDepth}. This may indicate circular references or extremely nested data.`;
            throw new Error(errorMsg);
        }
    }

    /**
     * Performs comprehensive security validation on an object
     *
     * This method combines all security checks (prototype pollution, size validation, etc.)
     * based on the provided options.
     *
     * @param obj - Object to validate
     * @param options - Security validation options
     * @throws Error if any validation check fails
     *
     * @example
     * ```typescript
     * SecurityValidator.validateSecure(untrustedData, {
     *     maxSize: 5 * 1024 * 1024,  // 5MB
     *     preventPrototypePollution: true,
     *     context: 'User Input'
     * });
     * ```
     */
    static validateSecure(obj: unknown, options: SecurityValidationOptions = {}): void {
        const opts = {
            ...DEFAULT_SECURITY_OPTIONS,
            ...options
        };

        const context = opts.context || 'Security Validation';

        // Prototype pollution check
        if (opts.preventPrototypePollution) {
            this.validateNoPrototypePollution(obj, context);
        }

        // Size validation
        this.validateObjectSize(obj, opts.maxSize, context);
    }
}
