import { describe, it, expect } from 'vitest';
import { ParseAgentSettings } from '../agent-settings';

describe('ParseAgentSettings', () => {
    it('returns null for absent, blank, malformed and non-object payloads (an app with no usable settings has no app layer)', () => {
        expect(ParseAgentSettings(null)).toBeNull();
        expect(ParseAgentSettings(undefined)).toBeNull();
        expect(ParseAgentSettings('   ')).toBeNull();
        expect(ParseAgentSettings('{nope')).toBeNull();
        expect(ParseAgentSettings('[1]')).toBeNull();
        expect(ParseAgentSettings('"x"')).toBeNull();
    });

    it('parses the whole shape, including Realtime.Channels, without touching it', () => {
        const settings = ParseAgentSettings(
            JSON.stringify({
                DefaultAgentID: 'A1',
                RelevantAgents: [{ AgentID: 'A2', Label: 'Skip' }],
                ClientTools: [{ Name: 'Export', Priority: 1 }],
                Realtime: { Disclosure: 'silent', Channels: { Include: ['IdentityVerification'], Exclude: ['Media'], Config: { Media: { a: 1 } }, DisplayPolicy: { Media: 'on-demand' } } },
            }),
        );
        expect(settings?.DefaultAgentID).toBe('A1');
        expect(settings?.RelevantAgents).toHaveLength(1);
        expect(settings?.ClientTools?.[0].Name).toBe('Export');
        expect(settings?.Realtime?.Channels?.Include).toEqual(['IdentityVerification']);
        expect(settings?.Realtime?.Channels?.DisplayPolicy).toEqual({ Media: 'on-demand' });
    });

    it('drops container members of the wrong type instead of coercing them', () => {
        const settings = ParseAgentSettings(JSON.stringify({ RelevantAgents: 'x', ClientTools: {}, Realtime: 5, DefaultAgentID: 'A' }));
        expect(settings).toEqual({ DefaultAgentID: 'A' });
    });

    it('keeps an explicit null Realtime block', () => {
        expect(ParseAgentSettings(JSON.stringify({ Realtime: null }))).toEqual({ Realtime: null });
    });
});
