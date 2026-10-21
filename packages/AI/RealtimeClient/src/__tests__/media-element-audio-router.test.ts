import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaElementAudioRouter } from '../audio/mediaElementAudioRouter';
import { InstallFakeDom } from './helpers/fake-dom';
import { FakeWebAudioContext, InstallFakeWebAudio, ResetMediaElementAudioRouter } from './helpers/fake-web-audio';

describe('MediaElementAudioRouter', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ResetMediaElementAudioRouter();
        InstallFakeWebAudio();
        InstallFakeDom();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        ResetMediaElementAudioRouter();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('is one router per page', () => {
        expect(MediaElementAudioRouter.Instance).toBe(MediaElementAudioRouter.Instance);
    });

    it("routes an element's audio into a stream of the page's context, never to that context's speakers", () => {
        const element = document.createElement('video');
        const stream = MediaElementAudioRouter.Instance.StreamFor(element);

        const [context] = FakeWebAudioContext.Instances;
        expect(context.ElementSources.map((node) => node.From)).toEqual([element]);
        expect(context.ElementSources[0].Targets).toEqual([context.StreamDestinations[0]]);
        expect(stream).toBe(context.StreamDestinations[0].stream);
        expect(context.Gains).toEqual([]);
    });

    it('routes each element once: every later call returns the same stream, with no second source node', () => {
        const element = document.createElement('video');
        const first = MediaElementAudioRouter.Instance.StreamFor(element);
        const again = MediaElementAudioRouter.Instance.StreamFor(element);

        const [context] = FakeWebAudioContext.Instances;
        expect(again).toBe(first);
        expect(context.ElementSources).toHaveLength(1);
        expect(context.StreamDestinations).toHaveLength(1);
    });

    it('gives each element its own stream, all in one context', () => {
        const first = MediaElementAudioRouter.Instance.StreamFor(document.createElement('video'));
        const second = MediaElementAudioRouter.Instance.StreamFor(document.createElement('video'));
        expect(second).not.toBe(first);
        expect(FakeWebAudioContext.Instances).toHaveLength(1);
        expect(FakeWebAudioContext.Instances[0].ElementSources).toHaveLength(2);
    });

    it('creates its context on the first route, not before', () => {
        const router = MediaElementAudioRouter.Instance;
        expect(FakeWebAudioContext.Instances).toHaveLength(0);
        router.StreamFor(document.createElement('video'));
        expect(FakeWebAudioContext.Instances).toHaveLength(1);
        expect(FakeWebAudioContext.Instances[0].Options).toBeUndefined();
    });

    it('resumes its context whenever it finds it suspended, also for an element it already routed', () => {
        FakeWebAudioContext.StartState = 'suspended';
        const element = document.createElement('video');
        MediaElementAudioRouter.Instance.StreamFor(element);
        const [context] = FakeWebAudioContext.Instances;
        expect(context.ResumeCalls).toBe(1);

        MediaElementAudioRouter.Instance.StreamFor(element);
        expect(context.ResumeCalls).toBe(1);
        context.state = 'suspended';
        MediaElementAudioRouter.Instance.StreamFor(element);
        expect(context.ResumeCalls).toBe(2);
    });

    it('logs an element the browser refuses once, returns null for it, and never tries it again', () => {
        MediaElementAudioRouter.Instance.StreamFor(document.createElement('video'));
        const [context] = FakeWebAudioContext.Instances;
        context.RefuseElements = true;
        const attempts = vi.spyOn(context, 'createMediaElementSource');
        const refused = document.createElement('video');

        expect(() => MediaElementAudioRouter.Instance.StreamFor(refused)).not.toThrow();
        expect(MediaElementAudioRouter.Instance.StreamFor(refused)).toBeNull();
        expect(attempts).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('Could not route the media element');
    });

    it('without Web Audio: null for every element, said once', () => {
        FakeWebAudioContext.FailNext = true;
        expect(MediaElementAudioRouter.Instance.StreamFor(document.createElement('video'))).toBeNull();
        expect(MediaElementAudioRouter.Instance.StreamFor(document.createElement('video'))).toBeNull();
        expect(FakeWebAudioContext.Instances).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('Web Audio is not available');
    });
});
