import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import { createHash } from 'crypto';
import { 
  Metadata, 
  RunView, 
  LogStatus,
  LogError
} from '@memberjunction/core';
import { ComponentEntity, ComponentRegistryEntity } from '@memberjunction/core-entities';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import { configInfo, componentRegistrySettings, dbDatabase, dbHost, dbPort, dbUsername, dbReadOnlyUsername, dbReadOnlyPassword } from './config.js';
import createMSSQLConfig from './orm.js';
import { DataSourceInfo, ComponentRegistryServerOptions, ComponentFeedbackParams, ComponentFeedbackResponse, FeedbackHandler } from './types.js';

/**
 * Base class for the Component Registry API Server.
 * This class provides a complete implementation of the Component Registry API v1 specification.
 * 
 * To customize the server behavior, extend this class and override the appropriate methods.
 * Common customization points include:
 * - Authentication: Override `checkAPIKey()` to implement custom authentication
 * - Component filtering: Override `getComponentFilter()` to customize which components are served
 * - Response formatting: Override the route handler methods to customize response formats
 * 
 * @example
 * ```typescript
 * class MyCustomRegistryServer extends ComponentRegistryAPIServer {
 *   protected async checkAPIKey(req: Request): Promise<boolean> {
 *     const apiKey = req.headers['x-api-key'];
 *     return await myCustomAuthProvider.validateKey(apiKey);
 *   }
 * }
 * ```
 */
export class ComponentRegistryAPIServer {
  protected app: express.Application | null = null;
  protected router: express.Router | null = null;
  protected registry: ComponentRegistryEntity | null = null;
  protected metadata: Metadata;
  protected pool: sql.ConnectionPool | null = null;
  protected readOnlyPool: sql.ConnectionPool | null = null;
  protected dataSources: DataSourceInfo[] = [];
  protected options: ComponentRegistryServerOptions;

  constructor(options: ComponentRegistryServerOptions = {}) {
    // Set default options
    this.options = {
      mode: 'standalone',
      basePath: '/api/v1',
      skipDatabaseSetup: false,
      ...options
    };

    // Create app or router based on mode
    if (this.options.mode === 'standalone') {
      this.app = express();
      this.router = null;
    } else {
      this.app = null;
      this.router = express.Router();
    }

    this.metadata = new Metadata();
  }
  
  /**
   * Get the Express Router for mounting on an existing app.
   * Only available in 'router' mode.
   *
   * @returns The Express Router with all registry routes configured
   * @throws Error if called in standalone mode
   */
  public getRouter(): express.Router {
    if (this.options.mode !== 'router') {
      throw new Error('getRouter() is only available in router mode');
    }
    if (!this.router) {
      throw new Error('Router not initialized. Call initialize() first.');
    }
    return this.router;
  }

