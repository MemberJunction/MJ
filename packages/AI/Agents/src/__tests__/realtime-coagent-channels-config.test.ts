import { describe, it, expect } from 'vitest';
import {
    BuildAppRealtimeOverridesJson,
    FindIgnoredRealtimeConfigKeys,
    GetSessionTuningSettings,
    ResolveEffectiveRealtimeConfig,
} from '../realtime/realtime-coagent-config';

const layer = (channels: object) => JSON.stringify({ realtime: { channels } });

describe('realtime.channels in the configuration cascade', () => {
    it('accumulates per channel across layers instead of letting the top layer clobber the lower ones', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            layer({ exclude: ['RemoteBrowser'] }), // type default
            null,
            null,
            null,
            layer({ exclude: ['Media'] }), // app layer
        );
        expect([...(effective.realtime?.channels?.exclude ?? [])].sort()).toEqual(['Media', 'RemoteBrowser']);
    });

    it('the most specific layer to mention a channel wins (app include beats agent exclude)', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, layer({ exclude: ['Whiteboard'] }), null, null, layer({ include: ['Whiteboard'] }));
        expect(effective.realtime?.channels).toEqual({ include: ['Whiteboard'] });
    });

    it('runtime overrides sit above the app layer', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, null, layer({ exclude: ['Whiteboard'] }), null, layer({ include: ['Whiteboard'] }));
        expect(effective.realtime?.channels).toEqual({ exclude: ['Whiteboard'] });
    });

    it('merges per-channel config and display policy, later layers winning', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            null,
            layer({ config: { Form: { a: 1, b: 1 } }, displayPolicy: { Form: 'on-demand' } }),
            null,
            null,
            layer({ config: { Form: { b: 2 } }, displayPolicy: { Form: 'headless' } }),
        );
        expect(effective.realtime?.channels?.config).toEqual({ Form: { a: 1, b: 2 } });
        expect(effective.realtime?.channels?.displayPolicy).toEqual({ Form: 'headless' });
    });

    it('is absent when no layer configured channels', () => {
        expect(ResolveEffectiveRealtimeConfig(null, JSON.stringify({ realtime: { modelPreference: 'x' } }), null).realtime?.channels).toBeUndefined();
    });

    it('survives alongside other sections, and a non-object channels value is reported as ignored', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, JSON.stringify({ realtime: { modelPreference: 'm', channels: { include: ['A'] } } }), null);
        expect(effective.realtime).toMatchObject({ modelPreference: 'm', channels: { include: ['A'] } });
        expect(FindIgnoredRealtimeConfigKeys(JSON.stringify({ realtime: { channels: 'nope' } }))).toEqual([
            { path: 'realtime.channels', reason: 'wrong-type' },
        ]);
        expect(FindIgnoredRealtimeConfigKeys(layer({ include: ['A'] }))).toEqual([]);
    });
});

describe('BuildAppRealtimeOverridesJson with Channels', () => {
    it('maps the app\'s PascalCase Channels block onto the cascade\'s channels section', () => {
        const json = BuildAppRealtimeOverridesJson({
            Channels: { Include: ['Form'], Exclude: ['Media'], Config: { Form: { x: 1 } }, DisplayPolicy: { Form: 'on-demand' } },
        });
        expect(JSON.parse(json ?? '{}')).toEqual({
            realtime: { channels: { include: ['Form'], exclude: ['Media'], config: { Form: { x: 1 } }, displayPolicy: { Form: 'on-demand' } } },
        });
    });

    it('applies exclude-beats-include within the app layer', () => {
        const json = BuildAppRealtimeOverridesJson({ Channels: { Include: ['Form'], Exclude: ['Form'] } });
        expect(JSON.parse(json ?? '{}')).toEqual({ realtime: { channels: { exclude: ['Form'] } } });
    });

    it('contributes nothing when Channels is empty or absent, and drops invalid display policies', () => {
        expect(BuildAppRealtimeOverridesJson({ Channels: { Include: [], Exclude: null } })).toBeNull();
        expect(BuildAppRealtimeOverridesJson(null)).toBeNull();
        const json = BuildAppRealtimeOverridesJson({ Channels: { DisplayPolicy: { Form: 'sideways' as never } } });
        expect(json).toBeNull();
    });

    it('feeds the cascade end to end as the app layer', () => {
        const app = BuildAppRealtimeOverridesJson({ Channels: { Exclude: ['Media'] } });
        const effective = ResolveEffectiveRealtimeConfig(null, layer({ exclude: ['RemoteBrowser'] }), null, null, app);
        expect([...(effective.realtime?.channels?.exclude ?? [])].sort()).toEqual(['Media', 'RemoteBrowser']);
    });
});

