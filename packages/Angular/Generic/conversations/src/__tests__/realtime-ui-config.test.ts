import { describe, it, expect } from 'vitest';
import {
  ResolveRealtimeUi,
  DEFAULT_REALTIME_UI_INPUTS,
  REALTIME_CONSOLE_BREAKPOINT_DEFAULT,
  RealtimeUiInputs,
  RealtimeUiSignals,
} from '../lib/components/realtime/realtime-ui-config';

/** A neutral "wide, text revealed, live" signal set; override per-test. */
function signals(over: Partial<RealtimeUiSignals> = {}): RealtimeUiSignals {
  return {
    ContainerWidthPx: 900,
    TextRevealed: false,
    DisclosureShowThread: false,
    DisclosureShowComposer: false,
    DisclosureShowPanel: false,
    DisclosureShowGear: false,
    SurfacePanelEarned: false,
    hasChannels: false,
    HasActivity: false,
    DevMode: false,
    IsReviewing: false,
    channelFocus: false,
    ConnectionState: 'listening',
    ...over,
  };
}

describe('resolveRealtimeUi — chrome (the orb ↔ console rule)', () => {
  it('auto: stays an orb when narrow even with text revealed', () => {
    const r = ResolveRealtimeUi({ chrome: 'auto' }, signals({ ContainerWidthPx: 390, TextRevealed: true }));
    expect(r.chrome).toBe('orb');
  });

  it('auto: stays an orb when wide but the user has NOT revealed text', () => {
    const r = ResolveRealtimeUi({ chrome: 'auto' }, signals({ ContainerWidthPx: 1000, TextRevealed: false }));
    expect(r.chrome).toBe('orb');
    expect(r.showHero).toBe(true);
  });

  it('auto: graduates to a console when wide AND text revealed', () => {
    const r = ResolveRealtimeUi({ chrome: 'auto' }, signals({ ContainerWidthPx: 1000, TextRevealed: true }));
    expect(r.chrome).toBe('console');
    expect(r.showHero).toBe(false);
    expect(r.showThread).toBe(true);
  });

  it('auto: the disclosure ratchet alone does NOT flip to console — only explicit text intent', () => {
    // Wide + a high disclosure base (power user) but the user has NOT revealed text → stays an orb
    // (this is the bug that produced an empty body: ratchet ≠ "the user asked for text").
    const ratchetOnly = ResolveRealtimeUi({ chrome: 'auto' }, signals({ ContainerWidthPx: 900, DisclosureShowComposer: true, DisclosureShowThread: true }));
    expect(ratchetOnly.chrome).toBe('orb');
    expect(ratchetOnly.showHero).toBe(true);
    expect(ratchetOnly.showThread).toBe(false);
    // Once the user reveals text (captions on), it graduates.
    const revealed = ResolveRealtimeUi({ chrome: 'auto' }, signals({ ContainerWidthPx: 900, TextRevealed: true }));
    expect(revealed.chrome).toBe('console');
  });

  it('auto: review mode always uses the console (transcript surface)', () => {
    const r = ResolveRealtimeUi({ chrome: 'auto' }, signals({ ContainerWidthPx: 360, IsReviewing: true }));
    expect(r.chrome).toBe('console');
  });

  it('honours the configured breakpoint', () => {
    const at = signals({ ContainerWidthPx: 480, TextRevealed: true });
    expect(ResolveRealtimeUi({ chrome: 'auto', consoleBreakpointPx: 500 }, at).chrome).toBe('orb');
    expect(ResolveRealtimeUi({ chrome: 'auto', consoleBreakpointPx: 480 }, at).chrome).toBe('console');
  });

  it('default breakpoint keeps a 390px overlay as an orb', () => {
    expect(REALTIME_CONSOLE_BREAKPOINT_DEFAULT).toBeGreaterThan(390);
    const r = ResolveRealtimeUi(undefined, signals({ ContainerWidthPx: 390, TextRevealed: true }));
    expect(r.chrome).toBe('orb');
  });

  it('forced orb stays an orb even when wide + text revealed', () => {
    const r = ResolveRealtimeUi({ chrome: 'orb' }, signals({ ContainerWidthPx: 1200, TextRevealed: true }));
    expect(r.chrome).toBe('orb');
  });

  it('forced console stays a console even when narrow with no text', () => {
    const r = ResolveRealtimeUi({ chrome: 'console' }, signals({ ContainerWidthPx: 320 }));
    expect(r.chrome).toBe('console');
    expect(r.showThread).toBe(true);
  });

  it('allowTextReveal:false pins the orb and blocks console graduation', () => {
    const r = ResolveRealtimeUi({ chrome: 'auto', allowTextReveal: false }, signals({ ContainerWidthPx: 1400, TextRevealed: true }));
    expect(r.chrome).toBe('orb');
    expect(r.showThread).toBe(false);
    expect(r.allowTextReveal).toBe(false);
  });
});

