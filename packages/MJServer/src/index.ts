import dotenv from 'dotenv';

dotenv.config();

import { expressMiddleware } from '@apollo/server/express4';
import { mergeSchemas } from '@graphql-tools/schema';
import { Metadata } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { extendConnectionPoolWithQuery } from './util.js';
import { default as BodyParser } from 'body-parser';
import compression from 'compression'; // Add compression middleware
import cors from 'cors';
import express from 'express';
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

import { LoadActionEntityServer } from '@memberjunction/actions';
LoadActionEntityServer(); // prevent tree shaking for this dynamic module

import { LoadGeneratedActions } from '@memberjunction/core-actions';
LoadGeneratedActions(); // prevent tree shaking for this dynamic module

import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';
LoadCoreEntitiesServerSubClasses(); // prevent tree shaking for this dynamic module

import { ExternalChangeDetectorEngine } from '@memberjunction/external-change-detection';

const cacheRefreshInterval = configInfo.databaseSettings.metadataCacheRefreshInterval;

export { MaxLength } from 'class-validator';
export * from 'type-graphql';
export { NewUserBase } from './auth/newUsers.js';
export { configInfo } from './config.js';
export * from './directives/index.js';
export * from './entitySubclasses/entityPermissions.server.js';
export * from './types.js';
export { TokenExpiredError, getSystemUser } from './auth/index.js';

export * from './generic/PushStatusResolver.js';
export * from './generic/ResolverBase.js';
export * from './generic/RunViewResolver.js';
export * from './resolvers/RunTemplateResolver.js';
export * from './resolvers/RunAIPromptResolver.js';
export * from './resolvers/RunAIAgentResolver.js';
export * from './generic/KeyValuePairInput.js';
export * from './generic/KeyInputOutputTypes.js';
export * from './generic/DeleteOptionsInput.js';

export * from './resolvers/AskSkipResolver.js';
export * from './resolvers/ColorResolver.js';
export * from './resolvers/DatasetResolver.js';
export * from './resolvers/EntityRecordNameResolver.js';
export * from './resolvers/MergeRecordsResolver.js';
export * from './resolvers/ReportResolver.js';
export * from './resolvers/SqlLoggingConfigResolver.js';
export * from './resolvers/SyncRolesUsersResolver.js';
export * from './resolvers/SyncDataResolver.js';
export * from './resolvers/GetDataResolver.js';
export * from './resolvers/GetDataContextDataResolver.js';
export * from './resolvers/TransactionGroupResolver.js';

export { GetReadOnlyDataSource, GetReadWriteDataSource } from './util.js';

export * from './generated/generated.js';

import { resolve } from 'node:path';
import { DataSourceInfo, raiseEvent } from './types.js';

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

export const createApp = () => express();

export const serve = async (resolverPaths: Array<string>, app = createApp(), options?: MJServerOptions) => {
  const localResolverPaths = ['resolvers/**/*Resolver.{js,ts}', 'generic/*Resolver.{js,ts}', 'generated/generated.{js,ts}'].map(localPath);

  const combinedResolverPaths = [...resolverPaths, ...localResolverPaths];

  const isWindows = sep === '\\';
  const globs = combinedResolverPaths.flatMap((path) => (isWindows ? path.replace(/\\/g, '/') : path));
  const paths = fg.globSync(globs);
  if (paths.length === 0) {
    console.warn(`No resolvers found in ${combinedResolverPaths.join(', ')}`);
    console.log({ combinedResolverPaths, paths, cwd: process.cwd() });
  }

  const pool = new sql.ConnectionPool(createMSSQLConfig());
  const setupComplete$ = new ReplaySubject(1);
  await pool.connect();

  const config = new SQLServerProviderConfigData(pool, mj_core_schema, cacheRefreshInterval);
  await setupSQLServerClient(config); // datasource is already initialized, so we can setup the client right away
  const md = new Metadata();
  console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);

  const dataSources = [new DataSourceInfo({dataSource: pool, type: 'Read-Write', host: dbHost, port: dbPort, database: dbDatabase, userName: dbUsername})];
  
  // Establish a second read-only connection to the database if dbReadOnlyUsername and dbReadOnlyPassword exist
  let readOnlyPool: sql.ConnectionPool | null = null;
  if (configInfo.dbReadOnlyUsername && configInfo.dbReadOnlyPassword) {
    const readOnlyConfig = {
      ...createMSSQLConfig(),
      user: configInfo.dbReadOnlyUsername,
      password: configInfo.dbReadOnlyPassword,
    };
    readOnlyPool = new sql.ConnectionPool(readOnlyConfig);
    await readOnlyPool.connect();

    // since we created a read-only pool, add it to the list of data sources
    dataSources.push(new DataSourceInfo({dataSource: readOnlyPool, type: 'Read-Only', host: dbHost, port: dbPort, database: dbDatabase, userName: configInfo.dbReadOnlyUsername}));
    console.log('Read-only Connection Pool has been initialized.');
  }

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

  app.use(
    graphqlRootPath,
    cors<cors.CorsRequest>(),
    BodyParser.json({ limit: '50mb' }),
    expressMiddleware(apolloServer, {
      context: contextFunction({ 
                                 setupComplete$, 
                                 dataSource: extendConnectionPoolWithQuery(pool), // default read-write data source
                                 dataSources // all data source
                               }),
    })
  );
  
  // Setup REST API endpoints
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
      
      req.user = userPayload;
      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
  
  // Get REST API configuration from the config file
  const restApiConfig: RESTApiOptions = {
    enabled: configInfo.restApiOptions?.enabled ?? true,
    includeEntities: configInfo.restApiOptions?.includeEntities,
    excludeEntities: configInfo.restApiOptions?.excludeEntities
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

  if (options?.onBeforeServe) {
    await Promise.resolve(options.onBeforeServe());
  }

  await new Promise<void>((resolve) => httpServer.listen({ port: graphqlPort }, resolve));
  console.log(`📦 Connected to database: ${dbHost}:${dbPort}/${dbDatabase}`);
  console.log(`🚀 Server ready at http://localhost:${graphqlPort}/`);
};
