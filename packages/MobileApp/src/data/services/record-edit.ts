/**
 * Record edit service — turns a single MJ record into an editable form model and
 * saves user edits back through the MJ object model.
 *
 * Flow: {@link loadRecordForEdit} loads a strongly-typed {@link BaseEntity} via
 * `Metadata.GetEntityObject` + `InnerLoad`, projects its editable scalar fields
 * into {@link FieldEditorDescriptor}s (driven by `EntityFieldInfo` metadata), and
 * captures the current values as a form-friendly bag. {@link saveRecord} applies
 * the edited values back onto the live entity, runs `BaseEntity.Validate()`, and
 * calls `BaseEntity.Save()` — returning a typed {@link RecordSaveResult}.
 *
 * Scope: scalar fields of the one record only. Related-entity editing is out of
 * scope. See `app/explorer/record/[id]/edit.tsx` for the screen that consumes it.
 */

import {
    Metadata,
    CompositeKey,
    BaseEntity,
    EntityFieldTSType,
    EntityFieldValueListType,
    type EntityInfo,
    type EntityFieldInfo,
    type UserInfo,
} from '@memberjunction/core';
import { enqueue, type QueueScalar } from '@/data/offline-queue';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/**
 * The renderer kind for a field's editor, derived from its SQL/TS type + value
 * list: `text` (short string), `longtext` (unbounded/large string), `number`,
 * `boolean` (toggle), `date` (ISO text for now), or `dropdown` (value list).
 */
export type EditorKind = 'text' | 'number' | 'boolean' | 'date' | 'dropdown' | 'longtext';

/** One selectable option for a {@link EditorKind} of `dropdown` (from the field's value list). */
export type EditorOption = { value: string; label: string };

/**
 * A form-side field value. Booleans back the toggle editor; every other editor
 * kind (text/number/date/longtext/dropdown) is edited as a string and coerced to
 * the entity's real type on save. `null` represents "no value".
 */
export type FieldValue = string | boolean | null;

/**
 * A single editable field projected from `EntityFieldInfo`, describing how the
 * form should render and validate it.
 */
export type FieldEditorDescriptor = {
    /** The entity field name (used as the value bag key and for `Set`/`Get`). */
    key: string;
    /** Human label (`DisplayName` falling back to `Name`). */
    label: string;
    /** How to render this field. */
    kind: EditorKind;
    /** True when the field disallows null (shown as a required marker). */
    required: boolean;
    /** Max character length for string editors; `0` means unbounded. */
    maxLength: number;
    /** Options for a `dropdown` editor (empty for other kinds). */
    options: EditorOption[];
};

/** Result of {@link loadRecordForEdit}: the live entity plus its form model. */
export type RecordEditLoad = {
    /** The loaded, strongly-typed entity — retained so edits can be saved to it. */
    record: BaseEntity;
    /** The entity metadata (for titles, display names). */
    entity: EntityInfo;
    /** A display title for the record (name field, else the id). */
    title: string;
    /** The editable field descriptors, in metadata order. */
    descriptors: FieldEditorDescriptor[];
    /** The current field values, keyed by field name. */
    values: Record<string, FieldValue>;
    /** False when the entity/user cannot update — the UI should surface this. */
    canUpdate: boolean;
};

/** A per-field validation failure surfaced inline in the form. */
export type FieldValidationError = { key: string; message: string };

/** Result of {@link saveRecord}: success plus an optional error / field errors. */
export type RecordSaveResult = {
    success: boolean;
    /** A single human-readable error message when `success` is false. */
    error?: string;
    /** Per-field validation errors when validation failed. */
    validationErrors?: FieldValidationError[];
    /**
     * True when the save could not reach the server (offline) and the edit was
     * instead enqueued for later replay. `success` is still `true` in this case —
     * the UI should say "Saved offline — will sync when you're back online" rather
     * than reporting a failure. See {@link ../offline-queue!enqueue}.
     */
    queued?: boolean;
};

/** String fields at or above this character length render as `longtext` (multiline). */
const LONGTEXT_THRESHOLD = 500;

// ---------------------------------------------------------------------------
// Field metadata extraction (pure, testable)
// ---------------------------------------------------------------------------

/**
 * A flattened, structural read of the `EntityFieldInfo` properties this service
 * needs. Extracting them once keeps the classification/descriptor logic pure and
 * unit-testable without constructing a full `EntityFieldInfo`.
 */
