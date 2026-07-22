/**
 * Unit tests for WorkOSProvider.
 *
 * Covers the two pieces of logic the provider owns on top of BaseAuthProvider:
 *   - extractUserInfo(): mapping WorkOS AuthKit JWT claims → AuthUserInfo, including the
 *     fallbacks that keep a usable identity when a custom JWT Template only sets `name`.
 *   - validateConfig(): the WorkOS-specific requirement (clientId) on top of the base fields.
 *
 * It also asserts the provider registers with the class factory under the `workos` key, which
 * is what makes `AuthProviderFactory.createProvider({ type: 'workos', ... })` resolve it.
 */
import { describe, it, expect } from 'vitest';
import type { JwtPayload } from 'jsonwebtoken';
import { MJGlobal } from '@memberjunction/global';
import { AuthProviderConfig } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider';
import { WorkOSProvider } from '../providers/WorkOSProvider';

const CLIENT_ID = 'client_01HABCDEF';

function makeConfig(overrides: Partial<AuthProviderConfig> = {}): AuthProviderConfig {
  return {
    name: 'workos-test',
    type: 'workos',
    issuer: `https://api.workos.com/user_management/${CLIENT_ID}`,
    audience: CLIENT_ID,
    jwksUri: `https://api.workos.com/sso/jwks/${CLIENT_ID}`,
    clientId: CLIENT_ID,
    ...overrides,
  };
}

function makeProvider(overrides: Partial<AuthProviderConfig> = {}): WorkOSProvider {
  return new WorkOSProvider(makeConfig(overrides));
}

describe('WorkOSProvider', () => {
  describe('extractUserInfo', () => {
    it('maps a token shaped by the recommended JWT Template (email + given/family name)', () => {
      const provider = makeProvider();
      const payload: JwtPayload = {
        sub: 'user_01HXYZ',
        email: 'ada@example.com',
        given_name: 'Ada',
        family_name: 'Lovelace',
      };

      const info = provider.extractUserInfo(payload);

      expect(info.email).toBe('ada@example.com');
      expect(info.firstName).toBe('Ada');
      expect(info.lastName).toBe('Lovelace');
      // No preferred_username on WorkOS tokens — falls back to email.
      expect(info.preferredUsername).toBe('ada@example.com');
      // `sub` is surfaced as the provider user id.
      expect(info.userId).toBe('user_01HXYZ');
    });

    it('derives first/last name from a single `name` claim when given/family are absent', () => {
      const provider = makeProvider();
      const payload: JwtPayload = {
        sub: 'user_01HXYZ',
        email: 'grace.hopper@example.com',
        name: 'Grace Hopper',
      };

      const info = provider.extractUserInfo(payload);

      expect(info.fullName).toBe('Grace Hopper');
      expect(info.firstName).toBe('Grace');
      expect(info.lastName).toBe('Hopper');
    });

    it('falls back to the single name token for both first and last when name has one word', () => {
      const provider = makeProvider();
      const payload: JwtPayload = { sub: 'user_1', email: 'cher@example.com', name: 'Cher' };

      const info = provider.extractUserInfo(payload);

      expect(info.firstName).toBe('Cher');
      expect(info.lastName).toBe('Cher');
    });

    it('prefers explicit given_name/family_name over the `name` split', () => {
      const provider = makeProvider();
      const payload: JwtPayload = {
        sub: 'user_2',
        email: 'jean.luc@example.com',
        name: 'Wrong Split',
        given_name: 'Jean-Luc',
        family_name: 'Picard',
      };

      const info = provider.extractUserInfo(payload);

      expect(info.firstName).toBe('Jean-Luc');
      expect(info.lastName).toBe('Picard');
    });

    it('honors an explicit preferred_username when present', () => {
      const provider = makeProvider();
      const payload: JwtPayload = {
        sub: 'user_3',
        email: 'alan@example.com',
        preferred_username: 'aturing',
      };

      const info = provider.extractUserInfo(payload);

      expect(info.preferredUsername).toBe('aturing');
    });

    it('returns undefined email (rather than throwing) when no JWT Template added it', () => {
      // This is the default WorkOS access token shape — identity/session claims only.
      const provider = makeProvider();
      const payload: JwtPayload = {
        sub: 'user_4',
        sid: 'session_01H',
        org_id: 'org_01H',
        role: 'admin',
      };

      const info = provider.extractUserInfo(payload);

      expect(info.email).toBeUndefined();
      expect(info.userId).toBe('user_4');
      expect(info.preferredUsername).toBeUndefined();
    });
  });

  describe('validateConfig', () => {
    it('is valid with the full WorkOS config (base fields + clientId)', () => {
      expect(makeProvider().validateConfig()).toBe(true);
    });

    it('is invalid without a clientId', () => {
      expect(makeProvider({ clientId: undefined }).validateConfig()).toBe(false);
    });

    it('is invalid when a base field (audience) is missing', () => {
      expect(makeProvider({ audience: '' }).validateConfig()).toBe(false);
    });

    it('exposes clientId on the instance for the OAuth proxy path', () => {
      expect(makeProvider().clientId).toBe(CLIENT_ID);
    });
  });

  describe('class-factory registration', () => {
    it('is registered under the lowercase `workos` key and instantiable via the factory', () => {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAuthProvider>(
        BaseAuthProvider,
        'workos',
        makeConfig(),
      );

      expect(instance).toBeInstanceOf(WorkOSProvider);
    });
  });

  describe('issuer matching (inherited)', () => {
    it('matches its configured issuer case-insensitively and ignores a trailing slash', () => {
      const provider = makeProvider();
      expect(provider.matchesIssuer(`https://api.workos.com/user_management/${CLIENT_ID}`)).toBe(true);
      expect(provider.matchesIssuer(`https://api.workos.com/user_management/${CLIENT_ID}/`)).toBe(true);
      expect(provider.matchesIssuer('https://api.workos.com/user_management/other')).toBe(false);
    });
  });
});
