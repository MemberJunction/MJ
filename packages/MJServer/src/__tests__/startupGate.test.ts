/**
 * The startup gate MJServer's HTTP server is created with (#4432): the port is bound before the
 * bootstrap, and until it finishes the gate answers requests itself instead of the app.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import express from 'express';

const mockConfig = vi.hoisted(() => ({
    configInfo: { apiBasePath: '/', graphqlRootPath: '/', publicUrl: '', baseUrl: 'http://localhost', graphqlPort: 4000 } as Record<string, unknown>,
}));
vi.mock('../config.js', () => mockConfig);

import { CreateStartupGate, ListenOnPort, RejectUpgradeWhileStarting, STARTUP_RETRY_AFTER_SECONDS } from '../startupGate.js';
import { MJServerStartupState } from '../startupState.js';

describe('startup gate', () => {
    let state: MJServerStartupState;
    let server: Server;
    let base: string;
    const appHits: string[] = [];

    beforeEach(async () => {
        mockConfig.configInfo.apiBasePath = '/';
        appHits.length = 0;
        state = new MJServerStartupState();
        state.Begin(Date.now());
        const app = express();
        app.use((req, res) => {
            appHits.push(req.path);
            res.status(200).json({ from: 'app' });
        });
        server = createServer(CreateStartupGate(app, state));
        await ListenOnPort(server, 0);
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('while starting: readiness 503 with the phase, liveness 200, everything else 503 + Retry-After', async () => {
        state.SetPhase('Building GraphQL schema');

        const ready = await fetch(`${base}/healthcheck`);
        expect(ready.status).toBe(503);
        const body = await ready.json() as Record<string, unknown>;
        expect(body.status).toBe('starting');
        expect(body.phase).toBe('Building GraphQL schema');
        expect(typeof body.phaseElapsedMs).toBe('number');
        expect(typeof body.elapsedMs).toBe('number');

        expect((await fetch(`${base}/healthcheck/live`)).status).toBe(200);
        expect((await fetch(`${base}/healthcheck/`)).status).toBe(503);

        const graphql = await fetch(`${base}/graphql`, { method: 'POST', body: '{}' });
        expect(graphql.status).toBe(503);
        expect(graphql.headers.get('retry-after')).toBe(String(STARTUP_RETRY_AFTER_SECONDS));
        expect(appHits).toEqual([]);
    });

    it('once ready: every request reaches the app', async () => {
        state.MarkReady();
        expect((await fetch(`${base}/graphql`)).status).toBe(200);
        expect((await fetch(`${base}/healthcheck`)).status).toBe(200);
        expect(appHits).toEqual(['/graphql', '/healthcheck']);
    });

    it('after a failed start: readiness keeps answering 503 with the failed phase', async () => {
        state.SetPhase('Connecting to database');
        state.MarkFailed(new Error('login failed'));
        const res = await fetch(`${base}/healthcheck`);
        expect(res.status).toBe(503);
        const body = await res.json() as Record<string, unknown>;
        expect(body.status).toBe('failed');
        expect(body.phase).toBe('Connecting to database');
        // The error text is logged, not served: it can name hosts and accounts.
        expect(JSON.stringify(body)).not.toContain('login failed');
        expect(state.Error?.message).toBe('login failed');
    });

    it('honours MJAPI_BASE_PATH', async () => {
        mockConfig.configInfo.apiBasePath = '/api';
        expect((await fetch(`${base}/api/healthcheck`)).status).toBe(503);
        expect((await fetch(`${base}/api/healthcheck/live`)).status).toBe(200);
        // The origin-root path is not the health check under a base path.
        const root = await fetch(`${base}/healthcheck/live`);
        expect(root.status).toBe(503);
        expect(root.headers.get('retry-after')).not.toBeNull();
    });

    it('refuses WebSocket upgrades with 503 until ready', async () => {
        server.on('upgrade', (_req, socket) => {
            if (!RejectUpgradeWhileStarting(state, socket)) {
                socket.end('HTTP/1.1 101 Switching Protocols\r\n\r\n');
            }
        });
        const port = (server.address() as AddressInfo).port;
        const upgrade = () => new Promise<string>((resolve, reject) => {
            const socket = connect(port, '127.0.0.1', () => {
                socket.write('GET /graphql HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
            });
            let data = '';
            socket.on('data', (chunk) => { data += chunk.toString(); });
            socket.on('close', () => resolve(data));
            socket.on('error', reject);
        });
        expect(await upgrade()).toMatch(/^HTTP\/1\.1 503/);
        state.MarkReady();
        expect(await upgrade()).toMatch(/^HTTP\/1\.1 101/);
    });

    it('a port already in use rejects instead of crashing the process', async () => {
        const second = createServer(() => undefined);
        const port = (server.address() as AddressInfo).port;
        await expect(ListenOnPort(second, port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    });
});

describe('MJServerStartupState', () => {
    it('reports elapsed time per phase and ignores phases after the boot ends', () => {
        const state = new MJServerStartupState();
        state.Begin(1000);
        state.SetPhase('Loading metadata + providers', 1500);
        expect(state.Report(2500)).toEqual({ Status: 'starting', Phase: 'Loading metadata + providers', PhaseElapsedMs: 1000, ElapsedMs: 1500 });
        state.MarkReady();
        state.SetPhase('late', 3000);
        expect(state.Phase).toBe('Loading metadata + providers');
        expect(state.IsReady).toBe(true);
    });
});
