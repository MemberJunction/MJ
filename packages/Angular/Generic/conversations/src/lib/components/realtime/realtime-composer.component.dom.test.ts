import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import {
  renderComponentFixture,
  query,
  queryAll,
  capture,
  click,
  typeInto,
  overlayQueryAll,
  clearOverlayContainers,
  ExpectNoAxeViolations,
} from '@memberjunction/ng-test-utils';
import { MediaControlsComponent, type MediaSharePanel } from '@memberjunction/ng-realtime-media';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/**
 * DOM spec for <mj-realtime-composer> — the call overlay's bottom dock. The component
 * injects RealtimeSessionService but only calls it in click handlers (ToggleMute /
 * SendText), so a minimal stub satisfies DI while the @Inputs drive every branch of
 * the three-shape template (compact lean strip / phone-call strip / fused level-2 dock).
 *
 * Covers the shape gating (Open × Compact), the mute/captions/details/end control
 * wiring + their outputs, the stubbed-service mute path, and the dock's Send enablement. The controls are the design
 * system's: the microphone is mj-media-controls, the rest mjButton circles, sized per shape.
 * The mic itself is not media here — mute is a pure local toggle on the stub — so no
 * WebRTC/getUserMedia is faked (there is none on this surface).
 */
describe('RealtimeComposerComponent (DOM)', () => {
  // Minimal seam stub — the component only invokes these two in event handlers, never during render.
  const makeService = (toggleMuteReturns = true) =>
    ({
      ToggleMute: () => toggleMuteReturns,
      SendText: (_text: string) => undefined,
    }) satisfies Pick<RealtimeSessionService, 'ToggleMute' | 'SendText'>;

  const render = (inputs: Record<string, unknown> = {}, service = makeService()) =>
    renderComponentFixture(RealtimeComposerComponent, {
      imports: [CommonModule, FormsModule, RealtimeComposerComponent],
      providers: [{ provide: RealtimeSessionService, useValue: service }],
      inputs,
    });

  it('renders the phone-call strip by default (not open, not compact)', () => {
    const f = render();
    expect(query(f, '.strip')).not.toBeNull();
    expect(query(f, '.dock-lean')).toBeNull();
    expect(query(f, '.dock')).toBeNull();
  });

  it('renders the fused level-2 dock (with the text input) when Open is true', () => {
    const f = render({ Open: true });
    expect(query(f, '.dock')).not.toBeNull();
    expect(query(f, '.dock__input')).not.toBeNull();
    expect(query(f, '.strip')).toBeNull();
  });

  it('renders the compact lean dock when strip + compact', () => {
    const f = render({ Open: false, Compact: true });
    expect(query(f, '.dock-lean')).not.toBeNull();
    expect(query(f, '.strip')).toBeNull();
  });

  it('shows the Details control on the strip only when ShowDetails is set', () => {
    // The strip has fixed groups (Mute/Captions/Type/End) + Details when enabled. TestBed is
    // single-use, so toggle the one fixture via setInput rather than rendering twice.
    const f = render({ ShowDetails: false });
    const base = queryAll(f, '.strip .ctrl-group').length;
    f.componentRef.setInput('ShowDetails', true);
    f.detectChanges();
    expect(queryAll(f, '.strip .ctrl-group').length).toBe(base + 1);
  });

  it('reflects the muted state on the strip microphone, the call controls\' red, named by what a click does', () => {
    const muted = render({ IsMuted: true });
    const mic = query(muted, '.strip mj-media-controls button[title="Unmute microphone"]');
    expect(mic?.classList.contains('mj-btn--danger')).toBe(true);
    expect(mic?.querySelector('i')?.classList.contains('fa-microphone-slash')).toBe(true);
    expect(query(muted, '.strip mj-media-controls .control__label')?.textContent?.trim()).toBe('Unmute');
  });

  it('toggles mute through the service and emits the new state on the strip', () => {
    const f = render({ IsMuted: false }, makeService(true));
    const muteChanges = capture(f.componentInstance.MuteChanged);
    click(f, '.strip button[title="Mute microphone"]');
    expect(muteChanges).toEqual([true]);
    expect(f.componentInstance.IsMuted).toBe(true);
  });

  it('emits EndRequested when the strip End control is clicked', () => {
    const f = render();
    const ended = capture(f.componentInstance.EndRequested);
    click(f, '.strip button[title="End call"]');
    expect(ended).toHaveLength(1);
  });

  it('emits OpenChanged(true) when the strip Type control is clicked', () => {
    const f = render();
    const openChanges = capture(f.componentInstance.OpenChanged);
    const typeBtn = queryAll(f, '.strip button').find((b) => b.querySelector('.fa-keyboard'));
    (typeBtn as HTMLElement).click();
    expect(openChanges).toEqual([true]);
  });

  it('draws the strip as large labelled circles: the microphone, Captions, Type and a red End', () => {
    const f = render({ CaptionsOn: true });
    const buttons = queryAll(f, '.strip button');
    expect(buttons.every((b) => b.classList.contains('mj-btn--circle') && b.classList.contains('mj-btn--lg'))).toBe(true);
    expect(queryAll(f, '.strip .control__label, .strip .ctrl-label').map((l) => l.textContent?.trim())).toEqual(['Mute', 'Captions', 'Type', 'End call']);
    const captions = query(f, '.strip button[aria-label="Captions"]');
    expect(captions?.getAttribute('aria-pressed')).toBe('true');
    expect(captions?.classList.contains('mj-btn--selected')).toBe(true);
    expect(query(f, '.strip button[title="End call"]')?.classList.contains('mj-btn--danger')).toBe(true);
  });

  it('draws the lean dock with a large microphone and End, and toggles captions there', () => {
    const f = render({ Compact: true, CaptionsOn: false });
    expect(query(f, '.dock-lean mj-media-controls button')?.classList.contains('mj-btn--lg')).toBe(true);
    expect(query(f, '.dock-lean button[title="End call"]')?.classList.contains('mj-btn--lg')).toBe(true);
    const toggles = capture(f.componentInstance.CaptionsToggled);
    click(f, '.dock-lean button[aria-label="Captions"]');
    expect(toggles).toEqual([true]);
    expect(queryAll(f, '.dock-lean .control__label')).toEqual([]);
  });

  it('toggles mute from the lean dock', () => {
    const lean = render({ Compact: true, IsMuted: false }, makeService(true));
    const leanChanges = capture(lean.componentInstance.MuteChanged);
    click(lean, '.dock-lean button[title="Mute microphone"]');
    expect(leanChanges).toEqual([true]);
  });

  it('toggles mute from the fused dock', () => {
    const dock = render({ Open: true, IsMuted: true }, makeService(false));
    const dockChanges = capture(dock.componentInstance.MuteChanged);
    click(dock, '.dock button[title="Unmute microphone"]');
    expect(dockChanges).toEqual([false]);
  });

  it('draws the fused dock with small circles and no labels', () => {
    const f = render({ Open: true, ShowDetails: true });
    const circles = queryAll(f, '.dock button.mj-btn--circle');
    expect(circles.length).toBe(5); // microphone, captions, details, hide, end
    expect(circles.every((b) => b.classList.contains('mj-btn--sm'))).toBe(true);
    expect(queryAll(f, '.dock .control__label')).toEqual([]);
  });

  it('shows Camera and Share only when told the call offers them, the camera neutral while off', () => {
    const f = render({ ShowCamera: false, ShowShare: false });
    expect(query(f, '.strip button[title="Turn on camera"]')).toBeNull();
    expect(query(f, '.strip button[title="Share screen"]')).toBeNull();
    f.componentRef.setInput('ShowCamera', true);
    f.componentRef.setInput('ShowShare', true);
    f.detectChanges();
    const camera = query(f, '.strip button[title="Turn on camera"]');
    expect(camera?.classList.contains('mj-btn--secondary')).toBe(true);
    expect(query(f, '.strip button[title="Share screen"]')).not.toBeNull();
    expect(queryAll(f, '.strip .control__label').map((l) => l.textContent?.trim())).toEqual(['Mute', 'Video', 'Share']);
  });

  it.each([
    ['the strip', {}],
    ['the lean dock', { Compact: true }],
    ['the fused dock', { Open: true }],
  ])('passes the camera and share requests up from %s', (_layout, inputs) => {
    const f = render({ ...inputs, ShowCamera: true, ShowShare: true, CameraOn: true, Sharing: true });
    const toggles = capture(f.componentInstance.CameraToggled);
    const stops = capture(f.componentInstance.StopShareRequested);
    (query(f, 'button[title="Turn off camera"]') as HTMLButtonElement).click();
    (query(f, 'button[title="Stop sharing"]') as HTMLButtonElement).click();
    expect(toggles).toEqual([false]);
    expect(stops).toHaveLength(1);
  });

  it('drops the Share arrow in the fused dock, which is short of room, and keeps it elsewhere', () => {
    const dock = render({ Open: true, ShowShare: true });
    expect(query(dock, '.dock button[title="Share screen"]')).not.toBeNull();
    expect(query(dock, '.dock button[title="Choose what to share"]')).toBeNull();
  });

  it('keeps the Share arrow in the strip', () => {
    const strip = render({ ShowShare: true });
    expect(query(strip, '.strip button[title="Choose what to share"]')).not.toBeNull();
  });

  it('asks to share a screen from the Share button', () => {
    const f = render({ ShowShare: true });
    const shares = capture(f.componentInstance.ShareRequested);
    click(f, '.strip button[title="Share screen"]');
    expect(shares).toEqual([{ Kind: 'display' }]);
  });

  it("offers the overlay's panels under This panel in the strip and the lean dock, but not the fused dock, and asks for the picked one", () => {
    const panels: MediaSharePanel[] = [{ Key: 'share-panel-1', Label: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' }];
    const f = render({ ShowShare: true, SharePanels: panels });
    const controls = () => f.debugElement.query(By.directive(MediaControlsComponent)).componentInstance as MediaControlsComponent;
    const shares = capture(f.componentInstance.ShareRequested);
    expect(controls().SharePanels).toBe(panels);

    click(f, '.strip button[title="Choose what to share"]');
    (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'This panel')?.click();
    f.detectChanges();
    (overlayQueryAll('mj-menu[aria-label="This panel"] mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'Whiteboard')?.click();
    expect(shares).toEqual([{ Kind: 'panel', PanelKey: 'share-panel-1' }]);
    clearOverlayContainers();

    f.componentRef.setInput('Compact', true);
    f.detectChanges();
    expect(query(f, '.dock-lean')).not.toBeNull();
    expect(controls().SharePanels).toBe(panels);
    f.componentRef.setInput('Open', true);
    f.detectChanges();
    expect(query(f, '.dock')).not.toBeNull();
    expect(controls().SharePanels).toEqual([]);
  });

  it('has no axe violations on the strip', async () => {
    const f = render({ ShowDetails: true });
    await ExpectNoAxeViolations(f);
  });

  it('disables the dock Send button until there is non-whitespace draft text', () => {
    const f = render({ Open: true });
    expect((query(f, '.dock__send') as HTMLButtonElement).disabled).toBe(true);
    // Type through the real [(ngModel)] input so Draft updates via the component's own binding
    // (a direct Draft assignment + strict detectChanges trips NG0100 on the disabled expression).
    typeInto(f, '.dock__input', 'hello');
    f.detectChanges();
    expect((query(f, '.dock__send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits OpenChanged(false) from the dock hide control', () => {
    const f = render({ Open: true });
    const openChanges = capture(f.componentInstance.OpenChanged);
    click(f, '.dock__hide');
    expect(openChanges).toEqual([false]);
  });
});
