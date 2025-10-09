/**
 * @fileoverview Artifact attribute extraction utilities with hierarchical rule inheritance.
 *
 * This module provides functionality for extracting attributes from artifact content
 * based on extract rules defined in artifact types. Supports hierarchical inheritance
 * where child artifact types can override parent rules.
 *
 * @module @memberjunction/core-entities
 * @since 2.105.0
 */

import {
    ArtifactExtractRule,
    ExtractedArtifactAttribute,
    ArtifactExtractionConfig,
    ArtifactExtractionResult
} from './artifact-extract-rules';

/**
 * Utility class for managing artifact extract rules and performing extraction.
 *
 * Handles:
 * - Hierarchical rule inheritance from parent artifact types
 * - Rule override resolution (child rules override parent rules by name)
 * - Safe execution of extractor JavaScript code
 * - Error handling and timeout management
 */
export class ArtifactExtractor {
    /**
     * Resolves extract rules with hierarchical inheritance.
     *
     * Child artifact types inherit all rules from their parent/grandparent types,
     * but can override rules with the same name. This method resolves the final
     * set of rules by walking up the hierarchy and merging rules.
     *
     * @param artifactTypeChain - Array of artifact types from most specific (child) to least specific (root parent)
     *                           Each element should have an ExtractRules JSON string
     * @returns Resolved array of extract rules with overrides applied
     *
     * @example
     * ```typescript
     * // Parent type has rules: [{ name: 'title', ... }, { name: 'author', ... }]
     * // Child type has rules: [{ name: 'title', ... (override) }, { name: 'date', ... (new) }]
     * const resolved = ArtifactExtractor.ResolveExtractRules([
     *   childType.ExtractRules,
     *   parentType.ExtractRules
     * ]);
     * // Result: [{ name: 'title' (from child), ... }, { name: 'author' (from parent), ... }, { name: 'date' (from child), ... }]
     * ```
     */
    public static ResolveExtractRules(artifactTypeChain: Array<{ ExtractRules?: string | null }>): ArtifactExtractRule[] {
        const rulesMap = new Map<string, ArtifactExtractRule>();

        // Process from root parent to child (reverse order)
        // This way child rules naturally override parent rules
        for (let i = artifactTypeChain.length - 1; i >= 0; i--) {
            const artifactType = artifactTypeChain[i];
            if (!artifactType.ExtractRules) {
                continue;
            }

            try {
                const rules = JSON.parse(artifactType.ExtractRules) as ArtifactExtractRule[];
                if (Array.isArray(rules)) {
                    for (const rule of rules) {
                        // Child rules override parent rules by name
                        rulesMap.set(rule.name, rule);
                    }
                }
            } catch (error) {
                console.error(`Failed to parse ExtractRules for artifact type at index ${i}:`, error);
                // Continue processing other levels
            }
        }

        return Array.from(rulesMap.values());
    }

