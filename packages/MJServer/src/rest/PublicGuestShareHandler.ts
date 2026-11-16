import { default as BodyParser } from 'body-parser';
import { Router, type Request, type Response } from 'express';
import {
    BuildGuestShareRateLimitKey,
    ResolveGuestShareProviderFallback,
    ResolvePublicArtifactGuestShareData,
} from '../operations/ArtifactGuestShareServerOperations.js';

export const GUEST_SHARE_MOUNT_PATH = '/guest-share';

interface GuestSharePostBody {
    token?: string;
}

/**
 * Public unauthenticated REST router for external guest artifact share resolution (`NW-1`).
 * Mounted pre-auth at `ApiRoute('/guest-share')` since `/graphql` enforces auth middleware
 * before `@Public()` field directives execute.
 *
 * Accepts `POST /resolve` only (JSON body `{ token }`) so bearer guest tokens never appear
 * in URL query strings, HTTP access logs, or `Referrer` headers.
 */
export function CreatePublicGuestShareRouter(): Router {
    const router = Router();
    router.use(BodyParser.json({ limit: '16kb' }));

    router.post('/resolve', async (req: Request, res: Response) => {
        const body = req.body as GuestSharePostBody | undefined;
        const tokenParam = typeof body?.token === 'string' ? body.token : '';
        const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
        const clientKey = BuildGuestShareRateLimitKey(clientIp, tokenParam);
        const provider = ResolveGuestShareProviderFallback();
        const result = await ResolvePublicArtifactGuestShareData(tokenParam, provider, clientKey);
        const statusCode =
            result.ErrorCode === 'RATE_LIMITED'
                ? 429
                : result.ErrorCode === 'INTERNAL_ERROR'
                  ? 500
                  : 200;
        res.status(statusCode).json(result);
    });

    return router;
}
