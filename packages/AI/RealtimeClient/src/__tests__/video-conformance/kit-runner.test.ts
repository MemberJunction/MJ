/**
 * The kit's runners: results in check order, gated and environment skips with their reasons, failures recorded without
 * throwing, every harness disposed, the console restored, and a clear failure for a harness that hands over no client.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { BaseRealtimeClient } from '../../generic/baseRealtimeClient';
import type { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import {
    ListRealtimeVideoConformanceChecks,
    REALTIME_VIDEO_CONFORMANCE_CHECKS,
    RealtimeVideoConformanceError,
    RunRealtimeVideoConformance,
    type RealtimeVideoConformanceGrant,
    type RealtimeVideoConformanceMedia,
    type RealtimeVideoConformanceTraits,
} from '../../testing';
import { SyntheticHarness } from './synthetic-harness';
import { ALL_CHECK_IDS, OutcomeOf } from './run-outcomes';
import type { SyntheticFaults } from './synthetic-wire';

/** A synthetic harness that counts what the kit does with it. */
class CountingHarness extends SyntheticHarness {
    public static Created = 0;
    public static Disposed = 0;

    constructor(faults: SyntheticFaults = {}) {
        super(faults);
        CountingHarness.Created++;
    }

    public Dispose(): void {
        CountingHarness.Disposed++;
    }
}

/** A synthetic harness that counts each client's Disconnect calls. */
class DisconnectCountingHarness extends SyntheticHarness {
    public static readonly Disconnects: number[] = [];

    public override CreateClient(media: RealtimeVideoConformanceMedia): BaseRealtimeClient {
        const client = super.CreateClient(media);
        const index = DisconnectCountingHarness.Disconnects.push(0) - 1;
        const disconnect = client.Disconnect.bind(client);
        client.Disconnect = async () => {
            DisconnectCountingHarness.Disconnects[index]++;
            await disconnect();
        };
        return client;
    }
}

/** A synthetic harness with environment skips. */
class SkippingHarness extends SyntheticHarness {
    public override readonly Traits: RealtimeVideoConformanceTraits = { ...new SyntheticHarness().Traits, EnvironmentSkips: { VC06: 'this test machine has no decoder' } };
}

/** A harness that hands the kit something that is not a client. */
class NotAClientHarness extends SyntheticHarness {
    public override CreateClient(_media: RealtimeVideoConformanceMedia): BaseRealtimeClient {
        return { Connect: async () => undefined } as Partial<BaseRealtimeClient> as BaseRealtimeClient;
    }
}

/** A harness whose connect throws a plain error, after logging. */
class ThrowingHarness extends SyntheticHarness {
    public override async Connect(): Promise<void> {
        console.warn('about to fail');
        throw new TypeError('the transport fell over');
    }
}

