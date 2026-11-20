import { WebSocketServer, type WebSocket } from 'ws';

/**
 * The largest graphql-ws message MJAPI reads from a client (1 MiB). Clients send only `connection_init`,
 * `subscribe`, `complete` and ping/pong on this socket; queries and mutations go over HTTP.
 */
export const GRAPHQL_WS_MAX_PAYLOAD_BYTES = 1024 * 1024;

/**
 * Creates the GraphQL subscriptions socket server. `noServer`: MJServer routes each HTTP upgrade by path.
 * A client message larger than {@link GRAPHQL_WS_MAX_PAYLOAD_BYTES} closes the socket with 1009 while it is read.
 * A client protocol error closes only that socket; it never reaches the process as an unhandled error.
 */
export function CreateGraphQLWebSocketServer(): WebSocketServer {
  const server = new WebSocketServer({ noServer: true, maxPayload: GRAPHQL_WS_MAX_PAYLOAD_BYTES });
  server.on('connection', (socket: WebSocket) => socket.on('error', () => undefined));
  return server;
}
