/**
 * @fileoverview Metadata filter support for the shared Knowledge Hub vector index.
 *
 * Provides a `VectorMetadataFilter` utility that converts high-level
 * filter options into provider-native filter objects suitable for
 * passing to `VectorDBBase.QueryIndex()`.
 *
 * @module @memberjunction/ai-vectordb
 */

/**
 * Classification of how the vectorized content originated.
 * Mirrors the type in @memberjunction/ai-vectors for package independence.
 */
export type VectorSourceType = 'entity' | 'content-item' | 'file' | 'web-page';

/**
 * Filter options for querying the shared vector index.
 * All fields are optional -- omitted fields mean "no filter on this dimension".
 * Mirrors the interface in @memberjunction/ai-vectors for package independence.
 */
export interface SharedIndexFilterOptions {
    /** Restrict to specific entity names */
    EntityNames?: string[];
    /** Restrict to specific source types */
    SourceTypes?: VectorSourceType[];
    /** Restrict to specific MIME content types */
    ContentTypes?: string[];
    /** Require all specified tags to be present */
    Tags?: string[];
    /** Restrict to specific Entity Document IDs */
    EntityDocumentIDs?: string[];
}

/**
 * Describes the structure of a single metadata filter condition.
 * Each vector DB provider translates these into its native filter syntax.
 */
export interface MetadataFilterCondition {
    /** The metadata field name to filter on */
    Field: string;
    /** The comparison operator */
    Operator: 'eq' | 'in' | 'contains';
    /** The value(s) to compare against */
    Value: string | string[] | number;
}

/**
 * Utility class for converting `SharedIndexFilterOptions` into a flat array
 * of `MetadataFilterCondition` objects that vector DB providers can interpret.
 */
export class VectorMetadataFilter {
    /**
     * Convert shared index filter options into an array of filter conditions.
     * Providers should map these conditions to their native filter syntax
     * (e.g., Pinecone metadata filters, Weaviate where clauses, etc.).
     *
     * @param options - The high-level filter options from the search request
     * @returns An array of conditions; empty if no filters are specified
     */
    public static BuildConditions(options: SharedIndexFilterOptions): MetadataFilterCondition[] {
        const conditions: MetadataFilterCondition[] = [];

        if (options.EntityNames && options.EntityNames.length > 0) {
            conditions.push({
                Field: 'EntityName',
                Operator: 'in',
                Value: options.EntityNames,
            });
        }

        if (options.SourceTypes && options.SourceTypes.length > 0) {
            conditions.push({
                Field: 'SourceType',
                Operator: 'in',
                Value: options.SourceTypes,
            });
        }

        if (options.ContentTypes && options.ContentTypes.length > 0) {
            conditions.push({
                Field: 'ContentType',
                Operator: 'in',
                Value: options.ContentTypes,
            });
        }

        if (options.Tags && options.Tags.length > 0) {
            for (const tag of options.Tags) {
                conditions.push({
                    Field: 'Tags',
                    Operator: 'contains',
                    Value: tag,
                });
            }
        }

        if (options.EntityDocumentIDs && options.EntityDocumentIDs.length > 0) {
            conditions.push({
                Field: 'EntityDocumentID',
                Operator: 'in',
                Value: options.EntityDocumentIDs,
            });
        }

        return conditions;
    }

    /**
     * Convert filter conditions into a simple key-value filter object
     * compatible with the existing `QueryParamsBase.filter` field.
     *
     * This produces a "Pinecone-style" filter using `$in` and `$eq` operators.
     * Providers with different filter syntax should override or adapt.
     *
     * @param conditions - The array of filter conditions to convert
     * @returns A plain object suitable for `QueryParamsBase.filter`
     */
    public static ToNativeFilter(conditions: MetadataFilterCondition[]): Record<string, unknown> {
        const filter: Record<string, unknown> = {};

        for (const condition of conditions) {
            switch (condition.Operator) {
                case 'eq':
                    filter[condition.Field] = { $eq: condition.Value };
                    break;
                case 'in':
                    filter[condition.Field] = { $in: condition.Value };
                    break;
                case 'contains':
                    // For array fields, "contains" checks if the value is in the array
                    filter[condition.Field] = { $eq: condition.Value };
                    break;
            }
        }

        return filter;
    }

    /**
     * Convenience method that converts SharedIndexFilterOptions directly
     * to a native filter object in one step.
     *
     * @param options - The high-level filter options
     * @returns A native filter object, or undefined if no filters specified
     */
    public static FromOptions(options: SharedIndexFilterOptions): Record<string, unknown> | undefined {
        const conditions = VectorMetadataFilter.BuildConditions(options);
        if (conditions.length === 0) {
            return undefined;
        }
        return VectorMetadataFilter.ToNativeFilter(conditions);
    }
}
