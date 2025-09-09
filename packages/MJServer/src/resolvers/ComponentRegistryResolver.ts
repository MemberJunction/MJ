import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { UserInfo, Metadata, LogError } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { ComponentEntity, ComponentRegistryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { 
    ComponentRegistryClient,
    ComponentSearchResult,
    DependencyTree,
    RegistryError,
    RegistryErrorCode
} from '@memberjunction/component-registry-client-sdk';
import { AppContext } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Load configuration using cosmiconfig pattern
let mjConfig: any = {};
try {
    // Try to load from mj.config.cjs in the repository root
    const configPath = path.resolve(process.cwd(), 'mj.config.cjs');
    if (fs.existsSync(configPath)) {
        mjConfig = require(configPath);
    }
} catch (error) {
    console.warn('Could not load mj.config.cjs:', error);
}

/**
 * GraphQL types for Component Registry operations
 */

@ObjectType()
class ComponentPropertyType {
    @Field()
    name: string;

    @Field()
    type: string;

    @Field({ nullable: true })
    description?: string;

    @Field()
    required: boolean;

    @Field({ nullable: true })
    defaultValue?: string;
}

@ObjectType()
class ComponentEventParameterType {
    @Field()
    name: string;

    @Field()
    type: string;

    @Field({ nullable: true })
    description?: string;

    @Field()
    required: boolean;
}

@ObjectType()
class ComponentEventType {
    @Field()
    name: string;

    @Field({ nullable: true })
    description?: string;

    @Field(() => [ComponentEventParameterType], { nullable: true })
    parameters?: ComponentEventParameterType[];
}

@ObjectType()
class ComponentLibraryType {
    @Field()
    name: string;

    @Field()
    type: string;

    @Field({ nullable: true })
    version?: string;

    @Field({ nullable: true })
    provider?: string;

    @Field({ nullable: true })
    cdn?: string;

    @Field({ nullable: true })
    description?: string;
}

@ObjectType()
class EntityJoinType {
    @Field()
    sourceEntity: string;

    @Field()
    sourceField: string;

    @Field()
    targetEntity: string;

    @Field()
    targetField: string;

    @Field()
    type: string;
}

@ObjectType()
class EntityRequirementType {
    @Field()
    name: string;

    @Field()
    type: string;

    @Field({ nullable: true })
    description?: string;

    @Field(() => [String], { nullable: true })
    fields?: string[];

    @Field({ nullable: true })
    filters?: string;

    @Field({ nullable: true })
    sortBy?: string;

    @Field(() => [EntityJoinType], { nullable: true })
    joins?: EntityJoinType[];
}

@ObjectType()
class QueryRequirementType {
    @Field()
    name: string;

    @Field({ nullable: true })
    description?: string;

    @Field()
    query: string;

    @Field({ nullable: true })
    variables?: string;

    @Field()
    returnType: string;
}

@ObjectType()
class ComponentDataRequirementsType {
    @Field(() => [EntityRequirementType], { nullable: true })
    entities?: EntityRequirementType[];

    @Field(() => [QueryRequirementType], { nullable: true })
    queries?: QueryRequirementType[];
}

@ObjectType()
class ComponentSpecType {
    @Field()
    name: string;

    @Field()
    location: string;

    @Field({ nullable: true })
    registry?: string;

    @Field({ nullable: true })
    namespace?: string;

    @Field({ nullable: true })
    version?: string;

    @Field({ nullable: true })
    selectionReasoning?: string;

    @Field({ nullable: true })
    createNewVersion?: boolean;

    @Field()
    description: string;

    @Field()
    title: string;

    @Field()
    type: string;

    @Field()
    code: string;

    @Field()
    functionalRequirements: string;

    @Field(() => ComponentDataRequirementsType, { nullable: true })
    dataRequirements?: ComponentDataRequirementsType;

    @Field()
    technicalDesign: string;

    @Field(() => [ComponentPropertyType], { nullable: true })
    properties?: ComponentPropertyType[];

    @Field(() => [ComponentEventType], { nullable: true })
    events?: ComponentEventType[];

    @Field(() => [ComponentLibraryType], { nullable: true })
    libraries?: ComponentLibraryType[];

    @Field(() => [ComponentSpecType], { nullable: true })
    dependencies?: ComponentSpecType[];
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
    @Field(() => [ComponentSpecType])
    components: ComponentSpecType[];

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
 * Resolver for Component Registry operations
 */
@Resolver()
export class ComponentRegistryExtendedResolver {
    private componentEngine = ComponentMetadataEngine.Instance;
    
    constructor() {
        // No longer pre-initialize clients - create on demand
    }
    
    /**
     * Get a component from a registry
     */
    @Query(() => ComponentSpecType, { nullable: true })
    async GetRegistryComponent(
        @Arg('registryName') registryName: string,
        @Arg('namespace') namespace: string,
        @Arg('name') name: string,
        @Ctx() { userPayload }: AppContext,
        @Arg('version', { nullable: true }) version?: string
    ): Promise<ComponentSpec | null> {
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
            
            // Fetch component from registry
            const component = await registryClient.getComponent({
                registry: registry.Name,
                namespace,
                name,
                version: version || 'latest'
            });
            
            // Optional: Cache in database if configured
            if (this.shouldCache(registry)) {
                await this.cacheComponent(component, registryName, user);
            }
            
            return component;
        } catch (error) {
            if (error instanceof RegistryError) {
                // Log specific registry errors
                LogError(`Registry error [${error.code}]: ${error.message}`);
                if (error.code === RegistryErrorCode.COMPONENT_NOT_FOUND) {
                    return null;
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
                components: this.convertComponentSpecs(paginatedResults),
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
    private async getRegistry(registryId: string, userInfo: UserInfo): Promise<ComponentRegistryEntity | null> {
        try {
            await this.componentEngine.Config(false, userInfo);
            
            const registry = this.componentEngine.ComponentRegistries?.find(
                r => r.ID === registryId
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
    private async getRegistryByName(registryName: string, userInfo: UserInfo): Promise<ComponentRegistryEntity | null> {
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
     * Create a client for a registry on-demand
     * Checks configuration first, then falls back to default settings
     */
    private createClientForRegistry(registry: ComponentRegistryEntity): ComponentRegistryClient {
        // Check if there's a configuration for this registry
        const config = mjConfig.componentRegistries?.find((r: any) => 
            r.id === registry.ID || r.name === registry.Name
        );
        
        // Get API key from environment or config
        const apiKey = process.env[`REGISTRY_API_KEY_${registry.ID.replace(/-/g, '_').toUpperCase()}`] ||
                      process.env[`REGISTRY_API_KEY_${registry.Name?.replace(/-/g, '_').toUpperCase()}`] ||
                      config?.apiKey;
        
        // Use config settings if available, otherwise defaults
        return new ComponentRegistryClient({
            baseUrl: registry.URI || '',
            apiKey: apiKey,
            timeout: config?.timeout || 30000,
            retryPolicy: config?.retryPolicy || {
                maxRetries: 3,
                initialDelay: 1000,
                maxDelay: 10000,
                backoffMultiplier: 2
            },
            headers: config?.headers
        });
    }
    
    /**
     * Check if component should be cached
     */
    private shouldCache(registry: ComponentRegistryEntity): boolean {
        // Check config for caching settings
        const config = mjConfig.componentRegistries?.find((r: any) => r.id === registry.ID);
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
            const componentEntity = await md.GetEntityObject<ComponentEntity>('MJ: Components', userInfo);
            
            // Check if component already exists
            const existingComponent = this.componentEngine.Components?.find(
                c => c.Name === component.name && 
                     c.Namespace === component.namespace &&
                     c.SourceRegistryID === registryId
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
    private mapComponentType(type: string): ComponentEntity['Type'] {
        const typeMap: Record<string, ComponentEntity['Type']> = {
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
     * Convert ComponentSpec array to ComponentSpecType array
     */
    private convertComponentSpecs(specs: ComponentSpec[]): ComponentSpecType[] {
        return specs.map(spec => this.convertComponentSpec(spec));
    }
    
    /**
     * Convert a single ComponentSpec to ComponentSpecType
     */
    private convertComponentSpec(spec: ComponentSpec): ComponentSpecType {
        return {
            name: spec.name,
            location: spec.location,
            registry: spec.registry,
            namespace: spec.namespace,
            version: spec.version,
            selectionReasoning: spec.selectionReasoning,
            createNewVersion: spec.createNewVersion,
            description: spec.description,
            title: spec.title,
            type: spec.type,
            code: spec.code,
            functionalRequirements: spec.functionalRequirements,
            dataRequirements: spec.dataRequirements ? {
                entities: spec.dataRequirements.entities?.map(e => ({
                    name: e.name,
                    type: 'entity', // EntityRequirementType requires this field
                    description: e.description,
                    fields: e.displayFields, // Map displayFields to fields
                    filters: e.filterFields?.join(', '), // Convert array to string
                    sortBy: e.sortFields?.join(', '), // Convert array to string
                    joins: undefined // ComponentEntityDataRequirement doesn't have joins
                })),
                queries: spec.dataRequirements.queries?.map(q => ({
                    name: q.name,
                    description: q.description,
                    query: q.newQuerySQL || '', // Use newQuerySQL if available
                    variables: q.parameters ? JSON.stringify(q.parameters) : undefined, // Map parameters to variables
                    returnType: 'object' // Default return type
                }))
            } : undefined,
            technicalDesign: spec.technicalDesign,
            properties: spec.properties?.map(p => ({
                name: p.name,
                type: p.type,
                description: p.description,
                required: p.required,
                defaultValue: p.defaultValue ? String(p.defaultValue) : undefined
            })),
            events: spec.events?.map(e => ({
                name: e.name,
                description: e.description,
                parameters: e.parameters?.map(p => ({
                    name: p.name,
                    type: p.type,
                    description: p.description,
                    required: false // ComponentEventParameter doesn't have required field
                }))
            })),
            libraries: spec.libraries?.map(l => ({
                name: l.name,
                type: 'npm', // Default type since ComponentLibraryDependency doesn't have type
                version: l.version,
                provider: undefined, // ComponentLibraryDependency doesn't have provider
                cdn: undefined, // ComponentLibraryDependency doesn't have cdn
                description: undefined // ComponentLibraryDependency doesn't have description
            })),
            dependencies: spec.dependencies ? this.convertComponentSpecs(spec.dependencies) : undefined
        };
    }
    
    /**
     * Map search result to GraphQL type
     */
    private mapSearchResult(result: ComponentSearchResult): RegistryComponentSearchResultType {
        return {
            components: this.convertComponentSpecs(result.components),
            total: result.total,
            offset: result.offset,
            limit: result.limit
        };
    }
}