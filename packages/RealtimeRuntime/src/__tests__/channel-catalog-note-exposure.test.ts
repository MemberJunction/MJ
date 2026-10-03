import { describe, it, expect } from 'vitest';
import { BuildChannelCatalogNote, type ChannelCatalogEntry } from '../channels/channel-catalog-note';
import { FormChannel, LegacyEchoChannel } from './channel-test-helpers';

const legacyEntry = (): ChannelCatalogEntry => ({
    Descriptor: new LegacyEchoChannel().GetDescriptor(),
    IsOpen: true,
    HasNativeTools: true,
});

describe('catalog note: visibility limits', () => {
    it('a session with nothing to describe and nothing limited sends no note', () => {
        expect(BuildChannelCatalogNote([legacyEntry()])).toBeNull();
    });

    it('a limited channel is described to the agent even when its tools describe themselves', () => {
        const note = BuildChannelCatalogNote([
            { ...legacyEntry(), ExposureLimit: { Effective: 'none', Ceiling: 'state', Reasons: ['this agent requires a zero-data-retention model'] } },
        ]);
        expect(note).toContain('Visibility limits');
        expect(note).toContain('Echo');
        expect(note).toContain('zero-data-retention');
    });

    it('appends the limits after the channel descriptions', () => {
        const form = new FormChannel().GetDescriptor();
        const note = BuildChannelCatalogNote([
            {
                Descriptor: form,
                IsOpen: false,
                HasNativeTools: false,
                ExposureLimit: { Effective: 'none', Ceiling: 'state', Reasons: ["the user chose to share only 'none' of this channel with the agent"] },
            },
        ]);
        expect(note).toContain('[channels] Interactive channels');
        expect(note?.indexOf('Visibility limits')).toBeGreaterThan(note?.indexOf('Interactive channels') ?? 0);
        expect(note).toContain('the user chose');
    });

    it('does not mention a channel whose exposure is at its ceiling', () => {
        const note = BuildChannelCatalogNote([
            { ...legacyEntry(), ExposureLimit: { Effective: 'state', Ceiling: 'state', Reasons: [] } },
        ]);
        expect(note).toBeNull();
    });
});