describe('channels.config.<Key> carries arbitrary per-channel config through the cascade intact', () => {
    it('keeps nested objects, arrays, numbers, booleans and nulls exactly as authored', () => {
        const authored = {
            maxExposure: 'state',
            autoOpenDelegatedComponents: true,
            allowedHosts: ['a.example.com', 'b.example.com'],
            limits: { maxInstances: 3, nested: { depth: [1, 2, { three: 3 }] } },
            note: null,
        };
        const effective = ResolveEffectiveRealtimeConfig(null, layer({ config: { InteractiveComponent: authored } }));
        expect(effective.realtime?.channels?.config?.['InteractiveComponent']).toEqual(authored);
    });

    it('deep-merges one channel\'s config across layers (later wins per key; arrays replace)', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            layer({ config: { Component: { maxExposure: 'pixels', limits: { a: 1, b: 2 }, hosts: ['x'] } } }),
            layer({ config: { Component: { limits: { b: 20, c: 30 }, hosts: ['y', 'z'] } } }),
        );
        expect(effective.realtime?.channels?.config?.['Component']).toEqual({
            maxExposure: 'pixels',
            limits: { a: 1, b: 20, c: 30 },
            hosts: ['y', 'z'],
        });
    });

    it('keeps channels\' config separate and drops non-object entries', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, layer({ config: { A: { x: 1 }, B: 'nope', C: [1, 2], D: null } }));
        expect(effective.realtime?.channels?.config).toEqual({ A: { x: 1 } });
    });
});

describe('requireZeroDataRetentionFor in the realtime cascade', () => {
    it('accumulates as a union across agent and app layers', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            null,
            layer({ requireZeroDataRetentionFor: ['pixels'] }),
            null,
            null,
            layer({ requireZeroDataRetentionFor: ['state'] }),
        );
        expect(effective.realtime?.channels?.requireZeroDataRetentionFor).toEqual(['state', 'pixels']);
    });

    it('is carried from the app\'s AgentSettings.Realtime.Channels block', () => {
        const json = BuildAppRealtimeOverridesJson({ Channels: { RequireZeroDataRetentionFor: ['pixels', 'bogus' as 'pixels'] } });
        const effective = ResolveEffectiveRealtimeConfig(null, null, null, json);
        expect(effective.realtime?.channels?.requireZeroDataRetentionFor).toEqual(['pixels']);
    });

    it('is not reported as an ignored key', () => {
        expect(FindIgnoredRealtimeConfigKeys(layer({ requireZeroDataRetentionFor: ['pixels'] }))).toEqual([]);
    });
});

describe('realtime.session unverifiedMaxSeconds / verifiedMaxSeconds', () => {
    const session = (s: object): string => JSON.stringify({ realtime: { session: s } });

    it('carries positive integers through the cascade', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, session({ unverifiedMaxSeconds: 120, verifiedMaxSeconds: 1800 }));
        expect(effective.realtime?.session).toEqual({ unverifiedMaxSeconds: 120, verifiedMaxSeconds: 1800 });
    });

    it('the most specific layer wins per key and the others survive', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            session({ unverifiedMaxSeconds: 60, verifiedMaxSeconds: 600 }),
            session({ verifiedMaxSeconds: 900 }),
            session({ unverifiedMaxSeconds: 90 }),
        );
        expect(effective.realtime?.session).toEqual({ unverifiedMaxSeconds: 90, verifiedMaxSeconds: 900 });
    });

    it('drops zero, negative, fractional, non-finite and non-numeric values', () => {
        for (const bad of [0, -5, 1.5, '120', null, true, {}]) {
            const effective = ResolveEffectiveRealtimeConfig(null, session({ unverifiedMaxSeconds: bad, verifiedMaxSeconds: bad }));
            expect(effective.realtime?.session, String(bad)).toBeUndefined();
        }
    });

    it('keeps a valid one when its sibling is invalid', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, session({ unverifiedMaxSeconds: 120, verifiedMaxSeconds: -1 }));
        expect(effective.realtime?.session).toEqual({ unverifiedMaxSeconds: 120 });
    });

    it('coexists with provider tuning keys', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, session({ effortLevel: 'high', unverifiedMaxSeconds: 120 }));
        expect(effective.realtime?.session).toEqual({ effortLevel: 'high', unverifiedMaxSeconds: 120 });
    });

    it('is NOT projected onto the driver Config bag (it is an MJ session limit, not a provider knob)', () => {
        const effective = ResolveEffectiveRealtimeConfig(null, session({ unverifiedMaxSeconds: 120, verifiedMaxSeconds: 600 }));
        expect(GetSessionTuningSettings(effective)).toBeNull();
        const mixed = ResolveEffectiveRealtimeConfig(null, session({ effortLevel: 'high', unverifiedMaxSeconds: 120 }));
        expect(GetSessionTuningSettings(mixed)).toEqual({ effortLevel: 'high' });
    });

    it('is not reported as an ignored key', () => {
        expect(FindIgnoredRealtimeConfigKeys(session({ unverifiedMaxSeconds: 120 }))).toEqual([]);
    });
});
