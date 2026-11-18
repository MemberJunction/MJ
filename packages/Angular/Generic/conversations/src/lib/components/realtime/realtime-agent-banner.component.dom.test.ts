import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, capture, click } from '@memberjunction/ng-test-utils';
import { RealtimeAgentBannerComponent } from './realtime-agent-banner.component';

/**
 * DOM spec for <mj-realtime-agent-banner> — the call overlay's unified app bar. Purely
 * presentational (which controls render is decided by the overlay via boolean inputs).
 * Covers the three presentations (live console / compact / review), the state-driven
 * orb + label + spinner, the disclosure-gated Details / gear / minimize, the gear popover
 * ("This call" details, Open session record, dev toggle), and the review action outputs. No media here — the orb
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

  it('says why the call ended in the error state when the host gives a label, else "Connection error"', () => {
    const f = render({ State: 'error', AgentName: 'Sage', ErrorLabel: 'Time limit reached' });
    expect(text(f, '.banner__state-label')).toBe('Time limit reached');
  });

  it('says "Connection error" in the error state without a label', () => {
    const f = render({ State: 'error', AgentName: 'Sage' });
    expect(text(f, '.banner__state-label')).toBe('Connection error');
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

  it('keeps the live header to the name and state: no "Voice for", Co-Agent pill, "speaking as", model or Open session', () => {
    const f = render({
      State: 'listening',
      AgentName: 'Sage',
      ModelName: 'GPT Realtime 2',
      DevMode: true,
      SessionID: 'session-1',
    });
    const header = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text(f, '.banner__name')).toBe('Sage');
    expect(header).not.toContain('Voice for');
    expect(header).not.toContain('Co-Agent');
    expect(header).not.toContain('speaking as');
    expect(header).not.toContain('GPT Realtime 2');
    expect(header).not.toContain('Open session');
    expect(query(f, '.dev-link')).toBeNull();
  });

  it('hides the Details, gear and minimize controls when their disclosure booleans are off', () => {
    const bare = render({ State: 'listening' });
    expect(query(bare, '.bar-actions .iconb')).toBeNull();
  });

  it('orders the live actions Details, gear, Minimize', () => {
    const full = render({ State: 'listening', ShowDetails: true, ShowGear: true, ShowMinimize: true });
    const buttons = queryAll(full, '.bar-actions .iconb');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].classList.contains('banner__details')).toBe(true);
    expect(buttons[1].classList.contains('banner__gear')).toBe(true);
    expect(buttons[2].classList.contains('banner__minimize')).toBe(true);
  });

  it('renders Details only when ShowDetails is set', () => {
    const f = render({ State: 'listening', ShowGear: true });
    expect(query(f, '.banner__details')).toBeNull();
  });

  it('reflects DetailsOn in aria-pressed, the on style and the title', () => {
    const f = render({ State: 'listening', ShowDetails: true, DetailsOn: true });
    const details = query(f, '.banner__details');
    expect(details?.getAttribute('aria-pressed')).toBe('true');
    expect(details?.getAttribute('aria-label')).toBe('Details: transcript and session panels');
    expect(details?.classList.contains('iconb--on')).toBe(true);
    expect(details?.getAttribute('title')).toBe('Hide the session panels');
    expect(query(f, '.banner__details .fa-table-columns')).not.toBeNull();
  });

  it('shows Details unpressed when DetailsOn is off', () => {
    const f = render({ State: 'listening', ShowDetails: true });
    const details = query(f, '.banner__details');
    expect(details?.getAttribute('aria-pressed')).toBe('false');
    expect(details?.classList.contains('iconb--on')).toBe(false);
    expect(details?.getAttribute('title')).toBe('Show the session panels');
  });

  it('emits DetailsToggled when Details is clicked (full header)', () => {
    const f = render({ State: 'listening', ShowDetails: true });
    const toggles = capture(f.componentInstance.DetailsToggled);
    click(f, '.banner__details');
    expect(toggles).toHaveLength(1);
  });

  it('renders Details, gear and Minimize in the compact header and emits DetailsToggled', () => {
    const f = render({ State: 'listening', Compact: true, ShowDetails: true, ShowGear: true, ShowMinimize: true });
    expect(query(f, '.banner--compact')).not.toBeNull();
    const buttons = queryAll(f, '.bar-actions .iconb');
    expect(buttons.map((b) => b.classList.contains('banner__details'))).toEqual([true, false, false]);
    expect(buttons[1].classList.contains('banner__gear')).toBe(true);
    const toggles = capture(f.componentInstance.DetailsToggled);
    click(f, '.banner__details');
    expect(toggles).toHaveLength(1);
  });

  it('shows the gear in the compact header when ShowGear is set and opens its popover', () => {
    const f = render({ State: 'listening', Compact: true, AgentName: 'Sage', ShowGear: true });
    expect(query(f, '.banner__gear')).not.toBeNull();
    click(f, '.banner__gear');
    f.detectChanges();
    expect(text(f, '.gp-h')).toBe('This call');
  });

  it('leaves the gear out of the compact header when ShowGear is off', () => {
    const f = render({ State: 'listening', Compact: true, ShowMinimize: true });
    expect(query(f, '.banner__gear')).toBeNull();
    expect(query(f, '.banner__minimize')).not.toBeNull();
  });

  it('shows "This call" with Agent, Voiced by and Model rows in the gear popover', () => {
    const f = render({ State: 'listening', AgentName: 'Sage', ModelName: 'GPT Realtime 2', ShowGear: true });
    expect(query(f, '.gear-pop')).toBeNull();
    click(f, '.banner__gear');
    f.detectChanges();
    expect(text(f, '.gp-h')).toBe('This call');
    const rows = queryAll(f, '.gp-fact').map((r) => [
      r.querySelector('dt')?.textContent?.trim(),
      r.querySelector('dd')?.textContent?.trim(),
    ]);
    expect(rows).toEqual([
      ['Agent', 'Sage'],
      ['Voiced by', 'Co-agent'],
      ['Model', 'GPT Realtime 2'],
    ]);
  });

  it('omits the Model row when ModelName is null', () => {
    const f = render({ State: 'listening', AgentName: 'Sage', ModelName: null, ShowGear: true });
    click(f, '.banner__gear');
    f.detectChanges();
    const labels = queryAll(f, '.gp-fact dt').map((d) => d.textContent?.trim());
    expect(labels).toEqual(['Agent', 'Voiced by']);
  });

  it('has no density control in the gear popover, even with ShowDensityPicker on', () => {
    const f = render({ State: 'listening', ShowGear: true, ShowDensityPicker: true, Density: 'pro' });
    const densities = capture(f.componentInstance.DensityChanged);
    click(f, '.banner__gear');
    f.detectChanges();
    expect(query(f, '.gear-pop')).not.toBeNull();
    expect(query(f, '[role="radiogroup"]')).toBeNull();
    expect(query(f, '.gp-seg')).toBeNull();
    expect(text(f, '.gear-pop')).not.toContain('Density');
    expect(densities).toEqual([]);
  });

  it('shows Open session record in the gear only in dev mode with a session id, and emits it', () => {
    const f = render({ State: 'listening', ShowGear: true, DevMode: true, SessionID: 'session-1' });
    const opened = capture(f.componentInstance.OpenSessionRequested);
    click(f, '.banner__gear');
    f.detectChanges();
    expect(text(f, '.gp-open-session')).toBe('Open session record');
    click(f, '.gp-open-session');
    expect(opened).toEqual(['session-1']);
  });

  it('leaves Open session record out of the gear when dev mode is off', () => {
    const f = render({ State: 'listening', ShowGear: true, DevMode: false, SessionID: 'session-1' });
    click(f, '.banner__gear');
    f.detectChanges();
    expect(query(f, '.gp-open-session')).toBeNull();
  });

  it('leaves Open session record out of the gear when no session id is known', () => {
    const f = render({ State: 'listening', ShowGear: true, DevMode: true, SessionID: null });
    click(f, '.banner__gear');
    f.detectChanges();
    expect(query(f, '.gp-open-session')).toBeNull();
  });

  it('emits MinimizeRequested from the minimize control', () => {
    const f = render({ State: 'listening', ShowMinimize: true });
    const mins = capture(f.componentInstance.MinimizeRequested);
    click(f, '.bar-actions .iconb');
    expect(mins).toHaveLength(1);
  });

  it('closes an open gear popover when the gear is taken away (#6120)', () => {
    const f = render({ State: 'listening', ShowGear: true });
    click(f, '.banner__gear');
    f.detectChanges();
    expect(query(f, '.gear-pop')).not.toBeNull();
    f.componentRef.setInput('ShowGear', false);
    f.detectChanges();
    expect(query(f, '.gear-pop')).toBeNull();
  });

  it('offers the Developer links toggle in the gear by default and emits DevModeToggled', () => {
    const f = render({ State: 'listening', ShowGear: true });
    const toggled = capture(f.componentInstance.DevModeToggled);
    click(f, '.banner__gear');
    f.detectChanges();
    expect(query(f, '.gp-dev-toggle')).not.toBeNull();
    click(f, '.gp-dev-toggle');
    expect(toggled).toEqual([true]);
  });

  it('omits the Developer links toggle and its divider when AllowDevLinks is false', () => {
    const f = render({ State: 'listening', ShowGear: true, AllowDevLinks: false });
    click(f, '.banner__gear');
    f.detectChanges();
    expect(query(f, '.gear-pop')).not.toBeNull();
    expect(query(f, '.gp-dev-toggle')).toBeNull();
    expect(query(f, '.gp-div')).toBeNull();
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

  it('keeps the review header unchanged: "Voice for" name and the Open session dev link', () => {
    const f = render({
      State: 'closed',
      ReviewMode: true,
      AgentName: 'Sage',
      DevMode: true,
      SessionID: 'session-1',
      ShowDetails: true,
      ShowGear: true,
    });
    expect(text(f, '.banner__name')).toBe('Voice for Sage');
    expect(text(f, '.pill--review')).toContain('Session review');
    expect(text(f, '.dev-link')).toContain('Open session');
    expect(query(f, '.banner__details')).toBeNull();
    expect(query(f, '.banner__gear')).toBeNull();
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

  it('leaves out the start-live action, but keeps Close, when ShowStartLive is off', () => {
    const f = render({ State: 'closed', ReviewMode: true, AgentName: 'Sage', ShowStartLive: false });
    expect(query(f, '.start-live-pill')).toBeNull();
    expect(query(f, '.bar-actions .iconb')).not.toBeNull();
  });

  it('hides the redundant state pill when HideState is true (while the center hero orb shows the state)', () => {
    const f = render({ State: 'speaking', AgentName: 'Sage', HideState: true });
    expect(query(f, '.banner__state')).toBeNull();
  });
});
