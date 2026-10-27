import { describe, it, expect } from 'vitest';
import { AdvancedGenerationSchema, DEFAULT_CODEGEN_CONFIG } from '../Config/config';

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
