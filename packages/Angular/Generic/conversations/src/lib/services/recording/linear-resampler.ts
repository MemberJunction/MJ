/**
 * Streaming linear-interpolation resampler for mono Float32 PCM.
 *
 * The recorder asks the browser for a 48 kHz `AudioContext`; when a browser refuses that rate the
 * capture runs at the device rate (typically 44.1 kHz) and every captured frame passes through one
 * of these before it reaches the Opus encoder, which only takes 48 kHz.
 *
 * Why the arithmetic is all integers: the recording's timing is the 48 kHz sample count, so the
 * number of output samples must track `inputSamples × toRate / fromRate` exactly over a whole call,
 * not drift by a sample per frame. Output sample `k` sits at input position `k × from / to`
 * (with `from`/`to` reduced by their GCD); the resampler emits every `k` whose position has been
 * captured, so after `N` input samples it has emitted `floor((N − 1) × to / from) + 1`. That never
 * runs ahead of the ideal `N × to / from` and never lags it by more than one input-sample interval
 * (`to / from` output samples, ≈ 1.09 at 44.1 → 48 kHz) — the next output is waiting for the input
 * sample it interpolates towards — and the error never accumulates over a call. Positions stay
 * exact integers for over a month of continuous audio.
 *
 * Linear interpolation is deliberately simple: the signal is speech headed for a 32 kbps voice
 * codec, so a windowed-sinc filter would cost CPU on the audio thread for no audible gain.
 */
export class LinearResampler {
    /** Reduced input-rate term (`fromRate / gcd`). */
    private readonly from: number;
    /** Reduced output-rate term (`toRate / gcd`). */
    private readonly to: number;
    private readonly passthrough: boolean;
    /** Input samples consumed so far (absolute index of the next input sample). */
    private consumed = 0;
    /** Output samples emitted so far (index `k` of the next output sample). */
    private produced = 0;
    /** The previous block's last sample; the next output can sit between it and the new block. */
    private lastSample = 0;

    /**
     * @param fromRate capture rate in Hz (a positive integer, e.g. 44100)
     * @param toRate target rate in Hz (a positive integer, e.g. 48000)
     */
    constructor(fromRate: number, toRate: number) {
        if (!Number.isInteger(fromRate) || fromRate <= 0 || !Number.isInteger(toRate) || toRate <= 0) {
            throw new Error(`LinearResampler needs positive integer rates, got ${fromRate} → ${toRate}`);
        }
        const divisor = greatestCommonDivisor(fromRate, toRate);
        this.from = fromRate / divisor;
        this.to = toRate / divisor;
        this.passthrough = fromRate === toRate;
    }

    /**
     * Resamples the next block of the stream. Blocks may be any length (including 0); state carries
     * across calls, so a stream fed in uneven chunks yields the same samples as one fed whole.
     * On a passthrough resampler (equal rates) the input array itself is returned, not a copy.
     */
    public Process(input: Float32Array): Float32Array {
        if (this.passthrough || input.length === 0) {
            return this.passthrough ? input : new Float32Array(0);
        }
        const base = this.consumed;
        const total = base + input.length;
        // Last output index whose position k*from/to is <= total-1 (the newest captured sample).
        const lastIndex = Math.floor(((total - 1) * this.to) / this.from);
        const count = Math.max(0, lastIndex - this.produced + 1);
        const output = new Float32Array(count);
        for (let n = 0; n < count; n++) {
            const scaled = (this.produced + n) * this.from;
            const index = Math.floor(scaled / this.to);
            const remainder = scaled - index * this.to;
            const left = index < base ? this.lastSample : input[index - base];
            // remainder > 0 implies index < total-1, so index+1 is always captured.
            output[n] = remainder === 0 ? left : left + ((input[index + 1 - base] - left) * remainder) / this.to;
        }
        this.produced += count;
        this.consumed = total;
        this.lastSample = input[input.length - 1];
        return output;
    }
}

function greatestCommonDivisor(a: number, b: number): number {
    let x = a;
    let y = b;
    while (y !== 0) {
        const t = x % y;
        x = y;
        y = t;
    }
    return x;
}
