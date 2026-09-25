import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntity } from '@memberjunction/core-entities';
import { BaseFormComponent, FormStateService } from '@memberjunction/ng-base-forms';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { MJTemplateFormComponentExtended } from './templates-form.component';
import { MJTemplateFormComponent } from '../../generated/Entities/MJTemplate/mjtemplate.form.component';
import { TemplateEditorComponent } from '../../shared/components/template-editor.component';

/**
 * Coverage for MJ#4754 — the Templates form saved its OWN copy of the template contents, loaded by
 * a second RunView, while the user edited the copy held by the embedded <mj-template-editor>.
 * When the form's load landed after the editor's, Save persisted clean rows and the edit (e.g. a
 * content-type change) was silently lost.
 *
 * Harness choice: the form extends the generated form → BaseFormComponent, whose template pulls in
 * the whole record-form container. Rendering it would test that chrome, not this contract, so the
 * class is constructed inside a TestBed injection context with its three injected services stubbed,
 * and the editor is a typed stand-in exposing only the methods the form calls.
 */

const TEMPLATE_ID = 'tpl-4754';

interface EditorDouble {
    SaveTemplateContents: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
    RefreshAndDiscardChanges: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function makeEditor(saveResult = true): EditorDouble {
    return {
        SaveTemplateContents: vi.fn(async () => saveResult),
        RefreshAndDiscardChanges: vi.fn(async () => undefined),
    };
}

function asEditor(double: EditorDouble): TemplateEditorComponent {
    return double as unknown as TemplateEditorComponent;
}

function makeContent(id: string, dirty: boolean): MJTemplateContentEntity {
    return { ID: id, TemplateID: TEMPLATE_ID, Dirty: dirty, Save: vi.fn(async () => true) } as unknown as MJTemplateContentEntity;
}

function makeProvider(runViewCalls: RunViewParams[]): IMetadataProvider {
    const fake = {
        CurrentUser: { ID: 'user-1' },
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            runViewCalls.push(params);
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult;
        },
    };
    return fake as unknown as IMetadataProvider;
}

const notify = { CreateSimpleNotification: vi.fn() };

function createForm(): MJTemplateFormComponentExtended {
    TestBed.configureTestingModule({
        providers: [
            { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
            { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
            { provide: FormStateService, useValue: {} },
            { provide: MJConfirmService, useValue: { Confirm: async () => true } },
            { provide: MJNotificationService, useValue: notify },
        ],
    });
    const form = TestBed.runInInjectionContext(() => new MJTemplateFormComponentExtended());
    form.record = { ID: TEMPLATE_ID, IsSaved: true, Dirty: false } as unknown as MJTemplateEntity;
    return form;
}

describe('MJTemplateFormComponentExtended — template contents have one owner (MJ#4754)', () => {
    beforeEach(() => {
        notify.CreateSimpleNotification.mockReset();
        vi.spyOn(TemplateEngineBase.Instance, 'TemplateContentTypes', 'get').mockReturnValue([]);
    });

    it('saves the contents through the editor — the instances the user edited — not its own copy', async () => {
        const form = createForm();
        const editor = makeEditor(false);
        form.TemplateEditor = asEditor(editor);
        const mirroredRow = makeContent('c1', true);
        form.TemplateContents = [mirroredRow];

        const saved = await form.SaveTemplateContents();

        expect(editor.SaveTemplateContents).toHaveBeenCalledTimes(1);
        expect(saved).toBe(false); // the editor's verdict, not a second opinion
        expect(mirroredRow.Save).not.toHaveBeenCalled();
    });

    it('does not load a second copy of the contents on init', async () => {
        vi.spyOn(MJTemplateFormComponent.prototype, 'ngOnInit').mockResolvedValue(undefined);
        const runViewCalls: RunViewParams[] = [];
        const form = createForm();
        form.Provider = makeProvider(runViewCalls);

        await form.ngOnInit();

        expect(runViewCalls.map((p) => p.EntityName)).not.toContain('MJ: Template Contents');
    });

    it('LoadTemplateContents refreshes the editor instead of loading its own rows', async () => {
        const runViewCalls: RunViewParams[] = [];
        const form = createForm();
        form.Provider = makeProvider(runViewCalls);
        const editor = makeEditor();
        form.TemplateEditor = asEditor(editor);

        await form.LoadTemplateContents();

        expect(editor.RefreshAndDiscardChanges).toHaveBeenCalledTimes(1);
        expect(runViewCalls).toHaveLength(0);
    });

    it('CancelEdit discards the unsaved content edits held by the editor', () => {
        const baseCancel = vi.spyOn(BaseFormComponent.prototype, 'CancelEdit').mockImplementation(() => undefined);
        const form = createForm();
        const editor = makeEditor();
        form.TemplateEditor = asEditor(editor);

        form.CancelEdit();

        expect(baseCancel).toHaveBeenCalledTimes(1);
        expect(editor.RefreshAndDiscardChanges).toHaveBeenCalledTimes(1);
    });

    it('refuses to report success when no editor is rendered but the contents have unsaved rows', async () => {
        const form = createForm();
        const dirtyRow = makeContent('c1', true);
        form.TemplateContents = [dirtyRow];
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const saved = await form.SaveTemplateContents();

        expect(saved).toBe(false);
        expect(dirtyRow.Save).not.toHaveBeenCalled();
        expect(notify.CreateSimpleNotification).toHaveBeenCalledWith(expect.any(String), 'error', expect.any(Number));
        expect(errorLog.mock.calls.some((args) => String(args[0]).includes(TEMPLATE_ID))).toBe(true);
    });

    it('treats "no editor and nothing unsaved" as a successful no-op', async () => {
        const form = createForm();
        form.TemplateContents = [makeContent('c1', false)];

        expect(await form.SaveTemplateContents()).toBe(true);
        expect(notify.CreateSimpleNotification).not.toHaveBeenCalled();
    });
});
