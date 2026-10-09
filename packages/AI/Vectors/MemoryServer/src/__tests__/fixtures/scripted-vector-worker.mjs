/**
 * A stand-in for VectorComputeWorker that misbehaves on request, so the pool's
 * failure handling can be tested. The behaviour comes from a search request's
 * `Spec.TopK`; `Spec.Threshold` is a reply delay in milliseconds.
 *
 *   1001  replies with an error response
 *   1002  exits the thread with code 3
 *   1003  throws an uncaught error
 *   1004  never replies
 *   1005  first replies to a task that is not the current one, then answers
 *   other answers { Rows: [TaskID], Scores: [1] } after the delay
 */
import { parentPort } from 'node:worker_threads';

parentPort.on('message', request => {
  const mode = request.Kind === 'search' ? request.Spec.TopK : 0;
  if (mode === 1001) {
    parentPort.postMessage({ TaskID: request.TaskID, Ok: false, Error: 'scripted failure' });
    return;
  }
  if (mode === 1002) process.exit(3);
  if (mode === 1003) {
    setTimeout(() => {
      throw new Error('scripted crash');
    });
    return;
  }
  if (mode === 1004) return;
  if (mode === 1005) {
    parentPort.postMessage({ TaskID: request.TaskID + 1000, Ok: true, Kind: 'search', Rows: new Int32Array(0), Scores: new Float64Array(0) });
  }
  const delay = request.Kind === 'search' ? (request.Spec.Threshold ?? 0) : 0;
  setTimeout(() => {
    parentPort.postMessage({ TaskID: request.TaskID, Ok: true, Kind: 'search', Rows: Int32Array.from([request.TaskID]), Scores: Float64Array.from([1]) });
  }, delay);
});
