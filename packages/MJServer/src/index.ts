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
import buildApolloServer from './apolloServer';
import { configInfo, graphqlPort, graphqlRootPath, mj_core_schema, websiteRunFromPackage } from './config';
import { contextFunction, getUserPayload } from './context';
import { publicDirective } from './directives';
import orm from './orm';

import { LoadActionEntityServer } from '@memberjunction/actions';
LoadActionEntityServer(); // prevent tree shaking for this dynamic module

import { LoadGeneratedActions } from '@memberjunction/core-actions';
LoadGeneratedActions(); // prevent tree shaking for this dynamic module

import { ExternalChangeDetectorEngine } from '@memberjunction/external-change-detection';

const cacheRefreshInterval = configInfo.databaseSettings.metadataCacheRefreshInterval;

export { MaxLength } from 'class-validator';
export * from 'type-graphql';
export { NewUserBase } from './auth/newUsers';
export { configInfo } from './config';
export * from './directives';
export * from './entitySubclasses/userViewEntity.server';
export * from './entitySubclasses/entityPermissions.server';
export * from './entitySubclasses/DuplicateRunEntity.server';
export * from './types';
export { TokenExpiredError } from './auth';

export * from './generic/PushStatusResolver';
export * from './generic/ResolverBase';
export * from './generic/RunViewResolver';
export * from './generic/KeyValuePairInput';
export * from './generic/KeyInputOutputTypes';
export * from './generic/DeleteOptionsInput';

export * from './resolvers/AskSkipResolver';
export * from './resolvers/ColorResolver';
export * from './resolvers/DatasetResolver';
export * from './resolvers/EntityRecordNameResolver';
export * from './resolvers/MergeRecordsResolver';
export * from './resolvers/ReportResolver';

export * from './generated/generated';

import { resolve } from 'node:path';

const localPath = (p: string) => {
  // Convert import.meta.url to a local directory path
  const dirname = fileURLToPath(new URL('.', import.meta.url));
  // Resolve the provided path relative to the derived directory path
  const resolvedPath = resolve(dirname, p);
  return resolvedPath;
};

export const serve = async (resolverPaths: Array<string>) => {
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
  setupComplete$.next(true);

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

  const dynamicModules = await Promise.all(paths.map((modulePath) => import(isWindows ? `file://${modulePath}` : modulePath)));
  const resolvers = dynamicModules.flatMap((module) =>
    Object.values(module).filter((value) => typeof value === 'function')
  ) as BuildSchemaOptions['resolvers'];

  const schema = publicDirective.transformer(
    mergeSchemas({
      schemas: [
        buildSchemaSync({
          resolvers,
          validate: false,
          scalarsMap: [{ type: Date, scalar: GraphQLTimestamp }],
          emitSchemaFile: websiteRunFromPackage !== 1,
        }),
      ],
      typeDefs: [publicDirective.typeDefs],
    })
  );

  const app = express();
  const httpServer = createServer(app);

  const webSocketServer = new WebSocketServer({ server: httpServer, path: graphqlRootPath });
  const serverCleanup = useServer(
    {
      schema,
      context: async ({ connectionParams }) => {
        const userPayload = await getUserPayload(String(connectionParams?.Authorization), undefined, dataSource);
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
      context: contextFunction({ setupComplete$, dataSource }),
    })
  );

  await new Promise<void>((resolve) => httpServer.listen({ port: graphqlPort }, resolve));
  console.log(`🚀 Server ready at http://localhost:${graphqlPort}/`);
};
