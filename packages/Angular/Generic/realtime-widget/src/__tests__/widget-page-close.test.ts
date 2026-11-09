import { describe, it, expect } from 'vitest';
import { WidgetPageClose } from '../lib/lifecycle/widget-page-close';

function build(config: { url: string; token: string } | null = { url: 'https://api/', token: 'tok' }) {
  const sent: Array<{ url: string; token: string; sessionId: string }> = [];
  const close = new WidgetPageClose({ config: () => config, send: (url, token, sessionId) => sent.push({ url, token, sessionId }) });
  return { close, sent };
}

describe('WidgetPageClose', () => {
  it('does nothing before a session is armed', () => {
    const { close, sent } = build();
    expect(close.OnPageHide(false)).toBe(false);
    expect(sent).toEqual([]);
  });

  it('closes the armed session on a terminal pagehide, over the live endpoint and token', () => {
    const { close, sent } = build();
    close.Arm('sess-1');
    expect(close.IsArmed).toBe(true);
    expect(close.OnPageHide(false)).toBe(true);
    expect(sent).toEqual([{ url: 'https://api/', token: 'tok', sessionId: 'sess-1' }]);
  });

  it('does NOT close when the page is entering the back/forward cache — it may come back', () => {
    const { close, sent } = build();
    close.Arm('sess-1');
    expect(close.OnPageHide(true)).toBe(false);
    expect(sent).toEqual([]);
    expect(close.IsArmed).toBe(true);
  });

  it('closes exactly once however many signals arrive', () => {
    const { close, sent } = build();
    close.Arm('sess-1');
    close.OnPageHide(false);
    close.OnPageHide(false);
    close.OnHostTeardown();
    expect(sent).toHaveLength(1);
  });

  it('stays quiet once disarmed (the call ended some other way)', () => {
    const { close, sent } = build();
    close.Arm('sess-1');
    close.Disarm();
    expect(close.OnPageHide(false)).toBe(false);
    expect(sent).toEqual([]);
  });

  it('does nothing — and stays armed — while no endpoint or token is configured yet', () => {
    const { close, sent } = build(null);
    close.Arm('sess-1');
    expect(close.OnHostTeardown()).toBe(false);
    expect(sent).toEqual([]);
    expect(close.IsArmed).toBe(true);
  });

  it('closes on the in-page teardown signal too (an SPA navigation removing the element)', () => {
    const { close, sent } = build();
    close.Arm('sess-1');
    expect(close.OnHostTeardown()).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
