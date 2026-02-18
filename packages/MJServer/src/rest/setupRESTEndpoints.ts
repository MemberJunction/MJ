import express from 'express';
import BodyParser from 'body-parser';
import { RESTEndpointHandler } from './RESTEndpointHandler.js';

export const ___REST_API_BASE_PATH = '/api/v1';

/**
 * Configuration options for REST API endpoints
 */
export interface RESTApiOptions {
    /**
     * Whether to enable REST API endpoints (default: false)
     */
    enabled: boolean;

    /**
     * Array of entity names to include in the API (case-insensitive)
     * If provided, only these entities will be accessible through the REST API
     * Supports wildcards using '*' (e.g., 'User*' matches 'User', 'UserRole', etc.)
     */
    includeEntities?: string[];

    /**
     * Array of entity names to exclude from the API (case-insensitive)
     * These entities will not be accessible through the REST API
     * Supports wildcards using '*' (e.g., 'Secret*' matches 'Secret', 'SecretKey', etc.)
     * Note: Exclude patterns always override include patterns
     */
    excludeEntities?: string[];

    /**
     * Array of schema names to include in the API (case-insensitive)
     * If provided, only entities in these schemas will be accessible through the REST API
     */
    includeSchemas?: string[];

    /**
     * Array of schema names to exclude from the API (case-insensitive)
     * Entities in these schemas will not be accessible through the REST API
     * Note: Exclude patterns always override include patterns
     */
    excludeSchemas?: string[];
}

/**
 * Default REST API configuration
 */
export const DEFAULT_REST_API_OPTIONS: RESTApiOptions = {
    enabled: true,
};

/**
 * Adds the REST API endpoints to an existing Express application
 * @param app The Express application to add the endpoints to
 * @param options Configuration options for REST API
 * @param authMiddleware Optional authentication middleware to use
 */
export function setupRESTEndpoints(
    app: express.Application,
    options?: Partial<RESTApiOptions>,
    authMiddleware?: express.RequestHandler
): void {
    // Merge with default options
    const config = { ...DEFAULT_REST_API_OPTIONS, ...options };

    // Skip setup if REST API is disabled
    if (!config.enabled) {
        console.log('REST API endpoints are disabled');
        return;
    }

    const basePath = ___REST_API_BASE_PATH;

    // Create REST endpoint handler with entity and schema filters
    const restHandler = new RESTEndpointHandler({
        includeEntities: config.includeEntities ? config.includeEntities.map(e => e.toLowerCase()) : undefined,
        excludeEntities: config.excludeEntities ? config.excludeEntities.map(e => e.toLowerCase()) : undefined,
        includeSchemas: config.includeSchemas ? config.includeSchemas.map(s => s.toLowerCase()) : undefined,
        excludeSchemas: config.excludeSchemas ? config.excludeSchemas.map(s => s.toLowerCase()) : undefined
    });

    // Mount REST API at the specified base path with authentication
    // This must come AFTER OAuth routes so they take precedence
    if (authMiddleware) {
        app.use(basePath, BodyParser.json({ limit: '50mb' }), authMiddleware, restHandler.getRouter());
    } else {
        app.use(basePath, BodyParser.json({ limit: '50mb' }), restHandler.getRouter());
    }

    console.log(`REST API endpoints have been set up at ${basePath}`);
}