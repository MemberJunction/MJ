/**
 * Dashboard properties, part input mappings, events and wires (plan § 4 and § 4.1).
 *
 * A dashboard declares properties; a host sets their values once; each part maps them onto its own
 * inputs under its own names. A wire sets a dashboard property from a part's event (a selection),
 * never a part's input. All of it is optional and lives in the dashboard's saved config: a dashboard
 * with no properties, mappings or wires renders and saves exactly as before.
 *
 * Everything here is plain TypeScript, so it is tested without Angular.
 */
import {
    IsPropertyValueOfType,
    PropertyDefault,
    PropertyResolutionContext,
    PropertyValue,
    PropertyValueType,
    ResolvePropertyDefault,
} from '@memberjunction/core';

/** A dashboard property: a view property's shape without Target and AllowOverride. */
export interface DashboardProperty {
    /** Unique within the dashboard. */
    Name: string;
    Type: PropertyValueType;
    Description?: string;
    /** Used when neither the host nor a wired event gives a value: a fixed value or a context token. */
    Default?: PropertyDefault;
    /** True: a part input it feeds has no value until something sets it. Shown in the designer. */
    IsRequired?: boolean;
}

/** One of a part's inputs, fed by a dashboard property, fixed by a default, or both. */
export interface DashboardPartInputMapping {
    /** The part's own input: a view property, a query parameter, a component prop or a URL placeholder. */
    Input: string;
    /** The dashboard property that feeds it. Omitted: the input takes Default alone. */
    Property?: string;
    /** Used when the dashboard property has no value, and always when Property is omitted. */
    Default?: PropertyDefault;
}

/** Sets a dashboard property from one value of a part's event. */
export interface DashboardWire {
    /** The panel (part) that raises the event. */
    Panel: string;
    /** One of the events that part declares. */
    Event: string;
    /** Which of the event's values: a record's field, a row's column or an event's parameter. */
    Value: string;
    /** The dashboard property it sets. */
    Property: string;
}

/**
 * The type of a part's input or event value. `any` takes every property type (a URL placeholder, a
 * component prop typed `any`); `unsupported` takes none (an array parameter, an object prop).
 */
export type DashboardValueType = PropertyValueType | 'any' | 'unsupported';

/** One input a part declares. */
export interface DashboardPartInput {
    Name: string;
    Type: DashboardValueType;
    Description?: string;
    /** The part can't run without a value for it. */
    IsRequired: boolean;
    /** The input has a default of its own (a view property's or query parameter's default, a prop's defaultValue). */
    HasOwnDefault: boolean;
    /** Only server code sets it (a view property with AllowOverride false, a server-set query parameter): never mapped. */
    ServerSet: boolean;
    /** The user fills it on the part when it is not mapped (a query parameter in the parameter form). */
    UserCanFill?: boolean;
}

/** One value an event carries. */
export interface DashboardEventValue {
    Name: string;
    Type: DashboardValueType;
}

/** One event a part declares. */
export interface DashboardPartEventInfo {
    Name: string;
    Values: DashboardEventValue[];
}

/** What a part declares: its inputs and its events. */
export interface DashboardPartInterface {
    Inputs: DashboardPartInput[];
    Events: DashboardPartEventInfo[];
}

/** A part that declares nothing (an Artifact part, or a part whose source isn't chosen yet). */
export const EMPTY_PART_INTERFACE: DashboardPartInterface = { Inputs: [], Events: [] };

/** The values of a dashboard's properties as one part sees them. */
export type DashboardPropertyValues = Record<string, PropertyValue>;

/** What the viewer hands a part: the dashboard's properties and their values for that part. */
export interface DashboardPartContext {
    Properties: DashboardProperty[];
    Values: DashboardPropertyValues;
}

/** An event a part raised (informational, so no Before/After pair). Values null: the selection was cleared. */
export class DashboardPartEventArgs {
    constructor(
        /** The event's name, one the part declares. */
        public Event: string,
        /** The event's values by name (a record's fields, a row's columns, an event's parameters), or null. */
        public Values: Record<string, unknown> | null,
    ) {}
}

/** A part's inputs worked out from the dashboard. */
export interface PartInputResolution {
    /** A value for each mapped input that has one. An input without a key takes its own default. */
    Values: Record<string, PropertyValue>;
    /** Required inputs with no value: the part stops and names them. */
    Missing: string[];
    /** Mappings that no longer fit the part or the dashboard: the part stops and shows them. */
    Broken: string[];
}

/** The part config key that holds a part's input mappings. */
export const INPUT_MAPPINGS_KEY = 'inputMappings';

/** The View part's selection event and the Query part's. */
export const RECORD_SELECTED_EVENT = 'RecordSelected';
export const ROW_SELECTED_EVENT = 'RowSelected';

/**
 * True when a value of type `source` can fill an input or property of type `target`: the same type,
 * either side `any`, or a uuid or date into a string.
 */
