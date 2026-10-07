import { describe, it, expect } from 'vitest';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client';
import { renderComponentFixture, query, queryAll, text, attr, click, capture, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { RealtimePerceptionChipComponent, type RealtimePerceptionToggle } from './realtime-perception-chip.component';

/**
 * DOM spec for <mj-realtime-perception-chip> — the "agent can see" indicator. Purely presentational:
 * it renders the sources it is given and raises SourceToggled; the session applies the change.
 * Covers visibility, the summary wording, the per-source panel, the switch wiring (including that a no-op
 * does not emit), accessible names, Escape to close, and an axe pass in both states.
 */
describe('RealtimePerceptionChipComponent (DOM)', () => {
  const source = (over: Partial<VideoSourceState> = {}): VideoSourceState => ({
    SourceID: 'wb#1',
    Label: 'Whiteboard',
    Kind: 'surface',
    ChannelKey: 'Whiteboard',
    Enabled: true,
    Active: true,
    FramesSent: 3,
    ...over,
  });

  /** Clicks and flushes change detection (the fixture is not zone-driven, so a handler's state change is not rendered on its own). */
  const press = async (f: ReturnType<typeof renderComponentFixture>, selector: string): Promise<void> => {
    click(f, selector);
    f.detectChanges();
    // ngModel hands mj-switch its value in a microtask, so let it land before the next assertion or click.
    await f.whenStable();
    f.detectChanges();
  };

  const render = (sources: readonly VideoSourceState[]) => renderComponentFixture(RealtimePerceptionChipComponent, { inputs: { Sources: sources } });

  it('renders nothing while there is no video source', () => {
    const f = render([]);
    expect(query(f, '.perception-chip')).toBeNull();
  });

  it('shows the chip with the source named when one is on', () => {
    const f = render([source()]);
    expect(text(f, '.perception-chip__trigger')).toContain('Agent can see: Whiteboard');
    expect(query(f, '.perception-chip__panel')).toBeNull(); // collapsed by default
    expect(query(f, '.fa-eye')).not.toBeNull();
  });

  it('summarizes several sources by count, and shows "view off" with an eye-slash when all are off', () => {
    const several = render([source(), source({ SourceID: 'rb#1', Label: 'Browser' })]);
    expect(text(several, '.perception-chip__trigger')).toContain('Agent can see 2 sources');

    const off = render([source({ Enabled: false, Active: false })]);
    expect(text(off, '.perception-chip__trigger')).toContain('Agent view off');
    expect(query(off, '.fa-eye-slash')).not.toBeNull();
    expect(query(off, '.perception-chip--off')).not.toBeNull();
  });

  it('opens a panel listing each source with its status when the trigger is pressed', async () => {
    const f = render([source(), source({ SourceID: 'rb#1', Label: 'Browser', Active: false }), source({ SourceID: 'm#1', Label: 'Media', Enabled: false, Active: false })]);
    expect(attr(f, '.perception-chip__trigger', 'aria-expanded')).toBe('false');
    await press(f, '.perception-chip__trigger');
    expect(attr(f, '.perception-chip__trigger', 'aria-expanded')).toBe('true');
    const rows = queryAll(f, '.perception-chip__row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Whiteboard');
    expect(rows[0].textContent).toContain('Viewing now');
    expect(rows[1].textContent).toContain('Available');
    expect(rows[2].textContent).toContain('Off');
  });

  it('gives the trigger, the group and every switch an accessible name', async () => {
    const f = render([source()]);
    expect(attr(f, '.perception-chip__trigger', 'aria-label')).toBe('Agent can see: Whiteboard. Show what the agent can see.');
    await press(f, '.perception-chip__trigger');
    expect(attr(f, '.perception-chip__trigger', 'aria-label')).toContain('Hide what the agent can see');
    expect(attr(f, '.perception-chip__panel', 'aria-label')).toBe('What the agent can see');
    expect(attr(f, 'mj-switch button', 'aria-label')).toBe('Let the agent see Whiteboard');
    expect(attr(f, 'mj-switch button', 'aria-checked')).toBe('true');
  });

  it('turning a switch off raises SourceToggled with the source and the new state', async () => {
    const f = render([source()]);
    const toggles = capture<RealtimePerceptionToggle>(f.componentInstance.SourceToggled);
    await press(f, '.perception-chip__trigger');
    await press(f, 'mj-switch button');
    expect(toggles).toEqual([{ SourceID: 'wb#1', Enabled: false }]);
  });

  it('turning a switched-off source on raises Enabled: true', async () => {
    const f = render([source({ Enabled: false, Active: false })]);
    const toggles = capture<RealtimePerceptionToggle>(f.componentInstance.SourceToggled);
    await press(f, '.perception-chip__trigger');
    await press(f, 'mj-switch button');
    expect(toggles).toEqual([{ SourceID: 'wb#1', Enabled: true }]);
  });

  it('does not raise an event when the switch reports the state the source already has', () => {
    const f = render([source()]);
    const toggles = capture<RealtimePerceptionToggle>(f.componentInstance.SourceToggled);
    f.componentInstance.OnSwitch(source(), true);
    expect(toggles).toEqual([]);
  });

  it('closes the panel on Escape', async () => {
    const f = render([source()]);
    await press(f, '.perception-chip__trigger');
    expect(query(f, '.perception-chip__panel')).not.toBeNull();
    f.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    f.detectChanges();
    expect(query(f, '.perception-chip__panel')).toBeNull();
  });

  it('follows the Sources input as the session changes', () => {
    const f = render([source()]);
    f.componentRef.setInput('Sources', [source({ Enabled: false, Active: false })]);
    f.detectChanges();
    expect(text(f, '.perception-chip__trigger')).toContain('Agent view off');
    f.componentRef.setInput('Sources', []);
    f.detectChanges();
    expect(query(f, '.perception-chip')).toBeNull();
  });

  it('has no axe violations, collapsed or open', async () => {
    const f = render([source(), source({ SourceID: 'rb#1', Label: 'Browser', Enabled: false, Active: false })]);
    await ExpectNoAxeViolations(f);
    await press(f, '.perception-chip__trigger');
    await ExpectNoAxeViolations(f);
  });
});
