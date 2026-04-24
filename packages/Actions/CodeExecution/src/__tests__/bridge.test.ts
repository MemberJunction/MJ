/**
 * End-to-end bridge tests for the CodeExecution sandbox.
 *
 * These tests exercise the REAL isolated-vm + child-process path so we can
 * verify the bridge protocol actually works: sandbox code calls
 * `__bridgeCall(name, args)`, the worker routes it to the host, the host
 * invokes the registered handler, the response travels back, and the
 * sandbox's `await` resolves with the result.
 *
 * These tests import from the compiled `dist/` output rather than `src/`
 * because `WorkerPool.fork()` resolves `worker.js` relative to its own
 * module location via `import.meta.url` — running vitest against the TS
 * source would look for a sibling `src/worker.js` file that doesn't exist.
 *
 * Because they fork real Node processes they're slower than our other unit
 * tests; each test has a generous timeout.
 */
import { describe, it, expect, afterAll } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - built output has no .d.ts index.js entry for tests
import { CodeExecutionService } from '../../dist/index.js';

describe('CodeExecution bridge (end-to-end)', () => {
    // One service for the whole suite so we amortize the worker-pool startup
    // cost across tests. Shut it down in afterAll.
    const service = new CodeExecutionService({ poolSize: 1 });

    afterAll(async () => {
        await (service as unknown as { workerPool: { shutdown: () => Promise<void> } }).workerPool.shutdown();
    });

    it('round-trips a simple bridge call', async () => {
        const result = await service.execute({
            code: `
                const echo = await __bridgeCall('__echo', { msg: 'hello' });
                output = echo;
            `,
            language: 'javascript',
            bridgeHandlers: {
                __echo: async (args: unknown) => args
            }
        });

        expect(result.success).toBe(true);
        expect(result.output).toEqual({ msg: 'hello' });
    }, 15000);

    it('rejects when sandbox calls an unregistered handler', async () => {
        const result = await service.execute({
            code: `
                try {
                    await __bridgeCall('nope', {});
                    output = { unexpected: true };
                } catch (err) {
                    output = { error: err.message };
                }
            `,
            language: 'javascript',
            bridgeHandlers: { __echo: async (a: unknown) => a }
        });

        expect(result.success).toBe(true);
        expect(result.output).toHaveProperty('error');
        expect(String(result.output.error)).toContain("'nope'");
    }, 15000);

    it('propagates handler-thrown errors to the sandbox', async () => {
        const result = await service.execute({
            code: `
                try {
                    await __bridgeCall('boom', {});
                    output = { unexpected: true };
                } catch (err) {
                    output = { error: err.message };
                }
            `,
            language: 'javascript',
            bridgeHandlers: {
                boom: async () => {
                    throw new Error('explosion');
                }
            }
        });

        expect(result.success).toBe(true);
        expect(result.output.error).toBe('explosion');
    }, 15000);

    it('supports Promise.all with concurrent bridge calls correlated by callId', async () => {
        const result = await service.execute({
            code: `
                const [a, b, c] = await Promise.all([
                    __bridgeCall('double', 3),
                    __bridgeCall('double', 7),
                    __bridgeCall('double', 11)
                ]);
                output = { a, b, c };
            `,
            language: 'javascript',
            bridgeHandlers: {
                double: async (args: unknown) => (args as number) * 2
            }
        });

        expect(result.success).toBe(true);
        expect(result.output).toEqual({ a: 6, b: 14, c: 22 });
    }, 15000);

    it('enforces maxBridgeCalls', async () => {
        const result = await service.execute({
            code: `
                const attempts = [];
                let failedWith = null;
                for (let i = 0; i < 5; i++) {
                    try {
                        const r = await __bridgeCall('ping', i);
                        attempts.push(r);
                    } catch (err) {
                        failedWith = err.message;
                        break;
                    }
                }
                output = { attempts, failedWith };
            `,
            language: 'javascript',
            maxBridgeCalls: 3,
            bridgeHandlers: {
                ping: async (n: unknown) => `pong-${n}`
            }
        });

        expect(result.success).toBe(true);
        expect(result.output.attempts).toEqual(['pong-0', 'pong-1', 'pong-2']);
        expect(String(result.output.failedWith)).toContain('maxBridgeCalls=3');
    }, 15000);

    it('aborts in-flight bridge calls when the caller aborts', async () => {
        const controller = new AbortController();
        // A handler that never resolves — we want the sandbox to be suspended
        // on the `await` when the abort fires.
        const resultPromise = service.execute({
            code: `
                try {
                    await __bridgeCall('hang', {});
                    output = { unexpected: true };
                } catch (err) {
                    output = { error: err.message };
                }
            `,
            language: 'javascript',
            timeoutSeconds: 10,
            abortSignal: controller.signal,
            bridgeHandlers: {
                hang: () => new Promise<never>(() => {})
            }
        });

        // Let the sandbox enter the await before aborting.
        await new Promise((r) => setTimeout(r, 200));
        controller.abort('user cancelled');

        const result = await resultPromise;
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('TIMEOUT');
        expect(String(result.error)).toContain('user cancelled');
    }, 20000);

    it('leaves subsequent executions unaffected after a bridge failure', async () => {
        const failing = await service.execute({
            code: `
                try { await __bridgeCall('fail', {}); output = 'no'; }
                catch (e) { output = e.message; }
            `,
            language: 'javascript',
            bridgeHandlers: { fail: async () => { throw new Error('nope'); } }
        });
        expect(failing.success).toBe(true);
        expect(failing.output).toBe('nope');

        const recovering = await service.execute({
            code: `output = await __bridgeCall('ok', 42);`,
            language: 'javascript',
            bridgeHandlers: { ok: async (n: unknown) => (n as number) + 1 }
        });
        expect(recovering.success).toBe(true);
        expect(recovering.output).toBe(43);
    }, 20000);
});
