import { describe, it, expect } from 'vitest';
import { ContentSourceConfiguration } from './content-source-configuration';

describe('ContentSourceConfiguration.MergeSourceSpecific', () => {
    it('keeps the stored keys the form does not edit, such as a recorded render version', () => {
        const merged = ContentSourceConfiguration.MergeSourceSpecific({ EntityDocumentRenderVersion: 1, URL: 'old' }, { URL: 'https://example.com' });

        expect(merged).toEqual({ EntityDocumentRenderVersion: 1, URL: 'https://example.com' });
    });

    it('takes the form values when nothing is stored', () => {
        expect(ContentSourceConfiguration.MergeSourceSpecific(undefined, { Path: '/data' })).toEqual({ Path: '/data' });
    });
});
