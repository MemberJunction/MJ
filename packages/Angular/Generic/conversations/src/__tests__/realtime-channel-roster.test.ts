import { describe, it, expect } from 'vitest';
import {
  DescribeChannelRoster, RealtimeChannelRosterEntry,
} from '../lib/components/realtime/realtime-channel-roster';

/**
 * #3497 — the agent has no live channel roster.
 *
 * At connect the model is told its TOOL VOCABULARY and nothing else, so it infers surfaces from
 * tools ("I have `browser_*`, so there must be a browser") and answers questions about its own
 * screen by guessing. These pin the wording the roster uses, because the wording IS the fix: a line
 * the model misreads is no better than the guess it replaces.
 */
const entry = (over: Partial<RealtimeChannelRosterEntry> = {}): RealtimeChannelRosterEntry => ({
  ChannelName: 'Whiteboard',
  TabTitle: 'Whiteboard',
  HasSurface: true,
  Focused: false,
  State: null,
  ...over,
});

describe('DescribeChannelRoster', () => {
  it('says explicitly that nothing is open', () => {
    // Silence is what the model already had, and silence is what it filled in with a guess.
    const note = DescribeChannelRoster([]);
    expect(note).toContain('[surfaces]');
    expect(note).toContain('none open');
  });

  it('names every open surface and counts them', () => {
    const note = DescribeChannelRoster([
      entry({ ChannelName: 'Whiteboard', TabTitle: 'Whiteboard' }),
      entry({ ChannelName: 'Remote Browser', TabTitle: 'Remote Browser' }),
    ]);
    expect(note).toContain('2 surfaces open');
    expect(note).toContain('Whiteboard');
    expect(note).toContain('Remote Browser');
  });

  it('counts one surface in the singular', () => {
    expect(DescribeChannelRoster([entry()])).toContain('1 surface open');
  });

  it('carries each channel\'s own summary — the part the agent cannot infer', () => {
    // "A browser is open" is derivable from having browser tools. WHICH page is open is not.
    const note = DescribeChannelRoster([
      entry({ ChannelName: 'Remote Browser', TabTitle: 'Remote Browser', State: 'showing https://careers.acme.com' }),
    ]);
    expect(note).toContain('(showing https://careers.acme.com)');
  });

  it('omits a summary the channel declined to give, rather than saying "null"', () => {
    const note = DescribeChannelRoster([entry({ State: null }), entry({ ChannelName: 'Notes', TabTitle: 'Notes', State: '   ' })]);
    expect(note).not.toContain('null');
    expect(note).not.toContain('()');
  });

  it('marks which surface owns the screen', () => {
    const note = DescribeChannelRoster([
      entry({ ChannelName: 'Whiteboard', TabTitle: 'Whiteboard', Focused: true }),
      entry({ ChannelName: 'Remote Browser', TabTitle: 'Remote Browser' }),
    ]);
    expect(note).toContain('Whiteboard — focused');
    expect(note).not.toContain('Remote Browser — focused');
  });

  it('flags a channel that is wired but has nothing on screen', () => {
    // The agent HAS this channel's tools, so hiding it would recreate the guessing problem one
    // level down — it would act on a surface that does not exist.
    const note = DescribeChannelRoster([entry({ ChannelName: 'Client Context', TabTitle: 'Client Context', HasSurface: false })]);
    expect(note).toContain('Client Context — no visible surface');
  });

  it('never calls a surface-less channel focused', () => {
    const note = DescribeChannelRoster([entry({ HasSurface: false, Focused: true })]);
    expect(note).toContain('no visible surface');
    expect(note).not.toContain('focused');
  });

  it('falls back to the channel name when the tab has no title', () => {
    const note = DescribeChannelRoster([entry({ ChannelName: 'Remote Browser', TabTitle: '  ' })]);
    expect(note).toContain('Remote Browser');
  });
});
