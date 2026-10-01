/**
 * The minimal shape of an `MJ: Vector Indexes` row needed to address its index on the provider.
 * Typed structurally so callers can pass the generated entity without this package depending on it.
 */
export interface VectorIndexNaming {
    /** The MJ display label, e.g. "More Cheese Content (Pinecone)". */
    Name: string;
    /** The provider-side index name, e.g. "morecheese-content". */
    ExternalID?: string | null;
}

/**
 * Returns the name the vector database itself knows the index by.
 *
 * A Vector Index row carries two names: `Name` is MJ's display label and `ExternalID` is the name of
 * the index on the provider. They often differ (Pinecone index names cannot contain spaces or
 * parentheses), so any call that reaches the provider must use `ExternalID`. `Name` is the fallback
 * for older rows created before `ExternalID` was populated, where the two were the same.
 */
export function ProviderIndexName(index: VectorIndexNaming): string {
    return index.ExternalID?.trim() || index.Name;
}
