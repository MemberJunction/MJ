import { Component, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { ComponentEvent, ComponentSpec } from '@memberjunction/interactive-component-types';
import type { ReactComponentEvent } from '@memberjunction/ng-react';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { PartInputProblemMessage, PartInputResolution } from '../models/dashboard-properties';
import { ComponentPartInterface, LoadComponentSpec, COMPONENT_NAME_KEY } from '../models/dashboard-part-interfaces';

/**
 * Runtime renderer for Interactive Component dashboard parts.
 *
 * Renders a registered component (`MJ: Components`, by name, and namespace and version when the part
 * gives them) in the React host, with its props from the part's input mappings and, for an unmapped
 * prop, the prop's own `defaultValue`. The React host's `utilities` (`md`, `rv`, `rq`) come from the
 * part's `ProviderToUse`, so the dashboard's provider reaches the component's data access.
 *
 * The component's declared events are the part's events: each is passed to the component as a
 * callback prop of the same name (`onSelect(id)`), and is also heard when the component raises it
 * through `callbacks.NotifyEvent`. Its values are the event's declared parameters.
 */
@RegisterClass(BaseDashboardPart, 'ComponentPanelRenderer')
@Component({
    standalone: false,
    selector: 'mj-component-part',
    template: `
        <div class="component-part">
          @if (IsLoading) {
            <div class="loading-state">
              <mj-loading text="Loading component..."></mj-loading>
            </div>
          }

          @if (ErrorMessage && !IsLoading) {
            <mj-empty-state
              class="part-placeholder"
              Variant="error"
              Icon="fa-solid fa-triangle-exclamation"
              Title="Couldn't load component"
              [Message]="ErrorMessage"
              Size="compact" />
          }

          @if (!IsLoading && !ErrorMessage && !HasComponent) {
            <mj-empty-state
              class="part-placeholder"
              Icon="fa-solid fa-cubes"
              Title="No Component Selected"
              Message="Use Edit part to choose a component."
              Size="compact" />
          }

          @if (!IsLoading && !ErrorMessage && HasComponent && Spec) {
            <mj-react-component
              [Provider]="ProviderToUse"
              [Component]="Spec"
              [ComponentProps]="ComponentProps"
              (ComponentEvent)="OnReactComponentEvent($event)"
              (OpenEntityRecord)="OnOpenEntityRecord($event)">
            </mj-react-component>
          }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }

        .component-part {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--mj-bg-surface);
        }

        .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 24px;
        }

        .part-placeholder {
            height: 100%;
        }

        mj-react-component {
            flex: 1;
            min-height: 0;
        }
    `]
})
export class ComponentPartComponent extends BaseDashboardPart implements AfterViewInit {
    /** The component's specification, once loaded. */
    public Spec: ComponentSpec | null = null;

    /** Whether the part names a component. */
    public HasComponent = false;

    /** The props the component gets: mapped values, prop defaults, and a callback per declared event. */
    public ComponentProps: Record<string, unknown> = {};

    /** True while the part shows a problem with its mappings rather than a load error. */
    private showingInputProblem = false;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngAfterViewInit(): void {
        if (this.Panel) {
            this.loadContent();
        }
    }

    public async loadContent(): Promise<void> {
        const config = this.getConfig<PanelConfig>();
        if (!config?.[COMPONENT_NAME_KEY]) {
            this.HasComponent = false;
            this.Spec = null;
            this.cdr.detectChanges();
            return;
        }
        this.setLoading(true);
        try {
            const spec = await LoadComponentSpec(config, this.ProviderToUse);
            this.Spec = spec;
            this.HasComponent = true;
            const resolution = this.UpdateInputs(ComponentPartInterface(spec).Inputs);
            if (!this.showInputs(resolution)) return;
            this.setLoading(false);
        } catch (error) {
            this.showingInputProblem = false;
            this.setError(error instanceof Error ? error.message : 'Failed to load component');
        }
    }

    /** New input values: the component re-renders with new props; the component isn't reloaded. */
    protected override ApplyInputs(resolution: PartInputResolution | null): void {
        if (this.ErrorMessage && !this.showingInputProblem) return; // a load error stays until the next load
        if (this.showInputs(resolution)) {
            this.ErrorMessage = null;
            this.cdr.detectChanges();
        }
    }

    /** Shows the inputs' problem, or builds the props from them. Returns false when the part stops. */
    private showInputs(resolution: PartInputResolution | null): boolean {
        const problem = PartInputProblemMessage(resolution);
        this.showingInputProblem = problem !== null;
        if (problem) {
            this.setError(problem);
            return false;
        }
        this.ComponentProps = this.buildProps(resolution);
        return true;
    }

    /** Each declared prop's mapped value, else its `defaultValue`; and a callback for each declared event. */
    private buildProps(resolution: PartInputResolution | null): Record<string, unknown> {
        const props: Record<string, unknown> = {};
        for (const prop of this.Spec?.properties ?? []) {
            if (resolution && Object.prototype.hasOwnProperty.call(resolution.Values, prop.name)) {
                props[prop.name] = resolution.Values[prop.name];
            } else if (prop.defaultValue !== undefined) {
                props[prop.name] = prop.defaultValue;
            }
        }
        for (const event of this.Spec?.events ?? []) {
            props[event.name] = (...args: unknown[]) => this.raiseDeclaredEvent(event, args);
        }
        return props;
    }

    /**
     * Raises a declared event with its parameters by position. An event whose parameters are all
     * empty clears the selection it set.
     */
    private raiseDeclaredEvent(event: ComponentEvent, args: unknown[]): void {
        const parameters = event.parameters ?? [];
        const values: Record<string, unknown> = {};
        parameters.forEach((p, i) => { values[p.name] = args[i]; });
        const cleared = parameters.length > 0 && parameters.every((_, i) => args[i] === null || args[i] === undefined);
        this.EmitPartEvent(event.name, cleared ? null : values);
    }

    /** An event the component raised through `callbacks.NotifyEvent`: a declared one is a part event. */
    public OnReactComponentEvent(event: ReactComponentEvent): void {
        const declared = this.Spec?.events?.find(e => e.name === event.type);
        if (!declared) return;
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        this.raiseDeclaredEvent(declared, (declared.parameters ?? []).map(p => payload[p.name]));
    }

    /** The component asked to open a record. */
    public OnOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
        if (event.entityName && event.key) {
            this.RequestOpenEntityRecord(event.entityName, event.key.ToURLSegment(), 'view', false);
        }
    }

    protected override cleanup(): void {
        this.Spec = null;
        this.ComponentProps = {};
    }
}
