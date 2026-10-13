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
      /** A template double: its rendered content is its first content row (the real selection is tested in MJCoreEntities). */
      class Tpl {
        public Content: Row[] = [];
        public Params: Row[] = [];
        constructor(public ID: string) {}
        GetHighestPriorityContent(): Row | undefined { return this.Content[0]; }
      }
      const engine = new TemplateEngineBase();
      const templates: Tpl[] = [new Tpl('AAA'), new Tpl('bbb'), new Tpl('ccc')];
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
      // O(1) lookups by ID, in any case, rebuilt with the associations
      expect(engine.FindTemplateByID('aaa')).toBe(templates[0]);
      expect(engine.FindTemplateByID('BBB')).toBe(templates[1]);
      expect(engine.FindTemplateByID('zzz')).toBeUndefined();
      // the rendered content is the template's own first content row (c1), the same object
      expect(engine.FindRenderedContent('AAA')).toBe(templates[0].Content[0]);
      expect(engine.FindRenderedContent('ccc')).toBeUndefined();
    });
  });
});
