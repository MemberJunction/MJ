import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { expressMiddleware } from '@as-integrations/express5';
import { mergeSchemas } from '@graphql-tools/schema';
import { Metadata, DatabasePlatform, SetProvider, StartupManager as StartupManagerImport } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { setupSQLServerClient, SQLServerDataProvider, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { extendConnectionPoolWithQuery } from './util.js';
import { default as BodyParser } from 'body-parser';
import compression from 'compression'; // Add compression middleware
import cors from 'cors';
import express, { Application } from 'express';
import { default as fg } from 'fast-glob';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { sep } from 'node:path';
import 'reflect-metadata';
import { ReplaySubject } from 'rxjs';
import { BuildSchemaOptions, buildSchemaSync, GraphQLTimestamp, PubSubEngine } from 'type-graphql';
import { PubSub } from 'graphql-subscriptions';
import sql from 'mssql';
import { WebSocketServer } from 'ws';
import buildApolloServer from './apolloServer/index.js';
import { configInfo, dbDatabase, dbHost, dbPort, dbUsername, graphqlPort, graphqlRootPath, mj_core_schema, websiteRunFromPackage, RESTApiOptions } from './config.js';
import { contextFunction, createUnifiedAuthMiddleware, getUserPayload } from './context.js';
import { requireSystemUserDirective, publicDirective } from './directives/index.js';
import createMSSQLConfig from './orm.js';
import { setupRESTEndpoints } from './rest/setupRESTEndpoints.js';
import { createOAuthCallbackHandler } from './rest/OAuthCallbackHandler.js';

import { resolve } from 'node:path';
import { DataSourceInfo, raiseEvent } from './types.js';

import { ExternalChangeDetectorEngine } from '@memberjunction/external-change-detection';
import { ScheduledJobsService } from './services/ScheduledJobsService.js';
import { LocalCacheManager, StartupManager, TelemetryManager, TelemetryLevel } from '@memberjunction/core';
import { getSystemUser } from './auth/index.js';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { PubSubManager } from './generic/PubSubManager.js';
import { CACHE_INVALIDATION_TOPIC } from './generic/CacheInvalidationResolver.js';

const cacheRefreshInterval = configInfo.databaseSettings.metadataCacheRefreshInterval;

/**
 * Returns the configured database platform type based on the DB_TYPE environment variable.
 * Defaults to 'sqlserver' for backward compatibility.
 */
export function getDbType(): DatabasePlatform {
    const dbType = process.env.DB_TYPE?.toLowerCase();
    if (dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg') {
        return 'postgresql';
    }
    return 'sqlserver';
}

export { MaxLength } from 'class-validator';
export * from 'type-graphql';
export { NewUserBase } from './auth/newUsers.js';
export { configInfo, DEFAULT_SERVER_CONFIG } from './config.js';
export * from './directives/index.js';
export * from './entitySubclasses/MJEntityPermissionEntityServer.server.js';
export * from './types.js';
export {
    TokenExpiredError,
    getSystemUser,
    getSigningKeys,
    extractUserInfoFromPayload,
    verifyUserRecord,
    AuthProviderFactory,
    IAuthProvider,
} from './auth/index.js';
export * from './auth/APIKeyScopeAuth.js';

export * from './generic/PushStatusResolver.js';
export * from './generic/PubSubManager.js';
export * from './generic/CacheInvalidationResolver.js';
export * from './generic/ResolverBase.js';
export * from './generic/RunViewResolver.js';
export * from './resolvers/RunTemplateResolver.js';
export * from './resolvers/RunAIPromptResolver.js';
export * from './resolvers/RunAIAgentResolver.js';
export * from './resolvers/TaskResolver.js';
export * from './generic/KeyValuePairInput.js';
export * from './generic/KeyInputOutputTypes.js';
export * from './generic/DeleteOptionsInput.js';

export * from './agents/skip-agent.js';
export * from './agents/skip-sdk.js';

export * from './resolvers/ColorResolver.js';
export * from './resolvers/ComponentRegistryResolver.js';
export * from './resolvers/DatasetResolver.js';
export * from './resolvers/EntityRecordNameResolver.js';
export * from './resolvers/MergeRecordsResolver.js';
export * from './resolvers/ReportResolver.js';
export * from './resolvers/QueryResolver.js';
export * from './resolvers/SqlLoggingConfigResolver.js';
export * from './resolvers/SyncRolesUsersResolver.js';
export * from './resolvers/SyncDataResolver.js';
export * from './resolvers/GetDataResolver.js';
export * from './resolvers/GetDataContextDataResolver.js';
export * from './resolvers/TransactionGroupResolver.js';
export * from './resolvers/CreateQueryResolver.js';
export * from './resolvers/TelemetryResolver.js';
export * from './resolvers/APIKeyResolver.js';
export * from './resolvers/MCPResolver.js';
export * from './resolvers/ActionResolver.js';
export * from './resolvers/EntityCommunicationsResolver.js';
export * from './resolvers/EntityResolver.js';
export * from './resolvers/ISAEntityResolver.js';
export * from './resolvers/FileCategoryResolver.js';
export * from './resolvers/FileResolver.js';
export * from './resolvers/InfoResolver.js';
export * from './resolvers/PotentialDuplicateRecordResolver.js';
export * from './resolvers/RunTestResolver.js';
export * from './resolvers/UserFavoriteResolver.js';
export * from './resolvers/UserResolver.js';
export * from './resolvers/UserViewResolver.js';
export * from './resolvers/VersionHistoryResolver.js';
export * from './resolvers/CurrentUserContextResolver.js';
export { GetReadOnlyDataSource, GetReadWriteDataSource, GetReadWriteProvider, GetReadOnlyProvider } from './util.js';

export * from './generated/generated.js';
export * from './hooks.js';
export * from './multiTenancy/index.js';

import type { ServerExtensibilityOptions, HookWithOptions } from './hooks.js';
import { HookRegistry } from '@memberjunction/core';
import type { HookRegistrationOptions } from '@memberjunction/core';
import type { ApolloServerPlugin } from '@apollo/server';
import { createTenantMiddleware, createTenantPreRunViewHook, createTenantPreSaveHook } from './multiTenancy/index.js';

/**
 * Register a hook that may be a plain function or a `{ hook, Priority, Namespace }` object.
 * Dynamic packages (e.g., BCSaaS) return hooks in object form to declare registration metadata.
 */
function registerHookEntry<T>(hookName: string, entry: T | HookWithOptions<T>): void {
  if (typeof entry === 'function') {
    HookRegistry.Register(hookName, entry);
  } else if (entry && typeof entry === 'object' && 'hook' in entry) {
    const { hook, Priority, Namespace } = entry as HookWithOptions<T>;
    const options: HookRegistrationOptions = {};
    if (Priority != null) options.Priority = Priority;
    if (Namespace != null) options.Namespace = Namespace;
    HookRegistry.Register(hookName, hook, options);
  }
}

export type MJServerOptions = ServerExtensibilityOptions & {
  onBeforeServe?: () => void | Promise<void>;
  restApiOptions?: Partial<RESTApiOptions>; // Options for REST API configuration
};

const localPath = (p: string) => {
  // Convert import.meta.url to a local directory path
  const dirname = fileURLToPath(new URL('.', import.meta.url));
  // Resolve the provided path relative to the derived directory path
  const resolvedPath = resolve(dirname, p);
  return resolvedPath;
};

export const createApp = (): Application => express();

export const serve = async (resolverPaths: Array<string>, app: Application = createApp(), options?: MJServerOptions): Promise<void> => {
  const localResolverPaths = ['resolvers/**/*Resolver.{js,ts}', 'generic/*Resolver.{js,ts}', 'generated/generated.{js,ts}'].map(localPath);

  const combinedResolverPaths = [...resolverPaths, ...localResolverPaths];

  const isWindows = sep === '\\';
  const globs = combinedResolverPaths.flatMap((path) => (isWindows ? path.replace(/\\/g, '/') : path));
  const paths = fg.globSync(globs);
  if (paths.length === 0) {
    console.warn(`No resolvers found in ${combinedResolverPaths.join(', ')}`);
    console.log({ combinedResolverPaths, paths, cwd: process.cwd() });
  }

  const setupComplete$ = new ReplaySubject(1);
  const dbType = getDbType();
  const dataSources: DataSourceInfo[] = [];

  if (dbType === 'postgresql') {
    // ─── PostgreSQL Path ───────────────────────────────────────────
    console.log('Database type: PostgreSQL');
    const pg = await import('pg');
    const { PostgreSQLDataProvider, PostgreSQLProviderConfigData } = await import('@memberjunction/postgresql-dataprovider');

    const pgHost = process.env.PG_HOST || process.env.DB_HOST || 'localhost';
    const pgPort = parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10);
    const pgUser = process.env.PG_USERNAME || process.env.DB_USERNAME || 'postgres';
    const pgPass = process.env.PG_PASSWORD || process.env.DB_PASSWORD || '';
    const pgDatabase = process.env.PG_DATABASE || process.env.DB_DATABASE || '';

    const pgPool = new pg.default.Pool({
      host: pgHost,
      port: pgPort,
      user: pgUser,
      password: pgPass,
      database: pgDatabase,
      max: configInfo.databaseSettings.connectionPool?.max ?? 50,
      min: configInfo.databaseSettings.connectionPool?.min ?? 5,
      idleTimeoutMillis: configInfo.databaseSettings.connectionPool?.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: configInfo.databaseSettings.connectionPool?.acquireTimeoutMillis ?? 30000,
    });

    // Verify connection
    const testClient = await pgPool.connect();
    await testClient.query('SELECT 1');
    testClient.release();
    console.log(`PostgreSQL pool connected to ${pgHost}:${pgPort}/${pgDatabase}`);

    // Create a DataSourceInfo with a MSSQL-compatible wrapper around pg.Pool
    // This allows existing code (types, util, context) to work without changes
    const mssqlCompatPool = createMSSQLCompatPool(pgPool);
    dataSources.push(new DataSourceInfo({
      dataSource: mssqlCompatPool,
      type: 'Read-Write',
      host: pgHost,
      port: pgPort,
      database: pgDatabase,
      userName: pgUser,
    }));

    // Set up the PostgreSQL provider
    const pgConnectionConfig = {
      Host: pgHost,
      Port: pgPort,
      Database: pgDatabase,
      User: pgUser,
      Password: pgPass,
      MaxConnections: configInfo.databaseSettings.connectionPool?.max ?? 50,
      MinConnections: configInfo.databaseSettings.connectionPool?.min ?? 5,
    };
    const pgConfigData = new PostgreSQLProviderConfigData(
      pgConnectionConfig,
      mj_core_schema,
      cacheRefreshInterval / 1000, // convert ms to seconds
    );
    const provider = new PostgreSQLDataProvider();
    await provider.Config(pgConfigData);
    SetProvider(provider);

    // Refresh user cache using PostgreSQL
    await refreshUserCacheFromPG(pgPool, mj_core_schema);

    // Run startup actions
    const sysUser = UserCache.Instance.GetSystemUser();
    const backupSysUser = UserCache.Instance.Users.find(u => u.IsActive && u.Type === 'Owner');
    await StartupManagerImport.Instance.Startup(false, sysUser || backupSysUser, provider);

    // Monkey-patch SQLServerDataProvider.ExecuteSQLWithPool to support PostgreSQL
    // Generated resolvers call this static method with bracket-quoted SQL.
    // When the pool is our PG-compat wrapper, translate and execute via pg.Pool.
    const origExecuteSQLWithPool = SQLServerDataProvider.ExecuteSQLWithPool;
    SQLServerDataProvider.ExecuteSQLWithPool = async function(
      pool: sql.ConnectionPool, query: string, parameters?: unknown[], contextUser?: import('@memberjunction/core').UserInfo
    ): Promise<unknown[]> {
      const poolAny = pool as unknown as Record<string, unknown>;
      if (poolAny._pgPool) {
        const thePgPool = poolAny._pgPool as import('pg').Pool;
        // Translate SQL Server bracket syntax to PostgreSQL double-quote syntax
        const pgQuery = translateBracketsToPG(query);
        const result = await thePgPool.query(pgQuery);
        return result.rows;
      }
      return origExecuteSQLWithPool.call(this, pool, query, parameters, contextUser);
    };

    const md = new Metadata();
    console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);
  } else {
    // ─── SQL Server Path (existing behavior) ───────────────────────
    console.log('Database type: SQL Server');
    const pool = new sql.ConnectionPool(createMSSQLConfig());

    // Handle connection-level errors from dead/stale connections in the pool.
    // Without this handler, when Azure drops idle TCP connections, the pool silently
    // hands out dead connections that throw "Final state" errors on next use.
    pool.on('error', (err) => {
      console.error('[ConnectionPool] Pool-level connection error (stale connection evicted):', err.message);
    });

    await pool.connect();

    dataSources.push(new DataSourceInfo({dataSource: pool, type: 'Read-Write', host: dbHost, port: dbPort, database: dbDatabase, userName: dbUsername}));

    // Establish a second read-only connection to the database if dbReadOnlyUsername and dbReadOnlyPassword exist
    if (configInfo.dbReadOnlyUsername && configInfo.dbReadOnlyPassword) {
      const readOnlyConfig = {
        ...createMSSQLConfig(),
        user: configInfo.dbReadOnlyUsername,
        password: configInfo.dbReadOnlyPassword,
      };
      const readOnlyPool = new sql.ConnectionPool(readOnlyConfig);

      readOnlyPool.on('error', (err) => {
        console.error('[ConnectionPool] Read-only pool connection error (stale connection evicted):', err.message);
      });

      await readOnlyPool.connect();

      dataSources.push(new DataSourceInfo({dataSource: readOnlyPool, type: 'Read-Only', host: dbHost, port: dbPort, database: dbDatabase, userName: configInfo.dbReadOnlyUsername}));
      console.log('Read-only Connection Pool has been initialized.');
    }

    const config = new SQLServerProviderConfigData(pool, mj_core_schema, cacheRefreshInterval);
    await setupSQLServerClient(config);
    const md = new Metadata();
    console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);
  }

  // Store queryDialects config in GlobalObjectStore so MJQueryEntityServer can
  // read it without a circular dependency on MJServer
  if (configInfo.queryDialects) {
    MJGlobal.Instance.GetGlobalObjectStore()['queryDialects'] = configInfo.queryDialects;
  }

  // Initialize server telemetry based on config
  const tm = TelemetryManager.Instance;
  if (configInfo.telemetry?.enabled) {
    tm.SetEnabled(true);
    if (configInfo.telemetry?.level) {
      tm.UpdateSettings({ level: configInfo.telemetry.level as TelemetryLevel });
    }
    console.log(`Server telemetry enabled with level: ${configInfo.telemetry.level || 'standard'}`);
  } else {
    tm.SetEnabled(false);
    console.log('Server telemetry disabled');
  }

  // Optionally inject Redis as the shared storage provider for cross-server cache invalidation
  if (process.env.REDIS_URL) {
    const redisProvider = new RedisLocalStorageProvider({
      url: process.env.REDIS_URL,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'mj',
      enablePubSub: true,
      enableLogging: true,
    });
    (Metadata.Provider as GenericDatabaseProvider).SetLocalStorageProvider(redisProvider);
    await redisProvider.StartListening();

    // Connect Redis pub/sub events to LocalCacheManager callback dispatch
    // so cross-server cache invalidation messages are routed to registered callbacks
    redisProvider.OnCacheChanged((event) => {
        const sourceShort = event.SourceServerId ? event.SourceServerId.substring(0, 8) : 'unknown';
        console.log(`[MJAPI] Redis pub/sub → DispatchCacheChange: ${event.Action} for "${event.CacheKey}" from server ${sourceShort}`);
        LocalCacheManager.Instance.DispatchCacheChange(event);

        // Also broadcast to connected browser clients via GraphQL subscription
        // Extract entity name from the cache key (format: EntityName|Filter|OrderBy|...)
        const entityName = event.CacheKey ? event.CacheKey.split('|')[0] : '';
        if (entityName) {
            PubSubManager.Instance.Publish(CACHE_INVALIDATION_TOPIC, {
                entityName,
                primaryKeyValues: null, // entity-level invalidation
                action: event.Action || 'save',
                sourceServerId: event.SourceServerId || 'unknown',
                timestamp: new Date(),
            });
        }
    });

    console.log(`Redis cache provider connected: ${process.env.REDIS_URL}`);
  }

  // If Redis is available, swap LocalCacheManager's storage provider to Redis.
  // LocalCacheManager may have already been initialized (with in-memory provider)
  // during engine loading. SetStorageProvider migrates cached data to Redis.
  if (process.env.REDIS_URL) {
    await LocalCacheManager.Instance.SetStorageProvider(Metadata.Provider.LocalStorageProvider);
    console.log('LocalCacheManager: storage provider swapped to Redis');
  }
  // Ensure LocalCacheManager is initialized (no-op if already done during engine loading)
  if (!LocalCacheManager.Instance.IsInitialized) {
    await LocalCacheManager.Instance.Initialize(Metadata.Provider.LocalStorageProvider);
    console.log('LocalCacheManager initialized');
  }

  // Initialize APIKeyEngine singleton — reads apiKeyGeneration from mj.config.cjs automatically
  // This must happen before any request handler calls GetAPIKeyEngine()
  GetAPIKeyEngine();

  setupComplete$.next(true);
  raiseEvent('setupComplete', dataSources, null,  this);

  /******TEST HARNESS FOR CHANGE DETECTION */
  /******TEST HARNESS FOR CHANGE DETECTION */
  // const cd = ExternalChangeDetectorEngine.Instance;
  // await cd.Config(false, UserCache.Users[0]);

  // // don't wait for this, just run it and show in console whenever done.
  // cd.DetectChangesForAllEligibleEntities().then(result => {
  //   console.log(result)
  //   cd.ReplayChanges(result.Changes).then(replayResult => {
  //     console.log(replayResult)
  //   });
  // });
  /******TEST HARNESS FOR CHANGE DETECTION */
  /******TEST HARNESS FOR CHANGE DETECTION */

  const dynamicModules = await Promise.all(
    paths.map((modulePath) => {
      try {
        const module = import(isWindows ? `file://${modulePath}` : modulePath);
        return module;
      } catch (e) {
        console.error(`Error loading dynamic module at '${modulePath}'`, e);
        throw e;
      }
    })
  );
  const resolvers = dynamicModules.flatMap((module) =>
    Object.values(module).filter((value) => typeof value === 'function')
  ) as BuildSchemaOptions['resolvers'];

  // Create an explicit PubSub instance so we can reference it outside of resolvers
  // graphql-subscriptions v3 renamed asyncIterator→asyncIterableIterator, but
  // type-graphql still calls asyncIterator. Shim for compatibility.
  const pubSub = new PubSub() as unknown as Record<string, unknown>;
  if (!pubSub.asyncIterator && typeof pubSub.asyncIterableIterator === 'function') {
    pubSub.asyncIterator = pubSub.asyncIterableIterator;
  }
  PubSubManager.Instance.SetPubSubEngine(pubSub as unknown as PubSubEngine);

  let schema = mergeSchemas({
    schemas: [
      buildSchemaSync({
        resolvers,
        validate: false,
        scalarsMap: [{ type: Date, scalar: GraphQLTimestamp }],
        emitSchemaFile: websiteRunFromPackage !== 1,
        pubSub,
      }),
    ],
    typeDefs: [requireSystemUserDirective.typeDefs, publicDirective.typeDefs],
  });
  schema = requireSystemUserDirective.transformer(schema);
  schema = publicDirective.transformer(schema);

  // Apply user-provided schema transformers (after built-in directive transformers)
  if (options?.SchemaTransformers) {
    for (const transformer of options.SchemaTransformers) {
      schema = transformer(schema);
    }
  }

  const httpServer = createServer(app);

  const webSocketServer = new WebSocketServer({ server: httpServer, path: graphqlRootPath });
  const serverCleanup = useServer(
    {
      schema,
      context: async ({ connectionParams }) => {
        const userPayload = await getUserPayload(String(connectionParams?.Authorization), undefined, dataSources);
        return { userPayload };
      },
      onError: (ctx, message, errors) => {
        // Check if error is token expiration (expected behavior)
        const isTokenExpired = errors.some(err =>
          err.extensions?.code === 'JWT_EXPIRED' ||
          err.message?.includes('token has expired')
        );

        if (isTokenExpired) {
          // Log at warn level - this is expected from long-lived browser sessions
          console.warn('WebSocket connection token expired - client should reconnect with refreshed token');
        } else {
          // Log actual errors at error level
          console.error('WebSocket error:', errors);
        }
      },
    },
    webSocketServer
  );

  const apolloServer = buildApolloServer(
    { schema },
    { httpServer, serverCleanup },
    options?.ApolloPlugins
  );
  await apolloServer.start();
  
  // Fix #8: Add compression for better throughput performance
  app.use(compression({
    // Don't compress responses smaller than 1KB
    threshold: 1024,
    // Skip compression for images, videos, and other binary files
    filter: (req, res) => {
      if (req.headers['content-type']) {
        const contentType = req.headers['content-type'];
        if (contentType.includes('image/') || 
            contentType.includes('video/') ||
            contentType.includes('audio/') ||
            contentType.includes('application/octet-stream')) {
          return false;
        }
      }
      return compression.filter(req, res);
    },
    // High compression level (good balance between CPU and compression ratio)
    level: 6
  }));

  // Apply user-provided Express middleware (after compression, before routes)
  if (options?.ExpressMiddlewareBefore) {
    for (const mw of options.ExpressMiddlewareBefore) {
      app.use(mw);
    }
  }

  // Escape hatch for advanced Express app configuration
  if (options?.ConfigureExpressApp) {
    await Promise.resolve(options.ConfigureExpressApp(app));
  }

  // ─── OAuth callback routes (unauthenticated, registered BEFORE auth) ─────
  const oauthPublicUrl = configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
  console.log(`[OAuth] publicUrl: ${oauthPublicUrl}`);

  let oauthAuthenticatedRouter: ReturnType<typeof createOAuthCallbackHandler>['authenticatedRouter'] | undefined;
  if (oauthPublicUrl) {
    const { callbackRouter, authenticatedRouter } = createOAuthCallbackHandler({
      publicUrl: oauthPublicUrl,
      successRedirectUrl: `${oauthPublicUrl}/oauth/success`,
      errorRedirectUrl: `${oauthPublicUrl}/oauth/error`
    });
    oauthAuthenticatedRouter = authenticatedRouter;

    const oauthCors = cors<cors.CorsRequest>();

    // OAuth callback is unauthenticated (called by external auth server)
    app.use('/oauth', oauthCors, callbackRouter);
    console.log('[OAuth] Callback route registered at /oauth/callback');
  }

  // ─── Global CORS (before auth so 401 responses include CORS headers) ─────
  // Without this, the browser blocks 401 responses from the auth middleware
  // because they lack Access-Control-Allow-Origin headers, preventing the
  // client from reading the error code and triggering token refresh.
  app.use(cors<cors.CorsRequest>());

  // ─── Unified auth middleware (replaces both REST authMiddleware and contextFunction auth) ─────
  app.use(createUnifiedAuthMiddleware(dataSources));

  // ─── Built-in post-auth middleware (multi-tenancy) ─────
  // Config-driven multi-tenancy middleware runs after auth so it can read req.userPayload.
  if (configInfo.multiTenancy?.enabled) {
    const tenantMiddleware = createTenantMiddleware(configInfo.multiTenancy);
    app.use(tenantMiddleware);
  }

  // ─── Post-auth middleware from plugins ─────
  // Middleware here has access to the authenticated user via req.userPayload.
  // Use this for tenant context resolution, org membership loading, etc.
  if (options?.ExpressMiddlewarePostAuth) {
    for (const mw of options.ExpressMiddlewarePostAuth) {
      app.use(mw);
    }
  }

  // ─── OAuth authenticated routes (auth already handled by unified middleware) ─────
  if (oauthAuthenticatedRouter) {
    const oauthCors = cors<cors.CorsRequest>();
    app.use('/oauth', oauthCors, BodyParser.json(), oauthAuthenticatedRouter);
    console.log('[OAuth] Authenticated routes registered at /oauth/status, /oauth/initiate, and /oauth/exchange');
  }

  // ─── REST API endpoints (auth already handled by unified middleware) ─────
  const restApiConfig = {
    enabled: configInfo.restApiOptions?.enabled ?? false,
    includeEntities: configInfo.restApiOptions?.includeEntities,
    excludeEntities: configInfo.restApiOptions?.excludeEntities,
  };

  if (options?.restApiOptions) {
    Object.assign(restApiConfig, options.restApiOptions);
  }

  if (process.env.MJ_REST_API_ENABLED !== undefined) {
    restApiConfig.enabled = process.env.MJ_REST_API_ENABLED === 'true';
    if (restApiConfig.enabled) {
      console.log('REST API is enabled via environment variable');
    }
  }

  if (process.env.MJ_REST_API_INCLUDE_ENTITIES) {
    restApiConfig.includeEntities = process.env.MJ_REST_API_INCLUDE_ENTITIES.split(',').map(e => e.trim());
  }

  if (process.env.MJ_REST_API_EXCLUDE_ENTITIES) {
    restApiConfig.excludeEntities = process.env.MJ_REST_API_EXCLUDE_ENTITIES.split(',').map(e => e.trim());
  }

  // No per-route authMiddleware needed — unified auth middleware already ran
  setupRESTEndpoints(app, restApiConfig);

  // ─── GraphQL middleware (contextFunction reads req.userPayload, no re-auth) ─────
  app.use(
    graphqlRootPath,
    cors<cors.CorsRequest>(),
    BodyParser.json({ limit: '50mb' }),
    // Express 5 leaves req.body as undefined for non-JSON or empty bodies;
    // Apollo Server's expressMiddleware requires req.body to be defined.
    (req, _res, next) => { if (req.body === undefined) req.body = {}; next(); },
    expressMiddleware(apolloServer, {
      context: contextFunction({
                                 setupComplete$,
                                 dataSource: extendConnectionPoolWithQuery(dataSources[0].dataSource), // default read-write data source
                                 dataSources // all data source
                               }),
    })
  );

  // ─── Post-route middleware (error handlers, catch-alls) ─────
  if (options?.ExpressMiddlewareAfter) {
    for (const mw of options.ExpressMiddlewareAfter) {
      app.use(mw);
    }
  }

  // Initialize and start scheduled jobs service if enabled
  let scheduledJobsService: ScheduledJobsService | null = null;
  if (configInfo.scheduledJobs?.enabled) {
    try {
      scheduledJobsService = new ScheduledJobsService(configInfo.scheduledJobs);
      await scheduledJobsService.Initialize();
      await scheduledJobsService.Start();
    } catch (error) {
      console.error('❌ Failed to start scheduled jobs service:', error);
      // Don't throw - allow server to start even if scheduled jobs fail
    }
  }

  // Register provider-level hooks with the global HookRegistry.
  // Each entry can be a plain function or a { hook, Priority, Namespace } object.
  if (options?.PreRunViewHooks) {
    for (const entry of options.PreRunViewHooks) {
      registerHookEntry('PreRunView', entry);
    }
  }
  if (options?.PostRunViewHooks) {
    for (const entry of options.PostRunViewHooks) {
      registerHookEntry('PostRunView', entry);
    }
  }
  if (options?.PreSaveHooks) {
    for (const entry of options.PreSaveHooks) {
      registerHookEntry('PreSave', entry);
    }
  }

  // Auto-register multi-tenancy hooks when enabled in config
  // (The tenant Express middleware was already registered above in the post-auth slot)
  if (configInfo.multiTenancy?.enabled) {
    console.log('[MultiTenancy] Enabled — registering tenant isolation hooks');
    const tenantConfig = configInfo.multiTenancy;

    // Register tenant PreRunView hook (injects WHERE clauses)
    // Priority 50 + namespace allows middle layers to replace with their own implementation
    HookRegistry.Register('PreRunView', createTenantPreRunViewHook(tenantConfig), {
      Priority: 50,
      Namespace: 'mj:tenantFilter',
    });

    // Register tenant PreSave hook (validates tenant column on writes)
    HookRegistry.Register('PreSave', createTenantPreSaveHook(tenantConfig), {
      Priority: 50,
      Namespace: 'mj:tenantSave',
    });

    console.log(`[MultiTenancy] Context source: ${tenantConfig.contextSource}, scoping: ${tenantConfig.scopingStrategy}, write protection: ${tenantConfig.writeProtection}`);
  }

  if (options?.onBeforeServe) {
    await Promise.resolve(options.onBeforeServe());
  }

  await new Promise<void>((resolve) => httpServer.listen({ port: graphqlPort }, resolve));
  console.log(`📦 Connected to database: ${dbHost}:${dbPort}/${dbDatabase}`);
  console.log(`🚀 Server ready at http://localhost:${graphqlPort}/`);

  // Set up graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    // Stop scheduled jobs service
    if (scheduledJobsService?.IsRunning) {
      try {
        await scheduledJobsService.Stop();
        console.log('✅ Scheduled jobs service stopped');
      } catch (error) {
        console.error('❌ Error stopping scheduled jobs service:', error);
      }
    }

    // Close server
    httpServer.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle unhandled promise rejections to prevent server crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
    console.error('   Promise:', promise);
    // Log the error but DO NOT crash the server
    // This is critical for server stability when downstream dependencies fail
  });
};

