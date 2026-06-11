import { encodeFloat32ToPcm16Base64 } from './pcmUtils';

/**
 * Handle returned by {@link createPcmMicCapture}: the only operation a driver needs is
 * teardown. Production wraps an `AudioContext` + `AudioWorkletNode` pipeline; tests return a
 * no-op fake.
 */
export interface IPcmMicCapture {
    /** Stops capture and releases the audio context / worklet resources. */
    Stop(): void;
}

/** Registration name for the inline mic-capture worklet processor. */
const CAPTURE_WORKLET_NAME = 'mj-realtime-pcm16-capture';

/**
 * Inline AudioWorklet processor source (loaded via a Blob URL so the package ships no asset
 * files). Runs inside the audio rendering thread: forwards each 128-frame mono input block to
 * the main thread as a copied `Float32Array`. PCM16 conversion + base64 encoding happen on the
 * main thread to keep the render-thread callback minimal.
 */
const CAPTURE_WORKLET_SOURCE = `
class MJRealtimePcm16Capture extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (channel && channel.length > 0) {
            this.port.postMessage(channel.slice(0));
        }
        return true;
    }
}
registerProcessor('${CAPTURE_WORKLET_NAME}', MJRealtimePcm16Capture);
`;

/** Loads the inline capture worklet module from a Blob URL (no asset files shipped). */
async function loadCaptureWorklet(context: AudioContext): Promise<void> {
    const blobUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
        await context.audioWorklet.addModule(blobUrl);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

/**
 * Builds the shared PCM16 mic-capture pipeline for client-owned realtime audio planes:
 * an `AudioContext` at the requested sample rate, the inline-Blob capture worklet, and a
 * zero-gain tail that keeps the graph pulled without audible monitoring. Each worklet block
 * is PCM16-encoded and handed to `onPcmChunk` as base64.
 *
 * Extracted from the Gemini client driver (which captured fixed at 16 kHz) and
 * sample-rate-parameterized so providers that negotiate the input format at session start
 * (e.g. ElevenLabs' `user_input_audio_format`) capture at the negotiated rate.
 *
 * @param micStream The caller-acquired microphone stream (the caller owns the permission UX).
 * @param sampleRate The PCM16 capture sample rate in Hz (16000 for Gemini Live and the
 *   ElevenLabs default).
 * @param onPcmChunk Invoked with each captured block as base64-encoded PCM16.
 */
export async function createPcmMicCapture(
    micStream: MediaStream,
    sampleRate: number,
    onPcmChunk: (base64Pcm16: string) => void
): Promise<IPcmMicCapture> {
    const context = new AudioContext({ sampleRate });
    await loadCaptureWorklet(context);
    const source = context.createMediaStreamSource(micStream);
    const worklet = new AudioWorkletNode(context, CAPTURE_WORKLET_NAME);
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        onPcmChunk(encodeFloat32ToPcm16Base64(event.data));
    };
    source.connect(worklet);
    const muteTail = context.createGain();
    muteTail.gain.value = 0;
    worklet.connect(muteTail).connect(context.destination);
    return {
        Stop: () => {
            worklet.port.onmessage = null;
            source.disconnect();
            worklet.disconnect();
            muteTail.disconnect();
            void context.close();
        },
    };
}
