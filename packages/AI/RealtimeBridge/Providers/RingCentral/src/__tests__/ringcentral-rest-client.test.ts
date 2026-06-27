import { describe, it, expect, vi } from 'vitest';
import {
    RealRingCentralCallControlClient,
    type RingCentralModuleLoader,
    type RingCentralPlatformLike,
    type RingCentralResponseLike,
    type RingCentralSdkConstructor,
    type RingCentralSdkOptions,
} from '../ringcentral-rest-client.js';

/** A JSON body the fake platform's POST/DELETE resolve to (the Call Control session shape we read). */
type FakeBody = { id?: string; parties?: Array<{ id?: string }> };

/**
 * Builds a fake `@ringcentral/sdk` constructor + spies so tests assert the REST payloads/paths and OAuth
 * login without the real SDK or network. `createBody` controls what the POST to the sessions base resolves to.
 */
function makeFakeRingCentral(createBody: FakeBody = { id: 'sess_1', parties: [{ id: 'party_1' }] }) {
    const postSpy = vi.fn(async (url: string, _body?: unknown): Promise<RingCentralResponseLike> => {
        // The create-session POST (and the no-body session GET-as-POST) returns the session body; others empty.
        const isSessionResource = url.endsWith('/telephony/sessions') || /\/telephony\/sessions\/[^/]+$/.test(url);
        return { json: async () => (isSessionResource ? createBody : {}) };
    });
    const deleteSpy = vi.fn(async (_url: string): Promise<RingCentralResponseLike> => ({ json: async () => ({}) }));
    const loginSpy = vi.fn(async (_params: unknown) => undefined);

    const platform: RingCentralPlatformLike = { login: loginSpy, post: postSpy, delete: deleteSpy };
    // `function` (not arrow) so it is newable — the client constructs the SDK via `new Sdk(...)`.
    const ctorSpy = vi.fn(function (this: { platform: () => RingCentralPlatformLike }, _opts: RingCentralSdkOptions) {
        this.platform = () => platform;
    });
    const loader: RingCentralModuleLoader = async () => ctorSpy as unknown as RingCentralSdkConstructor;

    return { loader, ctorSpy, platform, postSpy, deleteSpy, loginSpy };
}

const CREDS = {
    ServerUrl: 'https://platform.ringcentral.com',
    ClientId: 'cid',
    ClientSecret: 'csecret',
    Jwt: 'jwt-token',
};

const PAYLOAD = { to: { phoneNumber: '+15551230000' }, from: { phoneNumber: '+15559990000' }, streamUrl: 'wss://x/media' };

