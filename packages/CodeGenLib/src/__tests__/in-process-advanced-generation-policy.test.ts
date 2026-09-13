import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    applyInProcessAdvancedGenerationPolicy,
    IN_PROCESS_ADVANCED_GENERATION_ENV,
    type ConfigInfo
} from '../Config/config';

/**
 * In-process CodeGen (the runtime schema-update path) runs without advanced (AI) generation unless the
 * operator opts in. Every new entity and field otherwise costs several LLM round trips, so the step's
 * duration becomes the provider's failover behaviour rather than the schema's size, and a bad answer
 * can drop a table.
 */

function config(enabled: boolean | undefined): ConfigInfo {
    return {
        advancedGeneration: enabled === undefined ? undefined : { enableAdvancedGeneration: enabled, features: [] }
    } as unknown as ConfigInfo;
}

describe('applyInProcessAdvancedGenerationPolicy', () => {
    it('turns advanced generation off for the run and back on afterwards', () => {
        const c = config(true);
        const policy = applyInProcessAdvancedGenerationPolicy(c, {});
        expect(policy.disabled).toBe(true);
        expect(c.advancedGeneration?.enableAdvancedGeneration).toBe(false);
        policy.restore();
        expect(c.advancedGeneration?.enableAdvancedGeneration).toBe(true);
    });

    it('leaves it on when the operator opts in with the environment switch', () => {
        const c = config(true);
        const policy = applyInProcessAdvancedGenerationPolicy(c, { [IN_PROCESS_ADVANCED_GENERATION_ENV]: '1' });
        expect(policy.disabled).toBe(false);
        expect(c.advancedGeneration?.enableAdvancedGeneration).toBe(true);
    });

    it('treats any value other than "1" as not opted in', () => {
        const c = config(true);
        expect(applyInProcessAdvancedGenerationPolicy(c, { [IN_PROCESS_ADVANCED_GENERATION_ENV]: 'true' }).disabled).toBe(true);
        expect(c.advancedGeneration?.enableAdvancedGeneration).toBe(false);
    });

    it('does nothing when the config already has it off, or has no section', () => {
        const off = config(false);
        expect(applyInProcessAdvancedGenerationPolicy(off, {}).disabled).toBe(false);
        expect(off.advancedGeneration?.enableAdvancedGeneration).toBe(false);
        expect(applyInProcessAdvancedGenerationPolicy(config(undefined), {}).disabled).toBe(false);
    });

    it('is wired into RunInProcess, before the pipeline runs and restored after it', () => {
        // runCodeGen.ts pulls in the class-registration manifest at import, so it is pinned as text.
        const src = readFileSync(join(__dirname, '..', 'runCodeGen.ts'), 'utf8');
        const start = src.indexOf('public async RunInProcess(');
        const end = src.indexOf('public async Run(', start);
        expect(start).toBeGreaterThan(-1);
        const body = src.slice(start, end);
        const apply = body.indexOf('applyInProcessAdvancedGenerationPolicy(configInfo)');
        const pipeline = body.indexOf('this.executeCodeGenPipeline(');
        expect(apply).toBeGreaterThan(-1);
        expect(pipeline).toBeGreaterThan(apply);
        expect(body.slice(pipeline)).toMatch(/finally\s*\{\s*advancedGeneration\.restore\(\);/);
        // The CLI entry point keeps the config untouched.
        const cli = src.slice(end);
        expect(cli).not.toContain('applyInProcessAdvancedGenerationPolicy');
    });
});
