import { describe, expect, it } from 'vitest';
import { AgentEvalDriver } from '../drivers/AgentEvalDriver.js';

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
    });
});
