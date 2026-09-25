import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, NO_ERRORS_SCHEMA, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
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

const notify = { CreateSimpleNotification: vi.fn() };

function createEditor(provider: IMetadataProvider): ComponentFixture<TemplateEditorComponent> {
    TestBed.configureTestingModule({
        imports: [FormsModule, CodeEditorStubComponent],
        declarations: [TemplateEditorComponent],
        providers: [
            { provide: MJNotificationService, useValue: notify },
            { provide: MJConfirmService, useValue: { Confirm: async () => true } },
        ],
        // The editor's other children (mj-dropdown, mj-numeric-input) are irrelevant here and are
        // only rendered in allowEdit mode, which the render specs below turn off.
        schemas: [NO_ERRORS_SCHEMA],
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
