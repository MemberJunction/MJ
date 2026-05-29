/**
 * Regression test for the VAD/STT frame-sharing bug.
 *
 * The bug: transports back `AudioFramesIn` with a single-consumer queue, so
 * CascadedChannelEngine's VAD and per-turn STT pipelines were racing for
 * frames — whichever pulled first got the frame, the other got nothing. Result:
 * either VAD never detected turn-end (agent never spoke) or STT got no audio
 * (empty transcript).
 *
 * Fix: `AudioFrameBus` subscribes once to the transport iterable and
 * multicasts every frame to all active subscribers.
 *
 * This test mocks the transport's single-consumer iterable, pumps frames into
 * the bus, runs two concurrent subscribers (mimicking VAD + STT), and asserts
 * both received every frame.
 */
import { describe, it, expect } from 'vitest';
import type { AudioFrame } from '@memberjunction/ai';
import { AudioFrameBus } from '../engines/AudioFrameBus';

/**
 * Minimal stand-in for a transport's single-consumer `AsyncQueue<AudioFrame>`
 * — same observable behavior: pushes go to the waiting consumer if any, else
 * queue; only ONE consumer can drain it.
 */
class SingleConsumerFrameSource implements AsyncIterable<AudioFrame> {
    private items: AudioFrame[] = [];
    private waiters: Array<(value: IteratorResult<AudioFrame>) => void> = [];
    private closed = false;

    public Push(frame: AudioFrame): void {
        if (this.closed) return;
        const w = this.waiters.shift();
        if (w) {
            w({ value: frame, done: false });
        } else {
            this.items.push(frame);
        }
    }

    public Close(): void {
        if (this.closed) return;
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) w({ value: undefined as never, done: true });
        }
    }

    public [Symbol.asyncIterator](): AsyncIterator<AudioFrame> {
        const self = this;
        return {
            next(): Promise<IteratorResult<AudioFrame>> {
                if (self.items.length > 0) {
                    return Promise.resolve({ value: self.items.shift() as AudioFrame, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise((resolve) => self.waiters.push(resolve));
            },
        };
    }
}

function makeFrame(seq: number): AudioFrame {
    const data = new Uint8Array(2);
    data[0] = seq & 0xff;
    data[1] = (seq >> 8) & 0xff;
    return {
        data,
        sampleRateHz: 16000,
        channelCount: 1,
        mediaType: 'audio/pcm',
    };
}

function frameSeq(f: AudioFrame): number {
    return f.data[0] | (f.data[1] << 8);
}

async function collect(
    iter: AsyncIterable<AudioFrame>,
    count: number
): Promise<number[]> {
    const seqs: number[] = [];
    for await (const f of iter) {
        seqs.push(frameSeq(f));
        if (seqs.length >= count) break;
    }
    return seqs;
}

describe('AudioFrameBus', () => {
    it('delivers every frame to both concurrent subscribers', async () => {
        const source = new SingleConsumerFrameSource();
        const bus = new AudioFrameBus();

        // Subscribe BEFORE pumping so both queues see frames from frame #0.
        const vadSub = bus.Subscribe();
        const sttSub = bus.Subscribe();

        const pumpDone = bus.PumpFrom(source);

        // Two concurrent consumers — mimics VAD pipeline + per-turn STT.
        const vadCollect = collect(vadSub, 10);
        const sttCollect = collect(sttSub, 10);

        // Push frames after consumers are awaiting.
        for (let i = 0; i < 10; i++) {
            source.Push(makeFrame(i));
        }

        const [vadFrames, sttFrames] = await Promise.all([vadCollect, sttCollect]);

        expect(vadFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(sttFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

        vadSub.Unsubscribe();
        sttSub.Unsubscribe();
        bus.Close();
        source.Close();
        await pumpDone;
    });

    it('only delivers frames pushed after Subscribe() — no replay', async () => {
        const source = new SingleConsumerFrameSource();
        const bus = new AudioFrameBus();

        const early = bus.Subscribe();
        const pumpDone = bus.PumpFrom(source);

        // Push 3 frames before the late subscriber joins.
        source.Push(makeFrame(0));
        source.Push(makeFrame(1));
        source.Push(makeFrame(2));

        // Give the pump a tick to drain those into `early`.
        const earlyFirst3 = await collect(early, 3);
        expect(earlyFirst3).toEqual([0, 1, 2]);

        // Late subscriber should NOT see the backlog.
        const late = bus.Subscribe();
        source.Push(makeFrame(3));
        source.Push(makeFrame(4));

        const [earlyTail, lateAll] = await Promise.all([
            collect(early, 2),
            collect(late, 2),
        ]);

        expect(earlyTail).toEqual([3, 4]);
        expect(lateAll).toEqual([3, 4]);

        early.Unsubscribe();
        late.Unsubscribe();
        bus.Close();
        source.Close();
        await pumpDone;
    });

    it('Unsubscribe() ends iteration on that subscription only', async () => {
        const source = new SingleConsumerFrameSource();
        const bus = new AudioFrameBus();

        const keep = bus.Subscribe();
        const drop = bus.Subscribe();
        const pumpDone = bus.PumpFrom(source);

        source.Push(makeFrame(0));
        // Pull one from each so the queues are empty.
        const keepIter = keep[Symbol.asyncIterator]();
        const dropIter = drop[Symbol.asyncIterator]();
        const k0 = await keepIter.next();
        const d0 = await dropIter.next();
        expect(frameSeq(k0.value)).toBe(0);
        expect(frameSeq(d0.value)).toBe(0);

        drop.Unsubscribe();
        // Subsequent next() on dropped subscription should be done.
        const dEnd = await dropIter.next();
        expect(dEnd.done).toBe(true);

        // `keep` still receives new frames.
        source.Push(makeFrame(1));
        const k1 = await keepIter.next();
        expect(frameSeq(k1.value)).toBe(1);

        keep.Unsubscribe();
        bus.Close();
        source.Close();
        await pumpDone;
    });
});
