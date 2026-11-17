/**
 * Seed test for the decision calibrations shipped in `metadata/ai-models`. They moved there from
 * hard-coded tables in four packages; this pins the fitted values, so a stray edit to a seed file
 * cannot silently change what conversation routing, agent discovery, the memory note gate or
 * duplicate detection act on.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { AIModelConfiguration, DecisionCalibrationEntry } from '@memberjunction/ai';

const AI_MODELS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../metadata/ai-models');

interface SeedRecord {
    fields: { Name: string; ModelConfiguration?: AIModelConfiguration };
}

function calibrationsOf(file: string, modelName: string): Array<Omit<DecisionCalibrationEntry, 'FittedOn'>> {
    const records = JSON.parse(readFileSync(resolve(AI_MODELS_DIR, file), 'utf8')) as SeedRecord[];
    const record = records.find(r => r.fields.Name === modelName);
    return (record?.fields.ModelConfiguration?.Decision?.Calibrations ?? []).map(({ FittedOn: _fittedOn, ...fit }) => fit);
}

const JEV = 'typesafe/jev-1.13-20260917';
const GPT_OSS = 'GPT-OSS-120B';

describe('decision calibrations seeded on the AI models', () => {
    it('Jev carries the fits for routing, discovery, the memory note gate and duplicate detection', () => {
        expect(calibrationsOf('.jev-models.json', 'Jev')).toEqual([
            { Use: 'conversation-routing', Question: 'continues', ResolvedModel: JEV, A: 1.7757, B: -0.8385 },
            { Use: 'agent-discovery', Question: 'agent', ResolvedModel: JEV, A: 0.4412, B: 0.4571 },
            { Use: 'agent-discovery', Question: 'anyApplies', ResolvedModel: JEV, A: 1.2469, B: 1.77 },
            { Use: 'memory-note-gate', Question: 'note', ResolvedModel: JEV, A: 3.6391, B: -5.7059 },
            { Use: 'duplicate-detection', Question: 'duplicate', ResolvedModel: JEV, A: 2.5855, B: -4.4485 },
        ]);
    });

    it('LLM Decision carries every fit but the memory note gate, which it did not beat the proxy on', () => {
        expect(calibrationsOf('.llm-decision-model.json', 'LLM Decision')).toEqual([
            { Use: 'conversation-routing', Question: 'continues', ResolvedModel: GPT_OSS, A: 1.6508, B: -0.3989 },
            { Use: 'agent-discovery', Question: 'agent', ResolvedModel: GPT_OSS, A: 1.4301, B: -0.0755 },
            { Use: 'agent-discovery', Question: 'anyApplies', ResolvedModel: GPT_OSS, A: 0.7114, B: 0.9073 },
            { Use: 'duplicate-detection', Question: 'duplicate', ResolvedModel: GPT_OSS, A: 0.9918, B: -1.4843 },
        ]);
    });

    it('keeps Jev\'s declared limits next to its calibrations', () => {
        const records = JSON.parse(readFileSync(resolve(AI_MODELS_DIR, '.jev-models.json'), 'utf8')) as SeedRecord[];
        const decision = records.find(r => r.fields.Name === 'Jev')?.fields.ModelConfiguration?.Decision;
        expect(decision).toMatchObject({ MaxChoiceOptions: 255, MaxScoreLevels: 10, MaxStateTokens: 32000 });
    });
});
