import { describe, it, expect } from 'vitest';
import {
  GetSuperclass,
  GetRootClass,
  IsSubclassOf,
  IsRootClass,
  IsDescendantClassOf,
  GetClassInheritance,
  GetFullClassHierarchy,
  IsClassConstructor,
  GetClassName,
} from '../ClassUtils';

// ---- Test class hierarchy ----

class GrandParent {
  Level = 'grandparent';
}

class Parent extends GrandParent {
  Level = 'parent';
}

class Child extends Parent {
  Level = 'child';
}

class GrandChild extends Child {
  Level = 'grandchild';
}

class Unrelated {
  Standalone = true;
}

// ---- Tests ----

describe('ClassUtils', () => {

  describe('GetSuperclass', () => {
    it('should return the immediate parent class', () => {
      expect(GetSuperclass(Child)).toBe(Parent);
    });

    it('should return the grandparent for the parent class', () => {
      expect(GetSuperclass(Parent)).toBe(GrandParent);
    });

    it('should return null for a root class', () => {
      expect(GetSuperclass(GrandParent)).toBeNull();
    });

    it('should return null for null input', () => {
      expect(GetSuperclass(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(GetSuperclass(undefined)).toBeNull();
    });

    it('should return null for a non-function input', () => {
      expect(GetSuperclass('not a class')).toBeNull();
      expect(GetSuperclass(42)).toBeNull();
    });

    it('should return the correct parent in a deep hierarchy', () => {
      expect(GetSuperclass(GrandChild)).toBe(Child);
    });
  });

  describe('GetRootClass', () => {
    it('should return the topmost user-defined class', () => {
      expect(GetRootClass(GrandChild)).toBe(GrandParent);
    });

    it('should return the class itself when it is the root', () => {
      expect(GetRootClass(GrandParent)).toBe(GrandParent);
    });

    it('should handle a two-level hierarchy', () => {
      expect(GetRootClass(Parent)).toBe(GrandParent);
    });

    it('should return the input for null', () => {
      expect(GetRootClass(null)).toBeNull();
    });

    it('should return the input for non-function', () => {
      expect(GetRootClass(123)).toBe(123);
    });

    it('should return a standalone class as its own root', () => {
      expect(GetRootClass(Unrelated)).toBe(Unrelated);
    });
  });

  describe('IsSubclassOf', () => {
    it('should return true for direct subclass', () => {
      expect(IsSubclassOf(Child, Parent)).toBe(true);
    });

    it('should return true for indirect subclass', () => {
      expect(IsSubclassOf(GrandChild, GrandParent)).toBe(true);
    });

    it('should return false when classes are the same', () => {
      expect(IsSubclassOf(Parent, Parent)).toBe(false);
    });

    it('should return false for unrelated classes', () => {
      expect(IsSubclassOf(Unrelated, GrandParent)).toBe(false);
    });

    it('should return false when parent-child is reversed', () => {
      expect(IsSubclassOf(GrandParent, GrandChild)).toBe(false);
    });

    it('should return false for null inputs', () => {
      expect(IsSubclassOf(null, Parent)).toBe(false);
      expect(IsSubclassOf(Child, null)).toBe(false);
      expect(IsSubclassOf(null, null)).toBe(false);
    });

    it('should return false for non-function inputs', () => {
      expect(IsSubclassOf('string', Parent)).toBe(false);
      expect(IsSubclassOf(Child, 42)).toBe(false);
    });

    it('should detect subclass across multiple levels', () => {
      expect(IsSubclassOf(GrandChild, Parent)).toBe(true);
      expect(IsSubclassOf(GrandChild, GrandParent)).toBe(true);
    });
  });

  describe('IsDescendantClassOf', () => {
    it('should behave identically to IsSubclassOf', () => {
      expect(IsDescendantClassOf(Child, Parent)).toBe(IsSubclassOf(Child, Parent));
      expect(IsDescendantClassOf(Parent, Parent)).toBe(IsSubclassOf(Parent, Parent));
      expect(IsDescendantClassOf(Unrelated, Parent)).toBe(IsSubclassOf(Unrelated, Parent));
    });
  });

  describe('IsRootClass', () => {
    it('should return true for a root class', () => {
      expect(IsRootClass(GrandParent)).toBe(true);
    });

    it('should return true for a standalone class', () => {
      expect(IsRootClass(Unrelated)).toBe(true);
    });

    it('should return false for a subclass', () => {
      expect(IsRootClass(Child)).toBe(false);
    });

    it('should return false for a deeply nested class', () => {
      expect(IsRootClass(GrandChild)).toBe(false);
    });

    it('should return false for null', () => {
      expect(IsRootClass(null)).toBe(false);
    });

    it('should return false for non-function input', () => {
      expect(IsRootClass(42)).toBe(false);
      expect(IsRootClass('not a class')).toBe(false);
    });
  });

  describe('GetClassInheritance', () => {
    it('should return chain from immediate parent to root for a deep class', () => {
      const chain = GetClassInheritance(GrandChild);
      expect(chain.length).toBe(3); // Child, Parent, GrandParent
      expect(chain[0].name).toBe('Child');
      expect(chain[0].reference).toBe(Child);
      expect(chain[1].name).toBe('Parent');
      expect(chain[1].reference).toBe(Parent);
      expect(chain[2].name).toBe('GrandParent');
      expect(chain[2].reference).toBe(GrandParent);
    });

    it('should return single-entry chain for a direct subclass', () => {
      const chain = GetClassInheritance(Parent);
      expect(chain.length).toBe(1);
      expect(chain[0].name).toBe('GrandParent');
    });

    it('should return empty chain for a root class', () => {
      const chain = GetClassInheritance(GrandParent);
      expect(chain.length).toBe(0);
    });

    it('should return empty chain for null input', () => {
      expect(GetClassInheritance(null)).toEqual([]);
    });

    it('should return empty chain for non-function input', () => {
      expect(GetClassInheritance('string')).toEqual([]);
    });

    it('should NOT include the class itself', () => {
      const chain = GetClassInheritance(Child);
      const names = chain.map(c => c.name);
      expect(names).not.toContain('Child');
    });
  });

  describe('GetFullClassHierarchy', () => {
    it('should include the class itself first, then ancestors', () => {
      const hierarchy = GetFullClassHierarchy(GrandChild);
      expect(hierarchy.length).toBe(4); // GrandChild, Child, Parent, GrandParent
      expect(hierarchy[0].name).toBe('GrandChild');
      expect(hierarchy[0].reference).toBe(GrandChild);
      expect(hierarchy[1].name).toBe('Child');
      expect(hierarchy[2].name).toBe('Parent');
      expect(hierarchy[3].name).toBe('GrandParent');
    });

    it('should return single entry for a root class', () => {
      const hierarchy = GetFullClassHierarchy(GrandParent);
      expect(hierarchy.length).toBe(1);
      expect(hierarchy[0].name).toBe('GrandParent');
    });

    it('should return empty array for null input', () => {
      expect(GetFullClassHierarchy(null)).toEqual([]);
    });

    it('should return empty array for non-function input', () => {
      expect(GetFullClassHierarchy(42)).toEqual([]);
    });

    it('should return single entry for a standalone class', () => {
      const hierarchy = GetFullClassHierarchy(Unrelated);
      expect(hierarchy.length).toBe(1);
      expect(hierarchy[0].name).toBe('Unrelated');
    });
  });

  describe('IsClassConstructor', () => {
    it('should return true for a class', () => {
      expect(IsClassConstructor(GrandParent)).toBe(true);
    });

    it('should return true for a subclass', () => {
      expect(IsClassConstructor(Child)).toBe(true);
    });

    it('should return false for a non-function', () => {
      expect(IsClassConstructor('string')).toBe(false);
      expect(IsClassConstructor(42)).toBe(false);
      expect(IsClassConstructor(null)).toBe(false);
      expect(IsClassConstructor(undefined)).toBe(false);
    });

    it('should return false for an arrow function', () => {
      const arrowFn = () => 'hello';
      expect(IsClassConstructor(arrowFn)).toBe(false);
    });

    it('should return true for a standalone class', () => {
      expect(IsClassConstructor(Unrelated)).toBe(true);
    });
  });

  describe('GetClassName', () => {
    it('should return the class name for a named class', () => {
      expect(GetClassName(GrandParent)).toBe('GrandParent');
      expect(GetClassName(Child)).toBe('Child');
      expect(GetClassName(Unrelated)).toBe('Unrelated');
    });

    it('should return "Unknown" for null input', () => {
      expect(GetClassName(null)).toBe('Unknown');
    });

    it('should return "Unknown" for undefined input', () => {
      expect(GetClassName(undefined)).toBe('Unknown');
    });

    it('should return "Unknown" for non-function input', () => {
      expect(GetClassName(42)).toBe('Unknown');
      expect(GetClassName('string')).toBe('Unknown');
    });

    it('should handle anonymous class expression', () => {
      const AnonClass = class {};
      const name = GetClassName(AnonClass);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });
});
