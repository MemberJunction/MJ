import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GEMINI_AVATAR_MP4_TYPE, IsMp4InitSegment, VideoPlayout, type VideoPlayoutProblem } from '../media/videoPlayout';
import { AttachVideoSource } from '../media/attachVideoSource';
import { InstallFakeDom, type FakeDom } from './helpers/fake-dom';
import { FakeFragment, FakeInitSegment, FakeMediaSource, FakeTimeRanges, InstallFakeMse, type FakeSourceBuffer } from './helpers/fake-mse';
import { AvatarFragment, AvatarInitSegment, VIDEO_ONLY_MP4_TYPE } from './helpers/fmp4-pieces';

/** Lets the fake source buffer finish its pending operations. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe('VideoPlayout', () => {
    let dom: FakeDom;
    let video: HTMLVideoElement;
    let playout: VideoPlayout;
    let problems: VideoPlayoutProblem[];

    beforeEach(() => {
        dom = InstallFakeDom();
        InstallFakeMse();
        video = document.createElement('video');
        playout = new VideoPlayout();
        problems = [];
        playout.OnProblem((problem) => problems.push(problem));
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        playout.Dispose();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** Attaches the player and opens its media source, as a browser does once the element loads the URL. */
    function attachAndOpen(): FakeSourceBuffer {
        AttachVideoSource(playout.Source, video);
        const source = FakeMediaSource.Instances.at(-1);
        source?.Open();
        const buffer = source?.Buffers[0];
        if (!buffer) {
            throw new Error('No source buffer was opened.');
        }
        return buffer;
    }

    describe('support', () => {
        it('uses MediaSource where it exists', () => {
            expect(VideoPlayout.IsSupported()).toBe(true);
            FakeMediaSource.Supported = false;
            expect(VideoPlayout.IsSupported()).toBe(false);
        });

        it("uses ManagedMediaSource on iOS Safari, with remote playback off as it requires", () => {
            vi.unstubAllGlobals();
            InstallFakeMse({ Managed: true });
            expect(VideoPlayout.IsSupported()).toBe(true);
            attachAndOpen();
            expect(dom.Videos[0].disableRemotePlayback).toBe(true);
        });

        it('reports unsupported and leaves the element alone when the type cannot play', () => {
            FakeMediaSource.Supported = false;
            AttachVideoSource(playout.Source, video);
            expect(problems).toEqual(['unsupported']);
            expect(dom.Videos[0].src).toBe('');
        });

        it('recognizes an init segment by its first box', () => {
            expect(IsMp4InitSegment(FakeInitSegment())).toBe(true);
            expect(IsMp4InitSegment(FakeFragment())).toBe(false);
            expect(IsMp4InitSegment(new ArrayBuffer(4))).toBe(false);
        });
    });

    describe('appending', () => {
        it('plays the element from the media source, unmuted: the video carries the voice', () => {
            attachAndOpen();
            expect(dom.Videos[0]).toMatchObject({ src: 'blob:fake/1', muted: false, Paused: false });
        });

        it('opens the source buffer for the avatar type, in sequence mode', () => {
            const buffer = attachAndOpen();
            expect(buffer.Type).toBe(GEMINI_AVATAR_MP4_TYPE);
            expect(buffer.mode).toBe('sequence');
        });

        it('appends pieces that arrived before the element, in order, one at a time', async () => {
            const init = FakeInitSegment();
            const first = FakeFragment();
            const second = FakeFragment();
            playout.Append(init);
            playout.Append(first);
            playout.Append(second);
            const buffer = attachAndOpen();
            expect(buffer.Appended).toEqual([init]);

            await settle();
            expect(buffer.Appended).toEqual([init, first, second]);
        });

        it('drops a fragment that arrives before any init segment, and reports it once', async () => {
            const buffer = attachAndOpen();
            playout.Append(FakeFragment());
            playout.Append(FakeFragment());
            await settle();
            expect(buffer.Appended).toHaveLength(0);
            expect(problems).toEqual(['fragment-before-init']);
        });

        it("appends a new turn's init segment and keeps going", async () => {
            const buffer = attachAndOpen();
            const pieces = [FakeInitSegment(), FakeFragment(), FakeInitSegment(), FakeFragment()];
            pieces.forEach((piece) => playout.Append(piece));
            await settle();
            expect(buffer.Appended).toEqual(pieces);
        });

        it('replays the latest init segment first when the player moves to another element', async () => {
            const init = FakeInitSegment();
            playout.Append(init);
            playout.Append(FakeFragment());
            attachAndOpen();
            await settle();

            const later = FakeFragment();
            const next = attachAndOpen();
            playout.Append(later);
            await settle();
            expect(next.Appended).toEqual([init, later]);
        });
    });

    describe('the voice', () => {
        it('unmutes the element it takes over, even one the host muted: the video carries the voice', () => {
            video.muted = true;
            attachAndOpen();
            expect(dom.Videos[0].muted).toBe(false);
        });

        it('mutes the element when the voice plays elsewhere', () => {
            playout.Dispose();
            playout = new VideoPlayout({ CarriesVoice: false });
            expect(playout.CarriesVoice).toBe(false);
            attachAndOpen();
            expect(dom.Videos[0].muted).toBe(true);
        });

        it('CarriesVoice switches an attached element at once, and the next element follows it', () => {
            attachAndOpen();
            playout.CarriesVoice = false;
            expect(dom.Videos[0].muted).toBe(true);

            AttachVideoSource(playout.Source, document.createElement('video'));
            expect(dom.Videos[1].muted).toBe(true);
            playout.CarriesVoice = true;
            expect(dom.Videos[1].muted).toBe(false);
        });
    });

    describe('OnElementAttached', () => {
        it('hands over each element the player takes over, once, before it plays', () => {
            const seen: Array<{ Element: HTMLVideoElement; PausedThen: boolean }> = [];
            playout.Dispose();
            playout = new VideoPlayout({ OnElementAttached: (element) => seen.push({ Element: element, PausedThen: element.paused }) });
            attachAndOpen();
            AttachVideoSource(playout.Source, document.createElement('video'));
            expect(seen).toEqual([
                { Element: dom.Videos[0], PausedThen: true },
                { Element: dom.Videos[1], PausedThen: true },
            ]);
        });

        it('logs a hook that throws, and the element still plays', () => {
            playout.Dispose();
            playout = new VideoPlayout({
                OnElementAttached: () => {
                    throw new Error('no graph');
                },
            });
            attachAndOpen();
            expect(dom.Videos[0].Paused).toBe(false);
            expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes('no graph'))).toBe(true);
        });
    });

    describe('codecs from the init segment', () => {
        it('opens the source buffer with the codecs of an init that arrived first', () => {
            playout.Append(AvatarInitSegment(false));
            expect(attachAndOpen().Type).toBe(VIDEO_ONLY_MP4_TYPE);
        });

        it("opens with MimeType when the init's codecs are not playable here", () => {
            FakeMediaSource.UnsupportedTypes.add(VIDEO_ONLY_MP4_TYPE);
            playout.Append(AvatarInitSegment(false));
            expect(attachAndOpen().Type).toBe(GEMINI_AVATAR_MP4_TYPE);
        });

        it("switches the buffer to an init's codecs before appending it, when they differ, once", async () => {
            const buffer = attachAndOpen();
            playout.Append(AvatarInitSegment(false));
            playout.Append(AvatarFragment());
            playout.Append(AvatarInitSegment(false));
            await settle();
            expect(buffer.TypeChanges).toEqual([{ Type: VIDEO_ONLY_MP4_TYPE, AfterAppends: 0 }]);
            expect(buffer.Appended).toHaveLength(3);
        });

        it('keeps the type for an init with the same codecs, or one it cannot read', async () => {
            const buffer = attachAndOpen();
            playout.Append(AvatarInitSegment(true));
            playout.Append(FakeInitSegment());
            await settle();
            expect(buffer.TypeChanges).toEqual([]);
        });

        it("keeps the type when the browser can't play the init's codecs", async () => {
            FakeMediaSource.UnsupportedTypes.add(VIDEO_ONLY_MP4_TYPE);
            const buffer = attachAndOpen();
            playout.Append(AvatarInitSegment(false));
            await settle();
            expect(buffer.TypeChanges).toEqual([]);
            expect(buffer.Appended).toHaveLength(1);
        });

        it("appends the init as it is in a browser that can't switch types", async () => {
            const buffer = attachAndOpen();
            Object.defineProperty(buffer, 'changeType', { value: undefined });
            playout.Append(AvatarInitSegment(false));
            await settle();
            expect(buffer.TypeChanges).toEqual([]);
            expect(buffer.Appended).toHaveLength(1);
        });
    });

    describe('IsPlaying', () => {
        it('is true while the element plays with media buffered ahead of the playhead', () => {
            const buffer = attachAndOpen();
            buffer.buffered = new FakeTimeRanges([[0, 5]]);
            dom.Videos[0].currentTime = 2;
            expect(playout.IsPlaying).toBe(true);

            dom.Videos[0].currentTime = 5;
            expect(playout.IsPlaying).toBe(false);
            dom.Videos[0].currentTime = 2;
            dom.Videos[0].pause();
            expect(playout.IsPlaying).toBe(false);
        });

        it('is false while the element waits for data, as it does just short of the end of a turn', () => {
            const buffer = attachAndOpen();
            buffer.buffered = new FakeTimeRanges([[0, 5.8]]);
            dom.Videos[0].currentTime = 5.74;
            dom.Videos[0].readyState = 2;
            expect(playout.IsPlaying).toBe(false);
        });
    });

    describe('EndOfTurn', () => {
        it('ends the stream once every pending piece is in, so playback runs to the true end', async () => {
            attachAndOpen();
            playout.Append(FakeInitSegment());
            playout.Append(FakeFragment());
            playout.EndOfTurn();
            const source = FakeMediaSource.Instances[0];
            expect(source.EndOfStreamCalls).toBe(0);

            await settle();
            expect(source.EndOfStreamCalls).toBe(1);
        });

        it('a piece of the next turn arriving first cancels the end', async () => {
            attachAndOpen();
            playout.Append(FakeInitSegment());
            playout.EndOfTurn();
            playout.Append(FakeFragment());
            await settle();
            expect(FakeMediaSource.Instances[0].EndOfStreamCalls).toBe(0);
        });

        it('the next turn plays on from where the ended one stopped, never from the start', async () => {
            const buffer = attachAndOpen();
            playout.Append(FakeInitSegment());
            await settle();
            const video = dom.Videos[0];
            video.currentTime = 5.9;
            video.pause();
            video.ended = true;
            const seeksBefore = video.Seeks;

            buffer.buffered = new FakeTimeRanges([[0, 7]]);
            playout.Append(FakeFragment());
            await settle();
            expect(video.Seeks).toBe(seeksBefore + 1);
            expect(video.currentTime).toBe(5.9);
            expect(video.Paused).toBe(false);
        });
    });

    describe('Flush (barge-in)', () => {
        it('pauses at once, and stays paused until media appended after the flush arrives', async () => {
            const buffer = attachAndOpen();
            playout.Append(FakeInitSegment());
            await settle();
            buffer.buffered = new FakeTimeRanges([[0, 8]]);
            dom.Videos[0].currentTime = 3;
            playout.Append(FakeFragment());

            playout.Flush();
            expect(dom.Videos[0].Paused).toBe(true);
            // The abort's own updateend arrives while the old media is still buffered ahead.
            await settle();
            expect(dom.Videos[0].Paused).toBe(true);

            buffer.buffered = new FakeTimeRanges([[0, 4]]);
            playout.Append(FakeFragment());
            await settle();
            expect(dom.Videos[0].Paused).toBe(false);
        });

        it('drops what has not played, and the next turn starts at the playhead', async () => {
            const buffer = attachAndOpen();
            playout.Append(FakeInitSegment());
            await settle();
            buffer.buffered = new FakeTimeRanges([[0, 8]]);
            dom.Videos[0].currentTime = 3;
            playout.Append(FakeFragment());

            playout.Flush();
            expect(buffer.Aborts).toBe(1);
            expect(buffer.Removed).toEqual([[3, Infinity]]);

            await settle();
            playout.Append(FakeFragment());
            await settle();
            expect(buffer.OffsetAtAppend.at(-1)).toBe(3);
        });

        it('drops pieces still waiting for an element', () => {
            playout.Append(FakeInitSegment());
            playout.Append(FakeFragment());
            playout.Flush();
            const buffer = attachAndOpen();
            // Only the remembered init segment is replayed; the fragment was flushed.
            expect(buffer.Appended).toHaveLength(1);
        });
    });

    describe('buffer space', () => {
        it('removes media more than the back buffer behind the playhead', async () => {
            const buffer = attachAndOpen();
            buffer.buffered = new FakeTimeRanges([[0, 35]]);
            dom.Videos[0].currentTime = 30;
            playout.Append(FakeInitSegment());
            await settle();
            expect(buffer.Removed).toEqual([[0, 20]]);
        });

        it('trims harder and retries once when the buffer is full', async () => {
            const buffer = attachAndOpen();
            buffer.buffered = new FakeTimeRanges([[25, 35]]);
            dom.Videos[0].currentTime = 30;
            const quota = new Error('full');
            quota.name = 'QuotaExceededError';
            buffer.AppendErrors.push(quota);

            const init = FakeInitSegment();
            playout.Append(init);
            expect(buffer.Removed).toEqual([[0, 28]]);
            await settle();
            expect(buffer.Appended).toEqual([init]);
            expect(problems).toEqual([]);
        });

        it('trims in steps as playback moves on, not after every piece', async () => {
            const buffer = attachAndOpen();
            buffer.buffered = new FakeTimeRanges([[0, 40]]);
            dom.Videos[0].currentTime = 30;
            playout.Append(FakeInitSegment());
            await settle();
            expect(buffer.Removed).toEqual([[0, 20]]);

            dom.Videos[0].currentTime = 32;
            playout.Append(FakeFragment());
            await settle();
            expect(buffer.Removed).toHaveLength(1);

            dom.Videos[0].currentTime = 36;
            playout.Append(FakeFragment());
            await settle();
            expect(buffer.Removed).toEqual([[0, 20], [0, 26]]);
        });

        it('never repeats a trim that did not shrink the buffer', async () => {
            const buffer = attachAndOpen();
            buffer.buffered = new FakeTimeRanges([[0, 35]]);
            dom.Videos[0].currentTime = 30;
            // A removal that leaves the range in place, as an odd browser might.
            buffer.remove = (start: number, end: number): void => {
                buffer.Removed.push([start, end]);
                buffer.updating = true;
                queueMicrotask(() => {
                    buffer.updating = false;
                    buffer.dispatchEvent(new Event('updateend'));
                });
            };
            playout.Append(FakeInitSegment());
            await settle();
            expect(buffer.Removed).toEqual([[0, 20]]);
        });

        it('drops a piece the browser rejects, reports it, and carries on', async () => {
            const buffer = attachAndOpen();
            buffer.AppendErrors.push(new Error('decode error'));
            const next = FakeFragment();
            playout.Append(FakeInitSegment());
            playout.Append(next);
            await settle();
            expect(problems).toEqual(['append-failed']);
            expect(buffer.Appended).toEqual([next]);
        });

        it('keeps the newest pieces when too many arrive with no element attached', () => {
            playout.Append(FakeInitSegment());
            for (let i = 0; i < 650; i++) {
                playout.Append(FakeFragment());
            }
            expect(problems).toEqual(['pending-overflow']);
        });
    });

    describe('detach and Dispose', () => {
        it('detach releases the element and the media source URL', () => {
            const detach = AttachVideoSource(playout.Source, video);
            detach();
            expect(dom.Videos[0]).toMatchObject({ src: '', Loads: 1 });
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
        });

        it('Dispose releases the element and ignores later pieces', async () => {
            const buffer = attachAndOpen();
            playout.Dispose();
            playout.Append(FakeInitSegment());
            await settle();
            expect(dom.Videos[0].src).toBe('');
            expect(buffer.Appended).toHaveLength(0);
        });

        it('a disposed player takes over no element, so none is routed or played', () => {
            const attached: HTMLVideoElement[] = [];
            playout.Dispose();
            playout = new VideoPlayout({ OnElementAttached: (element) => attached.push(element) });
            playout.Dispose();
            AttachVideoSource(playout.Source, video);
            expect(attached).toEqual([]);
            expect(dom.Videos[0]).toMatchObject({ src: '', Paused: true });
            expect(FakeMediaSource.Instances).toHaveLength(0);
        });
    });
});
