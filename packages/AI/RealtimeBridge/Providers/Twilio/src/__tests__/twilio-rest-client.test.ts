import { describe, it, expect, vi } from 'vitest';
import {
    RealTwilioRestClient,
    type TwilioModuleFactory,
    type TwilioRestClientLike,
} from '../twilio-rest-client.js';

/** Builds a fake twilio factory + spies so tests can assert the REST payloads without the real SDK or network. */
function makeFakeTwilio(createdSid = 'CA_test_sid') {
    const createSpy = vi.fn(async (_params: Record<string, unknown>) => ({ sid: createdSid }));
    const updateSpy = vi.fn(async (_params: Record<string, unknown>) => undefined);
    const callContext = { update: updateSpy };

    // `calls` is callable (calls(sid)) AND carries create(...) — mirror the real SDK's dual shape.
    const calls = Object.assign((_sid: string) => callContext, { create: createSpy });
    const client: TwilioRestClientLike = { calls: calls as TwilioRestClientLike['calls'] };

    const factorySpy = vi.fn<TwilioModuleFactory>(() => client);
    const loader = async (): Promise<TwilioModuleFactory> => factorySpy;
    return { loader, factorySpy, createSpy, updateSpy };
}

describe('RealTwilioRestClient', () => {
    describe('CreateCall', () => {
        it('maps PascalCase params onto the SDK lowercase shape and returns the Call SID', async () => {
            const { loader, createSpy } = makeFakeTwilio('CA_outbound');
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, loader);

            const sid = await rest.CreateCall({
                To: '+15551230000',
                From: '+15559990000',
                Twiml: '<Response/>',
                StatusCallback: 'https://x/cb',
            });

            expect(sid).toBe('CA_outbound');
            expect(createSpy).toHaveBeenCalledWith({
                to: '+15551230000',
                from: '+15559990000',
                twiml: '<Response/>',
                statusCallback: 'https://x/cb',
            });
        });

        it('omits statusCallback when not provided', async () => {
            const { loader, createSpy } = makeFakeTwilio();
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, loader);

            await rest.CreateCall({ To: '+1', From: '+2', Twiml: '<x/>' });

            expect(createSpy).toHaveBeenCalledWith({ to: '+1', from: '+2', twiml: '<x/>' });
            expect(createSpy.mock.calls[0][0]).not.toHaveProperty('statusCallback');
        });

        it('throws when the SDK returns no SID', async () => {
            const { loader, createSpy } = makeFakeTwilio('');
            createSpy.mockResolvedValueOnce({ sid: '' });
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, loader);
            await expect(rest.CreateCall({ To: '+1', From: '+2', Twiml: '<x/>' })).rejects.toThrow(/no Call SID/);
        });
    });

    describe('UpdateCall', () => {
        it('maps Status onto the SDK status field by SID', async () => {
            const { loader, updateSpy } = makeFakeTwilio();
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, loader);

            await rest.UpdateCall('CA123', { Status: 'completed' });

            expect(updateSpy).toHaveBeenCalledWith({ status: 'completed' });
        });

        it('maps Twiml for transfer/DTMF updates', async () => {
            const { loader, updateSpy } = makeFakeTwilio();
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, loader);

            await rest.UpdateCall('CA123', { Twiml: '<Dial>+1</Dial>' });

            expect(updateSpy).toHaveBeenCalledWith({ twiml: '<Dial>+1</Dial>' });
        });
    });

    describe('auth selection', () => {
        it('prefers API key pair (SK…/secret) with accountSid option when present', async () => {
            const { loader, factorySpy } = makeFakeTwilio();
            const rest = new RealTwilioRestClient(
                { AccountSid: 'AC1', AuthToken: 'tok', ApiKeySid: 'SK1', ApiKeySecret: 'secret' },
                loader,
            );

            await rest.CreateCall({ To: '+1', From: '+2', Twiml: '<x/>' });

            expect(factorySpy).toHaveBeenCalledWith('SK1', 'secret', { accountSid: 'AC1' });
        });

        it('falls back to account SID + auth token when no API key pair', async () => {
            const { loader, factorySpy } = makeFakeTwilio();
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, loader);

            await rest.CreateCall({ To: '+1', From: '+2', Twiml: '<x/>' });

            expect(factorySpy).toHaveBeenCalledWith('AC1', 'tok');
        });

        it('throws when neither an API key pair nor an auth token is provided', async () => {
            const { loader } = makeFakeTwilio();
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1' }, loader);
            await expect(rest.CreateCall({ To: '+1', From: '+2', Twiml: '<x/>' })).rejects.toThrow(/API key pair.*AuthToken/);
        });
    });

    describe('client construction', () => {
        it('builds the SDK client only once across multiple calls', async () => {
            const { loader, factorySpy } = makeFakeTwilio();
            const factorySpyWrapper = vi.fn(loader);
            const rest = new RealTwilioRestClient({ AccountSid: 'AC1', AuthToken: 'tok' }, factorySpyWrapper);

            await rest.CreateCall({ To: '+1', From: '+2', Twiml: '<x/>' });
            await rest.UpdateCall('CA1', { Status: 'completed' });
            await rest.CreateCall({ To: '+3', From: '+4', Twiml: '<y/>' });

            expect(factorySpyWrapper).toHaveBeenCalledTimes(1);
            expect(factorySpy).toHaveBeenCalledTimes(1);
        });
    });
});
