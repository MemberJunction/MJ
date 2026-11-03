/**
 * User View properties at run time: checking a view's declared properties when it is saved,
 * working out each property's value for one run, and the SQL predicate that value drives.
 *
 * A property's value comes from, in order: the run's `ServerProperties` (server code only), the
 * run's `Properties` (refused for a property whose `AllowOverride` is false), then the property's
 * `Default`. A key that is present with `null` means "no value": the default is not used and no
 * predicate is added. Every value is checked against the property's type and written as a typed
 * SQL literal; nothing a caller sends is pasted into SQL as text.
 */

import { EscapeSQLString } from '@memberjunction/global';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import {
    IsPropertyValueOfType,
    PROPERTY_VALUE_TYPES,
    PropertyDefault,
    PropertyResolutionContext,
    PropertyValue,
    PropertyValueType,
    ResolvePropertyDefault,
    UserViewProperty,
    UserViewPropertyOperator,
    ValidatePropertyDefault,
} from '../generic/contextTokens';

/** A run's value for one view property: one value, or a list for the `IN` operator. */
export type ViewPropertyValue = PropertyValue | PropertyValue[];

/** A run's values for a view's properties, keyed by property name. */
export type ViewPropertyValues = Record<string, ViewPropertyValue>;

/** Every operator a view property can use. */
export const USER_VIEW_PROPERTY_OPERATORS: readonly UserViewPropertyOperator[] = ['=', '<>', 'IN', '>', '>=', '<', '<='];

/** The operators each property type allows: ranges and lists only where they mean something. */
export const USER_VIEW_PROPERTY_OPERATORS_BY_TYPE: Record<PropertyValueType, readonly UserViewPropertyOperator[]> = {
    string: USER_VIEW_PROPERTY_OPERATORS,
    number: USER_VIEW_PROPERTY_OPERATORS,
    date: USER_VIEW_PROPERTY_OPERATORS,
    uuid: ['=', '<>', 'IN'],
    boolean: ['=', '<>'],
};

/** `YYYY-MM-DD` with nothing after it: kept as written rather than turned into an instant. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a view's declared properties, as when the view is saved.
 * @param properties the parsed `Properties` JSON; null or undefined means the view has none
 * @param fieldNames the field names of the view's entity
 * @returns the problems found, each naming the property; empty when the properties are valid
 */
export function ValidateUserViewProperties(properties: unknown, fieldNames: readonly string[]): string[] {
    if (properties === null || properties === undefined) {
        return [];
    }
    if (!Array.isArray(properties)) {
        return ['Properties must be a list.'];
    }
    const errors: string[] = [];
    const seen = new Set<string>();
    properties.forEach((property: unknown, index: number) => {
        const name = isPlainObject(property) && typeof property.Name === 'string' ? property.Name.trim() : '';
        const label = name ? `Property "${name}"` : `Property ${index + 1}`;
        for (const problem of propertyErrors(property, fieldNames)) {
            errors.push(`${label}: ${problem}`);
        }
        if (name && seen.has(name.toLowerCase())) {
            errors.push(`${label}: another property has the same name.`);
        }
        seen.add(name.toLowerCase());
    });
    return errors;
}

/**
 * Works out every declared property's value for one run.
 * @param declared the view's properties
 * @param clientValues values a client may set (`RunViewParams.Properties`)
 * @param serverValues values only server code sets (`RunViewParams.ServerProperties`)
 * @param ctx the context user, clock and time zone that token defaults are worked out with
 * @returns each declared property's value, `null` where the run adds no predicate for it
 * @throws naming the property: a name the view does not declare, a client value for a property
 *   that does not allow override, a value of the wrong type, a required property with no value,
 *   or a default that cannot be worked out
 */
export function ResolveViewPropertyValues(
    declared: readonly UserViewProperty[],
    clientValues: ViewPropertyValues | undefined,
    serverValues: ViewPropertyValues | undefined,
    ctx: PropertyResolutionContext,
): ViewPropertyValues {
    const names = new Set(declared.map(p => p.Name));
    assertKnownNames(names, clientValues, 'Properties');
    assertKnownNames(names, serverValues, 'ServerProperties');
    const resolved: ViewPropertyValues = {};
    for (const property of declared) {
        resolved[property.Name] = resolveOne(property, clientValues, serverValues, ctx);
    }
    return resolved;
}

