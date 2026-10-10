/**
 * A stand-in for video-encode-worker that misbehaves on request, so the host's failure handling can be tested with a
 * real thread. It says `ready` at start; the behaviour comes from a request's `Quality`:
 *
 *   1001  exits the thread with code 3
 *   1002  throws an uncaught error ('scripted crash')
 *   other replies `encoded` with the planes it received as the "JPEG" (transferred back), so a test can check what crossed
 */
import { parentPort } from 'node:worker_threads';

parentPort.on('message', (request) => {
    if (request.Quality === 1001) {
        process.exit(3);
    }
    if (request.Quality === 1002) {
        setTimeout(() => {
            throw new Error('scripted crash');
        });
        return;
    }
    const echo = request.Planes;
    parentPort.postMessage(
        { Kind: 'encoded', RequestID: request.RequestID, Jpeg: echo, Width: request.OutWidth, Height: request.OutHeight, EncodeMs: 1 },
        [echo],
    );
});
parentPort.postMessage({ Kind: 'ready' });
