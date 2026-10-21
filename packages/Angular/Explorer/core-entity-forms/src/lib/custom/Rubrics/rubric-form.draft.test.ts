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
        expect(panel).toContain('[ReadOnly]="!Form.EditMode || !Form.DraftId || Form.Viewing === \'published\'"');
        expect(panel).toContain('[ReadOnly]="!Form.EditMode"');
        const builder = readFileSync(join(directory, '../../../../../../Generic/rubrics/src/lib/rubric-builder.component.html'), 'utf8');
        const records = readFileSync(join(directory, 'record-forms.component.ts'), 'utf8');
        for (const label of ['Guidance', 'isAdvisory', 'rollupMethod', 'OnNodeType', 'Evidence required', 'OnDeleteNode', 'displayTone', 'OnDeleteBand']) {
            expect(builder).toContain(label);
        }
        expect(records).toContain('[Guidance]="record.Guidance"');
        expect(records).toContain('[DisplayTone]="record.DisplayTone"');
        expect(records).toContain('[Sequence]="record.Sequence"');
        expect(records).toContain('[ReadOnly]="!EditMode"');
        expect(records).toContain('Sample rate');
        expect(records).toContain('Pass threshold');
    });

    it('debounces criterion saves and compares ids with UUIDsEqual', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const form = readFileSync(join(directory, 'rubric-form.component.ts'), 'utf8');
        const model = readFileSync(join(directory, '../../../../../../Generic/rubrics/src/lib/model.ts'), 'utf8');
        const onNodes = form.slice(form.indexOf('public OnNodes'), form.indexOf('private async persistNodes'));
        expect(onNodes).toContain('QueueNodeSave');
        expect(onNodes).not.toContain('this.rows(');
        expect(onNodes).not.toContain('this.write(');
        expect(form.slice(form.indexOf('private async persistNodes'), form.indexOf('public async OnBands'))).toContain('PlanNodeSave');
        expect(form).toContain('UUIDsEqual');
        expect(model).toContain('UUIDsEqual');
        expect(form).toContain('ngOnDestroy');
    });

    it('saves rubric rows through typed entities and checks the result', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const form = readFileSync(join(directory, 'rubric-form.component.ts'), 'utf8');
        const scale = readFileSync(join(directory, 'scale-form.component.ts'), 'utf8');
        expect(form).not.toMatch(/\.Set\(/);
        expect(form).not.toMatch(/\.Get\(/);
        expect(form).toContain('MJRubricCriterionEntity');
        expect(form).toContain('requireSave');
        expect(form).toContain('result.Success');
        expect(form).toContain('row.Delete()');
        expect(scale).not.toMatch(/\.Set\(/);
        expect(scale).toContain('MJRubricScaleLevelEntity');
        expect(scale).toContain('result.Success');
        expect(scale).toContain('row.Save()');
    });

    it('loads the author with mj-loading and escapes version ids', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const form = readFileSync(join(directory, 'rubric-form.component.ts'), 'utf8');
        const panel = readFileSync(join(directory, 'rubric-form.panels.ts'), 'utf8');
        expect(panel).toContain('<mj-loading');
        expect(panel).not.toContain('<p>Loading');
        expect(form).toContain('EscapeSQLString');
        expect(form).not.toContain(".replace(/'/g");
    });
});