describe('RunRealtimeVideoConformance', () => {
    afterEach(() => {
        CountingHarness.Created = 0;
        CountingHarness.Disposed = 0;
    });

    it('resolves to one result per check, in check order', async () => {
        const results = await RunRealtimeVideoConformance(() => new SyntheticHarness());
        expect(results.map((r) => r.Id)).toEqual([
            'VC01', 'VC02', 'VC03', 'VC04', 'VC05', 'VC06', 'VC07', 'VC08', 'VC09', 'VC10', 'VC11', 'VC12', 'VC13', 'VC14', 'VC15', 'VF01', 'VF02',
        ]);
        expect(results.map((r) => r.Title)).toEqual(REALTIME_VIDEO_CONFORMANCE_CHECKS.map((c) => c.Title));
        // The fMP4 run's voice carries no media time, so VF02 is skipped with that reason.
        expect(results.filter((r) => r.Id !== 'VF02').every((r) => r.Detail === null && r.DurationMs >= 0)).toBe(true);
        expect(results.find((r) => r.Id === 'VF02')?.Detail).toBe("synthetic's voice carries no media time (Traits.TimedVoice is not set)");
    });

    it('skips an environment skip with its reason, before the gate', async () => {
        const results = await RunRealtimeVideoConformance(() => new SkippingHarness());
        expect(results.find((r) => r.Id === 'VC06')).toMatchObject({ Status: 'Skipped', Detail: 'environment: this test machine has no decoder', DurationMs: 0 });
        expect(OutcomeOf(results).Skipped).toEqual(['VC06', 'VF02']);
    });

    it('records failures without throwing, each naming the check, the driver and the rule', async () => {
        const results = await RunRealtimeVideoConformance(() => new SyntheticHarness({ KeepsVideoOnBargeIn: true }));
        expect(results.find((r) => r.Id === 'VC08')).toMatchObject({
            Status: 'Failed',
            Detail: 'VC08 (synthetic (KeepsVideoOnBargeIn)): flushes of the video player at a barge-in: expected 1, got 0',
        });
    });

    it('makes a new harness for every check and disposes each, failed ones too', async () => {
        await RunRealtimeVideoConformance(() => new CountingHarness({ KeepsVideoOnBargeIn: true }));
        expect(CountingHarness.Created).toBe(ALL_CHECK_IDS.length);
        expect(CountingHarness.Disposed).toBe(ALL_CHECK_IDS.length);
    });

    it("disconnects every session's client after its check, if the check didn't", async () => {
        DisconnectCountingHarness.Disconnects.length = 0;
        await RunRealtimeVideoConformance(() => new DisconnectCountingHarness({ KeepsVideoOnBargeIn: true }));

        // 16 checks run (VF02 is skipped: the fMP4 run's voice has no media time), VC11 with two sessions; VC15 disconnects twice itself.
        expect(DisconnectCountingHarness.Disconnects).toHaveLength(17);
        expect(DisconnectCountingHarness.Disconnects.every((count) => count >= 1)).toBe(true);
    });

    it("grants the voice in the video, when a check leaves it out, only to a provider whose video can carry it", async () => {
        const minted: Array<boolean | undefined> = [];
        class MintRecordingHarness extends SyntheticHarness {
            public override Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig {
                minted.push(grant.VideoCarriesVoice);
                return super.Mint(grant);
            }
        }
        const vc03 = REALTIME_VIDEO_CONFORMANCE_CHECKS.find((c) => c.Id === 'VC03');
        await vc03?.Run(new MintRecordingHarness({}, 'chunk'));
        await vc03?.Run(new MintRecordingHarness({}, 'fmp4'));

        expect(minted).toEqual([false, true]);
    });

    it('gives back the console, also when checks fail; what was logged goes into the failure', async () => {
        const warn = console.warn;
        const info = console.info;
        const results = await RunRealtimeVideoConformance(() => new ThrowingHarness());

        expect(console.warn).toBe(warn);
        expect(console.info).toBe(info);
        expect(results[0]).toMatchObject({ Status: 'Failed', Detail: 'VC01 (synthetic): TypeError: the transport fell over (logged: warn: about to fail)' });
    });

    it('fails every check clearly when the harness hands over something that is not a BaseRealtimeClient', async () => {
        const results = await RunRealtimeVideoConformance(() => new NotAClientHarness());
        expect(results[0].Detail).toBe("VC01 (synthetic): the harness: synthetic's CreateClient returned something that is not a BaseRealtimeClient");
        expect(OutcomeOf(results).Passed).toEqual([]);
    });

    it('fails a check whose driver factory throws, and goes on', async () => {
        let calls = 0;
        const results = await RunRealtimeVideoConformance(() => {
            calls++;
            if (calls === 1) {
                throw new Error('no harness today');
            }
            return new SyntheticHarness();
        });
        expect(results[0]).toMatchObject({ Id: 'VC01', Status: 'Failed', Detail: 'the driver factory failed: Error: no harness today' });
        expect(OutcomeOf(results).Passed).toEqual(ALL_CHECK_IDS.slice(1).filter((id) => id !== 'VF02'));
    });

    it("skips with the error when a harness's traits can't be read", async () => {
        const brokenTraits = (): SyntheticHarness => {
            const harness = new SyntheticHarness();
            Object.defineProperty(harness, 'Traits', {
                get: () => {
                    throw new Error('no traits');
                },
            });
            return harness;
        };
        const results = await RunRealtimeVideoConformance(brokenTraits);
        expect(results[0]).toMatchObject({ Status: 'Skipped', Detail: 'the gate failed: Error: no traits' });
    });
});

describe('ListRealtimeVideoConformanceChecks', () => {
    afterEach(() => {
        CountingHarness.Created = 0;
        CountingHarness.Disposed = 0;
    });

    it('lists every check with its skip reason, reading one harness and disposing it', async () => {
        const checks = ListRealtimeVideoConformanceChecks(() => new CountingHarness());
        await Promise.resolve();

        expect(checks.map((c) => c.Id)).toEqual([...ALL_CHECK_IDS]);
        expect(checks.filter((c) => c.SkipReason !== null).map((c) => c.Id)).toEqual(['VF02']);
        expect(CountingHarness.Created).toBe(1);
        expect(CountingHarness.Disposed).toBe(1);
    });

    it("runs a check on a new harness, disposes it, and rejects naming the check when the driver breaks the check's rule", async () => {
        const vc08 = ListRealtimeVideoConformanceChecks(() => new CountingHarness({ KeepsVideoOnBargeIn: true })).find((c) => c.Id === 'VC08');
        const run = vc08?.Run();

        await expect(run).rejects.toBeInstanceOf(RealtimeVideoConformanceError);
        await expect(run).rejects.toThrow('VC08 (synthetic (KeepsVideoOnBargeIn)): flushes of the video player at a barge-in');
        expect(CountingHarness.Created).toBe(2);
        expect(CountingHarness.Disposed).toBe(2);
    });

    it('gives a skipped check its reason, and its Run does nothing', async () => {
        // The driver breaks VC06's rule, so a Run that ran the check would reject.
        const vc06 = ListRealtimeVideoConformanceChecks(() => new SkippingHarness({ VideoToVoice: true })).find((c) => c.Id === 'VC06');
        expect(vc06?.SkipReason).toBe('environment: this test machine has no decoder');
        await expect(vc06?.Run()).resolves.toBeUndefined();
    });
});
