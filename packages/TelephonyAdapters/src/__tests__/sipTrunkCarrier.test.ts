import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { LogError } from '@memberjunction/core';
import { CreateSipTrunkCarrier, TwilioElasticSipTrunkCarrier, type TwilioElasticSipTrunkSettings } from '../telephony/sipTrunkCarrier.js';

const GOOD: TwilioElasticSipTrunkSettings = {
    type: 'twilio-elastic-sip',
    originationUri: 'sip:myproject.sip.livekit.cloud',
    terminationUri: 'acme.pstn.twilio.com',
    terminationAuth: 'credential-list',
    numbers: ['+14155550123'],
};

describe('TwilioElasticSipTrunkCarrier', () => {
    it('names itself and describes what the Twilio trunk needs, including the LiveKit SIP URI', () => {
        const carrier = new TwilioElasticSipTrunkCarrier(GOOD);
        expect(carrier.Name).toBe('twilio-elastic-sip');
        const description = carrier.DescribeTrunk();
        expect(description.Carrier).toContain('Twilio');
        expect(description.Steps.join('\n')).toContain('sip:myproject.sip.livekit.cloud');
        expect(description.Steps.join('\n')).toContain('Termination');
    });

    describe('ValidateConfig', () => {
        it('accepts complete settings with no problems or warnings', () => {
            const check = new TwilioElasticSipTrunkCarrier(GOOD).ValidateConfig({ Numbers: ['+14155550123'], DialOut: true });
            expect(check).toEqual({ Valid: true, Problems: [], Warnings: [] });
        });

        it('requires an origination URI that is a SIP URI', () => {
            const missing = new TwilioElasticSipTrunkCarrier({ ...GOOD, originationUri: undefined }).ValidateConfig({ Numbers: [], DialOut: false });
            expect(missing.Valid).toBe(false);
            expect(missing.Problems.join(' ')).toContain('originationUri');
            const wrong = new TwilioElasticSipTrunkCarrier({ ...GOOD, originationUri: 'https://livekit.example' }).ValidateConfig({ Numbers: [], DialOut: false });
            expect(wrong.Problems.join(' ')).toContain('not a SIP URI');
        });

        it('rejects a trunk number that is not E.164', () => {
            const check = new TwilioElasticSipTrunkCarrier({ ...GOOD, numbers: ['4155550123'] }).ValidateConfig({ Numbers: [], DialOut: false });
            expect(check.Valid).toBe(false);
            expect(check.Problems.join(' ')).toContain('not E.164');
        });

        it('warns when a number the deployment answers is not on the trunk, or the trunk lists none', () => {
            const missing = new TwilioElasticSipTrunkCarrier(GOOD).ValidateConfig({ Numbers: ['+14155550999'], DialOut: false });
            expect(missing.Valid).toBe(true);
            expect(missing.Warnings.join(' ')).toContain('+14155550999');
            const none = new TwilioElasticSipTrunkCarrier({ ...GOOD, numbers: [] }).ValidateConfig({ Numbers: ['+14155550123'], DialOut: false });
            expect(none.Warnings.join(' ')).toContain('lists no numbers');
        });

        it('checks the termination side only when the deployment dials out', () => {
            const noDialOut = new TwilioElasticSipTrunkCarrier({ ...GOOD, terminationUri: undefined, terminationAuth: undefined }).ValidateConfig({ Numbers: [], DialOut: false });
            expect(noDialOut.Valid).toBe(true);

            const dialOut = new TwilioElasticSipTrunkCarrier({ ...GOOD, terminationUri: undefined }).ValidateConfig({ Numbers: [], DialOut: true });
            expect(dialOut.Valid).toBe(false);
            expect(dialOut.Problems.join(' ')).toContain('terminationUri');
        });

        it('accepts the plain and regional Twilio termination hostnames and rejects others', () => {
            const valid = (host: string): boolean => new TwilioElasticSipTrunkCarrier({ ...GOOD, terminationUri: host }).ValidateConfig({ Numbers: [], DialOut: true }).Valid;
            expect(valid('acme.pstn.twilio.com')).toBe(true);
            expect(valid('acme.pstn.ie1.twilio.com')).toBe(true);
            expect(valid('acme.example.com')).toBe(false);
            expect(valid('acme.pstn.twilio.com.evil.example')).toBe(false);
        });

        it('warns when dialing out without termination authentication', () => {
            const check = new TwilioElasticSipTrunkCarrier({ ...GOOD, terminationAuth: undefined }).ValidateConfig({ Numbers: [], DialOut: true });
            expect(check.Valid).toBe(true);
            expect(check.Warnings.join(' ')).toContain('terminationAuth');
        });
    });

    it('reports health from configuration alone and says Twilio was not contacted', async () => {
        const healthy = await new TwilioElasticSipTrunkCarrier(GOOD).CheckHealth({ Numbers: ['+14155550123'], DialOut: true });
        expect(healthy.Healthy).toBe(true);
        expect(healthy.Detail).toContain('Twilio was not contacted');
        const broken = await new TwilioElasticSipTrunkCarrier({ ...GOOD, originationUri: undefined }).CheckHealth({ Numbers: [], DialOut: false });
        expect(broken.Healthy).toBe(false);
        expect(broken.Detail).toContain('originationUri');
    });

    it('lists the numbers it was configured with', async () => {
        expect(await new TwilioElasticSipTrunkCarrier(GOOD).ListNumbers()).toEqual([{ Number: '+14155550123' }]);
        expect(await new TwilioElasticSipTrunkCarrier({ ...GOOD, numbers: undefined }).ListNumbers()).toEqual([]);
    });
});

describe('CreateSipTrunkCarrier', () => {
    it('builds the Twilio carrier from its settings', () => {
        expect(CreateSipTrunkCarrier(GOOD)).toBeInstanceOf(TwilioElasticSipTrunkCarrier);
    });

    it('returns nothing when no carrier is configured (the check is optional)', () => {
        expect(CreateSipTrunkCarrier(undefined)).toBeUndefined();
    });

    it('logs and skips an unknown carrier type instead of failing startup', () => {
        vi.mocked(LogError).mockClear();
        expect(CreateSipTrunkCarrier({ type: 'telnyx' } as unknown as TwilioElasticSipTrunkSettings)).toBeUndefined();
        expect(vi.mocked(LogError).mock.calls.map((c) => String(c[0])).join(' ')).toContain("unknown carrier type 'telnyx'");
    });
});
