import { ApolloServer, ApolloServerOptions, ApolloServerPlugin } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { Disposable } from 'graphql-ws';
import { Server } from 'http';
import { enableIntrospection } from '../config.js';
import { AppContext } from '../types.js';
import { Metadata } from '@memberjunction/core';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

/**
 * Creates and configures an Apollo Server instance with built-in plugins
 * for HTTP drain and WebSocket cleanup.
 *
 * @param configOverride - Apollo Server options (typically contains the schema)
 * @param servers - HTTP server and WebSocket cleanup disposable
 * @param additionalPlugins - Optional additional plugins to merge with built-in plugins
 */
const buildApolloServer = (
  configOverride: ApolloServerOptions<AppContext>,
  { httpServer, serverCleanup }: { httpServer: Server; serverCleanup: Disposable },
  additionalPlugins?: ApolloServerPlugin[]
) => {
  const builtInPlugins: ApolloServerPlugin[] = [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    }
  ];

  const allPlugins = additionalPlugins
    ? [...builtInPlugins, ...additionalPlugins]
    : builtInPlugins;

  return new ApolloServer({
    csrfPrevention: true,
    cache: 'bounded',
    plugins: allPlugins,
    introspection: enableIntrospection,
    ...configOverride,
  });
};

export default buildApolloServer;
