/**
 * Remembers, for ONE TAB, enough to carry a visitor across a reload without asking them to start over:
 * the session JWT the widget holds (so a single-use invite link that was redeemed and then removed from
 * the address bar still works after a reload), and the last session's ids (so the next start can chain to
 * it and its channels' saved state resumes).
 *
 * Lifted from the Caliber widget's resume-token store and cut down to what is generic. What Caliber kept
 * and this does not: the multi-tier cookie/localStorage backends and the cross-tab resume window — those
 * serve an assessment-specific, server-signed "reattach to my in-flight interview" flow. This store is
 * `sessionStorage` only: it dies with the tab, which is the right lifetime for an anonymous visitor's
 * credential.
 *
 * SANCTIONED EXCEPTION TO THE no-`localStorage` RULE (the rule governs authenticated user PREFERENCES,
 * which go through `UserInfoEngine`): this is anonymous session CONTINUITY — a signed, expiring credential
 * and opaque ids — not a preference. The blob holds NO email, name or any other PII, and expiry is enforced
 * on read.
 *
 * Storage is injected so the store is unit-testable without a DOM; production wires `sessionStorage`.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What is remembered. */
export interface ResumeBundle {
  /** The session JWT, when one is held. */
  jwt: string | null;
  /** When the JWT stops being usable (epoch ms); `null` when unknown. */
  jwtExpiresAtMs: number | null;
  /** The last session this tab ran. */
  lastSessionId: string | null;
  /** The conversation that session belonged to. */
  conversationId: string | null;
  /** When this was last written (epoch ms). */
  savedAtMs: number;
}

/** How long a remembered session id stays offered for chaining. */
export const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'mj.realtimeWidget.resume.v1:';

/** Browser `sessionStorage`, or null when unavailable (privacy modes throw on access). */
export function BrowserSessionStorage(): StorageLike | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    // sessionStorage access can throw in privacy modes — degrade to no memory, which is still correct.
    return null;
  }
}

export class WidgetResumeStore {
  private readonly storageKey: string;

  /**
   * @param scope Distinguishes widgets on one origin (the api-url plus the widget key or agent), so two
   *   deployments never read each other's bundle.
   */
  constructor(
    scope: string,
    private readonly storage: StorageLike | null = BrowserSessionStorage(),
    private readonly now: () => number = () => Date.now()
  ) {
    this.storageKey = `${KEY_PREFIX}${scope}`;
  }

  /** The remembered bundle, or null when there is none, it is malformed, or it has expired (and then it is cleared). */
  public Read(): ResumeBundle | null {
    if (!this.storage) {
      return null;
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch {
      return null;
    }
    if (raw === null) {
      return null;
    }
    const bundle = parseBundle(raw);
    if (bundle === null || this.now() - bundle.savedAtMs > RESUME_MAX_AGE_MS) {
      this.Clear();
      return null;
    }
    return this.dropExpiredJwt(bundle);
  }

  /** The JWT to reuse, or null when none is remembered or it has expired. */
  public ReadJwt(): string | null {
    return this.Read()?.jwt ?? null;
  }

  /** Remembers the held JWT, keeping whatever else is remembered. */
  public WriteJwt(jwt: string, expiresAtMs: number | null): void {
    this.write({ ...this.base(), jwt, jwtExpiresAtMs: expiresAtMs });
  }

  /** Remembers the session this tab just ran, keeping the JWT. */
  public WriteSession(sessionId: string, conversationId: string | null): void {
    this.write({ ...this.base(), lastSessionId: sessionId, conversationId });
  }

  /** Forgets everything (the visitor ended the call and chose to start over, or the credential is spent). */
  public Clear(): void {
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      // Nothing to clear if storage will not even answer.
    }
  }

  private base(): ResumeBundle {
    return this.Read() ?? { jwt: null, jwtExpiresAtMs: null, lastSessionId: null, conversationId: null, savedAtMs: this.now() };
  }

  private write(bundle: ResumeBundle): void {
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(this.storageKey, JSON.stringify({ ...bundle, savedAtMs: this.now() }));
    } catch (error) {
      // Quota or a locked-down browser: the widget works without memory, so say so once and carry on.
      console.warn('[mj-realtime-widget] Could not remember this session for a reload:', error);
    }
  }

  private dropExpiredJwt(bundle: ResumeBundle): ResumeBundle {
    if (bundle.jwt !== null && bundle.jwtExpiresAtMs !== null && bundle.jwtExpiresAtMs <= this.now()) {
      return { ...bundle, jwt: null, jwtExpiresAtMs: null };
    }
    return bundle;
  }
}

function parseBundle(raw: string): ResumeBundle | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const rec = parsed as Record<string, unknown>;
  const saved = rec['savedAtMs'];
  if (typeof saved !== 'number' || !Number.isFinite(saved)) {
    return null;
  }
  const text = (key: string): string | null => (typeof rec[key] === 'string' && (rec[key] as string).length > 0 ? (rec[key] as string) : null);
  const expires = rec['jwtExpiresAtMs'];
  return {
    jwt: text('jwt'),
    jwtExpiresAtMs: typeof expires === 'number' && Number.isFinite(expires) ? expires : null,
    lastSessionId: text('lastSessionId'),
    conversationId: text('conversationId'),
    savedAtMs: saved
  };
}
