import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { RealtimeChannelStripComponent, RealtimeChannel } from './realtime-channel-strip.component';

/**
 * DOM spec for <mj-realtime-channel-strip>. Purely presentational: renders the
 * channel chip list off the Channels @Input (defaulting to the always-present live
 * Voice channel). Covers the default chip, the per-status modifier classes and
 * status affordances (live dot / "opening…" note), multi-channel rendering, and the
 * null/empty-input guard that preserves the default set.
 */
describe('RealtimeChannelStripComponent (DOM)', () => {
  const render = (channels?: RealtimeChannel[] | null) =>
    renderComponentFixture(RealtimeChannelStripComponent, {
      inputs: channels === undefined ? {} : { Channels: channels },
    });

  it('renders the default live Voice chip when no channels are supplied', () => {
    const f = render();
    const chips = queryAll(f, '.chan-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('Voice');
    expect(chips[0].classList.contains('chan-chip--live')).toBe(true);
    expect(query(f, '.chan-chip .live-dot')).not.toBeNull();
  });

  it('renders one chip per supplied channel with its label and icon class', () => {
    const f = render([
      { Id: 'voice', Label: 'Voice', Icon: 'fa-microphone-lines', Status: 'live' },
      { Id: 'board', Label: 'Whiteboard', Icon: 'fa-chalkboard', Status: 'off' },
    ]);
    const chips = queryAll(f, '.chan-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain('Voice');
    expect(chips[1].textContent).toContain('Whiteboard');
    expect(chips[1].querySelector('i')?.classList.contains('fa-chalkboard')).toBe(true);
  });

  it('shows the "opening…" note (and no live dot) for an opening channel', () => {
    const f = render([{ Id: 'ss', Label: 'Screen share', Icon: 'fa-display', Status: 'opening' }]);
    const chip = query(f, '.chan-chip');
    expect(chip?.classList.contains('chan-chip--opening')).toBe(true);
    expect(text(f, '.chan-chip .muted')).toContain('opening…');
    expect(query(f, '.chan-chip .live-dot')).toBeNull();
  });

  it('renders an off channel with neither the live dot nor the opening note', () => {
    const f = render([{ Id: 'x', Label: 'Screen share', Icon: 'fa-display', Status: 'off' }]);
    expect(query(f, '.chan-chip')?.classList.contains('chan-chip--off')).toBe(true);
    expect(query(f, '.chan-chip .live-dot')).toBeNull();
    expect(query(f, '.chan-chip .muted')).toBeNull();
  });

  it('keeps the default Voice chip when the input is null or an empty array', () => {
    expect(text(render(null), '.chan-chip')).toContain('Voice');
    expect(text(render([]), '.chan-chip')).toContain('Voice');
  });
});
