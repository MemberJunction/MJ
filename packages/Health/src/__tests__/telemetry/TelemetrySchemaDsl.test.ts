import { describe, it, expect } from 'vitest';
import {
  CheckTelemetrySchemaAllowlist,
  ValidateTelemetrySchemaAllowlist,
  AssertTelemetrySchemaAllowlist,
  ValidateTelemetryRecord,
  HEALTH_REPORT_SHARE_SCHEMA,
  DAILY_USAGE_SHARE_SCHEMA,
  FEATURE_USAGE_SHARE_SCHEMA,
  type TelemetrySchema,
  type SafeEntityType,
  type SafeBucketKey,
  type HealthBucketShareRecord,
  type DailyUsageShareRecord,
  type FeatureUsageShareRecord,
} from '../../telemetry/TelemetrySchemaDsl';

interface SafeExampleRecord {
  AgentId: string;
  RunCount: number;
  LatencyMs: number;
  Status: string;
  DayUtc: string;
  IsRetry: boolean;
}

const SAFE_SCHEMA: TelemetrySchema<SafeExampleRecord> = {
  AgentId: { kind: 'metadata_uuid', entity: 'AIAgent' },
  RunCount: { kind: 'count' },
  LatencyMs: { kind: 'duration_ms' },
  Status: { kind: 'enum', values: ['success', 'failure', 'timeout'] },
  DayUtc: { kind: 'date_bucket', granularity: 'day' },
  IsRetry: { kind: 'boolean' },
};

describe('CheckTelemetrySchemaAllowlist', () => {
  it('passes a schema whose fields and metadata_uuid entity are all allowlisted', () => {
    expect(CheckTelemetrySchemaAllowlist(SAFE_SCHEMA)).toEqual([]);
  });

  it('flags a field name containing a forbidden substring, case-insensitively', () => {
    const schema: TelemetrySchema<{ UserEmail: string }> = { UserEmail: { kind: 'enum', values: ['a'] } };
    const violations = CheckTelemetrySchemaAllowlist(schema);
    expect(violations).toHaveLength(1);
    expect(violations[0].Field).toBe('UserEmail');
  });

  it('flags a metadata_uuid field referencing an entity outside SafeEntityType', () => {
    // A hand-rolled schema simulating a bypass of the compile-time union (the runtime backstop
    // this function exists to provide).
    const schema: TelemetrySchema<{ ConversationId: string }> = {
      ConversationId: { kind: 'metadata_uuid', entity: 'Conversation' as SafeEntityType },
    };

    const violations = CheckTelemetrySchemaAllowlist(schema);
    expect(violations.some((v) => v.Field === 'ConversationId')).toBe(true);
  });

  it('flags a histogram field referencing a bucketKey outside SafeBucketKey', () => {
    const schema: TelemetrySchema<{ Breakdown: Record<string, number> }> = {
      Breakdown: { kind: 'histogram', bucketKey: 'conversation_id' as SafeBucketKey },
    };

    const violations = CheckTelemetrySchemaAllowlist(schema);
    expect(violations.some((v) => v.Field === 'Breakdown')).toBe(true);
  });

  it('allows numeric tokens fields ending with Tokens or TokenCount', () => {
    const schema: TelemetrySchema<{ InputTokens: number; OutputTokens: number; TotalTokens: number; PromptTokenCount: number }> = {
      InputTokens: { kind: 'tokens' },
      OutputTokens: { kind: 'tokens' },
      TotalTokens: { kind: 'tokens' },
      PromptTokenCount: { kind: 'tokens' },
    };
    expect(CheckTelemetrySchemaAllowlist(schema)).toEqual([]);
  });

  it('rejects fields with "token" in name when kind is not tokens or does not end in Tokens/TokenCount', () => {
    const enumSchema: TelemetrySchema<{ AuthToken: string }> = {
      AuthToken: { kind: 'enum', values: ['jwt', 'oauth'] },
    };
    expect(CheckTelemetrySchemaAllowlist(enumSchema).length).toBe(1);

    const nonEndingSchema: TelemetrySchema<{ TokenRate: number }> = {
      TokenRate: { kind: 'tokens' },
    };
    expect(CheckTelemetrySchemaAllowlist(nonEndingSchema).length).toBe(1);
  });

  it('rejects IP address fields like ClientIP, SourceIp, and ip', () => {
    const ipSchema: TelemetrySchema<{ ClientIP: number; SourceIp: number; ip: number }> = {
      ClientIP: { kind: 'count' },
      SourceIp: { kind: 'count' },
      ip: { kind: 'count' },
    };
    const violations = CheckTelemetrySchemaAllowlist(ipSchema);
    expect(violations.length).toBe(3);
  });

  it('rejects field names exceeding 256 characters', () => {
    const longName = 'SafeFieldName' + 'a'.repeat(250);
    const longSchema: Record<string, { kind: 'count' }> = {
      [longName]: { kind: 'count' },
    };
    const violations = CheckTelemetrySchemaAllowlist(longSchema);
    expect(violations.length).toBe(1);
    expect(violations[0].Field).toBe(longName);
    expect(violations[0].Reason).toContain('exceeds maximum length of 256');
  });

  it('ValidateTelemetrySchemaAllowlist returns status object and AssertTelemetrySchemaAllowlist throws on violation', () => {
    const validRes = ValidateTelemetrySchemaAllowlist(SAFE_SCHEMA);
    expect(validRes.Valid).toBe(true);
    expect(validRes.Violations).toEqual([]);
    expect(() => AssertTelemetrySchemaAllowlist(SAFE_SCHEMA)).not.toThrow();

    const badSchema: TelemetrySchema<{ SecretKey: string }> = {
      SecretKey: { kind: 'enum', values: ['key1'] },
    };
    const badRes = ValidateTelemetrySchemaAllowlist(badSchema);
    expect(badRes.Valid).toBe(false);
    expect(badRes.Violations.length).toBe(1);
    expect(() => AssertTelemetrySchemaAllowlist(badSchema)).toThrow(/violates allowlist/);
  });

  it('passes all canonical production schemas through allowlist check', () => {
    expect(CheckTelemetrySchemaAllowlist(HEALTH_REPORT_SHARE_SCHEMA)).toEqual([]);
    expect(CheckTelemetrySchemaAllowlist(DAILY_USAGE_SHARE_SCHEMA)).toEqual([]);
    expect(CheckTelemetrySchemaAllowlist(FEATURE_USAGE_SHARE_SCHEMA)).toEqual([]);
  });
});

