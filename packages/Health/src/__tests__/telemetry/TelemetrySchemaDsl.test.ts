import { describe, it, expect } from 'vitest';
import { CheckTelemetrySchemaAllowlist, ValidateTelemetryRecord, type TelemetrySchema } from '../../telemetry/TelemetrySchemaDsl';

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
    const schema = {
      ConversationId: { kind: 'metadata_uuid', entity: 'Conversation' },
    } as unknown as TelemetrySchema<{ ConversationId: string }>;

    const violations = CheckTelemetrySchemaAllowlist(schema);
    expect(violations.some((v) => v.Field === 'ConversationId')).toBe(true);
  });

  it('flags a histogram field referencing a bucketKey outside SafeBucketKey', () => {
    const schema = {
      Breakdown: { kind: 'histogram', bucketKey: 'conversation_id' },
    } as unknown as TelemetrySchema<{ Breakdown: Record<string, number> }>;

    const violations = CheckTelemetrySchemaAllowlist(schema);
    expect(violations.some((v) => v.Field === 'Breakdown')).toBe(true);
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

  it('rejects a version_string value that is not SemVer-shaped', () => {
    const schema: TelemetrySchema<{ MjVersion: string }> = { MjVersion: { kind: 'version_string' } };
    expect(ValidateTelemetryRecord(schema, { MjVersion: '6.2.0' }).Valid).toBe(true);
    expect(ValidateTelemetryRecord(schema, { MjVersion: 'not-semver' }).Valid).toBe(false);
  });
});
