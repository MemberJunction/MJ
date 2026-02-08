import { describe, it, expect, beforeEach } from 'vitest';

// Mock @memberjunction/global to prevent RegisterClass issues
import { vi } from 'vitest';
vi.mock('@memberjunction/global', () => ({
  RegisterClass: vi.fn(() => (target: Function) => target),
  MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
}));

import { FieldMapper } from '../FieldMapper';

describe('FieldMapper', () => {
  let mapper: FieldMapper;

  beforeEach(() => {
    mapper = new FieldMapper();
  });

  describe('MapFieldName', () => {
    it('should map __mj_CreatedAt to _mj__CreatedAt', () => {
      expect(mapper.MapFieldName('__mj_CreatedAt')).toBe('_mj__CreatedAt');
    });

    it('should map __mj_UpdatedAt to _mj__UpdatedAt', () => {
      expect(mapper.MapFieldName('__mj_UpdatedAt')).toBe('_mj__UpdatedAt');
    });

    it('should map __mj_DeletedAt to _mj__DeletedAt', () => {
      expect(mapper.MapFieldName('__mj_DeletedAt')).toBe('_mj__DeletedAt');
    });

    it('should return original name for unmapped fields', () => {
      expect(mapper.MapFieldName('ID')).toBe('ID');
      expect(mapper.MapFieldName('Name')).toBe('Name');
      expect(mapper.MapFieldName('Email')).toBe('Email');
    });

    it('should return original name for empty string', () => {
      expect(mapper.MapFieldName('')).toBe('');
    });
  });

  describe('ReverseMapFieldName', () => {
    it('should reverse map _mj__CreatedAt to __mj_CreatedAt', () => {
      expect(mapper.ReverseMapFieldName('_mj__CreatedAt')).toBe('__mj_CreatedAt');
    });

    it('should reverse map _mj__UpdatedAt to __mj_UpdatedAt', () => {
      expect(mapper.ReverseMapFieldName('_mj__UpdatedAt')).toBe('__mj_UpdatedAt');
    });

    it('should reverse map _mj__DeletedAt to __mj_DeletedAt', () => {
      expect(mapper.ReverseMapFieldName('_mj__DeletedAt')).toBe('__mj_DeletedAt');
    });

    it('should return original name for unmapped fields', () => {
      expect(mapper.ReverseMapFieldName('ID')).toBe('ID');
      expect(mapper.ReverseMapFieldName('Name')).toBe('Name');
    });

    it('should return original name for empty string', () => {
      expect(mapper.ReverseMapFieldName('')).toBe('');
    });
  });

  describe('MapFields', () => {
    it('should map __mj_ fields in object', () => {
      const obj: Record<string, unknown> = {
        ID: '123',
        Name: 'Test',
        __mj_CreatedAt: '2024-01-01',
        __mj_UpdatedAt: '2024-01-02',
      };

      const result = mapper.MapFields(obj);

      expect(result).toBe(obj); // Mutates in place
      expect(obj._mj__CreatedAt).toBe('2024-01-01');
      expect(obj._mj__UpdatedAt).toBe('2024-01-02');
      expect(obj.__mj_CreatedAt).toBeUndefined();
      expect(obj.__mj_UpdatedAt).toBeUndefined();
      expect(obj.ID).toBe('123');
      expect(obj.Name).toBe('Test');
    });

    it('should return the same object (mutated in place)', () => {
      const obj: Record<string, unknown> = { __mj_CreatedAt: 'date' };
      const result = mapper.MapFields(obj);
      expect(result).toBe(obj);
    });

    it('should handle object with no mappable fields', () => {
      const obj: Record<string, unknown> = { ID: '123', Name: 'Test' };
      mapper.MapFields(obj);

      expect(obj.ID).toBe('123');
      expect(obj.Name).toBe('Test');
    });

    it('should handle empty object', () => {
      const obj: Record<string, unknown> = {};
      const result = mapper.MapFields(obj);
      expect(result).toEqual({});
    });

    it('should handle undefined input', () => {
      const result = mapper.MapFields(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle all three __mj_ fields', () => {
      const obj: Record<string, unknown> = {
        __mj_CreatedAt: 'date1',
        __mj_UpdatedAt: 'date2',
        __mj_DeletedAt: 'date3',
      };

      mapper.MapFields(obj);

      expect(obj._mj__CreatedAt).toBe('date1');
      expect(obj._mj__UpdatedAt).toBe('date2');
      expect(obj._mj__DeletedAt).toBe('date3');
      expect(obj.__mj_CreatedAt).toBeUndefined();
      expect(obj.__mj_UpdatedAt).toBeUndefined();
      expect(obj.__mj_DeletedAt).toBeUndefined();
    });
  });

  describe('ReverseMapFields', () => {
    it('should reverse map _mj__ fields in object', () => {
      const obj: Record<string, unknown> = {
        ID: '123',
        _mj__CreatedAt: '2024-01-01',
        _mj__UpdatedAt: '2024-01-02',
      };

      const result = mapper.ReverseMapFields(obj);

      expect(result).toBe(obj); // Mutates in place
      expect(obj.__mj_CreatedAt).toBe('2024-01-01');
      expect(obj.__mj_UpdatedAt).toBe('2024-01-02');
      expect(obj._mj__CreatedAt).toBeUndefined();
      expect(obj._mj__UpdatedAt).toBeUndefined();
    });

    it('should handle object with no reverse-mappable fields', () => {
      const obj: Record<string, unknown> = { ID: '123', Name: 'Test' };
      mapper.ReverseMapFields(obj);
      expect(obj.ID).toBe('123');
      expect(obj.Name).toBe('Test');
    });

    it('should handle empty object', () => {
      const obj: Record<string, unknown> = {};
      const result = mapper.ReverseMapFields(obj);
      expect(result).toEqual({});
    });

    it('should reverse map all three _mj__ fields', () => {
      const obj: Record<string, unknown> = {
        _mj__CreatedAt: 'date1',
        _mj__UpdatedAt: 'date2',
        _mj__DeletedAt: 'date3',
      };

      mapper.ReverseMapFields(obj);

      expect(obj.__mj_CreatedAt).toBe('date1');
      expect(obj.__mj_UpdatedAt).toBe('date2');
      expect(obj.__mj_DeletedAt).toBe('date3');
    });
  });

  describe('round-trip mapping', () => {
    it('should preserve data through MapFields then ReverseMapFields', () => {
      const original: Record<string, unknown> = {
        ID: '123',
        Name: 'Test',
        __mj_CreatedAt: '2024-01-01',
        __mj_UpdatedAt: '2024-01-02',
        __mj_DeletedAt: null,
      };

      // First map forward
      mapper.MapFields(original);
      expect(original._mj__CreatedAt).toBe('2024-01-01');

      // Then reverse map back
      mapper.ReverseMapFields(original);
      expect(original.__mj_CreatedAt).toBe('2024-01-01');
      expect(original.__mj_UpdatedAt).toBe('2024-01-02');
      expect(original.__mj_DeletedAt).toBeNull();
    });
  });
});
