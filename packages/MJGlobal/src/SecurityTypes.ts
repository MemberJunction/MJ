/**
 * @fileoverview Security validation types and configuration options.
 *
 * This module defines types and default configurations for security validation
 * utilities including prototype pollution detection, size validation, and
 * recursion depth limits.
 *
 * @module @memberjunction/global
 * @author MemberJunction.com
 * @since 2.129.0
 */

/**
 * Configuration options for security validation operations
 */
export interface SecurityValidationOptions {
    /**
     * Maximum object size in bytes (measured via JSON.stringify)
     * @default 1048576 (1MB)
     */
    maxSize?: number;

    /**
     * Maximum recursion depth for nested object operations
     * @default 10
     */
    maxDepth?: number;

    /**
     * Enable prototype pollution detection
     * @default true
     */
    preventPrototypePollution?: boolean;

    /**
     * Context string for error messages (e.g., "Deep Merge", "JSON Parsing")
     */
    context?: string;
}

/**
 * Default security validation options
 *
 * These defaults are designed for production use and provide protection against
 * common attack vectors while supporting most legitimate use cases.
 */
export const DEFAULT_SECURITY_OPTIONS: Required<Omit<SecurityValidationOptions, 'context'>> = {
    maxSize: 1024 * 1024,           // 1MB
    maxDepth: 10,                   // Maximum nesting depth
    preventPrototypePollution: true // Always check for dangerous keys
};

/**
 * Keys that could be used for prototype pollution attacks
 *
 * These keys can modify the prototype chain of JavaScript objects and
 * should never be allowed in untrusted data.
 */
export const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

/**
 * Type for dangerous key literals
 */
export type DangerousKey = typeof DANGEROUS_KEYS[number];
