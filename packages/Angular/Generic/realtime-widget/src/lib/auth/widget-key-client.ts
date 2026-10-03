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

/** Modalities a widget instance may expose. */
export type WidgetKeyModality = 'Text' | 'Voice' | 'Both';

/** What the server decided for this guest. */
export interface WidgetGuestSession {
  token: string;
  /** When the token expires (epoch ms). */
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

  constructor(
    apiUrl: string,
    private readonly widgetKey: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {
    this.baseUrl = apiUrl.replace(/\/+$/, '');
  }

  /** Mints a fresh guest session. Throws {@link WidgetKeyError}. */
  public Mint(): Promise<WidgetGuestSession> {
    return this.call('/widget/session');
  }

  /** Re-mints by the same key (the server's refresh path). Throws {@link WidgetKeyError}. */
  public Refresh(): Promise<WidgetGuestSession> {
    return this.call('/widget/session/refresh');
  }

  private async call(path: string): Promise<WidgetGuestSession> {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetKey: this.widgetKey })
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
    const expires = typeof rec['expiresAt'] === 'string' ? Date.parse(rec['expiresAt']) : Number.NaN;
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
