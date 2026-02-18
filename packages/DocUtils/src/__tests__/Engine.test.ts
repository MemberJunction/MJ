import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('jsdom', () => ({
  JSDOM: class {
    window: { document: { querySelector: () => ({ innerHTML: '<p>test content</p>' }) } };
    constructor() {
      this.window = {
        document: {
          querySelector: () => ({ innerHTML: '<p>test content</p>' }),
        },
      };
    }
  },
}));

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    protected async Load() {}
    static getInstance<T>(): T {
      return new (this as unknown as new () => T)();
    }
  },
  BaseEntity: class {},
  LogError: vi.fn(),
  UserInfo: class {},
  IMetadataProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJLibraryEntity: class {
    ID = '';
    Name = '';
  },
  MJLibraryItemEntity: class {
    ID = '';
    Name = '';
    Type = '';
    LibraryID = '';
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: Function) => {},
}));

import { LibraryItemEntityExtended, LibraryEntityExtended, DocumentationEngine } from '../Engine';

describe('DocUtils', () => {
  describe('LibraryItemEntityExtended', () => {
    it('should return correct URL segment for Class type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Class', writable: true });
      expect(item.TypeURLSegment).toBe('classes');
    });

    it('should return correct URL segment for Interface type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Interface', writable: true });
      expect(item.TypeURLSegment).toBe('interfaces');
    });

    it('should return correct URL segment for Function type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Function', writable: true });
      expect(item.TypeURLSegment).toBe('functions');
    });

    it('should return correct URL segment for Module type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Module', writable: true });
      expect(item.TypeURLSegment).toBe('modules');
    });

    it('should return correct URL segment for Type type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Type', writable: true });
      expect(item.TypeURLSegment).toBe('types');
    });

    it('should return correct URL segment for Variable type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Variable', writable: true });
      expect(item.TypeURLSegment).toBe('variables');
    });

    it('should throw for unknown type', () => {
      const item = new LibraryItemEntityExtended();
      Object.defineProperty(item, 'Type', { value: 'Unknown', writable: true });
      expect(() => item.TypeURLSegment).toThrow('Unknown type Unknown');
    });
  });

  describe('LibraryEntityExtended', () => {
    it('should have an empty Items array initially', () => {
      const lib = new LibraryEntityExtended();
      expect(lib.Items).toEqual([]);
    });
  });

  describe('DocumentationEngine', () => {
    it('should be a constructible class', () => {
      const engine = new DocumentationEngine();
      expect(engine).toBeDefined();
    });

    it('should have Libraries getter returning empty array before Config', () => {
      const engine = new DocumentationEngine();
      expect(engine.Libraries).toEqual([]);
    });

    it('should have LibraryItems getter returning empty array before Config', () => {
      const engine = new DocumentationEngine();
      expect(engine.LibraryItems).toEqual([]);
    });
  });
});
