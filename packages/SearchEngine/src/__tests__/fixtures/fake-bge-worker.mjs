// Test fixture worker speaking the BGERerankerWorkerProtocol:
//   doc === 'FAIL'         -> Ok: false ('worker model exploded')
//   doc === 'CRASH'        -> process.exit(3)
//   doc === 'BLOCK:<ms>'   -> synchronous busy-wait on this thread for <ms> before answering
//   otherwise              -> scores equal to document text length / 100
import { parentPort } from 'node:worker_threads';

parentPort.on('message', (request) => {
    if (request.Kind === 'clear') {
        parentPort.postMessage({ ID: request.ID, Ok: true, Result: [] });
        return;
    }
    if (request.Kind !== 'rerank') {
        parentPort.postMessage({ ID: request.ID, Ok: false, Error: `Unknown kind: ${request.Kind}` });
        return;
    }

    const firstDoc = request.Pairs?.[0]?.[1] ?? '';
    if (firstDoc === 'CRASH') {
        process.exit(3);
    }
    if (firstDoc === 'FAIL') {
        parentPort.postMessage({ ID: request.ID, Ok: false, Error: 'worker model exploded' });
        return;
    }
    if (firstDoc.startsWith('BLOCK:')) {
        const ms = Number(firstDoc.slice(6));
        const until = Date.now() + ms;
        while (Date.now() < until) {
            // Busy-wait on the worker thread to prove the main event loop stays responsive.
        }
    }

    const scores = (request.Pairs ?? []).map((pair) => (pair[1]?.length ?? 0) / 100);
    parentPort.postMessage({ ID: request.ID, Ok: true, Result: scores });
});
