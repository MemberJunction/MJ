import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('rubric author draft', () => {
    it('starts a draft from the server clone and stays read-only until one exists', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const form = readFileSync(join(directory, 'rubric-form.component.ts'), 'utf8');
        const panel = readFileSync(join(directory, 'rubric-form.panels.ts'), 'utf8');
        expect(form).toContain("Name='Create Rubric Draft'");
        expect(form).toContain('VersionShownWithoutDraft');
        expect(form).toContain("this.Viewing = 'published'");
        expect(panel).toContain('Start new draft');
        expect(panel).toContain('[ReadOnly]="!Form.DraftId || Form.Viewing === \'published\'"');
        const builder = readFileSync(join(directory, '../../../../../../Generic/rubrics/src/lib/rubric-builder.component.html'), 'utf8');
        const records = readFileSync(join(directory, 'record-forms.component.ts'), 'utf8');
        for (const label of ['Guidance', 'isAdvisory', 'rollupMethod', 'OnNodeType', 'Evidence required', 'OnDeleteNode', 'displayTone', 'OnDeleteBand']) {
            expect(builder).toContain(label);
        }
        expect(records).toContain('[Guidance]="record.Guidance"');
        expect(records).toContain('[DisplayTone]="record.DisplayTone"');
        expect(records).toContain('[Sequence]="record.Sequence"');
        expect(records).toContain('Sample rate');
        expect(records).toContain('Pass threshold');
    });
});
