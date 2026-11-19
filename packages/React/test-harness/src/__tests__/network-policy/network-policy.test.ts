import { describe, it, expect } from 'vitest';
import { HostOfUrl, NetworkAllowlist, RedactUrl } from '../../lib/network-policy';
import { CoreRuntimeNetworkUrls, LibraryNetworkUrls } from '../../lib/component-runner';

describe('NetworkAllowlist', () => {
  const allowlist = new NetworkAllowlist(['https://unpkg.com/react@18.3.1/umd/react.production.min.js', 'cdn.jsdelivr.net']);

  it.each([
    ['a script on an allowed CDN', 'https://unpkg.com/antd@5.12.8/dist/antd.min.js'],
    ['an allowed host given bare', 'https://cdn.jsdelivr.net/npm/chart.js'],
    ['an allowed host in another case', 'https://UNPKG.com/x.js'],
    ['an allowed origin with its default port spelled out', 'https://unpkg.com:443/x.js'],
    ['a host given bare, over http', 'http://cdn.jsdelivr.net/x.js'],
    ['a host given bare, on another port', 'https://cdn.jsdelivr.net:8443/x.js'],
    ['about:blank', 'about:blank'],
    ['a data: URL', 'data:image/png;base64,AAAA'],
    ['a blob: URL', 'blob:http://127.0.0.1/1b2c'],
  ])('allows %s', (_label, url) => {
    expect(allowlist.IsAllowed(url)).toBe(true);
  });

  it.each([
    ['an outside host', 'https://attacker.example/collect?rows=secret'],
    ['a subdomain of an allowed host', 'https://evil.unpkg.com/x.js'],
    ['an allowed origin over another scheme', 'http://unpkg.com/x.js'],
    ['an allowed origin on another port', 'https://unpkg.com:8443/x.js'],
    ['a look-alike host', 'https://unpkg.com.attacker.example/x.js'],
    ['a cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'http://localhost:4000/graphql'],
    ['a WebSocket to an allowed host', 'wss://unpkg.com/socket'],
    ['a file: URL', 'file:///etc/passwd'],
    ['an unparseable URL', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(allowlist.IsAllowed(url)).toBe(false);
  });

  it('refuses everything remote until a host is allowed', () => {
    expect(new NetworkAllowlist().IsAllowed('https://unpkg.com/x.js')).toBe(false);
  });

  it('allows only the port of a URL it was given, not every service on that host', () => {
    const list = new NetworkAllowlist(['http://localhost:8080/lib.js']);
    expect(list.IsAllowed('http://localhost:8080/other.js')).toBe(true);
    expect(list.IsAllowed('http://localhost:4000/graphql')).toBe(false);
    expect(list.IsAllowed('http://localhost/x')).toBe(false);
  });

  it("allows a bare 'host:port' on that port only, over either scheme", () => {
    const list = new NetworkAllowlist(['localhost:4000']);
    expect(list.IsAllowed('http://localhost:4000/x')).toBe(true);
    expect(list.IsAllowed('https://localhost:4000/x')).toBe(true);
    expect(list.IsAllowed('http://localhost:4001/x')).toBe(false);
  });

  it('lists its entries, sorted and without duplicates', () => {
    const list = new NetworkAllowlist(['https://unpkg.com/a.js', 'https://unpkg.com/b.js', 'cdnjs.cloudflare.com']);
    expect(list.AllowedEntries).toEqual(['*://cdnjs.cloudflare.com:*', 'https://unpkg.com:443']);
  });

  it('ignores values that name no host', () => {
    const list = new NetworkAllowlist(['', '   ', 'file:///etc/passwd', 'about:blank']);
    expect(list.AllowedEntries).toEqual([]);
  });
});

describe('HostOfUrl', () => {
  it('returns the lowercase host, or null', () => {
    expect(HostOfUrl('https://CDN.Example.com:8443/x')).toBe('cdn.example.com');
    expect(HostOfUrl('about:blank')).toBeNull();
    expect(HostOfUrl('nope')).toBeNull();
  });
});

describe('RedactUrl', () => {
  it('drops the query string and fragment, where exfiltrated data would ride', () => {
    expect(RedactUrl('https://attacker.example/c?rows=%5B1%2C2%5D#more')).toBe('https://attacker.example/c');
  });

  it('keeps only the scheme of a URL with no origin', () => {
    expect(RedactUrl('data:text/plain,secret')).toBe('data:');
  });

  it('does not echo an unparseable value', () => {
    expect(RedactUrl('secret data')).toBe('(unparseable URL)');
  });
});

describe('LibraryNetworkUrls', () => {
  it('collects every script and stylesheet URL, splitting comma-separated CSS', () => {
    const urls = LibraryNetworkUrls([
      { CDNUrl: 'https://unpkg.com/antd.js', CDNCssUrl: 'https://unpkg.com/antd.css, https://cdn.jsdelivr.net/x.css' },
      { CDNUrl: 'https://cdnjs.cloudflare.com/chart.js', CDNCssUrl: null },
      { CDNUrl: null, CDNCssUrl: '' },
    ]);
    expect(urls).toEqual([
      'https://unpkg.com/antd.js',
      'https://unpkg.com/antd.css',
      'https://cdn.jsdelivr.net/x.css',
      'https://cdnjs.cloudflare.com/chart.js',
    ]);
  });
});

describe('CoreRuntimeNetworkUrls', () => {
  it('collects each primary CDN URL and its fallbacks, so the runtime can fail over', () => {
    const urls = CoreRuntimeNetworkUrls([
      { cdnUrl: 'https://unpkg.com/react.js', fallbackCdnUrls: ['https://cdn.jsdelivr.net/npm/react.js'] },
      { cdnUrl: 'https://unpkg.com/babel.js' },
      { cdnUrl: '', fallbackCdnUrls: [] },
    ]);
    expect(urls).toEqual(['https://unpkg.com/react.js', 'https://cdn.jsdelivr.net/npm/react.js', 'https://unpkg.com/babel.js']);
  });
});
