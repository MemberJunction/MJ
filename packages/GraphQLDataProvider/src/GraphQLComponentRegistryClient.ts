import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { ComponentSpec } from "@memberjunction/interactive-component-types";

/**
 * Parameters for getting a component from registry
 */
export interface GetRegistryComponentParams {
    /**
     * Registry ID from the database
     */
    registryId: string;
    
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
}

/**
 * Parameters for searching registry components
 */
export interface SearchRegistryComponentsParams {
    /**
     * Optional registry ID filter
     */
    registryId?: string;
    
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
 *   registryId: "mj-central",
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
     *   registryId: "mj-central",
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
            // Build the query
            const query = gql`
                query GetRegistryComponent(
                    $registryId: String!,
                    $namespace: String!,
                    $name: String!,
                    $version: String
                ) {
                    GetRegistryComponent(
                        registryId: $registryId,
                        namespace: $namespace,
                        name: $name,
                        version: $version
                    ) {
                        name
                        location
                        registry
                        namespace
                        version
                        selectionReasoning
                        createNewVersion
                        description
                        title
                        type
                        code
                        functionalRequirements
                        dataRequirements {
                            entities {
                                name
                                type
                                description
                                fields
                                filters
                                sortBy
                                joins {
                                    sourceEntity
                                    sourceField
                                    targetEntity
                                    targetField
                                    type
                                }
                            }
                            queries {
                                name
                                description
                                query
                                variables
                                returnType
                            }
                        }
                        technicalDesign
                        properties {
                            name
                            type
                            description
                            required
                            defaultValue
                        }
                        events {
                            name
                            description
                            parameters {
                                name
                                type
                                description
                                required
                            }
                        }
                        libraries {
                            name
                            type
                            version
                            provider
                            cdn
                            description
                        }
                        dependencies {
                            name
                            location
                            registry
                            namespace
                            version
                            selectionReasoning
                            createNewVersion
                            description
                            title
                            type
                            code
                        }
                    }
                }
            `;

            // Prepare variables
            const variables: Record<string, any> = {
                registryId: params.registryId,
                namespace: params.namespace,
                name: params.name
            };

            if (params.version !== undefined) {
                variables.version = params.version;
            }

            // Execute the query
            const result = await this._dataProvider.ExecuteGQL(query, variables);

            // Return the component spec
            if (result && result.GetRegistryComponent) {
                return result.GetRegistryComponent as ComponentSpec;
            }

            return null;
        } catch (e) {
            LogError(e);
            throw new Error(`Failed to get registry component: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
                        components {
                            name
                            location
                            registry
                            namespace
                            version
                            description
                            title
                            type
                            functionalRequirements
                            technicalDesign
                        }
                        total
                        offset
                        limit
                    }
                }
            `;

            // Execute the query
            const result = await this._dataProvider.ExecuteGQL(query, { params });

            // Return the search result
            if (result && result.SearchRegistryComponents) {
                return result.SearchRegistryComponents as RegistryComponentSearchResult;
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
        registryId: string,
        namespace: string,
        name: string
    ): Promise<string | null> {
        try {
            const component = await this.GetRegistryComponent({
                registryId,
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
}