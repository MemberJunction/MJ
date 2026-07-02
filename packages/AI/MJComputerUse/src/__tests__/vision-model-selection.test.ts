import { describe, it, expect } from 'vitest';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { pickHighestPowerVisionLLM } from '../engine/MJComputerUseEngine.js';

/**
 * Builds a lightweight model stand-in. `pickHighestPowerVisionLLM` only reads ID / AIModelType / PowerRank,
 * so a plain object cast to the entity type is sufficient (no BaseEntity machinery needed).
 */
function model(id: string, type: string, powerRank: number | null): MJAIModelEntityExtended {
    return { ID: id, AIModelType: type, PowerRank: powerRank } as unknown as MJAIModelEntityExtended;
}

/** A predicate over a fixed allow-list of vision-capable model ids. */
function visionSet(...ids: string[]): (id: string) => boolean {
    const set = new Set(ids);
    return (id: string) => set.has(id);
}

describe('pickHighestPowerVisionLLM', () => {
    it('picks the highest-PowerRank LLM among the vision-capable ones', () => {
        const models = [
            model('weak-vision', 'LLM', 10),
            model('strong-vision', 'LLM', 90),
            model('mid-vision', 'LLM', 50),
        ];
        const picked = pickHighestPowerVisionLLM(models, visionSet('weak-vision', 'strong-vision', 'mid-vision'));
        expect(picked?.ID).toBe('strong-vision');
    });

    it('ignores higher-power LLMs that are NOT vision-capable', () => {
        const models = [
            model('text-titan', 'LLM', 100), // highest power, but no image input
            model('vision-mid', 'LLM', 60),
        ];
        const picked = pickHighestPowerVisionLLM(models, visionSet('vision-mid'));
        expect(picked?.ID).toBe('vision-mid');
    });

    it('ignores non-LLM model types even when they support image input', () => {
        const models = [
            model('image-gen', 'Image', 100), // image MODEL, not an LLM
            model('vision-llm', 'LLM', 40),
        ];
        const picked = pickHighestPowerVisionLLM(models, visionSet('image-gen', 'vision-llm'));
        expect(picked?.ID).toBe('vision-llm');
    });

    it('returns undefined when no LLM supports image input (the documented fall-back case)', () => {
        const models = [model('a', 'LLM', 50), model('b', 'LLM', 80)];
        expect(pickHighestPowerVisionLLM(models, visionSet())).toBeUndefined();
    });

    it('returns undefined when there are no LLM-type models at all', () => {
        const models = [model('img', 'Image', 99), model('embed', 'Embeddings', 99)];
        expect(pickHighestPowerVisionLLM(models, visionSet('img', 'embed'))).toBeUndefined();
    });

    it('matches the LLM type case-insensitively and trimming whitespace', () => {
        const models = [model('odd-cased', '  llm  ', 70)];
        expect(pickHighestPowerVisionLLM(models, visionSet('odd-cased'))?.ID).toBe('odd-cased');
    });

    it('treats a null PowerRank as 0 when ranking', () => {
        const models = [model('null-rank', 'LLM', null), model('ranked', 'LLM', 5)];
        expect(pickHighestPowerVisionLLM(models, visionSet('null-rank', 'ranked'))?.ID).toBe('ranked');
    });

    it('does not mutate the input array order', () => {
        const models = [model('low', 'LLM', 1), model('high', 'LLM', 99)];
        const snapshot = models.map((m) => m.ID);
        pickHighestPowerVisionLLM(models, visionSet('low', 'high'));
        expect(models.map((m) => m.ID)).toEqual(snapshot);
    });
});
