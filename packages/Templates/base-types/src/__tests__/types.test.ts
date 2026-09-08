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

    it('cache getters return empty arrays before a successful Config — never NPE', () => {
      // Regression test for the AI Prompt form crash: when the Template_Metadata
      // dataset fails to load, `_Metadata` was undefined and the getters threw
      // "Cannot read properties of undefined (reading 'TemplateContents')",
      // crashing every consumer (the AI Prompt form failed to load entirely).
      // The getters must degrade to empty arrays instead.
      const engine = new TemplateEngineBase();
      expect(() => engine.TemplateContents).not.toThrow();
      expect(engine.TemplateContents).toEqual([]);
      expect(engine.Templates).toEqual([]);
      expect(engine.TemplateContentTypes).toEqual([]);
      expect(engine.TemplateCategories).toEqual([]);
      expect(engine.TemplateParams).toEqual([]);
    });
  });
});
