/**
 * Host contract for components declaring `componentRole: 'widget'` (Wave S0, P8).
 *
 * Defines the surface-agnostic props, upward intent callbacks/events, and
 * JSON Schema settings descriptor shared across Home, Dashboard, Tray,
 * Desktop Widget, and Companion hosts without binding to any UI framework.
 */

import type { BaseEventArgs, CancelableEventArgs } from './component-events';
import type { ComponentSpec } from './component-spec';
import {
    IsJsonObject,
    IsJsonPrimitive,
    IsJsonValue,
    IsNonEmptyString,
    IsPlainObject,
    JsonObject,
    JsonPrimitive,
    JsonValue,
} from './json-types';

/**
 * Supported host surfaces where a widget-role component can be mounted.
 */
export const WIDGET_SURFACES = [
    'home',
    'dashboard',
    'tray',
    'desktop-widget',
    'companion',
] as const;

/**
 * Host surface identifier for {@link WidgetHostProps.surface}.
 */
export type WidgetSurface = (typeof WIDGET_SURFACES)[number];

/**
 * Standard named widget size classes recognized by MJ layouts.
 */
export const WIDGET_STANDARD_SIZE_CLASSES = [
    'sm',
    'md',
    'lg',
    'wide',
    'tall',
] as const;

/**
 * Canonical size class literal union.
 */
export type WidgetStandardSizeClass = (typeof WIDGET_STANDARD_SIZE_CLASSES)[number];

/**
 * Open-extensible widget size class allowing standard tokens plus host-specific tokens.
 */
export type WidgetSizeClass = WidgetStandardSizeClass | (string & {});

/**
 * Active visual theme mode communicated by the host shell.
 */
export type WidgetThemeMode = 'light' | 'dark' | 'system';

/**
 * Recommended host-side debounce interval (ms) for coalescing frequent `onSaveUserSettings`
 * calls before persisting to `UserInfoEngine`.
 */
export const DEFAULT_WIDGET_SETTINGS_SAVE_DEBOUNCE_MS = 300; // 300ms debounce to coalesce interactive widget control changes before UserInfoEngine save

/**
 * Recommended host-side maximum serialized payload size (bytes) for per-placement widget
 * settings stored via `UserInfoEngine`.
 */
export const MAX_WIDGET_SETTINGS_PAYLOAD_BYTES = 65_536; // 64 KiB per-placement cap to prevent oversized User Settings JSON rows

/**
 * Strongly typed host environment context supplied to a mounted widget.
 */
export interface WidgetHostContext {
    /** Optional host application identifier. */
    applicationId?: string;
    /** Optional host application display name (e.g., `'MJExplorer'`, `'CompanionDesktop'`). */
    applicationName?: string;
    /** Optional dashboard or workspace identifier when mounted on a dashboard surface. */
    dashboardId?: string;
    /** Optional active organization/tenant identifier. */
    organizationId?: string;
    /** Optional active user identifier for display/scoping context (never an auth check). */
    userId?: string;
    /** Active theme mode resolved by the host shell. */
    themeMode?: WidgetThemeMode;
    /** Optional BCP-47 locale tag (e.g., `'en-US'`). */
    locale?: string;
    /** Optional IANA timezone identifier (e.g., `'America/Chicago'`). */
    timezone?: string;
    /** Whether the host shell has placed the widget in read-only or preview mode. */
    isReadOnly?: boolean;
    /** Whether the host container uses compact chrome (e.g., tray or companion rail). */
    isCompact?: boolean;
    /** Additional immutable JSON metadata supplied by the host shell. */
    metadata?: Readonly<Record<string, JsonValue>>;
}

/**
 * Notification severity levels supported by {@link WidgetHostProps.onNotify}.
 */
export type WidgetNotificationSeverity = 'none' | 'success' | 'error' | 'warning' | 'info';

/**
 * Payload passed to {@link WidgetHostProps.onNotify}.
 */
export interface WidgetNotifyRequest {
    message: string;
    severity?: WidgetNotificationSeverity;
    /** Optional auto-hide duration in milliseconds. */
    hideAfterMs?: number;
}

/**
 * Single primary-key field/value pair for portable record-open requests.
 */
export interface WidgetRecordKeyField {
    fieldName: string;
    value: string | number;
}

/**
 * Host disposition hint when opening a record from a widget.
 */
export type WidgetOpenRecordDisposition = 'default' | 'tab' | 'drawer' | 'modal';

/**
 * Upward intent payload for opening an entity record in the host shell.
 */
