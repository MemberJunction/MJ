import { describe, it, expect, beforeEach } from 'vitest';
import { JSONValidator } from '../JSONValidator';
import { ValidationErrorType } from '../ValidationTypes';

/**
 * Tests for JSONValidator — validates data objects against template objects whose
 * keys carry validation suffixes (`?`, `*`, `:rule`). Covers the presence contract,
 * each rule family (type / array-length / !empty), nested recursion, schema-string
 * parsing, and the cleanValidationSyntax helper.
 */
describe('JSONValidator', () => {
  let validator: JSONValidator;

  beforeEach(() => {
    validator = new JSONValidator();
  });

  // ---------------------------------------------------------------
  // Field presence
  // ---------------------------------------------------------------
  describe('field presence', () => {
    it('should pass when a required field is present', () => {
      const r = validator.validate({ name: 'Jane' }, { name: 'x' });
      expect(r.Success).toBe(true);
      expect(r.Errors).toHaveLength(0);
    });

    it('should fail when a required field is missing', () => {
      const r = validator.validate({}, { name: 'x' });
      expect(r.Success).toBe(false);
      expect(r.Errors).toHaveLength(1);
      expect(r.Errors[0].Source).toBe('name');
      expect(r.Errors[0].Message).toBe("Required field 'name' is missing");
      expect(r.Errors[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('should pass when an optional field (?) is missing', () => {
      const r = validator.validate({}, { 'email?': 'x' });
      expect(r.Success).toBe(true);
    });

    it('should validate an optional field when it is present', () => {
      const r = validator.validate({ tags: ['a'] }, { 'tags:[1+]?': [] });
      expect(r.Success).toBe(true);
    });

    it('should skip missing-with-rule optional fields without error', () => {
      const r = validator.validate({}, { 'tags:[1+]?': [] });
      expect(r.Success).toBe(true);
    });

    it('SURPRISING: a wildcard field (*) that is MISSING produces no error, despite the docblock calling it "required"', () => {
      // parseFieldKey marks it wildcard, and the required-presence check is skipped for wildcards,
      // so an absent wildcard field passes. Documenting current behavior.
      const r = validator.validate({}, { 'settings*': {} });
      expect(r.Success).toBe(true);
    });

    it('should skip content validation for a wildcard field that is present', () => {
      const r = validator.validate({ settings: 12345 }, { 'settings*': {} });
      expect(r.Success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Type rules
  // ---------------------------------------------------------------
  describe('type rules', () => {
    it('should accept a matching number', () => {
      expect(validator.validate({ age: 30 }, { 'age:number': 0 }).Success).toBe(true);
    });

    it('should reject a string where a number is required', () => {
      const r = validator.validate({ age: '30' }, { 'age:number': 0 });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Expected number but got string');
    });

    it('should reject NaN as a number', () => {
      const r = validator.validate({ age: NaN }, { 'age:number': 0 });
      expect(r.Success).toBe(false);
    });

    it('should validate string / boolean / array / object types', () => {
      expect(validator.validate({ s: 'x' }, { 's:string': '' }).Success).toBe(true);
      expect(validator.validate({ b: true }, { 'b:boolean': false }).Success).toBe(true);
      expect(validator.validate({ a: [1] }, { 'a:array': [] }).Success).toBe(true);
      expect(validator.validate({ o: { k: 1 } }, { 'o:object': {} }).Success).toBe(true);
    });

    it('should treat an array as NOT an object for the object type rule', () => {
      const r = validator.validate({ o: [1, 2] }, { 'o:object': {} });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Expected object but got array');
    });
  });

  // ---------------------------------------------------------------
  // Array-length rules
  // ---------------------------------------------------------------
  describe('array-length rules', () => {
    it('should enforce minimum length [N+]', () => {
      expect(validator.validate({ tags: ['a'] }, { 'tags:[1+]': [] }).Success).toBe(true);
      const r = validator.validate({ tags: [] }, { 'tags:[1+]': [] });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Array must have at least 1 element, but has 0');
    });

    it('should enforce a range [N-M]', () => {
      expect(validator.validate({ tags: ['a', 'b'] }, { 'tags:[2-3]': [] }).Success).toBe(true);
      const r = validator.validate({ tags: ['a'] }, { 'tags:[2-3]': [] });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Array must have between 2 and 3 elements, but has 1');
    });

    it('should enforce an exact length [=N]', () => {
      expect(validator.validate({ tags: ['a', 'b'] }, { 'tags:[=2]': [] }).Success).toBe(true);
      const r = validator.validate({ tags: ['a'] }, { 'tags:[=2]': [] });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Array must have exactly 2 elements, but has 1');
    });

    it('should reject a non-array value under an array-length rule', () => {
      const r = validator.validate({ tags: 'nope' }, { 'tags:[1+]': [] });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Array length validation requires an array, but got string');
    });

    it('should pluralize the singular element message correctly', () => {
      // "1 element" (singular) vs "2 elements" (plural)
      const single = validator.validate({ tags: [] }, { 'tags:[1+]': [] });
      expect(single.Errors[0].Message).toContain('at least 1 element,');
      const multi = validator.validate({ tags: ['a'] }, { 'tags:[=2]': [] });
      expect(multi.Errors[0].Message).toContain('exactly 2 elements,');
    });
  });

  // ---------------------------------------------------------------
  // !empty rule
  // ---------------------------------------------------------------
  describe('!empty rule', () => {
    it('should reject an empty / whitespace-only string', () => {
      expect(validator.validate({ s: '' }, { 's:!empty': '' }).Success).toBe(false);
      expect(validator.validate({ s: '   ' }, { 's:!empty': '' }).Success).toBe(false);
    });

    it('should reject an empty array and empty object', () => {
      expect(validator.validate({ s: [] }, { 's:!empty': [] }).Success).toBe(false);
      expect(validator.validate({ s: {} }, { 's:!empty': {} }).Success).toBe(false);
    });

    it('should accept a non-empty value', () => {
      expect(validator.validate({ s: 'x' }, { 's:!empty': '' }).Success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Multiple rules on one field
  // ---------------------------------------------------------------
  describe('multiple rules', () => {
    it('should apply combined type + array-length rules', () => {
      expect(validator.validate({ tags: ['a', 'b'] }, { 'tags:array:[2+]': [] }).Success).toBe(true);
      expect(validator.validate({ tags: ['a'] }, { 'tags:array:[2+]': [] }).Success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Nested objects
  // ---------------------------------------------------------------
  describe('nested objects', () => {
    it('should recurse into nested template objects and report the nested path', () => {
      const r = validator.validate({ cfg: {} }, { cfg: { enabled: true } });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Source).toBe('cfg.enabled');
      expect(r.Errors[0].Message).toBe("Required field 'enabled' is missing");
    });

    it('should pass when nested required fields are present', () => {
      const r = validator.validate({ cfg: { enabled: true } }, { cfg: { enabled: true } });
      expect(r.Success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Structural mismatches
  // ---------------------------------------------------------------
  describe('structural mismatches', () => {
    it('should fail when data is a primitive but template is an object', () => {
      const r = validator.validate('a string', { name: 'x' });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Source).toBe('root');
      expect(r.Errors[0].Message).toBe('Expected object but got string');
    });

    it('should fail when data is an array but template is an object', () => {
      const r = validator.validate([1, 2], { name: 'x' });
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Message).toBe('Expected object but got array');
    });

    it('should pass trivially when the template is not an object', () => {
      // Non-object templates impose no structural constraints.
      expect(validator.validate({ anything: true }, 'not-a-template').Success).toBe(true);
      expect(validator.validate(42, 7).Success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // validateAgainstSchema
  // ---------------------------------------------------------------
  describe('validateAgainstSchema', () => {
    it('should parse a JSON schema string and validate against it', () => {
      const r = validator.validateAgainstSchema({ name: 'a' }, JSON.stringify({ name: 'x' }));
      expect(r.Success).toBe(true);
    });

    it('should report a parse failure for invalid JSON schema', () => {
      const r = validator.validateAgainstSchema({}, '{ not valid json');
      expect(r.Success).toBe(false);
      expect(r.Errors[0].Source).toBe('schema');
      expect(r.Errors[0].Message).toContain('Invalid JSON schema');
    });
  });

  // ---------------------------------------------------------------
  // cleanValidationSyntax
  // ---------------------------------------------------------------
  describe('cleanValidationSyntax', () => {
    interface CleanShape {
      name: string;
      items: string[];
      config: { enabled: boolean };
    }

    it('should strip ?, *, and :rule suffixes from keys recursively', () => {
      const dirty = {
        'name?': 'John',
        'items:[1+]': ['a'],
        'config*': { 'enabled?': true },
      };
      const clean = validator.cleanValidationSyntax<CleanShape>(dirty);
      expect(clean).toEqual({ name: 'John', items: ['a'], config: { enabled: true } });
    });

    it('should clean keys inside array elements', () => {
      const clean = validator.cleanValidationSyntax<Array<Record<string, number>>>([
        { 'a?': 1 },
        { 'b:number': 2 },
      ]);
      expect(clean).toEqual([{ a: 1 }, { b: 2 }]);
    });

    it('should pass primitives and null through unchanged', () => {
      expect(validator.cleanValidationSyntax<string>('hi')).toBe('hi');
      expect(validator.cleanValidationSyntax<null>(null)).toBeNull();
      expect(validator.cleanValidationSyntax<undefined>(undefined)).toBeUndefined();
    });
  });
});