describe('resolveRealtimeUi — defaults & compactness', () => {
  it('undefined inputs reproduce the documented defaults', () => {
    const r = ResolveRealtimeUi(undefined, signals());
    expect(r.showCaptionsControl).toBe(DEFAULT_REALTIME_UI_INPUTS.showCaptionsControl);
    expect(r.showEnd).toBe(true);
    expect(r.allowTextReveal).toBe(true);
  });

  it('compact is inferred below the breakpoint', () => {
    expect(ResolveRealtimeUi(undefined, signals({ ContainerWidthPx: 380 })).compact).toBe(true);
    expect(ResolveRealtimeUi(undefined, signals({ ContainerWidthPx: 1000 })).compact).toBe(false);
  });

  it('compact can be forced on regardless of width', () => {
    expect(ResolveRealtimeUi({ compact: true }, signals({ ContainerWidthPx: 1400 })).compact).toBe(true);
  });

  it('connecting flag mirrors the connection state', () => {
    expect(ResolveRealtimeUi(undefined, signals({ ConnectionState: 'connecting' })).connecting).toBe(true);
    expect(ResolveRealtimeUi(undefined, signals({ ConnectionState: 'speaking' })).connecting).toBe(false);
  });

  it('autoHideControls only applies in orb chrome', () => {
    expect(ResolveRealtimeUi({ chrome: 'orb' }, signals()).autoHideControls).toBe(true);
    expect(ResolveRealtimeUi({ chrome: 'console' }, signals()).autoHideControls).toBe(false);
  });
});

