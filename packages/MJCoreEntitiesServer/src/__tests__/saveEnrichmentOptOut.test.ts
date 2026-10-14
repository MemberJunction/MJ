/**
 * Pins the one precedence rule shared by the MJ: Queries, MJ: Query SQLs and MJ: Template Contents
 * server entities (SaveEnrichmentOptOut): the first answered request wins, an explicit false is an
 * answer, a save option of false is no request, and the host switch wins over everything.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EntitySaveOptions } from '@memberjunction/core';
import { SaveTimeAISettings } from '@memberjunction/ai';
import { SaveEnrichmentOptOut } from '../custom/saveEnrichmentOptOut';

describe('SaveEnrichmentOptOut', () => {
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('FromSaveOptions: true only when the save asks; false and absent options are no request', () => {
        const asks = new EntitySaveOptions();
        asks.SkipEntityAIActions = true;
        expect(SaveEnrichmentOptOut.FromSaveOptions(asks)).toBe(true);
        expect(SaveEnrichmentOptOut.FromSaveOptions(new EntitySaveOptions())).toBeUndefined();
        expect(SaveEnrichmentOptOut.FromSaveOptions(undefined)).toBeUndefined();
    });

    it('FirstRequest: the first answered request wins, and an explicit false is an answer', () => {
        expect(SaveEnrichmentOptOut.FirstRequest(undefined, true, false)).toBe(true);
        expect(SaveEnrichmentOptOut.FirstRequest(undefined, false, true)).toBe(false);
        expect(SaveEnrichmentOptOut.FirstRequest(undefined, undefined)).toBeUndefined();
        expect(SaveEnrichmentOptOut.FirstRequest()).toBeUndefined();
    });

    it('ShouldSkip: skips only on a first answer of true while the host switch is on', () => {
        expect(SaveEnrichmentOptOut.ShouldSkip('QueryParameters', true, false)).toBe(true);
        expect(SaveEnrichmentOptOut.ShouldSkip('QueryParameters', undefined, true)).toBe(true);
        expect(SaveEnrichmentOptOut.ShouldSkip('QueryParameters', false, true)).toBe(false);
        expect(SaveEnrichmentOptOut.ShouldSkip('TemplateParameters')).toBe(false);
    });

    it('ShouldSkip: the host switch for that kind wins over an explicit false; another kind does not', () => {
        SaveTimeAISettings.Instance.Config = { TemplateParameters: false };
        expect(SaveEnrichmentOptOut.ShouldSkip('TemplateParameters', false)).toBe(true);
        expect(SaveEnrichmentOptOut.ShouldSkip('QueryParameters', false)).toBe(false);
    });
});
