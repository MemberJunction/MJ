import { describe, it, expect, beforeEach } from 'vitest';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';

/**
 * The agent SPEAKING FIRST — before the human has said anything.
 *
 * Every other path into the model's voice is reactive: the human spoke, or a channel reported
 * input. Without an explicit opener a host that needs the agent to start the conversation gets a
 * connected session in which both sides wait for the other, and nothing in the API says why.
 *
 * These drive the service through its private surface, the same way the other session-service
 * tests do — no Angular TestBed, no realtime driver.
 */

/** The private members under test — declared, so the casts stay honest. */
interface SpokenOpeningInternals {
  client: FakeRealtimeClient | null;
  _connectionState$: { next(state: string): void };
}

class FakeRealtimeClient {
  public SpokenUpdates: string[] = [];
  public RequestSpokenUpdate(instructions: string): void {
    this.SpokenUpdates.push(instructions);
  }
}

function internals(service: RealtimeSessionService): SpokenOpeningInternals {
  return service as unknown as SpokenOpeningInternals;
}

describe('RealtimeSessionService.RequestSpokenOpening', () => {
  let service: RealtimeSessionService;
  let client: FakeRealtimeClient;

  beforeEach(() => {
    service = new RealtimeSessionService();
    client = new FakeRealtimeClient();
    internals(service).client = client;
  });

  it('asks the live model to speak, and reports that it was delivered', () => {
    internals(service)._connectionState$.next('listening');

    const delivered = service.RequestSpokenOpening('Greet the candidate and ask them to introduce themselves.');

    expect(delivered).toBe(true);
    expect(client.SpokenUpdates).toEqual(['Greet the candidate and ask them to introduce themselves.']);
  });

  it('trims the instructions before sending them', () => {
    internals(service)._connectionState$.next('listening');

    service.RequestSpokenOpening('   Say hello.   ');

    expect(client.SpokenUpdates).toEqual(['Say hello.']);
  });

  it.each(['speaking', 'thinking'])("delivers while the session is '%s'", (state) => {
    internals(service)._connectionState$.next(state);

    expect(service.RequestSpokenOpening('Open the conversation.')).toBe(true);
    expect(client.SpokenUpdates).toHaveLength(1);
  });

  it('reports FALSE rather than silently dropping the opener when no session is live', () => {
    // The reason this returns a boolean at all while SendContextNote beside it does not: a
    // dropped context note costs the model a little perception, whereas a dropped opening line
    // is a session that sits in silence. A host that asked too early can retry — but only if it
    // is told, so the two must not look the same.
    internals(service)._connectionState$.next('connecting');

    expect(service.RequestSpokenOpening('Open the conversation.')).toBe(false);
    expect(client.SpokenUpdates).toEqual([]);
  });

  it('reports FALSE when there is no client at all', () => {
    internals(service)._connectionState$.next('listening');
    internals(service).client = null;

    expect(service.RequestSpokenOpening('Open the conversation.')).toBe(false);
  });

  it.each(['', '   '])('drops empty instructions (%j) without calling the client', (instructions) => {
    internals(service)._connectionState$.next('listening');

    expect(service.RequestSpokenOpening(instructions)).toBe(false);
    expect(client.SpokenUpdates).toEqual([]);
  });
});
