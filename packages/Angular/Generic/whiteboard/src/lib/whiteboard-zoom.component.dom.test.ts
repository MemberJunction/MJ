import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardZoomComponent } from './whiteboard-zoom.component';

/**
 * DOM spec for <mj-realtime-whiteboard-zoom> — the zoom cluster. Covers the percentage
 * binding, the minimap on-class toggle, and the single-click @Output emissions. The
 * hold-to-zoom continuous path is timer-driven and exercised in the class-level suite;
 * here we assert the click contract (a plain click steps once).
 */
describe('RealtimeWhiteboardZoomComponent (DOM)', () => {
  const buttons = (f: ReturnType<typeof renderComponentFixture<RealtimeWhiteboardZoomComponent>>) =>
    Array.from(f.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  // template order: [0]=zoom out (−), [1]=zoom in (+), [2]=Fit, [3]=Minimap
  const minusBtn = (f: ReturnType<typeof renderComponentFixture<RealtimeWhiteboardZoomComponent>>) => buttons(f)[0];
  const plusBtn = (f: ReturnType<typeof renderComponentFixture<RealtimeWhiteboardZoomComponent>>) => buttons(f)[1];
  const fitBtn = (f: ReturnType<typeof renderComponentFixture<RealtimeWhiteboardZoomComponent>>) => buttons(f)[2];
  const mapBtn = (f: ReturnType<typeof renderComponentFixture<RealtimeWhiteboardZoomComponent>>) => buttons(f)[3];

  it('renders the ZoomPercent with a trailing % sign', () => {
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { inputs: { ZoomPercent: 90 } });
    expect(f.nativeElement.querySelector('.zoom-pct')?.textContent?.trim()).toBe('90%');
  });

  it('defaults the percentage label to 100%', () => {
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent);
    expect(f.nativeElement.querySelector('.zoom-pct')?.textContent?.trim()).toBe('100%');
  });

  it('does not apply the .on class to the minimap button when MinimapOpen is false', () => {
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { inputs: { MinimapOpen: false } });
    expect(mapBtn(f).classList.contains('on')).toBe(false);
  });

  it('applies the .on class to the minimap button when MinimapOpen is true', () => {
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { inputs: { MinimapOpen: true } });
    expect(mapBtn(f).classList.contains('on')).toBe(true);
  });

  it('emits ZoomIn on a plain click of the + button', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { setup: (c) => c.ZoomIn.subscribe(spy) });
    plusBtn(f).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits ZoomOut on a plain click of the − button', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { setup: (c) => c.ZoomOut.subscribe(spy) });
    minusBtn(f).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits Fit when the fit-to-content button is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { setup: (c) => c.Fit.subscribe(spy) });
    fitBtn(f).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits ToggleMinimap when the minimap button is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardZoomComponent, { setup: (c) => c.ToggleMinimap.subscribe(spy) });
    mapBtn(f).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
