/**
 * @fileoverview Derives what an agent can do with a component from the component's own specification.
 *
 * A component artifact already says what it accepts and emits: its `properties` (inputs), its `events`, and its
 * `methods` (standard methods it supports plus custom ones with typed parameters). This module turns that into the
 * channel contract's vocabulary, so an agent can operate a component nobody wrote channel code for:
 *
 * | spec | contract |
 * |---|---|
 * | `methods.customMethods[]` | a verb per method, parameters schema from the declared parameter types |
 * | `methods.standardMethodsSupported` | `refresh`, `print`, `validate`, `is_dirty`, `reset`, `scroll_to`, `focus`, and `get_data_state` |
 * | `methods.standardMethodsSupported.getCurrentDataState` | the instance's `data` in the channel's state (the noun) |
 * | `events[]` | channel events, payload schema from the event parameters |
 * | `properties[]` | the schema of the `inputs` accepted when opening it |
 *
 * A verb whose result carries what the component holds (`get_data_state`, `validate`, `is_dirty`, and any custom method that
 * returns something) is marked `ReturnsChannelData: 'state'`, so the agent is refused it when it may not perceive the
 * component's state (see `RealtimeChannelVerb.ReturnsChannelData`).
 *
 * Pure functions over plain data: no component is rendered and nothing is invoked here.
 *
 * @module @memberjunction/ng-conversations
 */

import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeChannelEventSpec, RealtimeChannelSchema, RealtimeChannelVerb } from '@memberjunction/ai-core-plus';
import type { ComponentSpec, CustomComponentMethod } from '@memberjunction/interactive-component-types';
import { STANDARD_VERBS, BUILTIN_VERBS } from './interactive-component-types';

/** How a verb reaches the component. */
export type VerbBinding =
    | { Kind: 'standard'; Standard: keyof typeof STANDARD_VERBS }
    | { Kind: 'custom'; Method: string; ParameterNames: string[] };

/** One verb derived from a spec, with how to run it. */
export interface DerivedVerb {
    /** The verb as the agent sees it. */
    Verb: RealtimeChannelVerb;
    /** How the channel runs it. */
    Binding: VerbBinding;
}

/** A method the contract could not expose, and why (kept so a spec problem is visible rather than silently dropped). */
export interface SkippedMethod {
    /** The method's name. */
    Name: string;
    /** Why it was not exposed. */
    Reason: string;
}

/** Everything an agent can do with one component, derived from its spec. */
export interface ComponentContract {
    /** The verbs, standard and custom. */
    Verbs: DerivedVerb[];
    /** The events the component can emit. */
    Events: RealtimeChannelEventSpec[];
    /** The schema of the `inputs` accepted when opening it (from the spec's `properties`). */
    InputsSchema: RealtimeChannelSchema;
    /** Whether the component reports a data state (`getCurrentDataState` is supported), i.e. whether the instance has `data` to describe. */
    SupportsDataState: boolean;
    /** Methods that could not be exposed. */
    Skipped: SkippedMethod[];
}

/** Verb names that belong to the channel, which a custom method may not take. */
const RESERVED_VERB_NAMES: ReadonlySet<string> = new Set([
    ...Object.values(BUILTIN_VERBS),
    ...Object.values(STANDARD_VERBS),
    'open',
]);

/** The JSON-schema for a type name as a spec author writes it, or `null` when it cannot be expressed. */
function schemaForTypeName(typeName: string): JSONObject | null {
    const type = typeName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (type === 'string') {
        return { type: 'string' };
    }
    if (type === 'number' || type === 'float' || type === 'double') {
        return { type: 'number' };
    }
    if (type === 'integer' || type === 'int') {
        return { type: 'integer' };
    }
    if (type === 'boolean' || type === 'bool') {
        return { type: 'boolean' };
    }
    if (type === 'date' || type === 'datetime') {
        return { type: 'string', format: 'date-time' };
    }
    if (type === 'array' || type.startsWith('array<') || type.endsWith('[]')) {
        return { type: 'array' };
    }
    if (type === 'object' || type.startsWith('record<') || type.startsWith('{')) {
        return { type: 'object' };
    }
    return type === 'function' ? null : {};
}

/** Whether a method parameter is optional, judged from its name, type and description. */
function isOptionalParameter(parameter: { name: string; type: string; description?: string }): boolean {
    return (
        parameter.name.trim().endsWith('?') ||
        /\bundefined\b/i.test(parameter.type) ||
        /^\s*optional\b/i.test(parameter.description ?? '')
    );
}

/** The bare parameter name (a trailing `?` marks it optional and is not part of the name). */
function parameterName(parameter: { name: string }): string {
    return parameter.name.trim().replace(/\?$/, '');
}

