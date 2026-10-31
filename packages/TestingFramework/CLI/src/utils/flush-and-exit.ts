/**
 * @fileoverview Exit the process only after stdout and stderr have drained
 * @module @memberjunction/testing-cli
 */

/** The part of a writable stream {@link FlushAndExit} needs: Node's own `write` with a completion callback. */
export type FlushableStream = Pick<NodeJS.WritableStream, 'write'>;

/** Resolve once every write already queued on `stream` has been handed to the OS. */
function drain(stream: FlushableStream): Promise<void> {
    return new Promise(resolve => {
        // Writes complete in order, so the callback of an empty write fires only after every
        // earlier write has. An error (a closed pipe) still resolves: there is nothing left to wait for.
        stream.write('', () => resolve());
    });
}

/**
 * Exit with `code` after stdout and stderr have drained.
 *
 * `process.exit()` discards whatever is still queued on a piped stdout. A suite result printed as
 * JSON is far larger than a pipe buffer, so under `| tee` in CI the output stopped at 64 KiB and
 * everything printed after it, the skip-gate report included, never appeared.
 */
export async function FlushAndExit(
    code: number,
    streams: FlushableStream[] = [process.stdout, process.stderr],
    exit: (code: number) => never = c => process.exit(c)
): Promise<never> {
    for (const stream of streams) {
        await drain(stream);
    }
    return exit(code);
}
