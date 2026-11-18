import type { GenerationRequest, GenerationResult } from '../types';

/** Writes candidate tests for one generation request, working on base only. */
export abstract class BaseTestGenerator {
    public abstract Generate(request: GenerationRequest): Promise<GenerationResult>;
}
