import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateContentTypeEntity, MJTemplateEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { TemplateEditorComponent } from './template-editor.component';

/**
 * Coverage for MJ#4754 — "Template Editor content-type change not persisted".
 *
 * The editor owns the `MJ: Template Contents` rows the user edits. These specs pin the contract the
 * Templates form now relies on:
 *  - the array the user edits is the one from the LAST load (an older, slower load must not
 *    overwrite it — that race is what left the form saving clean, unedited copies);
 *  - one load per Template (not one from ngOnChanges and a second from ngOnInit);
 *  - binding the PascalCase `Template` input reloads, not only the deprecated `template` alias;
 *  - the tab label follows `TypeID` (the field the dropdown edits), not the stale view-joined `Type`;
 *  - load and save failures are surfaced, never swallowed.
 *
 * Entities are plain doubles typed through `as unknown as` — the editor only touches the fields
 * modelled here, and a real BaseEntity needs a live metadata provider.
 */

const TEMPLATE_ID = 'tpl-4754';
const TYPE_TEXT = 'type-text';
const TYPE_HTML = 'type-html';

interface ContentDouble {
    ID: string;
    TemplateID: string;
    TypeID: string;
    Type: string;
    TemplateText: string;
    Priority: number;
    IsActive: boolean;
    Dirty: boolean;
    IsSaved: boolean;
    TransactionGroup: unknown;
    LatestResult: { Success: boolean; CompleteMessage: string } | null;
    Save: () => Promise<boolean>;
}

function makeContent(id: string, overrides: Partial<ContentDouble> = {}): MJTemplateContentEntity {
    const double: ContentDouble = {
        ID: id,
        TemplateID: TEMPLATE_ID,
        TypeID: TYPE_TEXT,
        Type: 'Text',
        TemplateText: `text of ${id}`,
        Priority: 1,
        IsActive: true,
        Dirty: false,
        IsSaved: true,
        TransactionGroup: null,
        LatestResult: null,
        Save: async () => true,
        ...overrides,
    };
    return double as unknown as MJTemplateContentEntity;
}

function makeTemplate(id: string = TEMPLATE_ID): MJTemplateEntity {
    return { ID: id, IsSaved: true, Name: 'Welcome email' } as unknown as MJTemplateEntity;
}

/** A RunView result the editor can consume; `Success: false` exercises the failure branch. */
function viewResult(rows: MJTemplateContentEntity[], success = true): RunViewResult {
    return { Success: success, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: success ? '' : 'database unavailable' } as RunViewResult;
}

interface ProviderOptions {
    runView?: (params: RunViewParams) => Promise<RunViewResult>;
    submitResult?: boolean;
}

interface ProviderDouble {
    provider: IMetadataProvider;
    runViewCalls: RunViewParams[];
    getEntityObjectCalls: string[];
}

function makeProvider(options: ProviderOptions = {}): ProviderDouble {
    const runViewCalls: RunViewParams[] = [];
    const getEntityObjectCalls: string[] = [];
    const fake = {
        CurrentUser: { ID: 'user-1' },
        RunView: async (params: RunViewParams) => {
            runViewCalls.push(params);
            return options.runView ? options.runView(params) : viewResult([]);
        },
        GetEntityObject: async (entityName: string) => {
            getEntityObjectCalls.push(entityName);
            return makeContent('', { IsSaved: false, Dirty: true });
        },
        CreateTransactionGroup: async () => ({ Submit: async () => options.submitResult ?? true }),
    };
    return { provider: fake as unknown as IMetadataProvider, runViewCalls, getEntityObjectCalls };
}

/** Stand-in for <mj-code-editor>: the editor calls setValue() on it after every load. */
@Component({ standalone: true, selector: 'mj-code-editor', template: '' })
class CodeEditorStubComponent {
    @Input() readonly = false;
    @Input() language = '';
    @Input() languages: unknown[] = [];
    @Output() change = new EventEmitter<string>();
    public setValue(_value: string): void { /* no-op */ }
}

/** Minimal ControlValueAccessor so `[(ngModel)]` on the stubbed form controls binds without the real widgets. */
abstract class ValueAccessorStub implements ControlValueAccessor {
    writeValue(_value: unknown): void { /* no-op */ }
    registerOnChange(_fn: (value: unknown) => void): void { /* no-op */ }
    registerOnTouched(_fn: () => void): void { /* no-op */ }
}

