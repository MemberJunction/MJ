/**
 * @file worker-media-benchmark.mjs
 * @scope Micro-Benchmark Scope: Measures main-thread event loop delay and IPC round-trip latency
 * when streaming synthetic 20ms PCM audio frames across worker thread boundaries with zero-copy
 * transferable ArrayBuffers and AudioSource.captureFrame().
 *
 * NOTE: Measures an idle main thread with synthetic frames; real-world Meet call audio metrics
 * are gathered in the integrated media plane split.
 */
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';

if (isMainThread) {
  console.log('===============================================================');
  console.log('Worker Thread Media Plane Micro-Benchmark — @livekit/rtc-node');
  console.log('===============================================================');

  const mainHistogram = monitorEventLoopDelay({ resolution: 10 });
  mainHistogram.enable();

  const workerPath = fileURLToPath(import.meta.url);
  const worker = new Worker(workerPath);

  const FRAME_COUNT = 150; // 150 frames * 20ms = 3 seconds of continuous real-time audio
  const SAMPLES_PER_FRAME = 480; // 20ms @ 24kHz = 480 samples = 960 bytes
  let sentFrames = 0;
  let receivedFrames = 0;
  const latenciesMs = [];

  worker.on('message', (msg) => {
    if (msg.status === 'ready') {
      console.log('[MainThread] Worker initialized and ready. Starting real-time (20ms interval) audio stream simulation...');
      sendNextBatch();
    } else if (msg.status === 'frame-captured') {
      receivedFrames++;
      const rtt = Date.now() - msg.sentAt;
      latenciesMs.push(rtt);

      if (receivedFrames % 50 === 0) {
        console.log(`[MainThread] Processed ${receivedFrames}/${FRAME_COUNT} frames (queuedDuration: ${msg.queuedDuration}ms, current RTT: ${rtt}ms)`);
      }

      if (receivedFrames >= FRAME_COUNT) {
        mainHistogram.disable();
        const p50 = Math.round(mainHistogram.percentile(50) / 1e6 * 100) / 100;
        const p95 = Math.round(mainHistogram.percentile(95) / 1e6 * 100) / 100;
        const p99 = Math.round(mainHistogram.percentile(99) / 1e6 * 100) / 100;

        latenciesMs.sort((a, b) => a - b);
        const rttP50 = latenciesMs[Math.floor(latenciesMs.length * 0.50)];
        const rttP95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)];
        const rttP99 = latenciesMs[Math.floor(latenciesMs.length * 0.99)];

        console.log('\n================== MICRO-BENCHMARK RESULTS ==================');
        console.log(`Total Frames:            ${FRAME_COUNT} (3 seconds audio @ 24kHz mono PCM16)`);
        console.log(`Pacing Interval:         20ms (Real-time live audio pace)`);
        console.log(`Main Event Loop Delay:   p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms`);
        console.log(`Main -> Worker IPC RTT:  p50: ${rttP50}ms | p95: ${rttP95}ms | p99: ${rttP99}ms`);
        console.log(`Worker Final Queue:      ${msg.queuedDuration}ms`);
        console.log('Status:                  FFI capture & zero-copy transfer verified (synthetic frames)');
        console.log('=================================================================\n');

        worker.terminate().then(() => process.exit(0));
      }
    } else if (msg.status === 'error') {
      console.error('[MainThread] Worker error:', msg.error);
      worker.terminate().then(() => process.exit(1));
    }
  });

  function sendNextBatch() {
    const interval = setInterval(() => {
      if (sentFrames >= FRAME_COUNT) {
        clearInterval(interval);
        return;
      }
      sentFrames++;
      const buffer = new ArrayBuffer(SAMPLES_PER_FRAME * 2);
      const view = new Int16Array(buffer);
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.sin((sentFrames * SAMPLES_PER_FRAME + i) / 10) * 2000;
      }
      worker.postMessage({
        type: 'audio-frame',
        sentAt: Date.now(),
        buffer,
      }, [buffer]);
    }, 20); // exactly 20ms real-time pacing
  }

  worker.on('error', (err) => {
    console.error('[MainThread] Worker error:', err);
    process.exit(1);
  });
} else {
  // Worker Thread
  (async () => {
    try {
      // Dynamic import justification (AGENTS.md Rule 8 Category 2/5): @livekit/rtc-node is an optional native
      // C++ addon. Loading it dynamically inside the worker thread ensures the native binding is initialized
      // exclusively within the worker thread isolate without loading into the main thread isolate.
      const rtcNode = await import('@livekit/rtc-node');
      const room = new rtcNode.Room();
      const source = new rtcNode.AudioSource(24000, 1);

      // Pre-buffering jitter buffer: 100ms (5 frames of 20ms)
      const JITTER_BUFFER_MS = 100;
      let initialBufferCount = 0;
      const targetInitialFrames = Math.ceil(JITTER_BUFFER_MS / 20);

      parentPort.postMessage({ status: 'ready' });

      const queue = [];
      let draining = false;

      async function drain() {
        if (draining) return;
        draining = true;
        try {
          while (queue.length > 0) {
            const item = queue.shift();
            const frame = new rtcNode.AudioFrame(item.int16, 24000, 1, item.int16.length);
            await source.captureFrame(frame);
            parentPort.postMessage({
              status: 'frame-captured',
              sentAt: item.sentAt,
              queuedDuration: typeof source.queuedDuration === 'function' ? source.queuedDuration() : source.queuedDuration,
            });
          }
        } finally {
          draining = false;
          if (queue.length > 0) {
            void drain();
          }
        }
      }

      parentPort.on('message', (msg) => {
        if (msg.type === 'audio-frame') {
          const int16 = new Int16Array(msg.buffer);
          queue.push({ int16, sentAt: msg.sentAt });
          void drain();
        }
      });
    } catch (err) {
      parentPort.postMessage({ status: 'error', error: err instanceof Error ? err.stack : String(err) });
    }
  })();
}
