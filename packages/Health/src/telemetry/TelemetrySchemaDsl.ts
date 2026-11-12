import type { TelemetryCategory } from '@memberjunction/core';
import { KNOWN_ROUTE_TEMPLATES } from './RouteScrubber';

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

/** Plain object representing a histogram value (bucket label -> count). */
export type TelemetryHistogramValue = Readonly<Record<string, number>>;

/** Concrete allowable field value types eligible to leave an MJ deployment boundary. */
export type TelemetryFieldValue = number | string | boolean | TelemetryHistogramValue;

/** Record shape mapped to concrete shareable field values. */
export type TelemetryRecordShape<T> = { readonly [K in keyof T]: TelemetryFieldValue };

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
  'text',
  'message',
  'body',
  'user',
  'conversation',
  'email',
  'secret',
  'token',
  'password',
  'recordid',
  'primaryvalue',
  'ipaddress',
  'clientip',
];

const STANDALONE_IP_PATTERN = /(?:^|_)ip(?:$|_)|(?:^|[a-zA-Z])(?:IP|Ip)(?:[A-Z0-9_]|$)|^Ip/;

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
    if (field.length > 256) {
      violations.push({ Field: field, Reason: 'Field name exceeds maximum length of 256 characters.' });
      continue;
    }

    const fieldType = schema[field as keyof T];
    const lowerField = field.toLowerCase();

    // Check token exception: explicitly allow numeric tokens fields ending in Tokens or TokenCount
    const isAllowedTokensField = fieldType.kind === 'tokens' && (lowerField.endsWith('tokens') || lowerField.endsWith('tokencount'));

    let forbiddenMatch: string | undefined;
    for (const sub of FORBIDDEN_FIELD_NAME_SUBSTRINGS) {
      if (sub === 'token' && isAllowedTokensField) {
        continue;
      }
      if (lowerField.includes(sub)) {
        forbiddenMatch = sub;
        break;
      }
    }

    if (!forbiddenMatch && field.length <= 256 && STANDALONE_IP_PATTERN.test(field)) {
      forbiddenMatch = 'ip';
    }

    if (forbiddenMatch) {
      violations.push({ Field: field, Reason: `Field name contains the forbidden substring '${forbiddenMatch}'.` });
      continue;
    }

    if (fieldType.kind === 'metadata_uuid' && !SAFE_ENTITY_TYPES.has(fieldType.entity)) {
      violations.push({ Field: field, Reason: `metadata_uuid references entity '${fieldType.entity}', which is outside the SafeEntityType allowlist.` });
    }
    if (fieldType.kind === 'histogram' && !SAFE_BUCKET_KEYS.has(fieldType.bucketKey)) {
      violations.push({ Field: field, Reason: `histogram references bucketKey '${fieldType.bucketKey}', which is outside the SafeBucketKey allowlist.` });
    }
  }

  return violations;
}

/** Validates `schema` against the static allowlist, returning a status object with violations list. */
export function ValidateTelemetrySchemaAllowlist<T>(schema: TelemetrySchema<T>): { Valid: boolean; Violations: TelemetrySchemaAllowlistViolation[] } {
  const violations = CheckTelemetrySchemaAllowlist(schema);
  return { Valid: violations.length === 0, Violations: violations };
}

/** Asserts that `schema` satisfies all allowlist rules, throwing an Error if any violations are found. */
export function AssertTelemetrySchemaAllowlist<T>(schema: TelemetrySchema<T>): void {
  const violations = CheckTelemetrySchemaAllowlist(schema);
  if (violations.length > 0) {
    throw new Error(`Telemetry schema violates allowlist:\n${violations.map((v) => `  - ${v.Field}: ${v.Reason}`).join('\n')}`);
  }
}

/** Allowlisted share record shape for periodic health evaluations. */
export interface HealthBucketShareRecord {
  BucketStartIso: string;
  Green: number;
  Yellow: number;
  Red: number;
}

