import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * Managed-mode unit tests for {@link MLSidecar}. `node:child_process` is mocked so
 * no real Python process is spawned, and `node:http` is mocked (as in
 * `ml-sidecar.test.ts`) to satisfy the post-spawn `/health` readiness poll.
 *
 * The primary regression this file covers (Memory Leak Audit Round 7, Critical —
 * see `MLSidecarProvider` in `@memberjunction/predictive-studio`): once multiple
 * production call sites share ONE `MLSidecar` instance via `MLSidecarProvider`,
 * two `start()` calls landing before the first spawn's port-announcement resolves
 * previously raced independent `spawnManaged()` calls — forking a second Python
 * process whose cleanup handlers never registered (`registerCleanup()` is a no-op
 * on the second call), leaking an untracked orphan. `start()` now shares a single
 * in-flight `startPromise` so concurrent callers await the same spawn.
 */

// --- node:http mock (mirrors ml-sidecar.test.ts) ---------------------------
interface CannedResponse {
  statusCode: number;
  body: string;
}
const responseQueue: CannedResponse[] = [];

class MockClientRequest extends EventEmitter {
  private writtenBody = '';
  constructor(
    private readonly options: { method?: string; path?: string },
    private readonly onResponse: (res: EventEmitter & { statusCode: number }) => void,
  ) {
    super();
  }
  write(data: string) {
    this.writtenBody += data;
  }
  end() {
    const canned = responseQueue.shift();
    queueMicrotask(() => {
      if (!canned) {
        this.emit('error', new Error('no canned response queued'));
        return;
      }
      const res = Object.assign(new EventEmitter(), { statusCode: canned.statusCode });
      this.onResponse(res);
      res.emit('data', Buffer.from(canned.body));
      res.emit('end');
    });
  }
  destroy() {
    /* no-op */
  }
}

vi.mock('node:http', () => ({
  default: {
    request: (
      options: { method?: string; path?: string },
      cb: (res: EventEmitter & { statusCode: number }) => void,
    ) => new MockClientRequest(options, cb),
  },
}));

function queueHealthOk() {
  responseQueue.push({ statusCode: 200, body: JSON.stringify({ status: 'ok' }) });
}

// --- node:child_process mock -------------------------------------------------
class MockChildProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public killSignals: string[] = [];
  kill(signal?: string) {
    this.killSignals.push(signal ?? 'SIGTERM');
    queueMicrotask(() => this.emit('exit', 0));
    return true;
  }
}

const spawnedProcesses: MockChildProcess[] = [];
const spawnMock = vi.fn(() => {
  const proc = new MockChildProcess();
  spawnedProcesses.push(proc);
  return proc;
});

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// Import AFTER both mocks are registered.
const { MLSidecar } = await import('../ml-sidecar.js');

/** Simulate the sidecar announcing its listening port on stdout, one tick later. */
function announcePort(proc: MockChildProcess, port: number) {
  queueMicrotask(() => proc.stdout.emit('data', Buffer.from(`PREDICTIVE_STUDIO_SIDECAR_PORT=${port}\n`)));
}

describe('MLSidecar (managed mode)', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    spawnedProcesses.length = 0;
    spawnMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start() spawns exactly one child process and resolves once the port is announced and healthy', async () => {
    const s = new MLSidecar();
    const startPromise = s.start();
    await Promise.resolve(); // let spawn() run synchronously inside spawnManaged()

    expect(spawnMock).toHaveBeenCalledTimes(1);
    queueHealthOk();
    announcePort(spawnedProcesses[0], 5555);
    await startPromise;

    expect(s.IsRunning).toBe(true);
    expect(s.Port).toBe(5555);
  });

  it('concurrent start() calls before the process is ready share one in-flight spawn (no double-spawn race)', async () => {
    const s = new MLSidecar();
    const p1 = s.start();
    const p2 = s.start();
    await Promise.resolve();

    // Both callers landed before `port`/`process` were set (IsRunning was still
    // false), so without the startPromise guard this would spawn twice.
    expect(spawnMock).toHaveBeenCalledTimes(1);

    queueHealthOk();
    announcePort(spawnedProcesses[0], 6000);
    await Promise.all([p1, p2]);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(s.IsRunning).toBe(true);
  });

  it('a start() call after a fully-started sidecar is a cheap no-op (does not spawn again)', async () => {
    const s = new MLSidecar();
    const first = s.start();
    await Promise.resolve();
    queueHealthOk();
    announcePort(spawnedProcesses[0], 7000);
    await first;

    await s.start();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('stop() kills the managed process and IsRunning becomes false', async () => {
    const s = new MLSidecar();
    const startPromise = s.start();
    await Promise.resolve();
    queueHealthOk();
    announcePort(spawnedProcesses[0], 8000);
    await startPromise;

    await s.stop();

    expect(s.IsRunning).toBe(false);
    expect(spawnedProcesses[0].killSignals).toContain('SIGTERM');
  });

  it('a start() call after a spawn failure spawns fresh rather than replaying the rejected promise', async () => {
    const s = new MLSidecar({ startupTimeoutMs: 50 });
    const failedStart = s.start();
    await Promise.resolve();
    // Never announce a port or queue a health response — the process exits early instead.
    spawnedProcesses[0].emit('exit', 1);
    await expect(failedStart).rejects.toThrow();

    expect(spawnMock).toHaveBeenCalledTimes(1);

    const retry = s.start();
    await Promise.resolve();
    expect(spawnMock).toHaveBeenCalledTimes(2); // fresh spawn, not the stale rejected promise

    queueHealthOk();
    announcePort(spawnedProcesses[1], 9000);
    await retry;
    expect(s.IsRunning).toBe(true);
  });
});
