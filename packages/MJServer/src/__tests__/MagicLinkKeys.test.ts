import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

const logDoubles = vi.hoisted(() => ({
  LogWarning: vi.fn(),
  LogStatusEx: vi.fn(),
}));

vi.mock('@memberjunction/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogWarning: logDoubles.LogWarning, LogStatusEx: logDoubles.LogStatusEx };
});

import { GetGlobalObjectStore } from '@memberjunction/global';
import {
  MagicLinkKeyManager,
  IsMagicLinkLocalDevEnvironment,
  EPHEMERAL_MAGIC_LINK_KEY_WARNING,
} from '../auth/magicLink/MagicLinkKeys.js';

/** Subclass so each test gets its own singleton slot instead of sharing the app-wide instance. */
class IsolatedKeyManager extends MagicLinkKeyManager {}

function freshManager(): IsolatedKeyManager {
  const manager = new IsolatedKeyManager();
  const store = GetGlobalObjectStore();
  if (store) {
    delete store[manager.GlobalKey];
  }
  return new IsolatedKeyManager();
}

describe('IsMagicLinkLocalDevEnvironment', () => {
  it('treats NODE_ENV=production (any case, padded) as not local dev', () => {
    expect(IsMagicLinkLocalDevEnvironment({ NODE_ENV: 'production' })).toBe(false);
    expect(IsMagicLinkLocalDevEnvironment({ NODE_ENV: ' Production ' })).toBe(false);
  });

  it('treats unset, development and test as local dev', () => {
    expect(IsMagicLinkLocalDevEnvironment({})).toBe(true);
    expect(IsMagicLinkLocalDevEnvironment({ NODE_ENV: 'development' })).toBe(true);
    expect(IsMagicLinkLocalDevEnvironment({ NODE_ENV: 'test' })).toBe(true);
  });
});

describe('MagicLinkKeyManager ephemeral key reporting', () => {
  let manager: IsolatedKeyManager;

  beforeEach(() => {
    logDoubles.LogWarning.mockClear();
    logDoubles.LogStatusEx.mockClear();
    manager = freshManager();
  });

  afterEach(() => {
    const store = GetGlobalObjectStore();
    if (store) {
      delete store[manager.GlobalKey];
    }
  });

  it('warns in the default output when no key is configured and NODE_ENV=production', () => {
    manager.Initialize(undefined, { NODE_ENV: 'production' });

    expect(manager.IsEphemeral).toBe(true);
    expect(logDoubles.LogWarning).toHaveBeenCalledTimes(1);
    expect(logDoubles.LogWarning).toHaveBeenCalledWith(EPHEMERAL_MAGIC_LINK_KEY_WARNING);
    expect(logDoubles.LogStatusEx).not.toHaveBeenCalled();
  });

  it('the warning names the restart and multi-instance consequences and how to configure a key', () => {
    expect(EPHEMERAL_MAGIC_LINK_KEY_WARNING).toContain('restarts');
    expect(EPHEMERAL_MAGIC_LINK_KEY_WARNING).toContain('other MJAPI instance');
    expect(EPHEMERAL_MAGIC_LINK_KEY_WARNING).toContain('magicLink.rsaPrivateKey');
    expect(EPHEMERAL_MAGIC_LINK_KEY_WARNING).toContain('MJ_MAGIC_LINK_PRIVATE_KEY');
  });

  it('keeps the notice verbose-only in local dev', () => {
    manager.Initialize(undefined, {});

    expect(manager.IsEphemeral).toBe(true);
    expect(logDoubles.LogWarning).not.toHaveBeenCalled();
    expect(logDoubles.LogStatusEx).toHaveBeenCalledTimes(1);
    expect(logDoubles.LogStatusEx.mock.calls[0][0]).toMatchObject({ verboseOnly: true });
  });

  it('is not ephemeral and logs nothing when a key is configured, even in production', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    manager.Initialize(pem, { NODE_ENV: 'production' });

    expect(manager.IsEphemeral).toBe(false);
    expect(logDoubles.LogWarning).not.toHaveBeenCalled();
    expect(logDoubles.LogStatusEx).not.toHaveBeenCalled();
  });

  it('reports IsEphemeral false before initialization', () => {
    expect(manager.IsEphemeral).toBe(false);
    expect(manager.IsInitialized).toBe(false);
  });
});
