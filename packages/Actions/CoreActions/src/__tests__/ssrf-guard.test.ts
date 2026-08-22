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

import { assertPublicUrl, isBlockedIPAddress, SSRFError } from '../custom/utilities/ssrf-guard';

beforeEach(() => {
  resolutions.clear();
});

// =====================================================================
// isBlockedIPAddress — pure classifier
// =====================================================================
describe('isBlockedIPAddress', () => {
  it('blocks IPv4 loopback (127.0.0.1)', () => {
    expect(isBlockedIPAddress('127.0.0.1')).toBe(true);
  });

  it('blocks the cloud metadata address (169.254.169.254)', () => {
    expect(isBlockedIPAddress('169.254.169.254')).toBe(true);
  });

  it('blocks private 10.x', () => {
    expect(isBlockedIPAddress('10.1.2.3')).toBe(true);
  });

  it('blocks private 192.168.x', () => {
    expect(isBlockedIPAddress('192.168.0.5')).toBe(true);
  });

  it('blocks private 172.16-31.x', () => {
    expect(isBlockedIPAddress('172.16.5.5')).toBe(true);
    expect(isBlockedIPAddress('172.31.255.255')).toBe(true);
    // 172.32.x is NOT private
    expect(isBlockedIPAddress('172.32.0.1')).toBe(false);
  });

  it('blocks CGNAT 100.64/10 and 0.0.0.0/8', () => {
    expect(isBlockedIPAddress('100.64.0.1')).toBe(true);
    expect(isBlockedIPAddress('0.0.0.0')).toBe(true);
  });

  it('blocks IPv6 loopback (::1)', () => {
    expect(isBlockedIPAddress('::1')).toBe(true);
  });

  it('blocks IPv6 unspecified (::)', () => {
    expect(isBlockedIPAddress('::')).toBe(true);
  });

  it('blocks IPv6 ULA (fc00::/7) and link-local (fe80::/10)', () => {
    expect(isBlockedIPAddress('fc00::1')).toBe(true);
    expect(isBlockedIPAddress('fd12:3456::1')).toBe(true);
    expect(isBlockedIPAddress('fe80::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
    expect(isBlockedIPAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 metadata (::ffff:169.254.169.254)', () => {
    expect(isBlockedIPAddress('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows public IPv4 (8.8.8.8, 1.1.1.1)', () => {
    expect(isBlockedIPAddress('8.8.8.8')).toBe(false);
    expect(isBlockedIPAddress('1.1.1.1')).toBe(false);
  });

  it('allows public IPv6 (2606:4700:4700::1111)', () => {
    expect(isBlockedIPAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('fails closed on an unparseable address', () => {
    expect(isBlockedIPAddress('not-an-ip')).toBe(true);
  });
});

// =====================================================================
// assertPublicUrl — scheme + resolved-address enforcement
// =====================================================================
describe('assertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('ftp://example.com/file')).rejects.toBeInstanceOf(SSRFError);
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SSRFError);
  });

  it('rejects a malformed URL', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a hostname that resolves to a private address', async () => {
    resolutions.set('evil.example.com', ['10.0.0.5']);
    await expect(assertPublicUrl('https://evil.example.com/')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a hostname where ANY resolved address is private (rebinding defense)', async () => {
    resolutions.set('mixed.example.com', ['8.8.8.8', '127.0.0.1']);
    await expect(assertPublicUrl('https://mixed.example.com/')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a literal metadata IP host', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(SSRFError);
  });

  it('blocks a literal IPv6 loopback host', async () => {
    await expect(assertPublicUrl('http://[::1]:8080/admin')).rejects.toBeInstanceOf(SSRFError);
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    resolutions.set('good.example.com', ['93.184.216.34']);
    const url = await assertPublicUrl('https://good.example.com/path');
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe('good.example.com');
  });

  it('fails closed when a hostname does not resolve', async () => {
    await expect(assertPublicUrl('https://nxdomain.example.com/')).rejects.toBeInstanceOf(SSRFError);
  });
});
