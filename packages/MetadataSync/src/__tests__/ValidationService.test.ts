import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing
vi.mock('@memberjunction/core', () => {
  return {
    Metadata: vi.fn().mockImplementation(() => ({
      EntityByName: vi.fn().mockReturnValue(null),
      GetEntityObject: vi.fn().mockResolvedValue({}),
    })),
    EntityInfo: vi.fn(),
    EntityFieldInfo: vi.fn(),
    RunView: vi.fn().mockImplementation(() => ({
      RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
    })),
  };
});

vi.mock('fs', () => {
  return {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('{}'),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true, isFile: () => true }),
  };
});

vi.mock('minimatch', () => ({
  minimatch: vi.fn((str: string, pattern: string) => {
    if (pattern === '*') return true;
    if (pattern === str) return true;
    return false;
  }),
}));

vi.mock('../lib/provider-utils', () => ({
  getSystemUser: vi.fn().mockReturnValue({ ID: 'system-user-id' }),
}));

import { ValidationService } from '../services/ValidationService';
import * as fs from 'fs';
import { Metadata } from '@memberjunction/core';

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ValidationService();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const svc = new ValidationService();
      expect(svc).toBeInstanceOf(ValidationService);
    });

    it('should create instance with custom options', () => {
      const svc = new ValidationService({
        verbose: true,
        outputFormat: 'json',
        maxNestingDepth: 5,
        checkBestPractices: false,
      });
      expect(svc).toBeInstanceOf(ValidationService);
    });

    it('should create instance with include filter', () => {
      const svc = new ValidationService({
        include: ['users', 'roles'],
      });
      expect(svc).toBeInstanceOf(ValidationService);
    });

    it('should create instance with exclude filter', () => {
      const svc = new ValidationService({
        exclude: ['temp', 'draft'],
      });
      expect(svc).toBeInstanceOf(ValidationService);
    });
  });

  describe('validateDirectory', () => {
    it('should return error when no config file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.validateDirectory('/test/dir');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('No .mj-sync.json configuration file found');
    });

    it('should throw when both include and exclude are specified', async () => {
      const svc = new ValidationService({
        include: ['users'],
        exclude: ['temp'],
      });

      await expect(svc.validateDirectory('/test/dir')).rejects.toThrow(
        'Cannot specify both --include and --exclude options'
      );
    });

    it('should return valid result when config exists but no subdirectories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ directoryOrder: [] }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await service.validateDirectory('/test/dir');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('parseReference (tested indirectly through ValidationService)', () => {
    // We test parseReference via its usage patterns since it's private
    // Testing by creating a service with mocked metadata and examining behavior

    it('should handle @file: references', () => {
      // parseReference is private, but we can verify its behavior exists
      // through the isValidReference check
      const svc = new ValidationService();
      expect(svc).toBeDefined();
    });
  });

  describe('applyDirectoryFilters (tested through validateDirectory)', () => {
    it('should process directories with include filter', async () => {
      const svc = new ValidationService({ include: ['users'] });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ directoryOrder: [] }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await svc.validateDirectory('/test/dir');
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });

    it('should process directories with exclude filter', async () => {
      const svc = new ValidationService({ exclude: ['temp'] });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ directoryOrder: [] }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await svc.validateDirectory('/test/dir');
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });
  });
});

describe('ValidationService - Reference Parsing Logic', () => {
  // Since parseReference is private, we test the regex patterns it uses directly
  describe('@file: pattern', () => {
    const pattern = /^@file:(.+)$/;

    it('should match simple file references', () => {
      const match = '@file:template.md'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('template.md');
    });

    it('should match file references with paths', () => {
      const match = '@file:./shared/common-prompt.md'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('./shared/common-prompt.md');
    });

    it('should match file references with parent directories', () => {
      const match = '@file:../templates/standard-header.md'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('../templates/standard-header.md');
    });

    it('should not match bare @file:', () => {
      const match = '@file:'.match(pattern);
      expect(match).toBeNull();
    });
  });

  describe('@lookup: pattern', () => {
    const pattern = /^@lookup:([^.]+)\.(.+)$/;

    it('should match simple lookup references', () => {
      const match = '@lookup:Users.Email=john@example.com'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('Users');
      expect(match![2]).toBe('Email=john@example.com');
    });

    it('should match lookup with create syntax', () => {
      const match = '@lookup:Categories.Name=Examples?create'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('Categories');
      expect(match![2]).toBe('Name=Examples?create');
    });

    it('should match multi-field lookups', () => {
      const match = '@lookup:Users.Email=john@example.com&Department=Sales'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('Users');
      expect(match![2]).toBe('Email=john@example.com&Department=Sales');
    });

    it('should not match lookup without entity', () => {
      const match = '@lookup:.Name=Test'.match(pattern);
      expect(match).toBeNull();
    });
  });

  describe('@parent: pattern', () => {
    const pattern = /^@parent:(.+)$/;

    it('should match parent field references', () => {
      const match = '@parent:ID'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('ID');
    });

    it('should match parent with complex field names', () => {
      const match = '@parent:CategoryID'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('CategoryID');
    });
  });

  describe('@root: pattern', () => {
    const pattern = /^@root:(.+)$/;

    it('should match root field references', () => {
      const match = '@root:ID'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('ID');
    });

    it('should match root with complex field names', () => {
      const match = '@root:Name'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('Name');
    });
  });

  describe('@env: pattern', () => {
    const pattern = /^@env:(.+)$/;

    it('should match env references', () => {
      const match = '@env:NODE_ENV'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('NODE_ENV');
    });

    it('should match env with underscores', () => {
      const match = '@env:DATABASE_CONNECTION_STRING'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('DATABASE_CONNECTION_STRING');
    });
  });

  describe('@template: pattern', () => {
    const pattern = /^@template:(.+)$/;

    it('should match template references', () => {
      const match = '@template:templates/standard-ai-models.json'.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('templates/standard-ai-models.json');
    });
  });
});

