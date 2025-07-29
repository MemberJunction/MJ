import { ApolloServer, ApolloServerOptions } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { Disposable } from 'graphql-ws';
import { Server } from 'http';
import { enableIntrospection } from '../config.js';
import { AppContext } from '../types.js';
import { Metadata } from '@memberjunction/core';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

// Plugin to clean up transaction contexts after each request
const TransactionCleanupPlugin = {
  async requestDidStart() {
    return {
      async willSendResponse(requestContext) {
        // Clean up the transaction context when the request ends
        const transactionScopeId = requestContext.contextValue?.userPayload?.transactionScopeId;
        if (transactionScopeId) {
          try {
            const provider = Metadata.Provider as SQLServerDataProvider;
            provider.disposeTransactionContext(transactionScopeId);
          } catch (error) {
            console.error(`[TransactionCleanupPlugin] Error disposing transaction context: ${transactionScopeId}`, error);
          }
        }
      }
    };
  }
};

const buildApolloServer = (
  configOverride: ApolloServerOptions<AppContext>,
  { httpServer, serverCleanup }: { httpServer: Server; serverCleanup: Disposable }
) =>
  new ApolloServer({
    csrfPrevention: true,
    cache: 'bounded',
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
      TransactionCleanupPlugin,
    ],
    introspection: enableIntrospection,
    ...configOverride,
  });

export default buildApolloServer;