/**
 * The WHERE clause a run's property values add: one predicate per property with a value, ANDed.
 * Values are checked again here, so nothing reaches SQL unchecked whoever produced `values`.
 * @param fieldNames the field names of the view's entity; a target that is not one is refused
 * @param dialect the database platform, for identifier quoting and literals
 * @returns '' when no property has a value
 */
export function BuildViewPropertyFilter(
    declared: readonly UserViewProperty[],
    values: ViewPropertyValues,
    fieldNames: readonly string[],
    dialect: SQLDialect,
): string {
    const predicates: string[] = [];
    for (const property of declared) {
        const value = values[property.Name];
        if (value !== null && value !== undefined) {
            predicates.push(buildPredicate(property, value, fieldNames, dialect));
        }
    }
    return predicates.join(' AND ');
}

/**
 * A stable text key for a run's property values (names sorted), for result-cache fingerprints and
 * params comparison. Empty when neither map holds a value, so a run without properties keys as before.
 */
export function ViewPropertyValuesKey(clientValues?: ViewPropertyValues, serverValues?: ViewPropertyValues): string {
    const client = sortedEntries(clientValues);
    const server = sortedEntries(serverValues);
    return client.length === 0 && server.length === 0 ? '' : JSON.stringify({ p: client, s: server });
}

/** True when a property-values map holds at least one key with a defined value. */
export function HasViewPropertyValues(values: ViewPropertyValues | undefined | null): boolean {
    return sortedEntries(values ?? undefined).length > 0;
}

