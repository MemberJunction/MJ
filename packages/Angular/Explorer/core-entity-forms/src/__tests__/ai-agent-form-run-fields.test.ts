/**
 * The AI Agent form's Runs & Sessions panel reads a run's result from `FinalPayload`, or `Result`
 * on older runs. Because it queries plain rows restricted to a `Fields` list, every `MJ: AI Agent Runs`
 * query must include both columns so neither new nor legacy runs display blank results.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const PANEL_SOURCE = join(
    dirname(fileURLToPath(import.meta.url)),
    '../lib/panels/ai-agents/agent-runs-sessions.panel.ts',
);

describe('AI Agent Runs & Sessions panel queries', () => {
    it('loads FinalPayload and Result in RUN_HISTORY_FIELDS', () => {
        const source = readFileSync(PANEL_SOURCE, 'utf8');
        const match = source.match(/const RUN_HISTORY_FIELDS\s*=\s*\[([^\]]*)\]/s);
        expect(match).not.toBeNull();
        const fields = match![1];
        expect(fields).toContain("'FinalPayload'");
        expect(fields).toContain("'Result'");
    });
});
