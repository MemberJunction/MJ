import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentEvalDriver, ExtractOutputPayload, MessageWhenNoOracleJudged } from '../drivers/AgentEvalDriver.js';

class StatusProbe extends AgentEvalDriver {
    public status(results: { oracleType: string; passed: boolean; score: number; message: string }[]) {
        return this.determineStatus(results);
    }
}

describe('agent eval oracles', () => {
    it('fails a completed run that has no oracle results', () => {
        const driver = new StatusProbe();
        expect(driver.status([])).toBe('Failed');
        expect(driver.status([{ oracleType: 'rubric', passed: true, score: 1, message: 'ok' }])).toBe('Passed');
        expect(driver.status([{ oracleType: 'rubric', passed: false, score: 0, message: 'no' }])).toBe('Failed');
        expect(MessageWhenNoOracleJudged([])).toBe('No oracle judged this run.');
        expect(MessageWhenNoOracleJudged([{ passed: true }])).toBeUndefined();
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../drivers/AgentEvalDriver.ts'), 'utf8');
        expect(source).not.toContain('export function messageWhenNoOracleJudged');
    });

    describe('ExtractOutputPayload', () => {
        it('leaves output unchanged when FinalPayload is present', () => {
            const payload = { answer: '42', confidence: 0.95 };
            expect(ExtractOutputPayload({ FinalPayload: JSON.stringify(payload) })).toEqual(payload);
            expect(ExtractOutputPayload({ FinalPayload: JSON.stringify(payload), Message: 'ignored message' })).toEqual(payload);
        });

        it('falls back to { message } when FinalPayload is empty and Message is present', () => {
            expect(ExtractOutputPayload({ FinalPayload: '', Message: 'conversational response' })).toEqual({ message: 'conversational response' });
            expect(ExtractOutputPayload({ FinalPayload: null, Message: 'conversational response' })).toEqual({ message: 'conversational response' });
            expect(ExtractOutputPayload({ FinalPayload: '{}', Message: 'conversational response' })).toEqual({ message: 'conversational response' });
        });

        it('returns {} when both FinalPayload and Message are empty', () => {
            expect(ExtractOutputPayload({ FinalPayload: '', Message: '' })).toEqual({});
            expect(ExtractOutputPayload({ FinalPayload: null, Message: null })).toEqual({});
            expect(ExtractOutputPayload({})).toEqual({});
            expect(ExtractOutputPayload({ FinalPayload: '{}', Message: '' })).toEqual({});
        });
    });
});