/** Builds the parameters schema of a custom method; `null` when a required parameter cannot be passed by a model (a function). */
function buildParametersSchema(method: CustomComponentMethod): { Schema: RealtimeChannelSchema; Names: string[] } | { Problem: string } {
    const properties: JSONObject = {};
    const required: string[] = [];
    const names: string[] = [];
    for (const parameter of method.parameters ?? []) {
        const name = parameterName(parameter);
        const schema = schemaForTypeName(parameter.type ?? '');
        const optional = isOptionalParameter(parameter);
        if (schema === null) {
            if (!optional) {
                return { Problem: `parameter "${name}" is a function, which an agent cannot pass` };
            }
            continue;
        }
        const described: JSONObject = { ...schema, description: parameter.description ?? `${name} (${parameter.type})` };
        if (Object.keys(schema).length === 0) {
            described['description'] = `${parameter.description ?? name} (declared type: ${parameter.type})`;
        }
        properties[name] = described;
        names.push(name);
        if (!optional) {
            required.push(name);
        }
    }
    const schema: RealtimeChannelSchema = { type: 'object', properties, additionalProperties: false };
    if (required.length > 0) {
        schema['required'] = required;
    }
    return { Schema: schema, Names: names };
}

/** The verb name for a custom method: its own name, unless that is taken by the channel. */
function customVerbName(method: string, taken: Set<string>): string {
    let name = method;
    if (RESERVED_VERB_NAMES.has(name.toLowerCase()) || taken.has(name.toLowerCase())) {
        name = `custom_${method}`;
    }
    taken.add(name.toLowerCase());
    return name;
}

/** Derives the verb for each custom method. */
function deriveCustomVerbs(spec: ComponentSpec, taken: Set<string>, skipped: SkippedMethod[]): DerivedVerb[] {
    const verbs: DerivedVerb[] = [];
    for (const method of spec.methods?.customMethods ?? []) {
        if (typeof method?.name !== 'string' || method.name.trim().length === 0) {
            skipped.push({ Name: '(unnamed)', Reason: 'a custom method has no name' });
            continue;
        }
        const built = buildParametersSchema(method);
        if ('Problem' in built) {
            skipped.push({ Name: method.name, Reason: built.Problem });
            continue;
        }
        const returns = method.returnType && method.returnType !== 'void' ? ` Returns ${method.returnType}.` : '';
        verbs.push({
            Verb: {
                Name: customVerbName(method.name, taken),
                Description: `${method.description || `Calls the component's ${method.name} method.`}${returns}`,
                ParametersSchema: built.Schema,
                InvokableBy: 'both',
                // Unsure what a method hands back, so a method that returns anything is treated as returning the component's data.
                ...(returnsData(method) ? { ReturnsChannelData: 'state' as const } : {}),
            },
            Binding: { Kind: 'custom', Method: method.name, ParameterNames: built.Names },
        });
    }
    return verbs;
}

/** Return types that carry nothing back. Anything else is treated as a result that carries the component's data. */
const VOID_RETURN_TYPES: ReadonlySet<string> = new Set(['', 'void', 'undefined', 'null', 'never', 'promise<void>', 'promise<undefined>']);

/** Whether a custom method returns something (and so needs `state` exposure to be given to the agent). */
function returnsData(method: CustomComponentMethod): boolean {
    return !VOID_RETURN_TYPES.has((method.returnType ?? '').trim().toLowerCase());
}

/** A verb with no parameters. */
function noParameters(): RealtimeChannelSchema {
    return { type: 'object', properties: {}, additionalProperties: false };
}

/** The standard verbs, in the order they are described. Each is present only when the spec says the component supports it. */
function deriveStandardVerbs(spec: ComponentSpec): DerivedVerb[] {
    const supported = spec.methods?.standardMethodsSupported ?? {};
    const standard = (
        key: keyof typeof STANDARD_VERBS,
        description: string,
        schema: RealtimeChannelSchema = noParameters(),
        returnsChannelData?: 'state'
    ): DerivedVerb => ({
        Verb: { Name: STANDARD_VERBS[key], Description: description, ParametersSchema: schema, InvokableBy: 'both', ...(returnsChannelData ? { ReturnsChannelData: returnsChannelData } : {}) },
        Binding: { Kind: 'standard', Standard: key },
    });
    const verbs: DerivedVerb[] = [];
    if (supported.refresh) {
        verbs.push(standard('Refresh', 'Reloads the component\'s data.'));
    }
    if (supported.getCurrentDataState) {
        verbs.push(standard('GetDataState', 'Reads what the component is showing right now (its data state: tables, rows, filters). Use it when you need detail the state notes do not carry.', noParameters(), 'state'));
    }
    if (supported.validate) {
        verbs.push(standard('Validate', 'Checks whether what the user entered is valid; reports the problems.', noParameters(), 'state'));
    }
    if (supported.isDirty) {
        verbs.push(standard('IsDirty', 'Reports whether the user has unsaved changes in the component.', noParameters(), 'state'));
    }
    if (supported.reset) {
        verbs.push(standard('Reset', 'Discards the user\'s changes and returns the component to its initial state.'));
    }
    if (supported.print) {
        verbs.push(standard('Print', 'Opens the browser\'s print dialog for the component.'));
    }
    if (supported.scrollTo) {
        verbs.push(
            standard('ScrollTo', 'Scrolls the component to an element (a CSS selector) or position.', {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'A CSS selector of the element to scroll to.' },
                    top: { type: 'number', description: 'Vertical scroll offset in pixels (instead of a target).' },
                    left: { type: 'number', description: 'Horizontal scroll offset in pixels (instead of a target).' },
                },
                additionalProperties: false,
            })
        );
    }
    if (supported.focus) {
        verbs.push(
            standard('Focus', 'Moves keyboard focus to an element inside the component.', {
                type: 'object',
                properties: { target: { type: 'string', description: 'A CSS selector of the element to focus (default: the component\'s first focusable element).' } },
                additionalProperties: false,
            })
        );
    }
    return verbs;
}

