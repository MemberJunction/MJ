import { describe, it, expect } from 'vitest';
import { HostOfUrl, NetworkAllowlist, RedactUrl } from '../../lib/network-policy';
import { LibraryNetworkUrls } from '../../lib/component-runner';

describe('NetworkAllowlist', () => {
  const allowlist = new NetworkAllowlist(['https://unpkg.com/react@18.3.1/umd/react.production.min.js', 'cdn.jsdelivr.net']);

  it.each([
    ['a script on an allowed CDN', 'https://unpkg.com/antd@5.12.8/dist/antd.min.js'],
    ['an allowed host given bare', 'https://cdn.jsdelivr.net/npm/chart.js'],
    ['an allowed host in another case', 'https://UNPKG.com/x.js'],
    ['an allowed host over http', 'http://unpkg.com/x.js'],
    ['about:blank', 'about:blank'],
    ['a data: URL', 'data:image/png;base64,AAAA'],
    ['a blob: URL', 'blob:http://127.0.0.1/1b2c'],
  ])('allows %s', (_label, url) => {
    expect(allowlist.IsAllowed(url)).toBe(true);
  });

  it.each([
    ['an outside host', 'https://attacker.example/collect?rows=secret'],
    ['a subdomain of an allowed host', 'https://evil.unpkg.com/x.js'],
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

  it('lists its hosts, sorted and without duplicates', () => {
    const list = new NetworkAllowlist(['https://unpkg.com/a.js', 'https://unpkg.com/b.js', 'cdnjs.cloudflare.com']);
    expect(list.AllowedHosts).toEqual(['cdnjs.cloudflare.com', 'unpkg.com']);
  });

  it('ignores values that name no host', () => {
    const list = new NetworkAllowlist(['', '   ']);
    expect(list.AllowedHosts).toEqual([]);
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
