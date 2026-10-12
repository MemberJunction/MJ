import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { AttachWebSocketHeartbeat } from '../wsHeartbeat.js';

/**
 * MJAPI's server-side WebSocket heartbeat (MJ #5510).
 *
 * graphql-ws's built-in keepalive arms `setTimeout(() => socket.terminate(), keepAlive)` after each
 * ping. When the event loop stalls past that deadline, the client's pong is already sitting in the
 * kernel buffer — but Node runs expired timers BEFORE the poll phase that would read it, so the
 * socket is killed for a pong it received. A busy server then drops every healthy client at once.
 *
 * These tests use a real ws server and client in one process and block the real event loop.
 */

const INTERVAL_MS = 200;

function blockEventLoop(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy-wait
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('AttachWebSocketHeartbeat', () => {
  let server: WebSocketServer | null = null;
  let detach: (() => void) | null = null;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    detach?.();
    detach = null;
    clients.splice(0).forEach((c) => c.terminate());
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
  });

  async function connect(options?: { autoPong?: boolean }): Promise<{ client: WebSocket; closed: () => number | null }> {
    server = server ?? new WebSocketServer({ port: 0 });
    if (!detach) {
      detach = AttachWebSocketHeartbeat(server, { IntervalMs: INTERVAL_MS });
    }
    if (!server.address()) {
      await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    }
    const { port } = server.address() as { port: number };
    const client = new WebSocket(`ws://127.0.0.1:${port}`, { autoPong: options?.autoPong ?? true });
    clients.push(client);
    let closeCode: number | null = null;
    client.on('close', (code) => (closeCode = code));
    await new Promise<void>((resolve) => client.once('open', () => resolve()));
    return { client, closed: () => closeCode };
  }

  it('keeps a socket whose pong arrived while the event loop was stalled past the deadline', async () => {
    const { client, closed } = await connect();
    // ws writes the pong BEFORE emitting 'ping', so the pong is already on the wire here. Stalling
    // now reproduces "the pong frame is in the kernel buffer when the loop resumes".
    client.once('ping', () => blockEventLoop(INTERVAL_MS * 1.5));

    await sleep(INTERVAL_MS * 4);

    expect(closed()).toBeNull();
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it('keeps pinging a healthy socket for as long as it answers', async () => {
    const { client, closed } = await connect();
    let pings = 0;
    client.on('ping', () => pings++);

    await sleep(INTERVAL_MS * 5);

    expect(pings).toBeGreaterThanOrEqual(3);
    expect(closed()).toBeNull();
  });

  it('terminates a socket that never answers a ping', async () => {
    const { closed } = await connect({ autoPong: false });

    await sleep(INTERVAL_MS * 3.5);

    expect(closed()).not.toBeNull();
  });

  it('stops pinging once detached', async () => {
    const { client } = await connect();
    detach!();
    detach = () => undefined;
    let pings = 0;
    client.on('ping', () => pings++);

    await sleep(INTERVAL_MS * 3);

    expect(pings).toBe(0);
  });
});
