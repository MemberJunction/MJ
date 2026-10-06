import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const agentFiles = [
    'metadata/agents/.actionsmith-agent.json',
    'metadata/agents/.database-designer.json',
    'metadata/agents/.query-builder-agent.json',
    'metadata/agents/.research-agent.json',
    'metadata/agents/.skillsmith-agent.json',
];

describe('shipped agent metadata churn', () => {
    it('keeps the original dash characters in the five agent files', () => {
        for (const file of agentFiles) {
            const source = readFileSync(join(root, file), 'utf8');
            expect(source, file).not.toContain('\\u2014');
            expect(source, file).not.toContain('\\u2192');
        }
    });

    it('pulls agent rubrics and does not pull AI Agent Actions', () => {
        const source = readFileSync(join(root, 'metadata/agents/.mj-sync.json'), 'utf8');
        expect(source).toContain('"MJ: AI Agent Rubrics"');
        expect(source).not.toContain('"MJ: AI Agent Actions"');
    });

    it('does not insert a blank line in the AI dashboards module', () => {
        const source = readFileSync(join(root, 'packages/Angular/Explorer/dashboards/src/ai-dashboards.module.ts'), 'utf8');
        expect(source).not.toContain("ai-overview-hub.component';\n\n\n// Knowledge Hub");
    });
});
