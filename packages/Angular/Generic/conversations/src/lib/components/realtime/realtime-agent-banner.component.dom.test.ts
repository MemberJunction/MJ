import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, capture, click } from '@memberjunction/ng-test-utils';
import { RealtimeAgentBannerComponent } from './realtime-agent-banner.component';

/**
 * DOM spec for <mj-realtime-agent-banner> — the call overlay's unified app bar. Purely
 * presentational (which controls render is decided by the overlay via boolean inputs).
 * Covers the three presentations (live console / compact / review), the state-driven
 * orb + label + spinner, the disclosure-gated gear + minimize, the gear popover
 * (density radios, dev toggle), and the review action outputs. No media here — the orb
 * is a CSS `data-state` element, not an AudioContext-driven visualizer.
 */
describe('RealtimeAgentBannerComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(RealtimeAgentBannerComponent, {
      imports: [CommonModule, RealtimeAgentBannerComponent],
      inputs,
    });

  it('renders the live console with the agent identity and state label', () => {
    const f = render({ State: 'listening', AgentName: 'Sage' });
    expect(text(f, '.banner__name')).toContain('Sage');
    expect(text(f, '.banner__state-label')).toBe('Listening');
    expect(query(f, '.banner--review')).toBeNull();
  });

  // One render per test (TestBed is single-use) — the two states are separate specs.
  it('shows the busy spinner (not the waveform) for thinking state', () => {
    const thinking = render({ State: 'thinking', AgentName: 'Sage' });
    expect(query(thinking, '.banner__state .fa-spinner')).not.toBeNull();
    expect(query(thinking, '.banner__state .waveform')).toBeNull();
  });

  it('shows the waveform (not the spinner) for the listening state', () => {
    const listening = render({ State: 'listening', AgentName: 'Sage' });
    expect(query(listening, '.banner__state .waveform')).not.toBeNull();
    expect(query(listening, '.banner__state .fa-spinner')).toBeNull();
  });

  it('reflects the speaking state in the orb data-state and label', () => {
    const f = render({ State: 'speaking', AgentName: 'Sage' });
    expect(query(f, '.agent-orb')?.getAttribute('data-state')).toBe('speaking');
    expect(text(f, '.banner__state-label')).toBe('Sage is speaking…');
  });

  it('omits the model-name suffix when ModelName is unset', () => {
    expect(query(render({ State: 'listening' }), '.banner__model')).toBeNull();
  });

  it('renders the model-name suffix when ModelName is set', () => {
    const withModel = render({ State: 'listening', ModelName: 'GPT Realtime 2' });
    expect(text(withModel, '.banner__model')).toContain('GPT Realtime 2');
  });

  it('hides the gear and minimize controls when their disclosure booleans are off', () => {
    const bare = render({ State: 'listening' });
    expect(query(bare, '.bar-actions .iconb')).toBeNull();
  });

  it('shows both the gear and minimize controls when their disclosure booleans are on', () => {
    const full = render({ State: 'listening', ShowGear: true, ShowMinimize: true });
    expect(queryAll(full, '.bar-actions .iconb')).toHaveLength(2);
  });

  it('opens the gear popover and marks the current density radio checked', () => {
    const f = render({ State: 'listening', ShowGear: true, Density: 'pro' });
    expect(query(f, '.gear-pop')).toBeNull();
    click(f, '.bar-actions .iconb');
    f.detectChanges();
    expect(query(f, '.gear-pop')).not.toBeNull();
    const checked = queryAll(f, '.gp-seg button').find((b) => b.getAttribute('aria-checked') === 'true');
    expect(checked?.textContent?.trim()).toBe('Pro');
  });

  it('emits DensityChanged when a density radio is picked', () => {
    const f = render({ State: 'listening', ShowGear: true, Density: 'auto' });
    const densities = capture(f.componentInstance.DensityChanged);
    click(f, '.bar-actions .iconb');
    f.detectChanges();
    const simpleBtn = queryAll(f, '.gp-seg button').find((b) => b.textContent?.trim() === 'Simple');
    (simpleBtn as HTMLElement).click();
    expect(densities).toEqual(['simple']);
  });

  it('emits MinimizeRequested from the minimize control', () => {
    const f = render({ State: 'listening', ShowMinimize: true });
    const mins = capture(f.componentInstance.MinimizeRequested);
    click(f, '.bar-actions .iconb');
    expect(mins).toHaveLength(1);
  });

  it('renders the review presentation with the close-reason chip and exit actions', () => {
    const f = render({
      State: 'closed',
      ReviewMode: true,
      AgentName: 'Sage',
      ReviewCloseReason: 'Explicit',
    });
    expect(query(f, '.banner--review')).not.toBeNull();
    expect(text(f, '.pill--close-reason')).toBe('Ended by user');
    expect(query(f, '.start-live-pill')).not.toBeNull();
  });

  it('emits StartLiveRequested and CloseRequested from the review actions', () => {
    const f = render({ State: 'closed', ReviewMode: true, AgentName: 'Sage' });
    const startLive = capture(f.componentInstance.StartLiveRequested);
    const closes = capture(f.componentInstance.CloseRequested);
    click(f, '.start-live-pill');
    click(f, '.bar-actions .iconb');
    expect(startLive).toHaveLength(1);
    expect(closes).toHaveLength(1);
  });
});
