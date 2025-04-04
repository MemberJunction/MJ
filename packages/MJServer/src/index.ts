import dotenv from 'dotenv';

dotenv.config();

import { expressMiddleware } from '@apollo/server/express4';
import { mergeSchemas } from '@graphql-tools/schema';
import { Metadata } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { default as BodyParser } from 'body-parser';
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
import { DataSource } from 'typeorm';
import { WebSocketServer } from 'ws';
import buildApolloServer from './apolloServer/index.js';
import { configInfo, dbDatabase, dbHost, dbPort, dbUsername, graphqlPort, graphqlRootPath, mj_core_schema, websiteRunFromPackage } from './config.js';
import { contextFunction, getUserPayload } from './context.js';
import { requireSystemUserDirective, publicDirective } from './directives/index.js';
import orm from './orm.js';

import { LoadActionEntityServer } from '@memberjunction/actions';
LoadActionEntityServer(); // prevent tree shaking for this dynamic module

import { LoadGeneratedActions } from '@memberjunction/core-actions';
LoadGeneratedActions(); // prevent tree shaking for this dynamic module

import { ExternalChangeDetectorEngine } from '@memberjunction/external-change-detection';

const cacheRefreshInterval = configInfo.databaseSettings.metadataCacheRefreshInterval;

export { MaxLength } from 'class-validator';
export * from 'type-graphql';
export { NewUserBase } from './auth/newUsers.js';
export { configInfo } from './config.js';
export * from './directives/index.js';
export * from './entitySubclasses/userViewEntity.server.js';
export * from './entitySubclasses/entityPermissions.server.js';
export * from './entitySubclasses/DuplicateRunEntity.server.js';
export * from './entitySubclasses/reportEntity.server.js';
export * from './types.js';
export { TokenExpiredError, getSystemUser } from './auth/index.js';

export * from './generic/PushStatusResolver.js';
export * from './generic/ResolverBase.js';
export * from './generic/RunViewResolver.js';
export * from './generic/KeyValuePairInput.js';
export * from './generic/KeyInputOutputTypes.js';
export * from './generic/DeleteOptionsInput.js';

export * from './resolvers/AskSkipResolver.js';
export * from './resolvers/ColorResolver.js';
export * from './resolvers/DatasetResolver.js';
export * from './resolvers/EntityRecordNameResolver.js';
export * from './resolvers/MergeRecordsResolver.js';
export * from './resolvers/ReportResolver.js';
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

  const dataSource = new DataSource(orm(paths));
  const setupComplete$ = new ReplaySubject(1);
  await dataSource.initialize();

  const config = new SQLServerProviderConfigData(dataSource, '', mj_core_schema, cacheRefreshInterval);
  await setupSQLServerClient(config); // datasource is already initialized, so we can setup the client right away
  const md = new Metadata();
  console.log(`Data Source has been initialized. ${md?.Entities ? md.Entities.length : 0} entities loaded.`);

  const dataSources = [new DataSourceInfo({dataSource, type: 'Read-Write', host: dbHost, port: dbPort, database: dbDatabase, userName: dbUsername})];
  
  // Establish a second read-only connection to the database if dbReadOnlyUsername and dbReadOnlyPassword exist
  let readOnlyDataSource: DataSource | null = null;
  if (configInfo.dbReadOnlyUsername && configInfo.dbReadOnlyPassword) {
    const readOnlyConfig = {
      ...orm(paths),
      username: configInfo.dbReadOnlyUsername,
      password: configInfo.dbReadOnlyPassword,
    };
    readOnlyDataSource = new DataSource(readOnlyConfig);
    await readOnlyDataSource.initialize();

    // since we created a read-only data source, add it to the list of data sources
    dataSources.push(new DataSourceInfo({dataSource: readOnlyDataSource, type: 'Read-Only', host: dbHost, port: dbPort, database: dbDatabase, userName: configInfo.dbReadOnlyUsername}));
    console.log('Read-only Data Source has been initialized.');
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

  app.use(
    graphqlRootPath,
    cors<cors.CorsRequest>(),
    BodyParser.json({ limit: '50mb' }),
    expressMiddleware(apolloServer, {
      context: contextFunction({ 
                                 setupComplete$, 
                                 dataSource, // default read-write data source
                                 dataSources // all data source
                               }),
    })
  );

  if (options?.onBeforeServe) {
    await Promise.resolve(options.onBeforeServe());
  }

  await new Promise<void>((resolve) => httpServer.listen({ port: graphqlPort }, resolve));
  console.log(`🚀 Server ready at http://localhost:${graphqlPort}/`);
};
