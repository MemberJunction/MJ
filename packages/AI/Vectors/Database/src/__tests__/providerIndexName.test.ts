import { describe, it, expect } from 'vitest';
import { ProviderIndexName } from '../generic/providerIndexName';

describe('ProviderIndexName', () => {
    it('uses ExternalID, the provider-side name, when the display Name differs', () => {
        expect(ProviderIndexName({ Name: 'More Cheese Content (Pinecone)', ExternalID: 'morecheese-content' }))
            .toBe('morecheese-content');
    });

    it('trims surrounding whitespace from ExternalID', () => {
        expect(ProviderIndexName({ Name: 'Label', ExternalID: '  my-index \n' })).toBe('my-index');
    });

    it.each([null, undefined, '', '   '])('falls back to Name when ExternalID is %j', (externalID) => {
        expect(ProviderIndexName({ Name: 'legacy-index', ExternalID: externalID })).toBe('legacy-index');
    });
});
