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
  });
});
