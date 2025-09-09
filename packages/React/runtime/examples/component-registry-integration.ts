/**
 * Example demonstrating Component Registry integration
 * This shows how to use the new GraphQL-based Component Registry client
 * with the React runtime's ComponentRegistryService
 */

import { ComponentRegistryService, IComponentRegistryClient } from '@memberjunction/react-runtime';
import { GraphQLComponentRegistryClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { ComponentCompiler } from '@memberjunction/react-runtime';

/**
 * Example 1: Using the GraphQL Component Registry Client directly
 */
async function exampleDirectUsage() {
    // Initialize GraphQL data provider (typically done once at app startup)
    const graphQLProvider = new GraphQLDataProvider({
        endpoint: 'http://localhost:4000/graphql',
        headers: {
            'Authorization': 'Bearer YOUR_TOKEN'
        }
    });
    
    // Create the Component Registry client
    const registryClient = new GraphQLComponentRegistryClient(graphQLProvider);
    
    // Get a component from a registry
    const component = await registryClient.GetRegistryComponent({
        registryId: 'mj-central',
        namespace: 'core/ui',
        name: 'DataGrid',
        version: '1.0.0'
    });
    
    if (component) {
        console.log('Component loaded:', component.name);
        console.log('Description:', component.description);
        console.log('Code length:', component.code.length);
    }
    
    // Search for components
    const searchResult = await registryClient.SearchRegistryComponents({
        query: 'dashboard',
        type: 'dashboard',
        limit: 10
    });
    
    console.log(`Found ${searchResult.total} components`);
    searchResult.components.forEach(comp => {
        console.log(`- ${comp.name}: ${comp.description}`);
    });
}

/**
 * Example 2: Integrating with React Runtime's ComponentRegistryService
 */
async function exampleRuntimeIntegration() {
    // Create GraphQL client
    const graphQLProvider = new GraphQLDataProvider({
        endpoint: 'http://localhost:4000/graphql',
        headers: {
            'Authorization': 'Bearer YOUR_TOKEN'
        }
    });
    
    const registryClient = new GraphQLComponentRegistryClient(graphQLProvider);
    
    // Create compiler and runtime context
    const compiler = new ComponentCompiler({ debug: true });
    const runtimeContext = {
        // Your runtime context (React, libraries, etc.)
    };
    
    // Get or create the ComponentRegistryService with GraphQL client
    const registryService = ComponentRegistryService.getInstance(
        compiler,
        runtimeContext,
        true, // debug
        registryClient // Pass the GraphQL client
    );
    
    // Alternative: Set the GraphQL client after creation
    // registryService.setGraphQLClient(registryClient);
    
    // Now the service will use GraphQL for registry operations
    const compiledComponent = await registryService.getCompiledComponent(
        'component-id-123',
        'reference-id',
        undefined // contextUser (optional)
    );
    
    console.log('Component compiled and cached');
}

/**
 * Example 3: Creating a custom adapter for the IComponentRegistryClient interface
 */
class CustomRegistryAdapter implements IComponentRegistryClient {
    private graphQLClient: GraphQLComponentRegistryClient;
    
    constructor(graphQLClient: GraphQLComponentRegistryClient) {
        this.graphQLClient = graphQLClient;
    }
    
    async GetRegistryComponent(params: {
        registryId: string;
        namespace: string;
        name: string;
        version?: string;
    }) {
        // Add custom logic here (logging, caching, transformation, etc.)
        console.log(`Fetching component: ${params.namespace}/${params.name}`);
        
        const result = await this.graphQLClient.GetRegistryComponent(params);
        
        // Custom post-processing if needed
        if (result) {
            console.log(`Successfully loaded component v${result.version}`);
        }
        
        return result;
    }
}

/**
 * Example 4: Fallback pattern - GraphQL with HTTP fallback
 */
async function exampleWithFallback() {
    const compiler = new ComponentCompiler({ debug: true });
    const runtimeContext = {};
    
    let registryService: ComponentRegistryService;
    
    try {
        // Try to use GraphQL client
        const graphQLProvider = new GraphQLDataProvider({
            endpoint: 'http://localhost:4000/graphql',
            headers: {
                'Authorization': 'Bearer YOUR_TOKEN'
            }
        });
        
        const registryClient = new GraphQLComponentRegistryClient(graphQLProvider);
        
        registryService = ComponentRegistryService.getInstance(
            compiler,
            runtimeContext,
            true,
            registryClient
        );
        
        console.log('Using GraphQL client for registry operations');
    } catch (error) {
        // Fallback to direct HTTP (service handles this internally)
        console.log('GraphQL not available, falling back to direct HTTP');
        
        registryService = ComponentRegistryService.getInstance(
            compiler,
            runtimeContext,
            true
            // No GraphQL client - will use direct HTTP
        );
    }
    
    // Service will use the appropriate method based on configuration
    const component = await registryService.getCompiledComponent(
        'component-id',
        'ref-id'
    );
}

// Run examples
(async () => {
    console.log('=== Component Registry Integration Examples ===\n');
    
    try {
        console.log('1. Direct GraphQL Client Usage:');
        await exampleDirectUsage();
        
        console.log('\n2. Runtime Integration:');
        await exampleRuntimeIntegration();
        
        console.log('\n3. Custom Adapter Pattern:');
        // Demonstrate custom adapter
        
        console.log('\n4. Fallback Pattern:');
        await exampleWithFallback();
        
    } catch (error) {
        console.error('Error in examples:', error);
    }
})();