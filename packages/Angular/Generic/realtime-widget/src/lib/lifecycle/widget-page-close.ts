/**
 * The tab-close half of ending a call.
 *
 * THE GAP THIS CLOSES. The server session is closed when the overlay's End path runs — so a visitor who
 * closes the TAB mid-call leaves the `MJ: AI Agent Sessions` row `Active`, and everything that waits on
 * the session ending (the janitor's idle sweep, anything downstream of the close) waits with it.
 *
 * WHY `pagehide` AND NOT THE ALTERNATIVES (a decision lifted from the Caliber widget):
 *   - `visibilitychange` fires on a mere TAB SWITCH — glancing at another tab must not end the call;
 *   - `beforeunload` is unreliable on mobile Safari and suppresses the bfcache;
 *   - `pagehide` is the terminal signal — and `event.persisted === true` means the page entered the
 *     bfcache and may come back, so only a NON-persisted hide closes.
 *
 * This module owns the DECISION; the live edge (a keepalive fetch, which — unlike a normal GraphQL call —
 * survives page teardown, and unlike `sendBeacon` can carry the Authorization header) is injected, so every
 * branch runs under a plain node test.
 */

/** Sends the close over a transport that survives page teardown (live edge: a keepalive fetch). */
export type PageCloseSendPort = (url: string, token: string, agentSessionId: string) => void;

/** Reads the live GraphQL endpoint and bearer token; null when nothing is configured yet. */
export type PageCloseConfigPort = () => { url: string; token: string } | null;

export interface WidgetPageCloseDeps {
  config: PageCloseConfigPort;
  send: PageCloseSendPort;
}

export class WidgetPageClose {
  private agentSessionId: string | null = null;

  constructor(private readonly deps: WidgetPageCloseDeps) {}

  /** Arms with the live session's id; a pagehide before this is a no-op. */
  public Arm(agentSessionId: string): void {
    this.agentSessionId = agentSessionId;
  }

  /** Disarms after the session ended some other way — the close is idempotent, but the pagehide stays quiet. */
  public Disarm(): void {
    this.agentSessionId = null;
  }

  /** Whether a live session is armed. */
  public get IsArmed(): boolean {
    return this.agentSessionId !== null;
  }

  /**
   * The pagehide decision. `persisted` is the event's bfcache flag — a persisted page may come back, so it
   * does NOT close. Returns whether a close was sent.
   */
  public OnPageHide(persisted: boolean): boolean {
    if (persisted) {
      return false;
    }
    return this.closeNow();
  }

  /**
   * The IN-PAGE teardown signal: the element was removed from the page (an SPA navigation) with a call still
   * up. The same decision a terminal pagehide makes. Returns whether a close was sent.
   */
  public OnHostTeardown(): boolean {
    return this.closeNow();
  }

  private closeNow(): boolean {
    const sessionId = this.agentSessionId;
    if (sessionId === null) {
      return false;
    }
    const config = this.deps.config();
    if (config === null) {
      return false;
    }
    this.agentSessionId = null; // exactly once
    this.deps.send(config.url, config.token, sessionId);
    return true;
  }
}