export interface WidgetOpenRecordRequest {
    /** Canonical MJ entity name (e.g., `'MJ: Tasks'`, `'Accounts'`). */
    entityName: string;
    /** Primary-key values identifying the target record. */
    primaryKey: readonly WidgetRecordKeyField[] | Readonly<Record<string, string | number>>;
    /** Optional host navigation disposition hint. */
    openMode?: WidgetOpenRecordDisposition;
}

/**
 * Upward intent payload for requesting execution of an MJ Action by the host shell.
 */
export interface WidgetInvokeActionRequest {
    /** Canonical MJ Action name to invoke. */
    actionName: string;
    /** Optional explicit Action ID when known. */
    actionId?: string;
    /** Typed JSON parameters forwarded to the Action by the host. */
    params?: JsonObject;
}

/**
 * Outcome returned by {@link WidgetHostProps.onInvokeAction}.
 */
export interface WidgetInvokeActionResult {
    success: boolean;
    resultCode?: string;
    message?: string;
    output?: JsonObject;
}

/**
 * JSON Schema property value types supported by {@link WidgetSettingsSchema}.
 */
export type WidgetSettingsSchemaPropertyType =
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'array'
    | 'object';

/**
 * Single property schema inside {@link WidgetSettingsSchema}.
 */
export interface WidgetSettingsSchemaProperty {
    type: WidgetSettingsSchemaPropertyType;
    title?: string;
    description?: string;
    default?: JsonValue;
    enum?: readonly JsonPrimitive[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    items?: WidgetSettingsSchemaProperty;
    properties?: Readonly<Record<string, WidgetSettingsSchemaProperty>>;
    required?: readonly string[];
    additionalProperties?: boolean | WidgetSettingsSchemaProperty;
}

/**
 * Typed JSON Schema descriptor defining configurable per-placement settings
 * for a widget-role component.
 */
export interface WidgetSettingsSchema {
    $schema?: string;
    type: 'object';
    title?: string;
    description?: string;
    properties: Readonly<Record<string, WidgetSettingsSchemaProperty>>;
    required?: readonly string[];
    additionalProperties?: boolean;
}

/**
 * Host props contract passed to components declaring `componentRole: 'widget'` (P8).
 *
 * Persistence guidance:
 * - `userSettings` is hydrated by the host from `UserInfoEngine` (`MJ: User Settings`),
 *   keyed by `placementId`. Widgets must never read/write `localStorage` directly.
 * - Host implementations of `onSaveUserSettings` should apply debounce coalescing
 *   (recommended >= {@link DEFAULT_WIDGET_SETTINGS_SAVE_DEBOUNCE_MS}ms) and enforce a
 *   serialized payload ceiling (recommended <= {@link MAX_WIDGET_SETTINGS_PAYLOAD_BYTES} bytes)
 *   before writing to `UserInfoEngine`.
 */
export interface WidgetHostProps<TSettings extends JsonObject = JsonObject> {
    /** Fixed role discriminator identifying the widget host contract. */
    componentRole: 'widget';
    /** Surface mounting this widget instance. */
    surface: WidgetSurface;
    /** Stable host-assigned placement identifier for settings/state scoping. */
    placementId: string;
    /** Active layout size class assigned to this placement. */
    sizeClass: WidgetSizeClass;
    /** Strongly typed host environment context. */
    hostContext: WidgetHostContext;
    /** Current settings hydrated from `UserInfoEngine` for this placement. */
    userSettings: Readonly<TSettings>;
    /** Optional JSON Schema descriptor describing `userSettings`. */
    settingsSchema?: WidgetSettingsSchema;
    /** Upward intent callback requesting the host shell to open an entity record. */
    onOpenRecord: (request: WidgetOpenRecordRequest) => void | Promise<void>;
    /** Upward intent callback requesting the host shell to execute an MJ Action. */
    onInvokeAction: (request: WidgetInvokeActionRequest) => Promise<WidgetInvokeActionResult>;
    /** Upward intent callback requesting a non-blocking user notification. */
    onNotify: (request: WidgetNotifyRequest) => void;
    /**
     * Upward intent callback persisting updated settings via `UserInfoEngine`.
     * Hosts should debounce rapid invocations and enforce payload size bounds.
     */
    onSaveUserSettings: (settings: TSettings) => Promise<void> | void;
}

/**
 * Standard upward intent event names emitted via `ComponentCallbacks.NotifyEvent`
 * by widget-role components when communicating over event-based bridges.
 */
export const WidgetEventNames = {
    /** Cancelable. Widget requests the host shell to open an entity record. */
    RecordOpenRequested: 'RecordOpenRequested',
    /** Cancelable. Widget requests the host shell to invoke an MJ Action. */
    ActionRequested: 'ActionRequested',
    /** Widget emits a non-blocking notification intent to the host shell. */
    NotificationRequested: 'NotificationRequested',
    /** Cancelable. Widget requests persisting updated settings via `UserInfoEngine`. */
    UserSettingsSaveRequested: 'UserSettingsSaveRequested',
} as const;

/**
 * Union of standard widget event names.
 */
export type WidgetEventName = (typeof WidgetEventNames)[keyof typeof WidgetEventNames];

/**
 * Event payload for {@link WidgetEventNames.RecordOpenRequested}.
 */
export interface WidgetRecordOpenRequestedArgs extends CancelableEventArgs {
    request: WidgetOpenRecordRequest;
}

/**
 * Event payload for {@link WidgetEventNames.ActionRequested}.
 */
export interface WidgetActionRequestedArgs extends CancelableEventArgs {
    request: WidgetInvokeActionRequest;
    result?: WidgetInvokeActionResult;
}

/**
 * Event payload for {@link WidgetEventNames.NotificationRequested}.
 */
export interface WidgetNotificationRequestedArgs extends BaseEventArgs {
    request: WidgetNotifyRequest;
}

/**
 * Event payload for {@link WidgetEventNames.UserSettingsSaveRequested}.
 */
export interface WidgetUserSettingsSaveRequestedArgs<TSettings extends JsonObject = JsonObject>
    extends CancelableEventArgs {
    settings: TSettings;
    placementId: string;
}

/**
 * Returns true iff the spec declares `componentRole: 'widget'`.
 */
export function IsWidgetRole(spec: Pick<ComponentSpec, 'componentRole'> | null | undefined): boolean {
    return spec?.componentRole === 'widget';
}

/**
 * Runtime type guard for {@link WidgetSurface}.
 */
export function IsWidgetSurface(value: unknown): value is WidgetSurface {
    return typeof value === 'string' && (WIDGET_SURFACES as readonly string[]).includes(value);
}

/**
 * Runtime type guard for {@link WidgetSizeClass}.
 * Accepts any non-empty trimmed string (including all {@link WIDGET_STANDARD_SIZE_CLASSES}).
 */
export function IsWidgetSizeClass(value: unknown): value is WidgetSizeClass {
    return IsNonEmptyString(value);
}

const VALID_THEME_MODES: readonly string[] = ['light', 'dark', 'system'];
const VALID_SCHEMA_PROPERTY_TYPES: readonly string[] = [
    'string',
    'number',
    'integer',
    'boolean',
    'array',
    'object',
];

function checkOptionalStringField(obj: object, field: string): boolean {
    if (!(field in obj)) {
        return true;
    }
    const val = Reflect.get(obj, field);
    return val === undefined || typeof val === 'string';
}

function checkOptionalBooleanField(obj: object, field: string): boolean {
    if (!(field in obj)) {
        return true;
    }
    const val = Reflect.get(obj, field);
    return val === undefined || typeof val === 'boolean';
}

/**
 * Runtime type guard for {@link WidgetHostContext}.
 */
export function IsWidgetHostContext(value: unknown): value is WidgetHostContext {
    if (!IsPlainObject(value)) {
        return false;
    }
    const stringFields = ['applicationId', 'applicationName', 'dashboardId', 'organizationId', 'userId', 'locale', 'timezone'];
    for (const field of stringFields) {
        if (!checkOptionalStringField(value, field)) {
            return false;
        }
    }
    if (!checkOptionalBooleanField(value, 'isReadOnly') || !checkOptionalBooleanField(value, 'isCompact')) {
        return false;
    }
    if ('themeMode' in value && value.themeMode !== undefined) {
        if (typeof value.themeMode !== 'string' || !VALID_THEME_MODES.includes(value.themeMode)) {
            return false;
        }
    }
    if ('metadata' in value && value.metadata !== undefined && !IsJsonObject(value.metadata)) {
        return false;
    }
    return true;
}

function isStringArrayOrUndefined(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isWidgetSettingsSchemaProperty(
    value: unknown,
    seen: WeakSet<object> = new WeakSet<object>()
): value is WidgetSettingsSchemaProperty {
    if (!IsPlainObject(value) || seen.has(value)) {
        return false;
    }
    seen.add(value);
    const propType = Reflect.get(value, 'type');
    if (typeof propType !== 'string' || !VALID_SCHEMA_PROPERTY_TYPES.includes(propType)) {
        return false;
    }
    if (!checkSchemaPropertyScalars(value)) {
        return false;
    }
    if (!checkSchemaPropertyNested(value, seen)) {
        return false;
    }
    seen.delete(value);
    return true;
}

function checkSchemaPropertyScalars(value: object): boolean {
    if (!checkOptionalStringField(value, 'title') || !checkOptionalStringField(value, 'description')) {
        return false;
    }
    if (!checkOptionalStringField(value, 'pattern') || !checkOptionalStringField(value, 'format')) {
        return false;
    }
    if ('default' in value && value.default !== undefined && !IsJsonValue(value.default)) {
        return false;
    }
    if ('enum' in value && value.enum !== undefined) {
        if (!Array.isArray(value.enum) || !value.enum.every((entry) => IsJsonPrimitive(entry))) {
            return false;
        }
    }
    const numFields = ['minimum', 'maximum', 'minLength', 'maxLength'];
    for (const field of numFields) {
        if (field in value) {
            const val = Reflect.get(value, field);
            if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val))) {
                return false;
            }
        }
    }
    return isStringArrayOrUndefined(Reflect.get(value, 'required'));
}

