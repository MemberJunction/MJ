import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceSessionService } from '../lib/services/voice-session.service';

describe('VoiceSessionService — Minimized$ presentation state', () => {
  let service: VoiceSessionService;

  beforeEach(() => {
    service = new VoiceSessionService();
  });

  it('starts NOT minimized', () => {
    expect(service.IsMinimized).toBe(false);
  });

  it('SetMinimized(true) flips the state and emits on Minimized$', () => {
    const seen: boolean[] = [];
    service.Minimized$.subscribe(v => seen.push(v));

    service.SetMinimized(true);
    expect(service.IsMinimized).toBe(true);

    service.SetMinimized(false);
    expect(service.IsMinimized).toBe(false);

    expect(seen).toEqual([false, true, false]);
  });

  it('is idempotent — repeated same-value calls do not re-emit', () => {
    const seen: boolean[] = [];
    service.Minimized$.subscribe(v => seen.push(v));

    service.SetMinimized(true);
    service.SetMinimized(true);
    service.SetMinimized(true);

    expect(seen).toEqual([false, true]);
  });

  it('exposes no agent session id before a session is minted', () => {
    expect(service.CurrentAgentSessionId).toBeNull();
  });
});
