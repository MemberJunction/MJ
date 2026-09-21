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
  const makeService = (toggleMuteReturns = true, toggleOutputMuteReturns = true) =>
    ({
      ToggleMute: () => toggleMuteReturns,
      ToggleOutputMute: () => toggleOutputMuteReturns,
      SendText: (_text: string) => undefined,
    }) satisfies Pick<RealtimeSessionService, 'ToggleMute' | 'ToggleOutputMute' | 'SendText'>;

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

  // ── Speaker mute — the demo-call control: silence the agent locally, never interrupt it ──

  // TestBed is single-use per spec, so each shape gets its own `it` (one render each).
  it('renders a speaker control on the phone-call strip', () => {
    expect(query(render(), '.strip .ctrl--speaker')).not.toBeNull();
  });

  it('renders a speaker control in the compact lean dock', () => {
    expect(query(render({ Compact: true }), '.dock-lean .lean-ctrl--speaker')).not.toBeNull();
  });

  it('renders a speaker control in the fused level-2 dock', () => {
    expect(query(render({ Open: true }), '.dock .mini--speaker')).not.toBeNull();
  });

  it('reflects the speaker-muted state on the strip speaker control, independently of the mic', () => {
    const f = render({ IsOutputMuted: true, IsMuted: false });
    const speaker = query(f, '.strip .ctrl--speaker');
    expect(speaker?.getAttribute('aria-pressed')).toBe('true');
    expect(speaker?.classList.contains('ctrl--muted')).toBe(true);
    expect(speaker?.querySelector('i')?.classList.contains('fa-volume-xmark')).toBe(true);
    // The mic control is untouched by the speaker state.
    expect(query(f, '.strip .ctrl')?.getAttribute('aria-pressed')).toBe('false');
    expect(query(f, '.strip .ctrl i')?.classList.contains('fa-microphone')).toBe(true);
  });

  it('shows the speaker as audible by default', () => {
    const f = render();
    const speaker = query(f, '.strip .ctrl--speaker');
    expect(speaker?.getAttribute('aria-pressed')).toBe('false');
    expect(speaker?.querySelector('i')?.classList.contains('fa-volume-high')).toBe(true);
  });

  it('toggles the speaker through the service and emits OutputMuteChanged — NOT MuteChanged', () => {
    const f = render({ IsOutputMuted: false }, makeService(true, true));
    const outputChanges = capture(f.componentInstance.OutputMuteChanged);
    const micChanges = capture(f.componentInstance.MuteChanged);
    click(f, '.strip .ctrl--speaker');
    expect(outputChanges).toEqual([true]);
    expect(micChanges).toEqual([]);
    expect(f.componentInstance.IsOutputMuted).toBe(true);
    expect(f.componentInstance.IsMuted).toBe(false);
  });

  it('toggles the speaker from the compact lean dock', () => {
    const lean = render({ Compact: true }, makeService(true, true));
    const leanChanges = capture(lean.componentInstance.OutputMuteChanged);
    click(lean, '.dock-lean .lean-ctrl--speaker');
    expect(leanChanges).toEqual([true]);
  });

  it('toggles the speaker from the fused dock (reflecting the service\'s returned state)', () => {
    const dock = render({ Open: true, IsOutputMuted: true }, makeService(true, false));
    const dockChanges = capture(dock.componentInstance.OutputMuteChanged);
    click(dock, '.dock .mini--speaker');
    expect(dockChanges).toEqual([false]);
    expect(dock.componentInstance.IsOutputMuted).toBe(false);
  });

  it('spells out in the tooltip that muting the speaker does not stop the agent', () => {
    const f = render();
    expect(query(f, '.strip .ctrl--speaker')?.getAttribute('title')).toMatch(/agent keeps going/i);
  });
});
