import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:dns so we control what a hostname resolves to, without real DNS.
// The mocked `lookup` short-circuits literal IPs (mirroring Node's behavior)
// and otherwise returns whatever the current test registered.
// ---------------------------------------------------------------------------
import { isIP } from 'node:net';

const resolutions = new Map<string, string[]>();

vi.mock('node:dns', () => {
  return {
    promises: {
      lookup: vi.fn(async (hostname: string, _opts: { all: true }) => {
        // Literal IPs resolve to themselves (as Node's dns.lookup does).
        if (isIP(hostname) !== 0) {
          return [{ address: hostname, family: isIP(hostname) }];
        }
        const addrs = resolutions.get(hostname);
        if (!addrs || addrs.length === 0) {
          const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
          throw err;
        }
        return addrs.map((a) => ({ address: a, family: isIP(a) }));
      }),
    },
  };
});

import { AssertPublicUrl, IsBlockedIPAddress, SSRFError } from '../SSRFGuard.js';

beforeEach(() => {
  resolutions.clear();
});

// =====================================================================
// IsBlockedIPAddress — pure classifier
// =====================================================================
describe('IsBlockedIPAddress', () => {
  it('blocks IPv4 loopback (127.0.0.1)', () => {
    expect(IsBlockedIPAddress('127.0.0.1')).toBe(true);
  });

  it('blocks the cloud metadata address (169.254.169.254)', () => {
    expect(IsBlockedIPAddress('169.254.169.254')).toBe(true);
  });

  it('blocks private 10.x', () => {
    expect(IsBlockedIPAddress('10.1.2.3')).toBe(true);
  });

  it('blocks private 192.168.x', () => {
    expect(IsBlockedIPAddress('192.168.0.5')).toBe(true);
  });

  it('blocks private 172.16-31.x', () => {
    expect(IsBlockedIPAddress('172.16.5.5')).toBe(true);
    expect(IsBlockedIPAddress('172.31.255.255')).toBe(true);
    // 172.32.x is NOT private
    expect(IsBlockedIPAddress('172.32.0.1')).toBe(false);
  });

  it('blocks CGNAT 100.64/10 and 0.0.0.0/8', () => {
    expect(IsBlockedIPAddress('100.64.0.1')).toBe(true);
    expect(IsBlockedIPAddress('0.0.0.0')).toBe(true);
  });

  it('blocks IPv6 loopback (::1)', () => {
    expect(IsBlockedIPAddress('::1')).toBe(true);
  });

  it('blocks IPv6 unspecified (::)', () => {
    expect(IsBlockedIPAddress('::')).toBe(true);
  });

  it('blocks IPv6 ULA (fc00::/7) and link-local (fe80::/10)', () => {
    expect(IsBlockedIPAddress('fc00::1')).toBe(true);
    expect(IsBlockedIPAddress('fd12:3456::1')).toBe(true);
    expect(IsBlockedIPAddress('fe80::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
    expect(IsBlockedIPAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 metadata (::ffff:169.254.169.254)', () => {
    expect(IsBlockedIPAddress('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows public IPv4 (8.8.8.8, 1.1.1.1)', () => {
    expect(IsBlockedIPAddress('8.8.8.8')).toBe(false);
    expect(IsBlockedIPAddress('1.1.1.1')).toBe(false);
  });

  it('allows public IPv6 (2606:4700:4700::1111)', () => {
    expect(IsBlockedIPAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('fails closed on an unparseable address', () => {
    expect(IsBlockedIPAddress('not-an-ip')).toBe(true);
  });
});

// =====================================================================
// AssertPublicUrl — scheme + resolved-address enforcement
// =====================================================================
describe('AssertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(AssertPublicUrl('ftp://example.com/file')).rejects.toBeInstanceOf(SSRFError);
    await expect(AssertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SSRFError);
  });

  it('rejects a malformed URL', async () => {
    await expect(AssertPublicUrl('not a url')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a hostname that resolves to a private address', async () => {
    resolutions.set('evil.example.com', ['10.0.0.5']);
    await expect(AssertPublicUrl('https://evil.example.com/')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a hostname where ANY resolved address is private (rebinding defense)', async () => {
    resolutions.set('mixed.example.com', ['8.8.8.8', '127.0.0.1']);
    await expect(AssertPublicUrl('https://mixed.example.com/')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a literal metadata IP host', async () => {
    await expect(AssertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a literal IPv6 loopback host', async () => {
    await expect(AssertPublicUrl('http://[::1]:8080/admin')).rejects.toBeInstanceOf(SSRFError);
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    resolutions.set('good.example.com', ['93.184.216.34']);
    const url = await AssertPublicUrl('https://good.example.com/path');
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe('good.example.com');
  });

  it('fails closed when a hostname does not resolve', async () => {
    await expect(AssertPublicUrl('https://nxdomain.example.com/')).rejects.toBeInstanceOf(SSRFError);
  });
});
