import { describe, it, expect } from 'vitest';
import { AdvancedGenerationSchema, DEFAULT_ADVANCED_GENERATION_FEATURES, DEFAULT_CODEGEN_CONFIG, FindUnknownAdvancedGenerationFeatures, KNOWN_ADVANCED_GENERATION_FEATURES } from '../Config/config';

describe('FormLayoutGeneration default', () => {
    it('is enabled in the zod schema defaults', () => {
        const features = AdvancedGenerationSchema.parse({}).features;
        const formLayout = features.find((f) => f.name === 'FormLayoutGeneration');
        expect(formLayout?.enabled).toBe(true);
        expect(features.some((f) => f.name === 'FormLayout')).toBe(false);
    });

    it('agrees with DEFAULT_CODEGEN_CONFIG', () => {
        const zodFeature = AdvancedGenerationSchema.parse({}).features.find((f) => f.name === 'FormLayoutGeneration');
        const defaultFeature = DEFAULT_CODEGEN_CONFIG.advancedGeneration?.features?.find((f) => f.name === 'FormLayoutGeneration');
        expect(defaultFeature).toBeDefined();
        expect(zodFeature?.enabled).toBe(defaultFeature?.enabled);
    });
});

// MJ issue #5822: one default list, no names CodeGen never reads, and unknown names reported.
describe('default advanced-generation feature list', () => {
    const names = (features: ReadonlyArray<{ name: string }> | undefined): string[] => (features ?? []).map((f) => f.name);

    it('is the same list in the zod default and DEFAULT_CODEGEN_CONFIG', () => {
        const zodFeatures = AdvancedGenerationSchema.parse({}).features;
        expect(zodFeatures).toEqual(DEFAULT_ADVANCED_GENERATION_FEATURES);
        expect(DEFAULT_CODEGEN_CONFIG.advancedGeneration?.features).toEqual(DEFAULT_ADVANCED_GENERATION_FEATURES);
    });

    it('drops the names no code reads', () => {
        const defaults = names(DEFAULT_ADVANCED_GENERATION_FEATURES);
        for (const dead of ['DefaultInViewFields', 'EntityFieldDescriptions', 'FormTabs', 'FormLayout']) {
            expect(defaults).not.toContain(dead);
        }
    });

    it('includes TransitiveJoinIntelligence and ParseCheckConstraints', () => {
        const defaults = names(DEFAULT_ADVANCED_GENERATION_FEATURES);
        expect(defaults).toContain('TransitiveJoinIntelligence');
        expect(defaults).toContain('ParseCheckConstraints');
    });

    it('names only known features', () => {
        expect(FindUnknownAdvancedGenerationFeatures(DEFAULT_ADVANCED_GENERATION_FEATURES)).toEqual([]);
    });

    it('hands out copies, so editing a parsed config does not change the defaults', () => {
        const parsed = AdvancedGenerationSchema.parse({});
        parsed.features[0].enabled = !parsed.features[0].enabled;
        expect(AdvancedGenerationSchema.parse({}).features[0].enabled).toBe(DEFAULT_ADVANCED_GENERATION_FEATURES[0].enabled);
    });
});

describe('FindUnknownAdvancedGenerationFeatures', () => {
    it('returns each unknown configured name once, in order', () => {
        const unknown = FindUnknownAdvancedGenerationFeatures([
            { name: 'FormLayout', enabled: true },
            { name: 'FormLayoutGeneration', enabled: true },
            { name: 'FormTabs', enabled: false },
            { name: 'FormLayout', enabled: false },
        ]);
        expect(unknown).toEqual(['FormLayout', 'FormTabs']);
    });

    it('knows every name CodeGen reads, including EntityDisplayNames', () => {
        expect(FindUnknownAdvancedGenerationFeatures(KNOWN_ADVANCED_GENERATION_FEATURES.map((name) => ({ name, enabled: true })))).toEqual([]);
        expect(KNOWN_ADVANCED_GENERATION_FEATURES).toContain('EntityDisplayNames');
    });

    it('tolerates a missing list', () => {
        expect(FindUnknownAdvancedGenerationFeatures(undefined)).toEqual([]);
    });
});
