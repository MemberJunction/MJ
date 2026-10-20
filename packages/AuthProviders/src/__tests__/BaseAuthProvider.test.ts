/**
 * Unit tests for BaseAuthProvider.Dispose() (memory-leak audit 2026-09-19, High finding #3).
 *
 * Each BaseAuthProvider instance owns a keep-alive https.Agent/http.Agent backing its
 * jwksClient. Before this fix, that agent was a constructor-local variable with no way for a
 * caller to release it, so `AuthProviderFactory.register()`/`clear()` replacing or dropping a
 * provider left its socket pool open until the agent's own 60s idle timeout.
 */
import { describe, it, expect, vi } from 'vitest';
import type { JwtPayload } from 'jsonwebtoken';
import https from 'https';
import http from 'http';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider';

class TestAuthProvider extends BaseAuthProvider {
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    return { userId: payload.sub ?? '', email: '', firstName: '', lastName: '', preferredUsername: '' };
  }
}

function makeConfig(overrides: Partial<AuthProviderConfig> = {}): AuthProviderConfig {
  return {
    name: 'test-provider',
    type: 'test',
    issuer: 'https://example.com/',
    audience: 'test-aud',
    jwksUri: 'https://example.com/.well-known/jwks.json',
    ...overrides,
  };
}

describe('BaseAuthProvider.Dispose', () => {
  it('destroys the https.Agent backing the jwksClient when jwksUri is https', () => {
    const destroySpy = vi.spyOn(https.Agent.prototype, 'destroy');
    const provider = new TestAuthProvider(makeConfig());
    const agent = (provider as unknown as { requestAgent: https.Agent }).requestAgent;
    expect(agent).toBeInstanceOf(https.Agent);

    provider.Dispose();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(destroySpy.mock.instances[0]).toBe(agent);
    destroySpy.mockRestore();
  });

  it('destroys the http.Agent when jwksUri is plain http (non-TLS test/dev endpoints)', () => {
    const destroySpy = vi.spyOn(http.Agent.prototype, 'destroy');
    const provider = new TestAuthProvider(makeConfig({ jwksUri: 'http://localhost:4000/.well-known/jwks.json' }));
    const agent = (provider as unknown as { requestAgent: http.Agent }).requestAgent;
    expect(agent).toBeInstanceOf(http.Agent);

    provider.Dispose();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(destroySpy.mock.instances[0]).toBe(agent);
    destroySpy.mockRestore();
  });

  it('is safe to call more than once', () => {
    const provider = new TestAuthProvider(makeConfig());

    expect(() => {
      provider.Dispose();
      provider.Dispose();
    }).not.toThrow();
  });

  it("does not affect a different provider instance's agent", () => {
    const destroySpy = vi.spyOn(https.Agent.prototype, 'destroy');
    const providerA = new TestAuthProvider(makeConfig({ name: 'a' }));
    const providerB = new TestAuthProvider(makeConfig({ name: 'b' }));
    const agentB = (providerB as unknown as { requestAgent: https.Agent }).requestAgent;

    providerA.Dispose();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(destroySpy.mock.instances[0]).not.toBe(agentB);
    destroySpy.mockRestore();
  });
});
