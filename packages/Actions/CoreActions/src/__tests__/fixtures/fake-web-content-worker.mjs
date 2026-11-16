// Stands in for WebContentWorker.js in WebContentWorkerHost tests. Speaks the worker-host protocol:
//   html 'BLOCK:<ms>' busy-waits that long on THIS thread before answering
//   html 'FAIL'       answers Ok:false
//   html otherwise    answers { length } of the page
//   pdf               answers { bytes } it received
import { parentPort } from 'node:worker_threads';

parentPort.on('message', (request) => {
    if (request.Kind === 'pdf') {
        parentPort.postMessage({ ID: request.ID, Ok: true, Result: { bytes: request.Data.byteLength } });
        return;
    }
    const html = request.Html;
    if (html === 'FAIL') {
        parentPort.postMessage({ ID: request.ID, Ok: false, Error: 'parser exploded' });
        return;
    }
    if (html.startsWith('BLOCK:')) {
        const until = Date.now() + Number(html.slice(6));
        while (Date.now() < until) { /* hold this thread, not the caller's */ }
    }
    parentPort.postMessage({ ID: request.ID, Ok: true, Result: { length: html.length } });
});
