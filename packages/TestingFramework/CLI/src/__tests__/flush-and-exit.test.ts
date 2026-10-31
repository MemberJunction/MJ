import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FlushAndExit, FlushableStream } from '../utils/flush-and-exit';

const HELPER = fileURLToPath(new URL('../utils/flush-and-exit.ts', import.meta.url));

type WriteCallback = (error?: Error | null) => void;

/** A stream whose write callbacks fire only when the test releases them. */
class HeldStream {
    public Pending: Array<() => void> = [];
    public readonly Stream: FlushableStream = {
        write: (_chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean => {
            const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            if (done) {
                this.Pending.push(() => done());
            }
            return false;
        }
    };
}

/** Throws instead of exiting, so a test can observe the call. */
class ExitCalled extends Error {
    constructor(public Code: number) {
        super(`exit(${Code})`);
    }
}

describe('FlushAndExit', () => {
    it('exits only after every stream has drained, with the given code', async () => {
        const out = new HeldStream();
        const err = new HeldStream();
        const exits: number[] = [];
        const exit = (code: number): never => {
            exits.push(code);
            throw new ExitCalled(code);
        };

        const done = FlushAndExit(1, [out.Stream, err.Stream], exit).catch((e: Error) => e);
        await Promise.resolve();
        expect(exits).toEqual([]);

        out.Pending.shift()!();
        await Promise.resolve();
        await Promise.resolve();
        expect(exits).toEqual([]);

        err.Pending.shift()!();
        const result = await done;
        expect(result).toBeInstanceOf(ExitCalled);
        expect(exits).toEqual([1]);
    });

    it('delivers output larger than a pipe buffer in full before the process exits', () => {
        // A suite result printed as JSON is hundreds of KiB; a plain process.exit() after printing
        // it delivered only the first 64 KiB to a piped stdout.
        const size = 1 << 20;
        const script = `import { FlushAndExit } from ${JSON.stringify(HELPER)};
process.stdout.write('x'.repeat(${size}));
await FlushAndExit(3);`;
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            encoding: 'utf8',
            maxBuffer: size * 2
        });
        expect(child.stderr).toBe('');
        expect(child.status).toBe(3);
        expect(child.stdout.length).toBe(size);
    });
});