function sortedEntries(values: ViewPropertyValues | undefined): [string, ViewPropertyValue][] {
    if (!values || typeof values !== 'object') {
        return [];
    }
    return Object.keys(values)
        .filter(key => values[key] !== undefined)
        .sort()
        .map(key => [key, values[key]]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(values: ViewPropertyValues | undefined, name: string): values is ViewPropertyValues {
    return !!values && Object.prototype.hasOwnProperty.call(values, name) && values[name] !== undefined;
}

/** Problems with one declared property, without its label. */
function propertyErrors(property: unknown, fieldNames: readonly string[]): string[] {
    if (!isPlainObject(property)) {
        return ['must be an object.'];
    }
    const errors: string[] = [];
    if (typeof property.Name !== 'string' || property.Name.trim().length === 0) {
        errors.push('Name is required.');
    }
    const type = property.Type as PropertyValueType;
    if (!(PROPERTY_VALUE_TYPES as readonly string[]).includes(type)) {
        errors.push(`Type must be one of ${PROPERTY_VALUE_TYPES.join(', ')}.`);
        return errors;
    }
    errors.push(...targetErrors(property.Target, type, fieldNames));
    if (property.Default !== undefined) {
        errors.push(...ValidatePropertyDefault(property.Default as PropertyDefault, type));
    }
    for (const flag of ['IsRequired', 'AllowOverride'] as const) {
        if (property[flag] !== undefined && typeof property[flag] !== 'boolean') {
            errors.push(`${flag} must be true or false.`);
        }
    }
    if (property.Description !== undefined && typeof property.Description !== 'string') {
        errors.push('Description must be text.');
    }
    return errors;
}

function targetErrors(target: unknown, type: PropertyValueType, fieldNames: readonly string[]): string[] {
    if (!isPlainObject(target)) {
        return ['Target is required, with a Field and an Operator.'];
    }
    const errors: string[] = [];
    if (typeof target.Field !== 'string' || !findField(fieldNames, target.Field)) {
        errors.push(`Target.Field "${String(target.Field)}" is not a field of the view's entity.`);
    }
    const operator = target.Operator as UserViewPropertyOperator;
    if (!USER_VIEW_PROPERTY_OPERATORS.includes(operator)) {
        errors.push(`Target.Operator must be one of ${USER_VIEW_PROPERTY_OPERATORS.join(', ')}.`);
    } else if (!USER_VIEW_PROPERTY_OPERATORS_BY_TYPE[type].includes(operator)) {
        errors.push(`Target.Operator ${operator} does not apply to a ${type} property. Allowed: ${USER_VIEW_PROPERTY_OPERATORS_BY_TYPE[type].join(', ')}.`);
    }
    return errors;
}

function findField(fieldNames: readonly string[], name: string): string | undefined {
    const wanted = name.trim().toLowerCase();
    return fieldNames.find(f => f.toLowerCase() === wanted);
}

function assertKnownNames(names: Set<string>, values: ViewPropertyValues | undefined, source: string): void {
    if (values === undefined || values === null) {
        return;
    }
    if (!isPlainObject(values)) {
        throw new Error(`${source} must be an object of property values keyed by name.`);
    }
    for (const name of Object.keys(values)) {
        if (!names.has(name)) {
            const declared = names.size > 0 ? `The view declares: ${[...names].join(', ')}.` : 'The view declares no properties.';
            throw new Error(`Unknown view property "${name}" in ${source}. ${declared}`);
        }
    }
}

function resolveOne(
    property: UserViewProperty,
    clientValues: ViewPropertyValues | undefined,
    serverValues: ViewPropertyValues | undefined,
    ctx: PropertyResolutionContext,
): ViewPropertyValue {
    if (hasValue(clientValues, property.Name) && property.AllowOverride === false) {
        throw new Error(`View property "${property.Name}" is set by the server; a client value for it is refused.`);
    }
    const value: unknown = hasValue(serverValues, property.Name) ? serverValues[property.Name]
        : hasValue(clientValues, property.Name) ? clientValues[property.Name]
        : defaultValue(property, ctx);
    const checked = checkValue(property, value);
    if (checked === null && property.IsRequired) {
        throw new Error(`View property "${property.Name}" is required and has no value.`);
    }
    return checked;
}

function defaultValue(property: UserViewProperty, ctx: PropertyResolutionContext): PropertyValue {
    if (!property.Default) {
        return null;
    }
    try {
        return ResolvePropertyDefault(property.Default, ctx);
    } catch (e) {
        throw new Error(`View property "${property.Name}": its default cannot be worked out. ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** A value checked against the property: null, one value of its type, or (for `IN`) a list of them. */
function checkValue(property: UserViewProperty, value: unknown): ViewPropertyValue {
    if (value === null || value === undefined) {
        return null;
    }
    if (!Array.isArray(value)) {
        return checkScalar(property, value);
    }
    if (property.Target?.Operator !== 'IN') {
        throw new Error(`View property "${property.Name}" takes one value, not a list; only the IN operator takes a list.`);
    }
    return value.map(item => checkScalar(property, item));
}

function checkScalar(property: UserViewProperty, value: unknown): PropertyValue {
    const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    if (!scalar || !IsPropertyValueOfType(value, property.Type)) {
        throw new Error(`View property "${property.Name}" needs a ${property.Type} value; ${JSON.stringify(value)} is not one.`);
    }
    if (property.Type === 'date' && !DATE_ONLY.test(value as string)) {
        return new Date(value as string).toISOString(); // one spelling per instant, in UTC
    }
    return value;
}

function buildPredicate(property: UserViewProperty, value: ViewPropertyValue, fieldNames: readonly string[], dialect: SQLDialect): string {
    const target = property.Target;
    const field = typeof target?.Field === 'string' ? findField(fieldNames, target.Field) : undefined;
    if (!field) {
        throw new Error(`View property "${property.Name}" targets "${String(target?.Field)}", which is not a field of the view's entity.`);
    }
    if (!USER_VIEW_PROPERTY_OPERATORS_BY_TYPE[property.Type]?.includes(target.Operator)) {
        throw new Error(`View property "${property.Name}": operator ${String(target.Operator)} does not apply to a ${property.Type} property.`);
    }
    const column = dialect.QuoteIdentifier(field);
    const checked = checkValue(property, value);
    if (target.Operator !== 'IN') {
        return `${column} ${target.Operator} ${sqlLiteral(property.Type, checked as PropertyValue, dialect)}`;
    }
    const list = Array.isArray(checked) ? checked : [checked];
    // An empty list matches nothing, as IN over an empty set does; SQL has no empty IN ().
    return list.length === 0 ? '1 = 0' : `${column} IN (${list.map(v => sqlLiteral(property.Type, v, dialect)).join(', ')})`;
}

/** A checked, non-null value as a typed SQL literal. */
function sqlLiteral(type: PropertyValueType, value: PropertyValue, dialect: SQLDialect): string {
    if (type === 'number') {
        return String(value);
    }
    if (type === 'boolean') {
        return dialect.BooleanLiteral(value as boolean);
    }
    const text = String(value);
    return `${dialect.StringLiteralPrefix(text)}'${EscapeSQLString(text)}'`;
}
