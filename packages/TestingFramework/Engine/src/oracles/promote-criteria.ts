import type { UserInfo } from '@memberjunction/core';
import type { MJTestEntity } from '@memberjunction/core-entities';
import { ReadJudgeCriteria } from './judge-trace';
import type { OracleConfig, OracleInput } from '../types';

/** The reusable binary scale. Created once and shared by every promoted draft. */
export const BINARY_SCALE_NAME = 'Binary (Met / Not met)';

export interface PromotedCriterion {
    key: string;
    name: string;
    weight: number;
    isGate: boolean;
    gateMinimumScore: number | null;
    sequence: number;
}

/** A draft rubric that copies the inline judge. The version stays Draft. */
export interface PromotedRubric {
    name: string;
    description: string;
    passThreshold: number;
    notApplicablePolicy: 'NotAllowed';
    scoreDisplayMin: 0;
    scoreDisplayMax: 1;
    status: 'Draft';
    criteria: PromotedCriterion[];
}

export type PromoteCriteriaPlan =
    | { ok: true; rubric: PromotedRubric }
    | { ok: false; message: string };

export interface PromoteCriteriaStore {
    saveRubric(input: { name: string; description: string }): Promise<string>;
    ensureBinaryScale(): Promise<string>;
    saveDraftVersion(input: PromotedRubric & { rubricId: string; scaleId: string }): Promise<string>;
    setTestRubric(testId: string, rubricId: string): Promise<void>;
}

/**
 * Plans a Draft rubric from a test's inline criteria. Does not publish and does not replace a rubric
 * the test already has. Weights, the judge threshold, and strict mode are copied onto the leaves.
 */
export function BuildPromotedRubric(input: {
    testName: string;
    testId: string;
    existingRubricId?: string | null;
    expectedOutcomes: unknown;
    configuration: unknown;
}): PromoteCriteriaPlan {
    if (input.existingRubricId) {
        return { ok: false, message: 'This test already has a rubric. Promotion does not replace it.' };
    }
    let expected: unknown = input.expectedOutcomes;
    let configuration: unknown = input.configuration;
    try {
        if (typeof expected === 'string') expected = expected.trim() ? JSON.parse(expected) : {};
        if (typeof configuration === 'string') configuration = configuration.trim() ? JSON.parse(configuration) : {};
    } catch {
        return { ok: false, message: 'Expected outcomes or configuration is not valid JSON.' };
    }
    const judge = judgeOracleConfig(configuration);
    const read = ReadJudgeCriteria(oracleInput(expected), judge);
    if (!read.Success) return { ok: false, message: read.ErrorMessage };
    const threshold = readThreshold(judge.passThreshold);
    if (typeof threshold !== 'number') return { ok: false, message: threshold };
    const strict = judge.strictMode === true;
    const used = new Set<string>();
    return {
        ok: true,
        rubric: {
            name: rubricName(input.testName),
            description: `Draft promoted from the inline criteria on ${input.testName}. Not published.`,
            passThreshold: threshold,
            notApplicablePolicy: 'NotAllowed',
            scoreDisplayMin: 0,
            scoreDisplayMax: 1,
            status: 'Draft',
            criteria: read.Value.map((criterion, index) => ({
                key: criterionKey(criterion.Criterion, index, used),
                name: criterion.Criterion.slice(0, 255),
                weight: criterion.Weight,
                isGate: strict,
                gateMinimumScore: strict ? 1 : null,
                sequence: index,
            })),
        },
    };
}

/** Writes the draft and points the test at it. The version status is Draft. */
export async function PromoteInlineCriteria(testId: string, rubric: PromotedRubric, store: PromoteCriteriaStore): Promise<{ rubricId: string; versionId: string }> {
    const rubricId = await store.saveRubric({ name: rubric.name, description: rubric.description });
    const scaleId = await store.ensureBinaryScale();
    const versionId = await store.saveDraftVersion({ ...rubric, rubricId, scaleId, status: 'Draft' });
    await store.setTestRubric(testId, rubricId);
    return { rubricId, versionId };
}

function oracleInput(expectedOutput: unknown): OracleInput {
    return {
        test: { InputDefinition: null } as MJTestEntity,
        expectedOutput,
        actualOutput: undefined,
        contextUser: { ID: '' } as UserInfo,
    };
}

function judgeOracleConfig(configuration: unknown): OracleConfig {
    if (!configuration || typeof configuration !== 'object' || !('oracles' in configuration)) return {};
    const oracles = (configuration as { oracles?: unknown }).oracles;
    if (!Array.isArray(oracles)) return {};
    const judge = oracles.find(item => item && typeof item === 'object' && (item as { type?: string }).type === 'llm-judge') as { config?: OracleConfig } | undefined;
    return judge?.config ?? {};
}

function readThreshold(value: unknown): number | string {
    if (value === undefined || value === null) return 0.7;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        return 'passThreshold must be a number from 0 to 1.';
    }
    return value;
}

function rubricName(testName: string): string {
    const base = testName.trim() || 'Inline criteria';
    const name = `${base} rubric`;
    return name.length <= 255 ? name : name.slice(0, 255);
}

function criterionKey(text: string, index: number, used: Set<string>): string {
    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let key = (slug || `c${index}`).slice(0, 100);
    const base = key;
    let n = 2;
    while (used.has(key)) {
        const suffix = `-${n}`;
        key = `${base.slice(0, 100 - suffix.length)}${suffix}`;
        n += 1;
    }
    used.add(key);
    return key;
}
