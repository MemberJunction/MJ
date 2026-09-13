import { createHmac, timingSafeEqual } from 'crypto';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeBridge,
    BaseDetachedMediaBridge,
    RealtimeBridgeContext,
    BridgeConnectResult,
    BridgeDisconnectReason,
} from '@memberjunction/ai-bridge-base';

/**
 * Structural interface for the REST client used by OpenAISipBridge to interact with
 * the OpenAI Live session API (`/v1/live/sessions/{id}/...`).
 */
export interface IOpenAISipRestClient {
    accept(sessionId: string, sessionConfig: Record<string, unknown>): Promise<void>;
    reject(sessionId: string, statusCode: number): Promise<void>;
    refer(sessionId: string, targetUri: string): Promise<void>;
    hangup(sessionId: string): Promise<void>;
}

/**
 * Options for verifying a Standard-Webhooks HMAC signature.
 */
export interface VerifyStandardWebhookOptions {
    rawPayload: string;
    headers: Record<string, string | string[] | undefined>;
    secret: string;
    toleranceSeconds?: number;
    replayCache?: Set<string>;
}

/**
 * Verifies the signature of an inbound OpenAI Live webhook using the Standard-Webhooks specification:
 * - Reads `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers.
 * - Enforces timestamp skew tolerance (default 300s / 5m).
 * - Enforces replay prevention when a replayCache is supplied.
 * - Computes HMAC-SHA256 of `${webhook_id}.${webhook_timestamp}.${raw_payload}`.
 */
export function VerifyOpenAISipWebhook(options: VerifyStandardWebhookOptions): boolean {
    const { rawPayload, headers, secret, toleranceSeconds = 300, replayCache } = options;

    const idHeader = headers['webhook-id'] ?? headers['Webhook-Id'];
    const timestampHeader = headers['webhook-timestamp'] ?? headers['Webhook-Timestamp'];
    const signatureHeader = headers['webhook-signature'] ?? headers['Webhook-Signature'];

    const id = Array.isArray(idHeader) ? idHeader[0] : idHeader;
    const timestampStr = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
    const signatureStr = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!id || !timestampStr || !signatureStr) {
        return false;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
        return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
        return false;
    }

    if (replayCache) {
        if (replayCache.has(id)) {
            return false;
        }
        replayCache.add(id);
    }

    let secretBuffer: Buffer;
    if (secret.startsWith('whsec_')) {
        secretBuffer = Buffer.from(secret.slice(6), 'base64');
    } else {
        secretBuffer = Buffer.from(secret, 'utf-8');
    }

    const signedPayload = `${id}.${timestampStr}.${rawPayload}`;
    const expectedHash = createHmac('sha256', secretBuffer).update(signedPayload).digest('base64');

    const signatures = signatureStr.split(' ');
    for (const sig of signatures) {
        const parts = sig.split(',');
        if (parts.length === 2 && parts[0] === 'v1') {
            const candidate = parts[1];
            if (candidate.length === expectedHash.length) {
                if (timingSafeEqual(Buffer.from(candidate), Buffer.from(expectedHash))) {
                    return true;
                }
            }
        }
    }

    return false;
}

/** Default fetch-based REST client for OpenAI Live session endpoints. */
export class FetchOpenAISipRestClient implements IOpenAISipRestClient {
    private _apiKey: string;
    private _baseUrl: string;

    constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1/live/sessions') {
        this._apiKey = apiKey;
        this._baseUrl = baseUrl;
    }

    public async accept(sessionId: string, sessionConfig: Record<string, unknown>): Promise<void> {
        const res = await fetch(`${this._baseUrl}/${encodeURIComponent(sessionId)}/accept`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this._apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session: sessionConfig }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI Live accept failed (${res.status}): ${body}`);
        }
    }

    public async reject(sessionId: string, statusCode: number): Promise<void> {
        const res = await fetch(`${this._baseUrl}/${encodeURIComponent(sessionId)}/reject`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this._apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status_code: statusCode }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI Live reject failed (${res.status}): ${body}`);
        }
    }

    public async refer(sessionId: string, targetUri: string): Promise<void> {
        const res = await fetch(`${this._baseUrl}/${encodeURIComponent(sessionId)}/refer`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this._apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ target_uri: targetUri }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI Live refer failed (${res.status}): ${body}`);
        }
    }

    public async hangup(sessionId: string): Promise<void> {
        const res = await fetch(`${this._baseUrl}/${encodeURIComponent(sessionId)}/hangup`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this._apiKey}`,
            },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI Live hangup failed (${res.status}): ${body}`);
        }
    }
}

/**
 * Telephony bridge driver for OpenAI Direct SIP telephony (detached media plane).
 *
 * Inbound only — OpenAI terminates the live SIP call; MemberJunction attaches a sideband
 * connection to observe telemetry, handle tool calls, and receive DTMF notifications.
 */
@RegisterClass(BaseRealtimeBridge, 'OpenAISipBridge')
export class OpenAISipBridge extends BaseDetachedMediaBridge {
    private _restClient: IOpenAISipRestClient;
    private _sessionId = '';
    private _accepted = false;

    constructor(restClient?: IOpenAISipRestClient) {
        super();
        const apiKey = process.env.AI_VENDOR_API_KEY__OpenAILiveRealtime || process.env.OPENAI_API_KEY || '';
        this._restClient = restClient ?? new FetchOpenAISipRestClient(apiKey);
    }

    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyDetachedContext(ctx);

        const config = ctx.Configuration ?? {};
        const sessionId = (config['InboundCallId'] ?? config['session_id']) as string | undefined;
        if (!sessionId) {
            throw new Error('OpenAISipBridge.Connect: missing required session id (InboundCallId / session_id).');
        }

        this._sessionId = sessionId;
        this.externalCallId = sessionId;
        this.callerNumber = (config['fromNumber'] ?? config['from'] ?? ctx.Address) as string;
        this.agentNumber = (config['toNumber'] ?? config['to']) as string;

        // Accept the inbound SIP call if an accept session config is provided and not yet accepted
        const acceptSession = config['session'] as Record<string, unknown> | undefined;
        if (acceptSession && !this._accepted) {
            await this._restClient.accept(sessionId, acceptSession);
            this._accepted = true;
        }

        return {
            BotParticipantId: this.botParticipantId,
            ExternalConnectionId: this.externalCallId,
        };
    }

    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        if (this._sessionId) {
            try {
                await this._restClient.hangup(this._sessionId);
            } catch {
                // Ignore failure on hangup if session is already closed
            }
            this.emitCallEnded();
        }
    }

    /**
     * Telephony transfer using SIP REFER via OpenAI Live `/refer` endpoint.
     */
    public override async TransferCall(toNumber: string): Promise<void> {
        this.RequireFeature('CallTransfer');
        if (!this._sessionId) {
            throw new Error('OpenAISipBridge.TransferCall: no active call session.');
        }
        await this._restClient.refer(this._sessionId, toNumber);
    }

    /**
     * Rejects an incoming SIP call prior to connection.
     */
    public async RejectCall(statusCode = 486): Promise<void> {
        if (!this._sessionId) {
            throw new Error('OpenAISipBridge.RejectCall: no session id resolved.');
        }
        await this._restClient.reject(this._sessionId, statusCode);
    }

    /**
     * Ingests an in-band or sideband DTMF notification from OpenAI Live observer events.
     */
    public HandleDTMF(digit: string): void {
        this.emitDTMF(digit);
    }
}
