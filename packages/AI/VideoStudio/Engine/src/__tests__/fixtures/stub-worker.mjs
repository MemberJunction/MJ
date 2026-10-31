import {
    RENDER_WORKER_ENV,
    RENDER_WORKER_PORT_PREFIX,
} from '@memberjunction/video-studio-core';
import {
    CreateRenderWorkerServer,
    FakeRenderBackend,
} from '@memberjunction/video-studio-render-worker';

const host = process.env[RENDER_WORKER_ENV.Host] ?? '127.0.0.1';
const portRaw = process.env[RENDER_WORKER_ENV.Port] ?? '0';
const port = Number.parseInt(portRaw, 10);
const token = process.env[RENDER_WORKER_ENV.Token];

const backend = new FakeRenderBackend();
const server = CreateRenderWorkerServer({
    Host: host,
    Port: Number.isFinite(port) ? port : 0,
    Token: token,
    Backend: backend,
});

const boundPort = await server.Listen(Number.isFinite(port) ? port : 0, host);
process.stdout.write(`${RENDER_WORKER_PORT_PREFIX}${boundPort}\n`);

const shutdown = async () => {
    try {
        await server.Close();
    } finally {
        process.exit(0);
    }
};

process.on('SIGTERM', () => {
    void shutdown();
});
process.on('SIGINT', () => {
    void shutdown();
});