/** Stand-in for <mj-dropdown> (the Content Type picker, rendered only in allowEdit mode). */
@Component({
    standalone: true,
    selector: 'mj-dropdown',
    template: '',
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DropdownStubComponent), multi: true }],
})
class DropdownStubComponent extends ValueAccessorStub {
    @Input() Data: unknown[] = [];
    @Input() TextField = '';
    @Input() ValueField = '';
    @Input() ValuePrimitive = false;
    @Output() ValueChange = new EventEmitter<unknown>();
}

/** Stand-in for <mj-numeric-input> (the Priority field, rendered only in allowEdit mode). */
@Component({
    standalone: true,
    selector: 'mj-numeric-input',
    template: '',
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumericInputStubComponent), multi: true }],
})
class NumericInputStubComponent extends ValueAccessorStub {
    @Input() Min: number | null = null;
    @Input() Step = 1;
    @Input() Format = '';
}

/** Stand-in for <mj-loading> (shown while the contents load is in flight). */
@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStubComponent {
    @Input() text = '';
    @Input() size = '';
}

const notify = { CreateSimpleNotification: vi.fn() };

function createEditor(provider: IMetadataProvider): ComponentFixture<TemplateEditorComponent> {
    TestBed.configureTestingModule({
        imports: [FormsModule, CodeEditorStubComponent, DropdownStubComponent, NumericInputStubComponent, LoadingStubComponent],
        declarations: [TemplateEditorComponent],
        providers: [
            { provide: MJNotificationService, useValue: notify },
            { provide: MJConfirmService, useValue: { Confirm: async () => true } },
        ],
    });
    const fixture = TestBed.createComponent(TemplateEditorComponent);
    fixture.componentInstance.Provider = provider;
    return fixture;
}

