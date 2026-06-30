import { describe, it, expect } from 'vitest';
import {
  resolveRealtimeUi,
  DEFAULT_REALTIME_UI_INPUTS,
  REALTIME_CONSOLE_BREAKPOINT_DEFAULT,
  RealtimeUiInputs,
  RealtimeUiSignals,
} from '../lib/components/realtime/realtime-ui-config';

/** A neutral "wide, text revealed, live" signal set; override per-test. */
function signals(over: Partial<RealtimeUiSignals> = {}): RealtimeUiSignals {
  return {
    containerWidthPx: 900,
    textRevealed: false,
    disclosureShowThread: false,
    disclosureShowComposer: false,
    disclosureShowPanel: false,
    disclosureShowGear: false,
    surfacePanelEarned: false,
    hasChannels: false,
    hasActivity: false,
    devMode: false,
    isReviewing: false,
    channelFocus: false,
    connectionState: 'listening',
    ...over,
  };
}

describe('resolveRealtimeUi — chrome (the orb ↔ console rule)', () => {
  it('auto: stays an orb when narrow even with text revealed', () => {
    const r = resolveRealtimeUi({ chrome: 'auto' }, signals({ containerWidthPx: 390, textRevealed: true }));
    expect(r.chrome).toBe('orb');
  });

  it('auto: stays an orb when wide but the user has NOT revealed text', () => {
    const r = resolveRealtimeUi({ chrome: 'auto' }, signals({ containerWidthPx: 1000, textRevealed: false }));
    expect(r.chrome).toBe('orb');
    expect(r.showHero).toBe(true);
  });

  it('auto: graduates to a console when wide AND text revealed', () => {
    const r = resolveRealtimeUi({ chrome: 'auto' }, signals({ containerWidthPx: 1000, textRevealed: true }));
    expect(r.chrome).toBe('console');
    expect(r.showHero).toBe(false);
    expect(r.showThread).toBe(true);
  });

  it('auto: the disclosure ratchet alone does NOT flip to console — only explicit text intent', () => {
    // Wide + a high disclosure base (power user) but the user has NOT revealed text → stays an orb
    // (this is the bug that produced an empty body: ratchet ≠ "the user asked for text").
    const ratchetOnly = resolveRealtimeUi({ chrome: 'auto' }, signals({ containerWidthPx: 900, disclosureShowComposer: true, disclosureShowThread: true }));
    expect(ratchetOnly.chrome).toBe('orb');
    expect(ratchetOnly.showHero).toBe(true);
    expect(ratchetOnly.showThread).toBe(false);
    // Once the user reveals text (captions on), it graduates.
    const revealed = resolveRealtimeUi({ chrome: 'auto' }, signals({ containerWidthPx: 900, textRevealed: true }));
    expect(revealed.chrome).toBe('console');
  });

  it('auto: review mode always uses the console (transcript surface)', () => {
    const r = resolveRealtimeUi({ chrome: 'auto' }, signals({ containerWidthPx: 360, isReviewing: true }));
    expect(r.chrome).toBe('console');
  });

  it('honours the configured breakpoint', () => {
    const at = signals({ containerWidthPx: 480, textRevealed: true });
    expect(resolveRealtimeUi({ chrome: 'auto', consoleBreakpointPx: 500 }, at).chrome).toBe('orb');
    expect(resolveRealtimeUi({ chrome: 'auto', consoleBreakpointPx: 480 }, at).chrome).toBe('console');
  });

  it('default breakpoint keeps a 390px overlay as an orb', () => {
    expect(REALTIME_CONSOLE_BREAKPOINT_DEFAULT).toBeGreaterThan(390);
    const r = resolveRealtimeUi(undefined, signals({ containerWidthPx: 390, textRevealed: true }));
    expect(r.chrome).toBe('orb');
  });

  it('forced orb stays an orb even when wide + text revealed', () => {
    const r = resolveRealtimeUi({ chrome: 'orb' }, signals({ containerWidthPx: 1200, textRevealed: true }));
    expect(r.chrome).toBe('orb');
  });

  it('forced console stays a console even when narrow with no text', () => {
    const r = resolveRealtimeUi({ chrome: 'console' }, signals({ containerWidthPx: 320 }));
    expect(r.chrome).toBe('console');
    expect(r.showThread).toBe(true);
  });

  it('allowTextReveal:false pins the orb and blocks console graduation', () => {
    const r = resolveRealtimeUi({ chrome: 'auto', allowTextReveal: false }, signals({ containerWidthPx: 1400, textRevealed: true }));
    expect(r.chrome).toBe('orb');
    expect(r.showThread).toBe(false);
    expect(r.allowTextReveal).toBe(false);
  });
});

