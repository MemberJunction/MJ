import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AttachVideoSource } from '../media/attachVideoSource';
import type { MediaVideoSource } from '../media/model';
import { FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';
import { InstallFakeDom, type FakeDom } from './helpers/fake-dom';

describe('AttachVideoSource', () => {
    let dom: FakeDom;
    let video: HTMLVideoElement;

    beforeEach(() => {
        dom = InstallFakeDom();
        video = document.createElement('video');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('a stream source', () => {
        it('plays in the element, muted and inline', () => {
            const stream = new FakeMediaStream([new FakeTrack()]);
            AttachVideoSource({ Kind: 'stream', Stream: stream }, video);
            expect(dom.Videos[0]).toMatchObject({ srcObject: stream, muted: true, playsInline: true, autoplay: true, Paused: false });
        });

        it('detach empties the element, once, and leaves the tracks running', () => {
            const track = new FakeTrack();
            const detach = AttachVideoSource({ Kind: 'stream', Stream: new FakeMediaStream([track]) }, video);

            detach();
            expect(dom.Videos[0]).toMatchObject({ srcObject: null, Paused: true });
            dom.Videos[0].srcObject = new FakeMediaStream([]);
            detach();
            expect(dom.Videos[0].srcObject).not.toBeNull();
            expect(track.Stopped).toBe(false);
        });

        it('detach leaves the element alone once another source took it', () => {
            const detachFirst = AttachVideoSource({ Kind: 'stream', Stream: new FakeMediaStream([]) }, video);
            const second = new FakeMediaStream([]);
            AttachVideoSource({ Kind: 'stream', Stream: second }, video);

            detachFirst();
            expect(dom.Videos[0].srcObject).toBe(second);
        });
    });

    describe('an element source', () => {
        it('is handed the element and decides everything, including its audio', () => {
            const attach = vi.fn((_element: HTMLVideoElement) => () => undefined);
            const source: MediaVideoSource = { Kind: 'element', Attach: attach };

            AttachVideoSource(source, video);
            expect(attach).toHaveBeenCalledWith(video);
            expect(dom.Videos[0]).toMatchObject({ srcObject: null, muted: false });
        });

        it('detach calls the source\'s own detach once', () => {
            const detachSource = vi.fn();
            const detach = AttachVideoSource({ Kind: 'element', Attach: () => detachSource }, video);

            detach();
            detach();
            expect(detachSource).toHaveBeenCalledTimes(1);
        });
    });
});
