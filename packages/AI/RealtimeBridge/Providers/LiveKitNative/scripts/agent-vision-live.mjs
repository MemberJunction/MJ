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
 *                            no work to this process. It runs in this process, so its own cost is in the baseline too.
 *   - "bot" participant    : the client UNDER TEST, built through CreateLiveKitRtcNodeModule (the path MJAPI takes) with
 *                            video options as the bridge would when the agent watches. Frames are encoded on the encode
 *                            worker's thread (VISION_ENCODER=worker, the default) or on the thread that hosts the room
 *                            (VISION_ENCODER=in-process). With VISION_WORKER_MEDIA=on the room runs in the media worker,
 *                            which has its own encode worker.
 *   - consent              : set and withdrawn on the person through the server API (RoomServiceClient.updateParticipant),
 *                            the way MJAPI records a person's choice.
 *
 * Phases: join -> baseline without consent, as long as the window (the bot must read nothing) -> consent on, measured
 * window (optionally the encode worker is killed halfway) -> opt-out -> settle.
 *
 * Reported:
 *   - the mode: where frames are encoded, which thread hosts the room
 *   - frames received before consent (expected 0)
 *   - time from consent to the first frame (selection, subscription, first keyframe)
 *   - frames per second during the window, JPEG sizes (min / mean / max), encoded dimensions
 *   - from the client's video telemetry: where frames were encoded and encode worker restarts; encode ms (last / max, on the
 *     thread that encoded); the round trip (last / max) and the room thread's dispatch cost (max); every counter
 *   - main-thread event-loop delay p99 during the baseline and during the window
 *   - with VISION_WORKER_MEDIA=on: the media worker's loop p99, outbound underruns and pacerQueuedMs
 *   - with VISION_CRASH_ENCODER=1: when the encode worker was killed, and the time to the next frame
 *   - time from the opt-out request to the last frame, frames after the opt-out, and when the ended source was reported
 *
 * NOT covered: the bridge/engine/model above the room client, several people at once, real camera content (synthetic
 * frames compress unusually well), network between this host and a remote server, the person in another process.
 *
 * SWITCH SCENARIO (VISION_SCENARIO=switch): which source the bot shows the model, and how switches behave live.
 *   Two people with a synthetic camera each (Ada joins first, so her camera is read first); Bob also publishes a
 *   microphone. Consent for both, then: Bob talks (a tone on his microphone) so he leads LiveKit's active-speaker list
 *   -> Bob shares a screen -> the bot itself talks (a tone through publishAudio) -> Bob stops sharing -> settle.
 *   Reported:
 *   - which source the bot read when (one line per run of frames from one source), and each switch: what it replaced,
 *     when it happened after its trigger, and how long the model saw nothing (the gap between the two sources' frames)
 *   - expected (the default hold: 1.5 s onset, 4 s dwell): Ada's camera, then Bob's camera about 1.5 s plus LiveKit's
 *     own detection after he starts talking, then Bob's screen at once, no switch while the bot talks, then Bob's camera
 *     (the last speaker) when the share stops
 *   - the active-speaker updates LiveKit sent, as Ada's room saw them (Ada subscribes to everyone, so she is sent every
 *     speaker): how many, the interval while Bob talked, the order of identities when several spoke, and whether the
 *     bot itself appeared (its own updates are dropped)
 *   - the bot's video telemetry: sourceSwitches, switchesHeld, activeSpeakerUpdates, switchGapMsLast / Max
 *   - the ended sources the bot reported, with times
 *
 * Requirements (environment ONLY; the script exits immediately if any is missing):
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 *   Optional: VISION_DURATION_S (default 10; the baseline is as long), VISION_SOURCE=camera|screen (default camera),
 *             VISION_WIDTH / VISION_HEIGHT (default 1280 x 720), VISION_FPS (default 30), VISION_RATE (default 1),
 *             VISION_ENCODER=worker|in-process (default worker), VISION_WORKER_MEDIA=on (default off),
 *             VISION_CRASH_ENCODER=1 (kill the encode worker halfway through the window; VISION_ENCODER=worker on the
 *             main thread only, since a media worker's encode worker cannot be reached from here),
 *             VISION_SCENARIO=switch (the switch scenario above; VISION_SOURCE, VISION_DURATION_S and
 *             VISION_CRASH_ENCODER do not apply to it)
 * Build first:  pnpm run build   (this script statically imports ../dist/index.js)
 * Run:          LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... node scripts/agent-vision-live.mjs
 */

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentVisionAttributes } from '@memberjunction/ai';
import {
    CreateLiveKitRtcNodeModule,
    CreateVideoEncodeWorker,
    DefaultRtcNodeLoader,
    I420ByteLength,
    VideoEncodeWorkerHost,
} from '../dist/index.js';

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
const ENCODER = process.env.VISION_ENCODER === 'in-process' ? 'in-process' : 'worker';
const WORKER_MEDIA = ['on', 'true', '1'].includes((process.env.VISION_WORKER_MEDIA ?? '').trim().toLowerCase());
const CRASH_ENCODER = process.env.VISION_CRASH_ENCODER === '1';
/** The crash phase needs the encode worker on this thread; a media worker's own encode worker is out of reach. */
const CAN_CRASH_ENCODER = ENCODER === 'worker' && !WORKER_MEDIA;
/** The pre-consent baseline is as long as the window, so each run carries its own before and after. */
const WARMUP_MS = DURATION_MS;
const SETTLE_MS = 3000;
const PERSON = 'vision-person';
const BOT = 'agent-vision-under-test';
const SCENARIO = process.env.VISION_SCENARIO === 'switch' ? 'switch' : 'single';
/** The switch scenario's people: Ada joins first; Bob talks and shares a screen. */
const ADA = 'vision-ada';
const BOB = 'vision-bob';
/** Microphone audio the people publish: 48 kHz mono in 10 ms frames. */
const MIC_RATE = 48000;
const MIC_FRAME_SAMPLES = 480;

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

