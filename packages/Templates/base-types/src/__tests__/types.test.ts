import { describe, it, expect } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    protected async Load() {}
    static getInstance<T>(): T {
      return new (this as unknown as new () => T)();
    }
  },
  UserInfo: class {},
  IMetadataProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJTemplateCategoryEntity: class {},
  MJTemplateContentEntity: class { TemplateID = ''; },
  MJTemplateContentTypeEntity: class {},
  MJTemplateEntityExtended: class {
    ID = '';
    Name = '';
    Content: unknown[] = [];
    Params: unknown[] = [];
  },
  MJTemplateParamEntity: class { TemplateID = ''; },
}));

import { TemplateRenderResult } from '../types';
import { TemplateEngineBase } from '../TemplateEngineBase';

describe('Templates/base-types exports', () => {
  describe('TemplateRenderResult', () => {
    it('should allow creating a success result', () => {
      const result = new TemplateRenderResult();
      result.Success = true;
      result.Output = '<h1>Hello</h1>';
      expect(result.Success).toBe(true);
      expect(result.Output).toBe('<h1>Hello</h1>');
    });

    it('should allow creating a failure result with message', () => {
      const result = new TemplateRenderResult();
      result.Success = false;
      result.Output = '';
      result.Message = 'Template rendering failed';
      expect(result.Success).toBe(false);
      expect(result.Message).toBe('Template rendering failed');
    });
  });

  describe('TemplateEngineBase', () => {
    it('should be a class that can be instantiated', () => {
      const engine = new TemplateEngineBase();
      expect(engine).toBeDefined();
    });

    it('should have a FindTemplate method', () => {
      expect(typeof TemplateEngineBase.prototype.FindTemplate).toBe('function');
    });
  });

  /**
   * Every accessor on the engine reads through `_Metadata`, which only exists once
   * Config() has loaded the Template_Metadata dataset. An engine that was never
   * configured — or one reached while the cache is still warming — used to throw a
   * TypeError straight out of a property read, which took down the very form the error
   * message told the user to open. An empty array is the honest answer to "what is
   * cached?" when nothing is cached yet.
   *
   * Completeness is asserted by SWEEPING the prototype rather than by listing names, so
   * a newly added accessor of the same shape is covered the day it lands.
   */
  describe('TemplateEngineBase — unwarmed cache', () => {
    const knownAccessors = [
      'TemplateCategories',
      'TemplateContentTypes',
      'TemplateContents',
      'TemplateParams',
      'Templates',
    ] as const;

    /** Every getter declared on the engine's own prototype. */
    function prototypeGetters(): string[] {
      return Object.getOwnPropertyNames(TemplateEngineBase.prototype)
        .filter((name) => Object.getOwnPropertyDescriptor(TemplateEngineBase.prototype, name)?.get != null)
        .sort();
    }

    it('exposes exactly the accessors this suite knows about', () => {
      // Tripwire: if this fails, a new accessor landed — extend the guard and this list
      // together rather than shipping an unprotected `this._Metadata.X` read.
      expect(prototypeGetters()).toEqual([...knownAccessors].sort());
    });

    it('has no accessor that throws on an engine whose cache was never warmed', () => {
      const engine = new TemplateEngineBase();

      for (const name of prototypeGetters()) {
        expect(() => (engine as unknown as Record<string, unknown>)[name], `${name} threw`).not.toThrow();
      }
    });

    it.each(knownAccessors)('returns an empty array from %s instead of throwing', (accessor) => {
      const engine = new TemplateEngineBase();

      expect(() => (engine as unknown as Record<string, unknown>)[accessor]).not.toThrow();
      expect((engine as unknown as Record<string, unknown>)[accessor]).toEqual([]);
    });

    it('lets FindTemplate answer "not found" rather than crash on an unwarmed engine', () => {
      const engine = new TemplateEngineBase();

      expect(() => engine.FindTemplate('anything')).not.toThrow();
      expect(engine.FindTemplate('anything')).toBeUndefined();
    });
  });
});