describe('resolveRealtimeUi — defaults & compactness', () => {
  it('undefined inputs reproduce the documented defaults', () => {
    const r = resolveRealtimeUi(undefined, signals());
    expect(r.showCaptionsControl).toBe(DEFAULT_REALTIME_UI_INPUTS.showCaptionsControl);
    expect(r.showEnd).toBe(true);
    expect(r.allowTextReveal).toBe(true);
  });

  it('compact is inferred below the breakpoint', () => {
    expect(resolveRealtimeUi(undefined, signals({ containerWidthPx: 380 })).compact).toBe(true);
    expect(resolveRealtimeUi(undefined, signals({ containerWidthPx: 1000 })).compact).toBe(false);
  });

  it('compact can be forced on regardless of width', () => {
    expect(resolveRealtimeUi({ compact: true }, signals({ containerWidthPx: 1400 })).compact).toBe(true);
  });

  it('connecting flag mirrors the connection state', () => {
    expect(resolveRealtimeUi(undefined, signals({ connectionState: 'connecting' })).connecting).toBe(true);
    expect(resolveRealtimeUi(undefined, signals({ connectionState: 'speaking' })).connecting).toBe(false);
  });

  it('autoHideControls only applies in orb chrome', () => {
    expect(resolveRealtimeUi({ chrome: 'orb' }, signals()).autoHideControls).toBe(true);
    expect(resolveRealtimeUi({ chrome: 'console' }, signals()).autoHideControls).toBe(false);
  });
});

describe('resolveRealtimeUi — per-affordance gating (flag AND runtime)', () => {
  const consoleSig = signals({ containerWidthPx: 1000, textRevealed: true, disclosureShowPanel: true, surfacePanelEarned: true, disclosureShowComposer: true, disclosureShowGear: true });

  it('surface panel needs the flag, console, disclosure permission AND an earned panel', () => {
    expect(resolveRealtimeUi(undefined, consoleSig).showSurfacePanel).toBe(true);
    expect(resolveRealtimeUi({ showSurfacePanel: false }, consoleSig).showSurfacePanel).toBe(false);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, surfacePanelEarned: false }).showSurfacePanel).toBe(false);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, disclosureShowPanel: false }).showSurfacePanel).toBe(false);
    // not in orb chrome
    expect(resolveRealtimeUi({ chrome: 'orb' }, consoleSig).showSurfacePanel).toBe(false);
  });

  it('channel focus hides the surface panel and channel strip', () => {
    const focused = { ...consoleSig, hasChannels: true, channelFocus: true };
    expect(resolveRealtimeUi(undefined, focused).showSurfacePanel).toBe(false);
    expect(resolveRealtimeUi(undefined, focused).showChannelStrip).toBe(false);
  });

  it('resize is only allowed when the surface panel is actually shown', () => {
    expect(resolveRealtimeUi(undefined, consoleSig).allowResize).toBe(true);
    expect(resolveRealtimeUi({ allowResize: false }, consoleSig).allowResize).toBe(false);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, surfacePanelEarned: false }).allowResize).toBe(false);
  });

  it('activity tab needs activity (or review) and a console', () => {
    expect(resolveRealtimeUi(undefined, { ...consoleSig, hasActivity: true }).showActivityTab).toBe(true);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, hasActivity: false }).showActivityTab).toBe(false);
    expect(resolveRealtimeUi({ showActivityRail: false }, { ...consoleSig, hasActivity: true }).showActivityTab).toBe(false);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, hasActivity: true, isReviewing: false, containerWidthPx: 360, textRevealed: false, disclosureShowComposer: false }).showActivityTab).toBe(false); // orb
  });

  it('dev links require BOTH the flag and per-session dev mode', () => {
    expect(resolveRealtimeUi(undefined, { ...consoleSig, devMode: true }).showDevLinks).toBe(true);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, devMode: false }).showDevLinks).toBe(false);
    expect(resolveRealtimeUi({ showDevLinks: false }, { ...consoleSig, devMode: true }).showDevLinks).toBe(false);
  });

  it('captions / end / minimize honour their flags', () => {
    expect(resolveRealtimeUi({ showCaptionsControl: false }, consoleSig).showCaptionsControl).toBe(false);
    expect(resolveRealtimeUi({ showEnd: false }, consoleSig).showEnd).toBe(false);
    expect(resolveRealtimeUi({ showMinimize: false }, consoleSig).showMinimize).toBe(false);
  });

  it('minimize is hidden while reviewing', () => {
    expect(resolveRealtimeUi(undefined, { ...consoleSig, isReviewing: true }).showMinimize).toBe(false);
  });

  it('density picker requires the flag and a visible gear', () => {
    expect(resolveRealtimeUi(undefined, consoleSig).showDensityPicker).toBe(true);
    expect(resolveRealtimeUi({ showDensityPicker: false }, consoleSig).showDensityPicker).toBe(false);
    // orb with no gear permission → no picker
    expect(resolveRealtimeUi({ chrome: 'orb' }, signals({ disclosureShowGear: false })).showDensityPicker).toBe(false);
  });

  it('composer is console-only and suppressed in review', () => {
    expect(resolveRealtimeUi(undefined, consoleSig).showComposer).toBe(true);
    expect(resolveRealtimeUi(undefined, { ...consoleSig, isReviewing: true }).showComposer).toBe(false);
    expect(resolveRealtimeUi({ chrome: 'orb' }, consoleSig).showComposer).toBe(false);
  });
});
