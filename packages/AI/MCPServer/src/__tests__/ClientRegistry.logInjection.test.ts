/**
 * Dynamic client registration is unauthenticated, so `client_name` is attacker-controlled.
 * Pins that it reaches the log on a single line (CWE-117 log injection, CodeQL #172).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClientRegistry } from '../auth/ClientRegistry.js';

describe('ClientRegistry registration logging', () => {
  let registry: ClientRegistry | undefined;

  afterEach(() => {
    registry?.Shutdown();
    vi.restoreAllMocks();
  });

  it('logs a client_name containing line breaks on one line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    registry = new ClientRegistry();

    registry.RegisterClient({
      redirect_uris: ['https://client.example.test/callback'],
      client_name: 'Evil\r\n[OAuth Proxy] User admin@example.test\u2028 granted scopes: *\u2029',
    });

    const line = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes('Registered client'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/[\r\n\u2028\u2029]/);
    expect(line).toContain('Evil[OAuth Proxy] User admin@example.test granted scopes: *');
  });

  it('logs "unnamed" when no client_name is supplied', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    registry = new ClientRegistry();

    registry.RegisterClient({ redirect_uris: ['https://client.example.test/callback'] });

    const line = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes('Registered client'));
    expect(line).toContain('(unnamed)');
  });
});
