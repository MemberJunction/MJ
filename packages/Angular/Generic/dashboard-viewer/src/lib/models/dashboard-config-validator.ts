/**
 * Save-time checks for a dashboard's properties, part input mappings and wires (plan § 4 and § 4.1).
 * Plain TypeScript: the part interfaces are loaded first (see dashboard-part-interfaces.ts) and
 * handed in, so these checks run without Angular or a provider.
 */
import { PROPERTY_VALUE_TYPES, ValidatePropertyDefault } from '@memberjunction/core';
import type { DashboardPanel } from './dashboard-types';
import {
    DashboardPartInputMapping,
    DashboardPartInterface,
    DashboardProperty,
    DashboardWire,
    GetInputMappings,
    IsTypeCompatible,
    MappingProblem,
} from './dashboard-properties';

/**
 * Problems with a dashboard's properties: a blank or repeated name, an unknown type, or a default
 * that doesn't fit the type (a bad token, a bad offset unit, an offset on a user token).
 */
export function ValidateDashboardProperties(properties: DashboardProperty[]): string[] {
    const errors: string[] = [];
    const seen = new Set<string>();
    properties.forEach((property, index) => {
        const name = (property.Name ?? '').trim();
        const label = name ? `Property "${name}"` : `Property ${index + 1}`;
        if (!name) errors.push(`${label}: Name is required.`);
        if (name && seen.has(name.toLowerCase())) errors.push(`${label}: another property has the same name.`);
        seen.add(name.toLowerCase());
        if (!(PROPERTY_VALUE_TYPES as readonly string[]).includes(property.Type)) {
            errors.push(`${label}: Type must be one of ${PROPERTY_VALUE_TYPES.join(', ')}.`);
        } else if (property.Default) {
            errors.push(...ValidatePropertyDefault(property.Default, property.Type).map(e => `${label}: ${e}`));
        }
    });
    return errors;
}

/**
 * Problems with one part's mappings: an input the part doesn't declare or only the server sets, a
 * property the dashboard doesn't have, mismatched types, a default that doesn't fit the input, or
 * two mappings for one input.
 */
export function ValidatePartMappings(
    partTitle: string,
    mappings: DashboardPartInputMapping[],
    partInterface: DashboardPartInterface,
    properties: DashboardProperty[],
): string[] {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const mapping of mappings) {
        if (seen.has(mapping.Input)) errors.push(`Part "${partTitle}": input "${mapping.Input}" is mapped twice.`);
        seen.add(mapping.Input);
        const problem = MappingProblem(mapping, partInterface.Inputs, properties) ?? defaultProblem(mapping, partInterface);
        if (problem) errors.push(`Part "${partTitle}": ${problem}`);
    }
    return errors;
}

/** Why a mapping's own default doesn't fit its input, or null. An input typed `any` takes any default. */
function defaultProblem(mapping: DashboardPartInputMapping, partInterface: DashboardPartInterface): string | null {
    const input = partInterface.Inputs.find(i => i.Name === mapping.Input);
    if (!mapping.Default || !input) return null;
    const type = input.Type === 'any' || input.Type === 'unsupported' ? 'string' : input.Type;
    const errors = ValidatePropertyDefault(mapping.Default, type);
    return errors.length > 0 ? `the default of input "${mapping.Input}" is invalid: ${errors.join(' ')}` : null;
}

/**
 * Problems with the wires: a panel not on the dashboard, an event the part doesn't declare, a value
 * the event doesn't carry, a property the dashboard doesn't have, or a value whose type doesn't fit
 * the property. A part whose interface couldn't load is not checked (it shows its own error).
 */
export function ValidateDashboardWires(
    wires: DashboardWire[],
    panels: DashboardPanel[],
    interfaces: Map<string, DashboardPartInterface | null>,
    properties: DashboardProperty[],
): string[] {
    const errors: string[] = [];
    wires.forEach((wire, index) => {
        const problem = wireProblem(wire, panels, interfaces, properties);
        if (problem) errors.push(`Wire ${index + 1}: ${problem}`);
    });
    return errors;
}

function wireProblem(
    wire: DashboardWire,
    panels: DashboardPanel[],
    interfaces: Map<string, DashboardPartInterface | null>,
    properties: DashboardProperty[],
): string | null {
    const panel = panels.find(p => p.id === wire.Panel);
    if (!panel) return `the part it starts from is not on the dashboard.`;
    const property = properties.find(p => p.Name === wire.Property);
    if (!property) return `it sets "${wire.Property}", which the dashboard doesn't have.`;
    const partInterface = interfaces.get(panel.id);
    if (!partInterface) return null;
    const event = partInterface.Events.find(e => e.Name === wire.Event);
    if (!event) return `part "${panel.title}" doesn't raise "${wire.Event}".`;
    const value = event.Values.find(v => v.Name === wire.Value);
    if (!value) return `"${wire.Event}" of part "${panel.title}" carries no value "${wire.Value}".`;
    if (!IsTypeCompatible(value.Type, property.Type)) {
        return `"${wire.Value}" (${value.Type}) can't set "${wire.Property}" (${property.Type}).`;
    }
    return null;
}

/** What a dashboard's save checks. */
export interface DashboardBindingsToValidate {
    Properties: DashboardProperty[];
    Wires: DashboardWire[];
    Panels: DashboardPanel[];
    /** Each panel's interface, by panel ID; null when it couldn't load. */
    Interfaces: Map<string, DashboardPartInterface | null>;
}

/** Every problem a save refuses: the properties, each part's mappings, and the wires. Empty: save. */
export function ValidateDashboardBindings(bindings: DashboardBindingsToValidate): string[] {
    const errors = ValidateDashboardProperties(bindings.Properties);
    for (const panel of bindings.Panels) {
        const mappings = GetInputMappings(panel.config);
        const partInterface = bindings.Interfaces.get(panel.id);
        if (mappings.length > 0 && partInterface) {
            errors.push(...ValidatePartMappings(panel.title, mappings, partInterface, bindings.Properties));
        }
    }
    errors.push(...ValidateDashboardWires(bindings.Wires, bindings.Panels, bindings.Interfaces, bindings.Properties));
    return errors;
}
