import { describe, it, expect } from 'vitest';
import { resolveType, parseTypeString } from '../rules/TypeResolver.js';

describe('parseTypeString', () => {
  it('should parse plain type names', () => {
    expect(parseTypeString('UNIQUEIDENTIFIER')).toEqual({ BaseName: 'UNIQUEIDENTIFIER' });
    expect(parseTypeString('BIT')).toEqual({ BaseName: 'BIT' });
    expect(parseTypeString('INT')).toEqual({ BaseName: 'INT' });
  });

  it('should parse types with length', () => {
    expect(parseTypeString('NVARCHAR(255)')).toEqual({ BaseName: 'NVARCHAR', Length: 255 });
    expect(parseTypeString('VARCHAR(100)')).toEqual({ BaseName: 'VARCHAR', Length: 100 });
    expect(parseTypeString('CHAR(10)')).toEqual({ BaseName: 'CHAR', Length: 10 });
  });

  it('should parse MAX as length -1', () => {
    expect(parseTypeString('NVARCHAR(MAX)')).toEqual({ BaseName: 'NVARCHAR', Length: -1 });
    expect(parseTypeString('VARCHAR(MAX)')).toEqual({ BaseName: 'VARCHAR', Length: -1 });
  });

  it('should parse precision and scale', () => {
    expect(parseTypeString('DECIMAL(18,2)')).toEqual({ BaseName: 'DECIMAL', Precision: 18, Scale: 2 });
    expect(parseTypeString('NUMERIC(10,4)')).toEqual({ BaseName: 'NUMERIC', Precision: 10, Scale: 4 });
  });

  it('should parse single precision for non-string types', () => {
    expect(parseTypeString('FLOAT(53)')).toEqual({ BaseName: 'FLOAT', Precision: 53 });
    expect(parseTypeString('DATETIME2(7)')).toEqual({ BaseName: 'DATETIME2', Precision: 7 });
  });

  it('should be case-insensitive', () => {
    expect(parseTypeString('nvarchar(max)')).toEqual({ BaseName: 'NVARCHAR', Length: -1 });
    expect(parseTypeString('uniqueidentifier')).toEqual({ BaseName: 'UNIQUEIDENTIFIER' });
  });

  it('should handle whitespace', () => {
    expect(parseTypeString('  NVARCHAR ( 255 )  ')).toEqual({ BaseName: 'NVARCHAR', Length: 255 });
  });
});

describe('resolveType', () => {
  describe('basic type mappings', () => {
    it('should map UNIQUEIDENTIFIER to UUID', () => {
      expect(resolveType('UNIQUEIDENTIFIER')).toBe('UUID');
    });

    it('should map BIT to BOOLEAN', () => {
      expect(resolveType('BIT')).toBe('BOOLEAN');
    });

    it('should map INT to INTEGER', () => {
      expect(resolveType('INT')).toBe('INTEGER');
    });

    it('should map BIGINT to BIGINT', () => {
      expect(resolveType('BIGINT')).toBe('BIGINT');
    });

    it('should map TINYINT to SMALLINT', () => {
      expect(resolveType('TINYINT')).toBe('SMALLINT');
    });

    it('should map SMALLINT to SMALLINT', () => {
      expect(resolveType('SMALLINT')).toBe('SMALLINT');
    });

    it('should map FLOAT to DOUBLE PRECISION', () => {
      expect(resolveType('FLOAT')).toBe('DOUBLE PRECISION');
    });

    it('should map REAL to REAL', () => {
      expect(resolveType('REAL')).toBe('REAL');
    });

    it('should map MONEY to NUMERIC(19,4)', () => {
      expect(resolveType('MONEY')).toBe('NUMERIC(19,4)');
    });

    it('should map IMAGE to BYTEA', () => {
      expect(resolveType('IMAGE')).toBe('BYTEA');
    });

    it('should map VARBINARY to BYTEA', () => {
      expect(resolveType('VARBINARY')).toBe('BYTEA');
    });

    it('should map XML to XML', () => {
      expect(resolveType('XML')).toBe('XML');
    });
  });

  describe('string types', () => {
    it('should map NVARCHAR(MAX) to TEXT', () => {
      expect(resolveType('NVARCHAR(MAX)')).toBe('TEXT');
    });

    it('should map NVARCHAR(255) to VARCHAR(255)', () => {
      expect(resolveType('NVARCHAR(255)')).toBe('VARCHAR(255)');
    });

    it('should map VARCHAR(MAX) to TEXT', () => {
      expect(resolveType('VARCHAR(MAX)')).toBe('TEXT');
    });

    it('should map VARCHAR(100) to VARCHAR(100)', () => {
      expect(resolveType('VARCHAR(100)')).toBe('VARCHAR(100)');
    });

    it('should map bare NVARCHAR to TEXT', () => {
      expect(resolveType('NVARCHAR')).toBe('TEXT');
    });

    it('should map bare VARCHAR to TEXT', () => {
      expect(resolveType('VARCHAR')).toBe('TEXT');
    });
  });

  describe('MJ-specific overrides (datetime -> TIMESTAMPTZ)', () => {
    it('should map DATETIME to TIMESTAMPTZ (MJ override)', () => {
      expect(resolveType('DATETIME')).toBe('TIMESTAMPTZ');
    });

    it('should map DATETIME2 to TIMESTAMPTZ (MJ override)', () => {
      expect(resolveType('DATETIME2')).toBe('TIMESTAMPTZ');
    });

    it('should map SMALLDATETIME to TIMESTAMPTZ (MJ override)', () => {
      expect(resolveType('SMALLDATETIME')).toBe('TIMESTAMPTZ');
    });

    it('should map DATETIMEOFFSET to TIMESTAMPTZ', () => {
      expect(resolveType('DATETIMEOFFSET')).toBe('TIMESTAMPTZ');
    });

    it('should map SQL_VARIANT to TEXT (MJ override)', () => {
      expect(resolveType('SQL_VARIANT')).toBe('TEXT');
    });

    it('should map HIERARCHYID to TEXT (MJ override)', () => {
      expect(resolveType('HIERARCHYID')).toBe('TEXT');
    });

    it('should map NTEXT to TEXT (MJ override)', () => {
      expect(resolveType('NTEXT')).toBe('TEXT');
    });
  });

  describe('precision/scale types', () => {
    it('should map DECIMAL(18,2) to NUMERIC(18,2)', () => {
      expect(resolveType('DECIMAL(18,2)')).toBe('NUMERIC(18,2)');
    });

    it('should map NUMERIC(10,4) to NUMERIC(10,4)', () => {
      expect(resolveType('NUMERIC(10,4)')).toBe('NUMERIC(10,4)');
    });
  });

  describe('case insensitivity', () => {
    it('should handle lowercase input', () => {
      expect(resolveType('uniqueidentifier')).toBe('UUID');
      expect(resolveType('nvarchar(max)')).toBe('TEXT');
      expect(resolveType('datetime')).toBe('TIMESTAMPTZ');
    });
  });
});
