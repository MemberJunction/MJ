import { LogError } from "@memberjunction/core";
import { SafeJSONParse } from "@memberjunction/global";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/**
 * Input for the `GenerateSeedTaxonomy` GraphQL mutation.
 *
 * Mirrors the server-side resolver arguments (MJServer
 * `GenerateSeedTaxonomyResolver`).
 */
export interface GenerateSeedTaxonomyInput {
    /** The ContentSource ID whose items seed the taxonomy. */
    SourceID: string;
    /** Max number of content items to consider (server defaults when <= 0). */
    SampleSize: number;
}

/**
 * A single node in the server-proposed taxonomy tree. Parsed from the
 * mutation's `NodesJSON` field. The tree is NON-persisted — it is a proposal
 * the caller renders and selectively accepts.
 */
export interface SeedTaxonomyNode {
    /** Proposed tag name. */
    Name: string;
    /** Optional proposed description for the tag. */
    Description?: string;
    /** Optional count of sampled members associated with this node. */
    MemberCount?: number;
    /** Optional child nodes (recursive). */
    Children?: SeedTaxonomyNode[];
}

/**
 * Fully-parsed result of a `GenerateSeedTaxonomy` mutation.
 *
 * The transport helper parses the JSON-string field (`NodesJSON`) returned by
 * the server back into the typed `Nodes` property so consumers never deal with
 * raw JSON strings.
 */
export interface SeedTaxonomyResult {
    /** Whether the taxonomy generation succeeded. */
    Success: boolean;
    /** Error message when `Success` is false. */
    ErrorMessage?: string;
    /** How the taxonomy was produced: 'clustering' or 'prompt-fallback'. */
    Method?: string;
    /** Number of content items sampled / considered. */
    SampleSize: number;
    /** Parsed, NON-persisted proposed tag tree. */
    Nodes: SeedTaxonomyNode[];
}

/** Raw shape of the GraphQL mutation payload (before JSON-string parsing). */
interface RawSeedTaxonomyResult {
    Success: boolean;
    ErrorMessage?: string;
    Method?: string;
    SampleSize: number;
    NodesJSON: string;
}

/**
 * Client for generating a seed tag taxonomy on the server through GraphQL.
 *
 * The taxonomy-proposal pipeline (sampling a content source and proposing a tag
 * tree, optionally via clustering or an LLM prompt fallback) runs server-side
 * (via `@memberjunction/tag-engine`); this client is a thin, strongly-typed
 * transport that sends the `GenerateSeedTaxonomy` mutation and parses the
 * JSON-string field back into typed objects.
 *
 * Follows the same naming + construction convention as the other GraphQL
 * clients in this package (`GraphQLClusterClient`, `GraphQLAIClient`, etc.).
 *
 * @example
 * ```typescript
 * const classifyClient = new GraphQLClassifyClient(graphQLProvider);
 * const result = await classifyClient.GenerateSeedTaxonomy({
 *   SourceID: 'some-content-source-id',
 *   SampleSize: 50,
 * });
 * if (result.Success) {
 *   console.log('Method:', result.Method);
 *   console.log('Nodes:', result.Nodes.length);
 * } else {
 *   console.error(result.ErrorMessage);
 * }
 * ```
 */
export class GraphQLClassifyClient {
    /** The GraphQLDataProvider instance used to execute GraphQL requests. */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLClassifyClient instance.
     * @param dataProvider The GraphQL data provider to use for the mutation.
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Generate a seed tag taxonomy proposal for a content source.
     *
     * Sends the `GenerateSeedTaxonomy` mutation, then parses the JSON-string
     * field (`NodesJSON`) into the typed `Nodes` tree. Never throws — failures
     * are returned as a result with `Success: false` and an `ErrorMessage`.
     *
     * @param input The source + sample size to generate the taxonomy from.
     * @returns A Promise resolving to a fully-parsed {@link SeedTaxonomyResult}.
     */
    public async GenerateSeedTaxonomy(input: GenerateSeedTaxonomyInput): Promise<SeedTaxonomyResult> {
        try {
            const mutation = gql`
                mutation GenerateSeedTaxonomy($sourceID: String!, $sampleSize: Int!) {
                    GenerateSeedTaxonomy(sourceID: $sourceID, sampleSize: $sampleSize) {
                        Success
                        ErrorMessage
                        Method
                        SampleSize
                        NodesJSON
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(mutation, {
                sourceID: input.SourceID,
                sampleSize: input.SampleSize,
            });
            const raw: RawSeedTaxonomyResult | undefined = result?.GenerateSeedTaxonomy;
            if (!raw) {
                throw new Error('Invalid response from server');
            }

            return this.parseResult(raw);
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLClassifyClient.GenerateSeedTaxonomy failed', undefined, e);
            return this.errorResult(e.message || 'Unknown error occurred');
        }
    }

    /**
     * Parse the raw mutation payload, deserializing the `NodesJSON` field into
     * the typed `Nodes` tree.
     */
    private parseResult(raw: RawSeedTaxonomyResult): SeedTaxonomyResult {
        const nodes = SafeJSONParse<SeedTaxonomyNode[]>(raw.NodesJSON) ?? [];
        return {
            Success: raw.Success,
            ErrorMessage: raw.ErrorMessage,
            Method: raw.Method,
            SampleSize: raw.SampleSize,
            Nodes: nodes,
        };
    }

    /** Build a failed {@link SeedTaxonomyResult} carrying an error message. */
    private errorResult(message: string): SeedTaxonomyResult {
        return {
            Success: false,
            ErrorMessage: message,
            SampleSize: 0,
            Nodes: [],
        };
    }
}
