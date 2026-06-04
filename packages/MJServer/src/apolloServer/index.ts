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
/**
 * Apollo plugin: log every Integration* GraphQL operation to stdout as
 * structured JSON.  Lets operators tailing the MJAPI log see exactly which
 * resolver the wizard / Explorer hit on each press, with arg names (values
 * redacted for credentials).  Diagnostic-only — no behavior change.
 *
 * Emits two events per operation:
 *   {"event":"gql.integration.request","method":"...","fieldName":"...","argNames":[...]}
 *   {"event":"gql.integration.response","method":"...","fieldName":"...","durationMs":N,"hasErrors":bool}
 *
 * Filter from the log:
 *   tail -f /tmp/mjapi.log | grep '"event":"gql\.integration\.'
 */
const integrationOperationTracer: ApolloServerPlugin = {
  async requestDidStart(requestCtx) {
    // Off by default — the plugin stays registered but emits nothing unless the
    // MJ_INTEGRATION_TRACE debug flag is explicitly set. Avoids logging on every
    // request in normal operation.
    if (process.env.MJ_INTEGRATION_TRACE !== 'true') return undefined;
    const opName = requestCtx.request.operationName ?? 'anonymous';
    const query = requestCtx.request.query ?? '';
    // Lightweight match — fire only for operations that touch an Integration
    // resolver field.  Avoid logging every Color / User / Task query.
    if (!query.includes('Integration')) return undefined;
    const startedAt = Date.now();
    return {
      async willSendResponse(rc) {
        // Walk the fields the operation queried; only those starting with
        // "Integration" matter.  Variables surfaced as keys only.
        const op = rc.operation;
        if (!op) return;
        const integrationFields: string[] = [];
        for (const sel of op.selectionSet.selections) {
          if (sel.kind === 'Field' && sel.name.value.startsWith('Integration')) {
            integrationFields.push(sel.name.value);
          }
        }
        if (integrationFields.length === 0) return;
        const argNames = Object.keys(rc.request.variables ?? {});
        const durationMs = Date.now() - startedAt;
        const hasErrors = !!(rc.response.body.kind === 'single' && rc.response.body.singleResult.errors?.length);
        for (const field of integrationFields) {
          console.log(JSON.stringify({
            ts: new Date().toISOString(),
            event: 'gql.integration.response',
            operationName: opName,
            method: field,
            argNames,
            durationMs,
            hasErrors,
          }));
        }
      },
    };
  },
};

const buildApolloServer = (
  configOverride: ApolloServerOptions<AppContext>,
  { httpServer, serverCleanup }: { httpServer: Server; serverCleanup: Disposable },
  additionalPlugins?: ApolloServerPlugin[]
) => {
  const builtInPlugins: ApolloServerPlugin[] = [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    integrationOperationTracer,
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