export type FieldMeta = {
    name: string;
    label: string;
    tsType: EntityFieldTSType;
    /** `EntityFieldInfo.ReadOnly` — folds in `!AllowUpdateAPI`, PK, and special date fields. */
    readOnly: boolean;
    /** View-only / joined-display columns that don't accept writes. */
    isVirtual: boolean;
    /** When false, a value is required. */
    allowsNull: boolean;
    /** Character length; `0` means unbounded (e.g. `nvarchar(max)`). */
    maxLength: number;
    /** Whether the field is backed by a value list. */
    valueListType: EntityFieldValueListType;
    /** The value list options (empty when not a list field). */
    options: EditorOption[];
    /** Field lifecycle status; only `Active` fields are editable. */
    status: string;
};

/**
 * Extract the subset of `EntityFieldInfo` this service reasons about into a plain
 * {@link FieldMeta}. This is the single place that touches the live metadata getters.
 *
 * @param field The entity field metadata to read.
 * @returns A structural {@link FieldMeta} snapshot.
 */
export function describeField(field: EntityFieldInfo): FieldMeta {
    return {
        name: field.Name,
        label: field.DisplayName || field.Name,
        tsType: field.TSType,
        readOnly: field.ReadOnly,
        isVirtual: field.IsVirtual === true,
        allowsNull: field.AllowsNull === true,
        maxLength: field.MaxLength,
        valueListType: field.ValueListTypeEnum,
        options: field.EntityFieldValues.map((v) => ({ value: v.Value, label: v.Value })),
        status: field.Status,
    };
}

/**
 * Decide whether a field is user-editable. A field is editable when it is not
 * read-only (which already excludes primary keys, non-updatable, and MJ special
 * date fields), is not a virtual/view-only column, and is `Active`.
 *
 * @param meta The field metadata snapshot.
 * @returns True when the field should appear in the edit form.
 */
export function isEditableField(meta: FieldMeta): boolean {
    return !meta.readOnly && !meta.isVirtual && meta.status === 'Active';
}

/**
 * Map a field to its editor {@link EditorKind}. Value-list fields become dropdowns;
 * otherwise the TS type decides. Strings that are unbounded or longer than
 * {@link LONGTEXT_THRESHOLD} render as multiline `longtext`. Unknown types fall
 * back to `text` (a plain single-line editor) — see the service report.
 *
 * @param meta The field metadata snapshot.
 * @returns The editor kind to render.
 */
export function editorKindForField(meta: FieldMeta): EditorKind {
    if (meta.valueListType !== EntityFieldValueListType.None && meta.options.length > 0) return 'dropdown';
    switch (meta.tsType) {
        case EntityFieldTSType.Boolean:
            return 'boolean';
        case EntityFieldTSType.Number:
            return 'number';
        case EntityFieldTSType.Date:
            return 'date';
        case EntityFieldTSType.String:
            return meta.maxLength === 0 || meta.maxLength >= LONGTEXT_THRESHOLD ? 'longtext' : 'text';
        default:
            return 'text';
    }
}

/**
 * Build the {@link FieldEditorDescriptor} for a field from its metadata snapshot.
 *
 * @param meta The field metadata snapshot.
 * @returns The descriptor the form renders.
 */
export function buildDescriptor(meta: FieldMeta): FieldEditorDescriptor {
    const kind = editorKindForField(meta);
    return {
        key: meta.name,
        label: meta.label,
        kind,
        required: !meta.allowsNull,
        maxLength: meta.maxLength,
        options: kind === 'dropdown' ? meta.options : [],
    };
}

// ---------------------------------------------------------------------------
// Value coercion (pure, testable)
// ---------------------------------------------------------------------------

/**
 * Convert a raw entity value into a form-side {@link FieldValue}. Booleans stay
 * boolean; dates become ISO strings; everything else becomes a string (with
 * `null`/`undefined` collapsing to an empty string so text inputs stay controlled).
 *
 * @param raw The value read from the entity via `Get`.
 * @param kind The editor kind for the field.
 * @returns A form-friendly value.
 */