describe('RealRingCentralCallControlClient', () => {
    describe('CreateSession', () => {
        it('POSTs the payload to the telephony sessions base and returns the session id', async () => {
            const { loader, postSpy } = makeFakeRingCentral({ id: 'sess_outbound', parties: [{ id: 'p1' }] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            const id = await client.CreateSession(PAYLOAD);

            expect(id).toBe('sess_outbound');
            expect(postSpy).toHaveBeenCalledWith('/restapi/v1.0/account/~/telephony/sessions', PAYLOAD);
        });

        it('throws when the response carries no session id', async () => {
            const { loader } = makeFakeRingCentral({ parties: [{ id: 'p1' }] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);
            await expect(client.CreateSession(PAYLOAD)).rejects.toThrow(/no telephony session id/);
        });
    });

    describe('AnswerParty', () => {
        it('POSTs to the cached primary party answer endpoint', async () => {
            const { loader, postSpy } = makeFakeRingCentral({ id: 'sess_1', parties: [{ id: 'party_1' }] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            await client.CreateSession(PAYLOAD); // caches party_1
            await client.AnswerParty('sess_1');

            expect(postSpy).toHaveBeenCalledWith(
                '/restapi/v1.0/account/~/telephony/sessions/sess_1/parties/party_1/answer',
            );
        });

        it('fetches the session to resolve the party id when not cached', async () => {
            const { loader, postSpy } = makeFakeRingCentral({ id: 'sess_ext', parties: [{ id: 'party_ext' }] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            await client.AnswerParty('sess_ext'); // no prior CreateSession → fetch then answer

            expect(postSpy).toHaveBeenCalledWith('/restapi/v1.0/account/~/telephony/sessions/sess_ext');
            expect(postSpy).toHaveBeenCalledWith(
                '/restapi/v1.0/account/~/telephony/sessions/sess_ext/parties/party_ext/answer',
            );
        });

        it('throws when the session has no addressable party', async () => {
            const { loader } = makeFakeRingCentral({ id: 'sess_x', parties: [] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);
            await expect(client.AnswerParty('sess_x')).rejects.toThrow(/no addressable party/);
        });
    });

    describe('DropSession', () => {
        it('DELETEs the session resource', async () => {
            const { loader, deleteSpy } = makeFakeRingCentral();
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            await client.CreateSession(PAYLOAD);
            await client.DropSession('sess_1');

            expect(deleteSpy).toHaveBeenCalledWith('/restapi/v1.0/account/~/telephony/sessions/sess_1');
        });
    });

    describe('PlayDigits', () => {
        it('POSTs the dtmf payload to the party dtmf endpoint', async () => {
            const { loader, postSpy } = makeFakeRingCentral({ id: 'sess_1', parties: [{ id: 'party_1' }] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            await client.CreateSession(PAYLOAD);
            await client.PlayDigits('sess_1', '123#');

            expect(postSpy).toHaveBeenCalledWith(
                '/restapi/v1.0/account/~/telephony/sessions/sess_1/parties/party_1/dtmf',
                { dtmf: '123#' },
            );
        });
    });

    describe('TransferParty', () => {
        it('POSTs the transfer payload to the party transfer endpoint', async () => {
            const { loader, postSpy } = makeFakeRingCentral({ id: 'sess_1', parties: [{ id: 'party_1' }] });
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            await client.CreateSession(PAYLOAD);
            await client.TransferParty('sess_1', { phoneNumber: '+15557770000' });

            expect(postSpy).toHaveBeenCalledWith(
                '/restapi/v1.0/account/~/telephony/sessions/sess_1/parties/party_1/transfer',
                { phoneNumber: '+15557770000' },
            );
        });
    });

    describe('auth selection', () => {
        it('logs in with the JWT when present', async () => {
            const { loader, loginSpy, ctorSpy } = makeFakeRingCentral();
            const client = new RealRingCentralCallControlClient(CREDS, loader);

            await client.CreateSession(PAYLOAD);

            expect(ctorSpy).toHaveBeenCalledWith({
                server: 'https://platform.ringcentral.com',
                clientId: 'cid',
                clientSecret: 'csecret',
            });
            expect(loginSpy).toHaveBeenCalledWith({ jwt: 'jwt-token' });
        });

        it('falls back to a pre-obtained access token when no JWT', async () => {
            const { loader, loginSpy } = makeFakeRingCentral();
            const client = new RealRingCentralCallControlClient(
                { ...CREDS, Jwt: undefined, AccessToken: 'acc-token' },
                loader,
            );

            await client.CreateSession(PAYLOAD);

            expect(loginSpy).toHaveBeenCalledWith({ access_token: 'acc-token' });
        });

        it('throws when neither a JWT nor an access token is provided', async () => {
            const { loader } = makeFakeRingCentral();
            const client = new RealRingCentralCallControlClient({ ...CREDS, Jwt: undefined }, loader);
            await expect(client.CreateSession(PAYLOAD)).rejects.toThrow(/JWT.*access token/);
        });
    });

    describe('client construction', () => {
        it('builds + authenticates the SDK client only once across multiple calls', async () => {
            const { loader, ctorSpy, loginSpy } = makeFakeRingCentral();
            const loaderWrapper = vi.fn(loader);
            const client = new RealRingCentralCallControlClient(CREDS, loaderWrapper);

            await client.CreateSession(PAYLOAD);
            await client.PlayDigits('sess_1', '5');
            await client.DropSession('sess_1');

            expect(loaderWrapper).toHaveBeenCalledTimes(1);
            expect(ctorSpy).toHaveBeenCalledTimes(1);
            expect(loginSpy).toHaveBeenCalledTimes(1);
        });
    });
});