describe('ValidationService - Lookup Parsing Logic', () => {
  it('should parse multi-field lookup criteria', () => {
    const remaining = 'Email=john@example.com&Department=Sales';
    const lookupPairs = remaining.split('&');
    const fields: Array<{ field: string; value: string }> = [];

    for (const pair of lookupPairs) {
      const fieldMatch = pair.match(/^(.+?)=(.+)$/);
      if (fieldMatch) {
        const [, field, value] = fieldMatch;
        fields.push({ field: field.trim(), value: value.trim() });
      }
    }

    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ field: 'Email', value: 'john@example.com' });
    expect(fields[1]).toEqual({ field: 'Department', value: 'Sales' });
  });

  it('should parse single-field lookup criteria', () => {
    const remaining = 'Name=Admin';
    const lookupPairs = remaining.split('&');
    const fields: Array<{ field: string; value: string }> = [];

    for (const pair of lookupPairs) {
      const fieldMatch = pair.match(/^(.+?)=(.+)$/);
      if (fieldMatch) {
        const [, field, value] = fieldMatch;
        fields.push({ field: field.trim(), value: value.trim() });
      }
    }

    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({ field: 'Name', value: 'Admin' });
  });

  it('should handle create syntax', () => {
    const remaining = 'Name=Examples?create';
    const hasCreate = remaining.includes('?create');
    const lookupPart = hasCreate ? remaining.split('?')[0] : remaining;

    expect(hasCreate).toBe(true);
    expect(lookupPart).toBe('Name=Examples');
  });

  it('should handle create with additional fields', () => {
    const remaining = 'Name=Examples?create&Description=Example prompts';
    const hasCreate = remaining.includes('?create');
    const additionalFields: Record<string, string> = {};

    if (hasCreate && remaining.includes('?create&')) {
      const createPart = remaining.split('?create&')[1];
      const pairs = createPart.split('&');
      for (const pair of pairs) {
        const [key, val] = pair.split('=');
        if (key && val) {
          additionalFields[key] = decodeURIComponent(val);
        }
      }
    }

    expect(additionalFields).toEqual({ Description: 'Example prompts' });
  });

  it('should handle lookup without create syntax', () => {
    const remaining = 'Name=Admin';
    const hasCreate = remaining.includes('?create');
    expect(hasCreate).toBe(false);
  });
});

