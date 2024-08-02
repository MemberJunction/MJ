import { ApolloServerPlugin, GraphQLRequestContextDidEncounterErrors, GraphQLRequestListenerParsingDidEnd } from '@apollo/server';
import { DataSource } from 'typeorm';
import { AppContext } from '../types.js';

export const TransactionPlugin: ApolloServerPlugin<AppContext> = {
  async requestDidStart(requestContext) {
    const start = Date.now();
    const query = requestContext.request.query || '';
    const isMutation = /^\s*mutation\b/i.test(query);

    if (!isMutation) {
      return null;
    }

    // Start transaction, one or more mutations. If it is just one mutation, this trans wrapper isn't really needed
    // but there's no good way to know if it's one or more mutations, so we just start a transaction anyway and it isn't terribly expensive
    // to do so with SQL Server anyway.
    const dataSource: DataSource = requestContext.contextValue.dataSource;
    const queryRunner = dataSource.createQueryRunner();

    requestContext.contextValue.queryRunner = queryRunner;
    console.log('Starting transaction wrapper, time spent: ', Date.now() - start, 'ms ');
    await queryRunner.startTransaction();

    return {
      didEncounterErrors: async (requestContext) => {
        console.log('Error in transaction wrapper: ' + requestContext.errors, 'time spent: ', Date.now() - start, 'ms');
      },
      executionDidStart: async () => {
        return {
          executionDidEnd: async (err) => {
            try {
              if (err) {
                console.log('Error in transaction, rolling back, time spent: ', Date.now() - start, 'ms ');
                console.error('Rolling back transaction', err);
                await queryRunner.rollbackTransaction();
              } else {
                console.log('Committing transaction, time spent: ', Date.now() - start, 'ms ');
                await queryRunner.commitTransaction();
              }
            } catch (execErr) {
              console.log('Execution Error, time spent: ', Date.now() - start, 'ms ');
              console.error(execErr);
            } finally {
              await queryRunner.release();
              console.log('Transaction complete, time spent: ', Date.now() - start, 'ms ');
            }
          },
        };
      },
    };
  },
};
