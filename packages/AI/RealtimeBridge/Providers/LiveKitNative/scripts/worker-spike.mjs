/**
 * @file worker-spike.mjs
 * @scope Limited Spike Scope: Demonstrates that the native `@livekit/rtc-node` C++ addon loads
 * cleanly inside a Node.js Worker thread, constructs AudioSource, and accepts zero-copy
 * transferred ArrayBuffer PCM frames via captureFrame().
 *
 * NOTE: This spike does not connect to a live LiveKit SFU room over network or publish
 * tracks. Full network audio and media-plane lifecycle are implemented in the production
 * worker media plane split.
 */
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
  console.log('[MainThread] Starting LiveKit rtc-node worker spike...');
  const workerPath = fileURLToPath(import.meta.url);
  const worker = new Worker(workerPath);

  const startMs = Date.now();

  worker.on('message', (msg) => {
    console.log('[MainThread] Received from worker:', msg);
    if (msg.status === 'ready') {
      // Send a 10ms 24kHz 16-bit PCM audio frame (480 bytes) as transferable ArrayBuffer
      const buffer = new ArrayBuffer(480);
      const view = new Int16Array(buffer);
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.sin(i / 10) * 1000;
      }
      console.log(`[MainThread] Sending 480-byte audio buffer (byteLength: ${buffer.byteLength}) to worker...`);
      worker.postMessage({ type: 'audio-frame', buffer }, [buffer]);
      console.log(`[MainThread] After transfer, main buffer byteLength: ${buffer.byteLength} (transferred: ${buffer.byteLength === 0})`);
    } else if (msg.status === 'frame-processed') {
      console.log(`[MainThread] Roundtrip finished in ${Date.now() - startMs}ms`);
      worker.terminate().then(() => {
        console.log('[MainThread] Worker terminated cleanly.');
        process.exit(0);
      });
    } else if (msg.status === 'error') {
      console.error('[MainThread] Worker reported error:', msg.error);
      worker.terminate().then(() => process.exit(1));
    }
  });

  worker.on('error', (err) => {
    console.error('[MainThread] Worker error event:', err);
    process.exit(1);
  });

  worker.on('exit', (code) => {
    console.log(`[MainThread] Worker exited with code ${code}`);
  });
} else {
  // Inside Worker Thread
  (async () => {
    try {
      console.log('[Worker] Worker thread running. Attempting to import @livekit/rtc-node...');
      // Dynamic import justification (AGENTS.md Rule 8 Category 2/5): @livekit/rtc-node is an optional native
      // C++ addon. Loading it dynamically inside the worker thread ensures the native binding is initialized
      // exclusively within the worker thread isolate without loading into the main thread isolate.
      const rtcNode = await import('@livekit/rtc-node');
      console.log('[Worker] @livekit/rtc-node loaded successfully! Keys:', Object.keys(rtcNode).filter(k => typeof rtcNode[k] === 'function'));

      console.log('[Worker] Attempting to instantiate Room...');
      const room = new rtcNode.Room();
      console.log('[Worker] Room instantiated successfully! Room name:', room.name);

      console.log('[Worker] Attempting to instantiate AudioSource...');
      const source = new rtcNode.AudioSource(24000, 1);
      console.log('[Worker] AudioSource instantiated successfully!');

      parentPort.postMessage({ status: 'ready' });

      parentPort.on('message', async (msg) => {
        if (msg.type === 'audio-frame') {
          console.log(`[Worker] Received audio buffer with byteLength ${msg.buffer.byteLength}`);
          const int16 = new Int16Array(msg.buffer);
          console.log(`[Worker] Samples in buffer: ${int16.length}`);
          const frame = new rtcNode.AudioFrame(int16, 24000, 1, int16.length);
          console.log(`[Worker] AudioFrame constructed! sampleRate: ${frame.sampleRate}, channels: ${frame.channels}, samplesPerChannel: ${frame.samplesPerChannel}`);
          await source.captureFrame(frame);
          console.log('[Worker] source.captureFrame completed successfully!');

          parentPort.postMessage({
            status: 'frame-processed',
            samples: int16.length,
            queuedDuration: source.queuedDuration,
          });
        }
      });
    } catch (err) {
      console.error('[Worker] Error in worker thread:', err);
      parentPort.postMessage({ status: 'error', error: err instanceof Error ? err.stack : String(err) });
    }
  })();
}
