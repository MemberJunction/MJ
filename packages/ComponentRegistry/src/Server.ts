import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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
import { DataSourceInfo } from './types.js';

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
  protected app: express.Application;
  protected registry: ComponentRegistryEntity | null = null;
  protected metadata: Metadata;
  protected pool: sql.ConnectionPool | null = null;
  protected readOnlyPool: sql.ConnectionPool | null = null;
  protected dataSources: DataSourceInfo[] = [];
  
  constructor() {
    this.app = express();
    this.metadata = new Metadata();
  }
  
  /**
   * Initialize the server, including database connection, middleware, and routes.
   * This method should be called before starting the server.
   * 
   * @returns Promise that resolves when initialization is complete
   * @throws Error if database connection fails or registry cannot be loaded
   */
  public async initialize(): Promise<void> {
    // Setup database connection
    await this.setupDatabase();
    
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
    const port = componentRegistrySettings?.port || 3200;
    
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        LogStatus(`Component Registry API Server running on port ${port}`);
        LogStatus(`API endpoint: http://localhost:${port}/api/v1`);
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
    // CORS
    this.app.use(cors({
      origin: componentRegistrySettings?.corsOrigins || ['*']
    }));
    
    // JSON parsing
    this.app.use(express.json());
    
    // Auth middleware (if enabled)
    if (componentRegistrySettings?.requireAuth) {
      this.app.use('/api/v1/components', this.authMiddleware.bind(this));
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
    // Registry info
    this.app.get('/api/v1/registry', this.getRegistryInfo.bind(this));
    this.app.get('/api/v1/health', this.getHealth.bind(this));
    
    // Component operations
    this.app.get('/api/v1/components', this.listComponents.bind(this));
    this.app.get('/api/v1/components/search', this.searchComponents.bind(this));
    this.app.get('/api/v1/components/:namespace/:name', this.getComponent.bind(this));
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
   * Handler for GET /api/v1/components/:namespace/:name
   * Get a specific component by namespace and name.
   * Optionally specify a version with ?version=x.x.x query parameter.
   * 
   * @protected
   * @virtual
   */
  protected async getComponent(req: Request, res: Response): Promise<void> {
    try {
      const { namespace, name } = req.params;
      const { version } = req.query;
      
      // Escape single quotes in parameters
      const escapedNamespace = namespace.replace(/'/g, "''");
      const escapedName = name.replace(/'/g, "''");
      
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
      res.json({
        id: component.ID,
        namespace: component.Namespace,
        name: component.Name,
        version: component.Version,
        specification: JSON.parse(component.Specification)
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