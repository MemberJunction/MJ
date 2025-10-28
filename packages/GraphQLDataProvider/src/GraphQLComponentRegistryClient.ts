import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { ComponentSpec } from "@memberjunction/interactive-component-types";

/**
 * Parameters for getting a component from registry
 */
export interface GetRegistryComponentParams {
    /**
     * Registry name (globally unique)
     */
    registryName: string;
    
    /**
     * Component namespace
     */
    namespace: string;
    
    /**
     * Component name
     */
    name: string;
    
    /**
     * Component version (optional, defaults to 'latest')
     */
    version?: string;
    
    /**
     * Optional hash for caching - if provided and matches, returns null
     */
    hash?: string;
}

/**
 * Response from GetRegistryComponent with hash and caching metadata
 */
export interface ComponentSpecWithHash {
    /**
     * The component specification (undefined if not modified)
     */
    specification?: ComponentSpec | string; // Can be either parsed object or JSON string
    
    /**
     * SHA-256 hash of the specification
     */
    hash: string;
    
    /**
     * Indicates if the component was not modified (304 response)
     */
    notModified: boolean;
    
    /**
     * Optional message from server
     */
    message?: string;
}

/**
 * Parameters for searching registry components
 */
export interface SearchRegistryComponentsParams {
    /**
     * Optional registry name filter
     */
    registryName?: string;
    
    /**
     * Optional namespace filter
     */
    namespace?: string;
    
    /**
     * Search query string
     */
    query?: string;
    
    /**
     * Component type filter
     */
    type?: string;
    
    /**
     * Tags to filter by
     */
    tags?: string[];
    
    /**
     * Maximum number of results
     */
    limit?: number;
    
    /**
     * Offset for pagination
     */
    offset?: number;
}

/**
 * Search result for registry components
 */
export interface RegistryComponentSearchResult {
    /**
     * Array of matching components
     */
    components: ComponentSpec[];
    
    /**
     * Total number of matches
     */
    total: number;
    
    /**
     * Current offset
     */
    offset: number;
    
    /**
     * Current limit
     */
    limit: number;
}

/**
 * Dependency tree for a component
 */
export interface ComponentDependencyTree {
    /**
     * Component ID
     */
    componentId: string;

    /**
     * Component name
     */
    name?: string;

    /**
     * Component namespace
     */
    namespace?: string;

    /**
     * Component version
     */
    version?: string;

    /**
     * Direct dependencies
     */
    dependencies?: ComponentDependencyTree[];

    /**
     * Whether this is a circular dependency
     */
    circular?: boolean;

    /**
     * Total count of all dependencies
     */
    totalCount?: number;
}

/**
 * Input parameters for sending component feedback
 */
export interface ComponentFeedbackParams {
    /**
     * Component name
     */
    componentName: string;

    /**
     * Component namespace
     */
    componentNamespace: string;

    /**
     * Component version (optional)
     */
    componentVersion?: string;

    /**
     * Registry name (optional - for registry-specific feedback)
     */
    registryName?: string;

    /**
     * Rating (typically 0-5 scale)
     */
    rating: number;

    /**
     * Type of feedback (optional)
     */
    feedbackType?: string;

    /**
     * User comments (optional)
     */
    comments?: string;

    /**
     * Associated conversation ID (optional)
     */
    conversationID?: string;

    /**
     * Associated conversation detail ID (optional)
     */
    conversationDetailID?: string;

    /**
     * Associated report ID (optional)
     */
    reportID?: string;

    /**
     * Associated dashboard ID (optional)
     */
    dashboardID?: string;
}

/**
 * Response from sending component feedback
 */
export interface ComponentFeedbackResponse {
    /**
     * Whether the feedback was successfully submitted
     */
    success: boolean;

    /**
     * ID of the created feedback record (if available)
     */
    feedbackID?: string;

    /**
     * Error message if submission failed
     */
    error?: string;
}