  /**
   * Initialize the server, including database connection, middleware, and routes.
   * This method should be called before starting the server.
   *
   * @returns Promise that resolves when initialization is complete
   * @throws Error if database connection fails or registry cannot be loaded
   */
  public async initialize(): Promise<void> {
    // Setup database connection only if not skipped
    if (!this.options.skipDatabaseSetup) {
      await this.setupDatabase();
    }

    // Load registry metadata if ID provided
    if (componentRegistrySettings?.registryId) {
      await this.loadRegistry();
    }

    // Setup middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Start the Express server on the configured port.
   * Must be called after `initialize()`.
   *
   * @returns Promise that resolves when the server is listening
   */
  public async start(): Promise<void> {
    if (this.options.mode !== 'standalone') {
      throw new Error('start() is only available in standalone mode. Use getRouter() in router mode.');
    }

    if (!this.app) {
      throw new Error('Express app not initialized');
    }

    const port = componentRegistrySettings?.port || 3200;

    return new Promise((resolve) => {
      this.app!.listen(port, () => {
        LogStatus(`Component Registry API Server running on port ${port}`);
        LogStatus(`API endpoint: http://localhost:${port}${this.options.basePath}`);
        resolve();
      });
    });
  }
  
  /**
   * Set up the database connection using MemberJunction's SQL Server provider.
   * Follows the same pattern as MJServer for consistency.
   * 
   * @protected
   * @virtual
   */
  protected async setupDatabase(): Promise<void> {
    // Create the main connection pool using the same config pattern as MJServer
    this.pool = new sql.ConnectionPool(createMSSQLConfig());
    await this.pool.connect();
    
    // Get cache refresh interval from config (default to 0 if not set)
    const cacheRefreshInterval = configInfo.databaseSettings?.metadataCacheRefreshInterval || 0;
    
    // Setup MemberJunction SQL Server client with cache refresh interval
    const config = new SQLServerProviderConfigData(this.pool, configInfo.mjCoreSchema, cacheRefreshInterval);
    await setupSQLServerClient(config);
    
    // Initialize metadata and log entity count like MJServer does
    const md = new Metadata();
    LogStatus(`Database connection established. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);
    
    // Create data sources array
    this.dataSources = [new DataSourceInfo({
      dataSource: this.pool, 
      type: 'Read-Write', 
      host: dbHost, 
      port: dbPort, 
      database: dbDatabase, 
      userName: dbUsername
    })];
    
    // Establish a second read-only connection if credentials are provided
    if (dbReadOnlyUsername && dbReadOnlyPassword) {
      const readOnlyConfig = {
        ...createMSSQLConfig(),
        user: dbReadOnlyUsername,
        password: dbReadOnlyPassword,
      };
      this.readOnlyPool = new sql.ConnectionPool(readOnlyConfig);
      await this.readOnlyPool.connect();
      
      // Add read-only pool to data sources
      this.dataSources.push(new DataSourceInfo({
        dataSource: this.readOnlyPool, 
        type: 'Read-Only', 
        host: dbHost, 
        port: dbPort, 
        database: dbDatabase, 
        userName: dbReadOnlyUsername
      }));
      LogStatus('Read-only connection pool has been initialized.');
    }
  }
  
  /**
   * Load the registry metadata from the database.
   * This is called automatically if a registryId is provided in the configuration.
   * 
   * @protected
   * @virtual
   */
  protected async loadRegistry(): Promise<void> {
    if (!componentRegistrySettings?.registryId) {
      return;
    }
    
    this.registry = await this.metadata.GetEntityObject<ComponentRegistryEntity>('MJ: Component Registries');
    const loaded = await this.registry.Load(componentRegistrySettings.registryId);
    
    if (!loaded) {
      throw new Error(`Failed to load registry with ID: ${componentRegistrySettings.registryId}`);
    }
    
    LogStatus(`Loaded registry: ${this.registry.Name}`);
  }
  
  /**
   * Set up Express middleware.
   * Override this method to add custom middleware or modify the middleware stack.
   *
   * @protected
   * @virtual
   */
  protected setupMiddleware(): void {
    // Get the target for middleware (app or router)
    const target = this.options.mode === 'standalone' ? this.app : this.router;

    if (!target) {
      throw new Error('No app or router available for middleware setup');
    }

    // In standalone mode, setup CORS and JSON parsing
    // In router mode, assume parent app handles these
    if (this.options.mode === 'standalone') {
      // CORS
      target.use(cors({
        origin: componentRegistrySettings?.corsOrigins || ['*']
      }));

      // JSON parsing
      target.use(express.json());
    }

    // Auth middleware applies in both modes (if enabled)
    if (componentRegistrySettings?.requireAuth) {
      // In router mode, paths are relative to where router is mounted
      // In standalone mode, use full paths
      if (this.options.mode === 'router') {
        // Apply auth to all /components routes relative to router mount point
        target.use('/components', this.authMiddleware.bind(this));
      } else {
        // Apply auth to full path in standalone mode
        target.use(`${this.options.basePath}/components`, this.authMiddleware.bind(this));
      }
    }
  }
  
  /**
   * Authentication middleware that calls the checkAPIKey method.
   * This middleware is automatically applied to /api/v1/components routes when requireAuth is true.
   * 
   * @protected
   */
  protected async authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isValid = await this.checkAPIKey(req);
      if (!isValid) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    } catch (error) {
      LogError(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Authentication error' });
    }
  }
  
  /**
   * Check if the API key in the request is valid.
   * By default, this method always returns true (no authentication).
   * 
   * Override this method to implement custom authentication logic.
   * Common patterns include:
   * - Checking Bearer tokens in Authorization header
   * - Validating API keys in custom headers
   * - Verifying JWT tokens
   * - Checking against a database of valid keys
   * 
   * @param req - The Express request object
   * @returns Promise<boolean> - True if the request is authenticated, false otherwise
   * 
   * @protected
   * @virtual
   * 
   * @example
   * ```typescript
   * protected async checkAPIKey(req: Request): Promise<boolean> {
   *   const apiKey = req.headers['x-api-key'] as string;
   *   if (!apiKey) return false;
   *   
   *   // Check against database, cache, or external service
   *   return await this.validateKeyInDatabase(apiKey);
   * }
   * ```
   */
  protected async checkAPIKey(req: Request): Promise<boolean> {
    // Default implementation: no authentication required
    // Override this method in a subclass to implement custom authentication
    return true;
  }
  
  /**
   * Set up the API routes.
   * Override this method to add custom routes or modify existing ones.
   *
   * @protected
   * @virtual
   */
  protected setupRoutes(): void {
    // Get the target for routes (app or router)
    const target = this.options.mode === 'standalone' ? this.app : this.router;

    if (!target) {
      throw new Error('No app or router available for route setup');
    }

    if (this.options.mode === 'router') {
      // Router mode: paths are relative to where router is mounted
      target.get('/registry', this.getRegistryInfo.bind(this));
      target.get('/health', this.getHealth.bind(this));
      target.get('/components', this.listComponents.bind(this));
      target.get('/components/search', this.searchComponents.bind(this));
      target.get('/components/:namespace/:name', this.getComponent.bind(this));
      target.post('/feedback', this.submitFeedback.bind(this));
    } else {
      // Standalone mode: use full paths with basePath
      const basePath = this.options.basePath;
      target.get(`${basePath}/registry`, this.getRegistryInfo.bind(this));
      target.get(`${basePath}/health`, this.getHealth.bind(this));
      target.get(`${basePath}/components`, this.listComponents.bind(this));
      target.get(`${basePath}/components/search`, this.searchComponents.bind(this));
      target.get(`${basePath}/components/:namespace/:name`, this.getComponent.bind(this));
      target.post(`${basePath}/feedback`, this.submitFeedback.bind(this));
    }
  }
  
  /**
   * Get the base filter for component queries.
   * By default, this returns components where SourceRegistryID IS NULL (local components only).
   * 
   * Override this method to customize which components are served by the registry.
   * 
   * @returns The SQL filter string to apply to all component queries
   * 
   * @protected
   * @virtual
   * 
   * @example
   * ```typescript
   * protected getComponentFilter(): string {
   *   // Include both local and specific external registry components
   *   return "(SourceRegistryID IS NULL OR SourceRegistryID = 'abc-123')";
   * }
   * ```
   */
  protected getComponentFilter(): string {
    return 'SourceRegistryID IS NULL';
  }
  
  /**
   * Handler for GET /api/v1/registry
   * Returns basic information about the registry.
   * 
   * @protected
   * @virtual
   */
  protected async getRegistryInfo(req: Request, res: Response): Promise<void> {
    res.json({
      name: this.registry?.Name || 'Local Component Registry',
      description: this.registry?.Description || 'MemberJunction Component Registry',
      version: 'v1',
      requiresAuth: componentRegistrySettings?.requireAuth || false
    });
  }
  
  /**
   * Handler for GET /api/v1/health
   * Returns the health status of the registry server.
   * 
   * @protected
   * @virtual
   */
  protected async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ: Components',
        ExtraFilter: this.getComponentFilter(),
        MaxRows: 1
      });
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: 'v1',
        componentCount: result.TotalRowCount
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: 'v1',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Handler for GET /api/v1/components
   * Lists all published components in the registry, showing only the latest version of each.
   * 
   * @protected
   * @virtual
   */
  protected async listComponents(req: Request, res: Response): Promise<void> {
    try {
      const baseFilter = this.getComponentFilter();
      const filter = `${baseFilter} AND Status = 'Published'`;
      
      const rv = new RunView();
      const result = await rv.RunView<ComponentEntity>({
        EntityName: 'MJ: Components',
        ExtraFilter: filter,
        OrderBy: 'Namespace, Name, VersionSequence DESC' 
      });
      
      if (!result.Success) {
        res.status(500).json({ error: result.ErrorMessage });
        return;
      }
      
      // Group by namespace/name and take latest version
      const latestComponents = this.getLatestVersions(result.Results || []);
      
      const components = latestComponents.map(c => ({
        namespace: c.Namespace,
        name: c.Name,
        version: c.Version,
        title: c.Title,
        description: c.Description,
        type: c.Type,
        status: c.Status
      }));
      
      res.json({
        components,
        total: components.length
      });
    } catch (error) {
      LogError(`Failed to list components: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to list components' });
    }
  }
  
  /**
   * Handler for GET /api/v1/components/search
   * Search for components by query string and optional type filter.
   * 
   * @protected
   * @virtual
   */
  protected async searchComponents(req: Request, res: Response): Promise<void> {
    try {
      const { q, type } = req.query;
      
      let filter = `${this.getComponentFilter()} AND Status = 'Published'`;
      
      if (q && typeof q === 'string') {
        // Escape single quotes in the search query
        const escapedQuery = q.replace(/'/g, "''");
        filter += ` AND (Name LIKE '%${escapedQuery}%' OR Title LIKE '%${escapedQuery}%' OR Description LIKE '%${escapedQuery}%')`;
      }
      
      if (type && typeof type === 'string') {
        const escapedType = type.replace(/'/g, "''");
        filter += ` AND Type = '${escapedType}'`;
      }
      
      const rv = new RunView();
      const result = await rv.RunView<ComponentEntity>({
        EntityName: 'MJ: Components',
        ExtraFilter: filter,
        OrderBy: 'Namespace, Name, VersionSequence DESC' 
      });
      
      if (!result.Success) {
        res.status(500).json({ error: result.ErrorMessage });
        return;
      }
      
      // Group by namespace/name and take latest version
      const latestComponents = this.getLatestVersions(result.Results || []);
      
      const results = latestComponents.map(c => ({
        namespace: c.Namespace,
        name: c.Name,
        version: c.Version,
        title: c.Title,
        description: c.Description,
        type: c.Type,
        status: c.Status
      }));
      
      res.json({
        results,
        total: results.length,
        query: q || ''
      });
    } catch (error) {
      LogError(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Search failed' });
    }
  }
  
  /**
   * Generate SHA-256 hash of component specification
   * @param specification - The component specification JSON string
   * @returns SHA-256 hash as hex string
   */
  protected generateSpecificationHash(specification: string): string {
    return createHash('sha256').update(specification).digest('hex');
  }

  /**
   * Handler for GET /api/v1/components/:namespace/:name
   * Get a specific component by namespace and name.
   * Optionally specify a version with ?version=x.x.x query parameter.
   * Optionally specify a hash with ?hash=abc123 to enable caching (returns 304 if unchanged).
   * 
   * @protected
   * @virtual
   */
  protected async getComponent(req: Request, res: Response): Promise<void> {
    try {
      const { namespace, name } = req.params;
      const { version, hash } = req.query;

      // Ensure namespace and name are strings (route params are always strings)
      const namespaceStr = Array.isArray(namespace) ? namespace[0] : namespace;
      const nameStr = Array.isArray(name) ? name[0] : name;

      // Escape single quotes in parameters
      const escapedNamespace = namespaceStr.replace(/'/g, "''");
      const escapedName = nameStr.replace(/'/g, "''");
      
      let filter = `Namespace = '${escapedNamespace}' AND Name = '${escapedName}' AND ${this.getComponentFilter()}`;
      
      if (version && typeof version === 'string') {
        const escapedVersion = version.replace(/'/g, "''");
        filter += ` AND Version = '${escapedVersion}'`;
      }
      
      const rv = new RunView();
      const result = await rv.RunView<ComponentEntity>({
        EntityName: 'MJ: Components',
        ExtraFilter: filter,
        OrderBy: 'VersionSequence DESC',
        MaxRows: 1
      });
      
      if (!result.Success || !result.Results?.length) {
        res.status(404).json({ error: 'Component not found' });
        return;
      }
      
      const component = result.Results[0];
      
      // Generate hash of the current specification
      const currentHash = this.generateSpecificationHash(component.Specification);
      
      // If client provided a hash and it matches, return 304 Not Modified
      if (hash && typeof hash === 'string' && hash === currentHash) {
        res.status(304).json({
          message: 'Not modified',
          hash: currentHash,
          id: component.ID,
          namespace: component.Namespace,
          name: component.Name,
          version: component.Version
        });
        return;
      }
      
      // Return full specification with hash
      res.json({
        id: component.ID,
        namespace: component.Namespace,
        name: component.Name,
        version: component.Version,
        specification: JSON.parse(component.Specification),
        hash: currentHash
      });
    } catch (error) {
      LogError(`Failed to fetch component: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch component' });
    }
  }
  
  /**
   * Helper method to get the latest version of each component from a list.
   * Components are grouped by namespace/name and the highest version is selected.
   * 
   * @param components - Array of components potentially containing multiple versions
   * @returns Array of components with only the latest version of each
   * 
   * @protected
   */
  protected getLatestVersions(components: ComponentEntity[]): ComponentEntity[] {
    const latestComponents = new Map<string, ComponentEntity>();
    
    for (const component of components) {
      const key = `${component.Namespace}/${component.Name}`;
      if (!latestComponents.has(key)) {
        latestComponents.set(key, component);
      }
    }
    
    return Array.from(latestComponents.values());
  }

  /**
   * Default feedback handler implementation.
   * Simply logs feedback and returns success.
   * Override by calling setFeedbackHandler() with a custom implementation.
   *
   * @protected
   */
  protected feedbackHandler: FeedbackHandler = {
    async submitFeedback(params: ComponentFeedbackParams): Promise<ComponentFeedbackResponse> {
      LogStatus('Component feedback received (default handler):', undefined, {
        component: `${params.componentNamespace}/${params.componentName}`,
        version: params.componentVersion,
        rating: params.rating,
        feedbackType: params.feedbackType
      });

      return {
        success: true,
        feedbackID: undefined
      };
    }
  };

  /**
   * Set a custom feedback handler.
   * This allows external code (e.g., Skip) to override feedback handling logic.
   *
   * @param handler - Custom feedback handler implementation
   *
   * @example
   * ```typescript
   * const server = new ComponentRegistryAPIServer();
   * server.setFeedbackHandler({
   *   async submitFeedback(params, context) {
   *     // Custom logic here
   *     return { success: true, feedbackID: '...' };
   *   }
   * });
   * ```
   */
  public setFeedbackHandler(handler: FeedbackHandler): void {
    this.feedbackHandler = handler;
  }

  /**
   * Handler for POST /api/v1/feedback
   * Submit feedback for a component.
   *
   * @protected
   * @virtual
   */
  protected async submitFeedback(req: Request, res: Response): Promise<void> {
    try {
      const params: ComponentFeedbackParams = req.body;

      // Basic validation
      if (!params.componentName || !params.componentNamespace) {
        res.status(400).json({
          success: false,
          error: 'componentName and componentNamespace are required'
        });
        return;
      }

      if (params.rating === undefined || params.rating < 0 || params.rating > 5) {
        res.status(400).json({
          success: false,
          error: 'rating must be between 0 and 5'
        });
        return;
      }

      // Call the feedback handler (default or custom)
      const result = await this.feedbackHandler.submitFeedback(params, req.body.context);

      res.json(result);
    } catch (error) {
      LogError(`Failed to submit feedback: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        error: 'Failed to submit feedback'
      });
    }
  }
}

/**
 * Start the Component Registry Server using the default implementation.
 * This function checks if the registry is enabled in configuration before starting.
 * 
 * @returns Promise that resolves when the server is running
 * @throws Error if initialization or startup fails
 */
export async function startComponentRegistryServer(): Promise<void> {
  if (!componentRegistrySettings?.enableRegistry) {
    LogStatus('Component Registry Server is disabled in configuration');
    return;
  }
  
  const server = new ComponentRegistryAPIServer();
  await server.initialize();
  await server.start();
}