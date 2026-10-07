/**
 * @file worker-meet-live-benchmark.mjs
 *
 * SCOPE
 * -----
 * Compares the in-process media plane (LiveKitRtcNodeRoomClient) with the worker-thread media plane
 * (LiveKitWorkerRoomClient) against a REAL LiveKit server. It measures only what it can observe; every
 * number printed is a measurement from this run, nothing is asserted or hard-coded.
 *
 * Topology per mode (each mode gets its own fresh room):
 *   - "human" participant : @livekit/rtc-node client that publishes a continuous 20ms-framed tone track,
 *                           paced in real time (stands in for a person speaking), so inbound frames flow.
 *   - "bot" participant   : the client UNDER TEST. Subscribes to the human's track, and every few seconds
 *                           pushes a burst of model-style outbound audio (faster than real time, like a
 *                           realtime model's reply).
 *   - synthetic main-thread load (JSON alloc/parse on a timer) runs in this process throughout, standing in
 *                           for the rest of MJAPI contending for the event loop.
 *
 * Reported per mode:
 *   - inbound inter-frame gap histogram as seen by the MAIN thread's onAudioFrame callback
 *   - inbound inter-frame gap histogram as seen by the media thread (client telemetry; "since connect")
 *   - outbound captures, underruns, source queued duration, worker pacer queue depth
 *   - main-thread and worker-thread event-loop delay p99 (ms), clearly labelled
 *   - worker mode only: crash recovery. The worker thread is terminated mid-call and the script waits for a
 *     REAL reconnect (a second worker spawned by the client AND inbound frames resuming); it reports the
 *     measured time to first frame, or that no recovery was observed within the wait.
 *
 * NOT covered: model WebSocket transport (still on the main thread), multi-room scale, network jitter
 * between this host and a remote SFU (run against a local server, so network is ~0), CPU-bound codecs.
 *
 * Requirements (environment ONLY; the script exits immediately if any is missing):
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 *   Optional: BENCH_DURATION_S (default 20), BENCH_LOAD=off to disable synthetic load,
 *             BENCH_SKIP_CRASH=1 to skip the crash-recovery phase.
 * Build first:  pnpm run build   (this script statically imports ../dist/index.js)
 * Run:          LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... node scripts/worker-meet-live-benchmark.mjs
 */

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveKitRtcNodeRoomClient, LiveKitWorkerRoomClient, DefaultRtcNodeLoader } from '../dist/index.js';

