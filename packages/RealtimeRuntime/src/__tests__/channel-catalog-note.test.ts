import { describe, it, expect } from 'vitest';
import { BuildChannelCatalogNote } from '../channels/channel-catalog-note';
import { FormChannel, LegacyEchoChannel } from './channel-test-helpers';

describe('BuildChannelCatalogNote', () => {
    it('describes an on-demand v2 channel: how to open it, its inputs, and its verbs', () => {
        const note = BuildChannelCatalogNote([{ Descriptor: new FormChannel().GetDescriptor(), IsOpen: false, HasNativeTools: false }]);
        expect(note).toContain('[channels]');
        expect(note).toContain('Form (channel "Form", available — open it first)');
        expect(note).toContain('open with: title:string');
        expect(note).toContain('SetField(name:string, value:string)');
        expect(note).toContain('Confirm() [user only]');
    });

    it('lists no verbs for a channel whose tools are declared natively, and nothing for a self-describing legacy channel', () => {
        const note = BuildChannelCatalogNote([
            { Descriptor: new FormChannel().GetDescriptor(), IsOpen: true, HasNativeTools: true },
            { Descriptor: new LegacyEchoChannel().GetDescriptor(), IsOpen: true, HasNativeTools: true },
        ]);
        expect(note).toContain('channel "Form", open');
        expect(note).not.toContain('actions:');
        expect(note).not.toContain('"Echo"');
    });

    it('returns null when no channel needs describing', () => {
        expect(BuildChannelCatalogNote([])).toBeNull();
        expect(BuildChannelCatalogNote([{ Descriptor: new LegacyEchoChannel().GetDescriptor(), IsOpen: true, HasNativeTools: true }])).toBeNull();
    });

    it('skips an open channel with nothing to act on or look at (the headless proxy)', () => {
        const proxy = { ...new FormChannel().GetDescriptor(), Verbs: [], Nouns: [] };
        expect(BuildChannelCatalogNote([{ Descriptor: proxy, IsOpen: true, HasNativeTools: false }])).toBeNull();
    });

    it('stays bounded: long instructions are clipped and excess channels are dropped with a marker', () => {
        const base = new FormChannel().GetDescriptor();
        const entries = Array.from({ length: 40 }, (_, i) => ({
            Descriptor: { ...base, Key: `Chan${i}`, DisplayName: `Chan${i}`, Instructions: 'x'.repeat(2000) },
            IsOpen: false,
            HasNativeTools: false,
        }));
        const note = BuildChannelCatalogNote(entries) ?? '';
        expect(note.length).toBeLessThanOrEqual(9000);
        expect(note).toMatch(/\(\d+ more channel\(s\) omitted for length\.\)/);
        expect(note).toContain('…');
    });
});