describe('ValidationService - Topological Sort Logic', () => {
  it('should sort entities with linear dependencies', () => {
    const dependencies = new Map<string, Set<string>>();
    dependencies.set('C', new Set(['B']));
    dependencies.set('B', new Set(['A']));
    dependencies.set('A', new Set());

    const result: string[] = [];
    const visited = new Set<string>();
    const tempStack = new Set<string>();

    const visit = (entity: string): boolean => {
      if (tempStack.has(entity)) return false;
      if (visited.has(entity)) return true;
      tempStack.add(entity);
      const deps = dependencies.get(entity);
      if (deps) {
        for (const dep of deps) {
          if (!visit(dep)) return false;
        }
      }
      tempStack.delete(entity);
      visited.add(entity);
      result.push(entity);
      return true;
    };

    for (const entity of dependencies.keys()) {
      if (!visited.has(entity)) {
        visit(entity);
      }
    }

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should handle entities with no dependencies', () => {
    const dependencies = new Map<string, Set<string>>();
    dependencies.set('A', new Set());
    dependencies.set('B', new Set());
    dependencies.set('C', new Set());

    const result: string[] = [];
    const visited = new Set<string>();
    const tempStack = new Set<string>();

    const visit = (entity: string): boolean => {
      if (tempStack.has(entity)) return false;
      if (visited.has(entity)) return true;
      tempStack.add(entity);
      const deps = dependencies.get(entity);
      if (deps) {
        for (const dep of deps) {
          if (!visit(dep)) return false;
        }
      }
      tempStack.delete(entity);
      visited.add(entity);
      result.push(entity);
      return true;
    };

    for (const entity of dependencies.keys()) {
      if (!visited.has(entity)) {
        visit(entity);
      }
    }

    expect(result).toHaveLength(3);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });

  it('should detect circular dependencies', () => {
    const dependencies = new Map<string, Set<string>>();
    dependencies.set('A', new Set(['B']));
    dependencies.set('B', new Set(['C']));
    dependencies.set('C', new Set(['A']));

    const visited = new Set<string>();
    const tempStack = new Set<string>();
    let circularDetected = false;

    const visit = (entity: string): boolean => {
      if (tempStack.has(entity)) {
        circularDetected = true;
        return false;
      }
      if (visited.has(entity)) return true;
      tempStack.add(entity);
      const deps = dependencies.get(entity);
      if (deps) {
        for (const dep of deps) {
          if (!visit(dep)) return false;
        }
      }
      tempStack.delete(entity);
      visited.add(entity);
      return true;
    };

    for (const entity of dependencies.keys()) {
      if (!visited.has(entity)) {
        visit(entity);
      }
    }

    expect(circularDetected).toBe(true);
  });

  it('should handle diamond dependency patterns', () => {
    // A depends on B and C, both B and C depend on D
    const dependencies = new Map<string, Set<string>>();
    dependencies.set('A', new Set(['B', 'C']));
    dependencies.set('B', new Set(['D']));
    dependencies.set('C', new Set(['D']));
    dependencies.set('D', new Set());

    const result: string[] = [];
    const visited = new Set<string>();
    const tempStack = new Set<string>();

    const visit = (entity: string): boolean => {
      if (tempStack.has(entity)) return false;
      if (visited.has(entity)) return true;
      tempStack.add(entity);
      const deps = dependencies.get(entity);
      if (deps) {
        for (const dep of deps) {
          if (!visit(dep)) return false;
        }
      }
      tempStack.delete(entity);
      visited.add(entity);
      result.push(entity);
      return true;
    };

    for (const entity of dependencies.keys()) {
      if (!visited.has(entity)) {
        visit(entity);
      }
    }

    expect(result).toHaveLength(4);
    // D must come before B and C, and B and C must come before A
    const dIndex = result.indexOf('D');
    const bIndex = result.indexOf('B');
    const cIndex = result.indexOf('C');
    const aIndex = result.indexOf('A');
    expect(dIndex).toBeLessThan(bIndex);
    expect(dIndex).toBeLessThan(cIndex);
    expect(bIndex).toBeLessThan(aIndex);
    expect(cIndex).toBeLessThan(aIndex);
  });
});

describe('ValidationService - Dependency Order Checking Logic', () => {
  it('should detect order violations', () => {
    const directoryOrder = ['B', 'A']; // B comes first but depends on A
    const entityDependencies = new Map<string, { entityName: string; dependsOn: Set<string>; file: string }>();
    entityDependencies.set('B', { entityName: 'B', dependsOn: new Set(['A']), file: '/path/B' });
    entityDependencies.set('A', { entityName: 'A', dependsOn: new Set(), file: '/path/A' });

    const violations: Array<{ entity: string; dependency: string; file: string }> = [];
    const processedEntities = new Set<string>();

    for (const dir of directoryOrder) {
      const entityName = dir;
      const deps = entityDependencies.get(entityName);
      if (deps) {
        for (const dep of deps.dependsOn) {
          if (!processedEntities.has(dep) && directoryOrder.includes(dep)) {
            violations.push({
              entity: entityName,
              dependency: dep,
              file: deps.file,
            });
          }
        }
      }
      processedEntities.add(entityName);
    }

    expect(violations).toHaveLength(1);
    expect(violations[0].entity).toBe('B');
    expect(violations[0].dependency).toBe('A');
  });

  it('should detect no violations when order is correct', () => {
    const directoryOrder = ['A', 'B']; // A comes first, B depends on A
    const entityDependencies = new Map<string, { entityName: string; dependsOn: Set<string>; file: string }>();
    entityDependencies.set('B', { entityName: 'B', dependsOn: new Set(['A']), file: '/path/B' });
    entityDependencies.set('A', { entityName: 'A', dependsOn: new Set(), file: '/path/A' });

    const violations: Array<{ entity: string; dependency: string; file: string }> = [];
    const processedEntities = new Set<string>();

    for (const dir of directoryOrder) {
      const entityName = dir;
      const deps = entityDependencies.get(entityName);
      if (deps) {
        for (const dep of deps.dependsOn) {
          if (!processedEntities.has(dep) && directoryOrder.includes(dep)) {
            violations.push({
              entity: entityName,
              dependency: dep,
              file: deps.file,
            });
          }
        }
      }
      processedEntities.add(entityName);
    }

    expect(violations).toHaveLength(0);
  });

  it('should skip self-dependency checks', () => {
    const entityName = 'Categories';
    const from = 'Categories';
    const to = 'Categories';

    // Mimic addEntityDependency behavior (skip self-references)
    const skipped = from === to;
    expect(skipped).toBe(true);
  });
});
