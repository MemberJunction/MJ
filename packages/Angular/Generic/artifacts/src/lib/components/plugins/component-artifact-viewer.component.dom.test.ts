import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { By } from '@angular/platform-browser';
import type { BaseEntity, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { FormPanelHostProps } from '@memberjunction/interactive-component-types/forms';
import { AngularAdapterService } from '@memberjunction/ng-react';
import { renderComponentFixture, query, text, capture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { ComponentArtifactViewerComponent } from './component-artifact-viewer.component';

/**
 * DOM coverage for the viewer's form-panel branch: a `componentRole: 'form-panel'` artifact
 * previews on its own React host. Spec loading and adapter start-up are stubbed; these cover what
 * that branch must share with the plain component path — errors, the data snapshot, the loading
 * state — and the inline note when Apply cannot run yet.
 */

@Component({ standalone: true, selector: 'mj-react-component', template: '<div class="react-stub"></div>' })
class ReactStub {
    @Input() component: unknown;
    @Input() componentProps: unknown;
    @Output() componentEvent = new EventEmitter<unknown>();
    @Output() openEntityRecord = new EventEmitter<unknown>();
    @Output() initialized = new EventEmitter<void>();
    public resolvedComponentSpec: ComponentSpec | null = null;
    public getCurrentDataState(): unknown { return { title: 'Lifetime value data' }; }
}
@Component({ standalone: true, selector: 'mj-interactive-form', template: '' })
class InteractiveFormStub { @Input() componentSpec: unknown; @Input() record: unknown; }
@Component({ standalone: true, selector: 'mj-component-feedback-panel', template: '' })
class FeedbackStub {
    @Input() ComponentSpec: unknown;
    @Input() ReactContainerElement: unknown;
    @Output() Closed = new EventEmitter<void>();
}

const SPEC = {
    name: 'PersonLtvStrip', title: 'Lifetime value', componentRole: 'form-panel', location: 'registry',
    formContribution: { slot: 'after-fields', presentation: 'panel', title: 'Lifetime value' },
} as unknown as ComponentSpec;
const ENTITY = { Name: 'MJ_BizApps_Common: People', DisplayName: 'People' } as unknown as EntityInfo;
const PROVIDER = { CurrentUser: null } as unknown as IMetadataProvider;

type LifecycleProto = { ngOnInit: () => Promise<void>; ngOnChanges: () => Promise<void> };
type ResolveProto = { resolveSpecWithCode: () => Promise<ComponentSpec | null> };

function render(props: FormPanelHostProps | null = {} as FormPanelHostProps) {
    vi.spyOn(ComponentArtifactViewerComponent.prototype as unknown as LifecycleProto, 'ngOnInit').mockResolvedValue(undefined);
    vi.spyOn(ComponentArtifactViewerComponent.prototype as unknown as LifecycleProto, 'ngOnChanges').mockResolvedValue(undefined);
    return renderComponentFixture(ComponentArtifactViewerComponent, {
        imports: [CommonModule, ReactStub, InteractiveFormStub, FeedbackStub, StubLoadingComponent],
        declarations: [ComponentArtifactViewerComponent],
        providers: [{ provide: AngularAdapterService, useValue: { initialize: async () => undefined } }],
        inputs: { Provider: PROVIDER },
        setup: (viewer) => {
            viewer.IsFormArtifact = true;
            viewer.IsFormPanelArtifact = true;
            viewer.Component = SPEC;
            viewer.FormEntityInfo = ENTITY;
            viewer.FormRecord = {} as BaseEntity;
            viewer.FormRecordLabel = 'Ada Lovelace';
            viewer.PanelPreviewProps = props;
        },
    });
}

const panelHost = (f: ReturnType<typeof render>): ReactStub =>
    f.debugElement.query(By.directive(ReactStub)).componentInstance as ReactStub;

/** Redraws after state set outside an event, which zoneless change detection does not see by itself. */
function redraw(f: ReturnType<typeof render>): void {
    f.componentRef.changeDetectorRef.markForCheck();
    f.detectChanges();
}

afterEach(() => vi.restoreAllMocks());

describe('ComponentArtifactViewerComponent (DOM) — a form panel', () => {
    it('previews the panel on its own React host', () => {
        const f = render();
        expect(query(f, '.form-artifact-panel-preview .react-stub')).not.toBeNull();
        expect(query(f, 'mj-interactive-form')).toBeNull();
    });

    it('shows the panel\'s React error rather than leaving the preview blank', () => {
        const f = render();
        panelHost(f).componentEvent.emit({ type: 'error', payload: { error: 'Cannot read properties of undefined', source: 'render' } });
        f.detectChanges();
        expect(f.componentInstance.HasError).toBe(true);
        expect(text(f, '.error-state h3')).toBe('Component Failed to Load');
        expect(text(f, '.error-state pre')).toContain('Cannot read properties of undefined');
    });

    it('reads the panel\'s data for a snapshot', () => {
        const f = render();
        expect(f.componentInstance.GetCurrentStateSnapshot()).toEqual({ title: 'Lifetime value data' });
    });

    it('shows the standard loading indicator while a record is being bound', () => {
        const f = render(null);
        expect(query(f, '.form-artifact-panel-loading mj-loading')).not.toBeNull();
        expect(text(f, '.form-artifact-panel-loading')).toContain('Binding a record…');
        expect(query(f, '.fa-spinner')).toBeNull();
    });
});

describe('ComponentArtifactViewerComponent (DOM) — Apply before the code has arrived', () => {
    it('says why beside the button, then clears it once Apply works', async () => {
        const resolve = vi.spyOn(ComponentArtifactViewerComponent.prototype as unknown as ResolveProto, 'resolveSpecWithCode')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ ...SPEC, code: 'function PersonLtvStrip(){return null;}' } as ComponentSpec);
        const f = render();
        const applied = capture(f.componentInstance.ApplyFormRequested);

        await f.componentInstance.OnApplyClicked();
        redraw(f);
        expect(text(f, '.form-artifact-apply-notice')).toBe('Component code is still loading. Try again in a moment.');
        expect(applied).toHaveLength(0);

        await f.componentInstance.OnApplyClicked();
        redraw(f);
        expect(query(f, '.form-artifact-apply-notice')).toBeNull();
        expect(applied).toHaveLength(1);
        expect(resolve).toHaveBeenCalledTimes(2);
    });

    it('clears the note when the panel\'s code arrives', () => {
        const f = render();
        f.componentInstance.ApplyNotice = 'Component code is still loading. Try again in a moment.';
        panelHost(f).resolvedComponentSpec = { ...SPEC, code: 'function PersonLtvStrip(){return null;}' } as ComponentSpec;
        f.componentInstance.OnReactComponentInitialized();
        redraw(f);
        expect(f.componentInstance.ApplyNotice).toBeNull();
        expect(query(f, '.form-artifact-apply-notice')).toBeNull();
    });

    it('keeps an initialisation problem out of the Apply note', () => {
        const f = render();
        f.componentInstance.FormInitError = 'Entity "X" not registered with the active provider.';
        redraw(f);
        expect(query(f, '.form-artifact-apply-notice')).toBeNull();
    });
});
