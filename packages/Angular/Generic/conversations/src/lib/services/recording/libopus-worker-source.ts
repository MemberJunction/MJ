/** Messages the main thread posts to the libopus Worker. */
export type OpusWorkerRequest =
    | { type: 'init'; wasm: ArrayBuffer }
    | { type: 'encode'; pcm: Float32Array }
    | { type: 'flush'; id: number };

/** Messages the libopus Worker posts back. */
export type OpusWorkerReply =
    | { type: 'ready' }
    | { type: 'packets'; packets: ArrayBuffer[] }
    | { type: 'flushed'; id: number }
    | { type: 'error'; message: string };

/**
 * JavaScript source of the libopus encoder Worker, started from a Blob URL.
 *
 * Why a source string: an Angular library cannot reliably ship a separate worker file that every
 * host app's bundler would pick up, so — like the recorder's AudioWorklet processor — the worker is
 * plain JS with no imports, built into a Blob at runtime. The wasm bytes arrive in the `init`
 * message rather than being fetched, for the same reason.
 *
 * What it does: instantiates libopus (only stub WASI/env imports are needed), creates one encoder
 * (48 kHz mono, OPUS_APPLICATION_VOIP = 2048, OPUS_SET_BITRATE = 4002 → 32 kbps), collects incoming
 * Float32 samples into 960-sample (20 ms) frames, converts each to int16 and encodes it, and posts
 * the packets back (buffers transferred). `flush` pads a pending partial frame with silence, encodes
 * it, and answers `flushed` with the request's id. Messages that arrive while the module is still
 * instantiating are queued and handled in order. After a fault, input is dropped and `flush` still
 * answers, so the main thread never waits on a dead encoder. Typed-array views over wasm memory are
 * re-created for every frame because memory may grow (and detach old views) on any allocation.
 *
 * It references `self` only, so tests can run it in Node with a fake `self`.
 */
export const LIBOPUS_WORKER_SOURCE = `
'use strict';
var FRAME_SAMPLES = 960;
var MAX_PACKET_BYTES = 4000;
var SAMPLE_RATE = 48000;
var OPUS_APPLICATION_VOIP = 2048;
var OPUS_SET_BITRATE = 4002;
var BITRATE = 32000;

var wasm = null;
var encoder = 0;
var pcmPtr = 0;
var outPtr = 0;
var frame = new Float32Array(FRAME_SAMPLES);
var filled = 0;
var queue = [];
var failed = false;

function describe(error) {
    return error && error.message ? error.message : String(error);
}

function fail(message) {
    failed = true;
    self.postMessage({ type: 'error', message: message });
}

function postPackets(packets) {
    if (packets.length > 0) {
        self.postMessage({ type: 'packets', packets: packets }, packets);
    }
}

function encodeFrame(packets) {
    var view = new Int16Array(wasm.memory.buffer, pcmPtr, FRAME_SAMPLES);
    for (var i = 0; i < FRAME_SAMPLES; i++) {
        var s = frame[i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        view[i] = s < 0 ? s * 32768 : s * 32767;
    }
    var length = wasm.opus_encode(encoder, pcmPtr, FRAME_SAMPLES, outPtr, MAX_PACKET_BYTES);
    if (length < 0) {
        throw new Error('opus_encode returned ' + length);
    }
    packets.push(new Uint8Array(wasm.memory.buffer, outPtr, length).slice().buffer);
}

function encode(pcm) {
    var packets = [];
    var offset = 0;
    while (offset < pcm.length) {
        var take = Math.min(FRAME_SAMPLES - filled, pcm.length - offset);
        frame.set(pcm.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === FRAME_SAMPLES) {
            encodeFrame(packets);
            filled = 0;
        }
    }
    postPackets(packets);
}

function flush(id) {
    var packets = [];
    if (filled > 0) {
        frame.fill(0, filled);
        encodeFrame(packets);
        filled = 0;
    }
    postPackets(packets);
    self.postMessage({ type: 'flushed', id: id });
}

function handle(message) {
    if (failed) {
        if (message.type === 'flush') {
            self.postMessage({ type: 'flushed', id: message.id });
        }
        return;
    }
    try {
        if (message.type === 'encode') {
            encode(message.pcm);
        } else if (message.type === 'flush') {
            flush(message.id);
        }
    } catch (error) {
        fail('libopus ' + message.type + ' failed: ' + describe(error));
        if (message.type === 'flush') {
            self.postMessage({ type: 'flushed', id: message.id });
        }
    }
}

function drainQueue() {
    var pending = queue;
    queue = [];
    for (var i = 0; i < pending.length; i++) {
        handle(pending[i]);
    }
}

function init(bytes) {
    var imports = {
        wasi_snapshot_preview1: {
            fd_seek: function () { return 0; },
            fd_write: function () { return 0; },
            fd_close: function () { return 0; },
            proc_exit: function () {}
        },
        // Views are re-created per frame, so there is nothing to refresh when memory grows.
        env: { emscripten_notify_memory_growth: function () {} }
    };
    WebAssembly.instantiate(bytes, imports).then(function (result) {
        var exports = result.instance.exports;
        var state = exports.malloc(exports.opus_encoder_get_size(1));
        var rc = exports.opus_encoder_init(state, SAMPLE_RATE, 1, OPUS_APPLICATION_VOIP);
        if (rc !== 0) {
            throw new Error('opus_encoder_init returned ' + rc);
        }
        rc = exports.opus_encoder_ctl_set(state, OPUS_SET_BITRATE, BITRATE);
        if (rc !== 0) {
            throw new Error('opus_encoder_ctl_set(OPUS_SET_BITRATE) returned ' + rc);
        }
        wasm = exports;
        encoder = state;
        pcmPtr = exports.malloc(FRAME_SAMPLES * 2);
        outPtr = exports.malloc(MAX_PACKET_BYTES);
        self.postMessage({ type: 'ready' });
        drainQueue();
    }).catch(function (error) {
        fail('libopus init failed: ' + describe(error));
        drainQueue();
    });
}

self.onmessage = function (event) {
    var message = event.data;
    if (message.type === 'init') {
        init(message.wasm);
        return;
    }
    if (!wasm && !failed) {
        queue.push(message);
        return;
    }
    handle(message);
};
`;