export function formValueFromRaw(raw: unknown, kind: EditorKind): FieldValue {
    if (kind === 'boolean') return raw === true;
    if (raw === null || raw === undefined) return '';
    if (kind === 'date') return raw instanceof Date ? raw.toISOString() : String(raw);
    return String(raw);
}

/** The set of concrete types accepted by `BaseEntity.Set` for the fields we edit. */
export type EntityFieldValue = string | number | boolean | Date | null;

/**
 * Convert a form-side {@link FieldValue} back to the concrete type the entity
 * expects for the given editor kind. Empty strings become `null`; numbers and
 * dates are parsed. Callers should validate first (see {@link validateRequired}).
 *
 * @param value The current form value.
 * @param kind The editor kind for the field.
 * @returns The value to hand to `BaseEntity.Set`.
 */
export function entityValueFromForm(value: FieldValue, kind: EditorKind): EntityFieldValue {
    if (kind === 'boolean') return value === true;
    if (typeof value !== 'string' || value === '') return null;
    if (kind === 'number') {
        const n = Number(value);
        return Number.isNaN(n) ? null : n;
    }
    if (kind === 'date') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return value;
}

/**
 * Client-side required/format validation over the current form values. Runs before
 * the entity's own `Validate()` so the UI can show inline errors without a round trip.
 *
 * @param descriptors The field descriptors.
 * @param values The current form values.
 * @returns One {@link FieldValidationError} per failing field (empty when valid).
 */
export function validateRequired(
    descriptors: FieldEditorDescriptor[],
    values: Record<string, FieldValue>,
): FieldValidationError[] {
    const errors: FieldValidationError[] = [];
    for (const d of descriptors) {
        const v = values[d.key];
        if (d.required && d.kind !== 'boolean' && (v === '' || v === null)) {
            errors.push({ key: d.key, message: `${d.label} is required.` });
        }
        if (d.kind === 'number' && typeof v === 'string' && v !== '' && Number.isNaN(Number(v))) {
            errors.push({ key: d.key, message: `${d.label} must be a number.` });
        }
        if (d.kind === 'date' && typeof v === 'string' && v !== '' && Number.isNaN(new Date(v).getTime())) {
            errors.push({ key: d.key, message: `${d.label} must be a valid date.` });
        }
    }
    return errors;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/** Derive a display title from the record's name field, falling back to the id. */
function recordTitle(entity: EntityInfo, record: BaseEntity, recordId: string): string {
    const nameField = entity.NameField;
    if (nameField) {
        const v = record.Get(nameField.Name);
        if (v !== null && v !== undefined && String(v) !== '') return String(v);
    }
    return recordId;
}

/** Whether the current user may update records of this entity (entity flag ∩ role permission). */
function computeCanUpdate(entity: EntityInfo, user: UserInfo | undefined): boolean {
    if (entity.AllowUpdateAPI === false) return false;
    if (!user) return true;
    try {
        return entity.GetUserPermisions(user).CanUpdate === true;
    } catch {
        // Permission metadata may be unavailable on the client — fail open to the entity flag.
        return true;
    }
}

/**
 * Load a record and project it into an editable form model. Returns `null` when
 * the entity is unknown or the record cannot be loaded, so callers can render a
 * clean "not found" state.
 *
 * @param entityName  The MJ entity name.
 * @param recordId    The record primary key (serialized).
 * @param contextUser Optional acting user (server-side scoping / permission check).
 * @returns The {@link RecordEditLoad}, or `null` when unavailable.
 */
export async function loadRecordForEdit(
    entityName: string,
    recordId: string,
    contextUser?: UserInfo,
): Promise<RecordEditLoad | null> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const entity = md.EntityByName(entityName);
    if (!entity) return null;

    const record = await md.GetEntityObject<BaseEntity>(entityName, contextUser);
    const loaded = await record.InnerLoad(CompositeKey.FromID(recordId));
    if (!loaded) return null;

    const descriptors = entity.Fields.map(describeField).filter(isEditableField).map(buildDescriptor);
    const values: Record<string, FieldValue> = {};
    for (const d of descriptors) values[d.key] = formValueFromRaw(record.Get(d.key), d.kind);

    return {
        record,
        entity,
        title: recordTitle(entity, record, recordId),
        descriptors,
        values,
        canUpdate: computeCanUpdate(entity, contextUser ?? md.CurrentUser),
    };
}

