import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { expressMiddleware } from '@as-integrations/express5';
import { mergeSchemas } from '@graphql-tools/schema';
import { Metadata, DatabasePlatform, SetProvider, StartupManager as StartupManagerImport, BaseEntity, BaseEntityEvent, RunView } from '@memberjunction/core';
import { resolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import { MJGlobal, MJEventType, UUIDsEqual, ShutdownRegistry } from '@memberjunction/global';
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
import { ClientToolRequestManager } from '@memberjunction/ai-agents';
import { CACHE_INVALIDATION_TOPIC } from './generic/CacheInvalidationResolver.js';
import { ConnectorFactory, IntegrationEngine, IntegrationSyncOptions } from '@memberjunction/integration-engine';
import { CronExpressionHelper } from '@memberjunction/scheduling-engine';
import {
  MJCompanyIntegrationEntity,
  MJIntegrationEntity,
  MJCompanyIntegrationEntityMapEntity,
  MJCompanyIntegrationFieldMapEntity,
  MJScheduledJobEntity,
} from '@memberjunction/core-entities';
import { ServerExtensionLoader, ServerExtensionConfig } from '@memberjunction/server-extensions-core';

const cacheRefreshInterval = configInfo.databaseSettings.metadataCacheRefreshInterval;

/**
 * Returns the configured database platform from the `DB_PLATFORM` environment
 * variable, falling back to `'sqlserver'` when the env var is unset. An
 * unrecognized non-empty value (typo, legacy alias) throws — silent fallback
 * is the bug we don't want, because it routes the wrong provider against a
 * real database.
 *
 * Implementation note: the actual env-parsing lives in
 * `@memberjunction/global` (single source of truth across MJCLI, MJServer,
 * CodeGenLib). This wrapper keeps the public `getDbType()` symbol that
 * MJServer consumers (and the broader stack) already import.
 */
export function getDbType(): DatabasePlatform {
    return resolveDbPlatformFromEnv() ?? 'sqlserver';
}

export { MaxLength } from 'class-validator';
export * from 'type-graphql';
export { NewUserBase } from './auth/newUsers.js';
export { configInfo, DEFAULT_SERVER_CONFIG } from './config.js';
export { ServerExtensionLoader, BaseServerExtension } from '@memberjunction/server-extensions-core';
export type { ServerExtensionConfig, ExtensionInitResult, ExtensionHealthResult } from '@memberjunction/server-extensions-core';
export * from './directives/index.js';
export * from './entitySubclasses/MJEntityPermissionEntityServer.server.js';
export * from './types.js';
export {
    getSystemUser,
    getSigningKeys,
    extractUserInfoFromPayload,
    verifyUserRecord,
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
export * from './resolvers/VectorizeEntityResolver.js';
export * from './resolvers/SearchKnowledgeResolver.js';
export * from './resolvers/SearchKnowledgeStreamResolver.js';
export * from './resolvers/AvailableSearchProvidersResolver.js';
export * from './resolvers/FetchEntityVectorsResolver.js';
export * from './resolvers/PipelineProgressResolver.js';
export * from './resolvers/ClientToolRequestResolver.js';
export * from './resolvers/AutotagPipelineResolver.js';
export * from './resolvers/TagGovernanceResolver.js';
export * from './resolvers/TaskResolver.js';
export * from './generic/KeyValuePairInput.js';
export * from './generic/KeyInputOutputTypes.js';
export * from './generic/DeleteOptionsInput.js';
export * from './generic/RestoreContextInput.js';

export * from './agents/skip-agent.js';
export * from './agents/skip-sdk.js';

export * from './resolvers/GeoResolver.js';
export * from './resolvers/ColorResolver.js';
export * from './resolvers/ComponentRegistryResolver.js';
export * from './resolvers/DatasetResolver.js';
export * from './resolvers/EntityRecordNameResolver.js';
export * from './resolvers/MergeRecordsResolver.js';
export * from './resolvers/ReportResolver.js';
export * from './resolvers/QueryResolver.js';
export * from './resolvers/TestQuerySQLResolver.js';
export * from './resolvers/SqlLoggingConfigResolver.js';
export * from './resolvers/SyncRolesUsersResolver.js';
export * from './resolvers/SyncDataResolver.js';
export * from './resolvers/GetDataResolver.js';
export * from './resolvers/GetDataContextDataResolver.js';
export * from './resolvers/TransactionGroupResolver.js';
export * from './resolvers/QuerySystemUserResolver.js';
export * from './resolvers/TelemetryResolver.js';
export * from './resolvers/APIKeyResolver.js';
export * from './resolvers/MCPResolver.js';
export * from './resolvers/ActionResolver.js';
export * from './resolvers/CacheStatsResolver.js';
export * from './resolvers/EntityCommunicationsResolver.js';
export * from './resolvers/FeedbackResolver.js';
export * from './resolvers/EntityResolver.js';
export * from './resolvers/ISAEntityResolver.js';
export * from './resolvers/ArtifactFileResolver.js';
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
export * from './resolvers/RSUResolver.js';
export { GetReadOnlyDataSource, GetReadWriteDataSource, GetReadWriteProvider, GetReadOnlyProvider } from './util.js';

export * from './generated/generated.js';
export * from './multiTenancy/index.js';
export * from './middleware/index.js';

import { RegisterDataHook } from '@memberjunction/core';
import type { RequestHandler, ErrorRequestHandler } from 'express';
import type { ApolloServerPlugin } from '@apollo/server';
import type { GraphQLSchema } from 'graphql';
import { BaseServerMiddleware } from './middleware/BaseServerMiddleware.js';

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
  const t0 = performance.now();
  const lap = (label: string, since: number) => {
    const ms = performance.now() - since;
    console.log(`⏱️  [Startup] ${label}: ${ms.toFixed(0)}ms`);
    return performance.now();
  };

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

    const md = new Metadata(); // global-provider-ok: bootstrap
    console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);
  } else {
    // ─── SQL Server Path (existing behavior) ───────────────────────
    console.log('Database type: SQL Server');
    let tPhase = performance.now();
    const pool = new sql.ConnectionPool(createMSSQLConfig());

    // Handle connection-level errors from dead/stale connections in the pool.
    // Without this handler, when Azure drops idle TCP connections, the pool silently
    // hands out dead connections that throw "Final state" errors on next use.
    pool.on('error', (err) => {
      console.error('[ConnectionPool] Pool-level connection error (stale connection evicted):', err.message);
    });

    await pool.connect();
    tPhase = lap('DB Pool Connect', tPhase);

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
    tPhase = lap('Metadata + Provider Setup', tPhase);
    const md = new Metadata(); // global-provider-ok: bootstrap
    console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);

    // Set up CodeGen-credentialed provider for RSU DDL operations (CREATE TABLE, CREATE SCHEMA, etc.)
    const codegenUser = process.env.CODEGEN_DB_USERNAME;
    const codegenPass = process.env.CODEGEN_DB_PASSWORD;
    if (codegenUser && codegenPass) {
      try {
        const codegenPool = new sql.ConnectionPool({
          ...createMSSQLConfig(),
          user: codegenUser,
          password: codegenPass,
        });
        codegenPool.on('error', (err) => {
          console.error('[ConnectionPool] CodeGen pool connection error:', err.message);
        });
        await codegenPool.connect();

        const { RuntimeSchemaManager } = await import('@memberjunction/schema-engine');
        const codegenConfig = new SQLServerProviderConfigData(codegenPool, mj_core_schema, cacheRefreshInterval);
        const codegenProvider = new SQLServerDataProvider();
        await codegenProvider.Config(codegenConfig);
        RuntimeSchemaManager.Instance.SetDDLProvider(codegenProvider);
        console.log('RSU DDL provider initialized with CodeGen credentials.');

        // Set up in-process CodeGen runner for RSU
        try {
          const { RunCodeGenBase } = await import('@memberjunction/codegen-lib');
          const { SQLServerCodeGenConnection } = await import('@memberjunction/codegen-lib/dist/Database/providers/sqlserver/SQLServerCodeGenConnection.js');

          const codegenConnection = new SQLServerCodeGenConnection(codegenPool);
          const codegenCurrentUser = UserCache.Instance.Users.find(u => u.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Instance.Users[0];

          const codegenDataSource = {
            provider: codegenProvider,
            connection: codegenConnection,
            currentUser: codegenCurrentUser,
            connectionInfo: `${configInfo.dbHost}:${configInfo.dbPort}/${configInfo.dbDatabase} (CodeGen)`,
          };

          const runObject = MJGlobal.Instance.ClassFactory.CreateInstance(RunCodeGenBase) as InstanceType<typeof RunCodeGenBase>;

          const rsuWorkDir = process.env.RSU_WORK_DIR || process.cwd();
          RuntimeSchemaManager.Instance.SetCodeGenRunner({
            RunInProcess: (skipDB) => runObject.RunInProcess(codegenDataSource, skipDB, rsuWorkDir),
          });
          console.log('RSU in-process CodeGen runner initialized.');

          // Inject CodeGen output paths for targeted git staging
          const { initializeConfig } = await import('@memberjunction/codegen-lib');
          const codegenConfig = initializeConfig(rsuWorkDir);
          const outputPaths = (codegenConfig.output ?? []).map((o: { directory: string }) => o.directory);
          RuntimeSchemaManager.Instance.SetCodeGenOutputPaths(outputPaths);
          console.log(`RSU CodeGen output paths: ${outputPaths.length} directories configured.`);
        } catch (codegenErr) {
          console.warn(`RSU in-process CodeGen runner setup failed (will fall back to child process): ${(codegenErr as Error).message}`);
        }
      } catch (err) {
        console.warn(`RSU DDL provider setup failed (RSU will fall back to default provider): ${(err as Error).message}`);
      }
    }
  }

  let tServe = performance.now();

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
      enableLogging: configInfo.cacheSettings?.verboseLogging ?? false,
    });
    (Metadata.Provider as GenericDatabaseProvider).SetLocalStorageProvider(redisProvider); // global-provider-ok: bootstrap (Redis cache wiring)
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
    await LocalCacheManager.Instance.SetStorageProvider(Metadata.Provider.LocalStorageProvider); // global-provider-ok: bootstrap
    console.log('LocalCacheManager: storage provider swapped to Redis');
  }
  // Ensure LocalCacheManager is initialized (no-op if already done during engine loading)
  if (!LocalCacheManager.Instance.IsInitialized) {
    // Build cache config from mj.config.cjs cacheSettings
    const cs = configInfo.cacheSettings;
    const cacheConfig = {
      maxSizeBytes: (cs.maxMemoryMB ?? 150) * 1024 * 1024,
      maxPercentOfCachePerEntity: cs.maxPercentOfCachePerEntity ?? 50,
      defaultTTLMs: (cs.defaultTTLSeconds ?? 0) * 1000,
      evictionSweepIntervalMs: (cs.evictionSweepIntervalSeconds ?? 300) * 1000,
      verboseLogging: cs.verboseLogging ?? false,
    };
    await LocalCacheManager.Instance.Initialize(Metadata.Provider.LocalStorageProvider, cacheConfig); // global-provider-ok: bootstrap
    console.log('LocalCacheManager initialized with cache config:', JSON.stringify({
      maxMemoryMB: cs.maxMemoryMB ?? 150,
      maxPercentOfCachePerEntity: cs.maxPercentOfCachePerEntity ?? 50,
      evictionSweepIntervalSeconds: cs.evictionSweepIntervalSeconds ?? 300,
    }));
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

  tServe = lap('Telemetry + Cache + APIKey Init', tServe);

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

  // ─── Discover all server middleware via ClassFactory ─────────────────────
  const allRegistrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseServerMiddleware);

  // Deduplicate by key (same key -> highest priority wins).
  // This is the replacement mechanism: if BCSaaS registers with the same
  // key as MJ's built-in tenant filter, ClassFactory's priority system
  // ensures only the higher-priority one is used.
  const uniqueKeys = new Set(
      allRegistrations.map(r => r.Key?.trim().toLowerCase()).filter((k): k is string => k != null)
  );

  const winnerRegistrations: typeof allRegistrations = [];
  for (const key of uniqueKeys) {
      const winner = MJGlobal.Instance.ClassFactory.GetRegistration(BaseServerMiddleware, key);
      if (winner) winnerRegistrations.push(winner);
  }

  // Instantiate and filter by Enabled
  const middlewares: BaseServerMiddleware[] = [];
  for (const reg of winnerRegistrations) {
      const MwClass = reg.SubClass as new () => BaseServerMiddleware;
      const mw = new MwClass();
      if (mw.Enabled) {
          middlewares.push(mw);
      }
  }

  // Initialize all middleware
  for (const mw of middlewares) {
      await mw.Initialize();
      console.log(`  [Middleware] ${mw.Label}`);
  }

  // Collect middleware contributions for each pipeline stage
  const mwPreAuth: RequestHandler[] = [];
  const mwPostAuth: RequestHandler[] = [];
  const mwPostRoute: (RequestHandler | ErrorRequestHandler)[] = [];
  const mwApolloPlugins: ApolloServerPlugin[] = [];
  const mwSchemaTransformers: ((schema: GraphQLSchema) => GraphQLSchema)[] = [];
  const mwResolverPaths: string[] = [];

  for (const mw of middlewares) {
      mwPreAuth.push(...mw.GetPreAuthMiddleware());
      mwPostAuth.push(...mw.GetPostAuthMiddleware());
      mwPostRoute.push(...mw.GetPostRouteMiddleware());
      mwApolloPlugins.push(...mw.GetApolloPlugins());
      mwSchemaTransformers.push(...mw.GetSchemaTransformers());
      mwResolverPaths.push(...mw.GetResolverPaths());

      // Express app configuration escape hatch
      if (mw.ConfigureExpressApp) {
          await mw.ConfigureExpressApp(app);
      }

      // Extract hook methods and register in the global hook store
      // (ProviderBase/BaseEntity will read these via GetDataHooks())
      RegisterDataHook('PreRunView', mw.PreRunView.bind(mw));
      RegisterDataHook('PostRunView', mw.PostRunView.bind(mw));
      RegisterDataHook('PreSave', mw.PreSave.bind(mw));
  }

  // ─── Resolve middleware-contributed resolver paths and merge into resolvers ───
  let allResolvers = resolvers;
  if (mwResolverPaths.length > 0) {
      const mwGlobs = mwResolverPaths.flatMap((p) => (isWindows ? p.replace(/\\/g, '/') : p));
      const mwResolverFiles = fg.globSync(mwGlobs);
      if (mwResolverFiles.length > 0) {
          const mwModules = await Promise.all(
              mwResolverFiles.map((modulePath) => {
                  try {
                      return import(isWindows ? `file://${modulePath}` : modulePath);
                  } catch (e) {
                      console.error(`Error loading middleware resolver at '${modulePath}'`, e);
                      throw e;
                  }
              })
          );
          const mwResolvers = mwModules.flatMap((module) =>
              Object.values(module).filter((value) => typeof value === 'function')
          );
          allResolvers = [...resolvers, ...mwResolvers] as BuildSchemaOptions['resolvers'];
          console.log(`  [Middleware Resolvers] Loaded ${mwResolverFiles.length} resolver file(s) from middleware`);
      }
  }

  // Create an explicit PubSub instance so we can reference it outside of resolvers
  // graphql-subscriptions v3 renamed asyncIterator→asyncIterableIterator, but
  // type-graphql still calls asyncIterator. Shim for compatibility.
  const pubSub = new PubSub() as unknown as Record<string, unknown>;
  if (!pubSub.asyncIterator && typeof pubSub.asyncIterableIterator === 'function') {
    pubSub.asyncIterator = pubSub.asyncIterableIterator;
  }
  PubSubManager.Instance.SetPubSubEngine(pubSub as unknown as PubSubEngine);

  // Wire the ClientToolRequestManager so BaseAgent can publish client tool requests
  // via the same PubSub infrastructure used for pipeline progress and cache invalidation.
  ClientToolRequestManager.Instance.SetPublishFunction(
    (topic: string, payload: Record<string, unknown>) => PubSubManager.Instance.Publish(topic, payload)
  );

  // Global listener: broadcast CACHE_INVALIDATION to all browser clients whenever
  // ANY BaseEntity save/delete occurs on this server — regardless of whether it
  // originated from a GraphQL mutation or internal server-side code (agents, actions,
  // task orchestrator, etc.).  This closes the gap where server-internal saves were
  // invisible to browser BaseEngine caches.
  MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
    if (event.event === MJEventType.ComponentEvent && event.eventCode === BaseEntity.BaseEventCode) {
      const beEvent = event.args as BaseEntityEvent;
      if (beEvent.type === 'save' || beEvent.type === 'delete') {
        PubSubManager.Instance.Publish(CACHE_INVALIDATION_TOPIC, {
          entityName: beEvent.baseEntity.EntityInfo.Name,
          primaryKeyValues: JSON.stringify(beEvent.baseEntity.PrimaryKey.KeyValuePairs),
          action: beEvent.type,
          sourceServerId: MJGlobal.Instance.ProcessUUID,
          timestamp: new Date(),
          originSessionId: null,
          recordData: beEvent.type === 'save' ? JSON.stringify(beEvent.baseEntity.GetAll()) : undefined,
        });
      }
    }
  });

  tServe = lap('Resolver + Middleware Discovery', tServe);

  let schema = mergeSchemas({
    schemas: [
      buildSchemaSync({
        resolvers: allResolvers,
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

  // Apply middleware-contributed schema transformers (after built-in directive transformers)
  for (const transformer of mwSchemaTransformers) {
    schema = transformer(schema);
  }

  tServe = lap('Schema Build', tServe);

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
    mwApolloPlugins.length > 0 ? mwApolloPlugins : undefined
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

  // Health check endpoint - registered before auth middleware so cloud
  // platform probes (Azure App Service, AWS ALB, k8s, etc.) don't
  // generate noisy auth errors in the logs. CORS is enabled so browser-based
  // clients (e.g. MJExplorer's connectivity poller) can read the response.
  app.get('/healthcheck', cors<cors.CorsRequest>(), (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Apply middleware-contributed pre-auth handlers (after compression, before routes)
  for (const mw of mwPreAuth) {
    app.use(mw);
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

  // ─── Server extensions (before auth — extensions handle their own auth) ─────
  // Slack uses HMAC signature verification, Teams uses Bot Framework JWT validation.
  // These must be registered before the unified auth middleware so webhook
  // requests aren't rejected for lacking an MJ bearer token.
  const extensionLoader = new ServerExtensionLoader();
  const extensionConfigs = (configInfo.serverExtensions ?? []) as ServerExtensionConfig[];
  if (extensionConfigs.length > 0) {
    await extensionLoader.LoadExtensions(app, extensionConfigs);
  }

  // Extension health endpoint (always available, returns empty array if no extensions)
  app.get('/health/extensions', async (_req, res) => {
    const results = await extensionLoader.HealthCheckAll();
    const allHealthy = results.length === 0 || results.every(r => r.Healthy);
    res.status(allHealthy ? 200 : 503).json({ extensions: results });
  });

  // ─── Unified auth middleware (replaces both REST authMiddleware and contextFunction auth) ─────
  app.use(createUnifiedAuthMiddleware(dataSources));

  // ─── Post-auth middleware from BaseServerMiddleware plugins ─────
  // Middleware here has access to the authenticated user via req.userPayload.
  // Contributions come from @RegisterClass(BaseServerMiddleware, key) classes
  // (e.g., MJTenantFilterMiddleware for multi-tenancy, BCSaaSMiddleware for org context).
  for (const mw of mwPostAuth) {
    app.use(mw);
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
  for (const mw of mwPostRoute) {
    app.use(mw);
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

  // Data hooks are now registered via BaseServerMiddleware classes above
  // (e.g., MJTenantFilterMiddleware registers PreRunView and PreSave hooks).
  // No config-bag hook registration needed.

  if (options?.onBeforeServe) {
    await Promise.resolve(options.onBeforeServe());
  }

  tServe = lap('Apollo + Express Setup', tServe);

  await new Promise<void>((resolve) => httpServer.listen({ port: graphqlPort }, resolve));
  lap('Total Startup', t0);
  console.log(`📦 Connected to database: ${dbHost}:${dbPort}/${dbDatabase}`);
  console.log(`🚀 Server ready at http://localhost:${graphqlPort}/`);

  // Process pending RSU work from pre-restart (entity maps, field maps, sync)
  processRSUPendingWork().catch(err => console.warn(`RSU pending work processing failed: ${err}`));

  // Resume any integration syncs that were orphaned by the previous process restart
  const resumeUser = UserCache.Instance.GetSystemUser();
  if (resumeUser) {
    IntegrationEngine.Instance.ResumeOrphanedSyncs(resumeUser)
      .catch(err => console.warn(`[IntegrationEngine] Orphaned sync resume failed: ${err}`));
  }

  // Set up graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    // Stop server extensions
    if (extensionLoader.ExtensionCount > 0) {
      try {
        await extensionLoader.ShutdownAll();
        console.log('✅ Server extensions shut down');
      } catch (error) {
        console.error('❌ Error shutting down server extensions:', error);
      }
    }

    // Stop scheduled jobs service
    if (scheduledJobsService?.IsRunning) {
      try {
        await scheduledJobsService.Stop();
        console.log('✅ Scheduled jobs service stopped');
      } catch (error) {
        console.error('❌ Error stopping scheduled jobs service:', error);
      }
    }

    // Drain anything self-registered with ShutdownRegistry — QueueManager,
    // future engines/services with timers/intervals/listeners. Each is
    // responsible for being idempotent and not throwing.
    try {
      const count = ShutdownRegistry.Instance.Count;
      if (count > 0) {
        await ShutdownRegistry.Instance.ShutdownAll();
        console.log(`✅ ShutdownRegistry drained ${count} registered service(s)`);
      }
    } catch (error) {
      console.error('❌ Error draining ShutdownRegistry:', error);
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
 * Process pending RSU work left from a pre-restart Apply All.
 * Reads pending work files, creates entity maps + field maps, starts sync.
 */
async function processRSUPendingWork(): Promise<void> {
  // Dynamic import — schema-engine is not yet published to npm, only exists as a workspace package
  const { RuntimeSchemaManager } = await import('@memberjunction/schema-engine');
  const rsm = RuntimeSchemaManager.Instance;
  const pendingItems = await rsm.ReadAndClearPendingWork();
  if (pendingItems.length === 0) return;

  console.log(`[RSU] Processing ${pendingItems.length} pending work item(s) from pre-restart...`);

  // Wait a moment for metadata to be fully loaded
  await new Promise(resolve => setTimeout(resolve, 3000));

  for (const item of pendingItems) {
    try {
      const md = new Metadata(); // global-provider-ok: server startup recovery — runs once before any per-request context exists
      // Get system user for server-side operations
      const systemUser = UserCache.Instance.Users.find(u => u.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Instance.Users[0];
      if (!systemUser) {
        console.warn(`[RSU] No system user found, skipping pending work for ${item.CompanyIntegrationID}`);
        continue;
      }

      await Metadata.Provider.Refresh(); // global-provider-ok: server startup recovery — one-shot global cache refresh

      // Resolve connector
      const rv = new RunView();
      const ciResult = await rv.RunView<MJCompanyIntegrationEntity>({
        EntityName: 'MJ: Company Integrations',
        ExtraFilter: `ID='${item.CompanyIntegrationID}'`,
        ResultType: 'entity_object',
      }, systemUser);
      const companyIntegration = ciResult.Results[0];
      if (!companyIntegration) {
        console.warn(`[RSU] CompanyIntegration ${item.CompanyIntegrationID} not found`);
        continue;
      }

      const integrationName = companyIntegration.Integration;
      const integrationResult = await rv.RunView<MJIntegrationEntity>({
        EntityName: 'MJ: Integrations',
        ExtraFilter: `Name='${integrationName}'`,
        ResultType: 'entity_object',
      }, systemUser);
      const integrationEntity = integrationResult.Results[0];
      if (!integrationEntity) {
        console.warn(`[RSU] Integration entity for ${integrationName} not found`);
        continue;
      }
      const connector = ConnectorFactory.Resolve(integrationEntity);
      if (!connector) {
        console.warn(`[RSU] Connector for ${integrationName} not found`);
        continue;
      }

      // Create entity maps + field maps for each source object
      const createdEntityMapIDs: string[] = [];
      const rvPending = new RunView();
      const sourceObjectFields: Record<string, string[] | null> = item.SourceObjectFields ?? {};

      // Introspect schema ONCE for the entire connector, then reuse per object
      const introspect = connector.IntrospectSchema.bind(connector) as
        (ci: unknown, u: unknown) => Promise<{ Objects: Array<{ ExternalName: string; Fields: Array<{ Name: string; IsPrimaryKey?: boolean; IsRequired?: boolean }> }> }>;
      const schema = await introspect(companyIntegration, systemUser);

      for (const objName of item.SourceObjectNames) {
        const tableName = objName.replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
        const entity = md.Entities.find(
          e => e.SchemaName.toLowerCase() === item.SchemaName.toLowerCase() &&
               e.BaseTable.toLowerCase() === tableName
        );
        if (!entity) {
          console.warn(`[RSU] Entity not found for ${item.SchemaName}.${tableName}`);
          continue;
        }

        // Check if entity map already exists for this connector + entity
        const existingMapResult = await rvPending.RunView<MJCompanyIntegrationEntityMapEntity>({
          EntityName: 'MJ: Company Integration Entity Maps',
          ExtraFilter: `CompanyIntegrationID='${item.CompanyIntegrationID}' AND EntityID='${entity.ID}'`,
          ResultType: 'entity_object',
        }, systemUser);

        let entityMapID: string;
        let isNewMap = false;

        if (existingMapResult.Success && existingMapResult.Results.length > 0) {
          entityMapID = existingMapResult.Results[0].ID;
          console.log(`[RSU] Entity map already exists for ${objName} → ${entity.Name} (${entityMapID})`);
        } else {
          const entityMap = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>(
            'MJ: Company Integration Entity Maps', systemUser
          );
          entityMap.NewRecord();
          entityMap.CompanyIntegrationID = item.CompanyIntegrationID;
          entityMap.EntityID = entity.ID;
          entityMap.ExternalObjectName = objName;
          entityMap.SyncDirection = 'Pull';
          entityMap.Status = 'Active';
          entityMap.SyncEnabled = true;
          const mapSaved = await entityMap.Save();
          if (!mapSaved) {
            console.warn(`[RSU] Failed to save entity map for ${objName}`);
            continue;
          }
          entityMapID = entityMap.ID;
          isNewMap = true;
        }

        if (isNewMap) createdEntityMapIDs.push(entityMapID);

        // Create field maps — filter by SourceObjectFields (null = all)
        try {
          const sourceObj = schema.Objects.find(o => o.ExternalName.toLowerCase() === objName.toLowerCase());

          const selectedFields = sourceObjectFields[objName]; // null = all, string[] = specific
          const fieldsToMap = selectedFields
            ? (sourceObj?.Fields ?? []).filter(f => selectedFields.some(sf => sf.toLowerCase() === f.Name.toLowerCase()))
            : (sourceObj?.Fields ?? []);

          // Load existing field maps to avoid duplicates
          const existingFieldMaps = await rvPending.RunView<MJCompanyIntegrationFieldMapEntity>({
            EntityName: 'MJ: Company Integration Field Maps',
            ExtraFilter: `EntityMapID='${entityMapID}'`,
            ResultType: 'simple',
            Fields: ['SourceFieldName'],
          }, systemUser);
          const existingFieldNames = new Set(
            (existingFieldMaps.Success ? existingFieldMaps.Results : []).map((fm: { SourceFieldName: string }) => fm.SourceFieldName.toLowerCase())
          );

          let fieldCount = 0;
          for (const field of fieldsToMap) {
            if (existingFieldNames.has(field.Name.toLowerCase())) continue;
            const fieldMap = await md.GetEntityObject<MJCompanyIntegrationFieldMapEntity>(
              'MJ: Company Integration Field Maps', systemUser
            );
            fieldMap.NewRecord();
            fieldMap.EntityMapID = entityMapID;
            fieldMap.SourceFieldName = field.Name;
            fieldMap.DestinationFieldName = field.Name.replace(/[^A-Za-z0-9_]/g, '_');
            fieldMap.IsKeyField = field.IsPrimaryKey ?? false;
            fieldMap.IsRequired = field.IsRequired ?? false;
            fieldMap.Direction = 'SourceToDest';
            fieldMap.Status = 'Active';
            if (await fieldMap.Save()) fieldCount++;
          }
          console.log(`[RSU] Created entity map for ${objName} → ${entity.Name} with ${fieldCount} field maps${isNewMap ? '' : ' (existing map, new fields only)'}`);
        } catch (fieldErr) {
          console.warn(`[RSU] Field map creation failed for ${objName}: ${fieldErr}`);
        }
      }

      // Start sync if requested
      if (item.StartSync !== false) {
        try {
          await IntegrationEngine.Instance.Config(false, systemUser);
          const syncOptions: IntegrationSyncOptions = {};
          if (item.SyncScope !== 'all' && createdEntityMapIDs.length > 0) syncOptions.EntityMapIDs = createdEntityMapIDs;
          if (item.FullSync) syncOptions.FullSync = true;
          if (item.SyncDirection) syncOptions.SyncDirection = item.SyncDirection;
          const opts = Object.keys(syncOptions).length > 0 ? syncOptions : undefined;
          IntegrationEngine.Instance.RunSync(item.CompanyIntegrationID, systemUser, 'Manual', undefined, undefined, opts);
          console.log(`[RSU] Sync started for ${item.CompanyIntegrationID} (EntityMaps: ${createdEntityMapIDs.length}, FullSync: ${!!item.FullSync}, SyncDirection: ${item.SyncDirection ?? 'entity-map default'})`);
        } catch (syncErr) {
          console.warn(`[RSU] Sync start failed: ${syncErr}`);
        }
      } else {
        console.log(`[RSU] Sync skipped for ${item.CompanyIntegrationID} (StartSync=false)`);
      }

      // Create or update schedule if CronExpression provided
      if (item.CronExpression) {
        try {
          const rvSched = new RunView();

          // Find existing schedule by loading all integration sync jobs and matching Configuration JSON exactly
          const allJobsResult = await rvSched.RunView<MJScheduledJobEntity>({
            EntityName: 'MJ: Scheduled Jobs',
            ExtraFilter: `Status IN ('Active', 'Paused')`,
            ResultType: 'entity_object',
          }, systemUser);

          let existingJob: MJScheduledJobEntity | null = null;
          if (allJobsResult.Success) {
            for (const j of allJobsResult.Results) {
              try {
                const config = JSON.parse(j.Configuration || '{}') as Record<string, unknown>;
                if (config.CompanyIntegrationID === item.CompanyIntegrationID) {
                  existingJob = j;
                  break;
                }
              } catch { /* skip invalid JSON */ }
            }
          }

          let job: MJScheduledJobEntity;
          let isUpdate = false;

          if (existingJob) {
            job = existingJob;
            isUpdate = true;
          } else {
            const jobTypeResult = await rvSched.RunView<{ ID: string }>({
              EntityName: 'MJ: Scheduled Job Types',
              ExtraFilter: `DriverClass='IntegrationSyncScheduledJobDriver'`,
              MaxRows: 1,
              ResultType: 'simple',
              Fields: ['ID']
            }, systemUser);

            if (!jobTypeResult.Success || jobTypeResult.Results.length === 0) {
              console.warn(`[RSU] IntegrationSyncScheduledJobDriver job type not found`);
              throw new Error('Job type not found');
            }

            job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', systemUser);
            job.NewRecord();
            job.JobTypeID = jobTypeResult.Results[0].ID;
            job.OwnerUserID = systemUser.ID;
            const schedConfig: Record<string, unknown> = { CompanyIntegrationID: item.CompanyIntegrationID };
            if (item.ScheduleSyncDirection) schedConfig.SyncDirection = item.ScheduleSyncDirection;
            job.Configuration = JSON.stringify(schedConfig);
          }

          job.Name = `${integrationName} Scheduled Sync`;
          job.CronExpression = item.CronExpression;
          job.Timezone = item.ScheduleTimezone || 'UTC';
          job.Status = 'Active';
          job.NextRunAt = CronExpressionHelper.GetNextRunTime(item.CronExpression, item.ScheduleTimezone || 'UTC');
          if (await job.Save()) {
            console.log(`[RSU] ${isUpdate ? 'Updated' : 'Created'} schedule "${job.Name}" (${item.CronExpression}, NextRunAt=${job.NextRunAt.toISOString()}) for ${item.CompanyIntegrationID}`);
            companyIntegration.ScheduleEnabled = true;
            companyIntegration.ScheduleType = 'Cron';
            companyIntegration.CronExpression = item.CronExpression;
            await companyIntegration.Save();
          } else {
            console.warn(`[RSU] Failed to save schedule for ${item.CompanyIntegrationID}`);
          }
        } catch (schedErr) {
          console.warn(`[RSU] Schedule creation failed: ${schedErr}`);
        }
      }
    } catch (err) {
      console.error(`[RSU] Failed to process pending work for ${item.CompanyIntegrationID}: ${err}`);
    }
  }

  console.log(`[RSU] Pending work processing complete`);
}

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
      return new UserInfo(Metadata.Provider, userWithRoles); // global-provider-ok: bootstrap (UserCache initialization)
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