const REQUIRED_ENV = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}. Nothing was run.`);
    process.exit(2);
}
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_SECRET = process.env.LIVEKIT_API_SECRET;
const DURATION_MS = Number(process.env.BENCH_DURATION_S ?? '20') * 1000;
const LOAD_ENABLED = (process.env.BENCH_LOAD ?? 'on').toLowerCase() !== 'off';
const SKIP_CRASH = process.env.BENCH_SKIP_CRASH === '1';
const WARMUP_MS = 2000;
const SAMPLE_RATE = 24000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDist = path.resolve(here, '../dist');
// `livekit-server-sdk` (token minting) is not a dependency of this package; it is resolved from the sibling
// @memberjunction/livekit-room-server package, which already depends on it. Build that package's deps first.
const requireFromRoomServer = createRequire(path.resolve(here, '../../../../../LiveKitRoomServer/package.json'));
const { AccessToken } = requireFromRoomServer('livekit-server-sdk');
const workerBootstrapPath = path.join(pkgDist, 'media-worker-bootstrap.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bounds a teardown step so one stuck native call cannot hang the whole run; reports when it trips. */
async function bounded(label, promise, limitMs = 8000) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve('timeout'), limitMs);
    });
    const outcome = await Promise.race([promise.then(() => 'done', (err) => `error: ${err instanceof Error ? err.message : String(err)}`), timeout]);
    clearTimeout(timer);
    if (outcome !== 'done') console.log(`[bench] teardown step '${label}' ended with: ${outcome}`);
}

/** Keeps the loop alive: native handles do not, and a silent exit would hide a hung step. */
setInterval(() => undefined, 1000);

async function mintToken(room, identity) {
    const at = new AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET, { identity, name: identity, ttl: '10m' });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
    return at.toJwt();
}

/** Gap histogram with the same bins the clients' own telemetry uses. */
function newHist() {
    return { lt10ms: 0, b10_20ms: 0, b20_30ms: 0, b30_50ms: 0, b50_100ms: 0, gte100ms: 0, totalFrames: 0, maxGapMs: 0, last: undefined };
}
function recordGap(h, now) {
    if (h.last !== undefined) {
        const gap = now - h.last;
        h.totalFrames++;
        h.maxGapMs = Math.max(h.maxGapMs, gap);
        if (gap < 10) h.lt10ms++;
        else if (gap < 20) h.b10_20ms++;
        else if (gap < 30) h.b20_30ms++;
        else if (gap < 50) h.b30_50ms++;
        else if (gap < 100) h.b50_100ms++;
        else h.gte100ms++;
    }
    h.last = now;
}
const fmtHist = (h) =>
    `n=${h.totalFrames} <10=${h.lt10ms} 10-20=${h.b10_20ms} 20-30=${h.b20_30ms} 30-50=${h.b30_50ms} 50-100=${h.b50_100ms} >=100=${h.gte100ms}` +
    (h.maxGapMs !== undefined ? ` max=${h.maxGapMs.toFixed(1)}ms` : '');
const ms = (v) => (typeof v === 'number' ? `${v.toFixed(2)}ms` : 'n/a');

function toneFrame(phaseRef) {
    const data = new Int16Array(FRAME_SAMPLES);
    for (let i = 0; i < FRAME_SAMPLES; i++) {
        data[i] = Math.round(3000 * Math.sin(phaseRef.p));
        phaseRef.p += (2 * Math.PI * 440) / SAMPLE_RATE;
    }
    return data;
}

/** A "human": publishes a real-time paced tone until stop() is called. */
async function startHuman(rtc, roomName) {
    const room = new rtc.Room();
    await room.connect(LIVEKIT_URL, await mintToken(roomName, 'human'), { autoSubscribe: false, dynacast: false });
    const source = new rtc.AudioSource(SAMPLE_RATE, 1);
    const track = rtc.LocalAudioTrack.createAudioTrack('human-voice', source);
    await room.localParticipant.publishTrack(track, new rtc.TrackPublishOptions({ source: rtc.TrackSource.SOURCE_MICROPHONE }));
    let running = true;
    const phase = { p: 0 };
    const pump = (async () => {
        const t0 = performance.now();
        for (let k = 0; running; k++) {
            const frame = new rtc.AudioFrame(toneFrame(phase), SAMPLE_RATE, 1, FRAME_SAMPLES);
            await source.captureFrame(frame);
            const wait = t0 + (k + 1) * FRAME_MS - performance.now();
            if (wait > 0) await sleep(wait);
        }
    })();
    return {
        async stop() {
            running = false;
            await bounded('human pump', pump);
            await room.disconnect();
            void track;
        },
    };
}

/** Synthetic server load on the main thread (JSON alloc/parse, like resolver work). */
function startLoad() {
    if (!LOAD_ENABLED) return () => undefined;
    const timer = setInterval(() => {
        for (let i = 0; i < 20; i++) {
            const data = { records: Array.from({ length: 500 }, (_, k) => ({ id: k, name: `Record ${k}`, ts: Date.now() })) };
            JSON.parse(JSON.stringify(data));
        }
    }, 15);
    return () => clearInterval(timer);
}

/** Schedules model-style outbound bursts: 1.5s of audio pushed as fast as possible, every 3s. */
function startOutboundBursts(client) {
    let running = true;
    const phase = { p: 0 };
    const loop = (async () => {
        while (running) {
            for (let i = 0; i < 75 && running; i++) {
                const samples = toneFrame(phase);
                client.publishAudio(samples.buffer);
            }
            await sleep(3000);
        }
    })();
    return async () => {
        running = false;
        await loop;
    };
}

async function runMode(rtc, mode) {
    const roomName = `bench-${mode}-${Date.now()}`;
    const human = await startHuman(rtc, roomName);
    const captured = [];
    const client =
        mode === 'worker'
            ? new LiveKitWorkerRoomClient({
                  sampleRate: SAMPLE_RATE,
                  inboundSampleRate: SAMPLE_RATE,
                  channels: 1,
                  workerFactory: () => {
                      const w = new Worker(workerBootstrapPath);
                      captured.push(w);
                      return w;
                  },
                  telemetryPollMs: 0,
                  restartBackoffBaseMs: 250,
              })
            : new LiveKitRtcNodeRoomClient(SAMPLE_RATE, SAMPLE_RATE, 1, DefaultRtcNodeLoader);

    const mainHist = newHist();
    let measuring = false;
    let frameCount = 0;
    let lastFrameAt = 0;
    let disconnectedReason;
    client.onAudioFrame(() => {
        const now = performance.now();
        frameCount++;
        lastFrameAt = now;
        if (measuring) recordGap(mainHist, now);
    });
    client.onDisconnected((reason) => {
        disconnectedReason = reason ?? 'disconnected';
    });

    const loopMonitor = monitorEventLoopDelay({ resolution: 10 });
    const stopLoad = startLoad();
    await client.connect({ url: LIVEKIT_URL, token: await mintToken(roomName, 'bot'), name: 'bot' });
    const stopBursts = startOutboundBursts(client);

    await sleep(WARMUP_MS);
    loopMonitor.enable();
    measuring = true;
    const framesAtStart = frameCount;
    await sleep(DURATION_MS);
    measuring = false;
    loopMonitor.disable();

    const telemetry = typeof client.RefreshTelemetry === 'function' ? await client.RefreshTelemetry() : client.GetTelemetry();
    const result = {
        mode,
        framesInWindow: frameCount - framesAtStart,
        mainHist,
        mainP99Ms: loopMonitor.percentile(99) / 1e6,
        telemetry,
        crash: undefined,
        disconnectedReason,
    };

    if (mode === 'worker' && !SKIP_CRASH) {
        const workersBefore = captured.length;
        const framesBefore = frameCount;
        const crashAt = performance.now();
        await captured[captured.length - 1].terminate();
        // Wait for a REAL reconnect: the client spawned another worker AND inbound frames resumed.
        let recoveredAt;
        while (performance.now() - crashAt < 20000) {
            if (captured.length > workersBefore && frameCount > framesBefore && lastFrameAt > crashAt) {
                recoveredAt = lastFrameAt;
                break;
            }
            await sleep(50);
        }
        result.crash = {
            workersSpawnedAfterCrash: captured.length - workersBefore,
            recoveryMs: recoveredAt === undefined ? undefined : recoveredAt - crashAt,
            disconnectRaised: disconnectedReason,
        };
    }

    await bounded('stop bursts', stopBursts());
    stopLoad();
    await bounded('bot disconnect', client.disconnect());
    await bounded('human stop', human.stop());
    return result;
}

function printResult(r) {
    const t = r.telemetry;
    console.log(`\n--- ${r.mode === 'worker' ? 'WORKER media plane' : 'IN-PROCESS media plane'} ---`);
    console.log(`inbound frames delivered to main thread in ${DURATION_MS / 1000}s window : ${r.framesInWindow}`);
    console.log(`inbound inter-frame gaps seen by MAIN thread callback      : ${fmtHist(r.mainHist)}`);
    const media = Object.entries(t.inboundGaps ?? {});
    for (const [identity, h] of media) {
        console.log(`inbound gaps seen by MEDIA thread for '${identity}' (since connect) : ${fmtHist({ ...h, maxGapMs: undefined })}`);
    }
    console.log(`outbound: captures=${t.outbound.captureCount} underruns=${t.outbound.underrunCount} sourceQueuedDuration=${t.outbound.lastQueuedDuration ?? 'n/a'} pacerQueuedMs=${t.pacerQueuedMs ?? 'n/a'}`);
    console.log(`event-loop p99: main thread (script monitor, window)=${ms(r.mainP99Ms)}  main thread (client telemetry)=${ms(t.mainEventLoopDelayP99Ms ?? (r.mode === 'worker' ? undefined : t.eventLoopDelayP99Ms))}  worker thread=${ms(t.workerEventLoopDelayP99Ms)}`);
    if (r.crash) {
        console.log(`crash recovery: workers spawned after crash=${r.crash.workersSpawnedAfterCrash} time-to-first-frame=${r.crash.recoveryMs === undefined ? 'NOT RECOVERED within 20000ms' : ms(r.crash.recoveryMs)} disconnect raised=${r.crash.disconnectRaised ?? 'no'}`);
    }
    if (r.disconnectedReason && !r.crash) {
        console.log(`disconnect raised: ${r.disconnectedReason}`);
    }
}

const rtc = await DefaultRtcNodeLoader();
console.log(`LiveKit media-plane benchmark  server=${LIVEKIT_URL}  window=${DURATION_MS / 1000}s  warmup=${WARMUP_MS}ms  synthetic load=${LOAD_ENABLED ? 'on' : 'off'}`);
const results = [];
for (const mode of ['in-process', 'worker']) {
    results.push(await runMode(rtc, mode));
    printResult(results[results.length - 1]);
    await sleep(1000);
}
process.exit(0);