export function IsTypeCompatible(source: DashboardValueType, target: DashboardValueType): boolean {
    if (source === 'unsupported' || target === 'unsupported') return false;
    if (source === 'any' || target === 'any' || source === target) return true;
    return target === 'string' && (source === 'uuid' || source === 'date');
}

/** A SQL type name (an entity field's or a query column's) as a dashboard value type. */
export function SqlTypeToValueType(sqlType: string | null | undefined): DashboardValueType {
    const t = (sqlType ?? '').toLowerCase().replace(/\(.*$/, '').trim();
    if (t === 'uniqueidentifier' || t === 'uuid') return 'uuid';
    if (['bit', 'boolean', 'bool'].includes(t)) return 'boolean';
    if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney', 'integer', 'double precision'].includes(t)) return 'number';
    if (['date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime', 'timestamp', 'timestamptz'].includes(t)) return 'date';
    if (['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext', 'citext'].includes(t)) return 'string';
    return 'any';
}

/** A component prop's or event parameter's declared type as a dashboard value type. */
export function ComponentTypeToValueType(type: string | null | undefined): DashboardValueType {
    const t = (type ?? '').trim().toLowerCase();
    if (t === 'string' || t === 'number' || t === 'boolean') return t;
    return t === '' || t === 'any' ? 'any' : 'unsupported';
}

/** Matches `{Name}` placeholders in a Web URL part's URL. */
const URL_PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** The distinct `{Name}` placeholders in a URL, in order. */
export function ParseUrlPlaceholders(url: string | null | undefined): string[] {
    const names: string[] = [];
    for (const match of (url ?? '').matchAll(URL_PLACEHOLDER)) {
        if (!names.includes(match[1])) names.push(match[1]);
    }
    return names;
}

/** The URL with each placeholder that has a value replaced by the URL-encoded value. Others stay. */
export function FillUrlPlaceholders(url: string, values: Record<string, PropertyValue>): string {
    return url.replace(URL_PLACEHOLDER, (whole, name: string) => {
        const value = values[name];
        return value === null || value === undefined ? whole : encodeURIComponent(String(value));
    });
}

/** The input mappings in a part's config; empty when it has none. */
export function GetInputMappings(config: Record<string, unknown> | null | undefined): DashboardPartInputMapping[] {
    const mappings = config?.[INPUT_MAPPINGS_KEY];
    return Array.isArray(mappings) ? (mappings as DashboardPartInputMapping[]) : [];
}

/**
 * A value from an event (a record field, a row column, an event parameter) as a property value: a
 * Date becomes an ISO string, a primitive stays, anything else (an object, a list) is no value.
 */
export function NormalizeEventValue(value: unknown): PropertyValue {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return null;
}

/** Works out a default, or null when it can't be (a malformed default is refused on save). */
function resolveDefault(def: PropertyDefault | undefined, ctx: PropertyResolutionContext): PropertyValue {
    if (!def) return null;
    try {
        return ResolvePropertyDefault(def, ctx);
    } catch {
        return null;
    }
}

function hasValue(value: PropertyValue | undefined): value is string | number | boolean {
    return value !== null && value !== undefined;
}

/** The value an event set for a property, and the panel whose event set it. */
interface EventValue {
    Value: PropertyValue;
    Panel: string;
}

/**
 * Works out the dashboard's property values. For each property, the first of: the value the host
 * set; the value the latest wired event set; the property's default (a token worked out with the
 * context's user, clock and zone). A host value of null or undefined counts as not set.
 *
 * No loops: the values a panel sees leave out the values its own events set, so a part is never
 * refreshed by its own selection.
 */
export class DashboardPropertyResolver {
    private hostValues: Record<string, unknown> = {};
    private readonly eventValues = new Map<string, EventValue>();

    constructor(private properties: DashboardProperty[], private readonly ctx: () => PropertyResolutionContext) {}

    /** The dashboard's properties. */
    public get Properties(): DashboardProperty[] {
        return this.properties;
    }

    /** Takes a new list of properties; event values for properties that no longer exist are dropped. */
    public SetProperties(properties: DashboardProperty[]): void {
        this.properties = properties;
        for (const name of [...this.eventValues.keys()]) {
            if (!properties.some(p => p.Name === name)) this.eventValues.delete(name);
        }
    }

    /** Takes the host's values (the viewer's Properties input). */
    public SetHostValues(values: Record<string, unknown> | null | undefined): void {
        this.hostValues = { ...(values ?? {}) };
    }

    /** Records that a panel's event set a property. A null value clears it, as a cleared selection does. */
    public SetEventValue(property: string, value: PropertyValue, panel: string): void {
        if (value === null) {
            this.ClearEventValue(property, panel);
        } else {
            this.eventValues.set(property, { Value: value, Panel: panel });
        }
    }

    /** Removes every event value, as when the parts are rebuilt and their selections are gone. */
    public ClearEventValues(): void {
        this.eventValues.clear();
    }

    /** Removes the event value of a property, when that panel set it. */
    public ClearEventValue(property: string, panel: string): void {
        if (this.eventValues.get(property)?.Panel === panel) this.eventValues.delete(property);
    }

    /** Every property's value as the panel sees it (without the values its own events set). */
    public ValuesFor(panel: string | null): DashboardPropertyValues {
        const ctx = this.ctx();
        const values: DashboardPropertyValues = {};
        for (const property of this.properties) {
            values[property.Name] = this.valueOf(property, panel, ctx);
        }
        return values;
    }

    private valueOf(property: DashboardProperty, panel: string | null, ctx: PropertyResolutionContext): PropertyValue {
        const host = NormalizeEventValue(this.hostValues[property.Name]);
        if (hasValue(host)) return host;
        const event = this.eventValues.get(property.Name);
        if (event && event.Panel !== panel && hasValue(event.Value)) return event.Value;
        return resolveDefault(property.Default, ctx);
    }
}

/**
 * Why a mapping doesn't fit, or null when it does: an input the part doesn't declare, an input only
 * the server may set, a property the dashboard doesn't have, or types that don't match.
 */
export function MappingProblem(mapping: DashboardPartInputMapping, inputs: DashboardPartInput[], properties: DashboardProperty[]): string | null {
    const input = inputs.find(i => i.Name === mapping.Input);
    if (!input) return `Input "${mapping.Input}" is not one the part declares.`;
    if (input.ServerSet) return `Input "${mapping.Input}" is set by the server and can't be mapped.`;
    if (mapping.Property) {
        const property = properties.find(p => p.Name === mapping.Property);
        if (!property) return `Input "${mapping.Input}" is mapped from "${mapping.Property}", which the dashboard doesn't have.`;
        if (!IsTypeCompatible(property.Type, input.Type)) {
            return `Input "${mapping.Input}" (${input.Type}) can't take "${mapping.Property}" (${property.Type}).`;
        }
    }
    if (!mapping.Property && !mapping.Default) return `Input "${mapping.Input}" has neither a property nor a default.`;
    return null;
}

/**
 * Works out a part's inputs from its mappings, in the plan's order: the dashboard property's value
 * (host, then event, then the property's default, already in `values`), then the mapping's default,
 * then the input's own default (no key: the part applies it).
 *
 * A required input with none of these is missing. An unmapped input the user fills on the part (a
 * query parameter) is left to the user; one only the server sets is never missing here.
 */
export function ResolvePartInputs(
    inputs: DashboardPartInput[],
    mappings: DashboardPartInputMapping[],
    properties: DashboardProperty[],
    values: DashboardPropertyValues,
    ctx: PropertyResolutionContext,
): PartInputResolution {
    const resolution: PartInputResolution = { Values: {}, Missing: [], Broken: [] };
    for (const mapping of mappings) {
        const problem = MappingProblem(mapping, inputs, properties);
        if (problem) {
            resolution.Broken.push(problem);
            continue;
        }
        const fromProperty = mapping.Property ? values[mapping.Property] : null;
        const value = hasValue(fromProperty) ? fromProperty : resolveDefault(mapping.Default, ctx);
        if (hasValue(value)) resolution.Values[mapping.Input] = value;
    }
    resolution.Missing = inputs
        .filter(input => isMissing(input, mappings.some(m => m.Input === input.Name), resolution.Values))
        .map(input => input.Name);
    return resolution;
}

function isMissing(input: DashboardPartInput, mapped: boolean, values: Record<string, PropertyValue>): boolean {
    if (!input.IsRequired || input.HasOwnDefault || input.ServerSet || hasValue(values[input.Name])) return false;
    return mapped || !input.UserCanFill;
}

/** A stable key for a resolution, so a part reloads only when what it runs with changed. */
export function PartInputResolutionKey(resolution: PartInputResolution | null): string {
    if (!resolution) return '';
    const values = Object.keys(resolution.Values).sort().map(k => [k, resolution.Values[k]]);
    return JSON.stringify({ v: values, m: resolution.Missing, b: resolution.Broken });
}

/** The message a part shows when it stops: its broken mappings, then its missing inputs. */
export function PartInputProblemMessage(resolution: PartInputResolution | null): string | null {
    if (!resolution) return null;
    const lines = [...resolution.Broken];
    if (resolution.Missing.length > 0) {
        lines.push(`Missing a value for ${resolution.Missing.map(n => `"${n}"`).join(', ')}.`);
    }
    return lines.length > 0 ? lines.join(' ') : null;
}

/** True when a value fits a dashboard value type (`any` takes every value; null fits all). */
export function IsValueOfDashboardType(value: PropertyValue, type: DashboardValueType): boolean {
    if (type === 'any') return true;
    if (type === 'unsupported') return value === null;
    return IsPropertyValueOfType(value, type);
}
