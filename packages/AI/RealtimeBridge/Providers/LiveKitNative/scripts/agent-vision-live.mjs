/**
 * @file agent-vision-live.mjs
 *
 * SCOPE
 * -----
 * Manual live check of the agent's bot reading meeting video, against a REAL LiveKit server. Every number printed is a
 * measurement from this run; nothing is asserted or hard-coded.
 *
 * Topology (one fresh room per run):
 *   - "person" participant : @livekit/rtc-node client publishing a synthetic camera (or screen share) with a VideoSource +
 *                            LocalVideoTrack at a steady frame rate. Pre-rendered I420 frames, so the person adds almost
 *                            no work to this process.
 *   - "bot" participant    : the client UNDER TEST (LiveKitRtcNodeRoomClient, in-process, so encoding runs on this
 *                            process's main loop), created with video options as the bridge would when the agent watches.
 *   - consent              : set and withdrawn on the person through the server API (RoomServiceClient.updateParticipant),
 *                            the way MJAPI records a person's choice.
 *
 * Phases: join -> warm-up without consent (the bot must read nothing) -> consent on, measured window -> opt-out -> settle.
 *
 * Reported:
 *   - frames received before consent (expected 0)
 *   - time from consent to the first frame (selection, subscription, first keyframe)
 *   - frames per second during the window, JPEG sizes (min / mean / max), encoded dimensions
 *   - encode ms (last / max, from the client's video telemetry) and the telemetry counters
 *   - main-thread event-loop delay p99 during the window (the thread that encodes)
 *   - time from the opt-out request to the last frame, frames after the opt-out, and when the ended source was reported
 *
 * NOT covered: the worker media plane (MJ_LIVEKIT_WORKER_MEDIA=on), the bridge/engine/model above the room client,
 * several people at once, real camera content (synthetic frames compress unusually well), network between this host and a
 * remote server.
 *
 * Requirements (environment ONLY; the script exits immediately if any is missing):
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 *   Optional: VISION_DURATION_S (default 10), VISION_SOURCE=camera|screen (default camera),
 *             VISION_WIDTH / VISION_HEIGHT (default 1280 x 720), VISION_FPS (default 30), VISION_RATE (default 1)
 * Build first:  pnpm run build   (this script statically imports ../dist/index.js)
 * Run:          LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... node scripts/agent-vision-live.mjs
 */

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentVisionAttributes } from '@memberjunction/ai';
import { LiveKitRtcNodeRoomClient, DefaultRtcNodeLoader, I420ByteLength } from '../dist/index.js';

