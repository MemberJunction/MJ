/**
 * Tests for PropValueExtractor
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { PropValueExtractor } from './prop-value-extractor';

/**
 * Helper to parse JSX and extract the first JSX attribute
 */
function parseJSXAttribute(jsx: string): t.JSXAttribute {
  const ast = parse(`const el = ${jsx}`, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  const variableDeclaration = ast.program.body[0] as t.VariableDeclaration;
  const declarator = variableDeclaration.declarations[0];
  const jsxElement = declarator.init as t.JSXElement;
  const attribute = jsxElement.openingElement.attributes[0] as t.JSXAttribute;

  return attribute;
}

describe('PropValueExtractor', () => {
  describe('extract()', () => {
    describe('Boolean shorthand', () => {
      it('should extract true for boolean shorthand', () => {
        const attr = parseJSXAttribute('<Component show />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(true);
      });
    });

    describe('String literals', () => {
      it('should extract string from string literal prop', () => {
        const attr = parseJSXAttribute('<Component name="test" />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('test');
      });

      it('should extract string from JSX expression container', () => {
        const attr = parseJSXAttribute('<Component name={"test"} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('test');
      });

      it('should handle empty string', () => {
        const attr = parseJSXAttribute('<Component name="" />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('');
      });
    });

    describe('Numeric literals', () => {
      it('should extract number', () => {
        const attr = parseJSXAttribute('<Component count={42} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(42);
      });

      it('should extract negative number', () => {
        const attr = parseJSXAttribute('<Component count={-5} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(-5);
      });

      it('should extract decimal number', () => {
        const attr = parseJSXAttribute('<Component value={3.14} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(3.14);
      });

      it('should extract zero', () => {
        const attr = parseJSXAttribute('<Component count={0} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(0);
      });
    });

    describe('Boolean literals', () => {
      it('should extract true', () => {
        const attr = parseJSXAttribute('<Component enabled={true} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(true);
      });

      it('should extract false', () => {
        const attr = parseJSXAttribute('<Component enabled={false} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(false);
      });

      it('should extract negated boolean', () => {
        const attr = parseJSXAttribute('<Component disabled={!true} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(false);
      });
    });

    describe('Null literal', () => {
      it('should extract null', () => {
        const attr = parseJSXAttribute('<Component value={null} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(null);
      });
    });

    describe('Array expressions', () => {
      it('should extract array of strings', () => {
        const attr = parseJSXAttribute('<Component items={["a", "b", "c"]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual(['a', 'b', 'c']);
      });

      it('should extract array of numbers', () => {
        const attr = parseJSXAttribute('<Component values={[1, 2, 3]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual([1, 2, 3]);
      });

      it('should extract mixed array', () => {
        const attr = parseJSXAttribute('<Component data={["text", 42, true, null]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual(['text', 42, true, null]);
      });

      it('should extract empty array', () => {
        const attr = parseJSXAttribute('<Component items={[]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual([]);
      });

      it('should handle nested arrays', () => {
        const attr = parseJSXAttribute('<Component matrix={[[1, 2], [3, 4]]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual([[1, 2], [3, 4]]);
      });

      it('should mark spread elements as dynamic', () => {
        const attr = parseJSXAttribute('<Component items={["a", ...others]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual(['a', { _type: 'expression', description: 'spread element' }]);
      });

      it('should handle sparse arrays', () => {
        const attr = parseJSXAttribute('<Component items={[1, , 3]} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual([1, undefined, 3]);
      });
    });

    describe('Object expressions', () => {
      it('should extract simple object', () => {
        const attr = parseJSXAttribute('<Component config={{ name: "test", count: 5 }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual({ name: 'test', count: 5 });
      });

      it('should extract nested object', () => {
        const attr = parseJSXAttribute('<Component data={{ user: { name: "John", age: 30 } }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual({ user: { name: 'John', age: 30 } });
      });

      it('should extract object with various types', () => {
        const attr = parseJSXAttribute('<Component config={{ str: "text", num: 42, bool: true, nil: null }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual({ str: 'text', num: 42, bool: true, nil: null });
      });

      it('should mark spread properties as dynamic', () => {
        const attr = parseJSXAttribute('<Component config={{ name: "test", ...rest }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toMatchObject({
          name: 'test',
          '...': { _type: 'expression', description: 'spread property' },
        });
      });

      it('should handle string literal keys', () => {
        const attr = parseJSXAttribute('<Component config={{ "with-dash": 1, "normal": 2 }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual({ 'with-dash': 1, normal: 2 });
      });

      it('should handle numeric keys', () => {
        const attr = parseJSXAttribute('<Component config={{ 0: "zero", 1: "one" }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toEqual({ '0': 'zero', '1': 'one' });
      });

      it('should mark object methods as dynamic', () => {
        const attr = parseJSXAttribute('<Component config={{ getValue() { return 42; } }} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toMatchObject({
          getValue: { _type: 'expression', description: 'object method' },
        });
      });
    });

    describe('Template literals', () => {
      it('should extract static template literal', () => {
        const attr = parseJSXAttribute('<Component text={`hello world`} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('hello world');
      });

      it('should extract template literal with static expressions', () => {
        const attr = parseJSXAttribute('<Component text={`Count: ${5 + 3}`} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('Count: 8');
      });

      it('should mark template literal with dynamic expressions as dynamic', () => {
        const attr = parseJSXAttribute('<Component text={`Hello ${userName}`} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
        expect(value).toMatchObject({ _type: 'expression' });
      });
    });

    describe('Unary expressions', () => {
      it('should compute unary minus', () => {
        const attr = parseJSXAttribute('<Component value={-42} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(-42);
      });

      it('should compute unary plus', () => {
        const attr = parseJSXAttribute('<Component value={+42} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(42);
      });

      it('should compute logical not', () => {
        const attr = parseJSXAttribute('<Component disabled={!false} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(true);
      });

      it('should compute typeof', () => {
        const attr = parseJSXAttribute('<Component type={typeof "test"} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('string');
      });

      it('should compute void', () => {
        const attr = parseJSXAttribute('<Component value={void 0} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(undefined);
      });
    });

    describe('Binary expressions', () => {
      it('should compute addition', () => {
        const attr = parseJSXAttribute('<Component value={2 + 3} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(5);
      });

      it('should compute string concatenation', () => {
        const attr = parseJSXAttribute('<Component text={"Hello" + " " + "World"} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('Hello World');
      });

      it('should compute subtraction', () => {
        const attr = parseJSXAttribute('<Component value={10 - 3} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(7);
      });

      it('should compute multiplication', () => {
        const attr = parseJSXAttribute('<Component value={4 * 5} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(20);
      });

      it('should compute division', () => {
        const attr = parseJSXAttribute('<Component value={20 / 4} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(5);
      });

      it('should compute modulo', () => {
        const attr = parseJSXAttribute('<Component value={10 % 3} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(1);
      });

      it('should compute comparison', () => {
        const attr = parseJSXAttribute('<Component valid={5 > 3} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe(true);
      });

      it('should mark binary expression with dynamic operands as dynamic', () => {
        const attr = parseJSXAttribute('<Component value={count + 5} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
      });
    });

    describe('Conditional expressions (ternary)', () => {
      it('should extract consequent when test is true', () => {
        const attr = parseJSXAttribute('<Component value={true ? "yes" : "no"} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('yes');
      });

      it('should extract alternate when test is false', () => {
        const attr = parseJSXAttribute('<Component value={false ? "yes" : "no"} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('no');
      });

      it('should compute static test condition', () => {
        const attr = parseJSXAttribute('<Component value={5 > 3 ? "greater" : "less"} />');
        const value = PropValueExtractor.extract(attr);
        expect(value).toBe('greater');
      });

      it('should mark conditional with dynamic test as dynamic', () => {
        const attr = parseJSXAttribute('<Component value={isActive ? "yes" : "no"} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
      });
    });

    describe('Dynamic values (identifiers and expressions)', () => {
      it('should mark identifier as dynamic', () => {
        const attr = parseJSXAttribute('<Component name={userName} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
        expect(value).toMatchObject({ _type: 'identifier', name: 'userName' });
      });

      it('should mark member expression as dynamic', () => {
        const attr = parseJSXAttribute('<Component name={user.name} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
        expect(value).toMatchObject({ _type: 'expression' });
      });

      it('should mark function call as dynamic', () => {
        const attr = parseJSXAttribute('<Component value={getValue()} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
        expect(value).toMatchObject({ _type: 'expression' });
      });

      it('should mark arrow function as dynamic', () => {
        const attr = parseJSXAttribute('<Component onClick={() => console.log("click")} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
        expect(value).toMatchObject({ _type: 'expression' });
      });

      it('should mark function expression as dynamic', () => {
        const attr = parseJSXAttribute('<Component onClick={function() { console.log("click"); }} />');
        const value = PropValueExtractor.extract(attr);
        expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
        expect(value).toMatchObject({ _type: 'expression' });
      });
    });
  });

  describe('isDynamicValue()', () => {
    it('should return true for identifier', () => {
      const value = { _type: 'identifier' as const, name: 'test' };
      expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
    });

    it('should return true for expression', () => {
      const value = { _type: 'expression' as const, description: 'test' };
      expect(PropValueExtractor.isDynamicValue(value)).toBe(true);
    });

    it('should return false for string', () => {
      expect(PropValueExtractor.isDynamicValue('test')).toBe(false);
    });

    it('should return false for number', () => {
      expect(PropValueExtractor.isDynamicValue(42)).toBe(false);
    });

    it('should return false for boolean', () => {
      expect(PropValueExtractor.isDynamicValue(true)).toBe(false);
    });

    it('should return false for null', () => {
      expect(PropValueExtractor.isDynamicValue(null)).toBe(false);
    });

    it('should return false for array', () => {
      expect(PropValueExtractor.isDynamicValue([1, 2, 3])).toBe(false);
    });

    it('should return false for object', () => {
      expect(PropValueExtractor.isDynamicValue({ name: 'test' })).toBe(false);
    });
  });

  describe('hasAnyDynamicValue()', () => {
    it('should return true if array contains identifier', () => {
      const arr = ['a', { _type: 'identifier' as const, name: 'test' }, 'b'];
      expect(PropValueExtractor.hasAnyDynamicValue(arr)).toBe(true);
    });

    it('should return true if nested array contains dynamic value', () => {
      const arr = [['a', 'b'], ['c', { _type: 'expression' as const }]];
      expect(PropValueExtractor.hasAnyDynamicValue(arr)).toBe(true);
    });

    it('should return false for all static values', () => {
      const arr = ['a', 42, true, null, ['nested']];
      expect(PropValueExtractor.hasAnyDynamicValue(arr)).toBe(false);
    });

    it('should return true if object in array has dynamic property', () => {
      const arr = [{ name: 'test', value: { _type: 'identifier' as const, name: 'x' } }];
      expect(PropValueExtractor.hasAnyDynamicValue(arr)).toBe(true);
    });
  });

  describe('describe()', () => {
    it('should describe string', () => {
      expect(PropValueExtractor.describe('hello')).toBe('"hello"');
    });

    it('should describe long string with ellipsis', () => {
      const longString = 'a'.repeat(60);
      const description = PropValueExtractor.describe(longString);
      expect(description).toContain('...');
      expect(description.length).toBeLessThan(longString.length + 10);
    });

    it('should describe number', () => {
      expect(PropValueExtractor.describe(42)).toBe('42');
    });

    it('should describe boolean', () => {
      expect(PropValueExtractor.describe(true)).toBe('true');
    });

    it('should describe null', () => {
      expect(PropValueExtractor.describe(null)).toBe('null');
    });

    it('should describe undefined', () => {
      expect(PropValueExtractor.describe(undefined)).toBe('undefined');
    });

    it('should describe array', () => {
      expect(PropValueExtractor.describe([1, 2, 3])).toBe('array with 3 elements');
    });

    it('should describe single-element array', () => {
      expect(PropValueExtractor.describe([1])).toBe('array with 1 element');
    });

    it('should describe object', () => {
      const description = PropValueExtractor.describe({ name: 'test', age: 30 });
      expect(description).toContain('object with 2 properties');
      expect(description).toContain('name');
      expect(description).toContain('age');
    });

    it('should describe object with many properties', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      const description = PropValueExtractor.describe(obj);
      expect(description).toContain('...');
    });

    it('should describe identifier', () => {
      const value = { _type: 'identifier' as const, name: 'userName' };
      expect(PropValueExtractor.describe(value)).toBe("identifier 'userName'");
    });

    it('should describe expression', () => {
      const value = { _type: 'expression' as const, description: 'function call' };
      expect(PropValueExtractor.describe(value)).toBe('function call');
    });

    it('should describe expression without description', () => {
      const value = { _type: 'expression' as const };
      expect(PropValueExtractor.describe(value)).toBe('dynamic expression');
    });
  });
});