/** Normative shareable schema for health reports. */
export const HEALTH_REPORT_SHARE_SCHEMA: TelemetrySchema<HealthBucketShareRecord> = {
  BucketStartIso: { kind: 'date_bucket', granularity: 'day' },
  Green: { kind: 'count' },
  Yellow: { kind: 'count' },
  Red: { kind: 'count' },
};

/** Allowlisted share record shape for daily aggregated usage. */
export interface DailyUsageShareRecord {
  DateBucket: string;
  Category: string;
  Count: number;
  TotalElapsedMs: number;
  TotalInputTokens: number;
  TotalOutputTokens: number;
}

/** The closed set of telemetry categories permitted in shareable usage records. */
export const SAFE_TELEMETRY_CATEGORIES: readonly TelemetryCategory[] = [
  'RunView',
  'RunQuery',
  'Engine',
  'Network',
  'AI',
  'Cache',
  'Coalesce',
  'Custom',
];

/** Normative shareable schema for aggregated category usage. */
export const DAILY_USAGE_SHARE_SCHEMA: TelemetrySchema<DailyUsageShareRecord> = {
  DateBucket: { kind: 'date_bucket', granularity: 'day' },
  Category: { kind: 'enum', values: [...SAFE_TELEMETRY_CATEGORIES] },
  Count: { kind: 'count' },
  TotalElapsedMs: { kind: 'duration_ms' },
  TotalInputTokens: { kind: 'tokens' },
  TotalOutputTokens: { kind: 'tokens' },
};

/** Allowlisted share record shape for sub-day (minute) aggregated usage (Tier 3: HealthAndMetadataEvents). */
export interface MinuteUsageShareRecord {
  BucketStartIso: string;
  Category: string;
  Count: number;
  TotalElapsedMs: number;
  TotalInputTokens: number;
  TotalOutputTokens: number;
}

/** Normative shareable schema for sub-day (minute) category usage (Tier 3: HealthAndMetadataEvents). */
export const MINUTE_USAGE_SHARE_SCHEMA: TelemetrySchema<MinuteUsageShareRecord> = {
  BucketStartIso: { kind: 'date_bucket', granularity: 'minute' },
  Category: { kind: 'enum', values: [...SAFE_TELEMETRY_CATEGORIES] },
  Count: { kind: 'count' },
  TotalElapsedMs: { kind: 'duration_ms' },
  TotalInputTokens: { kind: 'tokens' },
  TotalOutputTokens: { kind: 'tokens' },
};

/** Allowlisted share record shape for daily scrubbed feature usage. */
export interface FeatureUsageShareRecord {
  DateBucket: string;
  RouteTemplate: string;
  NavigationCount: number;
}

/** Normative shareable schema for feature route navigation usage. */
export const FEATURE_USAGE_SHARE_SCHEMA: TelemetrySchema<FeatureUsageShareRecord> = {
  DateBucket: { kind: 'date_bucket', granularity: 'day' },
  RouteTemplate: {
    kind: 'enum',
    values: [...KNOWN_ROUTE_TEMPLATES],
  },
  NavigationCount: { kind: 'count' },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STRICT_SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,32})?$/;
const DAY_DATE_PATTERN = /^(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z)$/;
const HOUR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00(?:\.000)?Z$/;
const MINUTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?Z$/;

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
export function ValidateTelemetryRecord<T extends object>(schema: TelemetrySchema<T>, record: T): TelemetryRecordValidationResult {
  const errors: TelemetryRecordValidationError[] = [];
  const schemaFields = new Set(Object.keys(schema));

  for (const key of Object.keys(record)) {
    if (!schemaFields.has(key)) {
      errors.push({ Field: key, Reason: 'Field is not declared in the schema.' });
    }
  }

  const recordMap = record as Record<string, TelemetryFieldValue | null | undefined>;
  for (const field of Object.keys(schema) as (keyof T & string)[]) {
    const fieldType = schema[field as keyof T];
    const value = recordMap[field];
    const error = validateFieldValue(field, fieldType, value);
    if (error) {
      errors.push(error);
    }
  }

  return { Valid: errors.length === 0, Errors: errors };
}

