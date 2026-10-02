import { describe, it, expect } from 'vitest';
import {
    CompareExposure,
    DescribeExposureLimit,
    IsExposureLevel,
    MinExposure,
    REALTIME_EXPOSURE_ORDER,
    ReadConfiguredMaxExposure,
    ResolveChannelExposure,
    ResolvePolicyExposure,
    ZeroDataRetentionCeiling,
    UserExposureReason,
} from '../realtime-channel-exposure';

describe('exposure ordering', () => {
    it('orders none < state < pixels', () => {
        expect([...REALTIME_EXPOSURE_ORDER]).toEqual(['none', 'state', 'pixels']);
        expect(CompareExposure('none', 'state')).toBeLessThan(0);
        expect(CompareExposure('pixels', 'state')).toBeGreaterThan(0);
        expect(CompareExposure('state', 'state')).toBe(0);
    });

    it('MinExposure takes the lowest opinion and skips undefined; no opinions means no constraint', () => {
        expect(MinExposure('pixels', 'state')).toBe('state');
        expect(MinExposure('pixels', undefined, 'none', 'state')).toBe('none');
        expect(MinExposure(undefined, undefined)).toBe('pixels');
        expect(MinExposure()).toBe('pixels');
    });

    it('validates levels', () => {
        expect(IsExposureLevel('state')).toBe(true);
        expect(IsExposureLevel('PIXELS')).toBe(false);
        expect(IsExposureLevel(undefined)).toBe(false);
        expect(IsExposureLevel(2)).toBe(false);
    });
});

describe('ReadConfiguredMaxExposure', () => {
    it('reads a valid maxExposure', () => {
        expect(ReadConfiguredMaxExposure({ maxExposure: 'state' })).toBe('state');
        expect(ReadConfiguredMaxExposure({ maxExposure: 'none', other: 1 })).toBe('none');
    });

    it('ignores anything else, so a typo is neither "off" nor "on"', () => {
        expect(ReadConfiguredMaxExposure({ maxExposure: 'everything' })).toBeUndefined();
        expect(ReadConfiguredMaxExposure({ maxExposure: 3 })).toBeUndefined();
        expect(ReadConfiguredMaxExposure({})).toBeUndefined();
        expect(ReadConfiguredMaxExposure(undefined)).toBeUndefined();
        expect(ReadConfiguredMaxExposure(null)).toBeUndefined();
    });
});

describe('ZeroDataRetentionCeiling', () => {
    it('has no limit without a requirement, or when the model declares zero data retention', () => {
        expect(ZeroDataRetentionCeiling(undefined, false)).toBe('pixels');
        expect(ZeroDataRetentionCeiling([], false)).toBe('pixels');
        expect(ZeroDataRetentionCeiling(['pixels'], true)).toBe('pixels');
        expect(ZeroDataRetentionCeiling(['state', 'pixels'], true)).toBe('pixels');
    });

    it('requiring it for pixels leaves state flowing', () => {
        expect(ZeroDataRetentionCeiling(['pixels'], false)).toBe('state');
    });

    it('requiring it for state withholds pixels too, since pixels reveal everything state does', () => {
        expect(ZeroDataRetentionCeiling(['state'], false)).toBe('none');
        expect(ZeroDataRetentionCeiling(['state', 'pixels'], false)).toBe('none');
    });
});