describe('ValidateTelemetryRecord', () => {
  const validRecord: SafeExampleRecord = {
    AgentId: '11111111-1111-1111-1111-111111111111',
    RunCount: 5,
    LatencyMs: 123.4,
    Status: 'success',
    DayUtc: '2026-11-11T00:00:00.000Z',
    IsRetry: false,
  };

  it('accepts a record whose values all conform to the schema', () => {
    const result = ValidateTelemetryRecord(SAFE_SCHEMA, validRecord);
    expect(result.Valid).toBe(true);
    expect(result.Errors).toEqual([]);
  });

  it('rejects a negative count', () => {
    const result = ValidateTelemetryRecord(SAFE_SCHEMA, { ...validRecord, RunCount: -1 });
    expect(result.Valid).toBe(false);
    expect(result.Errors.some((e) => e.Field === 'RunCount')).toBe(true);
  });

  it('rejects a non-integer count', () => {
    const result = ValidateTelemetryRecord(SAFE_SCHEMA, { ...validRecord, RunCount: 1.5 });
    expect(result.Valid).toBe(false);
    expect(result.Errors.some((e) => e.Field === 'RunCount')).toBe(true);
  });

  it('rejects an enum value outside the declared set', () => {
    const result = ValidateTelemetryRecord(SAFE_SCHEMA, { ...validRecord, Status: 'unknown-status' });
    expect(result.Valid).toBe(false);
    expect(result.Errors.some((e) => e.Field === 'Status')).toBe(true);
  });

  it('rejects an unparseable date_bucket value', () => {
    const result = ValidateTelemetryRecord(SAFE_SCHEMA, { ...validRecord, DayUtc: 'not-a-date' });
    expect(result.Valid).toBe(false);
    expect(result.Errors.some((e) => e.Field === 'DayUtc')).toBe(true);
  });

  it('rejects an unknown field not declared in the schema', () => {
    const record = { ...validRecord, ExtraField: 'surprise' } as SafeExampleRecord & { ExtraField: string };
    const result = ValidateTelemetryRecord(SAFE_SCHEMA, record);
    expect(result.Valid).toBe(false);
    expect(result.Errors.some((e) => e.Field === 'ExtraField')).toBe(true);
  });

  it('rejects a rating value outside its declared min/max bounds', () => {
    const schema: TelemetrySchema<{ Score: number }> = { Score: { kind: 'rating', min: 1, max: 5 } };
    const result = ValidateTelemetryRecord(schema, { Score: 7 });
    expect(result.Valid).toBe(false);
    expect(result.Errors[0].Reason).toContain('rating');
  });

  it('rejects a version_string value that is not SemVer-shaped or contains trailing junk', () => {
    const schema: TelemetrySchema<{ MjVersion: string }> = { MjVersion: { kind: 'version_string' } };
    expect(ValidateTelemetryRecord(schema, { MjVersion: '6.2.0' }).Valid).toBe(true);
    expect(ValidateTelemetryRecord(schema, { MjVersion: '6.2.0-beta.1' }).Valid).toBe(true);
    expect(ValidateTelemetryRecord(schema, { MjVersion: 'not-semver' }).Valid).toBe(false);
    expect(ValidateTelemetryRecord(schema, { MjVersion: '6.2.0 leaked secret' }).Valid).toBe(false);
  });

  it('rejects a date_bucket value that is not floored to declared granularity', () => {
    const daySchema: TelemetrySchema<{ DayBucket: string }> = { DayBucket: { kind: 'date_bucket', granularity: 'day' } };
    expect(ValidateTelemetryRecord(daySchema, { DayBucket: '2026-11-11' }).Valid).toBe(true);
    expect(ValidateTelemetryRecord(daySchema, { DayBucket: '2026-11-11T00:00:00.000Z' }).Valid).toBe(true);
    // Arbitrary millisecond timestamp is rejected because it is not floored to day
    expect(ValidateTelemetryRecord(daySchema, { DayBucket: '2026-11-11T14:23:45.678Z' }).Valid).toBe(false);

    const hourSchema: TelemetrySchema<{ HourBucket: string }> = { HourBucket: { kind: 'date_bucket', granularity: 'hour' } };
    expect(ValidateTelemetryRecord(hourSchema, { HourBucket: '2026-11-11T14:00:00.000Z' }).Valid).toBe(true);
    expect(ValidateTelemetryRecord(hourSchema, { HourBucket: '2026-11-11T14:23:00.000Z' }).Valid).toBe(false);
  });

  it('validates canonical production schemas against realistic records', () => {
    const healthRec: HealthBucketShareRecord = {
      BucketStartIso: '2026-11-11',
      Green: 10,
      Yellow: 2,
      Red: 0,
    };
    expect(ValidateTelemetryRecord(HEALTH_REPORT_SHARE_SCHEMA, healthRec).Valid).toBe(true);

    const usageRec: DailyUsageShareRecord = {
      DateBucket: '2026-11-11',
      Category: 'AI',
      Count: 42,
      TotalElapsedMs: 1500,
      TotalInputTokens: 5000,
      TotalOutputTokens: 2500,
    };
    expect(ValidateTelemetryRecord(DAILY_USAGE_SHARE_SCHEMA, usageRec).Valid).toBe(true);

    const featureRec: FeatureUsageShareRecord = {
      DateBucket: '2026-11-11',
      RouteTemplate: 'resource/record/:entityName/:recordId',
      NavigationCount: 88,
    };
    expect(ValidateTelemetryRecord(FEATURE_USAGE_SHARE_SCHEMA, featureRec).Valid).toBe(true);
  });

  it('validates histogram bucket counts and keys', () => {
    const schema: TelemetrySchema<{ Errors: Record<string, number> }> = {
      Errors: { kind: 'histogram', bucketKey: 'error_class' },
    };
    expect(ValidateTelemetryRecord(schema, { Errors: { TimeoutError: 5, NetworkError: 2 } }).Valid).toBe(true);
    // Negative count
    expect(ValidateTelemetryRecord(schema, { Errors: { TimeoutError: -1 } }).Valid).toBe(false);
    // Key with whitespace or email
    expect(ValidateTelemetryRecord(schema, { Errors: { 'bad key with spaces': 1 } }).Valid).toBe(false);
    expect(ValidateTelemetryRecord(schema, { Errors: { 'user@example.com': 1 } }).Valid).toBe(false);
  });
});
