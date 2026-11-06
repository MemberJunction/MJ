/**
 * Mints and refreshes an anonymous guest session from a public widget key, over the server's EXISTING
 * widget endpoints (`POST /widget/session`, `POST /widget/session/refresh` — see `WidgetRouter` in
 * `@memberjunction/server`). No new server path: the widget key names a `ConversationWidgetInstance`, whose
 * allowed origins, pinned agent and limits the server enforces; this client only carries the exchange.
 *
 * The token is auth state (not a user preference), held in memory by the caller. Everything else about the
 * response — the application, the pinned agent, the voice ceiling, the channels the instance enables — is
 * what the server decided, and is returned as such.
 */
import { CreateProofOfPossessionJwt, CreateProofOfPossessionKey, TrimTrailingSlashes, type ProofOfPossessionKey } from '@memberjunction/global';

/** Modalities a widget instance may expose. */
export type WidgetKeyModality = 'Text' | 'Voice' | 'Both';

/** What the server decided for this guest. */
export interface WidgetGuestSession {
  token: string;
  /**
   * When the token expires (epoch ms), on THIS browser's clock: the server's expiry less the offset learned from the
   * token's `iat`, so `expiresAtMs - Date.now()` is the time the token really has left on a device whose clock is off.
   */
  expiresAtMs: number;
  widgetId: string;
  applicationId: string;
  /** The agent the instance pins. The server only lets this guest start a session with it. */
  pinnedAgentId: string;
  modality: WidgetKeyModality;
  /** The server's hard ceiling on a voice session, in minutes, when it set one. */
  voiceMaxSessionMinutes: number | null;
  /** Channels (by name) the instance enables for voice sessions. */
  enabledChannels: string[];
}

/** A failure the visitor can be told about. `code` is the server's (`origin_not_allowed`, `not_found`, …). */
export class WidgetKeyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number | null
  ) {
    super(message);
    this.name = 'WidgetKeyError';
  }
}