function validateFieldValue(field: string, fieldType: TelemetryFieldType, value: TelemetryFieldValue | null | undefined): TelemetryRecordValidationError | undefined {
  if (value === undefined || value === null) {
    return { Field: field, Reason: 'Field value cannot be null or undefined.' };
  }

  switch (fieldType.kind) {
    case 'count':
    case 'tokens':
      return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
        ? undefined
        : { Field: field, Reason: `Expected a non-negative finite integer for kind '${fieldType.kind}'.` };
    case 'duration_ms':
    case 'percentile':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? undefined
        : { Field: field, Reason: `Expected a non-negative finite number for kind '${fieldType.kind}'.` };
    case 'rating':
      return typeof value === 'number' && Number.isFinite(value) && value >= fieldType.min && value <= fieldType.max
        ? undefined
        : { Field: field, Reason: `Expected a finite number between ${fieldType.min} and ${fieldType.max} for kind 'rating'.` };
    case 'enum':
      return typeof value === 'string' && (fieldType.values as readonly string[]).includes(value)
        ? undefined
        : { Field: field, Reason: `Expected one of [${fieldType.values.join(', ')}] for kind 'enum'.` };
    case 'metadata_uuid': {
      if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        return { Field: field, Reason: 'Expected a canonical UUID string for kind \'metadata_uuid\'.' };
      }
      if (!SAFE_ENTITY_TYPES.has(fieldType.entity)) {
        return { Field: field, Reason: `metadata_uuid references entity '${fieldType.entity}', which is outside the SafeEntityType allowlist.` };
      }
      return undefined;
    }
    case 'histogram': {
      if (!SAFE_BUCKET_KEYS.has(fieldType.bucketKey)) {
        return { Field: field, Reason: `histogram references bucketKey '${fieldType.bucketKey}', which is outside the SafeBucketKey allowlist.` };
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { Field: field, Reason: 'Expected an object (bucket key -> count) for kind \'histogram\'.' };
      }
      const hist = value as Record<string, number>;
      for (const [k, v] of Object.entries(hist)) {
        if (typeof k !== 'string' || k.length === 0 || k.length > 64 || /\s|@/.test(k)) {
          return { Field: field, Reason: `Histogram bucket key '${k}' is invalid (must be 1-64 chars without whitespace or '@').` };
        }
        if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
          return { Field: field, Reason: `Histogram bucket value for key '${k}' must be a non-negative finite integer.` };
        }
      }
      return undefined;
    }
    case 'date_bucket': {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        return { Field: field, Reason: 'Expected a valid date string for kind \'date_bucket\'.' };
      }
      let matchesGranularity = false;
      if (fieldType.granularity === 'day') {
        matchesGranularity = DAY_DATE_PATTERN.test(value);
      } else if (fieldType.granularity === 'hour') {
        matchesGranularity = HOUR_DATE_PATTERN.test(value);
      } else if (fieldType.granularity === 'minute') {
        matchesGranularity = MINUTE_DATE_PATTERN.test(value);
      }
      if (!matchesGranularity) {
        return { Field: field, Reason: `Expected a date string floored to '${fieldType.granularity}' granularity for kind 'date_bucket'.` };
      }
      return undefined;
    }
    case 'boolean':
      return typeof value === 'boolean' ? undefined : { Field: field, Reason: 'Expected a boolean for kind \'boolean\'.' };
    case 'version_string':
      return typeof value === 'string' && value.length <= 64 && STRICT_SEMVER_PATTERN.test(value)
        ? undefined
        : { Field: field, Reason: 'Expected a valid SemVer string (e.g. 6.2.0 or 6.2.0-beta.1, max 64 chars) for kind \'version_string\'.' };
    default:
      return { Field: field, Reason: 'Unrecognized TelemetryFieldType kind.' };
  }
}