/** The event specs from the component's declared events. */
function deriveEvents(spec: ComponentSpec): RealtimeChannelEventSpec[] {
    const events: RealtimeChannelEventSpec[] = [];
    for (const event of spec.events ?? []) {
        if (typeof event?.name !== 'string' || event.name.length === 0) {
            continue;
        }
        const properties: JSONObject = {};
        for (const parameter of event.parameters ?? []) {
            const schema = schemaForTypeName(parameter.type ?? 'any') ?? {};
            properties[parameter.name] = { ...schema, description: parameter.description };
        }
        events.push({
            Name: event.name,
            Description: event.description,
            PayloadSchema: { type: 'object', properties },
        });
    }
    return events;
}

/** The schema of the opening `inputs`, from the spec's `properties`. Function-typed properties (callbacks) cannot be supplied by a model and are left out. */
function deriveInputsSchema(spec: ComponentSpec): RealtimeChannelSchema {
    const properties: JSONObject = {};
    const required: string[] = [];
    for (const property of spec.properties ?? []) {
        const schema = schemaForTypeName(property.type ?? 'any');
        if (schema === null || typeof property.name !== 'string' || property.name.length === 0) {
            continue;
        }
        const described: JSONObject = { ...schema, description: property.description };
        if (Array.isArray(property.possibleValues) && property.possibleValues.length > 0 && schema['type'] === 'string') {
            described['enum'] = property.possibleValues;
        }
        properties[property.name] = described;
        if (property.required) {
            required.push(property.name);
        }
    }
    const schema: RealtimeChannelSchema = { type: 'object', properties };
    if (required.length > 0) {
        schema['required'] = required;
    }
    return schema;
}

/**
 * Derives the full contract of one component from its spec.
 *
 * @param spec The component's specification.
 */
export function DeriveComponentContract(spec: ComponentSpec): ComponentContract {
    const skipped: SkippedMethod[] = [];
    const standardVerbs = deriveStandardVerbs(spec);
    const taken = new Set(standardVerbs.map((v) => v.Verb.Name.toLowerCase()));
    return {
        Verbs: [...standardVerbs, ...deriveCustomVerbs(spec, taken, skipped)],
        Events: deriveEvents(spec),
        InputsSchema: deriveInputsSchema(spec),
        SupportsDataState: spec.methods?.standardMethodsSupported?.getCurrentDataState === true,
        Skipped: skipped,
    };
}

/** Whether a verb schema is the permissive one a merge produces. */
function schemaProperties(verb: RealtimeChannelVerb): JSONObject {
    const properties = verb.ParametersSchema['properties'];
    return properties !== null && typeof properties === 'object' && !Array.isArray(properties) ? (properties as JSONObject) : {};
}

/**
 * Merges the same verb offered by several open components into the single verb the channel declares.
 *
 * Verbs from different components can share a name with different parameters (two components that both have
 * `setFilter`). The channel declares one verb per name; its schema is the UNION of the parameters with nothing
 * required, so a call that suits any of them passes the dispatcher, and the exact per-component check
 * (against that component's own schema) happens when the verb runs. The description lists each component's signature.
 *
 * @param offers Each component's verb of this name, with the component's display name.
 */
export function MergeVerbOffers(offers: ReadonlyArray<{ Component: string; Verb: RealtimeChannelVerb }>): RealtimeChannelVerb {
    if (offers.length === 1) {
        return { ...offers[0].Verb };
    }
    const properties: JSONObject = {};
    for (const offer of offers) {
        for (const [name, schema] of Object.entries(schemaProperties(offer.Verb))) {
            if (!(name in properties)) {
                properties[name] = schema;
            }
        }
    }
    // The dispatcher checks the merged verb, so it may refuse only what EVERY component would refuse; the exact check against
    // the addressed component happens when the verb runs.
    const levels = offers.map((offer) => offer.Verb.ReturnsChannelData);
    const returnsChannelData = levels.every((level) => level !== undefined) ? (levels.includes('state') ? 'state' : 'pixels') : undefined;
    const signatures = offers.map((offer) => `${offer.Component}: ${Object.keys(schemaProperties(offer.Verb)).join(', ') || '(no parameters)'}`);
    return {
        Name: offers[0].Verb.Name,
        Description: `${offers[0].Verb.Description} Several open components have this action; pass the instance you mean. Parameters per component — ${signatures.join('; ')}.`,
        ParametersSchema: { type: 'object', properties, additionalProperties: false },
        InvokableBy: 'both',
        ...(returnsChannelData ? { ReturnsChannelData: returnsChannelData } : {}),
    };
}
