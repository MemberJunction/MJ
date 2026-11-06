import { describe, it, expect, vi } from 'vitest';

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

    it('attaches each template its own content and params, the same on every rebuild', async () => {
      type Row = { TemplateID: string; Name: string };
      type Tpl = { ID: string; Content: Row[]; Params: Row[] };
      const engine = new TemplateEngineBase();
      const templates: Tpl[] = [
        { ID: 'AAA', Content: [], Params: [] },
        { ID: 'bbb', Content: [], Params: [] },
      ];
      (engine as unknown as { _metadata: Record<string, unknown[]> })._metadata = {
        Templates: templates,
        TemplateContents: [{ TemplateID: 'aaa', Name: 'c1' }, { TemplateID: 'BBB', Name: 'c2' }, { TemplateID: 'aaa', Name: 'c3' }],
        TemplateParams: [{ TemplateID: 'bbb', Name: 'p1' }],
        TemplateContentTypes: [],
        TemplateCategories: [],
      };
      const rebuild = () => (engine as unknown as { AdditionalLoading: () => Promise<void> }).AdditionalLoading();

      await rebuild();
      await rebuild();

      expect(templates[0].Content.map(c => c.Name)).toEqual(['c1', 'c3']);
      expect(templates[0].Params).toEqual([]);
      expect(templates[1].Content.map(c => c.Name)).toEqual(['c2']);
      expect(templates[1].Params.map(p => p.Name)).toEqual(['p1']);
    });

    it('returns empty arrays and completes AdditionalLoading cleanly when _metadata is not populated (permission-constrained user, MJ#6106)', async () => {
      const engine = new TemplateEngineBase();
      const rebuild = () => (engine as unknown as { AdditionalLoading: () => Promise<void> }).AdditionalLoading();

      await expect(rebuild()).resolves.toBeUndefined();
      expect(engine.Templates).toEqual([]);
      expect(engine.TemplateContentTypes).toEqual([]);
      expect(engine.TemplateCategories).toEqual([]);
      expect(engine.TemplateContents).toEqual([]);
      expect(engine.TemplateParams).toEqual([]);
      expect(engine.FindTemplateByID('any-id')).toBeUndefined();
      expect(engine.FindTemplate('any-name')).toBeUndefined();
    });

    it('declares constituent template entities on its dataset config so BaseEngine.CheckPermissionsOrSkipAll can pre-check them (MJ#6106)', async () => {
      const engine = new TemplateEngineBase();
      let capturedConfigs: Array<{ Type?: string; DatasetName?: string; Entities?: string[] }> = [];
      (engine as unknown as { Load: (configs: typeof capturedConfigs) => Promise<void> }).Load = async (configs) => {
        capturedConfigs = configs;
      };

      await engine.Config(false);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].Type).toBe('dataset');
      expect(capturedConfigs[0].DatasetName).toBe('Template_Metadata');
      expect(capturedConfigs[0].Entities).toEqual([
        'MJ: Template Content Types',
        'MJ: Template Categories',
        'MJ: Templates',
        'MJ: Template Contents',
        'MJ: Template Params',
      ]);
    });
  });

  /**
   * Every accessor on the engine reads through `_metadata`, which only exists once
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
      // together rather than shipping an unprotected `this._metadata.X` read.
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
