// Stands in for a real worker script in WorkerThreadHost tests. Speaks the worker-host protocol
// directly (ServeWorkerRequests is tested on its own). Each call is { Text } or { Bytes }:
//   'BLOCK:<ms>' busy-waits that long on THIS thread before answering
//   'FAIL'       answers Ok:false
//   'CRASH'      exits the thread without answering
//   otherwise    answers with the text's length, or the byte count it received
import { parentPort } from "node:worker_threads";

parentPort.on("message", (request) => {
  if (request.Bytes) {
    parentPort.postMessage({ ID: request.ID, Ok: true, Result: request.Bytes.byteLength });
    return;
  }
  const text = request.Text;
  if (text === "CRASH") {
    process.exit(3);
  }
  if (text === "FAIL") {
    parentPort.postMessage({ ID: request.ID, Ok: false, Error: "handler exploded" });
    return;
  }
  if (text.startsWith("BLOCK:")) {
    const until = Date.now() + Number(text.slice(6));
    while (Date.now() < until) {
      /* hold this thread, not the caller's */
    }
  }
  parentPort.postMessage({ ID: request.ID, Ok: true, Result: text.length });
});