/**
 * Creates a MSSQL ConnectionPool-compatible wrapper around a pg.Pool.
 * This allows existing code that references DataSourceInfo.dataSource (typed as sql.ConnectionPool)
 * to work with PostgreSQL pools. Only the .query() and .connected properties are used.
 */
function createMSSQLCompatPool(pgPool: import('pg').Pool): sql.ConnectionPool {
  const wrapper = {
    connected: true,
    query: async (sqlQuery: string): Promise<{ recordset: Record<string, unknown>[] }> => {
      const result = await pgPool.query(sqlQuery);
      return { recordset: result.rows };
    },
    request: (): { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> } => ({
      query: async (sqlQuery: string) => {
        const result = await pgPool.query(sqlQuery);
        return { recordset: result.rows };
      },
    }),
    // pg.Pool reference for consumers that need it
    _pgPool: pgPool,
  };
  return wrapper as unknown as sql.ConnectionPool;
}

/**
 * Refreshes the UserCache using PostgreSQL queries instead of MSSQL.
 * This mirrors the logic in UserCache.Refresh() but uses pg.Pool.
 */
async function refreshUserCacheFromPG(pgPool: import('pg').Pool, coreSchema: string): Promise<void> {
  const { UserInfo } = await import('@memberjunction/core');
  const uResult = await pgPool.query(`SELECT * FROM ${coreSchema}."vwUsers"`);
  const rResult = await pgPool.query(`SELECT * FROM ${coreSchema}."vwUserRoles"`);
  const users = uResult.rows;
  const roles = rResult.rows;

  if (users) {
    const userInfos = users.map((user: Record<string, unknown>) => {
      const userWithRoles = {
        ...user,
        UserRoles: roles.filter((role: Record<string, unknown>) => UUIDsEqual(role.UserID as string, user.ID as string)),
      };
      return new UserInfo(Metadata.Provider, userWithRoles);
    });
    // Access the UserCache internals to set users
    const cache = UserCache.Instance;
    (cache as unknown as Record<string, unknown>)['_users'] = userInfos;
  }
}

/**
 * Translates SQL Server bracket-quoted identifiers to PostgreSQL double-quoted identifiers.
 * Converts [schema].[table] to "schema"."table" and handles common T-SQL patterns.
 */
function translateBracketsToPG(sql: string): string {
  // Replace [identifier] with "identifier"
  return sql.replace(/\[([^\]]+)\]/g, '"$1"');
}
