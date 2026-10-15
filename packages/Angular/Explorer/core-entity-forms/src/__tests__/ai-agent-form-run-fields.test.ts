/**
 * The AI Agent form's execution history reads a run's result from `FinalPayload`, or `Result` on older
 * runs. The first page loads plain rows limited to its `Fields` list, so every run query must load both
 * columns, or new runs show no result.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const FORM_SOURCE = join(dirname(fileURLToPath(import.meta.url)), '../lib/custom/AIAgents/ai-agent-form.component.ts');

describe('AI Agent form execution history queries', () => {
    it('loads FinalPayload, and Result for older runs, in every AI Agent Runs query', () => {
        const source = readFileSync(FORM_SOURCE, 'utf8');
        const fieldLists = [...source.matchAll(/EntityName: 'MJ: AI Agent Runs',\s*Fields: \[([^\]]*)\]/g)].map((match) => match[1]);

        expect(fieldLists).toHaveLength(3);
        for (const fields of fieldLists) {
            expect(fields).toContain('"FinalPayload"');
            expect(fields).toContain('"Result"');
        }
    });
});
