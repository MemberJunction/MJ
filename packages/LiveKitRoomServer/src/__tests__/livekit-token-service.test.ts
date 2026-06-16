import { describe, it, expect } from 'vitest';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** Decodes a JWT payload segment without verifying the signature (test-only inspection). */
function decodePayload(jwt: string): Record<string, unknown> {
    const [, payload] = jwt.split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

describe('LiveKitTokenService', () => {
    it('reports not configured when credentials are missing', () => {
        const svc = new LiveKitTokenService({ ServerUrl: '', ApiKey: '', ApiSecret: '' });
        expect(svc.IsConfigured).toBe(false);
    });

    it('mints a client token scoped to the room with subscribe + publish grants', async () => {
        const svc = new LiveKitTokenService(CONFIG);
        const minted = await svc.MintClientToken('room-42', 'user-1', 'Amith');

        expect(minted.ServerUrl).toBe(CONFIG.ServerUrl);
        expect(minted.RoomName).toBe('room-42');
        expect(minted.Identity).toBe('user-1');
        expect(minted.Token.split('.')).toHaveLength(3);

        const payload = decodePayload(minted.Token);
        expect(payload.sub).toBe('user-1');
        expect((payload.video as Record<string, unknown>).room).toBe('room-42');
        expect((payload.video as Record<string, unknown>).roomJoin).toBe(true);
        const metadata = JSON.parse(payload.metadata as string);
        expect(metadata.mjRole).toBe('participant');
    });

    it('stamps the agent role into the bot token metadata', async () => {
        const svc = new LiveKitTokenService(CONFIG);
        const minted = await svc.MintBotToken('room-42', 'agent-x', 'Sage');
        const payload = decodePayload(minted.Token);
        const metadata = JSON.parse(payload.metadata as string);
        expect(metadata.mjRole).toBe('agent');
    });

    it('throws a clear error when minting without configuration', async () => {
        const svc = new LiveKitTokenService({ ServerUrl: '', ApiKey: '', ApiSecret: '' });
        await expect(svc.MintClientToken('r', 'i')).rejects.toThrow(/not configured/i);
    });
});
