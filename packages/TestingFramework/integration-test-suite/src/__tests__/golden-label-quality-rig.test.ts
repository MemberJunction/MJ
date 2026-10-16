/**
 * The label-quality rig's budget ceiling, checkpoint key and specification carry-over, without a model.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoldenLabelQualityRig, type LabelerAFile, type LabelSpend } from '../../rigs/feature-pipelines/lib/golden-label-quality-rig';

const zeroSpend = (): LabelSpend => ({ Calls: 0, PromptTokens: 0, CompletionTokens: 0, CacheReadTokens: 0, Cost: 0, LastCallCost: 0 });
const fileA = (title: string): LabelerAFile => ({
    About: 'test',
    Cases: [{ ID: 'g01', Input: { CurrentJobTitle: title }, Expected: { JobFunctions: ['Sales'], SeniorityLevel: ['Director'] }, Labeler: 'A' }],
});

describe('GoldenLabelQualityRig', () => {
    let dir = '';
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        dir = mkdtempSync(join(tmpdir(), 'glq-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('refuses a call once the spend plus the last call would pass the cap', () => {
        expect(() => GoldenLabelQualityRig.AssertWithinBudget({ ...zeroSpend(), Cost: 0.007, LastCallCost: 0.003 }, 0.01)).not.toThrow();
        expect(() => GoldenLabelQualityRig.AssertWithinBudget({ ...zeroSpend(), Cost: 0.0071, LastCallCost: 0.003 }, 0.01)).toThrow(/would pass --max-cost/);
    });

    it('reuses a checkpoint and its spend only for the same instructions, models and case inputs', () => {
        const path = join(dir, 'audit.json.partial.json');
        const key = GoldenLabelQualityRig.CheckpointKey('guide', { B: 'GPT', C: 'Gemini' }, fileA('Director of Sales'));
        writeFileSync(path, JSON.stringify({ Key: key, Answers: { g01: { B: null } }, Spend: { ...zeroSpend(), Cost: 0.003 } }));
        const spend = zeroSpend();
        expect(GoldenLabelQualityRig.LoadCheckpoint(path, key, spend).Answers).toEqual({ g01: { B: null } });
        expect(spend.Cost).toBe(0.003);
        const otherTitle = GoldenLabelQualityRig.CheckpointKey('guide', { B: 'GPT', C: 'Gemini' }, fileA('Sales Director'));
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, otherTitle, zeroSpend())).toThrow(/delete it to start over/);
    });

    it('carries over the specification cases of the golden set being replaced, and refuses a malformed one', () => {
        const path = join(dir, 'golden.json');
        const required = { ID: 'h01', Input: { CurrentJobTitle: 'asdf' }, Expected: { SeniorityLevel: ['Unknown'] }, Required: true, LabelSource: 'specification' };
        writeFileSync(path, JSON.stringify({ Cases: [{ ID: 'g01', Input: {}, Expected: {}, LabelSource: 'model-consensus' }, required] }));
        expect(GoldenLabelQualityRig.SpecificationCasesOf(path)).toEqual([required]);
        writeFileSync(path, JSON.stringify({ Cases: [{ ID: 'h02', LabelSource: 'specification' }] }));
        expect(() => GoldenLabelQualityRig.SpecificationCasesOf(path)).toThrow(/h02/);
    });
});
