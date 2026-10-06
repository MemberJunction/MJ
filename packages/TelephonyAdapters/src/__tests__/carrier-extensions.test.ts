import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Router } from 'express';
import type { ServerExtensionInitContext } from '@memberjunction/server-extensions-core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

import { TwilioTelephonyExtension } from '../server-extensions/TwilioTelephonyExtension.js';
import { VonageTelephonyExtension } from '../server-extensions/VonageTelephonyExtension.js';
import { GetTwilioTelephonyService } from '../telephony/telephony-runtime.js';
import { GetVonageTelephonyService } from '../telephony/vonage-runtime.js';
import type { TwilioTelephonyConfig, VonageTelephonyConfig } from '../types.js';

function context(driverClass: string, rootPath: string, settings: Record<string, unknown>, publicUrl = 'https://api.acme.com'): { ctx: ServerExtensionInitContext; use: ReturnType<typeof vi.fn> } {
    const use = vi.fn();
    const ctx = {
        app: { use },
        config: { Enabled: true, DriverClass: driverClass, RootPath: rootPath, Settings: settings },
        services: { RegisterService: vi.fn(), GetService: vi.fn(), HasService: vi.fn() },
        phase: 'pre-auth',
        publicUrl,
    } as unknown as ServerExtensionInitContext;
    return { ctx, use };
}

/** Reads the (private) resolved config off a service so the derived values can be asserted. */
function configOf<T>(service: unknown): T {
    return Reflect.get(service as object, 'config') as T;
}

/** The route paths a mounted router serves. */
function routePaths(router: Router): string[] {
    return (router as unknown as { stack: Array<{ route?: { path: string } }> }).stack.map((l) => l.route?.path ?? '');
}

const TWILIO_SETTINGS = {
    accountSid: 'AC1',
    authToken: 'tok',
    streamPublicUrl: 'wss://api.acme.com/telephony/twilio/media',
};

describe('TwilioTelephonyExtension', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('mounts the voice, status and AMD webhooks', async () => {
        const ext = new TwilioTelephonyExtension();
        const { ctx, use } = context('TwilioTelephonyExtension', '/telephony/twilio', TWILIO_SETTINGS);
        const result = await ext.Initialize(ctx);
        expect(result.Success).toBe(true);
        expect(routePaths(use.mock.calls[0][2] as Router)).toEqual(['/voice', '/status', '/amd']);
        expect(result.RegisteredRoutes).toContain('POST /telephony/twilio/voice');
        await ext.Shutdown();
    });

    it('derives the status and AMD callback URLs from the public URL and mount path, and defaults onMachine to hangup', async () => {
        const ext = new TwilioTelephonyExtension();
        await ext.Initialize(context('TwilioTelephonyExtension', '/telephony/twilio', TWILIO_SETTINGS, 'https://api.acme.com/').ctx);
        const config = configOf<TwilioTelephonyConfig>(GetTwilioTelephonyService());
        expect(config.statusCallbackUrl).toBe('https://api.acme.com/telephony/twilio/status');
        expect(config.amdStatusCallbackUrl).toBe('https://api.acme.com/telephony/twilio/amd');
        expect(config.onMachine).toBe('hangup');
        await ext.Shutdown();
    });

    it('lets explicit settings win over the derived URLs, and honours onMachine=continue', async () => {
        const ext = new TwilioTelephonyExtension();
        const settings = { ...TWILIO_SETTINGS, statusCallbackUrl: 'https://hooks.acme.com/s', amdStatusCallbackUrl: 'https://hooks.acme.com/a', onMachine: 'continue' };
        await ext.Initialize(context('TwilioTelephonyExtension', '/telephony/twilio', settings).ctx);
        const config = configOf<TwilioTelephonyConfig>(GetTwilioTelephonyService());
        expect(config.statusCallbackUrl).toBe('https://hooks.acme.com/s');
        expect(config.amdStatusCallbackUrl).toBe('https://hooks.acme.com/a');
        expect(config.onMachine).toBe('continue');
        await ext.Shutdown();
    });

    it('passes the shared telephony settings (run-as user, call cap, outbound policy) through to the service', async () => {
        const ext = new TwilioTelephonyExtension();
        const settings = { ...TWILIO_SETTINGS, inboundRunAsUserEmail: 'bot@acme.com', maxCallSeconds: 600, outbound: { allowedPrefixes: ['+44'] } };
        await ext.Initialize(context('TwilioTelephonyExtension', '/telephony/twilio', settings).ctx);
        const config = configOf<TwilioTelephonyConfig>(GetTwilioTelephonyService());
        expect(config.inboundRunAsUserEmail).toBe('bot@acme.com');
        expect(config.maxCallSeconds).toBe(600);
        expect(config.outbound).toEqual({ allowedPrefixes: ['+44'] });
        await ext.Shutdown();
    });

    it('does not mount anything when Twilio is not configured', async () => {
        const ext = new TwilioTelephonyExtension();
        const { ctx, use } = context('TwilioTelephonyExtension', '/telephony/twilio', {});
        const result = await ext.Initialize(ctx);
        expect(result.Success).toBe(false);
        expect(use).not.toHaveBeenCalled();
    });

    it('Shutdown unbinds the service and cancels its timers', async () => {
        vi.useFakeTimers();
        const ext = new TwilioTelephonyExtension();
        await ext.Initialize(context('TwilioTelephonyExtension', '/telephony/twilio', TWILIO_SETTINGS).ctx);
        await ext.Shutdown();
        expect(GetTwilioTelephonyService()).toBeUndefined();
        vi.useRealTimers();
    });
});

const VONAGE_SETTINGS = {
    mediaPublicUrl: 'wss://api.acme.com/telephony/vonage/media',
    signatureSecret: 's',
};

describe('VonageTelephonyExtension', () => {
    it('mounts the answer and event webhooks', async () => {
        const ext = new VonageTelephonyExtension();
        const { ctx, use } = context('VonageTelephonyExtension', '/telephony/vonage', VONAGE_SETTINGS);
        const result = await ext.Initialize(ctx);
        expect(result.Success).toBe(true);
        expect(routePaths(use.mock.calls[0][2] as Router)).toEqual(['/answer', '/event']);
        await ext.Shutdown();
    });

    it('derives the event URL from the public URL and mount path, and defaults onMachine to hangup', async () => {
        const ext = new VonageTelephonyExtension();
        await ext.Initialize(context('VonageTelephonyExtension', '/telephony/vonage', VONAGE_SETTINGS).ctx);
        const config = configOf<VonageTelephonyConfig>(GetVonageTelephonyService());
        expect(config.eventUrl).toBe('https://api.acme.com/telephony/vonage/event');
        expect(config.onMachine).toBe('hangup');
        await ext.Shutdown();
    });

    it('lets an explicit eventUrl win, and passes shared settings through', async () => {
        const ext = new VonageTelephonyExtension();
        const settings = { ...VONAGE_SETTINGS, eventUrl: 'https://hooks.acme.com/e', onMachine: 'continue', inboundRunAsUserEmail: 'bot@acme.com', maxCallSeconds: 300 };
        await ext.Initialize(context('VonageTelephonyExtension', '/telephony/vonage', settings).ctx);
        const config = configOf<VonageTelephonyConfig>(GetVonageTelephonyService());
        expect(config.eventUrl).toBe('https://hooks.acme.com/e');
        expect(config.onMachine).toBe('continue');
        expect(config.inboundRunAsUserEmail).toBe('bot@acme.com');
        expect(config.maxCallSeconds).toBe(300);
        await ext.Shutdown();
    });
});
