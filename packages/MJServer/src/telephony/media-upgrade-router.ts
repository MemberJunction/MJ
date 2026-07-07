/**
 * @fileoverview Single WebSocket-upgrade dispatcher for the shared HTTP server.
 *
 * Why this exists: in `ws` 8.x, every `new WebSocketServer({ server })` attaches its OWN `upgrade`
 * listener that calls `handleUpgrade` UNCONDITIONALLY, and `handleUpgrade` does `abortHandshake(400)` for
 * any request whose path it doesn't own. So two `{server}`-bound servers on one HTTP server (e.g. the
 * GraphQL subscriptions socket on `/` AND a telephony Media-Streams socket on `/telephony/.../media`)
 * fight on every upgrade — the non-owning server 400s the request. That's exactly what made Twilio's
 * `<Connect><Stream>` fail with error 31920 ("Stream WebSocket failed to connect").
 *
 * The fix: telephony/meetings media servers are created with `{ noServer: true }` (no auto-listener) and
 * register their path here; at boot we strip the auto-listeners and install ONE `upgrade` listener that
 * routes by path — GraphQL on its root path, each media socket on its own. When no media routes are
 * registered (telephony disabled), we leave the GraphQL server's own listener untouched (zero change).
 *
 * @module @memberjunction/server/telephony
 */

import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';

/** path → the `{ noServer:true }` WebSocketServer that owns it. */
const mediaRoutes = new Map<string, WebSocketServer>();

/** Registers a media WebSocket route. Called by each vendor router's attach step. */
export function RegisterMediaUpgradeRoute(path: string, wss: WebSocketServer): void {
    mediaRoutes.set(path, wss);
}

/**
 * Installs the single path-routing `upgrade` dispatcher. No-op when no media routes are registered, so
 * the GraphQL server keeps its own listener untouched. Otherwise it removes the auto-attached listeners
 * (GraphQL's included) and dispatches every upgrade by pathname — GraphQL on `graphqlPath`, each media
 * socket on its registered path; unknown paths are destroyed.
 *
 * @param httpServer  the shared HTTP server.
 * @param graphqlWss  the GraphQL subscriptions WebSocketServer (kept, re-dispatched on its path).
 * @param graphqlPath the GraphQL root path (the path GraphQL's socket listens on).
 */
export function InstallMediaUpgradeDispatcher(httpServer: HttpServer, graphqlWss: WebSocketServer, graphqlPath: string): void {
    if (mediaRoutes.size === 0) {
        return;
    }
    httpServer.removeAllListeners('upgrade');
    const dispatch = (wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer): void => {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    };
    httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname === graphqlPath) {
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
