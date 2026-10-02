import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('agent rubric link writes', () => {
    it('assigns the agent-rubric entity and checks the view and the save', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'agent-rubrics.component.ts'), 'utf8');
        expect(source).toContain('MJAIAgentRubricEntity');
        expect(source).not.toMatch(/\.Set\(/);
        expect(source).not.toMatch(/\.Get\(/);
        expect(source).toContain('links.Success');
        expect(source).toContain('row.Save()');
        expect(source).toContain('row.InnerLoad');
    });
});
