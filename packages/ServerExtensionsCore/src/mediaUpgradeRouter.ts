/**
 * @fileoverview Single WebSocket-upgrade dispatcher for the shared HTTP server.
 *
 * Why this exists: in `ws` 8.x, every `new WebSocketServer({ server })` attaches its OWN `upgrade`
 * listener that calls `handleUpgrade` UNCONDITIONALLY, and `handleUpgrade` does `abortHandshake(400)` for
 * any request whose path it doesn't own. So two `{server}`-bound servers on one HTTP server (e.g. the
 * GraphQL subscriptions socket on `/` AND a server extension WebSocket socket) fight on every upgrade —
 * the non-owning server 400s the request.
 *
 * The fix: extension WebSocket servers are created with `{ noServer: true }` (no auto-listener) and
 * register their path here; at boot we strip the auto-listeners and install ONE `upgrade` listener that
 * routes by path — GraphQL on its root path, each extension socket on its own. When no extension routes are
 * registered, we leave the GraphQL server's own listener untouched (zero change).
 *
 * @module @memberjunction/server-extensions-core
 */

import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * Structural interface representing a WebSocketServer target for upgrade handling.
 * Duck-typed so callers don't need a direct dependency on the `ws` package.
 */
export interface IWebSocketUpgradeTarget {
    handleUpgrade(
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        callback: (ws: unknown) => void
    ): void;
    emit(event: string, ...args: unknown[]): boolean;
}

/** path → the `{ noServer:true }` WebSocket server that owns it. */
const mediaRoutes = new Map<string, IWebSocketUpgradeTarget>();

/** Registers a media/extension WebSocket route. Called by extension routers during setup. */
export function RegisterMediaUpgradeRoute(path: string, wss: IWebSocketUpgradeTarget): void {
    mediaRoutes.set(path, wss);
}

/**
 * Whether an upgrade request's pathname should be routed to the GraphQL subscriptions socket.
 */
export function IsGraphQLWsPath(pathname: string, graphqlPath: string): boolean {
    return pathname === graphqlPath || (graphqlPath === '/' && pathname === '/graphql');
}

/**
 * Installs the single path-routing `upgrade` dispatcher. No-op when no extension routes are registered, so
 * the GraphQL server keeps its own listener untouched. Otherwise it removes the auto-attached listeners
 * (GraphQL's included) and dispatches every upgrade by pathname — GraphQL on `graphqlPath`, each extension
 * socket on its registered path; unknown paths are destroyed.
 *
 * @param httpServer  the shared HTTP server.
 * @param graphqlWss  the GraphQL subscriptions WebSocket server (kept, re-dispatched on its path).
 * @param graphqlPath the GraphQL root path (the path GraphQL's socket listens on).
 * @param preUpgradeHandler optional handler to try before routing to GraphQL or extension sockets.
 */
export function InstallMediaUpgradeDispatcher(
    httpServer: HttpServer,
    graphqlWss: IWebSocketUpgradeTarget,
    graphqlPath: string,
    preUpgradeHandler?: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean
): void {
    if (mediaRoutes.size === 0) {
        return;
    }
    httpServer.removeAllListeners('upgrade');
    const dispatch = (wss: IWebSocketUpgradeTarget, req: IncomingMessage, socket: Duplex, head: Buffer): void => {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    };
    httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (preUpgradeHandler && preUpgradeHandler(req, socket, head)) {
            return;
        }
        const pathname = (req.url ?? '').split('?')[0];
        if (IsGraphQLWsPath(pathname, graphqlPath)) {
            dispatch(graphqlWss, req, socket, head);
            return;
        }
        const wss = mediaRoutes.get(pathname);
        if (wss) {
            dispatch(wss, req, socket, head);
            return;
        }
        socket.destroy();
    });
}