describe('resolveRealtimeUi — per-affordance gating (flag AND runtime)', () => {
  const consoleSig = signals({ ContainerWidthPx: 1000, TextRevealed: true, DisclosureShowPanel: true, SurfacePanelEarned: true, DisclosureShowComposer: true, DisclosureShowGear: true });

  it('surface panel needs the flag + an earned panel — but NOT the disclosure level, NOR console chrome (the on-demand Details/agent peek)', () => {
    expect(ResolveRealtimeUi(undefined, consoleSig).showSurfacePanel).toBe(true);
    expect(ResolveRealtimeUi({ showSurfacePanel: false }, consoleSig).showSurfacePanel).toBe(false);
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, SurfacePanelEarned: false }).showSurfacePanel).toBe(false);
    // A brand-new user (disclosure level 0) who clicks Details — or has the AGENT open the panel — earns it
    // on demand (surfacePanelEarned) and must see it IMMEDIATELY, without the cross-session level ratchet.
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, DisclosureShowPanel: false }).showSurfacePanel).toBe(true);
    // The panel is an INDEPENDENT right-hand peek: it rides ALONGSIDE the orb, so it shows even in orb
    // chrome (Details opened with captions off keeps the glowing orb in the main column and slides the
    // panel in on the right) — provided there's ROOM (width ≥ breakpoint). It must NOT be gated on
    // console chrome / text-reveal.
    const orbPeek = signals({ ContainerWidthPx: 1000, TextRevealed: false, SurfacePanelEarned: true });
    expect(ResolveRealtimeUi({ chrome: 'auto' }, orbPeek).chrome).toBe('orb'); // captions off → still an orb
    expect(ResolveRealtimeUi({ chrome: 'auto' }, orbPeek).showSurfacePanel).toBe(true); // …but the panel peeks
    expect(ResolveRealtimeUi({ chrome: 'auto' }, orbPeek).showHero).toBe(true); // …and the orb stays put
    // Forced orb chrome (at a wide width) shows the earned panel too.
    expect(ResolveRealtimeUi({ chrome: 'orb' }, consoleSig).showSurfacePanel).toBe(true);
    // …but a NARROW overlay never crams the panel beside the orb — it needs room (or a real console).
    const narrowPeek = signals({ ContainerWidthPx: 400, TextRevealed: false, SurfacePanelEarned: true });
    expect(ResolveRealtimeUi({ chrome: 'auto' }, narrowPeek).showSurfacePanel).toBe(false);
    // A narrow REVIEW/forced console still shows it (console implies the intent + layout for the panel).
    expect(ResolveRealtimeUi({ chrome: 'console' }, narrowPeek).showSurfacePanel).toBe(true);
  });

  it('channel focus hides the surface panel and channel strip', () => {
    const focused = { ...consoleSig, hasChannels: true, channelFocus: true };
    expect(ResolveRealtimeUi(undefined, focused).showSurfacePanel).toBe(false);
    expect(ResolveRealtimeUi(undefined, focused).showChannelStrip).toBe(false);
  });

  it('resize is only allowed when the surface panel is actually shown', () => {
    expect(ResolveRealtimeUi(undefined, consoleSig).allowResize).toBe(true);
    expect(ResolveRealtimeUi({ allowResize: false }, consoleSig).allowResize).toBe(false);
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, SurfacePanelEarned: false }).allowResize).toBe(false);
  });

  it('activity tab needs activity (or review) and a console', () => {
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, HasActivity: true }).showActivityTab).toBe(true);
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, HasActivity: false }).showActivityTab).toBe(false);
    expect(ResolveRealtimeUi({ showActivityRail: false }, { ...consoleSig, HasActivity: true }).showActivityTab).toBe(false);
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, HasActivity: true, IsReviewing: false, ContainerWidthPx: 360, TextRevealed: false, DisclosureShowComposer: false }).showActivityTab).toBe(false); // orb
  });

  it('dev links require BOTH the flag and per-session dev mode', () => {
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, DevMode: true }).showDevLinks).toBe(true);
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, DevMode: false }).showDevLinks).toBe(false);
    expect(ResolveRealtimeUi({ showDevLinks: false }, { ...consoleSig, DevMode: true }).showDevLinks).toBe(false);
  });

  it('captions / end / minimize honour their flags', () => {
    expect(ResolveRealtimeUi({ showCaptionsControl: false }, consoleSig).showCaptionsControl).toBe(false);
    expect(ResolveRealtimeUi({ showEnd: false }, consoleSig).showEnd).toBe(false);
    expect(ResolveRealtimeUi({ showMinimize: false }, consoleSig).showMinimize).toBe(false);
  });

  it('minimize is hidden while reviewing', () => {
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, IsReviewing: true }).showMinimize).toBe(false);
  });

  it('density picker requires the flag and a visible gear', () => {
    expect(ResolveRealtimeUi(undefined, consoleSig).showDensityPicker).toBe(true);
    expect(ResolveRealtimeUi({ showDensityPicker: false }, consoleSig).showDensityPicker).toBe(false);
    // orb with no gear permission → no picker
    expect(ResolveRealtimeUi({ chrome: 'orb' }, signals({ DisclosureShowGear: false })).showDensityPicker).toBe(false);
  });

  it('composer is console-only and suppressed in review', () => {
    expect(ResolveRealtimeUi(undefined, consoleSig).showComposer).toBe(true);
    expect(ResolveRealtimeUi(undefined, { ...consoleSig, IsReviewing: true }).showComposer).toBe(false);
    expect(ResolveRealtimeUi({ chrome: 'orb' }, consoleSig).showComposer).toBe(false);
  });
});
