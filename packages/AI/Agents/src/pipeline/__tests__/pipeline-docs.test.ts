import { describe, it, expect } from 'vitest';
import { BuildPipelineToolDocs } from '../pipeline-docs';

describe('BuildPipelineToolDocs', () => {
    it('returns empty with no sources (pipelines impossible)', () => {
        expect(BuildPipelineToolDocs([])).toBe('');
    });
    it('documents the verb catalog + map/let + field paths', () => {
        const d = BuildPipelineToolDocs(['Run View', 'Send Email']);
        expect(d).toMatch(/## Agent Pipelines/);
        for (const v of ['where', 'select', 'sort', 'first', 'last', 'count', 'jsonpath', 'grep']) {
            expect(d).toContain(`**${v}**`);
        }
        expect(d).toContain('"map"');
        expect(d).toContain('"let"');
        expect(d).toContain('`Run View`');
        expect(d).toContain('pipeInto');
    });
    it('includes worked examples using the first source', () => {
        const d = BuildPipelineToolDocs(['Run View']);
        expect(d).toContain('"tool": "Run View"');
        expect(d).toContain('"where"');
    });
});
