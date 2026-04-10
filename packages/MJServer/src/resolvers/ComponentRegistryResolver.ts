import { Arg, Ctx, Field, InputType, ObjectType, Query, Mutation, Resolver } from 'type-graphql';
import { UserInfo, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { MJComponentEntity, MJComponentRegistryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    ComponentRegistryClient,
    ComponentResponse,
    ComponentSearchResult,
    DependencyTree,
    RegistryError,
    RegistryErrorCode,
    ComponentFeedbackParams as SDKComponentFeedbackParams,
    ComponentFeedbackResponse as SDKComponentFeedbackResponse
} from '@memberjunction/component-registry-client-sdk';
import { AppContext } from '../types.js';
import { configInfo } from '../config.js';

/**
 * GraphQL types for Component Registry operations
 */

@ObjectType()
class ComponentSpecWithHashType {
    @Field(() => String, { nullable: true })
    specification?: string; // JSON string of ComponentSpec
    
    @Field(() => String)
    hash: string;
    
    @Field(() => Boolean)
    notModified: boolean;
    
    @Field(() => String, { nullable: true })
    message?: string;
}

@InputType()
class SearchRegistryComponentsInput {
    @Field({ nullable: true })
    registryId?: string;

    @Field({ nullable: true })
    namespace?: string;

    @Field({ nullable: true })
    query?: string;

    @Field({ nullable: true })
    type?: string;

    @Field(() => [String], { nullable: true })
    tags?: string[];

    @Field({ nullable: true })
    limit?: number;

    @Field({ nullable: true })
    offset?: number;
}

@ObjectType()
class RegistryComponentSearchResultType {
    @Field(() => [String])
    components: string[]; // Array of JSON strings of ComponentSpec

    @Field()
    total: number;

    @Field()
    offset: number;

    @Field()
    limit: number;
}

@ObjectType()
class ComponentDependencyTreeType {
    @Field()
    componentId: string;

    @Field({ nullable: true })
    name?: string;

    @Field({ nullable: true })
    namespace?: string;

    @Field({ nullable: true })
    version?: string;

    @Field({ nullable: true })
    circular?: boolean;

    @Field({ nullable: true })
    totalCount?: number;

    @Field(() => [ComponentDependencyTreeType], { nullable: true })
    dependencies?: ComponentDependencyTreeType[];
}

/**
 * Input type for submitting component feedback
 * Registry-agnostic feedback collection for any component from any registry
 */
@InputType()
class ComponentFeedbackInput {
    @Field()
    componentName: string;

    @Field()
    componentNamespace: string;

    @Field({ nullable: true })
    componentVersion?: string;

    @Field({ nullable: true })
    registryName?: string;

    @Field()
    rating: number;

    @Field({ nullable: true })
    feedbackType?: string;

    @Field({ nullable: true })
    comments?: string;

    @Field({ nullable: true })
    conversationID?: string;

    @Field({ nullable: true })
    conversationDetailID?: string;

    @Field({ nullable: true })
    reportID?: string;

    @Field({ nullable: true })
    dashboardID?: string;
}

/**
 * Response type for component feedback submission
 */
@ObjectType()
class ComponentFeedbackResponse {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    feedbackID?: string;

    @Field({ nullable: true })
    error?: string;
}

/**
 * Resolver for Component Registry operations
 * 
 * Environment Variables for Development:
 * - REGISTRY_URI_OVERRIDE_<REGISTRY_NAME>: Override the URI for a specific registry
 *   Example: REGISTRY_URI_OVERRIDE_MJ_CENTRAL=http://localhost:8080
 *   Registry names are converted to uppercase with non-alphanumeric chars replaced by underscores
 * 
 * - REGISTRY_API_KEY_<REGISTRY_NAME>: API key for authenticating with the registry
 *   Example: REGISTRY_API_KEY_MJ_CENTRAL=your-api-key-here
 */
@Resolver()
export class ComponentRegistryExtendedResolver {
    private componentEngine = ComponentMetadataEngine.Instance;
    
    constructor() {
        // No longer pre-initialize clients - create on demand
    }
    
    /**
     * Get a component from a registry with optional hash for caching
     */
    @Query(() => ComponentSpecWithHashType)
    async GetRegistryComponent(
        @Arg('registryName') registryName: string,
        @Arg('namespace') namespace: string,
        @Arg('name') name: string,
        @Ctx() { userPayload }: AppContext,
        @Arg('version', { nullable: true }) version?: string,
        @Arg('hash', { nullable: true }) hash?: string
    ): Promise<ComponentSpecWithHashType> {
        try {
            // Get user from cache
            const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email?.trim().toLowerCase());
            if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);
            
            // Get registry from database by name
            const registry = await this.getRegistryByName(registryName, user);
            if (!registry) {
                throw new Error(`Registry not found: ${registryName}`);
            }
            
            // Check user permissions (use registry ID for permission check)
            await this.checkUserAccess(user, registry.ID);
            
            // Initialize component engine
            await this.componentEngine.Config(false, user);
            
            // Create client on-demand for this registry
            const registryClient = this.createClientForRegistry(registry);
            
            // Fetch component from registry with hash support
            const response = await registryClient.getComponentWithHash({
                registry: registry.Name,
                namespace,
                name,
                version: version || 'latest',
                hash: hash,
                userEmail: user.Email
            });
            
            // If not modified (304), return response with notModified flag
            if (response.notModified) {
                LogStatus(`Component ${namespace}/${name} not modified (hash: ${response.hash})`);
                return {
                    specification: undefined,
                    hash: response.hash,
                    notModified: true,
                    message: response.message || 'Not modified'
                };
            }
            
            // Extract the specification from the response
            const component = response.specification;
            if (!component) {
                throw new Error(`Component ${namespace}/${name} returned without specification`);
            }
            
            // Optional: Cache in database if configured
            if (this.shouldCache(registry)) {
                await this.cacheComponent(component, registry.ID, user);
            }
            
            // Return the ComponentSpec as a JSON string
            return {
                specification: JSON.stringify(component),
                hash: response.hash,
                notModified: false,
                message: undefined
            };
        } catch (error) {
            if (error instanceof RegistryError) {
                // Log specific registry errors
                LogError(`Registry error [${error.code}]: ${error.message}`);
                if (error.code === RegistryErrorCode.COMPONENT_NOT_FOUND) {
                    // Return an error response structure
                    return {
                        specification: undefined,
                        hash: '',
                        notModified: false,
                        message: 'Component not found'
                    };
                }
            }
            LogError(error);
            throw error;
        }
    }
    
    /**
     * Search for components in registries
     */
    @Query(() => RegistryComponentSearchResultType)
    async SearchRegistryComponents(
        @Arg('params') params: SearchRegistryComponentsInput,
        @Ctx() { userPayload }: AppContext
    ): Promise<RegistryComponentSearchResultType> {
        try {
            // Get user from cache
            const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email?.trim().toLowerCase());
            if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);
            
            // If a specific registry is specified, use only that one
            if (params.registryId) {
                await this.checkUserAccess(user, params.registryId);
                
                // Get registry and create client on-demand
                const registry = await this.getRegistry(params.registryId, user);
                if (!registry) {
                    throw new Error(`Registry not found: ${params.registryId}`);
                }
                
                const client = this.createClientForRegistry(registry);
                
                const result = await client.searchComponents({
                    namespace: params.namespace,
                    query: params.query,
                    type: params.type,
                    tags: params.tags,
                    limit: params.limit || 10,
                    offset: params.offset || 0
                });
                
                return this.mapSearchResult(result);
            }
            
            // Otherwise, search across all active registries
            const allResults: ComponentSpec[] = [];
            
            // Get all active registries from database
            await this.componentEngine.Config(false, user);
            const activeRegistries = this.componentEngine.ComponentRegistries?.filter(
                r => r.Status === 'Active'
            ) || [];
            
            for (const registry of activeRegistries) {
                try {
                    await this.checkUserAccess(user, registry.ID);
                    
                    const client = this.createClientForRegistry(registry);
                    const result = await client.searchComponents({
                        namespace: params.namespace,
                        query: params.query,
                        type: params.type,
                        tags: params.tags,
                        limit: params.limit || 10,
                        offset: 0 // Reset offset for each registry
                    });
                    
                    allResults.push(...result.components);
                } catch (error) {
                    // Log but continue with other registries
                    LogError(`Failed to search registry ${registry.Name}: ${error}`);
                }
            }
            
            // Apply pagination to combined results
            const offset = params.offset || 0;
            const limit = params.limit || 10;
            const paginatedResults = allResults.slice(offset, offset + limit);
            
            return {
                components: paginatedResults.map(spec => JSON.stringify(spec)),
                total: allResults.length,
                offset,
                limit
            };
        } catch (error) {
            LogError(error);
            throw error;
        }
    }
    
    /**
     * Resolve component dependencies
     */
    @Query(() => ComponentDependencyTreeType, { nullable: true })
    async ResolveComponentDependencies(
        @Arg('registryName') registryName: string,
        @Arg('componentId') componentId: string,
        @Ctx() { userPayload }: AppContext
    ): Promise<ComponentDependencyTreeType | null> {
        try {
            // Get user from cache
            const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email?.trim().toLowerCase());
            if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);
            
            // Get registry to find its ID for permission check
            const registry = await this.getRegistryByName(registryName, user);
            if (!registry) {
                throw new Error(`Registry not found: ${registryName}`);
            }
            
            await this.checkUserAccess(user, registry.ID);
            
            // Create client on-demand
            const client = this.createClientForRegistry(registry);
            
            const tree = await client.resolveDependencies(componentId);
            return tree as ComponentDependencyTreeType;
        } catch (error) {
            LogError(error);
            throw error;
        }
    }
    
    /**
     * Check if user has access to a registry
     */
    private async checkUserAccess(userInfo: UserInfo | undefined, registryId: string): Promise<void> {
        // TODO: Implement actual permission checking
        // For now, just ensure user is authenticated
        if (!userInfo) {
            throw new Error('User must be authenticated to access component registries');
        }
    }
    
    /**
     * Get registry entity from database by ID
     */
    private async getRegistry(registryId: string, userInfo: UserInfo): Promise<MJComponentRegistryEntity | null> {
        try {
            await this.componentEngine.Config(false, userInfo);
            
            const registry = this.componentEngine.ComponentRegistries?.find(
                r => UUIDsEqual(r.ID, registryId)
            );
            
            return registry || null;
        } catch (error) {
            LogError(error);
            return null;
        }
    }
    
    /**
     * Get registry entity from database by Name
     */
    private async getRegistryByName(registryName: string, userInfo: UserInfo): Promise<MJComponentRegistryEntity | null> {
        try {
            await this.componentEngine.Config(false, userInfo);
            
            const registry = this.componentEngine.ComponentRegistries?.find(
                r => r.Name === registryName && r.Status === 'Active'
            );
            
            return registry || null;
        } catch (error) {
            LogError(error);
            return null;
        }
    }
    
    /**
     * Get the registry URI, checking for environment variable override first
     * Environment variable format: REGISTRY_URI_OVERRIDE_<REGISTRY_NAME>
     * Example: REGISTRY_URI_OVERRIDE_MJ_CENTRAL=http://localhost:8080
     */
    private getRegistryUri(registry: MJComponentRegistryEntity): string {
        if (!registry.Name) {
            return registry.URI || '';
        }
        
        // Convert registry name to environment variable format
        // Replace spaces, hyphens, and other non-alphanumeric chars with underscores
        const envVarName = `REGISTRY_URI_OVERRIDE_${registry.Name.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
        
        // Check for environment variable override
        const override = process.env[envVarName];
        if (override) {
            LogStatus(`Using URI override for registry ${registry.Name}: ${override}`);
            return override;
        }
        
        // Use production URI from database
        return registry.URI || '';
    }

    /**
     * Create a client for a registry on-demand
     * Checks configuration first, then falls back to default settings
     */
    private createClientForRegistry(registry: MJComponentRegistryEntity): ComponentRegistryClient {
        // Check if there's a configuration for this registry
        const config = configInfo.componentRegistries?.find(r =>
            UUIDsEqual(r.id, registry.ID) || r.name === registry.Name
        );

        // Get API key from environment or config
        const apiKey = process.env[`REGISTRY_API_KEY_${registry.ID.replace(/-/g, '_').toUpperCase()}`] ||
                      process.env[`REGISTRY_API_KEY_${registry.Name?.replace(/-/g, '_').toUpperCase()}`] ||
                      config?.apiKey;
        
        // Get the registry URI (with possible override)
        const baseUrl = this.getRegistryUri(registry);
        
        // Build retry policy with defaults
        const retryPolicy = {
            maxRetries: config?.retryPolicy?.maxRetries ?? 3,
            initialDelay: config?.retryPolicy?.initialDelay ?? 1000,
            maxDelay: config?.retryPolicy?.maxDelay ?? 10000,
            backoffMultiplier: config?.retryPolicy?.backoffMultiplier ?? 2
        };
        
        // Use config settings if available, otherwise defaults
        return new ComponentRegistryClient({
            baseUrl: baseUrl,
            apiKey: apiKey,
            timeout: config?.timeout || 30000,
            retryPolicy: retryPolicy,
            headers: config?.headers
        });
    }
    
    /**
     * Check if component should be cached
     */
    private shouldCache(registry: MJComponentRegistryEntity): boolean {
        // Check config for caching settings
        const config = configInfo.componentRegistries?.find(r =>
            UUIDsEqual(r.id, registry.ID) || r.name === registry.Name
        );
        return config?.cache !== false; // Cache by default
    }
    
    /**
     * Cache component in database
     */
    private async cacheComponent(
        component: ComponentSpec,
        registryId: string,
        userInfo: UserInfo
    ): Promise<void> {
        try {
            // Find or create component entity
            const md = new Metadata();
            const componentEntity = await md.GetEntityObject<MJComponentEntity>('MJ: Components', userInfo);
            
            // Check if component already exists
            const existingComponent = this.componentEngine.Components?.find(
                c => c.Name === component.name && 
                     c.Namespace === component.namespace &&
                     UUIDsEqual(c.SourceRegistryID, registryId)
            );
            
            if (existingComponent) {
                // Update existing component
                if (!await componentEntity.Load(existingComponent.ID)) {
                    throw new Error(`Failed to load component: ${existingComponent.ID}`);
                }
            } else {
                // Create new component
                componentEntity.NewRecord();
                componentEntity.SourceRegistryID = registryId;
            }
            
            // Update component fields
            componentEntity.Name = component.name;
            componentEntity.Namespace = component.namespace || '';
            componentEntity.Version = component.version || '1.0.0';
            componentEntity.Title = component.title;
            componentEntity.Description = component.description;
            componentEntity.Type = this.mapComponentType(component.type);
            componentEntity.FunctionalRequirements = component.functionalRequirements;
            componentEntity.TechnicalDesign = component.technicalDesign;
            componentEntity.Specification = JSON.stringify(component);
            componentEntity.LastSyncedAt = new Date();
            
            if (!existingComponent) {
                componentEntity.ReplicatedAt = new Date();
            }
            
            // Save component
            const result = await componentEntity.Save();
            if (!result) {
                throw new Error(`Failed to cache component: ${component.name}`);
            }
            
            // Refresh metadata cache
            await this.componentEngine.Config(true, userInfo);
        } catch (error) {
            // Log but don't throw - caching failure shouldn't break the operation
            LogError('Failed to cache component:');
        }
    }
    
    /**
     * Map component type string to entity enum
     */
    private mapComponentType(type: string): MJComponentEntity['Type'] {
        const typeMap: Record<string, MJComponentEntity['Type']> = {
            'report': 'Report',
            'dashboard': 'Dashboard',
            'form': 'Form',
            'table': 'Table',
            'chart': 'Chart',
            'navigation': 'Navigation',
            'search': 'Search',
            'widget': 'Widget',
            'utility': 'Utility',
            'other': 'Other'
        };
        
        return typeMap[type.toLowerCase()] || 'Other';
    }
    
    /**
     * Map search result to GraphQL type
     */
    private mapSearchResult(result: ComponentSearchResult): RegistryComponentSearchResultType {
        return {
            components: result.components.map(spec => JSON.stringify(spec)),
            total: result.total,
            offset: result.offset,
            limit: result.limit
        };
    }

    /**
     * Send feedback for a component from any registry
     * This is a registry-agnostic mutation that allows feedback collection
     * for components from any source registry (Skip, MJ Central, etc.)
     */
    @Mutation(() => ComponentFeedbackResponse)
    async SendComponentFeedback(
        @Arg('feedback') feedback: ComponentFeedbackInput,
        @Ctx() { userPayload }: AppContext
    ): Promise<ComponentFeedbackResponse> {
        try {
            // Get user from cache
            const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email?.trim().toLowerCase());
            if (!user) {
                return {
                    success: false,
                    error: `User ${userPayload.email} not found in UserCache`
                };
            }

            // Registry name is required for feedback submission
            if (!feedback.registryName) {
                return {
                    success: false,
                    error: 'Registry name is required for feedback submission'
                };
            }

            // Get registry configuration
            const registry = await this.getRegistryByName(feedback.registryName, user);
            if (!registry) {
                return {
                    success: false,
                    error: `Registry not found: ${feedback.registryName}`
                };
            }

            // Check user permissions
            await this.checkUserAccess(user, registry.ID);

            // Create client using the same pattern as GetRegistryComponent
            // This respects REGISTRY_URI_OVERRIDE_* and REGISTRY_API_KEY_* environment variables
            const registryClient = this.createClientForRegistry(registry);

            const sdkParams: SDKComponentFeedbackParams = {
                componentName: feedback.componentName,
                componentNamespace: feedback.componentNamespace,
                componentVersion: feedback.componentVersion,
                registryName: feedback.registryName,
                rating: feedback.rating,
                feedbackType: feedback.feedbackType,
                comments: feedback.comments,
                conversationID: feedback.conversationID,
                conversationDetailID: feedback.conversationDetailID,
                reportID: feedback.reportID,
                dashboardID: feedback.dashboardID,
                userEmail: user.Email  // Pass the authenticated user's email to the registry
            };

            const result = await registryClient.submitFeedback(sdkParams);

            return result;
        } catch (error) {
            LogError(error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}