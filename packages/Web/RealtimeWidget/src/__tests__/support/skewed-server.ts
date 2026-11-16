import { VerifyProofOfPossessionJwt } from '@memberjunction/global';
import type { FetchLike } from '../../session/widget-session-client.js';

/** The fixed server clock the fake server answers with (epoch ms). */
export const SERVER_NOW_MS = Date.UTC(2030, 0, 1, 12, 0, 0);
/** Token lifetime the fake server grants, seconds (the default 15 min). */
export const TOKEN_TTL_SECONDS = 900;

/** An unsigned JWT carrying `payload`; the widget only reads it, the server is what verifies. */
export function UnsignedJwt(payload: Record<string, unknown>): string {
    const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'none', typ: 'JWT' })}.${part(payload)}.sig`;
}

/** Reads the `iat` a proof JWT was signed with. */
export function ProofIat(proof: string): number {
    const payload: unknown = JSON.parse(Buffer.from(proof.split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null || !('iat' in payload) || typeof payload.iat !== 'number') {
        throw new Error(`proof carries no numeric iat: ${proof}`);
    }
    return payload.iat;
}

export interface SkewedServer {
    Fetch: FetchLike;
    Urls: string[];
    Proofs: string[];
}

/**
 * A fake MJAPI whose clock is {@link SERVER_NOW_MS}: it mints tokens stamped with its own `iat`/`exp`, and checks a
 * refresh proof the way `WidgetSessionService` does (±60 s of its clock), answering 403 when the proof is stale.
 */
export function CreateSkewedServer(): SkewedServer {
    const urls: string[] = [];
    const proofs: string[] = [];
    let mints = 0;
    const nowSeconds = Math.floor(SERVER_NOW_MS / 1000);
    const sessionBody = (sid: string) => ({
        success: true,
        token: UnsignedJwt({ iat: nowSeconds, exp: nowSeconds + TOKEN_TTL_SECONDS, mj_sid: sid }),
        expiresAt: new Date((nowSeconds + TOKEN_TTL_SECONDS) * 1000).toISOString(),
        widgetId: 'W1',
        applicationId: 'APP1',
        pinnedAgentId: 'AGENT1',
        modality: 'Text',
        sessionId: sid,
    });
    const fetchImpl: FetchLike = async (url, init) => {
        urls.push(url);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (!url.endsWith('/refresh')) {
            mints++;
            return { ok: true, status: 200, json: async () => sessionBody(`sid-${mints}`) };
        }
        const proof = headers['dpop'] ?? '';
        proofs.push(proof);
        const token = (headers['authorization'] ?? '').replace(/^Bearer /, '');
        const check = await VerifyProofOfPossessionJwt(proof, {
            Method: 'POST',
            PathSuffix: '/widget/session/refresh',
            AccessToken: token,
            NowSeconds: nowSeconds,
            MaxSkewSeconds: 60,
        });
        if ('Reason' in check) {
            const reason = check.Reason;
            return { ok: false, status: 403, json: async () => ({ success: false, errorCode: reason }) };
        }
        return { ok: true, status: 200, json: async () => sessionBody(`sid-${mints}`) };
    };
    return { Fetch: fetchImpl, Urls: urls, Proofs: proofs };
}
