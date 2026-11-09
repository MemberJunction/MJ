/**
 * The request handler MJServer's HTTP server is created with, so the port can be bound before the
 * bootstrap runs.
 *
 * While the server is not ready the gate answers every request itself:
 * - `/healthcheck` (readiness): 503 with `{ status, phase, phaseElapsedMs, elapsedMs }`;
 * - `/healthcheck/live` (liveness): 200 — the process is up and holds its port;
 * - anything else: 503 with `Retry-After`, so clients and load balancers retry rather than wait.
 *
 * Once ready it hands every request to the Express app unchanged, so the app's middleware order (including
 * host middleware added through `CreateApp()`) is untouched. Paths go through `ApiRoute()`, so the
 * gate follows `MJAPI_BASE_PATH` like the routes it stands in for.
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { ApiRoute } from './apiRoot.js';
import type { MJServerStartupState } from './startupState.js';

/** Seconds a client is told to wait before retrying a request made while the server starts. */
export const STARTUP_RETRY_AFTER_SECONDS = 5;

/** Readiness: 503 until the server is ready, 200 after. */
export const HEALTHCHECK_PATH = '/healthcheck';
/** Liveness: 200 as soon as the port is bound. */
export const HEALTHCHECK_LIVE_PATH = '/healthcheck/live';

/** The Express app, or anything else that takes a Node request and response. */
export type NodeRequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

function requestPath(req: IncomingMessage): string {
    const raw = (req.url ?? '/').split('?')[0];
    // Express routes match with or without one trailing slash; the gate does the same.
    return raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function sendJson(res: ServerResponse, status: number, body: object, headers: Record<string, string> = {}): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload).toString(),
        'Cache-Control': 'no-store',
        ...headers,
    });
    res.end(res.req?.method === 'HEAD' ? undefined : payload);
}

/** The handler to pass to `createServer`; see the module comment. */
export function CreateStartupGate(app: NodeRequestHandler, state: MJServerStartupState): NodeRequestHandler {
    return (req, res) => {
        if (state.IsReady) {
            app(req, res);
            return;
        }
        const path = requestPath(req);
        if (path === ApiRoute(HEALTHCHECK_LIVE_PATH)) {
            sendJson(res, 200, { status: 'alive', startup: state.Status });
            return;
        }
        if (path === ApiRoute(HEALTHCHECK_PATH)) {
            // The wire keys match the ready answer's `{ status: 'ok' }`.
            const report = state.Report();
            sendJson(res, 503, {
                status: report.Status,
                phase: report.Phase,
                phaseElapsedMs: report.PhaseElapsedMs,
                elapsedMs: report.ElapsedMs,
            });
            return;
        }
        sendJson(res, 503, { status: state.Status, phase: state.Phase }, { 'Retry-After': String(STARTUP_RETRY_AFTER_SECONDS) });
    };
}

/**
 * Refuses a WebSocket upgrade with a 503 while the server is not ready. Returns true when it did, so an
 * upgrade router can return early.
 */
export function RejectUpgradeWhileStarting(state: MJServerStartupState, socket: Duplex): boolean {
    if (state.IsReady) {
        return false;
    }
    if (socket.writable) {
        socket.write(
            'HTTP/1.1 503 Service Unavailable\r\n' +
            `Retry-After: ${STARTUP_RETRY_AFTER_SECONDS}\r\n` +
            'Connection: close\r\n' +
            'Content-Length: 0\r\n\r\n'
        );
    }
    socket.destroy();
    return true;
}

/** Binds `server` to `port`. Rejects on a listen error (EADDRINUSE and the like) instead of crashing the process. */
export function ListenOnPort(server: Server, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => reject(err);
        server.once('error', onError);
        server.listen({ port }, () => {
            server.off('error', onError);
            resolve();
        });
    });
}