const REQUIRED_ENV = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}. Nothing was run.`);
    process.exit(2);
}
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_SECRET = process.env.LIVEKIT_API_SECRET;
const DURATION_MS = Number(process.env.VISION_DURATION_S ?? '10') * 1000;
const SOURCE_KIND = process.env.VISION_SOURCE === 'screen' ? 'screen' : 'camera';
const WIDTH = Number(process.env.VISION_WIDTH ?? '1280');
const HEIGHT = Number(process.env.VISION_HEIGHT ?? '720');
const FPS = Number(process.env.VISION_FPS ?? '30');
const RATE = Number(process.env.VISION_RATE ?? '1');
const WARMUP_MS = 3000;
const SETTLE_MS = 3000;
const PERSON = 'vision-person';
const BOT = 'agent-vision-under-test';

const here = path.dirname(fileURLToPath(import.meta.url));
// `livekit-server-sdk` (tokens + the server API) is not a dependency of this package; it is resolved from the sibling
// @memberjunction/livekit-room-server package, which already depends on it (same approach as worker-meet-live-benchmark).
const requireFromRoomServer = createRequire(path.resolve(here, '../../../../../LiveKitRoomServer/package.json'));
const { AccessToken, RoomServiceClient } = requireFromRoomServer('livekit-server-sdk');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtMs = (v) => (typeof v === 'number' ? `${v.toFixed(1)}ms` : 'n/a');

/** Keeps the loop alive: native handles do not, and a silent exit would hide a hung step. */
setInterval(() => undefined, 1000);

/** Bounds a teardown step so one stuck native call cannot hang the run; reports when it trips. */
async function bounded(label, promise, limitMs = 8000) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve('timeout'), limitMs);
    });
    const outcome = await Promise.race([promise.then(() => 'done', (err) => `error: ${err instanceof Error ? err.message : String(err)}`), timeout]);
    clearTimeout(timer);
    if (outcome !== 'done') console.log(`[vision] teardown step '${label}' ended with: ${outcome}`);
}

async function mintToken(room, identity) {
    const at = new AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET, { identity, name: identity === PERSON ? 'Vision Person' : 'Agent', ttl: '10m' });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
    return at.toJwt();
}

/** The server API's HTTP(S) host for the configured ws(s) URL. */
function serverApiHost(url) {
    return url.replace(/^ws(s?):\/\//, 'http$1://');
}

/** Pre-renders a few I420 frames with a moving gradient, so the person's publish loop does no per-frame work. */
function renderFrames(count) {
    const frames = [];
    const lumaLength = WIDTH * HEIGHT;
    for (let k = 0; k < count; k++) {
        const data = new Uint8Array(I420ByteLength(WIDTH, HEIGHT));
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                data[y * WIDTH + x] = 16 + ((x + y + k * 24) % 220);
            }
        }
        data.fill(128, lumaLength);
        frames.push(data);
    }
    return frames;
}

/** A person publishing a synthetic camera or screen share, paced in real time until stop(). */
async function startPerson(rtc, roomName) {
    const room = new rtc.Room();
    await room.connect(LIVEKIT_URL, await mintToken(roomName, PERSON), { autoSubscribe: false, dynacast: false });
    const source = new rtc.VideoSource(WIDTH, HEIGHT);
    const track = rtc.LocalVideoTrack.createVideoTrack(SOURCE_KIND, source);
    const trackSource = SOURCE_KIND === 'screen' ? rtc.TrackSource.SOURCE_SCREENSHARE : rtc.TrackSource.SOURCE_CAMERA;
    await room.localParticipant.publishTrack(track, new rtc.TrackPublishOptions({ source: trackSource }));
    const frames = renderFrames(15);
    let running = true;
    const pump = (async () => {
        const t0 = performance.now();
        for (let k = 0; running; k++) {
            source.captureFrame(new rtc.VideoFrame(frames[k % frames.length], WIDTH, HEIGHT, rtc.VideoBufferType.I420));
            const wait = t0 + ((k + 1) * 1000) / FPS - performance.now();
            if (wait > 0) await sleep(wait);
        }
    })();
    return {
        async stop() {
            running = false;
            await bounded('person pump', pump);
            await room.disconnect();
            void track;
        },
    };
}

/** The bot under test, recording every frame and ended source it raises. */
async function startBot(roomName) {
    const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, DefaultRtcNodeLoader, {
        Video: { Streams: 1, Rate: RATE, Cameras: true, Screens: true },
    });
    const frames = [];
    const ended = [];
    client.onVideoFrame((f) => frames.push({ at: performance.now(), bytes: f.data.byteLength, width: f.width, height: f.height, source: f.source }));
    client.onVideoSourceEnded((s) => ended.push({ at: performance.now(), ...s }));
    await client.connect({ url: LIVEKIT_URL, token: await mintToken(roomName, BOT), name: 'Agent' });
    return { client, frames, ended };
}

function summarizeWindow(frames, fromMs, toMs) {
    const inWindow = frames.filter((f) => f.at >= fromMs && f.at < toMs);
    const sizes = inWindow.map((f) => f.bytes);
    const mean = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : undefined;
    return {
        count: inWindow.length,
        fps: inWindow.length / ((toMs - fromMs) / 1000),
        minBytes: sizes.length ? Math.min(...sizes) : undefined,
        meanBytes: mean,
        maxBytes: sizes.length ? Math.max(...sizes) : undefined,
        dims: [...new Set(inWindow.map((f) => `${f.width}x${f.height} ${f.source}`))].join(', ') || 'none',
    };
}

async function run() {
    const rtc = await DefaultRtcNodeLoader();
    const roomName = `vision-${Date.now()}`;
    const roomService = new RoomServiceClient(serverApiHost(LIVEKIT_URL), LIVEKIT_KEY, LIVEKIT_SECRET);
    console.log(`Agent vision live check  server=${LIVEKIT_URL}  source=${SOURCE_KIND} ${WIDTH}x${HEIGHT}@${FPS}fps  rate=${RATE}fps  window=${DURATION_MS / 1000}s`);

    const person = await startPerson(rtc, roomName);
    const bot = await startBot(roomName);
    await sleep(WARMUP_MS);
    const framesBeforeConsent = bot.frames.length;

    const consentAt = performance.now();
    await roomService.updateParticipant(roomName, PERSON, { attributes: AgentVisionAttributes(true) });
    const loopMonitor = monitorEventLoopDelay({ resolution: 10 });
    loopMonitor.enable();
    await sleep(DURATION_MS);
    loopMonitor.disable();
    const windowEnd = performance.now();
    const telemetry = bot.client.GetTelemetry();

    const optOutAt = performance.now();
    await roomService.updateParticipant(roomName, PERSON, { attributes: AgentVisionAttributes(false) });
    const optOutAckAt = performance.now();
    await sleep(SETTLE_MS);

    const firstFrame = bot.frames.find((f) => f.at >= consentAt);
    const lastFrame = bot.frames[bot.frames.length - 1];
    const result = {
        framesBeforeConsent,
        firstFrameMs: firstFrame ? firstFrame.at - consentAt : undefined,
        window: summarizeWindow(bot.frames, firstFrame?.at ?? consentAt, windowEnd),
        loopP99Ms: loopMonitor.percentile(99) / 1e6,
        telemetry,
        framesAfterOptOut: bot.frames.filter((f) => f.at > optOutAt).length,
        lastFrameAfterOptOutMs: lastFrame ? lastFrame.at - optOutAt : undefined,
        optOutAckMs: optOutAckAt - optOutAt,
        endedAfterOptOutMs: bot.ended.length ? bot.ended[0].at - optOutAt : undefined,
        ended: bot.ended,
    };

    await bounded('bot disconnect', bot.client.disconnect());
    await bounded('person stop', person.stop());
    return result;
}

function report(r) {
    const v = r.telemetry.video;
    const w = r.window;
    console.log(`\nframes before consent (expected 0)          : ${r.framesBeforeConsent}`);
    console.log(`consent -> first frame                      : ${fmtMs(r.firstFrameMs)}`);
    console.log(`frames in window                            : ${w.count} (${w.fps.toFixed(2)} fps; dims ${w.dims})`);
    console.log(`JPEG bytes min / mean / max                 : ${w.minBytes ?? 'n/a'} / ${w.meanBytes?.toFixed(0) ?? 'n/a'} / ${w.maxBytes ?? 'n/a'}`);
    console.log(`encode ms last / max (client telemetry)     : ${fmtMs(v?.encodeMsLast)} / ${fmtMs(v?.encodeMsMax)}`);
    console.log(`video counters                              : received=${v?.framesReceived ?? 'n/a'} sent=${v?.framesSent ?? 'n/a'} notDue=${v?.framesSkippedNotDue ?? 'n/a'} bytes=${v?.bytesSent ?? 'n/a'} selected=${v?.selectedSources ?? 'n/a'}`);
    console.log(`main event-loop p99 during window           : ${fmtMs(r.loopP99Ms)} (client telemetry: ${fmtMs(r.telemetry.eventLoopDelayP99Ms)})`);
    console.log(`opt-out request -> server ack               : ${fmtMs(r.optOutAckMs)}`);
    console.log(`opt-out request -> last frame               : ${r.lastFrameAfterOptOutMs === undefined || r.lastFrameAfterOptOutMs < 0 ? 'no frame after the request' : fmtMs(r.lastFrameAfterOptOutMs)} (frames after: ${r.framesAfterOptOut})`);
    console.log(`opt-out request -> source reported ended    : ${fmtMs(r.endedAfterOptOutMs)} ${r.ended.length ? JSON.stringify(r.ended.map(({ at, ...rest }) => rest)) : ''}`);
}

try {
    report(await run());
    process.exit(0);
} catch (err) {
    console.error(`[vision] run failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
}
