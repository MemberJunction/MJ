import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { PROPERTY_VALUE_TYPES, PropertyDefault, PropertyValueType } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { DashboardPanel } from '../../models/dashboard-types';
import {
    DashboardEventValue,
    DashboardPartEventInfo,
    DashboardPartInterface,
    DashboardProperty,
    DashboardWire,
} from '../../models/dashboard-properties';
import { ValidateDashboardBindings } from '../../models/dashboard-config-validator';
import { LoadPartInterface } from '../../models/dashboard-part-interfaces';

/** What the properties dialog gives back on Apply. */
export interface DashboardPropertiesDialogResult {
    Properties: DashboardProperty[];
    Wires: DashboardWire[];
}

/**
 * The dashboard designer's Properties panel and Wires list, on `mj-dialog`.
 *
 * Properties: add, edit and remove the dashboard's properties (name, type, description, required,
 * and a default: a fixed value or a context token). Wires: each sets a property from one value of a
 * part's event (a View part's `RecordSelected`, a Query part's `RowSelected`, a component's declared
 * events). Apply is refused while a property, a wire or a part's mapping no longer fits, for
 * example a property renamed while a part still maps it.
 *
 * The host opens and closes it, for example with `@if` around `[Visible]="true"`.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-properties-dialog',
    templateUrl: './dashboard-properties-dialog.component.html',
    styleUrls: ['./dashboard-properties-dialog.component.css']
})
export class DashboardPropertiesDialogComponent extends BaseAngularComponent implements OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Whether the dialog shows. Opening copies the inputs and loads what each part declares. */
    @Input()
    set Visible(value: boolean) {
        const wasVisible = this._visible;
        this._visible = value;
        if (value && !wasVisible) {
            Promise.resolve().then(() => this.open());
        }
    }
    get Visible(): boolean {
        return this._visible;
    }
    private _visible = false;

    /** The dashboard's properties. */
    @Input() Properties: DashboardProperty[] = [];
    /** The dashboard's wires. */
    @Input() Wires: DashboardWire[] = [];
    /** The dashboard's parts. */
    @Input() Panels: DashboardPanel[] = [];

    /** Emitted on Apply with the edited properties and wires. */
    @Output() Saved = new EventEmitter<DashboardPropertiesDialogResult>();
    /** Emitted on Cancel or close. */
    @Output() Cancelled = new EventEmitter<void>();

    public readonly Types = PROPERTY_VALUE_TYPES;

    /** The properties being edited. */
    public EditProperties: DashboardProperty[] = [];
    /** The wires being edited. */
    public EditWires: DashboardWire[] = [];
    /** What each part declares, by panel ID; null when it couldn't load. */
    public Interfaces = new Map<string, DashboardPartInterface | null>();
    public IsLoading = false;

    private openCount = 0;
    private destroyed = false;

    /** Everything Apply refuses: properties, wires, and the parts' mappings against the edited properties. */
    public get Problems(): string[] {
        return ValidateDashboardBindings({
            Properties: this.EditProperties,
            Wires: this.EditWires,
            Panels: this.Panels,
            Interfaces: this.Interfaces,
        });
    }

    public get CanApply(): boolean {
        return !this.IsLoading && this.Problems.length === 0;
    }

    /** The parts that raise at least one event a wire can start from. */
    public get WireSources(): DashboardPanel[] {
        return this.Panels.filter(p => (this.Interfaces.get(p.id)?.Events.length ?? 0) > 0);
    }

    /** The events a wire's part raises. */
    public EventsOf(wire: DashboardWire): DashboardPartEventInfo[] {
        return this.Interfaces.get(wire.Panel)?.Events ?? [];
    }

    /** The values a wire's event carries. */
    public ValuesOf(wire: DashboardWire): DashboardEventValue[] {
        return this.EventsOf(wire).find(e => e.Name === wire.Event)?.Values ?? [];
    }

    public AddProperty(): void {
        this.EditProperties = [...this.EditProperties, { Name: this.nextName(), Type: 'string' }];
    }

    public RemoveProperty(index: number): void {
        this.EditProperties = this.EditProperties.filter((_, i) => i !== index);
    }

    public UpdateProperty(index: number, patch: Partial<DashboardProperty>): void {
        this.EditProperties = this.EditProperties.map((p, i) => (i === index ? withoutUndefined({ ...p, ...patch }) : p));
    }

    /** A new type drops a fixed default (it may not fit) and keeps a token. */
    public SetPropertyType(index: number, type: PropertyValueType): void {
        const property = this.EditProperties[index];
        this.UpdateProperty(index, { Type: type, Default: property.Default?.Token ? property.Default : undefined });
    }

    public SetPropertyDefault(index: number, value: PropertyDefault | undefined): void {
        this.UpdateProperty(index, { Default: value });
    }

    /** Adds a wire from the first part that raises events, to the first property. */
    public AddWire(): void {
        const source = this.WireSources[0];
        const event = source ? this.Interfaces.get(source.id)?.Events[0] : undefined;
        this.EditWires = [...this.EditWires, {
            Panel: source?.id ?? '',
            Event: event?.Name ?? '',
            Value: event?.Values[0]?.Name ?? '',
            Property: this.EditProperties[0]?.Name ?? '',
        }];
    }

    public RemoveWire(index: number): void {
        this.EditWires = this.EditWires.filter((_, i) => i !== index);
    }

    /** A new part resets the event and value to its first ones; a new event resets the value. */
    public UpdateWire(index: number, patch: Partial<DashboardWire>): void {
        this.EditWires = this.EditWires.map((wire, i) => (i === index ? this.patchWire(wire, patch) : wire));
    }

    public Apply(): void {
        if (!this.CanApply) return;
        this.Saved.emit({ Properties: this.EditProperties, Wires: this.EditWires });
    }

    public Cancel(): void {
        this.Cancelled.emit();
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.openCount++;
    }

    private patchWire(wire: DashboardWire, patch: Partial<DashboardWire>): DashboardWire {
        const next = { ...wire, ...patch };
        if (patch.Panel !== undefined && patch.Panel !== wire.Panel) {
            const event = this.Interfaces.get(next.Panel)?.Events[0];
            next.Event = event?.Name ?? '';
            next.Value = event?.Values[0]?.Name ?? '';
        } else if (patch.Event !== undefined && patch.Event !== wire.Event) {
            next.Value = this.ValuesOf(next)[0]?.Name ?? '';
        }
        return next;
    }

    /** Copies the inputs and loads what each part declares. */
    private async open(): Promise<void> {
        const openId = ++this.openCount;
        this.EditProperties = this.Properties.map(p => ({ ...p }));
        this.EditWires = this.Wires.map(w => ({ ...w }));
        this.Interfaces = new Map();
        this.IsLoading = true;
        this.cdr.markForCheck();
        const interfaces = new Map<string, DashboardPartInterface | null>();
        await Promise.all(this.Panels.map(async panel => {
            try {
                interfaces.set(panel.id, await LoadPartInterface(panel.config, this.ProviderToUse));
            } catch {
                interfaces.set(panel.id, null);
            }
        }));
        if (openId !== this.openCount || this.destroyed) return;
        this.Interfaces = interfaces;
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    private nextName(): string {
        const taken = new Set(this.EditProperties.map(p => p.Name.toLowerCase()));
        let n = this.EditProperties.length + 1;
        while (taken.has(`property${n}`)) n++;
        return `Property${n}`;
    }
}

/** The property without empty optional keys, so the saved JSON carries only what was set. */
function withoutUndefined(property: DashboardProperty): DashboardProperty {
    const result = { ...property };
    if (!result.Description) delete result.Description;
    if (!result.Default) delete result.Default;
    if (result.IsRequired !== true) delete result.IsRequired;
    return result;
}
