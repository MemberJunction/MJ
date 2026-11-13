/**
 * Suite for the CI wait on MJAPI readiness (wait-for-mjapi.sh).
 *
 * Each case serves scripted /healthcheck answers from a local HTTP server and runs the real script
 * against it, so the assertions cover the shipped curl/grep logic rather than a copy of it.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'wait-for-mjapi.sh');

let dir;
let logFile;
let server;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wait-for-mjapi-'));
    logFile = join(dir, 'mjapi.log');
    writeFileSync(logFile, 'boot line 1\nMJServer startup failed during "Checking entity metadata"\n');
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

afterEach(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
        server = undefined;
    }
});

/** Serves `answers` in order (the last one repeats) and resolves to the server's base URL. */
function serve(answers) {
    let calls = 0;
    server = createServer((req, res) => {
        const answer = answers[Math.min(calls, answers.length - 1)];
        calls += 1;
        res.writeHead(answer.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(answer.body));
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
}

/** Runs the script and resolves to its exit code and output; never rejects. */
function wait(baseUrl, { attempts = 5, interval = '0.05', pid } = {}) {
    const args = [SCRIPT, baseUrl, logFile, String(attempts), interval];
    if (pid !== undefined) {
        args.push(String(pid));
    }
    return new Promise((resolve) => {
        execFile('bash', args, { encoding: 'utf8' }, (error, stdout) => {
            resolve({ status: error ? error.code : 0, stdout });
        });
    });
}

const STARTING = { status: 503, body: { status: 'starting', phase: 'Loading metadata + providers' } };
const FAILED = { status: 503, body: { status: 'failed', phase: 'Checking entity metadata' } };
const READY = { status: 200, body: { status: 'ok' } };

describe('wait-for-mjapi.sh', () => {
    it('succeeds once /healthcheck answers 200', async () => {
        const url = await serve([STARTING, STARTING, READY]);
        const { status, stdout } = await wait(url);
        expect(status).toBe(0);
        expect(stdout).toContain('MJAPI is ready (attempt 3)');
    });

    it('stops at the first failed-start answer and prints it with the log tail', async () => {
        const url = await serve([STARTING, FAILED, READY]);
        const { status, stdout } = await wait(url, { attempts: 50 });
        expect(status).toBe(1);
        expect(stdout).toContain('::error::MJAPI startup failed');
        expect(stdout).toContain('"phase":"Checking entity metadata"');
        expect(stdout).toContain('MJServer startup failed during "Checking entity metadata"');
        expect(stdout).not.toContain('was not ready after');
    });

    it('keeps waiting through a 503 that is still starting, then gives up after the attempts', async () => {
        const url = await serve([STARTING]);
        const { status, stdout } = await wait(url, { attempts: 3 });
        expect(status).toBe(1);
        expect(stdout).toContain('::error::MJAPI was not ready after 3 attempts');
        expect(stdout).toContain('"status":"starting"');
    });

    it('stops as soon as the given process has exited', async () => {
        // Nothing listens on port 9 (discard); the pid is one that cannot exist.
        const { status, stdout } = await wait('http://127.0.0.1:9', { attempts: 50, pid: 2147483646 });
        expect(status).toBe(1);
        expect(stdout).toContain('::error::MJAPI process 2147483646 exited before it was ready');
    });

    it('rejects a call without the log file argument', async () => {
        const { status } = await new Promise((resolve) => {
            execFile('bash', [SCRIPT, 'http://127.0.0.1:9'], (error) => resolve({ status: error ? error.code : 0 }));
        });
        expect(status).toBe(2);
    });
});
