import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Router } from 'express';
import type { ServerExtensionInitContext } from '@memberjunction/server-extensions-core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

import { LiveKitSipExtension } from '../server-extensions/LiveKitSipExtension.js';
import { GetLiveKitSipTelephonyService } from '../telephony/livekit-sip-runtime.js';

function context(settings: Record<string, unknown>): { ctx: ServerExtensionInitContext; use: ReturnType<typeof vi.fn> } {
    const use = vi.fn();
    const ctx = {
        app: { use },
        config: { Enabled: true, DriverClass: 'LiveKitSipExtension', RootPath: '/telephony/livekit-sip', Settings: settings },
        services: { RegisterService: vi.fn(), GetService: vi.fn(), HasService: vi.fn() },
        phase: 'pre-auth',
        publicUrl: 'https://api.acme.com',
    } as unknown as ServerExtensionInitContext;
    return { ctx, use };
}

const CREDENTIALS = { serverUrl: 'wss://test.livekit.cloud', apiKey: 'devkey', apiSecret: 'devsecretdevsecretdevsecret123456' };

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('LiveKitSipExtension', () => {
    it('skips (does not fail the server) when LiveKit is not configured', async () => {
        vi.stubEnv('LIVEKIT_URL', '');
        vi.stubEnv('LIVEKIT_API_KEY', '');
        vi.stubEnv('LIVEKIT_API_SECRET', '');
        const ext = new LiveKitSipExtension();
        const result = await ext.Initialize(context({}).ctx);
        expect(result).toMatchObject({ Success: false, Skipped: true });
        expect(GetLiveKitSipTelephonyService()).toBeUndefined();
    });

    it('mounts the signed webhook route and binds the service for the outbound resolver', async () => {
        const ext = new LiveKitSipExtension();
        const { ctx, use } = context({ ...CREDENTIALS, inboundRunAsUserEmail: 'bot@example.com' });
        const result = await ext.Initialize(ctx);
        expect(result.Success).toBe(true);
        expect(result.RegisteredRoutes).toEqual(['POST /telephony/livekit-sip/webhook']);
        const router = use.mock.calls[0][2] as Router;
        expect((router as unknown as { stack: Array<{ route?: { path: string } }> }).stack.map((l) => l.route?.path)).toEqual(['/webhook']);
        expect(GetLiveKitSipTelephonyService()).toBeDefined();
        expect((await ext.HealthCheck()).Healthy).toBe(true);

        await ext.Shutdown();
        expect(GetLiveKitSipTelephonyService()).toBeUndefined();
        expect((await ext.HealthCheck()).Healthy).toBe(false);
    });

    it('is a pre-auth extension (LiveKit cannot present an MJ token; the webhook signature is the gate)', () => {
        expect(new LiveKitSipExtension().DefaultPhase).toBe('pre-auth');
    });
});