function checkSchemaPropertyNested(value: object, seen: WeakSet<object>): boolean {
    if ('items' in value && value.items !== undefined && !isWidgetSettingsSchemaProperty(value.items, seen)) {
        return false;
    }
    if ('properties' in value && value.properties !== undefined) {
        if (!IsPlainObject(value.properties)) {
            return false;
        }
        for (const propVal of Object.values(value.properties)) {
            if (!isWidgetSettingsSchemaProperty(propVal, seen)) {
                return false;
            }
        }
    }
    if ('additionalProperties' in value && value.additionalProperties !== undefined) {
        const ap = value.additionalProperties;
        if (typeof ap !== 'boolean' && !isWidgetSettingsSchemaProperty(ap, seen)) {
            return false;
        }
    }
    return true;
}

/**
 * Runtime type guard for {@link WidgetSettingsSchema}.
 */
export function IsWidgetSettingsSchema(value: unknown): value is WidgetSettingsSchema {
    if (!IsPlainObject(value)) {
        return false;
    }
    if (Reflect.get(value, 'type') !== 'object') {
        return false;
    }
    if (!checkOptionalStringField(value, '$schema') || !checkOptionalStringField(value, 'title') || !checkOptionalStringField(value, 'description')) {
        return false;
    }
    if (!checkOptionalBooleanField(value, 'additionalProperties')) {
        return false;
    }
    if (!isStringArrayOrUndefined(Reflect.get(value, 'required'))) {
        return false;
    }
    const props = Reflect.get(value, 'properties');
    if (!IsPlainObject(props)) {
        return false;
    }
    for (const propVal of Object.values(props)) {
        if (!isWidgetSettingsSchemaProperty(propVal)) {
            return false;
        }
    }
    return true;
}

