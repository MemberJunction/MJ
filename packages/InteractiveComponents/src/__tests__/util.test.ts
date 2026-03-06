import { describe, it, expect } from 'vitest';

import { BuildComponentCompleteCode, BuildComponentCode } from '../util';
import { ComponentSpec } from '../component-spec';

/**
 * Helper to create a minimal ComponentSpec for testing
 */
function createSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    name: 'TestComponent',
    location: 'embedded',
    description: 'A test component',
    title: 'Test',
    type: 'chart',
    code: 'function TestComponent() { return <div>Hello</div>; }',
    functionalRequirements: '',
    technicalDesign: '',
    exampleUsage: '<TestComponent />',
    ...overrides,
  } as ComponentSpec;
}

describe('InteractiveComponents util', () => {
  describe('BuildComponentCompleteCode', () => {
    it('should return empty string when code is null/undefined', () => {
      const spec = createSpec({ code: '' });
      expect(BuildComponentCompleteCode(spec)).toBe('');
    });

    it('should return empty string when code is only whitespace', () => {
      const spec = createSpec({ code: '   ' });
      expect(BuildComponentCompleteCode(spec)).toBe('');
    });

    it('should return code directly when no dependencies', () => {
      const spec = createSpec({ dependencies: [] });
      expect(BuildComponentCompleteCode(spec)).toBe(spec.code);
    });

    it('should return code directly when dependencies is undefined', () => {
      const spec = createSpec();
      delete spec.dependencies;
      expect(BuildComponentCompleteCode(spec)).toBe(spec.code);
    });

    it('should append dependency code', () => {
      const dep = createSpec({
        name: 'ChildComponent',
        code: 'function ChildComponent() { return <span>Child</span>; }',
      });
      const spec = createSpec({ dependencies: [dep] });
      const result = BuildComponentCompleteCode(spec);
      expect(result).toContain('TestComponent');
      expect(result).toContain('ChildComponent');
    });

    it('should handle nested dependencies recursively', () => {
      const grandchild = createSpec({
        name: 'GrandchildComp',
        code: 'function GrandchildComp() { return <em>GC</em>; }',
      });
      const child = createSpec({
        name: 'ChildComp',
        code: 'function ChildComp() { return <span>Child</span>; }',
        dependencies: [grandchild],
      });
      const spec = createSpec({ dependencies: [child] });
      const result = BuildComponentCompleteCode(spec);
      expect(result).toContain('GrandchildComp');
      expect(result).toContain('ChildComp');
    });
  });

  describe('BuildComponentCode', () => {
    it('should include comment header with name and description', () => {
      const dep = createSpec({ name: 'HelperComp', description: 'Helps with things' });
      const result = BuildComponentCode(dep, '');
      expect(result).toContain('HelperComp');
      expect(result).toContain('Helps with things');
      expect(result).toContain('/***');
    });

    it('should include path in comment header when provided', () => {
      const dep = createSpec({ name: 'SubComp' });
      const result = BuildComponentCode(dep, 'Root > Parent');
      expect(result).toContain('Root > Parent > SubComp');
    });

    it('should return just the component code when no sub-dependencies', () => {
      const dep = createSpec({ name: 'LeafComp', dependencies: [] });
      const result = BuildComponentCode(dep, '');
      expect(result).toContain(dep.code);
    });
  });
});
