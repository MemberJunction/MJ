import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, capture, click, typeInto } from '@memberjunction/ng-test-utils';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/**
 * DOM spec for <mj-realtime-composer> — the call overlay's bottom dock. The component
 * injects RealtimeSessionService but only calls it in click handlers (ToggleMute /
 * SendText), so a minimal stub satisfies DI while the @Inputs drive every branch of
 * the three-shape template (compact lean strip / phone-call strip / fused level-2 dock).
 *
 * Covers the shape gating (Open × Compact), the mute/captions/details/end control
 * wiring + their outputs, the stubbed-service mute path, and the dock's Send enablement.
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

  it('reflects the muted state on the strip mute control', () => {
    const muted = render({ IsMuted: true });
    expect(query(muted, '.strip .ctrl')?.getAttribute('aria-pressed')).toBe('true');
    expect(query(muted, '.strip .ctrl i')?.classList.contains('fa-microphone-slash')).toBe(true);
  });

  it('toggles mute through the service and emits the new state on the strip', () => {
    const f = render({ IsMuted: false }, makeService(true));
    const muteChanges = capture(f.componentInstance.MuteChanged);
    click(f, '.strip .ctrl'); // first control is Mute
    expect(muteChanges).toEqual([true]);
    expect(f.componentInstance.IsMuted).toBe(true);
  });

  it('emits EndRequested when the strip End control is clicked', () => {
    const f = render();
    const ended = capture(f.componentInstance.EndRequested);
    click(f, '.strip .ctrl--end');
    expect(ended).toHaveLength(1);
  });

  it('emits OpenChanged(true) when the strip Type control is clicked', () => {
    const f = render();
    const openChanges = capture(f.componentInstance.OpenChanged);
    // Type control is the ctrl-group before End (no ShowDetails).
    const typeBtn = queryAll(f, '.strip .ctrl').find((b) => b.querySelector('.fa-keyboard'));
    (typeBtn as HTMLElement).click();
    expect(openChanges).toEqual([true]);
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
