import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ApplyWidgetInput,
  AttributeNameFor,
  DefaultWidgetConfig,
  PropertyForAttribute,
  ReadBoolean,
  ReadChannelInputs,
  ReadChannelList,
  ReadChrome,
  ReadPerception,
  ReadPreload,
  ReadString,
  ReadThemeMode,
  ReadThemeTokens,
  ResolveAuthMode,
  WIDGET_INPUT_PROPERTIES,
  WIDGET_OBSERVED_ATTRIBUTES
} from '../lib/config';

describe('attribute and property coercion', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('ReadString', () => {
    it('trims, and treats empty, blank and non-strings as absent', () => {
      expect(ReadString('  x ')).toBe('x');
      expect(ReadString('')).toBeNull();
      expect(ReadString('   ')).toBeNull();
      expect(ReadString(null)).toBeNull();
      expect(ReadString(undefined)).toBeNull();
      expect(ReadString(5)).toBeNull();
    });
  });

  describe('ReadBoolean', () => {
    it('reads the HTML attribute forms: present-and-empty and "true" are true, "false"/"0"/"no"/"off" are false', () => {
      for (const truthy of ['', 'true', 'TRUE', '1', 'yes', 'on', true]) {
        expect(ReadBoolean(truthy, false)).toBe(true);
      }
      for (const falsy of ['false', 'FALSE', '0', 'no', 'off', false]) {
        expect(ReadBoolean(falsy, true)).toBe(false);
      }
    });

    it('keeps the fallback for an absent or unrecognized value', () => {
      expect(ReadBoolean(null, true)).toBe(true);
      expect(ReadBoolean(undefined, false)).toBe(false);
      expect(ReadBoolean('maybe', true)).toBe(true);
    });
  });

  describe('ReadChannelList', () => {
    it('reads a comma-separated attribute, a JSON array attribute and an array property, trimmed and de-duplicated', () => {
      expect(ReadChannelList(' A, B ,A,, c ')).toEqual(['A', 'B', 'c']);
      expect(ReadChannelList('["IdentityVerification", "Media"]')).toEqual(['IdentityVerification', 'Media']);
      expect(ReadChannelList(['X', ' Y ', 'x', 7 as unknown as string])).toEqual(['X', 'Y']);
    });

    it('is null when nothing was given (so "no channels beyond the registry" is distinguishable from an empty list)', () => {
      expect(ReadChannelList(null)).toBeNull();
      expect(ReadChannelList('')).toBeNull();
      expect(ReadChannelList(5)).toBeNull();
      expect(ReadChannelList([])).toEqual([]);
    });

    it('ignores JSON that does not parse, loudly', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(ReadChannelList('[not json')).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('ReadChannelInputs', () => {
    it('reads an object property and a JSON attribute, keeping only object-valued entries', () => {
      expect(ReadChannelInputs({ IdentityVerification: { name: 'Ada' }, Bad: 'x', Arr: [1] })).toEqual({ IdentityVerification: { name: 'Ada' } });
      expect(ReadChannelInputs('{"Media":{"a":1}}')).toEqual({ Media: { a: 1 } });
    });

    it('is empty for anything else, and warns on unparseable JSON', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(ReadChannelInputs(null)).toEqual({});
      expect(ReadChannelInputs([1])).toEqual({});
      expect(ReadChannelInputs('{oops')).toEqual({});
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('chrome and theme', () => {
    it('accepts orb and console (case-insensitively) and falls back to auto', () => {
      expect(ReadChrome('ORB')).toBe('orb');
      expect(ReadChrome('console')).toBe('console');
      expect(ReadChrome('weird')).toBe('auto');
      expect(ReadChrome(null)).toBe('auto');
    });

    it('reads a theme mode, or null when the value is something else (a token map)', () => {
      expect(ReadThemeMode('Dark')).toBe('dark');
      expect(ReadThemeMode('light')).toBe('light');
      expect(ReadThemeMode('auto')).toBe('auto');
      expect(ReadThemeMode('{"a":"b"}')).toBeNull();
    });

    it('reads token overrides from an object or a JSON string, dropping non-strings', () => {
      expect(ReadThemeTokens({ 'brand-primary': ' #0a7a55 ', bad: 5, empty: '' })).toEqual({ 'brand-primary': '#0a7a55' });
      expect(ReadThemeTokens('{"bg-page":"#fff"}')).toEqual({ 'bg-page': '#fff' });
      expect(ReadThemeTokens('{oops')).toEqual({});
      expect(ReadThemeTokens(null)).toEqual({});
    });
  });
});

describe('ResolveAuthMode', () => {
  const base = DefaultWidgetConfig();

  it('picks a host launcher first, then widget key, invite token, token', () => {
    const launcher = { Launch: async () => { throw new Error('unused'); } };
    expect(ResolveAuthMode({ ...base, launcher, widgetKey: 'pk', token: 't' })).toBe('launcher');
    expect(ResolveAuthMode({ ...base, widgetKey: 'pk', inviteToken: 'i', token: 't' })).toBe('widget-key');
    expect(ResolveAuthMode({ ...base, inviteToken: 'i', token: 't' })).toBe('invite-token');
    expect(ResolveAuthMode({ ...base, token: 't' })).toBe('token');
  });

  it('assumes an already-authenticated MemberJunction page when nothing is supplied', () => {
    expect(ResolveAuthMode(base)).toBe('host');
  });
});

describe('DefaultWidgetConfig', () => {
  it('asks for consent, does not auto-start, and follows the page theme', () => {
    const config = DefaultWidgetConfig();
    expect(config).toMatchObject({ requireConsent: true, autoStart: false, theme: 'auto', chrome: 'auto', channels: null, launcher: null });
  });

  it('hands out a fresh object every time (no shared mutable defaults)', () => {
    const a = DefaultWidgetConfig();
    a.channelInputs['x'] = {};
    expect(DefaultWidgetConfig().channelInputs).toEqual({});
  });
});

describe('the element input table', () => {
  it('names every input once, in attribute form dash-cased from the property', () => {
    expect(new Set(WIDGET_INPUT_PROPERTIES).size).toBe(WIDGET_INPUT_PROPERTIES.length);
    expect(AttributeNameFor('apiUrl')).toBe('api-url');
    expect(AttributeNameFor('frameCapture')).toBe('frame-capture');
    expect(AttributeNameFor('sessionUrl')).toBe('session-url');
    expect(AttributeNameFor('token')).toBe('token');
    expect(PropertyForAttribute('csp-nonce')).toBe('cspNonce');
    expect(PropertyForAttribute('nope')).toBeNull();
    // `launcher` is code, so it has no attribute.
    expect(WIDGET_OBSERVED_ATTRIBUTES).not.toContain('launcher');
    expect(WIDGET_OBSERVED_ATTRIBUTES).toContain('perception');
    expect(WIDGET_OBSERVED_ATTRIBUTES).toContain('preload');
  });

  it('reads the new inputs with safe defaults: perception ask, preload hover, frame-capture off', () => {
    expect(DefaultWidgetConfig()).toMatchObject({ perception: 'ask', preload: 'hover', frameCapture: false, sessionUrl: null });
    expect([ReadPerception('on'), ReadPerception(' OFF '), ReadPerception('ask'), ReadPerception('maybe'), ReadPerception(null)]).toEqual(['on', 'off', 'ask', 'ask', 'ask']);
    expect([ReadPreload('none'), ReadPreload('IDLE'), ReadPreload('eager'), ReadPreload('hover'), ReadPreload('soon'), ReadPreload(undefined)]).toEqual(['none', 'idle', 'eager', 'hover', 'hover', 'hover']);
  });

  it('applies a value to a config the way an attribute or a property would', () => {
    let c = DefaultWidgetConfig();
    c = ApplyWidgetInput(c, 'frameCapture', '');
    expect(c.frameCapture).toBe(true);
    c = ApplyWidgetInput(c, 'perception', 'off');
    c = ApplyWidgetInput(c, 'preload', 'idle');
    c = ApplyWidgetInput(c, 'sessionUrl', ' https://cdn.example.com/s.js ');
    expect(c).toMatchObject({ perception: 'off', preload: 'idle', sessionUrl: 'https://cdn.example.com/s.js' });
    c = ApplyWidgetInput(c, 'agentName', '   ');
    expect(c.agentName).toBe('Assistant');
    c = ApplyWidgetInput(c, 'theme', '{"brand-primary":"#0a7a55"}');
    expect(c.themeTokens).toEqual({ 'brand-primary': '#0a7a55' });
    expect(c.theme).toBe('auto');
    c = ApplyWidgetInput(c, 'theme', 'dark');
    expect(c.theme).toBe('dark');
    c = ApplyWidgetInput(c, 'requireConsent', 'false');
    expect(c.requireConsent).toBe(false);
  });

  it('accepts a launcher only if it can launch', () => {
    const good = { Launch: async () => { throw new Error('x'); } };
    expect(ApplyWidgetInput(DefaultWidgetConfig(), 'launcher', good).launcher).toBe(good);
    expect(ApplyWidgetInput(DefaultWidgetConfig(), 'launcher', {}).launcher).toBeNull();
    expect(ApplyWidgetInput(DefaultWidgetConfig(), 'launcher', 'nope').launcher).toBeNull();
  });
});
