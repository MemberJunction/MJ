import { describe, it, expect } from 'vitest';
import { readSuiteComputerUseConfig, mergeComputerUseConfig } from '../test-driver/suite-config';
import { ComputerUseTestConfig } from '../test-driver/types';

describe('readSuiteComputerUseConfig (RI-E3)', () => {
    it('returns the block when suiteContext.computerUse is a plain object', () => {
        const block = { elementGrounding: true, generation: { temperature: 0 } };
        expect(readSuiteComputerUseConfig({ computerUse: block })).toEqual(block);
    });

    it('returns undefined when there is no suite context', () => {
        expect(readSuiteComputerUseConfig(undefined)).toBeUndefined();
    });

    it('returns undefined when the suite has no computerUse block', () => {
        expect(readSuiteComputerUseConfig({ applicationContext: 'ctx' })).toBeUndefined();
    });

    it('ignores a malformed block (null / array / primitive) rather than throwing', () => {
        expect(readSuiteComputerUseConfig({ computerUse: null })).toBeUndefined();
        expect(readSuiteComputerUseConfig({ computerUse: [1, 2] })).toBeUndefined();
        expect(readSuiteComputerUseConfig({ computerUse: 'grounding' })).toBeUndefined();
        expect(readSuiteComputerUseConfig({ computerUse: 42 })).toBeUndefined();
    });
});

describe('mergeComputerUseConfig (RI-E3 / D7 precedence)', () => {
    it('per-test top-level keys win over the suite block', () => {
        const suite = { elementGrounding: true, headless: true };
        const perTest: ComputerUseTestConfig = { elementGrounding: false };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.elementGrounding).toBe(false); // per-test wins
        expect(merged.headless).toBe(true);          // suite fills the gap
    });

    it('applies suite defaults for keys the test does not set', () => {
        const suite = { trace: 'retain-on-failure' as const, elementGrounding: true };
        const perTest: ComputerUseTestConfig = { maxSteps: 40 };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged).toMatchObject({ trace: 'retain-on-failure', elementGrounding: true, maxSteps: 40 });
    });

    it('deep-merges generation so distinct leaves from both survive', () => {
        const suite = { generation: { temperature: 0 } };
        const perTest: ComputerUseTestConfig = { generation: { effortLevel: 50 } };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.generation).toEqual({ temperature: 0, effortLevel: 50 });
    });

    it('per-test generation leaf overrides the same suite leaf', () => {
        const suite = { generation: { temperature: 0, effortLevel: 10 } };
        const perTest: ComputerUseTestConfig = { generation: { temperature: 0.7 } };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.generation).toEqual({ temperature: 0.7, effortLevel: 10 });
    });

    it('deep-merges appProfile one level', () => {
        const suite = { appProfile: { readinessBeacon: '[data-mj-ready="true"]' } };
        const perTest: ComputerUseTestConfig = { appProfile: { busyMarkers: ['.spinner'] } };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.appProfile).toEqual({
            readinessBeacon: '[data-mj-ready="true"]',
            busyMarkers: ['.spinner'],
        });
    });

    it('an empty suite block leaves the per-test config unchanged', () => {
        const perTest: ComputerUseTestConfig = { elementGrounding: true, maxSteps: 30 };
        expect(mergeComputerUseConfig({}, perTest)).toEqual(perTest);
    });

    it('does not fabricate generation/appProfile when neither side sets them', () => {
        const merged = mergeComputerUseConfig({ headless: true }, { maxSteps: 30 });
        expect('generation' in merged).toBe(false);
        expect('appProfile' in merged).toBe(false);
    });
});