/** Resolves after pending microtasks and one macrotask, so awaited RunView chains settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function rerender(fixture: ComponentFixture<TemplateEditorComponent>): void {
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
}

describe('TemplateEditorComponent — content ownership (MJ#4754)', () => {
    beforeEach(() => {
        notify.CreateSimpleNotification.mockReset();
        vi.spyOn(TemplateEngineBase.Instance, 'TemplateContentTypes', 'get').mockReturnValue([
            { ID: TYPE_TEXT, Name: 'Text' },
            { ID: TYPE_HTML, Name: 'HTML' },
        ] as unknown as MJTemplateContentTypeEntity[]);
    });

    it('keeps the rows from the LATEST load when an earlier, slower load resolves last', async () => {
        let releaseFirstLoad: (r: RunViewResult) => void = () => undefined;
        const staleRow = makeContent('stale-row');
        const freshRow = makeContent('fresh-row');
        let call = 0;
        const { provider } = makeProvider({
            runView: () => {
                call++;
                return call === 1
                    ? new Promise<RunViewResult>((resolve) => { releaseFirstLoad = resolve; })
                    : Promise.resolve(viewResult([freshRow]));
            },
        });
        const fixture = createEditor(provider);
        const editor = fixture.componentInstance;
        editor.Template = makeTemplate();
        const emitted = capture(editor.ContentChange);

        const firstLoad = editor.LoadTemplateContents();
        await editor.LoadTemplateContents();
        releaseFirstLoad(viewResult([staleRow]));
        await firstLoad;

        expect(editor.TemplateContents).toEqual([freshRow]);
        expect(emitted[emitted.length - 1]).toEqual([freshRow]);
    });

    it('loads the contents once when the Template is bound before the first render', async () => {
        const { provider, runViewCalls } = makeProvider({ runView: async () => viewResult([makeContent('c1')]) });
        const fixture = createEditor(provider);
        fixture.componentInstance.config = { allowEdit: false };
        fixture.componentRef.setInput('template', makeTemplate());
        fixture.detectChanges(false); // ngOnChanges + ngOnInit
        await flush();

        expect(runViewCalls.filter((p) => p.EntityName === 'MJ: Template Contents')).toHaveLength(1);
    });

    it('reloads the contents when the PascalCase Template input changes after init', async () => {
        const { provider, runViewCalls } = makeProvider({ runView: async () => viewResult([makeContent('c1')]) });
        const fixture = createEditor(provider);
        fixture.componentInstance.config = { allowEdit: false };
        fixture.detectChanges(false); // init with no template: nothing to load
        await flush();
        expect(runViewCalls).toHaveLength(0);

        fixture.componentRef.setInput('Template', makeTemplate());
        fixture.detectChanges(false);
        await flush();

        expect(runViewCalls.filter((p) => p.EntityName === 'MJ: Template Contents')).toHaveLength(1);
        expect(fixture.componentInstance.TemplateContents.map((c) => c.ID)).toEqual(['c1']);
    });

    it('labels the tab with the content type chosen in TypeID, not the stale view-joined Type', async () => {
        const content = makeContent('c1', { TypeID: TYPE_TEXT, Type: 'Text' });
        const { provider } = makeProvider({ runView: async () => viewResult([content]) });
        const fixture = createEditor(provider);
        fixture.componentInstance.config = { allowEdit: false };
        fixture.componentRef.setInput('template', makeTemplate());
        fixture.detectChanges(false);
        await flush();
        rerender(fixture);
        expect(queryAll(fixture, '.tab-label').map((el) => el.textContent?.trim())).toEqual(['Text']);

        // What the content-type dropdown does: it edits TypeID; the joined `Type` is only refreshed on reload.
        content.TypeID = TYPE_HTML;
        rerender(fixture);

        expect(query(fixture, '.tab-label')?.textContent?.trim()).toBe('HTML');
    });

    it('surfaces a failed contents load instead of treating it as "no contents"', async () => {
        const { provider, getEntityObjectCalls } = makeProvider({ runView: async () => viewResult([], false) });
        const fixture = createEditor(provider);
        const editor = fixture.componentInstance;
        editor.Template = makeTemplate();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await editor.LoadTemplateContents();

        expect(getEntityObjectCalls).toHaveLength(0); // no default row fabricated over a failed read
        expect(editor.TemplateContents).toEqual([]);
        expect(notify.CreateSimpleNotification).toHaveBeenCalledWith(expect.stringContaining('database unavailable'), 'error', expect.any(Number));
        expect(errorLog.mock.calls.some((args) => String(args[0]).includes(TEMPLATE_ID))).toBe(true);
    });

    it('surfaces a failed save with the failing row and its message, and reports failure', async () => {
        const failing = makeContent('c1', {
            Dirty: true,
            LatestResult: { Success: false, CompleteMessage: 'FK violation on TypeID' },
        });
        const { provider } = makeProvider({ runView: async () => viewResult([failing]), submitResult: false });
        const fixture = createEditor(provider);
        const editor = fixture.componentInstance;
        editor.Template = makeTemplate();
        await editor.LoadTemplateContents();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const saved = await editor.SaveTemplateContents();

        expect(saved).toBe(false);
        expect(notify.CreateSimpleNotification).toHaveBeenCalledWith(expect.stringContaining('FK violation on TypeID'), 'error', expect.any(Number));
        const logged = errorLog.mock.calls.map((args) => String(args[0])).join('\n');
        expect(logged).toContain(TEMPLATE_ID);
        expect(logged).toContain('c1');
    });

    it('detaches the submitted transaction group from the rows it saved', async () => {
        // A row that keeps a completed group sends its next Delete() into that dead group (MJ#4763 review, F6).
        const edited = makeContent('c1', { Dirty: true });
        const { provider } = makeProvider({ runView: async () => viewResult([edited]) });
        const editor = createEditor(provider).componentInstance;
        editor.Template = makeTemplate();
        await editor.LoadTemplateContents();

        expect(await editor.SaveTemplateContents()).toBe(true);

        expect((edited as unknown as { TransactionGroup: unknown }).TransactionGroup).toBeNull();
    });

    it('saves the rows the user edited through the transaction group', async () => {
        const saveSpy = vi.fn(async () => true);
        const edited = makeContent('c1', { Dirty: true, Save: saveSpy });
        const untouched = makeContent('c2', { Save: vi.fn(async () => true) });
        const { provider } = makeProvider({ runView: async () => viewResult([edited, untouched]) });
        const fixture = createEditor(provider);
        const editor = fixture.componentInstance;
        editor.Template = makeTemplate();
        await editor.LoadTemplateContents();
        edited.TypeID = TYPE_HTML;

        const saved = await editor.SaveTemplateContents();

        expect(saved).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(untouched.Save).not.toHaveBeenCalled();
        expect(notify.CreateSimpleNotification).not.toHaveBeenCalledWith(expect.anything(), 'error', expect.anything());
    });
});

/** A RunView double whose FIRST call is held open until the test settles it. */
function holdFirstRunView(later: () => Promise<RunViewResult>) {
    let settle: (r: RunViewResult) => void = () => undefined;
    let call = 0;
    const runView = () => {
        call++;
        return call === 1 ? new Promise<RunViewResult>((resolve) => { settle = resolve; }) : later();
    };
    return { runView, settle: (r: RunViewResult) => settle(r) };
}

