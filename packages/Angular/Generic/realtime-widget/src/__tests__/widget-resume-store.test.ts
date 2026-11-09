import { describe, it, expect, vi, afterEach } from 'vitest';
import { RESUME_MAX_AGE_MS, WidgetResumeStore, type StorageLike } from '../lib/resume/widget-resume-store';
import { MemoryStorage } from './widget-test-kit';

const T0 = 1_800_000_000_000;

function store(storage: StorageLike | null = new MemoryStorage(), clock: { now: number } = { now: T0 }, scope = 'https://a|k') {
  return { store: new WidgetResumeStore(scope, storage, () => clock.now), clock, storage };
}

describe('WidgetResumeStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('remembers the JWT and the last session for this tab', () => {
    const { store: s } = store();
    s.WriteJwt('jwt', T0 + 3_600_000);
    s.WriteSession('sess-1', 'conv-1');
    expect(s.Read()).toMatchObject({ jwt: 'jwt', lastSessionId: 'sess-1', conversationId: 'conv-1' });
    expect(s.ReadJwt()).toBe('jwt');
  });

  it('keeps what it already knows when it learns something new', () => {
    const { store: s } = store();
    s.WriteSession('sess-1', null);
    s.WriteJwt('jwt', null);
    expect(s.Read()).toMatchObject({ jwt: 'jwt', lastSessionId: 'sess-1' });
  });

  it('forgets an expired JWT but keeps the session ids, and forgets everything past the max age', () => {
    const { store: s, clock } = store();
    s.WriteJwt('jwt', T0 + 1000);
    s.WriteSession('sess-1', 'conv-1');
    clock.now = T0 + 2000;
    expect(s.Read()).toMatchObject({ jwt: null, lastSessionId: 'sess-1' });
    clock.now = T0 + RESUME_MAX_AGE_MS + 1;
    expect(s.Read()).toBeNull();
  });

  it('clears a malformed or stale blob rather than choking on it', () => {
    const storage = new MemoryStorage();
    const { store: s } = store(storage);
    storage.setItem('mj.realtimeWidget.resume.v1:https://a|k', '{not json');
    expect(s.Read()).toBeNull();
    expect(storage.Data.size).toBe(0);
    storage.setItem('mj.realtimeWidget.resume.v1:https://a|k', JSON.stringify({ jwt: 'x' })); // no savedAtMs
    expect(s.Read()).toBeNull();
  });

  it('holds no PII: only an opaque credential and ids are ever written', () => {
    const storage = new MemoryStorage();
    const { store: s } = store(storage);
    s.WriteJwt('jwt', T0 + 1000);
    s.WriteSession('sess-1', 'conv-1');
    const raw = [...storage.Data.values()][0];
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['conversationId', 'jwt', 'jwtExpiresAtMs', 'lastSessionId', 'savedAtMs']);
  });

  it('scopes by deployment: two widgets never read each other\'s memory', () => {
    const storage = new MemoryStorage();
    const a = store(storage, { now: T0 }, 'https://a|k1').store;
    const b = store(storage, { now: T0 }, 'https://a|k2').store;
    a.WriteJwt('jwt-a', null);
    expect(b.ReadJwt()).toBeNull();
  });

  it('Clear forgets everything', () => {
    const { store: s } = store();
    s.WriteJwt('jwt', null);
    s.Clear();
    expect(s.Read()).toBeNull();
  });

  it('works — remembering nothing — with no storage at all (a locked-down browser)', () => {
    const { store: s } = store(null);
    expect(() => s.WriteJwt('jwt', null)).not.toThrow();
    expect(s.Read()).toBeNull();
    expect(() => s.Clear()).not.toThrow();
  });

  it('survives storage that throws on every call, warning when a write is lost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hostile: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); }
    };
    const { store: s } = store(hostile);
    expect(s.Read()).toBeNull();
    expect(() => s.WriteJwt('jwt', null)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(() => s.Clear()).not.toThrow();
  });
});
