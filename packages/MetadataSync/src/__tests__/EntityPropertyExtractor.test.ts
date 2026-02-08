import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @memberjunction/core
vi.mock('@memberjunction/core', () => {
  return {
    BaseEntity: vi.fn(),
  };
});

import { EntityPropertyExtractor } from '../lib/EntityPropertyExtractor';

describe('EntityPropertyExtractor', () => {
  let extractor: EntityPropertyExtractor;

  beforeEach(() => {
    extractor = new EntityPropertyExtractor();
  });

  describe('extractAllProperties', () => {
    it('should extract database fields using GetAll()', () => {
      const mockRecord = {
        GetAll: vi.fn().mockReturnValue({ ID: '123', Name: 'Test', Email: 'test@example.com' }),
      };

      const result = extractor.extractAllProperties(mockRecord as never);

      expect(result.ID).toBe('123');
      expect(result.Name).toBe('Test');
      expect(result.Email).toBe('test@example.com');
    });

    it('should apply field overrides', () => {
      const mockRecord = {
        GetAll: vi.fn().mockReturnValue({ ID: '123', Name: 'Test', ParentID: 'old-value' }),
      };

      const overrides = { ParentID: 'new-parent-id' };
      const result = extractor.extractAllProperties(mockRecord as never, overrides);

      expect(result.ParentID).toBe('new-parent-id');
      expect(result.ID).toBe('123');
    });

    it('should handle records without GetAll method', () => {
      const mockRecord = {};

      const result = extractor.extractAllProperties(mockRecord as never);

      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(0);
    });

    it('should handle empty field overrides', () => {
      const mockRecord = {
        GetAll: vi.fn().mockReturnValue({ ID: '123' }),
      };

      const result = extractor.extractAllProperties(mockRecord as never, {});

      expect(result.ID).toBe('123');
    });

    it('should handle undefined field overrides', () => {
      const mockRecord = {
        GetAll: vi.fn().mockReturnValue({ ID: '123' }),
      };

      const result = extractor.extractAllProperties(mockRecord as never, undefined);

      expect(result.ID).toBe('123');
    });
  });

  describe('extractAllProperties with virtual properties', () => {
    it('should discover getter/setter properties from prototype chain', () => {
      class MockEntity {
        private _templateText = 'hello';

        GetAll() {
          return { ID: '123', Name: 'Test' };
        }

        get TemplateText(): string {
          return this._templateText;
        }

        set TemplateText(value: string) {
          this._templateText = value;
        }
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      expect(result.Name).toBe('Test');
      expect(result.TemplateText).toBe('hello');
    });

    it('should skip read-only getters (no setter)', () => {
      class MockEntity {
        GetAll() {
          return { ID: '123' };
        }

        get ComputedValue(): string {
          return 'computed';
        }
        // No setter - should be skipped
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      expect(result.ComputedValue).toBeUndefined();
    });

    it('should skip properties starting with underscore', () => {
      class MockEntity {
        private __internalProp = 'hidden';

        GetAll() {
          return { ID: '123' };
        }

        get _privateProp(): string {
          return this.__internalProp;
        }

        set _privateProp(value: string) {
          this.__internalProp = value;
        }
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      expect(result._privateProp).toBeUndefined();
    });

    it('should skip BaseEntity methods', () => {
      class MockEntity {
        GetAll() {
          return { ID: '123' };
        }

        Get(field: string) {
          return null;
        }

        Set(field: string, value: string) {
          // no-op
        }
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      // Get and Set should not appear as properties
      expect(typeof result.Get).toBe('undefined');
    });

    it('should skip constructor and common Object methods', () => {
      class MockEntity {
        GetAll() {
          return { ID: '123' };
        }
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.constructor).toBeUndefined();
      expect(result.toString).toBeUndefined();
      expect(result.valueOf).toBeUndefined();
    });

    it('should not include overridden virtual properties', () => {
      class MockEntity {
        private _value = 'original';

        GetAll() {
          return { ID: '123' };
        }

        get CustomProp(): string {
          return this._value;
        }

        set CustomProp(v: string) {
          this._value = v;
        }
      }

      const record = new MockEntity();
      const overrides = { CustomProp: 'override-value' };
      const result = extractor.extractAllProperties(record as never, overrides);

      expect(result.CustomProp).toBe('override-value');
    });

    it('should skip properties that throw errors when accessed', () => {
      class MockEntity {
        GetAll() {
          return { ID: '123' };
        }

        get BrokenProp(): string {
          throw new Error('Property access error');
        }

        set BrokenProp(_v: string) {
          // no-op
        }
      }

      const record = new MockEntity();
      // Should not throw - broken properties should be silently skipped
      const result = extractor.extractAllProperties(record as never);
      expect(result.ID).toBe('123');
      expect(result.BrokenProp).toBeUndefined();
    });

    it('should skip properties returning undefined', () => {
      class MockEntity {
        GetAll() {
          return { ID: '123' };
        }

        get UndefinedProp(): string | undefined {
          return undefined;
        }

        set UndefinedProp(_v: string | undefined) {
          // no-op
        }
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      expect('UndefinedProp' in result).toBe(false);
    });

    it('should skip properties returning functions', () => {
      class MockEntity {
        GetAll() {
          return { ID: '123' };
        }

        get FuncProp() {
          return () => 'not a value';
        }

        set FuncProp(_v: unknown) {
          // no-op
        }
      }

      const record = new MockEntity();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      expect(result.FuncProp).toBeUndefined();
    });
  });

  describe('prototype chain walking', () => {
    it('should discover properties from parent classes', () => {
      class BaseClass {
        private _baseProp = 'base';

        GetAll() {
          return { ID: '123' };
        }

        get BaseProp(): string {
          return this._baseProp;
        }

        set BaseProp(v: string) {
          this._baseProp = v;
        }
      }

      class ChildClass extends BaseClass {
        private _childProp = 'child';

        get ChildProp(): string {
          return this._childProp;
        }

        set ChildProp(v: string) {
          this._childProp = v;
        }
      }

      const record = new ChildClass();
      const result = extractor.extractAllProperties(record as never);

      expect(result.ID).toBe('123');
      expect(result.ChildProp).toBe('child');
      expect(result.BaseProp).toBe('base');
    });

    it('should not duplicate properties found at multiple prototype levels', () => {
      class BaseClass {
        private _prop = 'base';

        GetAll() {
          return { ID: '123' };
        }

        get SharedProp(): string {
          return this._prop;
        }

        set SharedProp(v: string) {
          this._prop = v;
        }
      }

      class ChildClass extends BaseClass {
        // Override of the same property
        override get SharedProp(): string {
          return 'child-override';
        }

        override set SharedProp(v: string) {
          // Override
        }
      }

      const record = new ChildClass();
      const result = extractor.extractAllProperties(record as never);

      // SharedProp should only appear once with the child's value
      expect(result.SharedProp).toBe('child-override');
    });
  });
});