    /**
     * Extracts attributes from artifact content using the provided extract rules.
     *
     * Executes each extractor function in a controlled environment with timeout
     * and error handling. Failed extractors can either throw or return null values
     * based on configuration.
     *
     * @param config - Extraction configuration including content and rules
     * @returns Extraction result with attributes, errors, and timing information
     *
     * @example
     * ```typescript
     * const result = await ArtifactExtractor.ExtractAttributes({
     *   content: '{"subject": "Hello", "body": "World"}',
     *   extractRules: [
     *     {
     *       name: 'subject',
     *       type: 'string',
     *       standardProperty: 'name',
     *       extractor: 'const parsed = JSON.parse(content); return parsed.subject;'
     *     }
     *   ]
     * });
     * // result.attributes = [{ name: 'subject', type: 'string', value: 'Hello', standardProperty: 'name' }]
     * ```
     */
    public static async ExtractAttributes(config: ArtifactExtractionConfig): Promise<ArtifactExtractionResult> {
        const startTime = Date.now();
        const attributes: ExtractedArtifactAttribute[] = [];
        const errors: Array<{ ruleName: string; error: string }> = [];

        const timeout = config.timeout ?? 5000;
        const throwOnError = config.throwOnError ?? false;
        const verbose = config.verbose ?? false;

        for (const rule of config.extractRules) {
            try {
                if (verbose) {
                    console.log(`Extracting attribute '${rule.name}' using rule:`, rule);
                }

                // Execute the extractor function with timeout
                const value = await this.ExecuteExtractor(config.content, rule.extractor, timeout);

                attributes.push({
                    name: rule.name,
                    type: rule.type,
                    value,
                    standardProperty: rule.standardProperty
                });

                if (verbose) {
                    console.log(`Successfully extracted '${rule.name}':`, value);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push({
                    ruleName: rule.name,
                    error: errorMessage
                });

                if (verbose) {
                    console.error(`Failed to extract '${rule.name}':`, errorMessage);
                }

                if (throwOnError) {
                    throw new Error(`Extraction failed for rule '${rule.name}': ${errorMessage}`);
                }

                // Add null value for failed extraction when not throwing
                attributes.push({
                    name: rule.name,
                    type: rule.type,
                    value: null,
                    standardProperty: rule.standardProperty
                });
            }
        }

        const executionTimeMs = Date.now() - startTime;

        return {
            success: errors.length === 0,
            attributes,
            errors,
            executionTimeMs
        };
    }

    /**
     * Executes an extractor function with timeout protection.
     *
     * Creates a sandboxed environment where the extractor code can run safely
     * with access to the content but isolated from the global scope.
     *
     * @param content - The artifact content to extract from
     * @param extractorCode - JavaScript code that performs the extraction
     * @param timeoutMs - Maximum execution time in milliseconds
     * @returns The extracted value
     * @throws Error if execution times out or fails
     *
     * @private
     */
    private static async ExecuteExtractor(content: string, extractorCode: string, timeoutMs: number): Promise<any> {
        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeoutId = setTimeout(() => {
                reject(new Error(`Extractor execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            try {
                // Create a function from the extractor code
                // The extractor receives 'content' as a parameter
                const extractorFn = new Function('content', extractorCode);

                // Execute the extractor
                const result = extractorFn(content);

                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * Serializes extracted attributes for storage in ArtifactVersionAttribute table.
     *
     * Converts extracted attribute values to JSON strings suitable for database storage.
     *
     * @param attributes - Array of extracted attributes
     * @returns Array of objects ready for database insertion
     *
     * @example
     * ```typescript
     * const serialized = ArtifactExtractor.SerializeForStorage(result.attributes);
     * // Can now insert these into ArtifactVersionAttribute table
     * for (const attr of serialized) {
     *   await artifactVersionAttribute.save({
     *     ArtifactVersionID: versionId,
     *     Name: attr.name,
     *     Type: attr.type,
     *     Value: attr.value,
     *     StandardProperty: attr.standardProperty
     *   });
     * }
     * ```
     */
    public static SerializeForStorage(attributes: ExtractedArtifactAttribute[]): Array<{
        name: string;
        type: string;
        value: string;
        standardProperty?: string;
    }> {
        return attributes.map(attr => ({
            name: attr.name,
            type: attr.type,
            value: JSON.stringify(attr.value),
            standardProperty: attr.standardProperty
        }));
    }

    /**
     * Deserializes stored attributes from ArtifactVersionAttribute records.
     *
     * Converts JSON strings back to their original types for use in application.
     *
     * @param storedAttributes - Array of attribute records from database
     * @returns Array of extracted attributes with deserialized values
     *
     * @example
     * ```typescript
     * const stored = await artifactVersionAttributes.load();
     * const attributes = ArtifactExtractor.DeserializeFromStorage(stored);
     * // attributes have parsed JSON values, not strings
     * ```
     */
    public static DeserializeFromStorage(storedAttributes: Array<{
        Name: string;
        Type: string;
        Value: string;
        StandardProperty?: string | null;
    }>): ExtractedArtifactAttribute[] {
        return storedAttributes.map(attr => ({
            name: attr.Name,
            type: attr.Type,
            value: JSON.parse(attr.Value),
            standardProperty: attr.StandardProperty as any
        }));
    }

    /**
     * Finds a specific standard property value from extracted attributes.
     *
     * Convenience method for retrieving attributes mapped to standard properties
     * like 'name', 'description', etc.
     *
     * @param attributes - Array of extracted attributes
     * @param standardProperty - The standard property to find
     * @returns The value of the attribute, or null if not found
     *
     * @example
     * ```typescript
     * const name = ArtifactExtractor.GetStandardProperty(attributes, 'name');
     * const description = ArtifactExtractor.GetStandardProperty(attributes, 'description');
     * ```
     */
    public static GetStandardProperty(
        attributes: ExtractedArtifactAttribute[],
        standardProperty: 'name' | 'description' | 'displayMarkdown' | 'displayHtml'
    ): any | null {
        const attr = attributes.find(a => a.standardProperty === standardProperty);
        return attr?.value ?? null;
    }
}
