import { describe, it, expect } from 'vitest';
import { NormalizeOrigin, ReadRequestOrigin } from '../requestOrigin.js';
import { IsOriginAllowed, ParseAllowedOrigins } from '../realtimeWidget/widgetCore.js';

describe('NormalizeOrigin', () => {
  it('trims, lowercases and strips trailing slashes', () => {
    expect(NormalizeOrigin('  HTTPS://App.Example.COM//  ')).toBe('https://app.example.com');
  });

  it('keeps an explicit port, default or not', () => {
    expect(NormalizeOrigin('https://a.com:443')).toBe('https://a.com:443');
    expect(NormalizeOrigin('http://localhost:4200/')).toBe('http://localhost:4200');
  });

  it('returns a value made only of slashes as empty', () => {
    expect(NormalizeOrigin('///')).toBe('');
  });

  it('handles a long run of slashes that is not at the end in linear time', () => {
    const hostile = 'https://a.com' + '/'.repeat(100_000) + 'x';
    const started = Date.now();
    expect(NormalizeOrigin(hostile)).toBe(hostile);
    expect(ReadRequestOrigin(hostile)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('ReadRequestOrigin', () => {
  describe('origin present', () => {
    it('returns the normalized origin', () => {
      expect(ReadRequestOrigin('https://Embed.Example.com')).toBe('https://embed.example.com');
    });

    it('strips a trailing slash', () => {
      expect(ReadRequestOrigin('https://embed.example.com/')).toBe('https://embed.example.com');
    });

    it('accepts an IPv6 host with a port', () => {
      expect(ReadRequestOrigin('http://[::1]:3000')).toBe('http://[::1]:3000');
    });
  });

  describe('origin absent', () => {
    it('returns undefined for a missing header', () => {
      expect(ReadRequestOrigin(undefined)).toBeUndefined();
    });

    it('returns undefined for a blank header', () => {
      expect(ReadRequestOrigin('')).toBeUndefined();
      expect(ReadRequestOrigin('   ')).toBeUndefined();
    });

    it('returns undefined for a repeated header', () => {
      expect(ReadRequestOrigin(['https://a.com', 'https://b.com'])).toBeUndefined();
    });
  });

  describe('origin malformed', () => {
    it('returns undefined for the opaque "null" origin', () => {
      expect(ReadRequestOrigin('null')).toBeUndefined();
    });

    it('returns undefined for a value that is not a URL', () => {
      expect(ReadRequestOrigin('not an origin')).toBeUndefined();
      expect(ReadRequestOrigin('https://')).toBeUndefined();
    });

    it('returns undefined for a non-http(s) scheme', () => {
      expect(ReadRequestOrigin('file://')).toBeUndefined();
      expect(ReadRequestOrigin('chrome-extension://abcdef')).toBeUndefined();
    });

    it('returns undefined when a path, query, fragment or credentials are present', () => {
      expect(ReadRequestOrigin('https://a.com/path')).toBeUndefined();
      expect(ReadRequestOrigin('https://a.com?x=1')).toBeUndefined();
      expect(ReadRequestOrigin('https://a.com#frag')).toBeUndefined();
      expect(ReadRequestOrigin('https://user:pw@a.com')).toBeUndefined();
    });
  });

  describe('default ports', () => {
    it('keeps an explicit default port as sent', () => {
      expect(ReadRequestOrigin('https://a.com:443')).toBe('https://a.com:443');
      expect(ReadRequestOrigin('http://a.com:80')).toBe('http://a.com:80');
    });

    it('keeps a non-default port', () => {
      expect(ReadRequestOrigin('https://a.com:8443')).toBe('https://a.com:8443');
    });

    it('does not add a default port when none was sent', () => {
      expect(ReadRequestOrigin('https://a.com')).toBe('https://a.com');
    });
  });

  describe('agreement with the widget allowlist', () => {
    it('a request origin matches the allowlist entry it was normalized against', () => {
      const allowed = ParseAllowedOrigins('["https://Embed.Example.com/"]');
      const origin = ReadRequestOrigin('https://embed.example.com');
      expect(origin).toBe(allowed[0]);
      expect(IsOriginAllowed(origin, allowed)).toBe(true);
    });
  });
});
