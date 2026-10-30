import type express from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const API_KEY_KDF_SALT = randomBytes(16);
const SCRYPT_DERIVED_BYTES = 32;
const MAX_API_KEY_LENGTH = 4096;
const LOOPBACK_ADDRESSES = new Set<string>(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function deriveApiKeyDigest(secret: string): Buffer {
    return scryptSync(secret, API_KEY_KDF_SALT, SCRYPT_DERIVED_BYTES);
}

/**
 * Determines which host interface the CodeGen HTTP server should bind to.
 * - Explicit `MJ_CODEGEN_BIND_HOST` always wins.
 * - When `MJ_CODEGEN_API_KEY` is configured, returns `undefined` so Express uses its default bind
 *   behavior (preserving containerized deployments protected by an API key).
 * - When no API key is configured, binds strictly to `127.0.0.1` so the port is not exposed to
 *   non-loopback network interfaces.
 */
export function ResolveCodeGenBindHost(env: NodeJS.ProcessEnv = process.env): string | undefined {
    const explicitHost = env.MJ_CODEGEN_BIND_HOST?.trim();
    if (explicitHost) {
        return explicitHost;
    }
    const configuredKey = env.MJ_CODEGEN_API_KEY?.trim();
    if (configuredKey) {
        return undefined;
    }
    return '127.0.0.1';
}

/**
 * Guards the CodeGen trigger endpoint: a CodeGen run performs DDL and metadata writes, so it must
 * never be triggerable by anyone who can merely reach the port. When `MJ_CODEGEN_API_KEY` is set,
 * the caller must present it in the `x-mj-codegen-api-key` header (compared constant-time over
 * fixed-width `scrypt` digests with a per-process random salt). When no key is configured, only
 * loopback callers are accepted.
 */
export function RequireCodeGenAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
): void {
    const configuredKey = process.env.MJ_CODEGEN_API_KEY?.trim();
    if (configuredKey) {
        const presented = req.headers['x-mj-codegen-api-key'];
        if (
            typeof presented === 'string' &&
            presented.length > 0 &&
            presented.length <= MAX_API_KEY_LENGTH &&
            configuredKey.length <= MAX_API_KEY_LENGTH
        ) {
            const presentedDigest = deriveApiKeyDigest(presented);
            const configuredDigest = deriveApiKeyDigest(configuredKey);
            if (timingSafeEqual(presentedDigest, configuredDigest)) {
                next();
                return;
            }
        }
        res.status(401).json({ status: 'error', errorMessage: 'Unauthorized' });
        return;
    }

    const ip = req.socket?.remoteAddress ?? '';
    if (LOOPBACK_ADDRESSES.has(ip)) {
        next();
        return;
    }
    res.status(401).json({
        status: 'error',
        errorMessage: 'Unauthorized: set MJ_CODEGEN_API_KEY to allow non-loopback access to /api/run',
    });
}

/**
 * Creates a single-flight Express route handler for `/api/run` that responds immediately with
 * `202 Accepted` while running CodeGen asynchronously, rejects overlapping requests with
 * `409 Conflict`, and resets the single-flight latch once the run settles.
 */
export function CreateRunCodeGenHandler(
    runCodeGen: () => Promise<void>,
    onBackgroundError: (err: Error) => void = (err) => console.error(`CodeGen run failed: ${err.message}`),
): (req: express.Request, res: express.Response) => Promise<void> {
    let runningPromise: Promise<void> | null = null;

    return async (_req: express.Request, res: express.Response): Promise<void> => {
        try {
            if (runningPromise) {
                res.status(409).json({ status: 'error', errorMessage: 'A CodeGen run is already in progress' });
                return;
            }

            const currentRun = runCodeGen();
            runningPromise = currentRun;

            currentRun
                .catch((err) => {
                    onBackgroundError(err instanceof Error ? err : new Error(String(err)));
                })
                .finally(() => {
                    if (runningPromise === currentRun) {
                        runningPromise = null;
                    }
                });

            res.status(202).json({ status: 'accepted' });
        } catch (e) {
            runningPromise = null;
            res.status(500).json({
                status: 'error',
                errorMessage: e instanceof Error ? e.message : 'CodeGen run failed',
            });
        }
    };
}
