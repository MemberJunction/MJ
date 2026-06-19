import { describe, it, expect } from 'vitest';
import { mapExternalNativeTypeToMJ } from '../Misc/externalTypeMapping';

describe('mapExternalNativeTypeToMJ', () => {
  it('maps common PostgreSQL types', () => {
    expect(mapExternalNativeTypeToMJ('character varying(255)')).toEqual({ Type: 'nvarchar', Length: 255, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('text')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('integer')).toEqual({ Type: 'int', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('bigint')).toEqual({ Type: 'bigint', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('numeric(18,2)')).toEqual({ Type: 'decimal', Length: null, Precision: 18, Scale: 2 });
    expect(mapExternalNativeTypeToMJ('boolean')).toEqual({ Type: 'bit', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('timestamptz')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('uuid')).toEqual({ Type: 'uniqueidentifier', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('bytea')).toEqual({ Type: 'varbinary', Length: -1, Precision: null, Scale: null });
  });

  it('maps common Snowflake types', () => {
    expect(mapExternalNativeTypeToMJ('VARCHAR(100)')).toEqual({ Type: 'nvarchar', Length: 100, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('NUMBER(38,0)')).toEqual({ Type: 'decimal', Length: null, Precision: 38, Scale: 0 });
    expect(mapExternalNativeTypeToMJ('NUMBER(10,2)')).toEqual({ Type: 'decimal', Length: null, Precision: 10, Scale: 2 });
    expect(mapExternalNativeTypeToMJ('TIMESTAMP_NTZ')).toEqual({ Type: 'datetimeoffset', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('FLOAT')).toEqual({ Type: 'float', Length: null, Precision: null, Scale: null });
  });

  it('maps common MongoDB types', () => {
    expect(mapExternalNativeTypeToMJ('ObjectId')).toEqual({ Type: 'nvarchar', Length: 24, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('string')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('int')).toEqual({ Type: 'int', Length: null, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('object')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
  });

  it('falls back to nvarchar(MAX) for unknown / complex types', () => {
    expect(mapExternalNativeTypeToMJ('geometry')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('vector(1536)')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
    expect(mapExternalNativeTypeToMJ('')).toEqual({ Type: 'nvarchar', Length: -1, Precision: null, Scale: null });
  });

  it('is case- and whitespace-insensitive on the base type', () => {
    const r = mapExternalNativeTypeToMJ('  VARCHAR ( 50 ) ');
    expect(r.Type).toBe('nvarchar');
    expect(r.Length).toBe(50);
  });
});