describe('ResolveChannelExposure — min(channel, agent, zero data retention, user)', () => {
    it('is the channel ceiling when nothing lowers it', () => {
        const r = ResolveChannelExposure({ Ceiling: 'pixels' });
        expect(r).toEqual({ Effective: 'pixels', Ceiling: 'pixels', Limits: [] });
    });

    it('the agent cap lowers it, with the reason', () => {
        const r = ResolveChannelExposure({ Ceiling: 'pixels', ConfiguredMax: 'state' });
        expect(r.Effective).toBe('state');
        expect(r.Limits).toHaveLength(1);
        expect(r.Limits[0]).toMatchObject({ Source: 'agent', Level: 'state' });
    });

    it('an agent cap above the channel ceiling cannot raise it', () => {
        const r = ResolveChannelExposure({ Ceiling: 'state', ConfiguredMax: 'pixels' });
        expect(r.Effective).toBe('state');
        expect(r.Limits).toEqual([]);
    });

    it('the user can lower it further but never raise it', () => {
        expect(ResolveChannelExposure({ Ceiling: 'pixels', User: 'state' }).Effective).toBe('state');
        expect(ResolveChannelExposure({ Ceiling: 'pixels', User: 'none' }).Effective).toBe('none');
        expect(ResolveChannelExposure({ Ceiling: 'state', User: 'pixels' }).Effective).toBe('state');
    });

    it('DOWNGRADES when the model lacks zero data retention and the agent requires it, and says why', () => {
        const r = ResolveChannelExposure({
            Ceiling: 'pixels',
            RequireZeroDataRetentionFor: ['pixels'],
            ModelHasZeroDataRetention: false,
        });
        expect(r.Effective).toBe('state');
        expect(r.Limits).toHaveLength(1);
        expect(r.Limits[0].Source).toBe('zero-data-retention');
        expect(r.Limits[0].Reason).toMatch(/requires a zero-data-retention model for 'pixels'/);
    });

    it('does NOT downgrade when the model does declare zero data retention', () => {
        const r = ResolveChannelExposure({
            Ceiling: 'pixels',
            RequireZeroDataRetentionFor: ['state', 'pixels'],
            ModelHasZeroDataRetention: true,
        });
        expect(r.Effective).toBe('pixels');
        expect(r.Limits).toEqual([]);
    });

    it('does not downgrade a channel that never exposed that level anyway', () => {
        const r = ResolveChannelExposure({ Ceiling: 'state', RequireZeroDataRetentionFor: ['pixels'], ModelHasZeroDataRetention: false });
        expect(r.Effective).toBe('state');
        expect(r.Limits).toEqual([]);
    });

    it('a state requirement takes a state-only channel all the way to none', () => {
        const r = ResolveChannelExposure({ Ceiling: 'state', RequireZeroDataRetentionFor: ['state'] });
        expect(r.Effective).toBe('none');
        expect(r.Limits[0].Source).toBe('zero-data-retention');
    });

    it('lists only the limits that BIND: a looser limit is not blamed', () => {
        const r = ResolveChannelExposure({
            Ceiling: 'pixels',
            ConfiguredMax: 'state',
            RequireZeroDataRetentionFor: ['state'],
            ModelHasZeroDataRetention: false,
        });
        expect(r.Effective).toBe('none');
        expect(r.Limits.map((l) => l.Source)).toEqual(['zero-data-retention']);
    });

    it('lists every limit tied at the binding level', () => {
        const r = ResolveChannelExposure({
            Ceiling: 'pixels',
            ConfiguredMax: 'state',
            RequireZeroDataRetentionFor: ['pixels'],
            User: 'state',
        });
        expect(r.Effective).toBe('state');
        expect(r.Limits.map((l) => l.Source).sort()).toEqual(['agent', 'user', 'zero-data-retention']);
    });

    it('ResolvePolicyExposure is the server half: everything but the user', () => {
        const policy = ResolvePolicyExposure({ Ceiling: 'pixels', ConfiguredMax: 'state' });
        expect(policy.Exposure).toBe('state');
        expect(policy.Limits).toHaveLength(1);
    });
});

describe('DescribeExposureLimit', () => {
    it('says nothing when exposure is at the ceiling', () => {
        expect(DescribeExposureLimit('pixels', 'pixels', [])).toBeNull();
        expect(DescribeExposureLimit('state', 'state', ['x'])).toBeNull();
    });

    it('names what is withheld and why', () => {
        expect(DescribeExposureLimit('state', 'pixels', ['the model keeps data'])).toBe(
            "you receive state only; 'pixels' is withheld (the model keeps data)"
        );
    });

    it('for none, says the contents are not shared', () => {
        expect(DescribeExposureLimit('none', 'pixels', [])).toMatch(/not be told what the channel contains/);
    });

    it('does not claim to withhold a level the channel could never expose', () => {
        expect(DescribeExposureLimit('none', 'state', ['r'])).toMatch(/\(r\)$/);
        expect(DescribeExposureLimit('state', 'pixels', [])).toContain("'pixels'");
    });
});

describe('UserExposureReason', () => {
    it('words the user\'s own limit the same way the resolver does, so the browser and the server tell the agent alike', () => {
        const resolved = ResolveChannelExposure({ Ceiling: 'pixels', User: 'state' });
        expect(resolved.Limits).toEqual([{ Source: 'user', Level: 'state', Reason: UserExposureReason('state') }]);
        expect(UserExposureReason('none')).toBe("the user chose to share only 'none' of this channel with the agent");
    });
});