/**
 * Validates a candidate {@link WidgetHostProps} object and collects detailed
 * diagnostic errors for any missing or malformed field.
 */
export function ValidateWidgetHostProps(value: unknown): { valid: boolean; errors: string[] } {
    if (!IsPlainObject(value)) {
        return { valid: false, errors: ['WidgetHostProps must be a non-null plain object.'] };
    }
    const errors: string[] = [];
    validateWidgetIdentityProps(value, errors);
    validateWidgetSettingsProps(value, errors);
    validateWidgetCallbacks(value, errors);
    return { valid: errors.length === 0, errors };
}

function validateWidgetIdentityProps(value: object, errors: string[]): void {
    if (Reflect.get(value, 'componentRole') !== 'widget') {
        errors.push('componentRole must equal "widget".');
    }
    if (!IsWidgetSurface(Reflect.get(value, 'surface'))) {
        errors.push(`surface must be one of: ${WIDGET_SURFACES.join(', ')}.`);
    }
    if (!IsNonEmptyString(Reflect.get(value, 'placementId'))) {
        errors.push('placementId must be a non-empty string.');
    }
    if (!IsWidgetSizeClass(Reflect.get(value, 'sizeClass'))) {
        errors.push('sizeClass must be a non-empty string.');
    }
    if (!IsWidgetHostContext(Reflect.get(value, 'hostContext'))) {
        errors.push('hostContext must be a valid WidgetHostContext object.');
    }
}

