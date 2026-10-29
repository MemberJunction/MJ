import { describe, it, expect } from 'vitest';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeDriverFactsOf,
} from '../generic/baseRealtime';

class Probe extends BaseRealtimeModel {
    public async StartSession(): Promise<IRealtimeSession> {
        throw new Error('not used in this test');
    }
    public Clamp(...candidates: ReadonlyArray<number | undefined>): number | undefined {
        return this.ClampSessionSeconds(...candidates);
    }
}

describe('ClampSessionSeconds', () => {
    const probe = new Probe('k');
    it('returns the smallest defined value', () => expect(probe.Clamp(3600, 900, 1200)).toBe(900));
    it('ignores zero and negatives', () => expect(probe.Clamp(0, -5, 1200)).toBe(1200));
    it('ignores NaN and Infinity', () => expect(probe.Clamp(NaN, Infinity, -Infinity, 600)).toBe(600));
    it('ignores non-numbers', () => expect(probe.Clamp('5' as unknown as number, 700)).toBe(700));
    it('returns undefined when nothing is usable', () => {
        expect(probe.Clamp(undefined, undefined)).toBeUndefined();
        expect(probe.Clamp(0, NaN)).toBeUndefined();
        expect(probe.Clamp()).toBeUndefined();
    });
});

describe('DriverFacts', () => {
    it('defaults to {} on the base class', () => expect(BaseRealtimeModel.DriverFacts).toEqual({}));
    it('RealtimeDriverFactsOf reads the subclass static', () => {
        class P2 extends Probe {
            public static override readonly DriverFacts = { ProviderMaxSessionSeconds: 42 };
        }
        expect(RealtimeDriverFactsOf(new P2('k'))).toEqual({ ProviderMaxSessionSeconds: 42 });
    });
    it('RealtimeDriverFactsOf falls back to {} for a driver with no override', () => {
        expect(RealtimeDriverFactsOf(new Probe('k'))).toEqual({});
    });
});
