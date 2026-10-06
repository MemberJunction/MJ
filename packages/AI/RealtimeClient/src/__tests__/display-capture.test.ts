import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GetDisplayCaptureSupport, RequestDisplayCapture, type DisplayCapture, type DisplayCaptureResult } from '../media/displayCapture';
import { InstallFakeDom, type FakeDom } from './helpers/fake-dom';
import { InstallCaptureTargets, InstallFakeDisplayMedia, PickerError, type FakeDisplayMedia } from './helpers/fake-display';

/** The capture from a result that must have started. */
function startedCapture(result: DisplayCaptureResult): DisplayCapture {
    if (result.Status !== 'started') {
        throw new Error(`Expected a started capture, got ${JSON.stringify(result)}`);
    }
    return result.Capture;
}

describe('display capture', () => {
    let media: FakeDisplayMedia;
    let dom: FakeDom;

    beforeEach(() => {
        media = InstallFakeDisplayMedia();
        dom = InstallFakeDom();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('GetDisplayCaptureSupport', () => {
        it('reports nothing without getDisplayMedia (mobile browsers, Node)', () => {
            vi.unstubAllGlobals();
            expect(GetDisplayCaptureSupport()).toEqual({ Display: false, ElementCapture: false, RegionCapture: false });
        });

        it('reports sharing alone on Firefox and Safari, which have no element or region capture', () => {
            expect(GetDisplayCaptureSupport()).toEqual({ Display: true, ElementCapture: false, RegionCapture: false });
        });

        it('reports element and region capture on Chromium', () => {
            InstallCaptureTargets({ Element: true, Region: true });
            expect(GetDisplayCaptureSupport()).toEqual({ Display: true, ElementCapture: true, RegionCapture: true });
        });
    });

    describe('sharing a screen, window or tab', () => {
        it('offers every surface but this page, lets the user switch, and leaves audio out', async () => {
            await RequestDisplayCapture();
            expect(media.Requests[0]).toEqual({
                video: true,
                audio: false,
                selfBrowserSurface: 'exclude',
                surfaceSwitching: 'include',
                monitorTypeSurfaces: 'include',
                systemAudio: 'exclude',
            });
        });

        it('offers the preferred kind of surface first, at its native frame rate', async () => {
            await RequestDisplayCapture({ PreferredSurface: 'window' });
            await RequestDisplayCapture({ PreferredSurface: 'tab' });
            await RequestDisplayCapture({ PreferredSurface: 'screen' });
            expect(media.Requests.map((request) => request.video)).toEqual([
                { displaySurface: 'window' },
                { displaySurface: 'browser' },
                { displaySurface: 'monitor' },
            ]);
        });

        it('asks for the surface audio only when told to', async () => {
            await RequestDisplayCapture({ IncludeAudio: true });
            expect(media.Requests[0]).toMatchObject({ audio: true, systemAudio: 'include' });
        });

        it('reports what was shared, as it changes', async () => {
            const capture = startedCapture(await RequestDisplayCapture());
            expect(capture).toMatchObject({ Surface: 'screen', Label: 'Fake shared surface', PanelMethod: undefined });
            expect(capture.Stream).toBe(media.Stream);
            expect(capture.Track).toBe(media.Track);

            media.Track.DisplaySurface = 'browser';
            expect(capture.Surface).toBe('tab');
            media.Track.DisplaySurface = undefined;
            expect(capture.Surface).toBe('unknown');
        });
    });

    describe('results instead of exceptions', () => {
        it('closing the picker is cancelled, not an error', async () => {
            media.RejectNextWith(PickerError('NotAllowedError', 'Permission denied'));
            expect(await RequestDisplayCapture()).toEqual({ Status: 'cancelled' });
        });

        it('an operating-system refusal is denied', async () => {
            media.RejectNextWith(PickerError('NotAllowedError', 'Permission denied by system'));
            expect(await RequestDisplayCapture()).toEqual({ Status: 'failed', Reason: 'denied', Message: 'Permission denied by system' });
        });

        it('any other picker error is failed, with its message', async () => {
            media.RejectNextWith(PickerError('NotReadableError', 'Could not start video source'));
            expect(await RequestDisplayCapture()).toEqual({ Status: 'failed', Reason: 'error', Message: 'Could not start video source' });
        });

        it('a browser without getDisplayMedia is unsupported', async () => {
            vi.unstubAllGlobals();
            expect(await RequestDisplayCapture()).toMatchObject({ Status: 'failed', Reason: 'unsupported' });
        });
    });

    describe('the end of a share', () => {
        it('reports the browser\'s "Stop sharing" once', async () => {
            const capture = startedCapture(await RequestDisplayCapture());
            const onEnded = vi.fn();
            capture.OnEnded(onEnded);

            media.Track.EndFromBrowser();
            media.Track.EndFromBrowser();
            expect(onEnded).toHaveBeenCalledTimes(1);
        });

        it('Stop ends every track and reports the end once, though the browser fires no event for it', async () => {
            const capture = startedCapture(await RequestDisplayCapture());
            const onEnded = vi.fn();
            capture.OnEnded(onEnded);

            capture.Stop();
            capture.Stop();
            expect(media.Track.Stopped).toBe(true);
            expect(onEnded).toHaveBeenCalledTimes(1);
        });

        it('a handler added after the share ended is called at once', async () => {
            const capture = startedCapture(await RequestDisplayCapture());
            media.Track.EndFromBrowser();

            const onEnded = vi.fn();
            capture.OnEnded(onEnded);
            capture.Stop();
            expect(onEnded).toHaveBeenCalledTimes(1);
        });

        it('a removed handler is not called', async () => {
            const capture = startedCapture(await RequestDisplayCapture());
            const onEnded = vi.fn();
            const remove = capture.OnEnded(onEnded);

            remove();
            capture.Stop();
            expect(onEnded).not.toHaveBeenCalled();
        });
    });

    describe('sharing one panel', () => {
        function panel(isolation: string): HTMLDivElement {
            const element = document.createElement('div');
            dom.Panels[dom.Panels.length - 1].Isolation = isolation;
            return element;
        }

        it('on Firefox and Safari fails as panel-unsupported without opening the picker', async () => {
            const result = await RequestDisplayCapture({ Panel: panel('isolate') });
            expect(result).toMatchObject({ Status: 'failed', Reason: 'panel-unsupported' });
            expect(media.Requests).toHaveLength(0);
        });

        it('asks for this tab, and does not let the user switch away from it', async () => {
            InstallCaptureTargets({ Element: true, Region: true });
            media.Track.DisplaySurface = 'browser';
            await RequestDisplayCapture({ Panel: panel('isolate'), PreferredSurface: 'screen' });
            expect(media.Requests[0]).toEqual({
                video: { displaySurface: 'browser' },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'exclude',
            });
        });

        it('uses Element Capture when the panel is its own stacking context', async () => {
            InstallCaptureTargets({ Element: true, Region: true });
            media.Track.DisplaySurface = 'browser';
            const element = panel('isolate');

            const capture = startedCapture(await RequestDisplayCapture({ Panel: element }));
            expect(capture.PanelMethod).toBe('element');
            expect(media.Track.RestrictedTo).toEqual({ Api: 'RestrictionTarget', Element: element });
            expect(media.Track.CroppedTo).toBeNull();
        });

        it('uses Region Capture when the panel is not isolated, since Element Capture would emit no frames', async () => {
            InstallCaptureTargets({ Element: true, Region: true });
            media.Track.DisplaySurface = 'browser';
            const element = panel('auto');

            const capture = startedCapture(await RequestDisplayCapture({ Panel: element }));
            expect(capture.PanelMethod).toBe('region');
            expect(media.Track.CroppedTo).toEqual({ Api: 'CropTarget', Element: element });
            expect(media.Track.RestrictedTo).toBeNull();
        });

        it('uses Region Capture on a Chromium too old for Element Capture', async () => {
            InstallCaptureTargets({ Element: false, Region: true });
            media.Track.DisplaySurface = 'browser';

            const capture = startedCapture(await RequestDisplayCapture({ Panel: panel('isolate') }));
            expect(capture.PanelMethod).toBe('region');
        });

        it('stops and explains when the user shares a window instead of this tab', async () => {
            InstallCaptureTargets({ Element: true, Region: true });
            media.Track.DisplaySurface = 'window';

            const result = await RequestDisplayCapture({ Panel: panel('isolate') });
            expect(result).toMatchObject({ Status: 'failed', Reason: 'panel-wrong-surface' });
            expect(media.Track.Stopped).toBe(true);
            expect(media.Track.RestrictedTo).toBeNull();
        });

        it('stops and explains when the browser refuses to narrow another tab', async () => {
            InstallCaptureTargets({ Element: true, Region: true });
            media.Track.DisplaySurface = 'browser';
            media.Track.NarrowError = PickerError('NotSupportedError', 'Not capturing the current tab');

            const result = await RequestDisplayCapture({ Panel: panel('isolate') });
            expect(result).toMatchObject({ Status: 'failed', Reason: 'panel-wrong-surface' });
            expect(media.Track.Stopped).toBe(true);
        });
    });
});