function validateWidgetSettingsProps(value: object, errors: string[]): void {
    if (!IsJsonObject(Reflect.get(value, 'userSettings'))) {
        errors.push('userSettings must be a JSON-serializable object.');
    }
    const schema = Reflect.get(value, 'settingsSchema');
    if (schema !== undefined && !IsWidgetSettingsSchema(schema)) {
        errors.push('settingsSchema must be a valid WidgetSettingsSchema descriptor.');
    }
}

function validateWidgetCallbacks(value: object, errors: string[]): void {
    const requiredCallbacks = ['onOpenRecord', 'onInvokeAction', 'onNotify', 'onSaveUserSettings'];
    for (const cb of requiredCallbacks) {
        if (typeof Reflect.get(value, cb) !== 'function') {
            errors.push(`${cb} must be a function.`);
        }
    }
}

/**
 * Runtime type guard for {@link WidgetHostProps}.
 */
export function IsWidgetHostProps(value: unknown): value is WidgetHostProps {
    return ValidateWidgetHostProps(value).valid;
}

/**
 * Validates a concrete `userSettings` payload against a {@link WidgetSettingsSchema}.
 */
export function ValidateWidgetSettingsAgainstSchema(
    settings: unknown,
    schema: WidgetSettingsSchema
): { valid: boolean; errors: string[] } {
    if (!IsJsonObject(settings)) {
        return { valid: false, errors: ['Widget userSettings must be a JSON-serializable object.'] };
    }
    const errors: string[] = [];
    for (const reqKey of schema.required ?? []) {
        if (!(reqKey in settings)) {
            errors.push(`Missing required widget setting "${reqKey}".`);
        }
    }
    for (const [key, val] of Object.entries(settings)) {
        const propSchema = schema.properties[key];
        if (!propSchema) {
            if (schema.additionalProperties === false) {
                errors.push(`Unexpected widget setting "${key}" (additionalProperties is false).`);
            }
            continue;
        }
        validateValueAgainstSchemaProperty(key, val, propSchema, errors);
    }
    return { valid: errors.length === 0, errors };
}

function validateValueAgainstSchemaProperty(
    path: string,
    val: JsonValue,
    prop: WidgetSettingsSchemaProperty,
    errors: string[]
): void {
    if (!matchesSchemaType(val, prop.type)) {
        errors.push(`Setting "${path}" expected type "${prop.type}".`);
        return;
    }
    if (prop.enum && !prop.enum.some((allowed) => allowed === val)) {
        errors.push(`Setting "${path}" must be one of the declared enum values.`);
    }
    if (typeof val === 'number') {
        if (prop.minimum !== undefined && val < prop.minimum) {
            errors.push(`Setting "${path}" is below minimum ${prop.minimum}.`);
        }
        if (prop.maximum !== undefined && val > prop.maximum) {
            errors.push(`Setting "${path}" exceeds maximum ${prop.maximum}.`);
        }
    }
    if (typeof val === 'string') {
        validateStringSchemaConstraints(path, val, prop, errors);
    }
    if (Array.isArray(val) && prop.items) {
        for (let i = 0; i < val.length; i++) {
            validateValueAgainstSchemaProperty(`${path}[${i}]`, val[i], prop.items, errors);
        }
    }
}

function validateStringSchemaConstraints(
    path: string,
    val: string,
    prop: WidgetSettingsSchemaProperty,
    errors: string[]
): void {
    if (prop.minLength !== undefined && val.length < prop.minLength) {
        errors.push(`Setting "${path}" length must be >= ${prop.minLength}.`);
    }
    if (prop.maxLength !== undefined && val.length > prop.maxLength) {
        errors.push(`Setting "${path}" length must be <= ${prop.maxLength}.`);
    }
    if (prop.pattern !== undefined) {
        const regex = new RegExp(prop.pattern);
        if (!regex.test(val)) {
            errors.push(`Setting "${path}" does not match pattern "${prop.pattern}".`);
        }
    }
}

function matchesSchemaType(val: JsonValue, expected: WidgetSettingsSchemaPropertyType): boolean {
    switch (expected) {
        case 'string':
            return typeof val === 'string';
        case 'number':
            return typeof val === 'number' && Number.isFinite(val);
        case 'integer':
            return typeof val === 'number' && Number.isInteger(val);
        case 'boolean':
            return typeof val === 'boolean';
        case 'array':
            return Array.isArray(val);
        case 'object':
            return IsPlainObject(val);
    }
}