describe('TemplateEditorComponent — the contents load state is explicit (MJ#4763 review)', () => {
    beforeEach(() => {
        notify.CreateSimpleNotification.mockReset();
        vi.spyOn(TemplateEngineBase.Instance, 'TemplateContentTypes', 'get').mockReturnValue([
            { ID: TYPE_TEXT, Name: 'Text' },
            { ID: TYPE_HTML, Name: 'HTML' },
        ] as unknown as MJTemplateContentTypeEntity[]);
    });

    it('does not report the failure of a load that a newer, successful load overtook', async () => {
        const held = holdFirstRunView(async () => viewResult([makeContent('fresh')]));
        const { provider } = makeProvider({ runView: held.runView });
        const editor = createEditor(provider).componentInstance;
        editor.Template = makeTemplate();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const overtaken = editor.LoadTemplateContents();
        await editor.LoadTemplateContents();
        held.settle(viewResult([], false));
        await overtaken;

        expect(editor.TemplateContents.map((c) => c.ID)).toEqual(['fresh']);
        expect(notify.CreateSimpleNotification).not.toHaveBeenCalledWith(expect.anything(), 'error', expect.anything());
    });

    it('shows a loading state, not the "no content" state, while the load is in flight', async () => {
        const held = holdFirstRunView(async () => viewResult([]));
        const { provider } = makeProvider({ runView: held.runView });
        const fixture = createEditor(provider);
        fixture.componentInstance.config = { allowEdit: true };
        fixture.componentRef.setInput('template', makeTemplate());
        fixture.detectChanges(false);
        await flush();
        rerender(fixture);

        expect(query(fixture, 'mj-loading')).not.toBeNull();
        expect(query(fixture, '.no-content-state')).toBeNull();

        held.settle(viewResult([makeContent('c1')]));
        await flush();
        rerender(fixture);
        expect(query(fixture, 'mj-loading')).toBeNull();
    });

    it('refuses to add a version while a load is in flight, so the landing load cannot drop it', async () => {
        const { provider } = makeProvider({ runView: async () => viewResult([makeContent('c1')]) });
        const editor = createEditor(provider).componentInstance;
        editor.config = { allowEdit: true };
        editor.Template = makeTemplate();
        await editor.LoadTemplateContents();

        const held = holdFirstRunView(async () => viewResult([makeContent('c1')]));
        (provider as unknown as { RunView: (p: RunViewParams) => Promise<RunViewResult> }).RunView = held.runView;
        const reload = editor.LoadTemplateContents();
        await editor.AddNewTemplateContent();
        expect(editor.IsAddingNewContent).toBe(false);

        held.settle(viewResult([makeContent('c1')]));
        await reload;
        await editor.AddNewTemplateContent();

        expect(editor.TemplateContents.map((c) => c.ID)).toEqual(['c1', '']);
        expect(editor.IsAddingNewContent).toBe(true);
    });

    it('tells the host that the rows it holds are gone when a reload FAILS', async () => {
        // Hosts mirror the rows from ContentChange (the Templates form's badges and Run guard read
        // that mirror); a failed reload that stays silent leaves them on the discarded rows (R1).
        let fail = false;
        const { provider } = makeProvider({ runView: async () => (fail ? viewResult([], false) : viewResult([makeContent('c1'), makeContent('c2')])) });
        const editor = createEditor(provider).componentInstance;
        editor.Template = makeTemplate();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await editor.LoadTemplateContents();
        const emitted = capture(editor.ContentChange);

        fail = true;
        await editor.RefreshAndDiscardChanges();

        expect(editor.ContentsLoadState).toBe('failed');
        expect(emitted).toEqual([[]]);
    });

    it('shows an error state with a retry after a FAILED read, never the "no content / create first" state', async () => {
        let fail = true;
        const { provider, runViewCalls } = makeProvider({ runView: async () => (fail ? viewResult([], false) : viewResult([makeContent('c1')])) });
        const fixture = createEditor(provider);
        fixture.componentInstance.config = { allowEdit: true };
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        fixture.componentRef.setInput('template', makeTemplate());
        fixture.detectChanges(false);
        await flush();
        rerender(fixture);

        expect(query(fixture, '.no-content-state')).toBeNull();
        const retry = query(fixture, '.contents-load-failed button');
        expect(retry, 'an error state with a retry control is rendered').not.toBeNull();

        fail = false;
        (retry as HTMLButtonElement).click();
        await flush();
        rerender(fixture);

        expect(runViewCalls.filter((p) => p.EntityName === 'MJ: Template Contents')).toHaveLength(2);
        expect(query(fixture, '.contents-load-failed')).toBeNull();
        expect(queryAll(fixture, '.tab-label')).toHaveLength(1);
    });
});