async function mintToken(room, identity, name = identity === PERSON ? 'Vision Person' : 'Agent') {
    const at = new AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET, { identity, name, ttl: '10m' });
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

/**
 * Has the encode worker host start its workers through a factory that remembers each one, so the crash phase can kill
 * the running worker. Must run before the first frame.
 */
function recordEncodeWorkers() {
    const spawned = [];
    const host = VideoEncodeWorkerHost.Instance;
    host.Configure({
        WorkerFactory: () => {
            const worker = CreateVideoEncodeWorker(host.WorkerPath);
            spawned.push(worker);
            return worker;
        },
    });
    return spawned;
}

/** The bot under test, built the way MJAPI builds it, recording every frame and ended source it raises. */
async function startBot(roomName) {
    const client = CreateLiveKitRtcNodeModule({ VideoEncodeWorker: ENCODER === 'worker', UseWorker: WORKER_MEDIA }).createRoomClient({
        Video: { Streams: 1, Rate: RATE, Cameras: true, Screens: true },
    });
    const frames = [];
    const ended = [];
    client.onVideoFrame((f) =>
        frames.push({ at: performance.now(), bytes: f.data.byteLength, width: f.width, height: f.height, source: f.source, who: f.participantIdentity }),
    );
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

/** The main thread's event-loop delay p99 (ms) over the next `ms` milliseconds. */
async function mainLoopP99During(ms) {
    const monitor = monitorEventLoopDelay({ resolution: 10 });
    monitor.enable();
    await sleep(ms);
    monitor.disable();
    return monitor.percentile(99) / 1e6;
}

/** The measured window and the main loop's p99 over it; kills the running encode worker halfway when asked. */
async function runWindow(encodeWorkers) {
    const monitor = monitorEventLoopDelay({ resolution: 10 });
    monitor.enable();
    let crashAt;
    if (encodeWorkers) {
        await sleep(DURATION_MS / 2);
        const running = encodeWorkers[encodeWorkers.length - 1];
        if (running) {
            crashAt = performance.now();
            await running.terminate();
        }
        await sleep(DURATION_MS / 2);
    } else {
        await sleep(DURATION_MS);
    }
    monitor.disable();
    return { loopP99Ms: monitor.percentile(99) / 1e6, crashAt };
}

/** A fresh snapshot: the worker client asks its media worker; the in-process client answers at once. */
async function readTelemetry(client) {
    return typeof client.RefreshTelemetry === 'function' ? client.RefreshTelemetry() : client.GetTelemetry();
}

async function run() {
    const rtc = await DefaultRtcNodeLoader();
    const roomName = `vision-${Date.now()}`;
    const roomService = new RoomServiceClient(serverApiHost(LIVEKIT_URL), LIVEKIT_KEY, LIVEKIT_SECRET);
    console.log(`Agent vision live check  server=${LIVEKIT_URL}  source=${SOURCE_KIND} ${WIDTH}x${HEIGHT}@${FPS}fps  rate=${RATE}fps  window=${DURATION_MS / 1000}s`);
    const encodeWorkers = CRASH_ENCODER && CAN_CRASH_ENCODER ? recordEncodeWorkers() : undefined;

    const person = await startPerson(rtc, roomName);
    const bot = await startBot(roomName);
    const baselineLoopP99Ms = await mainLoopP99During(WARMUP_MS);
    const framesBeforeConsent = bot.frames.length;

    const consentAt = performance.now();
    await roomService.updateParticipant(roomName, PERSON, { attributes: AgentVisionAttributes(true) });
    const { loopP99Ms, crashAt } = await runWindow(encodeWorkers);
    const windowEnd = performance.now();
    const telemetry = await readTelemetry(bot.client);

    const optOutAt = performance.now();
    await roomService.updateParticipant(roomName, PERSON, { attributes: AgentVisionAttributes(false) });
    const optOutAckAt = performance.now();
    await sleep(SETTLE_MS);

    const firstFrame = bot.frames.find((f) => f.at >= consentAt);
    const lastFrame = bot.frames[bot.frames.length - 1];
    const frameAfterCrash = crashAt === undefined ? undefined : bot.frames.find((f) => f.at > crashAt);
    const result = {
        framesBeforeConsent,
        firstFrameMs: firstFrame ? firstFrame.at - consentAt : undefined,
        window: summarizeWindow(bot.frames, firstFrame?.at ?? consentAt, windowEnd),
        baselineLoopP99Ms,
        loopP99Ms,
        telemetry,
        crashAtMs: crashAt === undefined ? undefined : crashAt - consentAt,
        nextFrameAfterCrashMs: frameAfterCrash ? frameAfterCrash.at - crashAt : undefined,
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

/** The crash phase's line: when the encode worker was killed and how long until the next frame, or why it did not run. */
function crashSummary(r) {
    if (!CAN_CRASH_ENCODER) {
        return 'skipped: needs VISION_ENCODER=worker without VISION_WORKER_MEDIA';
    }
    if (r.crashAtMs === undefined) {
        return 'skipped: no encode worker was running halfway through the window';
    }
    return `killed ${fmtMs(r.crashAtMs)} after consent; next frame ${fmtMs(r.nextFrameAfterCrashMs)} later`;
}

function report(r) {
    const t = r.telemetry;
    const v = t.video;
    const w = r.window;
    console.log(`\nmode                                        : encoder=${ENCODER}, room on the ${WORKER_MEDIA ? 'media worker' : 'main thread'}`);
    console.log(`frames before consent (expected 0)          : ${r.framesBeforeConsent}`);
    console.log(`consent -> first frame                      : ${fmtMs(r.firstFrameMs)}`);
    console.log(`frames in window                            : ${w.count} (${w.fps.toFixed(2)} fps; dims ${w.dims})`);
    console.log(`JPEG bytes min / mean / max                 : ${w.minBytes ?? 'n/a'} / ${w.meanBytes?.toFixed(0) ?? 'n/a'} / ${w.maxBytes ?? 'n/a'}`);
    console.log(`encoded on (client telemetry)               : ${v?.encoder ?? 'n/a'} (encode worker restarts: ${v?.encodeWorkerRestarts ?? 'n/a'})`);
    console.log(`encode ms last / max (thread that encoded)  : ${fmtMs(v?.encodeMsLast)} / ${fmtMs(v?.encodeMsMax)}`);
    console.log(`round trip ms last / max (room thread)      : ${fmtMs(v?.encodeRoundTripMsLast)} / ${fmtMs(v?.encodeRoundTripMsMax)}`);
    console.log(`dispatch ms max (room thread's own cost)    : ${fmtMs(v?.encodeDispatchMsMax)}`);
    console.log(
        `video counters                              : received=${v?.framesReceived ?? 'n/a'} sent=${v?.framesSent ?? 'n/a'} ` +
            `notDue=${v?.framesSkippedNotDue ?? 'n/a'} skippedEncoding=${v?.framesSkippedEncoding ?? 'n/a'} ` +
            `droppedAfterEncode=${v?.framesDroppedAfterEncode ?? 'n/a'} failures=${v?.encodeFailures ?? 'n/a'} ` +
            `inFlight=${v?.encodeInFlight ?? 'n/a'} queueDepth=${v?.encodeQueueDepth ?? 'n/a'} bytes=${v?.bytesSent ?? 'n/a'} selected=${v?.selectedSources ?? 'n/a'}`,
    );
    const clientMainP99 = WORKER_MEDIA ? t.mainEventLoopDelayP99Ms : t.eventLoopDelayP99Ms;
    console.log(`main event-loop p99 baseline / window       : ${fmtMs(r.baselineLoopP99Ms)} / ${fmtMs(r.loopP99Ms)} (client telemetry: ${fmtMs(clientMainP99)})`);
    if (WORKER_MEDIA) {
        console.log(`media worker loop p99 / underruns / pacer   : ${fmtMs(t.workerEventLoopDelayP99Ms)} / ${t.outbound?.underrunCount ?? 'n/a'} / ${fmtMs(t.pacerQueuedMs)}`);
    }
    if (CRASH_ENCODER) {
        console.log(`encode worker killed                        : ${crashSummary(r)}`);
    }
    console.log(`opt-out request -> server ack               : ${fmtMs(r.optOutAckMs)}`);
    console.log(`opt-out request -> last frame               : ${r.lastFrameAfterOptOutMs === undefined || r.lastFrameAfterOptOutMs < 0 ? 'no frame after the request' : fmtMs(r.lastFrameAfterOptOutMs)} (frames after: ${r.framesAfterOptOut})`);
    console.log(`opt-out request -> source reported ended    : ${fmtMs(r.endedAfterOptOutMs)} ${r.ended.length ? JSON.stringify(r.ended.map(({ at, ...rest }) => rest)) : ''}`);
}

// ── switch scenario ─────────────────────────────────────────────────────────────

/** Publishes a synthetic camera or screen share on `room`, paced in real time; returns its sid and a stop function. */
async function publishSyntheticVideo(rtc, room, kind) {
    const source = new rtc.VideoSource(WIDTH, HEIGHT);
    const track = rtc.LocalVideoTrack.createVideoTrack(kind, source);
    const trackSource = kind === 'screen' ? rtc.TrackSource.SOURCE_SCREENSHARE : rtc.TrackSource.SOURCE_CAMERA;
    const publication = await room.localParticipant.publishTrack(track, new rtc.TrackPublishOptions({ source: trackSource }));
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
        sid: publication.sid,
        async stop() {
            running = false;
            await bounded(`${kind} pump`, pump);
            void track;
        },
    };
}

/** One 10 ms frame of a 440 Hz tone (loud enough to lead the speaker list), or of silence. */
function micFrame(rtc, k, loud) {
    const samples = new Int16Array(MIC_FRAME_SAMPLES);
    if (loud) {
        for (let i = 0; i < samples.length; i++) {
            samples[i] = Math.round(0.3 * 32767 * Math.sin((2 * Math.PI * 440 * (k * MIC_FRAME_SAMPLES + i)) / MIC_RATE));
        }
    }
    return new rtc.AudioFrame(samples, MIC_RATE, 1, MIC_FRAME_SAMPLES);
}

/** Publishes a microphone that sends silence until `talking` is set, paced in real time. */
async function publishMicrophone(rtc, room) {
    const source = new rtc.AudioSource(MIC_RATE, 1);
    const track = rtc.LocalAudioTrack.createAudioTrack('microphone', source);
    await room.localParticipant.publishTrack(track, new rtc.TrackPublishOptions({ source: rtc.TrackSource.SOURCE_MICROPHONE }));
    const mic = { talking: false, running: true };
    const pump = (async () => {
        const t0 = performance.now();
        for (let k = 0; mic.running; k++) {
            await source.captureFrame(micFrame(rtc, k, mic.talking));
            const wait = t0 + (k + 1) * 10 - performance.now();
            if (wait > 0) await sleep(wait);
        }
    })();
    mic.stop = async () => {
        mic.running = false;
        await bounded('microphone pump', pump);
        void track;
    };
    return mic;
}

/**
 * A person in the switch scenario: a camera, optionally a microphone, and a screen they can start and stop sharing. The
 * observer subscribes to everyone: LiveKit appears to send a participant only the speakers it subscribes to (run 1's
 * observer, subscribed to nobody, got no update while the bot got six), so speaker updates are read there.
 */
async function startSwitchPerson(rtc, roomName, identity, name, withMicrophone, observer = false) {
    const room = new rtc.Room();
    await room.connect(LIVEKIT_URL, await mintToken(roomName, identity, name), { autoSubscribe: observer, dynacast: false });
    const camera = await publishSyntheticVideo(rtc, room, 'camera');
    const mic = withMicrophone ? await publishMicrophone(rtc, room) : undefined;
    let screen;
    return {
        room,
        mic,
        async startScreen() {
            screen = await publishSyntheticVideo(rtc, room, 'screen');
        },
        async stopScreen() {
            if (screen) {
                await screen.stop();
                await room.localParticipant.unpublishTrack(screen.sid);
                screen = undefined;
            }
        },
        async stop() {
            await this.stopScreen();
            await mic?.stop();
            await camera.stop();
            await room.disconnect();
        },
    };
}

/** Records every active-speaker update a room receives: when, and who (in LiveKit's order). */
function recordSpeakerUpdates(rtc, room) {
    const updates = [];
    room.on(rtc.RoomEvent.ActiveSpeakersChanged, (speakers) => updates.push({ at: performance.now(), who: speakers.map((p) => p.identity) }));
    return updates;
}

/** Feeds the bot's own voice track a tone for `ms`, at the client's default outbound rate (24 kHz, 20 ms frames). */
async function botTalks(client, ms) {
    const rate = 24000;
    const perFrame = 480;
    const t0 = performance.now();
    for (let k = 0; performance.now() - t0 < ms; k++) {
        const pcm = new Int16Array(perFrame);
        for (let i = 0; i < perFrame; i++) {
            pcm[i] = Math.round(0.3 * 32767 * Math.sin((2 * Math.PI * 330 * (k * perFrame + i)) / rate));
        }
        client.publishAudio(pcm.buffer);
        const wait = t0 + (k + 1) * 20 - performance.now();
        if (wait > 0) await sleep(wait);
    }
}

/** The phases of the switch scenario; returns when each started (performance.now()). */
async function runSwitchPhases(roomService, roomName, bob, bot) {
    const marks = { consent: performance.now() };
    await roomService.updateParticipant(roomName, ADA, { attributes: AgentVisionAttributes(true) });
    await roomService.updateParticipant(roomName, BOB, { attributes: AgentVisionAttributes(true) });
    await sleep(6000);
    marks.bobTalks = performance.now();
    bob.mic.talking = true;
    await sleep(8000);
    bob.mic.talking = false;
    marks.bobShares = performance.now();
    await bob.startScreen();
    await sleep(6000);
    marks.botTalks = performance.now();
    await botTalks(bot.client, 3000);
    await sleep(1000);
    marks.bobStopsSharing = performance.now();
    await bob.stopScreen();
    await sleep(6000);
    marks.end = performance.now();
    return marks;
}

async function runSwitch() {
    const rtc = await DefaultRtcNodeLoader();
    const roomName = `vision-switch-${Date.now()}`;
    const roomService = new RoomServiceClient(serverApiHost(LIVEKIT_URL), LIVEKIT_KEY, LIVEKIT_SECRET);
    console.log(`Agent vision switch check  server=${LIVEKIT_URL}  ${WIDTH}x${HEIGHT}@${FPS}fps  rate=${RATE}fps  encoder=${ENCODER}  room on the ${WORKER_MEDIA ? 'media worker' : 'main thread'}`);
    const ada = await startSwitchPerson(rtc, roomName, ADA, 'Ada', false, true);
    const bob = await startSwitchPerson(rtc, roomName, BOB, 'Bob', true);
    const speakerUpdates = recordSpeakerUpdates(rtc, ada.room);
    const bot = await startBot(roomName);
    await sleep(1000);
    const marks = await runSwitchPhases(roomService, roomName, bob, bot);
    const telemetry = await readTelemetry(bot.client);
    await bounded('bot disconnect', bot.client.disconnect());
    await bounded('bob stop', bob.stop());
    await bounded('ada stop', ada.stop());
    return { marks, frames: bot.frames, ended: bot.ended, speakerUpdates, telemetry };
}

/** Runs of consecutive frames from one source: who, which kind, first and last frame, and how many. */
function sourceRuns(frames) {
    const runs = [];
    for (const f of frames) {
        const label = `${f.who} ${f.source}`;
        const last = runs[runs.length - 1];
        if (last && last.label === label) {
            last.lastAt = f.at;
            last.count++;
        } else {
            runs.push({ label, firstAt: f.at, lastAt: f.at, count: 1 });
        }
    }
    return runs;
}

/** The interval between speaker updates while Bob talked, as min / median / max. */
function speakerCadence(updates, fromMs, toMs) {
    const times = updates.filter((u) => u.at >= fromMs && u.at < toMs).map((u) => u.at);
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    if (gaps.length === 0) return `${times.length} update(s), no interval`;
    return `${times.length} updates, interval min ${fmtMs(gaps[0])} / median ${fmtMs(gaps[Math.floor(gaps.length / 2)])} / max ${fmtMs(gaps[gaps.length - 1])}`;
}

/** The first frame of a source after a moment, as "label at +Xms". */
function firstFrameAfter(frames, fromMs, who, source) {
    const f = frames.find((x) => x.at >= fromMs && x.who === who && x.source === source);
    return f ? `+${fmtMs(f.at - fromMs)}` : 'never';
}

function reportSwitch(r) {
    const m = r.marks;
    const rel = (t) => `${((t - m.consent) / 1000).toFixed(2)}s`;
    console.log('\nsources read (relative to consent):');
    let previous;
    for (const run of sourceRuns(r.frames)) {
        const gap = previous ? `; gap since ${previous.label}'s last frame ${fmtMs(run.firstAt - previous.lastAt)}` : '';
        console.log(`  ${run.label.padEnd(18)} ${rel(run.firstAt)} -> ${rel(run.lastAt)}  (${run.count} frames${gap})`);
        previous = run;
    }
    console.log(`\nBob starts talking -> Bob's camera first frame   : ${firstFrameAfter(r.frames, m.bobTalks, BOB, 'camera')}`);
    console.log(`Bob shares a screen -> Bob's screen first frame   : ${firstFrameAfter(r.frames, m.bobShares, BOB, 'screen')}`);
    const duringBot = r.frames.filter((f) => f.at >= m.botTalks && f.at < m.bobStopsSharing).map((f) => `${f.who} ${f.source}`);
    console.log(`while the bot talks, sources read (expect Bob's screen only): ${[...new Set(duringBot)].join(', ') || 'none'}`);
    console.log(`Bob stops sharing -> Bob's camera first frame     : ${firstFrameAfter(r.frames, m.bobStopsSharing, BOB, 'camera')}`);
    console.log(`\nspeaker updates (Ada's room), while Bob talked  : ${speakerCadence(r.speakerUpdates, m.bobTalks, m.bobShares)}`);
    const multi = r.speakerUpdates.filter((u) => u.who.length > 1).slice(0, 5).map((u) => `[${u.who.join(', ')}]`);
    console.log(`updates naming several speakers (first 5)      : ${multi.join(' ') || 'none'}`);
    console.log(`the bot appeared in an update                  : ${r.speakerUpdates.some((u) => u.who.includes(BOT)) ? 'yes' : 'no'}`);
    const v = r.telemetry.video;
    console.log(
        `bot telemetry                                  : sourceSwitches=${v?.sourceSwitches ?? 'n/a'} switchesHeld=${v?.switchesHeld ?? 'n/a'} ` +
            `activeSpeakerUpdates=${v?.activeSpeakerUpdates ?? 'n/a'} switchGapMs last/max=${fmtMs(v?.switchGapMsLast)} / ${fmtMs(v?.switchGapMsMax)}`,
    );
    console.log(`ended sources reported                         : ${r.ended.map((e) => `${e.participantIdentity} ${e.source} at ${rel(e.at)}`).join(', ') || 'none'}`);
}

try {
    if (SCENARIO === 'switch') {
        reportSwitch(await runSwitch());
    } else {
        report(await run());
    }
    process.exit(0);
} catch (err) {
    console.error(`[vision] run failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
}
