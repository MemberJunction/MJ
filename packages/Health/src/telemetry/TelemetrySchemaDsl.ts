/**
 * Compile-time DSL for data that is eligible to leave an MJ deployment boundary. Every field a
 * `TelemetrySchema` declares must match one of these closed shapes — there is deliberately no
 * generic `string`, `timestamp`, or `uuid` type, so prompt text, completions, user identifiers,
 * and business record primary keys have nowhere to live in a typed shareable payload.
 *
 * See `docs/telemetry-shareable-schema.md` for the normative specification this mirrors.
 */
// case-violation-ok-legacy-back-compat: field names (kind/min/max/entity/bucketKey/granularity/values/buckets) verbatim-mirror the normative DSL spec in docs/telemetry-shareable-schema.md §3 — not a free naming choice to PascalCase.
export type TelemetryFieldType =
  | { kind: 'count' } // Non-negative integer
  | { kind: 'duration_ms' } // Non-negative floating-point latency
  | { kind: 'tokens' } // Non-negative integer token count
  | { kind: 'rating'; min: number; max: number } // Bounded numeric score
  | { kind: 'percentile'; buckets: readonly number[] } // Distribution percentiles (e.g. [50, 95, 99])
  | { kind: 'enum'; values: readonly string[] } // Compile-time static string union
  | { kind: 'metadata_uuid'; entity: SafeEntityType } // Whitelisted metadata entities only
  | { kind: 'histogram'; bucketKey: SafeBucketKey } // Pre-defined bucket distributions
  | { kind: 'date_bucket'; granularity: 'minute' | 'hour' | 'day' } // Bucketed time boundary
  | { kind: 'boolean' } // Feature flag boolean
  | { kind: 'version_string' }; // SemVer string matching /^\d+\.\d+\.\d+/

/**
 * The closed set of metadata entities a `{ kind: 'metadata_uuid' }` field may reference. Every
 * entry is an immutable configuration definition shipped with the platform or established at
 * provisioning time — never a user, conversation, execution run, or customer record.
 */
export type SafeEntityType = 'Entity' | 'AIAgent' | 'AIAgentType' | 'AIPrompt' | 'AIModel' | 'AIVendor' | 'AIConfiguration' | 'Action' | 'Query' | 'Application' | 'OpenApp' | 'Dashboard';

/** The closed set of allowlisted `{ kind: 'histogram' }` bucket dimensions. */
export type SafeBucketKey = 'error_class' | 'status_code' | 'model_family' | 'agent_type';

/** A compile-time schema declaration: every key of `T` mapped to its permitted shareable shape. */
export type TelemetrySchema<T> = {
  readonly [K in keyof T]: TelemetryFieldType;
};

/** The full `SafeEntityType` allowlist, as a runtime-checkable set. */
export const SAFE_ENTITY_TYPES: ReadonlySet<SafeEntityType> = new Set<SafeEntityType>([
  'Entity',
  'AIAgent',
  'AIAgentType',
  'AIPrompt',
  'AIModel',
  'AIVendor',
  'AIConfiguration',
  'Action',
  'Query',
  'Application',
  'OpenApp',
  'Dashboard',
]);

/** The full `SafeBucketKey` allowlist, as a runtime-checkable set. */
export const SAFE_BUCKET_KEYS: ReadonlySet<SafeBucketKey> = new Set<SafeBucketKey>(['error_class', 'status_code', 'model_family', 'agent_type']);

/**
 * Field-name substrings that, regardless of casing, are never permitted on a shareable schema —
 * matches `docs/telemetry-shareable-schema.md` §6.1's CI allowlist gate. A field named
 * `PromptText`, `UserID`, or `RecordID` describes exactly what the DSL's missing `string`/`uuid`
 * types exist to prevent, so this denylist catches someone trying to work around that at the
 * field-name level even if the field's declared `TelemetryFieldType` were otherwise valid.
 */
export const FORBIDDEN_FIELD_NAME_SUBSTRINGS: readonly string[] = [
  'content',
  'prompttext',
  'completiontext',
  'message',
  'user',
  'email',
  'secret',
  'token',
  'password',
  'recordid',
  'primaryvalue',
];

/** A single violation surfaced by {@link CheckTelemetrySchemaAllowlist}. */
export interface TelemetrySchemaAllowlistViolation {
  /** The offending field name. */
  Field: string;
  /** Why this field violates the allowlist. */
  Reason: string;
}

/**
 * Statically checks every field in `schema` against the allowlist rules from
 * `docs/telemetry-shareable-schema.md` §6.1: a denylisted name substring, or a `metadata_uuid`
 * field referencing an entity outside {@link SAFE_ENTITY_TYPES} (which would only type-check in
 * the first place via an unsafe cast, since `SafeEntityType` is a closed union — this function is
 * the runtime backstop for exactly that bypass, and the field-name denylist independent of it).
 *
 * This is the enforcement the plan's "static CI allowlist gate" performs — callers wire it into a
 * test that runs over every exported `TelemetrySchema` in the codebase and fails the build on any
 * returned violation (see `packages/Health/src/__tests__/telemetry/TelemetrySchemaDsl.test.ts` for
 * the pattern).
 */
