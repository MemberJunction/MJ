import { describe, it, expect } from 'vitest';
import { MapExternalNativeTypeToMJ } from '../Misc/externalTypeMapping';

describe('mapExternalNativeTypeToMJ', () => {
  it('maps common PostgreSQL types', () => {
    expect(MapExternalNativeTypeToMJ('character varying(255)')).toEqual({ Type: 'nvarchar', Length: 255, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('text')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('integer')).toEqual({ Type: 'int', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('bigint')).toEqual({ Type: 'bigint', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('numeric(18,2)')).toEqual({ Type: 'decimal', Length: null, Precision: 18, Scale: 2 });
    expect(MapExternalNativeTypeToMJ('boolean')).toEqual({ Type: 'bit', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('timestamptz')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('uuid')).toEqual({ Type: 'uniqueidentifier', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('bytea')).toEqual({ Type: 'varbinary', Length: -1, Precision: null, Scale: null });
  });

  it('maps common Snowflake types', () => {
    expect(MapExternalNativeTypeToMJ('VARCHAR(100)')).toEqual({ Type: 'nvarchar', Length: 100, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('NUMBER(38,0)')).toEqual({ Type: 'decimal', Length: null, Precision: 38, Scale: 0 });
    expect(MapExternalNativeTypeToMJ('NUMBER(10,2)')).toEqual({ Type: 'decimal', Length: null, Precision: 10, Scale: 2 });
    expect(MapExternalNativeTypeToMJ('TIMESTAMP_NTZ')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('FLOAT')).toEqual({ Type: 'float', Length: null, Precision: null, Scale: null });
  });

  it('maps Oracle types incl. INLINE-precision timestamps (regression: was mapped to nvarchar(MAX))', () => {
    expect(MapExternalNativeTypeToMJ('NUMBER(18,0)')).toEqual({ Type: 'decimal', Length: null, Precision: 18, Scale: 0 });
    // Oracle puts precision inline BEFORE the timezone suffix — must map to datetimeoffset, not text.
    expect(MapExternalNativeTypeToMJ('TIMESTAMP(6)')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('TIMESTAMP(6) WITH TIME ZONE')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('TIMESTAMP(6) WITH LOCAL TIME ZONE')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
  });

  it('handles wildcard precision NUMBER(*,scale) positionally (scale must not slide into precision)', () => {
    // '*' is non-numeric; it must keep its slot so the scale stays the scale (was collapsing to decimal(2,0)).
    expect(MapExternalNativeTypeToMJ('NUMBER(*,2)')).toEqual({ Type: 'decimal', Length: null, Precision: 18, Scale: 2 });
    expect(MapExternalNativeTypeToMJ('NUMBER(*,0)')).toEqual({ Type: 'decimal', Length: null, Precision: 18, Scale: 0 });
  });

  it('maps common MongoDB types', () => {
    expect(MapExternalNativeTypeToMJ('ObjectId')).toEqual({ Type: 'nvarchar', Length: 24, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('string')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('int')).toEqual({ Type: 'int', Length: null, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('object')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
  });

  it('falls back to nvarchar(MAX) for unknown / complex types', () => {
    expect(MapExternalNativeTypeToMJ('geometry')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('vector(1536)')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(MapExternalNativeTypeToMJ('')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
  });

  it('is case- and whitespace-insensitive on the base type', () => {
    const r = MapExternalNativeTypeToMJ('  VARCHAR ( 50 ) ');
    expect(r.Type).toBe('nvarchar');
    expect(r.Length).toBe(50);
  });
});
