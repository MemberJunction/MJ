import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { SpecValidationIssue } from '@memberjunction/feature-pipelines';
import { Capture } from '@memberjunction/ng-test-utils';
import {
    GetPipelineBuilderSaveErrors,
    PIPELINE_BUILDER_INVALID_MESSAGE,
    RecordProcessFormComponentExtended,
} from './record-process-form.component';

/**
 * The Record Process form refuses to save while the embedded Feature Pipeline builder reports the pipeline
 * invalid. Knowledge Hub opens pipelines in this form, so this is the save path its users take.
 *
 * The form is constructed in an injection context (this is a class-behaviour spec, so no template renders),
 * and the record is a REAL `MJRecordProcessEntity` whose `Save()` only counts calls.
 */

const RECORD_PROCESS_ENTITY = new EntityInfo({
    ID: 'rp-entity',
    Name: 'MJ: Record Processes',
    Fields: ['ID', 'Name', 'EntityID', 'Status', 'WorkType', 'PromptID', 'Configuration'].map((Name) => ({
        Name,
        Type: Name.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar',
        IsPrimaryKey: Name === 'ID',
        AllowUpdateAPI: Name !== 'ID',
        AllowsNull: true,
    })),
});

/** A Record Process whose Save() succeeds without a provider, counting its calls. */
class CountingRecordProcess extends MJRecordProcessEntity {
    public SaveCalls = 0;

    public override async Save(): Promise<boolean> {
        this.SaveCalls++;
        return true;
    }
}

function recordProcess(workType: MJRecordProcessEntity['WorkType']): CountingRecordProcess {
    const record = new CountingRecordProcess(RECORD_PROCESS_ENTITY);
    record.ID = 'rp-1';
    record.Name = 'Contact Seniority';
    record.EntityID = 'contacts';
    record.Status = 'Active';
    record.WorkType = workType;
    record.Configuration = '{}';
    return record;
}

function makeForm(record: MJRecordProcessEntity, pipelineValid: boolean): RecordProcessFormComponentExtended {
    const form = TestBed.runInInjectionContext(() => new RecordProcessFormComponentExtended());
    form.record = record;
    form.EditMode = true;
    form.OnPipelineValidChange(pipelineValid);
    return form;
}

describe('RecordProcessFormComponentExtended refuses to save a pipeline the builder reports invalid', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
                { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
            ],
        });
    });

    it('does not save an Infer pipeline while the builder reports it invalid, and says why on Configuration', async () => {
        const record = recordProcess('Infer');
        const form = makeForm(record, false);
        const toasts = Capture(form.Notification);

        const saved = await form.SaveRecord(false);

        expect(saved).toBe(false);
        expect(record.SaveCalls).toBe(0);
        const validation = form.Validate();
        expect(validation.Errors.map((e) => [e.Source, e.Message])).toEqual([['Configuration', PIPELINE_BUILDER_INVALID_MESSAGE]]);
        expect(toasts.map((t) => t.Message).join('\n')).toContain(PIPELINE_BUILDER_INVALID_MESSAGE);
    });

    it('saves the Infer pipeline once the builder reports it valid', async () => {
        const record = recordProcess('Infer');
        const form = makeForm(record, false);
        form.OnPipelineValidChange(true);

        expect(await form.SaveRecord(false)).toBe(true);
        expect(record.SaveCalls).toBe(1);
    });

    it('ignores a stale verdict once the process is no longer Infer', async () => {
        const record = recordProcess('FieldRules');
        const form = makeForm(record, false);

        expect(await form.SaveRecord(false)).toBe(true);
        expect(record.SaveCalls).toBe(1);
    });
});

describe('GetPipelineBuilderSaveErrors', () => {
    const issue = (Message: string, Severity: SpecValidationIssue['Severity']): SpecValidationIssue => ({
        Path: 'Outputs',
        Message,
        FixRecommendation: 'Fix it.',
        Severity,
    });

    it("lists the builder's errors once each, and not its warnings", () => {
        const freetext = "Output 'Summary' has constraint type 'freetext', which this pipeline type cannot produce.";
        const errors = GetPipelineBuilderSaveErrors('Infer', false, [issue(freetext, 'error'), issue(freetext, 'error'), issue('Consider caching.', 'warning')]);
        expect(errors).toEqual([freetext]);
    });

    it('falls back to a general message when the builder lists no errors', () => {
        expect(GetPipelineBuilderSaveErrors('Infer', false, [issue('Consider caching.', 'warning')])).toEqual([PIPELINE_BUILDER_INVALID_MESSAGE]);
        expect(GetPipelineBuilderSaveErrors('Infer', false)).toEqual([PIPELINE_BUILDER_INVALID_MESSAGE]);
    });

    it('reports nothing while the builder reports the pipeline valid, or for another work type', () => {
        expect(GetPipelineBuilderSaveErrors('Infer', true, [issue('stale', 'error')])).toEqual([]);
        expect(GetPipelineBuilderSaveErrors('FieldRules', false)).toEqual([]);
        expect(GetPipelineBuilderSaveErrors(undefined, false)).toEqual([]);
    });
});
