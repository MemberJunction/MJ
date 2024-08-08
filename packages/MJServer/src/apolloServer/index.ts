import { ApolloServer, ApolloServerOptions } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { Disposable } from 'graphql-ws';
import { Server } from 'http';
import { enableIntrospection } from '../config.js';
import { AppContext } from '../types.js';
import { TransactionPlugin } from './TransactionPlugin.js';

const buildApolloServer = (
  configOverride: ApolloServerOptions<AppContext>,
  { httpServer, serverCleanup }: { httpServer: Server; serverCleanup: Disposable }
) =>
  new ApolloServer({
    csrfPrevention: true,
    cache: 'bounded',
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      TransactionPlugin,
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
    introspection: enableIntrospection,
    ...configOverride,
  });

export default buildApolloServer;