/**
 * Client for executing Component Registry operations through GraphQL.
 * This class provides an easy way to fetch components from external registries
 * through the MJ API server, which handles authentication and caching.
 * 
 * The GraphQLComponentRegistryClient follows the same naming convention as other GraphQL clients
 * in the MemberJunction ecosystem, such as GraphQLAIClient and GraphQLActionClient.
 * 
 * @example
 * ```typescript
 * // Create the client
 * const registryClient = new GraphQLComponentRegistryClient(graphQLProvider);
 * 
 * // Get a component from a registry
 * const component = await registryClient.GetRegistryComponent({
 *   registryName: "MJ",
 *   namespace: "core/ui",
 *   name: "DataGrid",
 *   version: "1.0.0"
 * });
 * 
 * // Search for components
 * const searchResult = await registryClient.SearchRegistryComponents({
 *   query: "dashboard",
 *   type: "dashboard",
 *   limit: 10
 * });
 * ```
 */
export class GraphQLComponentRegistryClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     * @private
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLComponentRegistryClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Get a specific component from a registry.
     * 
     * This method fetches a component specification from an external registry
     * through the MJ API server. The server handles authentication with the
     * registry and may cache the result for performance.
     * 
     * @param params The parameters for getting the component
     * @returns A Promise that resolves to a ComponentSpec
     * 
     * @example
     * ```typescript
     * const component = await registryClient.GetRegistryComponent({
     *   registryName: "MJ",
     *   namespace: "core/ui",
     *   name: "DataGrid",
     *   version: "2.0.0"
     * });
     * 
     * console.log('Component:', component.name);
     * console.log('Description:', component.description);
     * console.log('Code:', component.code);
     * ```
     */
    public async GetRegistryComponent(params: GetRegistryComponentParams): Promise<ComponentSpec | null> {
        try {
            // Build the query - specification is now a JSON string
            const query = gql`
                query GetRegistryComponent(
                    $registryName: String!,
                    $namespace: String!,
                    $name: String!,
                    $version: String,
                    $hash: String
                ) {
                    GetRegistryComponent(
                        registryName: $registryName,
                        namespace: $namespace,
                        name: $name,
                        version: $version,
                        hash: $hash
                    ) {
                        hash
                        notModified
                        message
                        specification
                    }
                }
            `;

            // Prepare variables
            const variables: Record<string, any> = {
                registryName: params.registryName,
                namespace: params.namespace,
                name: params.name
            };

            if (params.version !== undefined) {
                variables.version = params.version;
            }
            
            if (params.hash !== undefined) {
                variables.hash = params.hash;
            }

            // Execute the query
            const result = await this._dataProvider.ExecuteGQL(query, variables);

            // Handle new response structure with hash
            if (result && result.GetRegistryComponent) {
                const response = result.GetRegistryComponent as ComponentSpecWithHash;
                
                // If not modified and no specification, return null (client should use cache)
                if (response.notModified && !response.specification) {
                    return null;
                }
                
                // Parse the JSON string specification if available
                if (response.specification) {
                    // If it's already an object, return it
                    if (typeof response.specification === 'object') {
                        return response.specification as ComponentSpec;
                    }
                    // Otherwise parse the JSON string
                    try {
                        return JSON.parse(response.specification) as ComponentSpec;
                    } catch (e) {
                        LogError(`Failed to parse component specification: ${e}`);
                        return null;
                    }
                }
                
                return null;
            }

            return null;
        } catch (e) {
            LogError(e);
            throw new Error(`Failed to get registry component: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }

    /**
     * Get a component from registry with hash and caching metadata.
     * Returns the full response including hash and notModified flag.
     * 
     * @param params - Parameters for fetching the component
     * @returns Full response with specification, hash, and caching metadata
     * 
     * @example
     * ```typescript
     * const response = await client.GetRegistryComponentWithHash({
     *   registryName: 'MJ',
     *   namespace: 'core/ui',
     *   name: 'DataGrid',
     *   version: '1.0.0',
     *   hash: 'abc123...'
     * });
     * 
     * if (response.notModified) {
     *   // Use cached version
     * } else {
     *   // Use response.specification
     * }
     * ```
     */
    public async GetRegistryComponentWithHash(params: GetRegistryComponentParams): Promise<ComponentSpecWithHash> {
        try {
            // Build the query - same as GetRegistryComponent
            const query = gql`
                query GetRegistryComponent(
                    $registryName: String!,
                    $namespace: String!,
                    $name: String!,
                    $version: String,
                    $hash: String
                ) {
                    GetRegistryComponent(
                        registryName: $registryName,
                        namespace: $namespace,
                        name: $name,
                        version: $version,
                        hash: $hash
                    ) {
                        hash
                        notModified
                        message
                        specification
                    }
                }
            `;

            // Prepare variables
            const variables: Record<string, any> = {
                registryName: params.registryName,
                namespace: params.namespace,
                name: params.name
            };

            if (params.version !== undefined) {
                variables.version = params.version;
            }
            
            if (params.hash !== undefined) {
                variables.hash = params.hash;
            }

            // Execute the query
            const result = await this._dataProvider.ExecuteGQL(query, variables);

            // Return the full response with parsed specification
            if (result && result.GetRegistryComponent) {
                const response = result.GetRegistryComponent;
                let spec: ComponentSpec | undefined;
                if (response.specification) {
                    try {
                        spec = JSON.parse(response.specification) as ComponentSpec;
                    } catch (e) {
                        LogError(`Failed to parse component specification in GetRegistryComponentWithHash: ${e}`);
                        spec = undefined;
                    }
                }
                return {
                    specification: spec,
                    hash: response.hash,
                    notModified: response.notModified,
                    message: response.message
                } as ComponentSpecWithHash;
            }

            // Return empty response if nothing found
            return {
                specification: undefined,
                hash: '',
                notModified: false,
                message: 'Component not found'
            };
        } catch (e) {
            LogError(e);
            throw new Error(`Failed to get registry component with hash: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }

    /**
     * Search for components in registries.
     * 
     * This method searches for components across one or more registries
     * based on the provided criteria. Results are paginated for performance.
     * 
     * @param params The search parameters
     * @returns A Promise that resolves to a RegistryComponentSearchResult
     * 
     * @example
     * ```typescript
     * const searchResult = await registryClient.SearchRegistryComponents({
     *   query: "dashboard",
     *   type: "dashboard",
     *   tags: ["analytics", "reporting"],
     *   limit: 20,
     *   offset: 0
     * });
     * 
     * console.log(`Found ${searchResult.total} components`);
     * searchResult.components.forEach(component => {
     *   console.log(`- ${component.name}: ${component.description}`);
     * });
     * ```
     */
    public async SearchRegistryComponents(params: SearchRegistryComponentsParams): Promise<RegistryComponentSearchResult> {
        try {
            // Build the query
            const query = gql`
                query SearchRegistryComponents($params: SearchRegistryComponentsInput!) {
                    SearchRegistryComponents(params: $params) {
                        components
                        total
                        offset
                        limit
                    }
                }
            `;

            // Execute the query
            const result = await this._dataProvider.ExecuteGQL(query, { params });

            // Return the search result with parsed components
            if (result && result.SearchRegistryComponents) {
                const searchResult = result.SearchRegistryComponents;
                return {
                    components: searchResult.components.map((json: string) => JSON.parse(json) as ComponentSpec),
                    total: searchResult.total,
                    offset: searchResult.offset,
                    limit: searchResult.limit
                } as RegistryComponentSearchResult;
            }

            return {
                components: [],
                total: 0,
                offset: 0,
                limit: params.limit || 10
            };
        } catch (e) {
            LogError(e);
            throw new Error(`Failed to search registry components: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }

    /**
     * Resolve the dependency tree for a component.
     * 
     * This method fetches the complete dependency tree for a component,
     * including all transitive dependencies. The server handles circular
     * dependency detection and marks them appropriately.
     * 
     * @param registryId The registry ID
     * @param componentId The component ID
     * @returns A Promise that resolves to a ComponentDependencyTree
     * 
     * @example
     * ```typescript
     * const dependencyTree = await registryClient.ResolveComponentDependencies(
     *   "mj-central",
     *   "component-123"
     * );
     * 
     * console.log(`Component has ${dependencyTree.totalCount} total dependencies`);
     * if (dependencyTree.circular) {
     *   console.warn('Circular dependency detected!');
     * }
     * ```
     */
    public async ResolveComponentDependencies(
        registryId: string,
        componentId: string
    ): Promise<ComponentDependencyTree | null> {
        try {
            // Build the query
            const query = gql`
                query ResolveComponentDependencies(
                    $registryId: String!,
                    $componentId: String!
                ) {
                    ResolveComponentDependencies(
                        registryId: $registryId,
                        componentId: $componentId
                    ) {
                        componentId
                        name
                        namespace
                        version
                        circular
                        totalCount
                        dependencies {
                            componentId
                            name
                            namespace
                            version
                            circular
                            totalCount
                        }
                    }
                }
            `;

            // Execute the query
            const result = await this._dataProvider.ExecuteGQL(query, {
                registryId,
                componentId
            });

            // Return the dependency tree
            if (result && result.ResolveComponentDependencies) {
                return result.ResolveComponentDependencies as ComponentDependencyTree;
            }

            return null;
        } catch (e) {
            LogError(e);
            throw new Error(`Failed to resolve component dependencies: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if a specific version of a component exists in a registry.
     * 
     * @param params The parameters for checking component existence
     * @returns A Promise that resolves to true if the component exists, false otherwise
     * 
     * @example
     * ```typescript
     * const exists = await registryClient.ComponentExists({
     *   registryId: "mj-central",
     *   namespace: "core/ui",
     *   name: "DataGrid",
     *   version: "2.0.0"
     * });
     * 
     * if (exists) {
     *   console.log('Component is available');
     * }
     * ```
     */
    public async ComponentExists(params: GetRegistryComponentParams): Promise<boolean> {
        try {
            const component = await this.GetRegistryComponent(params);
            return component !== null;
        } catch (e) {
            // If we get an error, assume the component doesn't exist
            return false;
        }
    }

    /**
     * Get the latest version of a component.
     * 
     * @param registryId The registry ID
     * @param namespace The component namespace
     * @param name The component name
     * @returns A Promise that resolves to the latest version string or null
     * 
     * @example
     * ```typescript
     * const latestVersion = await registryClient.GetLatestVersion(
     *   "mj-central",
     *   "core/ui",
     *   "DataGrid"
     * );
     * 
     * console.log(`Latest version: ${latestVersion}`);
     * ```
     */
    public async GetLatestVersion(
        registryName: string,
        namespace: string,
        name: string
    ): Promise<string | null> {
        try {
            const component = await this.GetRegistryComponent({
                registryName,
                namespace,
                name,
                version: 'latest'
            });

            return component?.version || null;
        } catch (e) {
            LogError(e);
            return null;
        }
    }

    /**
     * Send feedback for a component.
     *
     * This is a registry-agnostic method that allows submitting feedback
     * for any component from any registry. The feedback can include ratings,
     * comments, and associations with conversations, reports, or dashboards.
     *
     * @param params The feedback parameters
     * @returns A Promise that resolves to a ComponentFeedbackResponse
     *
     * @example
     * ```typescript
     * const response = await registryClient.SendComponentFeedback({
     *   componentName: 'DataGrid',
     *   componentNamespace: 'core/ui',
     *   componentVersion: '1.0.0',
     *   registryName: 'MJ',
     *   rating: 5,
     *   feedbackType: 'feature-request',
     *   comments: 'Would love to see export to Excel functionality',
     *   conversationID: 'conv-123'
     * });
     *
     * if (response.success) {
     *   console.log('Feedback submitted successfully!');
     *   if (response.feedbackID) {
     *     console.log(`Feedback ID: ${response.feedbackID}`);
     *   }
     * } else {
     *   console.error('Feedback submission failed:', response.error);
     * }
     * ```
     */
    public async SendComponentFeedback(params: ComponentFeedbackParams): Promise<ComponentFeedbackResponse> {
        try {
            // Build the mutation
            const mutation = gql`
                mutation SendComponentFeedback($feedback: ComponentFeedbackInput!) {
                    SendComponentFeedback(feedback: $feedback) {
                        success
                        feedbackID
                        error
                    }
                }
            `;

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, { feedback: params });

            // Return the response
            if (result && result.SendComponentFeedback) {
                return result.SendComponentFeedback as ComponentFeedbackResponse;
            }

            return {
                success: false,
                error: 'No response from server'
            };
        } catch (e) {
            LogError(e);
            return {
                success: false,
                error: e instanceof Error ? e.message : 'Unknown error'
            };
        }
    }
}