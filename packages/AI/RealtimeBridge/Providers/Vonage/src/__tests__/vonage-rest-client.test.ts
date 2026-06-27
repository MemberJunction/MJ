import { describe, it, expect, vi } from 'vitest';
import {
    RealVonageVoiceClient,
    type VonageModuleConstructor,
    type VonageRestClientLike,
    type VonageVoiceClientLike,
} from '../vonage-rest-client.js';
import type { NccoAction } from '../real-vonage-bindings.js';

/** A connect-NCCO fixture used across the REST-payload assertions. */
const CONNECT_NCCO: NccoAction[] = [
    { action: 'connect', endpoint: [{ type: 'websocket', uri: 'wss://x/media', 'content-type': 'audio/l16;rate=8000' }] },
];

/**
 * Builds a fake `@vonage/server-sdk` constructor + spies so tests can assert the REST payloads
 * without the real SDK or network. The constructor spy records the credentials it was built with.
 */
function makeFakeVonage(createdUuid = 'uuid_test') {
    const createSpy = vi.fn(async (_call: Record<string, unknown>) => ({ uuid: createdUuid }));
    const hangupSpy = vi.fn(async (_uuid: string) => undefined);
    const transferSpy = vi.fn(async (_uuid: string, _ncco: NccoAction[]) => undefined);
    const dtmfSpy = vi.fn(async (_uuid: string, _digits: string) => ({ status: 'ok' }));

    const voice: VonageVoiceClientLike = {
        createOutboundCall: createSpy,
        hangupCall: hangupSpy,
        transferCallWithNCCO: transferSpy,
        playDTMF: dtmfSpy,
    };
    const client: VonageRestClientLike = { voice };

    // Constructor spy: records credentials, returns the fake client.
    const ctorSpy = vi.fn();
    const Ctor = function (this: unknown, credentials: unknown): VonageRestClientLike {
        ctorSpy(credentials);
        return client;
    } as unknown as VonageModuleConstructor;

    const loader = async (): Promise<VonageModuleConstructor> => Ctor;
    return { loader, ctorSpy, createSpy, hangupSpy, transferSpy, dtmfSpy };
}

describe('RealVonageVoiceClient', () => {
    describe('CreateCall', () => {
        it('maps PascalCase params onto the SDK OutboundCall shape and returns the call UUID', async () => {
            const { loader, createSpy } = makeFakeVonage('uuid_outbound');
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loader);

            const uuid = await rest.CreateCall({
                To: '+15551230000',
                From: '+15559990000',
                Ncco: CONNECT_NCCO,
                EventUrl: 'https://x/cb',
            });

            expect(uuid).toBe('uuid_outbound');
            expect(createSpy).toHaveBeenCalledWith({
                to: [{ type: 'phone', number: '+15551230000' }],
                from: { type: 'phone', number: '+15559990000' },
                ncco: CONNECT_NCCO,
                event_url: ['https://x/cb'],
            });
        });

        it('omits event_url when EventUrl is not provided', async () => {
            const { loader, createSpy } = makeFakeVonage();
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loader);

            await rest.CreateCall({ To: '+1', From: '+2', Ncco: CONNECT_NCCO });

            expect(createSpy).toHaveBeenCalledWith({
                to: [{ type: 'phone', number: '+1' }],
                from: { type: 'phone', number: '+2' },
                ncco: CONNECT_NCCO,
            });
            expect(createSpy.mock.calls[0][0]).not.toHaveProperty('event_url');
        });

        it('throws when the SDK returns no UUID', async () => {
            const { loader, createSpy } = makeFakeVonage('');
            createSpy.mockResolvedValueOnce({ uuid: '' });
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loader);
            await expect(rest.CreateCall({ To: '+1', From: '+2', Ncco: CONNECT_NCCO })).rejects.toThrow(/no call UUID/);
        });
    });

    describe('HangupCall', () => {
        it('hangs up by UUID', async () => {
            const { loader, hangupSpy } = makeFakeVonage();
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loader);

            await rest.HangupCall('uuid123');

            expect(hangupSpy).toHaveBeenCalledWith('uuid123');
        });
    });

    describe('TransferCall', () => {
        it('passes the replacement NCCO array straight through to transferCallWithNCCO', async () => {
            const { loader, transferSpy } = makeFakeVonage();
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loader);
            const ncco: NccoAction[] = [{ action: 'connect', endpoint: [{ type: 'phone', number: '+19998887777' }] }];

            await rest.TransferCall('uuid123', { Ncco: ncco });

            expect(transferSpy).toHaveBeenCalledWith('uuid123', ncco);
        });
    });

    describe('SendDtmf', () => {
        it('plays the digit string into the call by UUID', async () => {
            const { loader, dtmfSpy } = makeFakeVonage();
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loader);

            await rest.SendDtmf('uuid123', '1234');

            expect(dtmfSpy).toHaveBeenCalledWith('uuid123', '1234');
        });
    });

    describe('auth selection', () => {
        it('prefers application JWT auth (applicationId + privateKey) when present', async () => {
            const { loader, ctorSpy } = makeFakeVonage();
            const rest = new RealVonageVoiceClient(
                { ApplicationId: 'app1', PrivateKey: 'pk', ApiKey: 'k', ApiSecret: 's' },
                loader,
            );

            await rest.CreateCall({ To: '+1', From: '+2', Ncco: CONNECT_NCCO });

            expect(ctorSpy).toHaveBeenCalledWith({ applicationId: 'app1', privateKey: 'pk' });
        });

        it('falls back to the API key pair when no application credential pair', async () => {
            const { loader, ctorSpy } = makeFakeVonage();
            const rest = new RealVonageVoiceClient({ ApiKey: 'k', ApiSecret: 's' }, loader);

            await rest.CreateCall({ To: '+1', From: '+2', Ncco: CONNECT_NCCO });

            expect(ctorSpy).toHaveBeenCalledWith({ apiKey: 'k', apiSecret: 's' });
        });

        it('throws when neither an application credential pair nor an API key pair is provided', async () => {
            const { loader } = makeFakeVonage();
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1' }, loader);
            await expect(rest.CreateCall({ To: '+1', From: '+2', Ncco: CONNECT_NCCO })).rejects.toThrow(
                /application credential pair.*API key pair/,
            );
        });
    });

    describe('client construction', () => {
        it('builds the SDK client only once across multiple calls', async () => {
            const { loader, ctorSpy } = makeFakeVonage();
            const loaderSpy = vi.fn(loader);
            const rest = new RealVonageVoiceClient({ ApplicationId: 'app1', PrivateKey: 'pk' }, loaderSpy);

            await rest.CreateCall({ To: '+1', From: '+2', Ncco: CONNECT_NCCO });
            await rest.HangupCall('uuid1');
            await rest.SendDtmf('uuid1', '9');
            await rest.CreateCall({ To: '+3', From: '+4', Ncco: CONNECT_NCCO });

            expect(loaderSpy).toHaveBeenCalledTimes(1);
            expect(ctorSpy).toHaveBeenCalledTimes(1);
        });
    });
});