export function CheckTelemetrySchemaAllowlist<T>(schema: TelemetrySchema<T>): TelemetrySchemaAllowlistViolation[] {
  const violations: TelemetrySchemaAllowlistViolation[] = [];

  for (const field of Object.keys(schema) as (keyof T & string)[]) {
    const lowerField = field.toLowerCase();
    const forbiddenMatch = FORBIDDEN_FIELD_NAME_SUBSTRINGS.find((substring) => lowerField.includes(substring));
    if (forbiddenMatch) {
      violations.push({ Field: field, Reason: `Field name contains the forbidden substring '${forbiddenMatch}'.` });
      continue;
    }

    const fieldType = schema[field as keyof T];
    if (fieldType.kind === 'metadata_uuid' && !SAFE_ENTITY_TYPES.has(fieldType.entity)) {
      violations.push({ Field: field, Reason: `metadata_uuid references entity '${fieldType.entity}', which is outside the SafeEntityType allowlist.` });
    }
    if (fieldType.kind === 'histogram' && !SAFE_BUCKET_KEYS.has(fieldType.bucketKey)) {
      violations.push({ Field: field, Reason: `histogram references bucketKey '${fieldType.bucketKey}', which is outside the SafeBucketKey allowlist.` });
    }
  }

  return violations;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+/;

/** A single violation surfaced by {@link ValidateTelemetryRecord}. */
export interface TelemetryRecordValidationError {
  Field: string;
  Reason: string;
}

/** Result of validating one record against a {@link TelemetrySchema} via {@link ValidateTelemetryRecord}. */
export interface TelemetryRecordValidationResult {
  Valid: boolean;
  Errors: TelemetryRecordValidationError[];
}

/**
 * Runtime structural validator: checks that every value in `record` actually conforms to the
 * shape its `TelemetryFieldType` declares. This is the DSL-aware analog of a generated Zod schema
 * (see `docs/telemetry-shareable-schema.md` §6.3's "Runtime Zod Validation" stage) — a payload
 * failing this check is dropped before packaging rather than silently coerced, so a provider bug
 * (an out-of-range rating, a negative count) cannot leak a structurally-invalid row downstream.
 *
 * Unknown keys on `record` that are not declared in `schema` are rejected — `additionalProperties:
 * false` is the normative schema's posture (§5), and a field that slipped past the DSL at
 * authoring time must still be caught here.
 */
export function ValidateTelemetryRecord<T extends Record<string, unknown>>(schema: TelemetrySchema<T>, record: T): TelemetryRecordValidationResult {
  const errors: TelemetryRecordValidationError[] = [];
  const schemaFields = new Set(Object.keys(schema));

  for (const key of Object.keys(record)) {
    if (!schemaFields.has(key)) {
      errors.push({ Field: key, Reason: 'Field is not declared in the schema.' });
    }
  }

  for (const field of Object.keys(schema) as (keyof T & string)[]) {
    const fieldType = schema[field as keyof T];
    const value = record[field];
    const error = validateFieldValue(field, fieldType, value);
    if (error) {
      errors.push(error);
    }
  }

  return { Valid: errors.length === 0, Errors: errors };
}

function validateFieldValue(field: string, fieldType: TelemetryFieldType, value: unknown): TelemetryRecordValidationError | undefined {
  switch (fieldType.kind) {
    case 'count':
    case 'tokens':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? undefined : { Field: field, Reason: `Expected a non-negative integer for kind '${fieldType.kind}'.` };
    case 'duration_ms':
      return typeof value === 'number' && value >= 0 ? undefined : { Field: field, Reason: 'Expected a non-negative number for kind \'duration_ms\'.' };
    case 'rating':
      return typeof value === 'number' && value >= fieldType.min && value <= fieldType.max
        ? undefined
        : { Field: field, Reason: `Expected a number between ${fieldType.min} and ${fieldType.max} for kind 'rating'.` };
    case 'percentile':
      return typeof value === 'number' && value >= 0 ? undefined : { Field: field, Reason: 'Expected a non-negative number for kind \'percentile\'.' };
    case 'enum':
      return typeof value === 'string' && (fieldType.values as readonly string[]).includes(value)
        ? undefined
        : { Field: field, Reason: `Expected one of [${fieldType.values.join(', ')}] for kind 'enum'.` };
    case 'metadata_uuid':
      return typeof value === 'string' && value.length > 0 ? undefined : { Field: field, Reason: 'Expected a non-empty UUID string for kind \'metadata_uuid\'.' };
    case 'histogram':
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? undefined : { Field: field, Reason: 'Expected an object (bucket key -> count) for kind \'histogram\'.' };
    case 'date_bucket':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? undefined : { Field: field, Reason: 'Expected an ISO-8601 date string for kind \'date_bucket\'.' };
    case 'boolean':
      return typeof value === 'boolean' ? undefined : { Field: field, Reason: 'Expected a boolean for kind \'boolean\'.' };
    case 'version_string':
      return typeof value === 'string' && SEMVER_PATTERN.test(value) ? undefined : { Field: field, Reason: 'Expected a SemVer string (e.g. 6.2.0) for kind \'version_string\'.' };
    default:
      return { Field: field, Reason: `Unrecognized TelemetryFieldType kind.` };
  }
}
