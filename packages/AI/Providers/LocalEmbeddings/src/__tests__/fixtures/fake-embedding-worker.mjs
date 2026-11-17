// Stands in for EmbeddingWorker.js in EmbeddingWorkerHost tests. Speaks the worker-host protocol:
//   'BLOCK:<ms>' busy-waits that long on THIS thread before answering
//   'FAIL'       answers Ok:false
//   otherwise    answers one vector per text: [text.length]
import { parentPort } from 'node:worker_threads';

parentPort.on('message', (request) => {
    if (request.Kind !== 'embed') {
        parentPort.postMessage({ ID: request.ID, Ok: true, Result: [] });
        return;
    }
    const first = request.Texts[0] ?? '';
    if (first === 'FAIL') {
        parentPort.postMessage({ ID: request.ID, Ok: false, Error: 'model exploded' });
        return;
    }
    if (first.startsWith('BLOCK:')) {
        const until = Date.now() + Number(first.slice(6));
        while (Date.now() < until) { /* hold this thread, not the caller's */ }
    }
    const vectors = request.Texts.map((t) => new Float32Array([t.length]));
    parentPort.postMessage({ ID: request.ID, Ok: true, Result: vectors }, vectors.map((v) => v.buffer));
});
