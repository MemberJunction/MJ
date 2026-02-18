import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { expressMiddleware } from '@apollo/server/express4';
import { mergeSchemas } from '@graphql-tools/schema';
import { Metadata, DatabasePlatform, SetProvider, StartupManager as StartupManagerImport } from '@memberjunction/core';
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
import { BuildSchemaOptions, buildSchemaSync, GraphQLTimestamp } from 'type-graphql';
import sql from 'mssql';
import { WebSocketServer } from 'ws';
import buildApolloServer from './apolloServer/index.js';
import { configInfo, dbDatabase, dbHost, dbPort, dbUsername, graphqlPort, graphqlRootPath, mj_core_schema, websiteRunFromPackage, RESTApiOptions } from './config.js';
import { contextFunction, getUserPayload } from './context.js';
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
export * from './entitySubclasses/entityPermissions.server.js';
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
export { GetReadOnlyDataSource, GetReadWriteDataSource, GetReadWriteProvider, GetReadOnlyProvider } from './util.js';

export * from './generated/generated.js';


export type MJServerOptions = {
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
      await readOnlyPool.connect();

      dataSources.push(new DataSourceInfo({dataSource: readOnlyPool, type: 'Read-Only', host: dbHost, port: dbPort, database: dbDatabase, userName: configInfo.dbReadOnlyUsername}));
      console.log('Read-only Connection Pool has been initialized.');
    }

    const config = new SQLServerProviderConfigData(pool, mj_core_schema, cacheRefreshInterval);
    await setupSQLServerClient(config);
    const md = new Metadata();
    console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);
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

  // Initialize LocalCacheManager with the server-side storage provider (in-memory)
  await LocalCacheManager.Instance.Initialize(Metadata.Provider.LocalStorageProvider);
  console.log('LocalCacheManager initialized');

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

  let schema = mergeSchemas({
    schemas: [
      buildSchemaSync({
        resolvers,
        validate: false,
        scalarsMap: [{ type: Date, scalar: GraphQLTimestamp }],
        emitSchemaFile: websiteRunFromPackage !== 1,
      }),
    ],
    typeDefs: [requireSystemUserDirective.typeDefs, publicDirective.typeDefs],
  });
  schema = requireSystemUserDirective.transformer(schema);
  schema = publicDirective.transformer(schema);

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

  const apolloServer = buildApolloServer({ schema }, { httpServer, serverCleanup });
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

  // Setup REST API endpoints BEFORE GraphQL (since graphqlRootPath may be '/' which catches all routes)
  const authMiddleware = async (req, res, next) => {
    try {
      const sessionIdRaw = req.headers['x-session-id'];
      const requestDomain = new URL(req.headers.origin || '').hostname;
      const sessionId = sessionIdRaw ? sessionIdRaw.toString() : '';
      const bearerToken = req.headers.authorization ?? '';
      const apiKey = String(req.headers['x-mj-api-key']);

      const userPayload = await getUserPayload(bearerToken, sessionId, dataSources, requestDomain, apiKey);
      if (!userPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Set both req.user (standard Express convention) and req['mjUser'] (MJ REST convention)
      // Note: userPayload contains { userRecord: UserInfo, email, sessionId }
      // The mjUser property expects the UserInfo directly (userRecord)
      req.user = userPayload;
      req['mjUser'] = userPayload.userRecord;
      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };

  // Build public URL for OAuth callbacks
  const oauthPublicUrl = configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
  console.log(`[OAuth] publicUrl: ${oauthPublicUrl}`);

  // Set up OAuth callback routes at /oauth (independent of REST API)
  // These must be registered BEFORE GraphQL middleware since graphqlRootPath may be '/'
  if (oauthPublicUrl) {
    const { callbackRouter, authenticatedRouter } = createOAuthCallbackHandler({
      publicUrl: oauthPublicUrl,
      // TODO: These should be configurable to point to the MJ Explorer UI
      successRedirectUrl: `${oauthPublicUrl}/oauth/success`,
      errorRedirectUrl: `${oauthPublicUrl}/oauth/error`
    });

    // Create CORS middleware for OAuth routes (needed for cross-origin requests from frontend)
    const oauthCors = cors<cors.CorsRequest>();

    // OAuth callback is unauthenticated (called by external auth server)
    app.use('/oauth', oauthCors, callbackRouter);
    console.log('[OAuth] Callback route registered at /oauth/callback');

    // OAuth status, initiate, and exchange endpoints require authentication
    // Must also have CORS for frontend requests and JSON body parsing
    app.use('/oauth', oauthCors, BodyParser.json(), authMiddleware, authenticatedRouter);
    console.log('[OAuth] Authenticated routes registered at /oauth/status, /oauth/initiate, and /oauth/exchange');
  }

  // Get REST API configuration
  const restApiConfig = {
    enabled: configInfo.restApiOptions?.enabled ?? false,
    includeEntities: configInfo.restApiOptions?.includeEntities,
    excludeEntities: configInfo.restApiOptions?.excludeEntities,
  };

  // Apply options from server options if provided (these override the config file)
  if (options?.restApiOptions) {
    Object.assign(restApiConfig, options.restApiOptions);
  }

  // Get REST API configuration from environment variables if present (env vars override everything)
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

  // Set up REST endpoints with the configured options and auth middleware
  setupRESTEndpoints(app, restApiConfig, authMiddleware);

  // GraphQL middleware (after REST so /api/v1/* routes are handled first)
  // Note: Type assertion needed due to @apollo/server bundling older @types/express types
  // that are incompatible with Express 5.x types (missing 'param' property)
  app.use(
    graphqlRootPath,
    cors<cors.CorsRequest>(),
    BodyParser.json({ limit: '50mb' }),
    expressMiddleware(apolloServer, {
      context: contextFunction({
                                 setupComplete$,
                                 dataSource: extendConnectionPoolWithQuery(dataSources[0].dataSource), // default read-write data source
                                 dataSources // all data source
                               }),
    }) as unknown as express.RequestHandler
  );

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
        UserRoles: roles.filter((role: Record<string, unknown>) => role.UserID === user.ID),
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
