/**
 * @fileoverview TypeScript types for artifact extract rules system.
 *
 * This module defines the structure for extract rules that enable artifact types
 * to declaratively specify how to extract attributes from artifact content.
 * Extract rules support hierarchical inheritance through parent artifact types.
 *
 * @module @memberjunction/core-entities
 * @since 2.105.0
 */

/**
 * Standard properties that extracted attributes can map to for UI rendering.
 * These provide semantic meaning to extracted values beyond custom attributes.
 */
export type ArtifactStandardProperty = 'name' | 'description' | 'displayMarkdown' | 'displayHtml';

/**
 * Definition of a single extraction rule that defines how to extract an attribute
 * from artifact content.
 *
 * Extract rules are stored as JSON in the ArtifactType.ExtractRules column and
 * support hierarchical inheritance where child types can override parent rules.
 *
 * @example
 * ```typescript
 * const emailSubjectRule: ArtifactExtractRule = {
 *   name: 'subject',
 *   description: 'Email subject line',
 *   type: 'string',
 *   standardProperty: 'name',
 *   extractor: `
 *     // content is the artifact content (JSON, text, etc.)
 *     const parsed = JSON.parse(content);
 *     return parsed.subject;
 *   `
 * };
 * ```
 */
export interface ArtifactExtractRule {
    /**
     * Unique name for this extraction rule within the artifact type hierarchy.
     * Used as the key for overriding parent rules and for storing extracted values.
     */
    name: string;

    /**
     * Human-readable description of what this rule extracts.
     */
    description: string;

    /**
     * TypeScript type definition for the extracted value.
     *
     * Can be:
     * - Primitive types: 'string', 'number', 'boolean', 'Date'
     * - Complex types: 'Array<string>', 'Record<string, any>'
     * - Custom interfaces: 'Array<{x: number, y: string}>'
     *
     * @example 'string'
     * @example 'number'
     * @example 'Array<{id: string, name: string}>'
     */
    type: string;

    /**
     * Optional mapping to a standard property for UI rendering.
     *
     * When set, this extracted value can be used by the UI for specific purposes:
     * - 'name': Display name of the artifact
     * - 'description': Description/summary of the artifact
     * - 'displayMarkdown': Markdown-formatted display content
     * - 'displayHtml': HTML-formatted display content
     *
     * If undefined, this is a custom attribute specific to the artifact type.
     */
    standardProperty?: ArtifactStandardProperty;

    /**
     * JavaScript code that performs the extraction.
     *
     * The extractor function receives the artifact content as input and returns
     * the extracted value. The function body should be valid JavaScript that:
     *
     * 1. Receives a 'content' variable (string) containing the artifact content
     * 2. Performs necessary parsing/extraction logic
     * 3. Returns a value matching the declared 'type'
     *
     * Security Note: This code is executed in a sandboxed environment.
     * You may not access external resources or do anything that would result in side effects.
     *
     * @example
     * ```javascript
     * // Extract subject from JSON email
     * const parsed = JSON.parse(content);
     * return parsed.subject || 'Untitled';
     * ```
     *
     * @example
     * ```javascript
     * // Extract first heading from Markdown
     * const match = content.match(/^#\s+(.+)$/m);
     * return match ? match[1] : null;
     * ```
     */
    extractor: string;
}

/**
 * Result of extracting attributes from artifact content using extract rules.
 * This is the runtime representation of extracted values.
 */
export interface ExtractedArtifactAttribute {
    /** Name of the extracted attribute (from rule.name) */
    name: string;

    /** TypeScript type of the value (from rule.type) */
    type: string;

    /** The extracted value (JSON-serializable) */
    value: any;

    /** Optional mapping to standard property (from rule.standardProperty) */
    standardProperty?: ArtifactStandardProperty;
}

/**
 * Configuration for running artifact extraction.
 * Provides context and options for the extraction process.
 */
export interface ArtifactExtractionConfig {
    /**
     * The artifact content to extract from.
     * This is typically the Content field from ArtifactVersion.
     */
    content: string;

    /**
     * Array of extract rules to apply.
     * These should be the resolved rules after inheritance from parent types.
     */
    extractRules: ArtifactExtractRule[];

    /**
     * Whether to throw errors on extraction failures or continue with null values.
     * Default: false (continue on errors)
     */
    throwOnError?: boolean;

    /**
     * Maximum execution time for each extractor function in milliseconds.
     * Default: 5000ms (5 seconds)
     */
    timeout?: number;

    /**
     * Whether to enable verbose logging during extraction.
     * Default: false
     */
    verbose?: boolean;
}

/**
 * Result of running artifact extraction on content.
 */
export interface ArtifactExtractionResult {
    /** Whether the extraction completed successfully */
    success: boolean;

    /** Array of successfully extracted attributes */
    attributes: ExtractedArtifactAttribute[];

    /** Array of errors that occurred during extraction */
    errors: Array<{
        ruleName: string;
        error: string;
    }>;

    /** Total extraction time in milliseconds */
    executionTimeMs: number;
}