/** Injectable `fetch`, so the client runs under a plain node test. */
export type FetchLike = (
  input: string,
  init?: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const FIFTEEN_MINUTES_MS = 15 * 60_000;

export class WidgetKeyClient {
  private readonly baseUrl: string;
  /**
   * The key the current session is bound to: created at each mint, held only in memory, and never exportable.
   * The server signs its thumbprint into the token and requires refresh to be signed with it, so a token copied
   * off this page cannot be renewed elsewhere.
   */
  private proofKey: ProofOfPossessionKey | null = null;
  /**
   * How far the server's clock is ahead of this browser's (ms), learned from the `iat` of each token the server
   * issues. A visitor's device clock can be minutes off, and the server refuses a refresh proof more than 60 s from
   * its own time, so the proof is signed on server time. The token's `iat` rather than the HTTP `Date` header,
   * because a cross-origin embed cannot read `Date` (not CORS-safelisted). The web widget's `WidgetSessionClient`
   * (`@memberjunction/realtime-widget`) does the same; the two packages share no code, so this is deliberate.
   */
  private serverOffsetMs = 0;

  constructor(
    apiUrl: string,
    private readonly widgetKey: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {
    this.baseUrl = TrimTrailingSlashes(apiUrl);
  }

  /** Mints a fresh guest session. Throws {@link WidgetKeyError}. */
  public async Mint(): Promise<WidgetGuestSession> {
    const key = await CreateProofOfPossessionKey();
    const session = await this.call('/widget/session', key);
    this.proofKey = key;
    return session;
  }

  /** Re-mints by the same key while presenting the current session token so `mj_sid` is preserved. Throws {@link WidgetKeyError}. */
  public async Refresh(currentToken: string): Promise<WidgetGuestSession> {
    if (!this.proofKey) {
      throw new WidgetKeyError('A guest session refresh needs the key registered at mint; call Mint first.', 'no_proof_key', null);
    }
    return this.call('/widget/session/refresh', this.proofKey, currentToken);
  }

  /**
   * POSTs to a session endpoint. A mint (no `bearerToken`) registers `key`'s public half; a refresh sends the token
   * and a proof signed by `key` for this URL and token.
   */
  private async call(path: string, key: ProofOfPossessionKey, bearerToken?: string): Promise<WidgetGuestSession> {
    let response: Awaited<ReturnType<FetchLike>>;
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const request: Record<string, unknown> = { widgetKey: this.widgetKey };
    if (bearerToken) {
      headers['authorization'] = `Bearer ${bearerToken}`;
      headers['dpop'] = await CreateProofOfPossessionJwt(key, {
        Method: 'POST',
        Url: url,
        AccessToken: bearerToken,
        NowSeconds: Math.floor((Date.now() + this.serverOffsetMs) / 1000)
      });
    } else {
      request['proofKey'] = key.PublicJwk;
    }
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });
    } catch (error) {
      throw new WidgetKeyError(`Could not reach the server: ${error instanceof Error ? error.message : String(error)}`, 'network', null);
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body (a proxy error page, an empty 502) is not a result; the status below says what happened.
    }
    return this.toSession(response.ok, response.status, body);
  }

  /**
   * Records the server's clock offset from a token it just issued (`iat` is its "now"), off by the response's one-way
   * latency, far inside the server's 60 s window. A token without a readable `iat` keeps the previous offset: the
   * server stamps `iat` on every token it signs, so this is never a guess about server time.
   */
  private learnServerOffset(token: string): void {
    const iat = readIssuedAtSeconds(token);
    if (iat !== null) {
      this.serverOffsetMs = iat * 1000 - Date.now();
    }
  }

  /** Validates the untrusted response body into a session, or throws. */
  private toSession(ok: boolean, status: number, body: unknown): WidgetGuestSession {
    const rec = isRecord(body) ? body : {};
    const code = typeof rec['errorCode'] === 'string' ? rec['errorCode'] : null;
    if (!ok || rec['success'] !== true || typeof rec['token'] !== 'string' || rec['token'].length === 0) {
      throw new WidgetKeyError(DescribeMintFailure(code, status), code ?? 'mint_failed', status);
    }
    const widgetId = stringField(rec, 'widgetId');
    const applicationId = stringField(rec, 'applicationId');
    const pinnedAgentId = stringField(rec, 'pinnedAgentId');
    if (!widgetId || !applicationId || !pinnedAgentId) {
      throw new WidgetKeyError('The server answered with an incomplete widget session.', 'incomplete_session', status);
    }
    this.learnServerOffset(rec['token']);
    const expires = typeof rec['expiresAt'] === 'string' ? Date.parse(rec['expiresAt']) - this.serverOffsetMs : Number.NaN;
    const minutes = rec['voiceMaxSessionMinutes'];
    const modality = rec['modality'];
    return {
      token: rec['token'],
      expiresAtMs: Number.isFinite(expires) ? expires : Date.now() + FIFTEEN_MINUTES_MS,
      widgetId,
      applicationId,
      pinnedAgentId,
      modality: modality === 'Voice' || modality === 'Both' ? modality : 'Text',
      voiceMaxSessionMinutes: typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      enabledChannels: Array.isArray(rec['enabledChannels']) ? rec['enabledChannels'].filter((c): c is string => typeof c === 'string') : []
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The `iat` (epoch seconds) of a JWT, read WITHOUT verifying it: the client only needs the server's clock reading,
 * and the server verifies the token itself. Null when the token is unreadable or carries no numeric `iat`.
 */
function readIssuedAtSeconds(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) {
    return null;
  }
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)));
    const iat = isRecord(payload) ? payload['iat'] : undefined;
    return typeof iat === 'number' && Number.isFinite(iat) ? iat : null;
  } catch {
    // Not base64 or not JSON: an unreadable token says nothing about the server's clock (see learnServerOffset).
    return null;
  }
}

function stringField(rec: Record<string, unknown>, key: string): string | null {
  const value = rec[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Words for a mint failure. The server answers every client-side rejection uniformly (so keys cannot be probed); so does this. */
export function DescribeMintFailure(code: string | null, status: number): string {
  if (code === 'rate_limited' || status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'server_error' || status >= 500) {
    return 'The server had a problem starting your session. Please try again.';
  }
  return 'This widget is not available here. If you think that is a mistake, please contact the site owner.';
}
