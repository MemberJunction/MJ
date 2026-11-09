import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { CompositeKey, RunView, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MjFormPlacementPreviewComponent } from './form-placement-preview.component';
import { FormStateService } from '../form-state.service';

/**
 * The placement preview draws a second copy of a form the user may have open behind the dialog.
 * It is read-only, so nothing it does may change the real form: not its open sections, not the
 * form state saved for the user. And it reads its sample record once, not once per input.
 */

/** Stands in for the form host, and reports the form state a form inside the preview is given. */
@Component({ standalone: true, selector: 'mj-entity-form-host', template: '' })
class FormHostStub {
    @Input() Provider: IMetadataProvider | null = null;
    @Input() EntityName = '';
    @Input() PrimaryKey: CompositeKey | null = null;
    @Input() EditMode = false;
    @Input() Config: unknown;
    @Output() LoadComplete = new EventEmitter<void>();
    @Output() LoadError = new EventEmitter<void>();
    public readonly State = inject(FormStateService);
}

const ENTITY = {
    Name: 'MoreCheese: Courses',
    NameField: { Name: 'Name' },
    PrimaryKeys: [{ Name: 'ID' }],
} as unknown as EntityInfo;

const PROVIDER = {
    CurrentUser: { ID: 'user-me' },
    EntityByName: () => ENTITY,
} as unknown as IMetadataProvider;

/** Counts the sample-record lookups. */
function stubSampleLookup() {
    const runView = vi.fn(async () => ({ Success: true, Results: [{ ID: 'course-1', Name: 'Algebra' }] }));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
    return runView;
}

function render(inputs: Record<string, unknown>) {
    return renderComponentFixture(MjFormPlacementPreviewComponent, {
        imports: [FormHostStub, StubLoadingComponent],
        declarations: [MjFormPlacementPreviewComponent],
        inputs: { Provider: PROVIDER, ...inputs },
    });
}

/** Lets the queued record lookup run, then redraws. */
async function settle(f: ReturnType<typeof render>): Promise<void> {
    await f.whenStable();
    await Promise.resolve();
    await f.whenStable();
    f.detectChanges();
}

afterEach(() => vi.restoreAllMocks());

describe('MjFormPlacementPreviewComponent (DOM) — the sample record', () => {
    it('looks it up once when the entity and the record key arrive together', async () => {
        const runView = stubSampleLookup();
        const f = render({ EntityName: ENTITY.Name, RecordKey: null });
        await settle(f);
        expect(runView).toHaveBeenCalledTimes(1);
        expect(f.componentInstance.RecordLabel).toBe('Showing “Algebra”, a sample record');
    });

    it('does not look one up for the record the user has open', async () => {
        const runView = stubSampleLookup();
        const f = render({ EntityName: ENTITY.Name, RecordKey: CompositeKey.FromID('course-9') });
        await settle(f);
        expect(runView).not.toHaveBeenCalled();
        expect(f.componentInstance.RecordLabel).toBe('Showing the record you have open');
    });
});

describe('MjFormPlacementPreviewComponent (DOM) — the form state', () => {
    async function formState(): Promise<FormStateService> {
        stubSampleLookup();
        const f = render({ EntityName: ENTITY.Name, RecordKey: CompositeKey.FromID('course-9') });
        await settle(f);
        const host = f.debugElement.query(By.directive(FormHostStub));
        expect(host).not.toBeNull();
        return (host.componentInstance as FormHostStub).State;
    }

    it('gives the form inside it a state of its own, not the one the real form shares', async () => {
        const state = await formState();
        expect(state).not.toBe(TestBed.inject(FormStateService));
    });

    it('keeps that state in memory, so the user\'s saved form state is never written', async () => {
        const state = await formState();
        expect(state.Persist).toBe(false);
        state.SetSectionExpanded(ENTITY.Name, 'details', true);
        expect(state.IsSectionExpanded(ENTITY.Name, 'details', false)).toBe(true);
        expect(TestBed.inject(FormStateService).IsSectionExpanded(ENTITY.Name, 'details', false)).toBe(false);
    });
});