/** Apply the edited form values back onto the live entity via `Set`. */
function applyEdits(load: RecordEditLoad, values: Record<string, FieldValue>): void {
    for (const d of load.descriptors) {
        // Only write fields the user actually changed (compare against the initial
        // load values, mirroring buildOfflineChanges). Re-setting every editable
        // field marks untouched fields dirty and can round-trip a value into a form
        // the entity rejects at Validate()/Save() time — which silently blocked saves.
        if (values[d.key] === load.values[d.key]) continue;
        load.record.Set(d.key, entityValueFromForm(values[d.key], d.kind));
    }
}

/** Map the entity's `Validate()` errors back to per-field {@link FieldValidationError}s. */
function collectEntityValidation(load: RecordEditLoad): FieldValidationError[] {
    const result = load.record.Validate();
    if (result.Success) return [];
    return result.Errors.map((e) => ({ key: e.Source ?? '', message: e.Message }));
}

/** Coerce an entity field value to a JSON-serializable scalar (Date → ISO string). */
function toQueueScalar(value: EntityFieldValue): QueueScalar {
    return value instanceof Date ? value.toISOString() : value;
}

/**
 * Build the offline-queue payload for the edits currently applied to `load`. Only
 * fields whose form value differs from the originally-loaded value are captured, so
 * a replay overwrites just what the user actually changed. Values are coerced to
 * JSON scalars via {@link toQueueScalar}.
 *
 * @param load   The active edit load (holds the entity + originally-loaded values).
 * @param values The edited form values.
 * @returns The changed-fields bag and the record's serialized primary key.
 */
function buildOfflineChanges(
    load: RecordEditLoad,
    values: Record<string, FieldValue>,
): { changedFields: Record<string, QueueScalar>; primaryKey: string | null } {
    const changedFields: Record<string, QueueScalar> = {};
    for (const d of load.descriptors) {
        if (values[d.key] === load.values[d.key]) continue;
        changedFields[d.key] = toQueueScalar(entityValueFromForm(values[d.key], d.kind));
    }
    const pkField = load.entity.FirstPrimaryKey;
    const primaryKey = pkField ? String(load.record.Get(pkField.Name)) : null;
    return { changedFields, primaryKey };
}

/**
 * Enqueue the current edits for later replay when a save could not reach the server.
 * Record-edit only ever updates an existing row, so the queued op is always `update`.
 *
 * @param load   The active edit load.
 * @param values The edited form values.
 */
function queueOfflineEdit(load: RecordEditLoad, values: Record<string, FieldValue>): void {
    const { changedFields, primaryKey } = buildOfflineChanges(load, values);
    enqueue({ entityName: load.entity.Name, primaryKey, changedFields, op: 'update' });
}

/**
 * Apply edits to the record, validate, and save. Client-side required checks run
 * first, then the entity's own `Validate()`, then `Save()`. Never throws for
 * business failures — inspect the returned {@link RecordSaveResult}.
 *
 * @param load        The active edit load (holds the live entity).
 * @param values      The edited form values.
 * @param contextUser Optional acting user (unused directly; the entity carries its user).
 * @returns A typed result describing success or the failure reason.
 */
export async function saveRecord(
    load: RecordEditLoad,
    values: Record<string, FieldValue>,
    contextUser?: UserInfo,
): Promise<RecordSaveResult> {
    void contextUser; // entity already bound to its context user from load
    if (!load.canUpdate) {
        return { success: false, error: 'You do not have permission to update this record.' };
    }

    const requiredErrors = validateRequired(load.descriptors, values);
    if (requiredErrors.length > 0) return { success: false, validationErrors: requiredErrors };

    applyEdits(load, values);

    const entityErrors = collectEntityValidation(load);
    if (entityErrors.length > 0) return { success: false, validationErrors: entityErrors };

    // `Save()` returns false for business failures (validation/permission/FK) but
    // THROWS on transport/network errors. We treat the throw as the "offline" signal:
    // enqueue the edit for replay and report success-with-queued so the UI can say
    // "Saved offline". A returned false is a real failure and surfaces normally.
    try {
        const saved = await load.record.Save();
        if (!saved) {
            return { success: false, error: load.record.LatestResult?.CompleteMessage ?? 'Save failed.' };
        }
        return { success: true };
    } catch {
        queueOfflineEdit(load, values);
        return { success: true, queued: true };
    }
}
