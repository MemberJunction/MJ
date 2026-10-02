import { describe, it, expect } from 'vitest';
import { BuildAppRealtimeOverridesJson, FindIgnoredRealtimeConfigKeys, ResolveEffectiveRealtimeConfig } from '../realtime/realtime-coagent-config';

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
