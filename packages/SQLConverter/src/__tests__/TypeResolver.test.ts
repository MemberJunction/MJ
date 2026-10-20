import { describe, it, expect } from 'vitest';
import { ResolveType, ParseTypeString } from '../rules/TypeResolver.js';

describe('parseTypeString', () => {
  it('should parse plain type names', () => {
    expect(ParseTypeString('UNIQUEIDENTIFIER')).toEqual({ BaseName: 'UNIQUEIDENTIFIER' });
    expect(ParseTypeString('BIT')).toEqual({ BaseName: 'BIT' });
    expect(ParseTypeString('INT')).toEqual({ BaseName: 'INT' });
  });

  it('should parse types with length', () => {
    expect(ParseTypeString('NVARCHAR(255)')).toEqual({ BaseName: 'NVARCHAR', Length: 255 });
    expect(ParseTypeString('VARCHAR(100)')).toEqual({ BaseName: 'VARCHAR', Length: 100 });
    expect(ParseTypeString('CHAR(10)')).toEqual({ BaseName: 'CHAR', Length: 10 });
  });

  it('should parse MAX as length -1', () => {
    expect(ParseTypeString('NVARCHAR(MAX)')).toEqual({ BaseName: 'NVARCHAR', Length: -1 });
    expect(ParseTypeString('VARCHAR(MAX)')).toEqual({ BaseName: 'VARCHAR', Length: -1 });
  });

  it('should parse precision and scale', () => {
    expect(ParseTypeString('DECIMAL(18,2)')).toEqual({ BaseName: 'DECIMAL', Precision: 18, Scale: 2 });
    expect(ParseTypeString('NUMERIC(10,4)')).toEqual({ BaseName: 'NUMERIC', Precision: 10, Scale: 4 });
  });

  it('should parse single precision for non-string types', () => {
    expect(ParseTypeString('FLOAT(53)')).toEqual({ BaseName: 'FLOAT', Precision: 53 });
    expect(ParseTypeString('DATETIME2(7)')).toEqual({ BaseName: 'DATETIME2', Precision: 7 });
  });

  it('should be case-insensitive', () => {
    expect(ParseTypeString('nvarchar(max)')).toEqual({ BaseName: 'NVARCHAR', Length: -1 });
    expect(ParseTypeString('uniqueidentifier')).toEqual({ BaseName: 'UNIQUEIDENTIFIER' });
  });

  it('should handle whitespace', () => {
    expect(ParseTypeString('  NVARCHAR ( 255 )  ')).toEqual({ BaseName: 'NVARCHAR', Length: 255 });
  });
});

describe('resolveType', () => {
  describe('basic type mappings', () => {
    it('should map UNIQUEIDENTIFIER to UUID', () => {
      expect(ResolveType('UNIQUEIDENTIFIER')).toBe('UUID');
    });

    it('should map BIT to BOOLEAN', () => {
      expect(ResolveType('BIT')).toBe('BOOLEAN');
    });

    it('should map INT to INTEGER', () => {
      expect(ResolveType('INT')).toBe('INTEGER');
    });

    it('should map BIGINT to BIGINT', () => {
      expect(ResolveType('BIGINT')).toBe('BIGINT');
    });

    it('should map TINYINT to SMALLINT', () => {
      expect(ResolveType('TINYINT')).toBe('SMALLINT');
    });

    it('should map SMALLINT to SMALLINT', () => {
      expect(ResolveType('SMALLINT')).toBe('SMALLINT');
    });

    it('should map FLOAT to DOUBLE PRECISION', () => {
      expect(ResolveType('FLOAT')).toBe('DOUBLE PRECISION');
    });

    it('should map REAL to REAL', () => {
      expect(ResolveType('REAL')).toBe('REAL');
    });

    it('should map MONEY to NUMERIC(19,4)', () => {
      expect(ResolveType('MONEY')).toBe('NUMERIC(19,4)');
    });

    it('should map IMAGE to BYTEA', () => {
      expect(ResolveType('IMAGE')).toBe('BYTEA');
    });

    it('should map VARBINARY to BYTEA', () => {
      expect(ResolveType('VARBINARY')).toBe('BYTEA');
    });

    it('should map XML to XML', () => {
      expect(ResolveType('XML')).toBe('XML');
    });
  });

  describe('string types', () => {
    it('should map NVARCHAR(MAX) to TEXT', () => {
      expect(ResolveType('NVARCHAR(MAX)')).toBe('TEXT');
    });

    it('should map NVARCHAR(255) to VARCHAR(255)', () => {
      expect(ResolveType('NVARCHAR(255)')).toBe('VARCHAR(255)');
    });

    it('should map VARCHAR(MAX) to TEXT', () => {
      expect(ResolveType('VARCHAR(MAX)')).toBe('TEXT');
    });

    it('should map VARCHAR(100) to VARCHAR(100)', () => {
      expect(ResolveType('VARCHAR(100)')).toBe('VARCHAR(100)');
    });

    it('should map bare NVARCHAR to TEXT', () => {
      expect(ResolveType('NVARCHAR')).toBe('TEXT');
    });

    it('should map bare VARCHAR to TEXT', () => {
      expect(ResolveType('VARCHAR')).toBe('TEXT');
    });
  });

  describe('MJ-specific overrides (datetime -> TIMESTAMPTZ)', () => {
    it('should map DATETIME to TIMESTAMPTZ (MJ override)', () => {
      expect(ResolveType('DATETIME')).toBe('TIMESTAMPTZ');
    });

    it('should map DATETIME2 to TIMESTAMPTZ (MJ override)', () => {
      expect(ResolveType('DATETIME2')).toBe('TIMESTAMPTZ');
    });

    it('should map SMALLDATETIME to TIMESTAMPTZ (MJ override)', () => {
      expect(ResolveType('SMALLDATETIME')).toBe('TIMESTAMPTZ');
    });

    it('should map DATETIMEOFFSET to TIMESTAMPTZ', () => {
      expect(ResolveType('DATETIMEOFFSET')).toBe('TIMESTAMPTZ');
    });

    it('should map SQL_VARIANT to TEXT (MJ override)', () => {
      expect(ResolveType('SQL_VARIANT')).toBe('TEXT');
    });

    it('should map HIERARCHYID to TEXT (MJ override)', () => {
      expect(ResolveType('HIERARCHYID')).toBe('TEXT');
    });

    it('should map NTEXT to TEXT (MJ override)', () => {
      expect(ResolveType('NTEXT')).toBe('TEXT');
    });
  });

  describe('precision/scale types', () => {
    it('should map DECIMAL(18,2) to NUMERIC(18,2)', () => {
      expect(ResolveType('DECIMAL(18,2)')).toBe('NUMERIC(18,2)');
    });

    it('should map NUMERIC(10,4) to NUMERIC(10,4)', () => {
      expect(ResolveType('NUMERIC(10,4)')).toBe('NUMERIC(10,4)');
    });
  });

  describe('case insensitivity', () => {
    it('should handle lowercase input', () => {
      expect(ResolveType('uniqueidentifier')).toBe('UUID');
      expect(ResolveType('nvarchar(max)')).toBe('TEXT');
      expect(ResolveType('datetime')).toBe('TIMESTAMPTZ');
    });
  });
});
